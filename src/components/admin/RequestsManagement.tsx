/**
 * Requests Management Component for OTC Admin System
 */
import React, { useState, useCallback, useEffect } from 'react';
import QRCode from 'qrcode';
import { useWebSocket } from '../../lib/websocket';
import { 
  OTCRequest, 
  CreateRequestRequest, 
  CreateRequestResponse,
  RequestStatus,
  FixedAmount,
  SweepRule,
  AmountOrRule
} from '../../types/otc/index';
// import { useAdminAuth } from '../../hooks/useAdminAuth'; // Removed to fix build warning

interface RequestsManagementProps {
  requests: OTCRequest[];
  onCreateRequest: (request: CreateRequestRequest) => Promise<CreateRequestResponse>;
  onUpdateStatus: (id: string, status: RequestStatus) => Promise<void>;
  onGenerateLink: (id: string) => Promise<string>;
  className?: string;
}

interface CreateRequestFormData {
  currency: 'ADA';
  amount_mode: 'fixed' | 'sweep';
  recipient: string;
  ttl_minutes: number;
  // Fixed amount fields
  fixed_amount: string;
  // Sweep fields
  ada_only: boolean;
  exclude_utxos: string;

}

interface SignedTransactionData {
  signedAt: string;
  signedTx: string | object;
  status: string;
  metadata?: {
    walletUsed?: string;
    [key: string]: unknown;
  };
}

