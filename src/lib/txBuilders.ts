/**
 * Transaction Builders for OTC System
 * Supports FixedAmount, Sweep, and RateBased transaction modes
 */
import * as CSL from '@emurgo/cardano-serialization-lib-browser';
import { 
  CIP30Api, 
  UTxO, 
  ProtocolParams,
  FixedAmountRule,
  SweepRule,
  RateBasedRule,
  TransactionBuildResult
} from '../types/otc/index';
// Removed unused imports from utxoTracker

// Constants
const LOVELACE_PER_ADA = 1_000_000;
const MIN_UTXO_VALUE = 1_000_000; // 1 ADA minimum

const DEFAULT_TTL_OFFSET = 7200; // 2 hours in seconds

interface TxBuilderConfig {
  protocolParams: ProtocolParams;
  api: CIP30Api;
  changeAddress: string;
  destinationAddress: string;
  ttlOffset?: number;
  ttlSlot?: number; // TTL slot from request
}

interface UtxoSelection {
  selectedUtxos: UTxO[];
  totalValue: bigint;
  changeAmount: bigint;
  estimatedFee: bigint;
}

/**
 * Base Transaction Builder Class
 */
abstract class BaseTxBuilder {
  protected config: TxBuilderConfig;
  
  constructor(config: TxBuilderConfig) {
    this.config = config;
  }

  /**
   * Get all available UTxOs from wallet
   */
  protected async getWalletUtxos(): Promise<UTxO[]> {
    // Get UTxOs from wallet API
    const utxosHex = await this.config.api.getUtxos();
    
    if (!utxosHex || utxosHex.length === 0) {
      return [];
    }

    const utxos: UTxO[] = [];
    
    for (let i = 0; i < utxosHex.length; i++) {
      try {
        const utxoHex = utxosHex[i];
        const utxo = CSL.TransactionUnspentOutput.from_bytes(Buffer.from(utxoHex, 'hex'));
        const input = utxo.input();
        const output = utxo.output();
        
        const txHash = Buffer.from(input.transaction_id().to_bytes()).toString('hex');
        const outputIndex = input.index();
        const coin = output.amount().coin().to_str();
        
        // Handle assets
        const assets: { policy_id: string; asset_name: string; amount: string }[] = [];
        const multiAsset = output.amount().multiasset();
        
        if (multiAsset) {
          const policies = multiAsset.keys();
          for (let j = 0; j < policies.len(); j++) {
            const policyId = Buffer.from(policies.get(j).to_bytes()).toString('hex');
            const assets_for_policy = multiAsset.get(policies.get(j));
            
            if (assets_for_policy) {
              const assetNames = assets_for_policy.keys();
              for (let k = 0; k < assetNames.len(); k++) {
                const assetName = Buffer.from(assetNames.get(k).name()).toString('hex');
                const amount = assets_for_policy.get(assetNames.get(k))?.to_str() || '0';
                
                assets.push({
                  policy_id: policyId,
                  asset_name: assetName,
                  amount
                });
              }
            }
          }
        }

        utxos.push({
          txHash,
          outputIndex,
          amount: {
            coin,
            assets: assets.length > 0 ? assets : undefined
          },
          assets: assets.length > 0 ? assets : undefined
        });
      } catch (error) {
        console.error(`Error processing UTxO ${i}:`, error);
      }
    }

    return utxos;
  }

  /**
   * Calculate transaction fee
   */
  protected calculateFee(txSize: number): bigint {
    const { minFeeA, minFeeB } = this.config.protocolParams;
    return BigInt(minFeeA * txSize + minFeeB);
  }

  /**
   * Build transaction body
   */
  protected buildTxBody(inputs: any, outputs: any, currentSlot: any, fee?: bigint): any {
    // Set TTL - use request TTL slot if available, otherwise calculate from offset
    let ttl;
    if (this.config.ttlSlot) {
      // Use TTL slot from request
      ttl = CSL.BigNum.from_str(this.config.ttlSlot.toString());
      console.log('📅 Using TTL from request:', this.config.ttlSlot);
    } else {
      // Fallback to calculated TTL
      ttl = currentSlot.checked_add(
        CSL.BigNum.from_str((this.config.ttlOffset || DEFAULT_TTL_OFFSET).toString())
      );
      console.log('📅 Using calculated TTL with offset:', this.config.ttlOffset || DEFAULT_TTL_OFFSET);
    }

    // Calculate fee if not provided
    let txFee: any;
    if (fee) {
      txFee = CSL.BigNum.from_str(fee.toString());
    } else {
      // Estimate fee based on transaction size
      const estimatedSize = 180 + (inputs.len() * 70) + (outputs.len() * 40);
      const estimatedFee = this.calculateFee(estimatedSize);
      txFee = CSL.BigNum.from_str(estimatedFee.toString());
    }

    // Create transaction body
    const txBody = CSL.TransactionBody.new(
      inputs,
      outputs,
      txFee,
      ttl
    );

    return txBody;
  }

