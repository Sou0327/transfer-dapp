/**
 * Signing Page Component
 * User-facing transaction signing interface accessed via /sign?r=<requestId>
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { OTCRequest, RequestStatus, FixedAmount, RateBasedRule, SweepRule, TransactionBuildResult, UTxO } from '../../types/otc/index';



import { TxPreview } from '../TxPreview';
// SigningFlow import removed - not used in current implementation
import { CountdownBadge } from '../CountdownBadge';
import { SigningSteps } from './SigningSteps';
import { SigningError } from './SigningError';
import { SigningSuccess } from './SigningSuccess';
import { WalletConnectModal } from '../WalletConnectModal';
import { useWebSocket } from '../../lib/websocket';
import { useWallet } from '../../hooks/useWallet';

interface TransactionDetails {
  txHash: string;
  amount: string;
  fee: string;
  recipient: string;
  confirmations: number;
}

interface SigningPageState {
  loading: boolean;
  error: string | null;
  errorType?: 'network' | 'wallet' | 'validation' | 'timeout' | 'unknown';
  request: OTCRequest | null;
  showWalletModal: boolean;
  showTxPreview: boolean;
  txData: TransactionBuildResult | null;
  utxos: UTxO[] | null;
  signedTx: string | null;
  submissionStatus: 'idle' | 'submitting' | 'signed' | 'submitted' | 'confirmed' | 'failed';
  transactionDetails: TransactionDetails | null;
  currentStep: 'connect' | 'review' | 'sign' | 'submit' | 'confirm';
}

export const SigningPage: React.FC = () => {
  const { requestId } = useParams<{ requestId: string }>();
  
  // デバッグ: URLパラメータ確認
  console.log('🔍 URLパラメータデバッグ:', {
    requestId,
    requestIdType: typeof requestId,
    windowLocation: window.location.href,
    pathname: window.location.pathname,
    search: window.location.search
  });
  
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

  const { selectedWallet, connect, disconnect, getUtxos, signTransaction: walletSignTx } = useWallet();
  const { isConnected: wsConnected, subscribe, unsubscribe } = useWebSocket({
    onStatusUpdate: (update) => {
      if (update.request_id === requestId) {
        setState(prev => ({
          ...prev,
          request: prev.request ? { ...prev.request, status: update.status as RequestStatus } : null
        }));
        
        // Update submission status based on request status
        if (update.status === 'SUBMITTED') {
          setState(prev => ({ ...prev, submissionStatus: 'submitted' }));
        } else if (update.status === 'CONFIRMED') {
          setState(prev => ({ 
            ...prev, 
            submissionStatus: 'confirmed',
            transactionDetails: update.tx_hash ? {
              txHash: update.tx_hash,
              amount: '',
              fee: '',
              recipient: state.request?.recipient || '',
              confirmations: 1
            } : prev.transactionDetails
          }));
        } else if (update.status === 'FAILED') {
          setState(prev => ({ ...prev, submissionStatus: 'failed' }));
        }
      }
    },
    onTTLUpdate: (update) => {
      if (update.request_id === requestId && update.status === 'expired') {
        setState(prev => ({
          ...prev,
          request: prev.request ? { ...prev.request, status: RequestStatus.EXPIRED } : null
        }));
      }
    }
  });

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
    } else if (state.submissionStatus === 'signed') {
      setState(prev => ({ ...prev, currentStep: 'sign' }));
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





  // Subscribe to request updates via WebSocket
  useEffect(() => {
    if (wsConnected && requestId) {
      subscribe(requestId);
      
      return () => {
        unsubscribe(requestId);
      };
    }
  }, [wsConnected, requestId, subscribe, unsubscribe]);

  // Initialize request data
  useEffect(() => {
    console.log('🔍 useEffect実行 - リクエストデータ初期化:', {
      requestId,
      requestIdExists: !!requestId,
      requestIdType: typeof requestId
    });
    
    if (!requestId) {
      console.log('🔍 requestId不足のためエラー設定');
      setState(prev => ({ 
        ...prev, 
        error: 'リクエストIDが指定されていません。URLを確認してください。',
        loading: false 
      }));
      return;
    }

    console.log('🔍 fetchRequest呼び出し開始:', requestId);
    
    // fetchRequestを直接呼び出さず、ここで定義してすぐ実行
    const doFetch = async () => {
      try {
        setState(prev => ({ ...prev, loading: true }));
        clearError();
        
        console.log('🔍 APIリクエスト開始:', {
          requestId,
          url: `/api/ada/requests/${requestId}`,
          baseUrl: window.location.origin
        });
        
        const response = await fetch(`/api/ada/requests/${requestId}`);
        
        console.log('🔍 APIレスポンス受信:', {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries())
        });
        
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
        
        // デバッグ: APIレスポンスデータを詳細確認
        console.log('🔍 APIレスポンス詳細:', {
          response_ok: response.ok,
          response_status: response.status,
          data_structure: data,
          request_data: data.request,
          has_request: 'request' in data,
          request_keys: data.request ? Object.keys(data.request) : 'no request object',
          amount_mode_in_response: data.request?.amount_mode,
          amount_or_rule_in_response: data.request?.amount_or_rule_json
        });
        
        // 🚨 追加デバッグ: データ全体とrequest部分を詳細確認
        console.log('🚨 レスポンスデータ全体:', data);
        console.log('🚨 data.request詳細:', data.request);
        console.log('🚨 dataのキー:', Object.keys(data));
        
        if (data.request) {
          console.log('🚨 data.requestのキー:', Object.keys(data.request));
          console.log('🚨 amount_mode値:', data.request.amount_mode);
          console.log('🚨 amount_or_rule_json値:', data.request.amount_or_rule_json);
          console.log('🚨 created_at値:', data.request.created_at);
          console.log('🚨 ttl_absolute値:', data.request.ttl_absolute);
          console.log('🚨 recipient値:', data.request.recipient);
        } else {
          console.log('🚨 data.requestがnullまたはundefined!');
        }
        
        setState(prev => ({ ...prev, request: data.request, loading: false }));

      } catch (error) {
        console.error('🔍 APIリクエストエラー詳細:', {
          error,
          errorType: typeof error,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          requestId
        });
        
        if (error instanceof TypeError && error.message.includes('fetch')) {
          setError('ネットワーク接続を確認してください。', 'network');
        } else {
          const errorMessage = error instanceof Error ? error.message : '不明なエラーが発生しました';
          setError(errorMessage, 'unknown');
        }
      }
    };
    
    doFetch();
  }, [requestId, clearError, setError]);

  // Handle wallet connection
  const handleWalletConnect = useCallback(async (walletName: string) => {
    try {
      clearError();
      await connect(walletName);
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
  }, [connect, clearError, setError]);

  // Handle transaction building
  const handleBuildTransaction = useCallback(async () => {
    if (!state.request || !selectedWallet) return;

    try {
      setState(prev => ({ ...prev, loading: true }));
      clearError();

      // Get UTxOs from wallet
      const utxos = await getUtxos();
      
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

      // Get wallet API
      if (!window.cardano || !window.cardano[selectedWallet.toLowerCase()]) {
        setError('選択されたウォレットが見つかりません', 'wallet');
        return;
      }
      
      const walletApi = window.cardano[selectedWallet.toLowerCase()];
      const api = await walletApi.enable();

      // Get wallet addresses
      const changeAddress = await api.getChangeAddress();
      const destinationAddress = state.request.recipient;
      
      // Debug addresses
      console.log('🔍 Transaction addresses:', {
        changeAddress,
        destinationAddress,
        selectedWallet
      });

      // Create TxBuilder config
      const txBuilderConfig = {
        protocolParams: protocolParams,
        api: api,
        changeAddress,
        destinationAddress,
        ttlOffset: 7200, // 2 hours in slots (fallback)
        ttlSlot: state.request.ttl_slot // Use TTL slot from request if available
      };

      // Import transaction builders
      const { FixedAmountTxBuilder, SweepTxBuilder, RateBasedTxBuilder } = await import('../../lib/txBuilders');

      // Parse amount_or_rule_json based on amount_mode
      const amountRule = state.request.amount_or_rule_json;

      // Debug: Log request data
      console.log('🔍 リクエストデータデバッグ:', {
        amount_mode: state.request.amount_mode,
        amount_mode_type: typeof state.request.amount_mode,
        amount_or_rule_json: state.request.amount_or_rule_json,
        full_request_keys: Object.keys(state.request),
        full_request: state.request
      });

      switch (state.request.amount_mode) {
        case 'fixed':
          txBuilder = new FixedAmountTxBuilder(txBuilderConfig, amountRule as FixedAmount);
          break;
        case 'sweep':
          txBuilder = new SweepTxBuilder(txBuilderConfig, amountRule as SweepRule);
          break;
        case 'rate_based':
          txBuilder = new RateBasedTxBuilder(txBuilderConfig, amountRule as RateBasedRule);
          break;
        default:
          setError('不明な金額モードです', 'validation');
          return;
      }

      const txData = await txBuilder.buildTransaction();

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
  }, [state.request, selectedWallet, clearError, setError, getUtxos]);

  // Auto-build transaction when wallet is connected (after handleBuildTransaction is defined)
  useEffect(() => {
    if (selectedWallet && state.request && !state.txData && !state.loading && !state.error) {
      handleBuildTransaction();
    }
  }, [selectedWallet, state.request, state.txData, state.loading, state.error, handleBuildTransaction]);

  // Handle transaction signing
  const handleSignTransaction = useCallback(async (txHex: string) => {
    if (!selectedWallet || !state.request) return;

    try {
      setState(prev => ({ ...prev, submissionStatus: 'submitting' }));
      clearError();

      // Sign transaction
      const witnessSet = await walletSignTx(txHex);
      
      // Store pre-signed data
      console.log('🔥 署名完了 - サーバーにデータ送信中:', {
        requestId: state.request.id,
        walletUsed: selectedWallet
      });
      
      const requestBody = {
        requestId: state.request.id,
        signedTx: witnessSet,
        metadata: {
          txBody: txHex,
          walletUsed: selectedWallet,
          timestamp: new Date().toISOString()
        }
      };
      
      console.log('📤 POST リクエスト詳細:', {
        url: '/api/ada/presigned',
        method: 'POST',
        requestBodyKeys: Object.keys(requestBody),
        requestId: requestBody.requestId,
        hasSignedTx: !!requestBody.signedTx,
        signedTxType: typeof requestBody.signedTx,
        signedTxLength: typeof requestBody.signedTx === 'string' ? requestBody.signedTx.length : 'not string',
        signedTx: requestBody.signedTx,
        metadata: requestBody.metadata
      });

      const response = await fetch('/api/ada/presigned', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
      
      console.log('📡 POST レスポンス詳細:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries()),
        url: response.url
      });

      if (!response.ok) {
        const responseText = await response.text();
        console.error('❌ POST エラーレスポンス:', {
          status: response.status,
          statusText: response.statusText,
          responseText
        });
        
        let errorData: { error?: string } = {};
        try {
          errorData = JSON.parse(responseText) as { error?: string };
        } catch {
          errorData = { error: `サーバーエラー: ${response.status}` };
        }
        
        setError(errorData.error || '署名データの保存に失敗しました', 'network');
        setState(prev => ({ ...prev, submissionStatus: 'failed' }));
        return;
      }

      const result = await response.json();
      console.log('✅ POST 成功:', result);
      
      // Store the signed transaction data and show completion message
      setState(prev => ({ 
        ...prev, 
        signedTx: witnessSet,
        showTxPreview: false,
        submissionStatus: 'signed' // Mark as signed - admin will handle submission
      }));

      // Show success message to user
      console.log('署名完了:', result.message);
      
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
  }, [selectedWallet, state.request, clearError, setError, walletSignTx]);

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
    disconnect();
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
  }, [clearError, disconnect]);

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
      case 'fixed': {
        const fixedAmount = request.amount_or_rule_json as FixedAmount;
        return `${(parseInt(fixedAmount.amount) / 1_000_000).toLocaleString()} ADA`;
      }
      case 'sweep':
        return 'ウォレット内の全ADA';
      case 'rate_based': {
        const rateAmount = request.amount_or_rule_json as RateBasedRule;
        return `¥${rateAmount.fiat_amount.toLocaleString()} 相当のADA`;
      }
      default:
        return '不明';
    }
  }, []);

  // Check if request is expired or invalid
  const isRequestValid = state.request && 
    state.request.status === RequestStatus.REQUESTED && 
    state.request.ttl_absolute ? new Date(state.request.ttl_absolute) > new Date() : true;

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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
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
                     (state.request.ttl_absolute ? new Date(state.request.ttl_absolute) <= new Date() : false);
    
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-4 sm:p-6 text-center">
          <div className="mx-auto flex items-center justify-center h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-yellow-100 mb-4">
            <svg className="h-5 w-5 sm:h-6 sm:w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">
            {isExpired ? '請求の期限が切れています' : '無効な請求です'}
          </h3>
          <p className="text-sm text-gray-500 mb-4 px-2">
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
      <div className="min-h-screen bg-gray-50 py-4 sm:py-8">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center mb-6 sm:mb-8">
            <div className="mx-auto h-10 w-10 sm:h-12 sm:w-12 flex items-center justify-center bg-green-500 rounded-full mb-4">
              <svg className="h-5 w-5 sm:h-6 sm:w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">送金完了</h1>
            <p className="text-sm sm:text-base text-gray-600 px-4">
              トランザクションがブロックチェーンで正常に確認されました
            </p>
          </div>

          {/* Progress Steps */}
          <SigningSteps 
            currentStep="confirm" 
            className="mb-6 sm:mb-8"
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
    <>
      <div className="min-h-screen bg-gray-50 py-4 sm:py-8">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="mx-auto h-10 w-10 sm:h-12 sm:w-12 flex items-center justify-center bg-orange-500 rounded-full mb-4">
            <svg className="h-5 w-5 sm:h-6 sm:w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">ADA送金の署名</h1>
          <p className="text-sm sm:text-base text-gray-600 px-4">
            以下の内容でADAを送金いたします。内容をご確認の上、ウォレットで署名してください。
          </p>
        </div>

        {/* Progress Steps */}
        <SigningSteps 
          currentStep={state.currentStep} 
          className="mb-6 sm:mb-8"
        />

        {/* Request Information */}
        {state.request && (
          <div className="bg-white shadow rounded-lg mb-4 sm:mb-6">
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h3 className="text-base sm:text-lg font-medium text-gray-900">送金詳細</h3>
                <CountdownBadge 
                  targetTime={state.request.ttl_absolute ? new Date(state.request.ttl_absolute) : new Date(Date.now() + 900000)}
                  onExpire={() => setState(prev => ({ 
                    ...prev, 
                    request: prev.request ? { ...prev.request, status: RequestStatus.EXPIRED } : null 
                  }))}
                />
              </div>
            </div>
            <div className="px-4 sm:px-6 py-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <dd className="mt-1 text-xs sm:text-sm font-mono text-gray-900 break-all bg-gray-50 p-2 rounded">
                  {state.request.recipient}
                </dd>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm font-medium text-gray-500">作成日時</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {new Date(state.request.created_at).toLocaleString('ja-JP')}
                  </dd>
                </div>
                
                <div>
                  <dt className="text-sm font-medium text-gray-500">有効期限</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {state.request.ttl_absolute ? new Date(state.request.ttl_absolute).toLocaleString('ja-JP') : '未設定'}
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
          <div className="px-4 sm:px-6 py-4">
            {!selectedWallet ? (
              // Wallet Selection
              <div className="text-center py-8 sm:py-12">
                  <div className="mx-auto flex items-center justify-center h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-orange-100 mb-4">
                    <svg className="h-5 w-5 sm:h-6 sm:w-6 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v2a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">
                    ウォレット接続が必要です
                  </h3>
                  <p className="text-sm text-gray-500 px-4">
                    画面下部のボタンからCardanoウォレットを接続してください
                  </p>
                  <button
                    onClick={() => setState(prev => ({ ...prev, showWalletModal: true }))}
                    style={{
                      backgroundColor: '#ea580c',
                      color: 'white',
                      padding: '12px 24px',
                      borderRadius: '9999px',
                      border: 'none',
                      fontSize: '16px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      margin: '16px auto 0',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                    }}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v2a2 2 0 002 2z" />
                    </svg>
                    <span>ウォレット接続</span>
                  </button>
                </div>
            ) : state.submissionStatus === 'submitting' ? (
              // Submitting State
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">署名処理中...</h3>
                <p className="text-sm text-gray-500">
                  ウォレットで署名を確認してください。
                </p>
              </div>
            ) : state.submissionStatus === 'signed' ? (
              // Signed State
              <div className="text-center py-8">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
                  <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">署名完了</h3>
                <p className="text-sm text-gray-500">
                  署名が正常に完了しました。管理者が送信を行います。
                </p>
              </div>
            ) : state.submissionStatus === 'submitted' ? (
              // Submitted State
              <div className="text-center py-8">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 mb-4">
                  <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">送信完了</h3>
                <p className="text-sm text-gray-500">
                  トランザクションがブロックチェーンに送信されました。確認をお待ちください（通常1-2分）。
                </p>
              </div>
            ) : state.showTxPreview && state.txData ? (
              // Transaction Preview
              <TxPreview
                txResult={state.txData}
                onConfirm={() => {
                  if (state.txData?.txHex) {
                    handleSignTransaction(state.txData.txHex);
                  }
                }}
                onCancel={() => setState(prev => ({ ...prev, showTxPreview: false }))}
                className="border-0 shadow-none p-0"
              />
            ) : (
              // Connected, ready to build transaction
              <div className="text-center">
                <div className="flex items-center justify-center mb-4">
                  <div className="flex items-center bg-green-50 px-3 py-2 rounded-md">
                    <svg className="h-5 w-5 text-green-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-sm font-medium text-green-700">
                      {selectedWallet} 接続済み
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
                    onClick={() => disconnect()}
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
            )}
          </div>
        </div>

      </div>
    </div>

    {/* Bottom Wallet Connection Button */}
    <div className="fixed bottom-4 sm:bottom-6 left-1/2 transform -translate-x-1/2 z-50">
        <button
          onClick={() => setState(prev => ({ ...prev, showWalletModal: true }))}
          className="bg-orange-600 hover:bg-orange-700 text-white px-4 sm:px-6 py-2 sm:py-3 rounded-full font-medium shadow-lg flex items-center gap-2 text-sm sm:text-base transition-colors"
        >
          <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v2a2 2 0 002 2z" />
          </svg>
          <span className="hidden sm:inline">ウォレット接続</span>
          <span className="sm:hidden">接続</span>
        </button>
    </div>

    {/* Wallet Connection Modal */}
    <WalletConnectModal
      isOpen={state.showWalletModal}
      onClose={() => setState(prev => ({ ...prev, showWalletModal: false }))}
      onConnect={handleWalletConnect}
      isConnecting={false}
    />


    </>
  );
};

export default SigningPage;