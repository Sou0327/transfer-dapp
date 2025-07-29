# Cardano OTC Trading System - アーキテクチャドキュメント

## システム概要

Cardano OTC Trading System は、Cardano ブロックチェーン上でのOTC（Over-The-Counter）取引を安全かつ効率的に実現するための包括的なWebアプリケーションです。

### 設計原則

1. **セキュリティファースト**: 暗号化、認証、監査ログによる多層防御
2. **スケーラビリティ**: マイクロサービス指向の疎結合設計
3. **可用性**: 冗長化と監視による高可用性
4. **保守性**: モジュラー設計とドキュメント化
5. **ユーザビリティ**: 直感的なUI/UXとマルチウォレット対応

## システム構成図

```
┌─────────────────────────────────────────────────────────────┐
│                        Load Balancer                        │
│                         (Nginx)                            │
└─────────────────────┬───────────────────────────────────────┘
                      │
         ┌────────────┴────────────┐
         │                         │
┌────────▼─────────┐       ┌───────▼────────┐
│   Web Frontend   │       │  Monitoring    │
│   (React/Vite)   │       │   (Grafana)    │
└────────┬─────────┘       └────────────────┘
         │
┌────────▼─────────┐
│   Backend API    │
│ (Node.js/Express)│
└────────┬─────────┘
         │
    ┌────┴────┐
    │         │
┌───▼──┐  ┌──▼───┐      ┌─────────────┐
│ DB   │  │Cache │      │  Cardano    │
│(PG)  │  │(Redis)      │ Blockchain  │
└──────┘  └──────┘      └─────────────┘
```

## 技術スタック

### フロントエンド

| 技術 | バージョン | 用途 |
|------|-----------|------|
| React | 18.2.0 | UIフレームワーク |
| TypeScript | 5.0+ | 型安全な開発 |
| Vite | 4.0+ | ビルドツール |
| TailwindCSS | 3.3+ | CSSフレームワーク |
| Zustand | 4.4+ | 状態管理 |
| React Query | 4.29+ | サーバー状態管理 |
| React Hook Form | 7.45+ | フォーム管理 |
| Zod | 3.21+ | スキーマ検証 |

### バックエンド

| 技術 | バージョン | 用途 |
|------|-----------|------|
| Node.js | 20.0+ | サーバーランタイム |
| Express | 4.18+ | Webフレームワーク |
| TypeScript | 5.0+ | 型安全な開発 |
| PostgreSQL | 15+ | メインデータベース |
| Redis | 7.0+ | キャッシュ・セッション |
| WebSocket | - | リアルタイム通信 |

### Cardano統合

| 技術 | バージョン | 用途 |
|------|-----------|------|
| @emurgo/cardano-serialization-lib-nodejs | 12.0+ | トランザクション構築 |
| CIP-30 | 1.0 | ウォレット統合標準 |
| Blockfrost API | v0.1.39+ | ブロックチェーンデータ |
| Koios API | v1.1.0+ | 代替データソース |

### インフラストラクチャ

| 技術 | バージョン | 用途 |
|------|-----------|------|
| Docker | 24.0+ | コンテナ化 |
| Docker Compose | 2.20+ | オーケストレーション |
| Nginx | 1.24+ | リバースプロキシ |
| Let's Encrypt | - | SSL証明書 |
| Prometheus | 2.45+ | メトリクス収集 |
| Grafana | 10.0+ | 可視化 |
| AlertManager | 0.25+ | アラート管理 |
| ELK Stack | 8.9+ | ログ管理 |

## データベース設計

