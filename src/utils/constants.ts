import { NetworkConfig, EthereumNetworkConfig, TronNetworkConfig, SupportedChain } from '@/types'

// ERC-20 ABI (最小限)
export const ERC20_ABI = [
  // balanceOf
  'function balanceOf(address owner) view returns (uint256)',
  // transfer
  'function transfer(address to, uint256 amount) returns (bool)',
  // Transfer event
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  // name, symbol, decimals (オプション)
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
] as const

// TRC-20 ABI (Tron用)
export const TRC20_ABI = [
  {
    "constant": true,
    "inputs": [{"name": "who", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"name": "", "type": "uint256"}],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  },
  {
    "constant": false,
    "inputs": [{"name": "to", "type": "address"}, {"name": "value", "type": "uint256"}],
    "name": "transfer",
    "outputs": [{"name": "", "type": "bool"}],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "name",
    "outputs": [{"name": "", "type": "string"}],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "symbol",
    "outputs": [{"name": "", "type": "string"}],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "decimals",
    "outputs": [{"name": "", "type": "uint8"}],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  }
] as const

// サポートされているネットワーク設定
export const SUPPORTED_NETWORKS: Record<number, NetworkConfig> = {
  1: {
    chainId: 1,
    name: 'Ethereum Mainnet',
    symbol: 'ETH',
    blockExplorerUrl: 'https://etherscan.io',
  },
  5: {
    chainId: 5,
    name: 'Goerli Testnet',
    symbol: 'ETH',
    rpcUrl: 'https://goerli.infura.io/v3',
    blockExplorerUrl: 'https://goerli.etherscan.io',
  },
  11155111: {
    chainId: 11155111,
    name: 'Sepolia Testnet',
    symbol: 'ETH',
    rpcUrl: 'https://sepolia.infura.io/v3',
    blockExplorerUrl: 'https://sepolia.etherscan.io',
  },
  137: {
    chainId: 137,
    name: 'Polygon Mainnet',
    symbol: 'MATIC',
    rpcUrl: 'https://polygon-rpc.com',
    blockExplorerUrl: 'https://polygonscan.com',
  },
}

// 一般的なERC-20トークンの設定
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

// Tronネットワーク設定
export const TRON_NETWORKS: Record<string, TronNetworkConfig> = {
  mainnet: {
    network: 'mainnet',
    name: 'Tron Mainnet',
    fullNodeUrl: 'https://api.trongrid.io',
    solidityNodeUrl: 'https://api.trongrid.io',
    eventServerUrl: 'https://api.trongrid.io',
    blockExplorerUrl: 'https://tronscan.org',
    isMainnet: true,
  },
  shasta: {
    network: 'shasta',
    name: 'Shasta Testnet',
    fullNodeUrl: 'https://api.shasta.trongrid.io',
    solidityNodeUrl: 'https://api.shasta.trongrid.io',
    eventServerUrl: 'https://api.shasta.trongrid.io',
    blockExplorerUrl: 'https://shasta.tronscan.org',
    isMainnet: false,
  },
  nile: {
    network: 'nile',
    name: 'Nile Testnet', 
    fullNodeUrl: 'https://api.nileex.io',
    solidityNodeUrl: 'https://api.nileex.io',
    eventServerUrl: 'https://api.nileex.io',
    blockExplorerUrl: 'https://nile.tronscan.org',
    isMainnet: false,
  },
}

// Ethereumネットワーク設定（拡張版）
export const ETHEREUM_NETWORKS: Record<number, EthereumNetworkConfig> = {
  1: {
    chainId: 1,
    name: 'Ethereum Mainnet',
    symbol: 'ETH',
    rpcUrl: 'https://eth.llamarpc.com',
    blockExplorerUrl: 'https://etherscan.io',
    isMainnet: true,
  },
  5: {
    chainId: 5,
    name: 'Goerli Testnet',
    symbol: 'ETH',
    rpcUrl: 'https://goerli.infura.io/v3',
    blockExplorerUrl: 'https://goerli.etherscan.io',
    isMainnet: false,
  },
  11155111: {
    chainId: 11155111,
    name: 'Sepolia Testnet',
    symbol: 'ETH',
    rpcUrl: 'https://sepolia.infura.io/v3',
    blockExplorerUrl: 'https://sepolia.etherscan.io',
    isMainnet: false,
  },
  137: {
    chainId: 137,
    name: 'Polygon Mainnet',
    symbol: 'MATIC',
    rpcUrl: 'https://polygon-rpc.com',
    blockExplorerUrl: 'https://polygonscan.com',
    isMainnet: true,
  },
}

