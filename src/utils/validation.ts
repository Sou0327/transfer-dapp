// バリデーション関数とユーティリティ（マルチチェーン対応）

import { VALIDATION_PATTERNS } from '@/types/constants'
import { ValidationResult } from '@/types/utilities'
import { ethers } from 'ethers'

/**
 * アドレスバリデーション
 */
export class AddressValidator {
  /**
   * Ethereumアドレスのバリデーション
   */
  static validateEthereumAddress(address: string): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    if (!address) {
      errors.push('アドレスは必須です')
      return { isValid: false, errors, warnings }
    }

    // 基本的な形式チェック
    if (!VALIDATION_PATTERNS.ETHEREUM_ADDRESS.test(address)) {
      errors.push('無効なEthereumアドレス形式です')
      return { isValid: false, errors, warnings }
    }

    // ethers.jsによる追加検証
    try {
      if (!ethers.isAddress(address)) {
        errors.push('無効なEthereumアドレスです')
        return { isValid: false, errors, warnings }
      }

      // チェックサム検証
      if (address !== ethers.getAddress(address)) {
        warnings.push('チェックサムが正しくない可能性があります')
      }
    } catch {
      errors.push('アドレス検証中にエラーが発生しました')
      return { isValid: false, errors, warnings }
    }

    // ゼロアドレスチェック
    if (address.toLowerCase() === '0x0000000000000000000000000000000000000000') {
      warnings.push('ゼロアドレスへの送金は資金を失う可能性があります')
    }

    return { isValid: true, errors, warnings }
  }

  /**
   * Tronアドレスのバリデーション
   */
  static validateTronAddress(address: string): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    if (!address) {
      errors.push('アドレスは必須です')
      return { isValid: false, errors, warnings }
    }

    // 基本的な形式チェック
    if (!VALIDATION_PATTERNS.TRON_ADDRESS.test(address)) {
      errors.push('無効なTronアドレス形式です')
      return { isValid: false, errors, warnings }
    }

    // Base58デコードとチェックサム検証（簡易版）
    if (!this.isValidTronChecksum(address)) {
      warnings.push('アドレスのチェックサムが正しくない可能性があります')
    }

    return { isValid: true, errors, warnings }
  }

  /**
   * マルチチェーンアドレス自動判定バリデーション
   */
  static validateAddress(address: string, chain?: 'ethereum' | 'tron'): ValidationResult {
    if (chain === 'ethereum') {
      return this.validateEthereumAddress(address)
    } else if (chain === 'tron') {
      return this.validateTronAddress(address)
    }

    // チェーンが指定されていない場合は自動判定
    const ethResult = this.validateEthereumAddress(address)
    const tronResult = this.validateTronAddress(address)

    if (ethResult.isValid && tronResult.isValid) {
      return {
        isValid: false,
        errors: ['アドレス形式が曖昧です。チェーンを指定してください'],
        warnings: []
      }
    }

    if (ethResult.isValid) {
      return { ...ethResult, warnings: [...ethResult.warnings, 'Ethereumアドレスとして認識されました'] }
    }

    if (tronResult.isValid) {
      return { ...tronResult, warnings: [...tronResult.warnings, 'Tronアドレスとして認識されました'] }
    }

    return {
      isValid: false,
      errors: ['無効なアドレス形式です'],
      warnings: []
    }
  }

  /**
   * Tronアドレスのチェックサム検証（簡易版）
   */
  private static isValidTronChecksum(address: string): boolean {
    try {
      // 簡易的なTronアドレス検証
      // 実際の実装では Base58 デコードとSHA256ダブルハッシュが必要
      return address.startsWith('T') && address.length === 34
    } catch {
      return false
    }
  }
}

/**
 * 金額バリデーション
 */
export class AmountValidator {
  /**
   * 金額の基本バリデーション
   */
  static validateAmount(amount: string, options: {
    min?: string
    max?: string
    decimals?: number
    required?: boolean
  } = {}): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    // 必須チェック
    if (options.required && (!amount || amount.trim() === '')) {
      errors.push('金額は必須です')
      return { isValid: false, errors, warnings }
    }

    if (!amount || amount.trim() === '') {
      return { isValid: true, errors, warnings }
    }

    // 数値形式チェック
    const numericAmount = parseFloat(amount)
    if (isNaN(numericAmount)) {
      errors.push('有効な数値を入力してください')
      return { isValid: false, errors, warnings }
    }

    // 負の値チェック
    if (numericAmount < 0) {
      errors.push('金額は0以上である必要があります')
      return { isValid: false, errors, warnings }
    }

