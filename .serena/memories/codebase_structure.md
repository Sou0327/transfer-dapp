# コードベース構造

## メインディレクトリ
```
src/
├── components/          # Reactコンポーネント
├── hooks/              # カスタムフック
├── lib/                # ライブラリ・ユーティリティ
├── types/              # TypeScript型定義
├── services/           # API・サービス層
├── assets/             # 静的リソース
└── __tests__/          # テストファイル
```

## 主要コンポーネント
- **App.tsx**: メインアプリケーション
- **UTxOTable.tsx**: UTxO表示テーブル
- **TransferForm.tsx**: ADA送金フォーム
- **YoroiConnectButton.tsx**: ウォレット接続
- **ErrorBoundary.tsx**: エラー境界

## 重要なフック
- **useYoroiConnect**: Yoroiウォレット接続管理
- **useUtxoManager**: UTxO状態管理
- **useCIP30Connect**: CIP-30標準接続

## パフォーマンス関連
- **lib/performance/reactOptimization.ts**: React最適化ユーティリティ
- **lib/performance/bundleOptimization.ts**: バンドル最適化
- **components/performance/VirtualizedList.tsx**: 仮想化リスト

## セキュリティ
- **lib/security/**: セキュリティミドルウェア
- **lib/validation/**: バリデーション・サニタイゼーション

## バックエンド
- **server/**: Fastifyサーバー
- **database/**: PostgreSQL設定
- **backend/**: API エンドポイント