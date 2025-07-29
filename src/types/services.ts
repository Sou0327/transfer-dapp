// サービス関連の型定義

import { SupportedChain, MultiChainToken, EthereumFeeEstimate, TronFeeEstimate } from './chain'
import { TransactionRecord, TransactionStatus } from './history'

// ガス設定
export interface GasSettings {
  priority: 'slow' | 'medium' | 'fast'
  customGasPrice?: string
  customGasLimit?: string
}

// 送金リクエスト
export interface TransferRequest {
  chain: SupportedChain
  token: MultiChainToken
  to: string
  amount: string
  gasSettings?: GasSettings
  metadata?: {
    notes?: string
    timestamp: number
    tags?: string[]
  }
}

// 送金結果
export interface TransferResult {
  success: boolean
  txHash?: string
  error?: string
  receipt?: any
  gasUsed?: string
  effectiveGasPrice?: string
}

// トークン残高
export interface TokenBalance {
  chain: SupportedChain
  token: MultiChainToken
  balance: string
  balanceFormatted: string
  usdValue?: number
  lastUpdated: number
  error?: string
}

// ポートフォリオ統計
export interface PortfolioStats {
  totalValueUSD: number
  totalTokens: number
  totalChains: number
  topTokenByValue?: {
    token: MultiChainToken
    value: number
    percentage: number
  }
  chainDistribution: {
    chain: SupportedChain
    valueUSD: number
    percentage: number
    tokenCount: number
  }[]
  last24hChange?: {
    value: number
    percentage: number
    direction: 'up' | 'down' | 'neutral'
  }
}

// 送金追跡情報
export interface TransferTrackingInfo {
  id: string
  chain: SupportedChain
  txHash: string
  status: TransactionStatus
  startTime: number
  confirmations: number
  requiredConfirmations: number
  estimatedCompletion?: number
  onUpdate?: (info: TransferTrackingInfo) => void
  onComplete?: (record: TransactionRecord) => void
  onError?: (error: string) => void
}

// バランスマネージャー設定
export interface BalanceManagerConfig {
  refreshInterval: number
  priceUpdateInterval: number
  cacheTimeout: number
  enablePriceTracking: boolean
  enableNotifications: boolean
}

// チェーンマネージャー設定
export interface ChainManagerConfig {
  defaultTokens: {
    ethereum: MultiChainToken[]
    tron: MultiChainToken[]
  }
  priceApiUrl: string
  cacheTimeout: number
  enableCustomTokens: boolean
  enableFavorites: boolean
}

// 送金サービス設定
export interface TransferServiceConfig {
  confirmationRequirements: {
    ethereum: number
    tron: number
  }
  gasSettings: {
    ethereum: {
      slow: number
      medium: number
      fast: number
    }
    tron: {
      energyLimit: number
      feeLimit: number
    }
  }
  timeoutMs: number
  retryAttempts: number
}

// サービスの基底インターフェース
export interface BaseService {
  isInitialized: boolean
  initialize(): Promise<void>
  cleanup(): Promise<void>
}

// チェーンマネージャーサービスインターフェース
export interface ChainManagerServiceInterface extends BaseService {
  getCurrentChain(): SupportedChain
  setCurrentChain(chain: SupportedChain): void
  getTokensForChain(chain: SupportedChain): MultiChainToken[]
  addCustomToken(chain: SupportedChain, token: MultiChainToken): Promise<void>
  removeCustomToken(chain: SupportedChain, tokenAddress: string): Promise<void>
  getFavoriteTokens(chain: SupportedChain): MultiChainToken[]
  addFavoriteToken(chain: SupportedChain, token: MultiChainToken): Promise<void>
  removeFavoriteToken(chain: SupportedChain, token: MultiChainToken): Promise<void>
  validateTokenAddress(address: string, chain: SupportedChain): boolean
  getTokenInfo(address: string, chain: SupportedChain): Promise<MultiChainToken | null>
}

// 送金サービスインターフェース
export interface TransferServiceInterface extends BaseService {
  executeTransfer(request: TransferRequest): Promise<TransferResult>
  estimateGas(request: Omit<TransferRequest, 'gasSettings'>): Promise<EthereumFeeEstimate | TronFeeEstimate>
  validateTransfer(request: TransferRequest): Promise<{ isValid: boolean; errors: string[] }>
  validateAddress(address: string, chain: SupportedChain): Promise<boolean>
  trackTransfer(txHash: string, chain: SupportedChain): Promise<TransferTrackingInfo>
  getActiveTransfers(): TransferTrackingInfo[]
  cancelTracking(trackingId: string): void
}

// バランスマネージャーサービスインターフェース
export interface BalanceManagerServiceInterface extends BaseService {
  getBalance(token: MultiChainToken, address: string): Promise<TokenBalance>
  getBalances(address: string, chain?: SupportedChain): Promise<TokenBalance[]>
  getAllBalances(): Promise<TokenBalance[]>
  refreshBalances(address?: string, chain?: SupportedChain): Promise<void>
  getPortfolioStats(): Promise<PortfolioStats>
  enableAutoRefresh(enabled: boolean): void
  setRefreshInterval(intervalMs: number): void
  getTokenPrice(tokenAddress: string, chain: SupportedChain): Promise<number | null>
  updateTokenPrices(): Promise<void>
}

// サービスエラー型
export type ServiceErrorType =
  | 'INITIALIZATION_FAILED'
  | 'NETWORK_ERROR'
  | 'INVALID_PARAMETERS'
  | 'OPERATION_TIMEOUT'
  | 'INSUFFICIENT_FUNDS'
  | 'TRANSACTION_FAILED'
  | 'VALIDATION_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'UNKNOWN_ERROR'

export interface ServiceError {
  type: ServiceErrorType
  message: string
  details?: any
  timestamp: number
  service: string
}

// サービス設定の型
export interface ServiceConfiguration {
  chainManager: ChainManagerConfig
  transferService: TransferServiceConfig
  balanceManager: BalanceManagerConfig
  storage: {
    encryption: boolean
    compression: boolean
    cacheSize: number
  }
  api: {
    ethereum: {
      rpcUrl: string
      apiKey?: string
    }
    tron: {
      fullNodeUrl: string
      solidityNodeUrl: string
      apiKey?: string
    }
    priceApi: {
      url: string
      apiKey?: string
    }
  }
}

// サービス状態監視
export interface ServiceHealthStatus {
  chainManager: {
    status: 'healthy' | 'degraded' | 'down'
    lastCheck: number
    errors: string[]
  }
  transferService: {
    status: 'healthy' | 'degraded' | 'down'
    lastCheck: number
    activeTransfers: number
    errors: string[]
  }
  balanceManager: {
    status: 'healthy' | 'degraded' | 'down'
    lastCheck: number
    lastUpdate: number
    errors: string[]
  }
  storage: {
    status: 'healthy' | 'degraded' | 'down'
    lastCheck: number
    size: number
    errors: string[]
  }
}

// パフォーマンス統計
export interface ServicePerformanceStats {
  transferService: {
    averageExecutionTime: number
    successRate: number
    totalTransfers: number
    failedTransfers: number
    lastHourActivity: number
  }
  balanceManager: {
    averageRefreshTime: number
    cacheHitRate: number
    totalRefreshes: number
    lastRefreshDuration: number
  }
  chainManager: {
    tokenCacheHitRate: number
    customTokenCount: number
    favoriteTokenCount: number
  }
}