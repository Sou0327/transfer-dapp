// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@uniswap/permit2/src/interfaces/ISignatureTransfer.sol";

/**
 * @title OTCSettlement (固定版)
 * @notice Uniswap Permit2を使用したOTC（店頭取引）清算コントラクト
 * @dev EIP-712署名ベースのトークン転送と清算機能を提供
 * @dev セキュリティバグ修正版
 */
contract OTCSettlement is ReentrancyGuard, Pausable, AccessControl {
    using SafeERC20 for IERC20;

    // ===== Constants =====
    
    /// @notice オペレーター（清算実行権限）ロール
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    
    /// @notice 緊急停止権限ロール
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    
    /// @notice 設定変更権限ロール
    bytes32 public constant CONFIG_ROLE = keccak256("CONFIG_ROLE");

    /// @notice 最大ガス制限（安全装置）
    uint256 public constant MAX_GAS_LIMIT = 1_000_000;

    /// @notice 最大バッチサイズ（DoS攻撃防止）
    uint256 public constant MAX_BATCH_SIZE = 20; // 50から20に削減

    /// @notice 最大手数料率（10% = 1000bps）
    uint256 public constant MAX_FEE_BPS = 1000; // 100%から10%に削減

    // ===== State Variables =====

    /// @notice Permit2コントラクトインスタンス
    ISignatureTransfer public immutable permit2;

    /// @notice 手数料受取人アドレス
    address public feeRecipient;

    /// @notice 手数料率（basis points: 1bps = 0.01%）
    uint256 public feeBps;

    /// @notice 最小清算金額（dust attack防止）
    uint256 public minSettlementAmount;

    /// @notice 清算カウンター（統計用）
    uint256 public totalSettlements;

    /// @notice witness付き清算カウンター
    uint256 public witnessSettlements;

    /// @notice バッチ清算カウンター
    uint256 public batchSettlements;

    // ===== Mappings =====

    /// @notice 削除: usedNonces（permit2内部で管理されるため不要）
    // mapping(address => mapping(uint256 => bool)) public usedNonces;

    /// @notice オペレーター別の清算統計
    mapping(address => uint256) public operatorSettlements;

    /// @notice トークン別の総清算量
    mapping(address => uint256) public tokenVolumes;

    // ===== Events =====

    /**
     * @notice 単一清算完了イベント
     * @param orderId 注文ID（単一清算の場合はnonce、witness付きの場合はwitness）
     * @param owner トークン所有者
     * @param token 転送されたトークンアドレス
     * @param grossAmount 総転送金額（手数料込み）
     * @param netAmount 手数料差し引き後の金額
     * @param feeAmount 手数料金額
     * @param to 受取人アドレス
     * @param operator 清算実行者
     * @param gasUsed 消費ガス量
     */
    event SettlementExecuted(
        bytes32 indexed orderId,
        address indexed owner,
        address indexed token,
        uint256 grossAmount,
        uint256 netAmount,
        uint256 feeAmount,
        address to,
        address operator,
        uint256 gasUsed
    );

    /**
     * @notice witness付き清算完了イベント
     * @param witnessHash witness情報のハッシュ
     * @param witnessTypeString witness型文字列
     * @param owner トークン所有者
     * @param token 転送されたトークンアドレス
     * @param grossAmount 総転送金額
     * @param netAmount 手数料差し引き後の金額
     * @param operator 清算実行者
     */
    event WitnessSettlementExecuted(
        bytes32 indexed witnessHash,
        string witnessTypeString,
        address indexed owner,
        address indexed token,
        uint256 grossAmount,
        uint256 netAmount,
        address operator
    );

    /**
     * @notice バッチ清算完了イベント
     * @param batchId バッチID
     * @param operator 清算実行者
     * @param successCount 成功件数
     * @param totalCount 総件数
     * @param totalGasUsed 総消費ガス量
     */
    event BatchSettlementExecuted(
        bytes32 indexed batchId,
        address indexed operator,
        uint256 successCount,
        uint256 totalCount,
        uint256 totalGasUsed
    );

    /**
     * @notice 手数料徴収イベント
     * @param token トークンアドレス
     * @param amount 手数料金額
     * @param recipient 手数料受取人
     */
    event FeeCollected(
        address indexed token,
        uint256 amount,
        address indexed recipient
    );

    /**
     * @notice 設定変更イベント
     * @param parameter 変更されたパラメータ名
     * @param oldValue 古い値
     * @param newValue 新しい値
     * @param changedBy 変更者
     */
    event ConfigurationChanged(
        string parameter,
        uint256 oldValue,
        uint256 newValue,
        address indexed changedBy
    );

    /**
     * @notice 緊急清算イベント（緊急時の管理者による強制清算）
     * @param token トークンアドレス
     * @param amount 清算金額
     * @param to 送金先
     * @param admin 実行管理者
     * @param reason 緊急清算理由
     */
    event EmergencySettlement(
        address indexed token,
        uint256 amount,
        address indexed to,
        address indexed admin,
        string reason
    );

    /**
     * @notice バッチ処理中の個別失敗イベント
     * @param batchId バッチID
     * @param index 失敗したインデックス
     * @param owner 失敗した所有者
     * @param reason 失敗理由
     */
    event BatchItemFailed(
        bytes32 indexed batchId,
        uint256 index,
        address indexed owner,
        string reason
    );

    // ===== Errors =====

    error InvalidPermit2Address();
    error InvalidFeeRecipient();
    error InvalidFeeBps();
    error InvalidMinAmount();
    error ZeroAmount();
    error InvalidRecipient();
    error InvalidOperator();
    error InsufficientAmount();
    error BatchSizeExceeded();
    error GasLimitExceeded();
    error SettlementFailed(string reason);
    error UnauthorizedCaller();
    error ArrayLengthMismatch();
    error InsufficientBalance();
    error FeeTransferFailed();

    // ===== Constructor =====

    /**
     * @notice OTCSettlementコントラクトを初期化
     * @param _permit2 Permit2コントラクトアドレス
     * @param _feeRecipient 手数料受取人アドレス
     * @param _feeBps 手数料率（0-1000 bps, 最大10%）
     */
    constructor(
        address _permit2,
        address _feeRecipient,
        uint256 _feeBps
    ) {
        if (_permit2 == address(0)) revert InvalidPermit2Address();
        if (_feeRecipient == address(0)) revert InvalidFeeRecipient();
        if (_feeBps > MAX_FEE_BPS) revert InvalidFeeBps(); // 最大10%に制限

        permit2 = ISignatureTransfer(_permit2);
        feeRecipient = _feeRecipient;
        feeBps = _feeBps;
        minSettlementAmount = 1000; // デフォルト1000 wei

        // 初期ロール設定
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(OPERATOR_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
        _grantRole(CONFIG_ROLE, msg.sender);
    }

    // ===== Modifiers =====

    /**
     * @notice オペレーター権限チェック
     */
    modifier onlyOperator() {
        if (!hasRole(OPERATOR_ROLE, msg.sender)) revert UnauthorizedCaller();
        _;
    }

    /**
     * @notice ガス制限チェック
     */
    modifier gasLimitCheck(uint256 gasLimit) {
        if (gasLimit > MAX_GAS_LIMIT) revert GasLimitExceeded();
        _;
    }

    // ===== Main Settlement Functions =====

    /**
     * @notice 単一署名の清算を実行（修正版）
     * @param permit Permit2 PermitTransferFrom構造体
     * @param transferDetails 転送詳細情報
     * @param owner トークン所有者アドレス
     * @param signature EIP-712署名
     * @return success 清算成功フラグ
     */
    function settleWithPermit2Single(
        ISignatureTransfer.PermitTransferFrom calldata permit,
        ISignatureTransfer.SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes calldata signature
    ) 
        external 
        onlyOperator 
        nonReentrant 
        whenNotPaused 
        returns (bool success) 
    {
        uint256 startGas = gasleft();

        // パラメータ検証
        _validateSingleSettlement(permit, transferDetails, owner);

        // 修正: nonce重複チェックを削除（permit2が内部で管理）
        // if (usedNonces[owner][permit.nonce]) {
        //     revert NonceAlreadyUsed();
        // }

        // 手数料計算（事前計算）
        uint256 grossAmount = transferDetails.requestedAmount;
        uint256 feeAmount = _calculateFee(grossAmount);
        uint256 netAmount = grossAmount - feeAmount;

        try permit2.permitTransferFrom(
            permit,
            transferDetails,
            owner,
            signature
        ) {
            // 修正: nonce使用済みマークを削除（不要）
            // usedNonces[owner][permit.nonce] = true;

            // 修正: 手数料処理を安全に実行
            _processFeeSecurely(permit.permitted.token, feeAmount);

            // 後続業務ロジック実行
            _executePostTransferLogic(
                permit.permitted.token,
                netAmount,
                transferDetails.to,
                owner
            );

            // 統計更新
            _updateStatistics(msg.sender, permit.permitted.token, netAmount);

            // イベント発行（修正: より詳細な情報を含む）
            uint256 gasUsed = startGas - gasleft();
            emit SettlementExecuted(
                bytes32(permit.nonce),
                owner,
                permit.permitted.token,
                grossAmount,
                netAmount,
                feeAmount,
                transferDetails.to,
                msg.sender,
                gasUsed
            );

            success = true;

        } catch Error(string memory reason) {
            // 修正: 失敗時のイベント発行を改善
            emit SettlementExecuted(
                bytes32(permit.nonce),
                owner,
                permit.permitted.token,
                0, // 失敗時は0
                0,
                0,
                transferDetails.to,
                msg.sender,
                0
            );
            revert SettlementFailed(reason);
        } catch (bytes memory lowLevelData) {
            revert SettlementFailed("Low-level call failed");
        }
    }

    /**
     * @notice witness付き清算を実行（修正版）
     * @param permit Permit2 PermitTransferFrom構造体
     * @param transferDetails 転送詳細情報
     * @param owner トークン所有者アドレス
     * @param witness witness情報（OTC条件等）
     * @param witnessTypeString witness型文字列
     * @param signature EIP-712署名
     * @return success 清算成功フラグ
     */
    function settleWithPermit2Witness(
        ISignatureTransfer.PermitTransferFrom calldata permit,
        ISignatureTransfer.SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes32 witness,
        string calldata witnessTypeString,
        bytes calldata signature
    ) 
        external 
        onlyOperator 
        nonReentrant 
        whenNotPaused 
        returns (bool success) 
    {
        // パラメータ検証
        _validateSingleSettlement(permit, transferDetails, owner);

        // 修正: nonce重複チェックを削除
        // if (usedNonces[owner][permit.nonce]) {
        //     revert NonceAlreadyUsed();
        // }

        // 手数料計算（事前計算）
        uint256 grossAmount = transferDetails.requestedAmount;
        uint256 feeAmount = _calculateFee(grossAmount);
        uint256 netAmount = grossAmount - feeAmount;

        try permit2.permitWitnessTransferFrom(
            permit,
            transferDetails,
            owner,
            witness,
            witnessTypeString,
            signature
        ) {
            // 修正: nonce使用済みマークを削除
            // usedNonces[owner][permit.nonce] = true;

            // 修正: 手数料処理を安全に実行
            _processFeeSecurely(permit.permitted.token, feeAmount);

            // witness専用の後続処理
            _executeWitnessPostTransferLogic(
                permit.permitted.token,
                netAmount,
                transferDetails.to,
                owner,
                witness,
                witnessTypeString
            );

            // 統計更新
            _updateStatistics(msg.sender, permit.permitted.token, netAmount);
            witnessSettlements++;

            // イベント発行（修正: 詳細情報を追加）
            emit WitnessSettlementExecuted(
                witness,
                witnessTypeString,
                owner,
                permit.permitted.token,
                grossAmount,
                netAmount,
                msg.sender
            );

            success = true;

        } catch Error(string memory reason) {
            revert SettlementFailed(reason);
        } catch (bytes memory lowLevelData) {
            revert SettlementFailed("Low-level call failed");
        }
    }

    /**
     * @notice バッチ清算を実行（修正版）
     * @param permits Permit2 PermitTransferFrom構造体配列
     * @param transferDetailsArray 転送詳細情報配列
     * @param owners トークン所有者アドレス配列
     * @param signatures EIP-712署名配列
     * @return successCount 成功件数
     */
    function settleWithPermit2Batch(
        ISignatureTransfer.PermitTransferFrom[] calldata permits,
        ISignatureTransfer.SignatureTransferDetails[] calldata transferDetailsArray,
        address[] calldata owners,
        bytes[] calldata signatures
    ) 
        external 
        onlyOperator 
        nonReentrant 
        whenNotPaused 
        returns (uint256 successCount) 
    {
        uint256 startGas = gasleft();
        uint256 batchSize = permits.length;

        // バッチサイズ制限（修正: より厳格に）
        if (batchSize > MAX_BATCH_SIZE) revert BatchSizeExceeded();
        if (batchSize == 0) revert ZeroAmount();

        // 配列サイズ一致確認（修正: カスタムエラー使用）
        if (batchSize != transferDetailsArray.length ||
            batchSize != owners.length ||
            batchSize != signatures.length) {
            revert ArrayLengthMismatch();
        }

        bytes32 batchId = keccak256(abi.encodePacked(
            block.timestamp,
            block.number, // ブロック番号も追加でユニーク性向上
            msg.sender,
            batchSize
        ));

        // 修正: 各清算を順次実行（外部呼び出し制限）
        for (uint256 i = 0; i < batchSize; ) {
            try this.settleWithPermit2Single(
                permits[i],
                transferDetailsArray[i],
                owners[i],
                signatures[i]
            ) returns (bool itemSuccess) {
                if (itemSuccess) {
                    successCount++;
                }
            } catch Error(string memory reason) {
                // 修正: 個別失敗をログに記録
                emit BatchItemFailed(batchId, i, owners[i], reason);
            } catch (bytes memory) {
                emit BatchItemFailed(batchId, i, owners[i], "Unknown error");
            }
            
            // 修正: より安全なインクリメント
            unchecked {
                ++i;
            }
        }

        // バッチ統計更新
        batchSettlements++;

        // バッチイベント発行
        uint256 totalGasUsed = startGas - gasleft();
        emit BatchSettlementExecuted(
            batchId,
            msg.sender,
            successCount,
            batchSize,
            totalGasUsed
        );
    }

    // ===== Internal Functions =====

    /**
     * @notice 単一清算パラメータの検証（修正版）
     */
    function _validateSingleSettlement(
        ISignatureTransfer.PermitTransferFrom calldata permit,
        ISignatureTransfer.SignatureTransferDetails calldata transferDetails,
        address owner
    ) internal view {
        if (transferDetails.requestedAmount == 0) revert ZeroAmount();
        if (transferDetails.to == address(0)) revert InvalidRecipient();
        if (owner == address(0)) revert InvalidOperator();
        if (permit.permitted.token == address(0)) revert InvalidOperator();
        if (transferDetails.requestedAmount < minSettlementAmount) {
            revert InsufficientAmount();
        }
        // 修正: permit期限チェック追加
        if (permit.deadline < block.timestamp) {
            revert SettlementFailed("Permit expired");
        }
    }

    /**
     * @notice 手数料計算（修正版）
     * @param amount 転送金額
     * @return feeAmount 手数料金額
     */
    function _calculateFee(uint256 amount) internal view returns (uint256 feeAmount) {
        if (feeBps == 0) {
            return 0;
        }
        
        // 修正: オーバーフロー防止とrounding改善
        feeAmount = (amount * feeBps) / 10000;
        
        // 修正: 端数処理の一貫性確保
        if (feeAmount == 0 && feeBps > 0 && amount > 0) {
            feeAmount = 1; // 最小手数料1wei
        }
    }

    /**
     * @notice 安全な手数料処理（修正版）
     * @param token トークンアドレス
     * @param feeAmount 手数料金額
     */
    function _processFeeSecurely(
        address token,
        uint256 feeAmount
    ) internal {
        if (feeAmount == 0) {
            return;
        }

        // 修正: 残高チェック追加
        uint256 contractBalance = IERC20(token).balanceOf(address(this));
        if (contractBalance < feeAmount) {
            revert InsufficientBalance();
        }

        // 修正: 安全な転送実行
        try IERC20(token).transfer(feeRecipient, feeAmount) returns (bool success) {
            if (!success) {
                revert FeeTransferFailed();
            }
            emit FeeCollected(token, feeAmount, feeRecipient);
        } catch {
            revert FeeTransferFailed();
        }
    }

    /**
     * @notice 基本的な後続業務ロジック
     * @param token トークンアドレス
     * @param amount 転送金額
     * @param recipient 受取人
     * @param owner 所有者
     */
    function _executePostTransferLogic(
        address token,
        uint256 amount,
        address recipient,
        address owner
    ) internal {
        // 基本実装：トークンをそのまま受取人に転送
        // 実際のOTCでは、法定通貨決済、スワップ等の処理を実装
        
        // プラグイン可能な設計のため、将来的に拡張予定
        // 例：対価通貨での支払い、DEXでのスワップ実行等
    }

    /**
     * @notice witness付き後続業務ロジック
     * @param token トークンアドレス
     * @param amount 転送金額
     * @param recipient 受取人
     * @param owner 所有者
     * @param witness witness情報
     * @param witnessTypeString witness型文字列
     */
    function _executeWitnessPostTransferLogic(
        address token,
        uint256 amount,
        address recipient,
        address owner,
        bytes32 witness,
        string memory witnessTypeString
    ) internal {
        // witness情報に基づいた特別な処理
        // OTC注文条件の検証、法定通貨決済条件のチェック等
        
        // 基本実装では通常の転送と同じ
        _executePostTransferLogic(token, amount, recipient, owner);
    }

    /**
     * @notice 統計情報の更新
     */
    function _updateStatistics(
        address operator,
        address token,
        uint256 amount
    ) internal {
        totalSettlements++;
        operatorSettlements[operator]++;
        // 修正: オーバーフローチェック（Solidity 0.8+で自動だが明示的に）
        tokenVolumes[token] += amount;
    }

    // ===== Configuration Functions =====

    /**
     * @notice 手数料受取人アドレスを更新
     * @param newFeeRecipient 新しい手数料受取人
     */
    function setFeeRecipient(address newFeeRecipient) 
        external 
        onlyRole(CONFIG_ROLE) 
    {
        if (newFeeRecipient == address(0)) revert InvalidFeeRecipient();
        
        emit ConfigurationChanged(
            "feeRecipient",
            uint256(uint160(feeRecipient)),
            uint256(uint160(newFeeRecipient)),
            msg.sender
        );
        
        feeRecipient = newFeeRecipient;
    }

    /**
     * @notice 手数料率を更新（修正版）
     * @param newFeeBps 新しい手数料率（0-1000 bps, 最大10%）
     */
    function setFeeBps(uint256 newFeeBps) 
        external 
        onlyRole(CONFIG_ROLE) 
    {
        if (newFeeBps > MAX_FEE_BPS) revert InvalidFeeBps(); // 修正: 10%上限
        
        emit ConfigurationChanged(
            "feeBps",
            feeBps,
            newFeeBps,
            msg.sender
        );
        
        feeBps = newFeeBps;
    }

    /**
     * @notice 最小清算金額を更新
     * @param newMinAmount 新しい最小清算金額
     */
    function setMinSettlementAmount(uint256 newMinAmount) 
        external 
        onlyRole(CONFIG_ROLE) 
    {
        emit ConfigurationChanged(
            "minSettlementAmount",
            minSettlementAmount,
            newMinAmount,
            msg.sender
        );
        
        minSettlementAmount = newMinAmount;
    }

    // ===== Emergency Functions =====

    /**
     * @notice 緊急停止
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @notice 緊急停止解除
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @notice 緊急時の強制清算（修正版）
     * @param token トークンアドレス
     * @param amount 清算金額
     * @param to 送金先
     * @param reason 緊急清算理由
     */
    function emergencySettlement(
        address token,
        uint256 amount,
        address to,
        string calldata reason
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        // 修正: 残高チェック追加
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance < amount) revert InsufficientBalance();
        
        // 修正: 安全な転送実行
        IERC20(token).safeTransfer(to, amount);
        
        emit EmergencySettlement(token, amount, to, msg.sender, reason);
    }

    // ===== View Functions =====

    /**
     * @notice コントラクト情報を取得
     */
    function getContractInfo() external view returns (
        address permit2Address,
        address feeRecipientAddress,
        uint256 currentFeeBps,
        uint256 currentMinAmount,
        uint256 totalSettlementsCount,
        uint256 witnessSettlementsCount,
        uint256 batchSettlementsCount,
        bool isPaused
    ) {
        return (
            address(permit2),
            feeRecipient,
            feeBps,
            minSettlementAmount,
            totalSettlements,
            witnessSettlements,
            batchSettlements,
            paused()
        );
    }

    /**
     * @notice オペレーター統計を取得
     * @param operator オペレーターアドレス
     */
    function getOperatorStats(address operator) 
        external 
        view 
        returns (uint256 settlementCount) 
    {
        return operatorSettlements[operator];
    }

    /**
     * @notice トークン取扱量を取得
     * @param token トークンアドレス
     */
    function getTokenVolume(address token) 
        external 
        view 
        returns (uint256 volume) 
    {
        return tokenVolumes[token];
    }

    /**
     * @notice 修正: nonce使用状況確認機能を削除（permit2が管理するため）
     * 代わりにコントラクトのトークン残高を確認する機能を提供
     * @param token トークンアドレス
     */
    function getContractBalance(address token) 
        external 
        view 
        returns (uint256 balance) 
    {
        return IERC20(token).balanceOf(address(this));
    }

    /**
     * @notice 手数料計算の事前チェック機能
     * @param amount 転送予定金額
     */
    function calculateFeePreview(uint256 amount) 
        external 
        view 
        returns (uint256 feeAmount, uint256 netAmount) 
    {
        feeAmount = _calculateFee(amount);
        netAmount = amount - feeAmount;
    }
}