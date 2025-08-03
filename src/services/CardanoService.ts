import { ProtocolParams } from '../types/cardano';

// Blockfrost API response types
interface BlockfrostProtocolParams {
  min_fee_a: string;
  min_fee_b: string; 
  max_tx_size: string;
  utxo_cost_per_word?: string;
  coins_per_utxo_word?: string;
  min_utxo?: string;
  pool_deposit?: string;
  key_deposit?: string;
  max_val_size?: string;
  max_tx_ex_mem?: string;
  max_tx_ex_steps?: string;
  collateral_percent?: string;
  max_collateral_inputs?: string;
  price_mem?: string;
  price_step?: string;
}

interface BlockfrostEpoch {
  epoch: number;
  start_time: number;
  end_time: number;
  first_block_time: number;
  last_block_time: number;
  block_count: number;
  tx_count: number;
  output: string;
  fees: string;
  active_stake?: string;
}

interface BlockfrostUtxo {
  tx_hash: string;
  tx_index: number;
  output_index: number;
  amount: Array<{
    unit: string;
    quantity: string;
  }>;
  block: string;
  data_hash?: string;
}

interface BlockfrostTransaction {
  hash: string;
  block: string;
  block_height: number;
  block_time: number;
  slot: number;
  index: number;
  output_amount: Array<{
    unit: string;
    quantity: string;
  }>;
  fees: string;
  deposit: string;
  size: number;
  invalid_before?: string;
  invalid_hereafter?: string;
  utxo_count: number;
  withdrawal_count: number;
  mir_cert_count: number;
  delegation_count: number;
  stake_cert_count: number;
  pool_update_count: number;
  pool_retire_count: number;
  asset_mint_or_burn_count: number;
  redeemer_count: number;
  valid_contract: boolean;
}

/**
 * Cardano network service using direct Blockfrost REST API
 */
export class CardanoService {
  private apiKey: string;
  private baseUrl: string;
  private protocolParamsCache: ProtocolParams | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.apiKey = import.meta.env.VITE_BLOCKFROST_API_KEY || 'mainnetELGceR3Gi1pF9aWpNKcfHLHiAUJ6g6a4';
    const network = import.meta.env.VITE_CARDANO_NETWORK || 'mainnet';
    
    if (!this.apiKey) {
      throw new Error('Blockfrost API key not configured');
    }