### ERD（Entity Relationship Diagram）

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│   ada_requests  │       │  ada_presigned  │       │    ada_txs      │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ id (PK)         │◄──────┤ request_id (FK) │       │ id (PK)         │
│ request_id      │       │ id (PK)         │       │ request_id (FK) │
│ amount_mode     │       │ encrypted_data  │       │ tx_hash         │
│ amount          │       │ wallet_type     │       │ status          │
│ recipient_addr  │       │ created_at      │       │ submitted_at    │
│ description     │       │ expires_at      │       │ confirmed_at    │
│ status          │       └─────────────────┘       │ block_height    │
│ created_at      │                                 │ created_at      │
│ updated_at      │                                 └─────────────────┘
│ expires_at      │
└─────────────────┘

                    ┌─────────────────┐
                    │   audit_logs    │
                    ├─────────────────┤
                    │ id (PK)         │
                    │ user_id         │
                    │ action          │
                    │ resource_type   │
                    │ resource_id     │
                    │ details (JSON)  │
                    │ ip_address      │
                    │ user_agent      │
                    │ created_at      │
                    └─────────────────┘
```

### テーブル仕様

#### ada_requests（OTC取引リクエスト）

```sql
CREATE TABLE ada_requests (
    id SERIAL PRIMARY KEY,
    request_id VARCHAR(32) UNIQUE NOT NULL,
    amount_mode VARCHAR(20) NOT NULL CHECK (amount_mode IN ('fixed_amount', 'sweep', 'rate_based')),
    amount BIGINT, -- lovelace単位
    rate DECIMAL(10,4), -- rate_basedモード用
    recipient_address TEXT NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'signed', 'submitted', 'confirmed', 'expired', 'cancelled')),
    utxo_data JSONB, -- 選択されたUTxO情報
    created_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    INDEX idx_request_id (request_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
);
```

#### ada_presigned（事前署名データ）

```sql
CREATE TABLE ada_presigned (
    id SERIAL PRIMARY KEY,
    request_id VARCHAR(32) NOT NULL REFERENCES ada_requests(request_id),
    encrypted_witness TEXT NOT NULL, -- AES暗号化されたwitness
    encrypted_tx_body TEXT NOT NULL, -- AES暗号化されたtxBody
    wallet_type VARCHAR(50) NOT NULL,
    wallet_address TEXT NOT NULL,
    utxo_snapshot JSONB NOT NULL, -- 署名時のUTxO状態
    ttl BIGINT, -- Time To Live (slot)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    INDEX idx_request_id (request_id),
    INDEX idx_expires_at (expires_at)
);
```

#### ada_txs（トランザクション履歴）

```sql
CREATE TABLE ada_txs (
    id SERIAL PRIMARY KEY,
    request_id VARCHAR(32) NOT NULL REFERENCES ada_requests(request_id),
    tx_hash VARCHAR(64) UNIQUE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'submitted'
        CHECK (status IN ('submitted', 'confirmed', 'failed')),
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP,
    block_height BIGINT,
    confirmation_count INTEGER DEFAULT 0,
    error_message TEXT,
    INDEX idx_request_id (request_id),
    INDEX idx_tx_hash (tx_hash),
    INDEX idx_status (status)
);
```

#### audit_logs（監査ログ）

```sql
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(100),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id VARCHAR(100),
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_action (action),
    INDEX idx_resource (resource_type, resource_id),
    INDEX idx_created_at (created_at)
);
```

## API設計

### REST API仕様

#### 認証

```typescript
interface AuthRequest {
  username: string;
  password: string;
}

interface AuthResponse {
  token: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    username: string;
    role: string;
  };
}
```

#### リクエスト管理

```typescript
interface CreateRequestPayload {
  amountMode: 'fixed_amount' | 'sweep' | 'rate_based';
  amount?: string; // lovelace (fixed_amount用)
  rate?: number; // USD/ADA (rate_based用)
  recipientAddress: string;
  description?: string;
  expirationHours?: number;
}

interface OTCRequest {
  id: number;
  requestId: string;
  amountMode: string;
  amount?: string;
  rate?: number;
  recipientAddress: string;
  description?: string;
  status: RequestStatus;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  qrCode: string; // Base64 encoded QR code
}
```

#### UTxO管理

```typescript
interface UTxO {
  txHash: string;
  outputIndex: number;
  amount: {
    lovelace: string;
    assets?: Record<string, string>;
  };
  address: string;
  datumHash?: string;
  scriptRef?: string;
}

