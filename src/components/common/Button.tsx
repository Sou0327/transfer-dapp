import React from 'react';
// Performance optimization imports removed - using standard React hooks

export interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  type?: 'button' | 'submit' | 'reset';
  className?: string;
  fullWidth?: boolean;
}

const getVariantClasses = (variant: ButtonProps['variant']) => {
  switch (variant) {
    case 'primary':
      return 'bg-orange-500 hover:bg-orange-600 text-white';
    case 'secondary':
      return 'bg-gray-500 hover:bg-gray-600 text-white';
    case 'danger':
      return 'bg-red-500 hover:bg-red-600 text-white';
    default:
      return 'bg-blue-500 hover:bg-blue-600 text-white';
  }
};

const getSizeClasses = (size: ButtonProps['size']) => {
  switch (size) {
    case 'sm': return 'py-1 px-2 text-sm';
    case 'lg': return 'py-3 px-6 text-lg';
    default: return 'py-2 px-4';
  }
};

export const Button: React.FC<ButtonProps> = React.memo(({
  children,
  onClick,
  disabled = false,
  loading = false,
  variant = 'primary',
  size = 'md',
  type = 'button',
  className = '',
  fullWidth = false,
}) => {
  const stableOnClick = React.useCallback(() => {
    if (!disabled && !loading && onClick) {
      onClick();
    }
  }, [disabled, loading, onClick]);

  const buttonClasses = React.useMemo(() => {
    const baseClasses = 'font-bold rounded transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2';
    const variantClasses = getVariantClasses(variant);
    const sizeClasses = getSizeClasses(size);
    const stateClasses = disabled || loading ? 'opacity-50 cursor-not-allowed' : '';
    const widthClasses = fullWidth ? 'w-full' : '';
    const flexClasses = loading ? 'flex items-center justify-center' : '';
    
    return `${baseClasses} ${variantClasses} ${sizeClasses} ${stateClasses} ${widthClasses} ${flexClasses} ${className}`.trim();
  }, [variant, size, disabled, loading, fullWidth, className]);

  return (
    <button
      type={type}
      onClick={stableOnClick}
      disabled={disabled || loading}
      className={buttonClasses}
    >
      {loading && (
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
      )}
      {children}
    </button>
  );
});

Button.displayName = 'Button';