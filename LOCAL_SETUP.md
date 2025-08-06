# ローカル開発環境セットアップ手順

## 概要

このドキュメントはOTC Transfer dAppをローカル環境でVercel本番環境と同じワークフローで動作させるための手順です。

## 必要な前提条件

### システム要件
- Node.js 18+ 
- Docker & Docker Compose
- Git
- 最低8GB RAM推奨

### 外部サービス
- **Blockfrost API キー** (mainnet用)
  - https://blockfrost.io でアカウント作成
  - Mainnet project作成してAPI keyを取得

## 手順1: リポジトリのクローンと依存関係インストール

```bash
# リポジトリクローン
git clone <repository-url>
cd transfer-dapp

# 依存関係インストール
npm install
# または
yarn install
```

## 手順2: 環境変数設定

```bash
# 環境変数ファイルをコピー
cp .env.example .env

# .envファイルを編集
# 必須項目を設定：
# - BLOCKFROST_API_KEY=mainnet_あなたのAPIキー
# - JWT_SECRET=本番用の32文字以上のランダム文字列
# - ENCRYPTION_KEY=暗号化用の32文字のキー
```

### 重要な環境変数

```bash
# Blockfrost API (必須)
BLOCKFROST_API_KEY=mainnet_your_actual_api_key_here

# セキュリティ (本番環境では必ず変更)
JWT_SECRET=production-jwt-secret-32-chars-minimum
ENCRYPTION_KEY=your-32-char-encryption-key-here
SESSION_SECRET=session-secret-change-in-production

# データベース (Dockerで自動設定される)
DATABASE_URL=postgresql://otc_user:secure_password_123@localhost:5432/otc_system
REDIS_URL=redis://localhost:6379
```

## 手順3: Docker環境の起動

```bash
# データディレクトリ作成
mkdir -p data/{postgres,redis,logs,nginx}

# Docker環境起動 (PostgreSQL + Redis)
npm run docker:up

# ログ確認
npm run docker:logs
```

### Docker環境の確認

```bash
# コンテナ状態確認
docker-compose ps

# 以下のサービスが稼働していることを確認：
# - otc-postgres (PostgreSQL 15)
# - otc-redis (Redis 7)
```

## 手順4: データベースセットアップ

```bash
# データベースマイグレーション実行
npm run db:migrate

# 管理者アカウント作成 (開発用)
curl -X POST http://localhost:4000/api/auth/create-admin \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@localhost",
    "password": "admin123"
  }'
```

## 手順5: アプリケーション起動

### 方法1: フル起動 (推奨)
```bash
# フロントエンド + バックエンド同時起動
npm run local:full
```

### 方法2: 個別起動
```bash
# ターミナル1: バックエンドサーバー
npm run server:dev

# ターミナル2: フロントエンド開発サーバー  
npm run dev
```

## 手順6: 動作確認

### アクセス確認
- **フロントエンド**: http://localhost:4000
- **管理画面**: http://localhost:4000/admin  
- **API**: http://localhost:4000/api/health
- **WebSocket**: ws://localhost:4000/ws

### ヘルスチェック
```bash
# システム全体の健全性確認
curl http://localhost:4000/health

# API動作確認
curl http://localhost:4000/api/ada/requests

# 管理者API確認 (ログイン後)
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     http://localhost:4000/api/admin/stats
```

## 管理者ログイン

1. http://localhost:4000/admin にアクセス
2. Email: `admin@localhost`
3. Password: `admin123`

## 開発ワークフロー

### OTC取引テスト手順

1. **リクエスト作成**
   ```bash
   curl -X POST http://localhost:4000/api/ada/requests \
     -H "Content-Type: application/json" \
     -d '{
       "currency": "ADA",
       "amount_mode": "fixed", 
       "amount_or_rule": {"amount": 10000000},
       "recipient": "addr1q...",
       "ttl_minutes": 30
     }'
   ```

2. **署名ページアクセス**
   - レスポンスの `signUrl` にアクセス
   - Eternl/Namiで署名実行

3. **管理画面で承認**
   - http://localhost:4000/admin
   - 署名済みリクエストの「送信実行」ボタンクリック

4. **トランザクション確認**
   - Blockfrost Explorer等で確認

### リアルタイム通知テスト

WebSocketクライアントでテスト：
```javascript
const ws = new WebSocket('ws://localhost:4000/ws');
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('通知:', data);
};
```

## トラブルシューティング

### PostgreSQL接続エラー
```bash
# Dockerコンテナ再起動
docker-compose restart postgres

# データベース接続確認
docker-compose exec postgres psql -U otc_user -d otc_system -c "SELECT NOW();"
```

### Redis接続エラー
```bash
# Redis再起動
docker-compose restart redis

# Redis接続確認  
docker-compose exec redis redis-cli ping
```

### ポート競合エラー
```bash
# ポート使用状況確認
lsof -i :4000
lsof -i :5432
lsof -i :6379

# 必要に応じてプロセス終了またはポート変更
```

### WebSocket接続エラー
- ファイアウォール設定確認
- ブラウザ開発者ツールでコンソールエラー確認
- `WS_ORIGIN` 環境変数確認

## 環境リセット

```bash
# Docker環境停止・削除
npm run docker:down
docker-compose down -v

# データディレクトリクリア
rm -rf data/

# 依存関係再インストール
rm -rf node_modules package-lock.json
npm install

# 環境再構築
npm run docker:up
npm run db:migrate
```

## 本番環境との差異

| 項目 | ローカル | Vercel本番 |
|------|----------|------------|
| データベース | PostgreSQL (Docker) | Vercel Postgres |
| キャッシュ | Redis (Docker) | Upstash Redis |
| ファイルストレージ | ローカルファイル | Vercel Blob |
| 認証 | JWT (Express) | JWT (Serverless) |
| WebSocket | ws library | WebSocket API |
| ログ | Console + File | Vercel Logs |

## 次のステップ

1. CIP-45モバイル接続のテスト
2. 複数チェーン対応の実装準備
3. 負荷テストの実行
4. セキュリティ監査の準備