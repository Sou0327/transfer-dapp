# Transfer dApp 署名データ取得・送金エラー調査報告書

調査日: 2025-01-03

## 概要

Transfer dAppにおいて、以下2つの問題が報告されました：
1. ローカル環境で署名済みデータが管理画面で取得できない問題
2. 本番環境でBlockfrostを通じた送金時にエラーが発生する問題

本レポートでは、これらの問題の原因分析と解決策を提示します。

## 問題1: 署名済みデータが取得できない問題

### 現象
- ユーザーがウォレットで署名を完了しても、管理画面で「署名データなし（まだ取得されていません）」と表示される
- 署名自体は成功しているが、管理者側でデータを確認できない

### 原因分析

#### データフロー
1. **署名時（SigningPage.tsx）**
   ```javascript
   // 署名完了後、データをサーバーに送信
   const requestBody = {
     requestId: state.request.id,
     signedTx: witnessSet,
     metadata: {
       txBody: txHex,
       walletUsed: selectedWallet,
       timestamp: new Date().toISOString()
     }
   };
   
   // POST /api/ada/presigned に送信
   ```

2. **データ保存（api/ada/presigned.js）**
   ```javascript
   // Redisに保存
   const cacheKey = `signed-tx:${requestId}`;
   await redisClient.set(cacheKey, JSON.stringify(signedTxData));
   ```

3. **データ取得（api/ada/presigned/[id].js）**
   ```javascript
   // 複数のキー形式で検索
   const keyFormats = [
     `signed-tx:${id}`,
     id,
     `request:${id}`
   ];
   ```

### 根本原因
- Redisキーの不整合の可能性
- データが正しく保存されているが、取得時のキー検索で見つからない
- Redis接続の初期化タイミングの問題

### 解決策

1. **Redisキー一貫性の確保**
   ```javascript
   // 統一されたキー生成関数を使用
   const getSignedTxKey = (requestId) => `signed-tx:${requestId}`;
   ```

2. **デバッグログの追加**
   ```javascript
   // 保存時
   console.log(`💾 Storing with key: ${cacheKey}`);
   const verifyData = await redisClient.get(cacheKey);
   console.log(`✅ Verification: ${verifyData ? 'Success' : 'Failed'}`);
   
   // 取得時
   const allKeys = await redisClient.keys(`*${id}*`);
   console.log(`🔍 All matching keys: ${allKeys}`);
   ```

## 問題2: Blockfrost送金エラー

### 現象
以下のエラーメッセージが表示され、トランザクション送信が失敗する：

```json
{
  "error": "Bad Request",
  "message": {
    "contents": {
      "era": "ShelleyBasedEraConway",
      "error": [
        "ConwayUtxowFailure (UtxoFailure (OutsideValidityIntervalUTxO (ValidityInterval {invalidBefore = SNothing, invalidHereafter = SJust (SlotNo 0)}) (SlotNo 162659133)))",
        "ConwayUtxowFailure (MissingVKeyWitnessesUTXOW (fromList [KeyHash {unKeyHash = \"ffe691911fa412e6b2718a290fcc2333d5e12039cd6b0d07f0feed63\"}]))"
      ]
    }
  }
}
```

### エラー分析

#### 1. OutsideValidityIntervalUTxO エラー
- **意味**: トランザクションの有効期限が切れている
- **詳細**: 
  - 有効期限: `SlotNo 0`（開始時点）
  - 現在のスロット: `SlotNo 162659133`
  - トランザクションのTTL（Time To Live）が正しく設定されていない

#### 2. MissingVKeyWitnessesUTXOW エラー
- **意味**: 必要な署名が不足している
- **詳細**:
  - 不足している署名のキーハッシュ: `ffe691911fa412e6b2718a290fcc2333d5e12039cd6b0d07f0feed63`
  - witnessSetに必要な署名が含まれていない

### 根本原因

1. **TTL設定の問題**
   - トランザクションビルダーでTTLが適切に設定されていない
   - または、TTLが0に設定されている

2. **署名の問題**
   - ウォレットから返されるwitnessSetが不完全
   - または、トランザクション構築時に署名が正しく組み込まれていない

### 解決策

#### 1. TTLの適切な設定

```javascript
// src/lib/txBuilders.ts での修正例
class FixedAmountTxBuilder {
  async buildTransaction() {
    // 現在のスロット番号を取得
    const latestBlock = await this.getLatestBlock();
    const currentSlot = latestBlock.slot;
    
    // TTLを2時間後に設定（7200スロット = 2時間）
    const ttl = currentSlot + 7200;
    
    // トランザクションビルダーに設定
    const txBuilder = CardanoWasm.TransactionBuilder.new(txBuilderConfig);
    txBuilder.set_ttl(ttl);
    
    // 残りのトランザクション構築処理
  }
}
```

#### 2. 署名とトランザクション構築の修正

```javascript
// api/ada/submit.js での修正例
if (signedTxData.metadata && signedTxData.metadata.txBody) {
  // Conway Era形式でトランザクションを再構築
  const txBody = cbor.decode(Buffer.from(signedTxData.metadata.txBody, 'hex'));
  const witnessSet = cbor.decode(Buffer.from(signedTxData.signedTx, 'hex'));
  
  // witnessSetの検証
  console.log('WitnessSet keys:', Object.keys(witnessSet));
  console.log('VKey witnesses count:', witnessSet[0] ? witnessSet[0].length : 0);
  
  // Conway Era transaction format: [txBody, witnessSet, isValid, auxiliaryData]
  const completeTx = [
    txBody,
    witnessSet,
    true,  // isValid flag
    null   // auxiliaryData
  ];
  
  const completeTxBuffer = cbor.encode(completeTx);
  signedTxHex = completeTxBuffer.toString('hex');
}
```

## 推奨アクション

### 即時対応
1. **署名データ取得問題**
   - Redisキーの一貫性確認
   - キー生成ロジックの統一
   - デバッグログの追加

2. **送金エラー問題**
   - TTL設定ロジックの実装
   - witnessSet検証ロジックの追加
   - エラーハンドリングの改善

### 中期対応
1. **テスト環境での検証**
   - Preprodテストネットでの動作確認
   - 正常なトランザクションとの比較分析

2. **監視・ログの強化**
   - トランザクション構築の各ステップでのログ出力
   - Redisデータの定期的な整合性チェック

3. **ドキュメント整備**
   - トラブルシューティングガイドの作成
   - エラーコードと対処法の一覧作成

## 技術的詳細

### Conway Era トランザクション形式
```
Transaction = [
  TransactionBody,    // index 0
  TransactionWitnessSet,  // index 1
  Bool,              // index 2: isValid flag
  AuxiliaryData?     // index 3: optional auxiliary data
]
```

### WitnessSet構造
```
TransactionWitnessSet = {
  0: [VKeyWitness],        // vkey witnesses
  1: [NativeScript],       // native scripts
  2: [BootstrapWitness],   // bootstrap witnesses
  3: [PlutusV1Script],     // Plutus V1 scripts
  4: [PlutusData],         // Plutus data
  5: [Redeemer],           // redeemers
  6: [PlutusV2Script],     // Plutus V2 scripts
  7: [PlutusV3Script]      // Plutus V3 scripts
}
```

## 結論

両問題とも、データの整合性とトランザクション構築の詳細に起因しています。提案された解決策を実装することで、問題の解決が期待できます。特に、TTLの適切な設定とRedisキーの一貫性確保が重要です。