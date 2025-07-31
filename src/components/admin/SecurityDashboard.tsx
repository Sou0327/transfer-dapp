/**
 * Security Dashboard Component
 * Administrative interface for monitoring security system health and logs
 */
import React, { useState, useCallback, useEffect } from 'react';
import { useSecurity } from '../../hooks/useSecurity';

// Security Dashboard types (temporary until backend integration)
// eslint-disable-next-line react-refresh/only-export-components
export enum AuditEventType {
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  REQUEST_CREATE = 'REQUEST_CREATE',
  REQUEST_SIGN = 'REQUEST_SIGN',
  TRANSACTION_SUBMIT = 'TRANSACTION_SUBMIT',
  SECURITY_ALERT = 'SECURITY_ALERT',
}

// eslint-disable-next-line react-refresh/only-export-components
export enum AuditSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  event_type: AuditEventType;
  eventType: string;
  action: string;
  severity: AuditSeverity;
  userId?: string;
  ipAddress?: string;
  outcome: 'success' | 'failure' | 'warning';
  details: Record<string, unknown>;
}

export interface AuditFilter {
  limit: number;
  offset: number;
  event_type?: AuditEventType;
  severity?: AuditSeverity;
  start_date?: string;
  end_date?: string;
  eventTypes?: AuditEventType[];
  severities?: AuditSeverity[];
  outcome?: 'success' | 'failure' | 'pending';
}

// Mock functions for development (replace with actual API calls)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const queryAuditLogs = async (_filter: AuditFilter): Promise<AuditLogEntry[]> => {
  // Mock audit logs for development
  return [
    {
      id: '1',
      timestamp: new Date().toISOString(),
      event_type: AuditEventType.LOGIN,
      eventType: 'LOGIN',
      action: 'User Login',
      severity: AuditSeverity.LOW,
      userId: 'admin',
      ipAddress: '127.0.0.1',
      outcome: 'success' as const,
      details: { success: true }
    }
  ];
};

const getAuditStatistics = () => {
  return {
    total_events: 100,
    events_today: 5,
    critical_alerts: 0,
    failed_logins: 2
  };
};

const getRateLimiterStats = () => {
  return {
    total_requests: 1000,
    blocked_requests: 10,
    active_limits: 5,
    totalKeys: 150,
    blockedKeys: 3,
    activeKeys: 12,
    topRequesters: [
      { key: '192.168.1.1', requests: 1234, blocked: false },
      { key: '10.0.0.1', requests: 987, blocked: true },
      { key: '172.16.0.1', requests: 654, blocked: false }
    ]
  };
};

const getCsrfStats = () => {
  return {
    tokens_generated: 50,
    tokens_validated: 48,
    validation_failures: 2,
    total: 50,
    active: 35,
    expired: 15
  };
};

interface SecurityDashboardProps {
  className?: string;
}

