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
    
    // 署名済みトランザクションの処理
    let signedTxHex;
    
    console.log('🔍 Signed transaction data type:', typeof signedTxData.signedTx);
    console.log('🔍 Signed transaction data:', signedTxData.signedTx);
    console.log('🔍 Metadata available:', !!signedTxData.metadata);
    console.log('🔍 TxBody in metadata:', !!signedTxData.metadata?.txBody);
    
    // 証人セット（witnessSet）かどうかを判定し、完全なトランザクションを構築
    if (typeof signedTxData.signedTx === 'string') {
      // 既にHEX文字列の場合は、それが完全なトランザクションかwitnessSetかを判定
      if (signedTxData.metadata?.txBody) {
        // txBodyがある場合は、witnessSetなので完全なトランザクションを構築
        console.log('🔧 Constructing complete transaction from txBody + witnessSet');
        
        try {
          // Cardanoトランザクション形式: [txBody, witnessSet]
          // CBOR配列として構築
          const txBodyHex = signedTxData.metadata.txBody;
          const witnessSetHex = signedTxData.signedTx;
          
          console.log('📊 Transaction components:', {
            txBodyLength: txBodyHex.length,
            witnessSetLength: witnessSetHex.length
          });
          
          // 簡易的なCBOR配列構築（正確にはCBORライブラリを使うべき）
          // ここでは、文字列結合での簡易実装
          signedTxHex = `82${txBodyHex}${witnessSetHex}`;
          console.log('✅ Complete transaction constructed');
        } catch (error) {
          console.error('❌ Failed to construct complete transaction:', error);
          throw new Error('Failed to construct complete transaction from components');
        }
      } else {
        // txBodyがない場合は既に完全なトランザクション
        signedTxHex = signedTxData.signedTx;
        console.log('✅ Using signedTx as complete transaction');
      }
    } else if (signedTxData.signedTx && typeof signedTxData.signedTx === 'object') {
      // オブジェクトの場合、適切なプロパティを探す
      if (signedTxData.signedTx.cborHex) {
        signedTxHex = signedTxData.signedTx.cborHex;
        console.log('✅ Using cborHex property');
      } else if (signedTxData.signedTx.cbor) {
        signedTxHex = signedTxData.signedTx.cbor;
        console.log('✅ Using cbor property');
      } else if (signedTxData.signedTx.hex) {
        signedTxHex = signedTxData.signedTx.hex;
        console.log('✅ Using hex property');
      } else {
        // 適切なプロパティが見つからない場合はエラー
        console.error('❌ Signed transaction object does not contain expected properties');
        console.error('Available properties:', Object.keys(signedTxData.signedTx));
        throw new Error('Invalid signed transaction format: missing hex/cbor data');
      }
    } else {
      throw new Error(`Invalid signed transaction type: ${typeof signedTxData.signedTx}`);
    }
    
    console.log('📝 Final signedTxHex length:', signedTxHex ? signedTxHex.length : 'null');
    
    // HEX文字列の妥当性チェック
    if (!signedTxHex || !/^[0-9a-fA-F]+$/.test(signedTxHex)) {
      throw new Error('Invalid transaction hex format');
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