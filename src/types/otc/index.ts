// OTC Request Status Types
export enum RequestStatus {
  REQUESTED = "REQUESTED",
  SIGNED = "SIGNED", 
  SUBMITTING = "SUBMITTING",
  SUBMITTED = "SUBMITTED",
  CONFIRMED = "CONFIRMED",
  FAILED = "FAILED",
  EXPIRED = "EXPIRED",
}

// Amount Mode Types
export interface FixedAmount {
  amount: string; // lovelace
  
  // Additional properties for compatibility
  amount_lovelace?: string; // alias for amount
}

export interface SweepRule {
  ada_only: boolean;
  exclude_utxos?: string[]; // txHash#index format
  min_amount_lovelace?: string; // minimum amount to keep
}

export interface RateBasedRule {
  fiat_amount: number; // JPY
  rate_source: string;
  upper_limit_ada: string; // lovelace
  slippage_bps: number; // basis points (100 = 1%)
  
  // Alternative property names for compatibility
  rate_jpy_per_ada?: number; // rate in JPY per ADA
  jpy_amount?: number; // alias for fiat_amount
}

export type AmountOrRule = FixedAmount | SweepRule | RateBasedRule;

// Alias for backward compatibility
export type FixedAmountRule = FixedAmount;
export type ProtocolParameters = ProtocolParams;

// Transaction Build Result
export interface TransactionBuildResult {
  success: boolean;
  txHex?: string;
  txHash?: string;
  fee?: string;
  ttl?: number;
  witnesses_required?: string;
  summary?: {
    inputs: number;
    outputs: number;
    amount_sent: string;
    change_amount: string;
    total_fee: string;
    rate_used?: string; // for rate-based transactions
    jpy_amount?: string; // for rate-based transactions
  };
  error?: string;
}

// OTC Request Data Model
export interface OTCRequest {
  id: string;
  currency: "ADA";
  amount_mode: "fixed" | "sweep" | "rate_based";
  amount_or_rule_json: AmountOrRule;
  recipient: string; // bech32 address
  ttl_slot: number;
  status: RequestStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  
  // Additional properties for compatibility
  ttl_absolute?: Date;
  destination_address?: string; // alias for recipient
  amount_rule?: AmountOrRule; // alias for amount_or_rule_json
}

// Pre-signed Data Model
export interface PreSignedData {
  id: string;
  request_id: string;
  provider_id: string; // wallet provider name
  tx_body_cbor: string;
  witness_cbor: string;
  selected_utxos: UTxO[];
  signed_at: Date;
}

// Transaction Data Model
export interface TransactionData {
  id: string;
  request_id: string;
  tx_hash: string;
  submitted_at: Date;
  confirmed_at?: Date;
  status: "SUBMITTED" | "CONFIRMED" | "FAILED";
  fail_reason?: string;
}

// CIP-30 Provider Types
export interface CIP30Provider {
  id: string; // 'nami' | 'eternl' | 'flint' | 'typhon' | 'lace' | 'yoroi' | 'nufi' | 'gero'
  name: string;
  icon: string;
  isEnabled: boolean;
  apiVersion: string;
}

export interface CIP30Api {
  getNetworkId(): Promise<number>;
  getUtxos(amount?: string, paginate?: Paginate): Promise<string[]>;
  getBalance(): Promise<string>;
  getUsedAddresses(): Promise<string[]>;
  getUnusedAddresses(): Promise<string[]>;
  getChangeAddress(): Promise<string>;
  getRewardAddresses(): Promise<string[]>;
  signTx(tx: string, partialSign?: boolean): Promise<string>;
  signData(addr: string, payload: string): Promise<DataSignature>;
  submitTx(tx: string): Promise<string>;
}

export interface Paginate {
  page: number;
  limit: number;
}

export interface DataSignature {
  signature: string;
  key: string;
}

// UTxO Model (extends existing)
export interface UTxO {
  txHash: string;
  outputIndex: number;
  address: string;
  amount: {
    coin: string; // lovelace
    multiasset?: {
      [policyId: string]: {
        [assetName: string]: string;
      };
    };
  };
  
  // Additional properties for compatibility
  assets?: Array<{ // Native tokens in UTxO
    unit: string; // policyId + assetName (hex)
    quantity: string;
    policy_id?: string;
    asset_name?: string;
    policyId?: string; // alternate name
  }>;
  
  // For transaction output compatibility
  data_hash?: string;
  datum_hash?: string; // alias for data_hash
}

// Transaction Output interface for CSL compatibility
export interface TransactionOutput {
  address: string;
  amount: {
    coin: string;
    multiasset?: {
      [policyId: string]: {
        [assetName: string]: string;
      };
    };
  };
  data_hash?: string;
  datum_hash?: string; // alias for data_hash
}

// Transaction Input interface for CSL compatibility  
export interface TransactionInput {
  transaction_id: string;
  index: number;
  address?: string; // for compatibility
}

// Protocol Parameters
export interface ProtocolParams {
  minFeeA: number;
  minFeeB: number;
  maxTxSize: number;
  utxoCostPerWord: number;
  minUtxo: string;
  poolDeposit: string;
  keyDeposit: string;
  coinsPerUtxoByte: string;
  currentSlot: number;
}

