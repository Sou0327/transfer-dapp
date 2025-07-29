// コンテキスト関連の型定義

import { ReactNode } from 'react'
import { 
  SupportedChain, 
  MultiChainToken, 
  EthereumNetworkInfo, 
  TronNetworkInfo 
} from './chain'
import { 
  TransactionRecord, 
  HistoryFilterOptions, 
  HistoryStats,
  ExportOptions,
  ExportResult
} from './history'
import { 
  MultiWalletState, 
  WalletConnectionResult, 
  NetworkSwitchResult,
  MetaMaskWalletState,
  TronLinkWalletState
} from './wallet'
import { 
  TransferRequest, 
  TransferResult, 
  TokenBalance, 
  PortfolioStats,
  TransferTrackingInfo,
  ChainManagerServiceInterface,
  TransferServiceInterface,
  BalanceManagerServiceInterface
} from './services'

// マルチウォレットコンテキスト
export interface MultiWalletContextType {
  // 状態
  state: MultiWalletState
  
  // MetaMask操作
  connectMetaMask: () => Promise<WalletConnectionResult>
  disconnectMetaMask: () => void
  switchEthereumNetwork: (chainId: number) => Promise<NetworkSwitchResult>
  
  // TronLink操作
  connectTronLink: () => Promise<WalletConnectionResult>
  disconnectTronLink: () => void
  switchTronNetwork: (network: 'mainnet' | 'shasta' | 'nile') => Promise<NetworkSwitchResult>
  
  // 統合操作
  connectWalletForChain: (chain: SupportedChain) => Promise<WalletConnectionResult>
  disconnectWallet: (walletType: 'metamask' | 'tronlink') => void
  autoConnect: () => Promise<void>
  
  // ステータス確認
  isWalletConnectedForChain: (chain: SupportedChain) => boolean
  getWalletForChain: (chain: SupportedChain) => MetaMaskWalletState | TronLinkWalletState | null
  
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
  
  // 個別ウォレット状態
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
}

// チェーンマネージャーコンテキスト
export interface ChainManagerContextType {
  // サービスインスタンス
  chainManager: ChainManagerServiceInterface
  
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
  switchToChain: (chain: SupportedChain) => Promise<boolean>
  
  // バリデーション
  validateTokenAddress: (address: string, chain: SupportedChain) => boolean
  getTokenInfo: (address: string, chain: SupportedChain) => Promise<MultiChainToken | null>
  
  // キャッシュ管理
  refreshTokenList: (chain: SupportedChain) => Promise<void>
  clearCache: () => void
}

// 送金コンテキスト
export interface TransferContextType {
  // サービスインスタンス
  transferService: TransferServiceInterface
  
  // 状態
  isExecuting: boolean
  error: string | null
  activeTransfers: TransferTrackingInfo[]
  
  // 送金操作
  executeTransfer: (request: TransferRequest) => Promise<TransferResult>
  estimateGas: (request: Omit<TransferRequest, 'gasSettings'>) => Promise<any>
  validateTransfer: (request: TransferRequest) => Promise<{ isValid: boolean; errors: string[] }>
  validateAddress: (address: string, chain: SupportedChain) => Promise<boolean>
  
  // 追跡管理
  trackTransfer: (txHash: string, chain: SupportedChain) => Promise<TransferTrackingInfo>
  cancelTracking: (trackingId: string) => void
  getTransferById: (id: string) => TransferTrackingInfo | null
  
  // ユーティリティ
  clearError: () => void
  refreshActiveTransfers: () => Promise<void>
  recheckPendingTransactions: () => Promise<void>
}

// 残高コンテキスト
export interface BalanceContextType {
  // サービスインスタンス
  balanceManager: BalanceManagerServiceInterface
  
  // データ
  balances: TokenBalance[]
  portfolioStats: PortfolioStats | null
  
  // 状態
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  lastUpdated: number | null
  
  // 残高操作
  refreshBalances: (chain?: SupportedChain) => Promise<void>
  refreshSingleBalance: (token: MultiChainToken, address: string) => Promise<void>
  getBalanceForToken: (token: MultiChainToken) => TokenBalance | null
  getBalancesForChain: (chain: SupportedChain) => TokenBalance[]
  