export const RequestsManagement: React.FC<RequestsManagementProps> = ({
  requests,
  onCreateRequest,
  onUpdateStatus,
  onGenerateLink,
}) => {
  // const { } = useAdminAuth(); // 現在未使用
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [generatedRequest, setGeneratedRequest] = useState<CreateRequestResponse | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [signedTxData, setSignedTxData] = useState<{ [requestId: string]: SignedTransactionData }>({});
  const [loadingSignedData, setLoadingSignedData] = useState<{ [requestId: string]: boolean }>({});

  // Fetch signed transaction data
  const fetchSignedTxData = useCallback(async (requestId: string) => {
    setLoadingSignedData(prev => ({ ...prev, [requestId]: true }));
    try {
      const response = await fetch(`/api/ada/presigned/${requestId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.found) {
          setSignedTxData(prev => ({ ...prev, [requestId]: data.data }));
        }
      }
    } catch (error) {
      console.error('Failed to fetch signed transaction data:', error);
    } finally {
      setLoadingSignedData(prev => ({ ...prev, [requestId]: false }));
    }
  }, []);

  // WebSocket for real-time updates
  useWebSocket({
    onStatusUpdate: (update) => {
      console.log('管理画面でステータス更新受信:', update);
      
      // リクエスト一覧の更新は親コンポーネント（AdminApp）で処理される
      // ここでは署名データの取得をトリガー
      if (update.status === 'SIGNED' && update.request_id) {
        fetchSignedTxData(update.request_id);
      }
    }
  });

  const [formData, setFormData] = useState<CreateRequestFormData>({
    currency: 'ADA',
    amount_mode: 'fixed',
    recipient: import.meta.env.VITE_ESCROW_ADDRESS || '',
    ttl_minutes: 10,
    fixed_amount: '',
    ada_only: true,
    exclude_utxos: '',

  });

  // Handle form input changes
  const handleInputChange = useCallback((field: keyof CreateRequestFormData, value: string | boolean | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setCreateError(null);
  }, []);

  // Validate form data
  const validateForm = useCallback((): string[] => {
    const errors: string[] = [];

    // Recipient validation
    if (!formData.recipient.trim()) {
      errors.push('送金先アドレスを入力してください');
    } else if (!formData.recipient.startsWith('addr1')) {
      errors.push('有効なCardanoアドレス（addr1で始まる）を入力してください');
    }

    // TTL validation
    if (formData.ttl_minutes < 5 || formData.ttl_minutes > 2160) {
      errors.push('TTLは5分〜36時間（2160分）の間で設定してください');
    }

    // Amount mode specific validation
    switch (formData.amount_mode) {
      case 'fixed':
        if (!formData.fixed_amount.trim()) {
          errors.push('固定金額を入力してください');
        } else {
          const amount = parseFloat(formData.fixed_amount);
          if (isNaN(amount) || amount <= 0) {
            errors.push('有効な固定金額を入力してください');
          }
        }
        break;
      
      case 'sweep':
        // スイープモードでは特別な検証は不要
        break;
        
      default:
        errors.push('無効な金額モードが選択されています');
        break;
    }

    return errors;
  }, [formData]);

  // Create amount rule based on mode
  const createAmountRule = useCallback((): AmountOrRule => {
    switch (formData.amount_mode) {
      case 'fixed': {
        const fixedRule: FixedAmount = {
          amount: (parseFloat(formData.fixed_amount) * 1_000_000).toString(), // Convert to lovelace
        };
        return fixedRule;
      }

      case 'sweep': {
        const sweepRule: SweepRule = {
          ada_only: formData.ada_only,
          exclude_utxos: formData.exclude_utxos.trim() 
            ? formData.exclude_utxos.split(',').map(utxo => utxo.trim())
            : undefined,
        };
        return sweepRule;
      }

      default:
        throw new Error('Invalid amount mode');
    }
  }, [formData]);

  // Handle form submission
  const handleCreateRequest = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    const errors = validateForm();
    if (errors.length > 0) {
      setCreateError(errors.join(', '));
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    try {
      const requestData: CreateRequestRequest = {
        currency: 'ADA',
        amount_mode: formData.amount_mode,
        amount_or_rule: createAmountRule(),
        recipient: formData.recipient.trim(),
        ttl_minutes: formData.ttl_minutes,
      };

      const response = await onCreateRequest(requestData);
      console.log('📝 請求作成レスポンス:', response);
      setGeneratedRequest(response);

      // Generate QR code with error handling
      try {
        // Try SVG format first (more reliable in browser)
        const qrSvg = await QRCode.toString(response.signUrl, {
          type: 'svg',
          width: 256,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF',
          },
        });
        
        // Convert SVG to data URL for img src compatibility
        const svgDataUrl = `data:image/svg+xml;base64,${btoa(qrSvg)}`;
        setQrCodeDataUrl(svgDataUrl);
      } catch (qrError) {
        console.warn('QRコード生成に失敗しました:', qrError);
        
        // Fallback: Create a simple text-based QR code placeholder
        try {
          const fallbackSvg = `
            <svg width="256" height="256" xmlns="http://www.w3.org/2000/svg">
              <rect width="256" height="256" fill="#f3f4f6" stroke="#d1d5db" stroke-width="2"/>
              <text x="128" y="120" text-anchor="middle" font-family="Arial" font-size="12" fill="#374151">
                QRコード生成失敗
              </text>
              <text x="128" y="140" text-anchor="middle" font-family="Arial" font-size="10" fill="#6b7280">
                下記URLを手動でコピー
              </text>
            </svg>
          `;
          const fallbackDataUrl = `data:image/svg+xml;base64,${btoa(fallbackSvg)}`;
          setQrCodeDataUrl(fallbackDataUrl);
        } catch {
          // 完全にQRコード生成に失敗
          setQrCodeDataUrl(null);
        }
      }

      // Reset form
      setFormData(prev => ({
        ...prev,
        fixed_amount: '',
        exclude_utxos: '',
      }));

    } catch (error) {
      setCreateError(error instanceof Error ? error.message : '請求作成に失敗しました');
    } finally {
      setIsCreating(false);
    }
  }, [formData, validateForm, createAmountRule, onCreateRequest]);

  // Handle status update
  const handleStatusUpdate = useCallback(async (requestId: string, newStatus: RequestStatus) => {
    try {
      await onUpdateStatus(requestId, newStatus);
    } catch (error) {
      console.error('Status update failed:', error);
    }
  }, [onUpdateStatus]);

  // Generate new link
  const handleGenerateLink = useCallback(async (requestId: string) => {
    try {
      const newLink = await onGenerateLink(requestId);
      console.log('New link generated:', newLink);
    } catch (error) {
      console.error('Link generation failed:', error);
    }
  }, [onGenerateLink]);

  // Submit signed transaction
  const handleSubmitTransaction = useCallback(async (requestId: string, signedTxData: SignedTransactionData) => {
    try {
      // Here you would implement the actual transaction submission logic
      // For now, just show a placeholder
      console.log('Submitting transaction for request:', requestId, signedTxData);
      alert('トランザクション送信機能は実装中です');
    } catch (error) {
      console.error('Transaction submission failed:', error);
    }
  }, []);

  // Auto-fetch signed transaction data for signed requests
  useEffect(() => {
    const signedRequests = requests.filter(r => r.status === RequestStatus.SIGNED);
    signedRequests.forEach(request => {
      if (!signedTxData[request.id] && !loadingSignedData[request.id]) {
        fetchSignedTxData(request.id);
      }
    });
  }, [requests, signedTxData, loadingSignedData, fetchSignedTxData]);

  // Format amount for display
  const formatAmount = useCallback((request: OTCRequest): string => {
    switch (request.amount_mode) {
      case 'fixed': {
        const fixedAmount = request.amount_or_rule_json as FixedAmount;
        return `${(parseInt(fixedAmount.amount) / 1_000_000).toFixed(6)} ADA`;
      }
      case 'sweep':
        return '全ADA（スイープ）';

      default:
        return 'Unknown';
    }
  }, []);

  // Get status badge color
  const getStatusColor = useCallback((status: RequestStatus): string => {
    switch (status) {
      case RequestStatus.REQUESTED:
        return 'bg-blue-100 text-blue-800';
      case RequestStatus.SIGNED:
        return 'bg-yellow-100 text-yellow-800';
      case RequestStatus.SUBMITTED:
        return 'bg-purple-100 text-purple-800';
      case RequestStatus.CONFIRMED:
        return 'bg-green-100 text-green-800';
      case RequestStatus.FAILED:
        return 'bg-red-100 text-red-800';
      case RequestStatus.EXPIRED:
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-12">
        
        {/* Header */}
        <div className="mb-8 sm:mb-16">
          <h1 className="text-2xl sm:text-4xl font-light text-gray-900 tracking-tight">
            リクエスト管理
          </h1>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mt-4 sm:mt-8 gap-4">
            <div className="text-sm text-gray-600">
              OTC取引リクエストの作成と管理
            </div>
            <div className="flex space-x-1 bg-gray-100 p-1 rounded-2xl w-full sm:w-auto">
              <button
                onClick={() => setActiveTab('list')}
                className={`flex-1 sm:flex-none px-4 sm:px-6 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                  activeTab === 'list'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'bg-transparent text-gray-600 hover:bg-gray-50'
                }`}
              >
                リクエスト一覧
              </button>
              <button
                onClick={() => setActiveTab('create')}
                className={`flex-1 sm:flex-none px-4 sm:px-6 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                  activeTab === 'create'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'bg-transparent text-gray-600 hover:bg-gray-50'
                }`}
              >
                新規作成
              </button>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-8 mb-8 sm:mb-16">
          
          {/* Total Requests */}
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
            <div className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
              総リクエスト
            </div>
            <div className="text-5xl font-extralight text-gray-900 mb-2">
              {requests.length}
            </div>
            <div className="text-sm text-gray-500">
              件
            </div>
          </div>

          {/* Active Requests */}
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
            <div className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
              アクティブ
            </div>
            <div className="text-5xl font-extralight text-gray-900 mb-2">
              {requests.filter(r => r.status === 'REQUESTED').length}
            </div>
            <div className="text-sm text-gray-500">
              件
            </div>
          </div>

          {/* Signed Requests */}
          <div className="bg-blue-50 rounded-2xl p-8 shadow-sm border border-blue-200">
            <div className="text-sm font-medium text-blue-600 uppercase tracking-wide mb-2">
              署名済み
            </div>
            <div className="text-5xl font-extralight text-blue-900 mb-2">
              {requests.filter(r => r.status === 'SIGNED').length}
            </div>
            <div className="text-sm text-blue-600">
              件（送信待ち）
            </div>
          </div>

          {/* Confirmed Requests */}
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
            <div className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
              完了済み
            </div>
            <div className="text-5xl font-extralight text-gray-900 mb-2">
              {requests.filter(r => r.status === 'CONFIRMED').length}
            </div>
            <div className="text-sm text-gray-500">
              件
            </div>
          </div>

        </div>

      {/* Tab Content */}
      {activeTab === 'list' ? (
        /* Requests List */
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
          <div className="p-8 border-b border-gray-100">
            <h2 className="text-xl font-medium text-gray-900">
              リクエスト一覧
            </h2>
          </div>
          
          <div className="p-8">
            {requests.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-400 text-sm">
                  リクエストはありません
                </div>
              </div>
            ) : (
                <div className="space-y-4">
                  {requests.map((request) => (
                    <div key={request.id} className="bg-gray-50 rounded-xl p-4 sm:p-6 hover:bg-gray-100 transition-colors">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mb-3">
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium self-start ${getStatusColor(request.status)}`}>
                              {request.status}
                            </span>
                            <div className="text-lg font-medium text-gray-900">
                              {formatAmount(request)}
                            </div>
                          </div>
                          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 text-sm text-gray-500">
                            <span className="font-mono">ID: {request.id.slice(0, 8)}...</span>
                            <span className="hidden sm:inline text-gray-300">•</span>
                            <span>{new Date(request.created_at).toLocaleDateString('ja-JP')}</span>
                            <span className="hidden sm:inline text-gray-300">•</span>
                            <span>TTL: {request.ttl_slot}</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 sm:gap-3">
                          {request.status === RequestStatus.REQUESTED && (
                            <button
                              onClick={() => handleStatusUpdate(request.id, RequestStatus.EXPIRED)}
                              className="px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                              期限切れ
                            </button>
                          )}
                          {request.status === RequestStatus.SIGNED && (
                            <>
                              <button
                                onClick={() => fetchSignedTxData(request.id)}
                                disabled={loadingSignedData[request.id]}
                                className="px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
                              >
                                {loadingSignedData[request.id] ? '読込中...' : '署名詳細'}
                              </button>
                              {signedTxData[request.id] && (
                                <button
                                  onClick={() => handleSubmitTransaction(request.id, signedTxData[request.id])}
                                  className="px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
                                >
                                  送信
                                </button>
                              )}
                            </>
                          )}
                          <button
                            onClick={() => handleGenerateLink(request.id)}
                            className="px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors"
                          >
                            リンク生成
                          </button>
                        </div>
                        
                        {/* Show signed transaction details if available */}
                        {signedTxData[request.id] && (
                          <div className="mt-4 p-3 sm:p-4 bg-blue-50 rounded-lg border border-blue-200">
                            <h4 className="text-sm font-medium text-blue-900 mb-3">署名済みトランザクション詳細</h4>
                            <div className="grid grid-cols-1 gap-3 text-sm">
                              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                                <span className="font-medium text-blue-800 shrink-0">署名日時:</span>
                                <span className="text-blue-700">
                                  {new Date(signedTxData[request.id].signedAt).toLocaleString('ja-JP')}
                                </span>
                              </div>
                              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                                <span className="font-medium text-blue-800 shrink-0">使用ウォレット:</span>
                                <span className="text-blue-700">{signedTxData[request.id].metadata?.walletUsed || 'Unknown'}</span>
                              </div>
                              <div>
                                <span className="font-medium text-blue-800">署名データ:</span>
                                <div className="mt-1 p-2 bg-white rounded border font-mono text-xs break-all">
                                  {(() => {
                                    const signedTx = signedTxData[request.id].signedTx;
                                    let txData: string;
                                    
                                    if (typeof signedTx === 'string') {
                                      txData = signedTx;
                                    } else {
                                      txData = JSON.stringify(signedTx);
                                    }
                                    
                                    return txData.length > 100 ? txData.slice(0, 100) + '...' : txData;
                                  })()}
                                </div>
                              </div>
                              <div>
                                <span className="font-medium text-blue-800">ステータス:</span>
                                <span className="ml-2 text-blue-700">{signedTxData[request.id].status}</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
        </div>
      ) : (
        /* Create Request Form */
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
          <div className="p-4 sm:p-8 border-b border-gray-100">
            <h2 className="text-lg sm:text-xl font-medium text-gray-900">
              新規リクエスト作成
            </h2>
          </div>
          <div className="p-4 sm:p-8">

            <form onSubmit={handleCreateRequest} className="space-y-6 sm:space-y-8">
              {/* Error Display */}
              {createError && (
                <div className="bg-red-50 rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-red-100">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-red-500 mt-0.5"></div>
                    </div>
                    <div className="ml-3 sm:ml-4">
                      <h3 className="text-sm font-medium text-red-800">
                        入力エラー
                      </h3>
                      <div className="mt-1 text-sm text-red-700">
                        {createError}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Amount Mode Selection */}
              <div className="bg-gray-50 rounded-xl sm:rounded-2xl p-4 sm:p-6">
                <label className="text-sm sm:text-base font-medium text-gray-900 block mb-2">金額モード</label>
                <p className="text-sm text-gray-600 mb-4 sm:mb-6">リクエスト金額の決定方法を選択します。</p>
                <div className="space-y-3 sm:space-y-4">
                  {[
                    { value: 'fixed', label: '固定額', description: '指定した額のADAを送信します。' },
                    { value: 'sweep', label: 'スイープ', description: '手数料を差し引いた、利用可能なすべてのADAを送信します。' }
                  ].map((option) => (
                    <div key={option.value} className="flex items-start">
                      <div className="flex items-center h-5">
                        <input
                          id={option.value}
                          name="amount_mode"
                          type="radio"
                          checked={formData.amount_mode === option.value}
                          onChange={() => handleInputChange('amount_mode', option.value)}
                          className="focus:ring-gray-500 h-4 w-4 text-gray-800 border-gray-300"
                        />
                      </div>
                      <div className="ml-3">
                        <label htmlFor={option.value} className="text-sm font-medium text-gray-900 block">
                          {option.label}
                        </label>
                        <p className="text-xs text-gray-500 mt-1">{option.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Amount Mode Specific Fields */}
              {formData.amount_mode === 'fixed' && (
                <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-gray-100">
                  <label htmlFor="fixed_amount" className="block text-sm font-medium text-gray-900 mb-3">
                    固定額 (ADA) *
                  </label>
                  <input
                    type="number"
                    id="fixed_amount"
                    step="0.000001"
                    min="0"
                    value={formData.fixed_amount}
                    onChange={(e) => handleInputChange('fixed_amount', e.target.value)}
                    className="block w-full border-gray-200 rounded-lg sm:rounded-xl px-3 sm:px-4 py-2 sm:py-3 text-sm focus:ring-2 focus:ring-gray-400 focus:border-transparent"
                    placeholder="100.000000"
                  />
                </div>
              )}

              {formData.amount_mode === 'sweep' && (
                <div className="space-y-5">
                  <div className="relative flex items-start">
                    <div className="flex items-center h-5">
                      <input
                        id="ada_only"
                        type="checkbox"
                        checked={formData.ada_only}
                        onChange={(e) => handleInputChange('ada_only', e.target.checked)}
                        className="h-4 w-4 text-gray-800 focus:ring-gray-500 border-gray-300 rounded"
                      />
                    </div>
                    <div className="ml-3 text-sm">
                      <label htmlFor="ada_only" className="font-medium text-gray-800">
                        ADAのみ
                      </label>
                      <p className="text-gray-500">他のトークンを含むUTxOを除外します。</p>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="exclude_utxos" className="block text-sm font-semibold text-gray-800">
                      除外するUTxO（カンマ区切り）
                    </label>
                    <div className="mt-2">
                      <input
                        type="text"
                        id="exclude_utxos"
                        value={formData.exclude_utxos}
                        onChange={(e) => handleInputChange('exclude_utxos', e.target.value)}
                        className="block w-full border-gray-300 rounded-lg shadow-sm focus:ring-gray-500 focus:border-gray-500 sm:text-sm"
                        placeholder="txhash#index, txhash#index, ..."
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Common Fields */}
              <div>
                <label htmlFor="recipient" className="block text-sm font-semibold text-gray-800">
                  送金先アドレス *
                </label>
                <div className="mt-2">
                  <input
                    type="text"
                    id="recipient"
                    value={formData.recipient}
                    onChange={(e) => handleInputChange('recipient', e.target.value)}
                    className="block w-full border-gray-300 rounded-lg shadow-sm focus:ring-gray-500 focus:border-gray-500 sm:text-sm font-mono"
                    placeholder="addr1..."
                  />
                </div>
              </div>

              <div>
                <label htmlFor="ttl_minutes" className="block text-sm font-semibold text-gray-800">
                  有効期間 (TTL) *
                </label>
                <p className="text-sm text-gray-500 mt-1">リクエストが有効な期間（5分〜36時間）。36時間の場合は2160と入力してください。</p>
                <div className="mt-2">
                  <input
                    type="number"
                    id="ttl_minutes"
                    min="5"
                    max="2160"
                    value={formData.ttl_minutes}
                    onChange={(e) => handleInputChange('ttl_minutes', parseInt(e.target.value, 10))}
                    className="block w-full border-gray-300 rounded-lg shadow-sm focus:ring-gray-500 focus:border-gray-500 sm:text-sm"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-6 sm:pt-8">
                <button
                  type="submit"
                  disabled={isCreating}
                  className="w-full py-3 sm:py-4 px-4 sm:px-6 rounded-xl sm:rounded-2xl text-sm sm:text-base font-medium text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all duration-200"
                >
                  {isCreating ? '作成中...' : 'リクエストを作成'}
                </button>
              </div>
            </form>

            {/* Generated Request Display */}
            {generatedRequest && (
              <div className="mt-6 sm:mt-8 p-4 sm:p-6 bg-green-50 border border-green-100 rounded-xl sm:rounded-2xl">
                <h4 className="text-base sm:text-lg font-medium text-green-900 mb-4">
                  リクエストが作成されました！
                </h4>
                <div className="space-y-3 sm:space-y-4">
                  <div>
                    <p className="text-sm font-medium text-green-700">リクエストID:</p>
                    <p className="text-xs sm:text-sm text-green-800 font-mono break-all">{generatedRequest.requestId}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-green-700">署名用URL:</p>
                    <p className="text-xs sm:text-sm text-green-800 break-all">{generatedRequest.signUrl}</p>
                  </div>
                  {qrCodeDataUrl && (
                    <div>
                      <p className="text-sm font-medium text-green-700 mb-2">QRコード:</p>
                      <img src={qrCodeDataUrl} alt="QR Code" className="border border-gray-300 rounded max-w-full h-auto" />
                    </div>
                  )}
                  <button
                    onClick={() => {
                      setGeneratedRequest(null);
                      setQrCodeDataUrl(null);
                    }}
                    className="text-sm bg-green-100 hover:bg-green-200 text-green-700 px-3 py-1 rounded"
                  >
                    閉じる
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      </div>
    </div>
  );
};