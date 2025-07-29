/**
 * 高度なnonce管理サービス
 * Permit2 nonceBitmap管理、枯渇監視、セキュリティ統合を提供
 */

import { Pool } from 'pg'
import { EthereumAddress } from '../types/database'

// nonce予約状態
interface NonceReservation {
  id: string
  owner: EthereumAddress
  nonce: bigint
  word_pos: bigint
  bit_pos: number
  reserved_at: Date
  expires_at: Date
  used: boolean
}

// nonceBitmap統計
interface NonceBitmapStats {
  owner: EthereumAddress
  word_pos: bigint
  bitmap_value: bigint
  used_bits: number
  total_bits: number
  usage_rate: number
  last_updated: Date
  estimated_exhaustion?: Date
}

// nonce使用パターン
interface NonceUsagePattern {
  owner: EthereumAddress
  hourly_usage: number[]
  daily_usage: number[]
  peak_usage_time: number
  average_interval: number
  suspicious_patterns: string[]
  last_analysis: Date
}

// nonce枯渇警告レベル
enum NonceExhaustionLevel {
  NORMAL = 'NORMAL',
  WARNING = 'WARNING',  // 75%使用
  CRITICAL = 'CRITICAL', // 90%使用
  EMERGENCY = 'EMERGENCY' // 95%使用
}

// nonce管理設定
interface NonceConfig {
  reservationTimeout: number // 予約タイムアウト（秒）
  maxReservationsPerUser: number
  warningThreshold: number // 警告閾値（%）
  criticalThreshold: number // 危険閾値（%）
  emergencyThreshold: number // 緊急閾値（%）
  cleanupInterval: number // クリーンアップ間隔（秒）
  patternAnalysisWindow: number // パターン分析ウィンドウ（時間）
}

// デフォルト設定
const DEFAULT_NONCE_CONFIG: NonceConfig = {
  reservationTimeout: 600, // 10分
  maxReservationsPerUser: 5,
  warningThreshold: 75,
  criticalThreshold: 90,
  emergencyThreshold: 95,
  cleanupInterval: 300, // 5分
  patternAnalysisWindow: 168 // 7日
}

/**
 * 高度なnonce管理サービス
 */
export class EnhancedNonceService {
  private config: NonceConfig
  private cleanupTimer?: NodeJS.Timeout
  private patternAnalysisTimer?: NodeJS.Timeout

  constructor(
    private db: Pool,
    config: Partial<NonceConfig> = {}
  ) {
    this.config = { ...DEFAULT_NONCE_CONFIG, ...config }
    this.startCleanupTimer()
    this.startPatternAnalysis()
  }

