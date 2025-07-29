// カスタムフック関連の型定義

import { 
  SupportedChain, 
  MultiChainToken, 
  EthereumNetworkInfo, 
  TronNetworkInfo,
  EthereumFeeEstimate,
  TronFeeEstimate
} from './chain'
import { 
  TransactionRecord, 
  TransactionStatus, 
  HistoryFilterOptions,
  HistoryStats,
  ExportOptions,
  ExportResult
} from './history'
import { 
  MetaMaskWalletState, 
  TronLinkWalletState, 
  WalletConnectionResult,
  NetworkSwitchResult,
  WalletError
} from './wallet'
import { 
  TransferRequest, 
  TransferResult, 
  TokenBalance, 
  PortfolioStats,
  TransferTrackingInfo
} from './services'

// useMultiWallet フックの戻り値型
export interface UseMultiWalletReturn {
  // MetaMask関連
  metamask: {
    isConnected: boolean
    account: string | null
    chainId: number | null
    currentNetwork: EthereumNetworkInfo | null
    isConnecting: boolean
    error: string | null
    walletStatus: {
      canTransact: boolean
      needsNetworkSwitch: boolean
      isLocked: boolean
    }
  }
  
  // TronLink関連
  tronlink: {
    isConnected: boolean
    account: string | null
    network: 'mainnet' | 'shasta' | 'nile' | null
    currentNetwork: TronNetworkInfo | null
    isConnecting: boolean
    error: string | null
    walletStatus: {
      canTransact: boolean
      needsNetworkSwitch: boolean
      isReady: boolean
    }
  }
  
  // 統合状態
  multiWalletStatus: {
    hasConnectedWallet: boolean
    hasMultipleConnections: boolean
    preferredChain: SupportedChain | null
    readyForTransactions: boolean
  }
  
  // 接続状態マップ
  connectionStatus: {
    ethereum: {
      isConnected: boolean
      canTransact: boolean
      account: string | null
    }
    tron: {
      isConnected: boolean
      canTransact: boolean
      account: string | null
    }
  }
  
  // アクション
  connectToChain: (chain: SupportedChain) => Promise<boolean>
  disconnectWallet: (walletType: 'metamask' | 'tronlink') => void
  switchNetwork: (chain: SupportedChain, networkId?: string | number) => Promise<boolean>
  autoConnect: () => Promise<void>
  isWalletConnectedForChain: (chain: SupportedChain) => boolean
  getWalletForChain: (chain: SupportedChain) => MetaMaskWalletState | TronLinkWalletState | null
}

// useMetaMask フックの戻り値型
export interface UseMetaMaskReturn {
  // 状態
  isConnected: boolean
  account: string | null
  chainId: number | null
  currentNetwork: EthereumNetworkInfo | null
  isConnecting: boolean
  error: string | null
  
  // アクション
  connect: () => Promise<WalletConnectionResult>
  disconnect: () => void
  switchNetwork: (chainId: number) => Promise<NetworkSwitchResult>
  
  // ユーティリティ
  canTransact: boolean
  needsNetworkSwitch: boolean
  getSigner: () => Promise<any>
  getProvider: () => any
}

// useTronLink フックの戻り値型
export interface UseTronLinkReturn {
  // 状態
  isConnected: boolean
  account: string | null
  network: 'mainnet' | 'shasta' | 'nile' | null
  currentNetwork: TronNetworkInfo | null
  isConnecting: boolean
  error: string | null
  
  // アクション
  connect: () => Promise<WalletConnectionResult>
  disconnect: () => void
  switchNetwork: (network: 'mainnet' | 'shasta' | 'nile') => Promise<NetworkSwitchResult>
  
  // ユーティリティ
  canTransact: boolean
  isReady: boolean
  getTronWeb: () => any
  signTransaction: (transaction: any) => Promise<any>
}

// useChainManager フックの戻り値型
export interface UseChainManagerReturn {
  // 状態
  currentChain: SupportedChain
  supportedChains: SupportedChain[]
  isLoading: boolean
  error: string | null
  
