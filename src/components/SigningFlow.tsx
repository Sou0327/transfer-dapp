/**
 * Signing Flow Component
 * Handles the complete transaction signing workflow
 */
import React, { useState, useCallback, useEffect } from 'react';
import { TxPreview } from './TxPreview';
import { TxBuilderFactory } from '../lib/txBuilders';
import { 
  CIP30Api, 
  OTCRequest, 
  TransactionBuildResult,
  ProtocolParameters,
  PreSignedData 
} from '../types/otc/index';

interface SigningFlowProps {
  request: OTCRequest;
  api: CIP30Api;
  onSuccess: (preSignedData: PreSignedData) => void;
  onError: (error: string) => void;
  onCancel: () => void;
  className?: string;
}

interface SigningState {
  step: 'building' | 'preview' | 'signing' | 'complete' | 'error';
  txResult: TransactionBuildResult | null;
  error: string | null;
  isLoading: boolean;
}

export const SigningFlow: React.FC<SigningFlowProps> = ({
  request,
  api,
  onSuccess,
  onError,
  onCancel,
  className = ''
}) => {
  const [state, setState] = useState<SigningState>({
    step: 'building',
    txResult: null,
    error: null,
    isLoading: false
  });

  // Update state helper
  const updateState = useCallback((updates: Partial<SigningState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  // Get protocol parameters
  const getProtocolParams = useCallback(async (): Promise<ProtocolParameters> => {
    try {
      const response = await fetch('/api/ada/protocol-params');
      if (!response.ok) {
        throw new Error('Failed to get protocol parameters');
      }
      return await response.json();
    } catch (error) {
      throw new Error(`Protocol parameters fetch failed: ${error}`);
    }
  }, []);

  // Get wallet addresses
  const getWalletAddresses = useCallback(async () => {
    try {
      const usedAddresses = await api.getUsedAddresses();
      const unusedAddresses = await api.getUnusedAddresses();
      
      if (usedAddresses.length === 0 && unusedAddresses.length === 0) {
        throw new Error('No addresses available in wallet');
      }

      // Prefer unused addresses for change, fallback to used
      const changeAddress = unusedAddresses[0] || usedAddresses[0];
      
      return {
        changeAddress,
        usedAddresses,
        unusedAddresses
      };
    } catch (error) {
      throw new Error(`Failed to get wallet addresses: ${error}`);
    }
  }, [api]);

  // Build transaction
  const buildTransaction = useCallback(async () => {
    updateState({ step: 'building', isLoading: true, error: null });

    try {
      // Get protocol parameters
      const protocolParams = await getProtocolParams();
      
      // Get wallet addresses
      const { changeAddress } = await getWalletAddresses();

      // Create transaction builder config
      const config = {
        protocolParams,
        api,
        changeAddress,
        destinationAddress: request.destination_address,
        ttlOffset: 7200 // 2 hours
      };

      // Create appropriate builder based on amount mode
      const builder = TxBuilderFactory.create(
        request.amount_mode,
        config,
        request.amount_rule
      );

      // Build transaction
      const txResult = await builder.buildTransaction();

      if (txResult.success) {
        updateState({ 
          step: 'preview', 
          txResult, 
          isLoading: false 
        });
      } else {
        updateState({ 
          step: 'error', 
          error: txResult.error || 'Transaction build failed',
          isLoading: false 
        });
        onError(txResult.error || 'Transaction build failed');
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      updateState({ 
        step: 'error', 
        error: errorMessage,
        isLoading: false 
      });
      onError(errorMessage);
    }
  }, [request, api, getProtocolParams, getWalletAddresses, onError]);

  // Sign transaction
  const signTransaction = useCallback(async () => {
    if (!state.txResult || !state.txResult.success) {
      onError('No transaction to sign');
      return;
    }

    updateState({ step: 'signing', isLoading: true, error: null });

    try {
      // Sign transaction using CIP-30 API
      const witnessSetHex = await api.signTx(state.txResult.txHex, true);
      
      if (!witnessSetHex) {
        throw new Error('Wallet returned empty witness set');
      }

      // Create pre-signed data
      const preSignedData: PreSignedData = {
        request_id: request.id,
        tx_body_hex: state.txResult.txHex,
        witness_set_hex: witnessSetHex,
        tx_hash: state.txResult.txHash,
        fee_lovelace: state.txResult.fee,
        ttl_slot: parseInt(state.txResult.ttl),
        signed_at: new Date().toISOString(),
        wallet_used: api.getNetworkId ? 'cip30' : 'unknown',
        metadata: {
          amount_mode: request.amount_mode,
          witnesses_count: state.txResult.witnesses_required || 1,
          tx_size_estimate: Math.floor(state.txResult.txHex.length / 2),
          ...state.txResult.summary
        }
      };

      updateState({ step: 'complete', isLoading: false });
      onSuccess(preSignedData);

    } catch (error) {
      let errorMessage = 'Transaction signing failed';
      
      if (error instanceof Error) {
        if (error.message.includes('User declined')) {
          errorMessage = 'ユーザーによって署名が拒否されました';
        } else if (error.message.includes('insufficient')) {
          errorMessage = '残高が不足しています';
        } else {
          errorMessage = error.message;
        }
      }

      updateState({ 
        step: 'error', 
        error: errorMessage,
        isLoading: false 
      });
      onError(errorMessage);
    }
  }, [state.txResult, api, request, onSuccess, onError]);

  // Handle preview confirmation
  const handlePreviewConfirm = useCallback(() => {
    signTransaction();
  }, [signTransaction]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    onCancel();
  }, [onCancel]);

  // Auto-build transaction on mount
  useEffect(() => {
    buildTransaction();
  }, [buildTransaction]);

  // Render loading state
  if (state.step === 'building') {
    return (
      <div className={`bg-white border border-gray-200 rounded-lg p-8 text-center ${className}`}>
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-orange-500 border-t-transparent mx-auto mb-4"></div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          トランザクションを構築中...
        </h3>
        <p className="text-sm text-gray-600">
          ウォレットからUTxOを取得し、トランザクションを構築しています
        </p>
      </div>
    );
  }

  // Render error state
  if (state.step === 'error') {
    return (
      <div className={`bg-red-50 border border-red-200 rounded-lg p-6 ${className}`}>
        <div className="flex items-center mb-4">
          <svg className="h-6 w-6 text-red-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-lg font-medium text-red-800">
            エラーが発生しました
          </h3>
        </div>
        <p className="text-sm text-red-700 mb-4">{state.error}</p>
        <div className="flex space-x-3">
          <button
            onClick={buildTransaction}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
          >
            再試行
          </button>
          <button
            onClick={handleCancel}
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
          >
            キャンセル
          </button>
        </div>
      </div>
    );
  }

  // Render signing state
  if (state.step === 'signing') {
    return (
      <div className={`bg-white border border-gray-200 rounded-lg p-8 text-center ${className}`}>
        <div className="animate-pulse">
          <div className="h-16 w-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="h-8 w-8 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </div>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          ウォレットで署名中...
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          ウォレットアプリで署名を確認してください
        </p>
        <button
          onClick={handleCancel}
          className="text-sm text-gray-500 hover:text-gray-700 focus:outline-none focus:underline"
        >
          キャンセル
        </button>
      </div>
    );
  }

  // Render success state
  if (state.step === 'complete') {
    return (
      <div className={`bg-green-50 border border-green-200 rounded-lg p-6 text-center ${className}`}>
        <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-green-800 mb-2">
          署名完了
        </h3>
        <p className="text-sm text-green-700">
          トランザクションの署名が完了しました。事前署名データが保存されました。
        </p>
      </div>
    );
  }

  // Render preview state
  if (state.step === 'preview' && state.txResult) {
    return (
      <TxPreview
        txResult={state.txResult}
        onConfirm={handlePreviewConfirm}
        onCancel={handleCancel}
        isLoading={state.isLoading}
        className={className}
      />
    );
  }

  return null;
};