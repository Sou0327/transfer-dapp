/**
 * Dashboard Route Component - Lazy loaded
 */

import React from 'react';
import { SmartUTxOTable } from '../../SmartUTxOTable';
import { Card, CardHeader, CardBody, LoadingSpinner } from '../../common';
import { useUtxoManager } from '../../../hooks/useUtxoManager';
import { usePerformanceMonitor } from '../../../lib/performance/reactOptimization';

interface DashboardRouteProps {
  onPreloadRoute?: (route: string) => void;
}

const DashboardRoute: React.FC<DashboardRouteProps> = ({ onPreloadRoute }) => {
  // Performance monitoring for lazy loaded component
  usePerformanceMonitor('DashboardRoute');

  const { utxos, isLoading: utxosLoading, error: utxoError } = useUtxoManager();

  React.useEffect(() => {
    // Preload transfer route on user hover
    const transferButton = document.querySelector('[data-route="transfer"]');
    if (transferButton && onPreloadRoute) {
      const handleMouseEnter = () => onPreloadRoute('transfer');
      transferButton.addEventListener('mouseenter', handleMouseEnter);
      
      return () => {
        transferButton.removeEventListener('mouseenter', handleMouseEnter);
      };
    }
  }, [onPreloadRoute]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">ダッシュボード</h2>
        <div className="text-sm text-gray-500">
          Lazy loaded • {utxos.length} UTxOs
        </div>
      </div>
      
      {/* UTxO一覧 */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-medium text-gray-900">UTxO一覧</h3>
          <p className="text-sm text-gray-500">あなたのウォレットの未使用トランザクション出力</p>
        </CardHeader>
        <CardBody>
          {utxosLoading ? (
            <div className="text-center py-4">
              <LoadingSpinner size="lg" color="orange" />
              <p className="text-gray-500 mt-2">UTxOを読み込み中...</p>
            </div>
          ) : utxoError ? (
            <div className="text-center py-4 text-red-600">
              <p>エラー: {utxoError}</p>
            </div>
          ) : (
            <SmartUTxOTable 
              utxos={utxos}
              virtualizationThreshold={50}
              showAssets={true}
            />
          )}
        </CardBody>
      </Card>

      {/* Statistics Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardBody>
            <div className="text-sm font-medium text-gray-500">Total UTxOs</div>
            <div className="text-2xl font-bold text-gray-900">{utxos.length}</div>
          </CardBody>
        </Card>
        
        <Card>
          <CardBody>
            <div className="text-sm font-medium text-gray-500">Total ADA</div>
            <div className="text-2xl font-bold text-gray-900">
              {(utxos.reduce((sum, utxo) => sum + Number(utxo.amount.coin), 0) / 1_000_000).toFixed(2)}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className="text-sm font-medium text-gray-500">Performance</div>
            <div className="text-2xl font-bold text-green-600">Optimized</div>
            <div className="text-xs text-gray-500">
              {utxos.length > 50 ? 'Virtualized' : 'Standard'} rendering
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
};

export default DashboardRoute;