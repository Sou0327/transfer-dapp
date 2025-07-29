/**
 * UTxO Selection and Coin Control Utilities
 * Provides advanced UTxO selection algorithms for optimal transaction building
 */

import { UTxO, AssetBalance } from '../types/cardano';

export interface UTxOSelectionStrategy {
  name: string;
  description: string;
  algorithm: (utxos: UTxO[], targetAmount: bigint, excludeUtxos?: UTxO[]) => UTxO[];
}

export interface UTxOFilter {
  adaOnly: boolean;
  minAmount?: bigint;
  maxAmount?: bigint;
  hasAssets: boolean | null; // null = any, true = only with assets, false = only without assets
  addressFilter?: string;
  sortBy: 'amount_desc' | 'amount_asc' | 'age_desc' | 'age_asc' | 'mixed_first';
}

export interface UTxOAnalytics {
  totalUtxos: number;
  totalAda: bigint;
  totalAssets: AssetBalance[];
  adaOnlyUtxos: number;
  utxosWithAssets: number;
  largestUtxo: UTxO | null;
  smallestUtxo: UTxO | null;
  averageAmount: bigint;
  distribution: {
    small: number;  // < 1 ADA
    medium: number; // 1-10 ADA
    large: number;  // 10-100 ADA
    huge: number;   // > 100 ADA
  };
}

/**
 * Check if UTxO contains only ADA (no native tokens)
 */
export const isAdaOnlyUtxo = (utxo: UTxO): boolean => {
  return !utxo.amount.multiasset || Object.keys(utxo.amount.multiasset).length === 0;
};

/**
 * Check if UTxO has any native tokens
 */
export const hasNativeTokens = (utxo: UTxO): boolean => {
  return !isAdaOnlyUtxo(utxo);
};

/**
 * Get total asset count in UTxO
 */
export const getAssetCount = (utxo: UTxO): number => {
  if (!utxo.amount.multiasset) return 0;
  
  return Object.values(utxo.amount.multiasset).reduce((count, assets) => {
    return count + Object.keys(assets).length;
  }, 0);
};

/**
 * Filter UTxOs based on criteria
 */
export const filterUtxos = (utxos: UTxO[], filter: UTxOFilter): UTxO[] => {
  let filtered = [...utxos];

  // ADA-only filter
  if (filter.adaOnly) {
    filtered = filtered.filter(isAdaOnlyUtxo);
  }

  // Asset filter
  if (filter.hasAssets === true) {
    filtered = filtered.filter(hasNativeTokens);
  } else if (filter.hasAssets === false) {
    filtered = filtered.filter(isAdaOnlyUtxo);
  }

  // Amount filters
  if (filter.minAmount !== undefined) {
    filtered = filtered.filter(utxo => BigInt(utxo.amount.coin) >= filter.minAmount!);
  }

  if (filter.maxAmount !== undefined) {
    filtered = filtered.filter(utxo => BigInt(utxo.amount.coin) <= filter.maxAmount!);
  }

  // Address filter
  if (filter.addressFilter) {
    const addressLower = filter.addressFilter.toLowerCase();
    filtered = filtered.filter(utxo => 
      utxo.address.toLowerCase().includes(addressLower)
    );
  }

  // Sort
  return sortUtxos(filtered, filter.sortBy);
};

/**
 * Sort UTxOs by various criteria
 */
export const sortUtxos = (utxos: UTxO[], sortBy: UTxOFilter['sortBy']): UTxO[] => {
  const sorted = [...utxos];

  switch (sortBy) {
    case 'amount_desc':
      return sorted.sort((a, b) => {
        const aAmount = BigInt(a.amount.coin);
        const bAmount = BigInt(b.amount.coin);
        return aAmount > bAmount ? -1 : aAmount < bAmount ? 1 : 0;
      });

    case 'amount_asc':
      return sorted.sort((a, b) => {
        const aAmount = BigInt(a.amount.coin);
        const bAmount = BigInt(b.amount.coin);
        return aAmount < bAmount ? -1 : aAmount > bAmount ? 1 : 0;
      });

    case 'age_desc':
      // Sort by transaction hash + output index (newer first)
      return sorted.sort((a, b) => 
        `${b.txHash}#${b.outputIndex}`.localeCompare(`${a.txHash}#${a.outputIndex}`)
      );

    case 'age_asc':
      // Sort by transaction hash + output index (older first)
      return sorted.sort((a, b) => 
        `${a.txHash}#${a.outputIndex}`.localeCompare(`${b.txHash}#${b.outputIndex}`)
      );

    case 'mixed_first':
      // UTxOs with assets first, then ADA-only, sorted by amount desc within each group
      return sorted.sort((a, b) => {
        const aHasAssets = hasNativeTokens(a);
        const bHasAssets = hasNativeTokens(b);
        
        if (aHasAssets && !bHasAssets) return -1;
        if (!aHasAssets && bHasAssets) return 1;
        
        // Within same group, sort by amount desc
        const aAmount = BigInt(a.amount.coin);
        const bAmount = BigInt(b.amount.coin);
        return aAmount > bAmount ? -1 : aAmount < bAmount ? 1 : 0;
      });

    default:
      return sorted;
  }
};

