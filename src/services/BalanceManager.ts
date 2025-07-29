import { 
  SupportedChain,
  MultiChainToken,
  TokenBalance,
  PortfolioItem,
  PortfolioStats,
  BalanceUpdateResult,
  PriceData,
  BalanceHistory
} from '@/types'
import { EthereumService } from './EthereumService'
import { TronService } from './TronService'
import { ChainManagerService } from './ChainManager'
import { STORAGE_KEYS } from '@/utils/constants'
import { formatBalance } from '@/utils/web3'

/**
 * マルチチェーン残高管理サービス
 * 複数チェーンの残高を統合管理し、ポートフォリオ分析機能を提供
 */
export class BalanceManagerService {
  private ethereumService: EthereumService | null = null
  private tronService: TronService | null = null
  private chainManager: ChainManagerService

  // 残高キャッシュ
  private balanceCache: Map<string, TokenBalance> = new Map()
  private priceCache: Map<string, PriceData> = new Map()
  private lastUpdateTime: Map<string, number> = new Map()

  // 設定
  private readonly cacheTimeout = 30000 // 30秒
  private readonly priceUpdateInterval = 60000 // 1分
  private readonly maxRetries = 3

  // 更新タイマー
  private updateTimer: NodeJS.Timeout | null = null
  private priceTimer: NodeJS.Timeout | null = null

  constructor(chainManager: ChainManagerService) {
    this.chainManager = chainManager
    this.loadCachedData()
    this.startPeriodicUpdates()
  }

  /**
   * Ethereumサービスを設定
   */
  public setEthereumService(service: EthereumService): void {
    this.ethereumService = service
  }

  /**
   * Tronサービスを設定
   */
  public setTronService(service: TronService): void {
    this.tronService = service
  }

  /**
   * 指定されたアドレスの残高を取得
   */
  public async getBalance(
    chain: SupportedChain,
    tokenAddress: string | null,
    userAddress: string,
    forceRefresh: boolean = false
  ): Promise<TokenBalance | null> {
    try {
      const cacheKey = this.getCacheKey(chain, tokenAddress, userAddress)
      
      // キャッシュチェック
      if (!forceRefresh && this.isCacheValid(cacheKey)) {
        const cached = this.balanceCache.get(cacheKey)
        if (cached) {
          return cached
        }
      }

      // チェーン別残高取得
      let balance: string | null = null
      let tokenInfo: MultiChainToken | null = null

      if (chain === 'ethereum' && this.ethereumService) {
        balance = await this.ethereumService.getBalance(tokenAddress || '', userAddress)
        if (tokenAddress) {
          tokenInfo = await this.ethereumService.getTokenInfo(tokenAddress)
        } else {
          tokenInfo = this.chainManager.getNativeToken('ethereum')
        }
      } else if (chain === 'tron' && this.tronService) {
        // TronLink接続状態を厳格にチェック
        const isTronConnected = this.isTronWalletReady()
        if (!isTronConnected) {
          console.warn('TronLink wallet not properly connected, skipping balance fetch')
          return null
        }

        if (tokenAddress) {
          balance = await this.tronService.getBalance(tokenAddress, userAddress)
          tokenInfo = await this.tronService.getTokenInfo(tokenAddress)
        } else {
          balance = await this.tronService.getBalance('', userAddress)
          tokenInfo = this.chainManager.getNativeToken('tron')
        }
      } else {
        // サービスが利用できない場合は0残高を返す
        console.warn(`Service not available for chain: ${chain}`)
        return null
      }

      if (!balance || !tokenInfo) {
        return null
      }

      // 残高情報を構築
      const tokenBalance: TokenBalance = {
        chain,
        token: tokenInfo,
        address: userAddress,
        balance,
        balanceFormatted: formatBalance(balance, tokenInfo.decimals),
        usdValue: null,
        lastUpdated: Date.now(),
        isStale: false,
      }

      // 価格情報を取得して追加
      await this.addPriceInfo(tokenBalance)

      // キャッシュに保存
      this.balanceCache.set(cacheKey, tokenBalance)
      this.lastUpdateTime.set(cacheKey, Date.now())
      this.saveCachedData()

      return tokenBalance
    } catch (error) {
      console.error('Failed to get balance:', error)
      return null
    }
  }

