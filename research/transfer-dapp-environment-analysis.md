# transfer-dapp 環境差異分析レポート

## 調査日時

2025-08-03

## 問題の本質

ユーザーの指摘通り、**ローカル開発環境と本番環境で完全に異なるバックエンドが動作している**ことが判明しました。

## 環境別の動作

### 🌐 本番環境（Vercel）

```
ユーザー → Vercel CDN → /api/* → Vercelサーバーレス関数（api/フォルダ）
                                   ↓
                                   インメモリキャッシュ（関数間で共有不可）
```

### 💻 ローカル開発環境

```
ユーザー → Vite (port 4000) → /api/* → プロキシ → Fastifyサーバー (port 3001)
                                                    ↓
                                                    server/routes/*.js
```

## 設定ファイルの証拠

### 1. vite.config.ts

```javascript
server: {
  port: 4000,
  proxy: {
    '/api': {
      target: 'http://localhost:3001',  // ← ここがポイント！
      changeOrigin: true,
    },
  },
}
```

### 2. server/index.js

```javascript
const config = {
  port: parseInt(process.env.PORT) || 3001, // デフォルト3001
  // ...
};
```

### 3. vercel.json

```json
{
  "rewrites": [
    {
      "source": "/((?!api/).*)",
      "destination": "/index.html"
    }
  ]
}
```

## 実装の重複

同じエンドポイントが 2 箇所に存在：

| エンドポイント            | Vercel 用                | ローカル用                |
| ------------------------- | ------------------------ | ------------------------- |
| POST /api/ada/requests    | api/ada/requests.js      | server/routes/requests.js |
| GET /api/ada/requests/:id | api/ada/requests/[id].js | server/routes/requests.js |

## 問題の原因

1. **データストレージの違い**

   - Vercel：インメモリ Map（関数間で共有不可）
   - ローカル：おそらく Fastify サーバー内のメモリ（共有可能）

2. **実装の不一致**

   - 2 つの実装が存在し、同期されていない
   - Vercel 用の実装にはハードコードが含まれていた

3. **開発フローの複雑さ**
   - ローカルでは`yarn dev`と`yarn server:dev`を両方起動する必要がある
   - しかし、これが明確にドキュメント化されていない

## 正しいローカル開発の起動方法

```bash
# ターミナル1：Fastifyサーバー起動（ポート3001）
yarn server:dev

# ターミナル2：Viteフロントエンド起動（ポート4000）
yarn dev
```

## 推奨される解決策

### 短期的解決策

1. ローカル開発手順を README に明記
2. `package.json`に統合スクリプトを追加：
   ```json
   "dev:all": "concurrently \"yarn server:dev\" \"yarn dev\""
   ```

### 長期的解決策

1. **実装の統一化**

   - Vercel 関数と Fastify サーバーで同じコードを共有
   - 共通のデータアクセス層を作成

2. **データストレージの統一**

   - PostgreSQL/Redis を両環境で使用
   - 環境変数でローカル/本番を切り替え

3. **Vercel 開発ツールの活用**
   ```bash
   vercel dev  # Vercel CLIでローカルでもサーバーレス関数を実行
   ```

## 結論

問題の根本原因は、**開発環境と本番環境で異なるバックエンド実装を使用している**ことです。これにより：

- ローカルでは動作するが本番で動作しない
- データの永続性が環境によって異なる
- デバッグが困難

正しい開発フローの確立と、実装の統一化が必要です。
