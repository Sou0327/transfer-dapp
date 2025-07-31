/**
 * Input Sanitization and Validation Utilities
 * Comprehensive utilities for sanitizing and validating user inputs
 */

import { ValidationPatterns } from './schemas';

/**
 * Sanitization options
 */
export interface SanitizationOptions {
  // HTML/XSS protection
  removeHtml?: boolean;
  encodeHtml?: boolean;
  allowedTags?: string[];
  
  // String processing
  trim?: boolean;
  toLowerCase?: boolean;
  toUpperCase?: boolean;
  normalizeWhitespace?: boolean;
  
  // Length limits
  maxLength?: number;
  minLength?: number;
  
  // Character filtering
  allowedCharacters?: RegExp;
  removeInvisibleChars?: boolean;
  removeControlChars?: boolean;
  
  // Numeric processing
  parseNumbers?: boolean;
  enforcePositive?: boolean;
  
  // URL/Path safety
  sanitizeUrl?: boolean;
  sanitizePath?: boolean;
  
  // Custom processors
  customProcessors?: Array<(input: string) => string>;
}

/**
 * HTML encoding map for XSS prevention
 */
const HTML_ENCODE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#96;',
  '=': '&#x3D;'
};

/**
 * Invisible/control character patterns
 */
// eslint-disable-next-line no-control-regex
const INVISIBLE_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\uFEFF]/g;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const ZERO_WIDTH_CHARS = /[\u200B-\u200D\uFEFF]/g;

/**
 * Dangerous URL schemes
 */
const DANGEROUS_URL_SCHEMES = [
  'javascript:',
  'data:',
  'vbscript:',
  'file:',
  'about:',
  'chrome:',
  'chrome-extension:',
  'moz-extension:'
];

/**
 * Core sanitization functions
 */
