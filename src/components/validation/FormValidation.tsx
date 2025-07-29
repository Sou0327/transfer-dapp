/**
 * Form Validation Components and Hooks
 * User-friendly form validation with Japanese error messages
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { z } from 'zod';
import { ValidationSchemas, formatValidationErrors, safeValidate } from '../../lib/validation/schemas';
import { ValidationSanitizer, SanitizationPresets, SanitizationOptions } from '../../lib/validation/sanitization';
import { WalletErrorClassifier, WalletError } from '../../lib/validation/walletErrors';

/**
 * Field validation configuration
 */
export interface FieldConfig {
  schema?: z.ZodSchema<any>;
  sanitization?: SanitizationOptions;
  required?: boolean;
  label?: string;
  helpText?: string;
  customValidators?: Array<(value: any) => string | null>;
  validateOnChange?: boolean;
  validateOnBlur?: boolean;
  debounceMs?: number;
}

/**
 * Form validation state
 */
export interface FormValidationState {
  values: Record<string, any>;
  errors: Record<string, string[]>;
  touched: Record<string, boolean>;
  isValid: boolean;
  isValidating: boolean;
  isDirty: boolean;
}

/**
 * Form validation hook
 */
export const useFormValidation = <T extends Record<string, any>>(
  initialValues: T,
  fieldConfigs: Record<keyof T, FieldConfig> = {}
) => {
  const [state, setState] = useState<FormValidationState>({
    values: { ...initialValues },
    errors: {},
    touched: {},
    isValid: true,
    isValidating: false,
    isDirty: false
  });

  // Validation debounce timers
  const [debounceTimers, setDebounceTimers] = useState<Record<string, NodeJS.Timeout>>({});

  /**
   * Validate a single field
   */
  const validateField = useCallback(async (
    fieldName: keyof T,
    value: any,
    shouldUpdateState = true
  ): Promise<string[]> => {
    const config = fieldConfigs[fieldName];
    if (!config) return [];

    const errors: string[] = [];

    try {
      // Sanitization
      let sanitizedValue = value;
      if (typeof value === 'string' && config.sanitization) {
        const sanitizationResult = ValidationSanitizer.validateAndSanitize(value, {
          ...config.sanitization,
          required: config.required
        });
        
        if (!sanitizationResult.isValid) {
          errors.push(...sanitizationResult.errors);
        }
        
        sanitizedValue = sanitizationResult.sanitizedValue;
      }

      // Zod schema validation
      if (config.schema && sanitizedValue !== '') {
        const result = safeValidate(config.schema, sanitizedValue);
        if (!result.success) {
          const fieldErrors = result.errors[fieldName as string] || [];
          errors.push(...fieldErrors);
        }
      }

      // Required field validation
      if (config.required && (sanitizedValue === '' || sanitizedValue == null)) {
        const label = config.label || String(fieldName);
        errors.push(`${label}は必須項目です`);
      }

      // Custom validators
      if (config.customValidators && sanitizedValue !== '') {
        for (const validator of config.customValidators) {
          const error = validator(sanitizedValue);
          if (error) {
            errors.push(error);
          }
        }
      }

      // Update state if requested
      if (shouldUpdateState) {
        setState(prev => ({
          ...prev,
          values: { ...prev.values, [fieldName]: sanitizedValue },
          errors: { ...prev.errors, [fieldName]: errors },
          isValid: Object.keys({ ...prev.errors, [fieldName]: errors })
            .every(key => !prev.errors[key] || prev.errors[key].length === 0)
        }));
      }

      return errors;
    } catch (error) {
      console.error(`Validation error for field ${String(fieldName)}:`, error);
      const errorMessage = error instanceof Error ? error.message : '検証エラーが発生しました';
      if (shouldUpdateState) {
        setState(prev => ({
          ...prev,
          errors: { ...prev.errors, [fieldName]: [errorMessage] }
        }));
      }
      return [errorMessage];
    }
  }, [fieldConfigs]);

  /**
   * Validate all fields
   */
  const validateAll = useCallback(async (): Promise<boolean> => {
    setState(prev => ({ ...prev, isValidating: true }));

    const validationPromises = Object.keys(fieldConfigs).map(async (fieldName) => {
      const errors = await validateField(fieldName as keyof T, state.values[fieldName], false);
      return { fieldName, errors };
    });

    try {
      const results = await Promise.all(validationPromises);
      const newErrors: Record<string, string[]> = {};
      
      results.forEach(({ fieldName, errors }) => {
        if (errors.length > 0) {
          newErrors[fieldName] = errors;
        }
      });

      const isValid = Object.keys(newErrors).length === 0;

      setState(prev => ({
        ...prev,
        errors: newErrors,
        isValid,
        isValidating: false
      }));

      return isValid;
    } catch (error) {
      console.error('Form validation error:', error);
      setState(prev => ({
        ...prev,
        isValidating: false,
        isValid: false
      }));
      return false;
    }
  }, [fieldConfigs, state.values, validateField]);

  /**
   * Handle field value change
   */
  const setFieldValue = useCallback((
    fieldName: keyof T,
    value: any,
    shouldValidate = true
  ) => {
    const config = fieldConfigs[fieldName];
    
    setState(prev => ({
      ...prev,
      values: { ...prev.values, [fieldName]: value },
      isDirty: true
    }));

    // Debounced validation
    if (shouldValidate && config?.validateOnChange) {
      const debounceMs = config.debounceMs || 300;
      
      // Clear existing timer
      if (debounceTimers[fieldName as string]) {
        clearTimeout(debounceTimers[fieldName as string]);
      }

      // Set new timer
      const timer = setTimeout(() => {
        validateField(fieldName, value);
      }, debounceMs);

      setDebounceTimers(prev => ({
        ...prev,
        [fieldName as string]: timer
      }));
    }
  }, [fieldConfigs, debounceTimers, validateField]);

  /**
   * Handle field blur
   */
  const setFieldTouched = useCallback((fieldName: keyof T, shouldValidate = true) => {
    setState(prev => ({
      ...prev,
      touched: { ...prev.touched, [fieldName]: true }
    }));

    if (shouldValidate && fieldConfigs[fieldName]?.validateOnBlur) {
      validateField(fieldName, state.values[fieldName]);
    }
  }, [fieldConfigs, state.values, validateField]);

  /**
   * Reset form
   */
  const resetForm = useCallback((newValues?: T) => {
    const values = newValues || initialValues;
    setState({
      values,
      errors: {},
      touched: {},
      isValid: true,
      isValidating: false,
      isDirty: false
    });

    // Clear debounce timers
    Object.values(debounceTimers).forEach(clearTimeout);
    setDebounceTimers({});
  }, [initialValues, debounceTimers]);

  /**
   * Get field props for form controls
   */
  const getFieldProps = useCallback((fieldName: keyof T) => {
    const config = fieldConfigs[fieldName];
    const hasError = state.errors[fieldName as string]?.length > 0;
    const isTouched = state.touched[fieldName as string];

    return {
      value: state.values[fieldName] || '',
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        setFieldValue(fieldName, e.target.value);
      },
      onBlur: () => setFieldTouched(fieldName),
      error: hasError && isTouched,
      helperText: hasError && isTouched ? state.errors[fieldName as string]?.[0] : config?.helpText,
      required: config?.required
    };
  }, [fieldConfigs, state, setFieldValue, setFieldTouched]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Object.values(debounceTimers).forEach(clearTimeout);
    };
  }, [debounceTimers]);

  return {
    ...state,
    setFieldValue,
    setFieldTouched,
    validateField,
    validateAll,
    resetForm,
    getFieldProps
  };
};

