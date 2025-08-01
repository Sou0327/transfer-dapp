// Vercel Serverless Function: POST /api/ada/presigned
// 署名済みトランザクション保存

// Simple in-memory cache (共有)
const cache = new Map();
const requestsList = new Map();

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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { requestId, signedTx, metadata } = req.body;

    if (!requestId || !signedTx) {
      return res.status(400).json({
        error: 'requestId and signedTx are required'
      });
    }

    // Store signed transaction for admin tracking
    const signedTxData = {
      requestId,
      signedTx,
      metadata: metadata || {},
      status: 'signed',
      signedAt: new Date().toISOString(),
      txHash: null // Will be populated when admin submits
    };

    // Store in cache (in production this would be in database)
    const cacheKey = `signed-tx:${requestId}`;
    await CacheService.set(cacheKey, signedTxData, 86400); // 24 hours

    // Update request status to signed
    console.log(`🔥 Processing signed transaction for request: ${requestId}`);
    
    const requestCacheKey = `request:${requestId}`;
    const existingRequest = await CacheService.get(requestCacheKey);
    
    console.log(`🔥 Existing request found: ${!!existingRequest}`);
    
    if (existingRequest) {
      const updatedRequest = {
        ...existingRequest,
        status: 'SIGNED',
        signedAt: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      await CacheService.set(requestCacheKey, updatedRequest, 86400);
      
      // Update requests list as well
      requestsList.set(requestId, updatedRequest);
      
      console.log(`🔥 Request status updated to SIGNED for: ${requestId}`);
    } else {
      console.log(`❌ No cached request found for: ${requestId}`);
    }

    console.log(`Transaction signed for request ${requestId}`);

    return res.status(200).json({
      success: true,
      message: '署名が完了しました。管理者が送信を行います。',
      requestId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Failed to store signed transaction:', error);
    return res.status(500).json({
      error: 'Failed to store signed transaction'
    });
  }
}