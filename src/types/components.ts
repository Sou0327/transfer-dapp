// コンポーネント関連の型定義

import { ReactNode } from 'react'
import { SupportedChain, MultiChainToken } from './chain'
import { TransactionRecord, TransactionStatus } from './history'
import { TransferRequest } from './services'

// 共通プロパティ
export interface BaseComponentProps {
  className?: string
}

// ウォレット接続パネル
export interface WalletConnectionPanelProps extends BaseComponentProps {
  showChainSwitcher?: boolean
  onConnect?: (chain: SupportedChain) => void
  onDisconnect?: (chain: SupportedChain) => void
}

// チェーン切り替え
export interface ChainSwitcherProps extends BaseComponentProps {
  variant?: 'compact' | 'detailed' | 'dropdown'
  showIcons?: boolean
  onChainChange?: (chain: SupportedChain) => void
}

// 残高表示
export interface BalanceDisplayProps extends BaseComponentProps {
  variant?: 'compact' | 'detailed' | 'minimal'
  showUSDValues?: boolean
  showRefreshButton?: boolean
  maxItems?: number
  chain?: SupportedChain
  hideZeroBalances?: boolean
  onTokenClick?: (token: MultiChainToken) => void
  onRefresh?: () => void
}

// 送金フォーム
export interface TransferFormProps extends BaseComponentProps {
  onTransferStart?: (request: TransferRequest) => void
  onTransferComplete?: (txHash: string, chain: SupportedChain) => void
  onTransferError?: (error: string) => void
  prefilledChain?: SupportedChain
  prefilledToken?: MultiChainToken
  prefilledToAddress?: string
  prefilledAmount?: string
}

// 取引履歴
export interface TransactionHistoryProps extends BaseComponentProps {
  variant?: 'compact' | 'detailed' | 'minimal'
  showFilters?: boolean
  showSearch?: boolean
  showExport?: boolean
  showStats?: boolean
  maxItems?: number
  autoRefresh?: boolean
  onTransactionClick?: (transaction: TransactionRecord) => void
}

// トークン選択
export interface TokenSelectorProps extends BaseComponentProps {
  chain: SupportedChain
  value?: MultiChainToken | null
  onChange: (token: MultiChainToken | null) => void
  variant?: 'dropdown' | 'modal' | 'inline'
  showBalance?: boolean
  showFavorites?: boolean
  allowCustomTokens?: boolean
  placeholder?: string
  disabled?: boolean
}

// バランスカード
export interface BalanceCardProps extends BaseComponentProps {
  token: MultiChainToken
  balance: string
  usdValue?: number
  showChart?: boolean
  onClick?: () => void
}

// トランザクションアイテム
export interface TransactionItemProps extends BaseComponentProps {
  transaction: TransactionRecord
  variant?: 'compact' | 'detailed'
  showActions?: boolean
  onStatusUpdate?: (status: TransactionStatus) => void
  onClick?: () => void
}

// ガス設定コンポーネント
export interface GasSettingsProps extends BaseComponentProps {
  chain: SupportedChain
  value: {
    priority: 'slow' | 'medium' | 'fast'
    customGasPrice?: string
    customGasLimit?: string
  }
  onChange: (settings: GasSettingsProps['value']) => void
  showAdvanced?: boolean
}

// アドレス入力
export interface AddressInputProps extends BaseComponentProps {
  chain: SupportedChain
  value: string
  onChange: (value: string) => void
  onValidation?: (isValid: boolean) => void
  placeholder?: string
  disabled?: boolean
  showQRScanner?: boolean
  showAddressBook?: boolean
}

// 金額入力
export interface AmountInputProps extends BaseComponentProps {
  token?: MultiChainToken
  value: string
  onChange: (value: string) => void
  onValidation?: (isValid: boolean, error?: string) => void
  placeholder?: string
  disabled?: boolean
  showMaxButton?: boolean
  maxAmount?: string
}

// ネットワーク状態インジケーター
export interface NetworkStatusProps extends BaseComponentProps {
  chain: SupportedChain
  variant?: 'dot' | 'badge' | 'detailed'
  showLabel?: boolean
}

// 価格表示
export interface PriceDisplayProps extends BaseComponentProps {
  value: number
  currency?: 'USD' | 'EUR' | 'JPY'
  variant?: 'compact' | 'detailed'
  showChange?: boolean
  change24h?: number
  loading?: boolean
}

