/**
 * Signing Success Component
 * Displays transaction confirmation details and next steps
 */
import React, { useState, useCallback } from 'react';

interface TransactionDetails {
  txHash: string;
  amount: string;
  fee: string;
  recipient: string;
  blockHeight?: number;
  blockTime?: string;
  confirmations: number;
}

interface SigningSuccessProps {
  transactionDetails: TransactionDetails;
  requestId: string;
  onViewExplorer?: (txHash: string) => void;
  onDownloadReceipt?: () => void;
  className?: string;
}

export const SigningSuccess: React.FC<SigningSuccessProps> = ({
  transactionDetails,
  requestId,
  onViewExplorer,
  onDownloadReceipt,
  className = ''
}) => {
  const [copied, setCopied] = useState<string | null>(null);

  // Copy to clipboard with feedback
  const copyToClipboard = useCallback(async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }, []);

  // Format date for display
  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // Get block explorer URL - Future use for "View on Explorer" button
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getExplorerUrl = (txHash: string): string => {
    return `https://cardanoscan.io/transaction/${txHash}`;
  };

  return (
    <div className={`bg-white shadow-lg rounded-lg overflow-hidden ${className}`}>
      {/* Success Header */}
      <div className="bg-green-50 px-6 py-4 border-b border-green-200">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <div className="h-10 w-10 bg-green-100 rounded-full flex items-center justify-center">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
          <div className="ml-4">
            <h3 className="text-lg font-medium text-green-900">
              送金が完了しました
            </h3>
            <p className="text-sm text-green-700">
              トランザクションがブロックチェーンで正常に確認されました
            </p>
          </div>
        </div>
      </div>

      {/* Transaction Details */}
      <div className="px-6 py-4">
        <h4 className="text-md font-medium text-gray-900 mb-4">取引詳細</h4>
        
        <div className="space-y-4">
          {/* Transaction Hash */}
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <dt className="text-sm font-medium text-gray-500">トランザクションハッシュ</dt>
              <dd className="mt-1 text-sm font-mono text-gray-900 break-all">
                {transactionDetails.txHash}
              </dd>
            </div>
            <button
              onClick={() => copyToClipboard(transactionDetails.txHash, 'txHash')}
              className="ml-2 p-1 text-gray-400 hover:text-gray-600"
              title="コピー"
            >
              {copied === 'txHash' ? (
                <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          </div>

          {/* Amount and Fee */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <dt className="text-sm font-medium text-gray-500">送金金額</dt>
              <dd className="mt-1 text-lg font-semibold text-gray-900">
                {transactionDetails.amount}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">手数料</dt>
              <dd className="mt-1 text-lg font-semibold text-gray-900">
                {transactionDetails.fee}
              </dd>
            </div>
          </div>

          {/* Recipient */}
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <dt className="text-sm font-medium text-gray-500">送金先アドレス</dt>
              <dd className="mt-1 text-sm font-mono text-gray-900 break-all bg-gray-50 p-2 rounded">
                {transactionDetails.recipient}
              </dd>
            </div>
            <button
              onClick={() => copyToClipboard(transactionDetails.recipient, 'recipient')}
              className="ml-2 p-1 text-gray-400 hover:text-gray-600"
              title="コピー"
            >
              {copied === 'recipient' ? (
                <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          </div>

          {/* Block Information */}
          {transactionDetails.blockHeight && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <dt className="text-sm font-medium text-gray-500">ブロック高</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  #{transactionDetails.blockHeight.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">確認数</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {transactionDetails.confirmations} 確認
                </dd>
              </div>
            </div>
          )}

          {/* Block Time */}
          {transactionDetails.blockTime && (
            <div>
              <dt className="text-sm font-medium text-gray-500">確認時刻</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {formatDate(transactionDetails.blockTime)}
              </dd>
            </div>
          )}

          {/* Request ID */}
          <div className="flex justify-between items-center pt-4 border-t border-gray-200">
            <div className="flex-1">
              <dt className="text-sm font-medium text-gray-500">請求ID</dt>
              <dd className="mt-1 text-xs font-mono text-gray-600">
                {requestId}
              </dd>
            </div>
            <button
              onClick={() => copyToClipboard(requestId, 'requestId')}
              className="ml-2 p-1 text-gray-400 hover:text-gray-600"
              title="コピー"
            >
              {copied === 'requestId' ? (
                <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => onViewExplorer?.(transactionDetails.txHash)}
            className="flex-1 bg-orange-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
          >
            <div className="flex items-center justify-center">
              <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              ブロックエクスプローラーで確認
            </div>
          </button>

          {onDownloadReceipt && (
            <button
              onClick={onDownloadReceipt}
              className="flex-1 bg-white text-gray-700 border border-gray-300 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
            >
              <div className="flex items-center justify-center">
                <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                領収書ダウンロード
              </div>
            </button>
          )}
        </div>
      </div>

      {/* Next Steps */}
      <div className="bg-blue-50 px-6 py-4 border-t border-blue-200">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-blue-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="ml-3">
            <h4 className="text-sm font-medium text-blue-900">次のステップ</h4>
            <div className="mt-2 text-sm text-blue-800">
              <ul className="list-disc pl-5 space-y-1">
                <li>トランザクションハッシュを保存してください</li>
                <li>必要に応じて領収書をダウンロードしてください</li>
                <li>送金先での着金確認を行ってください</li>
                <li>このページは安全に閉じていただけます</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};