/**
 * Field error display component
 */
interface FieldErrorProps {
  errors?: string[];
  touched?: boolean;
  className?: string;
}

export const FieldError: React.FC<FieldErrorProps> = ({
  errors = [],
  touched = false,
  className = ''
}) => {
  if (!touched || errors.length === 0) {
    return null;
  }

  return (
    <div className={`mt-1 text-sm text-red-600 ${className}`}>
      {errors.map((error, index) => (
        <div key={index} className="flex items-start">
          <svg className="w-4 h-4 mr-1 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span>{error}</span>
        </div>
      ))}
    </div>
  );
};

/**
 * Form field wrapper with validation
 */
interface ValidatedFieldProps {
  label: string;
  required?: boolean;
  children: React.ReactElement;
  errors?: string[];
  touched?: boolean;
  helpText?: string;
  className?: string;
}

export const ValidatedField: React.FC<ValidatedFieldProps> = ({
  label,
  required = false,
  children,
  errors = [],
  touched = false,
  helpText,
  className = ''
}) => {
  const hasError = touched && errors.length > 0;

  return (
    <div className={`space-y-1 ${className}`}>
      <label className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      
      <div className="relative">
        {React.cloneElement(children, {
          className: `${children.props.className} ${
            hasError 
              ? 'border-red-300 focus:border-red-500 focus:ring-red-500' 
              : 'border-gray-300 focus:border-orange-500 focus:ring-orange-500'
          }`,
          'aria-invalid': hasError,
          'aria-describedby': hasError ? `${children.props.id}-error` : undefined
        })}
        
        {hasError && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
        )}
      </div>

      {helpText && !hasError && (
        <p className="text-xs text-gray-500">{helpText}</p>
      )}
      
      <FieldError errors={errors} touched={touched} />
    </div>
  );
};