interface UTxOResponse {
  utxos: UTxO[];
  totalAda: string;
  adaOnlyUtxos: UTxO[];
  recommendedUtxos: UTxO[];
}
```

### WebSocket API

#### イベント種別

```typescript
type WebSocketEvent = 
  | { type: 'request_status_changed'; payload: RequestStatusUpdate }
  | { type: 'utxo_consumed'; payload: UTxOConsumedEvent }
  | { type: 'transaction_confirmed'; payload: TransactionConfirmedEvent }
  | { type: 'heartbeat'; payload: { timestamp: number } };

interface RequestStatusUpdate {
  requestId: string;
  status: RequestStatus;
  updatedAt: string;
  details?: any;
}
```

## セキュリティアーキテクチャ

### 認証・認可

```typescript
// JWT設定
interface JWTConfig {
  secret: string;
  algorithm: 'HS256';
  expiresIn: string;
  issuer: string;
  audience: string;
}

// RBAC（Role-Based Access Control）
interface UserRole {
  id: string;
  name: string;
  permissions: Permission[];
}

interface Permission {
  resource: string;
  actions: string[];
}
```

### 暗号化

```typescript
// AES-256-GCM暗号化
interface EncryptionConfig {
  algorithm: 'aes-256-gcm';
  keyLength: 32;
  ivLength: 16;
  tagLength: 16;
}

// 機密データ暗号化
interface EncryptedData {
  ciphertext: string;
  iv: string;
  tag: string;
  algorithm: string;
}
```

### セキュリティミドルウェア

```typescript
// レート制限
interface RateLimitConfig {
  windowMs: number;
  max: number;
  message: string;
  standardHeaders: boolean;
  legacyHeaders: boolean;
}

// CORS設定
interface CORSConfig {
  origin: string[];
  credentials: boolean;
  methods: string[];
  allowedHeaders: string[];
}
```

## フロントエンド アーキテクチャ

### 状態管理（Zustand）

```typescript
// メインストア構造
interface AppState {
  // 認証状態
  auth: {
    isAuthenticated: boolean;
    user: User | null;
    token: string | null;
  };
  
  // ウォレット状態
  wallet: {
    connectedWallet: WalletType | null;
    address: string | null;
    balance: string | null;
    utxos: UTxO[];
  };
  
  // リクエスト状態
  requests: {
    currentRequest: OTCRequest | null;
    list: OTCRequest[];
    loading: boolean;
  };
  
  // UI状態
  ui: {
    sidebarOpen: boolean;
    theme: 'light' | 'dark';
    notifications: Notification[];
  };
}
```

### コンポーネント階層

```
App
├── AuthProvider
├── WalletProvider
├── QueryProvider
└── Router
    ├── PublicRoutes
    │   ├── SignPage
    │   └── NotFoundPage
    └── ProtectedRoutes
        ├── AdminLayout
        │   ├── Dashboard
        │   ├── RequestManager
        │   ├── TransactionMonitor
        │   └── SystemSettings
        └── ErrorBoundary
```

### ウォレット統合

```typescript
// CIP-30ウォレットAPI
interface WalletAPI {
  getNetworkId(): Promise<number>;
  getUtxos(): Promise<string[] | null>;
  getCollateral(): Promise<string[] | null>;
  getBalance(): Promise<string>;
  getUsedAddresses(): Promise<string[]>;
  getUnusedAddresses(): Promise<string[]>;
  signTx(tx: string, partialSign?: boolean): Promise<string>;
  signData(addr: string, payload: string): Promise<CoseSign1>;
  submitTx(tx: string): Promise<string>;
}

// サポート対象ウォレット
type SupportedWallet = 
  | 'nami'
  | 'eternl' 
  | 'flint'
  | 'typhon'
  | 'cardwallet'
  | 'nufi'
  | 'gerowallet'
  | 'yoroi';
