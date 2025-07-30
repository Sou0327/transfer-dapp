/**
 * Signing Page Component
 * User-facing transaction signing interface accessed via /sign?r=<requestId>
 */
import React, { useState, useCallback, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { OTCRequest, RequestStatus, FixedAmount, SweepRule, RateBasedRule } from '../../types/otc/index';
import { WalletSelectModal } from '../WalletSelectModal';
import { TxPreview } from '../TxPreview';
import { SigningFlow } from '../SigningFlow';
import { CountdownBadge } from '../CountdownBadge';
import { SigningSteps } from './SigningSteps';
import { SigningError } from './SigningError';
import { SigningSuccess } from './SigningSuccess';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useWallet } from '../../hooks/useWallet';

interface SigningPageState {
  loading: boolean;
  error: string | null;
  errorType?: 'network' | 'wallet' | 'validation' | 'timeout' | 'unknown';
  request: OTCRequest | null;
  showWalletModal: boolean;
  showTxPreview: boolean;
  txData: any | null;
  utxos: any[] | null;
  signedTx: string | null;
  submissionStatus: 'idle' | 'submitting' | 'submitted' | 'confirmed' | 'failed';
  transactionDetails: any | null;
  currentStep: 'connect' | 'review' | 'sign' | 'submit' | 'confirm';
}

