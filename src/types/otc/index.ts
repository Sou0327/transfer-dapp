// OTC Request Status Types
export enum RequestStatus {
  REQUESTED = "REQUESTED",
  SIGNED = "SIGNED", 
  SUBMITTED = "SUBMITTED",
  CONFIRMED = "CONFIRMED",
  FAILED = "FAILED",
  EXPIRED = "EXPIRED",
}

// Amount Mode Types
export interface FixedAmount {
  amount: string; // lovelace
}

export interface SweepRule {
  ada_only: boolean;
  exclude_utxos?: string[]; // txHash#index format
}

export interface RateBasedRule {
  fiat_amount: number; // JPY
  rate_source: string;
  upper_limit_ada: string; // lovelace
  slippage_bps: number; // basis points (100 = 1%)
}

export type AmountOrRule = FixedAmount | SweepRule | RateBasedRule;

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
  created_at: Date;
  updated_at: Date;
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
  data?: any;
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