  /**
   * Create transaction output
   */
  protected createOutput(address: string, adaAmount: bigint, assets?: { policy_id: string; asset_name: string; amount: string }[]): any {
    // Parse address
    const addr = CSL.Address.from_bech32(address);

    // Create value
    const coin = CSL.BigNum.from_str(adaAmount.toString());
    const value = CSL.Value.new(coin);

    // Add assets if present
    if (assets && assets.length > 0) {
      const multiAsset = CSL.MultiAsset.new();
      
      for (const asset of assets) {
        const policyId = CSL.ScriptHash.from_bytes(Buffer.from(asset.policy_id, 'hex'));
        const assetName = CSL.AssetName.new(Buffer.from(asset.asset_name, 'hex'));
        const assetAmount = CSL.BigNum.from_str(asset.amount);
        
        let assetMap = multiAsset.get(policyId);
        if (!assetMap) {
          assetMap = CSL.Assets.new();
          multiAsset.insert(policyId, assetMap);
        }
        assetMap.insert(assetName, assetAmount);
      }
      
      value.set_multiasset(multiAsset);
    }

    return CSL.TransactionOutput.new(addr, value);
  }

  /**
   * Abstract method to build transaction
   */
  abstract buildTransaction(): Promise<TransactionBuildResult>;
}

/**
 * Fixed Amount Transaction Builder
 * Sends exactly the specified amount to destination
 */
export class FixedAmountTxBuilder extends BaseTxBuilder {
  private rule: FixedAmountRule;

  constructor(config: TxBuilderConfig, rule: FixedAmountRule) {
    super(config);
    this.rule = rule;
  }