    // ゼロチェック
    if (numericAmount === 0) {
      warnings.push('ゼロ値送金はアドレスポイズニング攻撃に使用される可能性があります')
    }

    // 最小値チェック
    if (options.min && numericAmount < parseFloat(options.min)) {
      errors.push(`金額は${options.min}以上である必要があります`)
    }

    // 最大値チェック
    if (options.max && numericAmount > parseFloat(options.max)) {
      errors.push(`金額は${options.max}以下である必要があります`)
    }

    // 小数点以下桁数チェック
    if (options.decimals !== undefined) {
      const decimalPlaces = this.getDecimalPlaces(amount)
      if (decimalPlaces > options.decimals) {
        errors.push(`小数点以下は${options.decimals}桁まで入力可能です`)
      }
    }

    // 極小値警告
    if (numericAmount > 0 && numericAmount < 0.000001) {
      warnings.push('非常に小さな金額です。トランザクション手数料の方が高くなる可能性があります')
    }

    // 極大値警告
    if (numericAmount > 1000000) {
      warnings.push('非常に大きな金額です')
    }

    return { isValid: errors.length === 0, errors, warnings }
  }

  /**
   * 残高チェック付き金額バリデーション
   */
  static validateAmountWithBalance(
    amount: string, 
    balance: string, 
    options?: {
      decimals?: number
      reserveAmount?: string
    }
  ): ValidationResult {
    const basicValidation = this.validateAmount(amount, { required: true, decimals: options?.decimals })
    
    if (!basicValidation.isValid) {
      return basicValidation
    }

    const errors = [...basicValidation.errors]
    const warnings = [...basicValidation.warnings]

    try {
      const decimals = options?.decimals || 18
      const amountWei = ethers.parseUnits(amount, decimals)
      const balanceWei = ethers.parseUnits(balance, decimals)
      const reserveWei = options?.reserveAmount ? ethers.parseUnits(options.reserveAmount, decimals) : 0n

      // 残高不足チェック
      if (amountWei > balanceWei) {
        errors.push('残高が不足しています')
      }

      // リザーブ金額を考慮した残高チェック
      if (amountWei + reserveWei > balanceWei) {
        if (reserveWei > 0n) {
          warnings.push(`ガス料金として${ethers.formatUnits(reserveWei, decimals)}が必要です`)
          errors.push('ガス料金を含めると残高が不足しています')
        }
      }

      // 残高の大部分を送金する警告
      if (amountWei > (balanceWei * 90n) / 100n) {
        warnings.push('残高の大部分を送金しようとしています。ガス代を考慮して十分な残高を残してください')
      }

      // 全額送金時の警告
      if (amountWei === balanceWei) {
        warnings.push('全額を送金しようとしています')
      }

    } catch (error) {
      errors.push('金額の変換に失敗しました')
    }

    return { isValid: errors.length === 0, errors, warnings }
  }

  /**
   * 小数点以下桁数を取得
   */
  private static getDecimalPlaces(amount: string): number {
    const parts = amount.split('.')
    return parts.length > 1 ? parts[1].length : 0
  }
}

/**
 * プライベートキーバリデーション
 */
export class PrivateKeyValidator {
  /**
   * プライベートキーのバリデーション
   */
  static validatePrivateKey(privateKey: string): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    if (!privateKey) {
      errors.push('プライベートキーは必須です')
      return { isValid: false, errors, warnings }
    }

    // 基本的な形式チェック
    const cleanKey = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey
    
    if (!VALIDATION_PATTERNS.PRIVATE_KEY.test(cleanKey)) {
      errors.push('無効なプライベートキー形式です（64文字の16進数である必要があります）')
      return { isValid: false, errors, warnings }
    }

    // ゼロキーチェック
    if (cleanKey === '0'.repeat(64)) {
      errors.push('無効なプライベートキーです（ゼロキー）')
    }

    // 最大値チェック（secp256k1の最大値）
    const maxValue = 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364140'
    if (cleanKey.toUpperCase() >= maxValue) {
      errors.push('無効なプライベートキーです（値が大きすぎます）')
    }

    warnings.push('プライベートキーは機密情報です。安全に管理してください')

    return { isValid: errors.length === 0, errors, warnings }
  }
}

/**
 * ニーモニックフレーズバリデーション
 */
export class MnemonicValidator {
  /**
   * ニーモニックフレーズのバリデーション
   */
  static validateMnemonic(mnemonic: string): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    if (!mnemonic) {
      errors.push('ニーモニックフレーズは必須です')
      return { isValid: false, errors, warnings }
    }

