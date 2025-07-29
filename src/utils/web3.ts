import { ethers } from 'ethers'
import { ExtendedMetaMaskProvider, NetworkConfig, ErrorType, TokenCompatibilityCheck } from '../types'
import { SUPPORTED_NETWORKS, ERC20_ABI, ERROR_MESSAGES } from './constants'

// 型エイリアス（後方互換性のため）
type MetaMaskProvider = ExtendedMetaMaskProvider

/**
 * MetaMaskプロバイダーを取得
 */
export const getMetaMaskProvider = (): MetaMaskProvider | null => {
  if (typeof window === 'undefined') {
    return null
  }

  console.log('[MetaMask Detection] Starting detection...')
  console.log('[MetaMask Detection] window.ethereum:', !!window.ethereum)
  console.log('[MetaMask Detection] window.ethereum.isMetaMask:', window.ethereum?.isMetaMask)
  console.log('[MetaMask Detection] window.ethereum.providers:', window.ethereum?.providers?.length || 0)

  // 複数のウォレットが存在する場合を考慮
  if (window.ethereum?.providers && Array.isArray(window.ethereum.providers)) {
    console.log('[MetaMask Detection] Checking multiple providers...')
    const metaMaskProvider = window.ethereum.providers.find((provider: MetaMaskProvider) => {
      console.log('[MetaMask Detection] Provider check:', {
        isMetaMask: provider.isMetaMask,
        // MetaMaskの別の識別子もチェック
        _metamask: !!provider._metamask,
        constructor: provider.constructor?.name
      })
      return provider.isMetaMask || provider._metamask
    })
    if (metaMaskProvider) {
      console.log('[MetaMask Detection] Found MetaMask in providers')
      return metaMaskProvider
    }
  }

  // 単一のMetaMaskプロバイダー（従来の方法）
  if (window.ethereum) {
    const isMetaMask = window.ethereum.isMetaMask || 
                      window.ethereum._metamask || 
                      (window.ethereum.selectedProvider && window.ethereum.selectedProvider.isMetaMask)
    
    console.log('[MetaMask Detection] Single provider check:', {
      isMetaMask: window.ethereum.isMetaMask,
      _metamask: !!window.ethereum._metamask,
      selectedProvider: !!window.ethereum.selectedProvider,
      result: isMetaMask
    })
    
    if (isMetaMask) {
      console.log('[MetaMask Detection] Found MetaMask as single provider')
      return window.ethereum
    }
  }

  // Legacy check for older versions
  if (window.web3 && window.web3.currentProvider && window.web3.currentProvider.isMetaMask) {
    console.log('[MetaMask Detection] Found MetaMask via legacy web3')
    return window.web3.currentProvider
  }

  console.log('[MetaMask Detection] MetaMask not detected')
  return null
}

/**
 * MetaMaskがインストールされているかチェック
 */
export const isMetaMaskInstalled = (): boolean => {
  return getMetaMaskProvider() !== null
}

/**
 * Ethers.jsのBrowserProviderを作成
 */
export const createProvider = (): ethers.BrowserProvider | null => {
  const metaMask = getMetaMaskProvider()
  if (!metaMask) return null
  
  return new ethers.BrowserProvider(metaMask)
}

/**
 * ERC-20コントラクトインスタンスを作成
 */
export const createERC20Contract = (
  tokenAddress: string,
  provider: ethers.BrowserProvider
): ethers.Contract => {
  return new ethers.Contract(tokenAddress, ERC20_ABI, provider)
}

/**
 * アドレスの妥当性をチェック
 */
export const isValidAddress = (address: string): boolean => {
  try {
    return ethers.isAddress(address)
  } catch {
    return false
  }
}

/**
 * 金額の妥当性をチェック
 */
export const isValidAmount = (amount: string): boolean => {
  try {
    const parsed = ethers.parseEther(amount)
    return parsed > 0n
  } catch {
    return false
  }
}

/**
 * Weiから読みやすい形式に変換
 */
export const formatBalance = (balance: string, decimals = 18): string => {
  try {
    return ethers.formatUnits(balance, decimals)
  } catch {
    return '0'
  }
}

/**
 * 読みやすい形式からWeiに変換
 */
export const parseAmount = (amount: string, decimals = 18): bigint => {
  return ethers.parseUnits(amount, decimals)
}

/**
 * ネットワークが対応しているかチェック
 */
export const isSupportedNetwork = (chainId: number): boolean => {
  return chainId in SUPPORTED_NETWORKS
}

/**
 * ネットワーク設定を取得
 */
export const getNetworkConfig = (chainId: number): NetworkConfig | null => {
  return SUPPORTED_NETWORKS[chainId] || null
}

/**
 * チェーンIDを数値に変換
 */
export const normalizeChainId = (chainId: string | number): number => {
  if (typeof chainId === 'string') {
    return parseInt(chainId, 16)
  }
  return chainId
}

/**
 * エラーの種類を判定
 */
