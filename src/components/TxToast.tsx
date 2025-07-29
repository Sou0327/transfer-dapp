import React, { useEffect, useState } from 'react'
import { TxToastProps, Toast } from '@/types'

interface ToastItemProps {
  toast: Toast
  onDismiss: (id: string) => void
  isVisible: boolean
}

/**
 * 個別のトースト通知アイテム
 */
const ToastItem: React.FC<ToastItemProps> = ({ toast, onDismiss, isVisible }) => {
  const [isExiting, setIsExiting] = useState(false)

  /**
   * 閉じるアニメーション
   */
  const handleDismiss = () => {
    setIsExiting(true)
    setTimeout(() => {
      onDismiss(toast.id)
    }, 300) // アニメーション時間と同期
  }

  /**
   * 自動消去タイマー
   */
  useEffect(() => {
    if (toast.duration && toast.duration > 0) {
      const timer = setTimeout(() => {
        handleDismiss()
      }, toast.duration)

      return () => clearTimeout(timer)
    }
  }, [toast.duration, handleDismiss])

  /**
   * タイプに基づくアイコンとスタイル
   */
  const getToastConfig = (type: Toast['type']) => {
    switch (type) {
      case 'success':
        return {
          icon: (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          ),
          className: 'toast-success',
          iconColor: 'text-green-600 dark:text-green-400',
        }
      case 'error':
        return {
          icon: (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          ),
          className: 'toast-error',
          iconColor: 'text-red-600 dark:text-red-400',
        }
      case 'warning':
        return {
          icon: (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          ),
          className: 'toast-warning',
          iconColor: 'text-yellow-600 dark:text-yellow-400',
        }
      case 'info':
        return {
          icon: (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          ),
          className: 'toast-info',
          iconColor: 'text-blue-600 dark:text-blue-400',
        }
      default:
        return {
          icon: null,
          className: 'toast-info',
          iconColor: 'text-gray-600 dark:text-gray-400',
        }
    }
  }

  const config = getToastConfig(toast.type)

  return (
    <div
      className={`toast ${config.className} transform transition-all duration-300 ease-in-out ${
        isVisible && !isExiting
          ? 'translate-x-0 opacity-100 scale-100'
          : 'translate-x-full opacity-0 scale-95'
      }`}
      role="alert"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="flex items-start gap-3">
        {/* アイコン */}
        {config.icon && (
          <div className={`flex-shrink-0 ${config.iconColor}`}>
            {config.icon}
          </div>
        )}

        {/* コンテンツ */}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium">
            {toast.title}
          </h4>
          <div className="mt-1 text-sm whitespace-pre-line">
            {toast.message}
          </div>

          {/* 進行状況バー（持続時間がある場合） */}
          {toast.duration && toast.duration > 0 && (
            <div className="mt-2 w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1">
              <div
                className={`h-1 rounded-full transition-all ease-linear ${
                  toast.type === 'success' ? 'bg-green-500' :
                  toast.type === 'error' ? 'bg-red-500' :
                  toast.type === 'warning' ? 'bg-yellow-500' :
                  'bg-blue-500'
                }`}
                style={{
                  animation: `shrink ${toast.duration}ms linear forwards`
                }}
              />
            </div>
          )}
        </div>

        {/* 閉じるボタン */}
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          aria-label="通知を閉じる"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
  )
}

/**
 * トースト通知表示コンポーネント
 */
export const TxToast: React.FC<TxToastProps> = ({ toasts, onDismiss }) => {
  const [visibleToasts, setVisibleToasts] = useState<string[]>([])

  /**
   * トーストの表示状態を管理
   */
  useEffect(() => {
    const newToastIds = toasts.map(toast => toast.id)
    
    // 新しいトーストを段階的に表示
    newToastIds.forEach((id, index) => {
      if (!visibleToasts.includes(id)) {
        setTimeout(() => {
          setVisibleToasts(prev => [...prev, id])
        }, index * 100) // 100msの間隔で表示
      }
    })

    // 削除されたトーストを非表示にする
    const removedToasts = visibleToasts.filter(id => !newToastIds.includes(id))
    removedToasts.forEach(id => {
      setVisibleToasts(prev => prev.filter(toastId => toastId !== id))
    })
  }, [toasts, visibleToasts])

  /**
   * 全て閉じる
   */
  const handleDismissAll = () => {
    toasts.forEach(toast => {
      onDismiss(toast.id)
    })
  }

  if (toasts.length === 0) {
    return null
  }

  return (
    <>
      {/* メイントースト表示エリア */}
      <div
        className="fixed top-4 right-4 z-50 space-y-2 max-w-sm w-full"
        style={{ maxHeight: 'calc(100vh - 2rem)' }}
      >
        {/* スクロール可能なコンテナ */}
        <div className="overflow-y-auto max-h-full space-y-2">
          {toasts.map((toast) => (
            <ToastItem
              key={toast.id}
              toast={toast}
              onDismiss={onDismiss}
              isVisible={visibleToasts.includes(toast.id)}
            />
          ))}
        </div>

        {/* 複数のトーストがある場合の一括操作 */}
        {toasts.length > 2 && (
          <div className="flex justify-end">
            <button
              onClick={handleDismissAll}
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 bg-white dark:bg-gray-800 px-2 py-1 rounded shadow border border-gray-200 dark:border-gray-700 transition-colors"
            >
              すべて閉じる
            </button>
          </div>
        )}
      </div>

      {/* モバイル用のオーバーレイ（複数トーストがある場合） */}
      {toasts.length > 3 && (
        <div className="fixed inset-0 bg-black bg-opacity-10 z-40 sm:hidden" />
      )}

      {/* アニメーション用CSS */}
      <style>{`
        @keyframes shrink {
          from {
            width: 100%;
          }
          to {
            width: 0%;
          }
        }
      `}</style>
    </>
  )
}

/**
 * グローバルトースト表示フック
 */
// eslint-disable-next-line react-refresh/only-export-components
export const useGlobalToast = () => {
  const { toasts, removeToast } = React.useContext(
    React.createContext<{
      toasts: Toast[]
      removeToast: (id: string) => void
    }>({
      toasts: [],
      removeToast: () => {},
    })
  )

  return { toasts, onDismiss: removeToast }
}

export default TxToast