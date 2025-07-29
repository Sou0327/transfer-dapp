import { ethers } from 'ethers'

// マルチチェーン対応型定義をエクスポート
export * from './chain'
export * from './wallet'
export * from './history'
export * from './services'
export * from './components'
export * from './hooks'
export * from './contexts'
export * from './utilities'
export * from './constants'

// 既存のウォレット関連型定義（後方互換性のため保持）
export interface WalletState {
  account: string | null
  chainId: number | null
  provider: ethers.BrowserProvider | null
  isConnecting: boolean
  error: string | null
}

export interface WalletContextType {
  state: WalletState
  connect: () => Promise<void>
  disconnect: () => void
  switchNetwork: (chainId: number) => Promise<void>
}

// 既存のERC-20トークン型定義（後方互換性のため保持）
export interface ERC20Token {
  address: string
  name: string
  symbol: string
  decimals: number
}

// 拡張されたトークン情報（事前定義されたトークン用）
export interface TokenInfo {
  address: string
  name: string
  symbol: string
  decimals: number
  logo?: string
  description?: string
  warnings?: string[]
  nonStandard?: boolean
}

// 動的に取得されるトークン情報
export interface DynamicTokenInfo {
  address: string
  name?: string
  symbol?: string
  decimals?: number
  isValid: boolean
  error?: string
}

export interface TokenBalance {
  balance: string
  formatted: string
  lastUpdated: number
}

// トランザクション関連の型定義
export interface TransactionState {
  hash?: string
  status: 'idle' | 'pending' | 'success' | 'failed'
  error?: string
  receipt?: ethers.TransactionReceipt
}

// トースト通知の型定義
export interface Toast {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message: string
  duration?: number
}

export interface ToastContextType {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
  clearToasts: () => void
}

// テーマ関連の型定義
export interface ThemeContextType {
  isDark: boolean
  toggleTheme: () => void
}

// コンポーネントProps型定義
export interface ConnectButtonProps {
  className?: string
}

export interface BalanceCardProps {
  tokenAddress: string
  className?: string
}

export interface TransferFormProps {
  onTransferSuccess: () => void
  className?: string
}

export interface TxToastProps {
  toasts: Toast[]
  onDismiss: (id: string) => void
}

export interface NetworkSwitcherProps {
  className?: string
}

export interface ThemeToggleProps {
  className?: string
}

// エラー関連の型定義
export type ErrorType = 
  | 'METAMASK_NOT_INSTALLED'
  | 'CONNECTION_REJECTED'
  | 'NETWORK_NOT_SUPPORTED'
  | 'INSUFFICIENT_FUNDS'
  | 'INVALID_ADDRESS'
  | 'INVALID_AMOUNT'
  | 'TRANSACTION_REJECTED'
  | 'USER_REJECTED'
  | 'NETWORK_ERROR'
  | 'NON_STANDARD_TOKEN'
  | 'UNKNOWN_ERROR'

export interface TransferError {
  type: ErrorType
  message: string
  details?: unknown
}

// フォーム関連の型定義
export interface TransferFormData {
  to: string
  amount: string
}

// ネットワーク設定の型定義
export interface NetworkConfig {
  chainId: number
  name: string
  symbol: string
  rpcUrl?: string
  blockExplorerUrl?: string
}

// MetaMask関連の型定義 - wallet.tsのExtendedMetaMaskProviderに統一
export type MetaMaskProvider = import('./wallet').ExtendedMetaMaskProvider

// ユーティリティ型
export type Awaitable<T> = T | Promise<T>

// 環境変数の型定義
export interface AppConfig {
  tokenAddress: string
  chainId: number
  networkName: string
  rpcUrl?: string
  appName: string
  appVersion: string
}

// バリデーション結果の型定義
export interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
}

// 非標準ERC-20トークン対応の型定義
export interface TokenCompatibilityCheck {
  supportsTransferReturn: boolean
  emitsTransferEvent: boolean
  balanceConsistent: boolean
  warnings: string[]
  requiresForceMode?: boolean
  customVerificationNeeded?: boolean
}

// 強制送金モード関連の型定義
export interface ForceTransferOptions {
  enabled: boolean
  ignoreReturnValue: boolean
  ignoreBalanceVerification: boolean
  userConfirmed: boolean
}

export interface TransferResult {
  txHash: string
  success: boolean
  receipt: ethers.TransactionReceipt | null
  compatibility: TokenCompatibilityCheck
  verification: {
    eventEmitted: boolean
    balanceChanged: boolean
    returnValue?: boolean
    gasUsed: bigint
    warnings: string[]
  }
  forceMode?: boolean
}

declare global {
  interface Window {
    ethereum?: import('./wallet').ExtendedMetaMaskProvider
    web3?: {
      currentProvider?: import('./wallet').ExtendedMetaMaskProvider
    }
  }
}