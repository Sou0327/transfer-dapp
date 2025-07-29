/**
 * Tron API キューイングシステム
 * 429エラーを防ぐためのレート制限機能
 */
export class TronAPIQueue {
  private queue: Array<() => Promise<any>> = []
  private processing = false
  private readonly DELAY_MS = 1000 // 429エラー対策: 1秒間隔に増加
  private readonly RETRY_DELAY_MS = 5000 // 429エラー時のリトライ待機時間

  /**
   * API呼び出しをキューに追加（429エラーリトライ機能付き）
   */
  async enqueue<T>(apiCall: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await this.callWithRetry(apiCall)
          resolve(result)
        } catch (error) {
          reject(error)
        }
      })
      this.processQueue()
    })
  }

  /**
   * 429エラー用リトライ機能付きAPI呼び出し
   */
  private async callWithRetry<T>(apiCall: () => Promise<T>, maxRetries: number = 3): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await apiCall()
      } catch (error: unknown) {
        const errorObj = error as { response?: { status?: number }; status?: number; message?: string }
        const is429Error = errorObj?.response?.status === 429 || 
                           errorObj?.status === 429 || 
                           errorObj?.message?.includes('429') ||
                           errorObj?.message?.includes('Too Many Requests')
        
        if (is429Error && attempt < maxRetries) {
          console.warn(`[TronAPIQueue] 429 error detected, retrying (${attempt}/${maxRetries}) in ${this.RETRY_DELAY_MS}ms`)
          await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY_MS))
          continue
        }
        
        // 最後の試行または429以外のエラー
        throw error
      }
    }
    throw new Error('Max retries exceeded')
  }

  /**
   * キューを順次処理
   */
  private async processQueue() {
    if (this.processing || this.queue.length === 0) return
    
    this.processing = true
    console.log(`[TronAPIQueue] Processing ${this.queue.length} queued requests`)
    
    while (this.queue.length > 0) {
      const apiCall = this.queue.shift()!
      try {
        await apiCall()
      } catch (error) {
        console.error('[TronAPIQueue] API call failed:', error)
      }
      
      // 次のリクエストまで待機
      if (this.queue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, this.DELAY_MS))
      }
    }
    
    this.processing = false
    console.log('[TronAPIQueue] Queue processing completed')
  }

  /**
   * キューの状態を取得
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      isProcessing: this.processing
    }
  }

  /**
   * キューをクリア
   */
  clear() {
    this.queue = []
    console.log('[TronAPIQueue] Queue cleared')
  }
}

// シングルトンインスタンス
export const tronApiQueue = new TronAPIQueue()