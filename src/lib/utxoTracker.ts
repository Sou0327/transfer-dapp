/**
 * UTxO Tracker for Transaction Builder Integration
 * Tracks selected UTxOs for monitoring purposes
 */


export interface TrackedUTxO {
  txHash: string;
  outputIndex: number;
  address: string;
  amount: string;
  assets: {
    policyId: string;
    assetName: string;
    amount: string;
  }[];
}

export interface UTxOSelectionResult {
  selected_utxos: TrackedUTxO[];
  total_input_value: string;
  change_amount: string;
  fee_paid: string;
  selection_strategy: 'greedy' | 'random' | 'manual';
}

/**
 * Convert CSL UTxOs to trackable format
 */
export function convertUTxOsForTracking(
  utxos: Array<{
    txHash?: string;
    tx_hash?: string;
    outputIndex?: number;
    output_index?: number;
    amount: unknown;
    address: string;
  }>, 
  selectionStrategy: 'greedy' | 'random' | 'manual' = 'greedy' // eslint-disable-line @typescript-eslint/no-unused-vars
): TrackedUTxO[] {
  return utxos.map(utxo => ({
    txHash: utxo.txHash || utxo.tx_hash,
    outputIndex: utxo.outputIndex || utxo.output_index,
    address: utxo.address,
    amount: utxo.amount,
    assets: utxo.assets || []
  }));
}

/**
 * Create UTxO selection metadata for monitoring
 */
export function createUTxOSelectionMetadata(
  selectedUtxos: TrackedUTxO[],
  totalInputValue: bigint,
  changeAmount: bigint,
  feePaid: bigint,
  strategy: 'greedy' | 'random' | 'manual'
): UTxOSelectionResult {
  return {
    selected_utxos: selectedUtxos,
    total_input_value: totalInputValue.toString(),
    change_amount: changeAmount.toString(),
    fee_paid: feePaid.toString(),
    selection_strategy: strategy
  };
}

/**
 * Extract UTxO information from transaction builder results
 */
export function extractUTxOsFromTransactionResult(
  txBuilderResult: Record<string, unknown>,
  selectedUtxos?: Array<{
    txHash: string;
    outputIndex: number;
    address: string;
    amount: unknown;
  }>
): UTxOSelectionResult | null {
  try {
    if (!txBuilderResult.success || !selectedUtxos) {
      return null;
    }

    const trackedUtxos = convertUTxOsForTracking(selectedUtxos);
    const summary = txBuilderResult.summary;

    return {
      selected_utxos: trackedUtxos,
      total_input_value: summary?.total_input_value || '0',
      change_amount: summary?.change_amount || '0',
      fee_paid: txBuilderResult.fee,
      selection_strategy: 'greedy' // Default assumption
    };

  } catch (error) {
    console.error('Failed to extract UTxO information:', error);
    return null;
  }
}

/**
 * Validate UTxO tracking data
 */
export function validateUTxOTrackingData(data: unknown): data is UTxOSelectionResult {
  if (!data || typeof data !== 'object') {
    return false;
  }

  if (!Array.isArray(data.selected_utxos)) {
    return false;
  }

  for (const utxo of data.selected_utxos) {
    if (!utxo.txHash || !utxo.address || typeof utxo.outputIndex !== 'number') {
      return false;
    }
  }

  return true;
}

/**
 * Get UTxO survival status from Blockfrost
 */
export async function checkUTxOExists(utxo: TrackedUTxO): Promise<boolean> {
  try {
    const blockfrostApiKey = process.env.BLOCKFROST_API_KEY;
    const networkPrefix = process.env.CARDANO_NETWORK === 'mainnet' ? '' : 'preprod-';
    
    if (!blockfrostApiKey) {
      console.warn('BLOCKFROST_API_KEY not configured');
      return true; // Assume exists if we can't check
    }

    const response = await fetch(
      `https://cardano-${networkPrefix}api.blockfrost.io/api/v0/txs/${utxo.txHash}/utxos`,
      {
        headers: {
          'project_id': blockfrostApiKey
        }
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return false; // Transaction/UTxO not found
      }
      throw new Error(`Blockfrost API error: ${response.status}`);
    }

    const txData = await response.json();
    const outputs = txData.outputs || [];
    
    // Check if our UTxO output exists
    return outputs.some((output: { address: string }, index: number) => 
      index === utxo.outputIndex && output.address === utxo.address
    );

  } catch (error) {
    console.warn(`Failed to check UTxO existence for ${utxo.txHash}#${utxo.outputIndex}:`, error);
    return true; // Assume exists on error to avoid false negatives
  }
}

/**
 * Batch check multiple UTxOs
 */
export async function batchCheckUTxOs(utxos: TrackedUTxO[]): Promise<{
  existing: TrackedUTxO[];
  consumed: TrackedUTxO[];
  errors: { utxo: TrackedUTxO; error: string }[];
}> {
  const existing: TrackedUTxO[] = [];
  const consumed: TrackedUTxO[] = [];
  const errors: { utxo: TrackedUTxO; error: string }[] = [];

  // Check UTxOs in parallel (with reasonable concurrency limit)
  const batchSize = 5;
  for (let i = 0; i < utxos.length; i += batchSize) {
    const batch = utxos.slice(i, i + batchSize);
    
    const results = await Promise.allSettled(
      batch.map(async utxo => ({
        utxo,
        exists: await checkUTxOExists(utxo)
      }))
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { utxo, exists } = result.value;
        if (exists) {
          existing.push(utxo);
        } else {
          consumed.push(utxo);
        }
      } else {
        // Find which UTxO failed
        const failedUtxo = batch.find(u => !existing.includes(u) && !consumed.includes(u));
        if (failedUtxo) {
          errors.push({
            utxo: failedUtxo,
            error: result.reason?.message || 'Unknown error'
          });
        }
      }
    }
  }

  return { existing, consumed, errors };
}

/**
 * Format UTxO for display/logging
 */
export function formatUTxOForDisplay(utxo: TrackedUTxO): string {
  const adaAmount = (parseInt(utxo.amount) / 1_000_000).toFixed(6);
  const assets = utxo.assets.length > 0 ? ` + ${utxo.assets.length} assets` : '';
  return `${utxo.txHash.substring(0, 8)}...#${utxo.outputIndex} (${adaAmount} ADA${assets})`;
}

/**
 * Calculate total ADA value from UTxOs
 */
export function calculateTotalADA(utxos: TrackedUTxO[]): number {
  return utxos.reduce((total, utxo) => total + parseInt(utxo.amount), 0) / 1_000_000;
}

/**
 * Group UTxOs by transaction
 */
export function groupUTxOsByTransaction(utxos: TrackedUTxO[]): Map<string, TrackedUTxO[]> {
  const grouped = new Map<string, TrackedUTxO[]>();
  
  for (const utxo of utxos) {
    if (!grouped.has(utxo.txHash)) {
      grouped.set(utxo.txHash, []);
    }
    grouped.get(utxo.txHash)!.push(utxo);
  }
  
  return grouped;
}