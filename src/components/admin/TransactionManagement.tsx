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
  const [loading, setLoading] = useState(true);
  const [serverStatus, setServerStatus] = useState<'online' | 'offline'>('offline');

  // Check server status
  const checkServerStatus = useCallback(async () => {
    try {
      const healthResponse = await fetch('/health');
      setServerStatus(healthResponse.ok ? 'online' : 'offline');
    } catch {
      setServerStatus('offline');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkServerStatus();
    const interval = setInterval(checkServerStatus, 30000);
    return () => clearInterval(interval);
  }, [checkServerStatus]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-8 py-12">
        
        {/* Header */}
        <div className="mb-16">
          <h1 className="text-4xl font-light text-gray-900 tracking-tight">
            トランザクション
          </h1>
          <div className="flex items-center mt-3">
            <div className={`w-2 h-2 rounded-full mr-3 ${
              serverStatus === 'online' ? 'bg-green-500' : 'bg-red-500'
            }`}></div>
            <span className="text-gray-600 text-sm">
              {serverStatus === 'online' ? 'サーバー接続中' : 'サーバー停止中'}
            </span>
          </div>
        </div>

        {/* Transaction Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          
          {/* Total Transactions */}
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
            <div className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
              送信済み
            </div>
            <div className="text-5xl font-extralight text-gray-900 mb-2">
              {serverStatus === 'online' ? '—' : '0'}
            </div>
            <div className="text-sm text-gray-500">
              トランザクション
            </div>
          </div>

          {/* Confirmed */}
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
            <div className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
              確認済み
            </div>
            <div className="text-5xl font-extralight text-gray-900 mb-2">
              {serverStatus === 'online' ? '—' : '0'}
            </div>
            <div className="text-sm text-gray-500">
              件
            </div>
          </div>

          {/* Success Rate */}
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
            <div className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
              成功率
            </div>
            <div className="text-5xl font-extralight text-gray-900 mb-2">
              {serverStatus === 'online' ? '—' : '0'}
            </div>
            <div className="text-sm text-gray-500">
              %
            </div>
          </div>

        </div>

        {/* Transaction List */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
          <div className="p-8 border-b border-gray-100">
            <h2 className="text-xl font-medium text-gray-900">
              トランザクション履歴
            </h2>
          </div>
          <div className="p-8">
            {serverStatus === 'offline' ? (
              <div className="text-center py-12">
                <div className="text-gray-400 text-sm">
                  サーバーが停止中のためトランザクション履歴を表示できません
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="text-gray-400 text-sm">
                  トランザクション履歴はありません
                </div>
              </div>
            )}
          </div>
        </div>

        {/* API Status */}
        {serverStatus === 'offline' && (
          <div className="mt-8 bg-red-50 rounded-2xl p-6 border border-red-100">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <div className="w-5 h-5 rounded-full bg-red-500 mt-0.5"></div>
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-medium text-red-800">
                  接続エラー
                </h3>
                <div className="mt-1 text-sm text-red-700">
                  トランザクション管理APIサーバーに接続できません。
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default TransactionManagement;