// 主要なTRC-20トークンリスト（Tron Mainnet）
export const POPULAR_TRC20_TOKENS: Record<string, TokenInfo> = {
  USDT: {
    address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    name: 'Tether USD',
    symbol: 'USDT',
    decimals: 6,
    description: 'ステーブルコイン（USD連動）',
  },
  USDC: {
    address: 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8',
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 6,
    description: 'ステーブルコイン（USD連動）',
  },
  JST: {
    address: 'TCFLL5dx5ZJdKnWuesXxi1VPwjLVmWZZy9',
    name: 'JUST',
    symbol: 'JST',
    decimals: 18,
    description: 'JUSTネットワークのガバナンストークン',
  },
  WIN: {
    address: 'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7',
    name: 'WINkLink',
    symbol: 'WIN',
    decimals: 6,
    description: 'WINkLinkプラットフォームのトークン',
  },
  SUN: {
    address: 'TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S',
    name: 'SUN',
    symbol: 'SUN',
    decimals: 18,
    description: 'SUNプラットフォームのガバナンストークン',
  },
  BTT: {
    address: 'TAFjULxiVgT4qWk6UZwjqwZXTSaGaqnVp4',
    name: 'BitTorrent',
    symbol: 'BTT',
    decimals: 18,
    description: 'BitTorrentプロトコルのトークン',
  },
  TRX: {
    address: '', // ネイティブTRX
    name: 'TRON',
    symbol: 'TRX',
    decimals: 6,
    description: 'TRONネットワークのネイティブトークン',
  },
}

// 主要なERC-20トークンリスト（Ethereum Mainnet）
export const POPULAR_TOKENS: Record<string, TokenInfo> = {
  USDT: {
    address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    name: 'Tether USD',
    symbol: 'USDT',
    decimals: 6,
    description: 'ステーブルコイン（USD連動）',
  },
  USDC: {
    address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 6,
    description: 'ステーブルコイン（USD連動）',
  },
  DAI: {
    address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    name: 'Dai Stablecoin',
    symbol: 'DAI',
    decimals: 18,
    description: '分散型ステーブルコイン',
  },
  WETH: {
    address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    name: 'Wrapped Ethereum',
    symbol: 'WETH',
    decimals: 18,
    description: 'ERC-20準拠のETH',
  },
  UNI: {
    address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
    name: 'Uniswap',
    symbol: 'UNI',
    decimals: 18,
    description: 'Uniswapプロトコルのガバナンストークン',
  },
  LINK: {
    address: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
    name: 'ChainLink Token',
    symbol: 'LINK',
    decimals: 18,
    description: 'Chainlinkネットワークのトークン',
  },
  WBTC: {
    address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    name: 'Wrapped Bitcoin',
    symbol: 'WBTC',
    decimals: 8,
    description: 'ERC-20準拠のBTC',
  },
  AAVE: {
    address: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9',
    name: 'Aave Token',
    symbol: 'AAVE',
    decimals: 18,
    description: 'Aaveプロトコルのガバナンストークン',
  },
  MATIC: {
    address: '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0',
    name: 'Polygon',
    symbol: 'MATIC',
    decimals: 18,
    description: 'Polygonネットワークのトークン',
  },
  SHIB: {
    address: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',
    name: 'Shiba Inu',
    symbol: 'SHIB',
    decimals: 18,
    description: 'ミームトークン',
  },
  APE: {
    address: '0x4d224452801ACEd8B2F0aebE155379bb5D594381',
    name: 'ApeCoin',
    symbol: 'APE',
    decimals: 18,
    description: 'Bored Ape Yacht ClubのDAO通貨',
  }
}

// エイリアス（後方互換性）
export const POPULAR_ERC20_TOKENS = POPULAR_TOKENS

// デフォルト設定
export const DEFAULT_CHAIN_ID = 1
export const DEFAULT_TOKEN_ADDRESS = import.meta.env.VITE_TOKEN_ADDRESS || POPULAR_TOKENS.USDT.address

// トースト通知の表示時間（ミリ秒）
export const TOAST_DURATION = {
  SUCCESS: 5000,
  ERROR: 8000,
  WARNING: 6000,
  INFO: 4000,
} as const

