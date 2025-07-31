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
  metadata?: Record<string, unknown>;
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
  [],
  [],
  TransactionSlice
> = (set, _get) => ({ // eslint-disable-line @typescript-eslint/no-unused-vars
  transaction: initialTransactionState,

  setTransaction: (transaction: TransactionData) => {
    set((state) => ({
      ...state,
      transaction: {
        ...state.transaction,
        current: transaction,
        status: 'building',
        error: null,
        txHash: null,
      },
    }));
  },

  updateTransactionStatus: (status: TransactionState['status'], error?: string) => {
    set((state) => ({
      ...state,
      transaction: {
        ...state.transaction,
        status: status,
        error: error || (status !== 'failed' ? null : state.transaction.error),
      },
    }));
  },

  setTransactionHash: (txHash: string) => {
    set((state) => ({
      ...state,
      transaction: {
        ...state.transaction,
        txHash: txHash,
        status: state.transaction.status === 'submitting' ? 'completed' : state.transaction.status,
      },
    }));
  },

  clearTransaction: () => {
    set((state) => ({
      ...state,
      transaction: {
        ...state.transaction,
        current: null,
        status: 'idle',
        error: null,
        txHash: null,
        estimatedFee: BigInt(170_000),
      },
    }));
  },

  addTransactionToHistory: (transaction: TransactionData, txHash: string) => {
    set((state) => {
      const historyEntry = {
        ...transaction,
        txHash,
        status: 'pending' as const,
        submittedAt: new Date().toISOString(),
      };
      
      const newHistory = [historyEntry, ...state.transaction.history];
      
      return {
        ...state,
        transaction: {
          ...state.transaction,
          history: newHistory.length > 50 ? newHistory.slice(0, 50) : newHistory,
        },
      };
    });
  },

  estimateFee: async (transaction: Partial<TransactionData>) => {
    set((state) => ({
      ...state,
      transaction: {
        ...state.transaction,
        isEstimating: true,
      },
    }));

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

      set((state) => ({
        ...state,
        transaction: {
          ...state.transaction,
          estimatedFee: estimatedFee,
          isEstimating: false,
        },
      }));

    } catch (error: unknown) {
      console.error('Fee estimation failed:', error);
      
      set((state) => ({
        ...state,
        transaction: {
          ...state.transaction,
          isEstimating: false,
          // Use default fee on estimation failure
          estimatedFee: BigInt(170_000),
        },
      }));
    }
  },

  setEstimatedFee: (fee: bigint) => {
    set((state) => ({
      ...state,
      transaction: {
        ...state.transaction,
        estimatedFee: fee,
      },
    }));
  },

  updateHistoryStatus: (txHash: string, status: 'pending' | 'confirmed' | 'failed') => {
    set((state) => ({
      ...state,
      transaction: {
        ...state.transaction,
        history: state.transaction.history.map(tx => 
          tx.txHash === txHash 
            ? {
                ...tx,
                status: status,
                confirmedAt: status === 'confirmed' && !tx.confirmedAt 
                  ? new Date().toISOString() 
                  : tx.confirmedAt
              }
            : tx
        ),
      },
    }));
  },
});