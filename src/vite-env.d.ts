/// <reference types="vite/client" />

// styled-jsx関連の型定義
declare namespace JSX {
  interface IntrinsicElements {
    style: React.DetailedHTMLProps<React.StyleHTMLAttributes<HTMLStyleElement>, HTMLStyleElement> & {
      jsx?: boolean
      global?: boolean
    }
  }
}

// Cardano & TronWeb関連のグローバル型定義
declare global {
  interface Window {
    ethereum?: import('./types/wallet').ExtendedMetaMaskProvider
    tronWeb?: import('./types/wallet').TronWebInstance
    tronLink?: import('./types/wallet').TronLinkProvider
    // Cardano wallet support
    cardano?: {
      nami?: CardanoAPI;
      eternl?: CardanoAPI;
      flint?: CardanoAPI;
      yoroi?: CardanoAPI;
      typhon?: CardanoAPI;
      lace?: CardanoAPI;
      nufi?: CardanoAPI;
      gero?: CardanoAPI;
      [key: string]: CardanoAPI | undefined;
    };
    Buffer?: typeof Buffer;
  }
}

// CIP-30 Wallet API types for Cardano
interface CardanoAPI {
  enable(): Promise<WalletAPI>;
  isEnabled(): Promise<boolean>;
  apiVersion: string;
  name: string;
  icon: string;
}

interface WalletAPI {
  getNetworkId(): Promise<number>;
  getUtxos(amount?: string, paginate?: Record<string, unknown>): Promise<string[]>;
  getBalance(): Promise<string>;
  getUsedAddresses(): Promise<string[]>;
  getUnusedAddresses(): Promise<string[]>;
  getChangeAddress(): Promise<string>;
  getRewardAddresses(): Promise<string[]>;
  signTx(tx: string, partialSign?: boolean): Promise<string>;
  signData(addr: string, payload: string): Promise<{ signature: string; key: string }>;
  submitTx(tx: string): Promise<string>;
}

// TronWebライブラリの型定義（簡略版）
declare module 'tronweb' {
  class TronWeb {
    constructor(options: {
      fullHost: string
      headers?: Record<string, string>
      privateKey?: string
    })
    
    ready: boolean
    defaultAddress: {
      base58: string | null
      hex: string | null
    }
    
    trx: {
      getAccount: (address: string) => Promise<Record<string, unknown>>
      getBalance: (address: string) => Promise<number>
      getTransactionInfo: (txHash: string) => Promise<Record<string, unknown>>
      sendRawTransaction: (signedTransaction: unknown) => Promise<Record<string, unknown>>
      sign: (transaction: unknown) => Promise<Record<string, unknown>>
      getTransaction: (txHash: string) => Promise<Record<string, unknown>>
      getCurrentBlock: () => Promise<Record<string, unknown>>
      getBlockByNumber: (blockNumber: number) => Promise<Record<string, unknown>>
    }
    
    contract: (abi?: Record<string, unknown>[], address?: string) => Record<string, unknown>
    
    utils: {
      accounts: {
        generateAccount: () => Record<string, unknown>
      }
      crypto: {
        getBase58CheckAddress: (hex: string) => string
        decodeBase58Address: (base58: string) => string
      }
      abi: {
        encodeParams: (types: string[], values: unknown[]) => string
        decodeParams: (types: string[], data: string) => unknown[]
      }
      code: {
        hexStr2byteArray: (str: string) => number[]
        byteArray2hexStr: (arr: number[]) => string
      }
    }
    
    setAddress: (address: string) => void
    isAddress: (address: string) => boolean
    
    static providers: {
      HttpProvider: new (host: string, timeout?: number, user?: string, password?: string, headers?: Record<string, string>) => Record<string, unknown>
    }
  }
  
  export = TronWeb
}

// 環境変数の型定義を拡張
interface ImportMetaEnv {
  readonly VITE_APP_NAME: string
  readonly VITE_APP_VERSION: string
  readonly VITE_CHAIN_ID: string
  readonly VITE_TOKEN_ADDRESS: string
  readonly VITE_TRON_NETWORK: string
  readonly VITE_TRON_API_KEY: string
  readonly VITE_DEBUG: string
  readonly VITE_BUILD_SOURCEMAP: string
  readonly VITE_BUILD_ANALYZE: string
  // Cardano OTC related environment variables
  readonly VITE_CARDANO_NETWORK: string
  readonly VITE_BLOCKFROST_PROJECT_ID: string
  readonly VITE_BLOCKFROST_API_URL: string
  readonly VITE_CSL_WASM_URL?: string
  readonly VITE_ENABLE_PERFORMANCE_MONITORING?: string
  readonly VITE_LOG_LEVEL?: string
  readonly VITE_ENABLE_ERROR_BOUNDARY?: string
  readonly VITE_API_BASE_URL?: string
  readonly VITE_WEBSOCKET_URL?: string
  readonly VITE_MOCK_WALLET?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