  async buildTransaction(): Promise<TransactionBuildResult> {
    try {
      // Get available UTxOs
      const utxos = await this.getWalletUtxos();
      
      if (utxos.length === 0) {
        throw new Error('使用可能なUTxOがありません');
      }

      // Select UTxOs for the fixed amount
      const selection = await this.selectUtxosForAmount(utxos, BigInt(this.rule.amount));
      
      if (!selection) {
        throw new Error(`insufficient funds for ${this.rule.amount_lovelace} lovelace`);
      }

      // Build transaction
      const txResult = await this.buildFixedAmountTx(selection);
      
      return {
        success: true,
        txHex: txResult.txHex,
        txHash: txResult.txHash,
        fee: txResult.fee,
        ttl: parseInt(txResult.ttl),
        witnesses_required: selection.selectedUtxos?.length?.toString() || '0',
        summary: {
          inputs: selection.selectedUtxos?.length || 0,
          outputs: (selection.changeAmount || 0) > 0 ? 2 : 1,
          amount_sent: this.rule.amount.toString(),
          change_amount: (selection.changeAmount || 0).toString(),
          total_fee: txResult.fee
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Transaction build failed'
      };
    }
  }

  private async selectUtxosForAmount(utxos: UTxO[], targetAmount: bigint): Promise<UtxoSelection | null> {
    // Sort UTxOs by ADA amount (largest first for efficiency)
    const adaOnlyUtxos = utxos.filter(utxo => !utxo.assets || utxo.assets.length === 0);
    adaOnlyUtxos.sort((a, b) => Number(BigInt(b.amount.coin) - BigInt(a.amount.coin)));

    let totalSelected = BigInt(0);
    const selectedUtxos: UTxO[] = [];

    // Estimate fee (will refine later)
    let estimatedFee = this.calculateFee(250 * (selectedUtxos.length + 2)); // rough estimate

    const requiredAmount = targetAmount + estimatedFee;

    // Simple greedy selection
    for (const utxo of adaOnlyUtxos) {
      selectedUtxos.push(utxo);
      totalSelected += BigInt(utxo.amount.coin);

      // Recalculate fee with current input count
      estimatedFee = this.calculateFee(180 + (selectedUtxos.length * 70) + (2 * 40));

      if (totalSelected >= requiredAmount) {
        const changeAmount = totalSelected - targetAmount - estimatedFee;
        
        // Check if change is above minimum
        if (changeAmount > 0 && changeAmount < BigInt(MIN_UTXO_VALUE)) {
          // Add change to fee instead
          estimatedFee += changeAmount;
          return {
            selectedUtxos,
            totalValue: totalSelected,
            changeAmount: BigInt(0),
            estimatedFee
          };
        }

        return {
          selectedUtxos,
          totalValue: totalSelected,
          changeAmount,
          estimatedFee
        };
      }
    }

    return null; // Insufficient funds
  }

  private async buildFixedAmountTx(selection: UtxoSelection): Promise<{
    txHex: string;
    txHash: string;
    fee: string;
    ttl: string;
  }> {
    // Create inputs
    const inputs = CSL.TransactionInputs.new();
    
    for (const utxo of selection.selectedUtxos) {
      const input = CSL.TransactionInput.new(
        CSL.TransactionHash.from_bytes(Buffer.from(utxo.txHash, 'hex')),
        utxo.outputIndex
      );
      inputs.add(input);
    }

    // Create outputs
    const outputs = CSL.TransactionOutputs.new();
    
    // Destination output
    const destOutput = this.createOutput(
      this.config.destinationAddress,
      BigInt(this.rule.amount)
    );
    outputs.add(destOutput);

    // Change output (if necessary)
    if (selection.changeAmount > 0) {
      const changeOutput = this.createOutput(
        this.config.changeAddress,
        selection.changeAmount
      );
      outputs.add(changeOutput);
    }

    // Build transaction body
    const currentSlot = CSL.BigNum.from_str(this.config.protocolParams.currentSlot.toString());
    const txBody = this.buildTxBody(
      inputs,
      outputs,
      currentSlot
    );

    const txHash = Buffer.from(
      CSL.hash_transaction(txBody).to_bytes()
    ).toString('hex');

    const transaction = CSL.Transaction.new(
      txBody,
      CSL.TransactionWitnessSet.new(),
      undefined // auxiliary_data
    );

    return {
      txHex: Buffer.from(transaction.to_bytes()).toString('hex'),
      txHash,
      fee: selection.estimatedFee.toString(),
      ttl: currentSlot.checked_add(
        CSL.BigNum.from_str((this.config.ttlOffset || DEFAULT_TTL_OFFSET).toString())
      ).to_str()
    };
  }
}

/**
 * Sweep Transaction Builder
 * Sends all available ADA minus fees
 */
export class SweepTxBuilder extends BaseTxBuilder {
  private rule: SweepRule;

  constructor(config: TxBuilderConfig, rule: SweepRule) {
    super(config);
    this.rule = rule;
  }