/**
 * Form validation summary component
 */
interface ValidationSummaryProps {
  errors: Record<string, string[]>;
  touched: Record<string, boolean>;
  fieldConfigs: Record<string, FieldConfig>;
  className?: string;
}

export const ValidationSummary: React.FC<ValidationSummaryProps> = ({
  errors,
  touched,
  fieldConfigs,
  className = ''
}) => {
  const visibleErrors = useMemo(() => {
    const result: Array<{ field: string; label: string; errors: string[] }> = [];
    
    for (const [field, fieldErrors] of Object.entries(errors)) {
      if (touched[field] && fieldErrors.length > 0) {
        const config = fieldConfigs[field];
        result.push({
          field,
          label: config?.label || field,
          errors: fieldErrors
        });
      }
    }
    
    return result;
  }, [errors, touched, fieldConfigs]);

  if (visibleErrors.length === 0) {
    return null;
  }

  return (
    <div className={`bg-red-50 border border-red-200 rounded-md p-4 ${className}`}>
      <div className="flex">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-red-800">
            入力エラーがあります
          </h3>
          <div className="mt-2 text-sm text-red-700">
            <ul className="list-disc list-inside space-y-1">
              {visibleErrors.map(({ field, label, errors: fieldErrors }) => (
                <li key={field}>
                  <strong>{label}:</strong> {fieldErrors.join(', ')}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Loading validation state component
 */
interface ValidationLoadingProps {
  isValidating: boolean;
  message?: string;
  className?: string;
}

export const ValidationLoading: React.FC<ValidationLoadingProps> = ({
  isValidating,
  message = '検証中...',
  className = ''
}) => {
  if (!isValidating) {
    return null;
  }

  return (
    <div className={`flex items-center text-sm text-gray-600 ${className}`}>
      <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      {message}
    </div>
  );
};

/**
 * Pre-configured form validation hooks for common use cases
 */

/**
 * OTC Request form validation
 */
export const useOTCRequestValidation = (initialValues: any = {}) => {
  const fieldConfigs: Record<string, FieldConfig> = {
    mode: {
      schema: ValidationSchemas.OTCRequest.transferMode,
      required: true,
      label: '送金モード',
      validateOnChange: true
    },
    amount: {
      schema: ValidationSchemas.Base.lovelaceAmount,
      sanitization: SanitizationPresets.adaAmount,
      required: true,
      label: '金額',
      helpText: 'ADA単位で入力してください',
      validateOnChange: true,
      debounceMs: 500
    },
    destination: {
      schema: ValidationSchemas.Base.cardanoAddress,
      sanitization: SanitizationPresets.cardanoAddress,
      required: true,
      label: '送金先アドレス',
      helpText: 'Cardanoアドレスを入力してください',
      validateOnBlur: true
    },
    memo: {
      sanitization: SanitizationPresets.basicText,
      label: 'メモ',
      helpText: '任意のメモを入力できます（最大500文字）',
      validateOnChange: true
    },
    ttl_minutes: {
      schema: z.number().int().min(5).max(1440),
      label: '有効期限（分）',
      helpText: '5分から1440分（24時間）まで設定可能',
      validateOnChange: true
    }
  };

  return useFormValidation(initialValues, fieldConfigs);
};

/**
 * Admin login form validation
 */
export const useAdminLoginValidation = (initialValues: any = {}) => {
  const fieldConfigs: Record<string, FieldConfig> = {
    username: {
      schema: z.string().min(3).max(50),
      sanitization: {
        trim: true,
        toLowerCase: true,
        allowedCharacters: /[a-z0-9_-]/g,
        maxLength: 50
      },
      required: true,
      label: 'ユーザー名',
      validateOnBlur: true
    },
    password: {
      schema: z.string().min(8),
      required: true,
      label: 'パスワード',
      validateOnBlur: true
    }
  };

  return useFormValidation(initialValues, fieldConfigs);
};

/**
 * System settings form validation
 */
export const useSystemSettingsValidation = (initialValues: any = {}) => {
  const fieldConfigs: Record<string, FieldConfig> = {
    max_requests_per_hour: {
      schema: z.number().int().min(1).max(10000),
      label: '1時間あたりの最大リクエスト数',
      validateOnChange: true
    },
    default_ttl_minutes: {
      schema: z.number().int().min(5).max(1440),
      label: 'デフォルト有効期限（分）',
      validateOnChange: true
    },
    max_ada_amount: {
      schema: z.number().positive().max(45000000000),
      label: '最大ADA金額',
      validateOnChange: true
    },
    min_ada_amount: {
      schema: z.number().positive(),
      label: '最小ADA金額',
      validateOnChange: true
    },
    blockfrost_api_key: {
      sanitization: SanitizationPresets.basicText,
      required: true,
      label: 'Blockfrost APIキー',
      validateOnBlur: true
    }
  };

  return useFormValidation(initialValues, fieldConfigs);
};

/**
 * Wallet error handling for forms
 */
export const useWalletErrorHandling = () => {
  const [walletError, setWalletError] = useState<WalletError | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);

  const handleWalletError = useCallback((error: any, walletName?: string) => {
    const classifiedError = WalletErrorClassifier.classifyError(error, walletName);
    setWalletError(classifiedError);
  }, []);

  const clearError = useCallback(() => {
    setWalletError(null);
    setIsRecovering(false);
  }, []);

  const startRecovery = useCallback(() => {
    setIsRecovering(true);
  }, []);

  return {
    walletError,
    isRecovering,
    handleWalletError,
    clearError,
    startRecovery
  };
};

/**
 * Form submission wrapper with validation
 */
interface ValidatedFormProps {
  children: React.ReactNode;
  onSubmit: (values: any) => Promise<void> | void;
  validation: ReturnType<typeof useFormValidation>;
  className?: string;
}

export const ValidatedForm: React.FC<ValidatedFormProps> = ({
  children,
  onSubmit,
  validation,
  className = ''
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isSubmitting) return;

    setIsSubmitting(true);
    
    try {
      const isValid = await validation.validateAll();
      if (isValid) {
        await onSubmit(validation.values);
      }
    } catch (error) {
      console.error('Form submission error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={className} noValidate>
      {children}
      
      {/* Hidden submit button for Enter key support */}
      <button type="submit" style={{ display: 'none' }} disabled={isSubmitting} />
    </form>
  );
};