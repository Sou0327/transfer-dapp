# Upstash Redis 設定ガイド

## 🔄 修正完了内容

### ✅ パッケージ変更
- `@vercel/kv` → `@upstash/redis`

### ✅ APIファイル修正
- `api/ada/requests.js` 
- `api/ada/requests/[id].js`
- JSON.stringify/JSON.parse対応
- 環境変数名変更

## 🚀 設定手順

### Step 1: Upstash Redis設定

#### 1-1: Vercel Marketplaceから設定
1. **Vercelダッシュボード** → **Storage**
2. **Marketplace Database Providers**
3. **Upstash** を選択
4. **Serverless DB (Redis)** を選択

#### 1-2: Upstashアカウント作成
1. Upstashアカウント作成（無料）
2. Vercelプロジェクトと連携
3. 自動的に環境変数が設定される

#### 1-3: 環境変数確認
**Settings** → **Environment Variables** で以下を確認：
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

### Step 2: デプロイ

```bash
# 依存関係インストール
npm install

# 本番デプロイ
vercel --prod
```

### Step 3: 動作確認

#### 3-1: リクエスト作成テスト
1. 管理画面でリクエスト作成
2. **Vercel Functions**ログで環境変数確認：

**成功**:
```
🚨 hasUpstashUrl: true, hasUpstashToken: true
🚨 KV save verification: { saved: true }
```

**失敗**:
```
🚨 hasUpstashUrl: false, hasUpstashToken: false
```

#### 3-2: 署名URL確認
1. 生成されたURLにアクセス
2. Functions ログで取得確認：

**成功**:
```
🔍 KV check: { found: true, dataType: 'object' }
✅ Found request in KV: req_xxx, status: REQUESTED
```

## 📊 主な改善点

### 🔧 技術的改善
- JSONシリアライゼーション対応
- エラーハンドリング強化
- 環境変数チェック

### 🚀 パフォーマンス
- 直接Redis操作（O(1)）
- 複数インスタンス間でデータ共有
- TTL自動管理

### 💰 コスト
- Upstash無料枠: 10,000 requests/day
- 本番運用に十分

## トラブルシューティング

### 環境変数が設定されない場合
1. Upstash統合を再実行
2. Vercelプロジェクト再デプロイ
3. 手動環境変数設定

### データが保存されない場合
- Redis接続エラー
- JSON.stringify エラー
- 権限問題

ログで詳細なエラー情報が確認できます。