/**
 * Transaction Builders for OTC System
 * Supports FixedAmount, Sweep, and RateBased transaction modes
 */
import * as CSL from '@emurgo/cardano-serialization-lib-browser';
import { 
  CIP30Api, 
  UTxO, 
  ProtocolParameters,
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
  protocolParams: ProtocolParameters;
  api: CIP30Api;
  changeAddress: string;
  destinationAddress: string;
  ttlOffset?: number;
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
    try {
      const utxosHex = await this.config.api.getUtxos();
      const utxos: UTxO[] = [];

      for (const utxoHex of utxosHex) {
        const utxo = CSL.TransactionUnspentOutput.from_bytes(
          Buffer.from(utxoHex, 'hex')
        );
        
        const input = utxo.input();
        const output = utxo.output();
        const value = output.amount();

        // Convert to our UTxO format
        const formattedUtxo: UTxO = {
          txHash: Buffer.from(input.transaction_id().to_bytes()).toString('hex'),
          outputIndex: input.index(),
          address: output.address().to_bech32(),
          amount: {
            coin: value.coin().to_str()
          },
          assets: []
        };

        // Handle multi-assets
        const multiasset = value.multiasset();
        if (multiasset) {
          const multiassetData: { [policyId: string]: { [assetName: string]: string } } = {};
          const keys = multiasset.keys();
          
          for (let i = 0; i < keys.len(); i++) {
            const policyId = keys.get(i);
            const assets = multiasset.get(policyId);
            
            if (assets) {
              const policyIdHex = Buffer.from(policyId.to_bytes()).toString('hex');
              multiassetData[policyIdHex] = {};
              
              const assetNames = assets.keys();
              for (let j = 0; j < assetNames.len(); j++) {
                const assetName = assetNames.get(j);
                const amount = assets.get(assetName);
                
                if (amount) {
                  const assetNameHex = Buffer.from(assetName.name()).toString('hex');
                  multiassetData[policyIdHex][assetNameHex] = amount.to_str();
                  
                  // Also add to assets array for compatibility
                  formattedUtxo.assets?.push({
                    unit: policyIdHex + assetNameHex,
                    quantity: amount.to_str(),
                    policy_id: policyIdHex,
                    asset_name: assetNameHex,
                    policyId: policyIdHex
                  });
                }
              }
            }
          }
          
          formattedUtxo.amount.multiasset = multiassetData;
        }

        utxos.push(formattedUtxo);
      }

      return utxos;
    } catch (error) {
      throw new Error(`UTxO取得に失敗しました: ${error}`);
    }
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
  protected buildTxBody(
    inputs: CSL.TransactionInputs,
    outputs: CSL.TransactionOutputs,
    ttl?: CSL.BigNum
  ): CSL.TransactionBody {
    const config = CSL.TransactionBuilderConfigBuilder.new()
      .fee_algo(
        CSL.LinearFee.new(
          CSL.BigNum.from_str(this.config.protocolParams.minFeeA.toString()),
          CSL.BigNum.from_str(this.config.protocolParams.minFeeB.toString())
        )
      )
      .pool_deposit(CSL.BigNum.from_str(this.config.protocolParams.poolDeposit))
      .key_deposit(CSL.BigNum.from_str(this.config.protocolParams.keyDeposit))
      .max_tx_size(Number(this.config.protocolParams.maxTxSize))
      .max_value_size(5000)
      .coins_per_utxo_byte(CSL.BigNum.from_str(this.config.protocolParams.coinsPerUtxoByte))
      .build();

    const txBuilder = CSL.TransactionBuilder.new(config);

    // Add inputs
    for (let i = 0; i < inputs.len(); i++) {
      txBuilder.add_key_input(
        CSL.Ed25519KeyHash.from_hex(''), // placeholder
        inputs.get(i),
        CSL.Value.new(CSL.BigNum.from_str("0"))
      );
    }

    // Add outputs
    for (let i = 0; i < outputs.len(); i++) {
      txBuilder.add_output(outputs.get(i));
    }

    // Set TTL if provided
    if (ttl) {
      const ttlOffset = CSL.BigNum.from_str((this.config.ttlOffset || DEFAULT_TTL_OFFSET).toString());
      const finalTtl = ttl.checked_add(ttlOffset);
      if (finalTtl) {
        txBuilder.set_ttl(Number(finalTtl.to_str()));
      }
    }

    return txBuilder.build();
  }

  /**
   * Create transaction output
   */
  protected createOutput(address: string, amount: bigint, assets?: unknown[]): CSL.TransactionOutput {
    const addr = CSL.Address.from_bech32(address);
    const value = CSL.Value.new(CSL.BigNum.from_str(amount.toString()));

    // Add multi-assets if provided
    if (assets && assets.length > 0) {
      const multiAsset = CSL.MultiAsset.new();
      
      for (const asset of assets) {
        const policyId = CSL.ScriptHash.from_bytes(Buffer.from(asset.policyId, 'hex'));
        const assetName = CSL.AssetName.new(Buffer.from(asset.assetName, 'hex'));
        const assetAmount = CSL.BigNum.from_str(asset.amount);

        let assets = multiAsset.get(policyId);
        if (!assets) {
          assets = CSL.Assets.new();
          multiAsset.insert(policyId, assets);
        }
        assets.insert(assetName, assetAmount);
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
        ttl: txResult.ttl,
        witnesses_required: selection.selectedUtxos.length,
        summary: {
          inputs: selection.selectedUtxos.length,
          outputs: selection.changeAmount > 0 ? 2 : 1,
          amount_sent: this.rule.amount,
          change_amount: selection.changeAmount.toString(),
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

    let totalSelected = 0n;
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
            changeAmount: 0n,
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
        ttl: txResult.ttl,
        witnesses_required: sweepResult.selectedUtxos.length,
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
      0n
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
        ttl: txResult.ttl,
        witnesses_required: selection.selectedUtxos.length,
        summary: {
          inputs: selection.selectedUtxos.length,
          outputs: selection.changeAmount > 0 ? 2 : 1,
          amount_sent: adaAmount.toString(),
          change_amount: selection.changeAmount.toString(),
          total_fee: txResult.fee,
          rate_used: this.rule.rate_jpy_per_ada,
          jpy_amount: this.rule.jpy_amount
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
    const adaAmount = Math.floor(this.rule.jpy_amount / this.rule.rate_jpy_per_ada * LOVELACE_PER_ADA);
    
    // Apply slippage tolerance
    const slippageMultiplier = (10000 - this.rule.slippage_bps) / 10000;
    const adjustedAmount = Math.floor(adaAmount * slippageMultiplier);

    return BigInt(adjustedAmount);
  }

  private async selectUtxosForAmount(utxos: UTxO[], targetAmount: bigint): Promise<UtxoSelection | null> {
    // Same logic as FixedAmountTxBuilder
    const adaOnlyUtxos = utxos.filter(utxo => !utxo.assets || utxo.assets.length === 0);
    adaOnlyUtxos.sort((a, b) => Number(BigInt(b.amount.coin) - BigInt(a.amount.coin)));

    let totalSelected = 0n;
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
            changeAmount: 0n,
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