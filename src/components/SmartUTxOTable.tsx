import React from 'react';
import { UTxO } from '../types/cardano';
import { UTxOTable } from './UTxOTable';
import { VirtualizedUTxOTable } from './VirtualizedUTxOTable';
// Performance optimization imports removed

interface SmartUTxOTableProps {
  utxos: UTxO[];
  selectedUtxos?: UTxO[];
  onSelect?: (utxo: UTxO) => void;
  onDeselect?: (utxo: UTxO) => void;
  isLoading?: boolean;
  className?: string;
  showAssets?: boolean;
  selectionEnabled?: boolean;
  virtualizationThreshold?: number;
  onLoadMore?: () => void;
  hasNextPage?: boolean;
}

/**
 * Smart UTxO Table that automatically switches between regular table and virtualized table
 * based on the number of UTxOs and screen size for optimal performance
 */
export const SmartUTxOTable: React.FC<SmartUTxOTableProps> = React.memo(({
  utxos,
  selectedUtxos = [],
  onSelect,
  onDeselect,
  isLoading = false,
  className = '',
  showAssets = true,
  selectionEnabled = false,
  virtualizationThreshold = 100,
  onLoadMore,
  hasNextPage = false,
}) => {
  const [height, setHeight] = React.useState(window.innerHeight);
  
  React.useEffect(() => {
    const handleResize = () => setHeight(window.innerHeight);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Decision logic for virtualization
  const shouldVirtualize = React.useMemo(() => {
    // Always virtualize for large datasets
    if (utxos.length >= virtualizationThreshold) {
      return true;
    }

    // Virtualize on smaller screens with medium datasets
    if (height < 800 && utxos.length >= 50) {
      return true;
    }

    // Virtualize when assets are shown and there are many UTxOs
    if (showAssets && utxos.length >= 30) {
      return true;
    }

    return false;
  }, [utxos.length, virtualizationThreshold, height, showAssets]);

  // Calculate optimal container height for virtualized table
  const containerHeight = React.useMemo(() => {
    if (!shouldVirtualize) return 0;

    // Reserve space for header, navigation, and footer
    const reservedHeight = 300;
    const availableHeight = height - reservedHeight;
    
    // Set reasonable bounds
    return Math.min(Math.max(availableHeight, 300), 600);
  }, [shouldVirtualize, height]);

  // Debug information for development
  React.useEffect(() => {
    if (import.meta.env.NODE_ENV === 'development' || import.meta.env.DEV) {
      console.log('🧠 SmartUTxOTable decision:', {
        utxosCount: utxos.length,
        shouldVirtualize,
        containerHeight,
        screenHeight: height,
        virtualizationThreshold,
        showAssets,
      });
    }
  }, [utxos.length, shouldVirtualize, containerHeight, height, virtualizationThreshold, showAssets]);

  if (shouldVirtualize) {
    return (
      <VirtualizedUTxOTable
        utxos={utxos}
        selectedUtxos={selectedUtxos}
        onSelect={onSelect}
        onDeselect={onDeselect}
        isLoading={isLoading}
        className={className}
        showAssets={showAssets}
        selectionEnabled={selectionEnabled}
        containerHeight={containerHeight}
        onLoadMore={onLoadMore}
        hasNextPage={hasNextPage}
      />
    );
  }

  return (
    <UTxOTable
      utxos={utxos}
      selectedUtxos={selectedUtxos}
      onSelect={onSelect}
      onDeselect={onDeselect}
      isLoading={isLoading}
      className={className}
      showAssets={showAssets}
      selectionEnabled={selectionEnabled}
    />
  );
});

SmartUTxOTable.displayName = 'SmartUTxOTable';