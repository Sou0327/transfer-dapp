// Vercel Serverless Function: POST /api/ada/requests, GET /api/ada/requests
// リクエスト作成と一覧取得 - Vercel KV使用

import { Redis } from '@upstash/redis';

// Redis インスタンスを安全に初期化
let redis = null;

const initRedis = () => {
  if (!redis && process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      redis = new Redis({
        url: process.env.KV_REST_API_URL,
        token: process.env.KV_REST_API_TOKEN,
      });
      console.log('✅ Redis client initialized');
    } catch (error) {
      console.error('❌ Redis initialization failed:', error);
      redis = null;
    }
  }
  return redis;
};

export default async function handler(req, res) {
  console.log('=== 🔥 Requests API Debug Start ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Origin:', req.headers.origin);
  
  // 🚨 環境変数の詳細チェック
  console.log('🔐 Environment Check:');
  console.log('KV_REST_API_URL exists:', !!process.env.KV_REST_API_URL);
  console.log('KV_REST_API_TOKEN exists:', !!process.env.KV_REST_API_TOKEN);
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('VERCEL_ENV:', process.env.VERCEL_ENV);
  
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    console.log('✅ OPTIONS request handled');
    return res.status(200).end();
  }

  try {
    if (req.method === 'POST') {
      console.log('📝 Creating new request...');
      console.log('Request body:', req.body);
      
      // Create new request
      const { currency, amount_mode, amount_or_rule, recipient, ttl_minutes = 10 } = req.body;

      // Validate TTL range (5 minutes to 36 hours)
      if (ttl_minutes < 5 || ttl_minutes > 2160) {
        console.log('❌ Invalid TTL:', ttl_minutes);
        return res.status(400).json({
          error: 'TTLは5分〜36時間（2160分）の間で設定してください'
        });
      }

      // Generate request ID
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      console.log('🆔 Generated ID:', requestId);
      
      // Calculate TTL
      const ttlSlot = Math.floor(Date.now() / 1000) + (ttl_minutes * 60);
      const ttlAbsolute = new Date(Date.now() + (ttl_minutes * 60 * 1000)).toISOString();

      // Create request object
      const otcRequest = {
        id: requestId,
        currency,
        amount_mode,
        amount_or_rule_json: amount_or_rule,
        recipient,
        status: 'REQUESTED',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ttl_slot: ttlSlot,
        ttl_absolute: ttlAbsolute
      };

      console.log('📊 Request object created:', {
        id: otcRequest.id,
        currency: otcRequest.currency,
        amount_mode: otcRequest.amount_mode,
        hasAmountOrRule: !!otcRequest.amount_or_rule_json,
        keys: Object.keys(otcRequest)
      });

      // Store in Redis with multiple key formats for robustness
      const redisClient = initRedis();
      if (!redisClient) {
        console.error('❌ Redis client not available for storage');
        return res.status(500).json({
          error: 'Database connection error'
        });
      }
      
      const keyFormats = [
        requestId,                    // Direct ID
        `request:${requestId}`,       // Prefixed
      ];
      
      console.log('💾 Storing in Redis with keys:', keyFormats);
      
      for (const key of keyFormats) {
        try {
          console.log(`💾 Storing with key: ${key}`);
          await redisClient.set(key, JSON.stringify(otcRequest));
          console.log(`✅ Successfully stored with key: ${key}`);
          
          // Immediate verification
          const verifyData = await redisClient.get(key);
          if (verifyData) {
            // Handle both string and object responses from Redis
            let parsed;
            if (typeof verifyData === 'string') {
              parsed = JSON.parse(verifyData);
            } else if (typeof verifyData === 'object' && verifyData !== null) {
              parsed = verifyData;
            } else {
              console.log(`⚠️ Unexpected verification data type: ${typeof verifyData}`);
              parsed = { amount_mode: 'unknown' };
            }
            console.log(`✅ Verification successful for key ${key}, amount_mode: ${parsed.amount_mode}`);
          } else {
            console.log(`❌ Verification failed for key ${key} - no data returned`);
          }
        } catch (storeError) {
          console.error(`❌ Failed to store with key ${key}:`, storeError);
        }
      }
      
      // Add to requests list for enumeration
      try {
        console.log('📋 Updating requests list...');
        const existingRequestsRaw = await redisClient.get('requests_list');
        let existingRequests = [];
        
        if (existingRequestsRaw) {
          try {
            let parsed;
            // Handle both string and object responses from Redis
            if (typeof existingRequestsRaw === 'string') {
              parsed = JSON.parse(existingRequestsRaw);
            } else if (typeof existingRequestsRaw === 'object' && existingRequestsRaw !== null) {
              parsed = existingRequestsRaw;
            } else {
              throw new Error(`Unexpected data type: ${typeof existingRequestsRaw}`);
            }
            existingRequests = Array.isArray(parsed) ? parsed : [parsed];
          } catch (parseError) {
            console.log('⚠️ Existing requests_list parse failed, creating new list:', parseError.message);
            existingRequests = typeof existingRequestsRaw === 'string' ? [existingRequestsRaw] : [];
          }
        }
        const updatedRequests = [...existingRequests, requestId];
        await redisClient.set('requests_list', JSON.stringify(updatedRequests));
        console.log('✅ Requests list updated, total requests:', updatedRequests.length);
      } catch (error) {
        console.error('❌ Failed to update requests list:', error);
      }

      // Generate signing URL
      const signUrl = `${req.headers.origin || 'http://localhost:4000'}/sign/${requestId}`;

      console.log(`✅ Request created successfully: ${requestId}`);
      console.log(`🔗 Sign URL: ${signUrl}`);

      return res.status(200).json({
        requestId,
        signUrl
      });

    } else if (req.method === 'GET') {
      console.log('📋 Getting all requests...');
      
      const redisClient = initRedis();
      if (!redisClient) {
        console.error('❌ Redis client not available for retrieval');
        return res.status(500).json({
          error: 'Database connection error'
        });
      }
      
      // Get all requests (admin-side access) from Redis
      let requests = [];
      try {
        const requestIdsRaw = await redisClient.get('requests_list');
        let requestIds = [];
        
        if (requestIdsRaw) {
          try {
            // Handle both string and object responses from Redis
            let parsed;
            if (typeof requestIdsRaw === 'string') {
              parsed = JSON.parse(requestIdsRaw);
            } else if (typeof requestIdsRaw === 'object' && requestIdsRaw !== null) {
              parsed = requestIdsRaw;
            } else {
              throw new Error(`Unexpected data type: ${typeof requestIdsRaw}`);
            }
            requestIds = Array.isArray(parsed) ? parsed : [parsed];
            console.log('✅ Successfully parsed requests_list as JSON array');
          } catch (parseError) {
            // JSON解析失敗時は単一文字列として扱う
            console.log('⚠️ JSON parse failed, treating as single string:', parseError.message);
            console.log('Raw data:', requestIdsRaw);
            
            // 単一文字列の場合は配列として扱う
            if (typeof requestIdsRaw === 'string') {
              requestIds = [requestIdsRaw];
              
              // データを正しい形式で再保存
              console.log('🔧 Fixing requests_list format...');
              await redisClient.set('requests_list', JSON.stringify(requestIds));
              console.log('✅ Fixed requests_list format');
            } else {
              requestIds = [];
            }
          }
        }
        console.log('📋 Found request IDs:', requestIds.length);
        
        // Get all request details
        const requestPromises = requestIds.map(async (id) => {
          try {
            const requestDataRaw = await redisClient.get(`request:${id}`);
            if (requestDataRaw) {
              // Handle both string and object responses from Redis
              if (typeof requestDataRaw === 'string') {
                return JSON.parse(requestDataRaw);
              } else if (typeof requestDataRaw === 'object' && requestDataRaw !== null) {
                return requestDataRaw;
              } else {
                console.log(`⚠️ Unexpected request data type for ${id}: ${typeof requestDataRaw}`);
                return null;
              }
            }
            return null;
          } catch (error) {
            console.error(`Failed to get request ${id}:`, error);
            return null;
          }
        });
        
        const allRequests = await Promise.all(requestPromises);
        
        requests = allRequests
          .filter(req => req !== null) // Remove null entries
          .filter(req => {
            // Filter out expired requests
            if (req.ttl_absolute && new Date(req.ttl_absolute) < new Date()) {
              return false;
            }
            return true;
          })
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          
        // Debug: Show each request's status
        console.log('📊 Retrieved requests status details:');
        requests.forEach((req, index) => {
          console.log(`  ${index + 1}. ID: ${req.id.slice(0, 20)}... Status: "${req.status}" Updated: ${req.updated_at}`);
        });
        
        console.log('✅ Retrieved requests:', requests.length);
      } catch (error) {
        console.error('❌ Failed to get requests from Redis:', error);
        requests = [];
      }
      
      return res.status(200).json({
        requests
      });

    } else {
      console.log('❌ Method not allowed:', req.method);
      return res.status(405).json({ error: 'Method not allowed' });
    }

  } catch (error) {
    console.error('💥 API Error:', {
      message: error.message,
      name: error.name,
      stack: error.stack
    });
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
}