// Cardano and CIP-30 type definitions

/**
 * CIP-30 Wallet API interface
 */
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

/**
 * Supported Cardano Wallets
 */
export type WalletName = 
  | 'yoroi' 
  | 'tokeo' 
  | 'eternl' 
  | 'nami' 
  | 'typhon' 
  | 'flint' 
  | 'lace' 
  | 'daedalus' 
  | 'nufi' 
  | 'gero';

export interface WalletInfo {
  name: WalletName;
  displayName: string;
  icon: string;
  apiKey: string; // Key in window.cardano object
  downloadUrl: string;
  description: string;
}

export interface WalletInterface {
  enable(): Promise<CIP30Api>;
  isEnabled(): Promise<boolean>;
  apiVersion: string;
  name: string;
  icon: string;
}

/**
 * Cardano wallet interface (window.cardano)
 */
export interface CardanoWallet {
  yoroi?: WalletInterface;
  tokeo?: WalletInterface;
  eternl?: WalletInterface;
  nami?: WalletInterface;
  typhon?: WalletInterface;
  flint?: WalletInterface;
  lace?: WalletInterface;
  daedalus?: WalletInterface;
  nufi?: WalletInterface;
  gero?: WalletInterface;
}

declare global {
  interface Window {
    cardano?: CardanoWallet;
  }
}

/**
 * UTxO data structures
 */
export interface UTxO {
  txHash: string;
  outputIndex: number;
  address: string;
  amount: {
    coin: string; // lovelace amount as string
    multiasset?: MultiAsset;
  };
  dataHash?: string;
  scriptRef?: string;
}

export interface MultiAsset {
  [policyId: string]: {
    [assetName: string]: string;
  };
}

export interface AssetBalance {
  policyId: string;
  assetName: string;
  quantity: string;
  fingerprint?: string;
}

/**
 * Pre-signed transaction data structures
 */
export interface PreSignedTransaction {
  id: string;
  owner: string;
  txBodyCbor: string;
  witnessCbor: string;
  selectedUtxos: UTxO[];
  ttlSlot: number;
  status: TransactionStatus;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  submittedAt?: Date;
  confirmedAt?: Date;
  txHash?: string;
}

export enum TransactionStatus {
  REQUESTED = "REQUESTED",
  SIGNED = "SIGNED",
  SUBMITTED = "SUBMITTED",
  CONFIRMED = "CONFIRMED",
  EXPIRED = "EXPIRED",
  FAILED = "FAILED",
}

/**
 * Protocol parameters
 */
export interface ProtocolParams {
  minFeeA: number;
  minFeeB: number;
  maxTxSize: number;
  utxoCostPerWord: number;
  minUtxo: string;
  poolDeposit: string;
  keyDeposit: string;
  maxValSize: number;
  maxTxExMem: string;
  maxTxExSteps: string;
  coinsPerUtxoWord: string;
  collateralPercentage: number;
  maxCollateralInputs: number;
  currentSlot: number;
}

/**
 * API request/response types
 */
export interface CreatePreSignedRequest {
  txBodyCbor: string;
  witnessCbor: string;
  selectedUtxos: UTxO[];
  ttlSlot: number;
  metadata?: Record<string, any>;
}

export interface PreSignedTransactionResponse {
  id: string;
  owner: string;
  txBodyCbor: string;
  witnessCbor: string;
  selectedUtxos: UTxO[];
  ttlSlot: number;
  status: TransactionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SubmitTransactionRequest {
  submissionMethod: "wallet" | "backend";
}

export interface UTxOResponse {
  utxos: UTxO[];
  totalAda: string;
  totalAssets: AssetBalance[];
}

export interface MonitorUTxOsRequest {
  utxos: string[]; // UTxO references (txHash#index)
  webhookUrl?: string;
}

export interface HealthCheckResponse {
  status: "healthy" | "degraded" | "unhealthy";
  cardanoNode: boolean;
  database: boolean;
  blockfrost: boolean;
  timestamp: string;
}

/**
 * Error types
 */
export enum WalletError {
  NOT_INSTALLED = "WALLET_NOT_INSTALLED",
  NOT_ENABLED = "WALLET_NOT_ENABLED",
  NETWORK_MISMATCH = "NETWORK_MISMATCH",
  USER_REJECTED = "USER_REJECTED",
}

export enum TransactionError {
  INSUFFICIENT_FUNDS = "INSUFFICIENT_FUNDS",
  UTXO_CONSUMED = "UTXO_CONSUMED",
  TTL_EXPIRED = "TTL_EXPIRED",
  INVALID_SIGNATURE = "INVALID_SIGNATURE",
  SUBMISSION_FAILED = "SUBMISSION_FAILED",
}

/**
 * CSL-related types
 */
export interface TransactionBuilderConfig {
  feeAlgo: {
    minFeeA: number;
    minFeeB: number;
  };
  minUtxo: string;
  poolDeposit: string;
  keyDeposit: string;
  maxTxSize: number;
  maxValueSize: number;
}

export interface BuildTransactionParams {
  selectedUtxos: UTxO[];
  outputs: TransactionOutput[];
  changeAddress: string;
  ttl?: number;
  metadata?: any;
}

export interface TransactionOutput {
  address: string;
  amount: string; // lovelace
  assets?: MultiAsset;
}