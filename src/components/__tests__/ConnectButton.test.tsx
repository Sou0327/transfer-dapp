import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConnectButton } from '../ConnectButton'

// useWalletフックのモック
const mockUseWallet = vi.fn()

vi.mock('@/hooks/useWallet', () => ({
  useWallet: () => mockUseWallet(),
}))

// web3ユーティリティのモック
vi.mock('@/utils/web3', () => ({
  isMetaMaskInstalled: vi.fn(() => true),
}))

// グローバルオブジェクトのモック
Object.assign(global, {
  window: {
    ...global.window,
    open: vi.fn(),
    navigator: {
      ...global.window?.navigator,
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    },
  },
})

describe('ConnectButton', () => {
  const mockConnect = vi.fn()
  const mockDisconnect = vi.fn()
  const mockFormatAddress = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    
    // デフォルトのuseWalletの戻り値
    mockUseWallet.mockReturnValue({
      account: null,
      chainId: null,
      isConnected: false,
      isConnecting: false,
      error: null,
      currentNetwork: null,
      isNetworkSupported: false,
      connect: mockConnect,
      disconnect: mockDisconnect,
      formatAddress: mockFormatAddress,
    })

    mockFormatAddress.mockImplementation((address: string) => {
      if (!address) return ''
      return `${address.slice(0, 6)}...${address.slice(-4)}`
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('MetaMaskがインストールされていない場合', () => {
    beforeEach(async () => {
      const web3Utils = await import('@/utils/web3')
      ;(web3Utils.isMetaMaskInstalled as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false)
    })

    it('MetaMaskインストールボタンが表示されること', () => {
      render(<ConnectButton />)
      
      const installButton = screen.getByRole('button', { name: /MetaMaskをインストール/i })
      expect(installButton).toBeInTheDocument()
    })

    it('インストールボタンをクリックするとMetaMaskのダウンロードページが開くこと', async () => {
      const user = userEvent.setup()
      render(<ConnectButton />)
      
      const installButton = screen.getByRole('button', { name: /MetaMaskをインストール/i })
      await user.click(installButton)

      expect(window.open).toHaveBeenCalledWith('https://metamask.io/download/', '_blank')
    })
  })

  describe('接続中の場合', () => {
    beforeEach(() => {
      mockUseWallet.mockReturnValue({
        account: null,
        chainId: null,
        isConnected: false,
        isConnecting: true,
        error: null,
        currentNetwork: null,
        isNetworkSupported: false,
        connect: mockConnect,
        disconnect: mockDisconnect,
        formatAddress: mockFormatAddress,
      })
    })

    it('接続中ボタンが表示されること', () => {
      render(<ConnectButton />)
      
      const connectingButton = screen.getByRole('button', { name: /接続中/i })
      expect(connectingButton).toBeInTheDocument()
      expect(connectingButton).toBeDisabled()
    })

    it('ローディングアイコンが表示されること', () => {
      render(<ConnectButton />)
      
      const loadingIcon = screen.getByText('接続中...')
      expect(loadingIcon).toBeInTheDocument()
    })
  })

  describe('未接続の場合', () => {
    it('ウォレット接続ボタンが表示されること', () => {
      render(<ConnectButton />)
      
      const connectButton = screen.getByRole('button', { name: /ウォレットを接続/i })
      expect(connectButton).toBeInTheDocument()
    })

    it('接続ボタンをクリックするとconnect関数が呼ばれること', async () => {
      const user = userEvent.setup()
      render(<ConnectButton />)
      
      const connectButton = screen.getByRole('button', { name: /ウォレットを接続/i })
      await user.click(connectButton)

      expect(mockConnect).toHaveBeenCalledTimes(1)
    })
  })

  describe('接続済みの場合', () => {
    const mockAccount = '0x1234567890123456789012345678901234567890'
    const mockNetwork = { name: 'Ethereum Mainnet' }

    beforeEach(() => {
      mockUseWallet.mockReturnValue({
        account: mockAccount,
        chainId: 1,
        isConnected: true,
        isConnecting: false,
        error: null,
        currentNetwork: mockNetwork,
        isNetworkSupported: true,
        connect: mockConnect,
        disconnect: mockDisconnect,
        formatAddress: mockFormatAddress,
      })
    })

    it('接続済みボタンが表示されること', () => {
      render(<ConnectButton />)
      
      const connectedButton = screen.getByRole('button', { name: /ウォレット詳細を表示/i })
      expect(connectedButton).toBeInTheDocument()
    })

    it('短縮されたアカウントアドレスが表示されること', () => {
      render(<ConnectButton />)
      
      expect(mockFormatAddress).toHaveBeenCalledWith(mockAccount)
      expect(screen.getByText('0x1234...7890')).toBeInTheDocument()
    })

    it('ネットワーク名が表示されること', () => {
      render(<ConnectButton />)
      
      expect(screen.getByText('Ethereum Mainnet')).toBeInTheDocument()
    })

    it('緑のインジケーターが表示されること（サポートされているネットワーク）', () => {
      render(<ConnectButton />)
      
      const indicator = document.querySelector('.bg-green-500')
      expect(indicator).toBeInTheDocument()
    })

    it('ボタンをクリックするとドロップダウンが表示されること', async () => {
      const user = userEvent.setup()
      render(<ConnectButton />)
      
      const toggleButton = screen.getByRole('button', { name: /ウォレット詳細を表示/i })
      await user.click(toggleButton)

      expect(screen.getByText('アカウント')).toBeInTheDocument()
      expect(screen.getByText('ネットワーク')).toBeInTheDocument()
    })

    it('ドロップダウンでフルアドレスが表示されること', async () => {
      const user = userEvent.setup()
      render(<ConnectButton />)
      
      const toggleButton = screen.getByRole('button', { name: /ウォレット詳細を表示/i })
      await user.click(toggleButton)

      expect(screen.getByText(mockAccount)).toBeInTheDocument()
    })

    it('アドレスコピーボタンが機能すること', async () => {
      const user = userEvent.setup()
      render(<ConnectButton />)
      
      const toggleButton = screen.getByRole('button', { name: /ウォレット詳細を表示/i })
      await user.click(toggleButton)

      const copyButton = screen.getByRole('button', { name: /アドレスをコピー/i })
      await user.click(copyButton)

      expect(global.window.navigator.clipboard.writeText).toHaveBeenCalledWith(mockAccount)
    })

    it('切断ボタンが機能すること', async () => {
      const user = userEvent.setup()
      render(<ConnectButton />)
      
      const toggleButton = screen.getByRole('button', { name: /ウォレット詳細を表示/i })
      await user.click(toggleButton)

      const disconnectButton = screen.getByRole('button', { name: /ウォレットを切断/i })
      await user.click(disconnectButton)

      expect(mockDisconnect).toHaveBeenCalledTimes(1)
    })

    it('ドロップダウン外をクリックするとドロップダウンが閉じること', async () => {
      const user = userEvent.setup()
      render(<ConnectButton />)
      
      const toggleButton = screen.getByRole('button', { name: /ウォレット詳細を表示/i })
      await user.click(toggleButton)

      // ドロップダウンが表示されていることを確認
      expect(screen.getByText('アカウント')).toBeInTheDocument()

      // ドロップダウン外をクリック
      const overlay = document.querySelector('.fixed.inset-0')
      expect(overlay).toBeInTheDocument()
      
      if (overlay) {
        fireEvent.click(overlay)
      }

      // ドロップダウンが非表示になることを確認
      await waitFor(() => {
        expect(screen.queryByText('アカウント')).not.toBeInTheDocument()
      })
    })
  })

  describe('未サポートネットワークの場合', () => {
    beforeEach(() => {
      mockUseWallet.mockReturnValue({
        account: '0x1234567890123456789012345678901234567890',
        chainId: 999, // 未サポートのチェーンID
        isConnected: true,
        isConnecting: false,
        error: null,
        currentNetwork: null,
        isNetworkSupported: false,
        connect: mockConnect,
        disconnect: mockDisconnect,
        formatAddress: mockFormatAddress,
      })
    })

    it('赤のインジケーターが表示されること', () => {
      render(<ConnectButton />)
      
      const indicator = document.querySelector('.bg-red-500')
      expect(indicator).toBeInTheDocument()
    })

    it('ボタンに警告スタイルが適用されること', () => {
      render(<ConnectButton />)
      
      const button = screen.getByRole('button')
      expect(button).toHaveClass('border-red-500')
    })

    it('ドロップダウンで未サポートネットワークの警告が表示されること', async () => {
      const user = userEvent.setup()
      render(<ConnectButton />)
      
      const toggleButton = screen.getByRole('button')
      await user.click(toggleButton)

      expect(screen.getByText('サポートされていないネットワークです')).toBeInTheDocument()
    })
  })

  describe('エラー状態の場合', () => {
    beforeEach(() => {
      mockUseWallet.mockReturnValue({
        account: '0x1234567890123456789012345678901234567890',
        chainId: 1,
        isConnected: true,
        isConnecting: false,
        error: 'Connection error occurred',
        currentNetwork: { name: 'Ethereum Mainnet' },
        isNetworkSupported: true,
        connect: mockConnect,
        disconnect: mockDisconnect,
        formatAddress: mockFormatAddress,
      })
    })

    it('ドロップダウンでエラーメッセージが表示されること', async () => {
      const user = userEvent.setup()
      render(<ConnectButton />)
      
      const toggleButton = screen.getByRole('button')
      await user.click(toggleButton)

      expect(screen.getByText('Connection error occurred')).toBeInTheDocument()
    })
  })

  describe('カスタムクラス名', () => {
    it('カスタムクラス名が適用されること', () => {
      const customClass = 'custom-test-class'
      render(<ConnectButton className={customClass} />)
      
      const buttonContainer = screen.getByRole('button').closest('div')
      expect(buttonContainer).toHaveClass(customClass)
    })
  })

  describe('アクセシビリティ', () => {
    it('適切なaria属性が設定されていること', async () => {
      const user = userEvent.setup()
      
      // 接続済み状態でテスト
      mockUseWallet.mockReturnValue({
        account: '0x1234567890123456789012345678901234567890',
        chainId: 1,
        isConnected: true,
        isConnecting: false,
        error: null,
        currentNetwork: { name: 'Ethereum Mainnet' },
        isNetworkSupported: true,
        connect: mockConnect,
        disconnect: mockDisconnect,
        formatAddress: mockFormatAddress,
      })

      render(<ConnectButton />)
      
      const toggleButton = screen.getByRole('button', { name: /ウォレット詳細を表示/i })
      
      // aria-expanded が false であることを確認
      expect(toggleButton).toHaveAttribute('aria-expanded', 'false')
      
      // ドロップダウンを開く
      await user.click(toggleButton)
      
      // aria-expanded が true になることを確認
      expect(toggleButton).toHaveAttribute('aria-expanded', 'true')
    })

    it('ボタンが適切なラベルを持つこと', () => {
      render(<ConnectButton />)
      
      const connectButton = screen.getByRole('button', { name: /ウォレットを接続/i })
      expect(connectButton).toHaveAttribute('aria-label', 'ウォレットを接続')
    })
  })
})