/**
 * Lazy Loading for Cardano Serialization Library (CSL)
 * Optimizes bundle size and initial load time by loading CSL on demand
 */

import { logAuditEvent, AuditEventType, AuditSeverity } from '../security';

/**
 * CSL Module type definitions
 */
export interface CSLModule {
  Address: any;
  BaseAddress: any;
  StakeCredential: any;
  Ed25519KeyHash: any;
  ScriptHash: any;
  TransactionBuilder: any;
  TransactionBuilderConfigBuilder: any;
  LinearFee: any;
  BigNum: any;
  Value: any;
  TransactionInput: any;
  TransactionOutput: any;
  TransactionHash: any;
  TransactionBody: any;
  Transaction: any;
  TransactionWitnessSet: any;
  Vkeywitnesses: any;
  Vkeywitness: any;
  Vkey: any;
  Ed25519Signature: any;
  PublicKey: any;
  PrivateKey: any;
  NetworkInfo: any;
  ProtocolParameters: any;
  encode_json_str_to_metadatum: any;
  decode_metadatum_to_json_str: any;
  hash_transaction: any;
  min_fee: any;
  encode_json_str_to_plutus_datum: any;
  hash_plutus_data: any;
  PlutusData: any;
  PlutusList: any;
  PlutusMap: any;
  BigInt: any;
  Int: any;
  UnitInterval: any;
  Coin: any;
  Assets: any;
  MultiAsset: any;
  AssetName: any;
  PolicyID: any;
  ScriptRef: any;
  PlutusScript: any;
  NativeScript: any;
  TimelockExpiry: any;
  TimelockStart: any;
}

/**
 * CSL loading state
 */
interface CSLLoadingState {
  loading: boolean;
  loaded: boolean;
  error: Error | null;
  module: CSLModule | null;
  loadStartTime: number | null;
  loadEndTime: number | null;
}

/**
 * Global CSL state
 */
let cslState: CSLLoadingState = {
  loading: false,
  loaded: false,
  error: null,
  module: null,
  loadStartTime: null,
  loadEndTime: null
};

/**
 * Loading promises to prevent duplicate loads
 */
let loadingPromise: Promise<CSLModule> | null = null;

/**
 * CSL module cache
 */
const moduleCache = new Map<string, any>();

/**
 * Performance metrics
 */
interface CSLMetrics {
  loadTime: number;
  bundleSize: number;
  initTime: number;
  errorCount: number;
  usageCount: number;
  lastUsed: number;
}

let metrics: CSLMetrics = {
  loadTime: 0,
  bundleSize: 0,
  initTime: 0,
  errorCount: 0,
  usageCount: 0,
  lastUsed: 0
};

/**
 * Load CSL module dynamically
 */
export const loadCSL = async (): Promise<CSLModule> => {
  // Return cached module if already loaded
  if (cslState.loaded && cslState.module) {
    metrics.usageCount++;
    metrics.lastUsed = Date.now();
    return cslState.module;
  }

  // Return existing loading promise if already loading
  if (cslState.loading && loadingPromise) {
    return loadingPromise;
  }

  // Start loading
  cslState.loading = true;
  cslState.loadStartTime = Date.now();
  cslState.error = null;

  loadingPromise = new Promise<CSLModule>(async (resolve, reject) => {
    try {
      logAuditEvent(
        AuditEventType.SYSTEM_STARTUP,
        'csl_load_start',
        { timestamp: cslState.loadStartTime },
        { severity: AuditSeverity.LOW, outcome: 'pending' }
      );

      // Dynamic import of CSL
      const CSL = await import('@emurgo/cardano-serialization-lib-nodejs');
      
      cslState.loadEndTime = Date.now();
      cslState.loaded = true;
      cslState.loading = false;
      cslState.module = CSL as any;
      cslState.error = null;

      // Calculate metrics
      metrics.loadTime = cslState.loadEndTime - (cslState.loadStartTime || 0);
      metrics.usageCount++;
      metrics.lastUsed = Date.now();

      // Log successful load
      logAuditEvent(
        AuditEventType.SYSTEM_STARTUP,
        'csl_load_success',
        { 
          loadTime: metrics.loadTime,
          timestamp: cslState.loadEndTime
        },
        { severity: AuditSeverity.LOW, outcome: 'success' }
      );

      console.log(`✅ CSL loaded successfully in ${metrics.loadTime}ms`);
      
      resolve(CSL as any);
    } catch (error) {
      cslState.loading = false;
      cslState.loaded = false;
      cslState.error = error instanceof Error ? error : new Error('CSL load failed');
      metrics.errorCount++;

      logAuditEvent(
        AuditEventType.SYSTEM_ERROR,
        'csl_load_error',
        { 
          error: cslState.error.message,
          errorCount: metrics.errorCount
        },
        { severity: AuditSeverity.HIGH, outcome: 'failure' }
      );

      console.error('❌ Failed to load CSL:', error);
      reject(cslState.error);
    } finally {
      loadingPromise = null;
    }
  });

  return loadingPromise;
};

