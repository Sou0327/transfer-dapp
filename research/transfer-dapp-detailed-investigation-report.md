# Transfer dApp 詳細調査報告書：署名データ取得・TTL・署名不足エラー

調査日: 2025-01-03

## 概要

Transfer dAppにおける3つの問題について詳細調査を実施：
1. 署名済みデータがローカル環境で取得できない問題（本番環境では正常）
2. OutsideValidityIntervalUTxOエラー（TTL設定の問題）
3. MissingVKeyWitnessesUTXOWエラー（必要な署名の不足）

## 問題1: ローカル環境での署名データ取得不可

### 根本原因
**ローカル環境の`.env`ファイルにRedis接続設定が欠如**

#### 本番環境（Vercel）
- Upstash Redis使用
- 環境変数:
  - `KV_REST_API_URL`
  - `KV_REST_API_TOKEN`
- 自動的にVercel統合で設定される

#### ローカル環境
- `.env`ファイルに上記環境変数が未設定
- Redisクライアントが初期化されない
- 結果: 署名データの保存・取得が失敗

### 解決策

#### 1. ローカル環境での即時対応
`.env`ファイルに以下を追加：
```bash
# Upstash Redis Configuration (for local development)
KV_REST_API_URL=https://your-upstash-redis-url.upstash.io
KV_REST_API_TOKEN=your-upstash-redis-token
```

#### 2. ローカルRedisサーバー使用（代替案）
```bash
# Docker Compose設定
REDIS_URL=redis://localhost:6379
```

APIファイルを修正してローカルRedis対応：
```javascript
// api/ada/presigned.js
const initRedis = () => {
  if (process.env.NODE_ENV === 'development' && process.env.REDIS_URL) {
    // ローカル開発用Redis
    return new Redis(process.env.REDIS_URL);
  } else if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    // Upstash Redis (本番・Vercel)
    return new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });
  }
  return null;
};
```

## 問題2: OutsideValidityIntervalUTxOエラー

### 根本原因
**請求作成時のTTL計算がCardanoスロット番号ではなくUNIXタイムスタンプを使用**

#### 現在の誤った実装（api/ada/requests.js）
```javascript
// 誤り: UNIXタイムスタンプベース
const ttlSlot = Math.floor(Date.now() / 1000) + (ttl_minutes * 60);
```

この計算では：
- `Date.now() / 1000` = 1970年1月1日からの秒数
- 例: 1704268800（2024年1月3日）

しかし、Cardanoのスロット番号は：
- Shelley時代開始（2020年7月29日）からの秒数
- 開始時刻: 1596059091（UNIXタイムスタンプ）

### 解決策

#### api/ada/requests.jsの修正
```javascript
// 正しい実装
const SHELLEY_START_TIME = 1596059091; // 2020-07-29 21:44:51 UTC
const currentTime = Math.floor(Date.now() / 1000);
const currentSlot = currentTime - SHELLEY_START_TIME;
const ttlSlot = currentSlot + (ttl_minutes * 60);
const ttlAbsolute = new Date(Date.now() + (ttl_minutes * 60 * 1000)).toISOString();

const request = {
  // ...
  ttl_slot: ttlSlot, // 新しいフィールド：Cardanoスロット番号
  ttl_absolute: ttlAbsolute, // 既存：人間が読める形式
  // ...
};
```

#### src/lib/txBuilders.tsの修正
```javascript
protected buildTxBody(inputs: any, outputs: any, currentSlot: any, fee?: bigint): any {
  // 請求のTTLを使用（存在する場合）
  let ttl;
  if (this.config.request?.ttl_slot) {
    // 請求作成時に設定されたTTLスロットを使用
    ttl = CSL.BigNum.from_str(this.config.request.ttl_slot.toString());
  } else {
    // フォールバック：現在のスロット + オフセット
    ttl = currentSlot.checked_add(
      CSL.BigNum.from_str((this.config.ttlOffset || DEFAULT_TTL_OFFSET).toString())
    );
  }

  const txBody = CSL.TransactionBody.new(
    inputs,
    outputs,
    txFee,
    ttl
  );

  return txBody;
}
```

## 問題3: MissingVKeyWitnessesUTXOWエラー

### エラー詳細
```
MissingVKeyWitnessesUTXOW (fromList [KeyHash {unKeyHash = "ffe691911fa412e6b2718a290fcc2333d5e12039cd6b0d07f0feed63"}])
```

### 可能な原因

#### 1. ウォレットの部分署名設定
現在の実装（src/hooks/useWallet.ts）：
```javascript
const signedTx = await api.signTx(tx, true); // 第2引数 true = partial sign
```

これにより、ウォレットは必要最小限の署名のみを提供する可能性があります。

#### 2. 複数の入力UTxOからの署名不足
- トランザクションが複数のアドレスからUTxOを使用
- 各UTxOの所有者の署名が必要
- ウォレットが一部の署名のみ提供

#### 3. 変更（change）アドレスの署名要求
- トランザクションが特定の変更アドレスを要求
- そのアドレスの署名が必要だが提供されていない

### 調査手順

#### 1. キーハッシュの所有者特定
```javascript
// api/ada/submit.js に追加
console.log('🔍 トランザクション分析:');
const txBodyDecoded = cbor.decode(Buffer.from(txBody, 'hex'));
console.log('入力UTxO:', txBodyDecoded[0]); // inputs
console.log('出力:', txBodyDecoded[1]); // outputs

// witnessSetの内容確認
const witnessSetDecoded = cbor.decode(Buffer.from(witnessSet, 'hex'));
console.log('VKey witnesses:', witnessSetDecoded[0]); // vkey witnesses
if (witnessSetDecoded[0]) {
  witnessSetDecoded[0].forEach((witness, index) => {
    const vkey = witness[0];
    const signature = witness[1];
    const keyHash = blake2b(vkey, null, 28); // 28 bytes = 224 bits
    console.log(`Witness ${index} key hash:`, keyHash.toString('hex'));
  });
}
```

#### 2. 必要な署名の特定
不足しているキーハッシュ `ffe691911fa412e6b2718a290fcc2333d5e12039cd6b0d07f0feed63` が：
- 入力UTxOのアドレスに対応するか
- エスクローアドレスか
- その他の必要な署名か

### 解決策

#### 1. 完全署名モードの使用
```javascript
// src/hooks/useWallet.ts
const signedTx = await api.signTx(tx, false); // false = complete sign
```

#### 2. 入力UTxOの所有権確認
```javascript
// src/lib/txBuilders.ts
async selectUtxos(requiredAmount: bigint): Promise<SelectedUtxos> {
  const utxos = await this.getUtxos();
  
  // UTxOの所有アドレスを確認
  for (const utxo of utxos) {
    const address = this.getAddressFromUtxo(utxo);
    const keyHash = this.getKeyHashFromAddress(address);
    console.log(`UTxO ${utxo.tx_hash}#${utxo.output_index} - Address key hash:`, keyHash);
  }
  
  // 選択されたUTxOの所有者が署名可能か確認
  // ...
}
```

#### 3. トランザクション構築の検証
```javascript
// Conway Era形式の正確な構築
const completeTx = [
  txBody,        // 0: transaction body
  witnessSet,    // 1: witness set
  true,          // 2: isValid flag
  null           // 3: auxiliary data (optional)
];

