// Vercel Serverless Function: POST /api/ada/submit
// 署名済みトランザクションをCardanoネットワークに送信

import { Redis } from '@upstash/redis';
import { spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import cbor from 'cbor';

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

    // Handle both string and object responses from Redis
    let signedTxData;
    if (typeof signedTxDataRaw === 'string') {
      signedTxData = JSON.parse(signedTxDataRaw);
    } else if (typeof signedTxDataRaw === 'object' && signedTxDataRaw !== null) {
      signedTxData = signedTxDataRaw;
    } else {
      console.error('❌ Unexpected data type from Redis:', typeof signedTxDataRaw);
      return res.status(500).json({
        error: 'Invalid data format in database'
      });
    }
    console.log('📋 Found signed transaction data:', {
      requestId: signedTxData.requestId,
      status: signedTxData.status,
      hasSignedTx: !!signedTxData.signedTx
    });
    
    // Also fetch the original request data to get TTL information
    console.log('🔍 Fetching original request data...');
    const requestKeyFormats = [
      requestId,
      `request:${requestId}`
    ];
    
    let requestData = null;
    for (const key of requestKeyFormats) {
      const requestDataRaw = await redisClient.get(key);
      if (requestDataRaw) {
        if (typeof requestDataRaw === 'string') {
          requestData = JSON.parse(requestDataRaw);
        } else {
          requestData = requestDataRaw;
        }
        console.log(`✅ Found request data with key: ${key}`);
        console.log('📋 Request data:', {
          id: requestData.id,
          ttl_slot: requestData.ttl_slot,
          ttl_absolute: requestData.ttl_absolute,
          created_at: requestData.created_at,
          amount_mode: requestData.amount_mode
        });
        break;
      }
    }
    
    if (!requestData) {
      console.warn('⚠️ Could not find original request data');
    }

    if (!signedTxData.signedTx) {
      return res.status(400).json({
        error: 'No signed transaction data available'
      });
    }

    // Process signed transaction data for Blockfrost submission
    
    // 署名済みトランザクションの処理
    let signedTxHex;
    
    console.log('🔍 Signed transaction data type:', typeof signedTxData.signedTx);
    console.log('🔍 Signed transaction data:', signedTxData.signedTx);
    console.log('🔍 Metadata available:', !!signedTxData.metadata);
    console.log('🔍 TxBody in metadata:', !!signedTxData.metadata?.txBody);
    
    // 証人セット（witnessSet）かどうかを判定し、完全なトランザクションを構築
    if (typeof signedTxData.signedTx === 'string') {
      // First, try using signedTx as complete transaction (Yoroi may provide complete tx)
      console.log('🧪 Testing if signedTx is already a complete transaction...');
      console.log('🔍 SignedTx starts with:', signedTxData.signedTx.substring(0, 20));
      
      // Yoroi provides witness set, we need to construct complete transaction
      if (signedTxData.metadata?.txBody) {
        console.log('🔧 Constructing complete transaction using CBOR library...');
        
        try {
          const txBodyHex = signedTxData.metadata.txBody;
          const witnessSetHex = signedTxData.signedTx;
          
          console.log('📊 CBOR Construction:', {
            txBodyHex: txBodyHex.substring(0, 20) + '...',
            witnessSetHex: witnessSetHex.substring(0, 20) + '...',
            txBodyLength: txBodyHex.length,
            witnessSetLength: witnessSetHex.length
          });
          
          // Decode CBOR components
          const txBodyBuffer = Buffer.from(txBodyHex, 'hex');
          const witnessSetBuffer = Buffer.from(witnessSetHex, 'hex');
          
          const txBody = cbor.decode(txBodyBuffer);
          const witnessSet = cbor.decode(witnessSetBuffer);
          
          console.log('✅ Successfully decoded CBOR components');
          console.log('🔍 TxBody structure:', {
            isArray: Array.isArray(txBody),
            length: Array.isArray(txBody) ? txBody.length : 'not array',
            firstElement: Array.isArray(txBody) ? typeof txBody[0] : 'not array'
          });
          console.log('🔍 WitnessSet structure:', {
            isMap: typeof witnessSet === 'object' && !Array.isArray(witnessSet),
            keys: typeof witnessSet === 'object' ? Object.keys(witnessSet) : 'not object'
          });
          
          // Detailed witnessSet analysis  
          if (witnessSet && typeof witnessSet === 'object') {
            console.log('🔑 WitnessSet detailed analysis:');
            if (Array.isArray(witnessSet)) {
              console.log('  WitnessSet is array format');
            } else if (witnessSet instanceof Map) {
              console.log('  WitnessSet is a Map with keys:', Array.from(witnessSet.keys()));
            } else {
              console.log('  WitnessSet is object with keys:', Object.keys(witnessSet));
              // Check for numbered keys (0, 1, 2, etc.)
              if (witnessSet[0] !== undefined) {
                console.log('  Has key 0 (vkey witnesses):', {
                  type: typeof witnessSet[0],
                  isArray: Array.isArray(witnessSet[0]),
                  length: Array.isArray(witnessSet[0]) ? witnessSet[0].length : 'not array'
                });
                if (Array.isArray(witnessSet[0])) {
                  witnessSet[0].forEach((witness, idx) => {
                    console.log(`    VKey witness ${idx}:`, {
                      hasVkey: !!witness[0],
                      hasSig: !!witness[1],
                      vkeyLength: witness[0] ? witness[0].length : 0,
                      sigLength: witness[1] ? witness[1].length : 0
                    });
                  });
                }
              }
            }
          }
          
          // Check if txBody is already a complete transaction (4-element array)
          // Additional debugging for txBody
          if (Array.isArray(txBody)) {
            console.log('📋 TxBody elements:');
            txBody.forEach((element, index) => {
              console.log(`  [${index}]:`, {
                type: typeof element,
                isArray: Array.isArray(element),
                length: Array.isArray(element) ? element.length : undefined,
                value: index === 3 ? element : undefined // Show TTL value (index 3)
              });
            });
          }
          
          // IMPORTANT: Always construct complete transaction from body + witness set
          // Transaction body (4 elements: inputs, outputs, fee, ttl) is NOT a complete transaction
          if (false) {
            console.log('🎯 TxBody is already a complete transaction! Using it directly.');
            signedTxHex = txBodyHex;  // Use the complete transaction as-is
          } else {
            console.log('🔧 Constructing complete transaction from components...');
            
            // Fix TTL in transaction body if needed
            let fixedTxBody = txBody;
            
            // 🚨 EMERGENCY TTL FIX: Prevent CSL BigNum overflow
            if (requestData && requestData.ttl_slot && requestData.ttl_slot > 0) {
              console.log('🔧 Checking TTL for potential overflow...');
              console.log('Original TTL in txBody:', txBody[3]);
              console.log('Request TTL slot:', requestData.ttl_slot);
              
              // Check if TTL is too large (CSL BigNum overflow threshold ~2^53)
              const TTL_OVERFLOW_THRESHOLD = 100000000; // ~100M slots (safe threshold)
              let safeTtl = requestData.ttl_slot;
              
              if (requestData.ttl_slot > TTL_OVERFLOW_THRESHOLD) {
                // Use current slot + 2 hours as safe alternative
                const currentSlot = Math.floor(Date.now() / 1000) - 1596059091 + 4492800; // Rough current slot
                safeTtl = currentSlot + 7200; // +2 hours
                console.log('🚨 EMERGENCY: TTL too large, using safe value:', safeTtl);
                console.log('🚨 Original request TTL was:', requestData.ttl_slot, '(would cause overflow)');
              }
              
              // Handle both array and map txBody formats
              if (Array.isArray(txBody)) {
                // Legacy array format [inputs, outputs, fee, ttl]
                fixedTxBody = [
                  txBody[0], // inputs
                  txBody[1], // outputs  
                  txBody[2], // fee
                  safeTtl    // safe TTL
                ];
                console.log('✅ TTL fixed in array-format transaction body');
              } else if (typeof txBody === 'object' && txBody !== null) {
                // CBOR Map format (numeric keys: 0=inputs, 1=outputs, 2=fee, 3=ttl)
                if (txBody instanceof Map) {
                  fixedTxBody = new Map(txBody);
                  fixedTxBody.set(3, safeTtl);
                } else {
                  // Plain object with numeric keys
                  fixedTxBody = { ...txBody };
                  fixedTxBody[3] = safeTtl;
                }
                console.log('✅ TTL fixed in map-format transaction body');
              }
            }
            
            // 🏗️ Construct Conway Era transaction: [transaction_body, transaction_witness_set, is_valid, auxiliary_data]
            // Based on research: Conway Era MUST have exactly 4 elements
            
            // Ensure witness set is properly structured as CBOR map
            let processedWitnessSet = witnessSet;
            if (witnessSet && typeof witnessSet === 'object') {
              // Convert plain object to Map if needed for CBOR encoding
              if (!(witnessSet instanceof Map) && !Array.isArray(witnessSet)) {
                console.log('🔧 Converting witness set object to Map for CBOR compatibility');
                processedWitnessSet = new Map();
                Object.keys(witnessSet).forEach(key => {
                  const numKey = parseInt(key, 10);
                  if (!isNaN(numKey)) {
                    processedWitnessSet.set(numKey, witnessSet[key]);
                  }
                });
              }
              console.log('✅ Witness set processed for Conway Era format');
            }
            
            // Construct the complete Conway Era transaction
            const completeTx = [
              fixedTxBody,           // transaction_body (CBOR map with numeric keys)
              processedWitnessSet,   // transaction_witness_set (CBOR map)
              true,                  // is_valid (boolean) - REQUIRED for Conway Era
              null                   // auxiliary_data - REQUIRED position even if null
            ];
            
            console.log('🏗️ Conway Era transaction structure:', {
              bodyType: Array.isArray(fixedTxBody) ? 'array' : 'map',
              witnessType: processedWitnessSet instanceof Map ? 'Map' : typeof processedWitnessSet,
              isValidFlag: true,
              auxiliaryData: null,
              totalElements: completeTx.length
            });
            
            
            // 🧪 Pre-encoding validation based on research findings
            console.log('🧪 Pre-encoding Conway Era transaction validation:');
            
            // Validate transaction structure
            if (completeTx.length !== 4) {
              throw new Error(`Conway Era requires exactly 4 elements, got ${completeTx.length}`);
            }
            
            // Validate body structure
            const bodyValidation = {
              isPresent: !!completeTx[0],
              type: Array.isArray(completeTx[0]) ? 'array' : typeof completeTx[0],
              hasElements: Array.isArray(completeTx[0]) ? completeTx[0].length > 0 : Object.keys(completeTx[0] || {}).length > 0
            };
            
            // Validate witness set
            const witnessValidation = {
              isPresent: !!completeTx[1],
              type: completeTx[1] instanceof Map ? 'Map' : (Array.isArray(completeTx[1]) ? 'array' : typeof completeTx[1]),
              hasVkeyWitnesses: false
            };
            
            if (completeTx[1]) {
              if (completeTx[1] instanceof Map) {
                witnessValidation.hasVkeyWitnesses = completeTx[1].has(0) && Array.isArray(completeTx[1].get(0));
              } else if (typeof completeTx[1] === 'object') {
                witnessValidation.hasVkeyWitnesses = Array.isArray(completeTx[1][0]);
              }
            }
            
            console.log('📋 Conway Era validation results:', {
              totalElements: completeTx.length,
              body: bodyValidation,
              witnessSet: witnessValidation,
              isValid: completeTx[2] === true,
              auxiliaryData: completeTx[3] === null ? 'null' : typeof completeTx[3]
            });
            
            // Perform CBOR encoding with enhanced error handling
            try {
              const completeTxBuffer = cbor.encode(completeTx);
              signedTxHex = completeTxBuffer.toString('hex');
              
              console.log('✅ Conway Era transaction encoded successfully');
              console.log('📊 CBOR encoding results:', {
                originalStructure: '4-element array',
                cborHexLength: signedTxHex.length,
                cborPrefix: signedTxHex.substring(0, 10) + '...',
                expectedPrefix: '84' // CBOR array of 4 elements
              });
              
              // Verify CBOR starts with correct array indicator
              if (!signedTxHex.startsWith('84')) {
                console.warn('⚠️ CBOR does not start with 84 (4-element array), got:', signedTxHex.substring(0, 2));
              }
              
            } catch (encodingError) {
              console.error('❌ CBOR encoding failed:', encodingError);
              console.error('🔍 Problematic transaction structure:', {
                bodyType: typeof completeTx[0],
                witnessType: typeof completeTx[1],
                isValidType: typeof completeTx[2],
                auxDataType: typeof completeTx[3]
              });
              throw new Error(`CBOR encoding failed: ${encodingError.message}`);
            }
          }
          
          console.log('✅ Complete transaction constructed with CBOR library');
          console.log('📊 Complete transaction length:', signedTxHex.length);
          
        } catch (cborError) {
          console.error('❌ CBOR construction failed:', cborError);
          // Fallback to direct usage
          signedTxHex = signedTxData.signedTx;
          console.log('⚠️ Falling back to direct signedTx usage');
        }
      } else {
        // No txBody metadata, use signedTx as-is
        signedTxHex = signedTxData.signedTx;
        console.log('✅ Using signedTx directly (no txBody metadata)');
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
    
    // Use Blockfrost API instead of cardano-cli for Vercel environment
    console.log('🚀 Submitting transaction to Cardano network via Blockfrost API...');
    
    let txHash = null;
    let submitOutput = '';
    
    try {
      // Submit transaction using Blockfrost API
      const blockfrostUrl = 'https://cardano-mainnet.blockfrost.io/api/v0/tx/submit';
      const blockfrostApiKey = process.env.BLOCKFROST_API_KEY;
      
      if (!blockfrostApiKey) {
        throw new Error('BLOCKFROST_API_KEY environment variable is not set');
      }
      
      console.log('📡 Sending transaction to Blockfrost:', {
        url: blockfrostUrl,
        txHexLength: signedTxHex.length,
        hasApiKey: !!blockfrostApiKey
      });
      
      const response = await fetch(blockfrostUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/cbor',
          'project_id': blockfrostApiKey,
        },
        body: Buffer.from(signedTxHex, 'hex'),
      });
      
      console.log('📡 Blockfrost response status:', response.status);
      
      if (response.ok) {
        txHash = await response.text();
        submitOutput = `Transaction submitted successfully via Blockfrost. Hash: ${txHash}`;
        console.log('✅ Transaction submitted successfully:', submitOutput);
      } else {
        const errorText = await response.text();
        console.error('❌ Blockfrost submission failed:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        });
        
        // Analyze error for missing key witness
        if (errorText.includes('MissingVKeyWitnessesUTXOW')) {
          console.log('🔍 Analyzing missing witness error...');
          const keyHashMatch = errorText.match(/unKeyHash = \"([a-f0-9]+)\"/);
          if (keyHashMatch) {
            const missingKeyHash = keyHashMatch[1];
            console.error(`❌ Missing signature for key hash: ${missingKeyHash}`);
            
            // Analyze transaction to identify the missing key
            try {
              const analyzeTxBody = signedTxData.metadata?.txBody || txBodyHex;
              if (analyzeTxBody) {
                const txBodyDecoded = cbor.decode(Buffer.from(analyzeTxBody, 'hex'));
                console.log('📋 Transaction analysis:', {
                  inputCount: txBodyDecoded[0] ? txBodyDecoded[0].length : 0,
                  outputCount: txBodyDecoded[1] ? txBodyDecoded[1].length : 0,
                  fee: txBodyDecoded[2],
                  ttl: txBodyDecoded[3]
                });
              }
              
              // Analyze witness set
              const analyzeWitnessSet = witnessSetHex || signedTxData.signedTx;
              if (analyzeWitnessSet && typeof analyzeWitnessSet === 'string') {
                const witnessSetDecoded = cbor.decode(Buffer.from(analyzeWitnessSet, 'hex'));
                console.log('🔑 Witness set analysis:', {
                  hasVkeys: !!witnessSetDecoded[0],
                  vkeyCount: witnessSetDecoded[0] ? witnessSetDecoded[0].length : 0
                });
              }
            } catch (debugError) {
              console.error('❌ Debug analysis failed:', debugError.message);
            }
          }
        }
        
        // Analyze OutsideValidityIntervalUTxO error
        if (errorText.includes('OutsideValidityIntervalUTxO')) {
          console.log('🔍 Analyzing TTL error...');
          // Extract slot numbers from error message
          const ttlMatch = errorText.match(/SlotNo 0/);
          const currentSlotMatch = errorText.match(/SlotNo ([0-9]+)\)/);
          if (ttlMatch && currentSlotMatch) {
            console.error('❌ TTL Error: Transaction TTL is 0, current slot is', currentSlotMatch[1]);
          }
        }
        
        throw new Error(`Blockfrost API error (${response.status}): ${errorText}`);
      }
      
      // Redis内のデータを更新（成功時のみ）
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

      // No file cleanup needed for Blockfrost API submission

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

      // No file cleanup needed for Blockfrost API submission

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