  /**
   * 複数トークンの残高を一括取得
   */
  public async getMultipleBalances(
    balanceRequests: Array<{
      chain: SupportedChain
      tokenAddress: string | null
      userAddress: string
    }>,
    forceRefresh: boolean = false
  ): Promise<TokenBalance[]> {
    // TronLink接続チェック - Tronリクエストを事前にフィルタリング
    const filteredRequests = balanceRequests.filter(request => {
      if (request.chain === 'tron') {
        const isTronReady = this.isTronWalletReady()
        if (!isTronReady) {
          console.warn('Skipping Tron balance request - wallet not connected')
          return false
        }
      }
      return true
    })

    if (filteredRequests.length === 0) {
      console.warn('All balance requests filtered out due to wallet connection issues')
      return []
    }

    const promises = filteredRequests.map(request =>
      this.getBalance(request.chain, request.tokenAddress, request.userAddress, forceRefresh)
    )

    const results = await Promise.allSettled(promises)
    return results
      .filter((result): result is PromiseFulfilledResult<TokenBalance> => 
        result.status === 'fulfilled' && result.value !== null
      )
      .map(result => result.value)
  }

  /**
   * ポートフォリオを取得
   */
  public async getPortfolio(userAddresses: Record<SupportedChain, string>): Promise<PortfolioItem[]> {
    const portfolioItems: PortfolioItem[] = []

    for (const [chain, address] of Object.entries(userAddresses) as [SupportedChain, string][]) {
      const tokens = this.chainManager.getAllTokens(chain)
      
      // 人気トークンのみに限定（パフォーマンス向上）
      const popularTokens = tokens.filter(token => token.isPopular || token.address === null)
      
      const balanceRequests = popularTokens.map(token => ({
        chain,
        tokenAddress: token.address,
        userAddress: address
      }))

      const balances = await this.getMultipleBalances(balanceRequests)
      
      for (const balance of balances) {
        if (parseFloat(balance.balanceFormatted) > 0) {
          const portfolioItem: PortfolioItem = {
            ...balance,
            allocation: 0, // 後で計算
            change24h: null,
            change7d: null,
          }
          portfolioItems.push(portfolioItem)
        }
      }
    }

    // アロケーション（構成比）を計算
    return this.calculateAllocations(portfolioItems)
  }

  /**
   * ポートフォリオ統計を取得
   */
  public async getPortfolioStats(userAddresses: Record<SupportedChain, string>): Promise<PortfolioStats> {
    const portfolio = await this.getPortfolio(userAddresses)
    
    const totalUsdValue = portfolio.reduce((sum, item) => 
      sum + (item.usdValue || 0), 0
    )

    const chainBreakdown = portfolio.reduce((acc, item) => {
      const chainValue = acc[item.chain] || 0
      acc[item.chain] = chainValue + (item.usdValue || 0)
      return acc
    }, {} as Record<SupportedChain, number>)

    const tokenCount = new Set(portfolio.map(item => 
      `${item.chain}_${item.token.address || 'native'}`
    )).size

    const topHoldings = portfolio
      .sort((a, b) => (b.usdValue || 0) - (a.usdValue || 0))
      .slice(0, 5)

    return {
      totalUsdValue,
      totalChange24h: null, // 実装予定
      totalChange7d: null,  // 実装予定
      tokenCount,
      chainCount: Object.keys(chainBreakdown).length,
      chainBreakdown,
      topHoldings,
      lastUpdated: Date.now(),
    }
  }

