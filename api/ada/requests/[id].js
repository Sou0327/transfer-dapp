// Vercel Serverless Function: GET /api/ada/requests/:id
// 個別リクエスト取得

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
  }
};

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
    
    // Emergency test code removed - now using actual data retrieval logic
    
    // 🚨 WORKAROUND: Call the list API to get all requests
    // then find the specific one by ID
    
    const baseUrl = req.headers.origin || 'http://localhost:4000';
    const listResponse = await fetch(`${baseUrl}/api/ada/requests`);
    
    if (!listResponse.ok) {
      console.log(`Failed to fetch requests list: ${listResponse.status}`);
      return res.status(500).json({
        error: 'Failed to fetch requests list',
        statusCode: 500
      });
    }
    
    const listData = await listResponse.json();
    const requestData = listData.requests?.find(req => req.id === id);
    
    if (!requestData) {
      console.log(`Request not found: ${id}`);
      return res.status(404).json({
        error: 'Request not found',
        statusCode: 404
      });
    }
    
    console.log(`✅ Found request: ${id}, status: ${requestData.status}`);
    
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