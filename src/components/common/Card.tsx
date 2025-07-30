import React from 'react';

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export interface CardBodyProps {
  children: React.ReactNode;
  className?: string;
}

const getPaddingClasses = (padding: CardProps['padding']) => {
  switch (padding) {
    case 'none': return '';
    case 'sm': return 'p-3';
    case 'lg': return 'p-8';
    default: return 'p-6';
  }
};

export const Card: React.FC<CardProps> = React.memo(({
  children,
  className = '',
  padding = 'md',
}) => {
  const cardClasses = React.useMemo(() => {
    const baseClasses = 'bg-white rounded-lg shadow overflow-hidden';
    const paddingClasses = getPaddingClasses(padding);
    
    return `${baseClasses} ${paddingClasses} ${className}`.trim();
  }, [className, padding]);

  return (
    <div className={cardClasses}>
      {children}
    </div>
  );
});

Card.displayName = 'Card';

export const CardHeader: React.FC<CardHeaderProps> = React.memo(({
  children,
  className = '',
}) => (
  <div className={`px-6 py-4 bg-gray-50 border-b border-gray-200 ${className}`}>
    {children}
  </div>
));

CardHeader.displayName = 'CardHeader';

export const CardBody: React.FC<CardBodyProps> = React.memo(({
  children,
  className = '',
}) => (
  <div className={`p-6 ${className}`}>
    {children}
  </div>
));

CardBody.displayName = 'CardBody';