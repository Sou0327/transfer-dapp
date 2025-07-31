/**
 * Validation Schemas Unit Tests
 * Tests for Zod validation schemas and utilities
 */

import { describe, it, expect } from '@jest/globals';
import {
  ValidationPatterns,
  CustomValidations,
  BaseSchemas,
  OTCRequestSchemas,
  TransactionSchemas,

  AdminSchemas,
  formatValidationErrors,
  safeValidate
} from '../../../lib/validation/schemas';
import { z } from 'zod';

describe('ValidationPatterns', () => {
  describe('CARDANO_ADDRESS', () => {
    it('should validate mainnet addresses', () => {
      const validAddress = 'addr1qyy6nhfyks7wdu3dudslys37v252w2nwhv0fw2nft99hsxmddazdmawps4rx4j5k7p6x8nq5x5gawxqkc37ggx68v8x8xs7v3g9';
      expect(ValidationPatterns.CARDANO_ADDRESS.test(validAddress)).toBe(true);
    });

    it('should reject invalid addresses', () => {
      const invalidAddresses = [
        'invalid_address',
        '1234567890',
        'addr2invalid',
        ''
      ];
      
      invalidAddresses.forEach(address => {
        expect(ValidationPatterns.CARDANO_ADDRESS.test(address)).toBe(false);
      });
    });
  });

  describe('BYRON_ADDRESS', () => {
    it('should validate Byron addresses', () => {
      const validByronAddress = 'DdzFFzCqrhsjEixLTwQNNdkWQ2t3YM9Qe6BfAhx9YtWa7KADqWULa7haBkD5ThfYZTYGCGhJLpMADTNXJnhY9Fcd5bpeCJvTWGTFqvRN';
      expect(ValidationPatterns.BYRON_ADDRESS.test(validByronAddress)).toBe(true);
    });

    it('should reject invalid Byron addresses', () => {
      const invalidAddresses = [
        'invalid',
        '123',
        'addr1test'
      ];
      
      invalidAddresses.forEach(address => {
        expect(ValidationPatterns.BYRON_ADDRESS.test(address)).toBe(false);
      });
    });
  });

  describe('TX_HASH', () => {
    it('should validate transaction hashes', () => {
      const validHash = 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890';
      expect(ValidationPatterns.TX_HASH.test(validHash)).toBe(true);
    });

    it('should reject invalid transaction hashes', () => {
      const invalidHashes = [
        'short',
        'a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890123', // too long
        'invalid_characters!@#$',
        ''
      ];
      
      invalidHashes.forEach(hash => {
        expect(ValidationPatterns.TX_HASH.test(hash)).toBe(false);
      });
    });
  });

  describe('LOVELACE_AMOUNT', () => {
    it('should validate lovelace amounts', () => {
      const validAmounts = ['1000000', '45000000000000000', '1'];
      validAmounts.forEach(amount => {
        expect(ValidationPatterns.LOVELACE_AMOUNT.test(amount)).toBe(true);
      });
    });

    it('should reject invalid amounts', () => {
      const invalidAmounts = ['1.5', 'abc', '', '1,000,000', '-100'];
      invalidAmounts.forEach(amount => {
        expect(ValidationPatterns.LOVELACE_AMOUNT.test(amount)).toBe(false);
      });
    });
  });

  describe('REQUEST_ID', () => {
    it('should validate request IDs', () => {
      const validIds = [
        'req_abc123def456ghi789',
        'req_1234567890abcdef1234567890',
        'req_test-request_id-123'
      ];
      
      validIds.forEach(id => {
        expect(ValidationPatterns.REQUEST_ID.test(id)).toBe(true);
      });
    });

    it('should reject invalid request IDs', () => {
      const invalidIds = [
        'request_abc123',
        'req_',
        'req_short',
        'invalid',
        ''
      ];
      
      invalidIds.forEach(id => {
        expect(ValidationPatterns.REQUEST_ID.test(id)).toBe(false);
      });
    });
  });

  describe('EMAIL', () => {
    it('should validate email addresses', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.jp',
        'admin+test@company.org'
      ];
      
      validEmails.forEach(email => {
        expect(ValidationPatterns.EMAIL.test(email)).toBe(true);
      });
    });

    it('should reject invalid email addresses', () => {
      const invalidEmails = [
        'invalid-email',
        '@domain.com',
        'user@',
        'user@domain',
        ''
      ];
      
      invalidEmails.forEach(email => {
        expect(ValidationPatterns.EMAIL.test(email)).toBe(false);
      });
    });
  });
});

