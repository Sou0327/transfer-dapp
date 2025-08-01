/**
 * Admin Dashboard Component
 * Shows system overview, statistics, and recent activity
 */
import React, { useState, useEffect, useCallback } from 'react';





export const Dashboard: React.FC = () => {
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
            ダッシュボード
          </h1>
          <div className="flex items-center mt-3">
            <div className={`w-2 h-2 rounded-full mr-3 ${
              serverStatus === 'online' ? 'bg-green-500' : 'bg-red-500'
            }`}></div>
            <span className="text-gray-600 text-sm">
              {serverStatus === 'online' ? 'システム稼働中' : 'システム停止中'}
            </span>
          </div>
        </div>

        {/* Main Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          
          {/* Today's Requests */}
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
            <div className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
              本日の処理
            </div>
            <div className="text-5xl font-extralight text-gray-900 mb-2">
              {serverStatus === 'online' ? '—' : '0'}
            </div>
            <div className="text-sm text-gray-500">
              リクエスト
            </div>
          </div>

          {/* Pending */}
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
            <div className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
              処理待ち
            </div>
            <div className="text-5xl font-extralight text-gray-900 mb-2">
              {serverStatus === 'online' ? '—' : '0'}
            </div>
            <div className="text-sm text-gray-500">
              件
            </div>
          </div>

          {/* System Status */}
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
            <div className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
              システム状態
            </div>
            <div className={`text-2xl font-medium mb-2 ${
              serverStatus === 'online' ? 'text-green-600' : 'text-red-600'
            }`}>
              {serverStatus === 'online' ? '正常' : '停止中'}
            </div>
            <div className="text-sm text-gray-500">
              {new Date().toLocaleDateString('ja-JP')}
            </div>
          </div>

        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
          <div className="p-8 border-b border-gray-100">
            <h2 className="text-xl font-medium text-gray-900">
              最近のアクティビティ
            </h2>
          </div>
          <div className="p-8">
            {serverStatus === 'offline' ? (
              <div className="text-center py-12">
                <div className="text-gray-400 text-sm">
                  サーバーが停止中のためアクティビティを表示できません
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="text-gray-400 text-sm">
                  アクティビティはありません
                </div>
              </div>
            )}
          </div>
        </div>

        {/* System Info */}
        {serverStatus === 'offline' && (
          <div className="mt-8 bg-red-50 rounded-2xl p-6 border border-red-100">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <div className="w-5 h-5 rounded-full bg-red-500 mt-0.5"></div>
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-medium text-red-800">
                  システムエラー
                </h3>
                <div className="mt-1 text-sm text-red-700">
                  バックエンドサーバーに接続できません。システム管理者に連絡してください。
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default Dashboard;