// QRコード生成器
export interface QRCodeGeneratorProps extends BaseComponentProps {
  value: string
  size?: number
  includeMargin?: boolean
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'
  title?: string
}

// QRコードスキャナー
export interface QRCodeScannerProps extends BaseComponentProps {
  onScan: (value: string) => void
  onError?: (error: string) => void
  onClose?: () => void
  isOpen: boolean
}

// 設定パネル
export interface SettingsPanelProps extends BaseComponentProps {
  onSettingsChange?: (settings: any) => void
  onReset?: () => void
}

// フィルターパネル
export interface FilterPanelProps extends BaseComponentProps {
  filters: {
    chain?: SupportedChain
    status?: TransactionStatus
    dateRange?: {
      from: string
      to: string
    }
  }
  onFiltersChange: (filters: FilterPanelProps['filters']) => void
  onReset: () => void
}

// エクスポートボタン
export interface ExportButtonProps extends BaseComponentProps {
  data: any[]
  filename?: string
  format?: 'csv' | 'json' | 'xlsx'
  onExport?: (result: { success: boolean; error?: string }) => void
  disabled?: boolean
}

// 統計カード
export interface StatsCardProps extends BaseComponentProps {
  title: string
  value: string | number
  change?: {
    value: number
    period: string
    direction: 'up' | 'down' | 'neutral'
  }
  icon?: ReactNode
  variant?: 'default' | 'success' | 'warning' | 'error'
}

// 接続状態表示
export interface ConnectionStatusProps extends BaseComponentProps {
  walletType: 'metamask' | 'tronlink'
  isConnected: boolean
  account?: string
  network?: string
  onConnect?: () => void
  onDisconnect?: () => void
  showDetails?: boolean
}

// トークンアイコン
export interface TokenIconProps extends BaseComponentProps {
  token: MultiChainToken
  size?: 'small' | 'medium' | 'large'
  showChainBadge?: boolean
}

// チェーンアイコン
export interface ChainIconProps extends BaseComponentProps {
  chain: SupportedChain
  size?: 'small' | 'medium' | 'large'
}

// ローディングスピナー
export interface LoadingSpinnerProps extends BaseComponentProps {
  size?: 'small' | 'medium' | 'large'
  message?: string
  overlay?: boolean
}

// エラーバウンダリー
export interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

// モーダルベース
export interface ModalProps extends BaseComponentProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  size?: 'small' | 'medium' | 'large' | 'fullscreen'
  closeOnOverlayClick?: boolean
  showCloseButton?: boolean
  children: ReactNode
}

// ツールチップ
export interface TooltipProps extends BaseComponentProps {
  content: ReactNode
  placement?: 'top' | 'bottom' | 'left' | 'right'
  trigger?: 'hover' | 'click' | 'focus'
  children: ReactNode
}

// ドロップダウンメニュー
export interface DropdownProps extends BaseComponentProps {
  trigger: ReactNode
  children: ReactNode
  placement?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right'
  closeOnClick?: boolean
}

// 検索バー
export interface SearchBarProps extends BaseComponentProps {
  value: string
  onChange: (value: string) => void
  onSearch?: (query: string) => void
  placeholder?: string
  suggestions?: string[]
  showClearButton?: boolean
  debounceMs?: number
}

// ページネーション
export interface PaginationProps extends BaseComponentProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  showInfo?: boolean
  showFirstLast?: boolean
  maxVisiblePages?: number
}

// タブ
export interface TabsProps extends BaseComponentProps {
  activeTab: string
  onTabChange: (tabId: string) => void
  tabs: {
    id: string
    label: string
    content: ReactNode
    disabled?: boolean
  }[]
  variant?: 'default' | 'pills' | 'underline'
}

// アコーディオン
export interface AccordionProps extends BaseComponentProps {
  items: {
    id: string
    title: ReactNode
    content: ReactNode
    disabled?: boolean
  }[]
  openItems?: string[]
  onToggle?: (itemId: string) => void
  allowMultiple?: boolean
}

// プログレスバー
export interface ProgressBarProps extends BaseComponentProps {
  value: number
  max?: number
  label?: string
  showPercentage?: boolean
  variant?: 'default' | 'success' | 'warning' | 'error'
  striped?: boolean
  animated?: boolean
}