// Vercel Serverless Function: GET /api/ada/requests/:id
// Vercel Serverless Function: GET /api/ada/requests/:id
// 個別リクエスト取得 - Vercel KV使用

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  console.log('=== 🔥 API Request Debug Start ===');
  console.log('Method:', req.method);
  console.log('Query:', req.query);
  console.log('URL:', req.url);
  console.log('Headers:', req.headers);
  
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    console.log('OPTIONS request handled');
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    console.log('❌ Method not allowed:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.query;
    console.log('📋 Request ID from query:', id);
    
    if (!id) {
      console.log('❌ No ID provided in query');
      return res.status(400).json({ error: 'Request ID is required' });
    }
    
    // 🚨 詳細な環境変数チェック
    console.log('🔐 Environment Variables Check:');
    console.log('KV_REST_API_URL exists:', !!process.env.KV_REST_API_URL);
    console.log('KV_REST_API_TOKEN exists:', !!process.env.KV_REST_API_TOKEN);
    console.log('NODE_ENV:', process.env.NODE_ENV);
    console.log('VERCEL_ENV:', process.env.VERCEL_ENV);
    
    if (process.env.KV_REST_API_URL) {
      console.log('KV_REST_API_URL preview:', process.env.KV_REST_API_URL.substring(0, 30) + '...');
    }
    if (process.env.KV_REST_API_TOKEN) {
      console.log('KV_REST_API_TOKEN preview:', process.env.KV_REST_API_TOKEN.substring(0, 10) + '...');
    }
    
    if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
      console.log('❌ Missing Redis environment variables');
      return res.status(500).json({ 
        error: 'Server configuration error - Redis not configured',
        hasUrl: !!process.env.KV_REST_API_URL,
        hasToken: !!process.env.KV_REST_API_TOKEN
      });
    }
    
    // Redis接続とデータ取得
    console.log('🔗 Attempting Redis connection...');
    
    let requestData = null;
    
    try {
      // 複数のキー形式をチェック
      const keyFormats = [
        id,              // そのまま
        `request:${id}`, // prefixあり
        `req_${id}`,     // altprefix
      ];
      
      console.log('🔍 Checking key formats:', keyFormats);
      
      for (const key of keyFormats) {
        console.log(`🔎 Trying key: ${key}`);
        const rawData = await redis.get(key);
        console.log(`Key ${key} result:`, { found: !!rawData, type: typeof rawData });
        
        if (rawData) {
          if (typeof rawData === 'string') {
            try {
              requestData = JSON.parse(rawData);
              console.log('✅ Successfully parsed JSON data');
            } catch (parseError) {
              console.log('⚠️ JSON parse failed, using raw data:', parseError.message);
              requestData = rawData;
            }
          } else {
            requestData = rawData;
          }
          
          console.log('✅ Found data with key:', key);
          break;
        }
      }
      
      // データが見つからない場合、全キーを確認
      if (!requestData) {
        console.log('🔍 Data not found, checking all keys...');
        try {
          const allKeys = await redis.keys('*');
          console.log('📋 All keys in Redis:', allKeys.slice(0, 20)); // 最初の20個
          console.log('📊 Total keys count:', allKeys.length);
          
          // パターンマッチングも試す
          const pattern = `*${id}*`;
          const matchingKeys = await redis.keys(pattern);
          console.log(`🔎 Keys matching pattern ${pattern}:`, matchingKeys);
        } catch (keysError) {
          console.log('⚠️ Could not retrieve keys:', keysError.message);
        }
      }
      
    } catch (redisError) {
      console.error('❌ Redis operation failed:', {
        message: redisError.message,
        name: redisError.name,
        stack: redisError.stack
      });
      
      return res.status(500).json({
        error: 'Redis connection failed',
        details: redisError.message
      });
    }
    
    if (!requestData) {
      console.log(`❌ Request not found: ${id}`);
      return res.status(404).json({
        error: 'Request not found',
        requestId: id,
        message: 'The specified request could not be found in the database'
      });
    }
    
    console.log('✅ Successfully retrieved request data');
    console.log('📊 Data structure:', {
      id: requestData.id,
      hasAmountMode: 'amount_mode' in requestData,
      amountMode: requestData.amount_mode,
      hasAmountOrRule: 'amount_or_rule_json' in requestData,
      allKeys: Object.keys(requestData)
    });
    
    return res.status(200).json({
      request: requestData
    });
    
  } catch (error) {
    console.error('💥 Unexpected error:', {
      message: error.message,
      name: error.name,
      stack: error.stack
    });
    
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.query;
    
    console.log(`🔍 Looking for request: ${id}`);
    
    // 🚨 環境変数とKV設定のデバッグ
    console.log('🚨 Environment check:', {
      hasUpstashUrl: !!process.env.UPSTASH_REDIS_REST_URL,
      hasUpstashToken: !!process.env.UPSTASH_REDIS_REST_TOKEN,
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV
    });
    
    // Direct retrieval from Vercel KV
    let requestData = null;
    
    try {
      console.log('🚨 Attempting KV connection...');
      const cacheKey = `request:${id}`;
      const requestDataRaw = await redis.get(cacheKey);
      requestData = requestDataRaw ? JSON.parse(requestDataRaw) : null;
      
      console.log(`🔍 KV check for ${id}:`, { 
        found: !!requestData,
        dataType: typeof requestData,
        cacheKey: cacheKey
      });
      
      if (requestData) {
        console.log('🚨 Found data keys:', Object.keys(requestData));
      }
    } catch (error) {
      console.error('🚨 KV get error details:', {
        message: error.message,
        name: error.name,
        stack: error.stack
      });
    }
    
    if (!requestData) {
      console.log(`Request not found in KV: ${id}`);
      return res.status(404).json({
        error: 'Request not found',
        statusCode: 404
      });
    }
    
    console.log(`✅ Found request in KV: ${id}, status: ${requestData.status}`);
    
    // デバッグ: レスポンスデータの詳細ログ
    console.log(`🔍 API レスポンスデバッグ:`, {
      id: requestData.id,
      amount_mode: requestData.amount_mode,
      amount_or_rule_json: requestData.amount_or_rule_json,
      hasAmountMode: 'amount_mode' in requestData,
      hasAmountOrRule: 'amount_or_rule_json' in requestData,
      allKeys: Object.keys(requestData)
    });
    
    return res.status(200).json({
      request: requestData
    });
    
  } catch (error) {
    console.error('Failed to get request by ID:', error);
    return res.status(500).json({
      error: 'Failed to get request',
      statusCode: 500
    });
  }
}