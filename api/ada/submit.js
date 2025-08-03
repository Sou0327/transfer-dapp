// Vercel Serverless Function: POST /api/ada/submit
// 署名済みトランザクションをCardanoネットワークに送信

import { Redis } from '@upstash/redis';
import { spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

// Redis インスタンスを安全に初期化
let redis = null;

const initRedis = () => {
  if (!redis && process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      redis = new Redis({
        url: process.env.KV_REST_API_URL,
        token: process.env.KV_REST_API_TOKEN,
      });
      console.log('✅ Redis client initialized for submit');
    } catch (error) {
      console.error('❌ Redis initialization failed for submit:', error);
      redis = null;
    }
  }
  return redis;
};

// Cardano CLI コマンド実行
const executeCardanoCli = (args, input = null) => {
  return new Promise((resolve, reject) => {
    console.log('🔧 Executing cardano-cli with args:', args);
    
    const cardanoCliPath = process.env.CARDANO_CLI_PATH || 'cardano-cli';
    const child = spawn(cardanoCliPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CARDANO_NODE_SOCKET_PATH: process.env.CARDANO_NODE_SOCKET_PATH || '/tmp/cardano-node.socket'
      }
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    if (input) {
      child.stdin.write(input);
      child.stdin.end();
    }

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`cardano-cli failed with code ${code}: ${stderr}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
};

export default async function handler(req, res) {
  console.log('=== 🚀 Submit Transaction API Debug Start ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  
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
    const { requestId } = req.body;
    
    if (!requestId) {
      return res.status(400).json({
        error: 'Request ID is required'
      });
    }

    console.log(`📤 Submitting transaction for request: ${requestId}`);

    // 署名済みトランザクションデータを取得
    const signedTxKey = `signed-tx:${requestId}`;
    const signedTxDataRaw = await redisClient.get(signedTxKey);
    
    if (!signedTxDataRaw) {
      console.log(`❌ No signed transaction found for: ${requestId}`);
      return res.status(404).json({
        error: 'Signed transaction not found'
      });
    }

    const signedTxData = JSON.parse(signedTxDataRaw);
    console.log('📋 Found signed transaction data:', {
      requestId: signedTxData.requestId,
      status: signedTxData.status,
      hasSignedTx: !!signedTxData.signedTx
    });

    if (!signedTxData.signedTx) {
      return res.status(400).json({
        error: 'No signed transaction data available'
      });
    }

    // 署名済みトランザクションをファイルに保存
    const tempDir = '/tmp';
    const txFileName = `signed-tx-${requestId}-${Date.now()}.signed`;
    const txFilePath = path.join(tempDir, txFileName);
    
    console.log(`💾 Writing signed transaction to: ${txFilePath}`);
    
    // HEX文字列として保存
    let signedTxHex;
    if (typeof signedTxData.signedTx === 'string') {
      signedTxHex = signedTxData.signedTx;
    } else {
      // CBORオブジェクトの場合、HEX変換
      signedTxHex = JSON.stringify(signedTxData.signedTx);
    }
    
    await fs.writeFile(txFilePath, signedTxHex);

    try {
      // Cardano CLIでトランザクションを送信
      const submitArgs = [
        'transaction', 'submit',
        '--mainnet',
        '--tx-file', txFilePath
      ];

      console.log('🚀 Submitting transaction to Cardano network...');
      const submitOutput = await executeCardanoCli(submitArgs);
      console.log('✅ Transaction submitted successfully:', submitOutput);

      // トランザクションハッシュを抽出（通常は出力に含まれる）
      let txHash = null;
      try {
        // cardano-cli transaction txid でハッシュを取得
        const txidArgs = [
          'transaction', 'txid',
          '--tx-file', txFilePath
        ];
        txHash = await executeCardanoCli(txidArgs);
        console.log('📝 Transaction hash:', txHash);
      } catch (error) {
        console.warn('⚠️ Failed to get transaction hash:', error.message);
      }

      // Redis内のデータを更新
      const updatedSignedTxData = {
        ...signedTxData,
        status: 'submitted',
        submittedAt: new Date().toISOString(),
        txHash: txHash || 'unknown',
        submitOutput: submitOutput
      };

      await redisClient.set(signedTxKey, JSON.stringify(updatedSignedTxData));
      console.log('✅ Updated signed transaction data in Redis');

      // リクエストステータスを更新
      const requestKeyFormats = [
        requestId,
        `request:${requestId}`,
      ];
      
      for (const key of requestKeyFormats) {
        const requestDataRaw = await redisClient.get(key);
        if (requestDataRaw) {
          const requestData = JSON.parse(requestDataRaw);
          const updatedRequest = {
            ...requestData,
            status: 'SUBMITTED',
            submittedAt: new Date().toISOString(),
            txHash: txHash || 'unknown',
            updated_at: new Date().toISOString()
          };
          
          await redisClient.set(key, JSON.stringify(updatedRequest));
          console.log(`✅ Request status updated to SUBMITTED for: ${requestId}`);
          break;
        }
      }

      // 一時ファイルを削除
      try {
        await fs.unlink(txFilePath);
        console.log('🗑️ Temporary file cleaned up');
      } catch (error) {
        console.warn('⚠️ Failed to cleanup temporary file:', error.message);
      }

      return res.status(200).json({
        success: true,
        message: 'トランザクションが正常に送信されました',
        requestId,
        txHash: txHash || 'unknown',
        timestamp: new Date().toISOString()
      });

    } catch (submitError) {
      console.error('💥 Transaction submission failed:', submitError);
      
      // エラー情報をRedisに保存
      const errorSignedTxData = {
        ...signedTxData,
        status: 'submit_failed',
        submitError: submitError.message,
        failedAt: new Date().toISOString()
      };

      await redisClient.set(signedTxKey, JSON.stringify(errorSignedTxData));

      // 一時ファイルを削除
      try {
        await fs.unlink(txFilePath);
      } catch (error) {
        // ignore cleanup errors
      }

      return res.status(500).json({
        error: 'Transaction submission failed',
        details: submitError.message,
        requestId
      });
    }

  } catch (error) {
    console.error('💥 Submit API Error:', {
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