```

## バックエンド アーキテクチャ

### レイヤード アーキテクチャ

```
┌─────────────────────────────────────┐
│           Controller Layer          │  ← HTTP/WebSocket endpoints
├─────────────────────────────────────┤
│            Service Layer            │  ← Business logic
├─────────────────────────────────────┤
│          Repository Layer           │  ← Data access
├─────────────────────────────────────┤
│           Database Layer            │  ← PostgreSQL/Redis
└─────────────────────────────────────┘
```

### サービス構成

```typescript
// メインサービス
interface Services {
  authService: AuthService;
  requestService: RequestService;
  walletService: WalletService;
  transactionService: TransactionService;
  utxoService: UTxOService;
  monitoringService: MonitoringService;
  notificationService: NotificationService;
  auditService: AuditService;
}

// 外部連携サービス
interface ExternalServices {
  blockfrostService: BlockfrostService;
  koiosService: KoiosService;
  rateService: ExchangeRateService;
  emailService: EmailService;
  slackService: SlackService;
}
```

### ミドルウェア スタック

```typescript
// Express ミドルウェア構成
const middlewareStack = [
  // セキュリティ
  helmet(),
  cors(corsConfig),
  rateLimit(rateLimitConfig),
  
  // 解析
  express.json({ limit: '10mb' }),
  express.urlencoded({ extended: true }),
  
  // 認証
  session(sessionConfig),
  passport.initialize(),
  passport.session(),
  
  // ログ・監視
  morgan('combined'),
  requestLogging,
  metricsCollection,
  
  // ビジネスロジック
  requestValidation,
  authentication,
  authorization,
  
  // エラーハンドリング
  errorHandler,
  notFoundHandler
];
```

## Cardano統合アーキテクチャ

### トランザクション構築フロー

```
1. UTxO選択
   ├── コインコントロール（手動選択）
   ├── 自動選択（ADA-only優先）
   └── 最適化アルゴリズム

2. トランザクション構築
   ├── CSL (Cardano Serialization Library)
   ├── Fee計算
   ├── Change output生成
   └── TTL設定

3. 署名プロセス
   ├── CIP-30 ウォレット連携
   ├── Witness生成
   ├── 署名データ検証
   └── 完全なトランザクション組み立て

4. 送信・確認
   ├── Blockfrost API送信
   ├── ブロック確認監視
   ├── 状態更新
   └── 通知送信
```

### 金額計算ロジック

```typescript
// 金額モード別処理
interface AmountCalculator {
  calculateFixedAmount(params: FixedAmountParams): AmountResult;
  calculateSweepAmount(utxos: UTxO[]): AmountResult;
  calculateRateBasedAmount(params: RateBasedParams): AmountResult;
}

interface AmountResult {
  sendAmount: string; // lovelace
  feeAmount: string;  // lovelace
  changeAmount: string; // lovelace
  selectedUtxos: UTxO[];
  changeAddress: string;
}
```

## 監視・ログアーキテクチャ

### メトリクス収集

```typescript
// Prometheus メトリクス
interface ApplicationMetrics {
  // HTTP メトリクス
  http_requests_total: Counter;
  http_request_duration_seconds: Histogram;
  http_response_size_bytes: Histogram;
  
  // ビジネスメトリクス
  otc_requests_total: Counter;
  otc_transactions_total: Counter;
  otc_wallet_balance_ada: Gauge;
  otc_utxo_count: Gauge;
  
