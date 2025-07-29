import { ProtocolParams } from '../types/cardano';

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
        this.request<any>('/epochs/latest/parameters'),
        this.request<any>('/epochs/latest')
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
        currentSlot: latestEpoch.end_time || Date.now(),
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
      const latestBlock = await this.request<any>('/blocks/latest');
      return latestBlock.slot || 0;
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
      const utxo = await this.request<any>(`/txs/${txHash}/utxos`);
      const output = utxo.outputs.find((out: any) => out.output_index === outputIndex);
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
    } catch (error: any) {
      console.error('Transaction submission failed:', error);
      throw new Error(`Transaction submission failed: ${error.message || 'Unknown error'}`);
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
        this.request<any>(`/txs/${txHash}`),
        this.request<any>('/blocks/latest')
      ]);
      
      const confirmed = !!tx.block_height;
      const confirmations = confirmed ? 
        (latestBlock.height || 0) - (tx.block_height || 0) + 1 : 0;

      return {
        confirmed,
        blockHeight: tx.block_height || undefined,
        confirmations,
      };
    } catch (error: any) {
      if (error.message.includes('404')) {
        // Transaction not found - likely not yet propagated
        return { confirmed: false };
      }
      
      console.error(`Failed to get transaction status for ${txHash}:`, error);
      throw new Error(`Failed to get transaction status: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Get address UTxOs (alternative to wallet API)
   */
  async getAddressUtxos(address: string): Promise<any[]> {
    try {
      const utxos = await this.request<any[]>(`/addresses/${address}/utxos`);
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