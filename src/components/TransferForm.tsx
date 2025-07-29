import React, { useState, useCallback } from 'react';
import { Buffer } from 'buffer';
import { useYoroiConnect } from '../hooks/useYoroiConnect';
import { useUtxoManager } from '../hooks/useUtxoManager';
import { TransferFormProps } from '../types';

// Buffer polyfill for browser
window.Buffer = Buffer;

export const TransferForm: React.FC<TransferFormProps> = ({
  onTransferComplete,
  onTransferError,
  className = '',
}) => {
  const { isConnected, api } = useYoroiConnect();
  const { utxos, totalAda, autoSelectForAmount, clearSelection } = useUtxoManager();
  
  const [formData, setFormData] = useState({
    to: '',
    amount: '',
    sweepMode: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // フォーム入力の処理
  const handleInputChange = useCallback((field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setValidationErrors([]);
  }, []);

  // バリデーション
  const validateForm = useCallback((): string[] => {
    const errors: string[] = [];

    // アドレス検証
    if (!formData.to.trim()) {
      errors.push('送金先アドレスを入力してください');
    } else if (!formData.to.startsWith('addr')) {
      errors.push('有効なCardanoアドレスを入力してください（addr1で始まる）');
    }

    // 金額検証（Sweepモードでない場合）
    if (!formData.sweepMode) {
      if (!formData.amount.trim()) {
        errors.push('送金金額を入力してください');
      } else {
        const amount = parseFloat(formData.amount);
        if (isNaN(amount) || amount <= 0) {
          errors.push('有効な金額を入力してください');
        } else if (amount > Number(totalAda) / 1_000_000) {
          errors.push('残高が不足しています');
        }
      }
    }

    // UTxO存在確認
    if (utxos.length === 0) {
      errors.push('利用可能なUTxOがありません');
    }

    return errors;
  }, [formData, totalAda, utxos.length]);

  // 送金実行
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isConnected || !api) {
      onTransferError('ウォレットが接続されていません');
      return;
    }

    const errors = validateForm();
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }

    setIsSubmitting(true);
    setValidationErrors([]);

    try {
      // CSL (Cardano Serialization Library) を動的読み込み
      const wasmModule = await import('@emurgo/cardano-serialization-lib-browser');
      const wasm = wasmModule.default || wasmModule;
      
      console.log('🔧 CSL loaded in TransferForm:', { 
        wasm: !!wasm, 
        TransactionBuilder: !!wasm.TransactionBuilder 
      });
      
      // プロトコルパラメータを取得（簡略化版）
      const minFee = BigInt(170_000); // 0.17 ADA (実際にはBlockfrostから取得)
      
      let requiredLovelace: bigint;
      
      if (formData.sweepMode) {
        // Sweep送金: 全額 - 手数料
        requiredLovelace = totalAda - minFee;
        if (requiredLovelace <= 0n) {
          throw new Error('手数料を差し引くと送金可能な金額がありません');
        }
      } else {
        // 通常送金
        requiredLovelace = BigInt(Math.floor(parseFloat(formData.amount) * 1_000_000));
      }

      // UTxO選択をクリアして自動選択
      clearSelection();
      const hasEnoughFunds = autoSelectForAmount(requiredLovelace + minFee);
      
      if (!hasEnoughFunds) {
        throw new Error('必要な資金のUTxOを選択できませんでした');
      }

      // 簡略化されたトランザクション構築（実際のCSL実装が必要）
      const txBuilder = wasm.TransactionBuilder.new(
        wasm.TransactionBuilderConfigBuilder.new()
          .fee_algo(wasm.LinearFee.new(
            wasm.BigNum.from_str('44'),
            wasm.BigNum.from_str('155381')
          ))
          .pool_deposit(wasm.BigNum.from_str('500000000'))
          .key_deposit(wasm.BigNum.from_str('2000000'))
          .max_value_size(5000)
          .max_tx_size(16384)
          .coins_per_utxo_byte(wasm.BigNum.from_str('34482'))
          .build()
      );

      // Output追加
      const outputAddress = wasm.Address.from_bech32(formData.to);
      const outputValue = wasm.Value.new(wasm.BigNum.from_str(requiredLovelace.toString()));
      
      txBuilder.add_output(
        wasm.TransactionOutput.new(outputAddress, outputValue)
      );

      // UTxO inputs を追加（簡略化）
      // 実際の実装では選択されたUTxOを適切に追加する必要があります
      
      // 手数料計算と設定
      txBuilder.set_fee(wasm.BigNum.from_str(minFee.toString()));

      // トランザクション構築
      const txBody = txBuilder.build();
      const tx = wasm.Transaction.new(
        txBody,
        wasm.TransactionWitnessSet.new(),
        undefined // metadata
      );

      // 署名要求
      const txHex = Buffer.from(tx.to_bytes()).toString('hex');
      const witnessSetHex = await api.signTx(txHex, true);
      
      // 署名されたトランザクションを構築
      const witnessSet = wasm.TransactionWitnessSet.from_bytes(
        Buffer.from(witnessSetHex, 'hex')
      );
      const signedTx = wasm.Transaction.new(txBody, witnessSet, tx.auxiliary_data());
      
      // トランザクション送信
      const txHash = await api.submitTx(Buffer.from(signedTx.to_bytes()).toString('hex'));
      
      // 成功時の処理
      onTransferComplete(txHash);
      
      // フォームリセット
      setFormData({ to: '', amount: '', sweepMode: false });
      clearSelection();

    } catch (error: any) {
      console.error('Transfer failed:', error);
      onTransferError(error.message || 'トランザクション送信に失敗しました');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isConnected,
    api,
    formData,
    validateForm,
    totalAda,
    autoSelectForAmount,
    clearSelection,
    onTransferComplete,
    onTransferError,
  ]);

  if (!isConnected) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <p className="text-gray-500">ウォレットを接続してください</p>
      </div>
    );
  }

  return (
    <div className={`max-w-lg mx-auto ${className}`}>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 送金先アドレス */}
        <div>
          <label htmlFor="to" className="block text-sm font-medium text-gray-700 mb-2">
            送金先アドレス *
          </label>
          <input
            type="text"
            id="to"
            value={formData.to}
            onChange={(e) => handleInputChange('to', e.target.value)}
            placeholder="addr1..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500"
            disabled={isSubmitting}
          />
        </div>

        {/* Sweepモード切り替え */}
        <div className="flex items-center">
          <input
            type="checkbox"
            id="sweepMode"
            checked={formData.sweepMode}
            onChange={(e) => handleInputChange('sweepMode', e.target.checked)}
            className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
            disabled={isSubmitting}
          />
          <label htmlFor="sweepMode" className="ml-2 block text-sm text-gray-900">
            Sweep送金（全額送金）
          </label>
        </div>

        {/* 送金金額（Sweepモードでない場合のみ） */}
        {!formData.sweepMode && (
          <div>
            <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-2">
              送金金額 (ADA) *
            </label>
            <input
              type="number"
              id="amount"
              step="0.000001"
              min="0"
              value={formData.amount}
              onChange={(e) => handleInputChange('amount', e.target.value)}
              placeholder="0.000000"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500"
              disabled={isSubmitting}
            />
            <p className="mt-1 text-xs text-gray-500">
              利用可能残高: {(Number(totalAda) / 1_000_000).toFixed(6)} ADA
            </p>
          </div>
        )}

        {/* バリデーションエラー表示 */}
        {validationErrors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <ul className="text-sm text-red-800 space-y-1">
                  {validationErrors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* 送金情報サマリー */}
        {formData.sweepMode && (
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-blue-800">
                  <strong>Sweep送金:</strong> 利用可能な全額から手数料を差し引いた金額を送金します
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  おおよその送金額: {((Number(totalAda) - 170_000) / 1_000_000).toFixed(6)} ADA
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 送信ボタン */}
        <button
          type="submit"
          disabled={isSubmitting || utxos.length === 0}
          className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400 text-white font-bold py-3 px-4 rounded transition-colors flex items-center justify-center"
        >
          {isSubmitting ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              送金処理中...
            </>
          ) : (
            <>
              {formData.sweepMode ? '全額送金' : 'ADA送金'}実行
            </>
          )}
        </button>
      </form>
    </div>
  );
};