/**
 * ADA-Only Priority Selection Strategy
 * Prioritizes UTxOs that contain only ADA for cleaner transactions
 */
export const adaOnlyPrioritySelection = (
  utxos: UTxO[], 
  targetAmount: bigint, 
  excludeUtxos: UTxO[] = []
): UTxO[] => {
  const available = utxos.filter(utxo => 
    !excludeUtxos.some(excluded => 
      excluded.txHash === utxo.txHash && excluded.outputIndex === utxo.outputIndex
    )
  );

  // Separate ADA-only and mixed UTxOs
  const adaOnlyUtxos = available.filter(isAdaOnlyUtxo);
  const mixedUtxos = available.filter(hasNativeTokens);

  // Sort both groups by amount (largest first for efficiency)
  const sortedAdaOnly = sortUtxos(adaOnlyUtxos, 'amount_desc');
  const sortedMixed = sortUtxos(mixedUtxos, 'amount_desc');

  const selected: UTxO[] = [];
  let selectedAmount = BigInt(0);

  // First, try to satisfy with ADA-only UTxOs
  for (const utxo of sortedAdaOnly) {
    if (selectedAmount >= targetAmount) break;
    
    selected.push(utxo);
    selectedAmount += BigInt(utxo.amount.coin);
  }

  // If still not enough, add mixed UTxOs
  if (selectedAmount < targetAmount) {
    for (const utxo of sortedMixed) {
      if (selectedAmount >= targetAmount) break;
      
      selected.push(utxo);
      selectedAmount += BigInt(utxo.amount.coin);
    }
  }

  return selected;
};

/**
 * Largest First Selection Strategy
 * Selects largest UTxOs first to minimize transaction size
 */
export const largestFirstSelection = (
  utxos: UTxO[], 
  targetAmount: bigint, 
  excludeUtxos: UTxO[] = []
): UTxO[] => {
  const available = utxos.filter(utxo => 
    !excludeUtxos.some(excluded => 
      excluded.txHash === utxo.txHash && excluded.outputIndex === utxo.outputIndex
    )
  );

  const sorted = sortUtxos(available, 'amount_desc');
  const selected: UTxO[] = [];
  let selectedAmount = BigInt(0);

  for (const utxo of sorted) {
    if (selectedAmount >= targetAmount) break;
    
    selected.push(utxo);
    selectedAmount += BigInt(utxo.amount.coin);
  }

  return selected;
};

/**
 * Smallest First Selection Strategy
 * Selects smallest UTxOs first to consolidate dust
 */
export const smallestFirstSelection = (
  utxos: UTxO[], 
  targetAmount: bigint, 
  excludeUtxos: UTxO[] = []
): UTxO[] => {
  const available = utxos.filter(utxo => 
    !excludeUtxos.some(excluded => 
      excluded.txHash === utxo.txHash && excluded.outputIndex === utxo.outputIndex
    )
  );

  const sorted = sortUtxos(available, 'amount_asc');
  const selected: UTxO[] = [];
  let selectedAmount = BigInt(0);

  for (const utxo of sorted) {
    if (selectedAmount >= targetAmount) break;
    
    selected.push(utxo);
    selectedAmount += BigInt(utxo.amount.coin);
  }

  return selected;
};

/**
 * Branch and Bound Selection Strategy
 * Attempts to find exact or near-exact matches to minimize change
 */
export const branchAndBoundSelection = (
  utxos: UTxO[], 
  targetAmount: bigint, 
  excludeUtxos: UTxO[] = []
): UTxO[] => {
  const available = utxos.filter(utxo => 
    !excludeUtxos.some(excluded => 
      excluded.txHash === utxo.txHash && excluded.outputIndex === utxo.outputIndex
    )
  );

  // For large sets, limit to avoid performance issues
  const maxUtxos = Math.min(available.length, 20);
  const candidates = sortUtxos(available, 'amount_desc').slice(0, maxUtxos);

  let bestSelection: UTxO[] = [];
  let bestWaste = BigInt(Number.MAX_SAFE_INTEGER);

  // Try all combinations (up to reasonable limit)
  const maxCombinations = Math.min(Math.pow(2, candidates.length), 1000);
  
  for (let i = 1; i < maxCombinations; i++) {
    const selection: UTxO[] = [];
    let totalAmount = BigInt(0);

    for (let j = 0; j < candidates.length; j++) {
      if (i & (1 << j)) {
        selection.push(candidates[j]);
        totalAmount += BigInt(candidates[j].amount.coin);
      }
    }

    if (totalAmount >= targetAmount) {
      const waste = totalAmount - targetAmount;
      if (waste < bestWaste) {
        bestWaste = waste;
        bestSelection = selection;
        
        // Perfect match found
        if (waste === BigInt(0)) break;
      }
    }
  }

  // Fallback to largest first if no valid combination found
  if (bestSelection.length === 0) {
    return largestFirstSelection(utxos, targetAmount, excludeUtxos);
  }

  return bestSelection;
};

