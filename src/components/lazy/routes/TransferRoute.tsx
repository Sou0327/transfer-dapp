/**
 * Transfer Route Component - Lazy loaded
 */

import React from 'react';
import { TransferForm } from '../../TransferForm';
import { Card, CardHeader, CardBody } from '../../common';
import { usePerformanceMonitor, OptimizationUtils } from '../../../lib/performance/reactOptimization';

interface TransferRouteProps {
  onPreloadRoute?: (route: string) => void;
  onTransferComplete?: (txHash: string) => void;
  onTransferError?: (error: string) => void;
}

const TransferRoute: React.FC<TransferRouteProps> = ({ 
  onPreloadRoute, 
  onTransferComplete,
  onTransferError 
}) => {
  // Performance monitoring for lazy loaded component
  usePerformanceMonitor('TransferRoute');

  // Stable callbacks
  const stableOnTransferComplete = OptimizationUtils.useStableCallback((txHash: string) => {
    if (onTransferComplete) {
      onTransferComplete(txHash);
    }
  });

  const stableOnTransferError = OptimizationUtils.useStableCallback((error: string) => {
    if (onTransferError) {
      onTransferError(error);
    }
  });

  React.useEffect(() => {
    // Preload signing route when user starts filling the form
    const amountInput = document.querySelector('input[type="number"]');
    if (amountInput && onPreloadRoute) {
      const handleFocus = () => onPreloadRoute('signing');
      amountInput.addEventListener('focus', handleFocus);
      
      return () => {
        amountInput.removeEventListener('focus', handleFocus);
      };
    }
  }, [onPreloadRoute]);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">送金</h2>
        <div className="text-sm text-gray-500">
          Lazy loaded
        </div>
      </div>
      
      {/* 送金フォーム */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-medium text-gray-900">ADA送金</h3>
          <p className="text-sm text-gray-500">送金先と金額を入力してください</p>
        </CardHeader>
        <CardBody>
          <TransferForm
            onTransferComplete={stableOnTransferComplete}
            onTransferError={stableOnTransferError}
          />
        </CardBody>
      </Card>

      {/* Transfer Tips */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-medium text-gray-900">💡 送金のヒント</h3>
        </CardHeader>
        <CardBody>
          <div className="space-y-3 text-sm text-gray-600">
            <div className="flex items-start gap-2">
              <span className="text-orange-500 mt-1">•</span>
              <span>少額でのテスト送金を推奨します</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-orange-500 mt-1">•</span>
              <span>送金先アドレスを必ず確認してください</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-orange-500 mt-1">•</span>
              <span>Sweep送金は手数料を差し引いた全額を送金します</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-orange-500 mt-1">•</span>
              <span>トランザクション完了まで数分かかる場合があります</span>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
};

export default TransferRoute;