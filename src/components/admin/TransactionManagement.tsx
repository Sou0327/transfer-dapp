/**
 * Transaction Management Component
 * Shows transaction history, monitoring status, and submission management
 */
import React, { useState, useCallback, useEffect } from 'react';
import { createAuthenticatedFetch } from '../../hooks/useAdminAuth';

interface TransactionData {
  id: string;
  tx_hash: string;
  request_id: string;
  status: 'SUBMITTED' | 'CONFIRMED' | 'FAILED';
  submission_mode: 'server' | 'wallet';
  confirmations: number;
  block_height?: number;
  block_hash?: string; 
  block_time?: string;
  submitted_at: string;
  confirmed_at?: string;
  last_checked?: string;
  fee_paid?: number;
  retry_count: number;
}

interface SubmissionStats {
  total_submissions: number;
  successful_submissions: number;
  failed_submissions: number;
  pending_submissions: number;
  success_rate: number;
  average_confirmation_time: number;
}

export const TransactionManagement: React.FC = () => {
  // const { session } = useAdminAuth(); // Removed to fix build warning
  const [transactions, setTransactions] = useState<TransactionData[]>([]);
  const [stats, setStats] = useState<SubmissionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [retryInProgress, setRetryInProgress] = useState<Set<string>>(new Set());

  // Fetch transactions and statistics
  const fetchData = useCallback(async () => {
    try {
      const authFetch = createAuthenticatedFetch();
      
      const [transactionsResponse, statsResponse] = await Promise.all([
        authFetch('/api/ada/confirmation/transactions'),
        authFetch('/api/ada/submit/stats')
      ]);

      const transactionsData = await transactionsResponse.json();
      const statsData = await statsResponse.json();

      setTransactions(transactionsData.transactions || []);
      setStats(statsData.stats || null);

    } catch (error) {
      console.error('Failed to fetch transaction data:', error);
      setError('トランザクションデータの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  // Force check transaction
  const forceCheckTransaction = useCallback(async (txHash: string) => {
    try {
      const authFetch = createAuthenticatedFetch();
      await authFetch(`/api/ada/confirmation/transactions/${txHash}/check`, {
        method: 'POST'
      });
      
      // Refresh data
      await fetchData();
    } catch (error) {
      console.error('Failed to force check transaction:', error);
    }
  }, [fetchData]);

  // Retry transaction submission
  const retryTransaction = useCallback(async (requestId: string) => {
    try {
      setRetryInProgress(prev => new Set(prev).add(requestId));
      
      const authFetch = createAuthenticatedFetch();
      await authFetch(`/api/ada/submit/${requestId}/retry`, {
        method: 'POST'
      });
      
      // Refresh data
      await fetchData();
    } catch (error) {
      console.error('Failed to retry transaction:', error);
    } finally {
      setRetryInProgress(prev => {
        const newSet = new Set(prev);
        newSet.delete(requestId);
        return newSet;
      });
    }
  }, [fetchData]);

  // Initialize data
  useEffect(() => {
    fetchData();
    
    // Set up auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Filter transactions
  const filteredTransactions = transactions.filter(tx => {
    const matchesStatus = selectedStatus === 'all' || tx.status === selectedStatus;
    const matchesSearch = 
      tx.tx_hash.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.request_id.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesStatus && matchesSearch;
  });

  // Get status color
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'SUBMITTED':
        return 'bg-yellow-100 text-yellow-800';
      case 'CONFIRMED':
        return 'bg-green-100 text-green-800';
      case 'FAILED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Get submission mode color
  const getModeColor = (mode: string): string => {
    switch (mode) {
      case 'server':
        return 'bg-blue-100 text-blue-800';
      case 'wallet':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
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
            fetchData();
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
          <h1 className="text-2xl font-bold text-gray-900">トランザクション管理</h1>
          <p className="text-gray-600">送信されたトランザクションの監視と管理</p>
        </div>
        <button
          onClick={fetchData}
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
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
                      総送信済み
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {stats.total_submissions}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      成功率
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {stats.success_rate.toFixed(1)}%
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      平均確認時間
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {Math.round(stats.average_confirmation_time / 1000 / 60)}分
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      保留中
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {stats.pending_submissions}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700 mb-2">
              ステータスフィルター
            </label>
            <select
              id="status-filter"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 sm:text-sm"
            >
              <option value="all">すべて</option>
              <option value="SUBMITTED">送信済み</option>
              <option value="CONFIRMED">確認済み</option>
              <option value="FAILED">失敗</option>
            </select>
          </div>

          <div>
            <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-2">
              検索（TX Hash / Request ID）
            </label>
            <input
              type="text"
              id="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="検索..."
              className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 sm:text-sm"
            />
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            トランザクション履歴 ({filteredTransactions.length})
          </h3>
        </div>

        {filteredTransactions.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-gray-500">トランザクションが見つかりません</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    TX Hash
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Request ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ステータス
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    送信モード
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    確認数
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    送信日時
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                      <div className="flex items-center">
                        <span className="truncate max-w-32" title={tx.tx_hash}>
                          {tx.tx_hash.slice(0, 16)}...
                        </span>
                        <button
                          onClick={() => navigator.clipboard.writeText(tx.tx_hash)}
                          className="ml-2 text-gray-400 hover:text-gray-600"
                          title="コピー"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <span className="truncate max-w-24" title={tx.request_id}>
                        {tx.request_id.slice(0, 8)}...
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(tx.status)}`}>
                        {tx.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getModeColor(tx.submission_mode)}`}>
                        {tx.submission_mode}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {tx.confirmations}/3
                      {tx.block_height && (
                        <div className="text-xs text-gray-500">
                          #{tx.block_height}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(tx.submitted_at).toLocaleString('ja-JP')}
                      {tx.confirmed_at && (
                        <div className="text-xs text-gray-500">
                          確認: {new Date(tx.confirmed_at).toLocaleString('ja-JP')}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                      {tx.status === 'SUBMITTED' && (
                        <button
                          onClick={() => forceCheckTransaction(tx.tx_hash)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          確認
                        </button>
                      )}
                      {tx.status === 'FAILED' && (
                        <button
                          onClick={() => retryTransaction(tx.request_id)}
                          disabled={retryInProgress.has(tx.request_id)}
                          className="text-orange-600 hover:text-orange-900 disabled:opacity-50"
                        >
                          {retryInProgress.has(tx.request_id) ? '再送中...' : '再送'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};