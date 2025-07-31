/**
 * Signing Route Component - Lazy loaded
 */

import React from 'react';
import { Card, CardHeader, CardBody, Alert } from '../../common';
import { usePerformanceMonitor } from '../../../lib/performance/reactOptimization';

interface SigningRouteProps {
  onPreloadRoute?: (route: string) => void;
}

const SigningRoute: React.FC<SigningRouteProps> = ({ 
  onPreloadRoute
}) => {
  // Performance monitoring for lazy loaded component
  usePerformanceMonitor('SigningRoute');

  const [signingStep, setSigningStep] = React.useState<'prepare' | 'sign' | 'submit' | 'complete'>('prepare');

  React.useEffect(() => {
    // Preload dashboard route for after completion
    if (onPreloadRoute && signingStep === 'submit') {
      onPreloadRoute('dashboard');
    }
  }, [onPreloadRoute, signingStep]);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">トランザクション署名</h2>
        <div className="text-sm text-gray-500">
          Lazy loaded • Step {signingStep === 'prepare' ? '1' : 
                              signingStep === 'sign' ? '2' : 
                              signingStep === 'submit' ? '3' : '4'} of 4
        </div>
      </div>

      {/* Signing Progress */}
      <Card>
        <CardBody>
          <div className="flex items-center justify-between mb-4">
            {['prepare', 'sign', 'submit', 'complete'].map((step, index) => (
              <div 
                key={step}
                className={`flex items-center ${
                  step === signingStep ? 'text-orange-600' : 
                  ['prepare', 'sign', 'submit', 'complete'].indexOf(signingStep) > index ? 'text-green-600' : 'text-gray-400'
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                  step === signingStep ? 'border-orange-600 bg-orange-50' : 
                  ['prepare', 'sign', 'submit', 'complete'].indexOf(signingStep) > index ? 'border-green-600 bg-green-50' : 'border-gray-300'
                }`}>
                  {['prepare', 'sign', 'submit', 'complete'].indexOf(signingStep) > index ? '✓' : index + 1}
                </div>
                {index < 3 && (
                  <div className={`w-12 h-1 mx-2 ${
                    ['prepare', 'sign', 'submit', 'complete'].indexOf(signingStep) > index ? 'bg-green-300' : 'bg-gray-200'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Current Step Content */}
      {signingStep === 'prepare' && (
        <Card>
          <CardHeader>
            <h3 className="text-lg font-medium text-gray-900">トランザクション準備</h3>
          </CardHeader>
          <CardBody>
            <div className="space-y-4">
              <Alert variant="info">
                トランザクションの詳細を確認しています...
              </Alert>
              <div className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              </div>
              <button 
                onClick={() => setSigningStep('sign')}
                className="w-full bg-orange-500 text-white py-2 px-4 rounded hover:bg-orange-600 transition-colors"
              >
                次へ
              </button>
            </div>
          </CardBody>
        </Card>
      )}

      {signingStep === 'sign' && (
        <Card>
          <CardHeader>
            <h3 className="text-lg font-medium text-gray-900">トランザクション署名</h3>
          </CardHeader>
          <CardBody>
            <div className="space-y-4">
              <Alert variant="warning">
                Yoroiウォレットでトランザクションに署名してください
              </Alert>
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
                <p className="text-gray-600">Yoroiでの署名を待機中...</p>
              </div>
              <button 
                onClick={() => setSigningStep('submit')}
                className="w-full bg-orange-500 text-white py-2 px-4 rounded hover:bg-orange-600 transition-colors"
              >
                署名完了
              </button>
            </div>
          </CardBody>
        </Card>
      )}

      {signingStep === 'submit' && (
        <Card>
          <CardHeader>
            <h3 className="text-lg font-medium text-gray-900">トランザクション送信</h3>
          </CardHeader>
          <CardBody>
            <div className="space-y-4">
              <Alert variant="info">
                署名済みトランザクションをネットワークに送信しています...
              </Alert>
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                <p className="text-gray-600">送信中...</p>
              </div>
              <button 
                onClick={() => setSigningStep('complete')}
                className="w-full bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600 transition-colors"
              >
                送信完了
              </button>
            </div>
          </CardBody>
        </Card>
      )}

      {signingStep === 'complete' && (
        <Card>
          <CardHeader>
            <h3 className="text-lg font-medium text-gray-900">送金完了</h3>
          </CardHeader>
          <CardBody>
            <div className="space-y-4">
              <Alert variant="success">
                トランザクションが正常に送信されました！
              </Alert>
              <div className="text-center py-4">
                <div className="text-green-600 text-6xl mb-4">✓</div>
                <p className="text-gray-600 mb-4">送金が完了しました</p>
                <div className="font-mono text-sm text-gray-500 bg-gray-50 p-3 rounded">
                  TxHash: abc123...def789
                </div>
              </div>
              <button 
                onClick={() => window.location.reload()}
                className="w-full bg-green-500 text-white py-2 px-4 rounded hover:bg-green-600 transition-colors"
              >
                ダッシュボードに戻る
              </button>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
};

export default SigningRoute;