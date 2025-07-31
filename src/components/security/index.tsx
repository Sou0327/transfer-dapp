/**
 * Security Components Export
 * Centralized exports for all security-related components and utilities
 */

// Admin components
export { SecurityDashboard } from '../admin/SecurityDashboard';

// Hooks
// eslint-disable-next-line react-refresh/only-export-components
export { useSecurity, useCsrfProtection, useRateLimit, useSecureRequest } from '../../hooks/useSecurity';

// Core security library
// eslint-disable-next-line react-refresh/only-export-components
export * from '../../lib/security';

// Security wrapper components
import React, { useEffect, useState } from 'react';
import { useSecurity, useRateLimit, useCsrfProtection } from '../../hooks/useSecurity';

interface SecurityProviderProps {
  children: React.ReactNode;
  config?: Record<string, unknown>;
  fallback?: React.ReactNode;
}

/**
 * Security Provider Component
 * Initializes security system and provides context to child components
 */
export const SecurityProvider: React.FC<SecurityProviderProps> = ({
  children,
  config,
  fallback
}) => {
  const security = useSecurity({ autoInitialize: true, config });
  const [showFallback, setShowFallback] = useState(true);

  useEffect(() => {
    if (security.initialized || security.error) {
      setShowFallback(false);
    }
  }, [security.initialized, security.error]);

  if (showFallback) {
    return (
      <>
        {fallback || (
          <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
              <p className="text-gray-600">セキュリティシステムを初期化中...</p>
            </div>
          </div>
        )}
      </>
    );
  }

  if (security.error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6 text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            セキュリティエラー
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            セキュリティシステムの初期化に失敗しました。
          </p>
          <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
            {security.error}
          </div>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700"
          >
            再読み込み
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

interface RateLimitGuardProps {
  children: React.ReactNode;
  identifier: string;
  endpoint?: string;
  fallback?: React.ReactNode;
}

/**
 * Rate Limit Guard Component
 * Protects child components with rate limiting
 */
export const RateLimitGuard: React.FC<RateLimitGuardProps> = ({
  children,
  identifier,
  endpoint,
  fallback
}) => {
  const rateLimit = useRateLimit(identifier, endpoint);

  if (rateLimit.isBlocked) {
    return (
      <>
        {fallback || (
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">
                  アクセス制限中
                </h3>
                <div className="mt-2 text-sm text-yellow-700">
                  <p>
                    リクエスト制限に達しました。
                    {Math.round(rateLimit.timeUntilReset / 1000)}秒後に再試行してください。
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return <>{children}</>;
};

interface CsrfProtectedFormProps extends React.FormHTMLAttributes<HTMLFormElement> {
  children: React.ReactNode;
}

/**
 * CSRF Protected Form Component
 * Automatically adds CSRF protection to forms
 */
export const CsrfProtectedForm: React.FC<CsrfProtectedFormProps> = ({
  children,
  ...formProps
}) => {
  const csrf = useCsrfProtection();

  return (
    <form {...formProps} {...csrf.getFormProps()}>
      <input type="hidden" name="csrfToken" value={csrf.token || ''} />
      {children}
    </form>
  );
};

interface SecurityStatusProps {
  className?: string;
  showDetails?: boolean;
}

/**
 * Security Status Indicator Component
 * Shows current security system status
 */
export const SecurityStatus: React.FC<SecurityStatusProps> = ({
  className = '',
  showDetails = false
}) => {
  const security = useSecurity();

  return (
    <div className={`flex items-center ${className}`}>
      <div className={`w-3 h-3 rounded-full mr-2 ${
        security.isHealthy ? 'bg-green-500' : 'bg-red-500'
      }`} />
      
      <span className={`text-sm font-medium ${
        security.isHealthy ? 'text-green-700' : 'text-red-700'
      }`}>
        {security.isHealthy ? 'セキュア' : 'アラート'}
      </span>
      
      {showDetails && (
        <div className="ml-2 text-xs text-gray-500">
          (
          {security.status?.integrity ? '整合性OK' : '整合性NG'}, 
          {security.status?.rateLimiting ? 'レート制限OK' : 'レート制限NG'}
          )
        </div>
      )}
    </div>
  );
};