/**
 * Available selection strategies
 */
export const SELECTION_STRATEGIES: UTxOSelectionStrategy[] = [
  {
    name: 'ada_only_priority',
    description: 'ADA専用UTxOを優先選択（推奨）',
    algorithm: adaOnlyPrioritySelection,
  },
  {
    name: 'largest_first',
    description: '大きいUTxOから順番に選択',
    algorithm: largestFirstSelection,
  },
  {
    name: 'smallest_first',
    description: '小さいUTxOから順番に選択（ダスト整理）',
    algorithm: smallestFirstSelection,
  },
  {
    name: 'branch_and_bound',
    description: '最適化選択（お釣り最小化）',
    algorithm: branchAndBoundSelection,
  },
];

/**
 * Analyze UTxO set and provide statistics
 */
export const analyzeUtxos = (utxos: UTxO[]): UTxOAnalytics => {
  if (utxos.length === 0) {
    return {
      totalUtxos: 0,
      totalAda: BigInt(0),
      totalAssets: [],
      adaOnlyUtxos: 0,
      utxosWithAssets: 0,
      largestUtxo: null,
      smallestUtxo: null,
      averageAmount: BigInt(0),
      distribution: { small: 0, medium: 0, large: 0, huge: 0 },
    };
  }

  const totalAda = utxos.reduce((sum, utxo) => sum + BigInt(utxo.amount.coin), BigInt(0));
  const adaOnlyUtxos = utxos.filter(isAdaOnlyUtxo).length;
  const utxosWithAssets = utxos.length - adaOnlyUtxos;

  // Calculate assets
  const assetMap = new Map<string, bigint>();
  utxos.forEach(utxo => {
    if (utxo.amount.multiasset) {
      Object.entries(utxo.amount.multiasset).forEach(([policyId, assets]) => {
        Object.entries(assets).forEach(([assetName, quantity]) => {
          const assetId = `${policyId}.${assetName}`;
          const current = assetMap.get(assetId) || BigInt(0);
          assetMap.set(assetId, current + BigInt(quantity));
        });
      });
    }
  });

  const totalAssets: AssetBalance[] = Array.from(assetMap.entries()).map(
    ([assetId, quantity]) => {
      const [policyId, assetName] = assetId.split('.');
      return { policyId, assetName, quantity: quantity.toString() };
    }
  );

  // Find largest and smallest
  const sorted = sortUtxos(utxos, 'amount_desc');
  const largestUtxo = sorted[0] || null;
  const smallestUtxo = sorted[sorted.length - 1] || null;

  // Calculate average
  const averageAmount = totalAda / BigInt(utxos.length);

  // Distribution analysis
  const distribution = { small: 0, medium: 0, large: 0, huge: 0 };
  const ADA = BigInt(1_000_000); // 1 ADA in lovelace

  utxos.forEach(utxo => {
    const amount = BigInt(utxo.amount.coin);
    if (amount < ADA) {
      distribution.small++;
    } else if (amount < ADA * 10n) {
      distribution.medium++;
    } else if (amount < ADA * 100n) {
      distribution.large++;
    } else {
      distribution.huge++;
    }
  });

  return {
    totalUtxos: utxos.length,
    totalAda,
    totalAssets,
    adaOnlyUtxos,
    utxosWithAssets,
    largestUtxo,
    smallestUtxo,
    averageAmount,
    distribution,
  };
};

/**
 * Estimate optimal UTxO count for a transaction
 */
export const estimateOptimalUtxoCount = (targetAmount: bigint, averageUtxoSize: bigint): number => {
  if (averageUtxoSize <= BigInt(0)) return 1;
  
  const estimated = Number(targetAmount / averageUtxoSize);
  // Add buffer and reasonable limits
  return Math.max(1, Math.min(Math.ceil(estimated * 1.2), 50));
};

/**
 * Check if UTxO selection is sufficient for target amount plus estimated fees
 */
export const isSelectionSufficient = (
  selectedUtxos: UTxO[], 
  targetAmount: bigint, 
  estimatedFee: bigint = BigInt(200_000) // 0.2 ADA default estimate
): boolean => {
  const totalSelected = selectedUtxos.reduce(
    (sum, utxo) => sum + BigInt(utxo.amount.coin), 
    BigInt(0)
  );
  
  return totalSelected >= targetAmount + estimatedFee;
};