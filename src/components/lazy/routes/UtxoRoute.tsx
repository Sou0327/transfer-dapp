/**
 * UTxO Route Component - Lazy loaded
 */

import React from 'react';
import { SmartUTxOTable } from '../../SmartUTxOTable';
import { Card, CardHeader, CardBody, Button } from '../../common';
import { useUtxoManager } from '../../../hooks/useUtxoManager';
import { usePerformanceMonitor } from '../../../lib/performance/reactOptimization';

interface UtxoRouteProps {
  onPreloadRoute?: (route: string) => void;
}

const UtxoRoute: React.FC<UtxoRouteProps> = ({ onPreloadRoute }) => {
  // Performance monitoring for lazy loaded component
  usePerformanceMonitor('UtxoRoute');

  const { 
    utxos, 
    selectedUtxos, 
    isLoading, 
    error,
    selectUtxo,
    deselectUtxo,
    clearSelection,
    refreshUtxos
  } = useUtxoManager();

  const [showAdvanced, setShowAdvanced] = React.useState(false);

  React.useEffect(() => {
    // Preload transfer route when user selects UTxOs
    if (selectedUtxos.length > 0 && onPreloadRoute) {
      onPreloadRoute('transfer');
    }
  }, [selectedUtxos.length, onPreloadRoute]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">UTxO管理</h2>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-500">
            Lazy loaded • {utxos.length} UTxOs
          </div>
          <Button 
            onClick={() => setShowAdvanced(!showAdvanced)}
            variant="secondary"
            size="sm"
          >
            {showAdvanced ? '簡易表示' : '詳細表示'}
          </Button>
        </div>
      </div>

      {/* UTxO Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card padding="sm">
          <CardBody>
            <div className="text-sm font-medium text-gray-500">Total UTxOs</div>
            <div className="text-xl font-bold text-gray-900">{utxos.length}</div>
          </CardBody>
        </Card>
        
        <Card padding="sm">
          <CardBody>
            <div className="text-sm font-medium text-gray-500">Selected</div>
            <div className="text-xl font-bold text-orange-600">{selectedUtxos.length}</div>
          </CardBody>
        </Card>

        <Card padding="sm">
          <CardBody>
            <div className="text-sm font-medium text-gray-500">Total ADA</div>
            <div className="text-xl font-bold text-gray-900">
              {(utxos.reduce((sum, utxo) => sum + Number(utxo.amount.coin), 0) / 1_000_000).toFixed(2)}
            </div>
          </CardBody>
        </Card>

        <Card padding="sm">
          <CardBody>
            <div className="text-sm font-medium text-gray-500">Selected ADA</div>
            <div className="text-xl font-bold text-green-600">
              {(selectedUtxos.reduce((sum, utxo) => sum + Number(utxo.amount.coin), 0) / 1_000_000).toFixed(2)}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* UTxO Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">UTxO選択</h3>
            <div className="flex gap-2">
              <Button 
                onClick={refreshUtxos} 
                disabled={isLoading}
                size="sm"
              >
                更新
              </Button>
              {selectedUtxos.length > 0 && (
                <Button 
                  onClick={clearSelection}
                  variant="secondary"
                  size="sm"
                >
                  選択解除
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardBody>
          {error ? (
            <div className="text-center py-8 text-red-600">
              <p>エラー: {error}</p>
              <Button onClick={refreshUtxos} className="mt-4">
                再読み込み
              </Button>
            </div>
          ) : (
            <SmartUTxOTable 
              utxos={utxos}
              selectedUtxos={selectedUtxos}
              onSelect={selectUtxo}
              onDeselect={deselectUtxo}
              isLoading={isLoading}
              selectionEnabled={true}
              showAssets={showAdvanced}
              virtualizationThreshold={30}
            />
          )}
        </CardBody>
      </Card>

      {/* Coin Control Features */}
      {showAdvanced && (
        <Card>
          <CardHeader>
            <h3 className="text-lg font-medium text-gray-900">🪙 高度なコイン制御</h3>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="font-medium text-gray-900 mb-2">自動選択戦略</h4>
                <select className="w-full p-2 border border-gray-300 rounded">
                  <option>最大優先 (Largest First)</option>
                  <option>最小優先 (Smallest First)</option>
                  <option>ランダム選択</option>
                  <option>手数料最適化</option>
                </select>
              </div>
              <div>
                <h4 className="font-medium text-gray-900 mb-2">フィルター</h4>
                <select className="w-full p-2 border border-gray-300 rounded">
                  <option>すべて表示</option>
                  <option>1 ADA以上</option>
                  <option>10 ADA以上</option>
                  <option>アセット付きのみ</option>
                </select>
              </div>
            </div>
            
            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                💡 コイン制御により送金手数料を最適化し、プライバシーを向上させることができます。
              </p>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
};

export default UtxoRoute;