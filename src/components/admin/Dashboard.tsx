/**
 * Admin Dashboard Component
 * Shows system overview, statistics, and recent activity
 */
import React, { useState, useEffect, useCallback } from 'react';
import { createAuthenticatedFetch } from '../../hooks/useAdminAuth';
import { RequestStatus } from '../../types/otc/index';

interface DashboardStats {
  requests: {
    total: number;
    by_status: Record<RequestStatus, number>;
    recent_count: number;
    active_count: number;
  };
  transactions: {
    total: number;
    submitted: number;
    confirmed: number;
    failed: number;
    success_rate: number;
  };
  monitoring: {
    utxo_service_running: boolean;
    monitored_requests: number;
    confirmation_service_running: boolean;
    monitored_transactions: number;
  };
  submission: {
    active_submissions: number;
    pending_retries: number;
    queue_length: number;
  };
}

interface RecentActivity {
  id: string;
  type: 'request_created' | 'transaction_submitted' | 'transaction_confirmed' | 'transaction_failed';
  description: string;
  timestamp: string;
  status?: string;
}

export const Dashboard: React.FC = () => {
  // const { session } = useAdminAuth(); // Removed to fix build warning
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshInterval] = useState<NodeJS.Timeout | null>(null);
  console.log('Refresh interval:', refreshInterval); // Development log

  // Fetch dashboard data
  const fetchDashboardData = useCallback(async () => {
    try {
      const authFetch = createAuthenticatedFetch();
      
      // Fetch statistics from multiple endpoints
      const [
        requestsResponse,
        transactionsResponse,
        monitoringResponse,
        submissionResponse,
        activityResponse
      ] = await Promise.all([
        authFetch('/api/ada/requests?stats=true'),
        authFetch('/api/ada/confirmation/stats'),
        authFetch('/api/ada/monitoring/status'),
        authFetch('/api/ada/submit/stats'),
        authFetch('/api/ada/requests?limit=10&recent=true')
      ]);

      const requestsData = await requestsResponse.json();
      const transactionsData = await transactionsResponse.json();
      const monitoringData = await monitoringResponse.json();
      const submissionData = await submissionResponse.json();
      const activityData = await activityResponse.json();

      // Combine data into dashboard stats
      const dashboardStats: DashboardStats = {
        requests: {
          total: requestsData.total || 0,
          by_status: requestsData.by_status || {},
          recent_count: requestsData.recent_count || 0,
          active_count: requestsData.active_count || 0
        },
        transactions: transactionsData.transaction_stats || {
          total: 0,
          submitted: 0,
          confirmed: 0,
          failed: 0,
          success_rate: 0
        },
        monitoring: {
          utxo_service_running: monitoringData.stats?.isRunning || false,
          monitored_requests: monitoringData.stats?.monitoredRequests || 0,
          confirmation_service_running: transactionsData.service_stats?.isRunning || false,
          monitored_transactions: transactionsData.service_stats?.monitoredTransactions || 0
        },
        submission: {
          active_submissions: submissionData.submitter_stats?.activeSubmissions || 0,
          pending_retries: submissionData.submitter_stats?.pendingRetries || 0,
          queue_length: submissionData.queue_status?.queueLength || 0
        }
      };

      setStats(dashboardStats);

      // Process recent activity
      const activities: RecentActivity[] = (activityData.requests || []).map((request: Record<string, unknown>) => ({
        id: request.id,
        type: 'request_created',
        description: `Request created: ${request.id.slice(0, 8)}...`,
        timestamp: request.created_at,
        status: request.status
      }));

      setRecentActivity(activities);

    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      setError('ダッシュボードデータの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initialize data and refresh interval
  useEffect(() => {
    fetchDashboardData();

    // Set up auto-refresh every 30 seconds
    const interval = setInterval(fetchDashboardData, 30000);
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [fetchDashboardData]);

  // Manual refresh
  const handleRefresh = useCallback(async () => {
    setLoading(true);
    await fetchDashboardData();
  }, [fetchDashboardData]);

  // Get status color for badges
  const getStatusColor = (status: RequestStatus): string => {
    switch (status) {
      case RequestStatus.REQUESTED:
        return 'bg-blue-100 text-blue-800';
      case RequestStatus.SIGNED:
        return 'bg-yellow-100 text-yellow-800';
      case RequestStatus.SUBMITTED:
        return 'bg-purple-100 text-purple-800';
      case RequestStatus.CONFIRMED:
        return 'bg-green-100 text-green-800';
      case RequestStatus.FAILED:
        return 'bg-red-100 text-red-800';
      case RequestStatus.EXPIRED:
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading && !stats) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>

    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={handleRefresh}
            className="bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600"
          >
            再読み込み
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ダッシュボード</h1>
          <p className="text-gray-600">OTCシステム管理画面</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="flex items-center px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 disabled:opacity-50"
        >
          <svg className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          更新
        </button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Requests Stats */}
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    総請求数
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {stats?.requests.total || 0}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 px-5 py-3">
            <div className="text-sm">
              <span className="text-green-600 font-medium">
                {stats?.requests.active_count || 0} アクティブ
              </span>
            </div>
          </div>
        </div>

        {/* Transactions Stats */}
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                </svg>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    成功率
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {stats?.transactions.success_rate?.toFixed(1) || 0}%
                  </dd>
                </dl>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 px-5 py-3">
            <div className="text-sm">
              <span className="text-blue-600 font-medium">
                {stats?.transactions.confirmed || 0}/{stats?.transactions.total || 0} 確認済み
              </span>
            </div>
          </div>
        </div>

        {/* Monitoring Stats */}
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    監視中
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {(stats?.monitoring.monitored_requests || 0) + (stats?.monitoring.monitored_transactions || 0)}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 px-5 py-3">
            <div className="text-sm flex space-x-2">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                stats?.monitoring.utxo_service_running ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                UTxO {stats?.monitoring.utxo_service_running ? 'ON' : 'OFF'}
              </span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                stats?.monitoring.confirmation_service_running ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                確認 {stats?.monitoring.confirmation_service_running ? 'ON' : 'OFF'}
              </span>
            </div>
          </div>
        </div>

        {/* Submission Queue */}
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    送信キュー
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {stats?.submission.queue_length || 0}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
          <div className="bg-gray-50 px-5 py-3">
            <div className="text-sm">
              <span className="text-purple-600 font-medium">
                {stats?.submission.active_submissions || 0} 送信中
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Status Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Request Status Breakdown */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
              請求ステータス内訳
            </h3>
            <div className="space-y-3">
              {Object.entries(stats?.requests.by_status || {}).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <div className="flex items-center">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(status as RequestStatus)}`}>
                      {status}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-gray-900">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
              最近のアクティビティ
            </h3>
            <div className="space-y-3">
              {recentActivity.length === 0 ? (
                <p className="text-gray-500 text-sm">最近のアクティビティはありません</p>
              ) : (
                recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start space-x-3">
                    <div className="flex-shrink-0">
                      <div className="h-2 w-2 bg-orange-400 rounded-full mt-2"></div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-900">{activity.description}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(activity.timestamp).toLocaleString('ja-JP')}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* System Health */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            システムヘルス
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700">UTxO監視サービス</span>
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                stats?.monitoring.utxo_service_running 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-red-100 text-red-800'
              }`}>
                {stats?.monitoring.utxo_service_running ? 'RUNNING' : 'STOPPED'}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700">ブロック確認サービス</span>
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                stats?.monitoring.confirmation_service_running 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-red-100 text-red-800'
              }`}>
                {stats?.monitoring.confirmation_service_running ? 'RUNNING' : 'STOPPED'}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700">送信サービス</span>
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                AVAILABLE
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;