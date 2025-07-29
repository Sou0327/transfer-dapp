/**
 * Signing Steps Component
 * Visual progress indicator for the signing process
 */
import React from 'react';

interface Step {
  id: string;
  name: string;
  description: string;
  status: 'upcoming' | 'current' | 'complete' | 'error';
}

interface SigningStepsProps {
  currentStep: 'connect' | 'review' | 'sign' | 'submit' | 'confirm';
  hasError?: boolean;
  className?: string;
}

export const SigningSteps: React.FC<SigningStepsProps> = ({
  currentStep,
  hasError = false,
  className = ''
}) => {
  const getStepStatus = (stepId: string): Step['status'] => {
    if (hasError && stepId === currentStep) return 'error';
    
    const stepOrder = ['connect', 'review', 'sign', 'submit', 'confirm'];
    const currentIndex = stepOrder.indexOf(currentStep);
    const stepIndex = stepOrder.indexOf(stepId);
    
    if (stepIndex < currentIndex) return 'complete';
    if (stepIndex === currentIndex) return 'current';
    return 'upcoming';
  };

  const steps: Omit<Step, 'status'>[] = [
    {
      id: 'connect',
      name: 'ウォレット接続',
      description: 'Cardanoウォレットに接続'
    },
    {
      id: 'review',
      name: '内容確認',
      description: '送金内容と手数料を確認'
    },
    {
      id: 'sign',
      name: '署名',
      description: 'ウォレットでトランザクションに署名'
    },
    {
      id: 'submit',
      name: '送信',
      description: 'ブロックチェーンに送信'
    },
    {
      id: 'confirm',
      name: '完了',
      description: 'ブロック確認完了'
    }
  ];

  const stepsWithStatus: Step[] = steps.map(step => ({
    ...step,
    status: getStepStatus(step.id)
  }));

  return (
    <div className={`${className}`}>
      <nav aria-label="署名プロセス">
        <ol className="flex items-center justify-center space-x-2 sm:space-x-4">
          {stepsWithStatus.map((step, stepIdx) => (
            <li key={step.id} className="flex items-center">
              {stepIdx > 0 && (
                <div className={`hidden sm:block w-8 h-0.5 mx-2 ${
                  step.status === 'complete' || (stepIdx <= stepsWithStatus.findIndex(s => s.status === 'current'))
                    ? 'bg-orange-500' 
                    : 'bg-gray-200'
                }`} />
              )}
              
              <div className="flex flex-col items-center">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${
                  step.status === 'complete' 
                    ? 'bg-orange-500 border-orange-500 text-white'
                    : step.status === 'current'
                    ? 'bg-white border-orange-500 text-orange-500'
                    : step.status === 'error'
                    ? 'bg-red-100 border-red-500 text-red-500'
                    : 'bg-white border-gray-300 text-gray-400'
                }`}>
                  {step.status === 'complete' ? (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : step.status === 'error' ? (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <span className="text-xs font-medium">{stepIdx + 1}</span>
                  )}
                </div>
                
                <div className="mt-2 text-center">
                  <div className={`text-xs font-medium ${
                    step.status === 'current' 
                      ? 'text-orange-600'
                      : step.status === 'complete'
                      ? 'text-gray-900'
                      : step.status === 'error'
                      ? 'text-red-600'
                      : 'text-gray-500'
                  }`}>
                    {step.name}
                  </div>
                  <div className="text-xs text-gray-400 hidden sm:block mt-1 max-w-20">
                    {step.description}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
};