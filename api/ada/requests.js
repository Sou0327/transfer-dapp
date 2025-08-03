// Vercel Serverless Function: POST /api/ada/requests, GET /api/ada/requests
// Vercel Serverless Function: POST /api/ada/requests, GET /api/ada/requests
// リクエスト作成と一覧取得 - Vercel KV使用

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// Vercel KV cache for production
// Removed in-memory maps - using Vercel KV instead
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const CacheService = {
  get: async (key) => {
    try {
      return await redis.get(key);
    } catch (error) {
      console.error('Redis get error:', error);
      return null;
    }
  },
  
  set: async (key, data, ttlSeconds) => {
    try {
      if (ttlSeconds) {
        await redis.setex(key, ttlSeconds, JSON.stringify(data));
      } else {
        await redis.set(key, JSON.stringify(data));
      }
    } catch (error) {
      console.error('Redis set error:', error);
    }
  }
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
      const keyFormats = [
        requestId,                    // Direct ID
        `request:${requestId}`,       // Prefixed
      ];
      
      console.log('💾 Storing in Redis with keys:', keyFormats);
      
      for (const key of keyFormats) {
        try {
          console.log(`💾 Storing with key: ${key}`);
          await redis.set(key, JSON.stringify(otcRequest));
          console.log(`✅ Successfully stored with key: ${key}`);
          
          // Immediate verification
          const verifyData = await redis.get(key);
          if (verifyData) {
            const parsed = JSON.parse(verifyData);
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
        const existingRequestsRaw = await redis.get('requests_list');
        const existingRequests = existingRequestsRaw ? JSON.parse(existingRequestsRaw) : [];
        const updatedRequests = [...existingRequests, requestId];
        await redis.set('requests_list', JSON.stringify(updatedRequests));
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
      
      // Get all requests (admin-side access) from Redis
      let requests = [];
      try {
        const requestIdsRaw = await redis.get('requests_list');
        const requestIds = requestIdsRaw ? JSON.parse(requestIdsRaw) : [];
        console.log('📋 Found request IDs:', requestIds.length);
        
        // Get all request details
        const requestPromises = requestIds.map(async (id) => {
          try {
            const requestDataRaw = await redis.get(`request:${id}`);
            return requestDataRaw ? JSON.parse(requestDataRaw) : null;
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
  try {
    if (req.method === 'POST') {
      // Create new request
      const { currency, amount_mode, amount_or_rule, recipient, ttl_minutes = 10 } = req.body;

      // Validate TTL range (5 minutes to 36 hours)
      if (ttl_minutes < 5 || ttl_minutes > 2160) {
        return res.status(400).json({
          error: 'TTLは5分〜36時間（2160分）の間で設定してください'
        });
      }

      // Generate request ID
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      
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

      // Store in Vercel KV
      const cacheKey = `request:${requestId}`;
      
      // 🚨 KV保存前のデバッグ
      console.log('🚨 About to save to KV:', {
        requestId,
        cacheKey,
        ttl: ttl_minutes * 60,
        dataKeys: Object.keys(otcRequest),
        hasKvUrl: !!process.env.KV_REST_API_URL,
        hasKvToken: !!process.env.KV_REST_API_TOKEN
      });
      
      await CacheService.set(cacheKey, otcRequest, ttl_minutes * 60);
      
      // 🚨 KV保存後の確認
      try {
        const savedData = await redis.get(cacheKey);
        const parsedData = savedData ? JSON.parse(savedData) : null;
        console.log('🚨 KV save verification:', {
          saved: !!savedData,
          keysMatch: savedData ? Object.keys(savedData).length === Object.keys(otcRequest).length : false
        });
      } catch (verifyError) {
        console.error('🚨 KV verification failed:', verifyError);
      }
      
      // Add to requests list for enumeration in KV
      try {
        const existingRequestsRaw = await redis.get('requests_list');
        const existingRequests = existingRequestsRaw ? JSON.parse(existingRequestsRaw) : [];
        const updatedRequests = [...existingRequests, requestId];
        await redis.set('requests_list', JSON.stringify(updatedRequests));
      } catch (error) {
        console.error('Failed to update requests list:', error);
      }

      // Generate signing URL
      const signUrl = `${req.headers.origin || 'http://localhost:4000'}/sign/${requestId}`;

      console.log(`Created request ${requestId}`);

      return res.status(200).json({
        requestId,
        signUrl
      });

    } else if (req.method === 'GET') {
      // Get all requests (admin-side access) from Vercel KV
      let requests = [];
      try {
        const requestIdsRaw = await redis.get('requests_list');
        const requestIds = requestIdsRaw ? JSON.parse(requestIdsRaw) : [];
        
        // Get all request details
        const requestPromises = requestIds.map(async (id) => {
          try {
            const requestDataRaw = await redis.get(`request:${id}`);
            return requestDataRaw ? JSON.parse(requestDataRaw) : null;
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
      } catch (error) {
        console.error('Failed to get requests from KV:', error);
        requests = [];
      }
      
      return res.status(200).json({
        requests
      });

    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
}