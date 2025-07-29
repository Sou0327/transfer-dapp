# ERC-20 Transfer dApp

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![React](https://img.shields.io/badge/React-18.x-61dafb.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg)
![Vite](https://img.shields.io/badge/Vite-7.x-646cff.svg)

**安全で使いやすい ERC-20 トークン送金 dApp**

非標準 ERC-20 トークン（USDT、BNB など）にも対応した、セキュアなトークン送金アプリケーションです。

## 🚀 主要機能

### 📋 基本機能

- ✅ **MetaMask 連携** - ワンクリックでウォレット接続
- ✅ **リアルタイム残高表示** - 自動更新・手動更新対応
- ✅ **安全な送金機能** - 包括的なバリデーション
- ✅ **ガス料金推定** - 事前の手数料確認
- ✅ **トランザクション追跡** - エクスプローラーリンク

### 🔧 高度な機能

- ✅ **非標準 ERC-20 対応** - USDT、BNB、OMG など
- ✅ **自動互換性チェック** - 送金前の安全性検証
- ✅ **マルチステップ警告** - 非標準トークンの詳細警告
- ✅ **ネットワーク切り替え** - Ethereum、Polygon、テストネット対応
- ✅ **ダークモード** - 快適な視覚体験

### 🛡️ セキュリティ機能

- ✅ **アドレスポイズニング対策** - ゼロ値送金警告
- ✅ **既知問題検出** - 非標準トークンの既知問題データベース
- ✅ **包括的バリデーション** - リアルタイム入力検証
- ✅ **エラーハンドリング** - 詳細なエラー分析と対策提案

## 🏗️ 技術スタック

| カテゴリ           | 技術                       | バージョン |
| ------------------ | -------------------------- | ---------- |
| **フロントエンド** | React                      | 19.1.0     |
| **型安全性**       | TypeScript                 | 5.8.3      |
| **ビルドツール**   | Vite                       | 7.0.4      |
| **スタイリング**   | Tailwind CSS               | 4.1.11     |
| **Web3 連携**      | Ethers.js                  | 6.15.0     |
| **バリデーション** | Zod                        | 4.0.5      |
| **テスト**         | Vitest + Testing Library   | 3.2.4      |
| **リンター**       | ESLint + TypeScript ESLint | 9.30.1     |

## 📦 インストールと実行

### 前提条件

- **Node.js** 18.x 以上
- **npm** または **yarn**
- **MetaMask** ブラウザ拡張機能

### セットアップ手順

```bash
# 1. リポジトリのクローン
git clone <repository-url>
cd erc20-transfer-dapp

# 2. 依存関係のインストール
npm install

# 3. 環境変数の設定
cp .env.example .env
# .envファイルを編集して必要な値を設定

# 4. 開発サーバーの起動
npm run dev
```

### 🌐 サポートネットワーク

| ネットワーク         | Chain ID | RPC URL         |
| -------------------- | -------- | --------------- |
| **Ethereum Mainnet** | 1        | 自動設定        |
| **Goerli Testnet**   | 5        | 自動設定        |
| **Sepolia Testnet**  | 11155111 | 自動設定        |
| **Polygon Mainnet**  | 137      | polygon-rpc.com |

## 🎯 使用方法

### 1. ウォレット接続

1. MetaMask をインストール
2. 「ウォレットを接続」ボタンをクリック
3. MetaMask で接続を承認

### 2. ネットワーク確認

1. 上部のネットワーク表示を確認
2. 必要に応じてネットワークを切り替え
3. サポートされていないネットワークの場合は警告が表示

### 3. トークン送金

1. **受信者アドレス**を入力（0x...形式）
2. **送金金額**を入力（MAX ボタンで最大値設定可能）
3. **ガス料金を推定**ボタンで手数料確認（オプション）
4. **送金実行**ボタンをクリック
5. MetaMask で署名・送信

### 4. 非標準トークンの場合

1. 自動的に互換性チェックが実行
2. 問題が検出された場合、詳細な警告ダイアログが表示
3. リスクを理解した上で確認チェックボックスをクリック
4. 「理解して実行」で送金実行

## 📁 プロジェクト構造

```
src/
├── components/          # Reactコンポーネント
│   ├── ConnectButton.tsx       # ウォレット接続ボタン
│   ├── BalanceCard.tsx         # 残高表示カード
│   ├── TransferForm.tsx        # 送金フォーム
│   ├── NetworkSwitcher.tsx     # ネットワーク切り替え
│   ├── ThemeToggle.tsx         # テーマ切り替え
│   ├── TxToast.tsx            # トースト通知
│   └── TokenCompatibilityWarning.tsx  # 非標準トークン警告
├── contexts/            # Reactコンテキスト
│   ├── WalletContext.tsx       # ウォレット状態管理
│   ├── ThemeContext.tsx        # テーマ状態管理
│   └── ToastContext.tsx        # 通知状態管理
├── hooks/               # カスタムフック
│   ├── useWallet.ts           # ウォレット操作
│   ├── useBalance.ts          # 残高取得
│   └── useTransfer.ts         # 送金処理
├── utils/               # ユーティリティ関数
│   ├── web3.ts               # Web3操作
│   ├── constants.ts          # 定数定義
│   ├── errors.ts             # エラーハンドリング
│   ├── validation.ts         # バリデーション
│   └── tokenCompatibility.ts # 非標準トークン対応
├── types/               # TypeScript型定義
│   └── index.ts
└── tests/               # テストファイル
    └── setup.ts
```

## 🧪 開発・テスト

### 開発用コマンド

```bash
# 開発サーバー起動
npm run dev

# 型チェック
npm run typecheck

# リント実行
npm run lint

# リント自動修正
npm run lint:fix

# テスト実行
npm run test

# テストカバレッジ
npm run test:coverage

# ビルド
npm run build

# プレビュー
npm run preview
```

### 📊 テスト戦略

| テストタイプ             | 対象                   | ツール          |
| ------------------------ | ---------------------- | --------------- |
| **ユニットテスト**       | フック、ユーティリティ | Vitest          |
| **コンポーネントテスト** | UI コンポーネント      | Testing Library |
| **統合テスト**           | フロー全体             | Testing Library |
| **型チェック**           | TypeScript 型安全性    | TSC             |

## ⚙️ 環境変数設定

`.env`ファイルで以下の環境変数を設定：

```env
# アプリケーション基本設定
VITE_APP_NAME="ERC-20 Transfer dApp"
VITE_APP_VERSION="1.0.0"

# ネットワーク設定
VITE_CHAIN_ID=1

# トークンアドレス（使用するERC-20トークン）
VITE_TOKEN_ADDRESS="0xdAC17F958D2ee523a2206206994597C13D831ec7"

# デバッグ設定
VITE_DEBUG=false

# ビルド設定
VITE_BUILD_SOURCEMAP=false
```

### 🔧 主要設定項目

| 変数名               | 説明                         | 例                  |
| -------------------- | ---------------------------- | ------------------- |
| `VITE_TOKEN_ADDRESS` | 対象 ERC-20 トークンアドレス | USDT: `0xdAC17F...` |
| `VITE_CHAIN_ID`      | デフォルトネットワーク       | Mainnet: `1`        |
| `VITE_DEBUG`         | デバッグモード有効化         | `true`/`false`      |

## 🛡️ セキュリティ考慮事項

### ⚠️ 重要な注意点

1. **非標準トークンのリスク**

   - USDT など一部トークンは標準仕様と異なる動作をします
   - 必ず少額でのテスト送金を行ってください
   - 警告ダイアログの内容を十分理解してから実行してください

2. **アドレス検証**

   - 受信者アドレスの正確性を必ず確認してください
   - コピー&ペーストを推奨します
   - アドレスポイズニング攻撃に注意してください

3. **ガス料金**

   - ネットワーク混雑時は高額になる場合があります
   - 事前のガス料金推定機能を活用してください

4. **プライベートキー保護**
   - MetaMask のプライベートキーは絶対に第三者に教えないでください
   - フィッシングサイトに注意してください

### 🔐 セキュリティ機能

- **CSP (Content Security Policy)** 設定済み
- **XSS 対策** 実装済み
- **CSRF 対策** 実装済み
- **入力サニタイゼーション** 実装済み

## 🚨 トラブルシューティング

### よくある問題と解決方法

#### 1. MetaMask が検出されない

```
解決方法:
1. MetaMaskがインストールされているか確認
2. ブラウザを再起動
3. MetaMaskを有効化
```

#### 2. ネットワーク接続エラー

```
解決方法:
1. インターネット接続を確認
2. MetaMaskで正しいネットワークが選択されているか確認
3. RPC URLが正しいか確認
```

#### 3. 送金が失敗する

```
解決方法:
1. 残高が十分にあるか確認
2. ガス料金が適切か確認
3. 非標準トークンの場合は警告に従って対処
```

#### 4. 残高が表示されない

```
解決方法:
1. 正しいトークンアドレスが設定されているか確認
2. ネットワークが正しいか確認
3. 「更新」ボタンをクリック
```

### 開発に参加する方法

1. **フォークとクローン**

```bash
git clone https://github.com/your-username/erc20-transfer-dapp.git
cd erc20-transfer-dapp
```

2. **開発環境セットアップ**

```bash
npm install
cp .env.example .env
```

3. **ブランチ作成**

```bash
git checkout -b feature/your-feature-name
```
# byron-wallet-recovery-modern
# byron-wallet-recovery-modern
# transfer-dapp
# transfer-dapp
