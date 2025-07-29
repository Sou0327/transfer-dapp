// テストユーティリティ関数

import React, { ReactElement } from 'react'
import { render, RenderOptions, RenderResult } from '@testing-library/react'
import { vi } from 'vitest'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { ToastProvider } from '@/contexts/ToastContext'
import { SecurityProvider } from '@/hooks/useSecurity'

/**
 * カスタムプロバイダーラッパー
 */
const AllProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <ThemeProvider>
      <ToastProvider>
        <SecurityProvider>
          {children}
        </SecurityProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}

/**
 * カスタムレンダー関数
 */
export const renderWithProviders = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
): RenderResult => {
  return render(ui, { wrapper: AllProviders, ...options })
}

/**
 * 特定のプロバイダーのみでレンダー
 */
export const renderWithTheme = (ui: ReactElement, options?: RenderOptions) => {
  return render(ui, { wrapper: ThemeProvider, ...options })
}

export const renderWithToast = (ui: ReactElement, options?: RenderOptions) => {
  return render(ui, { wrapper: ToastProvider, ...options })
}

export const renderWithSecurity = (ui: ReactElement, options?: RenderOptions) => {
  return render(ui, { wrapper: SecurityProvider, ...options })
}

/**
 * モックファクトリー関数
 */
export const createMockWalletState = (overrides = {}) => ({
  account: '0x1234567890123456789012345678901234567890',
  chainId: 1,
  provider: null,
  isConnecting: false,
  error: null,
  ...overrides
})

export const createMockMultiWalletState = (overrides = {}) => ({
  metamask: {
    isConnected: false,
    account: null,
    chainId: null,
    currentNetwork: null,
    error: null,
    walletStatus: {
      isInstalled: true,
      isUnlocked: false,
      canTransact: false
    },
    ...overrides.metamask
  },
  tronlink: {
    isConnected: false,
    account: null,
    network: null,
    currentNetwork: null,
    error: null,
    walletStatus: {
      isInstalled: true,
      isUnlocked: false,
      canTransact: false
    },
    ...overrides.tronlink
  },
  connectionStatus: {
    ethereum: { isConnected: false, canTransact: false },
    tron: { isConnected: false, canTransact: false }
  },
  multiWalletStatus: {
    hasConnectedWallet: false,
    hasMultipleConnections: false,
    canTransact: false
  },
  ...overrides
})

export const createMockTransactionHistory = (count = 5) => {
  return Array.from({ length: count }, (_, index) => ({
    id: `tx-${index}`,
    hash: `0x${Math.random().toString(16).substr(2, 64)}`,
    chain: Math.random() > 0.5 ? 'ethereum' : 'tron',
    type: 'transfer',
    status: Math.random() > 0.2 ? 'confirmed' : 'pending',
    timestamp: Date.now() - (index * 60000),
    from: '0x1234567890123456789012345678901234567890',
    to: '0x0987654321098765432109876543210987654321',
    amount: (Math.random() * 100).toFixed(6),
    token: {
      address: '0xA0b86a33E6180d0FF51aC5A5F6224c8a4e4FB6A6',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6
    },
    gasUsed: '21000',
    gasPrice: '20000000000',
    fee: '0.00042',
    metadata: {
      notes: `Test transaction ${index}`,
      tags: ['test']
    }
  }))
}

export const createMockTokenBalance = (overrides = {}) => ({
  balance: '1000.0',
  formatted: '1,000.00',
  lastUpdated: Date.now(),
  ...overrides
})

export const createMockToken = (overrides = {}) => ({
  address: '0xA0b86a33E6180d0FF51aC5A5F6224c8a4e4FB6A6',
  name: 'USD Coin',
  symbol: 'USDC',
  decimals: 6,
  logo: 'https://example.com/usdc.png',
  ...overrides
})

export const createMockNetworkInfo = (overrides = {}) => ({
  chainId: 1,
  name: 'Ethereum Mainnet',
  symbol: 'ETH',
  rpcUrl: 'https://mainnet.infura.io/v3/test',
  blockExplorerUrl: 'https://etherscan.io',
  ...overrides
})

/**
 * 非同期テストヘルパー
 */
