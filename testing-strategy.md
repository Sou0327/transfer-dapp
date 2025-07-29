# Permit2 OTC統合テスト戦略

## 概要

Permit2 OTC機能の品質保証のため、Vitest基盤を活用した包括的テスト戦略を定義します。単体テスト、統合テスト、E2Eテスト、セキュリティテストを含む多層テストアプローチを採用します。

## テスト基盤構成

### 1. 技術スタック
- **メインテストフレームワーク**: Vitest
- **E2Eテスト**: Playwright
- **モック**: vi (Vitest内蔵)
- **アサーション**: Vitest標準
- **カバレッジ**: @vitest/coverage-v8
- **データベーステスト**: testcontainers-node
- **ブロックチェーンテスト**: hardhat, @nomicfoundation/hardhat-chai-matchers

### 2. テスト環境構成
```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*'
      ]
    },
    testTimeout: 10000,
    hookTimeout: 10000
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})
```

## テストカテゴリー別戦略

### A. 単体テスト (Unit Tests)

#### A1. セキュリティサービステスト
```typescript
// src/test/unit/SecurityService.test.ts
describe('SecurityService', () => {
  describe('EIP-712 signature validation', () => {
    it('should validate correct signature', async () => {
      // 正常な署名検証テスト
    })
    
    it('should reject invalid signature', async () => {
      // 無効な署名拒否テスト
    })
    
    it('should detect expired permits', async () => {
      // 期限切れPermit検出テスト
    })
    
    it('should calculate risk score correctly', async () => {
      // リスクスコア算出テスト
    })
  })
  
  describe('Rate limiting', () => {
    it('should allow requests within limit', async () => {
      // 制限内リクエスト許可テスト
    })
    
    it('should block requests exceeding limit', async () => {
      // 制限超過ブロックテスト
    })
  })
  
  describe('Anomaly detection', () => {
    it('should detect rapid fire requests', async () => {
      // 連続リクエスト検出テスト
    })
    
    it('should detect signature bruteforce', async () => {
      // 署名ブルートフォース検出テスト
    })
  })
})
```

#### A2. nonce管理サービステスト
```typescript
// src/test/unit/EnhancedNonceService.test.ts
describe('EnhancedNonceService', () => {
  describe('Nonce reservation', () => {
    it('should reserve available nonce', async () => {
      // nonce予約テスト
    })
    
    it('should prevent double reservation', async () => {
      // 重複予約防止テスト
    })
    
    it('should handle reservation timeout', async () => {
      // 予約タイムアウト処理テスト
    })
  })
  
  describe('Exhaustion monitoring', () => {
    it('should detect nonce exhaustion levels', async () => {
      // nonce枯渇レベル検出テスト
    })
    
    it('should generate accurate recommendations', async () => {
      // 推奨事項生成テスト
    })
  })
})
```

#### A3. EIP-712サービステスト
```typescript
// src/test/unit/EIP712Service.test.ts
describe('EIP712Service', () => {
  describe('Message creation', () => {
    it('should create valid PermitTransferFrom message', async () => {
      // PermitTransferFromメッセージ作成テスト
    })
    
    it('should create valid witness message', async () => {
      // witnessメッセージ作成テスト
    })
  })
  
  describe('Message verification', () => {
    it('should verify message structure', async () => {
      // メッセージ構造検証テスト
    })
    
    it('should validate domain parameters', async () => {
      // ドメインパラメータ検証テスト
    })
  })
})
```

### B. 統合テスト (Integration Tests)

#### B1. API統合テスト
```typescript
// src/test/integration/permit2Routes.test.ts
describe('Permit2 API Integration', () => {
  beforeEach(async () => {
    // テストデータベース初期化
    await setupTestDatabase()
  })
  
  describe('POST /api/permit2/sign-requests', () => {
    it('should create signing request with valid data', async () => {
      const response = await request(app)
        .post('/api/permit2/sign-requests')
        .send(validRequestData)
        .expect(201)
      
      expect(response.body.success).toBe(true)
      expect(response.body.data.id).toBeDefined()
    })
    
    it('should reject invalid token address', async () => {
      const invalidData = { ...validRequestData, token: 'invalid' }
      
      await request(app)
        .post('/api/permit2/sign-requests')
        .send(invalidData)
        .expect(400)
    })
    
    it('should enforce rate limiting', async () => {
      // レート制限テスト
      for (let i = 0; i < 25; i++) {
        await request(app)
          .post('/api/permit2/sign-requests')
          .send(validRequestData)
      }
      
      await request(app)
        .post('/api/permit2/sign-requests')
        .send(validRequestData)
        .expect(429)
    })
  })
  
  describe('POST /api/permit2/sign-requests/:id/signature', () => {
    it('should accept valid signature', async () => {
      // 有効な署名受付テスト
    })
    
    it('should reject invalid signature', async () => {
      // 無効な署名拒否テスト
    })
  })
})
```

