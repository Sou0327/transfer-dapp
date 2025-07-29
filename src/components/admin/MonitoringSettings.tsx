/**
 * Monitoring Settings Component
 * Configure and control monitoring services (UTxO, block confirmation)
 */
import React, { useState, useCallback, useEffect } from 'react';
import { useAdminAuth, createAuthenticatedFetch } from '../../hooks/useAdminAuth';

interface MonitoringStatus {
  utxo_service: {
    running: boolean;
    monitored_requests: number;
    last_check: string;
    check_interval: number;
  };
  confirmation_service: {
    running: boolean;
    monitored_transactions: number;
    required_confirmations: number;
    check_interval: number;
    last_check: string;
  };
}

interface ServiceConfig {
  utxo_check_interval?: number;
  confirmation_check_interval?: number;
  required_confirmations?: number;
  max_confirmation_time?: number;
}

export const MonitoringSettings: React.FC = () => {
  const { session } = useAdminAuth();
  const [status, setStatus] = useState<MonitoringStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [configForm, setConfigForm] = useState<ServiceConfig>({});

  // Fetch monitoring status
  const fetchStatus = useCallback(async () => {
    try {
      const authFetch = createAuthenticatedFetch();
      
      const [utxoResponse, confirmationResponse] = await Promise.all([
        authFetch('/api/ada/monitoring/status'),
        authFetch('/api/ada/confirmation/status')
      ]);

      const utxoData = await utxoResponse.json();
      const confirmationData = await confirmationResponse.json();

      const monitoringStatus: MonitoringStatus = {
        utxo_service: {
          running: utxoData.stats?.isRunning || false,
          monitored_requests: utxoData.stats?.monitoredRequests || 0,
          last_check: utxoData.stats?.lastCheck || new Date().toISOString(),
          check_interval: utxoData.stats?.checkInterval || 30000
        },
        confirmation_service: {
          running: confirmationData.stats?.isRunning || false,
          monitored_transactions: confirmationData.stats?.monitoredTransactions || 0,
          required_confirmations: confirmationData.stats?.requiredConfirmations || 3,
          check_interval: confirmationData.stats?.checkInterval || 60000,
          last_check: confirmationData.stats?.lastCheck || new Date().toISOString()
        }
      };

      setStatus(monitoringStatus);
      
      // Initialize config form with current values
      setConfigForm({
        utxo_check_interval: monitoringStatus.utxo_service.check_interval,
        confirmation_check_interval: monitoringStatus.confirmation_service.check_interval,
        required_confirmations: monitoringStatus.confirmation_service.required_confirmations,
        max_confirmation_time: 3600000 // 1 hour default
      });

    } catch (error) {
      console.error('Failed to fetch monitoring status:', error);
      setError('監視サービスの状態取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  // Control UTxO monitoring service
  const controlUtxoService = useCallback(async (action: 'start' | 'stop') => {
    try {
      setActionInProgress(`utxo_${action}`);
      
      const authFetch = createAuthenticatedFetch();
      await authFetch(`/api/ada/monitoring/${action}`, {
        method: 'POST'
      });
      
      // Refresh status
      await fetchStatus();
    } catch (error) {
      console.error(`Failed to ${action} UTxO service:`, error);
      setError(`UTxO監視サービスの${action === 'start' ? '開始' : '停止'}に失敗しました`);
    } finally {
      setActionInProgress(null);
    }
  }, [fetchStatus]);

  // Control confirmation monitoring service
  const controlConfirmationService = useCallback(async (action: 'start' | 'stop') => {
    try {
      setActionInProgress(`confirmation_${action}`);
      
      const authFetch = createAuthenticatedFetch();
      await authFetch(`/api/ada/confirmation/${action}`, {
        method: 'POST'
      });
      
      // Refresh status
      await fetchStatus();
    } catch (error) {
      console.error(`Failed to ${action} confirmation service:`, error);
      setError(`ブロック確認サービスの${action === 'start' ? '開始' : '停止'}に失敗しました`);
    } finally {
      setActionInProgress(null);
    }
  }, [fetchStatus]);

  // Update configuration
  const updateConfig = useCallback(async () => {
    try {
      setActionInProgress('config_update');
      
      const authFetch = createAuthenticatedFetch();
      
      // Update confirmation config if changed
      if (configForm.confirmation_check_interval || configForm.required_confirmations || configForm.max_confirmation_time) {
        const confirmationConfig = {
          ...(configForm.confirmation_check_interval && { check_interval: configForm.confirmation_check_interval }),
          ...(configForm.required_confirmations && { required_confirmations: configForm.required_confirmations }),
          ...(configForm.max_confirmation_time && { max_confirmation_time: configForm.max_confirmation_time })
        };

        await authFetch('/api/ada/confirmation/config', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(confirmationConfig)
        });
      }

      // Note: UTxO monitoring config would need to be implemented in the API
      // For now, we'll just refresh the status
      await fetchStatus();
      
    } catch (error) {
      console.error('Failed to update config:', error);
      setError('設定の更新に失敗しました');
    } finally {
      setActionInProgress(null);
    }
  }, [configForm, fetchStatus]);

  // Initialize data
  useEffect(() => {
    fetchStatus();
    
    // Set up auto-refresh every 30 seconds
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Handle config form changes
  const handleConfigChange = useCallback((field: keyof ServiceConfig, value: number) => {
    setConfigForm(prev => ({ ...prev, [field]: value }));
  }, []);

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
            fetchStatus();
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
          <h1 className="text-2xl font-bold text-gray-900">監視設定</h1>
          <p className="text-gray-600">監視サービスの管理と設定</p>
        </div>
        <button
          onClick={fetchStatus}
          disabled={loading}
          className="flex items-center px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 disabled:opacity-50"
        >
          <svg className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          更新
        </button>
      </div>

      {/* Service Status Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* UTxO Monitoring Service */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                UTxO監視サービス
              </h3>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                status?.utxo_service.running 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-red-100 text-red-800'
              }`}>
                {status?.utxo_service.running ? 'RUNNING' : 'STOPPED'}
              </span>
            </div>

            <div className="space-y-3 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">監視中の請求:</span>
                <span className="font-medium">{status?.utxo_service.monitored_requests || 0}</span>
              </div>
              
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">チェック間隔:</span>
                <span className="font-medium">{Math.round((status?.utxo_service.check_interval || 0) / 1000)}秒</span>
              </div>
              
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">最終チェック:</span>
                <span className="font-medium">
                  {status?.utxo_service.last_check 
                    ? new Date(status.utxo_service.last_check).toLocaleString('ja-JP')
                    : '-'
                  }
                </span>
              </div>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => controlUtxoService('start')}
                disabled={status?.utxo_service.running || actionInProgress === 'utxo_start'}
                className="flex-1 bg-green-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionInProgress === 'utxo_start' ? '開始中...' : '開始'}
              </button>
              
              <button
                onClick={() => controlUtxoService('stop')}
                disabled={!status?.utxo_service.running || actionInProgress === 'utxo_stop'}
                className="flex-1 bg-red-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionInProgress === 'utxo_stop' ? '停止中...' : '停止'}
              </button>
            </div>
          </div>
        </div>

        {/* Block Confirmation Service */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                ブロック確認サービス
              </h3>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                status?.confirmation_service.running 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-red-100 text-red-800'
              }`}>
                {status?.confirmation_service.running ? 'RUNNING' : 'STOPPED'}
              </span>
            </div>

            <div className="space-y-3 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">監視中のTX:</span>
                <span className="font-medium">{status?.confirmation_service.monitored_transactions || 0}</span>
              </div>
              
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">必要確認数:</span>
                <span className="font-medium">{status?.confirmation_service.required_confirmations || 3}</span>
              </div>
              
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">チェック間隔:</span>
                <span className="font-medium">{Math.round((status?.confirmation_service.check_interval || 0) / 1000)}秒</span>
              </div>
              
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">最終チェック:</span>
                <span className="font-medium">
                  {status?.confirmation_service.last_check 
                    ? new Date(status.confirmation_service.last_check).toLocaleString('ja-JP')
                    : '-'
                  }
                </span>
              </div>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => controlConfirmationService('start')}
                disabled={status?.confirmation_service.running || actionInProgress === 'confirmation_start'}
                className="flex-1 bg-green-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionInProgress === 'confirmation_start' ? '開始中...' : '開始'}
              </button>
              
              <button
                onClick={() => controlConfirmationService('stop')}
                disabled={!status?.confirmation_service.running || actionInProgress === 'confirmation_stop'}
                className="flex-1 bg-red-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionInProgress === 'confirmation_stop' ? '停止中...' : '停止'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Configuration Settings */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            サービス設定
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* UTxO Monitoring Config */}
            <div className="space-y-4">
              <h4 className="text-md font-medium text-gray-900">UTxO監視設定</h4>
              
              <div>
                <label htmlFor="utxo-interval" className="block text-sm font-medium text-gray-700">
                  チェック間隔 (秒)
                </label>
                <input
                  type="number"
                  id="utxo-interval"
                  min="10"
                  max="300"
                  value={Math.round((configForm.utxo_check_interval || 30000) / 1000)}
                  onChange={(e) => handleConfigChange('utxo_check_interval', parseInt(e.target.value) * 1000)}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 sm:text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">10-300秒の範囲で設定可能</p>
              </div>
            </div>

            {/* Block Confirmation Config */}
            <div className="space-y-4">
              <h4 className="text-md font-medium text-gray-900">ブロック確認設定</h4>
              
              <div>
                <label htmlFor="confirmation-interval" className="block text-sm font-medium text-gray-700">
                  チェック間隔 (秒)
                </label>
                <input
                  type="number"
                  id="confirmation-interval"
                  min="30"
                  max="300"
                  value={Math.round((configForm.confirmation_check_interval || 60000) / 1000)}
                  onChange={(e) => handleConfigChange('confirmation_check_interval', parseInt(e.target.value) * 1000)}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 sm:text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">30-300秒の範囲で設定可能</p>
              </div>

              <div>
                <label htmlFor="required-confirmations" className="block text-sm font-medium text-gray-700">
                  必要確認数
                </label>
                <input
                  type="number"
                  id="required-confirmations"
                  min="1"
                  max="10"
                  value={configForm.required_confirmations || 3}
                  onChange={(e) => handleConfigChange('required_confirmations', parseInt(e.target.value))}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 sm:text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">1-10の範囲で設定可能</p>
              </div>

              <div>
                <label htmlFor="max-confirmation-time" className="block text-sm font-medium text-gray-700">
                  最大確認待機時間 (時間)
                </label>
                <input
                  type="number"
                  id="max-confirmation-time"
                  min="1"
                  max="24"
                  value={Math.round((configForm.max_confirmation_time || 3600000) / 3600000)}
                  onChange={(e) => handleConfigChange('max_confirmation_time', parseInt(e.target.value) * 3600000)}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 sm:text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">1-24時間の範囲で設定可能</p>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={updateConfig}
              disabled={actionInProgress === 'config_update'}
              className="bg-orange-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {actionInProgress === 'config_update' ? '更新中...' : '設定を更新'}
            </button>
          </div>
        </div>
      </div>

      {/* Health Check */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            システムヘルス
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700">UTxO監視</span>
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                status?.utxo_service.running 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-red-100 text-red-800'
              }`}>
                {status?.utxo_service.running ? '正常' : '停止中'}
              </span>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700">ブロック確認</span>
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                status?.confirmation_service.running 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-red-100 text-red-800'
              }`}>
                {status?.confirmation_service.running ? '正常' : '停止中'}
              </span>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700">全体ステータス</span>
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                status?.utxo_service.running && status?.confirmation_service.running
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-yellow-100 text-yellow-800'
              }`}>
                {status?.utxo_service.running && status?.confirmation_service.running ? '正常' : '部分停止'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};