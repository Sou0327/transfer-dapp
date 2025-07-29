import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  checkTokenCompatibility,
  generateCompatibilityWarnings,
  getKnownTokenIssues,
  KNOWN_NON_STANDARD_TOKENS,
} from '../tokenCompatibility'
import { TokenCompatibilityCheck } from '@/types'

// Ethersのモック
const mockContract = {
  transfer: vi.fn(),
  balanceOf: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  queryFilter: vi.fn(),
}

const mockProvider = {
  getCode: vi.fn(),
  getBlockNumber: vi.fn(),
  getTransactionReceipt: vi.fn(),
}

vi.mock('ethers', () => ({
  Contract: vi.fn(() => mockContract),
  BrowserProvider: vi.fn(() => mockProvider),
  formatUnits: vi.fn((value: string) => (parseInt(value) / 1e18).toString()),
  parseUnits: vi.fn((value: string) => (parseFloat(value) * 1e18).toString()),
}))

// WindowのEthereumプロバイダーのモック
Object.defineProperty(window, 'ethereum', {
  value: {
    request: vi.fn(),
  },
  writable: true,
})

describe('tokenCompatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // デフォルトのモック設定
    mockProvider.getCode.mockResolvedValue('0x1234567890') // コントラクトが存在
    mockProvider.getBlockNumber.mockResolvedValue(18000000)
    mockContract.balanceOf.mockResolvedValue('1000000000000000000') // 1 token
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getKnownTokenIssues', () => {
    it('既知のUSDTトークンの問題を返すこと', () => {
      const usdtAddress = '0xdAC17F958D2ee523a2206206994597C13D831ec7'
      const result = getKnownTokenIssues(usdtAddress)

      expect(result.name).toBe('USDT')
      expect(result.issues).toContain('transfer関数がfalseを返す場合がある')
      expect(result.recommendations).toContain('少額でテスト送金を行ってください')
    })

    it('既知のBNBトークンの問題を返すこと', () => {
      const bnbAddress = '0xB8c77482e45F1F44dE1745F52C74426C631bDD52'
      const result = getKnownTokenIssues(bnbAddress)

      expect(result.name).toBe('BNB')
      expect(result.issues).toContain('戻り値が不安定な場合がある')
      expect(result.recommendations).toContain('複数回のテスト送金を推奨')
    })

    it('既知のOMGトークンの問題を返すこと', () => {
      const omgAddress = '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07'
      const result = getKnownTokenIssues(omgAddress)

      expect(result.name).toBe('OMG')
      expect(result.issues).toContain('Transferイベントが発火しない場合がある')
    })

    it('未知のトークンに対して空の結果を返すこと', () => {
      const unknownAddress = '0x1234567890123456789012345678901234567890'
      const result = getKnownTokenIssues(unknownAddress)

      expect(result.name).toBe('')
      expect(result.issues).toEqual([])
      expect(result.recommendations).toEqual([])
    })

    it('アドレスの大文字小文字を区別しないこと', () => {
      const usdtLower = '0xdac17f958d2ee523a2206206994597c13d831ec7'
      const usdtUpper = '0xDAC17F958D2EE523A2206206994597C13D831EC7'

      const resultLower = getKnownTokenIssues(usdtLower)
      const resultUpper = getKnownTokenIssues(usdtUpper)

      expect(resultLower.name).toBe(resultUpper.name)
      expect(resultLower.issues).toEqual(resultUpper.issues)
    })
  })

  describe('checkTokenCompatibility', () => {
    it('標準的なERC-20トークンの場合は互換性ありと判定すること', async () => {
      // transferが正常に戻り値を返す
      mockContract.transfer.mockImplementation(() => ({
        wait: () => Promise.resolve({
          events: [{ event: 'Transfer' }],
        }),
      }))

      // 初期残高と送金後残高が適切に変化
      mockContract.balanceOf
        .mockResolvedValueOnce('1000000000000000000') // 1 token (before)
        .mockResolvedValueOnce('999000000000000000')  // 0.999 token (after)

      const result = await checkTokenCompatibility('0x1234567890123456789012345678901234567890')

      expect(result.supportsTransferReturn).toBe(true)
      expect(result.emitsTransferEvent).toBe(true)
      expect(result.balanceConsistent).toBe(true)
      expect(result.warnings).toEqual([])
    })

    it('戻り値をサポートしないトークンを検出すること', async () => {
      // transferが例外を投げる（戻り値なし）
      mockContract.transfer.mockRejectedValue(new Error('execution reverted'))

      const result = await checkTokenCompatibility('0xdAC17F958D2ee523a2206206994597C13D831ec7')

      expect(result.supportsTransferReturn).toBe(false)
      expect(result.warnings).toContain('このトークンはtransfer関数の戻り値をサポートしていません')
    })

    it('Transferイベントを発火しないトークンを検出すること', async () => {
      // transferは成功するがイベントが発火しない
      mockContract.transfer.mockImplementation(() => ({
        wait: () => Promise.resolve({
          events: [], // イベントなし
        }),
      }))

      mockContract.balanceOf
        .mockResolvedValueOnce('1000000000000000000')
        .mockResolvedValueOnce('999000000000000000')

      const result = await checkTokenCompatibility('0xd26114cd6EE289AccF82350c8d8487fedB8A0C07')

      expect(result.emitsTransferEvent).toBe(false)
      expect(result.warnings).toContain('このトークンはTransferイベントを正しく発火しません')
    })

    it('残高が一致しないトークンを検出すること', async () => {
      mockContract.transfer.mockImplementation(() => ({
        wait: () => Promise.resolve({
          events: [{ event: 'Transfer' }],
        }),
      }))

      // 残高が期待通りに変化しない
      mockContract.balanceOf
        .mockResolvedValueOnce('1000000000000000000') // 1 token (before)
        .mockResolvedValueOnce('1000000000000000000') // 1 token (after) - 変化なし

      const result = await checkTokenCompatibility('0x1234567890123456789012345678901234567890')

      expect(result.balanceConsistent).toBe(false)
      expect(result.warnings).toContain('残高の変化が期待値と一致しません')
    })

    it('ネットワークエラーを適切にハンドリングすること', async () => {
      mockProvider.getCode.mockRejectedValue(new Error('Network error'))

      const result = await checkTokenCompatibility('0x1234567890123456789012345678901234567890')

      expect(result.supportsTransferReturn).toBe(false)
      expect(result.emitsTransferEvent).toBe(false)
      expect(result.balanceConsistent).toBe(false)
      expect(result.warnings).toContain('互換性チェック中にエラーが発生しました')
    })

    it('コントラクトが存在しない場合にエラーを返すこと', async () => {
      mockProvider.getCode.mockResolvedValue('0x') // コントラクト不存在

      const result = await checkTokenCompatibility('0x1234567890123456789012345678901234567890')

      expect(result.warnings).toContain('互換性チェック中にエラーが発生しました')
    })
  })

  describe('generateCompatibilityWarnings', () => {
    it('高リスクの警告を生成すること', () => {
      const check: TokenCompatibilityCheck = {
        supportsTransferReturn: false,
        emitsTransferEvent: false,
        balanceConsistent: false,
        warnings: ['Multiple issues detected'],
      }

      const result = generateCompatibilityWarnings(check)

      expect(result.severity).toBe('high')
      expect(result.title).toContain('重大な非互換性')
      expect(result.recommendations).toContain('このトークンは使用を避けることを強く推奨します')
    })

    it('中リスクの警告を生成すること', () => {
      const check: TokenCompatibilityCheck = {
        supportsTransferReturn: false,
        emitsTransferEvent: true,
        balanceConsistent: true,
        warnings: ['Transfer return value not supported'],
      }

      const result = generateCompatibilityWarnings(check)

      expect(result.severity).toBe('medium')
      expect(result.title).toContain('部分的な非互換性')
      expect(result.recommendations).toContain('小額でのテスト送金を必ず行ってください')
    })

    it('低リスクの警告を生成すること', () => {
      const check: TokenCompatibilityCheck = {
        supportsTransferReturn: true,
        emitsTransferEvent: true,
        balanceConsistent: false,
        warnings: ['Balance inconsistency detected'],
      }

      const result = generateCompatibilityWarnings(check)

      expect(result.severity).toBe('low')
      expect(result.title).toContain('軽微な問題')
      expect(result.recommendations).toContain('送金後の残高確認を推奨します')
    })

    it('問題がない場合に情報レベルの警告を生成すること', () => {
      const check: TokenCompatibilityCheck = {
        supportsTransferReturn: true,
        emitsTransferEvent: true,
        balanceConsistent: true,
        warnings: [],
      }

      const result = generateCompatibilityWarnings(check)

      expect(result.severity).toBe('low')
      expect(result.title).toContain('互換性チェック完了')
      expect(result.message).toContain('このトークンは標準的なERC-20仕様に準拠しています')
    })
  })

  describe('KNOWN_NON_STANDARD_TOKENS', () => {
    it('既知の非標準トークンが定義されていること', () => {
      expect(KNOWN_NON_STANDARD_TOKENS).toBeDefined()
      expect(Object.keys(KNOWN_NON_STANDARD_TOKENS).length).toBeGreaterThan(0)
    })

    it('USDTの定義が正しいこと', () => {
      const usdtAddress = '0xdAC17F958D2ee523a2206206994597C13D831ec7'.toLowerCase()
      const usdtInfo = KNOWN_NON_STANDARD_TOKENS[usdtAddress]

      expect(usdtInfo).toBeDefined()
      expect(usdtInfo.name).toBe('USDT')
      expect(usdtInfo.issues).toContain('transfer関数がfalseを返す場合がある')
      expect(usdtInfo.recommendations.length).toBeGreaterThan(0)
    })

    it('各トークンが必要な情報を持っていること', () => {
      Object.entries(KNOWN_NON_STANDARD_TOKENS).forEach(([address, token]) => {
        expect(address).toMatch(/^0x[a-f0-9]{40}$/) // 有効なアドレス形式
        expect(token.name).toBeTruthy()
        expect(Array.isArray(token.issues)).toBe(true)
        expect(Array.isArray(token.recommendations)).toBe(true)
        expect(token.issues.length).toBeGreaterThan(0)
        expect(token.recommendations.length).toBeGreaterThan(0)
      })
    })
  })

  describe('エッジケース', () => {
    it('無効なアドレスを適切にハンドリングすること', async () => {
      const result = await checkTokenCompatibility('invalid-address')

      expect(result.supportsTransferReturn).toBe(false)
      expect(result.emitsTransferEvent).toBe(false)
      expect(result.balanceConsistent).toBe(false)
      expect(result.warnings).toContain('互換性チェック中にエラーが発生しました')
    })

    it('空文字列アドレスを適切にハンドリングすること', () => {
      const result = getKnownTokenIssues('')

      expect(result.name).toBe('')
      expect(result.issues).toEqual([])
      expect(result.recommendations).toEqual([])
    })

    it('nullやundefinedを適切にハンドリングすること', () => {
      // @ts-expect-error - テスト用に型チェックを無視
      const resultNull = getKnownTokenIssues(null)
      // @ts-expect-error - テスト用に型チェックを無視
      const resultUndefined = getKnownTokenIssues(undefined)

      expect(resultNull.name).toBe('')
      expect(resultUndefined.name).toBe('')
    })
  })

  describe('パフォーマンス', () => {
    it('大量のチェックが合理的な時間で完了すること', async () => {
      const startTime = Date.now()
      
      const promises = Array.from({ length: 5 }, (_, i) => 
        checkTokenCompatibility(`0x${'1'.repeat(39)}${i}`)
      )
      
      await Promise.all(promises)
      
      const endTime = Date.now()
      const duration = endTime - startTime
      
      // 5つのチェックが5秒以内に完了することを確認
      expect(duration).toBeLessThan(5000)
    })

    it('既知トークンの検索が高速であること', () => {
      const startTime = Date.now()
      
      // 1000回の検索を実行
      for (let i = 0; i < 1000; i++) {
        getKnownTokenIssues('0xdAC17F958D2ee523a2206206994597C13D831ec7')
      }
      
      const endTime = Date.now()
      const duration = endTime - startTime
      
      // 1000回の検索が100ms以内に完了することを確認
      expect(duration).toBeLessThan(100)
    })
  })
})