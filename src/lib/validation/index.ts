/**
 * Validation System Main Module
 * Comprehensive validation, sanitization, and error handling for OTC application
 */

// Core validation schemas
export * from './schemas';
export {
  ValidationSchemas,
  ValidationPatterns,
  CustomValidations,
  BaseSchemas,
  OTCRequestSchemas,
  TransactionSchemas,
  WalletSchemas,
  AdminSchemas,
  APIResponseSchemas,
  FormSchemas,
  WebSocketSchemas,
  formatValidationErrors,
  safeValidate
} from './schemas';

// Input sanitization
export * from './sanitization';
export {
  InputSanitizer,
  SanitizationPresets,
  FormSanitizer,
  ValidationSanitizer,
  useSanitizedInput
} from './sanitization';

// Wallet error handling
export * from './walletErrors';
export {
  CIP30ErrorCode,
  WalletErrorPatterns,
  WalletErrorClassifier,
  ErrorRecoveryExecutor,
  WalletErrorUtils,
  WalletErrorMonitor,
  errorRecoveryExecutor,
  walletErrorMonitor
} from './walletErrors';

// Type exports for external use
export type {
  WalletError,
  RecoveryAction,
  SecurityContext,
  SanitizationOptions,
  ValidationResult,
  OTCRequest,
  CreateRequestPayload,
  TransactionPreview,
  SignedTransaction,
  WalletInfo,
  AdminLogin,
  SystemSettings,
  APISuccessResponse,
  APIErrorResponse
} from './schemas';

export type {
  FieldConfig,
  FormValidationState
} from '../components/validation/FormValidation';

/**
 * Main validation system configuration
 */
export interface ValidationSystemConfig {
  // Sanitization settings
  enableSanitization: boolean;
  enableHtmlEncoding: boolean;
  maxInputLength: number;
  
  // Error handling
  enableErrorRecovery: boolean;
  maxRetryAttempts: number;
  retryDelayMs: number;
  
  // Wallet error monitoring
  enableErrorMonitoring: boolean;
  errorReporting: boolean;
  
  // Development settings
  strictValidation: boolean;
  logValidationErrors: boolean;
  showDetailedErrors: boolean;
}

/**
 * Default validation system configuration
 */
export const DEFAULT_VALIDATION_CONFIG: ValidationSystemConfig = {
  enableSanitization: true,
  enableHtmlEncoding: true,
  maxInputLength: 10000,
  
  enableErrorRecovery: true,
  maxRetryAttempts: 3,
  retryDelayMs: 1000,
  
  enableErrorMonitoring: true,
  errorReporting: true,
  
  strictValidation: process.env.NODE_ENV === 'production',
  logValidationErrors: process.env.NODE_ENV === 'development',
  showDetailedErrors: process.env.NODE_ENV === 'development'
};

/**
 * Validation system state
 */
let validationSystemConfig: ValidationSystemConfig = { ...DEFAULT_VALIDATION_CONFIG };

/**
 * Initialize validation system
 */
export const initializeValidationSystem = (config: Partial<ValidationSystemConfig> = {}): void => {
  validationSystemConfig = { ...DEFAULT_VALIDATION_CONFIG, ...config };
  
  console.log('🔍 Validation System initialized with config:', validationSystemConfig);
  
  if (validationSystemConfig.enableErrorMonitoring) {
    // Initialize wallet error monitor
    walletErrorMonitor.clearStats();
  }
};

/**
 * Get current validation system configuration
 */
export const getValidationSystemConfig = (): ValidationSystemConfig => {
  return { ...validationSystemConfig };
};

/**
 * Common validation utilities
 */
