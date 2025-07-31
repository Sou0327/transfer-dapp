/**
 * UTxO State Slice
 * Manages UTxO data, selection, and coin control
 */

import { StateCreator } from 'zustand';
import { Buffer } from 'buffer';
import { UTxO, AssetBalance, CIP30Api } from '../../types/cardano';

// Buffer polyfill for browser
window.Buffer = Buffer;

/**
 * Combined store state interface for accessing wallet slice
 */
interface CombinedStore {
  wallet: {
    isConnected: boolean;
    api: CIP30Api | null;
  };
}

export interface UtxoState {
  utxos: UTxO[];
  selectedUtxos: UTxO[];
  totalAda: bigint;
  totalAssets: AssetBalance[];
  isLoading: boolean;
  error: string | null;
  changeAddress: string | null;
  lastRefresh: string | null;
  selectionStrategy: 'largest' | 'smallest' | 'random' | 'optimal';
}

export interface UtxoActions {
  setUtxos: (utxos: UTxO[]) => void;
  selectUtxo: (utxo: UTxO) => void;
  deselectUtxo: (utxo: UTxO) => void;
  clearUtxoSelection: () => void;
  autoSelectForAmount: (requiredLovelace: bigint) => boolean;
  refreshUtxos: () => Promise<void>;
  setUtxoError: (error: string | null) => void;
  setUtxoLoading: (loading: boolean) => void;
  updateSelectionStrategy: (strategy: UtxoState['selectionStrategy']) => void;
  _calculateTotals: () => void;
}

export interface UtxoSlice {
  utxo: UtxoState;
  setUtxos: UtxoActions['setUtxos'];
  selectUtxo: UtxoActions['selectUtxo'];
  deselectUtxo: UtxoActions['deselectUtxo'];
  clearUtxoSelection: UtxoActions['clearUtxoSelection'];
  autoSelectForAmount: UtxoActions['autoSelectForAmount'];
  refreshUtxos: UtxoActions['refreshUtxos'];
  setUtxoError: UtxoActions['setUtxoError'];
  setUtxoLoading: UtxoActions['setUtxoLoading'];
  updateSelectionStrategy: UtxoActions['updateSelectionStrategy'];
  _calculateTotals: UtxoActions['_calculateTotals'];
}

const initialUtxoState: UtxoState = {
  utxos: [],
  selectedUtxos: [],
  totalAda: BigInt(0),
  totalAssets: [],
  isLoading: false,
  error: null,
  changeAddress: null,
  lastRefresh: null,
  selectionStrategy: 'largest',
};

