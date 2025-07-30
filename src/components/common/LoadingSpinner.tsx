import React from 'react';

export interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: 'blue' | 'orange' | 'white' | 'gray';
  className?: string;
}

const getSizeClasses = (size: LoadingSpinnerProps['size']) => {
  switch (size) {
    case 'sm': return 'h-4 w-4';
    case 'lg': return 'h-12 w-12';
    default: return 'h-8 w-8';
  }
};

const getColorClasses = (color: LoadingSpinnerProps['color']) => {
  switch (color) {
    case 'blue': return 'border-blue-500';
    case 'orange': return 'border-orange-500';
    case 'white': return 'border-white';
    case 'gray': return 'border-gray-500';
    default: return 'border-blue-500';
  }
};

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = React.memo(({
  size = 'md',
  color = 'blue',
  className = '',
}) => {
  const spinnerClasses = React.useMemo(() => {
    const baseClasses = 'animate-spin rounded-full border-b-2';
    const sizeClasses = getSizeClasses(size);
    const colorClasses = getColorClasses(color);
    
    return `${baseClasses} ${sizeClasses} ${colorClasses} ${className}`.trim();
  }, [size, color, className]);

  return <div className={spinnerClasses} />;
});

LoadingSpinner.displayName = 'LoadingSpinner';