/**
 * Preload CSL in the background (optional optimization)
 */
export const preloadCSL = (): void => {
  if (typeof window !== 'undefined' && !cslState.loaded && !cslState.loading) {
    // Use requestIdleCallback if available, otherwise setTimeout
    const preloadFn = () => {
      loadCSL().catch(error => {
        console.warn('CSL preload failed:', error);
      });
    };

    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(preloadFn, { timeout: 5000 });
    } else {
      setTimeout(preloadFn, 2000);
    }
  }
};

/**
 * Get CSL loading state
 */
export const getCSLState = (): CSLLoadingState => {
  return { ...cslState };
};

/**
 * Get CSL performance metrics
 */
export const getCSLMetrics = (): CSLMetrics => {
  return { ...metrics };
};

/**
 * CSL utility functions with lazy loading
 */
export class LazyCSL {
  /**
   * Create a Cardano address from bech32 string
   */
  static async createAddress(addressString: string): Promise<any> {
    const CSL = await loadCSL();
    try {
      return CSL.Address.from_bech32(addressString);
    } catch {
      // Try legacy Byron address format
      return CSL.Address.from_bytes(
        Buffer.from(addressString, 'hex')
      );
    }
  }

  /**
   * Create transaction builder with current network parameters
   */
  static async createTransactionBuilder(
    protocolParams: any
  ): Promise<any> {
    const CSL = await loadCSL();
    
    const txBuilderConfig = CSL.TransactionBuilderConfigBuilder.new()
      .fee_algo(
        CSL.LinearFee.new(
          CSL.BigNum.from_str(protocolParams.min_fee_a.toString()),
          CSL.BigNum.from_str(protocolParams.min_fee_b.toString())
        )
      )
      .coins_per_utxo_byte(
        CSL.BigNum.from_str(protocolParams.coins_per_utxo_byte?.toString() || '4310')
      )
      .pool_deposit(
        CSL.BigNum.from_str(protocolParams.pool_deposit.toString())
      )
      .key_deposit(
        CSL.BigNum.from_str(protocolParams.key_deposit.toString())
      )
      .max_value_size(protocolParams.max_val_size)
      .max_tx_size(protocolParams.max_tx_size)
      .build();

    return CSL.TransactionBuilder.new(txBuilderConfig);
  }

  /**
   * Convert lovelace string to CSL BigNum
   */
  static async bigNumFromStr(lovelace: string): Promise<any> {
    const CSL = await loadCSL();
    return CSL.BigNum.from_str(lovelace);
  }

  /**
   * Create transaction input from UTxO
   */
  static async createTxInput(txHash: string, outputIndex: number): Promise<any> {
    const CSL = await loadCSL();
    return CSL.TransactionInput.new(
      CSL.TransactionHash.from_bytes(Buffer.from(txHash, 'hex')),
      outputIndex
    );
  }

