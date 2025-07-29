/**
 * Input Sanitization Unit Tests
 * Tests for input sanitization and validation utilities
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';
import {
  InputSanitizer,
  SanitizationPresets,
  FormSanitizer,
  ValidationSanitizer,
  useSanitizedInput,
  type SanitizationOptions,
  type ValidationResult
} from '../../../lib/validation/sanitization';

describe('InputSanitizer', () => {
  describe('encodeHtml', () => {
    it('should encode HTML entities correctly', () => {
      const testCases = [
        { input: '<script>alert("xss")</script>', expected: '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;' },
        { input: 'Hello & World', expected: 'Hello &amp; World' },
        { input: 'Test "quotes" & \'apostrophes\'', expected: 'Test &quot;quotes&quot; &amp; &#x27;apostrophes&#x27;' },
        { input: 'Math: 2 > 1 < 3', expected: 'Math: 2 &gt; 1 &lt; 3' },
        { input: 'No HTML here', expected: 'No HTML here' }
      ];

      testCases.forEach(({ input, expected }) => {
        expect(InputSanitizer.encodeHtml(input)).toBe(expected);
      });
    });

    it('should handle empty and edge cases', () => {
      expect(InputSanitizer.encodeHtml('')).toBe('');
      expect(InputSanitizer.encodeHtml('`=/')).toBe('&#96;&#x3D;&#x2F;');
    });
  });

  describe('removeHtml', () => {
    it('should remove all HTML tags by default', () => {
      const testCases = [
        { input: '<p>Hello World</p>', expected: 'Hello World' },
        { input: '<script>alert("xss")</script>', expected: 'alert("xss")' },
        { input: 'Text with <strong>bold</strong> and <em>italic</em>', expected: 'Text with bold and italic' },
        { input: '<div><p>Nested <span>tags</span></p></div>', expected: 'Nested tags' }
      ];

      testCases.forEach(({ input, expected }) => {
        expect(InputSanitizer.removeHtml(input)).toBe(expected);
      });
    });

    it('should preserve allowed tags', () => {
      const input = '<p>Hello <strong>world</strong> <script>alert("xss")</script></p>';
      const result = InputSanitizer.removeHtml(input, ['p', 'strong']);
      
      expect(result).toBe('<p>Hello <strong>world</strong> alert("xss")</p>');
    });

    it('should be case insensitive with allowed tags', () => {
      const input = '<P>Hello <STRONG>world</STRONG></P>';
      const result = InputSanitizer.removeHtml(input, ['p', 'strong']);
      
      expect(result).toBe('<P>Hello <STRONG>world</STRONG></P>');
    });
  });

  describe('removeInvisibleChars', () => {
    it('should remove invisible and zero-width characters', () => {
      const testCases = [
        { input: 'Hello\u0000World', expected: 'HelloWorld' },
        { input: 'Test\u200BText', expected: 'TestText' },
        { input: 'Normal\uFEFFText', expected: 'NormalText' },
        { input: 'Clean text', expected: 'Clean text' }
      ];

      testCases.forEach(({ input, expected }) => {
        expect(InputSanitizer.removeInvisibleChars(input)).toBe(expected);
      });
    });
  });

  describe('removeControlChars', () => {
    it('should remove control characters', () => {
      const testCases = [
        { input: 'Hello\u0001World', expected: 'HelloWorld' },
        { input: 'Text\u007FMore', expected: 'TextMore' },
        { input: 'Normal text', expected: 'Normal text' },
        { input: 'With\ttabs', expected: 'Withtabs' }
      ];

      testCases.forEach(({ input, expected }) => {
        expect(InputSanitizer.removeControlChars(input)).toBe(expected);
      });
    });
  });

  describe('normalizeWhitespace', () => {
    it('should normalize multiple whitespace characters', () => {
      const testCases = [
        { input: 'Hello    World', expected: 'Hello World' },
        { input: 'Text\t\t\tTabs', expected: 'Text Tabs' },
        { input: 'Line1\n\n\nLine2', expected: 'Line1\nLine2' },
        { input: '  Multiple   spaces  ', expected: ' Multiple spaces ' }
      ];

      testCases.forEach(({ input, expected }) => {
        expect(InputSanitizer.normalizeWhitespace(input)).toBe(expected);
      });
    });
  });

  describe('sanitizeUrl', () => {
    it('should allow safe URLs', () => {
      const safeUrls = [
        'https://example.com',
        'http://localhost:3000',
        'https://cardano.org/wallet',
        'ftp://files.example.com'
      ];

      safeUrls.forEach(url => {
        const result = InputSanitizer.sanitizeUrl(url);
        expect(result).toBeTruthy();
        expect(result).toContain(url.split('://')[1]); // Should contain domain
      });
    });

    it('should block dangerous URL schemes', () => {
      const dangerousUrls = [
        'javascript:alert("xss")',
        'data:text/html,<script>alert("xss")</script>',
        'vbscript:msgbox("xss")',
        'file:///etc/passwd',
        'chrome://settings',
        'chrome-extension://abc123'
      ];

      dangerousUrls.forEach(url => {
        expect(InputSanitizer.sanitizeUrl(url)).toBe('');
      });
    });

    it('should handle invalid URLs', () => {
      const invalidUrls = [
        'not-a-url',
        'http://',
        'https://.',
        '://invalid'
      ];

      invalidUrls.forEach(url => {
        expect(InputSanitizer.sanitizeUrl(url)).toBe('');
      });
    });
  });

  describe('sanitizePath', () => {
    it('should prevent directory traversal', () => {
      const testCases = [
        { input: '../../../etc/passwd', expected: 'etc/passwd' },
        { input: 'safe/path/file.txt', expected: 'safe/path/file.txt' },
        { input: '/absolute/path', expected: 'absolute/path' },
        { input: 'path//with///multiple////slashes', expected: 'path/with/multiple/slashes' },
        { input: 'path/with/trailing/', expected: 'path/with/trailing' }
      ];

      testCases.forEach(({ input, expected }) => {
        expect(InputSanitizer.sanitizePath(input)).toBe(expected);
      });
    });

    it('should remove invalid filename characters', () => {
      const input = 'file<>:"|?*name.txt';
      const result = InputSanitizer.sanitizePath(input);
      expect(result).toBe('filename.txt');
    });
  });

  describe('sanitizeCardanoAddress', () => {
    it('should validate and return correct Cardano addresses', () => {
      const validAddresses = [
        'addr1qyy6nhfyks7wdu3dudslys37v252w2nwhv0fw2nft99hsxmddazdmawps4rx4j5k7p6x8nq5x5gawxqkc37ggx68v8x8xs7v3g9',
        'DdzFFzCqrhsjEixLTwQNNdkWQ2t3YM9Qe6BfAhx9YtWa7KADqWULa7haBkD5ThfYZTYGCGhJLpMADTNXJnhY9Fcd5bpeCJvTWGTFqvRN'
      ];

      validAddresses.forEach(address => {
        expect(InputSanitizer.sanitizeCardanoAddress(address)).toBe(address);
        expect(InputSanitizer.sanitizeCardanoAddress(`  ${address}  `)).toBe(address);
      });
    });

    it('should reject invalid addresses', () => {
      const invalidAddresses = [
        'invalid-address',
        '123456789',
        'addr2invalid',
        ''
      ];

      invalidAddresses.forEach(address => {
        expect(InputSanitizer.sanitizeCardanoAddress(address)).toBe('');
      });
    });
  });

  describe('sanitizeLovelaceAmount', () => {
    it('should validate and return correct lovelace amounts', () => {
      const validAmounts = [
        { input: '1000000', expected: '1000000' },
        { input: '  5000000  ', expected: '5000000' },
        { input: '45000000000000000', expected: '45000000000000000' },
        { input: '1', expected: '1' }
      ];

      validAmounts.forEach(({ input, expected }) => {
        expect(InputSanitizer.sanitizeLovelaceAmount(input)).toBe(expected);
      });
    });

    it('should reject invalid amounts', () => {
      const invalidAmounts = [
        '0',
        '45000000000000001', // Too large
        'invalid123',
        '1.5',
        '-1000000',
        ''
      ];

      invalidAmounts.forEach(amount => {
        expect(InputSanitizer.sanitizeLovelaceAmount(amount)).toBe('');
      });
    });

    it('should remove non-numeric characters', () => {
      expect(InputSanitizer.sanitizeLovelaceAmount('1,000,000')).toBe('1000000');
      expect(InputSanitizer.sanitizeLovelaceAmount('$1000000')).toBe('1000000');
    });
  });

  describe('sanitizeRequestId', () => {
    it('should validate and return correct request IDs', () => {
      const validIds = [
        'req_abc123def456ghi789',
        'req_1234567890abcdef1234567890',
        'req_test-request_id-123'
      ];

      validIds.forEach(id => {
        expect(InputSanitizer.sanitizeRequestId(id)).toBe(id);
        expect(InputSanitizer.sanitizeRequestId(`  ${id}  `)).toBe(id);
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
        expect(InputSanitizer.sanitizeRequestId(id)).toBe('');
      });
    });
  });

  describe('sanitizeTxHash', () => {
    it('should validate and return correct transaction hashes', () => {
      const validHash = 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890';
      expect(InputSanitizer.sanitizeTxHash(validHash)).toBe(validHash);
      expect(InputSanitizer.sanitizeTxHash(validHash.toUpperCase())).toBe(validHash);
      expect(InputSanitizer.sanitizeTxHash(`  ${validHash}  `)).toBe(validHash);
    });

    it('should reject invalid transaction hashes', () => {
      const invalidHashes = [
        'short',
        'a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890123', // too long
        'invalid_characters!@#$',
        ''
      ];

      invalidHashes.forEach(hash => {
        expect(InputSanitizer.sanitizeTxHash(hash)).toBe('');
      });
    });
  });

  describe('sanitizeEmail', () => {
    it('should validate and return correct email addresses', () => {
      const validEmails = [
        { input: 'test@example.com', expected: 'test@example.com' },
        { input: 'USER.NAME@DOMAIN.CO.JP', expected: 'user.name@domain.co.jp' },
        { input: '  admin+test@company.org  ', expected: 'admin+test@company.org' }
      ];

      validEmails.forEach(({ input, expected }) => {
        expect(InputSanitizer.sanitizeEmail(input)).toBe(expected);
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
        expect(InputSanitizer.sanitizeEmail(email)).toBe('');
      });
    });
  });

  describe('sanitize (main method)', () => {
    it('should apply basic sanitization options', () => {
      const input = '  <script>alert("xss")</script>  ';
      const options: SanitizationOptions = {
        trim: true,
        removeHtml: true,
        encodeHtml: false
      };

      const result = InputSanitizer.sanitize(input, options);
      expect(result).toBe('alert("xss")');
    });

    it('should apply length limits', () => {
      const input = 'This is a very long text that should be truncated';
      const options: SanitizationOptions = {
        maxLength: 10,
        minLength: 5
      };

      const result = InputSanitizer.sanitize(input, options);
      expect(result).toBe('This is a ');
      expect(result.length).toBe(10);
    });

    it('should return empty string for too short input', () => {
      const input = 'Hi';
      const options: SanitizationOptions = {
        minLength: 5
      };

      const result = InputSanitizer.sanitize(input, options);
      expect(result).toBe('');
    });

    it('should apply case conversion', () => {
      const input = 'Mixed Case Text';
      
      expect(InputSanitizer.sanitize(input, { toLowerCase: true })).toBe('mixed case text');
      expect(InputSanitizer.sanitize(input, { toUpperCase: true })).toBe('MIXED CASE TEXT');
    });

    it('should filter characters based on allowed pattern', () => {
      const input = 'Hello123World!@#';
      const options: SanitizationOptions = {
        allowedCharacters: /[a-zA-Z]/g
      };

      const result = InputSanitizer.sanitize(input, options);
      expect(result).toBe('HelloWorld');
    });

    it('should apply custom processors', () => {
      const input = 'hello world';
      const options: SanitizationOptions = {
        customProcessors: [
          (text) => text.replace(/hello/g, 'hi'),
          (text) => text.replace(/world/g, 'universe')
        ]
      };

      const result = InputSanitizer.sanitize(input, options);
      expect(result).toBe('hi universe');
    });

    it('should handle non-string input', () => {
      expect(InputSanitizer.sanitize(null as any)).toBe('');
      expect(InputSanitizer.sanitize(undefined as any)).toBe('');
      expect(InputSanitizer.sanitize(123 as any)).toBe('');
    });
  });
});

describe('SanitizationPresets', () => {
  it('should have correct basicText preset', () => {
    const preset = SanitizationPresets.basicText;
    expect(preset.trim).toBe(true);
    expect(preset.removeHtml).toBe(true);
    expect(preset.removeInvisibleChars).toBe(true);
    expect(preset.normalizeWhitespace).toBe(true);
    expect(preset.maxLength).toBe(1000);
  });

  it('should have correct safeHtml preset', () => {
    const preset = SanitizationPresets.safeHtml;
    expect(preset.allowedTags).toEqual(['p', 'br', 'strong', 'em', 'u', 'a']);
    expect(preset.maxLength).toBe(5000);
  });

  it('should have correct numeric preset', () => {
    const preset = SanitizationPresets.numeric;
    expect(preset.allowedCharacters).toEqual(/[0-9]/g);
    expect(preset.parseNumbers).toBe(true);
  });

  it('should have correct email preset', () => {
    const preset = SanitizationPresets.email;
    expect(preset.toLowerCase).toBe(true);
    expect(preset.maxLength).toBe(254);
    expect(preset.customProcessors).toContain(InputSanitizer.sanitizeEmail);
  });

  it('should work with InputSanitizer', () => {
    const input = '<p>Hello   World</p>';
    const result = InputSanitizer.sanitize(input, SanitizationPresets.basicText);
    expect(result).toBe('Hello World');
  });
});

describe('FormSanitizer', () => {
  describe('sanitizeFormData', () => {
    it('should sanitize string fields', () => {
      const formData = {
        name: '  <script>alert("xss")</script>  ',
        email: '  TEST@EXAMPLE.COM  ',
        age: 25, // non-string field
        tags: ['  tag1  ', '  tag2  '] // array field
      };

      const fieldConfigs = {
        name: SanitizationPresets.basicText,
        email: SanitizationPresets.email
      };

      const result = FormSanitizer.sanitizeFormData(formData, fieldConfigs);

      expect(result.name).toBe('alert("xss")');
      expect(result.email).toBe('test@example.com');
      expect(result.age).toBe(25);
      expect(result.tags).toEqual(['tag1', 'tag2']);
    });

    it('should handle empty form data', () => {
      const result = FormSanitizer.sanitizeFormData({});
      expect(result).toEqual({});
    });

    it('should use basicText preset as default', () => {
      const formData = { field: '<p>test</p>' };
      const result = FormSanitizer.sanitizeFormData(formData);
      expect(result.field).toBe('test');
    });
  });

  describe('sanitizeOTCRequest', () => {
    it('should sanitize OTC request data correctly', () => {
      const requestData = {
        destination: '  addr1qyy6nhfyks7wdu3dudslys37v252w2nwhv0fw2nft99hsxmddazdmawps4rx4j5k7p6x8nq5x5gawxqkc37ggx68v8x8xs7v3g9  ',
        amount: '  1,000,000  ',
        memo: '  <script>alert("test")</script>Payment memo  ',
        mode: '  fixed_amount  ',
        target_currency: '  usd  ',
        rate_source: '  coinmarketcap  '
      };

      const result = FormSanitizer.sanitizeOTCRequest(requestData);

      expect(result.destination).toBe('addr1qyy6nhfyks7wdu3dudslys37v252w2nwhv0fw2nft99hsxmddazdmawps4rx4j5k7p6x8nq5x5gawxqkc37ggx68v8x8xs7v3g9');
      expect(result.amount).toBe('1000000');
      expect(result.memo).toBe('alert("test")Payment memo');
      expect(result.mode).toBe('fixed_amount');
      expect(result.target_currency).toBe('USD');
      expect(result.rate_source).toBe('coinmarketcap');
    });
  });

  describe('sanitizeAdminData', () => {
    it('should sanitize admin data correctly', () => {
      const adminData = {
        username: '  ADMIN_USER  ',
        email: '  ADMIN@EXAMPLE.COM  ',
        password: 'SecurePassword123!',
        settings: '  <script>malicious</script>  '
      };

      const result = FormSanitizer.sanitizeAdminData(adminData);

      expect(result.username).toBe('admin_user');
      expect(result.email).toBe('admin@example.com');
      expect(result.password).toBe('SecurePassword123!'); // Passwords shouldn't be overly sanitized
      expect(result.settings).toBe('&lt;script&gt;malicious&lt;&#x2F;script&gt;');
    });
  });

  describe('sanitizeSearchParams', () => {
    it('should sanitize search parameters correctly', () => {
      const searchParams = {
        query: '  <script>search term</script>  ',
        status: '  pending_payment  ',
        mode: '  fixed_amount  ',
        page: '  2  ',
        limit: '  20  '
      };

      const result = FormSanitizer.sanitizeSearchParams(searchParams);

      expect(result.query).toBe('search term');
      expect(result.status).toBe('pending_payment');
      expect(result.mode).toBe('fixed_amount');
      expect(result.page).toBe('2');
      expect(result.limit).toBe('20');
    });
  });
});

describe('useSanitizedInput', () => {
  it('should sanitize input in real-time', () => {
    const { result } = renderHook(() => 
      useSanitizedInput('initial', SanitizationPresets.basicText)
    );

    expect(result.current.value).toBe('initial');
    expect(result.current.sanitizedValue).toBe('initial');
    expect(result.current.isValid).toBe(true);

    act(() => {
      result.current.handleChange('  <script>test</script>  ');
    });

    expect(result.current.value).toBe('  <script>test</script>  ');
    expect(result.current.sanitizedValue).toBe('test');
    expect(result.current.isValid).toBe(false);
  });

  it('should track changes correctly', () => {
    const { result } = renderHook(() => 
      useSanitizedInput('initial', SanitizationPresets.basicText)
    );

    expect(result.current.hasChanges).toBe(false);

    act(() => {
      result.current.handleChange('modified');
    });

    expect(result.current.hasChanges).toBe(true);
  });

  it('should reset values', () => {
    const { result } = renderHook(() => 
      useSanitizedInput('initial', SanitizationPresets.basicText)
    );

    act(() => {
      result.current.handleChange('modified');
    });

    expect(result.current.value).toBe('modified');

    act(() => {
      result.current.reset();
    });

    expect(result.current.value).toBe('');
    expect(result.current.sanitizedValue).toBe('');
  });
});

describe('ValidationSanitizer', () => {
  describe('validateAndSanitize', () => {
    it('should validate and sanitize successfully', () => {
      const input = '  Hello World  ';
      const options: SanitizationOptions & { required?: boolean } = {
        trim: true,
        minLength: 5,
        maxLength: 20,
        required: true
      };

      const result = ValidationSanitizer.validateAndSanitize(input, options);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.sanitizedValue).toBe('Hello World');
      expect(result.originalValue).toBe('  Hello World  ');
    });

    it('should validate required fields', () => {
      const result = ValidationSanitizer.validateAndSanitize('', { required: true });

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('この項目は必須です');
    });

    it('should validate minimum length', () => {
      const result = ValidationSanitizer.validateAndSanitize('Hi', { minLength: 5 });

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('最低5文字以上入力してください');
    });

    it('should validate maximum length', () => {
      const result = ValidationSanitizer.validateAndSanitize('This is too long', { maxLength: 5 });

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('5文字以内で入力してください');
    });

    it('should run custom validators', () => {
      const options: SanitizationOptions & { customValidators?: Array<(value: string) => string | null> } = {
        customValidators: [
          (value) => value.includes('test') ? null : 'Must contain "test"',
          (value) => value.length > 3 ? null : 'Must be longer than 3 characters'
        ]
      };

      const validResult = ValidationSanitizer.validateAndSanitize('testing', options);
      expect(validResult.isValid).toBe(true);

      const invalidResult = ValidationSanitizer.validateAndSanitize('no', options);
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors).toHaveLength(2);
    });
  });

  describe('validateFields', () => {
    it('should validate multiple fields', () => {
      const fields = {
        name: 'John Doe',
        email: 'john@example.com',
        age: '25'
      };

      const configs = {
        name: { required: true, minLength: 2 },
        email: { required: true, customProcessors: [InputSanitizer.sanitizeEmail] },
        age: { required: true, allowedCharacters: /[0-9]/g }
      };

      const results = ValidationSanitizer.validateFields(fields, configs);

      expect(results.name.isValid).toBe(true);
      expect(results.email.isValid).toBe(true);
      expect(results.age.isValid).toBe(true);
    });

    it('should handle validation errors', () => {
      const fields = {
        name: '',
        email: 'invalid-email'
      };

      const configs = {
        name: { required: true },
        email: { customProcessors: [InputSanitizer.sanitizeEmail] }
      };

      const results = ValidationSanitizer.validateFields(fields, configs);

      expect(results.name.isValid).toBe(false);
      expect(results.email.isValid).toBe(false); // Will be empty after sanitization
    });
  });

  describe('utility methods', () => {
    let mockResults: Record<string, ValidationResult>;

    beforeEach(() => {
      mockResults = {
        field1: {
          isValid: true,
          errors: [],
          sanitizedValue: 'value1',
          originalValue: 'original1'
        },
        field2: {
          isValid: false,
          errors: ['Error message'],
          sanitizedValue: 'value2',
          originalValue: 'original2'
        }
      };
    });

    describe('allValid', () => {
      it('should return false when any field is invalid', () => {
        expect(ValidationSanitizer.allValid(mockResults)).toBe(false);
      });

      it('should return true when all fields are valid', () => {
        mockResults.field2.isValid = true;
        mockResults.field2.errors = [];
        expect(ValidationSanitizer.allValid(mockResults)).toBe(true);
      });
    });

    describe('getAllErrors', () => {
      it('should return errors for invalid fields only', () => {
        const errors = ValidationSanitizer.getAllErrors(mockResults);
        
        expect(errors).toEqual({
          field2: ['Error message']
        });
        expect(errors).not.toHaveProperty('field1');
      });

      it('should return empty object when no errors', () => {
        mockResults.field2.errors = [];
        const errors = ValidationSanitizer.getAllErrors(mockResults);
        expect(errors).toEqual({});
      });
    });

    describe('getSanitizedValues', () => {
      it('should return sanitized values for all fields', () => {
        const values = ValidationSanitizer.getSanitizedValues(mockResults);
        
        expect(values).toEqual({
          field1: 'value1',
          field2: 'value2'
        });
      });
    });
  });
});

describe('Integration scenarios', () => {
  it('should handle complete form sanitization workflow', () => {
    // 1. Raw form data with various issues
    const rawFormData = {
      name: '  <script>alert("xss")</script>John Doe  ',
      email: '  JOHN.DOE@EXAMPLE.COM  ',
      amount: '  $1,000,000  ',
      address: '  addr1qyy6nhfyks7wdu3dudslys37v252w2nwhv0fw2nft99hsxmddazdmawps4rx4j5k7p6x8nq5x5gawxqkc37ggx68v8x8xs7v3g9  ',
      memo: 'Payment for   services\n\n\nwith multiple    spaces'
    };

    // 2. Apply form sanitization
    const fieldConfigs = {
      name: SanitizationPresets.basicText,
      email: SanitizationPresets.email,
      amount: SanitizationPresets.adaAmount,
      address: SanitizationPresets.cardanoAddress,
      memo: SanitizationPresets.basicText
    };

    const sanitizedData = FormSanitizer.sanitizeFormData(rawFormData, fieldConfigs);

    // 3. Validate the sanitized data
    const validationConfigs = {
      name: { required: true, minLength: 2 },
      email: { required: true },
      amount: { required: true },
      address: { required: true },
      memo: { maxLength: 200 }
    };

    const validationResults = ValidationSanitizer.validateFields(sanitizedData, validationConfigs);

    // 4. Check results
    expect(sanitizedData.name).toBe('alert("xss")John Doe');
    expect(sanitizedData.email).toBe('john.doe@example.com');
    expect(sanitizedData.amount).toBe('1000000');
    expect(sanitizedData.address).toBe('addr1qyy6nhfyks7wdu3dudslys37v252w2nwhv0fw2nft99hsxmddazdmawps4rx4j5k7p6x8nq5x5gawxqkc37ggx68v8x8xs7v3g9');
    expect(sanitizedData.memo).toBe('Payment for services with multiple spaces');

    expect(ValidationSanitizer.allValid(validationResults)).toBe(true);
  });

  it('should handle security-focused sanitization', () => {
    const maliciousInputs = [
      '<script>alert("xss")</script>',
      'javascript:alert("xss")',
      '../../../etc/passwd',
      'text\u0000with\u200Binvisible\uFEFFchars',
      'SQL\'; DROP TABLE users; --'
    ];

    const secureOptions: SanitizationOptions = {
      removeHtml: true,
      removeInvisibleChars: true,
      removeControlChars: true,
      sanitizeUrl: true,
      sanitizePath: true,
      normalizeWhitespace: true,
      encodeHtml: true
    };

    maliciousInputs.forEach(input => {
      const result = InputSanitizer.sanitize(input, secureOptions);
      
      // Should not contain dangerous patterns
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('javascript:');
      expect(result).not.toContain('../');
      expect(result).not.toContain('\u0000');
      expect(result).not.toContain('\u200B');
      expect(result).not.toContain('\uFEFF');
    });
  });

  it('should handle Cardano-specific data sanitization', () => {
    const cardanoData = {
      address: 'addr1qyy6nhfyks7wdu3dudslys37v252w2nwhv0fw2nft99hsxmddazdmawps4rx4j5k7p6x8nq5x5gawxqkc37ggx68v8x8xs7v3g9',
      amount: '1000000',
      txHash: 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890',
      requestId: 'req_test123456789012345678901234567890'
    };

    const fieldConfigs = {
      address: SanitizationPresets.cardanoAddress,
      amount: SanitizationPresets.adaAmount,
      txHash: SanitizationPresets.txHash,
      requestId: SanitizationPresets.requestId
    };

    const sanitized = FormSanitizer.sanitizeFormData(cardanoData, fieldConfigs);
    const validated = ValidationSanitizer.validateFields(sanitized, {
      address: { required: true },
      amount: { required: true },
      txHash: { required: true },
      requestId: { required: true }
    });

    expect(ValidationSanitizer.allValid(validated)).toBe(true);
    expect(sanitized.address).toBe(cardanoData.address);
    expect(sanitized.amount).toBe(cardanoData.amount);
    expect(sanitized.txHash).toBe(cardanoData.txHash);
    expect(sanitized.requestId).toBe(cardanoData.requestId);
  });
});