describe('CustomValidations', () => {
  describe('lovelaceAmount', () => {
    it('should validate valid lovelace amounts', () => {
      const validAmounts = ['1000000', '45000000000000000', '1'];
      validAmounts.forEach(amount => {
        expect(CustomValidations.lovelaceAmount(amount)).toBe(true);
      });
    });

    it('should reject invalid amounts', () => {
      const invalidAmounts = ['0', '45000000000000001', 'invalid'];
      invalidAmounts.forEach(amount => {
        expect(CustomValidations.lovelaceAmount(amount)).toBe(false);
      });
    });
  });

  describe('adaAmount', () => {
    it('should validate valid ADA amounts', () => {
      const validAmounts = [1, 100.5, 45000000000];
      validAmounts.forEach(amount => {
        expect(CustomValidations.adaAmount(amount)).toBe(true);
      });
    });

    it('should reject invalid amounts', () => {
      const invalidAmounts = [0, -1, 45000000001, Infinity, NaN];
      invalidAmounts.forEach(amount => {
        expect(CustomValidations.adaAmount(amount)).toBe(false);
      });
    });
  });

  describe('cardanoAddress', () => {
    it('should validate Cardano addresses', () => {
      const validAddresses = [
        'addr1qyy6nhfyks7wdu3dudslys37v252w2nwhv0fw2nft99hsxmddazdmawps4rx4j5k7p6x8nq5x5gawxqkc37ggx68v8x8xs7v3g9',
        'DdzFFzCqrhsjEixLTwQNNdkWQ2t3YM9Qe6BfAhx9YtWa7KADqWULa7haBkD5ThfYZTYGCGhJLpMADTNXJnhY9Fcd5bpeCJvTWGTFqvRN'
      ];
      
      validAddresses.forEach(address => {
        expect(CustomValidations.cardanoAddress(address)).toBe(true);
      });
    });

    it('should reject invalid addresses', () => {
      const invalidAddresses = ['invalid', '123', ''];
      invalidAddresses.forEach(address => {
        expect(CustomValidations.cardanoAddress(address)).toBe(false);
      });
    });
  });

  describe('exchangeRate', () => {
    it('should validate valid exchange rates', () => {
      const validRates = [0.01, 1, 100, 1000000];
      validRates.forEach(rate => {
        expect(CustomValidations.exchangeRate(rate)).toBe(true);
      });
    });

    it('should reject invalid rates', () => {
      const invalidRates = [0, -1, 1000001, Infinity, NaN];
      invalidRates.forEach(rate => {
        expect(CustomValidations.exchangeRate(rate)).toBe(false);
      });
    });
  });
});

