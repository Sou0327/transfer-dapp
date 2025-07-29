// チェーン関連の型定義

export type SupportedChain = 'ethereum' | 'tron'

// ベースとなるネットワーク情報
export interface BaseNetworkInfo {
  name: string
  isSupported: boolean
  blockNumber: number
}

// Ethereumネットワーク情報
export interface EthereumNetworkInfo extends BaseNetworkInfo {
  chainId: number
  gasPrice: bigint
  baseFee?: bigint
  priorityFee?: bigint
  congestion: 'low' | 'medium' | 'high'
}

// Tronネットワーク情報
export interface TronNetworkInfo extends BaseNetworkInfo {
  network: 'mainnet' | 'shasta' | 'nile'
  energyPrice: number
  bandwidth: number
  totalEnergyLimit: number
  totalBandwidthLimit: number
  congestion: 'low' | 'medium' | 'high'
}

// チェーン状態
export interface ChainState {
  selectedChain: SupportedChain
  ethereumNetwork: EthereumNetworkInfo | null
  tronNetwork: TronNetworkInfo | null
  isLoading: boolean
  error: string | null
}

// チェーンコンテキストの型
export interface ChainContextType {
  state: ChainState
  selectChain: (chain: SupportedChain) => void
  refreshNetworkInfo: () => Promise<void>
  isNetworkSupported: (chain: SupportedChain) => boolean
  getCurrentNetworkInfo: () => EthereumNetworkInfo | TronNetworkInfo | null
}

// ベーストークン情報
export interface BaseToken {
  address: string
  name: string
  symbol: string
  decimals: number
  logoUrl?: string
  description?: string
  warnings?: string[]
}

// ERC-20トークン
export interface ERC20Token extends BaseToken {
  chain: 'ethereum'
  chainId: number
  nonStandard?: boolean
  compatibility?: {
    returnsTransfer: boolean
    emitsTransferEvent: boolean
    requiresForceMode: boolean
  }
}

// TRC-20トークン
export interface TRC20Token extends BaseToken {
  chain: 'tron'
  network: 'mainnet' | 'shasta' | 'nile'
  precision?: number
  energyCost?: number
  bandwidthCost?: number
}

// マルチチェーン対応トークン
export type MultiChainToken = ERC20Token | TRC20Token

// トークン残高情報
export interface TokenBalance {
  token: MultiChainToken
  balance: string
  formatted: string
  lastUpdated: number
  error?: string
}

// 手数料推定情報
export interface EthereumFeeEstimate {
  gasLimit: bigint
  gasPrice: bigint
  maxFeePerGas?: bigint
  maxPriorityFeePerGas?: bigint
  totalFee: string
  totalFeeETH: string
  totalFeeUSD?: string
  congestionLevel: 'low' | 'medium' | 'high'
}

export interface TronFeeEstimate {
  energyRequired: number
  energyPrice: number
  bandwidthRequired: number
  totalTrx: number
  totalTrxFormatted: string
  totalFeeUSD?: string
  hasEnoughEnergy: boolean
  hasEnoughBandwidth: boolean
}

// チェーン固有の送金パラメータ
export interface EthereumTransferParams {
  to: string
  amount: string
  tokenAddress: string
  gasLimit?: bigint
  gasPrice?: bigint
  maxFeePerGas?: bigint
  maxPriorityFeePerGas?: bigint
}

export interface TronTransferParams {
  to: string
  amount: string
  tokenAddress: string
  feeLimit?: number
  shouldConsumeUserResourceForFeeLimit?: boolean
}

// ネットワーク設定
export interface EthereumNetworkConfig {
  chainId: number
  name: string
  symbol: string
  rpcUrl: string
  blockExplorerUrl: string
  isMainnet: boolean
}

export interface TronNetworkConfig {
  network: 'mainnet' | 'shasta' | 'nile'
  name: string
  fullNodeUrl: string
  solidityNodeUrl: string
  eventServerUrl: string
  blockExplorerUrl: string
  isMainnet: boolean
}

// ブロックエクスプローラー情報
export interface BlockExplorerInfo {
  name: string
  baseUrl: string
  txPath: string
  addressPath: string
  tokenPath?: string
}

// チェーン統計情報
export interface ChainStats {
  chain: SupportedChain
  blockHeight: number
  avgBlockTime: number
  networkHashRate?: string
  totalSupply?: string
  circulatingSupply?: string
  lastUpdated: number
}