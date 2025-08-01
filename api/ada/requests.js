// Vercel Serverless Function: POST /api/ada/requests, GET /api/ada/requests
// リクエスト作成と一覧取得

// Simple in-memory cache for development
const cache = new Map();
const requestsList = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const CacheService = {
  get: (key) => {
    const item = cache.get(key);
    if (!item) return null;
    
    if (Date.now() > item.expires) {
      cache.delete(key);
      return null;
    }
    
    return item.data;
  },
  
  set: (key, data, ttlSeconds) => {
    cache.set(key, {
      data,
      expires: Date.now() + (ttlSeconds * 1000)
    });
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

      // Store in cache
      const cacheKey = `request:${requestId}`;
      await CacheService.set(cacheKey, otcRequest, ttl_minutes * 60);
      
      // Add to requests list for enumeration
      requestsList.set(requestId, otcRequest);

      // Generate signing URL
      const signUrl = `${req.headers.origin || 'http://localhost:4000'}/sign/${requestId}`;

      console.log(`Created request ${requestId}`);

      return res.status(200).json({
        requestId,
        signUrl
      });

    } else if (req.method === 'GET') {
      // Get all requests (admin-side access)
      const requests = Array.from(requestsList.values())
        .filter(req => {
          // Filter out expired requests
          if (req.ttl_absolute && new Date(req.ttl_absolute) < new Date()) {
            return false;
          }
          return true;
        })
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      
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