    this.baseUrl = network === 'mainnet' 
      ? 'https://cardano-mainnet.blockfrost.io/api/v0'
      : 'https://cardano-testnet.blockfrost.io/api/v0';
  }

  /**
   * Make authenticated request to Blockfrost API
   */
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'project_id': this.apiKey,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Blockfrost API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  /**
   * Get current protocol parameters
   */
  async getProtocolParameters(): Promise<ProtocolParams> {
    const now = Date.now();
    
    // Return cached params if still valid
    if (this.protocolParamsCache && (now - this.cacheTimestamp) < this.CACHE_DURATION) {
      return this.protocolParamsCache;
    }

    try {
      const [params, latestEpoch] = await Promise.all([
        this.request<BlockfrostProtocolParams>('/epochs/latest/parameters'),
        this.request<BlockfrostEpoch>('/epochs/latest')
      ]);
      
      this.protocolParamsCache = {
        minFeeA: Number(params.min_fee_a),
        minFeeB: Number(params.min_fee_b),
        maxTxSize: Number(params.max_tx_size),
        utxoCostPerWord: Number(params.utxo_cost_per_word || params.coins_per_utxo_word || 4310),
        minUtxo: params.min_utxo || '1000000',
        poolDeposit: params.pool_deposit || '500000000',
        keyDeposit: params.key_deposit || '2000000',
        maxValSize: Number(params.max_val_size || 5000),
        maxTxExMem: params.max_tx_ex_mem || '14000000',
        maxTxExSteps: params.max_tx_ex_steps || '10000000000',
        coinsPerUtxoWord: (params.coins_per_utxo_word || params.utxo_cost_per_word || 4310).toString(),
        collateralPercentage: Number(params.collateral_percent || 150),
        maxCollateralInputs: Number(params.max_collateral_inputs || 3),
        currentSlot: await this.getCurrentSlot(),
      };

      this.cacheTimestamp = now;
      return this.protocolParamsCache;

    } catch (error) {
      console.error('Failed to fetch protocol parameters:', error);
      throw new Error('Failed to fetch protocol parameters from Blockfrost');
    }
  }

  /**
   * Get current slot number
   */
  async getCurrentSlot(): Promise<number> {
    try {
      const latestBlock = await this.request<{ slot: number }>('/blocks/latest');
      if (!latestBlock.slot) {
      // Fallback calculation if API doesn't return slot
      const shelleyStart = 1596059091; // July 29, 2020 21:44:51 UTC
      const currentTime = Math.floor(Date.now() / 1000);
      const calculatedSlot = Math.max(0, currentTime - shelleyStart);
      console.log(`🕒 Frontend calculated current slot: ${calculatedSlot} (API slot was: ${latestBlock.slot})`);
      return calculatedSlot;
    }
    return latestBlock.slot;
    } catch (error) {
      console.error('Failed to get current slot:', error);
      throw new Error('Failed to get current slot from Blockfrost');
    }
  }

  /**
   * Check if UTxO exists and is unspent
   */
  async isUtxoAvailable(txHash: string, outputIndex: number): Promise<boolean> {
    try {
      const utxo = await this.request<{ outputs: Array<{ output_index: number; spent: boolean }> }>(`/txs/${txHash}/utxos`);
      const output = utxo.outputs.find((out) => out.output_index === outputIndex);
      return !!output && !output.spent;
    } catch (error) {
      console.error(`Failed to check UTxO ${txHash}#${outputIndex}:`, error);
      return false;
    }
  }

  /**
   * Monitor UTxOs for consumption
   */
  async monitorUtxos(utxoRefs: string[]): Promise<{ [key: string]: boolean }> {
    const results: { [key: string]: boolean } = {};
    
    await Promise.all(
      utxoRefs.map(async (utxoRef) => {
        const [txHash, indexStr] = utxoRef.split('#');
        const outputIndex = parseInt(indexStr, 10);
        
        if (txHash && !isNaN(outputIndex)) {
          results[utxoRef] = await this.isUtxoAvailable(txHash, outputIndex);
        } else {
          results[utxoRef] = false;
        }
      })
    );

    return results;
  }

  /**
   * Submit transaction
   */
  async submitTransaction(txCbor: string): Promise<string> {
    try {
      const result = await this.request<string>('/tx/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/cbor',
        },
        body: Buffer.from(txCbor, 'hex'),
      });
      return result;
    } catch (error: unknown) {
      console.error('Transaction submission failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Transaction submission failed: ${errorMessage}`);
    }
  }

  /**
   * Get transaction confirmation status
   */
  async getTransactionStatus(txHash: string): Promise<{
    confirmed: boolean;
    blockHeight?: number;
    confirmations?: number;
  }> {
    try {
      const [tx, latestBlock] = await Promise.all([
        this.request<BlockfrostTransaction>(`/txs/${txHash}`),
        this.request<{ height: number }>('/blocks/latest')
      ]);
      
      const confirmed = !!tx.block_height;
      const confirmations = confirmed ? 
        (latestBlock.height || 0) - (tx.block_height || 0) + 1 : 0;

      return {
        confirmed,
        blockHeight: tx.block_height || undefined,
        confirmations,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('404')) {
        // Transaction not found - likely not yet propagated
        return { confirmed: false };
      }
      
      console.error(`Failed to get transaction status for ${txHash}:`, error);
      throw new Error(`Failed to get transaction status: ${errorMessage}`);
    }
  }

  /**
   * Get address UTxOs (alternative to wallet API)
   */
  async getAddressUtxos(address: string): Promise<BlockfrostUtxo[]> {
    try {
      const utxos = await this.request<BlockfrostUtxo[]>(`/addresses/${address}/utxos`);
      return utxos;
    } catch (error) {
      console.error(`Failed to get UTxOs for address ${address}:`, error);
      throw new Error('Failed to get address UTxOs from Blockfrost');
    }
  }

  /**
   * Estimate transaction fee
   */
  async estimateTransactionFee(txSize: number): Promise<string> {
    try {
      const params = await this.getProtocolParameters();
      const fee = params.minFeeA + (params.minFeeB * txSize);
      return fee.toString();
    } catch (error) {
      console.error('Failed to estimate transaction fee:', error);
      throw new Error('Failed to estimate transaction fee');
    }
  }
}