// API Request/Response Types
export interface CreateRequestRequest {
  currency: "ADA";
  amount_mode: "fixed" | "sweep" | "rate_based";
  amount_or_rule: AmountOrRule;
  recipient: string;
  ttl_minutes: number; // 5-15 minutes
}

export interface CreateRequestResponse {
  requestId: string;
  signUrl: string;
  qrData: string;
  status: "REQUESTED";
}

export interface CreatePreSignedRequest {
  requestId: string;
  provider_id: string;
  txBodyCbor: string;
  witnessCbor: string;
  selectedUtxos: UTxO[];
  ttl_slot: number;
}

export interface SubmitTransactionRequest {
  requestId: string;
  method: "server" | "wallet";
}

export interface SubmitTransactionResponse {
  txHash?: string;
  status: "SUBMITTED" | "FAILED";
  error?: string;
}

// Rate API Types
export interface RateResponse {
  source: string;
  rate: number; // JPY per ADA
  timestamp: string;
  ttl: number; // seconds
}

// Admin Authentication Types
export interface LoginCredentials {
  email: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AdminSession {
  adminId: string;
  email: string;
  loginTime: Date;
  ipAddress?: string;
  userAgent?: string;
}

// WebSocket Event Types
export interface StatusChangeEvent {
  requestId: string;
  status: RequestStatus;
  timestamp: string;
  data?: Record<string, unknown>;
}

export interface CountdownEvent {
  requestId: string;
  remainingSeconds: number;
  timestamp: string;
}

// Monitoring Types
export interface MonitoringData {
  requestId: string;
  utxos: UTxO[];
  lastCheck: number;
  isActive: boolean;
  interval?: NodeJS.Timeout;
}

// Security and Audit Types
export enum AuditEventType {
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  REQUEST_CREATED = 'REQUEST_CREATED',
  TRANSACTION_SIGNED = 'TRANSACTION_SIGNED',
  TRANSACTION_SUBMITTED = 'TRANSACTION_SUBMITTED',
  TRANSACTION_CONFIRMED = 'TRANSACTION_CONFIRMED',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  WALLET_CONNECTED = 'WALLET_CONNECTED',
  WALLET_DISCONNECTED = 'WALLET_DISCONNECTED',
  RATE_FETCHED = 'RATE_FETCHED',
  SECURITY_VIOLATION = 'SECURITY_VIOLATION',
  ADMIN_ACTION = 'ADMIN_ACTION'
}

export enum AuditSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export interface AuditEvent {
  id: string;
  type: AuditEventType;
  severity: AuditSeverity;
  description: string;
  timestamp: Date;
  userId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

// Error Types
export class NetworkMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkMismatchError';
  }
}

export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class SubmissionError extends Error {
  constructor(message: string, public originalError?: Error) {
    super(message);
    this.name = 'SubmissionError';
  }
}

export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// Cardano Serialization Library (CSL) types
export interface CSLModule {
  TransactionBuilder: unknown;
  TransactionBodyBuilder: unknown;
  TransactionOutput: unknown;
  TransactionInput: unknown;
  Address: unknown;
  Value: unknown;
  BigNum: unknown;
  LinearFee: unknown;
  MetadataJsonSchema?: unknown;
}

// Wallet State Types
export interface WalletState {
  isConnected: boolean;
  selectedWallet: string | null;
  address: string | null;
  balance: string | null;
  utxos: UTxO[] | null;
  loading: boolean;
  error: string | null;
}

// Wallet connection types
export interface UseWalletReturn extends WalletState {
  connect: (walletName: string) => Promise<void>;
  disconnect: () => void;
  signTransaction: (tx: string) => Promise<string>;
  getUtxos: () => Promise<UTxO[]>;
  getBalance: () => Promise<string>;
}

// WebSocket State Types
export interface WebSocketState {
  isConnected: boolean;
  lastMessage: unknown;
  error: string | null;
}

// WebSocket connection types
export interface UseWebSocketReturn extends WebSocketState {
  sendMessage: (message: unknown) => void;
  connect: () => void;
  disconnect: () => void;
}

// Countdown Badge Props
export interface CountdownBadgeProps {
  targetTime?: Date;
  remainingSeconds?: number;
  onExpire: () => void;
}

// Wallet Select Modal Props
export interface WalletSelectModalProps {
  wallets: CIP30Provider[];
  onSelectWallet: (walletName: string) => Promise<void>;
  onClose: () => void;
}

// Virtual List and Table types
export interface VirtualListItem {
  id: string;
  data: Record<string, unknown>;
}

export interface VirtualUTxO extends UTxO {
  virtualIndex?: number;
  isVisible?: boolean;
  renderOffset?: number;
}

export interface VirtualizedTableColumn<T> {
  header: string;
  accessor: keyof T | ((item: T) => unknown);
  width?: number;
  sortable?: boolean;
}

// TxBuilder Config
export interface TxBuilderConfig {
  protocolParams: ProtocolParams;
  api: CIP30Api;
  changeAddress: string;
  destinationAddress: string;
  ttlOffset: number;
}

// Global Window Extensions for CIP-30
declare global {
  interface Window {
    cardano?: {
      [key: string]: {
        enable(): Promise<CIP30Api>;
        isEnabled(): Promise<boolean>;
        apiVersion: string;
        name: string;
        icon: string;
      };
    };
  }
}