  // トークン管理
  getTokensForChain: (chain: SupportedChain) => MultiChainToken[]
  addCustomToken: (chain: SupportedChain, token: MultiChainToken) => Promise<void>
  removeCustomToken: (chain: SupportedChain, tokenAddress: string) => Promise<void>
  
  // お気に入り管理
  getFavoriteTokens: (chain: SupportedChain) => MultiChainToken[]
  addFavoriteToken: (chain: SupportedChain, token: MultiChainToken) => Promise<void>
  removeFavoriteToken: (chain: SupportedChain, token: MultiChainToken) => Promise<void>
  isFavoriteToken: (token: MultiChainToken) => boolean
  
  // チェーン操作
  setCurrentChain: (chain: SupportedChain) => void
  validateTokenAddress: (address: string, chain: SupportedChain) => boolean
  getTokenInfo: (address: string, chain: SupportedChain) => Promise<MultiChainToken | null>
}

// useTransferHook フックの戻り値型
export interface UseTransferReturn {
  // 状態
  isExecuting: boolean
  error: string | null
  activeTransfers: TransferTrackingInfo[]
  
  // アクション
  executeTransfer: (request: TransferRequest) => Promise<TransferResult>
  estimateGas: (request: Omit<TransferRequest, 'gasSettings'>) => Promise<EthereumFeeEstimate | TronFeeEstimate>
  validateTransfer: (request: TransferRequest) => Promise<{ isValid: boolean; errors: string[] }>
  validateAddress: (address: string, chain: SupportedChain) => Promise<boolean>
  
  // 追跡
  trackTransfer: (txHash: string, chain: SupportedChain) => Promise<TransferTrackingInfo>
  cancelTracking: (trackingId: string) => void
  
  // ユーティリティ
  getTransferById: (id: string) => TransferTrackingInfo | null
  clearError: () => void
}

// useBalanceHook フックの戻り値型
export interface UseBalanceReturn {
  // 状態
  balances: TokenBalance[]
  portfolioStats: PortfolioStats | null
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  lastUpdated: number | null
  
  // アクション
  refreshBalances: (chain?: SupportedChain) => Promise<void>
  refreshSingleBalance: (token: MultiChainToken, address: string) => Promise<void>
  
  // データアクセス
  getBalanceForToken: (token: MultiChainToken) => TokenBalance | null
  getBalancesForChain: (chain: SupportedChain) => TokenBalance[]
  getTotalValueUSD: () => number
  
  // 設定
  enableAutoRefresh: (enabled: boolean) => void
  setRefreshInterval: (intervalMs: number) => void
  
  // ユーティリティ
  hasPositiveBalance: (token: MultiChainToken) => boolean
  clearError: () => void
}

// useHistory フックの戻り値型
export interface UseHistoryReturn {
  // データ
  transactions: TransactionRecord[]
  stats: HistoryStats | null
  totalCount: number
  hasMore: boolean
  
  // 状態
  isLoading: boolean
  error: string | null
  filters: HistoryFilterOptions
  
  // 基本操作
  loadTransactions: (options?: Partial<HistoryFilterOptions>, append?: boolean) => Promise<void>
  loadStats: (filterOptions?: Partial<HistoryFilterOptions>) => Promise<void>
  loadNextPage: () => Promise<void>
  
  // フィルタリング・検索
  updateFilters: (newFilters: Partial<HistoryFilterOptions>) => Promise<void>
  searchHistory: (query: string) => Promise<{ transactions: TransactionRecord[]; totalCount: number }>
  resetFilters: () => Promise<void>
  
  // トランザクション管理
  saveTransaction: (transaction: TransactionRecord) => Promise<boolean>
  updateTransaction: (id: string, updates: Partial<TransactionRecord>) => Promise<boolean>
  deleteTransaction: (id: string) => Promise<boolean>
  
  // エクスポート・インポート
  exportHistory: (options: ExportOptions) => Promise<ExportResult>
  exportFilteredHistory: (format: 'csv' | 'json') => Promise<ExportResult>
  importHistory: (data: string, format: 'json' | 'csv') => Promise<{ imported: number; errors: string[] }>
  
