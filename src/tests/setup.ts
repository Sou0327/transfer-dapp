import '@testing-library/jest-dom'
import { vi } from 'vitest'

// MetaMaskプロバイダーのモック
Object.defineProperty(window, 'ethereum', {
  value: {
    request: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
    selectedAddress: null,
    chainId: '0x1',
    isMetaMask: true,
  },
  writable: true,
})

// ローカルストレージのモック
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
  writable: true,
})