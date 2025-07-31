/**
 * Coin Control Modal Component
 * Advanced UTxO selection interface with strategies and analytics
 */
import React, { useState, useCallback, useMemo } from 'react';
import { UTxO } from '../../types/cardano';
import { 
  SELECTION_STRATEGIES,
  analyzeUtxos,
  isSelectionSufficient 
} from '../../lib/utxoSelection';
import { EnhancedUtxoTable } from './EnhancedUtxoTable';

interface CoinControlModalProps {
  isOpen: boolean;
  onClose: () => void;
  utxos: UTxO[];
  selectedUtxos: UTxO[];
  onSelectUtxos: (utxos: UTxO[]) => void;
  targetAmount?: bigint;
  estimatedFee?: bigint;
  title?: string;
  description?: string;
}

export const CoinControlModal: React.FC<CoinControlModalProps> = ({
  isOpen,
  onClose,
  utxos,
  selectedUtxos,
  onSelectUtxos,
  targetAmount,
  estimatedFee = BigInt(200_000), // 0.2 ADA default
  title = 'コインコントロール',
  description = 'トランザクションに使用するUTxOを手動で選択できます'
}) => {
  const [localSelection, setLocalSelection] = useState<UTxO[]>(selectedUtxos);
  const [selectedStrategy, setSelectedStrategy] = useState<string>('ada_only_priority');
  const [autoSelectAmount, setAutoSelectAmount] = useState('');

  // Calculate analytics for current selection
  const analytics = useMemo(() => {
    return analyzeUtxos(localSelection);
  }, [localSelection]);

  // Calculate required amount including fees
  const totalRequired = useMemo(() => {
    return targetAmount ? targetAmount + estimatedFee : BigInt(0);
  }, [targetAmount, estimatedFee]);

  // Check if selection is sufficient
  const isSufficient = useMemo(() => {
    if (!targetAmount) return true;
    return isSelectionSufficient(localSelection, targetAmount, estimatedFee);
  }, [localSelection, targetAmount, estimatedFee]);

  // Format ADA amount
  const formatAda = useCallback((lovelace: string | bigint): string => {
    const ada = Number(lovelace) / 1_000_000;
    return `${ada.toLocaleString(undefined, { maximumFractionDigits: 6 })} ADA`;
  }, []);

  // Handle UTxO selection
  const handleSelectUtxo = useCallback((utxo: UTxO) => {
    setLocalSelection(prev => {
      const exists = prev.some(u => u.txHash === utxo.txHash && u.outputIndex === utxo.outputIndex);
      if (exists) return prev;
      return [...prev, utxo];
    });
  }, []);

  const handleDeselectUtxo = useCallback((utxo: UTxO) => {
    setLocalSelection(prev => 
      prev.filter(u => !(u.txHash === utxo.txHash && u.outputIndex === utxo.outputIndex))
    );
  }, []);

  const handleClearSelection = useCallback(() => {
    setLocalSelection([]);
  }, []);

  const handleSelectAll = useCallback(() => {
    setLocalSelection([...utxos]);
  }, [utxos]);

  // Handle strategy-based auto selection
  const handleAutoSelect = useCallback((amount?: bigint) => {
    const strategy = SELECTION_STRATEGIES.find(s => s.name === selectedStrategy);
    if (!strategy) return;

    const target = amount || totalRequired;
    if (target <= BigInt(0)) return;

    const selected = strategy.algorithm(utxos, target, localSelection);
    setLocalSelection(prev => {
      // Merge with existing selection, avoiding duplicates
      const merged = [...prev];
      selected.forEach(utxo => {
        const exists = merged.some(u => u.txHash === utxo.txHash && u.outputIndex === utxo.outputIndex);
        if (!exists) {
          merged.push(utxo);
        }
      });
      return merged;
    });
  }, [selectedStrategy, totalRequired, utxos, localSelection]);

  const handleCustomAutoSelect = useCallback(() => {
    if (!autoSelectAmount) return;
    
    try {
      const amount = BigInt(Math.floor(parseFloat(autoSelectAmount) * 1_000_000));
      handleAutoSelect(amount);
      setAutoSelectAmount('');
    } catch (error) {
      console.error('Invalid amount for auto selection:', error);
    }
  }, [autoSelectAmount, handleAutoSelect]);

  // Apply selection and close modal
  const handleApply = useCallback(() => {
    onSelectUtxos(localSelection);
    onClose();
  }, [localSelection, onSelectUtxos, onClose]);

  // Reset to original selection
  const handleReset = useCallback(() => {
    setLocalSelection(selectedUtxos);
  }, [selectedUtxos]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
              <p className="text-sm text-gray-600 mt-1">{description}</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Controls and Analytics */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Selection Strategies */}
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-3">自動選択戦略</h3>
              <div className="space-y-2">
                {SELECTION_STRATEGIES.map((strategy) => (
                  <label key={strategy.name} className="flex items-start">
                    <input
                      type="radio"
                      name="strategy"
                      value={strategy.name}
                      checked={selectedStrategy === strategy.name}
                      onChange={(e) => setSelectedStrategy(e.target.value)}

                      className="mt-1 text-orange-600 focus:ring-orange-500"
                    />
                    <div className="ml-2">
                      <div className="text-sm font-medium">{strategy.description}</div>
                    </div>
                  </label>
                ))}
              </div>

              {/* Auto Selection Buttons */}
              <div className="mt-4 space-y-2">
                {targetAmount && targetAmount > BigInt(0) && (
                  <button
                    onClick={() => handleAutoSelect()}
                    className="w-full px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 text-sm"
                  >
                    必要額を自動選択 ({formatAda(totalRequired)})
                  </button>
                )}
                
                <div className="flex space-x-2">
                  <input
                    type="number"
                    step="0.000001"
                    placeholder="カスタム金額 (ADA)"
                    value={autoSelectAmount}
                    onChange={(e) => setAutoSelectAmount(e.target.value)}
                    className="flex-1 text-sm border border-gray-300 rounded-md px-3 py-2"
                  />
                  <button
                    onClick={handleCustomAutoSelect}
                    disabled={!autoSelectAmount}
                    className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm disabled:opacity-50"
                  >
                    選択
                  </button>
                </div>
              </div>
            </div>

            {/* Analytics */}
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-3">選択サマリー</h3>
              <div className="bg-white rounded-lg p-4 space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">選択UTxO数:</span>
                    <div className="font-medium">{analytics.totalUtxos}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">総ADA:</span>
                    <div className="font-medium">{formatAda(analytics.totalAda)}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">ADA専用:</span>
                    <div className="font-medium">{analytics.adaOnlyUtxos}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">アセット付き:</span>
                    <div className="font-medium">{analytics.utxosWithAssets}</div>
                  </div>
                </div>

                {/* Required amount check */}
                {targetAmount && targetAmount > BigInt(0) && (
                  <div className={`p-3 rounded-md ${
                    isSufficient 
                      ? 'bg-green-50 border border-green-200' 
                      : 'bg-red-50 border border-red-200'
                  }`}>
                    <div className="flex items-center">
                      <div className={`h-4 w-4 rounded-full mr-2 ${
                        isSufficient ? 'bg-green-500' : 'bg-red-500'
                      }`} />
                      <div className="text-sm">
                        <div className={`font-medium ${
                          isSufficient ? 'text-green-900' : 'text-red-900'
                        }`}>
                          {isSufficient ? '十分な残高' : '残高不足'}
                        </div>
                        <div className={`text-xs ${
                          isSufficient ? 'text-green-700' : 'text-red-700'
                        }`}>
                          必要: {formatAda(totalRequired)} / 
                          選択中: {formatAda(analytics.totalAda)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Asset summary */}
                {analytics.totalAssets.length > 0 && (
                  <div className="pt-2 border-t border-gray-200">
                    <div className="text-xs text-gray-500 mb-1">含まれるアセット:</div>
                    <div className="text-xs text-blue-600">
                      {analytics.totalAssets.length} 種類のネイティブトークン
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* UTxO Table */}
        <div className="flex-1 min-h-0">
          <EnhancedUtxoTable
            utxos={utxos}
            selectedUtxos={localSelection}
            onSelectUtxo={handleSelectUtxo}
            onDeselectUtxo={handleDeselectUtxo}
            onClearSelection={handleClearSelection}
            onSelectAll={handleSelectAll}
            onAutoSelect={handleAutoSelect}
            selectionEnabled={true}
            showAnalytics={false}
            maxHeight="400px"
            className="border-0 shadow-none"
          />
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              {localSelection.length > 0 && (
                <>
                  {localSelection.length} UTxO選択中 
                  ({formatAda(analytics.totalAda)})
                </>
              )}
            </div>
            
            <div className="flex space-x-3">
              <button
                onClick={handleReset}
                className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
              >
                リセット
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                onClick={handleApply}
                className={`px-4 py-2 text-sm rounded-md ${
                  targetAmount && !isSufficient
                    ? 'bg-gray-400 text-white cursor-not-allowed'
                    : 'bg-orange-600 text-white hover:bg-orange-700'
                }`}
                disabled={targetAmount ? !isSufficient : false}
              >
                適用
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CoinControlModal;