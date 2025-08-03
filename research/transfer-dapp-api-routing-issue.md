# transfer-dapp API ルーティング問題調査レポート

## 調査日時
2025-08-03

## 問題の現状
URLパラメータ修正後も「不明な金額モードです」エラーが発生し、APIレスポンスが空になっている。

## 調査結果から判明した根本原因

### APIエンドポイントの重複問題
ローカル環境のFastifyサーバーで、**同じエンドポイントが2箇所で定義されているが、異なるデータストレージを使用している**ため、データの不整合が発生している。

### 実装の重複箇所

#### 1. server/routes/protocol.js (実際に動作中)
```javascript
// 場所: 429行目付近
fastify.get('/requests/:id', {
  // データソース: requestsList, CacheService
  let requestData = requestsList.get(id);
  if (!requestData) {
    requestData = await CacheService.get(cacheKey);
  }
});
```

#### 2. server/routes/requests.js (未登録)
```javascript
// 場所: 128行目付近
fastify.get('/requests/:id', {
  // データソース: PostgreSQL (RequestDAO)
  const otcRequest = await RequestDAO.findById(id);
});
```

### ルート登録の問題

#### server/index.js の登録状況
```javascript
// 登録されている
await fastify.register(protocolRoutes, { prefix: '/ada' });

// 登録されていない
// await fastify.register(requestRoutes, { prefix: '/ada' });
```

### データ作成と取得の不整合

#### リクエスト作成時
- `server/routes/requests.js` でPostgreSQLに保存される
- しかし、このファイルは登録されていないため動作しない

#### 実際の作成処理
- `server/routes/protocol.js` でインメモリ（requestsList, cache）に保存

#### リクエスト取得時  
- `server/routes/protocol.js` からインメモリデータを検索
- しかし、作成時のデータと取得時のデータストアが異なる可能性

## コンソールログから見る問題

### 正常なURLパラメータ取得
```javascript
{
  requestId: 'req_1754192609063_sq9ltamv',  // ✓ 正常
  requestIdType: 'string'                  // ✓ 正常
}
```

### 空のAPIレスポンス
```javascript
{
  amount_mode: undefined,                  // ✗ データが空
  amount_or_rule_json: undefined,          // ✗ データが空
  full_request: {},                        // ✗ 完全に空
  full_request_keys: []                    // ✗ キーも存在しない
}
```

## 修正方法

### 方法1: protocol.js での作成処理確認（推奨）
1. `server/routes/protocol.js` の POST `/requests` 実装を確認
2. 作成時にrequestsList、CacheServiceに正しく保存されているか確認
3. 保存形式と取得形式の整合性を確認

### 方法2: requests.js の登録（代替案）
```javascript
// server/index.js に追加
const { requestRoutes } = await import('./routes/requests.js');
await fastify.register(requestRoutes, { prefix: '/ada' });
```

### 方法3: データベース使用への移行（長期的）
- PostgreSQLを実際に使用する
- インメモリではなく永続的なストレージ

## 次のステップ
1. `server/routes/protocol.js` の POST `/requests` 実装確認
2. 作成されたデータがどこに保存されているか確認
3. 保存されたデータ形式の確認
4. データ取得ロジックの修正

## 推定される修正箇所
- protocol.js の POST `/requests` でのデータ保存処理
- protocol.js の GET `/requests/:id` でのデータ取得処理
- データ形式の統一（特にamount_mode、amount_or_rule_json）