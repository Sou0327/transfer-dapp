// セキュリティ関連フックとコンポーネント

import React, { useState, useEffect, useCallback, useContext, createContext, ReactNode } from 'react'
import { InputSanitizer, SecretManager, SecurityAuditor } from '@/utils/security'
import { errorHandler } from '@/utils/errorHandler'
import { ErrorCode } from '@/types/constants'

/**
 * セキュリティコンテキスト
 */
interface SecurityContextType {
  isSecureEnvironment: boolean
  securityLevel: 'low' | 'medium' | 'high'
  lastSecurityScan: number | null
  performSecurityScan: () => Promise<any>
  reportSecurityEvent: (event: string, details?: any) => void
}

const SecurityContext = createContext<SecurityContextType | null>(null)

/**
 * セキュリティプロバイダー
 */
export const SecurityProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isSecureEnvironment, setIsSecureEnvironment] = useState(false)
  const [securityLevel, setSecurityLevel] = useState<'low' | 'medium' | 'high'>('low')
  const [lastSecurityScan, setLastSecurityScan] = useState<number | null>(null)

  // セキュリティスキャン実行
  const performSecurityScan = useCallback(async () => {
    try {
      const results = SecurityAuditor.performSecurityScan()
      const timestamp = Date.now()
      
      setLastSecurityScan(timestamp)
      setIsSecureEnvironment(results.score >= 80)
      
      if (results.score >= 90) {
        setSecurityLevel('high')
      } else if (results.score >= 70) {
        setSecurityLevel('medium')
      } else {
        setSecurityLevel('low')
      }

      SecurityAuditor.logSecurityEvent('info', 'security_scan_completed', {
        score: results.score,
        timestamp
      })

      return results
    } catch (error) {
      SecurityAuditor.logSecurityEvent('error', 'security_scan_failed', { error })
      throw error
    }
  }, [])

  // セキュリティイベント報告
  const reportSecurityEvent = useCallback((event: string, details: any = {}) => {
    SecurityAuditor.logSecurityEvent('warn', event, details)
  }, [])

  // 初期セキュリティスキャン
  useEffect(() => {
    performSecurityScan()
  }, [performSecurityScan])

  const value: SecurityContextType = {
    isSecureEnvironment,
    securityLevel,
    lastSecurityScan,
    performSecurityScan,
    reportSecurityEvent
  }

  return (
    <SecurityContext.Provider value={value}>
      {children}
    </SecurityContext.Provider>
  )
}

/**
 * セキュリティコンテキストフック
 */
export const useSecurity = (): SecurityContextType => {
  const context = useContext(SecurityContext)
  if (!context) {
    throw new Error('useSecurity must be used within SecurityProvider')
  }
  return context
}

/**
 * セキュアな入力フック
 */
export const useSecureInput = (options: {
  sanitize?: boolean
  validate?: (value: string) => { isValid: boolean; errors: string[] }
  maxLength?: number
  allowedChars?: RegExp
  sensitive?: boolean
}) => {
  const [value, setValue] = useState('')
  const [sanitizedValue, setSanitizedValue] = useState('')
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [isTouched, setIsTouched] = useState(false)
  const { reportSecurityEvent } = useSecurity()

  const handleChange = useCallback((newValue: string) => {
    setValue(newValue)
    setIsTouched(true)

    // サニタイゼーション
    let processed = newValue
    if (options.sanitize) {
      processed = InputSanitizer.sanitizeXss(processed)
      setSanitizedValue(processed)
    }

    // バリデーション
    const errors: string[] = []
    
    // 基本的なバリデーション
    if (options.maxLength && processed.length > options.maxLength) {
      errors.push(`入力は${options.maxLength}文字以内である必要があります`)
    }

    if (options.allowedChars && !options.allowedChars.test(processed)) {
      errors.push('許可されていない文字が含まれています')
    }

    // カスタムバリデーション
    if (options.validate) {
      const customValidation = options.validate(processed)
      errors.push(...customValidation.errors)
    }

    setValidationErrors(errors)

    // セキュリティイベントの報告
    if (errors.length > 0) {
      reportSecurityEvent('input_validation_failed', {
        field: options.sensitive ? '[REDACTED]' : 'user_input',
        errors: errors.length
      })
    }
  }, [options, reportSecurityEvent])

  const clear = useCallback(() => {
    setValue('')
    setSanitizedValue('')
    setValidationErrors([])
    setIsTouched(false)
  }, [])

  return {
    value,
    sanitizedValue: options.sanitize ? sanitizedValue : value,
    validationErrors,
    isTouched,
    isValid: validationErrors.length === 0,
    handleChange,
    clear
  }
}

