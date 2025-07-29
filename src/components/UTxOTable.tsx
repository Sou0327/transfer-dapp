import React from 'react';
import { Buffer } from 'buffer';
import { UTxO } from '../types/cardano';

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

export const UTxOTable: React.FC<UTxOTableProps> = ({
  utxos,
  selectedUtxos = [],
  onSelect,
  onDeselect,
  isLoading = false,
  className = '',
  showAssets = true,
  selectionEnabled = false,
}) => {
  // デバッグ情報
  console.log('🏗️ UTxOTable render:', {
    utxosCount: utxos.length,
    isLoading,
    selectedUtxosCount: selectedUtxos.length,
    selectionEnabled,
    showAssets
  });
  // Helper function to format ADA amount
  const formatAda = (lovelace: string): string => {
    const ada = Number(lovelace) / 1_000_000;
    return ada.toFixed(6) + ' ADA';
  };

  // Helper function to format transaction hash
  const formatTxHash = (hash: string): string => {
    return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
  };

  // Helper function to check if UTxO is selected
  const isSelected = (utxo: UTxO): boolean => {
    return selectedUtxos.some(
      selected => selected.txHash === utxo.txHash && selected.outputIndex === utxo.outputIndex
    );
  };

  // Helper function to handle selection toggle
  const handleToggleSelect = (utxo: UTxO): void => {
    if (!selectionEnabled || !onSelect || !onDeselect) return;
    
    if (isSelected(utxo)) {
      onDeselect(utxo);
    } else {
      onSelect(utxo);
    }
  };

  // Helper function to render assets
  const renderAssets = (utxo: UTxO): React.ReactNode => {
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
  };

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
              <tr 
                key={`${utxo.txHash}#${utxo.outputIndex}`}
                className={`hover:bg-gray-50 ${selectionEnabled ? 'cursor-pointer' : ''} ${
                  selectionEnabled && isSelected(utxo) ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                }`}
                onClick={selectionEnabled ? () => handleToggleSelect(utxo) : undefined}
              >
                {selectionEnabled && (
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={isSelected(utxo)}
                      onChange={() => handleToggleSelect(utxo)}
                      className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
                    />
                  </td>
                )}
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">
                    <span className="font-mono">{formatTxHash(utxo.txHash)}</span>
                    <span className="text-gray-500">#{utxo.outputIndex}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {utxo.address.slice(0, 20)}...
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {formatAda(utxo.amount.coin)}
                  </div>
                </td>
                {showAssets && (
                  <td className="px-6 py-4">
                    {renderAssets(utxo)}
                  </td>
                )}
              </tr>
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
              Total: {formatAda(
                selectedUtxos.reduce((sum, utxo) => sum + BigInt(utxo.amount.coin), BigInt(0)).toString()
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};