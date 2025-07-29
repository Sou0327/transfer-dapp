/**
 * 包括的セキュリティミドルウェア
 * API レベルでのセキュリティ保護、レート制限、入力検証、異常検知を提供
 */

import { Request, Response, NextFunction } from 'express'
import rateLimit from 'express-rate-limit'
import slowDown from 'express-slow-down'
import helmet from 'helmet'
import { z } from 'zod'
import { ethers } from 'ethers'

// セキュリティログ
interface SecurityLog {
  timestamp: Date
  ip: string
  userAgent?: string
  endpoint: string
  method: string
  violation: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  details: Record<string, any>
  blocked: boolean
}

// IP統計
interface IPStats {
  requestCount: number
  errorCount: number
  lastRequest: Date
  firstSeen: Date
  blocked: boolean
  blockReason?: string
  suspiciousActivity: string[]
}

// 異常検知パターン
interface AnomalyPattern {
  name: string
  description: string
  check: (req: Request, ipStats: IPStats) => boolean
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  action: 'LOG' | 'SLOW' | 'BLOCK'
}

/**
 * セキュリティミドルウェアクラス
 */
class SecurityMiddleware {
  private securityLogs: SecurityLog[] = []
  private ipStats: Map<string, IPStats> = new Map()
  private blockedIPs: Set<string> = new Set()
  private anomalyPatterns: AnomalyPattern[] = []

  constructor() {
    this.initializeAnomalyPatterns()
  }

  /**
   * 異常検知パターンの初期化
   */
  private initializeAnomalyPatterns() {
    this.anomalyPatterns = [
      {
        name: 'rapid_fire_requests',
        description: '短時間での大量リクエスト',
        check: (req, ipStats) => {
          const recentWindow = 60000 // 1分
          const threshold = 50
          return ipStats.requestCount > threshold &&
                 Date.now() - ipStats.firstSeen.getTime() < recentWindow
        },
        severity: 'HIGH',
        action: 'BLOCK'
      },
      {
        name: 'signature_bruteforce',
        description: '署名エンドポイントへの連続失敗',
        check: (req, ipStats) => {
          return req.path.includes('signature') &&
                 ipStats.errorCount > 10 &&
                 ipStats.errorCount / ipStats.requestCount > 0.8
        },
        severity: 'CRITICAL',
        action: 'BLOCK'
      },
      {
        name: 'invalid_address_pattern',
        description: '無効なアドレス形式の連続送信',
        check: (req, ipStats) => {
          return ipStats.suspiciousActivity.filter(
            activity => activity.includes('invalid_address')
          ).length > 5
        },
        severity: 'MEDIUM',
        action: 'SLOW'
      },
      {
        name: 'nonce_enumeration',
        description: 'nonce列挙攻撃の可能性',
        check: (req, ipStats) => {
          return req.path.includes('nonce') &&
                 ipStats.requestCount > 100 &&
                 Date.now() - ipStats.firstSeen.getTime() < 3600000 // 1時間
        },
        severity: 'HIGH',
        action: 'BLOCK'
      },
      {
        name: 'suspicious_user_agent',
        description: '疑わしいUser-Agent',
        check: (req, ipStats) => {
          const suspiciousAgents = ['bot', 'crawler', 'scanner', 'test']
          const userAgent = req.get('User-Agent')?.toLowerCase() || ''
          return suspiciousAgents.some(agent => userAgent.includes(agent))
        },
        severity: 'LOW',
        action: 'LOG'
      }
    ]
  }

  /**
   * セキュリティログ記録
   */
  private logSecurityEvent(
    req: Request,
    violation: string,
    severity: SecurityLog['severity'],
    details: Record<string, any> = {},
    blocked: boolean = false
  ) {
    const log: SecurityLog = {
      timestamp: new Date(),
      ip: this.getClientIP(req),
      userAgent: req.get('User-Agent'),
      endpoint: req.path,
      method: req.method,
      violation,
      severity,
      details,
      blocked
    }

    this.securityLogs.push(log)

    // メモリ管理: 最新1000件のみ保持
    if (this.securityLogs.length > 1000) {
      this.securityLogs = this.securityLogs.slice(-1000)
    }

    // 重要度に応じてコンソール出力
    if (severity === 'CRITICAL' || severity === 'HIGH') {
      console.warn(`[SECURITY] ${severity}: ${violation}`, {
        ip: log.ip,
        endpoint: log.endpoint,
        details
      })
    }
  }

  /**
   * クライアントIP取得
   */
  private getClientIP(req: Request): string {
    return (req.get('X-Forwarded-For') ||
            req.get('X-Real-IP') ||
            req.connection.remoteAddress ||
            req.ip ||
            'unknown').split(',')[0].trim()
  }

  /**
   * IP統計更新
   */
  private updateIPStats(req: Request, isError: boolean = false) {
    const ip = this.getClientIP(req)
    let stats = this.ipStats.get(ip)

    if (!stats) {
      stats = {
        requestCount: 0,
        errorCount: 0,
        lastRequest: new Date(),
        firstSeen: new Date(),
        blocked: false,
        suspiciousActivity: []
      }
      this.ipStats.set(ip, stats)
    }

    stats.requestCount++
    stats.lastRequest = new Date()
    
    if (isError) {
      stats.errorCount++
    }
  }