  /**
   * Create transaction output
   */
  static async createTxOutput(
    address: string,
    amount: string,
    assets?: Array<{ unit: string; quantity: string }>
  ): Promise<any> {
    const CSL = await loadCSL();
    
    const addr = await this.createAddress(address);
    let value = CSL.Value.new(CSL.BigNum.from_str(amount));

    // Add native assets if provided
    if (assets && assets.length > 0) {
      const multiAsset = CSL.MultiAsset.new();
      
      for (const asset of assets) {
        const policyId = asset.unit.slice(0, 56);
        const assetName = asset.unit.slice(56);
        
        const policy = CSL.PolicyID.from_bytes(Buffer.from(policyId, 'hex'));
        const name = CSL.AssetName.new(Buffer.from(assetName, 'hex'));
        const quantity = CSL.BigNum.from_str(asset.quantity);
        
        let policyAssets = multiAsset.get(policy);
        if (!policyAssets) {
          policyAssets = CSL.Assets.new();
        }
        
        policyAssets.insert(name, quantity);
        multiAsset.insert(policy, policyAssets);
      }
      
      value.set_multiasset(multiAsset);
    }

    return CSL.TransactionOutput.new(addr, value);
  }

  /**
   * Calculate minimum fee for transaction
   */
  static async calculateMinFee(
    txBody: any,
    protocolParams: any,
    witnessCount: number = 1
  ): Promise<string> {
    const CSL = await loadCSL();
    
    // Create dummy witness set for fee calculation
    const witnessSet = CSL.TransactionWitnessSet.new();
    const vkeyWitnesses = CSL.Vkeywitnesses.new();
    
    // Add dummy witnesses
    for (let i = 0; i < witnessCount; i++) {
      const dummyKey = CSL.PrivateKey.generate_ed25519().to_public();
      const dummySig = CSL.Ed25519Signature.from_bytes(new Uint8Array(64));
      const witness = CSL.Vkeywitness.new(
        CSL.Vkey.new(dummyKey),
        dummySig
      );
      vkeyWitnesses.add(witness);
    }
    
    witnessSet.set_vkeys(vkeyWitnesses);
    
    const tx = CSL.Transaction.new(txBody, witnessSet);
    
    const linearFee = CSL.LinearFee.new(
      CSL.BigNum.from_str(protocolParams.min_fee_a.toString()),
      CSL.BigNum.from_str(protocolParams.min_fee_b.toString())
    );
    
    const minFee = CSL.min_fee(tx, linearFee);
    return minFee.to_str();
  }

  /**
   * Hash transaction body
   */
  static async hashTransaction(txBody: any): Promise<string> {
    const CSL = await loadCSL();
    const txHash = CSL.hash_transaction(txBody);
    return Buffer.from(txHash.to_bytes()).toString('hex');
  }

  /**
   * Convert hex string to transaction
   */
  static async transactionFromHex(hex: string): Promise<any> {
    const CSL = await loadCSL();
    return CSL.Transaction.from_bytes(Buffer.from(hex, 'hex'));
  }

  /**
   * Convert transaction to hex string
   */
  static async transactionToHex(tx: any): Promise<string> {
    const CSL = await loadCSL();
    return Buffer.from(tx.to_bytes()).toString('hex');
  }

  /**
   * Create metadata from JSON
   */
  static async createMetadata(json: any): Promise<any> {
    const CSL = await loadCSL();
    return CSL.encode_json_str_to_metadatum(
      JSON.stringify(json),
      CSL.MetadataJsonSchema.BasicConversions
    );
  }

  /**
   * Parse metadata to JSON
   */
  static async parseMetadata(metadata: any): Promise<any> {
    const CSL = await loadCSL();
    const jsonStr = CSL.decode_metadatum_to_json_str(
      metadata,
      CSL.MetadataJsonSchema.BasicConversions
    );
    return JSON.parse(jsonStr);
  }
}

/**
 * React hook for CSL loading
 */
