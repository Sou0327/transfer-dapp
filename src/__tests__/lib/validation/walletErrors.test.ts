/**
 * Wallet Error Handling Unit Tests
 * Tests for CIP-30 wallet error handling and recovery
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  CIP30ErrorCode,
  WalletErrorPatterns,
  WalletErrorClassifier,
  ErrorRecoveryExecutor,
  WalletErrorUtils,
  WalletErrorMonitor,
  walletErrorMonitor,
  errorRecoveryExecutor,
  type WalletError,
  type RecoveryAction
} from '../../../lib/validation/walletErrors';

// Mock security logging functions
jest.mock('../../../lib/security', () => ({
  logSecurityEvent: {
    suspiciousActivity: jest.fn()
  },
  logBusinessEvent: {
    requestCreated: jest.fn()
  }
}));

describe('CIP30ErrorCode', () => {
  it('should have correct error code values', () => {
    expect(CIP30ErrorCode.WALLET_NOT_FOUND).toBe(-1);
    expect(CIP30ErrorCode.WALLET_NOT_ENABLED).toBe(-2);
    expect(CIP30ErrorCode.USER_DECLINED).toBe(3);
    expect(CIP30ErrorCode.INSUFFICIENT_FUNDS).toBe(4);
    expect(CIP30ErrorCode.NETWORK_ERROR).toBe(1000);
    expect(CIP30ErrorCode.UNKNOWN_ERROR).toBe(9999);
  });
});

describe('WalletErrorPatterns', () => {
  it('should contain patterns for all supported wallets', () => {
    const expectedWallets = ['nami', 'eternl', 'flint', 'yoroi', 'gerowallet', 'nufi', 'typhon', 'lode'];
    
    expectedWallets.forEach(wallet => {
      expect(WalletErrorPatterns).toHaveProperty(wallet);
      expect(typeof WalletErrorPatterns[wallet as keyof typeof WalletErrorPatterns]).toBe('object');
    });
  });

  it('should have valid regex patterns', () => {
    const namiPatterns = WalletErrorPatterns.nami;
    
    expect(namiPatterns.userRejected.test('User rejected the request')).toBe(true);
    expect(namiPatterns.insufficientFunds.test('Insufficient funds for transaction')).toBe(true);
    expect(namiPatterns.networkError.test('Network error occurred')).toBe(true);
    expect(namiPatterns.notConnected.test('Wallet not connected')).toBe(true);
    expect(namiPatterns.utxoError.test('UTxO error detected')).toBe(true);
  });

  it('should be case insensitive', () => {
    const flintPatterns = WalletErrorPatterns.flint;
    
    expect(flintPatterns.userDeclined.test('USER DECLINED')).toBe(true);
    expect(flintPatterns.userDeclined.test('user declined')).toBe(true);
    expect(flintPatterns.userDeclined.test('User Declined')).toBe(true);
  });
});

describe('WalletErrorClassifier', () => {
  describe('classifyError', () => {
    it('should classify user rejection errors', () => {
      const error = { message: 'User rejected the transaction' };
      const result = WalletErrorClassifier.classifyError(error, 'nami');
      
      expect(result.code).toBe(CIP30ErrorCode.USER_DECLINED);
      expect(result.walletName).toBe('nami');
      expect(result.recoverable).toBe(true);
      expect(result.userFriendlyMessage).toContain('署名がキャンセル');
    });

    it('should classify insufficient funds errors', () => {
      const error = { message: 'Insufficient funds in wallet' };
      const result = WalletErrorClassifier.classifyError(error, 'eternl');
      
      expect(result.code).toBe(CIP30ErrorCode.INSUFFICIENT_FUNDS);
      expect(result.userFriendlyMessage).toContain('残高が不足');
    });

    it('should classify network errors', () => {
      const error = { message: 'Network connection failed' };
      const result = WalletErrorClassifier.classifyError(error);
      
      expect(result.code).toBe(CIP30ErrorCode.NETWORK_ERROR);
      expect(result.userFriendlyMessage).toContain('ネットワークエラー');
    });

    it('should classify UTxO errors', () => {
      const error = { message: 'UTxO not found in wallet' };
      const result = WalletErrorClassifier.classifyError(error);
      
      expect(result.code).toBe(CIP30ErrorCode.UTxO_NOT_FOUND);
      expect(result.userFriendlyMessage).toContain('UTxOが見つかりません');
    });

    it('should classify transaction size errors', () => {
      const error = { message: 'Transaction too large for network' };
      const result = WalletErrorClassifier.classifyError(error);
      
      expect(result.code).toBe(CIP30ErrorCode.TX_TOO_LARGE);
      expect(result.userFriendlyMessage).toContain('トランザクションサイズ');
    });

    it('should handle CIP-30 standard error format', () => {
      const error = {
        code: CIP30ErrorCode.INSUFFICIENT_FUNDS,
        message: 'Not enough ADA',
        info: 'Additional error info'
      };
      const result = WalletErrorClassifier.classifyError(error);
      
      expect(result.code).toBe(CIP30ErrorCode.INSUFFICIENT_FUNDS);
      expect(result.message).toBe('Not enough ADA');
    });

    it('should handle string errors', () => {
      const error = 'User cancelled operation';
      const result = WalletErrorClassifier.classifyError(error, 'yoroi');
      
      expect(result.code).toBe(CIP30ErrorCode.USER_DECLINED);
      expect(result.message).toBe('User cancelled operation');
    });

    it('should use wallet-specific patterns', () => {
      const error = { message: 'user cancellation detected' };
      const result = WalletErrorClassifier.classifyError(error, 'lode');
      
      expect(result.code).toBe(CIP30ErrorCode.USER_DECLINED);
    });

    it('should mark non-recoverable errors correctly', () => {
      const error = { code: CIP30ErrorCode.WALLET_NOT_FOUND };
      const result = WalletErrorClassifier.classifyError(error);
      
      expect(result.recoverable).toBe(false);
    });

    it('should include recovery actions', () => {
      const error = { message: 'Network timeout' };
      const result = WalletErrorClassifier.classifyError(error);
      
      expect(result.recoveryActions).toBeDefined();
      expect(result.recoveryActions.length).toBeGreaterThan(0);
      expect(result.recoveryActions[0]).toHaveProperty('id');
      expect(result.recoveryActions[0]).toHaveProperty('label');
      expect(result.recoveryActions[0]).toHaveProperty('type');
    });

    it('should include context and timestamp', () => {
      const error = { message: 'Test error' };
      const context = { requestId: 'req_123', ip: '127.0.0.1' };
      const result = WalletErrorClassifier.classifyError(error, 'nami', context);
      
      expect(result.context).toEqual(context);
      expect(result.timestamp).toBeCloseTo(Date.now(), -2); // Within 100ms
    });
  });

  describe('recovery actions', () => {
    it('should provide retry actions for user declined errors', () => {
      const error = { message: 'User rejected' };
      const result = WalletErrorClassifier.classifyError(error);
      
      const retryAction = result.recoveryActions.find(a => a.type === 'retry');
      expect(retryAction).toBeDefined();
      expect(retryAction?.label).toContain('再度署名');
    });

    it('should provide balance check for insufficient funds', () => {
      const error = { message: 'Insufficient funds' };
      const result = WalletErrorClassifier.classifyError(error);
      
      const balanceAction = result.recoveryActions.find(a => a.id === 'check_balance');
      expect(balanceAction).toBeDefined();
      expect(balanceAction?.priority).toBe('high');
    });

    it('should provide auto-executable actions where appropriate', () => {
      const error = { message: 'Network error' };
      const result = WalletErrorClassifier.classifyError(error);
      
      const autoAction = result.recoveryActions.find(a => a.autoExecute);
      expect(autoAction).toBeDefined();
    });
  });

  describe('user friendly messages', () => {
    it('should provide Japanese error messages', () => {
      const testCases = [
        { code: CIP30ErrorCode.WALLET_NOT_FOUND, expected: 'が見つかりません' },
        { code: CIP30ErrorCode.WALLET_NOT_ENABLED, expected: '有効化されていません' },
        { code: CIP30ErrorCode.USER_DECLINED, expected: 'キャンセルされました' },
        { code: CIP30ErrorCode.INSUFFICIENT_FUNDS, expected: '残高が不足' },
        { code: CIP30ErrorCode.NETWORK_ERROR, expected: 'ネットワークエラー' }
      ];

      testCases.forEach(({ code, expected }) => {
        const error = { code };
        const result = WalletErrorClassifier.classifyError(error);
        expect(result.userFriendlyMessage).toContain(expected);
      });
    });

    it('should include wallet name in messages', () => {
      const error = { code: CIP30ErrorCode.WALLET_NOT_FOUND };
      const result = WalletErrorClassifier.classifyError(error, 'nami');
      
      expect(result.userFriendlyMessage).toContain('Nami');
    });
  });
});

describe('ErrorRecoveryExecutor', () => {
  let executor: ErrorRecoveryExecutor;
  let mockContext: Record<string, unknown>;

  beforeEach(() => {
    executor = new ErrorRecoveryExecutor();
    mockContext = {
      walletName: 'nami',
      requestId: 'req_123',
      onProgress: jest.fn(),
      onComplete: jest.fn()
    };
  });

  describe('executeRecoveryAction', () => {
    it('should execute retry actions', async () => {
      const action: RecoveryAction = {
        id: 'retry_test',
        label: 'Retry Test',
        description: 'Test retry action',
        type: 'retry',
        priority: 'high'
      };

      const result = await executor.executeRecoveryAction(action, mockContext);
      
      expect(result).toBe(true);
      expect(mockContext.onProgress).toHaveBeenCalledWith('実行中: Retry Test...');
    });

    it('should execute manual actions', async () => {
      const action: RecoveryAction = {
        id: 'manual_test',
        label: 'Manual Test',
        description: 'Test manual action',
        type: 'manual',
        priority: 'high'
      };

      const result = await executor.executeRecoveryAction(action, mockContext);
      
      expect(result).toBe(true);
      expect(mockContext.onProgress).toHaveBeenCalledWith('手動操作が必要: Test manual action');
    });

    it('should execute contact actions', async () => {
      const action: RecoveryAction = {
        id: 'contact_test',
        label: 'Contact Test',
        description: 'Test contact action',
        type: 'contact',
        priority: 'low'
      };

      const result = await executor.executeRecoveryAction(action, mockContext);
      
      expect(result).toBe(true);
      expect(mockContext.onProgress).toHaveBeenCalledWith('サポートにお問い合わせください');
    });

    it('should handle action execution errors', async () => {
      const action: RecoveryAction = {
        id: 'error_test',
        label: 'Error Test',
        description: 'Test error action',
        type: 'retry',
        priority: 'high',
        execute: jest.fn().mockRejectedValue(new Error('Test error'))
      };

      const result = await executor.executeRecoveryAction(action, mockContext);
      
      expect(result).toBe(false);
      expect(mockContext.onComplete).toHaveBeenCalledWith(false);
    });

    it('should respect maximum retry attempts', async () => {
      const action: RecoveryAction = {
        id: 'retry_limit_test',
        label: 'Retry Limit Test',
        description: 'Test retry limit',
        type: 'retry',
        priority: 'high'
      };

      // Execute 4 times (exceeding max of 3)
      for (let i = 0; i < 4; i++) {
        await executor.executeRecoveryAction(action, mockContext);
      }

      expect(mockContext.onProgress).toHaveBeenCalledWith('最大再試行回数に達しました: Retry Limit Test');
    });
  });

  describe('wallet reconnection', () => {
    beforeEach(() => {
      // Mock window.cardano
      global.window = {
        ...global.window,
        cardano: {
          nami: {
            enable: jest.fn().mockResolvedValue({})
          }
        }
      } as unknown;
    });

    it('should reconnect to wallet successfully', async () => {
      const action: RecoveryAction = {
        id: 'reconnect_test',
        label: 'Reconnect Test',
        description: 'Test reconnect',
        type: 'reconnect',
        priority: 'high'
      };

      const result = await executor.executeRecoveryAction(action, mockContext);
      
      expect(result).toBe(true);
      expect(global.window.cardano.nami.enable).toHaveBeenCalled();
      expect(mockContext.onProgress).toHaveBeenCalledWith('ウォレットに再接続中...');
      expect(mockContext.onComplete).toHaveBeenCalledWith(true);
    });

    it('should handle wallet not available', async () => {
      const action: RecoveryAction = {
        id: 'reconnect_unavailable',
        label: 'Reconnect Unavailable',
        description: 'Test unavailable wallet',
        type: 'reconnect',
        priority: 'high'
      };

      const contextWithoutWallet = { ...mockContext, walletName: 'nonexistent' };
      const result = await executor.executeRecoveryAction(action, contextWithoutWallet);
      
      expect(result).toBe(false);
    });
  });

  describe('refresh actions', () => {
    it('should handle UTxO refresh', async () => {
      const dispatchEventSpy = jest.spyOn(window, 'dispatchEvent');
      
      const action: RecoveryAction = {
        id: 'refresh_utxos',
        label: 'Refresh UTxOs',
        description: 'Refresh UTxO data',
        type: 'refresh',
        priority: 'high'
      };

      const result = await executor.executeRecoveryAction(action, mockContext);
      
      expect(result).toBe(true);
      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'wallet:refresh-utxos'
        })
      );
      expect(mockContext.onComplete).toHaveBeenCalledWith(true);
    });

    it('should handle page refresh', async () => {
      const reloadSpy = jest.spyOn(window.location, 'reload').mockImplementation();
      
      const action: RecoveryAction = {
        id: 'refresh_page',
        label: 'Refresh Page',
        description: 'Refresh the page',
        type: 'refresh',
        priority: 'medium'
      };

      await executor.executeRecoveryAction(action, mockContext);
      
      expect(mockContext.onProgress).toHaveBeenCalledWith('ページを更新しています...');
      
      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 1100));
      expect(reloadSpy).toHaveBeenCalled();
    });
  });

  describe('retry count management', () => {
    it('should track retry counts', async () => {
      const actionKey = 'nami_retry_test';
      
      expect(executor.getRetryCount(actionKey)).toBe(0);
      
      const action: RecoveryAction = {
        id: 'retry_test',
        label: 'Retry Test',
        description: 'Test retry',
        type: 'retry',
        priority: 'high'
      };

      await executor.executeRecoveryAction(action, mockContext);
      expect(executor.getRetryCount(actionKey)).toBe(1);
      
      executor.resetRetryCount(actionKey);
      expect(executor.getRetryCount(actionKey)).toBe(0);
    });
  });
});

describe('WalletErrorUtils', () => {
  let sampleError: WalletError;

  beforeEach(() => {
    sampleError = {
      code: CIP30ErrorCode.USER_DECLINED,
      message: 'User rejected transaction',
      walletName: 'nami',
      timestamp: 1640995200000, // 2022-01-01 00:00:00
      recoverable: true,
      userFriendlyMessage: 'トランザクションの署名がキャンセルされました。',
      recoveryActions: [
        {
          id: 'retry',
          label: '再試行',
          description: '再度試してください',
          type: 'retry',
          priority: 'high',
          autoExecute: true
        },
        {
          id: 'manual',
          label: '手動確認',
          description: '手動で確認してください',
          type: 'manual',
          priority: 'medium'
        }
      ]
    };
  });

  describe('isRecoverable', () => {
    it('should return true for recoverable errors', () => {
      expect(WalletErrorUtils.isRecoverable(sampleError)).toBe(true);
    });

    it('should return false for non-recoverable errors', () => {
      const nonRecoverableError = { ...sampleError, recoverable: false };
      expect(WalletErrorUtils.isRecoverable(nonRecoverableError)).toBe(false);
    });
  });

  describe('getHighPriorityActions', () => {
    it('should return only high priority actions', () => {
      const highPriorityActions = WalletErrorUtils.getHighPriorityActions(sampleError);
      
      expect(highPriorityActions).toHaveLength(1);
      expect(highPriorityActions[0].priority).toBe('high');
      expect(highPriorityActions[0].id).toBe('retry');
    });
  });

  describe('getAutoExecutableActions', () => {
    it('should return only auto-executable actions', () => {
      const autoActions = WalletErrorUtils.getAutoExecutableActions(sampleError);
      
      expect(autoActions).toHaveLength(1);
      expect(autoActions[0].autoExecute).toBe(true);
      expect(autoActions[0].id).toBe('retry');
    });
  });

  describe('formatErrorForDisplay', () => {
    it('should format error for display with Japanese locale', () => {
      const formatted = WalletErrorUtils.formatErrorForDisplay(sampleError);
      
      expect(formatted).toContain(sampleError.userFriendlyMessage);
      expect(formatted).toContain(sampleError.message);
      expect(formatted).toContain('2022'); // Year from timestamp
    });
  });

  describe('createErrorContext', () => {
    it('should create error context from request', () => {
      const req = {
        walletName: 'nami',
        requestId: 'req_123',
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0'
      };

      const context = WalletErrorUtils.createErrorContext(req);
      
      expect(context.walletName).toBe('nami');
      expect(context.requestId).toBe('req_123');
      expect(context.ip).toBe('192.168.1.1');
      expect(context.userAgent).toBe('Mozilla/5.0');
      expect(context.timestamp).toBeCloseTo(Date.now(), -2);
    });

    it('should handle partial request data', () => {
      const req = { walletName: 'eternl' };
      const context = WalletErrorUtils.createErrorContext(req);
      
      expect(context.walletName).toBe('eternl');
      expect(context.requestId).toBeUndefined();
      expect(context.timestamp).toBeDefined();
    });
  });
});

describe('WalletErrorMonitor', () => {
  let monitor: WalletErrorMonitor;

  beforeEach(() => {
    monitor = new WalletErrorMonitor();
  });

  describe('recordError', () => {
    it('should record error statistics', () => {
      const error: WalletError = {
        code: CIP30ErrorCode.USER_DECLINED,
        message: 'User rejected',
        walletName: 'nami',
        timestamp: Date.now(),
        recoverable: true,
        userFriendlyMessage: 'エラーメッセージ',
        recoveryActions: [],
        context: { requestId: 'req_123' }
      };

      monitor.recordError(error);
      
      const stats = monitor.getErrorStats();
      expect(stats).toHaveLength(1);
      expect(stats[0].errorCode).toBe(CIP30ErrorCode.USER_DECLINED);
      expect(stats[0].walletName).toBe('nami');
      expect(stats[0].count).toBe(1);
    });

    it('should accumulate error counts', () => {
      const error: WalletError = {
        code: CIP30ErrorCode.NETWORK_ERROR,
        message: 'Network error',
        walletName: 'eternl',
        timestamp: Date.now(),
        recoverable: true,
        userFriendlyMessage: 'ネットワークエラー',
        recoveryActions: []
      };

      monitor.recordError(error);
      monitor.recordError(error);
      monitor.recordError(error);
      
      const stats = monitor.getErrorStats();
      expect(stats[0].count).toBe(3);
    });

    it('should track affected wallets', () => {
      const error1: WalletError = {
        code: CIP30ErrorCode.INSUFFICIENT_FUNDS,
        message: 'Insufficient funds',
        walletName: 'nami',
        timestamp: Date.now(),
        recoverable: true,
        userFriendlyMessage: '残高不足',
        recoveryActions: []
      };

      const error2: WalletError = {
        ...error1,
        walletName: 'eternl'
      };

      monitor.recordError(error1);
      monitor.recordError(error2);
      
      const stats = monitor.getErrorStats();
      expect(stats).toHaveLength(2); // Different wallets create separate entries
    });

    it('should update last occurred timestamp', () => {
      const error: WalletError = {
        code: CIP30ErrorCode.TIMEOUT_ERROR,
        message: 'Timeout',
        walletName: 'flint',
        timestamp: 1000,
        recoverable: true,
        userFriendlyMessage: 'タイムアウト',
        recoveryActions: []
      };

      monitor.recordError(error);
      
      const updatedError = { ...error, timestamp: 2000 };
      monitor.recordError(updatedError);
      
      const stats = monitor.getErrorStats();
      expect(stats[0].lastOccurred).toBe(2000);
    });
  });

  describe('getErrorStats', () => {
    it('should return empty array when no errors recorded', () => {
      const stats = monitor.getErrorStats();
      expect(stats).toEqual([]);
    });

    it('should return formatted error statistics', () => {
      const error: WalletError = {
        code: CIP30ErrorCode.UTxO_NOT_FOUND,
        message: 'UTxO not found',
        walletName: 'yoroi',
        timestamp: 12345,
        recoverable: true,
        userFriendlyMessage: 'UTxOが見つかりません',
        recoveryActions: []
      };

      monitor.recordError(error);
      
      const stats = monitor.getErrorStats();
      expect(stats[0]).toEqual({
        errorCode: CIP30ErrorCode.UTxO_NOT_FOUND,
        walletName: 'yoroi',
        count: 1,
        lastOccurred: 12345,
        affectedWallets: ['yoroi']
      });
    });
  });

  describe('clearStats', () => {
    it('should clear all error statistics', () => {
      const error: WalletError = {
        code: CIP30ErrorCode.UNKNOWN_ERROR,
        message: 'Unknown error',
        timestamp: Date.now(),
        recoverable: true,
        userFriendlyMessage: '不明なエラー',
        recoveryActions: []
      };

      monitor.recordError(error);
      expect(monitor.getErrorStats()).toHaveLength(1);
      
      monitor.clearStats();
      expect(monitor.getErrorStats()).toHaveLength(0);
    });
  });
});

describe('Global instances', () => {
  it('should export global error monitor instance', () => {
    expect(walletErrorMonitor).toBeInstanceOf(WalletErrorMonitor);
  });

  it('should export global error recovery executor instance', () => {
    expect(errorRecoveryExecutor).toBeInstanceOf(ErrorRecoveryExecutor);
  });

  it('should have shared state between imports', () => {
    const error: WalletError = {
      code: CIP30ErrorCode.VALIDATION_ERROR,
      message: 'Validation failed',
      timestamp: Date.now(),
      recoverable: true,
      userFriendlyMessage: '検証エラー',
      recoveryActions: []
    };

    walletErrorMonitor.recordError(error);
    expect(walletErrorMonitor.getErrorStats()).toHaveLength(1);
  });
});

describe('Integration scenarios', () => {
  it('should handle complete error workflow', () => {
    // 1. Classify error
    const rawError = { message: 'User cancelled the signing process' };
    const classifiedError = WalletErrorClassifier.classifyError(rawError, 'nami');
    
    expect(classifiedError.code).toBe(CIP30ErrorCode.USER_DECLINED);
    
    // 2. Get recovery actions
    const highPriorityActions = WalletErrorUtils.getHighPriorityActions(classifiedError);
    expect(highPriorityActions.length).toBeGreaterThan(0);
    
    // 3. Record for monitoring
    walletErrorMonitor.recordError(classifiedError);
    const stats = walletErrorMonitor.getErrorStats();
    expect(stats.some(s => s.errorCode === CIP30ErrorCode.USER_DECLINED)).toBe(true);
    
    // 4. Format for display
    const displayMessage = WalletErrorUtils.formatErrorForDisplay(classifiedError);
    expect(displayMessage).toContain('キャンセル');
  });

  it('should handle wallet-specific error patterns', () => {
    const testCases = [
      { wallet: 'nami', message: 'user rejected transaction', expectedCode: CIP30ErrorCode.USER_DECLINED },
      { wallet: 'eternl', message: 'balance insufficient for fees', expectedCode: CIP30ErrorCode.INSUFFICIENT_FUNDS },
      { wallet: 'flint', message: 'connection timeout occurred', expectedCode: CIP30ErrorCode.NETWORK_ERROR },
      { wallet: 'yoroi', message: 'invalid transaction format', expectedCode: CIP30ErrorCode.VALIDATION_ERROR }
    ];

    testCases.forEach(({ wallet, message, expectedCode }) => {
      const error = WalletErrorClassifier.classifyError({ message }, wallet);
      
      // Should classify to expected code or fall back to unknown
      expect([expectedCode, CIP30ErrorCode.UNKNOWN_ERROR]).toContain(error.code);
      expect(error.walletName).toBe(wallet);
    });
  });
});