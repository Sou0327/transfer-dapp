// テストセットアップファイル

import '@testing-library/jest-dom/vitest'
import { TextEncoder, TextDecoder } from 'util'
import { vi, afterEach } from 'vitest'

// グローバルオブジェクトの設定
global.TextEncoder = TextEncoder
// Node.js TextDecoder を Web API TextDecoder として型アサーション
global.TextDecoder = TextDecoder as unknown as typeof global.TextDecoder

// Web Crypto API のモック
const mockCrypto = {
  getRandomValues: vi.fn((arr: Uint8Array) => {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = Math.floor(Math.random() * 256)
    }
    return arr
  }),
  randomUUID: vi.fn(() => 'test-uuid-' + Math.random().toString(36).substr(2, 9)),
  subtle: {
    generateKey: vi.fn().mockResolvedValue({}),
    encrypt: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
    decrypt: vi.fn().mockResolvedValue(new ArrayBuffer(32))
  }
}

Object.defineProperty(global, 'crypto', {
  value: mockCrypto,
  writable: true
})

// Window オブジェクトのモック
Object.defineProperty(window, 'location', {
  value: {
    href: 'https://localhost:3000',
    protocol: 'https:',
    hostname: 'localhost',
    origin: 'https://localhost:3000',
    replace: vi.fn()
  },
  writable: true
})

// localStorage のモック
const mockStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn()
}

Object.defineProperty(window, 'localStorage', {
  value: mockStorage,
  writable: true
})

Object.defineProperty(window, 'sessionStorage', {
  value: mockStorage,
  writable: true
})

// Ethereum provider のモック
const mockEthereumProvider = {
  isMetaMask: true,
  request: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
  selectedAddress: null,
  chainId: '0x1'
}

Object.defineProperty(window, 'ethereum', {
  value: mockEthereumProvider,
  writable: true
})

// TronWeb のモック
const mockTronWeb = {
  ready: true,
  defaultAddress: {
    base58: null
  },
  trx: {
    getAccount: vi.fn(),
    getBalance: vi.fn(),
    sign: vi.fn(),
    sendRawTransaction: vi.fn()
  },
  contract: vi.fn()
}

Object.defineProperty(window, 'tronWeb', {
  value: mockTronWeb,
  writable: true
})

// IntersectionObserver のモック
global.IntersectionObserver = vi.fn().mockImplementation((_callback) => ({ // eslint-disable-line @typescript-eslint/no-unused-vars
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn()
}))

// ResizeObserver のモック
global.ResizeObserver = vi.fn().mockImplementation((_callback) => ({ // eslint-disable-line @typescript-eslint/no-unused-vars
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn()
}))

// Performance API のモック
Object.defineProperty(global, 'performance', {
  value: {
    mark: vi.fn(),
    measure: vi.fn(),
    getEntriesByName: vi.fn().mockReturnValue([{ duration: 100 }]),
    clearMarks: vi.fn(),
    clearMeasures: vi.fn(),
    now: vi.fn(() => Date.now()),
    memory: {
      usedJSHeapSize: 1024 * 1024,
      totalJSHeapSize: 1024 * 1024 * 10
    }
  },
  writable: true
})

// Image のモック
global.Image = vi.fn().mockImplementation(() => ({
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  src: '',
  onload: null,
  onerror: null
}))

// FontFace のモック
global.FontFace = vi.fn().mockImplementation((name, source) => ({
  family: name,
  source,
  load: vi.fn().mockResolvedValue({}),
  status: 'loaded'
}))

// Worker のモック
global.Worker = vi.fn().mockImplementation((_url) => ({ // eslint-disable-line @typescript-eslint/no-unused-vars
  postMessage: vi.fn(),
  terminate: vi.fn(),
  onmessage: null,
  onerror: null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn()
}))

// URL のモック（Node.js環境での互換性）
if (typeof global.URL === 'undefined') {
  global.URL = URL
}

// コンソール警告の抑制（テスト環境用）
const originalConsoleWarn = console.warn
console.warn = (message: unknown, ...args: unknown[]) => {
  // React Testing Library の警告を抑制
  if (
    typeof message === 'string' &&
    (message.includes('Warning: ReactDOM.render') ||
     message.includes('Warning: render'))
  ) {
    return
  }
  originalConsoleWarn(message, ...args)
}

// エラーハンドリングのモック（必要に応じて有効化）
// vi.mock('@/utils/errorHandler', () => ({
//   errorHandler: {
//     createAppError: vi.fn(),
//     handleError: vi.fn(),
//     handleWalletError: vi.fn(),
//     handleTransactionError: vi.fn(),
//     handleNetworkError: vi.fn(),
//     handleValidationError: vi.fn(),
//     handleStorageError: vi.fn()
//   }
// }))

// テスト後のクリーンアップ
afterEach(() => {
  vi.clearAllMocks()
  vi.clearAllTimers()
})

// 非同期テストのタイムアウト設定
vi.setConfig({
  testTimeout: 10000
})