// 残高ポーリング間隔（ミリ秒）
export const BALANCE_POLLING_INTERVAL = 15000

// ガス制限のデフォルト値
export const DEFAULT_GAS_LIMIT = {
  TRANSFER: 21000,
  ERC20_TRANSFER: 65000,
} as const

// Tron固有の定数
export const TRON_CONSTANTS = {
  TRX_TO_SUN: 1_000_000, // 1 TRX = 1,000,000 SUN
  DEFAULT_FEE_LIMIT: 40_000_000, // 40 TRX in SUN
  DEFAULT_BANDWIDTH_POINTS: 1000,
  DEFAULT_ENERGY_LIMIT: 1_000_000,
  MIN_TRX_ACCOUNT_CREATION: 1_100_000, // 1.1 TRX in SUN
  CONFIRMATION_BLOCKS: 19, // Tronネットワークでの確認ブロック数
} as const

// マルチチェーン用の確認ブロック数
export const CONFIRMATION_BLOCKS = {
  ethereum: 12,
  tron: 19,
} as const

// チェーン固有のガス/エネルギー制限
export const CHAIN_LIMITS = {
  ethereum: {
    DEFAULT_GAS_LIMIT: 65000,
    MAX_GAS_LIMIT: 500000,
    DEFAULT_GAS_PRICE: 20_000_000_000n, // 20 Gwei
  },
  tron: {
    DEFAULT_FEE_LIMIT: 40_000_000, // 40 TRX
    MAX_FEE_LIMIT: 1000_000_000, // 1000 TRX
    DEFAULT_ENERGY_LIMIT: 1_000_000,
  },
} as const

// LocalStorageのキー（マルチチェーン対応）
export const STORAGE_KEYS = {
  THEME: 'erc20-dapp-theme',
  LAST_CONNECTED_ACCOUNT: 'erc20-dapp-last-account',
  LAST_CONNECTED_METAMASK: 'erc20-dapp-last-metamask',
  LAST_CONNECTED_TRONLINK: 'erc20-dapp-last-tronlink',
  SELECTED_CHAIN: 'erc20-dapp-selected-chain',
  WALLET_SETTINGS: 'erc20-dapp-wallet-settings',
  TRANSACTION_HISTORY: 'erc20-dapp-tx-history',
  HISTORY_ENCRYPTION_KEY: 'erc20-dapp-history-key',
  AUTO_SELECT_WALLET: 'erc20-dapp-auto-select-wallet',
  CUSTOM_TOKENS: 'erc20-dapp-custom-tokens',
  FAVORITE_TOKENS: 'erc20-dapp-favorite-tokens',
  HIDDEN_TOKENS: 'erc20-dapp-hidden-tokens',
  BALANCE_CACHE: 'erc20-dapp-balance-cache',
} as const

// アプリケーション設定
export const APP_CONFIG = {
  NAME: import.meta.env.VITE_APP_NAME || 'ERC-20 Transfer dApp',
  VERSION: import.meta.env.VITE_APP_VERSION || '1.0.0',
  CHAIN_ID: Number(import.meta.env.VITE_CHAIN_ID) || DEFAULT_CHAIN_ID,
  TOKEN_ADDRESS: DEFAULT_TOKEN_ADDRESS,
} as const

