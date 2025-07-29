import { 
  SupportedChain, 
  EthereumNetworkInfo,
  TronNetworkInfo,
  MultiChainToken,
  ERC20Token,
  TRC20Token,
  ChainConfig,
  TokenListSource
} from '@/types'
import { 
  ETHEREUM_NETWORKS, 
  TRON_NETWORKS,
  POPULAR_ERC20_TOKENS,
  POPULAR_TRC20_TOKENS,
  STORAGE_KEYS 
} from '@/utils/constants'
import { EthereumService } from './EthereumService'
import { TronService } from './TronService'

/**
 * マルチチェーン管理サービス
 * ネットワーク設定、トークンリスト、チェーン切り替えを統合管理
 */
export class ChainManagerService {
  private ethereumService: EthereumService | null = null
  private tronService: TronService | null = null
  private customTokens: Map<string, MultiChainToken[]> = new Map()
  private hiddenTokens: Set<string> = new Set()
  private favoriteTokens: Set<string> = new Set()

  constructor() {
    this.loadUserSettings()
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
   * サポートされているチェーン一覧を取得
   */
  public getSupportedChains(): SupportedChain[] {
    return ['ethereum', 'tron']
  }

  /**
   * チェーン設定を取得
   */
  public getChainConfig(chain: SupportedChain): ChainConfig | null {
    switch (chain) {
      case 'ethereum':
        return {
          chain: 'ethereum',
          name: 'Ethereum',
          symbol: 'ETH',
          decimals: 18,
          networks: Object.values(ETHEREUM_NETWORKS),
          supportedFeatures: [
            'erc20',
            'nft',
            'defi',
            'gas_estimation',
            'contract_interaction',
            'multi_sig'
          ],
          blockTime: 12, // seconds
          finality: 12, // blocks
        }
      case 'tron':
        return {
          chain: 'tron',
          name: 'Tron',
          symbol: 'TRX',
          decimals: 6,
          networks: Object.values(TRON_NETWORKS),
          supportedFeatures: [
            'trc20',
            'trc721',
            'energy_bandwidth',
            'fee_estimation',
            'smart_contracts'
          ],
          blockTime: 3, // seconds
          finality: 1, // blocks (instant)
        }
      default:
        return null
    }
  }

  /**
   * ネイティブトークン情報を取得
   */
  public getNativeToken(chain: SupportedChain): MultiChainToken {
    switch (chain) {
      case 'ethereum':
        return {
          chain: 'ethereum',
          address: null,
          name: 'Ethereum',
          symbol: 'ETH',
          decimals: 18,
          isPopular: true,
          isCustom: false,
          description: 'Ethereumネイティブトークン'
        }
      case 'tron':
        return {
          chain: 'tron',
          address: null,
          name: 'TRON',
          symbol: 'TRX',
          decimals: 6,
          isPopular: true,
          isCustom: false,
          description: 'Tronネイティブトークン'
        }
      default:
        throw new Error(`Unsupported chain: ${chain}`)
    }
  }

  /**
   * 全チェーンの設定を取得
   */
  public getAllChainConfigs(): Record<SupportedChain, ChainConfig> {
    const configs: Record<SupportedChain, ChainConfig> = {} as any
    
    this.getSupportedChains().forEach(chain => {
      const config = this.getChainConfig(chain)
      if (config) {
        configs[chain] = config
      }
    })
    
    return configs
  }

  /**
   * デフォルトトークンリストを取得
   */
  public getDefaultTokens(chain: SupportedChain): MultiChainToken[] {
    switch (chain) {
      case 'ethereum':
        return Object.values(POPULAR_ERC20_TOKENS).map(token => ({
          ...token,
          chain: 'ethereum',
          isPopular: true,
          isCustom: false,
        }))
      case 'tron':
        return Object.values(POPULAR_TRC20_TOKENS).map(token => ({
          ...token,
          chain: 'tron',
          isPopular: true,
          isCustom: false,
        }))
      default:
        return []
    }
  }

  /**
   * カスタムトークンを追加
   */
  public async addCustomToken(token: MultiChainToken): Promise<boolean> {
    try {
      // トークン情報の検証
      const isValid = await this.validateToken(token)
      if (!isValid) {
        throw new Error('Invalid token information')
      }

      const chainTokens = this.customTokens.get(token.chain) || []
      
      // 重複チェック
      const exists = chainTokens.some(t => 
        t.address?.toLowerCase() === token.address?.toLowerCase()
      )
      
      if (exists) {
        throw new Error('Token already exists')
      }

      chainTokens.push({
        ...token,
        isCustom: true,
        isPopular: false,
        addedAt: Date.now(),
      })

      this.customTokens.set(token.chain, chainTokens)
      this.saveCustomTokens()
      
      return true
    } catch (error) {
      console.error('Failed to add custom token:', error)
      return false
    }
  }

  /**
   * カスタムトークンを削除
   */
  public removeCustomToken(chain: SupportedChain, tokenAddress: string): boolean {
    try {
      const chainTokens = this.customTokens.get(chain) || []
      const filteredTokens = chainTokens.filter(token => 
        token.address?.toLowerCase() !== tokenAddress.toLowerCase()
      )
      
      if (filteredTokens.length !== chainTokens.length) {
        this.customTokens.set(chain, filteredTokens)
        this.saveCustomTokens()
        return true
      }
      
      return false
    } catch (error) {
      console.error('Failed to remove custom token:', error)
      return false
    }
  }

  /**
   * 全トークンリストを取得（デフォルト + カスタム）
   */
  public getAllTokens(chain: SupportedChain): MultiChainToken[] {
    const defaultTokens = this.getDefaultTokens(chain)
    const customTokens = this.customTokens.get(chain) || []
    
    const allTokens = [...defaultTokens, ...customTokens]
    
    // 非表示トークンを除外
    return allTokens.filter(token => {
      const tokenId = this.getTokenId(token)
      return !this.hiddenTokens.has(tokenId)
    })
  }

  /**
   * 人気トークンのみを取得
   */
  public getPopularTokens(chain: SupportedChain): MultiChainToken[] {
    return this.getAllTokens(chain).filter(token => token.isPopular)
  }

  /**
   * お気に入りトークンを取得
   */
  public getFavoriteTokens(chain: SupportedChain): MultiChainToken[] {
    return this.getAllTokens(chain).filter(token => {
      const tokenId = this.getTokenId(token)
      return this.favoriteTokens.has(tokenId)
    })
  }

  /**
   * トークンをお気に入りに追加/削除
   */
  public toggleFavoriteToken(token: MultiChainToken): boolean {
    const tokenId = this.getTokenId(token)
    
    if (this.favoriteTokens.has(tokenId)) {
      this.favoriteTokens.delete(tokenId)
    } else {
      this.favoriteTokens.add(tokenId)
    }
    
    this.saveFavoriteTokens()
    return this.favoriteTokens.has(tokenId)
  }

  /**
   * トークンを非表示に設定/解除
   */
  public toggleHiddenToken(token: MultiChainToken): boolean {
    const tokenId = this.getTokenId(token)
    
    if (this.hiddenTokens.has(tokenId)) {
      this.hiddenTokens.delete(tokenId)
    } else {
      this.hiddenTokens.add(tokenId)
    }
    
    this.saveHiddenTokens()
    return this.hiddenTokens.has(tokenId)
  }

  /**
   * トークン検索
   */
  public searchTokens(
    chain: SupportedChain, 
    query: string
  ): MultiChainToken[] {
    const allTokens = this.getAllTokens(chain)
    const searchTerm = query.toLowerCase().trim()
    
    if (!searchTerm) {
      return allTokens
    }
    
    return allTokens.filter(token => 
      token.name.toLowerCase().includes(searchTerm) ||
      token.symbol.toLowerCase().includes(searchTerm) ||
      token.address?.toLowerCase().includes(searchTerm)
    )
  }

  /**
   * アドレスからトークン情報を取得
   */
  public async getTokenByAddress(
    chain: SupportedChain,
    tokenAddress: string
  ): Promise<MultiChainToken | null> {
    // 既存のトークンリストから検索
    const allTokens = this.getAllTokens(chain)
    const existingToken = allTokens.find(token => 
      token.address?.toLowerCase() === tokenAddress.toLowerCase()
    )
    
    if (existingToken) {
      return existingToken
    }
    
    // チェーンから動的に取得
    try {
      if (chain === 'ethereum' && this.ethereumService) {
        const tokenInfo = await this.ethereumService.getTokenInfo(tokenAddress)
        return {
          ...tokenInfo,
          isCustom: true,
          isPopular: false,
        }
      } else if (chain === 'tron' && this.tronService) {
        const tokenInfo = await this.tronService.getTokenInfo(tokenAddress)
        return {
          ...tokenInfo,
          isCustom: true,
          isPopular: false,
        }
      }
    } catch (error) {
      console.error('Failed to get token info from chain:', error)
    }
    
    return null
  }

  /**
   * ネットワーク情報を取得
   */
  public async getNetworkInfo(chain: SupportedChain): Promise<any> {
    try {
      if (chain === 'ethereum' && this.ethereumService) {
        return await this.ethereumService.getNetworkInfo()
      } else if (chain === 'tron' && this.tronService) {
        return await this.tronService.getNetworkInfo()
      }
    } catch (error) {
      console.error('Failed to get network info:', error)
    }
    
    return null
  }

  /**
   * チェーン固有のサービスを取得
   */
  public getChainService(chain: SupportedChain) {
    switch (chain) {
      case 'ethereum':
        return this.ethereumService
      case 'tron':
        return this.tronService
      default:
        return null
    }
  }

  /**
   * トークン情報を検証
   */
  private async validateToken(token: MultiChainToken): Promise<boolean> {
    try {
      if (!token.address || !token.symbol || !token.name) {
        return false
      }

      // チェーン固有の検証
      if (token.chain === 'ethereum' && this.ethereumService) {
        return this.ethereumService.isValidAddress(token.address)
      } else if (token.chain === 'tron' && this.tronService) {
        return this.tronService.isValidAddress(token.address)
      }
      
      return true
    } catch (error) {
      console.error('Token validation failed:', error)
      return false
    }
  }

  /**
   * トークンIDを生成（一意識別用）
   */
  private getTokenId(token: MultiChainToken): string {
    return `${token.chain}_${token.address || 'native'}`
  }

  /**
   * ユーザー設定を読み込み
   */
  private loadUserSettings(): void {
    try {
      // カスタムトークン
      const customTokensData = localStorage.getItem(STORAGE_KEYS.CUSTOM_TOKENS)
      if (customTokensData) {
        const parsed = JSON.parse(customTokensData)
        this.customTokens = new Map(Object.entries(parsed))
      }
      
      // お気に入りトークン
      const favoriteTokensData = localStorage.getItem(STORAGE_KEYS.FAVORITE_TOKENS)
      if (favoriteTokensData) {
        this.favoriteTokens = new Set(JSON.parse(favoriteTokensData))
      }
      
      // 非表示トークン
      const hiddenTokensData = localStorage.getItem(STORAGE_KEYS.HIDDEN_TOKENS)
      if (hiddenTokensData) {
        this.hiddenTokens = new Set(JSON.parse(hiddenTokensData))
      }
    } catch (error) {
      console.error('Failed to load user settings:', error)
    }
  }

  /**
   * カスタムトークンを保存
   */
  private saveCustomTokens(): void {
    try {
      const data = Object.fromEntries(this.customTokens.entries())
      localStorage.setItem(STORAGE_KEYS.CUSTOM_TOKENS, JSON.stringify(data))
    } catch (error) {
      console.error('Failed to save custom tokens:', error)
    }
  }

  /**
   * お気に入りトークンを保存
   */
  private saveFavoriteTokens(): void {
    try {
      const data = Array.from(this.favoriteTokens)
      localStorage.setItem(STORAGE_KEYS.FAVORITE_TOKENS, JSON.stringify(data))
    } catch (error) {
      console.error('Failed to save favorite tokens:', error)
    }
  }

  /**
   * 非表示トークンを保存
   */
  private saveHiddenTokens(): void {
    try {
      const data = Array.from(this.hiddenTokens)
      localStorage.setItem(STORAGE_KEYS.HIDDEN_TOKENS, JSON.stringify(data))
    } catch (error) {
      console.error('Failed to save hidden tokens:', error)
    }
  }

  /**
   * 全設定をリセット
   */
  public resetSettings(): void {
    this.customTokens.clear()
    this.favoriteTokens.clear()
    this.hiddenTokens.clear()
    
    localStorage.removeItem(STORAGE_KEYS.CUSTOM_TOKENS)
    localStorage.removeItem(STORAGE_KEYS.FAVORITE_TOKENS)
    localStorage.removeItem(STORAGE_KEYS.HIDDEN_TOKENS)
  }

  /**
   * 設定をエクスポート
   */
  public exportSettings(): string {
    const settings = {
      customTokens: Object.fromEntries(this.customTokens.entries()),
      favoriteTokens: Array.from(this.favoriteTokens),
      hiddenTokens: Array.from(this.hiddenTokens),
      exportedAt: new Date().toISOString(),
    }
    
    return JSON.stringify(settings, null, 2)
  }

  /**
   * 設定をインポート
   */
  public importSettings(settingsJson: string): boolean {
    try {
      const settings = JSON.parse(settingsJson)
      
      if (settings.customTokens) {
        this.customTokens = new Map(Object.entries(settings.customTokens))
        this.saveCustomTokens()
      }
      
      if (settings.favoriteTokens) {
        this.favoriteTokens = new Set(settings.favoriteTokens)
        this.saveFavoriteTokens()
      }
      
      if (settings.hiddenTokens) {
        this.hiddenTokens = new Set(settings.hiddenTokens)
        this.saveHiddenTokens()
      }
      
      return true
    } catch (error) {
      console.error('Failed to import settings:', error)
      return false
    }
  }
}

// デフォルトエクスポート
export default ChainManagerService