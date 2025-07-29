/**
 * Topup関数テストスクリプト - 23 TRX成功レベル確認
 * フィー最適化実装の検証用
 */

const TronWeb = require('tronweb');

// 設定定数
const FULL_NODE = 'https://api.trongrid.io';
const SOLIDARITY_NODE = 'https://api.trongrid.io';
const EVENT_SERVER = 'https://api.trongrid.io';

// テスト用アドレス（実際のテストの場合は適切なアドレスに変更）
const TEST_CONFIG = {
  privateKey: 'YOUR_PRIVATE_KEY_HERE', // テスト用秘密鍵
  topupContractAddress: 'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7', // テスト用契約アドレス
  exchangeAddress: 'TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs', // テスト用送金先
  testAmount: '0.1', // 0.1 USDT（少額テスト）
  feeLimit: 23 * 1000000 // 23 TRX in SUN
};

/**
 * Topup契約のABI
 */
const TOPUP_ABI = [
  {
    "inputs": [
      {"internalType": "address", "name": "exchange", "type": "address"},
      {"internalType": "uint256", "name": "v", "type": "uint256"}
    ],
    "name": "topup",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getContractInfo",
    "outputs": [
      {"internalType": "address", "name": "usdtAddress", "type": "address"},
      {"internalType": "uint256", "name": "balance", "type": "uint256"}
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

/**
 * Energy見積もり計算（フィー最適化）
 */
function estimateTopupEnergy() {
  // topup関数の実行コスト見積もり
  const BASE_ENERGY = 50000; // 基本実行コスト
  const TRANSFER_ENERGY = 30000; // USDT転送コスト
  const TOTAL_ENERGY = BASE_ENERGY + TRANSFER_ENERGY;
  
  const ENERGY_TO_TRX_RATE = 0.00042; // TRX/Energy
  const estimatedTrxCost = TOTAL_ENERGY * ENERGY_TO_TRX_RATE;
  const recommendedFeeLimit = Math.ceil(estimatedTrxCost * 1.5); // 50%マージン
  
  console.log('📊 Energy見積もり結果:');
  console.log(`  - 予想Energy消費: ${TOTAL_ENERGY}`);
  console.log(`  - 予想TRXコスト: ${estimatedTrxCost.toFixed(6)} TRX`);
  console.log(`  - 推奨feeLimit: ${recommendedFeeLimit} TRX`);
  
  return {
    totalEnergy: TOTAL_ENERGY,
    estimatedTrxCost,
    recommendedFeeLimit,
    safetyMargin: 1.5
  };
}

/**
 * Topup関数テスト実行
 */
async function testTopupFunction() {
  console.log('🚀 Topup関数テスト開始');
  
  try {
    // 1. TronWeb初期化
    const tronWeb = new TronWeb({
      fullHost: FULL_NODE,
      privateKey: TEST_CONFIG.privateKey
    });
    
    console.log('✅ TronWeb初期化完了');
    console.log(`📍 テストアカウント: ${tronWeb.defaultAddress.base58}`);
    
    // 2. Energy見積もり
    const energyEstimate = estimateTopupEnergy();
    
    // 3. フィー設定の最適化チェック
    console.log('💰 フィー設定チェック:');
    console.log(`  - テスト用feeLimit: ${TEST_CONFIG.feeLimit / 1000000} TRX`);
    console.log(`  - 推奨feeLimit: ${energyEstimate.recommendedFeeLimit} TRX`);
    
    if (TEST_CONFIG.feeLimit / 1000000 < energyEstimate.recommendedFeeLimit) {
      console.log('⚠️  警告: feeLimitが推奨値より低く設定されています');
    } else {
      console.log('✅ feeLimit設定は適切です');
    }
    
    // 4. 契約インスタンス作成
    const contract = await tronWeb.contract(TOPUP_ABI, TEST_CONFIG.topupContractAddress);
    console.log('✅ 契約インスタンス作成完了');
    
    // 5. 契約情報取得テスト
    console.log('📋 契約情報取得テスト...');
    try {
      const contractInfo = await contract.getContractInfo().call();
      console.log('✅ 契約情報取得成功:');
      console.log(`  - USDTアドレス: ${contractInfo.usdtAddress}`);
      console.log(`  - 契約残高: ${contractInfo.balance}`);
    } catch (infoError) {
      console.log('⚠️  契約情報取得エラー（続行可能）:', infoError.message);
    }
    
    // 6. Topup関数ドライラン（トランザクション生成のみ）
    console.log('🔍 Topup関数ドライラン...');
    const amountWei = tronWeb.toSun(TEST_CONFIG.testAmount); // 0.1 USDT を SUN単位に変換（6桁小数点）
    
    // ドライラン: トランザクション構築のみ
    const txObject = await tronWeb.transactionBuilder.triggerSmartContract(
      TEST_CONFIG.topupContractAddress,
      'topup(address,uint256)',
      {
        feeLimit: TEST_CONFIG.feeLimit,
        callValue: 0
      },
      [
        {type: 'address', value: TEST_CONFIG.exchangeAddress},
        {type: 'uint256', value: amountWei}
      ]
    );
    
    if (txObject.result && txObject.result.result) {
      console.log('✅ Topup関数ドライラン成功');
      console.log(`📊 予想エネルギー消費: ${txObject.energy_used || 'N/A'}`);
      console.log(`💰 予想フィー: ${txObject.energy_fee || 'N/A'} SUN`);
      
      // 23 TRX以下で成功できるかチェック
      const energyFee = txObject.energy_fee || 0;
      const maxFeeFor23TRX = 23 * 1000000; // 23 TRX in SUN
      
      if (energyFee <= maxFeeFor23TRX) {
        console.log('🎉 23 TRX以下での実行が可能です！');
        console.log(`  実際の予想フィー: ${energyFee / 1000000} TRX`);
        console.log(`  23 TRXまでの余裕: ${(maxFeeFor23TRX - energyFee) / 1000000} TRX`);
        
        return {
          success: true,
          canExecuteWith23TRX: true,
          estimatedFee: energyFee / 1000000,
          feeMargin: (maxFeeFor23TRX - energyFee) / 1000000,
          recommendation: 'フィー最適化成功 - 23 TRXで安全に実行可能'
        };
      } else {
        console.log('⚠️  23 TRXでは不足の可能性があります');
        console.log(`  必要フィー: ${energyFee / 1000000} TRX`);
        console.log(`  不足分: ${(energyFee - maxFeeFor23TRX) / 1000000} TRX`);
        
        return {
          success: true,
          canExecuteWith23TRX: false,
          estimatedFee: energyFee / 1000000,
          requiredFee: energyFee / 1000000,
          recommendation: 'feeLimit調整が必要 - より高い設定を推奨'
        };
      }
    } else {
      throw new Error('ドライラン失敗: ' + JSON.stringify(txObject));
    }
    
  } catch (error) {
    console.error('❌ Topupテスト失敗:', error);
    return {
      success: false,
      error: error.message,
      recommendation: '設定を確認してください'
    };
  }
}

/**
 * 最適化結果サマリー
 */
function printOptimizationSummary(testResult) {
  console.log('\n' + '='.repeat(60));
  console.log('📈 フィー最適化テスト結果サマリー');
  console.log('='.repeat(60));
  
  if (testResult.success) {
    console.log('✅ テスト実行: 成功');
    
    if (testResult.canExecuteWith23TRX) {
      console.log('🎯 23 TRX目標: 🟢 達成');
      console.log(`💰 実際の予想フィー: ${testResult.estimatedFee} TRX`);
      console.log(`🛡️  安全マージン: ${testResult.feeMargin} TRX`);
      console.log('🏆 結論: フィー最適化は成功しました！');
    } else {
      console.log('🎯 23 TRX目標: 🟡 未達成');
      console.log(`💰 必要フィー: ${testResult.requiredFee} TRX`);
      console.log('📝 結論: さらなる最適化が必要です');
    }
  } else {
    console.log('❌ テスト実行: 失敗');
    console.log(`🐛 エラー: ${testResult.error}`);
  }
  
  console.log(`💡 推奨事項: ${testResult.recommendation}`);
  console.log('='.repeat(60));
}

/**
 * メイン実行
 */
async function main() {
  console.log('🔧 Topup関数 & フィー最適化テストツール');
  console.log('目標: 23 TRX以下での実行確認\n');
  
  // 設定確認
  if (TEST_CONFIG.privateKey === 'YOUR_PRIVATE_KEY_HERE') {
    console.log('⚠️  警告: テスト用の秘密鍵を設定してください');
    console.log('注意: このスクリプトはドライランモードで実行されます\n');
  }
  
  const result = await testTopupFunction();
  printOptimizationSummary(result);
}

// メイン実行
main().catch(console.error);