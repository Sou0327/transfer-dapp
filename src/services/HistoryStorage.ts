import {
  TransactionRecord,
  HistoryFilterOptions,
  HistorySearchResult,
  HistoryStats,
  ExportOptions,
  ExportResult,
  HistoryStorageInterface,
  SupportedChain,
  TransactionStatus
} from '@/types'

/**
 * IndexedDBを使用した履歴データ永続化サービス
 */
export class HistoryStorageService implements HistoryStorageInterface {
  private db: IDBDatabase | null = null
  private readonly dbName = 'MultiChainTransferHistory'
  private readonly dbVersion = 1
  private readonly storeName = 'transactions'
  private readonly indexStoreName = 'indexes'

  constructor() {
    this.initializeDB()
  }

  /**
   * IndexedDBを初期化
   */
  private async initializeDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB is not supported'))
        return
      }

      const request = indexedDB.open(this.dbName, this.dbVersion)

      request.onerror = () => {
        reject(new Error('Failed to open IndexedDB'))
      }

      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // トランザクションストアを作成
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' })
          
          // インデックスを作成
          store.createIndex('timestamp', 'timestamp', { unique: false })
          store.createIndex('chain', 'chain', { unique: false })
          store.createIndex('status', 'status', { unique: false })
          store.createIndex('txHash', 'txHash', { unique: false })
          store.createIndex('from', 'from', { unique: false })
          store.createIndex('to', 'to', { unique: false })
          store.createIndex('tokenAddress', 'tokenAddress', { unique: false })
          store.createIndex('chainStatus', ['chain', 'status'], { unique: false })
          store.createIndex('timestampChain', ['timestamp', 'chain'], { unique: false })
        }

        // インデックス管理用ストアを作成
        if (!db.objectStoreNames.contains(this.indexStoreName)) {
          db.createObjectStore(this.indexStoreName, { keyPath: 'type' })
        }
      }
    })
  }

  /**
   * データベースの準備ができているかチェック
   */
  private async ensureDBReady(): Promise<void> {
    if (!this.db) {
      await this.initializeDB()
    }
    if (!this.db) {
      throw new Error('Database is not available')
    }
  }

  /**
   * トランザクションを保存
   */
  public async saveTransaction(record: TransactionRecord): Promise<void> {
    await this.ensureDBReady()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      
      const request = store.put(record)
      
      request.onsuccess = () => {
        resolve()
      }
      
      request.onerror = () => {
        reject(new Error('Failed to save transaction'))
      }
    })
  }

  /**
   * 単一のトランザクションを取得
   */
  public async getTransaction(id: string): Promise<TransactionRecord | null> {
    await this.ensureDBReady()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly')
      const store = transaction.objectStore(this.storeName)
      
      const request = store.get(id)
      
      request.onsuccess = () => {
        resolve(request.result || null)
      }
      
      request.onerror = () => {
        reject(new Error('Failed to get transaction'))
      }
    })
  }

  /**
   * トランザクションを更新
   */
  public async updateTransaction(id: string, updates: Partial<TransactionRecord>): Promise<void> {
    await this.ensureDBReady()

    const existing = await this.getTransaction(id)
    if (!existing) {
      throw new Error('Transaction not found')
    }

    const updated = { ...existing, ...updates }
    await this.saveTransaction(updated)
  }

  /**
   * トランザクションを削除
   */
  public async deleteTransaction(id: string): Promise<void> {
    await this.ensureDBReady()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      
      const request = store.delete(id)
      
      request.onsuccess = () => {
        resolve()
      }
      
      request.onerror = () => {
        reject(new Error('Failed to delete transaction'))
      }
    })
  }

  /**
   * フィルタリングされたトランザクションを取得
   */
  public async getTransactions(filter?: HistoryFilterOptions): Promise<HistorySearchResult> {
    await this.ensureDBReady()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly')
      const store = transaction.objectStore(this.storeName)
      
      // 適切なインデックスを選択
      let index: IDBIndex | IDBObjectStore = store
      let range: IDBKeyRange | undefined
      
      if (filter?.chain && filter?.status) {
        index = store.index('chainStatus')
        range = IDBKeyRange.only([filter.chain, filter.status])
      } else if (filter?.chain) {
        index = store.index('chain')
        range = IDBKeyRange.only(filter.chain)
      } else if (filter?.status) {
        index = store.index('status')
        range = IDBKeyRange.only(filter.status)
      } else {
        index = store.index('timestamp')
      }

      const request = index.openCursor(range, 'prev') // 新しい順
      const results: TransactionRecord[] = []
      let count = 0
      const limit = filter?.limit // limitが指定されていない場合はundefined（全件取得）
      const offset = filter?.offset || 0

      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) {
          // フィルタリングとソート
          const filtered = this.applyDetailedFilter(results, filter)
          const sorted = this.sortTransactions(filtered, filter)
          
          // limitが指定されている場合はページネーション、されていない場合は全件
          const paginated = limit ? sorted.slice(offset, offset + limit) : sorted.slice(offset)
          const hasMore = limit ? offset + limit < filtered.length : false
          const nextOffset = (limit && hasMore) ? offset + limit : undefined
          
          resolve({
            transactions: paginated,
            totalCount: filtered.length,
            hasMore,
            nextOffset
          })
          return
        }

        const record = cursor.value as TransactionRecord
        results.push(record)
        cursor.continue()
      }
      
      request.onerror = () => {
        reject(new Error('Failed to get transactions'))
      }
    })
  }

  /**
   * 詳細フィルタリングを適用
   */
  private applyDetailedFilter(
    transactions: TransactionRecord[],
    filter?: HistoryFilterOptions
  ): TransactionRecord[] {
    if (!filter) return transactions

    return transactions.filter(tx => {
      // トークンアドレスフィルター
      if (filter.tokenAddress && tx.tokenAddress !== filter.tokenAddress) {
        return false
      }

      // トークンシンボルフィルター
      if (filter.tokenSymbol && tx.tokenSymbol !== filter.tokenSymbol) {
        return false
      }

      // 日付範囲フィルター
      if (filter.dateFrom && tx.timestamp < filter.dateFrom.getTime()) {
        return false
      }
      if (filter.dateTo && tx.timestamp > filter.dateTo.getTime()) {
        return false
      }

      // アドレス検索
      if (filter.addressSearch) {
        const search = filter.addressSearch.toLowerCase()
        if (!tx.from.toLowerCase().includes(search) && 
            !tx.to.toLowerCase().includes(search)) {
          return false
        }
      }

      // 金額範囲フィルター
      if (filter.minAmount && parseFloat(tx.amount) < parseFloat(filter.minAmount)) {
        return false
      }
      if (filter.maxAmount && parseFloat(tx.amount) > parseFloat(filter.maxAmount)) {
        return false
      }

      // タグフィルター
      if (filter.tags && filter.tags.length > 0 && tx.tags) {
        if (!filter.tags.some(tag => tx.tags!.includes(tag))) {
          return false
        }
      }

      return true
    })
  }

  /**
   * トランザクションをソート
   */
  private sortTransactions(
    transactions: TransactionRecord[],
    filter?: HistoryFilterOptions
  ): TransactionRecord[] {
    const sortBy = filter?.sortBy || 'timestamp'
    const sortOrder = filter?.sortOrder || 'desc'

    return [...transactions].sort((a, b) => {
      let comparison = 0

      switch (sortBy) {
        case 'timestamp':
          comparison = a.timestamp - b.timestamp
          break
        case 'amount':
          comparison = parseFloat(a.amount) - parseFloat(b.amount)
          break
        case 'status':
          comparison = a.status.localeCompare(b.status)
          break
        default:
          comparison = a.timestamp - b.timestamp
      }

      return sortOrder === 'asc' ? comparison : -comparison
    })
  }

  /**
   * トランザクションを検索
   */
  public async searchTransactions(
    query: string,
    filter?: HistoryFilterOptions
  ): Promise<HistorySearchResult> {
    const allTransactions = await this.getTransactions(filter)
    
    const searchTerm = query.toLowerCase()
    const filtered = allTransactions.transactions.filter(tx =>
      tx.txHash.toLowerCase().includes(searchTerm) ||
      tx.from.toLowerCase().includes(searchTerm) ||
      tx.to.toLowerCase().includes(searchTerm) ||
      tx.tokenSymbol.toLowerCase().includes(searchTerm) ||
      tx.notes?.toLowerCase().includes(searchTerm)
    )

    return {
      transactions: filtered,
      totalCount: filtered.length,
      hasMore: false
    }
  }

  /**
   * 統計情報を取得
   */
  public async getStats(filter?: HistoryFilterOptions): Promise<HistoryStats> {
    const result = await this.getTransactions({ ...filter, limit: 10000 }) // 十分大きな値
    const transactions = result.transactions

    if (transactions.length === 0) {
      return {
        totalTransactions: 0,
        successfulTransactions: 0,
        failedTransactions: 0,
        pendingTransactions: 0,
        totalVolumeETH: '0',
        totalVolumeTRX: '0',
        uniqueTokens: 0,
        uniqueAddresses: 0,
        dateRange: { earliest: 0, latest: 0 },
        chainBreakdown: { ethereum: 0, tron: 0 }
      }
    }

    const successful = transactions.filter(tx => tx.status === 'success').length
    const failed = transactions.filter(tx => tx.status === 'failed').length
    const pending = transactions.filter(tx => tx.status === 'pending' || tx.status === 'confirming').length

    const uniqueTokens = new Set(transactions.map(tx => tx.tokenAddress)).size
    const uniqueAddresses = new Set([
      ...transactions.map(tx => tx.from),
      ...transactions.map(tx => tx.to)
    ]).size

    const timestamps = transactions.map(tx => tx.timestamp)
    const earliest = Math.min(...timestamps)
    const latest = Math.max(...timestamps)

    const ethereumTxs = transactions.filter(tx => tx.chain === 'ethereum').length
    const tronTxs = transactions.filter(tx => tx.chain === 'tron').length

    // ボリューム計算（簡略化）
    const ethVolume = transactions
      .filter(tx => tx.chain === 'ethereum')
      .reduce((sum, tx) => sum + parseFloat(tx.amount), 0)
    
    const trxVolume = transactions
      .filter(tx => tx.chain === 'tron')
      .reduce((sum, tx) => sum + parseFloat(tx.amount), 0)

    return {
      totalTransactions: transactions.length,
      successfulTransactions: successful,
      failedTransactions: failed,
      pendingTransactions: pending,
      totalVolumeETH: ethVolume.toString(),
      totalVolumeTRX: trxVolume.toString(),
      uniqueTokens,
      uniqueAddresses,
      dateRange: { earliest, latest },
      chainBreakdown: { ethereum: ethereumTxs, tron: tronTxs }
    }
  }

  /**
   * 全履歴をクリア
   */
  public async clearAllHistory(): Promise<void> {
    await this.ensureDBReady()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite')
      const store = transaction.objectStore(this.storeName)
      
      const request = store.clear()
      
      request.onsuccess = () => {
        resolve()
      }
      
      request.onerror = () => {
        reject(new Error('Failed to clear history'))
      }
    })
  }

  /**
   * ストレージを最適化
   */
  public async compactStorage(): Promise<void> {
    // IndexedDBの自動最適化に依存
    // 必要に応じて古いデータの削除などを実装
  }

  /**
   * 履歴をエクスポート
   */
  public async exportHistory(options: ExportOptions): Promise<ExportResult> {
    try {
      const result = await this.getTransactions(options.filter)
      const transactions = result.transactions

      let content: string
      let mimeType: string
      let fileExtension: string

      switch (options.format) {
        case 'csv':
          content = this.exportToCSV(transactions, options)
          mimeType = 'text/csv;charset=utf-8'
          fileExtension = 'csv'
          break
        case 'json':
          content = this.exportToJSON(transactions, options)
          mimeType = 'application/json;charset=utf-8'
          fileExtension = 'json'
          break
        default:
          throw new Error('Unsupported export format')
      }

      const blob = new Blob([content], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const filename = options.filename || `transaction-history-${Date.now()}.${fileExtension}`

      // ダウンロードリンクを作成
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()

      // クリーンアップ
      setTimeout(() => URL.revokeObjectURL(url), 1000)

      return {
        success: true,
        filename,
        downloadUrl: url,
        recordCount: transactions.length,
        fileSize: blob.size
      }
    } catch (error) {
      return {
        success: false,
        filename: '',
        recordCount: 0,
        fileSize: 0,
        error: error instanceof Error ? error.message : 'Export failed'
      }
    }
  }

  /**
   * CSV形式でエクスポート
   */
  private exportToCSV(transactions: TransactionRecord[], options: ExportOptions): string {
    const headers = [
      'ID', 'Timestamp', 'Date', 'Chain', 'Status', 'Token Symbol', 'Token Address',
      'Amount', 'Amount Formatted', 'From', 'To', 'Transaction Hash', 'Block Number',
      'Confirmations', 'Notes'
    ]

    // CSVエスケープ関数
    const escapeCSVField = (field: string | number | null | undefined): string => {
      if (field === null || field === undefined) return ''
      
      const str = String(field)
      
      // ダブルクォート、カンマ、改行を含む場合はエスケープが必要
      if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
        // ダブルクォートをエスケープ（""に変換）し、全体をダブルクォートで囲む
        return `"${str.replace(/"/g, '""')}"`
      }
      
      // 日本語文字を含む場合もダブルクォートで囲む
      if (/[^\x00-\x7F]/.test(str)) {
        return `"${str}"`
      }
      
      return str
    }

    const rows = transactions.map(tx => [
      escapeCSVField(tx.id),
      escapeCSVField(tx.timestamp),
      escapeCSVField(new Date(tx.timestamp).toISOString()),
      escapeCSVField(tx.chain),
      escapeCSVField(tx.status),
      escapeCSVField(tx.tokenSymbol),
      escapeCSVField(tx.tokenAddress),
      escapeCSVField(tx.amount),
      escapeCSVField(tx.amountFormatted),
      escapeCSVField(tx.from),
      escapeCSVField(tx.to),
      escapeCSVField(tx.txHash),
      escapeCSVField(tx.blockNumber || ''),
      escapeCSVField(tx.confirmations || ''),
      escapeCSVField(tx.notes || '')
    ])

    const csvContent = [
      options.includeHeaders ? headers.map(escapeCSVField).join(',') : '',
      ...rows.map(row => row.join(','))
    ].filter(Boolean).join('\n')

    // UTF-8 BOMを追加して文字化けを防ぐ
    return '\uFEFF' + csvContent
  }

  /**
   * JSON形式でエクスポート
   */
  private exportToJSON(transactions: TransactionRecord[], options: ExportOptions): string {
    const data = {
      exportedAt: new Date().toISOString(),
      recordCount: transactions.length,
      transactions: transactions
    }

    return JSON.stringify(data, null, 2)
  }

  /**
   * 履歴をインポート
   */
  public async importHistory(data: string, format: 'json' | 'csv'): Promise<{ imported: number; errors: string[] }> {
    const errors: string[] = []
    let imported = 0

    try {
      let transactions: Partial<TransactionRecord>[]

      if (format === 'json') {
        const parsed = JSON.parse(data)
        transactions = Array.isArray(parsed) ? parsed : parsed.transactions || []
      } else {
        throw new Error('CSV import not implemented yet')
      }

      for (const tx of transactions) {
        try {
          if (this.validateTransactionRecord(tx)) {
            await this.saveTransaction(tx as TransactionRecord)
            imported++
          } else {
            errors.push(`Invalid transaction record: ${tx.id || 'unknown'}`)
          }
        } catch (error) {
          errors.push(`Failed to import transaction ${tx.id || 'unknown'}: ${error}`)
        }
      }
    } catch (error) {
      errors.push(`Failed to parse import data: ${error}`)
    }

    return { imported, errors }
  }

  /**
   * トランザクションレコードの妥当性を検証
   */
  private validateTransactionRecord(tx: Partial<TransactionRecord>): tx is TransactionRecord {
    return !!(
      tx.id &&
      tx.timestamp &&
      tx.chain &&
      tx.tokenAddress !== undefined &&
      tx.tokenSymbol &&
      typeof tx.tokenDecimals === 'number' &&
      tx.from &&
      tx.to &&
      tx.amount &&
      tx.amountFormatted &&
      tx.txHash &&
      tx.status &&
      typeof tx.requiredConfirmations === 'number'
    )
  }
}

// デフォルトエクスポート
export default HistoryStorageService