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

// TronWeb関連のグローバル型定義
declare global {
  interface Window {
    ethereum?: import('./types/wallet').ExtendedMetaMaskProvider
    tronWeb?: import('./types/wallet').TronWebInstance
    tronLink?: import('./types/wallet').TronLinkProvider
  }
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
      getAccount: (address: string) => Promise<any>
      getBalance: (address: string) => Promise<number>
      getTransactionInfo: (txHash: string) => Promise<any>
      sendRawTransaction: (signedTransaction: any) => Promise<any>
      sign: (transaction: any) => Promise<any>
      getTransaction: (txHash: string) => Promise<any>
      getCurrentBlock: () => Promise<any>
      getBlockByNumber: (blockNumber: number) => Promise<any>
    }
    
    contract: (abi?: any[], address?: string) => any
    
    utils: {
      accounts: {
        generateAccount: () => any
      }
      crypto: {
        getBase58CheckAddress: (hex: string) => string
        decodeBase58Address: (base58: string) => string
      }
      abi: {
        encodeParams: (types: string[], values: any[]) => string
        decodeParams: (types: string[], data: string) => any[]
      }
      code: {
        hexStr2byteArray: (str: string) => number[]
        byteArray2hexStr: (arr: number[]) => string
      }
    }
    
    setAddress: (address: string) => void
    isAddress: (address: string) => boolean
    
    static providers: {
      HttpProvider: new (host: string, timeout?: number, user?: string, password?: string, headers?: Record<string, string>) => any
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
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