// witnessSetの構造確認
// witnessSet = [vkeyWitnesses, nativeScripts, bootstrapWitnesses, ...]
```

## 署名不足エラーの追加調査結果

### エラーの詳細分析

キーハッシュ `ffe691911fa412e6b2718a290fcc2333d5e12039cd6b0d07f0feed63` は以下のいずれかを示す：

1. **入力UTxOの所有アドレス**
   - トランザクションで使用される入力UTxOのアドレスのペイメントキーハッシュ
   - ウォレットがこのアドレスの秘密鍵を持っていない可能性

2. **エスクローアドレス**
   - OTC取引でエスクローアドレスからの送金を行う場合
   - エスクローアドレスの署名が必要だが提供されていない

3. **変更（お釣り）アドレス**
   - トランザクションの変更出力先アドレス
   - 通常はウォレットが自動的に署名するはずだが、何らかの理由で失敗

### デバッグ手法

#### 1. キーハッシュとアドレスの対応確認
```javascript
// src/lib/txBuilders.ts に追加
protected async debugAddresses() {
  const utxos = await this.getWalletUtxos();
  console.log('🔍 UTxOアドレス分析:');
  
  for (const utxo of utxos) {
    const utxoCsl = CSL.TransactionUnspentOutput.from_bytes(
      Buffer.from(utxo.hex, 'hex')
    );
    const address = utxoCsl.output().address();
    const addressBech32 = address.to_bech32();
    
    // アドレスからキーハッシュを抽出
    const paymentCred = address.payment_cred();
    if (paymentCred) {
      const keyHash = paymentCred.to_keyhash();
      if (keyHash) {
        console.log(`Address: ${addressBech32}`);
        console.log(`Key Hash: ${Buffer.from(keyHash.to_bytes()).toString('hex')}`);
      }
    }
  }
  
  // 変更アドレスも確認
  const changeAddress = await this.config.api.getChangeAddress();
  const changeAddressCsl = CSL.Address.from_bech32(changeAddress);
  const changePaymentCred = changeAddressCsl.payment_cred();
  if (changePaymentCred) {
    const changeKeyHash = changePaymentCred.to_keyhash();
    if (changeKeyHash) {
      console.log(`Change Address: ${changeAddress}`);
      console.log(`Change Key Hash: ${Buffer.from(changeKeyHash.to_bytes()).toString('hex')}`);
    }
  }
}
```

#### 2. トランザクション入出力の詳細確認
```javascript
// api/ada/submit.js に追加
const analyzeTxBody = (txBodyHex) => {
  const txBody = cbor.decode(Buffer.from(txBodyHex, 'hex'));
  
  console.log('📋 トランザクション分析:');
  console.log('入力数:', txBody[0] ? txBody[0].length : 0);
  console.log('出力数:', txBody[1] ? txBody[1].length : 0);
  
  // 入力の詳細
  if (txBody[0]) {
    txBody[0].forEach((input, index) => {
      console.log(`入力 ${index}:`, {
        txHash: Buffer.from(input[0]).toString('hex'),
        outputIndex: input[1]
      });
    });
  }
  
  // 出力の詳細
  if (txBody[1]) {
    txBody[1].forEach((output, index) => {
      const [address, value] = output;
      console.log(`出力 ${index}:`, {
        address: address.toString('hex'),
        value: value
      });
    });
  }
};
```

### 最終的な解決策

#### 1. 部分署名から完全署名への変更
```javascript
// src/hooks/useWallet.ts
const signTransaction = useCallback(async (tx: string): Promise<string> => {
  // ...
  try {
    // partialSign=false で完全な署名を要求
    const signedTx = await api.signTx(tx, false);
    return signedTx;
  } catch (error) {
    // エラーハンドリング
  }
}, []);
```

#### 2. エラー時の詳細情報収集
```javascript
// api/ada/submit.js
if (errorText.includes('MissingVKeyWitnessesUTXOW')) {
  // エラーからキーハッシュを抽出
  const keyHashMatch = errorText.match(/unKeyHash = \"([a-f0-9]+)\"/);
  if (keyHashMatch) {
    const missingKeyHash = keyHashMatch[1];
    console.error(`❌ 不足している署名のキーハッシュ: ${missingKeyHash}`);
    
    // このキーハッシュがどのアドレスに対応するか調査
    // 必要に応じてBlockfrost APIで確認
  }
}
```

#### 3. ウォレット互換性の確認
異なるウォレット（Yoroi、Nami、Flint等）で挙動が異なる可能性：
- 一部のウォレットは自動的にすべての必要な署名を提供
- 他のウォレットは明示的な設定が必要

## 推奨実装順序

1. **即時対応（ローカル開発環境）**
   - `.env`ファイルにUpstash Redis認証情報を追加
   - または、ローカルRedisサーバーのセットアップ

2. **TTL修正（高優先度）**
   - `api/ada/requests.js`でCardanoスロット番号を正しく計算
   - `ttl_slot`フィールドを追加
   - `txBuilders.ts`で請求のTTLを使用

3. **署名問題の段階的対応**
   - Phase 1: デバッグログを追加してキーハッシュの特定
   - Phase 2: 部分署名を完全署名に変更してテスト
   - Phase 3: 特定のウォレットで問題が続く場合は個別対応

## セキュリティ考慮事項

1. **環境変数の管理**
   - Redis認証情報は`.env.local`に保存（.gitignore対象）
   - 本番環境では環境変数として安全に管理

2. **署名の検証**
   - 提供された署名が正しいアドレスのものか検証
   - 不正な署名を防ぐためのチェック機構

3. **TTLの範囲制限**
   - 最小: 5分（短すぎる場合の処理失敗を防ぐ）
   - 最大: 36時間（2160分）
   - デフォルト: 10分（適切なバランス）