#### B2. データベース統合テスト
```typescript
// src/test/integration/database.test.ts
describe('Database Integration', () => {
  describe('Signing requests CRUD', () => {
    it('should create and retrieve signing request', async () => {
      // 署名リクエストCRUDテスト
    })
    
    it('should update request status', async () => {
      // ステータス更新テスト
    })
    
    it('should handle concurrent requests', async () => {
      // 同時リクエスト処理テスト
    })
  })
  
  describe('Nonce management', () => {
    it('should prevent nonce collision', async () => {
      // nonce衝突防止テスト
    })
    
    it('should clean up expired reservations', async () => {
      // 期限切れ予約クリーンアップテスト
    })
  })
})
```

### C. E2Eテスト (End-to-End Tests)

#### C1. ユーザーワークフローテスト
```typescript
// src/test/e2e/permit2-workflow.test.ts
describe('Permit2 E2E Workflow', () => {
  beforeEach(async () => {
    await setupE2EEnvironment()
  })
  
  it('should complete full OTC transaction flow', async () => {
    const { page } = await setupBrowser()
    
    // 1. ウォレット接続
    await connectMetaMask(page)
    
    // 2. 署名リクエスト作成
    await page.goto('/permit2')
    await page.click('[data-testid="create-tab"]')
    
    await page.fill('[data-testid="token-input"]', TEST_TOKEN_ADDRESS)
    await page.fill('[data-testid="amount-input"]', '1.0')
    await page.fill('[data-testid="recipient-input"]', TEST_RECIPIENT_ADDRESS)
    
    await page.click('[data-testid="create-request-btn"]')
    
    // 3. 署名実行
    await page.click('[data-testid="manage-tab"]')
    await page.click('[data-testid="sign-btn"]:first-child')
    
    // MetaMask署名ダイアログ処理
    await handleMetaMaskSignature(page)
    
    // 4. 清算実行
    await page.click('[data-testid="settle-btn"]:first-child')
    await handleMetaMaskTransaction(page)
    
    // 5. 結果確認
    await expect(page.locator('[data-testid="status-settled"]')).toBeVisible()
  })
  
  it('should handle witness-enabled transactions', async () => {
    // witness付きトランザクションテスト
  })
  
  it('should display security alerts correctly', async () => {
    // セキュリティアラート表示テスト
  })
})
```

#### C2. セキュリティシナリオテスト
```typescript
// src/test/e2e/security-scenarios.test.ts
describe('Security E2E Scenarios', () => {
  it('should block rapid requests', async () => {
    // 大量リクエストブロックテスト
  })
  
  it('should detect and alert on nonce exhaustion', async () => {
    // nonce枯渇アラートテスト
  })
  
  it('should prevent replay attacks', async () => {
    // リプレイ攻撃防止テスト
  })
})
```

### D. セキュリティテスト (Security Tests)

#### D1. 侵入テスト
```typescript
// src/test/security/penetration.test.ts
describe('Penetration Testing', () => {
  it('should resist SQL injection attacks', async () => {
    // SQLインジェクション攻撃テスト
  })
  
  it('should resist signature forgery', async () => {
    // 署名偽造攻撃テスト
  })
  
  it('should resist nonce manipulation', async () => {
    // nonce操作攻撃テスト
  })
})
```

#### D2. 脆弱性スキャン
```typescript
// src/test/security/vulnerability-scan.test.ts
describe('Vulnerability Scanning', () => {
  it('should detect known vulnerabilities', async () => {
    // 既知脆弱性検出テスト
  })
  
  it('should validate all input sanitization', async () => {
    // 入力サニタイゼーション検証テスト
  })
})
```

