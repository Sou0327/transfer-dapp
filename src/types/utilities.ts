// ユーティリティ型定義

// 汎用的なユーティリティ型
export type Awaitable<T> = T | Promise<T>
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>
export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

// API関連の型
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
  timestamp: number
}

export interface PaginatedResponse<T> {
  items: T[]
  totalCount: number
  currentPage: number
  pageSize: number
  hasMore: boolean
  nextCursor?: string
}

// バリデーション結果
export interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  field?: string
}

export interface FormValidationResult<T> {
  isValid: boolean
  errors: Partial<Record<keyof T, string>>
  warnings: Partial<Record<keyof T, string>>
}

// エラー処理
export interface AppError {
  code: string
  message: string
  details?: any
  timestamp: number
  stack?: string
  userMessage?: string
}

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical'

export interface ErrorReport {
  error: AppError
  severity: ErrorSeverity
  context: {
    component?: string
    action?: string
    userId?: string
    sessionId?: string
    url?: string
    userAgent?: string
  }
  metadata?: Record<string, any>
}

// ステータス関連
export type LoadingState = 'idle' | 'loading' | 'success' | 'error'
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'
export type SyncState = 'idle' | 'syncing' | 'synced' | 'conflict' | 'error'

// 時間関連
export interface TimeRange {
  start: Date
  end: Date
}

export interface Duration {
  milliseconds: number
  seconds: number
  minutes: number
  hours: number
  days: number
}

// 設定関連
export interface AppSettings {
  theme: 'light' | 'dark' | 'auto'
  language: string
  notifications: {
    enabled: boolean
    sound: boolean
    desktop: boolean
    email: boolean
  }
  privacy: {
    analytics: boolean
    errorReporting: boolean
    dataSharing: boolean
  }
  advanced: {
    debugMode: boolean
    betaFeatures: boolean
    experimentalFeatures: boolean
  }
}

export interface FeatureFlags {
  multiChainSupport: boolean
  customTokens: boolean
  advancedTrading: boolean
  portfolioAnalytics: boolean
  historyExport: boolean
  darkMode: boolean
  notifications: boolean
  debugMode: boolean
}

// ファイル関連
export interface FileInfo {
  name: string
  size: number
  type: string
  lastModified: number
  path?: string
}

export interface DownloadInfo {
  filename: string
  mimeType: string
  size: number
  url: string
  downloadProgress?: number
}

// フォーム関連
export interface FormField<T = string> {
  value: T
  error?: string
  warning?: string
  touched: boolean
  dirty: boolean
  valid: boolean
}

export interface FormState<T> {
  values: T
  errors: Partial<Record<keyof T, string>>
  warnings: Partial<Record<keyof T, string>>
  touched: Partial<Record<keyof T, boolean>>
  dirty: Partial<Record<keyof T, boolean>>
  isValid: boolean
  isSubmitting: boolean
  submitCount: number
}

// 検索・フィルタリング
export interface SearchOptions {
  query: string
  caseSensitive?: boolean
  wholeWord?: boolean
  regex?: boolean
  fields?: string[]
}

export interface SortOptions {
  field: string
  direction: 'asc' | 'desc'
  type?: 'string' | 'number' | 'date'
}

export interface FilterOptions {
  [key: string]: any
}

export interface QueryOptions {
  search?: SearchOptions
  sort?: SortOptions
  filter?: FilterOptions
  pagination?: {
    page: number
    limit: number
    offset?: number
  }
}

// キャッシュ関連
export interface CacheEntry<T> {
  key: string
  value: T
  timestamp: number
  expiresAt: number
  tags?: string[]
}

export interface CacheOptions {
  ttl?: number
  maxSize?: number
  storage?: 'memory' | 'localStorage' | 'sessionStorage' | 'indexedDB'
  serialize?: boolean
  compress?: boolean
}

// イベント関連
export interface EventPayload<T = any> {
  type: string
  data: T
  timestamp: number
  source?: string
}

export interface EventHandler<T = any> {
  (payload: EventPayload<T>): void | Promise<void>
}

