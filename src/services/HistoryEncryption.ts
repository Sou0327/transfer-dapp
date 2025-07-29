import { HistoryEncryptionInterface } from '@/types'
import { STORAGE_KEYS } from '@/utils/constants'

/**
 * Web Crypto APIを使用した履歴データ暗号化サービス
 */
export class HistoryEncryptionService implements HistoryEncryptionInterface {
  private currentKey: CryptoKey | null = null
  private readonly algorithm = 'AES-GCM'
  private readonly keyLength = 256
  private readonly ivLength = 12 // 96-bit IV for AES-GCM

  constructor() {
    this.initializeService()
  }

  /**
   * サービスを初期化
   */
  private async initializeService(): Promise<void> {
    try {
      // ローカルストレージから既存のキーを復元
      await this.loadStoredKey()
    } catch (error) {
      console.warn('Failed to load stored encryption key:', error)
      // キーが見つからない場合は新しいキーを生成
      await this.generateAndStoreNewKey()
    }
  }

  /**
   * Web Crypto APIが利用可能かチェック
   */
  private checkCryptoSupport(): void {
    if (!window.crypto || !window.crypto.subtle) {
      throw new Error('Web Crypto API is not supported in this browser')
    }
  }

  /**
   * 新しい暗号化キーを生成
   */
  public async generateKey(): Promise<CryptoKey> {
    this.checkCryptoSupport()

    try {
      const key = await window.crypto.subtle.generateKey(
        {
          name: this.algorithm,
          length: this.keyLength
        },
        true, // extractable
        ['encrypt', 'decrypt']
      )

      this.currentKey = key
      return key
    } catch (error) {
      console.error('Failed to generate encryption key:', error)
      throw new Error('暗号化キーの生成に失敗しました')
    }
  }

  /**
   * キーをJWK形式でエクスポート
   */
  public async exportKey(key: CryptoKey): Promise<string> {
    this.checkCryptoSupport()

    try {
      const jwk = await window.crypto.subtle.exportKey('jwk', key)
      return JSON.stringify(jwk)
    } catch (error) {
      console.error('Failed to export encryption key:', error)
      throw new Error('暗号化キーのエクスポートに失敗しました')
    }
  }

  /**
   * JWK形式からキーをインポート
   */
  public async importKey(keyData: string): Promise<CryptoKey> {
    this.checkCryptoSupport()

    try {
      const jwk = JSON.parse(keyData)
      
      const key = await window.crypto.subtle.importKey(
        'jwk',
        jwk,
        {
          name: this.algorithm,
          length: this.keyLength
        },
        true,
        ['encrypt', 'decrypt']
      )

      this.currentKey = key
      return key
    } catch (error) {
      console.error('Failed to import encryption key:', error)
      throw new Error('暗号化キーのインポートに失敗しました')
    }
  }

  /**
   * データを暗号化
   */
  public async encrypt(data: string): Promise<string> {
    this.checkCryptoSupport()

    if (!this.currentKey) {
      await this.generateKey()
    }

    if (!this.currentKey) {
      throw new Error('Encryption key is not available')
    }

    try {
      // ランダムなIVを生成
      const iv = window.crypto.getRandomValues(new Uint8Array(this.ivLength))
      
      // データをバイト配列に変換
      const encoder = new TextEncoder()
      const dataBytes = encoder.encode(data)

      // 暗号化
      const encryptedData = await window.crypto.subtle.encrypt(
        {
          name: this.algorithm,
          iv: iv
        },
        this.currentKey,
        dataBytes
      )

      // IVと暗号化されたデータを結合
      const combined = new Uint8Array(iv.length + encryptedData.byteLength)
      combined.set(iv, 0)
      combined.set(new Uint8Array(encryptedData), iv.length)

      // Base64エンコード
      return this.arrayBufferToBase64(combined.buffer)
    } catch (error) {
      console.error('Failed to encrypt data:', error)
      throw new Error('データの暗号化に失敗しました')
    }
  }

  /**
   * データを復号化
   */
  public async decrypt(encryptedData: string): Promise<string> {
    this.checkCryptoSupport()

    if (!this.currentKey) {
      throw new Error('Decryption key is not available')
    }

    try {
      // Base64デコード
      const combined = this.base64ToArrayBuffer(encryptedData)
      
      // IVと暗号化データを分離
      const iv = combined.slice(0, this.ivLength)
      const encrypted = combined.slice(this.ivLength)

      // 復号化
      const decryptedData = await window.crypto.subtle.decrypt(
        {
          name: this.algorithm,
          iv: iv
        },
        this.currentKey,
        encrypted
      )

      // 文字列に変換
      const decoder = new TextDecoder()
      return decoder.decode(decryptedData)
    } catch (error) {
      console.error('Failed to decrypt data:', error)
      throw new Error('データの復号化に失敗しました')
    }
  }

  /**
   * 現在のキーを取得
   */
  public getCurrentKey(): CryptoKey | null {
    return this.currentKey
  }