describe('BaseSchemas', () => {
  describe('pagination', () => {
    it('should validate valid pagination', () => {
      const validPagination = {
        page: 1,
        limit: 20,
        sortBy: 'created_at',
        sortOrder: 'desc' as const
      };
      
      const result = BaseSchemas.pagination.safeParse(validPagination);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validPagination);
      }
    });

    it('should apply defaults', () => {
      const minimal = {};
      const result = BaseSchemas.pagination.safeParse(minimal);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
        expect(result.data.sortOrder).toBe('desc');
      }
    });

    it('should reject invalid pagination', () => {
      const invalidPagination = [
        { page: 0 },
        { page: -1 },
        { limit: 0 },
        { limit: 101 },
        { sortOrder: 'invalid' }
      ];
      
      invalidPagination.forEach(pagination => {
        const result = BaseSchemas.pagination.safeParse(pagination);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('lovelaceAmount', () => {
    it('should validate valid amounts', () => {
      const validAmounts = ['1000000', '1', '45000000000000000'];
      validAmounts.forEach(amount => {
        const result = BaseSchemas.lovelaceAmount.safeParse(amount);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid amounts', () => {
      const invalidAmounts = ['0', 'abc', '1.5', '45000000000000001'];
      invalidAmounts.forEach(amount => {
        const result = BaseSchemas.lovelaceAmount.safeParse(amount);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('cardanoAddress', () => {
    it('should validate valid addresses', () => {
      const validAddress = 'addr1qyy6nhfyks7wdu3dudslys37v252w2nwhv0fw2nft99hsxmddazdmawps4rx4j5k7p6x8nq5x5gawxqkc37ggx68v8x8xs7v3g9';
      const result = BaseSchemas.cardanoAddress.safeParse(validAddress);
      expect(result.success).toBe(true);
    });

    it('should reject invalid addresses', () => {
      const invalidAddresses = ['invalid', '123', ''];
      invalidAddresses.forEach(address => {
        const result = BaseSchemas.cardanoAddress.safeParse(address);
        expect(result.success).toBe(false);
      });
    });
  });
});

describe('OTCRequestSchemas', () => {
  describe('createRequest', () => {
    it('should validate fixed amount request', () => {
      const fixedAmountRequest = {
        mode: 'fixed_amount' as const,
        amount: '1000000',
        destination: 'addr1qyy6nhfyks7wdu3dudslys37v252w2nwhv0fw2nft99hsxmddazdmawps4rx4j5k7p6x8nq5x5gawxqkc37ggx68v8x8xs7v3g9',
        memo: 'Test payment',
        ttl_minutes: 30
      };
      
      const result = OTCRequestSchemas.createRequest.safeParse(fixedAmountRequest);
      expect(result.success).toBe(true);
    });

    it('should validate sweep request', () => {
      const sweepRequest = {
        mode: 'sweep' as const,
        destination: 'addr1qyy6nhfyks7wdu3dudslys37v252w2nwhv0fw2nft99hsxmddazdmawps4rx4j5k7p6x8nq5x5gawxqkc37ggx68v8x8xs7v3g9',
        ttl_minutes: 60
      };
      
      const result = OTCRequestSchemas.createRequest.safeParse(sweepRequest);
      expect(result.success).toBe(true);
    });

    it('should validate rate-based request', () => {
      const rateBasedRequest = {
        mode: 'rate_based' as const,
        target_currency: 'USD',
        target_amount: 100,
        rate_source: 'coinmarketcap',
        destination: 'addr1qyy6nhfyks7wdu3dudslys37v252w2nwhv0fw2nft99hsxmddazdmawps4rx4j5k7p6x8nq5x5gawxqkc37ggx68v8x8xs7v3g9',
        ttl_minutes: 30
      };
      
      const result = OTCRequestSchemas.createRequest.safeParse(rateBasedRequest);
      expect(result.success).toBe(true);
    });

    it('should reject invalid requests', () => {
      const invalidRequests = [
        { mode: 'fixed_amount', amount: '0' }, // invalid amount
        { mode: 'sweep' }, // missing destination
        { mode: 'rate_based', target_currency: 'INVALID' }, // invalid currency length
        { mode: 'invalid_mode' }, // invalid mode
        {} // empty object
      ];
      
      invalidRequests.forEach(request => {
        const result = OTCRequestSchemas.createRequest.safeParse(request);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('requestStatus', () => {
    it('should validate all status values', () => {
      const validStatuses = [
        'created',
        'pending_payment',
        'presigned',
        'ready_to_submit',
        'submitted',
        'confirmed',
        'failed',
        'expired',
        'cancelled'
      ];
      
      validStatuses.forEach(status => {
        const result = OTCRequestSchemas.requestStatus.safeParse(status);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid status', () => {
      const result = OTCRequestSchemas.requestStatus.safeParse('invalid_status');
      expect(result.success).toBe(false);
    });
  });
});

describe('TransactionSchemas', () => {
  describe('utxo', () => {
    it('should validate valid UTxO', () => {
      const validUtxo = {
        txHash: 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890',
        outputIndex: 0,
        amount: '5000000',
        address: 'addr1qyy6nhfyks7wdu3dudslys37v252w2nwhv0fw2nft99hsxmddazdmawps4rx4j5k7p6x8nq5x5gawxqkc37ggx68v8x8xs7v3g9',
        assets: [
          {
            unit: 'policyid123456789012345678901234567890123456789012345678901234567890assetname',
            quantity: '1000'
          }
        ]
      };
      
      const result = TransactionSchemas.utxo.safeParse(validUtxo);
      expect(result.success).toBe(true);
    });

    it('should apply defaults for assets', () => {
      const utxoWithoutAssets = {
        txHash: 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890',
        outputIndex: 0,
        amount: '5000000',
        address: 'addr1qyy6nhfyks7wdu3dudslys37v252w2nwhv0fw2nft99hsxmddazdmawps4rx4j5k7p6x8nq5x5gawxqkc37ggx68v8x8xs7v3g9'
      };
      
      const result = TransactionSchemas.utxo.safeParse(utxoWithoutAssets);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.assets).toEqual([]);
      }
    });
  });

  describe('txPreview', () => {
    it('should validate transaction preview', () => {
      const txPreview = {
        inputs: [{
          txHash: 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890',
          outputIndex: 0,
          amount: '5000000',
          address: 'addr1qyy6nhfyks7wdu3dudslys37v252w2nwhv0fw2nft99hsxmddazdmawps4rx4j5k7p6x8nq5x5gawxqkc37ggx68v8x8xs7v3g9'
        }],
        outputs: [{
          address: 'addr1qyy6nhfyks7wdu3dudslys37v252w2nwhv0fw2nft99hsxmddazdmawps4rx4j5k7p6x8nq5x5gawxqkc37ggx68v8x8xs7v3g9',
          amount: '4800000',
          assets: []
        }],
        fee: '200000',
        totalInput: '5000000',
        totalOutput: '4800000'
      };
      
      const result = TransactionSchemas.txPreview.safeParse(txPreview);
      expect(result.success).toBe(true);
    });
  });
});

describe('AdminSchemas', () => {
  describe('adminLogin', () => {
    it('should validate valid login', () => {
      const validLogin = {
        username: 'admin',
        password: 'password123',
        rememberMe: true
      };
      
      const result = AdminSchemas.adminLogin.safeParse(validLogin);
      expect(result.success).toBe(true);
    });

    it('should apply defaults', () => {
      const minimalLogin = {
        username: 'admin',
        password: 'password123'
      };
      
      const result = AdminSchemas.adminLogin.safeParse(minimalLogin);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.rememberMe).toBe(false);
      }
    });

    it('should reject invalid login', () => {
      const invalidLogins = [
        { username: 'ab', password: 'password123' }, // username too short
        { username: 'admin', password: '123' }, // password too short
        { username: 'admin' }, // missing password
        { password: 'password123' } // missing username
      ];
      
      invalidLogins.forEach(login => {
        const result = AdminSchemas.adminLogin.safeParse(login);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('changePassword', () => {
    it('should validate valid password change', () => {
      const validPasswordChange = {
        currentPassword: 'oldPassword123!',
        newPassword: 'NewPassword456@',
        confirmPassword: 'NewPassword456@'
      };
      
      const result = AdminSchemas.changePassword.safeParse(validPasswordChange);
      expect(result.success).toBe(true);
    });

    it('should reject mismatched passwords', () => {
      const mismatchedPasswords = {
        currentPassword: 'oldPassword123!',
        newPassword: 'NewPassword456@',
        confirmPassword: 'DifferentPassword789#'
      };
      
      const result = AdminSchemas.changePassword.safeParse(mismatchedPasswords);
      expect(result.success).toBe(false);
    });

    it('should validate password complexity', () => {
      const weakPasswords = [
        'password', // no uppercase, no number, no special char
        'PASSWORD', // no lowercase, no number, no special char
        'Password', // no number, no special char
        'Password123', // no special char
        'Pass!1' // too short
      ];
      
      weakPasswords.forEach(password => {
        const passwordChange = {
          currentPassword: 'oldPassword123!',
          newPassword: password,
          confirmPassword: password
        };
        
        const result = AdminSchemas.changePassword.safeParse(passwordChange);
        expect(result.success).toBe(false);
      });
    });
  });
});

describe('Utility Functions', () => {
  describe('formatValidationErrors', () => {
    it('should format Zod errors correctly', () => {
      const schema = z.object({
        name: z.string().min(3),
        email: z.string().email(),
        age: z.number().min(18)
      });
      
      const result = schema.safeParse({
        name: 'ab',
        email: 'invalid-email',
        age: 16
      });
      
      if (!result.success) {
        const formatted = formatValidationErrors(result.error);
        expect(formatted).toHaveProperty('name');
        expect(formatted).toHaveProperty('email');
        expect(formatted).toHaveProperty('age');
        expect(Array.isArray(formatted.name)).toBe(true);
        expect(Array.isArray(formatted.email)).toBe(true);
        expect(Array.isArray(formatted.age)).toBe(true);
      }
    });
  });

  describe('safeValidate', () => {
    it('should return success result for valid data', () => {
      const schema = z.string().min(3);
      const result = safeValidate(schema, 'hello');
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('hello');
      }
    });

    it('should return error result for invalid data', () => {
      const schema = z.string().min(3);
      const result = safeValidate(schema, 'hi');
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors).toBeDefined();
        expect(typeof result.errors).toBe('object');
      }
    });
  });
});