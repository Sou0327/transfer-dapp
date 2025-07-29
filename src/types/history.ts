import { SupportedChain, MultiChainToken } from './chain'

// トランザクションステータス
export type TransactionStatus = 'pending' | 'confirming' | 'success' | 'failed' | 'cancelled'

// ベーストランザクションレコード
export interface BaseTransactionRecord {
  id: string
  timestamp: number
  chain: SupportedChain
  tokenAddress: string
  tokenSymbol: string
  tokenDecimals: number
  from: string
  to: string
  amount: string
  amountFormatted: string
  txHash: string
  status: TransactionStatus
  blockNumber?: number
  confirmations?: number
  requiredConfirmations: number
  explorerUrl?: string
  tags?: string[]
  notes?: string
}

// Ethereum固有のトランザクション情報
export interface EthereumTransactionRecord extends BaseTransactionRecord {
  chain: 'ethereum'
  gasLimit: string
  gasUsed?: string
  gasPrice: string
  maxFeePerGas?: string
  maxPriorityFeePerGas?: string
  effectiveGasPrice?: string
  nonce: number
  chainId: number
}

// Tron固有のトランザクション情報
export interface TronTransactionRecord extends BaseTransactionRecord {
  chain: 'tron'
  energyUsed?: number
  energyLimit?: number
  energyPrice?: number
  bandwidthUsed?: number
  netUsage?: number
  feeLimit?: number
  actualFee?: number
  network: 'mainnet' | 'shasta' | 'nile'
}

// 統合トランザクションレコード型
export type TransactionRecord = EthereumTransactionRecord | TronTransactionRecord

// 履歴フィルターオプション
export interface HistoryFilterOptions {
  chain?: SupportedChain
  tokenAddress?: string
  tokenSymbol?: string
  status?: TransactionStatus
  dateFrom?: Date
  dateTo?: Date
  addressSearch?: string
  minAmount?: string
  maxAmount?: string
  tags?: string[]
  limit?: number
  offset?: number
  sortBy?: 'timestamp' | 'amount' | 'status'
  sortOrder?: 'asc' | 'desc'
}

// 履歴検索結果
export interface HistorySearchResult {
  transactions: TransactionRecord[]
  totalCount: number
  hasMore: boolean
  nextOffset?: number
}

// 履歴統計情報
export interface HistoryStats {
  totalTransactions: number
  successfulTransactions: number
  failedTransactions: number
  pendingTransactions: number
  totalVolumeETH: string
  totalVolumeTRX: string
  totalVolumeUSD?: string
  uniqueTokens: number
  uniqueAddresses: number
  dateRange: {
    earliest: number
    latest: number
  }
  chainBreakdown: {
    ethereum: number
    tron: number
  }
}

// エクスポート形式
export type ExportFormat = 'csv' | 'json' | 'xlsx'

// エクスポートオプション
export interface ExportOptions {
  format: ExportFormat
  includeHeaders: boolean
  includeMetadata: boolean
  columns?: string[]
  filter?: HistoryFilterOptions
  filename?: string
}

// エクスポート結果
export interface ExportResult {
  success: boolean
  filename: string
  downloadUrl?: string
  recordCount: number
  fileSize: number
  error?: string
}

// 履歴ストレージインターフェース
export interface HistoryStorageInterface {
  // トランザクション管理
  saveTransaction: (record: TransactionRecord) => Promise<void>
  getTransaction: (id: string) => Promise<TransactionRecord | null>
  updateTransaction: (id: string, updates: Partial<TransactionRecord>) => Promise<void>
  deleteTransaction: (id: string) => Promise<void>
  
  // 検索・フィルタリング
  getTransactions: (filter?: HistoryFilterOptions) => Promise<HistorySearchResult>
  searchTransactions: (query: string, filter?: HistoryFilterOptions) => Promise<HistorySearchResult>
  
  // 統計
  getStats: (filter?: HistoryFilterOptions) => Promise<HistoryStats>
  
  // メンテナンス
  clearAllHistory: () => Promise<void>
  compactStorage: () => Promise<void>
  
  // エクスポート・インポート
  exportHistory: (options: ExportOptions) => Promise<ExportResult>
  importHistory: (data: string, format: ExportFormat) => Promise<{ imported: number; errors: string[] }>
}

// 暗号化サービスインターフェース
export interface HistoryEncryptionInterface {
  encrypt: (data: string) => Promise<string>
  decrypt: (encryptedData: string) => Promise<string>
  generateKey: () => Promise<CryptoKey>
  exportKey: (key: CryptoKey) => Promise<string>
  importKey: (keyData: string) => Promise<CryptoKey>
}

// 履歴コンテキストの型
export interface HistoryContextType {
  // 状態
  transactions: TransactionRecord[]
  filteredTransactions: TransactionRecord[]
  stats: HistoryStats | null
  isLoading: boolean
  error: string | null
  
  // フィルター状態
  currentFilter: HistoryFilterOptions
  
  // トランザクション操作
  addTransaction: (record: Omit<TransactionRecord, 'id' | 'timestamp'>) => Promise<void>
  updateTransactionStatus: (txHash: string, status: TransactionStatus, blockNumber?: number) => Promise<void>
  deleteTransaction: (id: string) => Promise<void>
  
  // 検索・フィルタリング
  setFilter: (filter: HistoryFilterOptions) => void
  clearFilter: () => void
  searchTransactions: (query: string) => Promise<void>
  
  // データ管理
  refreshHistory: () => Promise<void>
  clearAllHistory: () => Promise<void>
  
  // エクスポート
  exportHistory: (options: ExportOptions) => Promise<ExportResult>
  
  // 統計
  refreshStats: () => Promise<void>
}

// トランザクション進行状況
export interface TransactionProgress {
  txHash: string
  status: TransactionStatus
  currentConfirmations: number
  requiredConfirmations: number
  estimatedConfirmationTime?: number
  blockNumber?: number
  timestamp: number
  error?: string
}

// トランザクション監視設定
export interface TransactionWatchConfig {
  txHash: string
  chain: SupportedChain
  maxConfirmations: number
  pollingInterval: number
  timeout: number
  onUpdate: (progress: TransactionProgress) => void
  onComplete: (record: TransactionRecord) => void
  onError: (error: string) => void
}

// 履歴インデックス（検索最適化用）
export interface HistoryIndex {
  byChain: Record<SupportedChain, string[]>
  byToken: Record<string, string[]>
  byAddress: Record<string, string[]>
  byStatus: Record<TransactionStatus, string[]>
  byDate: Record<string, string[]> // YYYY-MM-DD形式
}

// バックアップデータ構造
export interface HistoryBackup {
  version: string
  timestamp: number
  transactions: TransactionRecord[]
  stats: HistoryStats
  metadata: {
    totalRecords: number
    encryptionEnabled: boolean
    compressionEnabled: boolean
  }
  checksum: string
}

// 履歴同期設定（将来のクラウド同期用）
export interface HistorySyncConfig {
  enabled: boolean
  provider: 'local' | 'icloud' | 'google-drive' | 'custom'
  endpoint?: string
  apiKey?: string
  encryptionEnabled: boolean
  autoSync: boolean
  syncInterval: number
  lastSyncTimestamp?: number
}