  // データアクセス
  getTransactionsByChain: (chain: SupportedChain) => TransactionRecord[]
  getTransactionsByStatus: (status: TransactionStatus) => TransactionRecord[]
  getRecentTransactions: (limit?: number) => TransactionRecord[]
  getPendingTransactions: () => TransactionRecord[]
  getFailedTransactions: () => TransactionRecord[]
  
  // ユーティリティ
  refresh: () => Promise<void>
  clearAllHistory: () => Promise<boolean>
  setAutoRefreshEnabled: (enabled: boolean) => void
  setRefreshInterval: (intervalMs: number) => void
  clearError: () => void
}

// useToast フックの戻り値型（再定義）
export interface UseToastReturn {
  toasts: Array<{
    id: string
    type: 'success' | 'error' | 'warning' | 'info'
    title: string
    message: string
    duration?: number
  }>
  success: (title: string, message?: string) => void
  error: (title: string, message?: string) => void
  warning: (title: string, message?: string) => void
  info: (title: string, message?: string) => void
  remove: (id: string) => void
  clear: () => void
}

// useTheme フックの戻り値型（再定義）
export interface UseThemeReturn {
  isDark: boolean
  theme: 'light' | 'dark'
  toggleTheme: () => void
  setTheme: (theme: 'light' | 'dark') => void
}

// useLocalStorage フックの戻り値型
export interface UseLocalStorageReturn<T> {
  value: T
  setValue: (value: T | ((prev: T) => T)) => void
  removeValue: () => void
  isLoading: boolean
  error: string | null
}

// useDebounce フックの戻り値型
export interface UseDebounceReturn<T> {
  debouncedValue: T
  isDebouncing: boolean
}

// useNetwork フックの戻り値型
export interface UseNetworkReturn {
  isOnline: boolean
  downlink?: number
  effectiveType?: string
  rtt?: number
  saveData?: boolean
}

// useInterval フックの戻り値型
export interface UseIntervalReturn {
  start: () => void
  stop: () => void
  reset: () => void
  isRunning: boolean
}

// usePrevious フックの戻り値型
export type UsePreviousReturn<T> = T | undefined

// useToggle フックの戻り値型
export interface UseToggleReturn {
  value: boolean
  toggle: () => void
  setTrue: () => void
  setFalse: () => void
  setValue: (value: boolean) => void
}

// useCounter フックの戻り値型
export interface UseCounterReturn {
  count: number
  increment: (step?: number) => void
  decrement: (step?: number) => void
  reset: () => void
  set: (value: number) => void
}

// useClipboard フックの戻り値型
export interface UseClipboardReturn {
  copy: (text: string) => Promise<boolean>
  copied: boolean
  error: string | null
}

// useMediaQuery フックの戻り値型
export type UseMediaQueryReturn = boolean

// useClickOutside フックのオプション型
export interface UseClickOutsideOptions {
  enabled?: boolean
  ignoredElements?: HTMLElement[]
}

// useKeyPress フックのオプション型
export interface UseKeyPressOptions {
  target?: EventTarget
  eventType?: 'keydown' | 'keyup'
  preventDefault?: boolean
  stopPropagation?: boolean
}

// useAsyncEffect フックの型
export type UseAsyncEffectCallback = () => Promise<void | (() => void)>
export type UseAsyncEffectDeps = React.DependencyList

// useForm フックの戻り値型
export interface UseFormReturn<T> {
  values: T
  errors: Partial<Record<keyof T, string>>
  touched: Partial<Record<keyof T, boolean>>
  isValid: boolean
  isSubmitting: boolean
  handleChange: (field: keyof T) => (value: any) => void
  handleBlur: (field: keyof T) => () => void
  handleSubmit: (onSubmit: (values: T) => Promise<void> | void) => (e?: React.FormEvent) => void
  setFieldValue: (field: keyof T, value: any) => void
  setFieldError: (field: keyof T, error: string) => void
  resetForm: () => void
  validate: () => Promise<boolean>
}

// useValidation フックの戻り値型
export interface UseValidationReturn<T> {
  errors: Partial<Record<keyof T, string>>
  isValid: boolean
  validate: (values: T) => Promise<boolean>
  validateField: (field: keyof T, value: any) => Promise<string | null>
  clearErrors: () => void
  setError: (field: keyof T, error: string) => void
}