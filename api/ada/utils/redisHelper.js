// Redis操作ヘルパー
import { Redis } from '@upstash/redis';

let redis = null;

/**
 * Redis クライアントを安全に初期化
 * @returns {Redis|null} Redisクライアントまたはnull
 */
export const initRedis = () => {
  if (!redis && process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      redis = new Redis({
        url: process.env.KV_REST_API_URL,
        token: process.env.KV_REST_API_TOKEN,
      });
      console.log('✅ Redis client initialized');
    } catch (error) {
      console.error('❌ Redis initialization failed:', error);
      redis = null;
    }
  }
  return redis;
};

/**
 * 署名済みトランザクションデータを取得
 * @param {string} requestId - リクエストID
 * @returns {Promise<Object|null>} 署名済みトランザクションデータ
 */
export const getSignedTxData = async (requestId) => {
  const redisClient = initRedis();
  if (!redisClient) return null;
  
  const signedTxKey = `signed-tx:${requestId}`;
  const signedTxDataRaw = await redisClient.get(signedTxKey);
  
  if (!signedTxDataRaw) return null;
  
  // Handle both string and object responses from Redis
  if (typeof signedTxDataRaw === 'string') {
    return JSON.parse(signedTxDataRaw);
  } else if (typeof signedTxDataRaw === 'object' && signedTxDataRaw !== null) {
    return signedTxDataRaw;
  }
  
  throw new Error('Invalid data format in database');
};

/**
 * 元のリクエストデータを取得
 * @param {string} requestId - リクエストID
 * @returns {Promise<Object|null>} リクエストデータ
 */
export const getRequestData = async (requestId) => {
  const redisClient = initRedis();
  if (!redisClient) return null;
  
  const requestKeyFormats = [requestId, `request:${requestId}`];
  
  for (const key of requestKeyFormats) {
    const requestDataRaw = await redisClient.get(key);
    if (requestDataRaw) {
      const requestData = typeof requestDataRaw === 'string' 
        ? JSON.parse(requestDataRaw) 
        : requestDataRaw;
      
      console.log(`✅ Found request data with key: ${key}`);
      return requestData;
    }
  }
  
  return null;
};

/**
 * 署名済みトランザクションデータを更新
 * @param {string} requestId - リクエストID
 * @param {Object} updatedData - 更新するデータ
 */
export const updateSignedTxData = async (requestId, updatedData) => {
  const redisClient = initRedis();
  if (!redisClient) throw new Error('Redis client not available');
  
  const signedTxKey = `signed-tx:${requestId}`;
  await redisClient.set(signedTxKey, JSON.stringify(updatedData));
};

/**
 * リクエストステータスを更新
 * @param {string} requestId - リクエストID
 * @param {Object} updatedData - 更新するデータ
 */
export const updateRequestStatus = async (requestId, updatedData) => {
  const redisClient = initRedis();
  if (!redisClient) throw new Error('Redis client not available');
  
  const requestKeyFormats = [requestId, `request:${requestId}`];
  
  for (const key of requestKeyFormats) {
    const requestDataRaw = await redisClient.get(key);
    if (requestDataRaw) {
      await redisClient.set(key, JSON.stringify(updatedData));
      console.log(`✅ Request status updated for: ${requestId}`);
      break;
    }
  }
};