import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TokenCompatibilityWarning } from '../TokenCompatibilityWarning'
import { TokenCompatibilityCheck } from '@/types'

// ユーティリティ関数のモック
const mockGenerateCompatibilityWarnings = vi.fn()
const mockGetKnownTokenIssues = vi.fn()

vi.mock('@/utils/tokenCompatibility', () => ({
  generateCompatibilityWarnings: mockGenerateCompatibilityWarnings,
  getKnownTokenIssues: mockGetKnownTokenIssues,
}))

describe('TokenCompatibilityWarning', () => {
  const mockTokenAddress = '0xdAC17F958D2ee523a2206206994597C13D831ec7' // USDT
  const mockOnClose = vi.fn()
  const mockOnConfirm = vi.fn()

  const defaultCompatibilityCheck: TokenCompatibilityCheck = {
    supportsTransferReturn: false,
    emitsTransferEvent: true,
    balanceConsistent: true,
    warnings: ['transfer関数の戻り値をサポートしていません'],
  }

  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    onConfirm: mockOnConfirm,
    tokenAddress: mockTokenAddress,
    compatibilityCheck: defaultCompatibilityCheck,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    
    // デフォルトのモック設定
    mockGetKnownTokenIssues.mockReturnValue({
      name: 'USDT',
      issues: ['transfer関数がfalseを返す場合がある', '古いコントラクト実装'],
      recommendations: ['少額でテスト送金を行ってください', '送金前に残高を確認してください'],
    })

    mockGenerateCompatibilityWarnings.mockReturnValue({
      severity: 'medium' as const,
      title: '部分的な非互換性が検出されました',
      message: 'このトークンは一部の標準機能をサポートしていません',
      recommendations: ['小額でのテスト送金を必ず行ってください', '送金後の残高確認を推奨します'],
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('基本的な表示', () => {
    it('isOpenがfalseの場合、モーダルが表示されないこと', () => {
      render(
        <TokenCompatibilityWarning
          {...defaultProps}
          isOpen={false}
        />
      )

      expect(screen.queryByText('非標準トークンの検出')).not.toBeInTheDocument()
    })

    it('isOpenがtrueの場合、モーダルが表示されること', () => {
      render(<TokenCompatibilityWarning {...defaultProps} />)

      expect(screen.getByText('非標準トークンの検出')).toBeInTheDocument()
      expect(screen.getByText('ステップ 1 / 3')).toBeInTheDocument()
    })

    it('既知のトークン情報が表示されること', () => {
      render(<TokenCompatibilityWarning {...defaultProps} />)

      expect(screen.getByText('既知のトークン: USDT')).toBeInTheDocument()
      expect(screen.getByText('transfer関数がfalseを返す場合がある')).toBeInTheDocument()
      expect(screen.getByText('少額でテスト送金を行ってください')).toBeInTheDocument()
    })

    it('互換性チェック結果が表示されること', () => {
      render(<TokenCompatibilityWarning {...defaultProps} />)

      expect(screen.getByText('検出された問題:')).toBeInTheDocument()
      expect(screen.getByText('戻り値サポート')).toBeInTheDocument()
      expect(screen.getByText('✗ 非対応')).toBeInTheDocument()
      expect(screen.getByText('✓ 正常')).toBeInTheDocument() // Transferイベント
      expect(screen.getByText('✓ 一致')).toBeInTheDocument() // 残高整合性
    })
  })

  describe('ナビゲーション', () => {
    it('次へボタンで次のステップに進むこと', async () => {
      const user = userEvent.setup()
      render(<TokenCompatibilityWarning {...defaultProps} />)

      // 最初のステップを確認
      expect(screen.getByText('ステップ 1 / 3')).toBeInTheDocument()
      expect(screen.getByText('非標準トークンの検出')).toBeInTheDocument()

      // 次へボタンをクリック
      const nextButton = screen.getByRole('button', { name: /次へ/ })
      await user.click(nextButton)

      // 2番目のステップに進んだことを確認
      expect(screen.getByText('ステップ 2 / 3')).toBeInTheDocument()
      expect(screen.getByText('リスクの説明')).toBeInTheDocument()
    })

    it('前へボタンで前のステップに戻ること', async () => {
      const user = userEvent.setup()
      render(<TokenCompatibilityWarning {...defaultProps} />)

      // 2番目のステップに移動
      const nextButton = screen.getByRole('button', { name: /次へ/ })
      await user.click(nextButton)

      expect(screen.getByText('ステップ 2 / 3')).toBeInTheDocument()

      // 前へボタンをクリック
      const prevButton = screen.getByRole('button', { name: /前へ/ })
      await user.click(prevButton)

      // 最初のステップに戻ったことを確認
      expect(screen.getByText('ステップ 1 / 3')).toBeInTheDocument()
      expect(screen.getByText('非標準トークンの検出')).toBeInTheDocument()
    })

    it('プログレスバーが正しく表示されること', async () => {
      const user = userEvent.setup()
      render(<TokenCompatibilityWarning {...defaultProps} />)

      // 最初のステップ（33%）
      let progressBar = document.querySelector('.bg-blue-600')
      expect(progressBar).toHaveStyle({ width: '33.33333333333333%' })

      // 2番目のステップに移動（66%）
      const nextButton = screen.getByRole('button', { name: /次へ/ })
      await user.click(nextButton)

      progressBar = document.querySelector('.bg-blue-600')
      expect(progressBar).toHaveStyle({ width: '66.66666666666666%' })

      // 3番目のステップに移動（100%）
      await user.click(screen.getByRole('button', { name: /次へ/ }))

      progressBar = document.querySelector('.bg-blue-600')
      expect(progressBar).toHaveStyle({ width: '100%' })
    })
  })

  describe('ステップ2: リスクの説明', () => {
    beforeEach(async () => {
      const user = userEvent.setup()
      render(<TokenCompatibilityWarning {...defaultProps} />)
      
      // 2番目のステップに移動
      const nextButton = screen.getByRole('button', { name: /次へ/ })
      await user.click(nextButton)
    })

    it('リスクの説明が表示されること', () => {
      expect(screen.getByText('リスクの説明')).toBeInTheDocument()
      expect(screen.getByText('考えられるリスク')).toBeInTheDocument()
      expect(screen.getByText('送金失敗:')).toBeInTheDocument()
      expect(screen.getByText('残高不整合:')).toBeInTheDocument()
      expect(screen.getByText('予期しない動作:')).toBeInTheDocument()
      expect(screen.getByText('ガス消費:')).toBeInTheDocument()
    })

    it('推奨される対策が表示されること', () => {
      expect(screen.getByText('推奨される対策')).toBeInTheDocument()
      expect(screen.getByText('小額でのテスト送金を必ず行ってください')).toBeInTheDocument()
      expect(screen.getByText('送金前にトークンの公式ドキュメントを確認してください')).toBeInTheDocument()
    })
  })

  describe('ステップ3: 最終確認', () => {
    beforeEach(async () => {
      const user = userEvent.setup()
      render(<TokenCompatibilityWarning {...defaultProps} />)
      
      // 3番目のステップに移動
      await user.click(screen.getByRole('button', { name: /次へ/ }))
      await user.click(screen.getByRole('button', { name: /次へ/ }))
    })

    it('最終確認ステップが表示されること', () => {
      expect(screen.getByText('最終確認')).toBeInTheDocument()
      expect(screen.getByText('以下の内容を理解し、同意してから続行してください:')).toBeInTheDocument()
    })

    it('確認チェックボックスが表示されること', () => {
      const checkboxes = screen.getAllByRole('checkbox')
      expect(checkboxes).toHaveLength(3)

      expect(screen.getByText(/このトークンが非標準的で/)).toBeInTheDocument()
      expect(screen.getByText(/送金失敗や残高不整合などのリスク/)).toBeInTheDocument()
      expect(screen.getByText(/上記のリスクを理解した上で/)).toBeInTheDocument()
    })

    it('すべてのチェックボックスにチェックしないと実行ボタンが無効化されること', () => {
      const executeButton = screen.getByRole('button', { name: /理解して実行/ })
      expect(executeButton).toBeDisabled()
    })

    it('すべてのチェックボックスにチェックすると実行ボタンが有効化されること', async () => {
      const user = userEvent.setup()
      const checkboxes = screen.getAllByRole('checkbox')
      
      // すべてのチェックボックスにチェック
      for (const checkbox of checkboxes) {
        await user.click(checkbox)
      }

      const executeButton = screen.getByRole('button', { name: /理解して実行/ })
      expect(executeButton).not.toBeDisabled()
    })

    it('実行ボタンをクリックするとonConfirmが呼ばれること', async () => {
      const user = userEvent.setup()
      const checkboxes = screen.getAllByRole('checkbox')
      
      // すべてのチェックボックスにチェック
      for (const checkbox of checkboxes) {
        await user.click(checkbox)
      }

      const executeButton = screen.getByRole('button', { name: /理解して実行/ })
      await user.click(executeButton)

      expect(mockOnConfirm).toHaveBeenCalledTimes(1)
    })
  })

  describe('モーダルの閉じる機能', () => {
    it('閉じるボタンでモーダルが閉じること', async () => {
      const user = userEvent.setup()
      render(<TokenCompatibilityWarning {...defaultProps} />)

      const closeButton = screen.getByRole('button', { name: /閉じる/ })
      await user.click(closeButton)

      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('キャンセルボタンでモーダルが閉じること', async () => {
      const user = userEvent.setup()
      render(<TokenCompatibilityWarning {...defaultProps} />)

      const cancelButton = screen.getByRole('button', { name: /キャンセル/ })
      await user.click(cancelButton)

      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('オーバーレイクリックでモーダルが閉じること', async () => {
      render(<TokenCompatibilityWarning {...defaultProps} />)

      const overlay = document.querySelector('.fixed.inset-0.bg-black')
      expect(overlay).toBeInTheDocument()
      
      if (overlay) {
        fireEvent.click(overlay)
      }

      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('状態リセット', () => {
    it('モーダルが閉じられると状態がリセットされること', async () => {
      const { rerender } = render(<TokenCompatibilityWarning {...defaultProps} />)

      const user = userEvent.setup()
      
      // 2番目のステップに移動
      await user.click(screen.getByRole('button', { name: /次へ/ }))
      expect(screen.getByText('ステップ 2 / 3')).toBeInTheDocument()

      // モーダルを閉じて再開
      rerender(<TokenCompatibilityWarning {...defaultProps} isOpen={false} />)
      rerender(<TokenCompatibilityWarning {...defaultProps} isOpen={true} />)

      // 最初のステップに戻っていることを確認
      expect(screen.getByText('ステップ 1 / 3')).toBeInTheDocument()
    })

    it('チェックボックスの状態がリセットされること', async () => {
      const { rerender } = render(<TokenCompatibilityWarning {...defaultProps} />)

      const user = userEvent.setup()
      
      // 3番目のステップに移動
      await user.click(screen.getByRole('button', { name: /次へ/ }))
      await user.click(screen.getByRole('button', { name: /次へ/ }))

      // チェックボックスにチェック
      const firstCheckbox = screen.getAllByRole('checkbox')[0]
      await user.click(firstCheckbox)
      expect(firstCheckbox).toBeChecked()

      // モーダルを閉じて再開
      rerender(<TokenCompatibilityWarning {...defaultProps} isOpen={false} />)
      rerender(<TokenCompatibilityWarning {...defaultProps} isOpen={true} />)

      // 3番目のステップに再度移動
      await user.click(screen.getByRole('button', { name: /次へ/ }))
      await user.click(screen.getByRole('button', { name: /次へ/ }))

      // チェックボックスがリセットされていることを確認
      const resetCheckbox = screen.getAllByRole('checkbox')[0]
      expect(resetCheckbox).not.toBeChecked()
    })
  })

  describe('カスタムクラス名', () => {
    it('カスタムクラス名が適用されること', () => {
      const customClass = 'custom-warning-class'
      render(
        <TokenCompatibilityWarning
          {...defaultProps}
          className={customClass}
        />
      )

      const modal = document.querySelector('.fixed.inset-0')
      expect(modal).toHaveClass(customClass)
    })
  })

  describe('アクセシビリティ', () => {
    it('適切なrole属性が設定されていること', () => {
      render(<TokenCompatibilityWarning {...defaultProps} />)

      expect(screen.getByRole('button', { name: /閉じる/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /次へ/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /キャンセル/ })).toBeInTheDocument()
    })

    it('チェックボックスが適切にラベル付けされていること', async () => {
      const user = userEvent.setup()
      render(<TokenCompatibilityWarning {...defaultProps} />)
      
      // 3番目のステップに移動
      await user.click(screen.getByRole('button', { name: /次へ/ }))
      await user.click(screen.getByRole('button', { name: /次へ/ }))

      const checkboxes = screen.getAllByRole('checkbox')
      checkboxes.forEach(checkbox => {
        expect(checkbox).toHaveAttribute('aria-label')
      })
    })

    it('フォーカス管理が適切に行われること', async () => {
      const user = userEvent.setup()
      render(<TokenCompatibilityWarning {...defaultProps} />)

      // キーボードナビゲーションをテスト
      await user.tab()
      expect(screen.getByRole('button', { name: /閉じる/ })).toHaveFocus()

      await user.tab()
      expect(screen.getByRole('button', { name: /キャンセル/ })).toHaveFocus()

      await user.tab()
      expect(screen.getByRole('button', { name: /次へ/ })).toHaveFocus()
    })
  })

  describe('エラーケース', () => {
    it('compatibilityCheckがないときにデフォルト警告が表示されること', () => {
      render(
        <TokenCompatibilityWarning
          {...defaultProps}
          compatibilityCheck={undefined}
        />
      )

      expect(screen.getByText('非標準トークンを検出')).toBeInTheDocument()
      expect(screen.getByText('このトークンは非標準的な動作をする可能性があります')).toBeInTheDocument()
    })

    it('既知のトークン情報がない場合に適切に処理されること', () => {
      mockGetKnownTokenIssues.mockReturnValue({
        name: '',
        issues: [],
        recommendations: [],
      })

      render(<TokenCompatibilityWarning {...defaultProps} />)

      expect(screen.queryByText(/既知のトークン:/)).not.toBeInTheDocument()
    })
  })
})