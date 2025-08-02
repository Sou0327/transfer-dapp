# Cardano Yoroi OTC dApp

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![React](https://img.shields.io/badge/React-19.1.0-61dafb.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8.3-3178c6.svg)
![Vite](https://img.shields.io/badge/Vite-5.4.10-646cff.svg)

**事前署名・共有機能付きの安全な Cardano OTC（店頭）取引 dApp**

Yoroi ウォレット対応のセキュアな OTC 取引システムと、レガシー送金機能を統合したアプリケーションです。

## 🚀 主要機能

### 📋 OTC 取引システム（メイン機能）

- ✅ **請求作成** - 管理者による取引請求の作成
- ✅ **ユーザー署名** - Yoroi ウォレットでの事前署名
- ✅ **管理者実行** - 署名済みトランザクションの実行
- ✅ **リアルタイム監視** - WebSocket による状態同期
- ✅ **TTL 設定** - 5分-36時間の有効期限管理

### 🔧 高度な機能

- ✅ **3 つの金額モード** - Fixed 固定額 | Sweep 全額送金 | Rate-based レート連動
- ✅ **CIP-30 対応** - Yoroi、Nami、Eternl 等の主要ウォレット対応
- ✅ **UTxO 管理** - 効率的な入力選択と残高監視
- ✅ **カウントダウン表示** - 有効期限の視覚的確認
- ✅ **QR コード生成** - 署名 URL の簡単共有

### 🛡️ セキュリティ機能

- ✅ **管理者認証** - JWT + bcrypt による安全な認証
- ✅ **監査ログ** - 全操作の記録とトレーサビリティ
- ✅ **レート制限** - API 呼び出し制限と DDoS 対策
- ✅ **CSRF 対策** - トークンベースの偽造リクエスト防止
- ✅ **TTL 管理** - 自動期限切れ処理

## 🏗️ アプリケーション構成

### デュアルアプリ構成

```
/ → リダイレクト to /admin
├── /admin      → OTC管理システム (AdminApp.tsx)
├── /sign       → OTC署名インターフェース (SigningPage.tsx)
└── /transfer   → レガシー送金アプリ (App.tsx)
```

### 管理画面タブ構成（段階的リリース）

| タブ                 | 状態          | 説明                     |
| -------------------- | ------------- | ------------------------ |
| **ダッシュボード**   | ✅ 有効       | 取引統計とシステム概要   |
| **請求管理**         | ✅ 有効       | OTC 請求の作成・管理     |
| **トランザクション** | ✅ 有効       | 署名済み取引の実行       |
| **セキュリティ**     | 🚧 一時非表示 | 監査ログ・レート制限管理 |
| **システム設定**     | 🚧 一時非表示 | メンテナンス・統計機能   |

## 🏗️ 技術スタック

| カテゴリ             | 技術                          | バージョン     |
| -------------------- | ----------------------------- | -------------- |
| **フロントエンド**   | React                         | 19.1.0         |
| **型安全性**         | TypeScript                    | 5.8.3          |
| **ビルドツール**     | Vite                          | 5.4.10         |
| **スタイリング**     | Tailwind CSS                  | 3.4.17         |
| **ルーティング**     | React Router DOM              | 7.7.1          |
| **状態管理**         | Zustand                       | 5.0.6          |
| **リアルタイム通信** | Socket.io                     | 4.8.1          |
| **ブロックチェーン** | Cardano Serialization Library | 12.0.1         |
| **バックエンド**     | Fastify                       | 5.4.0          |
| **認証**             | JWT + bcrypt                  | 9.0.2 + 6.0.0  |
| **データベース**     | PostgreSQL + Redis            | 8.12.0 + 5.6.1 |
| **テスト**           | Vitest + Testing Library      | 3.2.4          |

## 📦 インストールと実行

### 前提条件

- **Node.js** 18.x 以上
- **yarn** (推奨) または **npm**
- **PostgreSQL** 14.x 以上
- **Redis** 6.x 以上
- **Yoroi ウォレット** ブラウザ拡張機能

### セットアップ手順

```bash
# 1. リポジトリのクローン
git clone <repository-url>
cd cardano-yoroi-otc-dapp

# 2. 依存関係のインストール（yarnを推奨）
yarn install

# 3. 環境変数の設定
cp .env.example .env
# .envファイルを編集して必要な値を設定

# 4. データベース初期化
yarn db:migrate

# 5. フロントエンド開発サーバーの起動
yarn dev

# 6. バックエンドサーバーの起動（別ターミナル）
yarn server:dev
```

### 🔄 パッケージマネージャーについて

このプロジェクトは **npm → yarn** に移行しました：

**移行理由**: npm で rollup 依存関係エラー `Cannot find module @rollup/rollup-darwin-x64` が発生したため

**現在の構成**:

- **フロントエンド**: `yarn` を使用
- **バックエンド**: `node server/index.js` で直接実行

## 🎯 OTC 取引フロー

### 1. 請求作成（管理者）

```
管理画面 → 請求管理 → 新規作成
↓
金額モード選択（Fixed/Sweep/Rate-based）
↓
宛先アドレス・TTL設定
↓
署名URL生成 + QRコード発行
```

### 2. ユーザー署名

```
署名URLアクセス
↓
Yoroiウォレット接続
↓
UTxO選択・トランザクション構築
↓
ウォレットで署名実行
↓
署名データをサーバーに送信
```

### 3. 管理者実行

```
管理画面でステータス確認
↓
署名完了を確認
↓
トランザクション送信実行
↓
ブロックチェーンにコミット
```

## 📁 プロジェクト構造

```
src/
├── components/              # UIコンポーネント
│   ├── admin/              # 管理画面コンポーネント
│   │   ├── AdminApp.tsx           # メイン管理アプリ
│   │   ├── Dashboard.tsx          # ダッシュボード
│   │   ├── RequestsManagement.tsx # 請求管理
│   │   ├── TransactionManagement.tsx # トランザクション管理
│   │   ├── SecurityDashboard.tsx  # セキュリティ監視（非表示中）
│   │   └── SystemSettings.tsx     # システム設定（非表示中）
│   ├── sign/               # 署名インターフェース
│   │   ├── SigningPage.tsx        # メイン署名ページ
│   │   ├── SigningSteps.tsx       # 署名ステップ表示
│   │   ├── SigningSuccess.tsx     # 署名完了画面
│   │   └── SigningError.tsx       # エラー画面
│   ├── common/             # 共通UIコンポーネント
│   ├── utxo/              # UTxO管理コンポーネント
│   └── [その他]            # ウォレット接続、送金フォーム等
├── hooks/                  # Reactカスタムフック
│   ├── useAdminAuth.ts           # 管理者認証
│   ├── useYoroiConnect.ts        # Yoroiウォレット連携
│   ├── useUtxoManager.ts         # UTxO管理
│   ├── useWebSocket.ts           # WebSocket通信
│   └── [その他Hook]
├── lib/                    # ライブラリ・ユーティリティ
│   ├── cardano/                  # Cardano関連
│   │   └── lazyCSL.tsx          # Cardano Serialization Library
│   ├── security/                 # セキュリティ機能
│   │   ├── auditLog.ts          # 監査ログ
│   │   ├── rateLimiter.ts       # レート制限
│   │   └── [その他Security]
│   ├── database.ts              # データベース操作
│   ├── auth.ts                  # 認証ロジック
│   └── [その他Utils]
├── types/                  # TypeScript型定義
│   ├── otc/index.ts             # OTC関連型（大量の型定義）
│   └── [その他Types]
├── stores/                 # Zustand状態管理
├── services/               # 外部サービス連携
└── Router.tsx              # メインルーター

server/                     # バックエンド
├── index.js                # Fastifyサーバーメイン
└── routes/                 # APIルート定義

database/                   # データベース関連
└── migrate.js              # マイグレーションスクリプト
```

## 🧪 開発・テスト

### 開発用コマンド

```bash
# フロントエンド開発サーバー起動
yarn dev                    # http://localhost:4000

# バックエンドサーバー起動
yarn server                 # 本番用
yarn server:dev             # 開発用（ホットリロード）

# 型チェック
yarn typecheck

# リント実行・修正
yarn lint
yarn lint:fix

# テスト実行
yarn test
yarn test:coverage

# ビルド・プレビュー
yarn build
yarn preview

# データベース
yarn db:migrate             # マイグレーション実行
yarn db:reset               # データベースリセット
```

### 🔧 重要な実行コマンド比較

| 用途               | フロントエンド               | バックエンド      |
| ------------------ | ---------------------------- | ----------------- |
| **開発起動**       | `yarn dev`                   | `yarn server:dev` |
| **本番起動**       | `yarn build && yarn preview` | `yarn server`     |
| **パッケージ管理** | `yarn install`               | `node` 直接実行   |

## ⚙️ 環境変数設定

`.env`ファイルで以下の環境変数を設定：

```env
# アプリケーション設定
NODE_ENV=development
PORT=3000
VITE_PORT=4000

# データベース設定
DATABASE_URL=postgresql://username:password@localhost:5432/otc_db
REDIS_URL=redis://localhost:6379

# 認証設定
JWT_SECRET=your-jwt-secret-key
JWT_EXPIRES_IN=24h

# Cardano設定
CARDANO_NETWORK=mainnet
BLOCKFROST_API_KEY=your-blockfrost-api-key

# セキュリティ設定
CORS_ORIGIN=http://localhost:4000
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=1000

# WebSocket設定
WS_PORT=3001
```

## 🛡️ セキュリティ考慮事項

### ⚠️ 重要な注意点

1. **秘密鍵管理**

   - Yoroi ウォレットの秘密鍵は絶対に第三者に教えないでください
   - フィッシングサイトに注意してください

2. **TTL（有効期限）管理**

   - OTC 請求は 5分-36時間の有効期限があります
   - 期限切れ後は自動的に無効化されます

3. **管理者権限**

   - 管理者アカウントは厳重に管理してください
   - 定期的なパスワード変更を推奨します

4. **ネットワーク確認**
   - メインネット・テストネットの混同に注意してください
   - トランザクション送信前に必ず確認してください

### 🔐 実装済みセキュリティ機能

- **JWT 認証** - 管理者セッション管理
- **bcrypt 暗号化** - パスワードハッシュ化
- **CORS 設定** - クロスオリジン制御
- **レート制限** - API 呼び出し制限
- **監査ログ** - 全操作の記録
- **CSRF 対策** - トークンベース保護
- **入力検証** - Zod スキーマによるバリデーション

## 🚨 トラブルシューティング

### よくある問題と解決方法

#### 1. Yoroi ウォレットが検出されない

```
解決方法:
1. Yoroi拡張機能がインストールされているか確認
2. ブラウザを再起動
3. Yoroiを有効化・アップデート
4. 他のウォレット（Nami、Eternl等）も試す
```

#### 2. サーバー接続エラー

```
解決方法:
1. バックエンドサーバーが起動しているか確認: yarn server:dev
2. ポート競合を確認: 3000番ポートが使用可能か
3. 環境変数(.env)が正しく設定されているか確認
```

#### 3. データベース接続エラー

```
解決方法:
1. PostgreSQLとRedisが起動しているか確認
2. DATABASE_URLとREDIS_URLが正しいか確認
3. データベースマイグレーション実行: yarn db:migrate
```

#### 4. OTC 取引が失敗する

```
解決方法:
1. UTxOが十分にあるか確認
2. TTL（有効期限）が切れていないか確認
3. ネットワーク（mainnet/testnet）が正しいか確認
4. Blockfrost APIキーが有効か確認
```

#### 5. yarn install でエラーが発生

```
解決方法:
1. Node.js 18.x以上がインストールされているか確認
2. yarn キャッシュをクリア: yarn cache clean
3. node_modules削除して再インストール: rm -rf node_modules && yarn install
```

## 🚀 デプロイメント

### Vercel デプロイ設定

```json
// vercel.json
{
  "buildCommand": "yarn install --production=false && yarn build",
  "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }]
}
```

### 本番環境での注意点

1. **環境変数の設定**

   - Vercel Dashboard で本番用環境変数を設定
   - JWT_SECRET、API_KEY 等の機密情報を適切に管理

2. **データベース設定**

   - 本番用 PostgreSQL/Redis の準備
   - 接続 URL、認証情報の設定

3. **Cardano 設定**
   - メインネット用 Blockfrost API Key 設定
   - 適切なネットワーク設定の確認

## 📈 ロードマップ

### Phase 1: 基本機能（現在）

- ✅ OTC 取引フロー実装
- ✅ Yoroi ウォレット連携
- ✅ 管理画面（3 タブ構成）

### Phase 2: 運用機能（今後）

- 🚧 セキュリティ監視機能の有効化
- 🚧 システム設定・メンテナンス機能
- 🚧 高度な監査ログ機能

### Phase 3: 機能拡張（将来）

- 📋 マルチウォレット対応拡張
- 📋 バッチ処理機能
- 📋 レポート機能強化

## 🤝 開発に参加する

1. **フォークとクローン**

```bash
git clone https://github.com/your-username/cardano-yoroi-otc-dapp.git
cd cardano-yoroi-otc-dapp
```

2. **開発環境セットアップ**

```bash
yarn install
cp .env.example .env
yarn db:migrate
```

3. **ブランチ作成**

```bash
git checkout -b feature/your-feature-name
```

4. **開発開始**

```bash
# フロントエンド
yarn dev

# バックエンド（別ターミナル）
yarn server:dev
```