export const useCSL = () => {
  const [state, setState] = React.useState(getCSLState());

  React.useEffect(() => {
    const checkState = () => {
      const currentState = getCSLState();
      if (
        currentState.loading !== state.loading ||
        currentState.loaded !== state.loaded ||
        currentState.error !== state.error
      ) {
        setState(currentState);
      }
    };

    const interval = setInterval(checkState, 100);
    return () => clearInterval(interval);
  }, [state]);

  const load = React.useCallback(async () => {
    try {
      await loadCSL();
    } catch (error) {
      console.error('Failed to load CSL in hook:', error);
    }
  }, []);

  return {
    ...state,
    load,
    metrics: getCSLMetrics()
  };
};

/**
 * CSL loading indicator component
 */
interface CSLLoadingProps {
  onLoad?: () => void;
  onError?: (error: Error) => void;
  showPreloader?: boolean;
  className?: string;
}

export const CSLLoading: React.FC<CSLLoadingProps> = ({
  onLoad,
  onError,
  showPreloader = true,
  className = ''
}) => {
  const { loading, loaded, error, load } = useCSL();

  React.useEffect(() => {
    if (loaded && onLoad) {
      onLoad();
    }
  }, [loaded, onLoad]);

  React.useEffect(() => {
    if (error && onError) {
      onError(error);
    }
  }, [error, onError]);

  if (!showPreloader || loaded) {
    return null;
  }

  if (error) {
    return (
      <div className={`bg-red-50 border border-red-200 rounded-md p-4 ${className}`}>
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">
              ライブラリ読み込みエラー
            </h3>
            <div className="mt-2 text-sm text-red-700">
              <p>Cardanoライブラリの読み込みに失敗しました。</p>
            </div>
            <div className="mt-4">
              <button
                onClick={load}
                className="bg-red-100 px-3 py-2 rounded-md text-sm font-medium text-red-800 hover:bg-red-200"
              >
                再試行
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`bg-blue-50 border border-blue-200 rounded-md p-4 ${className}`}>
        <div className="flex">
          <div className="flex-shrink-0">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">
              ライブラリ読み込み中...
            </h3>
            <div className="mt-2 text-sm text-blue-700">
              <p>Cardanoライブラリを読み込んでいます。しばらくお待ちください。</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

/**
 * HOC for components that require CSL
 */
export const withCSL = <P extends object>(
  Component: React.ComponentType<P>
): React.FC<P & { fallback?: React.ReactNode }> => {
  return ({ fallback, ...props }) => {
    const { loaded, loading, error } = useCSL();

    if (error) {
      return (
        fallback || (
          <div className="text-center py-8">
            <p className="text-red-600">ライブラリの読み込みに失敗しました</p>
          </div>
        )
      );
    }

    if (loading || !loaded) {
      return (
        fallback || (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto mb-4"></div>
            <p className="text-gray-600">読み込み中...</p>
          </div>
        )
      );
    }

    return <Component {...(props as P)} />;
  };
};

/**
 * Initialize CSL preloading based on user interaction
 */
export const initializeCSLPreloading = (): void => {
  if (typeof window === 'undefined') return;

  let userInteracted = false;
  
  const handleUserInteraction = () => {
    if (!userInteracted) {
      userInteracted = true;
      preloadCSL();
      
      // Remove listeners after first interaction
      window.removeEventListener('mousedown', handleUserInteraction);
      window.removeEventListener('touchstart', handleUserInteraction);
      window.removeEventListener('keydown', handleUserInteraction);
    }
  };

  // Listen for user interactions
  window.addEventListener('mousedown', handleUserInteraction, { once: true });
  window.addEventListener('touchstart', handleUserInteraction, { once: true });
  window.addEventListener('keydown', handleUserInteraction, { once: true });

  // Fallback preload after 3 seconds
  setTimeout(() => {
    if (!userInteracted && !cslState.loaded && !cslState.loading) {
      preloadCSL();
    }
  }, 3000);
};

// Import React for hooks
import React from 'react';

// Auto-initialize preloading
if (typeof window !== 'undefined') {
  initializeCSLPreloading();
}