  /**
   * 残高を更新
   */
  public async updateBalances(
    userAddresses: Record<SupportedChain, string>,
    tokenAddresses?: Record<SupportedChain, string[]>
  ): Promise<BalanceUpdateResult> {
    const updateStartTime = Date.now()
    const updatedBalances: TokenBalance[] = []
    const errors: string[] = []

    try {
      for (const [chain, address] of Object.entries(userAddresses) as [SupportedChain, string][]) {
        const tokensToUpdate = tokenAddresses?.[chain] || 
          this.chainManager.getPopularTokens(chain).map(t => t.address).filter(Boolean) as string[]

        // ネイティブトークンも含める
        const allTokens = [null, ...tokensToUpdate]

        for (const tokenAddress of allTokens) {
          try {
            const balance = await this.getBalance(chain, tokenAddress, address, true)
            if (balance) {
              updatedBalances.push(balance)
            }
          } catch (error) {
            const tokenName = tokenAddress || `${chain} native`
            errors.push(`Failed to update ${tokenName}: ${error}`)
          }
        }

        // チェーン間で少し間隔を空ける
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      return {
        success: true,
        updatedCount: updatedBalances.length,
        errorCount: errors.length,
        duration: Date.now() - updateStartTime,
        balances: updatedBalances,
        errors
      }
    } catch (error) {
      return {
        success: false,
        updatedCount: updatedBalances.length,
        errorCount: errors.length + 1,
        duration: Date.now() - updateStartTime,
        balances: updatedBalances,
        errors: [...errors, `Update failed: ${error}`]
      }
    }
  }

  /**
   * 価格情報を取得（デモ実装）
   */
  private async getPriceData(tokenSymbol: string): Promise<PriceData | null> {
    try {
      // 実際の実装では外部APIを使用
      // ここではデモ用の固定価格
      const demoPrice: Record<string, PriceData> = {
        'ETH': { 
          symbol: 'ETH', 
          usd: 2500, 
          change24h: 2.5, 
          change7d: -1.2, 
          lastUpdated: Date.now() 
        },
        'TRX': { 
          symbol: 'TRX', 
          usd: 0.08, 
          change24h: 1.8, 
          change7d: 5.2, 
          lastUpdated: Date.now() 
        },
        'USDT': { 
          symbol: 'USDT', 
          usd: 1.0, 
          change24h: 0.1, 
          change7d: -0.1, 
          lastUpdated: Date.now() 
        },
        'USDC': { 
          symbol: 'USDC', 
          usd: 1.0, 
          change24h: 0.0, 
          change7d: 0.0, 
          lastUpdated: Date.now() 
        },
      }

      return demoPrice[tokenSymbol] || null
    } catch (error) {
      console.error('Failed to get price data:', error)
      return null
    }
  }

  /**
   * 残高に価格情報を追加
   */
  private async addPriceInfo(balance: TokenBalance): Promise<void> {
    try {
      const priceData = await this.getPriceData(balance.token.symbol)
      if (priceData) {
        const usdValue = parseFloat(balance.balanceFormatted) * priceData.usd
        balance.usdValue = usdValue
        balance.priceData = priceData
        
        // 価格キャッシュに保存
        this.priceCache.set(balance.token.symbol, priceData)
      }
    } catch (error) {
      console.error('Failed to add price info:', error)
    }
  }

  /**
   * アロケーション（構成比）を計算
   */
  private calculateAllocations(portfolioItems: PortfolioItem[]): PortfolioItem[] {
    const totalValue = portfolioItems.reduce((sum, item) => sum + (item.usdValue || 0), 0)
    
    if (totalValue === 0) {
      return portfolioItems.map(item => ({ ...item, allocation: 0 }))
    }

    return portfolioItems.map(item => ({
      ...item,
      allocation: ((item.usdValue || 0) / totalValue) * 100
    }))
  }

  /**
   * キャッシュキーを生成
   */
  private getCacheKey(chain: SupportedChain, tokenAddress: string | null, userAddress: string): string {
    return `${chain}_${tokenAddress || 'native'}_${userAddress}`
  }

  /**
   * キャッシュが有効かチェック
   */
  private isCacheValid(cacheKey: string): boolean {
    const lastUpdate = this.lastUpdateTime.get(cacheKey)
    if (!lastUpdate) return false
    
    return (Date.now() - lastUpdate) < this.cacheTimeout
  }

  /**
   * 定期更新を開始
   */
  private startPeriodicUpdates(): void {
    // 古いキャッシュを定期的にクリーンアップ
    this.updateTimer = setInterval(() => {
      this.cleanupStaleCache()
    }, this.cacheTimeout)

    // 価格情報を定期更新
    this.priceTimer = setInterval(async () => {
      await this.updatePrices()
    }, this.priceUpdateInterval)
  }

  /**
   * 古いキャッシュをクリーンアップ
   */
  private cleanupStaleCache(): void {
    const now = Date.now()
    const staleKeys: string[] = []

    for (const [key, timestamp] of this.lastUpdateTime.entries()) {
      if (now - timestamp > this.cacheTimeout * 2) {
        staleKeys.push(key)
      }
    }

    staleKeys.forEach(key => {
      this.balanceCache.delete(key)
      this.lastUpdateTime.delete(key)
    })

    // 残高データにstaleフラグを設定
    for (const [key, balance] of this.balanceCache.entries()) {
      const lastUpdate = this.lastUpdateTime.get(key)
      if (lastUpdate && now - lastUpdate > this.cacheTimeout) {
        balance.isStale = true
      }
    }
  }

  /**
   * 価格情報を更新
   */
  private async updatePrices(): Promise<void> {
    const uniqueSymbols = new Set<string>()
    
    for (const balance of this.balanceCache.values()) {
      uniqueSymbols.add(balance.token.symbol)
    }

    for (const symbol of uniqueSymbols) {
      try {
        const priceData = await this.getPriceData(symbol)
        if (priceData) {
          this.priceCache.set(symbol, priceData)
          
          // 既存の残高データに価格を反映
          for (const [key, balance] of this.balanceCache.entries()) {
            if (balance.token.symbol === symbol) {
              const usdValue = parseFloat(balance.balanceFormatted) * priceData.usd
              balance.usdValue = usdValue
              balance.priceData = priceData
            }
          }
        }
      } catch (error) {
        console.error(`Failed to update price for ${symbol}:`, error)
      }
    }
  }

  /**
   * キャッシュデータを保存
   */
  private saveCachedData(): void {
    try {
      const cacheData = {
        balances: Array.from(this.balanceCache.entries()),
        prices: Array.from(this.priceCache.entries()),
        lastUpdate: Array.from(this.lastUpdateTime.entries()),
        timestamp: Date.now()
      }
      
      localStorage.setItem(STORAGE_KEYS.BALANCE_CACHE, JSON.stringify(cacheData))
    } catch (error) {
      console.error('Failed to save cache data:', error)
    }
  }

  /**
   * キャッシュデータを読み込み
   */
  private loadCachedData(): void {
    try {
      const cached = localStorage.getItem(STORAGE_KEYS.BALANCE_CACHE)
      if (!cached) return

      const cacheData = JSON.parse(cached)
      
      // 1時間以上古いキャッシュは破棄
      if (Date.now() - cacheData.timestamp > 3600000) {
        localStorage.removeItem(STORAGE_KEYS.BALANCE_CACHE)
        return
      }

      this.balanceCache = new Map(cacheData.balances)
      this.priceCache = new Map(cacheData.prices)
      this.lastUpdateTime = new Map(cacheData.lastUpdate)
    } catch (error) {
      console.error('Failed to load cache data:', error)
    }
  }

  /**
   * TronLinkウォレットが準備済みかチェック
   */
  private isTronWalletReady(): boolean {
    try {
      if (typeof window === 'undefined') {
        console.log('[BalanceManager] Window is undefined - server side')
        return false
      }

      // TronWebの基本チェック
      if (!window.tronWeb) {
        console.log('[BalanceManager] window.tronWeb not available')
        return false
      }

      // TronWebの準備状態チェック
      if (!window.tronWeb.ready) {
        console.log('[BalanceManager] window.tronWeb.ready is false')
        return false
      }

      // デフォルトアドレスの存在チェック
      if (!window.tronWeb.defaultAddress?.base58) {
        console.log('[BalanceManager] window.tronWeb.defaultAddress.base58 not available')
        return false
      }

      // TronLinkプロバイダーの存在チェック
      if (!window.tronLink) {
        console.log('[BalanceManager] window.tronLink not available')
        return false
      }

      // TronLinkの準備状態チェック
      if (!window.tronLink.ready) {
        console.log('[BalanceManager] window.tronLink.ready is false')
        return false
      }

      console.log('[BalanceManager] TronLink wallet is ready!')
      return true
    } catch (error) {
      console.warn('[BalanceManager] Error checking TronLink wallet status:', error)
      return false
    }
  }

  /**
   * キャッシュをクリア
   */
  public clearCache(): void {
    this.balanceCache.clear()
    this.priceCache.clear()
    this.lastUpdateTime.clear()
    localStorage.removeItem(STORAGE_KEYS.BALANCE_CACHE)
  }

  /**
   * サービスを破棄
   */
  public destroy(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer)
      this.updateTimer = null
    }
    
    if (this.priceTimer) {
      clearInterval(this.priceTimer)
      this.priceTimer = null
    }
    
    this.saveCachedData()
  }
}

// デフォルトエクスポート
export default BalanceManagerService