/**
 * シークレット管理フック
 */
export const useSecretManager = () => {
  const [isInitialized, setIsInitialized] = useState(false)
  const { reportSecurityEvent } = useSecurity()

  const encryptData = useCallback(async (data: string): Promise<{ encryptedData: string; iv: string } | null> => {
    try {
      const result = await SecretManager.encryptSensitiveData(data)
      reportSecurityEvent('data_encrypted', { success: true })
      return result
    } catch (error) {
      reportSecurityEvent('encryption_failed', { error: error.message })
      errorHandler.handleError(
        errorHandler.createAppError(
          ErrorCode.ENCRYPTION_ERROR,
          'Failed to encrypt data',
          error,
          'データの暗号化に失敗しました'
        ),
        'high'
      )
      return null
    }
  }, [reportSecurityEvent])

  const decryptData = useCallback(async (encryptedData: string, iv: string): Promise<string | null> => {
    try {
      const result = await SecretManager.decryptSensitiveData(encryptedData, iv)
      reportSecurityEvent('data_decrypted', { success: true })
      return result
    } catch (error) {
      reportSecurityEvent('decryption_failed', { error: error.message })
      errorHandler.handleError(
        errorHandler.createAppError(
          ErrorCode.ENCRYPTION_ERROR,
          'Failed to decrypt data',
          error,
          'データの復号化に失敗しました'
        ),
        'high'
      )
      return null
    }
  }, [reportSecurityEvent])

  const clearSensitiveData = useCallback((obj: any) => {
    try {
      SecretManager.clearSensitiveData(obj)
      reportSecurityEvent('sensitive_data_cleared', { success: true })
    } catch (error) {
      reportSecurityEvent('data_clear_failed', { error: error.message })
    }
  }, [reportSecurityEvent])

  const validatePrivateKey = useCallback((privateKey: string): boolean => {
    const isValid = SecretManager.validatePrivateKey(privateKey)
    reportSecurityEvent('private_key_validated', { isValid })
    return isValid
  }, [reportSecurityEvent])

  useEffect(() => {
    // 初期化
    SecretManager.generateEncryptionKey()
      .then(() => {
        setIsInitialized(true)
        reportSecurityEvent('secret_manager_initialized', { success: true })
      })
      .catch(error => {
        reportSecurityEvent('secret_manager_init_failed', { error: error.message })
      })
  }, [reportSecurityEvent])

  return {
    isInitialized,
    encryptData,
    decryptData,
    clearSensitiveData,
    validatePrivateKey
  }
}

/**
 * セキュアな状態管理フック
 */
export const useSecureState = <T extends {}>(initialValue: T, options: {
  encrypt?: boolean
  clearOnUnmount?: boolean
  validateUpdate?: (newValue: T) => boolean
} = {}) => {
  const [state, setState] = useState<T>(initialValue)
  const [encryptedState, setEncryptedState] = useState<string | null>(null)
  const { encryptData, decryptData, clearSensitiveData } = useSecretManager()
  const { reportSecurityEvent } = useSecurity()

  const setSecureState = useCallback(async (newValue: T | ((prev: T) => T)) => {
    try {
      const nextValue = typeof newValue === 'function' 
        ? (newValue as (prev: T) => T)(state) 
        : newValue

      // バリデーション
      if (options.validateUpdate && !options.validateUpdate(nextValue)) {
        reportSecurityEvent('secure_state_validation_failed', { type: typeof nextValue })
        return
      }

      // 暗号化
      if (options.encrypt) {
        const encrypted = await encryptData(JSON.stringify(nextValue))
        if (encrypted) {
          setEncryptedState(encrypted.encryptedData)
        }
      }

      setState(nextValue)
      reportSecurityEvent('secure_state_updated', { encrypted: options.encrypt })
    } catch (error) {
      reportSecurityEvent('secure_state_update_failed', { error: error.message })
    }
  }, [state, options, encryptData, reportSecurityEvent])

  const clearState = useCallback(() => {
    if (options.clearOnUnmount) {
      clearSensitiveData(state)
    }
    setState(initialValue)
    setEncryptedState(null)
    reportSecurityEvent('secure_state_cleared')
  }, [state, initialValue, options.clearOnUnmount, clearSensitiveData, reportSecurityEvent])

  // アンマウント時のクリーンアップ
  useEffect(() => {
    return () => {
      if (options.clearOnUnmount) {
        clearState()
      }
    }
  }, [clearState, options.clearOnUnmount])

  return [state, setSecureState, clearState] as const
}

