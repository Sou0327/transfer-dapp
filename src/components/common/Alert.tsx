import React from 'react';
// Performance optimization imports removed - using standard React hooks

export interface AlertProps {
  children: React.ReactNode;
  variant?: 'info' | 'success' | 'warning' | 'error';
  onClose?: () => void;
  className?: string;
  dismissible?: boolean;
}

const getVariantClasses = (variant: AlertProps['variant']) => {
  switch (variant) {
    case 'success':
      return 'bg-green-50 border-green-200 text-green-800';
    case 'warning':
      return 'bg-yellow-50 border-yellow-200 text-yellow-800';
    case 'error':
      return 'bg-red-50 border-red-200 text-red-800';
    default:
      return 'bg-blue-50 border-blue-200 text-blue-800';
  }
};

const getIconColor = (variant: AlertProps['variant']) => {
  switch (variant) {
    case 'success': return 'text-green-400';
    case 'warning': return 'text-yellow-400';
    case 'error': return 'text-red-400';
    default: return 'text-blue-400';
  }
};

const getIcon = (variant: AlertProps['variant']) => {
  switch (variant) {
    case 'success':
      return (
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      );
    case 'warning':
      return (
        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      );
    case 'error':
      return (
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
      );
    default:
      return (
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
      );
  }
};

export const Alert: React.FC<AlertProps> = React.memo(({
  children,
  variant = 'info',
  onClose,
  className = '',
  dismissible = true,
}) => {
  const stableOnClose = React.useCallback(() => {
    if (onClose) {
      onClose();
    }
  }, [onClose]);

  const alertClasses = React.useMemo(() => {
    const baseClasses = 'border px-4 py-3 rounded-lg';
    const variantClasses = getVariantClasses(variant);
    
    return `${baseClasses} ${variantClasses} ${className}`.trim();
  }, [variant, className]);

  const iconColorClasses = React.useMemo(() => getIconColor(variant), [variant]);
  const iconPath = React.useMemo(() => getIcon(variant), [variant]);

  return (
    <div className={alertClasses}>
      <div className="flex justify-between items-start">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className={`h-5 w-5 ${iconColorClasses}`} viewBox="0 0 20 20" fill="currentColor">
              {iconPath}
            </svg>
          </div>
          <div className="ml-3">
            {typeof children === 'string' ? (
              <p className="text-sm font-medium">{children}</p>
            ) : (
              children
            )}
          </div>
        </div>
        {dismissible && onClose && (
          <button
            onClick={stableOnClose}
            className={`${iconColorClasses} hover:opacity-75 focus:outline-none`}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
});

Alert.displayName = 'Alert';