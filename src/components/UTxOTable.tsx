import React from 'react';
import { Buffer } from 'buffer';
import { UTxO } from '../types/cardano';
import { OptimizationUtils, createMemoComponent } from '../lib/performance/reactOptimization';

// Buffer polyfill for browser
window.Buffer = Buffer;

interface UTxOTableProps {
  utxos: UTxO[];
  selectedUtxos?: UTxO[];
  onSelect?: (utxo: UTxO) => void;
  onDeselect?: (utxo: UTxO) => void;
  isLoading?: boolean;
  className?: string;
  showAssets?: boolean;
  selectionEnabled?: boolean;
}

// Memoized helper functions outside component to avoid recreation
const formatAda = (lovelace: string): string => {
  const ada = Number(lovelace) / 1_000_000;
  return ada.toFixed(6) + ' ADA';
};

const formatTxHash = (hash: string): string => {
  return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
};

// Memoized UTxO row component to prevent unnecessary re-renders
const UTxORow = React.memo<{
  utxo: UTxO;
  isSelected: boolean;
  selectionEnabled: boolean;
  showAssets: boolean;
  onToggleSelect: (utxo: UTxO) => void;
}>(({ utxo, isSelected, selectionEnabled, showAssets, onToggleSelect }) => {
  
  // Memoize formatted values
  const formattedAda = React.useMemo(() => formatAda(utxo.amount.coin), [utxo.amount.coin]);
  const formattedTxHash = React.useMemo(() => formatTxHash(utxo.txHash), [utxo.txHash]);
  
  // Memoize assets rendering
  const assetsContent = React.useMemo(() => {
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
      <div className="mt-1">
        {assets.map((asset, index) => (
          <div key={index} className="text-xs text-gray-600">
            <span className="font-mono">
              {asset.quantity} {asset.assetName ? Buffer.from(asset.assetName, 'hex').toString() : 'Unknown'}
            </span>
            <br />
            <span className="text-gray-400">
              Policy: {asset.policyId.slice(0, 16)}...
            </span>
          </div>
        ))}
      </div>
    );
  }, [utxo.amount.multiasset, showAssets]);

  // Stable click handler
  const handleClick = OptimizationUtils.useStableCallback(() => {
    if (selectionEnabled) {
      onToggleSelect(utxo);
    }
  });

  const handleCheckboxChange = OptimizationUtils.useStableCallback(() => {
    onToggleSelect(utxo);
  });

  return (
    <tr 
      key={`${utxo.txHash}#${utxo.outputIndex}`}
      className={`hover:bg-gray-50 ${selectionEnabled ? 'cursor-pointer' : ''} ${
        selectionEnabled && isSelected ? 'bg-blue-50 border-l-4 border-blue-500' : ''
      }`}
      onClick={selectionEnabled ? handleClick : undefined}
    >
      {selectionEnabled && (
        <td className="px-6 py-4 whitespace-nowrap">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={handleCheckboxChange}
            className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
          />
        </td>
      )}
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm text-gray-900">
          <span className="font-mono">{formattedTxHash}</span>
          <span className="text-gray-500">#{utxo.outputIndex}</span>
        </div>
        <div className="text-xs text-gray-500">
          {utxo.address.slice(0, 20)}...
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm font-medium text-gray-900">
          {formattedAda}
        </div>
      </td>
      {showAssets && (
        <td className="px-6 py-4">
          {assetsContent}
        </td>
      )}
    </tr>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for better performance
  return (
    prevProps.utxo.txHash === nextProps.utxo.txHash &&
    prevProps.utxo.outputIndex === nextProps.utxo.outputIndex &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.selectionEnabled === nextProps.selectionEnabled &&
    prevProps.showAssets === nextProps.showAssets
  );
});

UTxORow.displayName = 'UTxORow';

export const UTxOTable: React.FC<UTxOTableProps> = React.memo(({
  utxos,
  selectedUtxos = [],
  onSelect,
  onDeselect,
  isLoading = false,
  className = '',
  showAssets = true,
  selectionEnabled = false,
}) => {
  // Memoize selected UTxOs map for O(1) lookup
  const selectedUtxosMap = React.useMemo(() => {
    const map = new Set<string>();
    selectedUtxos.forEach(utxo => {
      map.add(`${utxo.txHash}#${utxo.outputIndex}`);
    });
    return map;
  }, [selectedUtxos]);

  // Helper function to check if UTxO is selected - now O(1)
  const isSelected = React.useCallback((utxo: UTxO): boolean => {
    return selectedUtxosMap.has(`${utxo.txHash}#${utxo.outputIndex}`);
  }, [selectedUtxosMap]);

  // Stable callback for toggling selection
  const handleToggleSelect = OptimizationUtils.useStableCallback((utxo: UTxO) => {
    if (!selectionEnabled || !onSelect || !onDeselect) return;
    
    if (isSelected(utxo)) {
      onDeselect(utxo);
    } else {
      onSelect(utxo);
    }
  });

  // Memoize total selected amount
  const selectedTotal = React.useMemo(() => {
    return selectedUtxos.reduce((sum, utxo) => sum + BigInt(utxo.amount.coin), BigInt(0)).toString();
  }, [selectedUtxos]);

  // Debug information (memoized to avoid recalculation)
  const debugInfo = React.useMemo(() => ({
    utxosCount: utxos.length,
    isLoading,
    selectedUtxosCount: selectedUtxos.length,
    selectionEnabled,
    showAssets
  }), [utxos.length, isLoading, selectedUtxos.length, selectionEnabled, showAssets]);

  React.useEffect(() => {
    console.log('🏗️ UTxOTable render:', debugInfo);
  }, [debugInfo]);

  if (isLoading) {
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
      <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">
          Available UTxOs ({utxos.length})
        </h3>
        <p className="text-sm text-gray-600">
          Select UTxOs to use for your transaction
        </p>
      </div>

      <div className="max-h-96 overflow-y-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              {selectionEnabled && (
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Select
                </th>
              )}
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Transaction
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                ADA Amount
              </th>
              {showAssets && (
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Assets
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {utxos.map((utxo) => (
              <UTxORow
                key={`${utxo.txHash}#${utxo.outputIndex}`}
                utxo={utxo}
                isSelected={isSelected(utxo)}
                selectionEnabled={selectionEnabled}
                showAssets={showAssets}
                onToggleSelect={handleToggleSelect}
              />
            ))}
          </tbody>
        </table>
      </div>

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
}, (prevProps, nextProps) => {
  // Custom comparison for better performance
  return (
    prevProps.utxos === nextProps.utxos &&
    prevProps.selectedUtxos === nextProps.selectedUtxos &&
    prevProps.isLoading === nextProps.isLoading &&
    prevProps.selectionEnabled === nextProps.selectionEnabled &&
    prevProps.showAssets === nextProps.showAssets &&
    prevProps.className === nextProps.className
  );
});

UTxOTable.displayName = 'UTxOTable';

export default UTxOTable;