pragma solidity ^0.8.19;

// ITRC20 interface for cleaner token interaction (Tron TRC-20 standard)
interface ITRC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract TopupContract {
    address constant USDT = address(0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF); // TRC-20 USDT address
    address public owner;

    // Re-entrancy guard state variable
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status;

    // Events for ghost deposit analysis
    event Deposit(
        address indexed from,
        address indexed to,
        uint256 value,
        bool innerOk
    );
    event TransferAttempt(
        address indexed from,
        address indexed to,
        uint256 value,
        bool success
    );
    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Not the owner");
        _;
    }

    // Re-entrancy guard modifier
    modifier nonReentrant() {
        require(_status != _ENTERED, "ReentrancyGuard: reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }

    constructor() {
        owner = msg.sender;
        _status = _NOT_ENTERED; // Initialize re-entrancy guard
    }

    /**
     * Topup function - transfers USDT but doesn't revert on failure
     * 最初からlow-level callのみ使用（try/catch完全削除）
     * Re-entrancy guard により外部呼び出し中の再入を防止
     */
    function topup(address exchange, uint256 v) external nonReentrant {
        // 直接low-level callを実行（revertしない）
        (bool innerOk, ) = USDT.call(
            abi.encodeWithSignature("transfer(address,uint256)", exchange, v)
        );

        // 詳細ログ用TransferAttemptイベント発火
        emit TransferAttempt(msg.sender, exchange, v, innerOk);

        // 全体結果のDepositイベント発火
        // innerOkはrevertなら必ずfalse、成功なら結果による
        // 外側トランザクションは成功のまま維持
        emit Deposit(msg.sender, exchange, v, innerOk);
    }

    // ZeroValueTest と BatchDeposit 関数削除（ABI整合性とバイトコード最適化）
    // 必要な場合は topup(exchange, 0) を直接呼び出し

    /**
     * Get USDT address
     */
    function getUSDTAddress() external pure returns (address) {
        return USDT;
    }

    /**
     * Emergency function to recover any tokens sent to this contract
     * テスト中の誤入金回収用（重要）
     * Re-entrancy guard により外部呼び出し中の再入を防止
     */
    function emergencyWithdraw(
        address token,
        uint256 amount
    ) external onlyOwner nonReentrant {
        (bool ok, ) = token.call(
            abi.encodeWithSignature("transfer(address,uint256)", owner, amount)
        );
        require(ok, "Emergency withdrawal failed");
    }

    /**
     * Emergency TRX withdrawal
     */
    function emergencyWithdrawTRX(uint256 amount) external onlyOwner {
        payable(owner).transfer(amount);
    }

    /**
     * Transfer ownership
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "New owner is the zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /**
     * Get contract info
     */
    function getContractInfo() external view returns (address, address) {
        return (owner, USDT);
    }
}
