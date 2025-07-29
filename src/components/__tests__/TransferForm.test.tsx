import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TransferForm } from '../TransferForm'

// モック関数の準備
const mockUseWallet = vi.fn()
const mockUseTransfer = vi.fn()
const mockUseToast = vi.fn()
const mockFormatCurrency = vi.fn()
const mockGetKnownTokenIssues = vi.fn()

// フックとユーティリティのモック
vi.mock('@/hooks/useWallet', () => ({
  useWallet: () => mockUseWallet(),
}))

vi.mock('@/hooks/useTransfer', () => ({
  useTransfer: () => mockUseTransfer(),
}))

vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => mockUseToast(),
}))

vi.mock('@/utils/web3', () => ({
  formatCurrency: mockFormatCurrency,
}))

vi.mock('@/utils/tokenCompatibility', () => ({
  getKnownTokenIssues: mockGetKnownTokenIssues,
}))

vi.mock('@/utils/validation', () => ({
  FormValidator: {
    validateAddress: vi.fn((address: string) => {
      if (!address) return { errors: ['アドレスが必要です'], warnings: [] }
      if (!address.startsWith('0x')) return { errors: ['無効なアドレス形式'], warnings: [] }
      if (address.length !== 42) return { errors: ['アドレスの長さが正しくありません'], warnings: [] }
      return { errors: [], warnings: [] }
    }),
    validateAmount: vi.fn((amount: string, balance?: string) => {
      if (!amount) return { errors: ['金額が必要です'], warnings: [] }
      if (isNaN(Number(amount))) return { errors: ['無効な金額'], warnings: [] }
      if (Number(amount) < 0) return { errors: ['金額は正の値である必要があります'], warnings: [] }
      if (balance && Number(amount) > Number(balance)) {
        return { errors: ['残高が不足しています'], warnings: [] }
      }
      if (Number(amount) === 0) return { errors: [], warnings: ['ゼロ値送金は注意が必要です'] }
      return { errors: [], warnings: [] }
    }),
  },
  createDebouncedValidator: vi.fn((validator) => (value: string, callback: (result: unknown) => void) => {
    callback(validator(value))
  }),
}))