export const ValidationUtils = {
  /**
   * Validate Cardano address format
   */
  isValidCardanoAddress: (address: string): boolean => {
    return ValidationPatterns.CARDANO_ADDRESS.test(address) || 
           ValidationPatterns.BYRON_ADDRESS.test(address);
  },

  /**
   * Validate ADA amount (in lovelace)
   */
  isValidLovelaceAmount: (amount: string): boolean => {
    if (!ValidationPatterns.LOVELACE_AMOUNT.test(amount)) return false;
    
    try {
      const num = BigInt(amount);
      return num > 0n && num <= BigInt('45000000000000000');
    } catch {
      return false;
    }
  },

  /**
   * Validate transaction hash
   */
  isValidTxHash: (hash: string): boolean => {
    return ValidationPatterns.TX_HASH.test(hash);
  },

  /**
   * Validate request ID format
   */
  isValidRequestId: (id: string): boolean => {
    return ValidationPatterns.REQUEST_ID.test(id);
  },

  /**
   * Validate email format
   */
  isValidEmail: (email: string): boolean => {
    return ValidationPatterns.EMAIL.test(email);
  },

  /**
   * Validate wallet name
   */
  isValidWalletName: (name: string): boolean => {
    return ValidationPatterns.WALLET_NAME.test(name);
  },

  /**
   * Convert ADA to lovelace
   */
  adaToLovelace: (ada: number): string => {
    if (!Number.isFinite(ada) || ada < 0) {
      throw new Error('Invalid ADA amount');
    }
    
    const lovelace = Math.floor(ada * 1000000);
    return lovelace.toString();
  },

  /**
   * Convert lovelace to ADA
   */
  lovelaceToAda: (lovelace: string): number => {
    if (!ValidationUtils.isValidLovelaceAmount(lovelace)) {
      throw new Error('Invalid lovelace amount');
    }
    
    const ada = Number(lovelace) / 1000000;
    return Number(ada.toFixed(6)); // 6 decimal places for ADA
  },

  /**
   * Format ADA amount for display
   */
  formatAdaAmount: (lovelace: string, decimals = 6): string => {
    try {
      const ada = ValidationUtils.lovelaceToAda(lovelace);
      return ada.toLocaleString('ja-JP', {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimals
      }) + ' ADA';
    } catch {
      return '0 ADA';
    }
  },

  /**
   * Truncate address for display
   */
  truncateAddress: (address: string, startChars = 8, endChars = 8): string => {
    if (address.length <= startChars + endChars) {
      return address;
    }
    
    return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
  },

  /**
   * Validate and format timestamp
   */
  formatTimestamp: (timestamp: number, locale = 'ja-JP'): string => {
    try {
      return new Date(timestamp).toLocaleString(locale);
    } catch {
      return '無効な日時';
    }
  }
};

/**
 * Common validation errors in Japanese
 */
export const ValidationMessages = {
  // Required fields
  REQUIRED: '必須項目です',
  REQUIRED_FIELD: (field: string) => `${field}は必須項目です`,
  
  // Format errors
  INVALID_FORMAT: '形式が正しくありません',
  INVALID_EMAIL: 'メールアドレスの形式が正しくありません',
  INVALID_URL: 'URLの形式が正しくありません',
  INVALID_ADDRESS: 'Cardanoアドレスの形式が正しくありません',
  INVALID_AMOUNT: '金額の形式が正しくありません',
  INVALID_HASH: 'ハッシュの形式が正しくありません',
  
  // Length errors
  TOO_SHORT: (min: number) => `${min}文字以上入力してください`,
  TOO_LONG: (max: number) => `${max}文字以内で入力してください`,
  
  // Numeric errors
  NOT_POSITIVE: '正の数値を入力してください',
  OUT_OF_RANGE: '有効な範囲外の値です',
  MAX_ADA_EXCEEDED: 'ADAの最大供給量を超えています',
  
  // Wallet errors
  WALLET_NOT_CONNECTED: 'ウォレットが接続されていません',
  INSUFFICIENT_FUNDS: '残高が不足しています',
  TRANSACTION_FAILED: 'トランザクションが失敗しました',
  
  // Network errors
  NETWORK_ERROR: 'ネットワークエラーが発生しました',
  TIMEOUT_ERROR: 'タイムアウトしました',
  SERVER_ERROR: 'サーバーエラーが発生しました',
  
  // Generic errors
  UNKNOWN_ERROR: '不明なエラーが発生しました',
  VALIDATION_ERROR: '検証エラーが発生しました',
  SANITIZATION_ERROR: 'データの正規化でエラーが発生しました'
};

/**
 * Validation error context
 */
export interface ValidationErrorContext {
  field?: string;
  value?: unknown;
  rule?: string;
  context?: Record<string, unknown>;
  timestamp: number;
}

