import React from 'react';
import { Buffer } from 'buffer';
import { UTxO } from '../types/cardano';
import { VirtualizedTable, VirtualizedTableColumn } from './performance/VirtualizedList';

// Buffer polyfill for browser
window.Buffer = Buffer;

interface VirtualizedUTxOTableProps {
  utxos: UTxO[];
  selectedUtxos?: UTxO[];
  onSelect?: (utxo: UTxO) => void;
  onDeselect?: (utxo: UTxO) => void;
  isLoading?: boolean;
  className?: string;
  showAssets?: boolean;
  selectionEnabled?: boolean;
  containerHeight?: number;
  onLoadMore?: () => void;
  hasNextPage?: boolean;
}

// Create VirtualListItem-compatible UTxO interface
interface VirtualUTxO extends UTxO {
  id: string;
  data: Record<string, unknown>;
}

// Helper functions (memoized outside component)
const formatAda = (lovelace: string): string => {
  const ada = Number(lovelace) / 1_000_000;
  return ada.toFixed(6) + ' ADA';
};

const formatTxHash = (hash: string): string => {
  return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
};

export const VirtualizedUTxOTable: React.FC<VirtualizedUTxOTableProps> = React.memo(({
  utxos,
  selectedUtxos = [],
  onSelect,
  onDeselect,
  isLoading = false,
  className = '',
  showAssets = true,
  selectionEnabled = false,
  containerHeight = 400,
  onLoadMore,
  hasNextPage = false,
}) => {
  // Convert UTxOs to VirtualListItem format
  const virtualUtxos = React.useMemo(() => 
    utxos.map((utxo): VirtualUTxO => ({
      ...utxo,
      id: `${utxo.txHash}#${utxo.outputIndex}`,
      data: {
        txHash: utxo.txHash,
        outputIndex: utxo.outputIndex,
        amount: utxo.amount,
        address: utxo.address
      }
    })), 
    [utxos]
  );

  // Memoize selected UTxOs map for O(1) lookup
  const selectedUtxosMap = React.useMemo(() => {
    const map = new Set<string>();
    selectedUtxos.forEach(utxo => {
      map.add(`${utxo.txHash}#${utxo.outputIndex}`);
    });
    return map;
  }, [selectedUtxos]);

  // Helper function to check if UTxO is selected
  const isSelected = React.useCallback((utxo: UTxO): boolean => {
    return selectedUtxosMap.has(`${utxo.txHash}#${utxo.outputIndex}`);
  }, [selectedUtxosMap]);

  // Stable callback for toggling selection
  const handleToggleSelect = React.useCallback((utxo: UTxO) => {
    if (!selectionEnabled || !onSelect || !onDeselect) return;
    
    if (isSelected(utxo)) {
      onDeselect(utxo);
    } else {
      onSelect(utxo);
    }
  }, [selectionEnabled, onSelect, onDeselect, isSelected]);

  // Render assets helper
  const renderAssets = React.useCallback((utxo: UTxO) => {
    if (!utxo.amount.multiasset || !showAssets) return null;

    const assets = Object.entries(utxo.amount.multiasset).flatMap(([policyId, assetMap]) =>
      Object.entries(assetMap).map(([assetName, quantity]) => ({
        policyId,
        assetName,
        quantity,
      }))
    );

    if (assets.length === 0) return null;

    return (
      <div className="space-y-1">
        {assets.slice(0, 3).map((asset, index) => (
          <div key={index} className="text-xs text-gray-600">
            <span className="font-mono block truncate">
              {asset.quantity} {asset.assetName ? Buffer.from(asset.assetName, 'hex').toString() : 'Unknown'}
            </span>
            <span className="text-gray-400 block truncate">
              {asset.policyId.slice(0, 16)}...
            </span>
          </div>
        ))}
        {assets.length > 3 && (
          <div className="text-xs text-gray-500">
            +{assets.length - 3} more assets
          </div>
        )}
      </div>
    );
  }, [showAssets]);

  // Define table columns
  const columns = React.useMemo((): VirtualizedTableColumn<VirtualUTxO>[] => {
    const baseColumns: VirtualizedTableColumn<VirtualUTxO>[] = [];

    // Selection column
    if (selectionEnabled) {
      baseColumns.push({
        key: 'select',
        header: 'Select',
        width: 80,
        render: (utxo) => (
          <input
            type="checkbox"
            checked={isSelected(utxo)}
            onChange={() => handleToggleSelect(utxo)}
            className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
            onClick={(e) => e.stopPropagation()}
          />
        ),
      });
    }

    // Transaction column
    baseColumns.push({
      key: 'transaction',
      header: 'Transaction',
      width: '40%',
      minWidth: 200,
      render: (utxo) => (
        <div>
          <div className="text-sm text-gray-900">
            <span className="font-mono">{formatTxHash(utxo.txHash)}</span>
            <span className="text-gray-500">#{utxo.outputIndex}</span>
          </div>
          <div className="text-xs text-gray-500 truncate">
            {utxo.address.slice(0, 20)}...
          </div>
        </div>
      ),
    });

    // ADA Amount column
    baseColumns.push({
      key: 'amount',
      header: 'ADA Amount',
      width: '25%',
      minWidth: 120,
      render: (utxo) => (
        <div className="text-sm font-medium text-gray-900">
          {formatAda(utxo.amount.coin)}
        </div>
      ),
      sortable: true,
    });

    // Assets column
    if (showAssets) {
      baseColumns.push({
        key: 'assets',
        header: 'Assets',
        width: '35%',
        minWidth: 150,
        render: (utxo) => renderAssets(utxo),
      });
    }

    return baseColumns;
  }, [selectionEnabled, showAssets, isSelected, handleToggleSelect, renderAssets]);



  // Memoize total selected amount
  const selectedTotal = React.useMemo(() => {
    return selectedUtxos.reduce((sum, utxo) => sum + BigInt(utxo.amount.coin), BigInt(0)).toString();
  }, [selectedUtxos]);

  if (isLoading && utxos.length === 0) {
    return (
      <div className={`bg-white rounded-lg shadow p-6 ${className}`}>
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <span className="ml-2 text-gray-600">Loading UTxOs...</span>
        </div>
      </div>
    );
  }

  if (utxos.length === 0) {
    return (
      <div className={`bg-white rounded-lg shadow p-6 ${className}`}>
        <div className="text-center text-gray-500">
          <p className="text-lg">No UTxOs available</p>
          <p className="text-sm mt-1">Connect your wallet to view available UTxOs</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-medium text-gray-900">
              Available UTxOs ({utxos.length})
            </h3>
            <p className="text-sm text-gray-600">
              Virtualized for optimal performance with large datasets
            </p>
          </div>
          {selectionEnabled && selectedUtxos.length > 0 && (
            <div className="text-right">
              <div className="text-sm font-medium text-blue-900">
                {selectedUtxos.length} selected
              </div>
              <div className="text-xs text-blue-700">
                Total: {formatAda(selectedTotal)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Virtualized Table */}
      <VirtualizedTable
        items={virtualUtxos}
        columns={columns}
        containerHeight={containerHeight}
        rowHeight={showAssets ? 80 : 60}
        headerHeight={40}
        overscan={10}
        loadMore={onLoadMore}
        hasNextPage={hasNextPage}
        loading={isLoading}
      />

      {/* Selection Summary */}
      {selectionEnabled && selectedUtxos.length > 0 && (
        <div className="px-6 py-4 bg-blue-50 border-t border-blue-200">
          <div className="flex justify-between items-center">
            <div>
              <span className="text-sm font-medium text-blue-900">
                {selectedUtxos.length} UTxO{selectedUtxos.length !== 1 ? 's' : ''} selected
              </span>
            </div>
            <div className="text-sm font-medium text-blue-900">
              Total: {formatAda(selectedTotal)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

VirtualizedUTxOTable.displayName = 'VirtualizedUTxOTable';

export default VirtualizedUTxOTable;