// Cardano専用型定義をエクスポート
export * from './cardano'

// 基本的なUI関連型定義
export interface Toast {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message: string
  duration?: number
}

// コンポーネントProps型定義
export interface TransferFormProps {
  onTransferComplete: (txHash: string) => void
  onTransferError: (error: string) => void
  className?: string
}

// エラー関連の型定義
export type CardanoErrorType = 
  | 'WALLET_NOT_INSTALLED'
  | 'CONNECTION_REJECTED'
  | 'NETWORK_NOT_SUPPORTED'
  | 'INSUFFICIENT_FUNDS'
  | 'INVALID_ADDRESS'
  | 'INVALID_AMOUNT'
  | 'TRANSACTION_REJECTED'
  | 'USER_REJECTED'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR'

export interface TransferError {
  type: CardanoErrorType
  message: string
  details?: unknown
}

// フォーム関連の型定義
export interface TransferFormData {
  to: string
  amount: string
  sweepMode: boolean
}

// ネットワーク設定の型定義
export interface CardanoNetworkConfig {
  networkId: number
  name: string
  protocolMagic: number
}

// ユーティリティ型
export type Awaitable<T> = T | Promise<T>

// アプリ設定の型定義
export interface AppConfig {
  networkId: number
  networkName: string
  appName: string
  appVersion: string
}

// バリデーション結果の型定義
export interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
}

// 送金結果の型定義
export interface CardanoTransferResult {
  txHash: string
  success: boolean
  sweepMode: boolean
  amount: string
  fee: string
  utxosUsed: number
}