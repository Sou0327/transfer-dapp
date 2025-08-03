// Vercel Serverless Function: POST /api/ada/presigned, GET /api/ada/presigned/[id]
// 署名済みトランザクション保存・取得

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
      console.log('✅ Redis client initialized for presigned');
    } catch (error) {
      console.error('❌ Redis initialization failed for presigned:', error);
      redis = null;
    }
  }
  return redis;
};

export default async function handler(req, res) {
  console.log('=== 📝 Presigned POST API Debug Start ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Body keys:', Object.keys(req.body || {}));
  
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    console.log('✅ OPTIONS request handled');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    console.log('❌ Method not allowed:', req.method);
    return res.status(405).json({ error: 'Method not allowed - POST only' });
  }

  const redisClient = initRedis();
  if (!redisClient) {
    console.error('❌ Redis client not available');
    return res.status(500).json({
      error: 'Database connection error'
    });
  }

  try {
    // 署名データ保存
    console.log('📝 Storing signed transaction...');
    const { requestId, signedTx, metadata } = req.body;

    if (!requestId || !signedTx) {
      console.log('❌ Missing required fields');
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

    console.log('💾 Storing signed transaction data:', {
      requestId,
      hasSignedTx: !!signedTx,
      metadata: metadata || {},
    });

    // Store in Redis
    const cacheKey = `signed-tx:${requestId}`;
    const dataToStore = JSON.stringify(signedTxData);
    
    console.log(`💾 About to store data with key: ${cacheKey}`);
    console.log(`📊 Data size: ${dataToStore.length} characters`);
    console.log(`📝 Data preview:`, JSON.stringify(signedTxData, null, 2));
    
    await redisClient.set(cacheKey, dataToStore);
    console.log(`✅ Signed transaction stored with key: ${cacheKey}`);
    
    // Verify storage immediately
    const verifyData = await redisClient.get(cacheKey);
    if (verifyData) {
      console.log(`✅ Storage verification successful - data exists in Redis`);
      console.log(`📊 Storage verification details:`, {
        dataType: typeof verifyData,
        dataSize: typeof verifyData === 'string' ? verifyData.length : 'not string',
        isEmptyObject: typeof verifyData === 'object' && Object.keys(verifyData).length === 0,
        dataKeys: typeof verifyData === 'object' ? Object.keys(verifyData) : 'not object',
        dataContent: verifyData
      });
    } else {
      console.error(`❌ Storage verification failed - data not found in Redis!`);
    }

    // Update request status to signed
    console.log(`🔄 Updating request status to SIGNED: ${requestId}`);
    
    const requestKeyFormats = [
      requestId,
      `request:${requestId}`,
    ];
    
    let existingRequest = null;
    for (const key of requestKeyFormats) {
      const requestDataRaw = await redisClient.get(key);
      if (requestDataRaw) {
        console.log(`🔍 Raw request data type: ${typeof requestDataRaw}`);
        console.log(`🔍 Raw request data:`, requestDataRaw);
        
        // Handle both string and object responses from Redis
        try {
          if (typeof requestDataRaw === 'string') {
            existingRequest = JSON.parse(requestDataRaw);
          } else if (typeof requestDataRaw === 'object' && requestDataRaw !== null) {
            existingRequest = requestDataRaw;
          } else {
            console.log(`⚠️ Unexpected data type: ${typeof requestDataRaw}`);
            continue;
          }
          console.log(`✅ Found existing request with key: ${key}`);
        
          const updatedRequest = {
            ...existingRequest,
            status: 'SIGNED',
            signedAt: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          
          await redisClient.set(key, JSON.stringify(updatedRequest));
          console.log(`✅ Request status updated to SIGNED for: ${requestId}`);
          break;
        } catch (parseError) {
          console.error(`❌ Failed to parse/update request data for key ${key}:`, parseError);
          continue;
        }
      }
    }
    
    if (!existingRequest) {
      console.log(`⚠️ No request found for: ${requestId}`);
    }

    console.log(`✅ Transaction signed for request ${requestId}`);

    return res.status(200).json({
      success: true,
      message: '署名が完了しました。管理者が送信を行います。',
      requestId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('💥 Presigned POST API Error:', {
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