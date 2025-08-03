// Vercel Serverless Function: POST /api/ada/requests, GET /api/ada/requests
// Vercel Serverless Function: POST /api/ada/requests, GET /api/ada/requests
// リクエスト作成と一覧取得 - Vercel KV使用

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
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
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
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
        hasUpstashUrl: !!process.env.UPSTASH_REDIS_REST_URL,
        hasUpstashToken: !!process.env.UPSTASH_REDIS_REST_TOKEN
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