export const SecurityDashboard: React.FC<SecurityDashboardProps> = ({
  className = ''
}) => {
  const security = useSecurity();
  const [activeTab, setActiveTab] = useState<'overview' | 'audit' | 'ratelimit' | 'config'>('overview');
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditFilter, setAuditFilter] = useState<AuditFilter>({
    limit: 50,
    offset: 0
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [auditStats, setAuditStats] = useState<Record<string, unknown> | null>(null);
  const [rateLimitStats, setRateLimitStats] = useState<Record<string, unknown> | null>(null);
  const [csrfStats, setCsrfStats] = useState<Record<string, unknown> | null>(null);

  // Refresh all data
  const refreshData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await security.performHealthCheck();
      const logs = await queryAuditLogs(auditFilter);
      setAuditLogs(logs);
    } catch (error) {
      console.error('Failed to refresh security data:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [security, auditFilter]);

  // Initialize stats
  useEffect(() => {
    setAuditStats(getAuditStatistics());
    setRateLimitStats(getRateLimiterStats());
    setCsrfStats(getCsrfStats());
  }, []);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 30000);
    return () => clearInterval(interval);
  }, [refreshData]);

  // Format timestamp
  const formatTimestamp = (timestamp: string | number): string => {
    return new Date(timestamp).toLocaleString('ja-JP');
  };

  // Get severity color
  const getSeverityColor = (severity: AuditSeverity): string => {
    switch (severity) {
      case AuditSeverity.CRITICAL:
        return 'text-red-600 bg-red-50 border-red-200';
      case AuditSeverity.HIGH:
        return 'text-orange-600 bg-orange-50 border-orange-200';
      case AuditSeverity.MEDIUM:
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case AuditSeverity.LOW:
        return 'text-green-600 bg-green-50 border-green-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };



  return (
    <div className={`bg-white rounded-lg shadow ${className}`}>
export default SecurityDashboard;
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">セキュリティダッシュボード</h2>
            <p className="text-sm text-gray-600">システムセキュリティの監視と管理</p>
          </div>
          
          <div className="flex items-center space-x-3">
            {/* Security status indicator */}
            <div className={`flex items-center px-3 py-1 rounded-full text-sm font-medium ${
              security.isHealthy 
                ? 'bg-green-100 text-green-800' 
                : 'bg-red-100 text-red-800'
            }`}>
              <div className={`w-2 h-2 rounded-full mr-2 ${
                security.isHealthy ? 'bg-green-500' : 'bg-red-500'
              }`} />
              {security.isHealthy ? 'セキュア' : 'アラート'}
            </div>
            
            <button
              onClick={refreshData}
              disabled={isRefreshing}
              className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50"
            >
              {isRefreshing ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  更新中...
                </div>
              ) : (
                '更新'
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Navigation tabs */}
      <div className="border-b border-gray-200">
        <nav className="px-6 -mb-px flex space-x-8">
          {[
            { id: 'overview', label: '概要' },
            { id: 'audit', label: '監査ログ' },
            { id: 'ratelimit', label: 'レート制限' },
            { id: 'config', label: '設定' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="p-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* System status cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      security.status?.integrity ? 'bg-green-100' : 'bg-red-100'
                    }`}>
                      <svg className={`w-5 h-5 ${
                        security.status?.integrity ? 'text-green-600' : 'text-red-600'
                      }`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  </div>
                  <div className="ml-4">
                    <div className="text-sm font-medium text-gray-900">整合性チェック</div>
                    <div className={`text-sm ${
                      security.status?.integrity ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {security.status?.integrity ? '正常' : 'エラー'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      security.status?.rateLimiting ? 'bg-green-100' : 'bg-red-100'
                    }`}>
                      <svg className={`w-5 h-5 ${
                        security.status?.rateLimiting ? 'text-green-600' : 'text-red-600'
                      }`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                  </div>
                  <div className="ml-4">
                    <div className="text-sm font-medium text-gray-900">レート制限</div>
                    <div className={`text-sm ${
                      security.status?.rateLimiting ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {security.status?.rateLimiting ? '稼働中' : '停止'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      security.status?.auditLogging ? 'bg-green-100' : 'bg-red-100'
                    }`}>
                      <svg className={`w-5 h-5 ${
                        security.status?.auditLogging ? 'text-green-600' : 'text-red-600'
                      }`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>
                  </div>
                  <div className="ml-4">
                    <div className="text-sm font-medium text-gray-900">監査ログ</div>
                    <div className={`text-sm ${
                      security.status?.auditLogging ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {security.status?.auditLogging ? '記録中' : 'エラー'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                      <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                  </div>
                  <div className="ml-4">
                    <div className="text-sm font-medium text-gray-900">アクティブIP</div>
                    <div className="text-sm text-blue-600">
                      {rateLimitStats?.activeKeys || 0}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent security events */}
            <div className="bg-white border border-gray-200 rounded-lg">
              <div className="px-4 py-3 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">最近のセキュリティイベント</h3>
              </div>
              <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
                {auditLogs.slice(0, 10).map((log) => (
                  <div key={log.id} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getSeverityColor(log.severity)}`}>
                          {log.severity}
                        </span>
                        <span className="text-sm font-medium text-gray-900">{log.action}</span>
                      </div>
                      <span className="text-xs text-gray-500">
                        {formatTimestamp(log.timestamp)}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-gray-600">
                      {log.eventType} - {log.outcome}
                      {log.ipAddress && ` (IP: ${log.ipAddress})`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="space-y-4">
            {/* Audit log filters */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-md font-medium text-gray-900 mb-3">フィルター</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">イベントタイプ</label>
                  <select
                    value={auditFilter.eventTypes?.[0] || ''}
                    onChange={(e) => setAuditFilter(prev => ({
                      ...prev,
                      eventTypes: e.target.value ? [e.target.value as AuditEventType] : undefined
                    }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  >
                    <option value="">すべて</option>
                    {Object.values(AuditEventType).map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">重要度</label>
                  <select
                    value={auditFilter.severities?.[0] || ''}
                    onChange={(e) => setAuditFilter(prev => ({
                      ...prev,
                      severities: e.target.value ? [e.target.value as AuditSeverity] : undefined
                    }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  >
                    <option value="">すべて</option>
                    {Object.values(AuditSeverity).map(severity => (
                      <option key={severity} value={severity}>{severity}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">結果</label>
                  <select
                    value={auditFilter.outcome || ''}
                    onChange={(e) => setAuditFilter(prev => ({
                      ...prev,
                      outcome: e.target.value ? e.target.value as 'success' | 'failure' | 'warning' : undefined
                    }))}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  >
                    <option value="">すべて</option>
                    <option value="success">成功</option>
                    <option value="failure">失敗</option>
                    <option value="pending">保留</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Audit log table */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        時刻
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        重要度
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        イベント
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        ユーザー/IP
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        結果
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatTimestamp(log.timestamp)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getSeverityColor(log.severity)}`}>
                            {log.severity}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{log.action}</div>
                          <div className="text-sm text-gray-500">{log.eventType}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {log.userId && <div>User: {log.userId}</div>}
                          {log.ipAddress && <div>IP: {log.ipAddress}</div>}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            log.outcome === 'success' 
                              ? 'bg-green-100 text-green-800' 
                              : log.outcome === 'failure'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {log.outcome}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'ratelimit' && (
          <div className="space-y-6">
            {/* Rate limit statistics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-gray-900">{rateLimitStats?.totalKeys || 0}</div>
                <div className="text-sm text-gray-600">総監視対象</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-red-600">{rateLimitStats?.blockedKeys || 0}</div>
                <div className="text-sm text-gray-600">ブロック中</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-blue-600">{rateLimitStats?.activeKeys || 0}</div>
                <div className="text-sm text-gray-600">アクティブ</div>
              </div>
            </div>

            {/* Top requesters */}
            <div className="bg-white border border-gray-200 rounded-lg">
              <div className="px-4 py-3 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">トップリクエスター</h3>
              </div>
              <div className="divide-y divide-gray-200">
                {(rateLimitStats?.topRequesters || []).slice(0, 10).map((requester, index) => (
                  <div key={requester.key} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <span className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">
                          #{index + 1}
                        </span>
                        <span className="text-sm font-medium text-gray-900">
                          {requester.key}
                        </span>
                        {requester.blocked && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            ブロック中
                          </span>
                        )}
                      </div>
                      <span className="text-sm text-gray-600">
                        {requester.requests} リクエスト
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'config' && (
          <div className="space-y-6">
            {/* Security configuration display */}
            <div className="bg-white border border-gray-200 rounded-lg">
              <div className="px-4 py-3 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">セキュリティ設定</h3>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-md font-medium text-gray-900 mb-3">システム状態</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>初期化済み:</span>
                        <span className={security.initialized ? 'text-green-600' : 'text-red-600'}>
                          {security.initialized ? 'はい' : 'いいえ'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>正常性:</span>
                        <span className={security.isHealthy ? 'text-green-600' : 'text-red-600'}>
                          {security.isHealthy ? '正常' : 'エラー'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>最終更新:</span>
                        <span className="text-gray-600">
                          {security.status?.timestamp ? formatTimestamp(security.status.timestamp) : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-md font-medium text-gray-900 mb-3">CSRF統計</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>総トークン数:</span>
                        <span className="text-gray-600">{csrfStats?.total || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>アクティブ:</span>
                        <span className="text-green-600">{csrfStats?.active || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>期限切れ:</span>
                        <span className="text-gray-600">{csrfStats?.expired || 0}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Error display */}
            {security.status?.errors && security.status.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h4 className="text-md font-medium text-red-900 mb-2">エラー</h4>
                <ul className="list-disc list-inside space-y-1 text-sm text-red-800">
                  {security.status.errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SecurityDashboard;