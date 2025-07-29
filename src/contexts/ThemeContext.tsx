import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { ThemeContextType } from '@/types'
import { STORAGE_KEYS } from '@/utils/constants'

// コンテキスト作成
const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

// プロバイダーコンポーネント
interface ThemeProviderProps {
  children: ReactNode
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [isDark, setIsDark] = useState<boolean>(false)

  /**
   * システムのダークモード設定を取得
   */
  const getSystemTheme = (): boolean => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    return false
  }

  /**
   * ローカルストレージからテーマ設定を取得
   */
  const getSavedTheme = (): boolean | null => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEYS.THEME)
      if (saved !== null) {
        return saved === 'dark'
      }
    }
    return null
  }

  /**
   * テーマをローカルストレージに保存
   */
  const saveTheme = (isDark: boolean): void => {
    if (typeof window !== 'undefined') {
      const themeValue = isDark ? 'dark' : 'light'
      console.log('saveTheme called with isDark:', isDark, 'saving as:', themeValue)
      localStorage.setItem(STORAGE_KEYS.THEME, themeValue)
      const saved = localStorage.getItem(STORAGE_KEYS.THEME)
      console.log('saved theme verified:', saved)
    }
  }

  /**
   * HTMLのclass属性を更新
   */
  const updateHtmlClass = (isDark: boolean): void => {
    if (typeof window !== 'undefined') {
      const html = document.documentElement
      console.log('updateHtmlClass called with isDark:', isDark)
      console.log('current html classes before update:', html.className)
      console.log('classList contains dark?:', html.classList.contains('dark'))
      
      if (isDark) {
        html.classList.add('dark')
        console.log('added dark class')
      } else {
        html.classList.remove('dark')
        console.log('removed dark class')
      }
      
      console.log('current html classes after update:', html.className)
      console.log('classList contains dark after update?:', html.classList.contains('dark'))
      
      // 強制的にクラスを設定
      if (isDark && !html.classList.contains('dark')) {
        console.warn('Force adding dark class')
        html.classList.add('dark')
      } else if (!isDark && html.classList.contains('dark')) {
        console.warn('Force removing dark class')
        html.classList.remove('dark')
      }
    }
  }

  /**
   * テーマ切り替え
   */
  const toggleTheme = (): void => {
    console.log('toggleTheme called, current isDark:', isDark)
    const newIsDark = !isDark
    console.log('new isDark value:', newIsDark)
    setIsDark(newIsDark)
    saveTheme(newIsDark)
    updateHtmlClass(newIsDark)
    console.log('toggleTheme completed')
  }

  /**
   * 初期テーマ設定
   */
  useEffect(() => {
    const savedTheme = getSavedTheme()
    const initialIsDark = savedTheme !== null ? savedTheme : getSystemTheme()
    
    setIsDark(initialIsDark)
    updateHtmlClass(initialIsDark)
    
    // 初回のみローカルストレージに保存（システム設定から取得した場合）
    if (savedTheme === null) {
      saveTheme(initialIsDark)
    }
  }, [])

  /**
   * システムテーマ変更の監視
   */
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    
    const handleSystemThemeChange = (e: MediaQueryListEvent): void => {
      const savedTheme = getSavedTheme()
      // ユーザーが手動で設定していない場合のみシステム設定に従う
      if (savedTheme === null) {
        const systemIsDark = e.matches
        setIsDark(systemIsDark)
        updateHtmlClass(systemIsDark)
        saveTheme(systemIsDark)
      }
    }

    // モダンブラウザ
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleSystemThemeChange)
      return () => {
        mediaQuery.removeEventListener('change', handleSystemThemeChange)
      }
    } 
    // レガシーブラウザ対応
    else if (mediaQuery.addListener) {
      mediaQuery.addListener(handleSystemThemeChange)
      return () => {
        mediaQuery.removeListener(handleSystemThemeChange)
      }
    }
  }, [])

  /**
   * ページ読み込み時のフラッシュ防止
   */
  useEffect(() => {
    // CSSカスタムプロパティでテーマカラーを設定
    const updateCSSProperties = (isDark: boolean): void => {
      const root = document.documentElement
      
      if (isDark) {
        root.style.setProperty('--color-scheme', 'dark')
        root.style.setProperty('--theme-background', '#111827')
        root.style.setProperty('--theme-foreground', '#f9fafb')
      } else {
        root.style.setProperty('--color-scheme', 'light')
        root.style.setProperty('--theme-background', '#f9fafb')
        root.style.setProperty('--theme-foreground', '#111827')
      }
    }

    updateCSSProperties(isDark)
  }, [isDark])

  /**
   * キーボードショートカット
   */
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      // Ctrl/Cmd + Shift + L でテーマ切り替え
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'L') {
        event.preventDefault()
        toggleTheme()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isDark, toggleTheme])

  const contextValue: ThemeContextType = {
    isDark,
    toggleTheme,
  }

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  )
}

/**
 * ThemeContextを使用するカスタムフック
 */
// eslint-disable-next-line react-refresh/only-export-components
export const useThemeContext = (): ThemeContextType => {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useThemeContext must be used within a ThemeProvider')
  }
  return context
}

/**
 * テーマ関連のユーティリティフック
 */
// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => {
  const { isDark, toggleTheme } = useThemeContext()
  
  return {
    isDark,
    isLight: !isDark,
    toggleTheme,
    theme: isDark ? 'dark' : 'light' as const,
    // CSSクラス用のヘルパー
    themeClass: (lightClass: string, darkClass: string) => isDark ? darkClass : lightClass,
    // 条件付きスタイル用のヘルパー
    themeValue: <T,>(lightValue: T, darkValue: T) => isDark ? darkValue : lightValue,
  }
}