describe('TransferForm', () => {
  const mockTokenAddress = '0x1234567890123456789012345678901234567890'
  const mockBalance = '100.5'
  const mockOnTransferSuccess = vi.fn()

  // デフォルトのモック値
  const defaultWalletState = {
    account: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    isConnected: true,
    isNetworkSupported: true,
  }

  const defaultTransferState = {
    executeTransfer: vi.fn(),
    validateTransfer: vi.fn(),
    transactionState: { status: 'idle' },
    isValidating: false,
    validationErrors: [],
    validationWarnings: [],
    isPending: false,
    isSuccess: false,
    isFailed: false,
    canTransfer: vi.fn(() => true),
    estimateTransactionFee: vi.fn(),
    getTransactionDetails: vi.fn(),
    resetTransfer: vi.fn(),
  }

  const defaultToastState = {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    tokenCompatibility: {
      warning: vi.fn(),
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    
    mockUseWallet.mockReturnValue(defaultWalletState)
    mockUseTransfer.mockReturnValue(defaultTransferState)
    mockUseToast.mockReturnValue(defaultToastState)
    
    mockFormatCurrency.mockImplementation((value: string, decimals: number) => {
      return `${parseFloat(value).toFixed(decimals)}`
    })
    
    mockGetKnownTokenIssues.mockReturnValue({
      name: '',
      issues: [],
      recommendations: [],
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('基本的なレンダリング', () => {
    it('フォームが正しく表示されること', () => {
      render(
        <TransferForm
          tokenAddress={mockTokenAddress}
          balance={mockBalance}
          onTransferSuccess={mockOnTransferSuccess}
        />
      )

      expect(screen.getByText('トークン送金')).toBeInTheDocument()
      expect(screen.getByLabelText(/受信者アドレス/)).toBeInTheDocument()
      expect(screen.getByLabelText(/送金金額/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /送金実行/ })).toBeInTheDocument()
    })

    it('残高が正しく表示されること', () => {
      render(
        <TransferForm
          tokenAddress={mockTokenAddress}
          balance={mockBalance}
          onTransferSuccess={mockOnTransferSuccess}
        />
      )

      expect(mockFormatCurrency).toHaveBeenCalledWith(mockBalance, 6)
      expect(screen.getByText(/残高:/)).toBeInTheDocument()
    })
  })

  describe('フォーム入力のバリデーション', () => {
    it('無効なアドレスでエラーが表示されること', async () => {
      const user = userEvent.setup()
      render(
        <TransferForm
          tokenAddress={mockTokenAddress}
          balance={mockBalance}
          onTransferSuccess={mockOnTransferSuccess}
        />
      )

      const addressInput = screen.getByLabelText(/受信者アドレス/)
      await user.type(addressInput, 'invalid-address')

      await waitFor(() => {
        expect(screen.getByText('無効なアドレス形式')).toBeInTheDocument()
      })
    })

    it('有効なアドレスでエラーが表示されないこと', async () => {
      const user = userEvent.setup()
      render(
        <TransferForm
          tokenAddress={mockTokenAddress}
          balance={mockBalance}
          onTransferSuccess={mockOnTransferSuccess}
        />
      )

      const addressInput = screen.getByLabelText(/受信者アドレス/)
      await user.type(addressInput, '0x1234567890123456789012345678901234567890')

      await waitFor(() => {
        expect(screen.queryByText(/無効なアドレス/)).not.toBeInTheDocument()
      })
    })

    it('無効な金額でエラーが表示されること', async () => {
      const user = userEvent.setup()
      render(
        <TransferForm
          tokenAddress={mockTokenAddress}
          balance={mockBalance}
          onTransferSuccess={mockOnTransferSuccess}
        />
      )

      const amountInput = screen.getByLabelText(/送金金額/)
      await user.type(amountInput, 'invalid-amount')

      await waitFor(() => {
        expect(screen.getByText('無効な金額')).toBeInTheDocument()
      })
    })

    it('残高を超える金額でエラーが表示されること', async () => {
      const user = userEvent.setup()
      render(
        <TransferForm
          tokenAddress={mockTokenAddress}
          balance={mockBalance}
          onTransferSuccess={mockOnTransferSuccess}
        />
      )

      const amountInput = screen.getByLabelText(/送金金額/)
      await user.type(amountInput, '200') // 残高100.5を超える

      await waitFor(() => {
        expect(screen.getByText('残高が不足しています')).toBeInTheDocument()
      })
    })

    it('ゼロ値送金で警告が表示されること', async () => {
      const user = userEvent.setup()
      render(
        <TransferForm
          tokenAddress={mockTokenAddress}
          balance={mockBalance}
          onTransferSuccess={mockOnTransferSuccess}
        />
      )

      const amountInput = screen.getByLabelText(/送金金額/)
      await user.type(amountInput, '0')

      await waitFor(() => {
        expect(screen.getByText('ゼロ値送金は注意が必要です')).toBeInTheDocument()
      })
    })
  })

  describe('MAXボタンの機能', () => {
    it('MAXボタンをクリックすると残高の99.9%が設定されること', async () => {
      const user = userEvent.setup()
      render(
        <TransferForm
          tokenAddress={mockTokenAddress}
          balance={mockBalance}
          onTransferSuccess={mockOnTransferSuccess}
        />
      )

      const maxButton = screen.getByRole('button', { name: /MAX/ })
      const amountInput = screen.getByLabelText(/送金金額/) as HTMLInputElement

      await user.click(maxButton)

      const expectedAmount = (parseFloat(mockBalance) * 0.999).toString()
      expect(amountInput.value).toBe(expectedAmount)
    })

    it('残高がゼロの場合MAXボタンが無効化されること', () => {
      render(
        <TransferForm
          tokenAddress={mockTokenAddress}
          balance="0"
          onTransferSuccess={mockOnTransferSuccess}
        />
      )

      const maxButton = screen.getByRole('button', { name: /MAX/ })
      expect(maxButton).toBeDisabled()
    })
  })

  describe('ガス料金推定機能', () => {
    it('有効なフォーム入力でガス推定ボタンが表示されること', async () => {
      const user = userEvent.setup()
      render(
        <TransferForm
          tokenAddress={mockTokenAddress}
          balance={mockBalance}
          onTransferSuccess={mockOnTransferSuccess}
        />
      )

      // 有効なアドレスと金額を入力
      const addressInput = screen.getByLabelText(/受信者アドレス/)
      const amountInput = screen.getByLabelText(/送金金額/)

      await user.type(addressInput, '0x1234567890123456789012345678901234567890')
      await user.type(amountInput, '10')

      await waitFor(() => {
        expect(screen.getByText('ガス料金を推定')).toBeInTheDocument()
      })
    })

    it('ガス推定ボタンをクリックすると推定が実行されること', async () => {
      const mockEstimate = {
        gasLimit: '21000',
        gasPrice: '20000000000',
        totalFee: '420000000000000',
        totalFeeFormatted: '0.000420',
      }

      const transferState = {
        ...defaultTransferState,
        estimateTransactionFee: vi.fn().mockResolvedValue(mockEstimate),
      }
      mockUseTransfer.mockReturnValue(transferState)

      const user = userEvent.setup()
      render(
        <TransferForm
          tokenAddress={mockTokenAddress}
          balance={mockBalance}
          onTransferSuccess={mockOnTransferSuccess}
        />
      )

      // 有効なフォーム入力
      const addressInput = screen.getByLabelText(/受信者アドレス/)
      const amountInput = screen.getByLabelText(/送金金額/)

      await user.type(addressInput, '0x1234567890123456789012345678901234567890')
      await user.type(amountInput, '10')

      const gasButton = await screen.findByText('ガス料金を推定')
      await user.click(gasButton)

      expect(transferState.estimateTransactionFee).toHaveBeenCalledWith({
        to: '0x1234567890123456789012345678901234567890',
        amount: '10',
      })

      await waitFor(() => {
        expect(screen.getByText('推定ガス料金')).toBeInTheDocument()
      })
    })
  })

  describe('送金実行機能', () => {
    it('有効なフォームで送金実行ボタンが有効になること', async () => {
      const user = userEvent.setup()
      render(
        <TransferForm
          tokenAddress={mockTokenAddress}
          balance={mockBalance}
          onTransferSuccess={mockOnTransferSuccess}
        />
      )

      const addressInput = screen.getByLabelText(/受信者アドレス/)
      const amountInput = screen.getByLabelText(/送金金額/)
      const submitButton = screen.getByRole('button', { name: /送金実行/ })

      // 初期状態では無効
      expect(submitButton).toBeDisabled()

      // 有効な入力をする
      await user.type(addressInput, '0x1234567890123456789012345678901234567890')
      await user.type(amountInput, '10')

      await waitFor(() => {
        expect(submitButton).not.toBeDisabled()
      })
    })

    it('フォーム送信時にexecuteTransferが呼ばれること', async () => {
      const user = userEvent.setup()
      const mockExecuteTransfer = vi.fn().mockResolvedValue(true)
      
      mockUseTransfer.mockReturnValue({
        ...defaultTransferState,
        executeTransfer: mockExecuteTransfer,
      })

      render(
        <TransferForm
          tokenAddress={mockTokenAddress}
          balance={mockBalance}
          onTransferSuccess={mockOnTransferSuccess}
        />
      )

      const addressInput = screen.getByLabelText(/受信者アドレス/)
      const amountInput = screen.getByLabelText(/送金金額/)
      const submitButton = screen.getByRole('button', { name: /送金実行/ })

      await user.type(addressInput, '0x1234567890123456789012345678901234567890')
      await user.type(amountInput, '10')
      await user.click(submitButton)

      expect(mockExecuteTransfer).toHaveBeenCalledWith({
        to: '0x1234567890123456789012345678901234567890',
        amount: '10',
      })
    })

    it('ゼロ値送金で警告モーダルが表示されること', async () => {
      const user = userEvent.setup()
      render(
        <TransferForm
          tokenAddress={mockTokenAddress}
          balance={mockBalance}
          onTransferSuccess={mockOnTransferSuccess}
        />
      )

      const addressInput = screen.getByLabelText(/受信者アドレス/)
      const amountInput = screen.getByLabelText(/送金金額/)
      const submitButton = screen.getByRole('button', { name: /送金実行/ })

      await user.type(addressInput, '0x1234567890123456789012345678901234567890')
      await user.type(amountInput, '0')
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText('ゼロ値送金の警告')).toBeInTheDocument()
      })
    })
  })

  describe('ウォレット状態による表示制御', () => {
    it('ウォレット未接続時に適切なメッセージが表示されること', () => {
      mockUseWallet.mockReturnValue({
        ...defaultWalletState,
        isConnected: false,
      })

      render(
        <TransferForm
          tokenAddress={mockTokenAddress}
          balance={mockBalance}
          onTransferSuccess={mockOnTransferSuccess}
        />
      )

      expect(screen.getByText(/まずウォレットを接続してください/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /送金実行/ })).toBeDisabled()
    })

    it('未サポートネットワーク時に適切なメッセージが表示されること', () => {
      mockUseWallet.mockReturnValue({
        ...defaultWalletState,
        isNetworkSupported: false,
      })

      render(
        <TransferForm
          tokenAddress={mockTokenAddress}
          balance={mockBalance}
          onTransferSuccess={mockOnTransferSuccess}
        />
      )

      expect(screen.getByText(/正しいネットワークに切り替えてください/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /送金実行/ })).toBeDisabled()
    })
  })

  describe('送金状態の表示', () => {
    it('送金中の状態が正しく表示されること', () => {
      mockUseTransfer.mockReturnValue({
        ...defaultTransferState,
        isPending: true,
      })

      render(
        <TransferForm
          tokenAddress={mockTokenAddress}
          balance={mockBalance}
          onTransferSuccess={mockOnTransferSuccess}
        />
      )

      expect(screen.getByText('送金中...')).toBeInTheDocument()
      expect(screen.getByText('トランザクション処理中...')).toBeInTheDocument()
    })

    it('送金成功の状態が正しく表示されること', () => {
      mockUseTransfer.mockReturnValue({
        ...defaultTransferState,
        isSuccess: true,
        getTransactionDetails: vi.fn(() => ({
          hash: '0xabcdef123456789',
          explorerUrl: 'https://etherscan.io/tx/0xabcdef123456789',
        })),
      })

      render(
        <TransferForm
          tokenAddress={mockTokenAddress}
          balance={mockBalance}
          onTransferSuccess={mockOnTransferSuccess}
        />
      )

      expect(screen.getByText('送金が完了しました！')).toBeInTheDocument()
      expect(screen.getByText(/TxHash:/)).toBeInTheDocument()
    })

    it('送金失敗の状態が正しく表示されること', () => {
      mockUseTransfer.mockReturnValue({
        ...defaultTransferState,
        isFailed: true,
        transactionState: { error: 'Transaction failed' },
      })

      render(
        <TransferForm
          tokenAddress={mockTokenAddress}
          balance={mockBalance}
          onTransferSuccess={mockOnTransferSuccess}
        />
      )

      expect(screen.getByText('送金に失敗しました')).toBeInTheDocument()
      expect(screen.getByText('Transaction failed')).toBeInTheDocument()
    })
  })

  describe('フォームリセット機能', () => {
    it('リセットボタンが正しく機能すること', async () => {
      const user = userEvent.setup()
      render(
        <TransferForm
          tokenAddress={mockTokenAddress}
          balance={mockBalance}
          onTransferSuccess={mockOnTransferSuccess}
        />
      )

      const addressInput = screen.getByLabelText(/受信者アドレス/) as HTMLInputElement
      const amountInput = screen.getByLabelText(/送金金額/) as HTMLInputElement

      // フォームに入力
      await user.type(addressInput, '0x1234567890123456789012345678901234567890')
      await user.type(amountInput, '10')

      // リセットボタンをクリック
      const resetButton = screen.getByRole('button', { name: /リセット/ })
      await user.click(resetButton)

      // フィールドがクリアされることを確認
      expect(addressInput.value).toBe('')
      expect(amountInput.value).toBe('')
    })
  })

  describe('非標準トークンの警告', () => {
    it('既知の非標準トークンで警告が表示されること', async () => {
      mockGetKnownTokenIssues.mockReturnValue({
        name: 'USDT',
        issues: ['Returns false on transfer'],
        recommendations: ['小額でテストしてください'],
      })

      const user = userEvent.setup()
      const mockExecuteTransfer = vi.fn().mockResolvedValue(true)
      
      mockUseTransfer.mockReturnValue({
        ...defaultTransferState,
        executeTransfer: mockExecuteTransfer,
      })

      render(
        <TransferForm
          tokenAddress={mockTokenAddress}
          balance={mockBalance}
          onTransferSuccess={mockOnTransferSuccess}
        />
      )

      const addressInput = screen.getByLabelText(/受信者アドレス/)
      const amountInput = screen.getByLabelText(/送金金額/)
      const submitButton = screen.getByRole('button', { name: /送金実行/ })

      await user.type(addressInput, '0x1234567890123456789012345678901234567890')
      await user.type(amountInput, '10')
      await user.click(submitButton)

      expect(defaultToastState.tokenCompatibility.warning).toHaveBeenCalledWith(['Returns false on transfer'])
    })
  })

  describe('アクセシビリティ', () => {
    it('フォームフィールドが適切にラベル付けされていること', () => {
      render(
        <TransferForm
          tokenAddress={mockTokenAddress}
          balance={mockBalance}
          onTransferSuccess={mockOnTransferSuccess}
        />
      )

      const addressInput = screen.getByLabelText(/受信者アドレス/)
      const amountInput = screen.getByLabelText(/送金金額/)

      expect(addressInput).toHaveAttribute('aria-describedby')
      expect(amountInput).toHaveAttribute('aria-describedby')
      expect(addressInput).toHaveAttribute('aria-invalid', 'false')
      expect(amountInput).toHaveAttribute('aria-invalid', 'false')
    })

    it('エラー状態でaria-invalid属性が更新されること', async () => {
      const user = userEvent.setup()
      render(
        <TransferForm
          tokenAddress={mockTokenAddress}
          balance={mockBalance}
          onTransferSuccess={mockOnTransferSuccess}
        />
      )

      const addressInput = screen.getByLabelText(/受信者アドレス/)
      await user.type(addressInput, 'invalid')

      await waitFor(() => {
        expect(addressInput).toHaveAttribute('aria-invalid', 'true')
      })
    })
  })
})