  /**
   * 異常検知
   */
  private detectAnomalies(req: Request): AnomalyPattern[] {
    const ip = this.getClientIP(req)
    const ipStats = this.ipStats.get(ip)
    
    if (!ipStats) return []

    return this.anomalyPatterns.filter(pattern => pattern.check(req, ipStats))
  }

  /**
   * ヘルメットセキュリティヘッダー
   */
  public helmet() {
    return helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "https://api.blockfrost.io"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"]
        }
      },
      crossOriginEmbedderPolicy: false // Web3プロバイダー対応
    })
  }

  /**
   * レート制限
   */
  public rateLimit() {
    return rateLimit({
      windowMs: 15 * 60 * 1000, // 15分
      max: (req: Request) => {
        // エンドポイント別の制限
        if (req.path.includes('sign-requests')) return 20
        if (req.path.includes('signature')) return 10
        if (req.path.includes('settlements')) return 5
        return 100 // デフォルト
      },
      message: {
        error: 'レート制限に達しました',
        retryAfter: '15分後に再試行してください'
      },
      standardHeaders: true,
      legacyHeaders: false,
      onLimitReached: (req: Request) => {
        this.logSecurityEvent(
          req,
          'rate_limit_exceeded',
          'MEDIUM',
          { windowMs: 15 * 60 * 1000 },
          true
        )
      }
    })
  }

  /**
   * スローダウン
   */
  public slowDown() {
    return slowDown({
      windowMs: 15 * 60 * 1000, // 15分
      delayAfter: 5, // 5リクエスト後から遅延開始
      delayMs: 500, // 500ms遅延
      maxDelayMs: 20000, // 最大20秒遅延
      onLimitReached: (req: Request) => {
        this.logSecurityEvent(
          req,
          'slowdown_activated',
          'LOW',
          { delayAfter: 5 }
        )
      }
    })
  }

  /**
   * 入力検証ミドルウェア
   */
  public validateInput(schema: z.ZodSchema) {
    return (req: Request, res: Response, next: NextFunction) => {
      try {
        // ボディ検証
        if (Object.keys(req.body).length > 0) {
          req.body = schema.parse(req.body)
        }

        // Ethereumアドレス検証
        this.validateEthereumAddresses(req)

        // 金額検証
        this.validateAmounts(req)

        next()
      } catch (error) {
        this.updateIPStats(req, true)
        
        if (error instanceof z.ZodError) {
          this.logSecurityEvent(
            req,
            'input_validation_failed',
            'MEDIUM',
            { 
              errors: error.errors,
              input: req.body 
            }
          )

          return res.status(400).json({
            success: false,
            error: 'Invalid input data',
            details: error.errors
          })
        }

        this.logSecurityEvent(
          req,
          'validation_error',
          'HIGH',
          { error: error instanceof Error ? error.message : 'Unknown error' }
        )

        return res.status(400).json({
          success: false,
          error: 'Validation failed'
        })
      }
    }
  }

  /**
   * Ethereumアドレス検証
   */
  private validateEthereumAddresses(req: Request) {
    const checkAddress = (value: any, field: string) => {
      if (typeof value === 'string' && value.startsWith('0x')) {
        if (!ethers.isAddress(value)) {
          const ip = this.getClientIP(req)
          const ipStats = this.ipStats.get(ip)
          if (ipStats) {
            ipStats.suspiciousActivity.push(`invalid_address_${field}`)
          }
          throw new Error(`Invalid Ethereum address: ${field}`)
        }
      }
    }

    // 再帰的にアドレスフィールドをチェック
    const checkObject = (obj: any, path: string = '') => {
      if (typeof obj === 'object' && obj !== null) {
        for (const [key, value] of Object.entries(obj)) {
          const fieldPath = path ? `${path}.${key}` : key
          
          if (key.includes('address') || key.includes('owner') || 
              key.includes('recipient') || key.includes('token')) {
            checkAddress(value, fieldPath)
          }
          
          if (typeof value === 'object') {
            checkObject(value, fieldPath)
          }
        }
      }
    }

    checkObject(req.body)
    checkObject(req.query)
    checkObject(req.params)
  }

  /**
   * 金額検証
   */
  private validateAmounts(req: Request) {
    const checkAmount = (value: any, field: string) => {
      if (typeof value === 'string' || typeof value === 'number') {
        try {
          const amount = BigInt(value.toString())
          if (amount < 0) {
            throw new Error(`Negative amount not allowed: ${field}`)
          }
          // 非常に大きな値のチェック（overflow攻撃防止）
          if (amount > BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')) {
            throw new Error(`Amount too large: ${field}`)
          }
        } catch (error) {
          if (error instanceof Error && error.message.includes('Cannot convert')) {
            throw new Error(`Invalid amount format: ${field}`)
          }
          throw error
        }
      }
    }

    const checkObject = (obj: any, path: string = '') => {
      if (typeof obj === 'object' && obj !== null) {
        for (const [key, value] of Object.entries(obj)) {
          const fieldPath = path ? `${path}.${key}` : key
          
          if (key.includes('amount') || key.includes('value') || 
              key.includes('balance') || key.includes('nonce')) {
            checkAmount(value, fieldPath)
          }
          
          if (typeof value === 'object') {
            checkObject(value, fieldPath)
          }
        }
      }
    }

    checkObject(req.body)
    checkObject(req.query)
  }

  /**
   * 異常検知ミドルウェア
   */
  public anomalyDetection() {
    return (req: Request, res: Response, next: NextFunction) => {
      const ip = this.getClientIP(req)
      
      // ブロック済みIPチェック
      if (this.blockedIPs.has(ip)) {
        this.logSecurityEvent(
          req,
          'blocked_ip_access',
          'HIGH',
          { ip },
          true
        )
        
        return res.status(403).json({
          success: false,
          error: 'Access denied',
          message: 'Your IP has been blocked due to suspicious activity'
        })
      }

      // IP統計更新
      this.updateIPStats(req)

      // 異常検知実行
      const anomalies = this.detectAnomalies(req)
      
      for (const anomaly of anomalies) {
        this.logSecurityEvent(
          req,
          anomaly.name,
          anomaly.severity,
          { 
            description: anomaly.description,
            pattern: anomaly.name 
          },
          anomaly.action === 'BLOCK'
        )

        // アクション実行
        switch (anomaly.action) {
          case 'BLOCK':
            this.blockedIPs.add(ip)
            // 自動ブロック解除（24時間後）
            setTimeout(() => {
              this.blockedIPs.delete(ip)
              console.log(`[SECURITY] Auto-unblocked IP: ${ip}`)
            }, 24 * 60 * 60 * 1000)
            
            return res.status(403).json({
              success: false,
              error: 'Suspicious activity detected',
              message: 'Your access has been temporarily restricted'
            })

          case 'SLOW':
            // 人工的な遅延
            setTimeout(() => next(), 2000)
            return

          case 'LOG':
            // ログのみ（処理続行）
            break
        }
      }

      next()
    }
  }

  /**
   * CORS設定
   */
  public cors() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Origin検証
      const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:3001',
        'https://your-domain.com' // 実際のドメインに置き換え
      ]

      const origin = req.get('Origin')
      
      if (origin && !allowedOrigins.includes(origin)) {
        this.logSecurityEvent(
          req,
          'unauthorized_origin',
          'MEDIUM',
          { origin, allowedOrigins }
        )
      }

      // CORS ヘッダー設定
      if (origin && allowedOrigins.includes(origin)) {
        res.set('Access-Control-Allow-Origin', origin)
      }
      
      res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
      res.set('Access-Control-Allow-Credentials', 'true')
      res.set('Access-Control-Max-Age', '86400')

      if (req.method === 'OPTIONS') {
        return res.status(200).end()
      }

      next()
    }
  }

  /**
   * セキュリティレポート生成
   */
  public generateSecurityReport(timeRange?: { start: Date; end: Date }) {
    let logs = this.securityLogs

    if (timeRange) {
      logs = logs.filter(log => 
        log.timestamp >= timeRange.start && log.timestamp <= timeRange.end
      )
    }

    const summary = {
      totalEvents: logs.length,
      criticalEvents: logs.filter(log => log.severity === 'CRITICAL').length,
      blockedRequests: logs.filter(log => log.blocked).length,
      topViolations: this.getTopViolations(logs),
      topIPs: this.getTopIPs(logs),
      activeBlocks: this.blockedIPs.size
    }

    return {
      summary,
      logs: logs.slice(-100), // 最新100件
      ipStats: Array.from(this.ipStats.entries()).map(([ip, stats]) => ({
        ip,
        ...stats
      }))
    }
  }

  /**
   * 上位違反取得
   */
  private getTopViolations(logs: SecurityLog[]) {
    const violations = logs.reduce((acc, log) => {
      acc[log.violation] = (acc[log.violation] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    return Object.entries(violations)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([violation, count]) => ({ violation, count }))
  }

  /**
   * 上位IP取得
   */
  private getTopIPs(logs: SecurityLog[]) {
    const ips = logs.reduce((acc, log) => {
      acc[log.ip] = (acc[log.ip] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    return Object.entries(ips)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([ip, count]) => ({ ip, count }))
  }

  /**
   * IPブロック解除
   */
  public unblockIP(ip: string): boolean {
    return this.blockedIPs.delete(ip)
  }

  /**
   * 統計クリア
   */
  public clearStats() {
    this.securityLogs.length = 0
    this.ipStats.clear()
    this.blockedIPs.clear()
  }
}

// シングルトンインスタンス
export const securityMiddleware = new SecurityMiddleware()

// 個別ミドルウェアエクスポート
export const helmet = securityMiddleware.helmet()
export const rateLimit = securityMiddleware.rateLimit()
export const slowDown = securityMiddleware.slowDown()
export const anomalyDetection = securityMiddleware.anomalyDetection()
export const cors = securityMiddleware.cors()

export default securityMiddleware