/**
 * Transaction Preview Component
 * Shows transaction details before signing
 */
import React from 'react';
import { TransactionBuildResult } from '../types/otc/index';

interface TxPreviewProps {
  txResult: TransactionBuildResult;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  className?: string;
}

export const TxPreview: React.FC<TxPreviewProps> = ({
  txResult,
  onConfirm,
  onCancel,
  isLoading = false,
  className = ''
}) => {
  if (!txResult.success) {
    return (
      <div className={`bg-red-50 border border-red-200 rounded-lg p-6 ${className}`}>
        <div className="flex items-center mb-4">
          <svg className="h-6 w-6 text-red-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-lg font-medium text-red-800">
            トランザクション構築エラー
          </h3>
        </div>
        <p className="text-sm text-red-700 mb-4">{txResult.error}</p>
        <button
          onClick={onCancel}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
        >
          戻る
        </button>
      </div>
    );
  }

  const formatADA = (lovelace: string | undefined) => {
    if (!lovelace) return '0 ADA';
    const ada = parseInt(lovelace) / 1_000_000;
    return `${ada.toLocaleString()} ADA`;
  };

  const formatLovelace = (lovelace: string | undefined) => {
    if (!lovelace) return '0 lovelace';
    return `${parseInt(lovelace).toLocaleString()} lovelace`;
  };

  const { summary } = txResult;

  return (
    <div className={`bg-white border border-gray-200 rounded-lg shadow-sm p-4 sm:p-6 ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6">
        <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2 sm:mb-0">
          トランザクション詳細
        </h3>
        <div className="flex items-center text-xs sm:text-sm text-gray-500">
          <svg className="h-3 w-3 sm:h-4 sm:w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          署名準備完了
        </div>
      </div>

      {/* Transaction Summary */}
      <div className="space-y-4 mb-6">
        {/* Amount */}
        <div className="flex justify-between items-center py-3 border-b border-gray-100">
          <span className="text-sm font-medium text-gray-700">送金額</span>
          <div className="text-right">
            <div className="text-lg font-semibold text-gray-900">
              {formatADA(summary?.amount_sent || '0')}
            </div>
            <div className="text-xs text-gray-500">
              {formatLovelace(summary?.amount_sent || '0')}
            </div>
          </div>
        </div>

        {/* Fee */}
        <div className="flex justify-between items-center py-3 border-b border-gray-100">
          <span className="text-sm font-medium text-gray-700">手数料</span>
          <div className="text-right">
            <div className="text-sm font-medium text-gray-900">
              {formatADA(txResult.fee)}
            </div>
            <div className="text-xs text-gray-500">
              {formatLovelace(txResult.fee)}
            </div>
          </div>
        </div>

        {/* Change */}
        {summary?.change_amount && parseInt(summary.change_amount) > 0 && (
          <div className="flex justify-between items-center py-3 border-b border-gray-100">
            <span className="text-sm font-medium text-gray-700">お釣り</span>
            <div className="text-right">
              <div className="text-sm font-medium text-gray-900">
                {formatADA(summary.change_amount)}
              </div>
              <div className="text-xs text-gray-500">
                {formatLovelace(summary.change_amount)}
              </div>
            </div>
          </div>
        )}

        {/* Total */}
        <div className="flex justify-between items-center py-3 bg-gray-50 rounded-md px-4">
          <span className="text-sm font-semibold text-gray-800">合計消費</span>
          <div className="text-right">
            <div className="text-lg font-bold text-gray-900">
              {formatADA((parseInt(summary?.amount_sent || '0') + parseInt(txResult.fee || '0')).toString())}
            </div>
            <div className="text-xs text-gray-500">
              {formatLovelace((parseInt(summary?.amount_sent || '0') + parseInt(txResult.fee || '0')).toString())}
            </div>
          </div>
        </div>

        {/* Rate Info (for rate-based transactions) */}
        {summary?.rate_used && summary.jpy_amount && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <div className="text-sm text-blue-800 mb-2 font-medium">レート情報</div>
            <div className="space-y-1 text-xs text-blue-700">
              <div>JPY金額: ¥{parseFloat(summary.jpy_amount).toLocaleString()}</div>
              <div>使用レート: ¥{parseFloat(summary.rate_used).toFixed(4)}/ADA</div>
            </div>
          </div>
        )}
      </div>

      {/* Transaction Details */}
      <div className="space-y-3 mb-6">
        <h4 className="text-sm font-medium text-gray-700">トランザクション詳細</h4>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 text-sm">
          <div className="flex justify-between sm:block">
            <span className="text-gray-500">入力数:</span>
            <span className="ml-2 font-medium">{summary?.inputs || 0}</span>
          </div>
          <div className="flex justify-between sm:block">
            <span className="text-gray-500">出力数:</span>
            <span className="ml-2 font-medium">{summary?.outputs || 0}</span>
          </div>
          <div className="flex justify-between sm:block">
            <span className="text-gray-500">必要署名数:</span>
            <span className="ml-2 font-medium">{txResult.witnesses_required || 0}</span>
          </div>
          <div className="flex justify-between sm:block">
            <span className="text-gray-500">TTL:</span>
            <span className="ml-2 font-medium text-xs">#{txResult.ttl}</span>
          </div>
        </div>

        {/* Transaction Hash */}
        <div className="mt-4">
          <span className="text-xs sm:text-sm text-gray-500">トランザクションハッシュ:</span>
          <div className="mt-1 p-2 sm:p-2 bg-gray-50 rounded text-xs font-mono break-all">
            {txResult.txHash}
          </div>
        </div>
      </div>

      {/* Security Notice */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 sm:p-4 mb-4 sm:mb-6">
        <div className="flex items-start">
          <svg className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-400 mt-0.5 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.99-.833-2.76 0L3.054 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <div className="text-xs sm:text-sm text-yellow-800">
            <p className="font-medium mb-1">署名前の確認事項</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>送金額と手数料が正しいことを確認してください</li>
              <li>送金先アドレスが正しいことを確認してください</li>
              <li>この操作は取り消しできません</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3">
        <button
          onClick={onCancel}
          disabled={isLoading}
          className="flex-1 inline-flex justify-center items-center px-4 py-2 sm:py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed order-2 sm:order-1"
        >
          キャンセル
        </button>
        <button
          onClick={onConfirm}
          disabled={isLoading}
          className="flex-1 inline-flex justify-center items-center px-4 py-2 sm:py-2 border border-transparent text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed order-1 sm:order-2"
          style={{
            backgroundColor: '#ea580c',
            color: 'white',
            border: 'none'
          }}
        >
          {isLoading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              署名中...
            </>
          ) : (
            <>
              <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              署名して実行
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default TxPreview;