  /**
   * キーが設定されているかチェック
   */
  public hasKey(): boolean {
    return this.currentKey !== null
  }

  /**
   * キーをローカルストレージに保存
   */
  private async storeKey(key: CryptoKey): Promise<void> {
    try {
      const keyData = await this.exportKey(key)
      
      // キーを暗号化して保存（パスワードベースの派生キーを使用）
      const derivedKey = await this.deriveKeyFromPassword()
      const encryptedKey = await this.encryptWithKey(keyData, derivedKey)
      
      localStorage.setItem(STORAGE_KEYS.HISTORY_ENCRYPTION_KEY, encryptedKey)
    } catch (error) {
      console.error('Failed to store encryption key:', error)
      throw new Error('暗号化キーの保存に失敗しました')
    }
  }

  /**
   * ローカルストレージからキーを読み込み
   */
  private async loadStoredKey(): Promise<void> {
    const storedKey = localStorage.getItem(STORAGE_KEYS.HISTORY_ENCRYPTION_KEY)
    
    if (!storedKey) {
      throw new Error('No stored key found')
    }

    try {
      // 保存されたキーを復号化
      const derivedKey = await this.deriveKeyFromPassword()
      const keyData = await this.decryptWithKey(storedKey, derivedKey)
      
      // キーをインポート
      await this.importKey(keyData)
    } catch (error) {
      console.error('Failed to load stored key:', error)
      throw new Error('保存された暗号化キーの読み込みに失敗しました')
    }
  }

  /**
   * 新しいキーを生成して保存
   */
  private async generateAndStoreNewKey(): Promise<void> {
    const key = await this.generateKey()
    await this.storeKey(key)
  }

  /**
   * パスワードベースの派生キーを生成
   * （実際の実装では、ユーザーのパスワードまたはブラウザ固有の値を使用）
   */
  private async deriveKeyFromPassword(): Promise<CryptoKey> {
    const password = this.getBrowserFingerprint()
    const encoder = new TextEncoder()
    const passwordBytes = encoder.encode(password)

    // PBKDF2でキーを派生
    const keyMaterial = await window.crypto.subtle.importKey(
      'raw',
      passwordBytes,
      'PBKDF2',
      false,
      ['deriveKey']
    )

    const salt = encoder.encode('MultiChainTransferHistory') // 固定ソルト（実際の実装では動的にすべき）

    return await window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      {
        name: 'AES-GCM',
        length: 256
      },
      false,
      ['encrypt', 'decrypt']
    )
  }

  /**
   * ブラウザフィンガープリントを生成（簡易版）
   */
  private getBrowserFingerprint(): string {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    ctx!.textBaseline = 'top'
    ctx!.font = '14px Arial'
    ctx!.fillText('Browser fingerprint', 2, 2)

    return [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height,
      new Date().getTimezoneOffset(),
      canvas.toDataURL()
    ].join('|')
  }

  /**
   * 指定されたキーでデータを暗号化
   */
  private async encryptWithKey(data: string, key: CryptoKey): Promise<string> {
    const iv = window.crypto.getRandomValues(new Uint8Array(this.ivLength))
    const encoder = new TextEncoder()
    const dataBytes = encoder.encode(data)

    const encryptedData = await window.crypto.subtle.encrypt(
      {
        name: this.algorithm,
        iv: iv
      },
      key,
      dataBytes
    )

    const combined = new Uint8Array(iv.length + encryptedData.byteLength)
    combined.set(iv, 0)
    combined.set(new Uint8Array(encryptedData), iv.length)

    return this.arrayBufferToBase64(combined.buffer)
  }

  /**
   * 指定されたキーでデータを復号化
   */
  private async decryptWithKey(encryptedData: string, key: CryptoKey): Promise<string> {
    const combined = this.base64ToArrayBuffer(encryptedData)
    const iv = combined.slice(0, this.ivLength)
    const encrypted = combined.slice(this.ivLength)

    const decryptedData = await window.crypto.subtle.decrypt(
      {
        name: this.algorithm,
        iv: iv
      },
      key,
      encrypted
    )

    const decoder = new TextDecoder()
    return decoder.decode(decryptedData)
  }

  /**
   * ArrayBufferをBase64文字列に変換
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }

  /**
   * Base64文字列をArrayBufferに変換
   */
  private base64ToArrayBuffer(base64: string): Uint8Array {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  }

  /**
   * 暗号化キーをリセット（新しいキーを生成）
   */
  public async resetKey(): Promise<void> {
    try {
      await this.generateAndStoreNewKey()
    } catch (error) {
      console.error('Failed to reset encryption key:', error)
      throw new Error('暗号化キーのリセットに失敗しました')
    }
  }

  /**
   * 保存された暗号化キーを削除
   */
  public clearStoredKey(): void {
    localStorage.removeItem(STORAGE_KEYS.HISTORY_ENCRYPTION_KEY)
    this.currentKey = null
  }

  /**
   * サービスを破棄
   */
  public destroy(): void {
    this.currentKey = null
  }
}

// デフォルトエクスポート
export default HistoryEncryptionService