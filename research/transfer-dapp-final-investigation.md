# transfer-dapp 最終調査レポート

## 調査日時
2025-08-03

## 調査サマリー

transfer-dappのURL問題について調査した結果、以下の構造的な問題が判明しました：

1. **緊急テストコードの存在**（修正済み）
2. **Vercelサーバーレス環境でのデータ共有問題**
3. **データベース・キャッシュサービスの未使用**

## システムアーキテクチャの現状

### 1. Vercel環境の構成
```
Vercel Serverless Functions
├── api/ada/requests.js         # リクエスト作成・一覧取得
└── api/ada/requests/[id].js    # 個別リクエスト取得

問題：各関数は独立したプロセスで実行され、インメモリデータを共有できない
```

### 2. 実際に用意されているインフラ（未使用）
```yaml
services:
  postgres:    # PostgreSQL 15 - OTC取引データ永続化用
  redis:       # Redis 7 - キャッシュ用
  app:         # メインアプリケーション
  nginx:       # リバースプロキシ
```

### 3. データベーススキーマ（実装済み・未使用）
- `ada_requests` テーブル：OTCリクエスト管理
- `ada_presigned` テーブル：署名済みデータ
- `ada_txs` テーブル：トランザクション記録
- `audit_logs` テーブル：監査ログ

## 問題の根本原因

### 現在の実装フロー
```
[管理画面] → POST /api/ada/requests
    ↓
[Vercel Function A] インメモリに保存
    ↓
[署名URL生成] /sign/{requestId}
    ↓
[ユーザーアクセス] → GET /api/ada/requests/{id}
    ↓
[Vercel Function B] → GET /api/ada/requests（内部呼び出し）
    ↓
[Vercel Function C] インメモリデータが見つからない（別プロセス）
```

### データ取得の回避策（現在）
```javascript
// 非効率だが動作する可能性のある実装
const listResponse = await fetch(`${baseUrl}/api/ada/requests`);
const listData = await listResponse.json();
const requestData = listData.requests?.find(req => req.id === id);
```

## 発見された追加の問題

### 1. Serverフォルダの存在
`server/routes/requests.js`が存在するが、Vercel環境では使用されていない。
これは本来のバックエンドサーバー用の実装と思われる。

### 2. 環境設定の混在
- Vercel用：`api/`フォルダ（現在使用中）
- Express/Fastify用：`server/`フォルダ（未使用）
- Docker環境：完全な設定あり（部分的に未使用）

### 3. データ永続性の欠如
- サーバーレス関数の再起動でデータ消失
- TTL管理が機能しない
- 複数ユーザー間でのデータ共有不可

## 推奨される修正案

### 案1：最小限の修正（Vercel KV使用）
```javascript
// api/ada/requests.js
import { kv } from '@vercel/kv';

// リクエスト作成時
await kv.set(`request:${requestId}`, otcRequest, { ex: ttl_minutes * 60 });

// api/ada/requests/[id].js
const requestData = await kv.get(`request:${id}`);
```

### 案2：PostgreSQL活用（推奨）
```javascript
// 既存のスキーマを活用
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// リクエスト作成
await pool.query(
  'INSERT INTO ada_requests (...) VALUES (...)',
  [values]
);
```

### 案3：完全なバックエンド移行
- Dockerコンテナで`server/`のコードを実行
- Vercelは静的ホスティングのみ
- WebSocket対応も可能

## 結論

現在のシステムは以下の状態です：
- **動作しない理由**：サーバーレス関数間でデータ共有できない
- **インフラは準備済み**：PostgreSQL、Redis、完全なスキーマ
- **実装が不完全**：Vercel APIがデータベースを使用していない

最も現実的な解決策は、既存のPostgreSQLを使用するようにVercel APIを修正することです。