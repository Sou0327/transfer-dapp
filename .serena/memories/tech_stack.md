# 技術スタック詳細

## コア技術
- **React**: 19.1.0 (最新版、Server Components対応)
- **TypeScript**: 5.8.3 (strict設定)
- **Vite**: 7.0.4 (高速ビルド、HMR)
- **Tailwind CSS**: 4.1.11 (ユーティリティファースト)

## Web3・Cardano
- **@emurgo/cardano-serialization-lib-browser**: 12.0.1
- **CIP-30**: ウォレット標準インターフェース
- **Buffer**: ブラウザpolyfill対応

## 状態管理・バリデーション
- **Zod**: 3.24.1 (スキーマバリデーション)
- **Custom hooks**: useYoroiConnect, useUtxoManager

## テスト・開発ツール
- **Vitest**: 3.2.4 (テストランナー)
- **@testing-library/react**: 16.3.0
- **ESLint**: 9.30.1 + TypeScript ESLint

## バックエンド
- **Fastify**: 5.4.0 (高性能サーバー)
- **Socket.io**: 4.8.1 (リアルタイム通信)
- **PostgreSQL**: 8.12.0 (データベース)
- **Redis**: 5.6.1 (キャッシュ・セッション)
- **JWT**: 9.0.2 (認証)