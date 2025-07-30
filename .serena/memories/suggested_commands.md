# 推奨コマンド

## 開発コマンド
```bash
# 開発サーバー起動（ポート4000）
npm run dev

# 型チェック
npm run typecheck

# リント実行
npm run lint

# リント自動修正
npm run lint:fix

# ビルド
npm run build

# ビルド解析
npm run build:analyze

# プレビュー
npm run preview
```

## テストコマンド
```bash
# テスト実行（watch mode）
npm run test

# テストUI
npm run test:ui

# カバレッジ測定
npm run test:coverage

# テスト一回実行
npm run test:run
```

## データベース・サーバー
```bash
# データベースマイグレーション
npm run db:migrate

# データベースリセット
npm run db:reset

# バックエンドサーバー
npm run server

# 開発用サーバー（nodemon）
npm run server:dev
```

## ユーティリティ
```bash
# キャッシュクリア
npm run clean

# 依存関係インストール
npm install

# 依存関係更新確認
npm audit
```

## Dockerコマンド
```bash
# 開発環境起動
docker-compose up -d

# 本番環境起動
docker-compose -f docker-compose.production.yml up -d

# ログ確認
docker-compose logs -f
```