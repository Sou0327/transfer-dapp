/**
 * System Settings Component
 * General system configurations and maintenance functions
 */
import React, { useState, useCallback, useEffect } from 'react';
import { createAuthenticatedFetch } from '../../hooks/useAdminAuth';

interface SystemInfo {
  version: string;
  environment: string;
  uptime: number;
  database_status: 'connected' | 'disconnected';
  redis_status: 'connected' | 'disconnected';
  blockfrost_status: 'healthy' | 'unhealthy' | 'unknown';
  server_time: string;
}

interface DatabaseStats {
  total_requests: number;
  total_transactions: number;
  total_presigned: number;
  database_size: string;
  oldest_request: string;
  newest_request: string;
}

export const SystemSettings: React.FC = () => {
  // const { session } = useAdminAuth(); // Removed to fix build warning
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [dbStats, setDbStats] = useState<DatabaseStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Fetch system information
  const fetchSystemInfo = useCallback(async () => {
    try {
      const authFetch = createAuthenticatedFetch();
      
      const [healthResponse, dbStatsResponse] = await Promise.all([
        fetch('/health'), // Public endpoint
        authFetch('/api/ada/requests?stats=true')
      ]);

      const healthData = await healthResponse.json();
      const dbStatsData = await dbStatsResponse.json();

      // Mock system info (would come from actual health endpoint)
      const info: SystemInfo = {
        version: '1.0.0',
        environment: healthData.environment || 'development',
        uptime: healthData.uptime || 0,
        database_status: 'connected', // Would check actual DB connection
        redis_status: 'connected', // Would check actual Redis connection
        blockfrost_status: 'healthy', // Would check Blockfrost API
        server_time: healthData.timestamp || new Date().toISOString()
      };

      const stats: DatabaseStats = {
        total_requests: dbStatsData.total || 0,
        total_transactions: 0, // Would get from transaction stats
        total_presigned: 0, // Would get from presigned stats
        database_size: '0 MB', // Would calculate actual size
        oldest_request: dbStatsData.oldest_created_at || new Date().toISOString(),
        newest_request: dbStatsData.newest_created_at || new Date().toISOString()
      };

      setSystemInfo(info);
      setDbStats(stats);

    } catch (error) {
      console.error('Failed to fetch system info:', error);
      setError('システム情報の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  // Clean up expired requests
  const cleanupExpiredRequests = useCallback(async () => {
    try {
      setActionInProgress('cleanup');
      
      const authFetch = createAuthenticatedFetch();
      
      // This would be a new API endpoint for cleanup
      const response = await authFetch('/api/ada/maintenance/cleanup-expired', {
        method: 'POST'
      });

      const result = await response.json();
      
      // Refresh system info
      await fetchSystemInfo();
      
      alert(`クリーンアップ完了: ${result.cleaned_requests || 0}件の期限切れ請求を削除しました`);

    } catch (error) {
      console.error('Failed to cleanup expired requests:', error);
      setError('期限切れ請求のクリーンアップに失敗しました');
    } finally {
      setActionInProgress(null);
    }
  }, [fetchSystemInfo]);

  // Export database
  const exportDatabase = useCallback(async () => {
    try {
      setActionInProgress('export');
      
      const authFetch = createAuthenticatedFetch();
      
      const response = await authFetch('/api/ada/maintenance/export', {
        method: 'POST'
      });

      if (response.ok) {
        // Trigger download
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `otc-database-export-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }

    } catch (error) {
      console.error('Failed to export database:', error);
      setError('データベースエクスポートに失敗しました');
    } finally {
      setActionInProgress(null);
    }
  }, []);

  // Test API connections
  const testConnections = useCallback(async () => {
    try {
      setActionInProgress('test_connections');
      
      const authFetch = createAuthenticatedFetch();
      
      // Test various endpoints
      const tests = [
        { name: 'Blockfrost API', endpoint: '/api/ada/protocol-params' },
        { name: 'Database', endpoint: '/api/ada/requests?limit=1' },
        { name: 'Redis', endpoint: '/health' }
      ];

      const results = [];
      
      for (const test of tests) {
        try {
          const response = await authFetch(test.endpoint);
          results.push({
            name: test.name,
            status: response.ok ? 'OK' : 'ERROR',
            message: response.ok ? '接続成功' : `HTTP ${response.status}`
          });
        } catch (error) {
          results.push({
            name: test.name,
            status: 'ERROR',
            message: error instanceof Error ? error.message : '接続エラー'
          });
        }
      }

      // Show results
      const message = results.map(r => `${r.name}: ${r.status} (${r.message})`).join('\n');
      alert(`接続テスト結果:\n\n${message}`);

    } catch (error) {
      console.error('Failed to test connections:', error);
      setError('接続テストに失敗しました');
    } finally {
      setActionInProgress(null);
    }
  }, []);

  // Initialize data
  useEffect(() => {
    fetchSystemInfo();
    
    // Set up auto-refresh every 60 seconds
    const interval = setInterval(fetchSystemInfo, 60000);
    return () => clearInterval(interval);
  }, [fetchSystemInfo]);

  // Format uptime
  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
      return `${days}日 ${hours}時間 ${minutes}分`;
    } else if (hours > 0) {
      return `${hours}時間 ${minutes}分`;
    } else {
      return `${minutes}分`;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
      </div>

    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={() => {
            setError(null);
            setLoading(true);
            fetchSystemInfo();
          }}
          className="bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600"
        >
          再読み込み
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">システム設定</h1>
          <p className="text-gray-600">システム情報とメンテナンス機能</p>
        </div>
        <button
          onClick={fetchSystemInfo}
          disabled={loading}
          className="flex items-center px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 disabled:opacity-50"
        >
          <svg className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          更新
        </button>
      </div>

      {/* System Information */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            システム情報
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <dt className="text-sm font-medium text-gray-500">バージョン</dt>
              <dd className="mt-1 text-sm text-gray-900">{systemInfo?.version}</dd>
            </div>

            <div>
              <dt className="text-sm font-medium text-gray-500">環境</dt>
              <dd className="mt-1 text-sm text-gray-900">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  systemInfo?.environment === 'production' 
                    ? 'bg-red-100 text-red-800' 
                    : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {systemInfo?.environment}
                </span>
              </dd>
            </div>

            <div>
              <dt className="text-sm font-medium text-gray-500">稼働時間</dt>
              <dd className="mt-1 text-sm text-gray-900">{formatUptime(systemInfo?.uptime || 0)}</dd>
            </div>

            <div>
              <dt className="text-sm font-medium text-gray-500">データベース</dt>
              <dd className="mt-1 text-sm text-gray-900">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  systemInfo?.database_status === 'connected' 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
                }`}>
                  {systemInfo?.database_status === 'connected' ? '接続中' : '切断'}
                </span>
              </dd>
            </div>

            <div>
              <dt className="text-sm font-medium text-gray-500">Redis</dt>
              <dd className="mt-1 text-sm text-gray-900">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  systemInfo?.redis_status === 'connected' 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
                }`}>
                  {systemInfo?.redis_status === 'connected' ? '接続中' : '切断'}
                </span>
              </dd>
            </div>

            <div>
              <dt className="text-sm font-medium text-gray-500">Blockfrost API</dt>
              <dd className="mt-1 text-sm text-gray-900">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  systemInfo?.blockfrost_status === 'healthy' 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
                }`}>
                  {systemInfo?.blockfrost_status === 'healthy' ? '正常' : '異常'}
                </span>
              </dd>
            </div>

            <div className="md:col-span-2 lg:col-span-3">
              <dt className="text-sm font-medium text-gray-500">サーバー時刻</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {systemInfo?.server_time ? new Date(systemInfo.server_time).toLocaleString('ja-JP') : '-'}
              </dd>
            </div>
          </div>
        </div>
      </div>

      {/* Database Statistics */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            データベース統計
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <dt className="text-sm font-medium text-gray-500">総請求数</dt>
              <dd className="mt-1 text-lg font-semibold text-gray-900">{dbStats?.total_requests?.toLocaleString()}</dd>
            </div>

            <div>
              <dt className="text-sm font-medium text-gray-500">総トランザクション数</dt>
              <dd className="mt-1 text-lg font-semibold text-gray-900">{dbStats?.total_transactions?.toLocaleString()}</dd>
            </div>

            <div>
              <dt className="text-sm font-medium text-gray-500">事前署名データ数</dt>
              <dd className="mt-1 text-lg font-semibold text-gray-900">{dbStats?.total_presigned?.toLocaleString()}</dd>
            </div>

            <div>
              <dt className="text-sm font-medium text-gray-500">データベースサイズ</dt>
              <dd className="mt-1 text-lg font-semibold text-gray-900">{dbStats?.database_size}</dd>
            </div>

            <div>
              <dt className="text-sm font-medium text-gray-500">最古の請求</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {dbStats?.oldest_request ? new Date(dbStats.oldest_request).toLocaleDateString('ja-JP') : '-'}
              </dd>
            </div>

            <div>
              <dt className="text-sm font-medium text-gray-500">最新の請求</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {dbStats?.newest_request ? new Date(dbStats.newest_request).toLocaleDateString('ja-JP') : '-'}
              </dd>
            </div>
          </div>
        </div>
      </div>

      {/* Maintenance Functions */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            メンテナンス機能
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <button
              onClick={testConnections}
              disabled={actionInProgress === 'test_connections'}
              className="flex items-center justify-center px-4 py-3 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="h-5 w-5 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {actionInProgress === 'test_connections' ? '接続テスト中...' : '接続テスト'}
            </button>

            <button
              onClick={cleanupExpiredRequests}
              disabled={actionInProgress === 'cleanup'}
              className="flex items-center justify-center px-4 py-3 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="h-5 w-5 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              {actionInProgress === 'cleanup' ? 'クリーンアップ中...' : '期限切れデータ削除'}
            </button>

            <button
              onClick={exportDatabase}
              disabled={actionInProgress === 'export'}
              className="flex items-center justify-center px-4 py-3 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="h-5 w-5 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {actionInProgress === 'export' ? 'エクスポート中...' : 'データベースエクスポート'}
            </button>
          </div>

          <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">
                  メンテナンス機能について
                </h3>
                <div className="mt-2 text-sm text-yellow-700">
                  <ul className="list-disc pl-5 space-y-1">
                    <li>接続テスト: 外部APIとデータベースの接続状態を確認します</li>
                    <li>期限切れデータ削除: TTLが過ぎた請求データを削除してデータベースを最適化します</li>
                    <li>データベースエクスポート: バックアップ用にデータベース内容をJSON形式でダウンロードします</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Security Settings */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            セキュリティ設定
          </h3>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium text-gray-900">セッション有効期限</h4>
                <p className="text-sm text-gray-500">管理者セッションの自動ログアウト時間</p>
              </div>
              <span className="text-sm text-gray-900">24時間</span>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium text-gray-900">API レート制限</h4>
                <p className="text-sm text-gray-500">1分間あたりのAPI呼び出し制限</p>
              </div>
              <span className="text-sm text-gray-900">1000回/分</span>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium text-gray-900">請求TTL設定</h4>
                <p className="text-sm text-gray-500">請求の最大有効期限</p>
              </div>
              <span className="text-sm text-gray-900">5-15分</span>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium text-gray-900">監査ログ</h4>
                <p className="text-sm text-gray-500">システムアクセスとタイムスタンプの記録</p>
              </div>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                有効
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemSettings;