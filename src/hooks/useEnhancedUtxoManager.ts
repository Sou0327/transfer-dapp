/**
 * Enhanced UTxO Manager Hook
 * Advanced UTxO management with selection strategies and coin control
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Buffer } from 'buffer';
import { UTxO, AssetBalance } from '../types/cardano';
import { useYoroiConnect } from './useYoroiConnect';
import {
  SELECTION_STRATEGIES,
  UTxOFilter,
  UTxOAnalytics,
  filterUtxos,
  analyzeUtxos,
  isSelectionSufficient
} from '../lib/utxoSelection';

// Buffer polyfill for browser
window.Buffer = Buffer;

interface EnhancedUtxoManagerState {
  utxos: UTxO[];
  selectedUtxos: UTxO[];
  totalAda: bigint;
  totalAssets: AssetBalance[];
  isLoading: boolean;
  error: string | null;
  changeAddress: string | null;
  lastRefresh: Date | null;
  coinControlEnabled: boolean;
  defaultStrategy: string;
}

interface UseEnhancedUtxoManagerReturn extends EnhancedUtxoManagerState {
  // Basic operations
  refreshUtxos: () => Promise<void>;
  selectUtxo: (utxo: UTxO) => void;
  deselectUtxo: (utxo: UTxO) => void;
  selectUtxos: (utxos: UTxO[]) => void;
  clearSelection: () => void;
  selectAllUtxos: () => void;
  
  // Advanced selection
  autoSelectForAmount: (requiredLovelace: bigint, strategy?: string) => boolean;
  autoSelectOptimal: (requiredLovelace: bigint) => boolean;
  
  // Analytics and utilities
  getSelectedTotal: () => bigint;
  getSelectedAnalytics: () => UTxOAnalytics;
  getUtxoAnalytics: () => UTxOAnalytics;
  isUtxoSelected: (utxo: UTxO) => boolean;
  isSelectionSufficient: (targetAmount: bigint, estimatedFee?: bigint) => boolean;
  
  // Filtering and sorting
  getFilteredUtxos: (filter: UTxOFilter) => UTxO[];
  
  // Coin control settings
  setCoinControlEnabled: (enabled: boolean) => void;
  setDefaultStrategy: (strategy: string) => void;
}

// Helper function to parse CBOR UTxO data (same as original)
const parseUtxoCbor = async (cborUtxos: string[]): Promise<UTxO[]> => {
  console.log('🔧 parseUtxoCbor called with:', cborUtxos.length, 'UTxOs');
  
  const wasm = await import('@emurgo/cardano-serialization-lib-browser');
  const CSL = wasm.default || wasm;
  
  return cborUtxos.map((cborHex, index) => {
    try {
      console.log(`🔍 Parsing UTxO ${index}:`, cborHex.slice(0, 20) + '...');
      
      const utxoBytes = Buffer.from(cborHex, 'hex');
      const transactionUnspentOutput = CSL.TransactionUnspentOutput.from_bytes(utxoBytes);
      const output = transactionUnspentOutput.output();
      const input = transactionUnspentOutput.input();
      
      const address = output.address().to_bech32();
      const amount = output.amount();
      const coin = amount.coin().to_str();
      
      // Parse multiasset if present
      let multiasset: UTxO['amount']['multiasset'] = undefined;
      const maValue = amount.multiasset();
      if (maValue) {
        multiasset = {};
        const scriptHashes = maValue.keys();
        for (let i = 0; i < scriptHashes.len(); i++) {
          const policyId = scriptHashes.get(i).to_hex();
          const assets = maValue.get(scriptHashes.get(i));
          if (assets) {
            multiasset[policyId] = {};
            const assetNames = assets.keys();
            for (let j = 0; j < assetNames.len(); j++) {
              const assetName = assetNames.get(j);
              const quantity = assets.get(assetName);
              if (quantity) {
                multiasset[policyId][assetName.to_hex()] = quantity.to_str();
              }
            }
          }
        }
      }

      return {
        txHash: input.transaction_id().to_hex(),
        outputIndex: input.index(),
        address,
        amount: {
          coin,
          multiasset,
        },
        dataHash: output.data_hash()?.to_hex(),
        scriptRef: output.script_ref()?.to_hex(),
      };
    } catch (error) {
      console.error(`Failed to parse UTxO at index ${index}:`, error);
      throw new Error(`Invalid UTxO data at index ${index}`);
    }
  });
};

// Helper function to calculate total ADA and assets (same as original)
const calculateTotals = (utxos: UTxO[]): { totalAda: bigint; totalAssets: AssetBalance[] } => {
  let totalAda = BigInt(0);
  const assetMap = new Map<string, bigint>();

  utxos.forEach(utxo => {
    // Add ADA
    totalAda += BigInt(utxo.amount.coin);

    // Add assets
    if (utxo.amount.multiasset) {
      Object.entries(utxo.amount.multiasset).forEach(([policyId, assets]) => {
        Object.entries(assets).forEach(([assetName, quantity]) => {
          const assetId = `${policyId}.${assetName}`;
          const currentAmount = assetMap.get(assetId) || BigInt(0);
          assetMap.set(assetId, currentAmount + BigInt(quantity));
        });
      });
    }
  });

  const totalAssets: AssetBalance[] = Array.from(assetMap.entries()).map(([assetId, quantity]) => {
    const [policyId, assetName] = assetId.split('.');
    return {
      policyId,
      assetName,
      quantity: quantity.toString(),
    };
  });

  return { totalAda, totalAssets };
};

export const useEnhancedUtxoManager = (): UseEnhancedUtxoManagerReturn => {
  const { isConnected, api } = useYoroiConnect();
  const [state, setState] = useState<EnhancedUtxoManagerState>({
    utxos: [],
    selectedUtxos: [],
    totalAda: BigInt(0),
    totalAssets: [],
    isLoading: false,
    error: null,
    changeAddress: null,
    lastRefresh: null,
    coinControlEnabled: false,
    defaultStrategy: 'ada_only_priority',
  });

  // Memoized analytics for current UTxO set
  const utxoAnalytics = useMemo(() => {
    return analyzeUtxos(state.utxos);
  }, [state.utxos]);

  // Memoized analytics for selected UTxOs
  const selectedAnalytics = useMemo(() => {
    return analyzeUtxos(state.selectedUtxos);
  }, [state.selectedUtxos]);

  // Refresh UTxOs from wallet (enhanced version)
  const refreshUtxos = useCallback(async (): Promise<void> => {
    console.log('🔄 Enhanced refreshUtxos called:', { isConnected, api: !!api });
    
    if (!isConnected || !api) {
      console.log('❌ Wallet not connected, resetting state');
      setState(prev => ({ 
        ...prev, 
        error: 'Wallet not connected',
        utxos: [],
        selectedUtxos: [],
        totalAda: BigInt(0),
        totalAssets: [],
        isLoading: false,
      }));
      return;
    }

    console.log('📡 Starting enhanced UTxO fetch...');
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Get UTxOs and change address in parallel
      const [cborUtxos, changeAddr] = await Promise.all([
        api.getUtxos(),
        api.getChangeAddress(),
      ]);

      console.log('📦 Raw UTxO data:', { 
        cborUtxosLength: cborUtxos.length, 
        changeAddr,
      });

      // Parse CBOR UTxOs
      const parsedUtxos = await parseUtxoCbor(cborUtxos);
      console.log('✅ Parsed UTxOs:', { count: parsedUtxos.length });
      
      // Calculate totals
      const { totalAda, totalAssets } = calculateTotals(parsedUtxos);

      setState(prev => ({
        ...prev,
        utxos: parsedUtxos,
        totalAda,
        totalAssets,
        changeAddress: changeAddr,
        isLoading: false,
        error: null,
        lastRefresh: new Date(),
        // Clear selection if UTxOs changed (unless coin control is enabled)
        selectedUtxos: prev.coinControlEnabled ? 
          // Keep selection but filter out UTxOs that no longer exist
          prev.selectedUtxos.filter(selected =>
            parsedUtxos.some(utxo => 
              utxo.txHash === selected.txHash && utxo.outputIndex === selected.outputIndex
            )
          ) : [],
      }));

      console.log('✅ Enhanced UTxO state updated successfully');

    } catch (error: unknown) {
      console.error('❌ Failed to fetch UTxOs:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: (error as Error).message || 'Failed to fetch UTxOs',
      }));
    }
  }, [isConnected, api]);

  // Select a single UTxO
  const selectUtxo = useCallback((utxo: UTxO): void => {
    setState(prev => {
      const isAlreadySelected = prev.selectedUtxos.some(
        selected => selected.txHash === utxo.txHash && selected.outputIndex === utxo.outputIndex
      );
      
      if (isAlreadySelected) return prev;

      return {
        ...prev,
        selectedUtxos: [...prev.selectedUtxos, utxo],
      };
    });
  }, []);

  // Deselect a single UTxO
  const deselectUtxo = useCallback((utxo: UTxO): void => {
    setState(prev => ({
      ...prev,
      selectedUtxos: prev.selectedUtxos.filter(
        selected => !(selected.txHash === utxo.txHash && selected.outputIndex === utxo.outputIndex)
      ),
    }));
  }, []);

  // Select multiple UTxOs
  const selectUtxos = useCallback((utxos: UTxO[]): void => {
    setState(prev => {
      // Merge with existing selection, avoiding duplicates
      const merged = [...prev.selectedUtxos];
      utxos.forEach(utxo => {
        const exists = merged.some(u => u.txHash === utxo.txHash && u.outputIndex === utxo.outputIndex);
        if (!exists) {
          merged.push(utxo);
        }
      });
      return { ...prev, selectedUtxos: merged };
    });
  }, []);

  // Clear all selections
  const clearSelection = useCallback((): void => {
    setState(prev => ({ ...prev, selectedUtxos: [] }));
  }, []);

  // Select all UTxOs
  const selectAllUtxos = useCallback((): void => {
    setState(prev => ({ ...prev, selectedUtxos: [...prev.utxos] }));
  }, []);

  // Auto-select UTxOs using specified strategy
  const autoSelectForAmount = useCallback((requiredLovelace: bigint, strategyName?: string): boolean => {
    const strategy = SELECTION_STRATEGIES.find(s => s.name === (strategyName || state.defaultStrategy));
    if (!strategy) {
      console.error('Unknown strategy:', strategyName);
      return false;
    }

    const availableUtxos = state.utxos.filter(utxo => 
      !state.selectedUtxos.some(selected => 
        selected.txHash === utxo.txHash && selected.outputIndex === utxo.outputIndex
      )
    );

    const newSelection = strategy.algorithm(availableUtxos, requiredLovelace);
    const totalSelected = newSelection.reduce((sum, utxo) => sum + BigInt(utxo.amount.coin), BigInt(0));

    if (totalSelected >= requiredLovelace) {
      selectUtxos(newSelection);
      return true;
    }

    return false;
  }, [state.utxos, state.selectedUtxos, state.defaultStrategy, selectUtxos]);

  // Smart auto-select that tries multiple strategies
  const autoSelectOptimal = useCallback((requiredLovelace: bigint): boolean => {
    const strategies = ['ada_only_priority', 'branch_and_bound', 'largest_first'];
    
    for (const strategyName of strategies) {
      if (autoSelectForAmount(requiredLovelace, strategyName)) {
        return true;
      }
    }
    
    return false;
  }, [autoSelectForAmount]);

  // Get total of selected UTxOs
  const getSelectedTotal = useCallback((): bigint => {
    return state.selectedUtxos.reduce((total, utxo) => {
      return total + BigInt(utxo.amount.coin);
    }, BigInt(0));
  }, [state.selectedUtxos]);

  // Get analytics for selected UTxOs
  const getSelectedAnalytics = useCallback((): UTxOAnalytics => {
    return selectedAnalytics;
  }, [selectedAnalytics]);

  // Get analytics for all UTxOs
  const getUtxoAnalytics = useCallback((): UTxOAnalytics => {
    return utxoAnalytics;
  }, [utxoAnalytics]);

  // Check if a UTxO is selected
  const isUtxoSelected = useCallback((utxo: UTxO): boolean => {
    return state.selectedUtxos.some(
      selected => selected.txHash === utxo.txHash && selected.outputIndex === utxo.outputIndex
    );
  }, [state.selectedUtxos]);

  // Check if selection is sufficient for target amount
  const checkSelectionSufficient = useCallback((targetAmount: bigint, estimatedFee: bigint = BigInt(200_000)): boolean => {
    return isSelectionSufficient(state.selectedUtxos, targetAmount, estimatedFee);
  }, [state.selectedUtxos]);

  // Get filtered UTxOs
  const getFilteredUtxos = useCallback((filter: UTxOFilter): UTxO[] => {
    return filterUtxos(state.utxos, filter);
  }, [state.utxos]);

  // Set coin control enabled
  const setCoinControlEnabled = useCallback((enabled: boolean): void => {
    setState(prev => ({ ...prev, coinControlEnabled: enabled }));
  }, []);

  // Set default selection strategy
  const setDefaultStrategy = useCallback((strategy: string): void => {
    if (SELECTION_STRATEGIES.some(s => s.name === strategy)) {
      setState(prev => ({ ...prev, defaultStrategy: strategy }));
    }
  }, []);

  // Auto-refresh UTxOs when wallet connects
  useEffect(() => {
    if (isConnected && api) {
      console.log('🔄 Starting enhanced UTxO refresh...');
      refreshUtxos().catch(error => {
        console.error('❌ Enhanced UTxO refresh failed:', error);
      });
    }
  }, [isConnected, api, refreshUtxos]);

  return {
    ...state,
    // Basic operations
    refreshUtxos,
    selectUtxo,
    deselectUtxo,
    selectUtxos,
    clearSelection,
    selectAllUtxos,
    
    // Advanced selection
    autoSelectForAmount,
    autoSelectOptimal,
    
    // Analytics and utilities
    getSelectedTotal,
    getSelectedAnalytics,
    getUtxoAnalytics,
    isUtxoSelected,
    isSelectionSufficient: checkSelectionSufficient,
    
    // Filtering and sorting
    getFilteredUtxos,
    
    // Coin control settings
    setCoinControlEnabled,
    setDefaultStrategy,
  };
};