// エラーメッセージ（マルチチェーン対応）
export const ERROR_MESSAGES = {
  // MetaMask関連
  METAMASK_NOT_INSTALLED: 'MetaMaskがインストールされていません。MetaMaskをインストールしてから再試行してください。',
  METAMASK_LOCKED: 'MetaMaskがロックされています。MetaMaskのロックを解除してください。',
  
  // TronLink関連
  TRONLINK_NOT_INSTALLED: 'TronLinkがインストールされていません。TronLinkをインストールしてから再試行してください。',
  TRONLINK_NOT_READY: 'TronLinkの準備ができていません。ページを再読み込みして再試行してください。',
  TRONLINK_NO_ACCOUNT: 'TronLinkにアカウントが見つかりません。TronLinkでアカウントを作成またはインポートしてください。',
  
  // 共通ウォレット関連
  CONNECTION_REJECTED: 'ウォレット接続が拒否されました。',
  WALLET_DISCONNECT: 'ウォレットの接続が切断されました。',
  
  // ネットワーク関連
  NETWORK_NOT_SUPPORTED: 'サポートされていないネットワークです。ネットワークを切り替えてください。',
  ETHEREUM_NETWORK_ERROR: 'Ethereumネットワークでエラーが発生しました。',
  TRON_NETWORK_ERROR: 'Tronネットワークでエラーが発生しました。',
  NETWORK_SWITCH_FAILED: 'ネットワークの切り替えに失敗しました。',
  
  // 残高・送金関連
  INSUFFICIENT_FUNDS: '残高が不足しています。',
  INSUFFICIENT_TRX_FOR_ENERGY: 'エネルギー費用として必要なTRXが不足しています。',
  INSUFFICIENT_BANDWIDTH: 'バンド幅が不足しています。',
  
  // アドレス・金額関連
  INVALID_ADDRESS: '無効なアドレスです。',
  INVALID_ETHEREUM_ADDRESS: '無効なEthereumアドレスです。0xで始まる42文字のアドレスを入力してください。',
  INVALID_TRON_ADDRESS: '無効なTronアドレスです。Tで始まる34文字のアドレスを入力してください。',
  INVALID_AMOUNT: '無効な金額です。',
  AMOUNT_TOO_SMALL: '送金金額が小さすぎます。',
  AMOUNT_TOO_LARGE: '送金金額が大きすぎます。',
  
  // トランザクション関連
  TRANSACTION_REJECTED: 'ユーザーによってトランザクションが拒否されました。',
  TRANSACTION_FAILED: 'トランザクションが失敗しました。',
  USER_REJECTED: 'ユーザーによって操作が拒否されました。',
  GAS_LIMIT_EXCEEDED: 'ガス制限を超過しました。',
  ENERGY_LIMIT_EXCEEDED: 'エネルギー制限を超過しました。',
  
  // トークン関連
  TOKEN_NOT_FOUND: 'トークンが見つかりません。',
  NON_STANDARD_TOKEN: 'このトークンは非標準的な動作をする可能性があります。',
  NON_STANDARD_ERC20: 'このERC-20トークンは非標準的な動作をします。',
  NON_STANDARD_TRC20: 'このTRC-20トークンは非標準的な動作をします。',
  
  // 一般的なエラー
  NETWORK_ERROR: 'ネットワークエラーが発生しました。接続を確認してください。',
  UNKNOWN_ERROR: '不明なエラーが発生しました。',
  
  // 履歴関連
  HISTORY_LOAD_FAILED: '履歴の読み込みに失敗しました。',
  HISTORY_SAVE_FAILED: '履歴の保存に失敗しました。',
  HISTORY_EXPORT_FAILED: '履歴のエクスポートに失敗しました。',
} as const

// 成功メッセージ（マルチチェーン対応）
export const SUCCESS_MESSAGES = {
  // ウォレット接続
  METAMASK_CONNECTED: 'MetaMaskが正常に接続されました。',
  TRONLINK_CONNECTED: 'TronLinkが正常に接続されました。',
  WALLET_CONNECTED: 'ウォレットが正常に接続されました。',
  
  // ネットワーク切り替え
  ETHEREUM_NETWORK_SWITCHED: 'Ethereumネットワークが正常に切り替えられました。',
  TRON_NETWORK_SWITCHED: 'Tronネットワークが正常に切り替えられました。',
  NETWORK_SWITCHED: 'ネットワークが正常に切り替えられました。',
  
  // トランザクション
  TRANSACTION_SUCCESS: 'トランザクションが正常に完了しました。',
  ETHEREUM_TRANSACTION_SUCCESS: 'Ethereumトランザクションが正常に完了しました。',
  TRON_TRANSACTION_SUCCESS: 'Tronトランザクションが正常に完了しました。',
  
  // 履歴
  HISTORY_EXPORTED: '履歴が正常にエクスポートされました。',
  HISTORY_CLEARED: '履歴がクリアされました。',
} as const

// チェーン固有の設定
export const CHAIN_CONFIG = {
  ethereum: {
    name: 'Ethereum',
    symbol: 'ETH',
    nativeCurrency: 'ETH',
    requiredWallet: 'metamask',
    defaultNetwork: 1,
    testNetworks: [5, 11155111],
  },
  tron: {
    name: 'Tron',
    symbol: 'TRX',
    nativeCurrency: 'TRX',
    requiredWallet: 'tronlink',
    defaultNetwork: 'mainnet',
    testNetworks: ['shasta', 'nile'],
  },
} as const