// Helper function to parse CBOR UTxO data
const parseUtxoCbor = async (cborUtxos: string[]): Promise<UTxO[]> => {
  console.log('🔧 parseUtxoCbor called with:', cborUtxos.length, 'UTxOs');
  
  const wasm = await import('@emurgo/cardano-serialization-lib-browser');
  const CSL = wasm.default || wasm;
  
  return cborUtxos.map((cborHex, index) => {
    try {
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

// Helper function to calculate total ADA and assets
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

export const createUtxoSlice: StateCreator<
  UtxoSlice,
  [],
  [],
  UtxoSlice
> = (set, get) => ({
  utxo: initialUtxoState,

  setUtxos: (utxos: UTxO[]) => {
    set((state) => ({
      ...state,
      utxo: {
        ...state.utxo,
        utxos: utxos,
        selectedUtxos: [], // Clear selection when UTxOs change
      },
    }));
    
    // Recalculate totals after setting UTxOs
    get()._calculateTotals();
  },

  selectUtxo: (utxo: UTxO) => {
    set((state) => {
      const isAlreadySelected = state.utxo.selectedUtxos.some(
        selected => selected.txHash === utxo.txHash && selected.outputIndex === utxo.outputIndex
      );
      
      if (!isAlreadySelected) {
        return {
          ...state,
          utxo: {
            ...state.utxo,
            selectedUtxos: [...state.utxo.selectedUtxos, utxo],
          },
        };
      }
      return state;
    });
  },

  deselectUtxo: (utxo: UTxO) => {
    set((state) => ({
      ...state,
      utxo: {
        ...state.utxo,
        selectedUtxos: state.utxo.selectedUtxos.filter(
          selected => !(selected.txHash === utxo.txHash && selected.outputIndex === utxo.outputIndex)
        ),
      },
    }));
  },

  clearUtxoSelection: () => {
    set((state) => ({
      ...state,
      utxo: {
        ...state.utxo,
        selectedUtxos: [],
      },
    }));
  },

  autoSelectForAmount: (requiredLovelace: bigint): boolean => {
    const { utxo } = get();
    
    const availableUtxos = utxo.utxos.filter(utxoItem => 
      !utxo.selectedUtxos.some(selected => 
        selected.txHash === utxoItem.txHash && selected.outputIndex === utxoItem.outputIndex
      )
    );

    // Sort UTxOs based on selection strategy
    let sortedUtxos: UTxO[];
    switch (utxo.selectionStrategy) {
      case 'largest':
        sortedUtxos = [...availableUtxos].sort((a, b) => {
          const aAmount = BigInt(a.amount.coin);
          const bAmount = BigInt(b.amount.coin);
          return aAmount > bAmount ? -1 : aAmount < bAmount ? 1 : 0;
        });
        break;
      case 'smallest':
        sortedUtxos = [...availableUtxos].sort((a, b) => {
          const aAmount = BigInt(a.amount.coin);
          const bAmount = BigInt(b.amount.coin);
          return aAmount < bAmount ? -1 : aAmount > bAmount ? 1 : 0;
        });
        break;
      case 'random':
        sortedUtxos = [...availableUtxos].sort(() => Math.random() - 0.5);
        break;
      case 'optimal':
      default:
        // Greedy algorithm for optimal selection
        sortedUtxos = [...availableUtxos].sort((a, b) => {
          const aAmount = BigInt(a.amount.coin);
          const bAmount = BigInt(b.amount.coin);
          return aAmount > bAmount ? -1 : aAmount < bAmount ? 1 : 0;
        });
        break;
    }

    let selectedAmount = BigInt(0);
    const newSelection: UTxO[] = [];

    // Selection algorithm
    for (const utxo of sortedUtxos) {
      if (selectedAmount >= requiredLovelace) break;
      
      newSelection.push(utxo);
      selectedAmount += BigInt(utxo.amount.coin);
    }

    // Check if we have enough
    if (selectedAmount >= requiredLovelace) {
      set((state) => ({
        ...state,
        utxo: {
          ...state.utxo,
          selectedUtxos: [...state.utxo.selectedUtxos, ...newSelection],
        },
      }));
      return true;
    }

    return false; // Insufficient funds
  },

  refreshUtxos: async () => {
    const state = get();
    const wallet = (state as unknown as CombinedStore).wallet;
    
    if (!wallet?.isConnected || !wallet?.api) {
      set((state) => ({
        ...state,
        utxo: {
          ...state.utxo,
          error: 'Wallet not connected',
          utxos: [],
          selectedUtxos: [],
          totalAda: BigInt(0),
          totalAssets: [],
          isLoading: false,
        },
      }));
      return;
    }

    set((state) => ({
      ...state,
      utxo: {
        ...state.utxo,
        isLoading: true,
        error: null,
      },
    }));

    try {
      // Get UTxOs and change address in parallel
      const [cborUtxos, changeAddr] = await Promise.all([
        wallet.api.getUtxos(),
        wallet.api.getChangeAddress(),
      ]);

      // Parse CBOR UTxOs
      const parsedUtxos = await parseUtxoCbor(cborUtxos);
      
      // Calculate totals
      const { totalAda, totalAssets } = calculateTotals(parsedUtxos);

      set((state) => ({
        ...state,
        utxo: {
          ...state.utxo,
          utxos: parsedUtxos,
          totalAda: totalAda,
          totalAssets: totalAssets,
          changeAddress: changeAddr,
          isLoading: false,
          error: null,
          lastRefresh: new Date().toISOString(),
          // Clear selection when refreshing
          selectedUtxos: [],
        },
      }));

    } catch (error: unknown) {
      console.error('Failed to fetch UTxOs:', error);
      set((state) => ({
        ...state,
        utxo: {
          ...state.utxo,
          isLoading: false,
          error: (error instanceof Error ? error.message : String(error)) || 'Failed to fetch UTxOs',
        },
      }));
    }
  },

  setUtxoError: (error: string | null) => {
    set((state) => ({
      ...state,
      utxo: {
        ...state.utxo,
        error: error,
      },
    }));
  },

  setUtxoLoading: (loading: boolean) => {
    set((state) => ({
      ...state,
      utxo: {
        ...state.utxo,
        isLoading: loading,
      },
    }));
  },

  updateSelectionStrategy: (strategy: UtxoState['selectionStrategy']) => {
    set((state) => ({
      ...state,
      utxo: {
        ...state.utxo,
        selectionStrategy: strategy,
      },
    }));
  },

  _calculateTotals: () => {
    const { utxo } = get();
    const { totalAda, totalAssets } = calculateTotals(utxo.utxos);
    
    set((state) => ({
      ...state,
      utxo: {
        ...state.utxo,
        totalAda: totalAda,
        totalAssets: totalAssets,
      },
    }));
  },
});