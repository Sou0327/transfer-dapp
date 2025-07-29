import React, { useState, useCallback, useMemo, useEffect } from 'react'
import { useChainManager } from '@/hooks/useChainManager'
import { useBalanceHook } from '@/hooks/useBalanceHook'
import { useToast } from '@/contexts/ToastContext'
import { SupportedChain, MultiChainToken, TokenBalance } from '@/types'

interface TokenSelectorProps {
  className?: string
  chain: SupportedChain
  value?: MultiChainToken | null
  onChange: (token: MultiChainToken | null) => void
  variant?: 'dropdown' | 'modal' | 'inline'
  showBalance?: boolean
  showFavorites?: boolean
  allowCustomTokens?: boolean
  placeholder?: string
  disabled?: boolean
}

interface TokenWithBalance extends MultiChainToken {
  balance?: TokenBalance
  isFavorite?: boolean
}

/**
 * トークン選択コンポーネント
 * チェーン対応のトークン選択、検索、カスタム追加機能
 */
export const TokenSelector: React.FC<TokenSelectorProps> = ({
  className = '',
  chain,
  value,
  onChange,
  variant = 'dropdown',
  showBalance = true,
  showFavorites = true,
  allowCustomTokens = true,
  placeholder = 'トークンを選択',
  disabled = false
}) => {
  const chainManager = useChainManager()
  const balance = useBalanceHook()
  const toast = useToast()

  // UI状態
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [showAddToken, setShowAddToken] = useState(false)

  // カスタムトークン追加フォーム
  const [customToken, setCustomToken] = useState({
    address: '',
    symbol: '',
    name: '',
    decimals: 18,
  })

  /**
   * 利用可能なトークンを取得
   */
  const availableTokens = useMemo(() => {
    const tokens = chainManager.getTokensForChain(chain)
    const balances = balance.balances.filter(b => b.chain === chain)
    const favorites = chainManager.getFavoriteTokens(chain)

    const tokensWithBalance: TokenWithBalance[] = tokens.map(token => {
      const tokenBalance = balances.find(b => 
        b.token.address === token.address || 
        (!b.token.address && !token.address) // Native tokens
      )
      
      const isFavorite = favorites.some(fav => 
        fav.address === token.address ||
        (!fav.address && !token.address)
      )

      return {
        ...token,
        balance: tokenBalance,
        isFavorite
      }
    })

    return tokensWithBalance
  }, [chainManager, chain, balance.balances])

  /**
   * トークンカテゴリ
   */
  const categories = useMemo(() => {
    const cats = [
      { id: 'all', name: 'すべて', count: availableTokens.length },
    ]

    if (showFavorites) {
      const favoriteCount = availableTokens.filter(t => t.isFavorite).length
      if (favoriteCount > 0) {
        cats.push({ id: 'favorites', name: 'お気に入り', count: favoriteCount })
      }
    }

    cats.push(
      { id: 'popular', name: '人気', count: availableTokens.filter(t => t.category === 'popular').length },
      { id: 'stable', name: 'ステーブル', count: availableTokens.filter(t => t.category === 'stable').length },
      { id: 'defi', name: 'DeFi', count: availableTokens.filter(t => t.category === 'defi').length },
    )

    return cats.filter(cat => cat.count > 0)
  }, [availableTokens, showFavorites])

  /**
   * フィルタリングされたトークン
   */
  const filteredTokens = useMemo(() => {
    let filtered = availableTokens

    // カテゴリフィルター
    if (selectedCategory === 'favorites') {
      filtered = filtered.filter(token => token.isFavorite)
    } else if (selectedCategory !== 'all') {
      filtered = filtered.filter(token => token.category === selectedCategory)
    }

    // 検索フィルター
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(token =>
        token.symbol.toLowerCase().includes(query) ||
        token.name.toLowerCase().includes(query) ||
        token.address?.toLowerCase().includes(query)
      )
    }

    // ソート: お気に入り → 残高あり → アルファベット順
    return filtered.sort((a, b) => {
      if (a.isFavorite && !b.isFavorite) return -1
      if (!a.isFavorite && b.isFavorite) return 1
      
      const aHasBalance = a.balance && parseFloat(a.balance.balanceFormatted) > 0
      const bHasBalance = b.balance && parseFloat(b.balance.balanceFormatted) > 0
      
      if (aHasBalance && !bHasBalance) return -1
      if (!aHasBalance && bHasBalance) return 1
      
      return a.symbol.localeCompare(b.symbol)
    })
  }, [availableTokens, selectedCategory, searchQuery])

  /**
   * トークン選択処理
   */
  const handleTokenSelect = useCallback((token: TokenWithBalance) => {
    onChange(token)
    setIsOpen(false)
    setSearchQuery('')
  }, [onChange])

  /**
   * お気に入りトグル
   */
  const handleFavoriteToggle = useCallback(async (token: TokenWithBalance, e: React.MouseEvent) => {
    e.stopPropagation()
    
    try {
      if (token.isFavorite) {
        await chainManager.removeFavoriteToken(chain, token)
        toast.success('お気に入り削除', `${token.symbol}をお気に入りから削除しました`)
      } else {
        await chainManager.addFavoriteToken(chain, token)
        toast.success('お気に入り追加', `${token.symbol}をお気に入りに追加しました`)
      }
    } catch (error) {
      console.error('Failed to toggle favorite:', error)
      toast.error('操作失敗', 'お気に入りの更新に失敗しました')
    }
  }, [chainManager, chain, toast])

  /**
   * カスタムトークン追加
   */
  const handleAddCustomToken = useCallback(async () => {
    try {
      // バリデーション
      if (!customToken.address || !customToken.symbol) {
        toast.error('入力エラー', 'アドレスとシンボルは必須です')
        return
      }

      // アドレス形式チェック
      const isValidAddress = chain === 'ethereum' 
        ? /^0x[a-fA-F0-9]{40}$/.test(customToken.address)
        : /^T[A-Za-z1-9]{33}$/.test(customToken.address)

      if (!isValidAddress) {
        toast.error('無効なアドレス', `${chain}の正しいアドレス形式を入力してください`)
        return
      }

      const newToken: MultiChainToken = {
        chain,
        address: customToken.address,
        symbol: customToken.symbol.toUpperCase(),
        name: customToken.name || customToken.symbol,
        decimals: customToken.decimals,
        category: 'custom',
        isCustom: true
      }

      await chainManager.addCustomToken(chain, newToken)
      toast.success('トークン追加', `${newToken.symbol}を追加しました`)
      
      // フォームリセット
      setCustomToken({ address: '', symbol: '', name: '', decimals: 18 })
      setShowAddToken(false)
      
      // 追加したトークンを選択
      handleTokenSelect(newToken as TokenWithBalance)

    } catch (error) {
      console.error('Failed to add custom token:', error)
      toast.error('追加失敗', 'カスタムトークンの追加に失敗しました')
    }
  }, [customToken, chain, chainManager, toast, handleTokenSelect])

  /**
   * ドロップダウン表示
   */
  if (variant === 'dropdown') {
    return (
      <div className={`token-selector dropdown ${className}`}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled}
          className={`selector-trigger ${isOpen ? 'open' : ''}`}
        >
          {value ? (
            <div className="selected-token">
              <span className="token-icon">
                {value.chain === 'ethereum' ? '⟠' : '⚡'}
              </span>
              <div className="token-info">
                <span className="token-symbol">{value.symbol}</span>
                <span className="token-name">{value.name}</span>
              </div>
            </div>
          ) : (
            <span className="placeholder">{placeholder}</span>
          )}
          <span className="dropdown-arrow">{isOpen ? '▲' : '▼'}</span>
        </button>

        {isOpen && (
          <div className="dropdown-panel">
            <div className="panel-header">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="トークンを検索..."
                className="search-input"
                autoFocus
              />
            </div>

            <div className="panel-content">
              {/* カテゴリタブ */}
              <div className="category-tabs">
                {categories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => setSelectedCategory(category.id)}
                    className={`category-tab ${selectedCategory === category.id ? 'active' : ''}`}
                  >
                    {category.name} ({category.count})
                  </button>
                ))}
              </div>

              {/* トークンリスト */}
              <div className="token-list">
                {filteredTokens.length === 0 ? (
                  <div className="empty-state">
                    <span>該当するトークンがありません</span>
                    {allowCustomTokens && (
                      <button
                        onClick={() => setShowAddToken(true)}
                        className="add-token-btn"
                      >
                        カスタムトークンを追加
                      </button>
                    )}
                  </div>
                ) : (
                  filteredTokens.map((token) => (
                    <div
                      key={token.address || 'native'}
                      onClick={() => handleTokenSelect(token)}
                      className="token-item"
                    >
                      <div className="token-main">
                        <span className="token-icon">
                          {token.chain === 'ethereum' ? '⟠' : '⚡'}
                        </span>
                        <div className="token-details">
                          <div className="token-header">
                            <span className="token-symbol">{token.symbol}</span>
                            {token.isCustom && (
                              <span className="custom-badge">カスタム</span>
                            )}
                          </div>
                          <span className="token-name">{token.name}</span>
                        </div>
                      </div>

                      <div className="token-actions">
                        {showBalance && token.balance && (
                          <div className="balance-info">
                            <span className="balance-amount">
                              {parseFloat(token.balance.balanceFormatted).toFixed(4)}
                            </span>
                            {token.balance.usdValue && (
                              <span className="balance-usd">
                                ${token.balance.usdValue.toFixed(2)}
                              </span>
                            )}
                          </div>
                        )}

                        {showFavorites && (
                          <button
                            onClick={(e) => handleFavoriteToggle(token, e)}
                            className={`favorite-btn ${token.isFavorite ? 'active' : ''}`}
                            title={token.isFavorite ? 'お気に入りから削除' : 'お気に入りに追加'}
                          >
                            {token.isFavorite ? '★' : '☆'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* カスタムトークン追加 */}
              {allowCustomTokens && (
                <div className="panel-footer">
                  <button
                    onClick={() => setShowAddToken(!showAddToken)}
                    className="add-custom-btn"
                  >
                    カスタムトークンを追加 {showAddToken ? '▲' : '▼'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* カスタムトークン追加モーダル */}
        {showAddToken && (
          <div className="add-token-modal">
            <div className="modal-content">
              <div className="modal-header">
                <h4>カスタムトークン追加</h4>
                <button
                  onClick={() => setShowAddToken(false)}
                  className="close-btn"
                >
                  ✕
                </button>
              </div>

              <div className="modal-body">
                <div className="form-group">
                  <label>トークンアドレス *</label>
                  <input
                    type="text"
                    value={customToken.address}
                    onChange={(e) => setCustomToken(prev => ({ ...prev, address: e.target.value }))}
                    placeholder={chain === 'ethereum' ? '0x...' : 'T...'}
                    className="form-input"
                  />
                </div>

                <div className="form-group">
                  <label>シンボル *</label>
                  <input
                    type="text"
                    value={customToken.symbol}
                    onChange={(e) => setCustomToken(prev => ({ ...prev, symbol: e.target.value }))}
                    placeholder="ETH, TRX, USDT など"
                    className="form-input"
                  />
                </div>

                <div className="form-group">
                  <label>名前</label>
                  <input
                    type="text"
                    value={customToken.name}
                    onChange={(e) => setCustomToken(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="トークンの正式名称"
                    className="form-input"
                  />
                </div>

                <div className="form-group">
                  <label>小数点桁数</label>
                  <input
                    type="number"
                    value={customToken.decimals}
                    onChange={(e) => setCustomToken(prev => ({ ...prev, decimals: parseInt(e.target.value) || 18 }))}
                    min="0"
                    max="18"
                    className="form-input"
                  />
                </div>

                <div className="modal-actions">
                  <button
                    onClick={handleAddCustomToken}
                    className="add-btn"
                    disabled={!customToken.address || !customToken.symbol}
                  >
                    追加
                  </button>
                  <button
                    onClick={() => setShowAddToken(false)}
                    className="cancel-btn"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <style jsx>{`
          .token-selector.dropdown {
            position: relative;
            display: inline-block;
            width: 100%;
          }

          .selector-trigger {
            width: 100%;
            padding: 10px 12px;
            background: white;
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            transition: all 0.2s;
          }

          .selector-trigger:hover {
            border-color: #007bff;
          }

          .selector-trigger.open {
            border-color: #007bff;
            border-bottom-left-radius: 0;
            border-bottom-right-radius: 0;
          }

          .selector-trigger:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .selected-token {
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .token-icon {
            font-size: 20px;
          }

          .token-info {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
          }

          .token-symbol {
            font-size: 14px;
            font-weight: 600;
            color: #333;
          }

          .token-name {
            font-size: 12px;
            color: #666;
          }

          .placeholder {
            color: #999;
            font-size: 14px;
          }

          .dropdown-arrow {
            font-size: 12px;
            color: #666;
          }

          .dropdown-panel {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: white;
            border: 1px solid #007bff;
            border-top: none;
            border-radius: 0 0 6px 6px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            z-index: 1000;
            max-height: 400px;
            overflow: hidden;
          }

          .panel-header {
            padding: 12px;
            border-bottom: 1px solid #e0e0e0;
          }

          .search-input {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid #e0e0e0;
            border-radius: 4px;
            font-size: 14px;
          }

          .search-input:focus {
            outline: none;
            border-color: #007bff;
          }

          .panel-content {
            overflow-y: auto;
            max-height: 300px;
          }

          .category-tabs {
            display: flex;
            padding: 8px 12px;
            gap: 4px;
            border-bottom: 1px solid #f0f0f0;
            overflow-x: auto;
          }

          .category-tab {
            padding: 4px 8px;
            background: none;
            border: 1px solid #e0e0e0;
            border-radius: 4px;
            font-size: 12px;
            cursor: pointer;
            white-space: nowrap;
            transition: all 0.2s;
          }

          .category-tab.active {
            background: #007bff;
            color: white;
            border-color: #007bff;
          }

          .token-list {
            padding: 8px 0;
          }

          .empty-state {
            text-align: center;
            padding: 20px;
            color: #666;
          }

          .add-token-btn {
            margin-top: 8px;
            padding: 6px 12px;
            background: #007bff;
            color: white;
            border: none;
            border-radius: 4px;
            font-size: 12px;
            cursor: pointer;
          }

          .token-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px;
            cursor: pointer;
            transition: background 0.2s;
          }

          .token-item:hover {
            background: #f8f9fa;
          }

          .token-main {
            display: flex;
            align-items: center;
            gap: 12px;
            flex: 1;
          }

          .token-details {
            display: flex;
            flex-direction: column;
          }

          .token-header {
            display: flex;
            align-items: center;
            gap: 6px;
          }

          .custom-badge {
            padding: 1px 4px;
            background: #ffc107;
            color: #212529;
            border-radius: 2px;
            font-size: 10px;
            font-weight: 500;
          }

          .token-actions {
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .balance-info {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            font-size: 12px;
          }

          .balance-amount {
            font-weight: 600;
            color: #333;
          }

          .balance-usd {
            color: #666;
          }

          .favorite-btn {
            background: none;
            border: none;
            font-size: 16px;
            cursor: pointer;
            color: #ddd;
            transition: color 0.2s;
          }

          .favorite-btn.active {
            color: #ffc107;
          }

          .favorite-btn:hover {
            color: #ffc107;
          }

          .panel-footer {
            padding: 8px 12px;
            border-top: 1px solid #e0e0e0;
            background: #f8f9fa;
          }

          .add-custom-btn {
            width: 100%;
            padding: 8px;
            background: none;
            border: 1px dashed #007bff;
            border-radius: 4px;
            color: #007bff;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.2s;
          }

          .add-custom-btn:hover {
            background: #f8f9fa;
          }

          .add-token-modal {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2000;
            padding: 20px;
          }

          .modal-content {
            background: white;
            border-radius: 12px;
            max-width: 400px;
            width: 100%;
            max-height: 80vh;
            overflow-y: auto;
          }

          .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 20px;
            border-bottom: 1px solid #e0e0e0;
          }

          .modal-header h4 {
            margin: 0;
            font-size: 16px;
            font-weight: 600;
          }

          .close-btn {
            background: none;
            border: none;
            font-size: 16px;
            cursor: pointer;
            padding: 4px;
          }

          .modal-body {
            padding: 20px;
          }

          .form-group {
            margin-bottom: 16px;
          }

          .form-group label {
            display: block;
            margin-bottom: 6px;
            font-size: 14px;
            font-weight: 500;
            color: #333;
          }

          .form-input {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid #e0e0e0;
            border-radius: 4px;
            font-size: 14px;
          }

          .form-input:focus {
            outline: none;
            border-color: #007bff;
          }

          .modal-actions {
            display: flex;
            gap: 8px;
            justify-content: flex-end;
            margin-top: 20px;
          }

          .add-btn,
          .cancel-btn {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.2s;
          }

          .add-btn {
            background: #007bff;
            color: white;
          }

          .add-btn:disabled {
            background: #6c757d;
            cursor: not-allowed;
          }

          .cancel-btn {
            background: #6c757d;
            color: white;
          }
        `}</style>
      </div>
    )
  }

  // Modal and Inline variants would be implemented similarly with different layouts
  return null
}

export default TokenSelector