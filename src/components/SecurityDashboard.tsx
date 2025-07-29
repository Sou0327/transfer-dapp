// セキュリティダッシュボードコンポーネント

import React, { useState, useEffect, useCallback } from 'react'
import { useSecurity, useSecurityMetrics } from '@/hooks/useSecurity'
import { SecurityAuditor } from '@/utils/security'

interface SecurityDashboardProps {
  className?: string
  showDetails?: boolean
  autoRefresh?: boolean
  refreshInterval?: number
}

/**
 * セキュリティダッシュボードコンポーネント
 * アプリケーションのセキュリティ状態を監視・表示
 */
const SecurityDashboard: React.FC<SecurityDashboardProps> = ({
  className = '',
  showDetails = false,
  autoRefresh = true,
  refreshInterval = 30000
}) => {
  const { 
    isSecureEnvironment, 
    securityLevel, 
    lastSecurityScan, 
    performSecurityScan 
  } = useSecurity()
  const { metrics, updateMetrics, refreshSecurityScore } = useSecurityMetrics()
  
  const [isLoading, setIsLoading] = useState(false)
  const [scanResults, setScanResults] = useState<any>(null)
  const [recentLogs, setRecentLogs] = useState<any[]>([])
  const [showAdvanced, setShowAdvanced] = useState(false)

  // セキュリティスキャンの実行
  const handleSecurityScan = useCallback(async () => {
    setIsLoading(true)
    try {
      const results = await performSecurityScan()
      setScanResults(results)
      await refreshSecurityScore()
    } catch (error) {
      console.error('Security scan failed:', error)
    } finally {
      setIsLoading(false)
    }
  }, [performSecurityScan, refreshSecurityScore])

  // 最新ログの取得
  const fetchRecentLogs = useCallback(() => {
    const logs = SecurityAuditor.getSecurityLogs({
      since: Date.now() - 24 * 60 * 60 * 1000 // 過去24時間
    })
    setRecentLogs(logs.slice(-10)) // 最新10件
  }, [])

  // 自動更新
  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        updateMetrics()
        fetchRecentLogs()
      }, refreshInterval)

      return () => clearInterval(interval)
    }
  }, [autoRefresh, refreshInterval, updateMetrics, fetchRecentLogs])

  // 初期化
  useEffect(() => {
    fetchRecentLogs()
    if (!scanResults) {
      handleSecurityScan()
    }
  }, [fetchRecentLogs, handleSecurityScan, scanResults])

  // セキュリティレベルの色を取得
  const getSecurityLevelColor = (level: string) => {
    switch (level) {
      case 'high': return '#28a745'
      case 'medium': return '#ffc107'
      case 'low': return '#dc3545'
      default: return '#6c757d'
    }
  }

  // セキュリティスコアの色を取得
  const getScoreColor = (score: number) => {
    if (score >= 90) return '#28a745'
    if (score >= 70) return '#ffc107'
    if (score >= 50) return '#fd7e14'
    return '#dc3545'
  }

  return (
    <div className={`security-dashboard ${className}`}>
      <div className="dashboard-header">
        <div className="header-info">
          <h3>セキュリティダッシュボード</h3>
          <div className="last-update">
            最終更新: {lastSecurityScan ? new Date(lastSecurityScan).toLocaleString() : '未実行'}
          </div>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={handleSecurityScan}
            disabled={isLoading}
            className="scan-button"
          >
            {isLoading ? '🔄 スキャン中...' : '🔍 セキュリティスキャン'}
          </button>
          
          <button 
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="toggle-button"
          >
            {showAdvanced ? '📊 基本表示' : '🔧 詳細表示'}
          </button>
        </div>
      </div>

      {/* セキュリティ概要 */}
      <div className="security-overview">
        <div className="metric-card">
          <div className="metric-icon">🛡️</div>
          <div className="metric-content">
            <h4>セキュリティ環境</h4>
            <div className={`metric-value ${isSecureEnvironment ? 'secure' : 'insecure'}`}>
              {isSecureEnvironment ? '安全' : '注意が必要'}
            </div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon">📊</div>
          <div className="metric-content">
            <h4>セキュリティレベル</h4>
            <div 
              className="metric-value level"
              style={{ color: getSecurityLevelColor(securityLevel) }}
            >
              {securityLevel.toUpperCase()}
            </div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon">⭐</div>
          <div className="metric-content">
            <h4>セキュリティスコア</h4>
            <div 
              className="metric-value score"
              style={{ color: getScoreColor(metrics.securityScore) }}
            >
              {metrics.securityScore}/100
            </div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon">⚠️</div>
          <div className="metric-content">
            <h4>セキュリティイベント</h4>
            <div className="metric-value events">
              エラー: {metrics.errorEvents} | 警告: {metrics.warningEvents}
            </div>
          </div>
        </div>
      </div>

      {/* 詳細スキャン結果 */}
      {scanResults && (showDetails || showAdvanced) && (
        <div className="scan-results">
          <h4>スキャン結果詳細</h4>
          <div className="scan-grid">
            <div className={`scan-item ${scanResults.https ? 'pass' : 'fail'}`}>
              <span className="scan-icon">{scanResults.https ? '✅' : '❌'}</span>
              <span className="scan-label">HTTPS</span>
              <span className="scan-status">{scanResults.https ? 'OK' : 'NG'}</span>
            </div>

            <div className={`scan-item ${scanResults.csp ? 'pass' : 'fail'}`}>
              <span className="scan-icon">{scanResults.csp ? '✅' : '❌'}</span>
              <span className="scan-label">CSP</span>
              <span className="scan-status">{scanResults.csp ? 'OK' : 'NG'}</span>
            </div>

            <div className={`scan-item ${scanResults.xss ? 'pass' : 'fail'}`}>
              <span className="scan-icon">{scanResults.xss ? '✅' : '❌'}</span>
              <span className="scan-label">XSS対策</span>
              <span className="scan-status">{scanResults.xss ? 'OK' : 'NG'}</span>
            </div>

            <div className={`scan-item ${scanResults.headers ? 'pass' : 'fail'}`}>
              <span className="scan-icon">{scanResults.headers ? '✅' : '❌'}</span>
              <span className="scan-label">セキュリティヘッダー</span>
              <span className="scan-status">{scanResults.headers ? 'OK' : 'NG'}</span>
            </div>

            <div className={`scan-item ${scanResults.storage ? 'pass' : 'fail'}`}>
              <span className="scan-icon">{scanResults.storage ? '✅' : '❌'}</span>
              <span className="scan-label">ストレージセキュリティ</span>
              <span className="scan-status">{scanResults.storage ? 'OK' : 'NG'}</span>
            </div>
          </div>
        </div>
      )}

      {/* 最新のセキュリティログ */}
      {showAdvanced && (
        <div className="security-logs">
          <h4>最新のセキュリティイベント</h4>
          {recentLogs.length > 0 ? (
            <div className="logs-container">
              {recentLogs.map((log, index) => (
                <div key={index} className={`log-entry log-${log.level}`}>
                  <div className="log-time">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </div>
                  <div className="log-level">
                    {log.level.toUpperCase()}
                  </div>
                  <div className="log-event">
                    {log.event}
                  </div>
                  <div className="log-details">
                    {JSON.stringify(log.details, null, 2).substring(0, 100)}...
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="no-logs">
              セキュリティイベントはありません
            </div>
          )}
        </div>
      )}

      {/* 推奨アクション */}
      {(!isSecureEnvironment || metrics.securityScore < 80) && (
        <div className="security-recommendations">
          <h4>推奨されるセキュリティ対策</h4>
          <div className="recommendations-list">
            {!isSecureEnvironment && (
              <div className="recommendation">
                <span className="rec-icon">🔒</span>
                <span className="rec-text">HTTPS接続を確認してください</span>
              </div>
            )}
            
            {scanResults && !scanResults.csp && (
              <div className="recommendation">
                <span className="rec-icon">🛡️</span>
                <span className="rec-text">Content Security Policyを設定してください</span>
              </div>
            )}
            
            {metrics.errorEvents > 5 && (
              <div className="recommendation">
                <span className="rec-icon">⚠️</span>
                <span className="rec-text">セキュリティエラーが多発しています。ログを確認してください</span>
              </div>
            )}
            
            {metrics.securityScore < 60 && (
              <div className="recommendation">
                <span className="rec-icon">📈</span>
                <span className="rec-text">セキュリティ設定を見直してください</span>
              </div>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .security-dashboard {
          background: white;
          border-radius: 12px;
          border: 1px solid #e0e0e0;
          overflow: hidden;
        }

        .dashboard-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          background: #f8f9fa;
          border-bottom: 1px solid #e0e0e0;
        }

        .header-info h3 {
          margin: 0 0 4px 0;
          color: #333;
          font-size: 18px;
          font-weight: 600;
        }

        .last-update {
          font-size: 12px;
          color: #666;
        }

        .header-actions {
          display: flex;
          gap: 12px;
        }

        .scan-button,
        .toggle-button {
          padding: 8px 16px;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .scan-button {
          background: #007bff;
          color: white;
        }

        .scan-button:hover:not(:disabled) {
          background: #0056b3;
        }

        .scan-button:disabled {
          background: #6c757d;
          cursor: not-allowed;
        }

        .toggle-button {
          background: #6c757d;
          color: white;
        }

        .toggle-button:hover {
          background: #5a6268;
        }

        .security-overview {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          padding: 20px;
        }

        .metric-card {
          display: flex;
          align-items: center;
          padding: 16px;
          background: #f8f9fa;
          border-radius: 8px;
          border: 1px solid #e9ecef;
        }

        .metric-icon {
          font-size: 24px;
          margin-right: 12px;
        }

        .metric-content h4 {
          margin: 0 0 4px 0;
          font-size: 12px;
          color: #666;
          text-transform: uppercase;
          font-weight: 500;
        }

        .metric-value {
          font-size: 16px;
          font-weight: 600;
          color: #333;
        }

        .metric-value.secure {
          color: #28a745;
        }

        .metric-value.insecure {
          color: #dc3545;
        }

        .scan-results {
          padding: 20px;
          border-top: 1px solid #e0e0e0;
        }

        .scan-results h4 {
          margin: 0 0 16px 0;
          color: #333;
          font-size: 16px;
        }

        .scan-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
        }

        .scan-item {
          display: flex;
          align-items: center;
          padding: 12px;
          border-radius: 6px;
          border: 1px solid #e9ecef;
        }

        .scan-item.pass {
          background: #d4edda;
          border-color: #c3e6cb;
        }

        .scan-item.fail {
          background: #f8d7da;
          border-color: #f5c6cb;
        }

        .scan-icon {
          margin-right: 8px;
        }

        .scan-label {
          flex: 1;
          font-size: 14px;
          font-weight: 500;
          color: #333;
        }

        .scan-status {
          font-size: 12px;
          font-weight: 600;
        }

        .security-logs {
          padding: 20px;
          border-top: 1px solid #e0e0e0;
        }

        .security-logs h4 {
          margin: 0 0 16px 0;
          color: #333;
          font-size: 16px;
        }

        .logs-container {
          max-height: 300px;
          overflow-y: auto;
          border: 1px solid #e9ecef;
          border-radius: 6px;
        }

        .log-entry {
          display: grid;
          grid-template-columns: auto auto 1fr auto;
          gap: 12px;
          padding: 8px 12px;
          border-bottom: 1px solid #f0f0f0;
          font-size: 12px;
        }

        .log-entry:last-child {
          border-bottom: none;
        }

        .log-entry.log-error {
          background: #fff5f5;
        }

        .log-entry.log-warn {
          background: #fffbf0;
        }

        .log-entry.log-info {
          background: #f0f8ff;
        }

        .log-time {
          color: #666;
          font-family: monospace;
        }

        .log-level {
          font-weight: 600;
          padding: 2px 6px;
          border-radius: 4px;
          text-align: center;
        }

        .log-event {
          font-weight: 500;
          color: #333;
        }

        .log-details {
          color: #666;
          font-family: monospace;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .no-logs {
          text-align: center;
          padding: 40px;
          color: #666;
          font-style: italic;
        }

        .security-recommendations {
          padding: 20px;
          border-top: 1px solid #e0e0e0;
          background: #fff3cd;
        }

        .security-recommendations h4 {
          margin: 0 0 16px 0;
          color: #856404;
          font-size: 16px;
        }

        .recommendations-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .recommendation {
          display: flex;
          align-items: center;
          padding: 8px 12px;
          background: #ffeaa7;
          border-radius: 6px;
          border: 1px solid #f39c12;
        }

        .rec-icon {
          margin-right: 8px;
        }

        .rec-text {
          color: #856404;
          font-size: 14px;
        }

        @media (max-width: 768px) {
          .dashboard-header {
            flex-direction: column;
            gap: 12px;
            align-items: flex-start;
          }

          .header-actions {
            flex-direction: column;
            width: 100%;
          }

          .scan-button,
          .toggle-button {
            width: 100%;
          }

          .security-overview {
            grid-template-columns: 1fr;
          }

          .scan-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  )
}

export default React.memo(SecurityDashboard)