  // システムメトリクス
  nodejs_heap_size_used_bytes: Gauge;
  nodejs_heap_size_total_bytes: Gauge;
  database_connections_active: Gauge;
  redis_connected_clients: Gauge;
}
```

### ログ構造

```typescript
// 構造化ログ
interface LogEntry {
  timestamp: string;
  level: 'error' | 'warn' | 'info' | 'debug';
  message: string;
  service: string;
  requestId?: string;
  userId?: string;
  metadata?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

// セキュリティログ
interface SecurityLogEntry extends LogEntry {
  securityEvent: string;
  sourceIP: string;
  userAgent: string;
  action: string;
  resource: string;
  result: 'success' | 'failure' | 'blocked';
}
```

## 高可用性・災害復旧

### バックアップ戦略

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Daily Backup  │    │  Weekly Backup  │    │ Monthly Archive │
│                 │    │                 │    │                 │
│ • Database dump │    │ • Full system   │    │ • Long-term     │
│ • Config files  │    │ • Docker volumes│    │   storage       │
│ • SSL certs     │    │ • Log files     │    │ • Compliance    │
│                 │    │                 │    │   retention     │
│ Retention: 30d  │    │ Retention: 12w  │    │ Retention: 7y   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### 災害復旧手順

1. **データベース復旧**
   ```bash
   # 最新バックアップから復元
   gunzip -c backup.sql.gz | psql -d otc_system
   ```

2. **設定ファイル復旧**
   ```bash
   # SSL証明書復元
   cp backup/ssl/* ./ssl/
   
   # 環境変数復元
   cp backup/.env.production ./
   ```

3. **サービス復旧**
   ```bash
   # コンテナ再起動
   ./scripts/deploy.sh --domain your-domain.com
   ```

## パフォーマンス最適化

### データベース最適化

```sql
-- インデックス戦略
CREATE INDEX CONCURRENTLY idx_ada_requests_status_created 
ON ada_requests(status, created_at) 
WHERE status IN ('pending', 'signed');

-- パーティショニング（大規模データ用）
CREATE TABLE audit_logs_y2024m01 PARTITION OF audit_logs
FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
```

### キャッシュ戦略

```typescript
// Redis キャッシュ階層
interface CacheStrategy {
  // L1: アプリケーションメモリ（短期）
  applicationCache: Map<string, any>;
  
  // L2: Redis（中期）
  redisCache: {
    utxos: { ttl: 30 }; // 30秒
    rates: { ttl: 60 }; // 1分
    balances: { ttl: 60 }; // 1分
  };
  
  // L3: データベース（永続）
  database: PostgreSQL;
}
```

### CDN・静的ファイル最適化

```typescript
// Nginx設定によるキャッシュ
interface StaticFileOptimization {
  // JavaScript/CSS
  js_css: {
    expires: '1y';
    cache_control: 'public, immutable';
    compression: 'gzip, brotli';
  };
  
  // 画像ファイル
  images: {
    expires: '1y';
    cache_control: 'public, immutable';
    webp_conversion: true;
  };
  
  // HTML
  html: {
    expires: '1h';
    cache_control: 'public, must-revalidate';
  };
}
```

## 拡張性設計

### 水平スケーリング

```
┌─────────────────┐
│  Load Balancer  │
└─────────┬───────┘
          │
    ┌─────┴─────┐
    │           │
┌───▼───┐   ┌───▼───┐
│App #1 │   │App #2 │  ← アプリケーション
└───┬───┘   └───┬───┘     レプリカ
    │           │
    └─────┬─────┘
          │
  ┌───────▼───────┐
  │   Database    │     ← 共有データベース
  │   (Master)    │
  └───────────────┘
```

### マイクロサービス化準備

```typescript
// サービス分離の準備
interface MicroserviceArchitecture {
  // コア取引サービス
  tradingService: {
    responsibilities: ['request management', 'transaction processing'];
    database: 'trading_db';
    port: 4001;
  };
  
  // ウォレット統合サービス
  walletService: {
    responsibilities: ['wallet connection', 'utxo management'];
    database: 'wallet_db';
    port: 4002;
  };
  
  // 通知サービス
  notificationService: {
    responsibilities: ['alerts', 'email', 'webhooks'];
    database: 'notification_db';
    port: 4003;
  };
  
  // 監視サービス
  monitoringService: {
    responsibilities: ['metrics', 'logging', 'health checks'];
    database: 'monitoring_db';
    port: 4004;
  };
}
```

---

このアーキテクチャドキュメントは、Cardano OTC Trading Systemの技術的な設計・実装指針を提供します。システムの拡張や保守の際は、この設計原則に従って開発を進めてください。