/**
 * Transaction State Slice
 * Manages transaction creation, signing, and history
 */

import { StateCreator } from 'zustand';

export interface TransactionData {
  id: string;
  type: 'transfer' | 'sweep';
  to: string;
  amount?: string;
  fee: string;
  inputs: Array<{
    txHash: string;
    outputIndex: number;
    amount: string;
  }>;
  outputs: Array<{
    address: string;
    amount: string;
  }>;
  metadata?: any;
  createdAt: string;
}

export interface TransactionState {
  current: TransactionData | null;
  status: 'idle' | 'building' | 'signing' | 'submitting' | 'completed' | 'failed';
  error: string | null;
  txHash: string | null;
  history: Array<TransactionData & { 
    txHash: string; 
    status: 'pending' | 'confirmed' | 'failed';
    submittedAt: string;
    confirmedAt?: string;
  }>;
  estimatedFee: bigint;
  isEstimating: boolean;
}

export interface TransactionActions {
  setTransaction: (transaction: TransactionData) => void;
  updateTransactionStatus: (status: TransactionState['status'], error?: string) => void;
  setTransactionHash: (txHash: string) => void;
  clearTransaction: () => void;
  addTransactionToHistory: (transaction: TransactionData, txHash: string) => void;
  estimateFee: (transaction: Partial<TransactionData>) => Promise<void>;
  setEstimatedFee: (fee: bigint) => void;
  updateHistoryStatus: (txHash: string, status: 'pending' | 'confirmed' | 'failed') => void;
}

export interface TransactionSlice {
  transaction: TransactionState;
  setTransaction: TransactionActions['setTransaction'];
  updateTransactionStatus: TransactionActions['updateTransactionStatus'];
  setTransactionHash: TransactionActions['setTransactionHash'];
  clearTransaction: TransactionActions['clearTransaction'];
  addTransactionToHistory: TransactionActions['addTransactionToHistory'];
  estimateFee: TransactionActions['estimateFee'];
  setEstimatedFee: TransactionActions['setEstimatedFee'];
  updateHistoryStatus: TransactionActions['updateHistoryStatus'];
}

const initialTransactionState: TransactionState = {
  current: null,
  status: 'idle',
  error: null,
  txHash: null,
  history: [],
  estimatedFee: BigInt(170_000), // Default 0.17 ADA
  isEstimating: false,
};

export const createTransactionSlice: StateCreator<
  TransactionSlice,
  [['zustand/immer', never], ['zustand/devtools', never]],
  [],
  TransactionSlice
> = (set, get) => ({
  transaction: initialTransactionState,

  setTransaction: (transaction: TransactionData) => {
    set((state) => {
      state.transaction.current = transaction;
      state.transaction.status = 'building';
      state.transaction.error = null;
      state.transaction.txHash = null;
    }, false, 'transaction/setTransaction');
  },

  updateTransactionStatus: (status: TransactionState['status'], error?: string) => {
    set((state) => {
      state.transaction.status = status;
      if (error) {
        state.transaction.error = error;
      } else if (status !== 'failed') {
        state.transaction.error = null;
      }
    }, false, 'transaction/updateStatus');
  },

  setTransactionHash: (txHash: string) => {
    set((state) => {
      state.transaction.txHash = txHash;
      if (state.transaction.status === 'submitting') {
        state.transaction.status = 'completed';
      }
    }, false, 'transaction/setTxHash');
  },

  clearTransaction: () => {
    set((state) => {
      state.transaction.current = null;
      state.transaction.status = 'idle';
      state.transaction.error = null;
      state.transaction.txHash = null;
      state.transaction.estimatedFee = BigInt(170_000);
    }, false, 'transaction/clear');
  },

  addTransactionToHistory: (transaction: TransactionData, txHash: string) => {
    set((state) => {
      const historyEntry = {
        ...transaction,
        txHash,
        status: 'pending' as const,
        submittedAt: new Date().toISOString(),
      };
      
      // Add to beginning of history
      state.transaction.history.unshift(historyEntry);
      
      // Keep only last 50 transactions
      if (state.transaction.history.length > 50) {
        state.transaction.history = state.transaction.history.slice(0, 50);
      }
    }, false, 'transaction/addToHistory');
  },

  estimateFee: async (transaction: Partial<TransactionData>) => {
    set((state) => {
      state.transaction.isEstimating = true;
    }, false, 'transaction/estimateStart');

    try {
      // Simplified fee estimation - in real implementation would use CSL
      const baseFeee = BigInt(155_381); // Base fee
      const byteFee = BigInt(44); // Per byte fee
      
      // Estimate transaction size based on inputs/outputs
      const inputCount = transaction.inputs?.length || 1;
      const outputCount = transaction.outputs?.length || 2; // Include change output
      
      // Rough estimation: 180 bytes per input, 34 bytes per output, 10 bytes overhead
      const estimatedSize = (inputCount * 180) + (outputCount * 34) + 10;
      const estimatedFee = baseFeee + (byteFee * BigInt(estimatedSize));

      set((state) => {
        state.transaction.estimatedFee = estimatedFee;
        state.transaction.isEstimating = false;
      }, false, 'transaction/estimateSuccess');

    } catch (error: any) {
      console.error('Fee estimation failed:', error);
      
      set((state) => {
        state.transaction.isEstimating = false;
        // Use default fee on estimation failure
        state.transaction.estimatedFee = BigInt(170_000);
      }, false, 'transaction/estimateError');
    }
  },

  setEstimatedFee: (fee: bigint) => {
    set((state) => {
      state.transaction.estimatedFee = fee;
    }, false, 'transaction/setEstimatedFee');
  },

  updateHistoryStatus: (txHash: string, status: 'pending' | 'confirmed' | 'failed') => {
    set((state) => {
      const entry = state.transaction.history.find(tx => tx.txHash === txHash);
      if (entry) {
        entry.status = status;
        if (status === 'confirmed' && !entry.confirmedAt) {
          entry.confirmedAt = new Date().toISOString();
        }
      }
    }, false, 'transaction/updateHistoryStatus');
  },
});