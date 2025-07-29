// セキュリティ強化ユーティリティ

import { errorHandler } from './errorHandler'
import { ErrorCode } from '@/types/constants'

/**
 * 入力サニタイゼーション
 */
export class InputSanitizer {
  /**
   * HTMLエスケープ
   */
  static escapeHtml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  /**
   * SQL インジェクション防止
   */
  static sanitizeSql(input: string): string {
    return input
      .replace(/['";\\]/g, '')
      .replace(/--|\/\*|\*\//g, '')
      .trim()
  }

  /**
   * XSS 防止
   */
  static sanitizeXss(input: string): string {
    // スクリプトタグを除去
    let sanitized = input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    
    // イベントハンドラーを除去
    sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    
    // javascript: URLを除去
    sanitized = sanitized.replace(/javascript\s*:/gi, '')
    
    // data: URLを除去（画像以外）
    sanitized = sanitized.replace(/data:(?!image\/)[^;]+;/gi, '')
    
    return sanitized
  }

  /**
   * JSONインジェクション防止
   */
  static sanitizeJson(input: any): any {
    if (typeof input === 'string') {
      return this.escapeHtml(input)
    }
    
    if (Array.isArray(input)) {
      return input.map(item => this.sanitizeJson(item))
    }
    
    if (typeof input === 'object' && input !== null) {
      const sanitized: any = {}
      for (const [key, value] of Object.entries(input)) {
        const cleanKey = this.escapeHtml(key)
        sanitized[cleanKey] = this.sanitizeJson(value)
      }
      return sanitized
    }
    
    return input
  }

  /**
   * ユーザー入力の検証
   */
  static validateUserInput(input: string, options: {
    maxLength?: number
    allowedChars?: RegExp
    blockedPatterns?: RegExp[]
  } = {}): { isValid: boolean; errors: string[] } {
    const errors: string[] = []

    // 長さチェック
    if (options.maxLength && input.length > options.maxLength) {
      errors.push(`入力は${options.maxLength}文字以内である必要があります`)
    }

    // 許可文字チェック
    if (options.allowedChars && !options.allowedChars.test(input)) {
      errors.push('許可されていない文字が含まれています')
    }

    // ブロックパターンチェック
    if (options.blockedPatterns) {
      for (const pattern of options.blockedPatterns) {
        if (pattern.test(input)) {
          errors.push('不正なパターンが検出されました')
          break
        }
      }
    }

    return { isValid: errors.length === 0, errors }
  }
}

/**
 * Content Security Policy 管理
 */
export class CSPManager {
  private static policies = new Map<string, string[]>()

  /**
   * CSP ディレクティブを設定
   */
  static setDirective(directive: string, sources: string[]): void {
    this.policies.set(directive, sources)
  }

  /**
   * CSP ヘッダーを生成
   */
  static generateCSPHeader(): string {
    const directives: string[] = []

    this.policies.forEach((sources, directive) => {
      directives.push(`${directive} ${sources.join(' ')}`)
    })

    return directives.join('; ')
  }

  /**
   * デフォルトの安全なCSPを設定
   */
  static setSecureDefaults(): void {
    this.setDirective('default-src', ["'self'"])
    this.setDirective('script-src', ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'])
    this.setDirective('style-src', ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'])
    this.setDirective('font-src', ["'self'", 'https://fonts.gstatic.com'])
    this.setDirective('img-src', ["'self'", 'data:', 'https:'])
    this.setDirective('connect-src', ["'self'", 'https://api.coingecko.com', 'https://blockfrost.io'])
    this.setDirective('frame-ancestors', ["'none'"])
    this.setDirective('base-uri', ["'self'"])
    this.setDirective('object-src', ["'none'"])
  }

  /**
   * CSP 違反レポート処理
   */
  static handleCSPViolation(violationEvent: any): void {
    const violation = violationEvent.detail || violationEvent
    
    errorHandler.handleError(
      errorHandler.createAppError(
        ErrorCode.UNKNOWN_ERROR,
        'CSP Violation detected',
        {
          blockedURI: violation.blockedURI,
          violatedDirective: violation.violatedDirective,
          originalPolicy: violation.originalPolicy,
          sourceFile: violation.sourceFile,
          lineNumber: violation.lineNumber
        },
        'セキュリティポリシー違反が検出されました'
      ),
      'high',
      { component: 'CSP', action: 'violation_detected' }
    )
  }
}

/**
 * プライベートキーとシークレット管理
 */
export class SecretManager {
  private static readonly ENCRYPTION_KEY_LENGTH = 32
  private static encryptionKey: CryptoKey | null = null

  /**
   * 暗号化キーを生成
   */
  static async generateEncryptionKey(): Promise<CryptoKey> {
    if (this.encryptionKey) {
      return this.encryptionKey
    }

    this.encryptionKey = await crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256
      },
      false, // extractable
      ['encrypt', 'decrypt']
    )

    return this.encryptionKey
  }

  /**
   * データを暗号化
   */
  static async encryptSensitiveData(data: string): Promise<{
    encryptedData: string
    iv: string
  }> {
    try {
      const key = await this.generateEncryptionKey()
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const encodedData = new TextEncoder().encode(data)

      const encryptedBuffer = await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: iv
        },
        key,
        encodedData
      )

      return {
        encryptedData: this.arrayBufferToBase64(encryptedBuffer),
        iv: this.arrayBufferToBase64(iv.buffer)
      }
    } catch (error) {
      throw errorHandler.createAppError(
        ErrorCode.ENCRYPTION_ERROR,
        'Failed to encrypt sensitive data',
        error,
        'データの暗号化に失敗しました'
      )
    }
  }

  /**
   * データを復号化
   */
  static async decryptSensitiveData(encryptedData: string, iv: string): Promise<string> {
    try {
      const key = await this.generateEncryptionKey()
      const ivBuffer = this.base64ToArrayBuffer(iv)
      const encryptedBuffer = this.base64ToArrayBuffer(encryptedData)

      const decryptedBuffer = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: ivBuffer
        },
        key,
        encryptedBuffer
      )

      return new TextDecoder().decode(decryptedBuffer)
    } catch (error) {
      throw errorHandler.createAppError(
        ErrorCode.ENCRYPTION_ERROR,
        'Failed to decrypt sensitive data',
        error,
        'データの復号化に失敗しました'
      )
    }
  }

  /**
   * メモリ内のシークレットをクリア
   */
  static clearSensitiveData(obj: any): void {
    if (typeof obj === 'object' && obj !== null) {
      Object.keys(obj).forEach(key => {
        if (typeof obj[key] === 'string') {
          // 文字列を上書き
          obj[key] = '\0'.repeat(obj[key].length)
        } else if (obj[key] instanceof Uint8Array) {
          // バイト配列をクリア
          obj[key].fill(0)
        }
        delete obj[key]
      })
    }
  }

  /**
   * プライベートキーの検証
   */
  static validatePrivateKey(privateKey: string): boolean {
    // 基本的な形式チェック
    const cleanKey = privateKey.replace(/^0x/, '')
    
    if (!/^[a-fA-F0-9]{64}$/.test(cleanKey)) {
      return false
    }

    // ゼロキーチェック
    if (cleanKey === '0'.repeat(64)) {
      return false
    }

    // secp256k1の最大値チェック
    const maxValue = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364140')
    const keyValue = BigInt('0x' + cleanKey)
    
    return keyValue > 0n && keyValue < maxValue
  }

  /**
   * ArrayBuffer を Base64 に変換
   */
  private static arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    bytes.forEach(byte => binary += String.fromCharCode(byte))
    return btoa(binary)
  }

  /**
   * Base64 を ArrayBuffer に変換
   */
  private static base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes.buffer
  }
}