    const words = mnemonic.trim().toLowerCase().split(/\s+/)

    // 単語数チェック
    if (![12, 15, 18, 21, 24].includes(words.length)) {
      errors.push('ニーモニックフレーズは12、15、18、21、または24単語である必要があります')
    }

    // 単語の重複チェック
    const uniqueWords = new Set(words)
    if (uniqueWords.size !== words.length) {
      warnings.push('重複した単語があります')
    }

    // 空の単語チェック
    if (words.some(word => !word.trim())) {
      errors.push('空の単語が含まれています')
    }

    // 基本的な形式チェック
    if (!VALIDATION_PATTERNS.MNEMONIC.test(mnemonic.trim())) {
      warnings.push('ニーモニックフレーズの形式が正しくない可能性があります')
    }

    warnings.push('ニーモニックフレーズは機密情報です。安全に管理してください')

    return { isValid: errors.length === 0, errors, warnings }
  }
}

/**
 * フォームバリデーション
 */
export class FormValidator {
  /**
   * 送金フォームのバリデーション
   */
  static validateTransferForm(data: {
    chain: string
    tokenAddress?: string
    to: string
    amount: string
    balance?: string
  }): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    // チェーン選択チェック
    if (!data.chain) {
      errors.push('チェーンを選択してください')
    }

    // 送金先アドレスチェック
    const addressValidation = AddressValidator.validateAddress(
      data.to, 
      data.chain as 'ethereum' | 'tron'
    )
    if (!addressValidation.isValid) {
      errors.push(...addressValidation.errors)
    }
    warnings.push(...addressValidation.warnings)

    // 金額チェック
    const amountOptions = {
      required: true,
      decimals: 18, // デフォルト値、実際はトークンに応じて設定
      min: '0.000001'
    }

    let amountValidation: ValidationResult
    if (data.balance) {
      amountValidation = AmountValidator.validateAmountWithBalance(
        data.amount,
        data.balance,
        { decimals: amountOptions.decimals }
      )
    } else {
      amountValidation = AmountValidator.validateAmount(data.amount, amountOptions)
    }

    if (!amountValidation.isValid) {
      errors.push(...amountValidation.errors)
    }
    warnings.push(...amountValidation.warnings)

    // トークンアドレスチェック（カスタムトークンの場合）
    if (data.tokenAddress && data.tokenAddress !== '0x0000000000000000000000000000000000000000') {
      const tokenAddressValidation = AddressValidator.validateAddress(
        data.tokenAddress,
        data.chain as 'ethereum' | 'tron'
      )
      if (!tokenAddressValidation.isValid) {
        errors.push('無効なトークンアドレスです')
      }
    }

    return { isValid: errors.length === 0, errors, warnings }
  }

  /**
   * ウォレット接続フォームのバリデーション
   */
  static validateWalletConnectionForm(data: {
    walletType: string
    chain?: string
    autoConnect?: boolean
  }): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    // ウォレットタイプチェック
    if (!data.walletType) {
      errors.push('ウォレットタイプを選択してください')
    }

    const supportedWallets = ['metamask', 'tronlink']
    if (data.walletType && !supportedWallets.includes(data.walletType)) {
      errors.push('サポートされていないウォレットタイプです')
    }

    // ブラウザ環境チェック
    if (typeof window === 'undefined') {
      errors.push('ブラウザ環境が必要です')
    }

    // ウォレット拡張機能の存在チェック
    if (data.walletType === 'metamask' && typeof window !== 'undefined' && !window.ethereum) {
      errors.push('MetaMask拡張機能がインストールされていません')
    }

    if (data.walletType === 'tronlink' && typeof window !== 'undefined' && !(window as any).tronWeb) {
      errors.push('TronLink拡張機能がインストールされていません')
    }

    return { isValid: errors.length === 0, errors, warnings }
  }
}

/**
 * セキュリティバリデーション
 */
export class SecurityValidator {
  /**
   * URL のバリデーション
   */
  static validateUrl(url: string, options: {
    allowHttp?: boolean
    requiredProtocols?: string[]
    blockedDomains?: string[]
  } = {}): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    if (!url) {
      errors.push('URLは必須です')
      return { isValid: false, errors, warnings }
    }

    // 基本的な形式チェック
    if (!VALIDATION_PATTERNS.URL.test(url)) {
      errors.push('無効なURL形式です')
      return { isValid: false, errors, warnings }
    }

