# Cardano OTC Transfer dApp プロジェクト概要

## プロジェクトの目的
Yoroiウォレット対応のCardano OTC (Over-The-Counter) 取引システム。Byron時代のウォレット復元からモダンなOTC取引システムまでを包括的にサポートする。

## 技術スタック
- **フロントエンド**: React 19.1.0 + TypeScript 5.8.3
- **ビルドツール**: Vite 7.0.4
- **スタイリング**: Tailwind CSS 4.1.11
- **Web3連携**: Cardano Serialization Library + CIP-30
- **バリデーション**: Zod 3.24.1
- **テストフレームワーク**: Vitest 3.2.4 + Testing Library
- **データベース**: PostgreSQL + Redis
- **バックエンド**: Fastify + Socket.io
- **認証**: JWT + bcrypt
- **監視**: Prometheus + Grafana

## アーキテクチャ特徴
- React 19のServer Components対応
- CIP-30ウォレット統合
- リアルタイムUTxO監視
- 署名フロー管理
- 管理者ダッシュボード
- セキュリティ機能（監査ログ、レート制限）
- パフォーマンス最適化ライブラリ

## プロジェクト構造
```
src/
├── components/          # Reactコンポーネント
├── hooks/              # カスタムフック  
├── lib/                # ライブラリ・ユーティリティ
├── types/              # TypeScript型定義
├── services/           # API・サービス層
└── assets/             # 静的リソース
```