export const SigningPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const requestId = searchParams.get('r');
  
  const [state, setState] = useState<SigningPageState>({
    loading: true,
    error: null,
    errorType: undefined,
    request: null,
    showWalletModal: false,
    showTxPreview: false,
    txData: null,
    utxos: null,
    signedTx: null,
    submissionStatus: 'idle',
    transactionDetails: null,
    currentStep: 'connect'
  });

  const { selectedWallet, availableWallets, connectWallet, disconnectWallet } = useWallet();
  const { socket, connectionStatus } = useWebSocket();

  // Helper function to set error with type
  const setError = useCallback((error: string, type?: 'network' | 'wallet' | 'validation' | 'timeout' | 'unknown') => {
    setState(prev => ({ ...prev, error, errorType: type || 'unknown', loading: false }));
  }, []);

  // Helper function to clear error
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null, errorType: undefined }));
  }, []);

  // Update current step based on state
  useEffect(() => {
    if (state.submissionStatus === 'confirmed') {
      setState(prev => ({ ...prev, currentStep: 'confirm' }));
    } else if (state.submissionStatus === 'submitted' || state.submissionStatus === 'submitting') {
      setState(prev => ({ ...prev, currentStep: 'submit' }));
    } else if (state.signedTx || state.showTxPreview) {
      setState(prev => ({ ...prev, currentStep: 'sign' }));
    } else if (state.txData && !state.showTxPreview) {
      setState(prev => ({ ...prev, currentStep: 'review' }));
    } else if (selectedWallet) {
      setState(prev => ({ ...prev, currentStep: 'review' }));
    } else {
      setState(prev => ({ ...prev, currentStep: 'connect' }));
    }
  }, [selectedWallet, state.txData, state.showTxPreview, state.signedTx, state.submissionStatus]);

  // Fetch request data
  const fetchRequest = useCallback(async (id: string) => {
    try {
      setState(prev => ({ ...prev, loading: true }));
      clearError();
      
      const response = await fetch(`/api/ada/requests/${id}`);
      if (!response.ok) {
        if (response.status === 404) {
          setError('指定された請求が見つかりません。URLを確認してください。', 'validation');
          return;
        }
        if (response.status >= 500) {
          setError('サーバーエラーが発生しました。しばらく時間をおいて再度お試しください。', 'network');
          return;
        }
        setError('請求情報の取得に失敗しました。', 'network');
        return;
      }

      const data = await response.json();
      setState(prev => ({ ...prev, request: data.request, loading: false }));

    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        setError('ネットワーク接続を確認してください。', 'network');
      } else {
        const errorMessage = error instanceof Error ? error.message : '不明なエラーが発生しました';
        setError(errorMessage, 'unknown');
      }
    }
  }, [setError, clearError]);

  // Subscribe to request updates via WebSocket
  useEffect(() => {
    if (socket && requestId && connectionStatus === 'connected') {
      // Subscribe to request updates
      socket.emit('subscribe_request', { request_id: requestId });
      
      // Listen for request updates
      socket.on('request_updated', (data) => {
        if (data.request_id === requestId) {
          setState(prev => ({
            ...prev,
            request: prev.request ? { ...prev.request, status: data.status } : null
          }));
          
          // Update submission status based on request status
          if (data.status === 'SUBMITTED') {
            setState(prev => ({ ...prev, submissionStatus: 'submitted' }));
          } else if (data.status === 'CONFIRMED') {
            setState(prev => ({ 
              ...prev, 
              submissionStatus: 'confirmed',
              transactionDetails: data.transactionDetails || prev.transactionDetails
            }));
          } else if (data.status === 'FAILED') {
            setState(prev => ({ ...prev, submissionStatus: 'failed' }));
          }
        }
      });

      // Listen for TTL updates
      socket.on('ttl_update', (data) => {
        if (data.request_id === requestId && data.expired) {
          setState(prev => ({
            ...prev,
            request: prev.request ? { ...prev.request, status: RequestStatus.EXPIRED } : null
          }));
        }
      });

      return () => {
        socket.off('request_updated');
        socket.off('ttl_update');
        socket.emit('unsubscribe_request', { request_id: requestId });
      };
    }
  }, [socket, requestId, connectionStatus]);

  // Initialize request data
  useEffect(() => {
    if (!requestId) {
      setState(prev => ({ 
        ...prev, 
        error: 'リクエストIDが指定されていません。URLを確認してください。',
        loading: false 
      }));
      return;
    }

    fetchRequest(requestId);
  }, [requestId, fetchRequest]);

  // Handle wallet connection
  const handleWalletConnect = useCallback(async (walletName: string) => {
    try {
      clearError();
      await connectWallet(walletName);
      setState(prev => ({ ...prev, showWalletModal: false }));
    } catch (error) {
      console.error('Wallet connection failed:', error);
      setState(prev => ({ ...prev, showWalletModal: false }));
      
      if (error instanceof Error) {
        if (error.message.includes('not found') || error.message.includes('unavailable')) {
          setError('選択されたウォレットが見つかりません。ウォレットアプリがインストールされ、有効になっていることを確認してください。', 'wallet');
        } else if (error.message.includes('rejected') || error.message.includes('denied')) {
          setError('ウォレット接続が拒否されました。ウォレットで接続を許可してください。', 'wallet');
        } else {
          setError('ウォレットの接続に失敗しました。ウォレットアプリを確認して再度お試しください。', 'wallet');
        }
      } else {
        setError('ウォレットの接続に失敗しました。再度お試しください。', 'wallet');
      }
    }
  }, [connectWallet, clearError, setError]);

  // Handle transaction building
  const handleBuildTransaction = useCallback(async () => {
    if (!state.request || !selectedWallet) return;

    try {
      setState(prev => ({ ...prev, loading: true }));
      clearError();

      // Get UTxOs from wallet
      const utxos = await selectedWallet.api.getUtxos();
      
      if (!utxos || utxos.length === 0) {
        setError('ウォレットにUTxOが見つかりません。ADAを受け取ってから再度お試しください。', 'validation');
        return;
      }
      
      // Build transaction based on amount mode
      let txBuilder;
      const response = await fetch('/api/ada/protocol-params');
      
      if (!response.ok) {
        setError('プロトコルパラメータの取得に失敗しました。ネットワーク接続を確認してください。', 'network');
        return;
      }
      
      const protocolParams = await response.json();

      // Import transaction builders
      const { FixedAmountTxBuilder, SweepTxBuilder, RateBasedTxBuilder } = await import('../../lib/txBuilders');

      switch (state.request.amount_mode) {
        case 'fixed':
          const fixedAmount = state.request.amount_or_rule_json as FixedAmount;
          txBuilder = new FixedAmountTxBuilder(protocolParams.params);
          break;
        case 'sweep':
          const sweepRule = state.request.amount_or_rule_json as SweepRule;
          txBuilder = new SweepTxBuilder(protocolParams.params);
          break;
        case 'rate_based':
          const rateRule = state.request.amount_or_rule_json as RateBasedRule;
          txBuilder = new RateBasedTxBuilder(protocolParams.params);
          break;
        default:
          setError('不明な金額モードです', 'validation');
          return;
      }

      const txData = await txBuilder.buildTransaction(
        utxos,
        state.request.recipient,
        state.request.amount_or_rule_json,
        await selectedWallet.api.getChangeAddress()
      );

      setState(prev => ({ 
        ...prev, 
        txData, 
        utxos,
        showTxPreview: true,
        loading: false 
      }));

    } catch (error) {
      console.error('Transaction building failed:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('insufficient funds') || error.message.includes('不足')) {
          setError('ウォレットの残高が不足しています。十分なADAがあることを確認してください。', 'validation');
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
          setError('ネットワークエラーが発生しました。接続を確認して再度お試しください。', 'network');
        } else if (error.message.includes('wallet') || error.message.includes('api')) {
          setError('ウォレットとの通信に失敗しました。ウォレットアプリを確認してください。', 'wallet');
        } else {
          setError(`トランザクションの構築に失敗しました: ${error.message}`, 'validation');
        }
      } else {
        setError('トランザクションの構築に失敗しました。UTxOの残高や接続を確認してください。', 'unknown');
      }
    }
  }, [state.request, selectedWallet, clearError, setError]);

  // Handle transaction signing
  const handleSignTransaction = useCallback(async (txHex: string) => {
    if (!selectedWallet || !state.request) return;

    try {
      setState(prev => ({ ...prev, submissionStatus: 'submitting' }));
      clearError();

      // Sign transaction
      const witnessSet = await selectedWallet.api.signTx(txHex, true);
      
      // Store pre-signed data
      const response = await fetch('/api/ada/presigned', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          request_id: state.request.id,
          tx_body: txHex,
          witness_set: witnessSet,
          wallet_used: selectedWallet.name
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData.error || '署名データの保存に失敗しました', 'network');
        setState(prev => ({ ...prev, submissionStatus: 'failed' }));
        return;
      }

      const result = await response.json();
      setState(prev => ({ 
        ...prev, 
        signedTx: result.signed_tx_hex,
        showTxPreview: false 
      }));

      // Request will be automatically submitted by the monitoring service
      
    } catch (error) {
      console.error('Transaction signing failed:', error);
      
      if (error instanceof Error) {
        if (error.message.includes('User declined') || error.message.includes('拒否')) {
          setError('署名がキャンセルされました。', 'wallet');
        } else if (error.message.includes('timeout') || error.message.includes('タイムアウト')) {
          setError('署名がタイムアウトしました。時間内にウォレットで操作を完了してください。', 'timeout');
        } else if (error.message.includes('Invalid') || error.message.includes('不正')) {
          setError('トランザクションデータが無効です。最初からやり直してください。', 'validation');
        } else {
          setError(`トランザクションの署名に失敗しました: ${error.message}`, 'wallet');
        }
      } else {
        setError('トランザクションの署名に失敗しました。ウォレットの接続を確認してください。', 'wallet');
      }
      
      setState(prev => ({ ...prev, submissionStatus: 'failed' }));
    }
  }, [selectedWallet, state.request, clearError, setError]);

  // Handle retry actions
  const handleRetry = useCallback(() => {
    clearError();
    setState(prev => ({ ...prev, loading: false }));
    
    // Retry based on current step
    if (state.currentStep === 'connect') {
      setState(prev => ({ ...prev, showWalletModal: true }));
    } else if (state.currentStep === 'review') {
      handleBuildTransaction();
    } else if (state.currentStep === 'sign' && state.txData) {
      setState(prev => ({ ...prev, showTxPreview: true }));
    }
  }, [clearError, state.currentStep, state.txData, handleBuildTransaction]);

  // Handle reset to start over
  const handleReset = useCallback(() => {
    clearError();
    disconnectWallet();
    setState(prev => ({
      ...prev,
      showWalletModal: false,
      showTxPreview: false,
      txData: null,
      utxos: null,
      signedTx: null,
      submissionStatus: 'idle',
      transactionDetails: null,
      loading: false
    }));
  }, [clearError, disconnectWallet]);

  // Handle support action
  const handleSupport = useCallback(() => {
    // Could open a support modal or redirect to support page
    window.open('mailto:support@example.com?subject=OTC署名エラー&body=' + encodeURIComponent(
      `エラー詳細:\n${state.error}\n\n請求ID: ${requestId}\nブラウザ: ${navigator.userAgent}`
    ));
  }, [state.error, requestId]);

  // Handle view in explorer
  const handleViewExplorer = useCallback((txHash: string) => {
    window.open(`https://cardanoscan.io/transaction/${txHash}`, '_blank');
  }, []);

  // Format amount for display
  const formatAmount = useCallback((request: OTCRequest): string => {
    switch (request.amount_mode) {
      case 'fixed':
        const fixedAmount = request.amount_or_rule_json as FixedAmount;
        return `${(parseInt(fixedAmount.amount) / 1_000_000).toLocaleString()} ADA`;
      case 'sweep':
        return 'ウォレット内の全ADA';
      case 'rate_based':
        const rateAmount = request.amount_or_rule_json as RateBasedRule;
        return `¥${rateAmount.fiat_amount.toLocaleString()} 相当のADA`;
      default:
        return '不明';
    }
  }, []);

  // Check if request is expired or invalid
  const isRequestValid = state.request && 
    state.request.status === RequestStatus.REQUESTED && 
    new Date(state.request.ttl_absolute) > new Date();

  // Show loading state
  if (state.loading && !state.request) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <p className="text-gray-600">請求情報を読み込み中...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (state.error) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="mx-auto h-12 w-12 flex items-center justify-center bg-orange-500 rounded-full mb-4">
              <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">ADA送金の署名</h1>
          </div>

          {/* Progress Steps */}
          <SigningSteps 
            currentStep={state.currentStep} 
            hasError={true}
            className="mb-8"
          />

          {/* Error Component */}
          <SigningError
            error={state.error}
            errorType={state.errorType}
            onRetry={handleRetry}
            onReset={handleReset}
            onSupport={handleSupport}
          />
        </div>
      </div>
    );
  }

  // Show invalid/expired request
  if (state.request && !isRequestValid) {
    const isExpired = state.request.status === RequestStatus.EXPIRED || 
                     new Date(state.request.ttl_absolute) <= new Date();
    
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6 text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-yellow-100 mb-4">
            <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {isExpired ? '請求の期限が切れています' : '無効な請求です'}
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            {isExpired 
              ? 'この請求は期限切れのため署名できません。新しい請求をリクエストしてください。'
              : `この請求は現在「${state.request.status}」状態のため署名できません。`
            }
          </p>
          <div className="text-xs text-gray-400">
            請求ID: {state.request.id.slice(0, 8)}...
          </div>
        </div>
      </div>
    );
  }

  // Show success state
  if (state.submissionStatus === 'confirmed' && state.transactionDetails) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="mx-auto h-12 w-12 flex items-center justify-center bg-green-500 rounded-full mb-4">
              <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">送金完了</h1>
            <p className="text-gray-600">
              トランザクションがブロックチェーンで正常に確認されました
            </p>
          </div>

          {/* Progress Steps */}
          <SigningSteps 
            currentStep="confirm" 
            className="mb-8"
          />

          {/* Success Details */}
          <SigningSuccess
            transactionDetails={state.transactionDetails}
            requestId={requestId || ''}
            onViewExplorer={handleViewExplorer}
            onDownloadReceipt={() => {
              // Generate and download receipt
              const receiptData = {
                requestId: requestId,
                transactionDetails: state.transactionDetails,
                timestamp: new Date().toISOString()
              };
              const blob = new Blob([JSON.stringify(receiptData, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `otc-receipt-${requestId}.json`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}
          />
        </div>
      </div>
    );
  }

  // Main signing interface
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="mx-auto h-12 w-12 flex items-center justify-center bg-orange-500 rounded-full mb-4">
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">ADA送金の署名</h1>
          <p className="text-gray-600">
            以下の内容でADAを送金いたします。内容をご確認の上、ウォレットで署名してください。
          </p>
        </div>

        {/* Progress Steps */}
        <SigningSteps 
          currentStep={state.currentStep} 
          className="mb-8"
        />

        {/* Request Information */}
        {state.request && (
          <div className="bg-white shadow rounded-lg mb-6">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">送金詳細</h3>
                <CountdownBadge 
                  targetTime={new Date(state.request.ttl_absolute)}
                  onExpire={() => setState(prev => ({ 
                    ...prev, 
                    request: prev.request ? { ...prev.request, status: RequestStatus.EXPIRED } : null 
                  }))}
                />
              </div>
            </div>
            
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm font-medium text-gray-500">送金金額</dt>
                  <dd className="mt-1 text-lg font-semibold text-gray-900">
                    {formatAmount(state.request)}
                  </dd>
                </div>
                
                <div>
                  <dt className="text-sm font-medium text-gray-500">金額モード</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {state.request.amount_mode === 'fixed' && '固定額'}
                    {state.request.amount_mode === 'sweep' && 'Sweep（全額送金）'}
                    {state.request.amount_mode === 'rate_based' && 'レート計算'}
                  </dd>
                </div>
              </div>

              <div>
                <dt className="text-sm font-medium text-gray-500">送金先アドレス</dt>
                <dd className="mt-1 text-sm font-mono text-gray-900 break-all bg-gray-50 p-2 rounded">
                  {state.request.recipient}
                </dd>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm font-medium text-gray-500">作成日時</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {new Date(state.request.created_at).toLocaleString('ja-JP')}
                  </dd>
                </div>
                
                <div>
                  <dt className="text-sm font-medium text-gray-500">有効期限</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {new Date(state.request.ttl_absolute).toLocaleString('ja-JP')}
                  </dd>
                </div>
              </div>

              <div className="text-xs text-gray-400">
                請求ID: {state.request.id}
              </div>
            </div>
          </div>
        )}

        {/* Wallet Connection and Transaction Flow */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4">
            {!selectedWallet ? (
              // Wallet Selection
              <div className="text-center">
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  ウォレットを接続してください
                </h3>
                <p className="text-sm text-gray-500 mb-6">
                  送金に使用するCardanoウォレットを選択して接続してください。
                </p>
                
                <button
                  onClick={() => setState(prev => ({ ...prev, showWalletModal: true }))}
                  className="bg-orange-600 text-white px-6 py-3 rounded-md font-medium hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
                >
                  ウォレットを選択
                </button>

                {availableWallets.length === 0 && (
                  <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
                    <p className="text-sm text-yellow-800">
                      対応ウォレットが見つかりません。Nami、Eternl、Flint、Yoroi、GeroWallet、NuFi、Typhon、Lode等のCardanoウォレットをインストールしてください。
                    </p>
                  </div>
                )}
              </div>
            ) : state.submissionStatus === 'submitting' ? (
              // Submitting State
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">署名処理中...</h3>
                <p className="text-sm text-gray-500">
                  ウォレットで署名を確認し、トランザクションを送信しています。
                </p>
              </div>
            ) : state.submissionStatus === 'submitted' ? (
              // Submitted State
              <div className="text-center py-8">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 mb-4">
                  <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">送信完了</h3>
                <p className="text-sm text-gray-500">
                  トランザクションがブロックチェーンに送信されました。確認をお待ちください（通常1-2分）。
                </p>
              </div>
            ) : !state.showTxPreview ? (
              // Connected, ready to build transaction
              <div className="text-center">
                <div className="flex items-center justify-center mb-4">
                  <div className="flex items-center bg-green-50 px-3 py-2 rounded-md">
                    <svg className="h-5 w-5 text-green-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-sm font-medium text-green-700">
                      {selectedWallet.name} 接続済み
                    </span>
                  </div>
                </div>

                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  トランザクションを確認
                </h3>
                <p className="text-sm text-gray-500 mb-6">
                  送金内容を確認し、署名を行います。手数料等の詳細が表示されます。
                </p>

                <div className="flex justify-center space-x-4">
                  <button
                    onClick={() => disconnectWallet()}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    ウォレット変更
                  </button>
                  
                  <button
                    onClick={handleBuildTransaction}
                    disabled={state.loading}
                    className="bg-orange-600 text-white px-6 py-2 rounded-md font-medium hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50"
                  >
                    {state.loading ? (
                      <div className="flex items-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        構築中...
                      </div>
                    ) : (
                      'トランザクション確認'
                    )}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Modals */}
        {state.showWalletModal && (
          <WalletSelectModal
            availableWallets={availableWallets}
            onSelectWallet={handleWalletConnect}
            onClose={() => setState(prev => ({ ...prev, showWalletModal: false }))}
          />
        )}

        {state.showTxPreview && state.txData && selectedWallet && (
          <TxPreview
            txData={state.txData}
            utxos={state.utxos || []}
            onConfirm={handleSignTransaction}
            onCancel={() => setState(prev => ({ ...prev, showTxPreview: false }))}
            walletName={selectedWallet.name}
          />
        )}
      </div>
    </div>
  );
};