    try {
      const urlObj = new URL(url)

      // プロトコルチェック
      if (!options.allowHttp && urlObj.protocol === 'http:') {
        warnings.push('HTTPSを使用することを推奨します')
      }

      if (options.requiredProtocols && !options.requiredProtocols.includes(urlObj.protocol.slice(0, -1))) {
        errors.push(`許可されたプロトコルではありません: ${options.requiredProtocols.join(', ')}`)
      }

      // ブロックドメインチェック
      if (options.blockedDomains && options.blockedDomains.some(domain => 
        urlObj.hostname.includes(domain)
      )) {
        errors.push('ブロックされたドメインです')
      }

      // ローカルホストチェック
      if (urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1') {
        warnings.push('ローカルホストのURLです')
      }

    } catch (error) {
      errors.push('URL の解析に失敗しました')
    }

    return { isValid: errors.length === 0, errors, warnings }
  }

  /**
   * パスワード強度のバリデーション
   */
  static validatePasswordStrength(password: string): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    if (!password) {
      errors.push('パスワードは必須です')
      return { isValid: false, errors, warnings }
    }

    // 長さチェック
    if (password.length < 8) {
      errors.push('パスワードは8文字以上である必要があります')
    }

    if (password.length < 12) {
      warnings.push('より安全にするため12文字以上のパスワードを推奨します')
    }

    // 文字種チェック
    const hasLowercase = /[a-z]/.test(password)
    const hasUppercase = /[A-Z]/.test(password)
    const hasNumbers = /\d/.test(password)
    const hasSpecialChars = /[!@#$%^&*(),.?":{}|<>]/.test(password)

    const characterTypes = [hasLowercase, hasUppercase, hasNumbers, hasSpecialChars].filter(Boolean).length

    if (characterTypes < 3) {
      errors.push('パスワードには大文字、小文字、数字、特殊文字のうち少なくとも3種類を含めてください')
    }

    // 共通パスワードチェック（簡易版）
    const commonPasswords = ['password', '123456', 'qwerty', 'abc123', 'password123']
    if (commonPasswords.includes(password.toLowerCase())) {
      errors.push('一般的すぎるパスワードです')
    }

    // 繰り返しパターンチェック
    if (/(.)\1{2,}/.test(password)) {
      warnings.push('同じ文字の繰り返しが含まれています')
    }

    return { isValid: errors.length === 0, errors, warnings }
  }
}

/**
 * 包括的バリデーションユーティリティ
 */
export class ValidationUtils {
  /**
   * 複数のバリデーション結果をマージ
   */
  static mergeValidationResults(...results: ValidationResult[]): ValidationResult {
    const allErrors = results.flatMap(r => r.errors)
    const allWarnings = results.flatMap(r => r.warnings)
    
    return {
      isValid: allErrors.length === 0,
      errors: [...new Set(allErrors)], // 重複除去
      warnings: [...new Set(allWarnings)] // 重複除去
    }
  }

  /**
   * バリデーション結果をユーザーフレンドリーなメッセージに変換
   */
  static formatValidationMessage(result: ValidationResult): string {
    if (result.isValid && result.warnings.length === 0) {
      return '入力内容に問題ありません'
    }

    const messages: string[] = []

    if (result.errors.length > 0) {
      messages.push('エラー: ' + result.errors.join(', '))
    }

    if (result.warnings.length > 0) {
      messages.push('警告: ' + result.warnings.join(', '))
    }

    return messages.join('\n')
  }

  /**
   * デバウンス付きバリデーション
   */
  static createDebouncedValidator<T>(
    validator: (input: T) => ValidationResult,
    delay: number = 300
  ): (input: T) => Promise<ValidationResult> {
    let timeoutId: NodeJS.Timeout

    return (input: T): Promise<ValidationResult> => {
      return new Promise((resolve) => {
        clearTimeout(timeoutId)
        timeoutId = setTimeout(() => {
          resolve(validator(input))
        }, delay)
      })
    }
  }

  /**
   * 非同期バリデーション
   */
  static async validateAsync<T>(
    input: T,
    validators: ((input: T) => ValidationResult | Promise<ValidationResult>)[]
  ): Promise<ValidationResult> {
    const results = await Promise.all(
      validators.map(validator => validator(input))
    )

    return this.mergeValidationResults(...results)
  }
}

// デフォルトエクスポート
export default {
  AddressValidator,
  AmountValidator,
  PrivateKeyValidator,
  MnemonicValidator,
  FormValidator,
  SecurityValidator,
  ValidationUtils
}