/**
 * Enhanced error reporting
 */
export class ValidationErrorReporter {
  private static errors: ValidationErrorContext[] = [];
  private static readonly MAX_ERRORS = 100;

  static report(error: ValidationErrorContext): void {
    if (!validationSystemConfig.errorReporting) return;

    error.timestamp = Date.now();
    this.errors.unshift(error);
    
    // Keep only recent errors
    if (this.errors.length > this.MAX_ERRORS) {
      this.errors = this.errors.slice(0, this.MAX_ERRORS);
    }

    if (validationSystemConfig.logValidationErrors) {
      console.warn('Validation error:', error);
    }
  }

  static getErrors(): ValidationErrorContext[] {
    return [...this.errors];
  }

  static clearErrors(): void {
    this.errors = [];
  }

  static getErrorStats(): {
    total: number;
    byField: Record<string, number>;
    byRule: Record<string, number>;
    recentCount: number;
  } {
    const byField: Record<string, number> = {};
    const byRule: Record<string, number> = {};
    const recentThreshold = Date.now() - 24 * 60 * 60 * 1000; // Last 24 hours
    let recentCount = 0;

    this.errors.forEach(error => {
      if (error.field) {
        byField[error.field] = (byField[error.field] || 0) + 1;
      }
      if (error.rule) {
        byRule[error.rule] = (byRule[error.rule] || 0) + 1;
      }
      if (error.timestamp > recentThreshold) {
        recentCount++;
      }
    });

    return {
      total: this.errors.length,
      byField,
      byRule,
      recentCount
    };
  }
}

/**
 * Main validation function for OTC requests
 */
export const validateOTCRequest = (data: Record<string, unknown>): { 
  isValid: boolean; 
  errors: Record<string, string[]>; 
  sanitizedData: Record<string, unknown>;
} => {
  try {
    // Sanitize data first
    const sanitizedData = FormSanitizer.sanitizeOTCRequest(data);
    
    // Validate with schema
    const result = safeValidate(ValidationSchemas.OTCRequest.createRequest, sanitizedData);
    
    if (result.success) {
      return {
        isValid: true,
        errors: {},
        sanitizedData: result.data
      };
    } else {
      return {
        isValid: false,
        errors: result.errors,
        sanitizedData
      };
    }
  } catch (error) {
    ValidationErrorReporter.report({
      rule: 'otc_request_validation',
      value: data,
      context: { error: error instanceof Error ? error.message : 'Unknown error' },
      timestamp: Date.now()
    });

    return {
      isValid: false,
      errors: { general: ['検証処理中にエラーが発生しました'] },
      sanitizedData: data
    };
  }
};

/**
 * Health check for validation system
 */
export const performValidationHealthCheck = (): {
  healthy: boolean;
  checks: Record<string, boolean>;
  timestamp: number;
} => {
  const checks: Record<string, boolean> = {};

  // Test schema validation
  try {
    const testResult = safeValidate(ValidationSchemas.Base.email, 'test@example.com');
    checks.schemaValidation = testResult.success;
  } catch {
    checks.schemaValidation = false;
  }

  // Test sanitization
  try {
    const sanitized = InputSanitizer.sanitize('<script>alert("test")</script>', {
      removeHtml: true
    });
    checks.sanitization = sanitized === 'alert("test")';
  } catch {
    checks.sanitization = false;
  }

  // Test wallet error classification
  try {
    const error = WalletErrorClassifier.classifyError(new Error('user declined'));
    checks.errorClassification = error.code === CIP30ErrorCode.USER_DECLINED;
  } catch {
    checks.errorClassification = false;
  }

  const healthy = Object.values(checks).every(check => check);

  return {
    healthy,
    checks,
    timestamp: Date.now()
  };
};

/**
 * Export validation system singleton
 */
export const validationSystem = {
  initialize: initializeValidationSystem,
  getConfig: getValidationSystemConfig,
  healthCheck: performValidationHealthCheck,
  utils: ValidationUtils,
  messages: ValidationMessages,
  reporter: ValidationErrorReporter
};

// Auto-initialize with defaults
if (typeof window !== 'undefined') {
  initializeValidationSystem();
}