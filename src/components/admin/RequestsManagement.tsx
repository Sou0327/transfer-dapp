/**
 * Requests Management Component for OTC Admin System
 */
import React, { useState, useCallback, useEffect } from 'react';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
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
import { useAdminAuth, createAuthenticatedFetch } from '../../hooks/useAdminAuth';

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
  const { session, token } = useAdminAuth();
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [generatedRequest, setGeneratedRequest] = useState<CreateRequestResponse | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);

  const [formData, setFormData] = useState<CreateRequestFormData>({
    currency: 'ADA',
    amount_mode: 'fixed',
    recipient: process.env.VITE_ESCROW_ADDRESS || '',
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

        const slippage = parseFloat(formData.slippage_bps);
        if (isNaN(slippage) || slippage < 0 || slippage > 1000) {
          errors.push('スリッページは0〜1000bpsの範囲で入力してください');
        }
        break;
    }

    return errors;
  }, [formData]);

  // Create amount rule based on mode
  const createAmountRule = useCallback((): AmountOrRule => {
    switch (formData.amount_mode) {
      case 'fixed':
        const fixedRule: FixedAmount = {
          amount: (parseFloat(formData.fixed_amount) * 1_000_000).toString(), // Convert to lovelace
        };
        return fixedRule;

      case 'sweep':
        const sweepRule: SweepRule = {
          ada_only: formData.ada_only,
          exclude_utxos: formData.exclude_utxos.trim() 
            ? formData.exclude_utxos.split(',').map(utxo => utxo.trim())
            : undefined,
        };
        return sweepRule;

      case 'rate_based':
        const rateRule: RateBasedRule = {
          fiat_amount: parseFloat(formData.fiat_amount),
          rate_source: formData.rate_source,
          upper_limit_ada: (parseFloat(formData.upper_limit_ada) * 1_000_000).toString(), // Convert to lovelace
          slippage_bps: parseFloat(formData.slippage_bps),
        };
        return rateRule;

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
      setGeneratedRequest(response);

      // Generate QR code
      const qrDataUrl = await QRCode.toDataURL(response.signUrl, {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });
      setQrCodeDataUrl(qrDataUrl);

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
      case 'fixed':
        const fixedAmount = request.amount_or_rule_json as FixedAmount;
        return `${(parseInt(fixedAmount.amount) / 1_000_000).toFixed(6)} ADA`;
      case 'sweep':
        return 'All ADA (Sweep)';
      case 'rate_based':
        const rateAmount = request.amount_or_rule_json as RateBasedRule;
        return `¥${rateAmount.fiat_amount.toLocaleString()} (Rate-based)`;
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
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">請求管理</h1>
        <div className="flex space-x-2">
          <button
            onClick={() => setActiveTab('list')}
            className={`px-4 py-2 rounded-md font-medium transition-colors ${
              activeTab === 'list'
                ? 'bg-orange-500 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            請求一覧
          </button>
          <button
            onClick={() => setActiveTab('create')}
            className={`px-4 py-2 rounded-md font-medium transition-colors ${
              activeTab === 'create'
                ? 'bg-orange-500 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            新規作成
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'list' ? (
        /* Requests List */
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <div className="px-4 py-5 sm:px-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              請求一覧 ({requests.length})
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              作成された請求の管理
            </p>
          </div>
          
          {requests.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <p className="text-gray-500">まだ請求が作成されていません</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {requests.map((request) => (
                <li key={request.id} className="px-4 py-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(request.status)}`}>
                          {request.status}
                        </span>
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {formatAmount(request)}
                        </p>
                      </div>
                      <div className="mt-1 flex items-center space-x-2 text-sm text-gray-500">
                        <span>ID: {request.id.slice(0, 8)}...</span>
                        <span>•</span>
                        <span>{new Date(request.created_at).toLocaleString('ja-JP')}</span>
                        <span>•</span>
                        <span>TTL: Slot {request.ttl_slot}</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {/* Status Update Buttons */}
                      {request.status === RequestStatus.REQUESTED && (
                        <button
                          onClick={() => handleStatusUpdate(request.id, RequestStatus.EXPIRED)}
                          className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded"
                        >
                          失効
                        </button>
                      )}
                      
                      {/* Generate Link Button */}
                      <button
                        onClick={() => handleGenerateLink(request.id)}
                        className="text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded"
                      >
                        リンク生成
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        /* Create Request Form */
        <div className="bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              新規請求作成
            </h3>
            <div className="mt-2 max-w-xl text-sm text-gray-500">
              <p>OTC取引用の請求を作成します</p>
            </div>

            <form onSubmit={handleCreateRequest} className="mt-5 space-y-6">
              {/* Error Display */}
              {createError && (
                <div className="bg-red-50 border border-red-200 rounded-md p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm text-red-800">{createError}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Amount Mode Selection */}
              <div>
                <label className="text-base font-medium text-gray-900">金額モード</label>
                <p className="text-sm leading-5 text-gray-500">請求の金額設定方法を選択してください</p>
                <fieldset className="mt-4">
                  <legend className="sr-only">金額モード</legend>
                  <div className="space-y-4">
                    {[
                      { value: 'fixed', label: '固定額', description: '指定した金額を送金' },
                      { value: 'sweep', label: 'Sweep（全額）', description: 'ADAを全額送金（手数料除く）' },
                      { value: 'rate_based', label: 'レート計算', description: '法定通貨金額をレートで計算' },
                    ].map((option) => (
                      <div key={option.value} className="flex items-center">
                        <input
                          id={option.value}
                          name="amount_mode"
                          type="radio"
                          checked={formData.amount_mode === option.value}
                          onChange={() => handleInputChange('amount_mode', option.value)}
                          className="focus:ring-orange-500 h-4 w-4 text-orange-600 border-gray-300"
                        />
                        <label htmlFor={option.value} className="ml-3 block text-sm font-medium text-gray-700">
                          {option.label}
                          <span className="block text-sm text-gray-500">{option.description}</span>
                        </label>
                      </div>
                    ))}
                  </div>
                </fieldset>
              </div>

              {/* Amount Mode Specific Fields */}
              {formData.amount_mode === 'fixed' && (
                <div>
                  <label htmlFor="fixed_amount" className="block text-sm font-medium text-gray-700">
                    固定金額 (ADA) *
                  </label>
                  <input
                    type="number"
                    id="fixed_amount"
                    step="0.000001"
                    min="0"
                    value={formData.fixed_amount}
                    onChange={(e) => handleInputChange('fixed_amount', e.target.value)}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 sm:text-sm"
                    placeholder="100.000000"
                  />
                </div>
              )}

              {formData.amount_mode === 'sweep' && (
                <div className="space-y-4">
                  <div className="flex items-center">
                    <input
                      id="ada_only"
                      type="checkbox"
                      checked={formData.ada_only}
                      onChange={(e) => handleInputChange('ada_only', e.target.checked)}
                      className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                    />
                    <label htmlFor="ada_only" className="ml-2 block text-sm text-gray-900">
                      ADAのみ（トークンを含むUTxOを除外）
                    </label>
                  </div>
                  <div>
                    <label htmlFor="exclude_utxos" className="block text-sm font-medium text-gray-700">
                      除外するUTxO（カンマ区切り）
                    </label>
                    <input
                      type="text"
                      id="exclude_utxos"
                      value={formData.exclude_utxos}
                      onChange={(e) => handleInputChange('exclude_utxos', e.target.value)}
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 sm:text-sm"
                      placeholder="txhash1#0, txhash2#1"
                    />
                  </div>
                </div>
              )}

              {formData.amount_mode === 'rate_based' && (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="fiat_amount" className="block text-sm font-medium text-gray-700">
                      法定通貨金額 (JPY) *
                    </label>
                    <input
                      type="number"
                      id="fiat_amount"
                      step="1"
                      min="0"
                      value={formData.fiat_amount}
                      onChange={(e) => handleInputChange('fiat_amount', e.target.value)}
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 sm:text-sm"
                      placeholder="100000"
                    />
                  </div>
                  <div>
                    <label htmlFor="rate_source" className="block text-sm font-medium text-gray-700">
                      レートソース
                    </label>
                    <select
                      id="rate_source"
                      value={formData.rate_source}
                      onChange={(e) => handleInputChange('rate_source', e.target.value)}
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 sm:text-sm"
                    >
                      <option value="coingecko">CoinGecko</option>
                      <option value="coinbase">Coinbase</option>
                      <option value="binance">Binance</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="upper_limit_ada" className="block text-sm font-medium text-gray-700">
                      ADA上限額 *
                    </label>
                    <input
                      type="number"
                      id="upper_limit_ada"
                      step="0.000001"
                      min="0"
                      value={formData.upper_limit_ada}
                      onChange={(e) => handleInputChange('upper_limit_ada', e.target.value)}
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 sm:text-sm"
                      placeholder="3000.000000"
                    />
                  </div>
                  <div>
                    <label htmlFor="slippage_bps" className="block text-sm font-medium text-gray-700">
                      スリッページ (bps) *
                    </label>
                    <input
                      type="number"
                      id="slippage_bps"
                      step="1"
                      min="0"
                      max="1000"
                      value={formData.slippage_bps}
                      onChange={(e) => handleInputChange('slippage_bps', e.target.value)}
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 sm:text-sm"
                      placeholder="100"
                    />
                    <p className="mt-1 text-sm text-gray-500">100 bps = 1%</p>
                  </div>
                </div>
              )}

              {/* Common Fields */}
              <div>
                <label htmlFor="recipient" className="block text-sm font-medium text-gray-700">
                  送金先アドレス *
                </label>
                <input
                  type="text"
                  id="recipient"
                  value={formData.recipient}
                  onChange={(e) => handleInputChange('recipient', e.target.value)}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 sm:text-sm"
                  placeholder="addr1..."
                />
              </div>

              <div>
                <label htmlFor="ttl_minutes" className="block text-sm font-medium text-gray-700">
                  TTL (分) *
                </label>
                <input
                  type="number"
                  id="ttl_minutes"
                  min="5"
                  max="15"
                  value={formData.ttl_minutes}
                  onChange={(e) => handleInputChange('ttl_minutes', parseInt(e.target.value))}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 sm:text-sm"
                />
                <p className="mt-1 text-sm text-gray-500">署名の有効期限（5分〜15分）</p>
              </div>

              {/* Submit Button */}
              <div>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      作成中...
                    </>
                  ) : (
                    '請求を作成'
                  )}
                </button>
              </div>
            </form>

            {/* Generated Request Display */}
            {generatedRequest && (
              <div className="mt-8 p-6 bg-green-50 border border-green-200 rounded-md">
                <h4 className="text-lg font-medium text-green-900 mb-4">
                  請求が作成されました！
                </h4>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium text-green-700">請求ID:</p>
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
  );
};