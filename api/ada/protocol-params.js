// Vercel Serverless Function: GET /api/ada/protocol-params
// プロトコルパラメータ取得

// Simple in-memory cache
const cache = new Map();

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Check cache first  
    const cacheKey = 'protocol-params';
    const cached = await CacheService.get(cacheKey);
    
    if (cached) {
      return res.status(200).json({
        ...cached,
        cached: true,
        timestamp: new Date().toISOString()
      });
    }

    // Fetch from Blockfrost API
    const blockfrostKey = process.env.BLOCKFROST_API_KEY || process.env.VITE_BLOCKFROST_API_KEY;
    if (!blockfrostKey) {
      // Return hardcoded defaults if no API key
      const defaults = {
        minFeeA: 44,
        minFeeB: 155381,
        maxTxSize: 16384,
        utxoCostPerWord: 4310,
        minUtxo: '1000000',
        poolDeposit: '500000000',
        keyDeposit: '2000000', 
        coinsPerUtxoByte: '4310',
        currentSlot: Math.floor(Date.now() / 1000),
        cached: false,
        timestamp: new Date().toISOString(),
        fallback: true
      };

      console.log('Using fallback protocol parameters (no API key)');
      return res.status(200).json(defaults);
    }

    const network = process.env.CARDANO_NETWORK || 'mainnet';
    const baseUrl = network === 'mainnet' 
      ? 'https://cardano-mainnet.blockfrost.io/api/v0'
      : 'https://cardano-preprod.blockfrost.io/api/v0';

    // Fetch protocol parameters
    const response = await fetch(`${baseUrl}/epochs/latest/parameters`, {
      headers: {
        'project_id': blockfrostKey
      }
    });

    if (!response.ok) {
      throw new Error(`Blockfrost API error: ${response.status}`);
    }

    const data = await response.json();

    // Get current slot
    const blockResponse = await fetch(`${baseUrl}/blocks/latest`, {
      headers: {
        'project_id': blockfrostKey
      }
    });

    const blockData = await blockResponse.json();
    const currentSlot = blockData.slot || 0;

    // Transform to our format
    const protocolParams = {
      minFeeA: parseInt(data.min_fee_a || '44'),
      minFeeB: parseInt(data.min_fee_b || '155381'),
      maxTxSize: parseInt(data.max_tx_size || '16384'),
      utxoCostPerWord: parseInt(data.utxo_cost_per_word || '4310'),
      minUtxo: data.min_utxo || '1000000',
      poolDeposit: data.pool_deposit || '500000000',
      keyDeposit: data.key_deposit || '2000000',
      coinsPerUtxoByte: data.coins_per_utxo_size || '4310',
      currentSlot
    };

    // Cache for 5 minutes
    await CacheService.set(cacheKey, protocolParams, 300);

    return res.status(200).json({
      ...protocolParams,
      cached: false,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Failed to get protocol parameters:', error);
    
    // Return hardcoded defaults if API fails
    const defaults = {
      minFeeA: 44,
      minFeeB: 155381,
      maxTxSize: 16384,
      utxoCostPerWord: 4310,
      minUtxo: '1000000',
      poolDeposit: '500000000',
      keyDeposit: '2000000', 
      coinsPerUtxoByte: '4310',
      currentSlot: Math.floor(Date.now() / 1000),
      cached: false,
      timestamp: new Date().toISOString(),
      fallback: true
    };

    console.log('Using fallback protocol parameters');
    return res.status(200).json(defaults);
  }
}