# Vercel環境での外部ストレージ解決策

## コード修正による解決方法

### 方法1: Vercel KV使用（最も簡単）

#### 設定
```bash
# Vercelプロジェクトに追加
npm install @vercel/kv
```

#### コード修正

**api/ada/requests.js**
```javascript
// 修正前
const requestsList = new Map();
requestsList.set(requestId, otcRequest);

// 修正後
import { kv } from '@vercel/kv';
await kv.set(`request:${requestId}`, otcRequest, { ex: ttl_minutes * 60 });
```

**api/ada/requests/[id].js**
```javascript
// 修正前
const requestData = listData.requests?.find(req => req.id === id);

// 修正後
import { kv } from '@vercel/kv';
const requestData = await kv.get(`request:${id}`);
```

### 方法2: PostgreSQL使用（既存スキーマ活用）

#### 設定
```bash
npm install pg
```

#### コード修正

**api/ada/requests.js**
```javascript
import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// 修正前
requestsList.set(requestId, otcRequest);

// 修正後
await pool.query(
  `INSERT INTO ada_requests (id, currency, amount_mode, amount_or_rule_json, recipient, ttl_slot, status, created_by) 
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
  [requestId, currency, amount_mode, amount_or_rule, recipient, ttlSlot, 'REQUESTED', 'system']
);
```

**api/ada/requests/[id].js**
```javascript
import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// 修正前
const listResponse = await fetch(`${baseUrl}/api/ada/requests`);

// 修正後
const result = await pool.query('SELECT * FROM ada_requests WHERE id = $1', [id]);
const requestData = result.rows[0];
```

### 方法3: 外部Redis使用

#### 設定
```bash
npm install redis
```

#### コード修正

**api/ada/requests.js**
```javascript
import { createClient } from 'redis';
const redis = createClient({ url: process.env.REDIS_URL });

// 修正前
requestsList.set(requestId, otcRequest);

// 修正後
await redis.connect();
await redis.setEx(`request:${requestId}`, ttl_minutes * 60, JSON.stringify(otcRequest));
await redis.disconnect();
```

## 推奨される方法

### 🥇 1位: Vercel KV
- **メリット**: 設定が最も簡単、Vercelネイティブ
- **コード変更**: 最小限（約10行）
- **コスト**: Vercel無料枠あり

### 🥈 2位: PostgreSQL
- **メリット**: 既存スキーマ活用、本格的なDB
- **コード変更**: 中程度（約20-30行）
- **コスト**: 外部DBサービス必要

### 🥉 3位: 外部Redis
- **メリット**: 高速、セッション管理に最適
- **コード変更**: 中程度（約15-20行）
- **コスト**: 外部Redisサービス必要

## 実装の難易度

**Vercel KV**: 約30分の修正時間
**PostgreSQL**: 約1-2時間の修正時間
**Redis**: 約1時間の修正時間

すべてコード修正のみで解決可能です。