# transfer-dapp URL問題調査レポート

## 調査日時
2025-08-03

## 問題の概要
transfer-dappで作成したトランザクションリクエストのURLにアクセスしても、正しいトランザクション情報が取得できない問題。

## 問題の原因
`api/ada/requests/[id].js`に緊急テストコードが存在し、実際のデータベースやキャッシュからデータを取得せず、常にハードコードされたテストデータを返していることが原因。

### 問題のコード箇所
```javascript
// 🚨 EMERGENCY TEST: Return hardcoded data first
if (true) {
  const testData = {
    id: id,
    currency: 'ADA',
    amount_mode: 'sweep',
    amount_or_rule_json: { type: 'sweep' },
    recipient: 'addr1test123456789',
    status: 'REQUESTED',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ttl_slot: Math.floor(Date.now() / 1000) + 600,
    ttl_absolute: new Date(Date.now() + 600000).toISOString()
  };
  
  console.log(`🚨 EMERGENCY TEST: Returning hardcoded data for ${id}`);
  
  return res.status(200).json({
    request: testData
  });
}
```

## システムの動作フロー

### 1. リクエスト作成フロー
1. 管理者が管理画面（`/admin`）にアクセス
2. `src/components/admin/AdminApp.tsx`でリクエスト作成フォームを表示
3. POST `/api/ada/requests`でリクエストを作成
4. `api/ada/requests.js`で以下を処理：
   - リクエストID生成（形式: `req_${timestamp}_${randomString}`）
   - インメモリキャッシュに保存
   - 署名URL（`/sign/${requestId}`）を返す

### 2. 署名ページアクセスフロー
1. ユーザーが署名URL（`/sign/${requestId}`）にアクセス
2. `src/Router.tsx`により`SigningPage`コンポーネントがレンダリング
3. `src/components/sign/SigningPage.tsx`が以下を実行：
   - URLからrequestIdを取得
   - GET `/api/ada/requests/${requestId}`でリクエスト詳細を取得

### 3. データ取得の問題
1. `api/ada/requests/[id].js`が呼び出される
2. 緊急テストコードにより、実際のデータではなくハードコードデータが返される
3. 結果として、作成されたリクエストの内容に関わらず、常に同じテストデータが表示される

## ファイル構造と役割

```
transfer-dapp/
├── src/
│   ├── Router.tsx                          # ルーティング定義
│   │   - /transfer: レガシー送金アプリ
│   │   - /admin/*: OTC管理システム
│   │   - /sign/:requestId: 署名インターフェース
│   │
│   ├── components/
│   │   ├── admin/
│   │   │   └── AdminApp.tsx               # 管理画面
│   │   │       - リクエスト作成機能
│   │   │       - リクエスト一覧表示
│   │   │
│   │   └── sign/
│   │       └── SigningPage.tsx            # 署名ページ
│   │           - リクエスト詳細取得
│   │           - ウォレット接続
│   │           - トランザクション構築・署名
│   │
│   └── lib/
│       └── txBuilders/                    # トランザクションビルダー
│           - FixedAmountTxBuilder
│           - SweepTxBuilder
│           - RateBasedTxBuilder
│
└── api/
    └── ada/
        ├── requests.js                    # リクエスト管理API
        │   - POST: 新規リクエスト作成
        │   - GET: リクエスト一覧取得
        │
        └── requests/
            └── [id].js                    # 個別リクエスト取得API（問題箇所）
                - GET: 特定のリクエスト詳細取得
```

## データストレージの仕組み
- インメモリキャッシュ（Map）を使用
- キャッシュTTL: 5分
- リクエストTTL: 5分〜36時間（ユーザー指定）
- サーバー再起動でデータが失われる

## 修正案
1. `api/ada/requests/[id].js`の緊急テストコードを削除
2. コメントアウトされている実際のデータ取得ロジックを有効化
3. 本番環境では永続的なデータストア（Redis、PostgreSQL等）の導入を検討

## 影響範囲
- すべての署名ページアクセス
- 開発環境・本番環境の両方
- ユーザーエクスペリエンスに重大な影響

## 推奨される対応
1. 即座に緊急テストコードを削除
2. 実際のデータ取得ロジックの動作確認
3. エラーハンドリングの改善
4. 本番環境向けの永続的データストアの実装