export class InputSanitizer {
  /**
   * Encode HTML entities to prevent XSS
   */
  static encodeHtml(input: string): string {
    return input.replace(/[&<>"'`=/]/g, (char) => HTML_ENCODE_MAP[char] || char);
  }

  /**
   * Remove HTML tags while preserving content
   */
  static removeHtml(input: string, allowedTags: string[] = []): string {
    if (allowedTags.length === 0) {
      return input.replace(/<[^>]*>/g, '');
    }

    // Allow only specified tags
    const allowedPattern = allowedTags.map(tag => tag.toLowerCase()).join('|');
    // eslint-disable-next-line no-useless-escape
    const tagRegex = new RegExp(`<(?!\/?(?:${allowedPattern})(?:\s|>))[^>]*>`, 'gi');
    return input.replace(tagRegex, '');
  }

  /**
   * Remove invisible and control characters
   */
  static removeInvisibleChars(input: string): string {
    return input
      .replace(INVISIBLE_CHARS, '')
      .replace(ZERO_WIDTH_CHARS, '');
  }

  /**
   * Remove control characters but keep printable ones
   */
  static removeControlChars(input: string): string {
    return input.replace(CONTROL_CHARS, '');
  }

  /**
   * Normalize whitespace (multiple spaces, tabs, newlines)
   */
  static normalizeWhitespace(input: string): string {
    return input
      .replace(/\s+/g, ' ')  // Multiple whitespace to single space
      .replace(/\n\s*\n/g, '\n'); // Multiple newlines to single
  }

  /**
   * Sanitize URL to prevent malicious schemes
   */
  static sanitizeUrl(input: string): string {
    const trimmed = input.trim().toLowerCase();
    
    // Check for dangerous schemes
    for (const scheme of DANGEROUS_URL_SCHEMES) {
      if (trimmed.startsWith(scheme)) {
        return '';
      }
    }

    // Encode special characters in URL
    try {
      const url = new URL(input);
      return url.toString();
    } catch {
      // If not a valid URL, return empty string
      return '';
    }
  }

  /**
   * Sanitize file paths to prevent directory traversal
   */
  static sanitizePath(input: string): string {
    return input
      .replace(/\.\./g, '')  // Remove directory traversal
      .replace(/\/+/g, '/')  // Multiple slashes to single
      .replace(/[<>:"|?*]/g, '')  // Remove invalid filename chars
      .replace(/^\/+/, '')   // Remove leading slashes
      .replace(/\/+$/, '');  // Remove trailing slashes
  }

  /**
   * Validate and sanitize Cardano addresses
   */
  static sanitizeCardanoAddress(input: string): string {
    const trimmed = input.trim();
    
    // Basic format validation
    if (!ValidationPatterns.CARDANO_ADDRESS.test(trimmed) && 
        !ValidationPatterns.BYRON_ADDRESS.test(trimmed)) {
      return '';
    }

    return trimmed;
  }

  /**
   * Sanitize ADA amounts (in lovelace)
   */
  static sanitizeLovelaceAmount(input: string): string {
    const trimmed = input.trim();
    
    // Remove any non-numeric characters
    const numeric = trimmed.replace(/[^0-9]/g, '');
    
    // Validate amount range
    if (numeric && ValidationPatterns.LOVELACE_AMOUNT.test(numeric)) {
      const amount = BigInt(numeric);
      if (amount > 0n && amount <= BigInt('45000000000000000')) {
        return numeric;
      }
    }

    return '';
  }

  /**
   * Sanitize request IDs
   */
  static sanitizeRequestId(input: string): string {
    const trimmed = input.trim();
    
    if (ValidationPatterns.REQUEST_ID.test(trimmed)) {
      return trimmed;
    }

    return '';
  }

  /**
   * Sanitize transaction hashes
   */
  static sanitizeTxHash(input: string): string {
    const trimmed = input.trim().toLowerCase();
    
    if (ValidationPatterns.TX_HASH.test(trimmed)) {
      return trimmed;
    }

    return '';
  }

  /**
   * Sanitize email addresses
   */
  static sanitizeEmail(input: string): string {
    const trimmed = input.trim().toLowerCase();
    
    if (ValidationPatterns.EMAIL.test(trimmed)) {
      return trimmed;
    }

    return '';
  }

  /**
   * Main sanitization function with options
   */
  static sanitize(input: string, options: SanitizationOptions = {}): string {
    if (typeof input !== 'string') {
      return '';
    }

    let result = input;

    // Apply basic string processing
    if (options.trim !== false) {
      result = result.trim();
    }

    if (options.normalizeWhitespace) {
      result = this.normalizeWhitespace(result);
    }

    if (options.removeInvisibleChars) {
      result = this.removeInvisibleChars(result);
    }

    if (options.removeControlChars) {
      result = this.removeControlChars(result);
    }

    // HTML/XSS protection
    if (options.removeHtml) {
      result = this.removeHtml(result, options.allowedTags);
    } else if (options.encodeHtml) {
      result = this.encodeHtml(result);
    }

    // Case conversion
    if (options.toLowerCase) {
      result = result.toLowerCase();
    } else if (options.toUpperCase) {
      result = result.toUpperCase();
    }

    // Length limits
    if (options.maxLength && result.length > options.maxLength) {
      result = result.substring(0, options.maxLength);
    }

    if (options.minLength && result.length < options.minLength) {
      return '';
    }

    // Character filtering
    if (options.allowedCharacters) {
      const matches = result.match(options.allowedCharacters);
      result = matches ? matches.join('') : '';
    }

    // URL/Path sanitization
    if (options.sanitizeUrl) {
      result = this.sanitizeUrl(result);
    }

    if (options.sanitizePath) {
      result = this.sanitizePath(result);
    }

    // Custom processors
    if (options.customProcessors) {
      for (const processor of options.customProcessors) {
        result = processor(result);
      }
    }

    return result;
  }
}

/**
 * Pre-configured sanitization presets
 */
export const SanitizationPresets = {
  // Basic text input (names, descriptions)
  basicText: {
    trim: true,
    removeHtml: true,
    removeInvisibleChars: true,
    normalizeWhitespace: true,
    maxLength: 1000
  } as SanitizationOptions,

  // Safe HTML (for rich text)
  safeHtml: {
    trim: true,
    removeInvisibleChars: true,
    allowedTags: ['p', 'br', 'strong', 'em', 'u', 'a'],
    maxLength: 5000
  } as SanitizationOptions,

  // Numeric input
  numeric: {
    trim: true,
    allowedCharacters: /[0-9]/g,
    parseNumbers: true,
    enforcePositive: true
  } as SanitizationOptions,

  // Email input
  email: {
    trim: true,
    toLowerCase: true,
    removeInvisibleChars: true,
    maxLength: 254,
    customProcessors: [InputSanitizer.sanitizeEmail]
  } as SanitizationOptions,

  // URL input
  url: {
    trim: true,
    removeInvisibleChars: true,
    sanitizeUrl: true,
    maxLength: 2000
  } as SanitizationOptions,

  // File path
  filePath: {
    trim: true,
    sanitizePath: true,
    maxLength: 255
  } as SanitizationOptions,

  // Cardano address
  cardanoAddress: {
    trim: true,
    removeInvisibleChars: true,
    customProcessors: [InputSanitizer.sanitizeCardanoAddress]
  } as SanitizationOptions,

  // ADA amount (lovelace)
  adaAmount: {
    trim: true,
    allowedCharacters: /[0-9]/g,
    customProcessors: [InputSanitizer.sanitizeLovelaceAmount]
  } as SanitizationOptions,

  // Request ID
  requestId: {
    trim: true,
    customProcessors: [InputSanitizer.sanitizeRequestId]
  } as SanitizationOptions,

  // Transaction hash
  txHash: {
    trim: true,
    toLowerCase: true,
    allowedCharacters: /[a-f0-9]/g,
    customProcessors: [InputSanitizer.sanitizeTxHash]
  } as SanitizationOptions,

  // Search query
  searchQuery: {
    trim: true,
    removeHtml: true,
    removeInvisibleChars: true,
    normalizeWhitespace: true,
    maxLength: 200
  } as SanitizationOptions,

  // Admin input (stricter)
  adminInput: {
    trim: true,
    removeHtml: true,
    removeInvisibleChars: true,
    removeControlChars: true,
    normalizeWhitespace: true,
    encodeHtml: true,
    maxLength: 500
  } as SanitizationOptions
};

/**
 * Form field sanitization helper
 */
export class FormSanitizer {
  /**
   * Sanitize form data object
   */
  static sanitizeFormData(
    formData: Record<string, unknown>,
    fieldConfigs: Record<string, SanitizationOptions> = {}
  ): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(formData)) {
      if (typeof value === 'string') {
        const config = fieldConfigs[key] || SanitizationPresets.basicText;
        sanitized[key] = InputSanitizer.sanitize(value, config);
      } else if (Array.isArray(value)) {
        sanitized[key] = value.map(item => 
          typeof item === 'string' 
            ? InputSanitizer.sanitize(item, fieldConfigs[key] || SanitizationPresets.basicText)
            : item
        );
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Validate and sanitize OTC request data
   */
  static sanitizeOTCRequest(requestData: Record<string, unknown>): Record<string, unknown> {
    const fieldConfigs = {
      destination: SanitizationPresets.cardanoAddress,
      amount: SanitizationPresets.adaAmount,
      memo: SanitizationPresets.basicText,
      mode: { 
        trim: true,
        allowedCharacters: /[a-z_]/g,
        maxLength: 20
      } as SanitizationOptions,
      target_currency: {
        trim: true,
        toUpperCase: true,
        allowedCharacters: /[A-Z]/g,
        maxLength: 3,
        minLength: 3
      } as SanitizationOptions,
      rate_source: SanitizationPresets.basicText
    };

    return this.sanitizeFormData(requestData, fieldConfigs);
  }

  /**
   * Sanitize admin form data
   */
  static sanitizeAdminData(adminData: Record<string, unknown>): Record<string, unknown> {
    const fieldConfigs = {
      username: {
        trim: true,
        toLowerCase: true,
        allowedCharacters: /[a-z0-9_-]/g,
        maxLength: 50,
        minLength: 3
      } as SanitizationOptions,
      email: SanitizationPresets.email,
      password: {
        // Don't sanitize passwords too aggressively
        maxLength: 100,
        minLength: 8
      } as SanitizationOptions,
      settings: SanitizationPresets.adminInput
    };

    return this.sanitizeFormData(adminData, fieldConfigs);
  }

  /**
   * Sanitize search parameters
   */
  static sanitizeSearchParams(searchParams: Record<string, unknown>): Record<string, unknown> {
    const fieldConfigs = {
      query: SanitizationPresets.searchQuery,
      status: {
        trim: true,
        allowedCharacters: /[a-z_]/g,
        maxLength: 20
      } as SanitizationOptions,
      mode: {
        trim: true,
        allowedCharacters: /[a-z_]/g,
        maxLength: 20
      } as SanitizationOptions,
      page: SanitizationPresets.numeric,
      limit: SanitizationPresets.numeric
    };

    return this.sanitizeFormData(searchParams, fieldConfigs);
  }
}

/**
 * Real-time input sanitization for React components
 */
export const useSanitizedInput = (
  initialValue: string = '',
  options: SanitizationOptions = SanitizationPresets.basicText
) => {
  const [value, setValue] = React.useState(initialValue);
  const [sanitizedValue, setSanitizedValue] = React.useState(
    InputSanitizer.sanitize(initialValue, options)
  );

  const handleChange = React.useCallback((newValue: string) => {
    setValue(newValue);
    const sanitized = InputSanitizer.sanitize(newValue, options);
    setSanitizedValue(sanitized);
  }, [options]);

  const reset = React.useCallback(() => {
    setValue('');
    setSanitizedValue('');
  }, []);

  return {
    value,
    sanitizedValue,
    handleChange,
    reset,
    isValid: value === sanitizedValue,
    hasChanges: sanitizedValue !== InputSanitizer.sanitize(initialValue, options)
  };
};

/**
 * Validation result interface
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedValue: string;
  originalValue: string;
}

/**
 * Combined validation and sanitization
 */
export class ValidationSanitizer {
  /**
   * Validate and sanitize input with comprehensive checking
   */
  static validateAndSanitize(
    input: string,
    options: SanitizationOptions & {
      required?: boolean;
      customValidators?: Array<(value: string) => string | null>;
    } = {}
  ): ValidationResult {
    const originalValue = input;
    const errors: string[] = [];
    
    // Sanitize first
    const sanitizedValue = InputSanitizer.sanitize(input, options);
    
    // Required field validation
    if (options.required && !sanitizedValue) {
      errors.push('この項目は必須です');
    }
    
    // Length validation
    if (sanitizedValue && options.minLength && sanitizedValue.length < options.minLength) {
      errors.push(`最低${options.minLength}文字以上入力してください`);
    }
    
    if (sanitizedValue && options.maxLength && sanitizedValue.length > options.maxLength) {
      errors.push(`${options.maxLength}文字以内で入力してください`);
    }
    
    // Custom validators
    if (sanitizedValue && options.customValidators) {
      for (const validator of options.customValidators) {
        const error = validator(sanitizedValue);
        if (error) {
          errors.push(error);
        }
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      sanitizedValue,
      originalValue
    };
  }

  /**
   * Batch validation for multiple fields
   */
  static validateFields(
    fields: Record<string, string>,
    configs: Record<string, SanitizationOptions & { required?: boolean }>
  ): Record<string, ValidationResult> {
    const results: Record<string, ValidationResult> = {};
    
    for (const [fieldName, value] of Object.entries(fields)) {
      const config = configs[fieldName] || {};
      results[fieldName] = this.validateAndSanitize(value, config);
    }
    
    return results;
  }
  
  /**
   * Check if all validations passed
   */
  static allValid(results: Record<string, ValidationResult>): boolean {
    return Object.values(results).every(result => result.isValid);
  }
  
  /**
   * Get all errors from validation results
   */
  static getAllErrors(results: Record<string, ValidationResult>): Record<string, string[]> {
    const errors: Record<string, string[]> = {};
    
    for (const [fieldName, result] of Object.entries(results)) {
      if (result.errors.length > 0) {
        errors[fieldName] = result.errors;
      }
    }
    
    return errors;
  }
  
  /**
   * Get sanitized values from validation results
   */
  static getSanitizedValues(results: Record<string, ValidationResult>): Record<string, string> {
    const values: Record<string, string> = {};
    
    for (const [fieldName, result] of Object.entries(results)) {
      values[fieldName] = result.sanitizedValue;
    }
    
    return values;
  }
}

// Import React for hooks
import React from 'react';