// Vercel Serverless Function: GET /api/ada/requests/:id
// Vercel Serverless Function: GET /api/ada/requests/:id
// 個別リクエスト取得 - Vercel KV使用

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
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