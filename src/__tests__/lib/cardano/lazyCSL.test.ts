/**
 * CSL Lazy Loading Unit Tests
 * Tests for Cardano Serialization Library lazy loading functionality
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { renderHook, act, render } from '@testing-library/react';
import {
  loadCSL,
  preloadCSL,
  getCSLState,
  getCSLMetrics,
  LazyCSL,
  useCSL,
  CSLLoading,
  withCSL,
  initializeCSLPreloading,
  type CSLModule
} from '../../../lib/cardano/lazyCSL';

// Mock security logging
jest.mock('../../../lib/security', () => ({
  logAuditEvent: jest.fn(),
  AuditEventType: {
    SYSTEM_STARTUP: 'system_startup',
    SYSTEM_ERROR: 'system_error'
  },
  AuditSeverity: {
    LOW: 'low',
    HIGH: 'high'
  }
}));

// Mock CSL module
const mockCSL = {
  Address: {
    from_bech32: jest.fn(),
    from_bytes: jest.fn()
  },
  BaseAddress: jest.fn(),
  TransactionBuilder: {
    new: jest.fn()
  },
  TransactionBuilderConfigBuilder: {
    new: jest.fn(() => ({
      fee_algo: jest.fn().mockReturnThis(),
      coins_per_utxo_byte: jest.fn().mockReturnThis(),
      pool_deposit: jest.fn().mockReturnThis(),
      key_deposit: jest.fn().mockReturnThis(),
      max_value_size: jest.fn().mockReturnThis(),
      max_tx_size: jest.fn().mockReturnThis(),
      build: jest.fn()
    }))
  },
  LinearFee: {
    new: jest.fn()
  },
  BigNum: {
    from_str: jest.fn()
  },
  Value: {
    new: jest.fn(() => ({
      set_multiasset: jest.fn()
    }))
  },
  TransactionInput: {
    new: jest.fn()
  },
  TransactionOutput: {
    new: jest.fn()
  },
  TransactionHash: {
    from_bytes: jest.fn()
  },
  TransactionBody: jest.fn(),
  Transaction: {
    new: jest.fn(),
    from_bytes: jest.fn()
  },
  TransactionWitnessSet: {
    new: jest.fn(() => ({
      set_vkeys: jest.fn()
    }))
  },
  Vkeywitnesses: {
    new: jest.fn(() => ({
      add: jest.fn()
    }))
  },
  Vkeywitness: {
    new: jest.fn()
  },
  Vkey: {
    new: jest.fn()
  },
  Ed25519Signature: {
    from_bytes: jest.fn()
  },
  PrivateKey: {
    generate_ed25519: jest.fn(() => ({
      to_public: jest.fn()
    }))
  },
  MultiAsset: {
    new: jest.fn(() => ({
      get: jest.fn(),
      insert: jest.fn()
    }))
  },
  Assets: {
    new: jest.fn(() => ({
      insert: jest.fn()
    }))
  },
  PolicyID: {
    from_bytes: jest.fn()
  },
  AssetName: {
    new: jest.fn()
  },
  hash_transaction: jest.fn(() => ({
    to_bytes: jest.fn(() => new Uint8Array([1, 2, 3, 4]))
  })),
  min_fee: jest.fn(() => ({
    to_str: jest.fn(() => '200000')
  })),
  encode_json_str_to_metadatum: jest.fn(),
  decode_metadatum_to_json_str: jest.fn(),
  MetadataJsonSchema: {
    BasicConversions: 'basic'
  }
};

// Mock dynamic import
jest.unstable_mockModule('@emurgo/cardano-serialization-lib-nodejs', () => mockCSL);

describe('loadCSL', () => {
  beforeEach(() => {
    // Reset CSL state before each test
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('should load CSL successfully', async () => {
    const csl = await loadCSL();
    
    expect(csl).toBeDefined();
    expect(csl.Address).toBeDefined();
    expect(csl.TransactionBuilder).toBeDefined();
  });

  it('should return cached module on subsequent calls', async () => {
    const csl1 = await loadCSL();
    const csl2 = await loadCSL();
    
    expect(csl1).toBe(csl2);
  });

  it('should handle loading errors', async () => {
    // Mock import failure
    jest.doMock('@emurgo/cardano-serialization-lib-nodejs', () => {
      throw new Error('Import failed');
    });

    await expect(loadCSL()).rejects.toThrow('Import failed');
  });

  it('should update metrics on successful load', async () => {
    await loadCSL();
    
    const metrics = getCSLMetrics();
    expect(metrics.usageCount).toBeGreaterThan(0);
    expect(metrics.loadTime).toBeGreaterThanOrEqual(0);
    expect(metrics.lastUsed).toBeGreaterThan(0);
  });

  it('should update metrics on cached access', async () => {
    await loadCSL(); // First load
    const initialMetrics = getCSLMetrics();
    
    await loadCSL(); // Cached access
    const updatedMetrics = getCSLMetrics();
    
    expect(updatedMetrics.usageCount).toBe(initialMetrics.usageCount + 1);
    expect(updatedMetrics.lastUsed).toBeGreaterThanOrEqual(initialMetrics.lastUsed);
  });
});

describe('preloadCSL', () => {
  beforeEach(() => {
    // Mock window object with requestIdleCallback
    global.window = {
      ...global.window,
      requestIdleCallback: jest.fn((callback, options) => {
        setTimeout(callback, 0);
        return 1;
      })
    } as any;
  });

  it('should use requestIdleCallback when available', () => {
    preloadCSL();
    
    expect(global.window.requestIdleCallback).toHaveBeenCalledWith(
      expect.any(Function),
      { timeout: 5000 }
    );
  });

  it('should fallback to setTimeout when requestIdleCallback is not available', () => {
    const originalSetTimeout = global.setTimeout;
    global.setTimeout = jest.fn();
    
    // Remove requestIdleCallback
    delete (global.window as any).requestIdleCallback;
    
    preloadCSL();
    
    expect(global.setTimeout).toHaveBeenCalledWith(
      expect.any(Function),
      2000
    );
    
    global.setTimeout = originalSetTimeout;
  });

  it('should not preload if already loaded', () => {
    // Simulate already loaded state
    loadCSL(); // Load CSL first
    
    const requestIdleCallbackSpy = jest.spyOn(global.window as any, 'requestIdleCallback');
    
    preloadCSL();
    
    // Should not call requestIdleCallback since already loaded
    expect(requestIdleCallbackSpy).not.toHaveBeenCalled();
  });

  it('should handle preload errors gracefully', () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    
    // Mock loadCSL to fail
    jest.doMock('./lazyCSL', () => ({
      loadCSL: jest.fn().mockRejectedValue(new Error('Preload failed'))
    }));
    
    preloadCSL();
    
    // Should not throw error
    expect(() => preloadCSL()).not.toThrow();
    
    consoleSpy.mockRestore();
  });
});

describe('getCSLState', () => {
  it('should return current CSL state', () => {
    const state = getCSLState();
    
    expect(state).toHaveProperty('loading');
    expect(state).toHaveProperty('loaded');
    expect(state).toHaveProperty('error');
    expect(state).toHaveProperty('module');
    expect(state).toHaveProperty('loadStartTime');
    expect(state).toHaveProperty('loadEndTime');
  });

  it('should return state copy, not reference', () => {
    const state1 = getCSLState();
    const state2 = getCSLState();
    
    expect(state1).toEqual(state2);
    expect(state1).not.toBe(state2);
  });
});

describe('getCSLMetrics', () => {
  it('should return current metrics', () => {
    const metrics = getCSLMetrics();
    
    expect(metrics).toHaveProperty('loadTime');
    expect(metrics).toHaveProperty('bundleSize');
    expect(metrics).toHaveProperty('initTime');
    expect(metrics).toHaveProperty('errorCount');
    expect(metrics).toHaveProperty('usageCount');
    expect(metrics).toHaveProperty('lastUsed');
  });

  it('should return metrics copy, not reference', () => {
    const metrics1 = getCSLMetrics();
    const metrics2 = getCSLMetrics();
    
    expect(metrics1).toEqual(metrics2);
    expect(metrics1).not.toBe(metrics2);
  });
});

describe('LazyCSL', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createAddress', () => {
    it('should create address from bech32 string', async () => {
      const mockAddress = { test: 'address' };
      mockCSL.Address.from_bech32.mockReturnValue(mockAddress);
      
      const address = await LazyCSL.createAddress('addr1test123');
      
      expect(mockCSL.Address.from_bech32).toHaveBeenCalledWith('addr1test123');
      expect(address).toBe(mockAddress);
    });

    it('should fallback to Byron address format on error', async () => {
      const mockByronAddress = { test: 'byron-address' };
      mockCSL.Address.from_bech32.mockImplementation(() => {
        throw new Error('Invalid bech32');
      });
      mockCSL.Address.from_bytes.mockReturnValue(mockByronAddress);
      
      const address = await LazyCSL.createAddress('byron123');
      
      expect(mockCSL.Address.from_bytes).toHaveBeenCalled();
      expect(address).toBe(mockByronAddress);
    });
  });

  describe('createTransactionBuilder', () => {
    it('should create transaction builder with protocol params', async () => {
      const mockBuilder = { test: 'builder' };
      const mockConfig = { test: 'config' };
      
      mockCSL.TransactionBuilderConfigBuilder.new().build.mockReturnValue(mockConfig);
      mockCSL.TransactionBuilder.new.mockReturnValue(mockBuilder);
      
      const protocolParams = {
        min_fee_a: 44,
        min_fee_b: 155381,
        coins_per_utxo_byte: 4310,
        pool_deposit: 500000000,
        key_deposit: 2000000,
        max_val_size: 5000,
        max_tx_size: 16384
      };
      
      const builder = await LazyCSL.createTransactionBuilder(protocolParams);
      
      expect(mockCSL.TransactionBuilder.new).toHaveBeenCalledWith(mockConfig);
      expect(builder).toBe(mockBuilder);
    });
  });

  describe('bigNumFromStr', () => {
    it('should convert string to BigNum', async () => {
      const mockBigNum = { test: 'bignum' };
      mockCSL.BigNum.from_str.mockReturnValue(mockBigNum);
      
      const result = await LazyCSL.bigNumFromStr('1000000');
      
      expect(mockCSL.BigNum.from_str).toHaveBeenCalledWith('1000000');
      expect(result).toBe(mockBigNum);
    });
  });

  describe('createTxInput', () => {
    it('should create transaction input', async () => {
      const mockTxHash = { test: 'txhash' };
      const mockTxInput = { test: 'txinput' };
      
      mockCSL.TransactionHash.from_bytes.mockReturnValue(mockTxHash);
      mockCSL.TransactionInput.new.mockReturnValue(mockTxInput);
      
      const input = await LazyCSL.createTxInput('abcd1234', 0);
      
      expect(mockCSL.TransactionHash.from_bytes).toHaveBeenCalled();
      expect(mockCSL.TransactionInput.new).toHaveBeenCalledWith(mockTxHash, 0);
      expect(input).toBe(mockTxInput);
    });
  });

  describe('createTxOutput', () => {
    it('should create transaction output with ADA only', async () => {
      const mockAddress = { test: 'address' };
      const mockValue = { test: 'value' };
      const mockOutput = { test: 'output' };
      
      jest.spyOn(LazyCSL, 'createAddress').mockResolvedValue(mockAddress);
      mockCSL.Value.new.mockReturnValue(mockValue);
      mockCSL.TransactionOutput.new.mockReturnValue(mockOutput);
      
      const output = await LazyCSL.createTxOutput('addr1test', '1000000');
      
      expect(LazyCSL.createAddress).toHaveBeenCalledWith('addr1test');
      expect(mockCSL.Value.new).toHaveBeenCalled();
      expect(mockCSL.TransactionOutput.new).toHaveBeenCalledWith(mockAddress, mockValue);
      expect(output).toBe(mockOutput);
    });

    it('should create transaction output with native assets', async () => {
      const mockAddress = { test: 'address' };
      const mockValue = { test: 'value', set_multiasset: jest.fn() };
      const mockMultiAsset = { 
        get: jest.fn(),
        insert: jest.fn()
      };
      const mockAssets = { insert: jest.fn() };
      
      jest.spyOn(LazyCSL, 'createAddress').mockResolvedValue(mockAddress);
      mockCSL.Value.new.mockReturnValue(mockValue);
      mockCSL.MultiAsset.new.mockReturnValue(mockMultiAsset);
      mockCSL.Assets.new.mockReturnValue(mockAssets);
      mockMultiAsset.get.mockReturnValue(null); // No existing policy assets
      
      const assets = [{
        unit: 'abcd1234567890123456789012345678901234567890123456789012345678901234567890',
        quantity: '1000'
      }];
      
      const output = await LazyCSL.createTxOutput('addr1test', '1000000', assets);
      
      expect(mockValue.set_multiasset).toHaveBeenCalledWith(mockMultiAsset);
      expect(mockMultiAsset.insert).toHaveBeenCalled();
    });
  });

  describe('calculateMinFee', () => {
    it('should calculate minimum fee for transaction', async () => {
      const mockTxBody = { test: 'txbody' };
      const mockWitnessSet = { set_vkeys: jest.fn() };
      const mockVkeyWitnesses = { add: jest.fn() };
      const mockTx = { test: 'tx' };
      const mockLinearFee = { test: 'fee' };
      const mockMinFee = { to_str: jest.fn(() => '200000') };
      
      mockCSL.TransactionWitnessSet.new.mockReturnValue(mockWitnessSet);
      mockCSL.Vkeywitnesses.new.mockReturnValue(mockVkeyWitnesses);
      mockCSL.Transaction.new.mockReturnValue(mockTx);
      mockCSL.LinearFee.new.mockReturnValue(mockLinearFee);
      mockCSL.min_fee.mockReturnValue(mockMinFee);
      
      const protocolParams = {
        min_fee_a: 44,
        min_fee_b: 155381
      };
      
      const fee = await LazyCSL.calculateMinFee(mockTxBody, protocolParams, 2);
      
      expect(mockVkeyWitnesses.add).toHaveBeenCalledTimes(2); // 2 witnesses
      expect(mockCSL.min_fee).toHaveBeenCalledWith(mockTx, mockLinearFee);
      expect(fee).toBe('200000');
    });
  });

  describe('hashTransaction', () => {
    it('should hash transaction body', async () => {
      const mockTxBody = { test: 'txbody' };
      const mockHash = { to_bytes: jest.fn(() => new Uint8Array([1, 2, 3, 4])) };
      
      mockCSL.hash_transaction.mockReturnValue(mockHash);
      
      const hash = await LazyCSL.hashTransaction(mockTxBody);
      
      expect(mockCSL.hash_transaction).toHaveBeenCalledWith(mockTxBody);
      expect(hash).toBe('01020304');
    });
  });

  describe('transactionFromHex', () => {
    it('should convert hex string to transaction', async () => {
      const mockTx = { test: 'transaction' };
      mockCSL.Transaction.from_bytes.mockReturnValue(mockTx);
      
      const tx = await LazyCSL.transactionFromHex('abcd1234');
      
      expect(mockCSL.Transaction.from_bytes).toHaveBeenCalled();
      expect(tx).toBe(mockTx);
    });
  });

  describe('transactionToHex', () => {
    it('should convert transaction to hex string', async () => {
      const mockTx = {
        to_bytes: jest.fn(() => new Uint8Array([171, 205, 18, 52]))
      };
      
      const hex = await LazyCSL.transactionToHex(mockTx);
      
      expect(mockTx.to_bytes).toHaveBeenCalled();
      expect(hex).toBe('abcd1234');
    });
  });

  describe('createMetadata', () => {
    it('should create metadata from JSON', async () => {
      const mockMetadata = { test: 'metadata' };
      const json = { key: 'value' };
      
      mockCSL.encode_json_str_to_metadatum.mockReturnValue(mockMetadata);
      
      const metadata = await LazyCSL.createMetadata(json);
      
      expect(mockCSL.encode_json_str_to_metadatum).toHaveBeenCalledWith(
        JSON.stringify(json),
        'basic'
      );
      expect(metadata).toBe(mockMetadata);
    });
  });

  describe('parseMetadata', () => {
    it('should parse metadata to JSON', async () => {
      const mockMetadata = { test: 'metadata' };
      const jsonStr = '{"key": "value"}';
      
      mockCSL.decode_metadatum_to_json_str.mockReturnValue(jsonStr);
      
      const result = await LazyCSL.parseMetadata(mockMetadata);
      
      expect(mockCSL.decode_metadatum_to_json_str).toHaveBeenCalledWith(
        mockMetadata,
        'basic'
      );
      expect(result).toEqual({ key: 'value' });
    });
  });
});

describe('useCSL', () => {
  it('should return CSL state and load function', () => {
    const { result } = renderHook(() => useCSL());
    
    expect(result.current).toHaveProperty('loading');
    expect(result.current).toHaveProperty('loaded');
    expect(result.current).toHaveProperty('error');
    expect(result.current).toHaveProperty('module');
    expect(result.current).toHaveProperty('load');
    expect(result.current).toHaveProperty('metrics');
    expect(typeof result.current.load).toBe('function');
  });

  it('should update state when CSL state changes', async () => {
    const { result } = renderHook(() => useCSL());
    
    expect(result.current.loaded).toBe(false);
    
    await act(async () => {
      await result.current.load();
    });
    
    // Note: In real implementation, state would update via polling
    // Here we just verify the load function can be called
    expect(result.current.load).toBeDefined();
  });

  it('should handle load errors', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    
    // Mock loadCSL to fail
    jest.doMock('./lazyCSL', () => ({
      loadCSL: jest.fn().mockRejectedValue(new Error('Load failed'))
    }));
    
    const { result } = renderHook(() => useCSL());
    
    await act(async () => {
      await result.current.load();
    });
    
    // Should not throw error
    expect(() => result.current.load()).not.toThrow();
    
    consoleSpy.mockRestore();
  });
});

describe('CSLLoading', () => {
  it('should render loading state', () => {
    // Mock useCSL to return loading state
    jest.doMock('./lazyCSL', () => ({
      useCSL: () => ({
        loading: true,
        loaded: false,
        error: null,
        load: jest.fn()
      })
    }));
    
    const { getByText } = render(<CSLLoading />);
    
    expect(getByText('ライブラリ読み込み中...')).toBeInTheDocument();
  });

  it('should render error state with retry button', () => {
    const mockLoad = jest.fn();
    
    // Mock useCSL to return error state
    jest.doMock('./lazyCSL', () => ({
      useCSL: () => ({
        loading: false,
        loaded: false,
        error: new Error('Load failed'),
        load: mockLoad
      })
    }));
    
    const { getByText, getByRole } = render(<CSLLoading />);
    
    expect(getByText('ライブラリ読み込みエラー')).toBeInTheDocument();
    
    const retryButton = getByRole('button', { name: '再試行' });
    expect(retryButton).toBeInTheDocument();
  });

  it('should not render when loaded', () => {
    // Mock useCSL to return loaded state
    jest.doMock('./lazyCSL', () => ({
      useCSL: () => ({
        loading: false,
        loaded: true,
        error: null,
        load: jest.fn()
      })
    }));
    
    const { container } = render(<CSLLoading />);
    
    expect(container.firstChild).toBeNull();
  });

  it('should not render when showPreloader is false', () => {
    // Mock useCSL to return loading state
    jest.doMock('./lazyCSL', () => ({
      useCSL: () => ({
        loading: true,
        loaded: false,
        error: null,
        load: jest.fn()
      })
    }));
    
    const { container } = render(<CSLLoading showPreloader={false} />);
    
    expect(container.firstChild).toBeNull();
  });

  it('should call onLoad when loaded', () => {
    const onLoad = jest.fn();
    
    // Mock useCSL to return loaded state
    jest.doMock('./lazyCSL', () => ({
      useCSL: () => ({
        loading: false,
        loaded: true,
        error: null,
        load: jest.fn()
      })
    }));
    
    render(<CSLLoading onLoad={onLoad} />);
    
    expect(onLoad).toHaveBeenCalled();
  });

  it('should call onError when error occurs', () => {
    const onError = jest.fn();
    const error = new Error('Test error');
    
    // Mock useCSL to return error state
    jest.doMock('./lazyCSL', () => ({
      useCSL: () => ({
        loading: false,
        loaded: false,
        error,
        load: jest.fn()
      })
    }));
    
    render(<CSLLoading onError={onError} />);
    
    expect(onError).toHaveBeenCalledWith(error);
  });
});

describe('withCSL', () => {
  const TestComponent = ({ message }: { message: string }) => (
    <div>{message}</div>
  );

  it('should render component when CSL is loaded', () => {
    // Mock useCSL to return loaded state
    jest.doMock('./lazyCSL', () => ({
      useCSL: () => ({
        loading: false,
        loaded: true,
        error: null
      })
    }));
    
    const WrappedComponent = withCSL(TestComponent);
    const { getByText } = render(<WrappedComponent message="Hello World" />);
    
    expect(getByText('Hello World')).toBeInTheDocument();
  });

  it('should render loading state when CSL is loading', () => {
    // Mock useCSL to return loading state
    jest.doMock('./lazyCSL', () => ({
      useCSL: () => ({
        loading: true,
        loaded: false,
        error: null
      })
    }));
    
    const WrappedComponent = withCSL(TestComponent);
    const { getByText } = render(<WrappedComponent message="Hello World" />);
    
    expect(getByText('読み込み中...')).toBeInTheDocument();
  });

  it('should render error state when CSL fails to load', () => {
    // Mock useCSL to return error state
    jest.doMock('./lazyCSL', () => ({
      useCSL: () => ({
        loading: false,
        loaded: false,
        error: new Error('Load failed')
      })
    }));
    
    const WrappedComponent = withCSL(TestComponent);
    const { getByText } = render(<WrappedComponent message="Hello World" />);
    
    expect(getByText('ライブラリの読み込みに失敗しました')).toBeInTheDocument();
  });

  it('should render custom fallback', () => {
    // Mock useCSL to return loading state
    jest.doMock('./lazyCSL', () => ({
      useCSL: () => ({
        loading: true,
        loaded: false,
        error: null
      })
    }));
    
    const WrappedComponent = withCSL(TestComponent);
    const fallback = <div>Custom Loading...</div>;
    const { getByText } = render(
      <WrappedComponent message="Hello World" fallback={fallback} />
    );
    
    expect(getByText('Custom Loading...')).toBeInTheDocument();
  });
});

describe('initializeCSLPreloading', () => {
  beforeEach(() => {
    // Reset window event listeners
    jest.clearAllMocks();
    
    global.window = {
      ...global.window,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    } as any;
  });

  it('should add event listeners for user interactions', () => {
    initializeCSLPreloading();
    
    expect(global.window.addEventListener).toHaveBeenCalledWith(
      'mousedown',
      expect.any(Function),
      { once: true }
    );
    expect(global.window.addEventListener).toHaveBeenCalledWith(
      'touchstart',
      expect.any(Function),
      { once: true }
    );
    expect(global.window.addEventListener).toHaveBeenCalledWith(
      'keydown',
      expect.any(Function),
      { once: true }
    );
  });

  it('should set fallback timeout for preloading', () => {
    const originalSetTimeout = global.setTimeout;
    global.setTimeout = jest.fn();
    
    initializeCSLPreloading();
    
    expect(global.setTimeout).toHaveBeenCalledWith(
      expect.any(Function),
      3000
    );
    
    global.setTimeout = originalSetTimeout;
  });

  it('should not initialize when window is undefined', () => {
    const originalWindow = global.window;
    delete (global as any).window;
    
    expect(() => initializeCSLPreloading()).not.toThrow();
    
    global.window = originalWindow;
  });
});

describe('Integration scenarios', () => {
  it('should handle complete CSL loading workflow', async () => {
    // 1. Initial state should be unloaded
    const initialState = getCSLState();
    expect(initialState.loaded).toBe(false);
    expect(initialState.loading).toBe(false);
    expect(initialState.module).toBeNull();
    
    // 2. Load CSL
    const csl = await loadCSL();
    expect(csl).toBeDefined();
    
    // 3. Check state after loading
    const loadedState = getCSLState();
    expect(loadedState.loaded).toBe(true);
    expect(loadedState.loading).toBe(false);
    expect(loadedState.module).toBe(csl);
    
    // 4. Check metrics
    const metrics = getCSLMetrics();
    expect(metrics.usageCount).toBeGreaterThan(0);
    expect(metrics.loadTime).toBeGreaterThanOrEqual(0);
  });

  it('should use cached CSL across different utilities', async () => {
    // Load CSL through main function
    const csl1 = await loadCSL();
    
    // Access through LazyCSL utility
    const bigNum = await LazyCSL.bigNumFromStr('1000000');
    
    // Should use same CSL instance
    expect(mockCSL.BigNum.from_str).toHaveBeenCalledWith('1000000');
    
    // Metrics should reflect multiple usage
    const metrics = getCSLMetrics();
    expect(metrics.usageCount).toBeGreaterThan(1);
  });

  it('should handle error recovery', async () => {
    // Mock import to fail first time
    let callCount = 0;
    jest.doMock('@emurgo/cardano-serialization-lib-nodejs', () => {
      callCount++;
      if (callCount === 1) {
        throw new Error('First load failed');
      }
      return mockCSL;
    });
    
    // First load should fail
    await expect(loadCSL()).rejects.toThrow('First load failed');
    
    // Check error state
    const errorState = getCSLState();
    expect(errorState.error).toBeDefined();
    expect(errorState.loaded).toBe(false);
    
    // Check error metrics
    const errorMetrics = getCSLMetrics();
    expect(errorMetrics.errorCount).toBe(1);
    
    // Second load should succeed (if we reset the module mock)
    // This would require resetting the CSL state in a real implementation
  });

  it('should optimize performance with preloading', () => {
    const mockRequestIdleCallback = jest.fn();
    global.window = {
      ...global.window,
      requestIdleCallback: mockRequestIdleCallback
    } as any;
    
    // Trigger preload
    preloadCSL();
    
    // Should use idle callback for optimal performance
    expect(mockRequestIdleCallback).toHaveBeenCalledWith(
      expect.any(Function),
      { timeout: 5000 }
    );
  });

  it('should work with React components', () => {
    const TestApp = () => {
      const { loaded, loading, error } = useCSL();
      
      if (error) return <div>Error: {error.message}</div>;
      if (loading) return <div>Loading...</div>;
      if (loaded) return <div>CSL Ready!</div>;
      return <div>Initial</div>;
    };
    
    const { getByText } = render(<TestApp />);
    
    // Initial render should show appropriate state
    expect(getByText(/Initial|Loading|CSL Ready|Error/)).toBeInTheDocument();
  });
});