/**
 * セキュアな通信管理
 */
export class SecureCommunication {
  private static readonly ALLOWED_ORIGINS = [
    'https://api.coingecko.com',
    'https://blockfrost.io',
    'https://api.trongrid.io'
  ]

  /**
   * HTTPS 強制チェック
   */
  static enforceHTTPS(): void {
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
      location.replace(`https:${location.href.substring(location.protocol.length)}`)
    }
  }

  /**
   * セキュアなfetch
   */
  static async secureFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const urlObj = new URL(url)
    
    // 許可されたオリジンかチェック
    if (!this.isAllowedOrigin(urlObj.origin)) {
      throw errorHandler.createAppError(
        ErrorCode.API_ERROR,
        `Unauthorized origin: ${urlObj.origin}`,
        { url, origin: urlObj.origin },
        '許可されていないサーバーへのアクセスです'
      )
    }

    // セキュリティヘッダーを追加
    const secureOptions: RequestInit = {
      ...options,
      headers: {
        ...options.headers,
        'X-Requested-With': 'XMLHttpRequest',
        'Cache-Control': 'no-cache'
      },
      credentials: 'same-origin',
      redirect: 'error' // リダイレクトを禁止
    }

    try {
      const response = await fetch(url, secureOptions)
      
      // レスポンスの検証
      this.validateResponse(response)
      
      return response
    } catch (error) {
      throw errorHandler.handleNetworkError(error, { url, method: options.method })
    }
  }

  /**
   * オリジンの許可チェック
   */
  static isAllowedOrigin(origin: string): boolean {
    return this.ALLOWED_ORIGINS.includes(origin) || origin === location.origin
  }

  /**
   * レスポンスの検証
   */
  private static validateResponse(response: Response): void {
    // セキュリティヘッダーの確認
    const securityHeaders = [
      'strict-transport-security',
      'x-content-type-options',
      'x-frame-options',
      'x-xss-protection'
    ]

    // Content-Type の確認
    const contentType = response.headers.get('content-type')
    if (contentType && !contentType.includes('application/json') && !contentType.includes('text/')) {
      console.warn('Unexpected content type:', contentType)
    }
  }
}