/**
 * CSP 違反監視フック
 */
export const useCSPMonitoring = () => {
  const { reportSecurityEvent } = useSecurity()

  useEffect(() => {
    const handleCSPViolation = (event: any) => {
      reportSecurityEvent('csp_violation', {
        blockedURI: event.blockedURI,
        violatedDirective: event.violatedDirective,
        originalPolicy: event.originalPolicy
      })
    }

    document.addEventListener('securitypolicyviolation', handleCSPViolation)

    return () => {
      document.removeEventListener('securitypolicyviolation', handleCSPViolation)
    }
  }, [reportSecurityEvent])
}

/**
 * セキュリティメトリクスフック
 */
export const useSecurityMetrics = () => {
  const [metrics, setMetrics] = useState({
    totalEvents: 0,
    errorEvents: 0,
    warningEvents: 0,
    lastIncident: null as Date | null,
    securityScore: 0
  })

  const { performSecurityScan } = useSecurity()

  const updateMetrics = useCallback(() => {
    const logs = SecurityAuditor.getSecurityLogs()
    const errors = logs.filter(log => log.level === 'error')
    const warnings = logs.filter(log => log.level === 'warn')
    const lastError = errors[errors.length - 1]

    setMetrics({
      totalEvents: logs.length,
      errorEvents: errors.length,
      warningEvents: warnings.length,
      lastIncident: lastError ? new Date(lastError.timestamp) : null,
      securityScore: Math.max(0, 100 - (errors.length * 10) - (warnings.length * 5))
    })
  }, [])

  const refreshSecurityScore = useCallback(async () => {
    const results = await performSecurityScan()
    setMetrics(prev => ({ ...prev, securityScore: results.score }))
  }, [performSecurityScan])

  useEffect(() => {
    updateMetrics()
    const interval = setInterval(updateMetrics, 30000) // 30秒ごとに更新

    return () => clearInterval(interval)
  }, [updateMetrics])

  return {
    metrics,
    updateMetrics,
    refreshSecurityScore
  }
}

/**
 * セキュアなフォームコンポーネント
 */
interface SecureFormProps {
  children: ReactNode
  onSubmit: (data: Record<string, any>) => void
  sanitizeInputs?: boolean
  validateInputs?: boolean
  encryptSensitive?: boolean
  className?: string
}

export const SecureForm: React.FC<SecureFormProps> = ({
  children,
  onSubmit,
  sanitizeInputs = true,
  validateInputs = true,
  encryptSensitive = false,
  className = ''
}) => {
  const { reportSecurityEvent } = useSecurity()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)

    try {
      const formData = new FormData(event.currentTarget)
      const data: Record<string, any> = {}

      // フォームデータを処理
      formData.forEach((value, key) => {
        let processedValue = value.toString()

        if (sanitizeInputs) {
          processedValue = InputSanitizer.sanitizeXss(processedValue)
        }

        data[key] = processedValue
      })

      reportSecurityEvent('secure_form_submitted', {
        fieldsCount: Object.keys(data).length,
        sanitized: sanitizeInputs
      })

      await onSubmit(data)
    } catch (error) {
      reportSecurityEvent('secure_form_error', { error: error.message })
      throw error
    } finally {
      setIsSubmitting(false)
    }
  }, [onSubmit, sanitizeInputs, reportSecurityEvent])

  return (
    <form onSubmit={handleSubmit} className={`secure-form ${className}`}>
      {children}
      
      <style jsx>{`
        .secure-form {
          position: relative;
        }
        
        .secure-form input,
        .secure-form textarea {
          border: 2px solid ${validateInputs ? '#28a745' : '#6c757d'};
          transition: border-color 0.3s;
        }
        
        .secure-form input:invalid,
        .secure-form textarea:invalid {
          border-color: #dc3545;
        }
        
        .secure-form::before {
          content: '🔒';
          position: absolute;
          top: -10px;
          right: -10px;
          background: #28a745;
          color: white;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          z-index: 1;
        }
      `}</style>
    </form>
  )
}

export default {
  SecurityProvider,
  useSecurity,
  useSecureInput,
  useSecretManager,
  useSecureState,
  useCSPMonitoring,
  useSecurityMetrics,
  SecureForm
}