### E. スマートコントラクトテスト

#### E1. OTCSettlement.solテスト
```solidity
// contracts/test/OTCSettlement.test.sol
contract OTCSettlementTest is Test {
    OTCSettlement public settlement;
    ISignatureTransfer public permit2;
    
    function setUp() public {
        // テストセットアップ
    }
    
    function testSingleSettlement() public {
        // 単一清算テスト
    }
    
    function testBatchSettlement() public {
        // バッチ清算テスト
    }
    
    function testWitnessSettlement() public {
        // witness清算テスト
    }
    
    function testReentrancyProtection() public {
        // reentrancy保護テスト
    }
    
    function testAccessControl() public {
        // アクセス制御テスト
    }
}
```

## パフォーマンステスト

### F1. 負荷テスト
```typescript
// src/test/performance/load.test.ts
describe('Load Testing', () => {
  it('should handle 100 concurrent requests', async () => {
    const promises = Array.from({ length: 100 }, () =>
      request(app)
        .post('/api/permit2/sign-requests')
        .send(validRequestData)
    )
    
    const responses = await Promise.all(promises)
    const successCount = responses.filter(r => r.status === 201).length
    
    expect(successCount).toBeGreaterThan(95) // 95%以上成功
  })
})
```

### F2. メモリリークテスト
```typescript
// src/test/performance/memory.test.ts
describe('Memory Leak Testing', () => {
  it('should not leak memory during extended operation', async () => {
    // メモリリークテスト
  })
})
```

## モック・フィクスチャ戦略

### G1. モックオブジェクト
```typescript
// src/test/mocks/index.ts
export const mockMetaMaskProvider = {
  request: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn()
}

export const mockEthersProvider = {
  getSigner: vi.fn(),
  getNetwork: vi.fn()
}

export const mockPermit2Contract = {
  permitTransferFrom: vi.fn(),
  permitWitnessTransferFrom: vi.fn()
}
```

### G2. テストフィクスチャ
```typescript
// src/test/fixtures/permit2.ts
export const validPermitData = {
  token: '0x...',
  amount: '1000000000000000000',
  recipient: '0x...',
  deadline: Math.floor(Date.now() / 1000) + 3600
}

export const validSignature = '0x...'

export const mockEIP712Domain = {
  name: 'Permit2',
  version: '1',
  chainId: 1,
  verifyingContract: '0x...'
}
```

## CI/CD統合

### H1. GitHub Actions設定
```yaml
# .github/workflows/test.yml
name: Test Suite
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:unit
      - run: npm run test:coverage
      
  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v3
      - run: npm run test:integration
      
  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm run test:e2e
      
  security-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm run test:security
      - run: npm audit
```

## カバレッジ目標

### I1. カバレッジ要件
- **単体テスト**: 90%以上
- **統合テスト**: 80%以上
- **E2Eテスト**: 主要ワークフロー100%
- **セキュリテi機能**: 95%以上

### I2. 品質ゲート
```json
{
  "coverage": {
    "global": {
      "branches": 85,
      "functions": 90,
      "lines": 90,
      "statements": 90
    },
    "each": {
      "branches": 80,
      "functions": 85,
      "lines": 85,
      "statements": 85
    }
  }
}
```

## テスト実行コマンド

### J1. NPMスクリプト
```json
{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest run src/test/unit",
    "test:integration": "vitest run src/test/integration",
    "test:e2e": "playwright test",
    "test:security": "vitest run src/test/security",
    "test:coverage": "vitest run --coverage",
    "test:watch": "vitest",
    "test:ui": "vitest --ui"
  }
}
```

### J2. 開発者向けコマンド
```bash
# 全テスト実行
npm test

# 単体テストのみ
npm run test:unit

# 監視モード
npm run test:watch

# カバレッジレポート
npm run test:coverage

# E2Eテスト
npm run test:e2e

# セキュリティテスト
npm run test:security
```

## 継続的改善

### K1. テストメトリクス監視
- テスト実行時間
- 成功率推移
- カバレッジ推移
- フレーク率

### K2. 定期見直し
- 月次テスト戦略レビュー
- 四半期パフォーマンス評価
- 年次セキュリティ監査

この包括的テスト戦略により、Permit2 OTC機能の品質、セキュリティ、パフォーマンスを確保します。