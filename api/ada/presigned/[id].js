// Vercel Serverless Function: GET /api/ada/presigned/[id]
// 署名済みトランザクション取得

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
      console.log('✅ Redis client initialized for presigned GET');
    } catch (error) {
      console.error('❌ Redis initialization failed for presigned GET:', error);
      redis = null;
    }
  }
  return redis;
};

export default async function handler(req, res) {
  console.log('=== 🔍 Presigned GET API Debug Start ===');
  console.log('Method:', req.method);
  console.log('Query:', req.query);
  console.log('URL:', req.url);
  
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    console.log('✅ OPTIONS request handled');
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    console.log('❌ Method not allowed:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const redisClient = initRedis();
  if (!redisClient) {
    console.error('❌ Redis client not available');
    return res.status(500).json({
      error: 'Database connection error'
    });
  }

  try {
    const { id } = req.query;
    console.log(`📋 Retrieving signed transaction data for ID: ${id}`);
    
    if (!id) {
      console.log('❌ No ID provided');
      return res.status(400).json({ 
        found: false,
        error: 'Request ID is required' 
      });
    }

    // Try multiple key formats
    const keyFormats = [
      `signed-tx:${id}`,
      id,
      `request:${id}`
    ];
    
    console.log(`🔍 Trying multiple key formats:`, keyFormats);
    
    let signedDataRaw = null;
    let foundKey = null;
    
    for (const cacheKey of keyFormats) {
      console.log(`🔑 Checking key: ${cacheKey}`);
      signedDataRaw = await redisClient.get(cacheKey);
      if (signedDataRaw) {
        foundKey = cacheKey;
        console.log(`✅ Found data with key: ${cacheKey}`);
        break;
      } else {
        console.log(`❌ No data found with key: ${cacheKey}`);
      }
    }
    
    // Also try to list all keys with the request ID
    try {
      const allKeys = await redisClient.keys(`*${id}*`);
      console.log(`🔍 All Redis keys containing "${id}":`, allKeys);
    } catch (error) {
      console.log('⚠️ Could not list Redis keys:', error.message);
    }
    
    if (!signedDataRaw) {
      console.log(`❌ No signed transaction found for: ${id}`);
      return res.status(200).json({
        found: false,
        message: 'Signed transaction not found'
      });
    }

    console.log(`📊 Raw data details:`, {
      dataType: typeof signedDataRaw,
      dataLength: typeof signedDataRaw === 'string' ? signedDataRaw.length : 'not string',
      dataContent: signedDataRaw,
      isEmptyObject: typeof signedDataRaw === 'object' && Object.keys(signedDataRaw).length === 0
    });

    let signedData;
    try {
      console.log(`🔍 Raw signed data type: ${typeof signedDataRaw}`);
      console.log(`🔍 Raw signed data preview:`, typeof signedDataRaw === 'string' ? signedDataRaw.slice(0, 200) + '...' : signedDataRaw);
      
      // Handle both string and object responses from Redis
      if (typeof signedDataRaw === 'string') {
        signedData = JSON.parse(signedDataRaw);
      } else if (typeof signedDataRaw === 'object' && signedDataRaw !== null) {
        signedData = signedDataRaw;
      } else {
        throw new Error(`Unexpected data type: ${typeof signedDataRaw}`);
      }
    } catch (parseError) {
      console.error('❌ Failed to parse signed data:', parseError);
      return res.status(500).json({
        found: false,
        error: 'Data corruption detected'
      });
    }
    
    console.log(`✅ Found signed transaction for: ${id}`);
    console.log('📊 Signed data keys:', Object.keys(signedData));

    return res.status(200).json({
      found: true,
      data: signedData
    });

  } catch (error) {
    console.error('💥 Presigned GET API Error:', {
      message: error.message,
      name: error.name,
      stack: error.stack
    });
    return res.status(500).json({
      found: false,
      error: 'Internal server error',
      details: error.message
    });
  }
}