  async buildTransaction(): Promise<TransactionBuildResult> {
    try {
      // Get all available UTxOs
      const utxos = await this.getWalletUtxos();
      
      if (utxos.length === 0) {
        throw new Error('使用可能なUTxOがありません');
      }

      // Calculate sweep amount
      const sweepResult = await this.calculateSweepAmount(utxos);
      
      if (sweepResult.sweepAmount <= 0) {
        throw new Error('Sweep amount is zero or negative after fees');
      }

      // Build transaction
      const txResult = await this.buildSweepTx(sweepResult);
      
      return {
        success: true,
        txHex: txResult.txHex,
        txHash: txResult.txHash,
        fee: txResult.fee,
        ttl: parseInt(txResult.ttl),
        witnesses_required: sweepResult.selectedUtxos.length.toString(),
        summary: {
          inputs: sweepResult.selectedUtxos.length,
          outputs: 1,
          amount_sent: sweepResult.sweepAmount.toString(),
          change_amount: '0',
          total_fee: txResult.fee
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Sweep transaction build failed'
      };
    }
  }

  private async calculateSweepAmount(utxos: UTxO[]): Promise<{
    selectedUtxos: UTxO[];
    totalValue: bigint;
    sweepAmount: bigint;
    estimatedFee: bigint;
  }> {
    // Select ADA-only UTxOs for sweep
    const adaOnlyUtxos = utxos.filter(utxo => !utxo.assets || utxo.assets.length === 0);
    
    if (adaOnlyUtxos.length === 0) {
      throw new Error('ADA専用UTxOが見つかりません');
    }

    // Calculate total value
    const totalValue = adaOnlyUtxos.reduce(
      (sum, utxo) => sum + BigInt(utxo.amount.coin),
      BigInt(0)
    );

    // Estimate transaction size and fee
    const estimatedTxSize = 180 + (adaOnlyUtxos.length * 70) + 40; // 1 output
    const estimatedFee = this.calculateFee(estimatedTxSize);

    const sweepAmount = totalValue - estimatedFee;

    // Apply minimum if specified
    if (this.rule.min_amount_lovelace && sweepAmount < BigInt(this.rule.min_amount_lovelace)) {
      throw new Error(`Sweep amount ${sweepAmount} below minimum ${this.rule.min_amount_lovelace}`);
    }

    return {
      selectedUtxos: adaOnlyUtxos,
      totalValue,
      sweepAmount,
      estimatedFee
    };
  }

  private async buildSweepTx(sweepData: {
    selectedUtxos: UTxO[];
    totalValue: bigint;
    sweepAmount: bigint;
    estimatedFee: bigint;
  }): Promise<{
    txHex: string;
    txHash: string;
    fee: string;
    ttl: string;
  }> {
    // Create inputs
    const inputs = CSL.TransactionInputs.new();
    
    for (const utxo of sweepData.selectedUtxos) {
      const input = CSL.TransactionInput.new(
        CSL.TransactionHash.from_bytes(Buffer.from(utxo.txHash, 'hex')),
        utxo.outputIndex
      );
      inputs.add(input);
    }

    // Create single output (sweep destination)
    const outputs = CSL.TransactionOutputs.new();
    const sweepOutput = this.createOutput(
      this.config.destinationAddress,
      sweepData.sweepAmount
    );
    outputs.add(sweepOutput);

    // Build transaction body
    const currentSlot = CSL.BigNum.from_str(this.config.protocolParams.currentSlot.toString());
    const txBody = this.buildTxBody(
      inputs,
      outputs,
      currentSlot
    );

    const txHash = Buffer.from(
      CSL.hash_transaction(txBody).to_bytes()
    ).toString('hex');

    const transaction = CSL.Transaction.new(
      txBody,
      CSL.TransactionWitnessSet.new(),
      undefined
    );

    return {
      txHex: Buffer.from(transaction.to_bytes()).toString('hex'),
      txHash,
      fee: sweepData.estimatedFee.toString(),
      ttl: currentSlot.checked_add(
        CSL.BigNum.from_str((this.config.ttlOffset || DEFAULT_TTL_OFFSET).toString())
      ).to_str()
    };
  }
}

/**
 * Rate-Based Transaction Builder
 * Converts JPY amount to ADA using current rate
 */
export class RateBasedTxBuilder extends BaseTxBuilder {
  private rule: RateBasedRule;

  constructor(config: TxBuilderConfig, rule: RateBasedRule) {
    super(config);
    this.rule = rule;
  }

