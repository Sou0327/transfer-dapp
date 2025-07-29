// 定数とEnum定義

// チェーン関連の定数
export const SUPPORTED_CHAINS = ['ethereum', 'tron'] as const
export const DEFAULT_CHAIN = 'ethereum' as const

// ネットワーク定数
export const ETHEREUM_NETWORKS = {
  MAINNET: 1,
  GOERLI: 5,
  SEPOLIA: 11155111,
  POLYGON: 137,
  ARBITRUM: 42161,
  OPTIMISM: 10,
  BSC: 56
} as const

export const TRON_NETWORKS = {
  MAINNET: 'mainnet',
  SHASTA: 'shasta',
  NILE: 'nile'
} as const

// トークン関連の定数
export const NATIVE_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000'
export const MAX_TOKEN_DECIMALS = 18
export const MIN_TOKEN_DECIMALS = 0

// 送金関連の定数
export const DEFAULT_GAS_LIMIT = {
  ERC20_TRANSFER: 60000,
  ETH_TRANSFER: 21000,
  TRC20_TRANSFER: 10000000,
  TRX_TRANSFER: 5000000
} as const

export const GAS_PRICE_LEVELS = {
  SLOW: 'slow',
  MEDIUM: 'medium',
  FAST: 'fast'
} as const

export const CONFIRMATION_REQUIREMENTS = {
  ETHEREUM: 12,
  TRON: 19
} as const

// 金額関連の定数
export const MIN_TRANSFER_AMOUNT = '0.000001'
export const MAX_TRANSFER_AMOUNT = '1000000000'
export const DEFAULT_SLIPPAGE = 0.5 // 0.5%

// UIとUX関連の定数
export const TOAST_DURATION = {
  SUCCESS: 5000,
  ERROR: 8000,
  WARNING: 6000,
  INFO: 4000
} as const

export const ANIMATION_DURATION = {
  FAST: 150,
  NORMAL: 300,
  SLOW: 500
} as const

// ストレージ関連の定数
export const STORAGE_KEYS = {
  WALLET_SETTINGS: 'wallet_settings',
  CHAIN_PREFERENCE: 'chain_preference',
  CUSTOM_TOKENS: 'custom_tokens',
  FAVORITE_TOKENS: 'favorite_tokens',
  TRANSACTION_HISTORY: 'transaction_history',
  THEME_PREFERENCE: 'theme_preference',
  LANGUAGE_PREFERENCE: 'language_preference',
  AUTO_CONNECT: 'auto_connect',
  LAST_CONNECTED_WALLET: 'last_connected_wallet'
} as const

// API関連の定数
export const API_ENDPOINTS = {
  ETHEREUM_RPC: 'https://mainnet.infura.io/v3/',
  TRON_FULL_NODE: 'https://api.trongrid.io',
  TRON_SOLIDITY_NODE: 'https://api.trongrid.io',
  PRICE_API: 'https://api.coingecko.com/api/v3',
  BLOCKFROST_API: 'https://blockfrost.io/api/v0'
} as const

export const REQUEST_TIMEOUT = {
  FAST: 5000,
  NORMAL: 10000,
  SLOW: 30000,
  VERY_SLOW: 60000
} as const

// エラーコード
export enum ErrorCode {
  // ウォレット関連
  WALLET_NOT_INSTALLED = 'WALLET_NOT_INSTALLED',
  WALLET_LOCKED = 'WALLET_LOCKED',
  CONNECTION_REJECTED = 'CONNECTION_REJECTED',
  ACCOUNT_ACCESS_DENIED = 'ACCOUNT_ACCESS_DENIED',
  
  // ネットワーク関連
  NETWORK_NOT_SUPPORTED = 'NETWORK_NOT_SUPPORTED',
  NETWORK_SWITCH_FAILED = 'NETWORK_SWITCH_FAILED',
  RPC_ERROR = 'RPC_ERROR',
  
  // トランザクション関連
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  INVALID_ADDRESS = 'INVALID_ADDRESS',
  INVALID_AMOUNT = 'INVALID_AMOUNT',
  TRANSACTION_REJECTED = 'TRANSACTION_REJECTED',
  GAS_ESTIMATION_FAILED = 'GAS_ESTIMATION_FAILED',
  TRANSACTION_TIMEOUT = 'TRANSACTION_TIMEOUT',
  
  // トークン関連
  TOKEN_NOT_FOUND = 'TOKEN_NOT_FOUND',
  INVALID_TOKEN_ADDRESS = 'INVALID_TOKEN_ADDRESS',
  NON_STANDARD_TOKEN = 'NON_STANDARD_TOKEN',
  
  // データ関連
  STORAGE_ERROR = 'STORAGE_ERROR',
  ENCRYPTION_ERROR = 'ENCRYPTION_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  
  // API関連
  API_ERROR = 'API_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  
  // 一般的なエラー
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  INITIALIZATION_FAILED = 'INITIALIZATION_FAILED',
  OPERATION_CANCELLED = 'OPERATION_CANCELLED'
}

// イベントタイプ
export enum EventType {
  // ウォレットイベント
  WALLET_CONNECTED = 'wallet_connected',
  WALLET_DISCONNECTED = 'wallet_disconnected',
  ACCOUNT_CHANGED = 'account_changed',
  NETWORK_CHANGED = 'network_changed',
  
  // トランザクションイベント
  TRANSACTION_STARTED = 'transaction_started',
  TRANSACTION_CONFIRMED = 'transaction_confirmed',
  TRANSACTION_FAILED = 'transaction_failed',
  TRANSACTION_CANCELLED = 'transaction_cancelled',
  