  /**
   * 安全なnonce取得（予約システム）
   */
  async reserveNonce(owner: EthereumAddress): Promise<{
    nonce: bigint
    reservationId: string
    expiresAt: Date
  }> {
    const client = await this.db.connect()
    
    try {
      await client.query('BEGIN')

      // 現在の予約数チェック
      const { rows: existingReservations } = await client.query(
        `SELECT COUNT(*) as count 
         FROM nonce_reservations 
         WHERE owner = $1 AND expires_at > NOW() AND used = false`,
        [owner]
      )

      if (parseInt(existingReservations[0].count) >= this.config.maxReservationsPerUser) {
        throw new Error('Maximum reservations limit reached')
      }

      // 使用可能なnonceを検索
      const availableNonce = await this.findAvailableNonce(client, owner)
      
      if (!availableNonce) {
        throw new Error('No available nonce found')
      }

      // nonce予約
      const reservationId = `res_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      const expiresAt = new Date(Date.now() + this.config.reservationTimeout * 1000)

      await client.query(
        `INSERT INTO nonce_reservations 
         (id, owner, nonce, word_pos, bit_pos, reserved_at, expires_at, used)
         VALUES ($1, $2, $3, $4, $5, NOW(), $6, false)`,
        [
          reservationId,
          owner,
          availableNonce.nonce.toString(),
          availableNonce.word_pos.toString(),
          availableNonce.bit_pos,
          expiresAt
        ]
      )

      // nonceBitmap統計更新
      await this.updateNonceBitmapStats(client, owner, availableNonce.word_pos)

      await client.query('COMMIT')

      // 枯渇チェック
      await this.checkNonceExhaustion(owner)

      return {
        nonce: availableNonce.nonce,
        reservationId,
        expiresAt
      }

    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  /**
   * 使用可能なnonce検索
   */
  private async findAvailableNonce(
    client: any,
    owner: EthereumAddress
  ): Promise<{
    nonce: bigint
    word_pos: bigint
    bit_pos: number
  } | null> {
    // 最新のnonceBitmap状態を取得
    const { rows: bitmapRows } = await client.query(
      `SELECT word_pos, bitmap_value 
       FROM nonce_bitmap_stats 
       WHERE owner = $1 
       ORDER BY word_pos DESC 
       LIMIT 10`,
      [owner]
    )

    // 既存の予約を取得
    const { rows: reservationRows } = await client.query(
      `SELECT nonce 
       FROM nonce_reservations 
       WHERE owner = $1 AND expires_at > NOW() AND used = false`,
      [owner]
    )

    const reservedNonces = new Set(
      reservationRows.map(row => BigInt(row.nonce))
    )

    // 使用済みnonceを取得
    const { rows: usedNonceRows } = await client.query(
      `SELECT nonce 
       FROM signing_requests 
       WHERE owner = $1 AND status != 'CANCELLED'`,
      [owner]
    )

    const usedNonces = new Set(
      usedNonceRows.map(row => BigInt(row.nonce))
    )

    // 各wordでの使用可能なnonceを検索
    for (const bitmapRow of bitmapRows) {
      const wordPos = BigInt(bitmapRow.word_pos)
      const bitmapValue = BigInt(bitmapRow.bitmap_value)

      // 各bitをチェック
      for (let bitPos = 0; bitPos < 256; bitPos++) {
        const mask = BigInt(1) << BigInt(bitPos)
        const isUsed = (bitmapValue & mask) !== BigInt(0)
        
        if (!isUsed) {
          const nonce = (wordPos << BigInt(8)) + BigInt(bitPos)
          
          // 予約済みまたは使用済みでないことを確認
          if (!reservedNonces.has(nonce) && !usedNonces.has(nonce)) {
            return {
              nonce,
              word_pos: wordPos,
              bit_pos: bitPos
            }
          }
        }
      }
    }

    // 新しいwordを作成
    const nextWordPos = bitmapRows.length > 0 
      ? BigInt(bitmapRows[0].word_pos) + BigInt(1)
      : BigInt(0)

    return {
      nonce: nextWordPos << BigInt(8), // bit_pos = 0
      word_pos: nextWordPos,
      bit_pos: 0
    }
  }

  /**
   * nonce使用確認
   */
  async confirmNonceUsage(
    reservationId: string,
    signature: string
  ): Promise<void> {
    const client = await this.db.connect()
    
    try {
      await client.query('BEGIN')

      // 予約情報取得
      const { rows: reservationRows } = await client.query(
        `SELECT * FROM nonce_reservations 
         WHERE id = $1 AND used = false AND expires_at > NOW()`,
        [reservationId]
      )

      if (reservationRows.length === 0) {
        throw new Error('Invalid or expired reservation')
      }

      const reservation = reservationRows[0]

      // 予約を使用済みにマーク
      await client.query(
        `UPDATE nonce_reservations 
         SET used = true, used_at = NOW(), signature = $2
         WHERE id = $1`,
        [reservationId, signature]
      )

      // nonceBitmap更新
      await client.query(
        `UPDATE nonce_bitmap_stats 
         SET bitmap_value = bitmap_value | (1::bit(256) << $3),
             used_bits = used_bits + 1,
             last_updated = NOW()
         WHERE owner = $1 AND word_pos = $2`,
        [
          reservation.owner,
          reservation.word_pos,
          reservation.bit_pos
        ]
      )

      await client.query('COMMIT')

      // 使用パターン分析
      await this.updateUsagePattern(reservation.owner)

    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  /**
   * nonce枯渇チェック
   */
  async checkNonceExhaustion(owner: EthereumAddress): Promise<{
    level: NonceExhaustionLevel
    stats: NonceBitmapStats[]
    recommendations: string[]
  }> {
    const { rows } = await this.db.query(
      `SELECT * FROM nonce_bitmap_stats 
       WHERE owner = $1 
       ORDER BY word_pos DESC`,
      [owner]
    )

    const stats: NonceBitmapStats[] = rows.map(row => ({
      owner: row.owner,
      word_pos: BigInt(row.word_pos),
      bitmap_value: BigInt(row.bitmap_value),
      used_bits: row.used_bits,
      total_bits: 256,
      usage_rate: (row.used_bits / 256) * 100,
      last_updated: row.last_updated,
      estimated_exhaustion: this.calculateEstimatedExhaustion(
        row.used_bits,
        owner,
        row.last_updated
      )
    }))

    // 最高使用率を取得
    const maxUsageRate = Math.max(...stats.map(s => s.usage_rate))
    
    let level: NonceExhaustionLevel
    if (maxUsageRate >= this.config.emergencyThreshold) {
      level = NonceExhaustionLevel.EMERGENCY
    } else if (maxUsageRate >= this.config.criticalThreshold) {
      level = NonceExhaustionLevel.CRITICAL
    } else if (maxUsageRate >= this.config.warningThreshold) {
      level = NonceExhaustionLevel.WARNING
    } else {
      level = NonceExhaustionLevel.NORMAL
    }

    const recommendations = this.generateNonceRecommendations(level, stats)

    // 緊急アラート
    if (level === NonceExhaustionLevel.EMERGENCY || level === NonceExhaustionLevel.CRITICAL) {
      await this.sendNonceExhaustionAlert(owner, level, stats)
    }

    return { level, stats, recommendations }
  }

  /**
   * 枯渇予測計算
   */
  private async calculateEstimatedExhaustion(
    usedBits: number,
    owner: EthereumAddress,
    lastUpdated: Date
  ): Promise<Date | undefined> {
    if (usedBits < 50) return undefined // 十分な余裕がある場合

    // 過去7日の使用パターンを取得
    const { rows } = await this.db.query(
      `SELECT AVG(daily_usage) as avg_daily_usage
       FROM nonce_usage_patterns 
       WHERE owner = $1 AND last_analysis > NOW() - INTERVAL '7 days'`,
      [owner]
    )

    if (rows.length === 0 || !rows[0].avg_daily_usage) return undefined

    const avgDailyUsage = parseFloat(rows[0].avg_daily_usage)
    const remainingBits = 256 - usedBits
    const daysToExhaustion = remainingBits / avgDailyUsage

    return new Date(Date.now() + daysToExhaustion * 24 * 60 * 60 * 1000)
  }

  /**
   * nonce推奨事項生成
   */
  private generateNonceRecommendations(
    level: NonceExhaustionLevel,
    stats: NonceBitmapStats[]
  ): string[] {
    const recommendations: string[] = []

    switch (level) {
      case NonceExhaustionLevel.EMERGENCY:
        recommendations.push('緊急: 新しいwordの準備が必要です')
        recommendations.push('現在の取引を最小限に抑えてください')
        recommendations.push('nonce使用パターンを最適化してください')
        break

      case NonceExhaustionLevel.CRITICAL:
        recommendations.push('重要: 新しいwordへの移行を準備してください')
        recommendations.push('使用頻度の高い時間帯を避けてください')
        break

      case NonceExhaustionLevel.WARNING:
        recommendations.push('注意: nonce使用率が高くなっています')
        recommendations.push('定期的な監視を継続してください')
        break

      case NonceExhaustionLevel.NORMAL:
        recommendations.push('nonce使用状況は正常です')
        break
    }

    // 統計に基づく追加推奨事項
    const highUsageWords = stats.filter(s => s.usage_rate > 80)
    if (highUsageWords.length > 0) {
      recommendations.push(`${highUsageWords.length}個のwordで使用率80%超過`)
    }

    return recommendations
  }

  /**
   * nonce枯渇アラート送信
   */
  private async sendNonceExhaustionAlert(
    owner: EthereumAddress,
    level: NonceExhaustionLevel,
    stats: NonceBitmapStats[]
  ): Promise<void> {
    // データベースにアラート記録
    await this.db.query(
      `INSERT INTO security_alerts (owner, type, severity, details, created_at)
       VALUES ($1, 'nonce_exhaustion', $2, $3, NOW())`,
      [
        owner,
        level,
        JSON.stringify({
          level,
          stats: stats.map(s => ({
            word_pos: s.word_pos.toString(),
            usage_rate: s.usage_rate,
            estimated_exhaustion: s.estimated_exhaustion
          }))
        })
      ]
    )

    // TODO: 実際のアラート送信（メール、Slack等）
    console.warn(`[NONCE ALERT] ${level} for ${owner}:`, {
      level,
      maxUsageRate: Math.max(...stats.map(s => s.usage_rate))
    })
  }

  /**
   * 使用パターン更新
   */
  private async updateUsagePattern(owner: EthereumAddress): Promise<void> {
    const now = new Date()
    const hour = now.getHours()
    const dayOfWeek = now.getDay()

    // 現在のパターンを取得または作成
    const { rows } = await this.db.query(
      `SELECT * FROM nonce_usage_patterns WHERE owner = $1`,
      [owner]
    )

    if (rows.length === 0) {
      // 新規パターン作成
      const hourlyUsage = new Array(24).fill(0)
      const dailyUsage = new Array(7).fill(0)
      
      hourlyUsage[hour] = 1
      dailyUsage[dayOfWeek] = 1

      await this.db.query(
        `INSERT INTO nonce_usage_patterns 
         (owner, hourly_usage, daily_usage, peak_usage_time, average_interval, 
          suspicious_patterns, last_analysis)
         VALUES ($1, $2, $3, $4, 0, '{}', NOW())`,
        [owner, hourlyUsage, dailyUsage, hour]
      )
    } else {
      // 既存パターン更新
      const pattern = rows[0]
      const hourlyUsage = pattern.hourly_usage
      const dailyUsage = pattern.daily_usage

      hourlyUsage[hour]++
      dailyUsage[dayOfWeek]++

      // ピーク使用時間計算
      const peakHour = hourlyUsage.indexOf(Math.max(...hourlyUsage))

      await this.db.query(
        `UPDATE nonce_usage_patterns 
         SET hourly_usage = $2, daily_usage = $3, peak_usage_time = $4, 
             last_analysis = NOW()
         WHERE owner = $1`,
        [owner, hourlyUsage, dailyUsage, peakHour]
      )
    }
  }

  /**
   * nonceBitmap統計更新
   */
  private async updateNonceBitmapStats(
    client: any,
    owner: EthereumAddress,
    wordPos: bigint
  ): Promise<void> {
    // 統計レコードの存在確認
    const { rows } = await client.query(
      `SELECT * FROM nonce_bitmap_stats 
       WHERE owner = $1 AND word_pos = $2`,
      [owner, wordPos.toString()]
    )

    if (rows.length === 0) {
      // 新規統計レコード作成
      await client.query(
        `INSERT INTO nonce_bitmap_stats 
         (owner, word_pos, bitmap_value, used_bits, last_updated)
         VALUES ($1, $2, 0, 0, NOW())`,
        [owner, wordPos.toString()]
      )
    }
  }

  /**
   * 期限切れ予約のクリーンアップ
   */
  private async cleanupExpiredReservations(): Promise<void> {
    try {
      const { rowCount } = await this.db.query(
        `DELETE FROM nonce_reservations 
         WHERE expires_at < NOW() AND used = false`
      )

      if (rowCount && rowCount > 0) {
        console.log(`[NonceService] Cleaned up ${rowCount} expired reservations`)
      }
    } catch (error) {
      console.error('[NonceService] Cleanup failed:', error)
    }
  }

  /**
   * クリーンアップタイマー開始
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(
      () => this.cleanupExpiredReservations(),
      this.config.cleanupInterval * 1000
    )
  }

  /**
   * パターン分析タイマー開始
   */
  private startPatternAnalysis(): void {
    this.patternAnalysisTimer = setInterval(
      () => this.analyzeGlobalUsagePatterns(),
      60 * 60 * 1000 // 1時間間隔
    )
  }

  /**
   * グローバル使用パターン分析
   */
  private async analyzeGlobalUsagePatterns(): Promise<void> {
    try {
      // 異常な使用パターンを検出
      const { rows } = await this.db.query(
        `SELECT owner, SUM(used_bits) as total_used,
                AVG(usage_rate) as avg_usage_rate
         FROM nonce_bitmap_stats 
         WHERE last_updated > NOW() - INTERVAL '24 hours'
         GROUP BY owner
         HAVING AVG(usage_rate) > 50
         ORDER BY avg_usage_rate DESC
         LIMIT 10`
      )

      for (const row of rows) {
        await this.checkNonceExhaustion(row.owner)
      }

      console.log(`[NonceService] Analyzed ${rows.length} high-usage accounts`)
    } catch (error) {
      console.error('[NonceService] Pattern analysis failed:', error)
    }
  }

  /**
   * サービス停止
   */
  async shutdown(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
    }
    if (this.patternAnalysisTimer) {
      clearInterval(this.patternAnalysisTimer)
    }
    
    // 最終クリーンアップ
    await this.cleanupExpiredReservations()
  }

  /**
   * 統計取得
   */
  async getGlobalStats(): Promise<{
    totalReservations: number
    activeReservations: number
    totalUsers: number
    averageUsageRate: number
    criticalUsers: number
  }> {
    const [reservationStats, userStats] = await Promise.all([
      this.db.query(
        `SELECT 
           COUNT(*) as total_reservations,
           COUNT(*) FILTER (WHERE expires_at > NOW() AND used = false) as active_reservations
         FROM nonce_reservations`
      ),
      this.db.query(
        `SELECT 
           COUNT(DISTINCT owner) as total_users,
           AVG(used_bits * 100.0 / 256) as avg_usage_rate,
           COUNT(*) FILTER (WHERE (used_bits * 100.0 / 256) > 90) as critical_users
         FROM nonce_bitmap_stats`
      )
    ])

    return {
      totalReservations: parseInt(reservationStats.rows[0].total_reservations),
      activeReservations: parseInt(reservationStats.rows[0].active_reservations),
      totalUsers: parseInt(userStats.rows[0].total_users),
      averageUsageRate: parseFloat(userStats.rows[0].avg_usage_rate) || 0,
      criticalUsers: parseInt(userStats.rows[0].critical_users)
    }
  }
}

export default EnhancedNonceService