  // ポートフォリオ
  getTotalValueUSD: () => number
  refreshPortfolioStats: () => Promise<void>
  
  // 設定
  enableAutoRefresh: (enabled: boolean) => void
  setRefreshInterval: (intervalMs: number) => void
  
  // ユーティリティ
  hasPositiveBalance: (token: MultiChainToken) => boolean
  clearError: () => void
}

// 履歴コンテキスト
export interface HistoryContextType {
  // サービスインスタンス
  historyStorage: any // HistoryStorageServiceの型
  historyEncryption: any // HistoryEncryptionServiceの型
  
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
  searchTransactions: (query: string, searchFilters?: Partial<HistoryFilterOptions>) => Promise<{ transactions: TransactionRecord[]; totalCount: number; hasMore: boolean }>
  resetFilters: () => Promise<void>
  
  // トランザクション管理
  saveTransaction: (transaction: TransactionRecord) => Promise<boolean>
  updateTransaction: (id: string, updates: Partial<TransactionRecord>) => Promise<boolean>
  deleteTransaction: (id: string) => Promise<boolean>
  
  // エクスポート・インポート
  exportHistory: (options: ExportOptions) => Promise<ExportResult>
  exportFilteredHistory: (format: 'csv' | 'json') => Promise<ExportResult>
  importHistory: (data: string, format: 'json' | 'csv') => Promise<{ imported: number; errors: string[] }>
  
  // 履歴管理
  clearAllHistory: () => Promise<boolean>
  
  // データアクセス
  getTransactionsByChain: (chain: SupportedChain) => TransactionRecord[]
  getTransactionsByStatus: (status: 'pending' | 'confirming' | 'success' | 'failed') => TransactionRecord[]
  getRecentTransactions: (limit?: number) => TransactionRecord[]
  getFailedTransactions: () => TransactionRecord[]
  getPendingTransactions: () => TransactionRecord[]
  
  // ユーティリティ
  filterByCurrentUser: () => Promise<void>
  clearError: () => void
  refresh: () => Promise<void>
  setAutoRefreshEnabled: (enabled: boolean) => void
  setRefreshInterval: (intervalMs: number) => void
}

// プロバイダーコンポーネントのProps型
export interface MultiWalletProviderProps {
  children: ReactNode
}

export interface ChainManagerProviderProps {
  children: ReactNode
  config?: {
    defaultChain?: SupportedChain
    enableCustomTokens?: boolean
    enableFavorites?: boolean
  }
}

export interface TransferProviderProps {
  children: ReactNode
  config?: {
    confirmationRequirements?: {
      ethereum: number
      tron: number
    }
    timeoutMs?: number
    retryAttempts?: number
  }
}

export interface BalanceProviderProps {
  children: ReactNode
  config?: {
    refreshInterval?: number
    priceUpdateInterval?: number
    enableAutoRefresh?: boolean
    enablePriceTracking?: boolean
  }
}

export interface HistoryProviderProps {
  children: ReactNode
  config?: {
    encryptionEnabled?: boolean
    compressionEnabled?: boolean
    maxRecords?: number
    autoCleanup?: boolean
  }
}

// アプリケーション全体のコンテキスト統合型
export interface AppContextType {
  multiWallet: MultiWalletContextType
  chainManager: ChainManagerContextType
  transfer: TransferContextType
  balance: BalanceContextType
  history: HistoryContextType
}

// コンテキストプロバイダー設定
export interface ContextConfiguration {
  multiWallet: {
    autoConnect: boolean
    preferredChain: SupportedChain
    rememberLastWallet: boolean
  }
  chainManager: {
    defaultTokens: {
      ethereum: MultiChainToken[]
      tron: MultiChainToken[]
    }
    enableCustomTokens: boolean
    enableFavorites: boolean
  }
  transfer: {
    confirmationRequirements: {
      ethereum: number
      tron: number
    }
    timeoutMs: number
    retryAttempts: number
  }
  balance: {
    refreshInterval: number
    priceUpdateInterval: number
    enableAutoRefresh: boolean
    enablePriceTracking: boolean
  }
  history: {
    encryptionEnabled: boolean
    compressionEnabled: boolean
    maxRecords: number
    autoCleanup: boolean
  }
}