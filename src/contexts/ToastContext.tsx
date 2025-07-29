import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { Toast, ToastContextType } from '@/types'
import { TOAST_DURATION } from '@/utils/constants'

// コンテキスト作成
const ToastContext = createContext<ToastContextType | undefined>(undefined)

// プロバイダーコンポーネント
interface ToastProviderProps {
  children: ReactNode
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([])

  /**
   * 一意のIDを生成
   */
  const generateId = (): string => {
    return `toast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * トーストを追加
   */
  const addToast = useCallback((toastData: Omit<Toast, 'id'>): void => {
    const id = generateId()
    const duration = toastData.duration || TOAST_DURATION[toastData.type.toUpperCase() as keyof typeof TOAST_DURATION] || TOAST_DURATION.INFO

    const newToast: Toast = {
      id,
      ...toastData,
      duration,
    }

    setToasts(prev => [...prev, newToast])

    // 自動消去タイマー
    if (duration > 0) {
      setTimeout(() => {
        removeToast(id)
      }, duration)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * トーストを削除
   */
  const removeToast = useCallback((id: string): void => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }, [])

  /**
   * 全てのトーストをクリア
   */
  const clearToasts = useCallback((): void => {
    setToasts([])
  }, [])

  /**
   * 特定タイプのトーストのみを削除
   */
  const removeToastsByType = useCallback((type: Toast['type']): void => {
    setToasts(prev => prev.filter(toast => toast.type !== type))
  }, [])

  /**
   * 成功トーストを追加（ヘルパー）
   */
  const addSuccessToast = useCallback((title: string, message: string, duration?: number): void => {
    addToast({
      type: 'success',
      title,
      message,
      duration,
    })
  }, [addToast])

  /**
   * エラートーストを追加（ヘルパー）
   */
  const addErrorToast = useCallback((title: string, message: string, duration?: number): void => {
    addToast({
      type: 'error',
      title,
      message,
      duration,
    })
  }, [addToast])

  /**
   * 警告トーストを追加（ヘルパー）
   */
  const addWarningToast = useCallback((title: string, message: string, duration?: number): void => {
    addToast({
      type: 'warning',
      title,
      message,
      duration,
    })
  }, [addToast])

  /**
   * 情報トーストを追加（ヘルパー）
   */
  const addInfoToast = useCallback((title: string, message: string, duration?: number): void => {
    addToast({
      type: 'info',
      title,
      message,
      duration,
    })
  }, [addToast])

  /**
   * トランザクション関連のトーストヘルパー
   */
  const addTransactionToast = {
    pending: (txHash: string) => {
      addInfoToast(
        'トランザクション送信中',
        `トランザクションハッシュ: ${txHash.slice(0, 10)}...`,
        0 // 手動で削除するまで表示
      )
    },
    success: (txHash: string) => {
      // 保留中のトーストを削除
      removeToastsByType('info')
      addSuccessToast(
        'トランザクション成功',
        `送金が正常に完了しました。\nTxHash: ${txHash.slice(0, 10)}...`
      )
    },
    failed: (error: string) => {
      // 保留中のトーストを削除
      removeToastsByType('info')
      addErrorToast(
        'トランザクション失敗',
        error
      )
    },
    rejected: () => {
      // 保留中のトーストを削除
      removeToastsByType('info')
      addWarningToast(
        'トランザクション拒否',
        'ユーザーによってトランザクションが拒否されました。'
      )
    }
  }

  /**
   * ウォレット関連のトーストヘルパー
   */
  const addWalletToast = {
    connected: (account: string) => {
      addSuccessToast(
        'ウォレット接続完了',
        `アカウント: ${account.slice(0, 6)}...${account.slice(-4)}`
      )
    },
    disconnected: () => {
      addInfoToast(
        'ウォレット切断',
        'ウォレットが切断されました。'
      )
    },
    networkChanged: (networkName: string) => {
      addInfoToast(
        'ネットワーク変更',
        `${networkName}に切り替えられました。`
      )
    },
    networkUnsupported: (chainId: number) => {
      addWarningToast(
        'サポートされていないネットワーク',
        `チェーンID ${chainId} はサポートされていません。ネットワークを切り替えてください。`,
        0 // 手動で削除するまで表示
      )
    }
  }

  /**
   * 非標準トークン関連のトーストヘルパー
   */
  const addTokenCompatibilityToast = {
    warning: (warnings: string[]) => {
      addWarningToast(
        '非標準トークンを検出',
        `このトークンは非標準的な動作をする可能性があります：\n${warnings.join('\n')}`,
        0 // 手動で削除するまで表示
      )
    },
    balanceInconsistent: () => {
      addWarningToast(
        '残高の不整合',
        'トランザクション後の残高変更が期待値と異なります。トークンの動作を確認してください。'
      )
    }
  }

  /**
   * 最大トースト数の制限
   */
  React.useEffect(() => {
    const MAX_TOASTS = 5
    if (toasts.length > MAX_TOASTS) {
      setToasts(prev => prev.slice(-MAX_TOASTS))
    }
  }, [toasts.length])

  /**
   * ページ離脱時のクリーンアップ
   */
  React.useEffect(() => {
    const handleBeforeUnload = () => {
      clearToasts()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [clearToasts])

  const contextValue: ToastContextType & {
    removeToastsByType: (type: Toast['type']) => void
    addSuccessToast: (title: string, message: string, duration?: number) => void
    addErrorToast: (title: string, message: string, duration?: number) => void
    addWarningToast: (title: string, message: string, duration?: number) => void
    addInfoToast: (title: string, message: string, duration?: number) => void
    addTransactionToast: typeof addTransactionToast
    addWalletToast: typeof addWalletToast
    addTokenCompatibilityToast: typeof addTokenCompatibilityToast
  } = {
    toasts,
    addToast,
    removeToast,
    clearToasts,
    removeToastsByType,
    addSuccessToast,
    addErrorToast,
    addWarningToast,
    addInfoToast,
    addTransactionToast,
    addWalletToast,
    addTokenCompatibilityToast,
  }

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
    </ToastContext.Provider>
  )
}

/**
 * ToastContextを使用するカスタムフック
 */
// eslint-disable-next-line react-refresh/only-export-components
export const useToastContext = () => {
  const context = useContext(ToastContext)
  if (context === undefined) {
    throw new Error('useToastContext must be used within a ToastProvider')
  }
  return context as ToastContextType & {
    removeToastsByType: (type: Toast['type']) => void
    addSuccessToast: (title: string, message: string, duration?: number) => void
    addErrorToast: (title: string, message: string, duration?: number) => void
    addWarningToast: (title: string, message: string, duration?: number) => void
    addInfoToast: (title: string, message: string, duration?: number) => void
    addTransactionToast: {
      pending: (txHash: string) => void
      success: (txHash: string) => void
      failed: (error: string) => void
      rejected: () => void
    }
    addWalletToast: {
      connected: (account: string) => void
      disconnected: () => void
      networkChanged: (networkName: string) => void
      networkUnsupported: (chainId: number) => void
    }
    addTokenCompatibilityToast: {
      warning: (warnings: string[]) => void
      balanceInconsistent: () => void
    }
  }
}

/**
 * 簡易版トーストフック（基本機能のみ）
 */
// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => {
  const { 
    addSuccessToast, 
    addErrorToast, 
    addWarningToast, 
    addInfoToast,
    addTransactionToast,
    addWalletToast,
    addTokenCompatibilityToast,
  } = useToastContext()
  
  return {
    success: addSuccessToast,
    error: addErrorToast,
    warning: addWarningToast,
    info: addInfoToast,
    transaction: addTransactionToast,
    wallet: addWalletToast,
    tokenCompatibility: addTokenCompatibilityToast,
  }
}