export const detectErrorType = (error: unknown): ErrorType => {
  const err = error as Record<string, unknown> // Type assertion for checking properties
  // ユーザー拒否エラー
  if (err?.code === 4001) {
    return 'TRANSACTION_REJECTED'
  }
  
  // 資金不足エラー
  if (
    err?.code === -32603 ||
    (typeof err?.message === 'string' && err.message.toLowerCase().includes('insufficient')) ||
    (typeof err?.message === 'string' && err.message.toLowerCase().includes('funds'))
  ) {
    return 'INSUFFICIENT_FUNDS'
  }
  
  // ネットワークエラー
  if (
    (typeof err?.message === 'string' && err.message.toLowerCase().includes('network')) ||
    (typeof err?.message === 'string' && err.message.toLowerCase().includes('connection')) ||
    err?.code === -32002
  ) {
    return 'NETWORK_ERROR'
  }
  
  // 無効なアドレス
  if (typeof err?.message === 'string' && err.message.toLowerCase().includes('invalid address')) {
    return 'INVALID_ADDRESS'
  }
  
  // 無効な金額
  if (typeof err?.message === 'string' && err.message.toLowerCase().includes('invalid amount')) {
    return 'INVALID_AMOUNT'
  }
  
  return 'UNKNOWN_ERROR'
}

/**
 * エラーメッセージを生成
 */
export const getErrorMessage = (errorType: ErrorType, details?: string): string => {
  const baseMessage = ERROR_MESSAGES[errorType] || ERROR_MESSAGES.UNKNOWN_ERROR
  return details ? `${baseMessage} (${details})` : baseMessage
}

/**
 * ネットワーク切り替えを要求
 */
export const switchNetwork = async (chainId: number): Promise<void> => {
  const provider = getMetaMaskProvider()
  if (!provider) {
    throw new Error(ERROR_MESSAGES.METAMASK_NOT_INSTALLED)
  }
  
  const hexChainId = `0x${chainId.toString(16)}`
  
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: hexChainId }]
    })
  } catch (error: unknown) {
    const err = error as Record<string, unknown> // Type assertion for error handling
    // ネットワークが追加されていない場合
    if (err?.code === 4902) {
      await addNetwork(chainId)
    } else {
      throw error
    }
  }
}

/**
 * ネットワークを追加
 */
export const addNetwork = async (chainId: number): Promise<void> => {
  const provider = getMetaMaskProvider()
  const networkConfig = getNetworkConfig(chainId)
  
  if (!provider || !networkConfig) {
    throw new Error('Network not supported')
  }
  
  await provider.request({
    method: 'wallet_addEthereumChain',
    params: [{
      chainId: `0x${chainId.toString(16)}`,
      chainName: networkConfig.name,
      nativeCurrency: {
        name: networkConfig.symbol,
        symbol: networkConfig.symbol,
        decimals: 18
      },
      rpcUrls: networkConfig.rpcUrl ? [networkConfig.rpcUrl] : [],
      blockExplorerUrls: networkConfig.blockExplorerUrl ? [networkConfig.blockExplorerUrl] : []
    }]
  })
}

/**
 * 非標準ERC-20トークンの互換性チェック
 * @deprecated 新しいtokenCompatibilityモジュールを使用してください
 */
export const checkTokenCompatibility = async (
  tokenContract: ethers.Contract,
  txHash: string,
  expectedAmount: bigint,
  fromAddress: string,
  toAddress?: string
): Promise<TokenCompatibilityCheck> => {
  // 新しい実装を動的インポートして使用
  const { checkTokenCompatibility: newCheck } = await import('./tokenCompatibility')
  return newCheck(tokenContract, txHash, expectedAmount, fromAddress, toAddress)
}

/**
 * トランザクションハッシュからエクスプローラーURLを生成
 */
export const getExplorerUrl = (txHash: string, chainId: number): string => {
  const networkConfig = getNetworkConfig(chainId)
  if (!networkConfig?.blockExplorerUrl) {
    return `https://etherscan.io/tx/${txHash}`
  }
  return `${networkConfig.blockExplorerUrl}/tx/${txHash}`
}

/**
 * アドレスからエクスプローラーURLを生成
 */
export const getAddressExplorerUrl = (address: string, chainId: number): string => {
  const networkConfig = getNetworkConfig(chainId)
  if (!networkConfig?.blockExplorerUrl) {
    return `https://etherscan.io/address/${address}`
  }
  return `${networkConfig.blockExplorerUrl}/address/${address}`
}

/**
 * アドレスを短縮表示
 */
export const truncateAddress = (address: string, startLength = 6, endLength = 4): string => {
  if (!address || address.length <= startLength + endLength) {
    return address
  }
  return `${address.slice(0, startLength)}...${address.slice(-endLength)}`
}

/**
 * 金額をローカライズ表示
 */
export const formatCurrency = (amount: string, decimals = 4, locale = 'ja-JP'): string => {
  try {
    const num = parseFloat(amount)
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    }).format(num)
  } catch {
    return amount
  }
}