export const waitForAsyncUpdate = (ms = 0) => {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export const flushPromises = () => {
  return new Promise(resolve => setImmediate(resolve))
}

/**
 * イベントハンドラーのモック作成
 */
export const createMockEventHandlers = () => ({
  onClick: vi.fn(),
  onChange: vi.fn(),
  onSubmit: vi.fn(),
  onConnect: vi.fn(),
  onDisconnect: vi.fn(),
  onTransfer: vi.fn(),
  onError: vi.fn(),
  onSuccess: vi.fn()
})

/**
 * API レスポンスのモック作成
 */
export const createMockApiResponse = <T>(data: T, overrides = {}) => ({
  success: true,
  data,
  error: null,
  message: 'Success',
  timestamp: Date.now(),
  ...overrides
})

export const createMockApiError = (message = 'API Error', code = 'UNKNOWN_ERROR') => ({
  success: false,
  data: null,
  error: code,
  message,
  timestamp: Date.now()
})

/**
 * パフォーマンステストヘルパー
 */
export const measureRenderTime = async (renderFn: () => Promise<any> | any) => {
  const start = performance.now()
  await renderFn()
  const end = performance.now()
  return end - start
}

export const expectRenderTimeUnder = async (renderFn: () => Promise<any> | any, maxMs: number) => {
  const renderTime = await measureRenderTime(renderFn)
  expect(renderTime).toBeLessThan(maxMs)
}

/**
 * DOM テストヘルパー
 */
export const getByDataTestId = (container: HTMLElement, testId: string) => {
  return container.querySelector(`[data-testid="${testId}"]`)
}

export const getAllByDataTestId = (container: HTMLElement, testId: string) => {
  return container.querySelectorAll(`[data-testid="${testId}"]`)
}

/**
 * フォームテストヘルパー
 */
export const fillForm = (container: HTMLElement, formData: Record<string, string>) => {
  Object.entries(formData).forEach(([name, value]) => {
    const input = container.querySelector(`[name="${name}"]`) as HTMLInputElement
    if (input) {
      input.value = value
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }
  })
}

export const submitForm = (container: HTMLElement, formSelector = 'form') => {
  const form = container.querySelector(formSelector) as HTMLFormElement
  if (form) {
    form.dispatchEvent(new Event('submit', { bubbles: true }))
  }
}

/**
 * ストレージモックヘルパー
 */
export const createStorageMock = () => {
  const storage = new Map<string, string>()
  
  return {
    getItem: vi.fn((key: string) => storage.get(key) || null),
    setItem: vi.fn((key: string, value: string) => {
      storage.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      storage.delete(key)
    }),
    clear: vi.fn(() => {
      storage.clear()
    }),
    length: storage.size,
    key: vi.fn((index: number) => {
      const keys = Array.from(storage.keys())
      return keys[index] || null
    })
  }
}

/**
 * Web3 モックヘルパー
 */
export const createWeb3Mock = () => ({
  eth: {
    getAccounts: vi.fn().mockResolvedValue(['0x1234567890123456789012345678901234567890']),
    getBalance: vi.fn().mockResolvedValue('1000000000000000000'),
    getChainId: vi.fn().mockResolvedValue(1),
    sendTransaction: vi.fn().mockResolvedValue({
      hash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
    }),
    Contract: vi.fn().mockImplementation(() => ({
      methods: {
        transfer: vi.fn().mockReturnValue({
          send: vi.fn().mockResolvedValue({
            transactionHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
          })
        }),
        balanceOf: vi.fn().mockReturnValue({
          call: vi.fn().mockResolvedValue('1000000000')
        })
      }
    }))
  },
  utils: {
    toWei: vi.fn((value, unit) => `${value}000000000000000000`),
    fromWei: vi.fn((value, unit) => (parseInt(value) / 1e18).toString()),
    isAddress: vi.fn().mockReturnValue(true)
  }
})

/**
 * セキュリティテストヘルパー
 */
export const createSecurityTestData = () => ({
  xssPayload: '<script>alert("xss")</script>',
  sqlInjectionPayload: "'; DROP TABLE users; --",
  validPrivateKey: '0x' + '1'.repeat(64),
  invalidPrivateKey: '0x' + '0'.repeat(64),
  validEthereumAddress: '0x1234567890123456789012345678901234567890',
  invalidEthereumAddress: '0x123',
  validTronAddress: 'TLyqzVGLV1srkB7dToTAEqgDSfPtXRJZYH',
  invalidTronAddress: 'TR123'
})

/**
 * エラーテストヘルパー
 */
export const expectErrorToBeLogged = (mockErrorHandler: any, errorCode: string) => {
  expect(mockErrorHandler.handleError).toHaveBeenCalledWith(
    expect.objectContaining({ code: errorCode }),
    expect.any(String),
    expect.any(Object)
  )
}

export const expectNoErrors = (mockErrorHandler: any) => {
  expect(mockErrorHandler.handleError).not.toHaveBeenCalled()
}

/**
 * タイマーテストヘルパー
 */
export const advanceTimersByTime = (ms: number) => {
  vi.advanceTimersByTime(ms)
}

export const runAllTimers = () => {
  vi.runAllTimers()
}

/**
 * クリーンアップヘルパー
 */
export const cleanup = () => {
  vi.clearAllMocks()
  vi.clearAllTimers()
  vi.resetModules()
}

// デフォルトエクスポート
export * from '@testing-library/react'
export * from '@testing-library/user-event'
export { vi as mockFn } from 'vitest'