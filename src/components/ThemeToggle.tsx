import React, { useState } from 'react'
import { ThemeToggleProps } from '@/types'
import { useTheme } from '@/contexts/ThemeContext'

/**
 * テーマ切り替えコンポーネント
 */
export const ThemeToggle: React.FC<ThemeToggleProps> = ({ className = '' }) => {
  const { isDark, toggleTheme, themeClass } = useTheme()
  const [isAnimating, setIsAnimating] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)

  /**
   * テーマ切り替えハンドラー
   */
  const handleToggle = () => {
    console.log('ThemeToggle handleToggle called, current isDark:', isDark)
    if (isAnimating) return

    setIsAnimating(true)
    console.log('calling toggleTheme from ThemeToggle')
    toggleTheme()

    // アニメーション完了後にフラグをリセット
    setTimeout(() => {
      setIsAnimating(false)
    }, 300)
  }

  /**
   * キーボードハンドラー
   */
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleToggle()
    }
  }

  /**
   * 太陽アイコン（ライトモード）
   */
  const SunIcon = () => (
    <svg
      className={`w-5 h-5 transition-all duration-300 ${
        isDark ? 'rotate-90 scale-0' : 'rotate-0 scale-100'
      }`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
  )

  /**
   * 月アイコン（ダークモード）
   */
  const MoonIcon = () => (
    <svg
      className={`w-5 h-5 transition-all duration-300 ${
        isDark ? 'rotate-0 scale-100' : '-rotate-90 scale-0'
      }`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
      />
    </svg>
  )

  return (
    <div className={`relative ${className}`}>
      {/* メインボタン */}
      <button
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        disabled={isAnimating}
        className={`relative p-2 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
          themeClass(
            'bg-gray-100 hover:bg-gray-200 text-gray-700 focus:ring-blue-500',
            'bg-gray-700 hover:bg-gray-600 text-gray-300 focus:ring-blue-400'
          )
        } ${
          isAnimating ? 'cursor-not-allowed opacity-75' : 'hover:scale-105 active:scale-95'
        }`}
        aria-label={`テーマを${isDark ? 'ライト' : 'ダーク'}モードに切り替え`}
        aria-pressed={isDark}
        title={`${isDark ? 'ライト' : 'ダーク'}モードに切り替え (Ctrl+Shift+L)`}
      >
        {/* アイコンコンテナ */}
        <div className="relative w-5 h-5">
          {/* 背景アニメーション */}
          <div
            className={`absolute inset-0 rounded-full transition-all duration-300 ${
              isAnimating
                ? themeClass(
                    'bg-yellow-300 scale-150 opacity-50',
                    'bg-blue-300 scale-150 opacity-50'
                  )
                : 'scale-0 opacity-0'
            }`}
          />
          
          {/* 太陽アイコン */}
          <div className="absolute inset-0 flex items-center justify-center">
            <SunIcon />
          </div>
          
          {/* 月アイコン */}
          <div className="absolute inset-0 flex items-center justify-center">
            <MoonIcon />
          </div>
        </div>

        {/* ローディングインジケーター */}
        {isAnimating && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className={`w-5 h-5 border-2 border-transparent rounded-full animate-spin ${
                themeClass('border-t-gray-600', 'border-t-gray-300')
              }`}
            />
          </div>
        )}
      </button>

      {/* ツールチップ */}
      {showTooltip && !isAnimating && (
        <div
          className={`absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 text-xs font-medium rounded-lg shadow-lg transition-all duration-200 z-50 ${
            themeClass(
              'bg-gray-900 text-white',
              'bg-white text-gray-900 border border-gray-200'
            )
          }`}
          role="tooltip"
        >
          <div className="text-center">
            <div className="font-semibold">
              {isDark ? 'ライトモード' : 'ダークモード'}に切り替え
            </div>
            <div className="text-xs opacity-75 mt-1">
              Ctrl + Shift + L
            </div>
          </div>
          
          {/* 矢印 */}
          <div
            className={`absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-transparent ${
              themeClass(
                'border-t-4 border-t-gray-900',
                'border-t-4 border-t-white'
              )
            }`}
          />
        </div>
      )}
    </div>
  )
}

/**
 * シンプル版テーマ切り替えボタン（トグルスイッチスタイル）
 */
export const ThemeToggleSwitch: React.FC<ThemeToggleProps> = ({ className = '' }) => {
  const { isDark, toggleTheme, themeClass } = useTheme()
  const [isAnimating, setIsAnimating] = useState(false)

  const handleToggle = () => {
    if (isAnimating) return

    setIsAnimating(true)
    toggleTheme()

    setTimeout(() => {
      setIsAnimating(false)
    }, 300)
  }

  return (
    <div className={`relative ${className}`}>
      <label className="flex items-center cursor-pointer">
        <span className="mr-3 text-sm font-medium text-gray-700 dark:text-gray-300">
          {isDark ? 'ダーク' : 'ライト'}
        </span>
        
        {/* トグルスイッチ */}
        <div className="relative">
          <input
            type="checkbox"
            checked={isDark}
            onChange={handleToggle}
            disabled={isAnimating}
            className="sr-only"
            aria-label="テーマ切り替え"
          />
          
          {/* スイッチ背景 */}
          <div
            className={`block w-14 h-8 rounded-full transition-all duration-300 ${
              themeClass(
                isDark ? 'bg-blue-600' : 'bg-gray-300',
                isDark ? 'bg-blue-500' : 'bg-gray-600'
              )
            } ${isAnimating ? 'opacity-75' : ''}`}
          >
            {/* スイッチハンドル */}
            <div
              className={`absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-all duration-300 flex items-center justify-center shadow-md ${
                isDark ? 'transform translate-x-6' : ''
              } ${isAnimating ? 'scale-110' : ''}`}
            >
              {/* ハンドル内アイコン */}
              <div className="w-3 h-3">
                {isDark ? (
                  <svg className="w-3 h-3 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </div>
            </div>
          </div>
        </div>
      </label>
    </div>
  )
}

/**
 * コンパクト版テーマ切り替えボタン
 */
export const ThemeToggleCompact: React.FC<ThemeToggleProps> = ({ className = '' }) => {
  const { isDark, toggleTheme } = useTheme()

  return (
    <button
      onClick={toggleTheme}
      className={`p-1.5 rounded-md transition-colors ${
        isDark
          ? 'text-yellow-500 hover:bg-gray-800'
          : 'text-gray-600 hover:bg-gray-100'
      } ${className}`}
      aria-label={`${isDark ? 'ライト' : 'ダーク'}モードに切り替え`}
      title={`${isDark ? 'ライト' : 'ダーク'}モードに切り替え`}
    >
      {isDark ? (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"
            clipRule="evenodd"
          />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
        </svg>
      )}
    </button>
  )
}

export default ThemeToggle