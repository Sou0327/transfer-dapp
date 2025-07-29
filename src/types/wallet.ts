import { ethers } from 'ethers'
import { SupportedChain } from './chain'

// ウォレット接続状態の基本型
export interface BaseWalletState {
  isConnected: boolean
  account: string | null
  isConnecting: boolean
  error: string | null
}

// MetaMask（Ethereum）ウォレット状態
export interface MetaMaskWalletState extends BaseWalletState {
  chainId: number | null
  provider: ethers.BrowserProvider | null
  networkName: string | null
}

// TronLinkウォレット状態
export interface TronLinkWalletState extends BaseWalletState {
  network: 'mainnet' | 'shasta' | 'nile' | null
  tronWeb: any | null
  address: {
    base58: string | null
    hex: string | null
  }
}

// マルチウォレット統合状態
export interface MultiWalletState {
  metamask: MetaMaskWalletState
  tronlink: TronLinkWalletState
  selectedWallet: 'metamask' | 'tronlink' | null
  autoSelectWallet: boolean
}

// ウォレット接続結果
export interface WalletConnectionResult {
  success: boolean
  account?: string
  chainId?: number
  network?: string
  error?: string
}

// ネットワーク切り替え結果
export interface NetworkSwitchResult {
  success: boolean
  newChainId?: number
  newNetwork?: string
  error?: string
}

// マルチウォレットコンテキストの型
export interface MultiWalletContextType {
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
  getConnectedWalletForChain: (chain: SupportedChain) => MetaMaskWalletState | TronLinkWalletState | null
  isWalletConnectedForChain: (chain: SupportedChain) => boolean
  
  // 自動選択設定
  setAutoSelectWallet: (enabled: boolean) => void
}

// MetaMaskプロバイダーの拡張型定義
export interface ExtendedMetaMaskProvider {
  request: (args: { method: string; params?: any[] }) => Promise<any>
  on: (event: string, callback: (...args: any[]) => void) => void
  removeListener: (event: string, callback: (...args: any[]) => void) => void
  selectedAddress: string | null
  chainId: string
  isMetaMask: boolean
  providers?: ExtendedMetaMaskProvider[]
  selectedProvider?: ExtendedMetaMaskProvider
  _metamask?: {
    isUnlocked: () => Promise<boolean>
  }
}

// TronWebの型定義（簡略版）- ウォレット専用
export interface WalletTronWebInstance {
  isAddress: (address: string) => boolean
  address: {
    toHex: (address: string) => string
    fromHex: (hexAddress: string) => string
  }
  defaultAddress?: {
    base58?: string
    hex?: string
  }
  ready: boolean
  transactionBuilder: any
  trx: any
  contract: any
  fullNode: any
  utils: {
    ethersUtils: any
    transaction: any
    crypto: any
    code: any
    bytes: any
    [key: string]: any
  }
}

// TronLinkプロバイダーの型定義
export interface TronLinkProvider {
  ready: boolean
  tronWeb: WalletTronWebInstance | null
  request: (args: { method: string; params?: any }) => Promise<any>
}

// ウォレット検出結果
export interface WalletDetectionResult {
  metamask: {
    installed: boolean
    locked?: boolean
    version?: string
  }
  tronlink: {
    installed: boolean
    ready: boolean
    version?: string
  }
}

// ウォレット能力情報
export interface WalletCapabilities {
  metamask: {
    canSwitchChain: boolean
    canAddChain: boolean
    canWatchAssets: boolean
    supportedChains: number[]
  }
  tronlink: {
    canSwitchNetwork: boolean
    canSignMessage: boolean
    supportedNetworks: string[]
  }
}

// アカウント変更イベント
export interface AccountChangeEvent {
  walletType: 'metamask' | 'tronlink'
  previousAccount: string | null
  newAccount: string | null
  timestamp: number
}

// ネットワーク変更イベント
export interface NetworkChangeEvent {
  walletType: 'metamask' | 'tronlink'
  previousNetwork: string | number | null
  newNetwork: string | number | null
  timestamp: number
}

// ウォレット接続エラーの型
export type WalletErrorType =
  | 'WALLET_NOT_INSTALLED'
  | 'WALLET_LOCKED'
  | 'CONNECTION_REJECTED'
  | 'NETWORK_NOT_SUPPORTED'
  | 'ACCOUNT_ACCESS_DENIED'
  | 'SWITCH_NETWORK_FAILED'
  | 'WALLET_DISCONNECT'
  | 'UNKNOWN_ERROR'

export interface WalletError {
  type: WalletErrorType
  message: string
  details?: any
  timestamp: number
}

// ウォレット設定
export interface WalletSettings {
  autoConnect: boolean
  autoSelectChain: boolean
  preferredChain: SupportedChain
  rememberLastWallet: boolean
  showNetworkWarnings: boolean
}

// ローカルストレージのキー
export interface WalletStorageKeys {
  LAST_CONNECTED_METAMASK: string
  LAST_CONNECTED_TRONLINK: string
  WALLET_SETTINGS: string
  CHAIN_PREFERENCE: string
  AUTO_CONNECT_ENABLED: string
}

// グローバルwindowオブジェクトの拡張
declare global {
  interface Window {
    ethereum?: ExtendedMetaMaskProvider
    tronWeb?: WalletTronWebInstance
    tronLink?: TronLinkProvider
    // Legacy web3 support
    web3?: {
      currentProvider?: ExtendedMetaMaskProvider
    }
  }
}