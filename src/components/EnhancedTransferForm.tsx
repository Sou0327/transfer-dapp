/**
 * Enhanced Transfer Form with Coin Control
 * Demonstrates integration of advanced UTxO selection in transfer workflow
 */
import React, { useState, useCallback, useMemo } from 'react';
import { 
  EnhancedUtxoTable, 
  CoinControlModal, 
  useEnhancedUtxoManager,
  SELECTION_STRATEGIES 
} from './utxo';

interface EnhancedTransferFormProps {
  onTransferComplete?: (txHash: string) => void;
  onTransferError?: (error: string) => void;
  className?: string;
}

export const EnhancedTransferForm: React.FC<EnhancedTransferFormProps> = ({
  onTransferComplete,
  onTransferError,
  className = ''
}) => {
  // Form state
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // UI state
  const [showCoinControl, setShowCoinControl] = useState(false);
  const [coinControlMode, setCoinControlMode] = useState<'auto' | 'manual'>('auto');
  
  // Enhanced UTxO manager
  const {
    utxos,
    selectedUtxos,
    totalAda,
    isLoading,
    error,
    selectUtxos,
    clearSelection,
    autoSelectOptimal,
    getSelectedTotal,
    getSelectedAnalytics,
    getUtxoAnalytics,
    isSelectionSufficient,
    coinControlEnabled,
    setCoinControlEnabled,
    defaultStrategy,
    setDefaultStrategy
  } = useEnhancedUtxoManager();

  // Calculate transfer details
  const transferAmount = useMemo(() => {
    try {
      return amount ? BigInt(Math.floor(parseFloat(amount) * 1_000_000)) : BigInt(0);
    } catch {
      return BigInt(0);
    }
  }, [amount]);

  const estimatedFee = BigInt(200_000); // 0.2 ADA estimate
  const totalRequired = transferAmount + estimatedFee;

  // Check if we have sufficient funds
  const hasSufficientFunds = useMemo(() => {
    if (transferAmount <= BigInt(0)) return true;
    
    if (coinControlMode === 'manual') {
      return isSelectionSufficient(transferAmount, estimatedFee);
    } else {
      return totalAda >= totalRequired;
    }
  }, [transferAmount, estimatedFee, totalRequired, totalAda, coinControlMode, isSelectionSufficient]);

  // Format ADA amount
  const formatAda = useCallback((lovelace: string | bigint): string => {
    const ada = Number(lovelace) / 1_000_000;
    return `${ada.toLocaleString(undefined, { maximumFractionDigits: 6 })} ADA`;
  }, []);

  // Handle coin control mode toggle
  const handleCoinControlToggle = useCallback((enabled: boolean) => {
    setCoinControlEnabled(enabled);
    setCoinControlMode(enabled ? 'manual' : 'auto');
    
    if (!enabled) {
      clearSelection();
    }
  }, [setCoinControlEnabled, clearSelection]);

  // Handle auto UTxO selection
  const handleAutoSelect = useCallback(() => {
    if (transferAmount <= BigInt(0)) return;
    
    clearSelection();
    const success = autoSelectOptimal(totalRequired);
    
    if (!success) {
      onTransferError?.('必要な金額のUTxOを自動選択できませんでした。手動で選択してください。');
    }
  }, [transferAmount, totalRequired, clearSelection, autoSelectOptimal, onTransferError]);

  // Handle form submission
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!recipient || !amount) {
      onTransferError?.('送金先アドレスと金額を入力してください。');
      return;
    }

    if (!hasSufficientFunds) {
      onTransferError?.('残高不足です。');
      return;
    }

    setIsSubmitting(true);

    try {
      // In a real implementation, this would build and submit the transaction
      console.log('Submitting transfer:', {
        recipient,
        amount: transferAmount.toString(),
        selectedUtxos: coinControlMode === 'manual' ? selectedUtxos : 'auto',
        memo
      });

      // Simulate transaction submission
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const mockTxHash = '0123456789abcdef'.repeat(4);
      onTransferComplete?.(mockTxHash);
      
      // Reset form
      setRecipient('');
      setAmount('');
      setMemo('');
      clearSelection();
      
    } catch (error) {
      console.error('Transfer failed:', error);
      onTransferError?.(error instanceof Error ? error.message : '送金に失敗しました');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    recipient, 
    amount, 
    hasSufficientFunds, 
    transferAmount, 
    selectedUtxos, 
    coinControlMode, 
    memo, 
    onTransferComplete, 
    onTransferError, 
    clearSelection
  ]);

  const selectedAnalytics = getSelectedAnalytics();
  const utxoAnalytics = getUtxoAnalytics();

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Transfer Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-4">
        <h3 className="text-lg font-medium text-gray-900">ADA送金</h3>
        
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Recipient Address */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            送金先アドレス
          </label>
          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="addr1..."
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
            required
          />
        </div>

        {/* Amount */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            送金金額 (ADA)
          </label>
          <input
            type="number"
            step="0.000001"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.000000"
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
            required
          />
          {transferAmount > BigInt(0) && (
            <p className="mt-1 text-sm text-gray-600">
              手数料込み総額: {formatAda(totalRequired)}
            </p>
          )}
        </div>

        {/* Memo */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            メモ（オプション）
          </label>
          <input
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="取引の説明..."
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>

        {/* Coin Control Section */}
        <div className="border-t border-gray-200 pt-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-md font-medium text-gray-900">コインコントロール</h4>
              <p className="text-sm text-gray-600">使用するUTxOを手動で選択できます</p>
            </div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={coinControlEnabled}
                onChange={(e) => handleCoinControlToggle(e.target.checked)}
                className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
              />
              <span className="ml-2 text-sm">有効にする</span>
            </label>
          </div>

          {coinControlEnabled && (
            <div className="space-y-4">
              {/* Selection Strategy */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  自動選択戦略
                </label>
                <select
                  value={defaultStrategy}
                  onChange={(e) => setDefaultStrategy(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-md px-3 py-2"
                >
                  {SELECTION_STRATEGIES.map(strategy => (
                    <option key={strategy.name} value={strategy.name}>
                      {strategy.description}
                    </option>
                  ))}
                </select>
              </div>

              {/* Selection Actions */}
              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={handleAutoSelect}
                  disabled={transferAmount <= BigInt(0)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm"
                >
                  自動選択
                </button>
                <button
                  type="button"
                  onClick={() => setShowCoinControl(true)}
                  className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 text-sm"
                >
                  手動選択
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  disabled={selectedUtxos.length === 0}
                  className="px-4 py-2 text-red-600 border border-red-300 rounded-md hover:bg-red-50 disabled:opacity-50 text-sm"
                >
                  選択解除
                </button>
              </div>

              {/* Selection Summary */}
              {selectedUtxos.length > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-md p-3">
                  <div className="text-sm">
                    <div className="font-medium text-orange-900">
                      {selectedUtxos.length} UTxO選択中
                    </div>
                    <div className="text-orange-700">
                      総額: {formatAda(getSelectedTotal())} 
                      (ADA専用: {selectedAnalytics.adaOnlyUtxos}, アセット付き: {selectedAnalytics.utxosWithAssets})
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Wallet Summary */}
        <div className="bg-gray-50 rounded-md p-3">
          <div className="text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-600">ウォレット残高:</span>
              <span className="font-medium">{formatAda(totalAda)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">UTxO数:</span>
              <span className="font-medium">
                {utxoAnalytics.totalUtxos} 
                (ADA専用: {utxoAnalytics.adaOnlyUtxos})
              </span>
            </div>
            {transferAmount > BigInt(0) && (
              <div className="flex justify-between">
                <span className="text-gray-600">残金額:</span>
                <span className={`font-medium ${hasSufficientFunds ? 'text-green-600' : 'text-red-600'}`}>
                  {formatAda(totalAda - totalRequired)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting || !hasSufficientFunds || !recipient || !amount}
          className={`w-full py-3 px-4 rounded-md font-medium ${
            isSubmitting || !hasSufficientFunds || !recipient || !amount
              ? 'bg-gray-400 text-white cursor-not-allowed'
              : 'bg-orange-600 text-white hover:bg-orange-700'
          }`}
        >
          {isSubmitting ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              送金処理中...
            </div>
          ) : (
            '送金実行'
          )}
        </button>
      </form>

      {/* UTxO Overview */}
      {!coinControlEnabled && (
        <EnhancedUtxoTable
          utxos={utxos}
          selectedUtxos={[]}
          onSelectUtxo={() => {}}
          onDeselectUtxo={() => {}}
          onClearSelection={() => {}}
          onSelectAll={() => {}}
          isLoading={isLoading}
          selectionEnabled={false}
          showAnalytics={true}
          maxHeight="300px"
        />
      )}

      {/* Coin Control Modal */}
      <CoinControlModal
        isOpen={showCoinControl}
        onClose={() => setShowCoinControl(false)}
        utxos={utxos}
        selectedUtxos={selectedUtxos}
        onSelectUtxos={selectUtxos}
        targetAmount={transferAmount}
        estimatedFee={estimatedFee}
        title="UTxO選択"
        description="送金に使用するUTxOを選択してください"
      />
    </div>
  );
};