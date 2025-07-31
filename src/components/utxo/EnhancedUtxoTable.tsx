/**
 * Enhanced UTxO Table Component
 * Advanced UTxO selection with filtering, sorting, and analytics
 */
import React, { useState, useMemo, useCallback } from 'react';
import { UTxO } from '../../types/cardano';
import { 
  UTxOFilter, 
  filterUtxos, 
  analyzeUtxos, 
  isAdaOnlyUtxo,
  hasNativeTokens,
  getAssetCount 
} from '../../lib/utxoSelection';

interface EnhancedUtxoTableProps {
  utxos: UTxO[];
  selectedUtxos: UTxO[];
  onSelectUtxo: (utxo: UTxO) => void;
  onDeselectUtxo: (utxo: UTxO) => void;
  onClearSelection: () => void;
  onSelectAll: () => void;
  onAutoSelect?: (amount: bigint) => void;
  isLoading?: boolean;
  className?: string;
  selectionEnabled?: boolean;
  showAnalytics?: boolean;
  maxHeight?: string;
}

export const EnhancedUtxoTable: React.FC<EnhancedUtxoTableProps> = ({
  utxos,
  selectedUtxos,
  onSelectUtxo,
  onDeselectUtxo,
  onClearSelection,
  onSelectAll,
  onAutoSelect,
  isLoading = false,
  className = '',
  selectionEnabled = true,
  showAnalytics = true,
  maxHeight = '400px'
}) => {
  const [filter, setFilter] = useState<UTxOFilter>({
    adaOnly: false,
    hasAssets: null,
    sortBy: 'amount_desc'
  });

  const [showFilters, setShowFilters] = useState(false);
  const [autoSelectAmount, setAutoSelectAmount] = useState('');

  // Filter and analyze UTxOs
  const { filteredUtxos, analytics } = useMemo(() => {
    const filtered = filterUtxos(utxos, filter);
    const analyticsData = analyzeUtxos(filtered);
    
    return {
      filteredUtxos: filtered,
      analytics: analyticsData
    };
  }, [utxos, filter]);

  // Helper functions
  const formatAda = useCallback((lovelace: string | bigint): string => {
    const ada = Number(lovelace) / 1_000_000;
    return `${ada.toLocaleString(undefined, { maximumFractionDigits: 6 })} ADA`;
  }, []);

  const formatTxHash = useCallback((hash: string): string => {
    return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
  }, []);

  const isSelected = useCallback((utxo: UTxO): boolean => {
    return selectedUtxos.some(
      selected => selected.txHash === utxo.txHash && selected.outputIndex === utxo.outputIndex
    );
  }, [selectedUtxos]);

  const handleToggleSelect = useCallback((utxo: UTxO): void => {
    if (!selectionEnabled) return;
    
    if (isSelected(utxo)) {
      onDeselectUtxo(utxo);
    } else {
      onSelectUtxo(utxo);
    }
  }, [selectionEnabled, isSelected, onSelectUtxo, onDeselectUtxo]);

  const handleAutoSelect = useCallback(() => {
    if (!onAutoSelect || !autoSelectAmount) return;
    
    try {
      const amount = BigInt(Math.floor(parseFloat(autoSelectAmount) * 1_000_000));
      onAutoSelect(amount);
      setAutoSelectAmount('');
    } catch (error) {
      console.error('Invalid amount for auto selection:', error);
    }
  }, [onAutoSelect, autoSelectAmount]);

  // Render asset information
  const renderAssets = useCallback((utxo: UTxO): React.ReactNode => {
    if (!utxo.amount.multiasset) return null;

    const assetCount = getAssetCount(utxo);
    if (assetCount === 0) return null;

    return (
      <div className="text-xs text-blue-600">
        <span className="bg-blue-100 px-2 py-1 rounded-full">
          {assetCount} アセット
        </span>
      </div>
    );
  }, []);

  if (isLoading) {
    return (
      <div className={`bg-white rounded-lg shadow p-6 ${className}`}>
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
          <span className="ml-2 text-gray-600">UTxOを読み込み中...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow overflow-hidden ${className}`}>
      {/* Header with analytics */}
      <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-lg font-medium text-gray-900">
              UTxO一覧 ({filteredUtxos.length})
            </h3>
            <p className="text-sm text-gray-600">
              選択中: {selectedUtxos.length} UTxO 
              {selectedUtxos.length > 0 && (
                <span className="ml-2 font-medium">
                  ({formatAda(selectedUtxos.reduce((sum, utxo) => sum + BigInt(utxo.amount.coin), BigInt(0)))})
                </span>
              )}
            </p>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="px-3 py-1 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              フィルター
            </button>
            
            {selectionEnabled && (
              <>
                <button
                  onClick={onSelectAll}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  全選択
                </button>
                <button
                  onClick={onClearSelection}
                  disabled={selectedUtxos.length === 0}
                  className="px-3 py-1 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50"
                >
                  選択解除
                </button>
              </>
            )}
          </div>
        </div>

        {/* Analytics */}
        {showAnalytics && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500">総ADA:</span>
              <div className="font-medium">{formatAda(analytics.totalAda)}</div>
            </div>
            <div>
              <span className="text-gray-500">ADA専用:</span>
              <div className="font-medium">{analytics.adaOnlyUtxos} UTxO</div>
            </div>
            <div>
              <span className="text-gray-500">アセット付き:</span>
              <div className="font-medium">{analytics.utxosWithAssets} UTxO</div>
            </div>
            <div>
              <span className="text-gray-500">平均額:</span>
              <div className="font-medium">{formatAda(analytics.averageAmount)}</div>
            </div>
          </div>
        )}

        {/* Filters */}
        {showFilters && (
          <div className="mt-4 p-4 bg-white border border-gray-200 rounded-md">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* ADA Only Filter */}
              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={filter.adaOnly}
                    onChange={(e) => setFilter(prev => ({ ...prev, adaOnly: e.target.checked }))}
                    className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                  />
                  <span className="ml-2 text-sm">ADA専用UTxOのみ</span>
                </label>
              </div>

              {/* Asset Filter */}
              <div>
                <label className="block text-sm text-gray-700 mb-1">アセット</label>
                <select
                  value={filter.hasAssets === null ? 'any' : filter.hasAssets ? 'with' : 'without'}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFilter(prev => ({ 
                      ...prev, 
                      hasAssets: value === 'any' ? null : value === 'with' 
                    }));
                  }}
                  className="w-full text-sm border border-gray-300 rounded-md px-3 py-1"
                >
                  <option value="any">すべて</option>
                  <option value="with">アセット付きのみ</option>
                  <option value="without">ADAのみ</option>
                </select>
              </div>

              {/* Sort By */}
              <div>
                <label className="block text-sm text-gray-700 mb-1">並び順</label>
                <select
                  value={filter.sortBy}
                  onChange={(e) => setFilter(prev => ({ 
                    ...prev, 
                    sortBy: e.target.value as UTxOFilter['sortBy'] 
                  }))}
                  className="w-full text-sm border border-gray-300 rounded-md px-3 py-1"
                >
                  <option value="amount_desc">金額（大→小）</option>
                  <option value="amount_asc">金額（小→大）</option>
                  <option value="mixed_first">アセット付き優先</option>
                  <option value="age_desc">新しい順</option>
                  <option value="age_asc">古い順</option>
                </select>
              </div>
            </div>

            {/* Auto Selection */}
            {selectionEnabled && onAutoSelect && (
              <div className="mt-4 flex items-center space-x-2">
                <input
                  type="number"
                  step="0.000001"
                  placeholder="自動選択するADA量"
                  value={autoSelectAmount}
                  onChange={(e) => setAutoSelectAmount(e.target.value)}
                  className="flex-1 text-sm border border-gray-300 rounded-md px-3 py-1"
                />
                <button
                  onClick={handleAutoSelect}
                  disabled={!autoSelectAmount}
                  className="px-4 py-1 text-sm bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50"
                >
                  自動選択
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* UTxO Table */}
      <div style={{ maxHeight }} className="overflow-y-auto">
        {filteredUtxos.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            <p className="text-lg">フィルター条件に一致するUTxOがありません</p>
            <button
              onClick={() => setFilter({
                adaOnly: false,
                hasAssets: null,
                sortBy: 'amount_desc'
              })}
              className="mt-2 text-sm text-orange-600 hover:text-orange-700"
            >
              フィルターをリセット
            </button>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {selectionEnabled && (
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                    選択
                  </th>
                )}
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  トランザクション
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ADA金額
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  アセット
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  タイプ
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredUtxos.map((utxo) => (
                <tr 
                  key={`${utxo.txHash}#${utxo.outputIndex}`}
                  className={`
                    hover:bg-gray-50 transition-colors
                    ${selectionEnabled ? 'cursor-pointer' : ''}
                    ${selectionEnabled && isSelected(utxo) ? 'bg-orange-50 border-l-4 border-orange-500' : ''}
                  `}
                  onClick={selectionEnabled ? () => handleToggleSelect(utxo) : undefined}
                >
                  {selectionEnabled && (
                    <td className="px-4 py-3 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={isSelected(utxo)}
                        onChange={() => handleToggleSelect(utxo)}
                        className="focus:ring-orange-500 h-4 w-4 text-orange-600 border-gray-300 rounded"
                      />
                    </td>
                  )}
                  
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      <span className="font-mono">{formatTxHash(utxo.txHash)}</span>
                      <span className="text-gray-500">#{utxo.outputIndex}</span>
                    </div>
                    <div className="text-xs text-gray-500 font-mono">
                      {utxo.address.slice(0, 30)}...
                    </div>
                  </td>
                  
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {formatAda(utxo.amount.coin)}
                    </div>
                  </td>
                  
                  <td className="px-4 py-3 whitespace-nowrap">
                    {renderAssets(utxo)}
                  </td>
                  
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      isAdaOnlyUtxo(utxo)
                        ? 'bg-green-100 text-green-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {isAdaOnlyUtxo(utxo) ? 'ADA専用' : 'アセット付き'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer with selection summary */}
      {selectionEnabled && selectedUtxos.length > 0 && (
        <div className="px-6 py-4 bg-orange-50 border-t border-orange-200">
          <div className="flex justify-between items-center">
            <div className="text-sm">
              <span className="font-medium text-orange-900">
                {selectedUtxos.length} UTxO選択中
              </span>
              <span className="text-orange-700 ml-2">
                (ADA専用: {selectedUtxos.filter(isAdaOnlyUtxo).length}, 
                アセット付き: {selectedUtxos.filter(hasNativeTokens).length})
              </span>
            </div>
            <div className="text-sm font-medium text-orange-900">
              合計: {formatAda(selectedUtxos.reduce((sum, utxo) => sum + BigInt(utxo.amount.coin), BigInt(0)))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnhancedUtxoTable;