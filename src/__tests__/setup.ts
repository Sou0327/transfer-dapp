/**
 * Test Setup Configuration
 * Global test setup for Jest and Testing Library
 */

import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';
import { jest } from '@jest/globals';

// Configure Testing Library
configure({
  testIdAttribute: 'data-testid',
  asyncUtilTimeout: 5000
});

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.REACT_APP_NETWORK = 'testnet';
process.env.REACT_APP_BLOCKFROST_API_KEY = 'test-api-key';

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
global.localStorage = localStorageMock as any;

// Mock sessionStorage
const sessionStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
global.sessionStorage = sessionStorageMock as any;

// Mock fetch
global.fetch = jest.fn();

// Mock performance API
global.performance = {
  ...global.performance,
  now: jest.fn(() => Date.now()),
  mark: jest.fn(),
  measure: jest.fn(),
  getEntriesByType: jest.fn(() => []),
  getEntriesByName: jest.fn(() => []),
} as any;

// Mock IntersectionObserver
global.IntersectionObserver = jest.fn().mockImplementation((callback) => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
  callback
}));

// Mock ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation((callback) => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
  callback
}));

// Mock requestIdleCallback
global.requestIdleCallback = jest.fn((callback) => {
  return setTimeout(callback, 0);
});

global.cancelIdleCallback = jest.fn((id) => {
  clearTimeout(id);
});

// Mock Web Crypto API
const mockCrypto = {
  getRandomValues: jest.fn((arr: Uint8Array) => {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = Math.floor(Math.random() * 256);
    }
    return arr;
  }),
  subtle: {
    digest: jest.fn().mockResolvedValue(new ArrayBuffer(32)),
    sign: jest.fn().mockResolvedValue(new ArrayBuffer(64)),
    verify: jest.fn().mockResolvedValue(true),
    generateKey: jest.fn().mockResolvedValue({}),
    importKey: jest.fn().mockResolvedValue({}),
    exportKey: jest.fn().mockResolvedValue(new ArrayBuffer(32)),
  }
};

global.crypto = mockCrypto as any;

// Mock window.cardano (CIP-30)
const mockWallet = {
  enable: jest.fn().mockResolvedValue({
    getBalance: jest.fn().mockResolvedValue('1000000000'),
    getUtxos: jest.fn().mockResolvedValue([]),
    getUsedAddresses: jest.fn().mockResolvedValue([]),
    getUnusedAddresses: jest.fn().mockResolvedValue([]),
    getChangeAddress: jest.fn().mockResolvedValue('addr_test1234'),
    getRewardAddresses: jest.fn().mockResolvedValue([]),
    signTx: jest.fn().mockResolvedValue({
      witnesses: new Uint8Array([1, 2, 3])
    }),
    signData: jest.fn().mockResolvedValue({
      signature: new Uint8Array([4, 5, 6]),
      key: new Uint8Array([7, 8, 9])
    }),
    submitTx: jest.fn().mockResolvedValue('txhash123'),
    getNetworkId: jest.fn().mockResolvedValue(0),
    experimental: {
      getCollateral: jest.fn().mockResolvedValue([])
    }
  }),
  isEnabled: jest.fn().mockResolvedValue(false),
  name: 'TestWallet',
  icon: 'data:image/svg+xml;base64,test',
  apiVersion: '1.0.0'
};

global.window = {
  ...global.window,
  cardano: {
    nami: mockWallet,
    eternl: mockWallet,
    flint: mockWallet,
    yoroi: mockWallet,
    gerowallet: mockWallet,
    nufi: mockWallet,
    typhon: mockWallet,
    lode: mockWallet
  } as any,
  location: {
    ...global.window?.location,
    href: 'http://localhost:3000',
    origin: 'http://localhost:3000',
    pathname: '/',
    search: '',
    hash: ''
  } as any,
  navigator: {
    ...global.window?.navigator,
    userAgent: 'jest-test-environment'
  } as any
};

// Mock console methods in tests to reduce noise
const originalError = console.error;
const originalWarn = console.warn;
const originalLog = console.log;

beforeAll(() => {
  console.error = (...args: any[]) => {
    // Allow specific error patterns that we want to see in tests
    if (
      args[0]?.includes?.('Warning:') ||
      args[0]?.includes?.('Error:') ||
      args[0]?.includes?.('Failed')
    ) {
      return;
    }
    originalError(...args);
  };

  console.warn = (...args: any[]) => {
    // Suppress specific warnings
    if (
      args[0]?.includes?.('React.createFactory') ||
      args[0]?.includes?.('componentWillReceiveProps') ||
      args[0]?.includes?.('componentWillMount')
    ) {
      return;
    }
    originalWarn(...args);
  };

  console.log = (...args: any[]) => {
    // Suppress most logs in tests unless explicitly needed
    if (process.env.DEBUG_TESTS) {
      originalLog(...args);
    }
  };
});

afterAll(() => {
  console.error = originalError;
  console.warn = originalWarn;
  console.log = originalLog;
});

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
  localStorageMock.clear();
  sessionStorageMock.clear();
});

// Global test utilities
export const testUtils = {
  // Mock wallet responses
  mockWalletResponse: (method: string, response: any) => {
    const walletMethods = mockWallet.enable as jest.Mock;
    walletMethods.mockResolvedValueOnce({
      [method]: jest.fn().mockResolvedValue(response)
    });
  },

  // Mock fetch responses
  mockFetchResponse: (response: any, status = 200) => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      json: async () => response,
      text: async () => JSON.stringify(response),
      headers: new Map([['content-type', 'application/json']])
    });
  },

  // Mock localStorage
  mockLocalStorage: (key: string, value: any) => {
    (localStorage.getItem as jest.Mock).mockReturnValue(
      typeof value === 'string' ? value : JSON.stringify(value)
    );
  },

  // Wait for async operations
  waitFor: async (fn: () => void | Promise<void>, timeout = 1000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        await fn();
        return;
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    throw new Error(`waitFor timeout after ${timeout}ms`);
  },

  // Create mock date
  mockDate: (date: string | Date) => {
    const mockDate = new Date(date);
    jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);
    return mockDate;
  },

  // Mock timers
  mockTimers: () => {
    jest.useFakeTimers();
    return {
      advanceTimersByTime: jest.advanceTimersByTime,
      runAllTimers: jest.runAllTimers,
      runOnlyPendingTimers: jest.runOnlyPendingTimers,
      restore: jest.useRealTimers
    };
  }
};

// Export for use in tests
export { mockWallet };

// Type declarations for Jest globals
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeInTheDocument(): R;
      toHaveClass(className: string): R;
      toHaveAttribute(attribute: string, value?: string): R;
      toHaveTextContent(text: string | RegExp): R;
      toBeVisible(): R;
      toBeDisabled(): R;
      toBeEnabled(): R;
      toHaveFocus(): R;
    }
  }
}