  // 残高イベント
  BALANCE_UPDATED = 'balance_updated',
  BALANCE_ERROR = 'balance_error',
  
  // UI イベント
  THEME_CHANGED = 'theme_changed',
  LANGUAGE_CHANGED = 'language_changed',
  SETTINGS_UPDATED = 'settings_updated'
}

// ログレベル
export enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
  FATAL = 5
}

// 通知タイプ
export enum NotificationType {
  INFO = 'info',
  SUCCESS = 'success',
  WARNING = 'warning',
  ERROR = 'error'
}

// コンポーネントサイズ
export enum ComponentSize {
  SMALL = 'small',
  MEDIUM = 'medium',
  LARGE = 'large'
}

// コンポーネントバリアント
export enum ComponentVariant {
  PRIMARY = 'primary',
  SECONDARY = 'secondary',
  TERTIARY = 'tertiary',
  DANGER = 'danger',
  WARNING = 'warning',
  SUCCESS = 'success'
}

// ソート方向
export enum SortDirection {
  ASC = 'asc',
  DESC = 'desc'
}

// フィルタータイプ
export enum FilterType {
  EQUALS = 'equals',
  CONTAINS = 'contains',
  STARTS_WITH = 'starts_with',
  ENDS_WITH = 'ends_with',
  GREATER_THAN = 'gt',
  LESS_THAN = 'lt',
  GREATER_THAN_OR_EQUAL = 'gte',
  LESS_THAN_OR_EQUAL = 'lte',
  IN = 'in',
  NOT_IN = 'not_in'
}

// 言語コード
export const SUPPORTED_LANGUAGES = {
  EN: 'en',
  JA: 'ja',
  ZH: 'zh',
  KO: 'ko',
  ES: 'es',
  FR: 'fr',
  DE: 'de'
} as const

// 通貨コード
export const SUPPORTED_CURRENCIES = {
  USD: 'usd',
  EUR: 'eur',
  JPY: 'jpy',
  GBP: 'gbp',
  AUD: 'aud',
  CAD: 'cad',
  CHF: 'chf',
  CNY: 'cny',
  KRW: 'krw'
} as const

// タイムゾーン
export const COMMON_TIMEZONES = {
  UTC: 'UTC',
  EST: 'America/New_York',
  PST: 'America/Los_Angeles',
  JST: 'Asia/Tokyo',
  KST: 'Asia/Seoul',
  CST: 'Asia/Shanghai',
  GMT: 'Europe/London',
  CET: 'Europe/Paris'
} as const

// レスポンシブブレークポイント
export const BREAKPOINTS = {
  XS: 0,
  SM: 576,
  MD: 768,
  LG: 992,
  XL: 1200,
  XXL: 1400
} as const

// Z-index値
export const Z_INDEX = {
  DROPDOWN: 1000,
  STICKY: 1010,
  FIXED: 1020,
  MODAL_BACKDROP: 1040,
  MODAL: 1050,
  POPOVER: 1060,
  TOOLTIP: 1070,
  TOAST: 1080
} as const

// アニメーションイージング
export const EASING = {
  LINEAR: 'linear',
  EASE: 'ease',
  EASE_IN: 'ease-in',
  EASE_OUT: 'ease-out',
  EASE_IN_OUT: 'ease-in-out',
  CUBIC_BEZIER: 'cubic-bezier(0.4, 0, 0.2, 1)'
} as const

// カラーパレット
export const COLORS = {
  PRIMARY: '#007bff',
  SECONDARY: '#6c757d',
  SUCCESS: '#28a745',
  DANGER: '#dc3545',
  WARNING: '#ffc107',
  INFO: '#17a2b8',
  LIGHT: '#f8f9fa',
  DARK: '#343a40'
} as const

// フォントサイズ
export const FONT_SIZES = {
  XS: '0.75rem',
  SM: '0.875rem',
  BASE: '1rem',
  LG: '1.125rem',
  XL: '1.25rem',
  '2XL': '1.5rem',
  '3XL': '1.875rem',
  '4XL': '2.25rem'
} as const

// 検証パターン
export const VALIDATION_PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  ETHEREUM_ADDRESS: /^0x[a-fA-F0-9]{40}$/,
  TRON_ADDRESS: /^T[A-Za-z1-9]{33}$/,
  PRIVATE_KEY: /^[a-fA-F0-9]{64}$/,
  MNEMONIC: /^([a-z]{3,}\s){11,23}[a-z]{3,}$/,
  URL: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/,
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
} as const

// デフォルト設定値
export const DEFAULT_SETTINGS = {
  THEME: 'light',
  LANGUAGE: 'en',
  CURRENCY: 'usd',
  AUTO_CONNECT: true,
  REMEMBER_WALLET: true,
  SHOW_ZERO_BALANCES: false,
  ENABLE_NOTIFICATIONS: true,
  ENABLE_SOUND: true,
  REFRESH_INTERVAL: 30000,
  TRANSACTION_TIMEOUT: 300000,
  MAX_HISTORY_RECORDS: 10000
} as const

// 型定義のエクスポート
export type SupportedChain = typeof SUPPORTED_CHAINS[number]
export type EthereumNetworkId = typeof ETHEREUM_NETWORKS[keyof typeof ETHEREUM_NETWORKS]
export type TronNetwork = typeof TRON_NETWORKS[keyof typeof TRON_NETWORKS]
export type GasPriceLevel = typeof GAS_PRICE_LEVELS[keyof typeof GAS_PRICE_LEVELS]
export type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS]
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[keyof typeof SUPPORTED_LANGUAGES]
export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[keyof typeof SUPPORTED_CURRENCIES]