// ネットワーク関連
export interface NetworkInfo {
  isOnline: boolean
  connectionType?: 'wifi' | 'cellular' | 'ethernet' | 'unknown'
  downlink?: number
  effectiveType?: '2g' | '3g' | '4g' | 'slow-2g'
  rtt?: number
  saveData?: boolean
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  headers?: Record<string, string>
  body?: any
  timeout?: number
  retries?: number
  retryDelay?: number
  cache?: boolean
}

// ユーザー関連
export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto'
  language: string
  currency: string
  timezone: string
  dateFormat: string
  numberFormat: string
  notifications: {
    push: boolean
    email: boolean
    sms: boolean
  }
}

// デバイス関連
export interface DeviceInfo {
  userAgent: string
  platform: string
  vendor: string
  language: string
  languages: string[]
  cookieEnabled: boolean
  doNotTrack: string | null
  maxTouchPoints: number
  hardwareConcurrency: number
  deviceMemory?: number
}

// パフォーマンス関連
export interface PerformanceMetrics {
  loadTime: number
  renderTime: number
  interactionTime: number
  memoryUsage?: number
  bundleSize?: number
  cacheHitRate?: number
}

// セキュリティ関連
export interface SecurityContext {
  isSecureContext: boolean
  origin: string
  referrer: string
  permissions: string[]
  trustedOrigins: string[]
}

// 位置情報関連
export interface LocationInfo {
  latitude: number
  longitude: number
  accuracy: number
  altitude?: number
  altitudeAccuracy?: number
  heading?: number
  speed?: number
  timestamp: number
}

// 通知関連
export interface NotificationData {
  id: string
  title: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
  priority: 'low' | 'normal' | 'high'
  timestamp: number
  read: boolean
  actions?: {
    label: string
    action: string
    style?: 'default' | 'primary' | 'danger'
  }[]
  metadata?: Record<string, any>
}

// ログ関連
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

export interface LogEntry {
  level: LogLevel
  message: string
  timestamp: number
  source?: string
  context?: Record<string, any>
  error?: Error
}

// 統計関連
export interface Statistics {
  count: number
  sum: number
  average: number
  min: number
  max: number
  median: number
  standardDeviation: number
  percentiles: {
    p50: number
    p75: number
    p90: number
    p95: number
    p99: number
  }
}

// コンポーネント関連のユーティリティ型
export interface ComponentMetadata {
  name: string
  version: string
  description?: string
  props?: Record<string, any>
  state?: Record<string, any>
  events?: string[]
}

export type ComponentSize = 'small' | 'medium' | 'large'
export type ComponentVariant = 'primary' | 'secondary' | 'tertiary' | 'danger' | 'warning' | 'success'
export type ComponentState = 'default' | 'hover' | 'active' | 'disabled' | 'loading'

// レスポンシブ関連
export interface Breakpoints {
  xs: number
  sm: number
  md: number
  lg: number
  xl: number
  xxl: number
}

export type ScreenSize = keyof Breakpoints

// アニメーション関連
export interface AnimationOptions {
  duration: number
  easing: string
  delay?: number
  iterations?: number
  direction?: 'normal' | 'reverse' | 'alternate' | 'alternate-reverse'
  fillMode?: 'none' | 'forwards' | 'backwards' | 'both'
}

// 型ガード
export const isError = (value: any): value is Error => {
  return value instanceof Error
}

export const isString = (value: any): value is string => {
  return typeof value === 'string'
}

export const isNumber = (value: any): value is number => {
  return typeof value === 'number' && !isNaN(value)
}

export const isBoolean = (value: any): value is boolean => {
  return typeof value === 'boolean'
}

export const isObject = (value: any): value is object => {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export const isArray = (value: any): value is any[] => {
  return Array.isArray(value)
}

export const isFunction = (value: any): value is Function => {
  return typeof value === 'function'
}

export const isPromise = (value: any): value is Promise<any> => {
  return value instanceof Promise || (value && typeof value.then === 'function')
}

export const isDate = (value: any): value is Date => {
  return value instanceof Date && !isNaN(value.getTime())
}

export const isNull = (value: any): value is null => {
  return value === null
}

export const isUndefined = (value: any): value is undefined => {
  return value === undefined
}

export const isNullOrUndefined = (value: any): value is null | undefined => {
  return value === null || value === undefined
}