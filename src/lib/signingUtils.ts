/**
 * Transaction Signing Utilities
 * Handles CIP-30 transaction signing with proper error handling
 */
import * as CSL from '@emurgo/cardano-serialization-lib-browser';
import { CIP30Api, PreSignedData } from '../types/otc/index';

export interface SigningResult {
  success: boolean;
  witnessSet?: string;
  signedTxHex?: string;
  error?: string;
}

export interface SigningOptions {
  partialSign?: boolean;
  timeout?: number; // milliseconds
}

/**
 * Sign transaction using CIP-30 API
 */
export async function signTransaction(
  api: CIP30Api,
  txHex: string,
  options: SigningOptions = {}
): Promise<SigningResult> {
  const { partialSign = true, timeout = 120000 } = options; // 2 minute default timeout

  try {
    // Validate transaction hex
    if (!txHex || typeof txHex !== 'string') {
      throw new Error('Invalid transaction hex provided');
    }

    // Validate CSL transaction
    try {
      CSL.Transaction.from_bytes(Buffer.from(txHex, 'hex'));
    } catch (error) {
      throw new Error('Invalid transaction format');
    }

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Signing timeout')), timeout);
    });

    // Sign transaction with timeout
    const witnessSetHex = await Promise.race([
      api.signTx(txHex, partialSign),
      timeoutPromise
    ]);

    if (!witnessSetHex) {
      throw new Error('Empty witness set returned from wallet');
    }

    // Validate witness set format
    try {
      CSL.TransactionWitnessSet.from_bytes(Buffer.from(witnessSetHex, 'hex'));
    } catch (error) {
      throw new Error('Invalid witness set format returned');
    }

    // Assemble final signed transaction
    const signedTxHex = assembleSignedTransaction(txHex, witnessSetHex);

    return {
      success: true,
      witnessSet: witnessSetHex,
      signedTxHex
    };

  } catch (error) {
    console.error('Transaction signing failed:', error);

    let errorMessage = 'Transaction signing failed';

    if (error instanceof Error) {
      // Handle common CIP-30 errors
      if (error.message.includes('User declined') || 
          error.message.includes('User rejected') ||
          error.message.includes('user rejected')) {
        errorMessage = 'ユーザーによって署名が拒否されました';
      } else if (error.message.includes('timeout') || 
                 error.message.includes('Signing timeout')) {
        errorMessage = '署名がタイムアウトしました。ウォレットアプリを確認してください';
      } else if (error.message.includes('insufficient') ||  
                 error.message.includes('not enough')) {
        errorMessage = '残高が不足しています';
      } else if (error.message.includes('Invalid transaction') ||
                 error.message.includes('transaction format')) {
        errorMessage = 'トランザクション形式が無効です';
      } else if (error.message.includes('network')) {
        errorMessage = 'ネットワークエラーが発生しました';
      } else if (error.message.includes('wallet')) {
        errorMessage = 'ウォレット接続エラーが発生しました';
      } else {
        errorMessage = error.message;
      }
    }

    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Assemble signed transaction from body and witness set
 */
function assembleSignedTransaction(txBodyHex: string, witnessSetHex: string): string {
  try {
    const txBody = CSL.Transaction.from_bytes(Buffer.from(txBodyHex, 'hex'));
    const witnessSet = CSL.TransactionWitnessSet.from_bytes(Buffer.from(witnessSetHex, 'hex'));

    // Create signed transaction
    const signedTx = CSL.Transaction.new(
      txBody.body(),
      witnessSet,
      txBody.auxiliary_data()
    );

    return Buffer.from(signedTx.to_bytes()).toString('hex');
  } catch (error) {
    throw new Error(`Failed to assemble signed transaction: ${error}`);
  }
}

/**
 * Export assembleSignedTransaction for use by other modules
 */
export { assembleSignedTransaction };

/**
 * Verify transaction signature
 */
export function verifyTransactionSignature(
  txHex: string,
  witnessSetHex: string
): boolean {
  try {
    const tx = CSL.Transaction.from_bytes(Buffer.from(txHex, 'hex'));
    const witnessSet = CSL.TransactionWitnessSet.from_bytes(Buffer.from(witnessSetHex, 'hex'));

    // Basic validation - check if witness set has required signatures
    const vkeyWitnesses = witnessSet.vkeys();
    if (!vkeyWitnesses || vkeyWitnesses.len() === 0) {
      return false;
    }

    // Additional validation can be added here
    // For now, just check that we have witnesses and they're properly formatted
    return true;

  } catch (error) {
    console.error('Signature verification failed:', error);
    return false;
  }
}

/**
 * Extract transaction hash from signed transaction
 */
export function getTransactionHash(txHex: string): string {
  try {
    const tx = CSL.Transaction.from_bytes(Buffer.from(txHex, 'hex'));
    const txHash = CSL.hash_transaction(tx.body());
    return Buffer.from(txHash.to_bytes()).toString('hex');
  } catch (error) {
    throw new Error(`Failed to extract transaction hash: ${error}`);
  }
}

/**
 * Calculate transaction size in bytes
 */
export function getTransactionSize(txHex: string): number {
  try {
    return Buffer.from(txHex, 'hex').length;
  } catch (error) {
    throw new Error(`Failed to calculate transaction size: ${error}`);
  }
}

/**
 * Validate transaction before signing
 */
export function validateTransactionForSigning(txHex: string): {
  valid: boolean;
  error?: string;
  details?: {
    inputs: number;
    outputs: number;
    fee: string;
    ttl?: number;
    size: number;
  };
} {
  try {
    const tx = CSL.Transaction.from_bytes(Buffer.from(txHex, 'hex'));
    const body = tx.body();

    // Extract transaction details
    const inputs = body.inputs().len();
    const outputs = body.outputs().len();
    const fee = body.fee().to_str();
    const ttl = body.ttl()?.to_str();
    const size = getTransactionSize(txHex);

    // Basic validation
    if (inputs === 0) {
      return { valid: false, error: 'Transaction has no inputs' };
    }

    if (outputs === 0) {
      return { valid: false, error: 'Transaction has no outputs' };
    }

    if (parseInt(fee) === 0) {
      return { valid: false, error: 'Transaction fee is zero' };
    }

    if (size > 16384) { // Max transaction size
      return { valid: false, error: 'Transaction too large' };
    }

    return {
      valid: true,
      details: {
        inputs,
        outputs,
        fee,
        ttl: ttl ? parseInt(ttl) : undefined,
        size
      }
    };

  } catch (error) {
    return {
      valid: false,
      error: `Transaction validation failed: ${error}`
    };
  }
}

/**
 * Create pre-signed data object
 */
export function createPreSignedData(
  requestId: string,
  txBodyHex: string,
  witnessSetHex: string,
  walletName: string,
  metadata?: any
): PreSignedData {
  const txHash = getTransactionHash(txBodyHex);
  const tx = CSL.Transaction.from_bytes(Buffer.from(txBodyHex, 'hex'));
  const body = tx.body();

  return {
    request_id: requestId,
    tx_body_hex: txBodyHex,
    witness_set_hex: witnessSetHex,
    tx_hash: txHash,
    fee_lovelace: body.fee().to_str(),
    ttl_slot: body.ttl()?.to_str() ? parseInt(body.ttl()!.to_str()) : 0,
    signed_at: new Date().toISOString(),
    wallet_used: walletName,
    metadata: {
      tx_size: getTransactionSize(txBodyHex),
      inputs_count: body.inputs().len(),
      outputs_count: body.outputs().len(),
      witnesses_count: CSL.TransactionWitnessSet.from_bytes(
        Buffer.from(witnessSetHex, 'hex')
      ).vkeys()?.len() || 0,
      ...metadata
    }
  };
}

/**
 * Enhanced signing function with retry logic
 */
export async function signTransactionWithRetry(
  api: CIP30Api,
  txHex: string,
  options: SigningOptions & { maxRetries?: number } = {}
): Promise<SigningResult> {
  const { maxRetries = 3, ...signingOptions } = options;
  
  let lastError: string = 'Unknown error';

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await signTransaction(api, txHex, signingOptions);
      
      if (result.success) {
        return result;
      }

      lastError = result.error || 'Signing failed';

      // Don't retry for user cancellation
      if (lastError.includes('拒否') || lastError.includes('rejected')) {
        break;
      }

      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }

    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown error';
    }
  }

  return {
    success: false,
    error: `Signing failed after ${maxRetries} attempts: ${lastError}`
  };
}