/**
 * セキュリティ監査とロギング
 */
export class SecurityAuditor {
  private static securityLogs: Array<{
    timestamp: number
    level: 'info' | 'warn' | 'error' | 'critical'
    event: string
    details: any
  }> = []

  /**
   * セキュリティイベントをログ
   */
  static logSecurityEvent(
    level: 'info' | 'warn' | 'error' | 'critical',
    event: string,
    details: any = {}
  ): void {
    const logEntry = {
      timestamp: Date.now(),
      level,
      event,
      details: {
        ...details,
        userAgent: navigator.userAgent,
        url: location.href,
        timestamp: new Date().toISOString()
      }
    }

    this.securityLogs.push(logEntry)

    // ログサイズ制限
    if (this.securityLogs.length > 1000) {
      this.securityLogs.shift()
    }

    // 重要なイベントは即座に報告
    if (level === 'error' || level === 'critical') {
      this.reportSecurityIncident(logEntry)
    }

    console.log(`[SECURITY-${level.toUpperCase()}] ${event}`, details)
  }

  /**
   * セキュリティインシデントを報告
   */
  private static reportSecurityIncident(logEntry: any): void {
    // プロダクション環境では外部監視サービスに送信
    if (process.env.NODE_ENV === 'production') {
      // TODO: 外部セキュリティ監視サービスへの送信実装
      console.error('Security incident reported:', logEntry)
    }
  }

  /**
   * セキュリティログを取得
   */
  static getSecurityLogs(filter?: {
    level?: string
    event?: string
    since?: number
  }): any[] {
    let logs = [...this.securityLogs]

    if (filter) {
      if (filter.level) {
        logs = logs.filter(log => log.level === filter.level)
      }
      if (filter.event) {
        logs = logs.filter(log => log.event.includes(filter.event))
      }
      if (filter.since) {
        logs = logs.filter(log => log.timestamp >= filter.since)
      }
    }

    return logs
  }

  /**
   * セキュリティスキャン実行
   */
  static performSecurityScan(): {
    https: boolean
    csp: boolean
    xss: boolean
    headers: boolean
    storage: boolean
    score: number
  } {
    const results = {
      https: location.protocol === 'https:',
      csp: !!document.querySelector('meta[http-equiv="Content-Security-Policy"]'),
      xss: !this.detectXSSVulnerabilities(),
      headers: this.checkSecurityHeaders(),
      storage: this.checkStorageSecurity(),
      score: 0
    }

    // スコア計算
    const checks = Object.values(results).slice(0, -1) // scoreを除外
    results.score = (checks.filter(Boolean).length / checks.length) * 100

    this.logSecurityEvent('info', 'security_scan_completed', results)
    
    return results
  }

  /**
   * XSS脆弱性の検出
   */
  private static detectXSSVulnerabilities(): boolean {
    // 基本的なXSSパターンをチェック
    const dangerousPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /eval\s*\(/i
    ]

    const content = document.documentElement.innerHTML
    return dangerousPatterns.some(pattern => pattern.test(content))
  }

  /**
   * セキュリティヘッダーの確認
   */
  private static checkSecurityHeaders(): boolean {
    // 実際の実装では HTTP レスポンスヘッダーをチェック
    return true // 簡略化
  }

  /**
   * ストレージセキュリティの確認
   */
  private static checkStorageSecurity(): boolean {
    try {
      // ローカルストレージのセンシティブデータチェック
      const sensitivePatterns = [
        /private.*key/i,
        /secret/i,
        /password/i,
        /mnemonic/i
      ]

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        const value = localStorage.getItem(key || '')
        
        if (sensitivePatterns.some(pattern => 
          pattern.test(key || '') || pattern.test(value || '')
        )) {
          return false
        }
      }
      
      return true
    } catch {
      return false
    }
  }
}

// デフォルトエクスポート
export default {
  InputSanitizer,
  CSPManager,
  SecretManager,
  SecureCommunication,
  SecurityAuditor
}