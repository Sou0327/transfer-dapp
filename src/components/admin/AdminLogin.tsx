/**
 * Admin Login Component for OTC System
 */
import React, { useState, useCallback } from 'react';
import { LoginCredentials } from '../../types/otc/index';

interface AdminLoginProps {
  onLogin: (credentials: LoginCredentials) => Promise<void>;
  loading?: boolean;
  error?: string | null;
  className?: string;
}

interface LoginFormData {
  email: string;
  password: string;
  rememberMe: boolean;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({
  onLogin,
  loading = false,
  error = null,
  className = '',
}) => {
  const [formData, setFormData] = useState<LoginFormData>({
    email: '',
    password: '',
    rememberMe: false,
  });
  
  const [formErrors, setFormErrors] = useState<Partial<LoginFormData>>({});
  const [showPassword, setShowPassword] = useState(false);

  // Handle form input changes
  const handleInputChange = useCallback((field: keyof LoginFormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear field-specific errors when user starts typing
    if (formErrors[field]) {
      setFormErrors(prev => ({ ...prev, [field]: undefined }));
    }
  }, [formErrors]);

  // Validate form data
  const validateForm = useCallback((): boolean => {
    const errors: Partial<LoginFormData> = {};

    // Email validation
    if (!formData.email.trim()) {
      errors.email = 'メールアドレスを入力してください';
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email)) {
        errors.email = '有効なメールアドレスを入力してください';
      }
    }

    // Password validation
    if (!formData.password.trim()) {
      errors.password = 'パスワードを入力してください';
    } else if (formData.password.length < 6) {
      errors.password = 'パスワードは6文字以上で入力してください';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData, setFormErrors]);

  // Handle form submission
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('フォーム送信開始:', formData);

    if (!validateForm()) {
      console.log('バリデーションエラー:', formErrors);
      return;
    }

    try {
      const credentials: LoginCredentials = {
        email: formData.email.trim(),
        password: formData.password,
        ipAddress: 'localhost', // 開発環境では固定
        userAgent: navigator.userAgent,
      };

      console.log('認証情報:', credentials);
      await onLogin(credentials);
    } catch (error) {
      console.error('Login submission error:', error);
    }
  }, [formData, validateForm, onLogin, formErrors]);



  // Toggle password visibility
  const togglePasswordVisibility = useCallback(() => {
    setShowPassword(prev => !prev);
  }, []);

  return (
    <div className={`min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 ${className}`}>
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div>
          <div className="mx-auto h-12 w-12 flex items-center justify-center bg-orange-500 rounded-full">
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            OTC管理画面
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            管理者としてログインしてください
          </p>
        </div>

        {/* Login Form */}
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {/* Global Error Message */}
          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">
                    ログインに失敗しました
                  </h3>
                  <div className="mt-2 text-sm text-red-700">
                    {error}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                メールアドレス *
              </label>
              <div className="mt-1 relative">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  className={`appearance-none relative block w-full px-3 py-2 border ${
                    formErrors.email ? 'border-red-300' : 'border-gray-300'
                  } placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-orange-500 focus:border-orange-500 focus:z-10 sm:text-sm`}
                  placeholder="admin@example.com"
                  disabled={loading}
                />
                {formErrors.email && (
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </div>
              {formErrors.email && (
                <p className="mt-1 text-sm text-red-600">{formErrors.email}</p>
              )}
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                パスワード *
              </label>
              <div className="mt-1 relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  className={`appearance-none relative block w-full px-3 py-2 pr-10 border ${
                    formErrors.password ? 'border-red-300' : 'border-gray-300'
                  } placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-orange-500 focus:border-orange-500 focus:z-10 sm:text-sm`}
                  placeholder="パスワードを入力"
                  disabled={loading}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={togglePasswordVisibility}
                  disabled={loading}
                >
                  {showPassword ? (
                    <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L8.464 8.464a1.061 1.061 0 00-1.5 0L5.536 9.88a1.061 1.061 0 000 1.5L7.05 12.796" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              {formErrors.password && (
                <p className="mt-1 text-sm text-red-600">{formErrors.password}</p>
              )}
            </div>

            {/* Remember Me Checkbox */}
            <div className="flex items-center">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                checked={formData.rememberMe}
                onChange={(e) => handleInputChange('rememberMe', e.target.checked)}
                className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                disabled={loading}
              />
              <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-900">
                ログイン状態を保持する
              </label>
            </div>
          </div>

          {/* Submit Button */}
          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: '#ea580c',
                color: 'white',
                border: 'none'
              }}
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  ログイン中...
                </>
              ) : (
                <>
                  <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                    <svg className="h-5 w-5 text-orange-500 group-hover:text-orange-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                  </span>
                  管理画面にログイン
                </>
              )}
            </button>
          </div>

          {/* Footer Information */}
          <div className="text-center">
            <p className="text-xs text-gray-500">
              ログイン情報はセキュアに暗号化されて保存されます
            </p>
          </div>
        </form>

        {/* Development Information */}
        {(import.meta.env.NODE_ENV === 'development' || import.meta.env.DEV) && (
          <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-md">
            <h4 className="text-sm font-medium text-blue-800">開発用情報</h4>
            <div className="mt-2 text-xs text-blue-600">
              <p>開発環境用ログイン情報:</p>
              <p>Email: <strong>admin@otc.local</strong></p>
              <p>Password: <strong>admin123</strong></p>
              <p className="mt-1 text-blue-500">※本番環境では認証情報を変更してください</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminLogin;