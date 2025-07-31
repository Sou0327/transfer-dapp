/**
 * Web3 utilities for wallet integration
 */

export interface NetworkConfig {
  name: string
  chainId: number
  currency: string
  rpcUrl?: string
  blockExplorer?: string
}

// Supported networks configuration
const SUPPORTED_NETWORKS: Record<number, NetworkConfig> = {
  1: {
    name: 'Ethereum Mainnet',
    chainId: 1,
    currency: 'ETH',
    blockExplorer: 'https://etherscan.io'
  },
  5: {
    name: 'Goerli Testnet',
    chainId: 5,
    currency: 'GoerliETH',
    blockExplorer: 'https://goerli.etherscan.io'
  }
}

/**
 * Extended window interface for Web3 providers
 */
interface WindowWithEthereum extends Window {
  ethereum?: {
    isMetaMask?: boolean;
    request?: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  };
}

/**
 * Check if MetaMask is installed
 */
export const isMetaMaskInstalled = (): boolean => {
  if (typeof window === 'undefined') return false
  return !!(window as WindowWithEthereum).ethereum?.isMetaMask
}

/**
 * Check if network is supported
 */
export const isSupportedNetwork = (chainId: number): boolean => {
  return chainId in SUPPORTED_NETWORKS
}

/**
 * Get network configuration
 */
export const getNetworkConfig = (chainId: number): NetworkConfig | null => {
  return SUPPORTED_NETWORKS[chainId] || null
}

/**
 * Get all supported networks
 */
export const getSupportedNetworks = (): NetworkConfig[] => {
  return Object.values(SUPPORTED_NETWORKS)
}