  async buildTransaction(): Promise<TransactionBuildResult> {
    try {
      // Calculate ADA amount from JPY
      const adaAmount = await this.calculateAdaAmount();
      
      // Get available UTxOs
      const utxos = await this.getWalletUtxos();
      
      if (utxos.length === 0) {
        throw new Error('使用可能なUTxOがありません');
      }

      // Select UTxOs for the calculated amount
      const selection = await this.selectUtxosForAmount(utxos, adaAmount);
      
      if (!selection) {
        throw new Error(`insufficient funds for ${adaAmount} lovelace`);
      }

      // Build transaction
      const txResult = await this.buildRateBasedTx(selection, adaAmount);
      
      return {
        success: true,
        txHex: txResult.txHex,
        txHash: txResult.txHash,
        fee: txResult.fee,
        ttl: parseInt(txResult.ttl),
        witnesses_required: selection.selectedUtxos?.length?.toString() || '0',
        summary: {
          inputs: selection.selectedUtxos?.length || 0,
          outputs: (selection.changeAmount || 0) > 0 ? 2 : 1,
          amount_sent: adaAmount?.toString() || '0',
          change_amount: (selection.changeAmount || 0).toString(),
          total_fee: txResult?.fee || '0',
          rate_used: this.rule.rate_jpy_per_ada?.toString() || '0',
          jpy_amount: this.rule.jpy_amount?.toString() || '0'
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Rate-based transaction build failed'
      };
    }
  }

  private async calculateAdaAmount(): Promise<bigint> {
    // Convert JPY to ADA using the stored rate
    const adaAmount = Math.floor((this.rule.jpy_amount || 0) / (this.rule.rate_jpy_per_ada || 1) * LOVELACE_PER_ADA);
    
    // Apply slippage tolerance
    const slippageMultiplier = (10000 - (this.rule.slippage_bps || 0)) / 10000;
    const adjustedAmount = Math.floor(adaAmount * slippageMultiplier);

    return BigInt(adjustedAmount);
  }

  private async selectUtxosForAmount(utxos: UTxO[], targetAmount: bigint): Promise<UtxoSelection | null> {
    // Same logic as FixedAmountTxBuilder
    const adaOnlyUtxos = utxos.filter(utxo => !utxo.assets || utxo.assets.length === 0);
    adaOnlyUtxos.sort((a, b) => Number(BigInt(b.amount.coin) - BigInt(a.amount.coin)));

    let totalSelected = BigInt(0);
    const selectedUtxos: UTxO[] = [];
    let estimatedFee = this.calculateFee(250 * (selectedUtxos.length + 2));

    const requiredAmount = targetAmount + estimatedFee;

    for (const utxo of adaOnlyUtxos) {
      selectedUtxos.push(utxo);
      totalSelected += BigInt(utxo.amount.coin);

      estimatedFee = this.calculateFee(180 + (selectedUtxos.length * 70) + (2 * 40));

      if (totalSelected >= requiredAmount) {
        const changeAmount = totalSelected - targetAmount - estimatedFee;
        
        if (changeAmount > 0 && changeAmount < BigInt(MIN_UTXO_VALUE)) {
          estimatedFee += changeAmount;
          return {
            selectedUtxos,
            totalValue: totalSelected,
            changeAmount: BigInt(0),
            estimatedFee
          };
        }

        return {
          selectedUtxos,
          totalValue: totalSelected,
          changeAmount,
          estimatedFee
        };
      }
    }

    return null;
  }

  private async buildRateBasedTx(
    selection: UtxoSelection, 
    adaAmount: bigint
  ): Promise<{
    txHex: string;
    txHash: string;
    fee: string;
    ttl: string;
  }> {
    // Create inputs
    const inputs = CSL.TransactionInputs.new();
    
    for (const utxo of selection.selectedUtxos) {
      const input = CSL.TransactionInput.new(
        CSL.TransactionHash.from_bytes(Buffer.from(utxo.txHash, 'hex')),
        utxo.outputIndex
      );
      inputs.add(input);
    }

    // Create outputs
    const outputs = CSL.TransactionOutputs.new();
    
    // Destination output
    const destOutput = this.createOutput(this.config.destinationAddress, adaAmount);
    outputs.add(destOutput);

    // Change output (if necessary)
    if (selection.changeAmount > 0) {
      const changeOutput = this.createOutput(this.config.changeAddress, selection.changeAmount);
      outputs.add(changeOutput);
    }

    // Build transaction body
    const currentSlot = CSL.BigNum.from_str(this.config.protocolParams.currentSlot.toString());
    const txBody = this.buildTxBody(
      inputs,
      outputs,
      currentSlot
    );

    const txHash = Buffer.from(CSL.hash_transaction(txBody).to_bytes()).toString('hex');

    const transaction = CSL.Transaction.new(
      txBody,
      CSL.TransactionWitnessSet.new(),
      undefined
    );

    return {
      txHex: Buffer.from(transaction.to_bytes()).toString('hex'),
      txHash,
      fee: selection.estimatedFee.toString(),
      ttl: currentSlot.checked_add(
        CSL.BigNum.from_str((this.config.ttlOffset || DEFAULT_TTL_OFFSET).toString())
      ).to_str()
    };
  }
}

/**
 * Transaction Builder Factory
 */
export class TxBuilderFactory {
  static create(
    mode: 'fixed' | 'sweep' | 'rate_based',
    config: TxBuilderConfig,
    rule: FixedAmountRule | SweepRule | RateBasedRule
  ): BaseTxBuilder {
    switch (mode) {
      case 'fixed':
        return new FixedAmountTxBuilder(config, rule as FixedAmountRule);
      case 'sweep':
        return new SweepTxBuilder(config, rule as SweepRule);
      case 'rate_based':
        return new RateBasedTxBuilder(config, rule as RateBasedRule);
      default:
        throw new Error(`Unsupported transaction mode: ${mode}`);
    }
  }
}