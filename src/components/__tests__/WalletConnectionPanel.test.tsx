// WalletConnectionPanel コンポーネントのテスト

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WalletConnectionPanel } from '../WalletConnectionPanel'
import { 
  renderWithProviders, 
  createMockMultiWalletState, 
  createMockEventHandlers,
  expectRenderTimeUnder
} from '@/test/utils'

// MultiWallet フックのモック
const mockMultiWallet = {
  ...createMockMultiWalletState(),
  connectToChain: vi.fn(),
  disconnectWallet: vi.fn(),
  autoConnect: vi.fn()
}

vi.mock('@/hooks/useMultiWallet', () => ({
  useMultiWallet: () => mockMultiWallet
}))

// Toast コンテキストのモック
const mockToast = {
  addToast: vi.fn(),
  removeToast: vi.fn(),
  clearToasts: vi.fn(),
  toasts: []
}

vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => mockToast
}))

describe('WalletConnectionPanel', () => {
  const defaultProps = {
    className: 'test-class',
    showChainSwitcher: true,
    ...createMockEventHandlers()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // デフォルト状態にリセット
    Object.assign(mockMultiWallet, createMockMultiWalletState())
  })

  describe('基本レンダリング', () => {
    it('正常にレンダリングされる', () => {
      renderWithProviders(<WalletConnectionPanel {...defaultProps} />)
      
      expect(screen.getByText('ウォレット接続')).toBeInTheDocument()
      expect(screen.getByText('MetaMask')).toBeInTheDocument()
      expect(screen.getByText('TronLink')).toBeInTheDocument()
    })

    it('カスタムクラスが適用される', () => {
      const { container } = renderWithProviders(
        <WalletConnectionPanel {...defaultProps} className="custom-class" />
      )
      
      const panel = container.querySelector('.wallet-connection-panel')
      expect(panel).toHaveClass('custom-class')
    })

    it('パフォーマンステスト: 100ms以内でレンダリングされる', async () => {
      await expectRenderTimeUnder(
        () => renderWithProviders(<WalletConnectionPanel {...defaultProps} />),
        100
      )
    })
  })

  describe('ウォレット未接続状態', () => {
    it('自動接続ボタンが表示される', () => {
      renderWithProviders(<WalletConnectionPanel {...defaultProps} />)
      
      expect(screen.getByText('自動接続')).toBeInTheDocument()
    })

    it('各ウォレットの接続ボタンが表示される', () => {
      renderWithProviders(<WalletConnectionPanel {...defaultProps} />)
      
      const connectButtons = screen.getAllByText('接続')
      expect(connectButtons).toHaveLength(2) // MetaMask + TronLink
    })

    it('ウォレット未インストール時にインストールリンクが表示される', () => {
      mockMultiWallet.metamask.walletStatus.isInstalled = false
      
      renderWithProviders(<WalletConnectionPanel {...defaultProps} />)
      
      const installLinks = screen.getAllByText('インストール')
      expect(installLinks.length).toBeGreaterThan(0)
    })
  })

  describe('ウォレット接続処理', () => {
    it('MetaMask接続ボタンクリック時に正しい処理が呼ばれる', async () => {
      mockMultiWallet.connectToChain.mockResolvedValue(true)
      const user = userEvent.setup()
      
      renderWithProviders(<WalletConnectionPanel {...defaultProps} />)
      
      const metamaskConnectButton = screen.getAllByText('接続')[0]
      await user.click(metamaskConnectButton)
      
      expect(mockMultiWallet.connectToChain).toHaveBeenCalledWith('ethereum')
    })

    it('TronLink接続ボタンクリック時に正しい処理が呼ばれる', async () => {
      mockMultiWallet.connectToChain.mockResolvedValue(true)
      const user = userEvent.setup()
      
      renderWithProviders(<WalletConnectionPanel {...defaultProps} />)
      
      const tronlinkConnectButton = screen.getAllByText('接続')[1]
      await user.click(tronlinkConnectButton)
      
      expect(mockMultiWallet.connectToChain).toHaveBeenCalledWith('tron')
    })

    it('自動接続ボタンクリック時に正しい処理が呼ばれる', async () => {
      const user = userEvent.setup()
      
      renderWithProviders(<WalletConnectionPanel {...defaultProps} />)
      
      const autoConnectButton = screen.getByText('自動接続')
      await user.click(autoConnectButton)
      
      expect(mockMultiWallet.autoConnect).toHaveBeenCalled()
    })

    it('接続成功時にonConnectコールバックが呼ばれる', async () => {
      mockMultiWallet.connectToChain.mockResolvedValue(true)
      const user = userEvent.setup()
      
      renderWithProviders(<WalletConnectionPanel {...defaultProps} />)
      
      const connectButton = screen.getAllByText('接続')[0]
      await user.click(connectButton)
      
      await waitFor(() => {
        expect(defaultProps.onConnect).toHaveBeenCalledWith('ethereum')
      })
    })

    it('接続中は適切なローディング状態が表示される', async () => {
      mockMultiWallet.connectToChain.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(true), 100))
      )
      const user = userEvent.setup()
      
      renderWithProviders(<WalletConnectionPanel {...defaultProps} />)
      
      const connectButton = screen.getAllByText('接続')[0]
      await user.click(connectButton)
      
      expect(screen.getByText('接続中...')).toBeInTheDocument()
      
      await waitFor(() => {
        expect(screen.queryByText('接続中...')).not.toBeInTheDocument()
      })
    })
  })

  describe('ウォレット接続済み状態', () => {
    beforeEach(() => {
      mockMultiWallet.metamask = {
        ...mockMultiWallet.metamask,
        isConnected: true,
        account: '0x1234567890123456789012345678901234567890',
        chainId: 1,
        currentNetwork: { name: 'Ethereum Mainnet' },
        walletStatus: {
          isInstalled: true,
          isUnlocked: true,
          canTransact: true
        }
      }
      mockMultiWallet.connectionStatus.ethereum = {
        isConnected: true,
        canTransact: true
      }
      mockMultiWallet.multiWalletStatus = {
        hasConnectedWallet: true,
        hasMultipleConnections: false,
        canTransact: true
      }
    })

    it('接続済みウォレットの情報が表示される', () => {
      renderWithProviders(<WalletConnectionPanel {...defaultProps} />)
      
      expect(screen.getByText('0x1234...7890')).toBeInTheDocument()
      expect(screen.getByText('Ethereum Mainnet')).toBeInTheDocument()
      expect(screen.getByText('準備完了')).toBeInTheDocument()
    })

    it('切断ボタンが表示される', () => {
      renderWithProviders(<WalletConnectionPanel {...defaultProps} />)
      
      expect(screen.getByText('切断')).toBeInTheDocument()
    })

    it('切断ボタンクリック時に正しい処理が呼ばれる', async () => {
      const user = userEvent.setup()
      
      renderWithProviders(<WalletConnectionPanel {...defaultProps} />)
      
      const disconnectButton = screen.getByText('切断')
      await user.click(disconnectButton)
      
      expect(mockMultiWallet.disconnectWallet).toHaveBeenCalledWith('metamask')
      expect(defaultProps.onDisconnect).toHaveBeenCalledWith('ethereum')
    })

    it('接続状況サマリーが表示される', () => {
      renderWithProviders(<WalletConnectionPanel {...defaultProps} />)
      
      expect(screen.getByText('接続状況')).toBeInTheDocument()
      expect(screen.getByText('1 / 2')).toBeInTheDocument()
    })

    it('アドレスコピーボタンが機能する', async () => {
      // clipboard APIのモック
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockResolvedValue(undefined)
        }
      })
      
      const user = userEvent.setup()
      
      renderWithProviders(<WalletConnectionPanel {...defaultProps} />)
      
      const copyButton = screen.getByTitle('アドレスをコピー')
      await user.click(copyButton)
      
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        '0x1234567890123456789012345678901234567890'
      )
    })
  })

  describe('複数ウォレット接続状態', () => {
    beforeEach(() => {
      mockMultiWallet.metamask.isConnected = true
      mockMultiWallet.tronlink.isConnected = true
      mockMultiWallet.multiWalletStatus.hasMultipleConnections = true
      mockMultiWallet.connectionStatus = {
        ethereum: { isConnected: true, canTransact: true },
        tron: { isConnected: true, canTransact: true }
      }
    })

    it('複数接続の通知が表示される', () => {
      renderWithProviders(<WalletConnectionPanel {...defaultProps} />)
      
      expect(screen.getByText(/複数のチェーンに接続されています/)).toBeInTheDocument()
    })

    it('接続数が正しく表示される', () => {
      renderWithProviders(<WalletConnectionPanel {...defaultProps} />)
      
      expect(screen.getByText('2 / 2')).toBeInTheDocument()
    })
  })

  describe('エラー状態', () => {
    it('ウォレットエラーが表示される', () => {
      mockMultiWallet.metamask.error = 'Connection failed'
      
      renderWithProviders(<WalletConnectionPanel {...defaultProps} />)
      
      expect(screen.getByText('Connection failed')).toBeInTheDocument()
    })

    it('エラー状態のスタイルが適用される', () => {
      mockMultiWallet.metamask.error = 'Connection failed'
      
      const { container } = renderWithProviders(<WalletConnectionPanel {...defaultProps} />)
      
      const errorWallet = container.querySelector('.wallet-item.error')
      expect(errorWallet).toBeInTheDocument()
    })
  })

  describe('プロパティテスト', () => {
    it('showChainSwitcher=falseでも正常に動作する', () => {
      renderWithProviders(
        <WalletConnectionPanel 
          {...defaultProps} 
          showChainSwitcher={false} 
        />
      )
      
      expect(screen.getByText('ウォレット接続')).toBeInTheDocument()
    })

    it('オプショナルプロパティなしでも正常に動作する', () => {
      renderWithProviders(<WalletConnectionPanel />)
      
      expect(screen.getByText('ウォレット接続')).toBeInTheDocument()
    })
  })

  describe('アクセシビリティ', () => {
    it('ボタンに適切なaria-labelがある', () => {
      renderWithProviders(<WalletConnectionPanel {...defaultProps} />)
      
      const copyButton = screen.getByTitle('アドレスをコピー')
      expect(copyButton).toBeInTheDocument()
    })

    it('フォーカス可能な要素が適切に設定されている', () => {
      renderWithProviders(<WalletConnectionPanel {...defaultProps} />)
      
      const buttons = screen.getAllByRole('button')
      buttons.forEach(button => {
        expect(button).not.toHaveAttribute('tabindex', '-1')
      })
    })
  })

  describe('メモ化テスト', () => {
    it('プロパティが変更されない場合は再レンダリングされない', () => {
      const { rerender } = renderWithProviders(<WalletConnectionPanel {...defaultProps} />)
      
      const initialRenderCount = screen.getAllByRole('button').length
      
      // 同じプロパティで再レンダリング
      rerender(<WalletConnectionPanel {...defaultProps} />)
      
      const secondRenderCount = screen.getAllByRole('button').length
      expect(secondRenderCount).toBe(initialRenderCount)
    })

    it('プロパティが変更された場合は再レンダリングされる', () => {
      const { rerender } = renderWithProviders(<WalletConnectionPanel {...defaultProps} />)
      
      // プロパティを変更して再レンダリング
      rerender(<WalletConnectionPanel {...defaultProps} className="new-class" />)
      
      const panel = document.querySelector('.wallet-connection-panel')
      expect(panel).toHaveClass('new-class')
    })
  })
})