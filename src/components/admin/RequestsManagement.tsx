/**
 * Requests Management Component for OTC Admin System
 */
import React, { useState, useCallback } from 'react';
import QRCode from 'qrcode';
import { 
  OTCRequest, 
  CreateRequestRequest, 
  CreateRequestResponse,
  RequestStatus,
  FixedAmount,
  SweepRule,
  RateBasedRule,
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
  amount_mode: 'fixed' | 'sweep' | 'rate_based';
  recipient: string;
  ttl_minutes: number;
  // Fixed amount fields
  fixed_amount: string;
  // Sweep fields
  ada_only: boolean;
  exclude_utxos: string;
  // Rate-based fields
  fiat_amount: string;
  rate_source: string;
  upper_limit_ada: string;
  slippage_bps: string;
}

export const RequestsManagement: React.FC<RequestsManagementProps> = ({
  requests,
  onCreateRequest,
  onUpdateStatus,
  onGenerateLink,
  className = '',
}) => {
  // const { } = useAdminAuth(); // 現在未使用
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [generatedRequest, setGeneratedRequest] = useState<CreateRequestResponse | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);

  const [formData, setFormData] = useState<CreateRequestFormData>({
    currency: 'ADA',
    amount_mode: 'fixed',
    recipient: import.meta.env.VITE_ESCROW_ADDRESS || '',
    ttl_minutes: 10,
    fixed_amount: '',
    ada_only: true,
    exclude_utxos: '',
    fiat_amount: '',
    rate_source: 'coingecko',
    upper_limit_ada: '',
    slippage_bps: '100', // 1%
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
    if (formData.ttl_minutes < 5 || formData.ttl_minutes > 15) {
      errors.push('TTLは5分〜15分の間で設定してください');
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

      case 'rate_based':
        if (!formData.fiat_amount.trim()) {
          errors.push('法定通貨金額を入力してください');
        } else {
          const amount = parseFloat(formData.fiat_amount);
          if (isNaN(amount) || amount <= 0) {
            errors.push('有効な法定通貨金額を入力してください');
          }
        }

        if (!formData.upper_limit_ada.trim()) {
          errors.push('ADA上限額を入力してください');
        } else {
          const limit = parseFloat(formData.upper_limit_ada);
          if (isNaN(limit) || limit <= 0) {
            errors.push('有効なADA上限額を入力してください');
          }
        }

        {
          const slippage = parseFloat(formData.slippage_bps);
          if (isNaN(slippage) || slippage < 0 || slippage > 1000) {
            errors.push('スリッページは0〜1000bpsの範囲で入力してください');
          }
        }
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

      case 'rate_based': {
        const rateRule: RateBasedRule = {
          fiat_amount: parseFloat(formData.fiat_amount),
          rate_source: formData.rate_source,
          upper_limit_ada: (parseFloat(formData.upper_limit_ada) * 1_000_000).toString(), // Convert to lovelace
          slippage_bps: parseFloat(formData.slippage_bps),
        };
        return rateRule;
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
        fiat_amount: '',
        upper_limit_ada: '',
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

  // Format amount for display
  const formatAmount = useCallback((request: OTCRequest): string => {
    switch (request.amount_mode) {
      case 'fixed': {
        const fixedAmount = request.amount_or_rule_json as FixedAmount;
        return `${(parseInt(fixedAmount.amount) / 1_000_000).toFixed(6)} ADA`;
      }
      case 'sweep':
        return '全ADA（スイープ）';
      case 'rate_based': {
        const rateAmount = request.amount_or_rule_json as RateBasedRule;
        return `¥${rateAmount.fiat_amount.toLocaleString()} (レート基準)`;
      }
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
      <div className="max-w-6xl mx-auto px-8 py-12">
        
        {/* Header */}
        <div className="mb-16">
          <h1 className="text-4xl font-light text-gray-900 tracking-tight">
            リクエスト管理
          </h1>
          <div className="flex items-center justify-between mt-8">
            <div className="text-sm text-gray-600">
              OTC取引リクエストの作成と管理
            </div>
            <div className="flex space-x-1 bg-gray-100 p-1 rounded-2xl">
              <button
                onClick={() => setActiveTab('list')}
                className={`px-6 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                  activeTab === 'list'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'bg-transparent text-gray-600 hover:bg-gray-50'
                }`}
              >
                リクエスト一覧
              </button>
              <button
                onClick={() => setActiveTab('create')}
                className={`px-6 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          
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
              {requests.filter(r => r.status === 'REQUESTED' || r.status === 'SIGNED').length}
            </div>
            <div className="text-sm text-gray-500">
              件
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
          
          {requests.length === 0 ? (
            <div className="p-8">
              <div className="text-center py-12">
                <div className="text-gray-400 text-sm">
                  リクエストはありません
                </div>
              </div>
            </div>
          ) : (
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
                    <div key={request.id} className="bg-gray-50 rounded-xl p-6 hover:bg-gray-100 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-4 mb-3">
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(request.status)}`}>
                              {request.status}
                            </span>
                            <div className="text-lg font-medium text-gray-900">
                              {formatAmount(request)}
                            </div>
                          </div>
                          <div className="flex items-center space-x-4 text-sm text-gray-500">
                            <span className="font-mono">ID: {request.id.slice(0, 8)}...</span>
                            <span className="text-gray-300">•</span>
                            <span>{new Date(request.created_at).toLocaleDateString('ja-JP')}</span>
                            <span className="text-gray-300">•</span>
                            <span>TTL: {request.ttl_slot}</span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          {request.status === RequestStatus.REQUESTED && (
                            <button
                              onClick={() => handleStatusUpdate(request.id, RequestStatus.EXPIRED)}
                              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                              期限切れ
                            </button>
                          )}
                          <button
                            onClick={() => handleGenerateLink(request.id)}
                            className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors"
                          >
                            リンク生成
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Create Request Form */
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
          <div className="p-8 border-b border-gray-100">
            <h2 className="text-xl font-medium text-gray-900">
              新規リクエスト作成
            </h2>
          </div>
          <div className="p-8">

            <form onSubmit={handleCreateRequest} className="space-y-8">
              {/* Error Display */}
              {createError && (
                <div className="bg-red-50 rounded-2xl p-6 border border-red-100">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <div className="w-5 h-5 rounded-full bg-red-500 mt-0.5"></div>
                    </div>
                    <div className="ml-4">
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
              <div className="bg-gray-50 rounded-2xl p-6">
                <label className="text-base font-medium text-gray-900 block mb-2">金額モード</label>
                <p className="text-sm text-gray-600 mb-6">リクエスト金額の決定方法を選択します。</p>
                <div className="space-y-4">
                  {[
                    { value: 'fixed', label: '固定額', description: '指定した額のADAを送信します。' },
                    { value: 'sweep', label: 'スイープ', description: '手数料を差し引いた、利用可能なすべてのADAを送信します。' },
                    { value: 'rate_based', label: 'レート基準', description: '法定通貨の価値からADAの量を計算します。' },
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
                <div className="bg-white rounded-2xl p-6 border border-gray-100">
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
                    className="block w-full border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-gray-400 focus:border-transparent"
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

              {formData.amount_mode === 'rate_based' && (
                <div className="space-y-5">
                  <div>
                    <label htmlFor="fiat_amount" className="block text-sm font-semibold text-gray-800">
                      法定通貨額 (JPY) *
                    </label>
                    <div className="mt-2">
                      <input
                        type="number"
                        id="fiat_amount"
                        step="1"
                        min="0"
                        value={formData.fiat_amount}
                        onChange={(e) => handleInputChange('fiat_amount', e.target.value)}
                        className="block w-full border-gray-300 rounded-lg shadow-sm focus:ring-gray-500 focus:border-gray-500 sm:text-sm"
                        placeholder="100000"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="rate_source" className="block text-sm font-semibold text-gray-800">
                      レートソース
                    </label>
                    <div className="mt-2">
                      <select
                        id="rate_source"
                        value={formData.rate_source}
                        onChange={(e) => handleInputChange('rate_source', e.target.value)}
                        className="block w-full border-gray-300 rounded-lg shadow-sm focus:ring-gray-500 focus:border-gray-500 sm:text-sm"
                      >
                        <option value="coingecko">CoinGecko</option>
                        <option value="coinbase">Coinbase</option>
                        <option value="binance">Binance</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="upper_limit_ada" className="block text-sm font-semibold text-gray-800">
                      ADA上限額 *
                    </label>
                    <div className="mt-2">
                      <input
                        type="number"
                        id="upper_limit_ada"
                        step="0.000001"
                        min="0"
                        value={formData.upper_limit_ada}
                        onChange={(e) => handleInputChange('upper_limit_ada', e.target.value)}
                        className="block w-full border-gray-300 rounded-lg shadow-sm focus:ring-gray-500 focus:border-gray-500 sm:text-sm"
                        placeholder="3000.000000"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="slippage_bps" className="block text-sm font-semibold text-gray-800">
                      スリッページ (bps) *
                    </label>
                    <div className="mt-2">
                      <input
                        type="number"
                        id="slippage_bps"
                        step="1"
                        min="0"
                        max="1000"
                        value={formData.slippage_bps}
                        onChange={(e) => handleInputChange('slippage_bps', e.target.value)}
                        className="block w-full border-gray-300 rounded-lg shadow-sm focus:ring-gray-500 focus:border-gray-500 sm:text-sm"
                        placeholder="100"
                      />
                    </div>
                    <p className="mt-2 text-sm text-gray-500">100 bps = 1%</p>
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
                <p className="text-sm text-gray-500 mt-1">リクエストが有効な期間（5〜15分）。</p>
                <div className="mt-2">
                  <input
                    type="number"
                    id="ttl_minutes"
                    min="5"
                    max="15"
                    value={formData.ttl_minutes}
                    onChange={(e) => handleInputChange('ttl_minutes', parseInt(e.target.value, 10))}
                    className="block w-full border-gray-300 rounded-lg shadow-sm focus:ring-gray-500 focus:border-gray-500 sm:text-sm"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-8">
                <button
                  type="submit"
                  disabled={isCreating}
                  className="w-full py-4 px-6 rounded-2xl text-base font-medium text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all duration-200"
                >
                  {isCreating ? '作成中...' : 'リクエストを作成'}
                </button>
              </div>
            </form>

            {/* Generated Request Display */}
            {generatedRequest && (
              <div className="mt-8 p-6 bg-green-50 border border-green-100 rounded-2xl">
                <h4 className="text-lg font-medium text-green-900 mb-4">
                  リクエストが作成されました！
                </h4>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium text-green-700">リクエストID:</p>
                    <p className="text-sm text-green-800 font-mono">{generatedRequest.requestId}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-green-700">署名用URL:</p>
                    <p className="text-sm text-green-800 break-all">{generatedRequest.signUrl}</p>
                  </div>
                  {qrCodeDataUrl && (
                    <div>
                      <p className="text-sm font-medium text-green-700 mb-2">QRコード:</p>
                      <img src={qrCodeDataUrl} alt="QR Code" className="border border-gray-300 rounded" />
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