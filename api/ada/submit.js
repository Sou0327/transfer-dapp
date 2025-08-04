// Vercel Serverless Function: POST /api/ada/submit
// 署名済みトランザクションをCardanoネットワークに送信

import { Redis } from '@upstash/redis';
import { spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import cbor from 'cbor';
// Dynamic import for CSL to reduce bundle size and Cold Start time
let CSL = null;

// 🔧 UTILITY: CSLライブラリの動的ロード
const loadCSL = async () => {
  if (!CSL) {
    try {
      CSL = await import('@emurgo/cardano-serialization-lib-nodejs');
      console.log('✅ CSL library loaded successfully');
    } catch (error) {
      console.warn('⚠️ CSL library not available:', error.message);
      console.warn('🔍 Key hash validation will be limited');
      return null;
    }
  }
  return CSL;
};

// 🔧 UTILITY: バイト配列をUint8Arrayに正規化
const toUint8Array = (bytes) => {
  if (bytes instanceof Uint8Array) return bytes;
  if (Buffer.isBuffer(bytes)) return new Uint8Array(bytes);
  if (Array.isArray(bytes)) return new Uint8Array(bytes);
  throw new Error(`Cannot convert to Uint8Array: ${typeof bytes}`);
};

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
    
    // 🔧 EXPERT FIX: スコープ修正 - デバッグ用変数を外側で宣言
    let txBodyHex;
    let witnessSetHex; 
    let isCompleteTransaction = false;
    let analyzeTxBody;
    let analyzeWitnessSet;
    
    // 📊 IMPROVED: 事後解析用変数も外側で宣言
    let currentSlot = 'unknown';
    let ttlValue = 'unknown';
    let providedKeyHashes = new Set();
    let requiredKeyHashes = new Set();
    let missingKeyHashes = new Set();
    let witnessSetFromTransaction = null;
    
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
          txBodyHex = signedTxData.metadata.txBody;
          witnessSetHex = signedTxData.signedTx;
          
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
          
          // 🔒 EXPERT RECOMMENDED: 厳密な完全トランザクション判定
          isCompleteTransaction = (
            Array.isArray(txBody) &&
            txBody.length === 4 &&
            // element[0] must be transaction body (Map with integer keys)
            txBody[0] instanceof Map &&
            // element[1] must be witness set (Map with key 0 = VKeyWitnesses array)
            txBody[1] instanceof Map && 
            // element[2] must be isValid flag (boolean)
            typeof txBody[2] === 'boolean' &&
            // element[3] must be auxiliary data (null or Map)
            (txBody[3] === null || txBody[3] instanceof Map)
          );
          
          // 🔍 EXPERT RECOMMENDED: 追加厳密検証
          if (isCompleteTransaction) {
            // Verify transaction body has expected integer keys (0,1,2,3)
            const txBodyKeys = Array.from(txBody[0].keys());
            const hasRequiredKeys = txBodyKeys.includes(0) && txBodyKeys.includes(1) && 
                                   txBodyKeys.includes(2) && txBodyKeys.includes(3);
            
            // Verify witness set structure
            const witnessSetHasVKeys = txBody[1].has(0) && Array.isArray(txBody[1].get(0));
            
            if (!hasRequiredKeys || !witnessSetHasVKeys) {
              console.log('⚠️ EXPERT VALIDATION FAILED: Structure check failed');
              console.log('  TxBody keys:', txBodyKeys);
              console.log('  Has required keys (0,1,2,3):', hasRequiredKeys);
              console.log('  WitnessSet has VKeys:', witnessSetHasVKeys);
              isCompleteTransaction = false; // 誤判定防止
            }
          }
          
          console.log('🔍 Complete Transaction Detection:', {
            isCompleteTransaction: isCompleteTransaction,
            evidence: typeof txBody[2] === 'boolean' ? 'Element[2] is boolean (isValid flag)' : 'Element[2] is not boolean',
            decision: isCompleteTransaction ? 'USE txBodyHex DIRECTLY' : 'RECONSTRUCT transaction'
          });
          
          if (isCompleteTransaction) {
            console.log('🎯 BREAKTHROUGH: txBodyHex is already a complete Conway Era transaction!');
            
            // 🎯 EXPERT RECOMMENDED: Use complete transaction as-is (TTL finalized before signing)
            console.log('✅ Using complete transaction directly (TTL finalized before signing)');
            signedTxHex = txBodyHex;  // Use the complete transaction as-is
          } else {
            console.log('🔧 Constructing complete transaction from components...');
            
            // Fix TTL in transaction body if needed
            let fixedTxBody = txBody;
            
            // 🎯 EXPERT RECOMMENDED: Use transaction body as-is (TTL finalized before signing)
            console.log('✅ Using transaction body as-is (TTL finalized before signing)');
            console.log('📋 Original transaction body TTL:', Array.isArray(txBody) ? txBody[3] : 'not array');
              
              if (Array.isArray(txBody)) {
                console.log('🔧 Converting Transaction Body from array to CBOR map format (preserving TTL)...');
                console.log('📋 Original array elements:', {
                  inputs: txBody[0] ? 'present' : 'missing',
                  outputs: txBody[1] ? 'present' : 'missing', 
                  fee: txBody[2] ? 'present' : 'missing',
                  ttl: txBody[3] ? 'present' : 'missing'
                });
                
                // Create CBOR Map: {0: inputs, 1: outputs, 2: fee, 3: ttl} - preserve original TTL
                fixedTxBody = new Map();
                fixedTxBody.set(0, txBody[0]); // inputs
                fixedTxBody.set(1, txBody[1]); // outputs
                fixedTxBody.set(2, txBody[2]); // fee
                fixedTxBody.set(3, txBody[3]); // preserve original TTL
                
                console.log('✅ Transaction Body converted to CBOR Map format');
                console.log('🗂️ Map keys:', Array.from(fixedTxBody.keys()));
                
                // 🔍 Detailed Transaction Body Map validation
                console.log('🔍 Transaction Body Map contents validation:');
                console.log('  [0] inputs:', {
                  isPresent: !!fixedTxBody.get(0),
                  type: Array.isArray(fixedTxBody.get(0)) ? 'array' : typeof fixedTxBody.get(0),
                  length: Array.isArray(fixedTxBody.get(0)) ? fixedTxBody.get(0).length : 'not array',
                  sample: Array.isArray(fixedTxBody.get(0)) && fixedTxBody.get(0).length > 0 ? 'has items' : 'empty or invalid'
                });
                console.log('  [1] outputs:', {
                  isPresent: !!fixedTxBody.get(1),
                  type: Array.isArray(fixedTxBody.get(1)) ? 'array' : typeof fixedTxBody.get(1),
                  length: Array.isArray(fixedTxBody.get(1)) ? fixedTxBody.get(1).length : 'not array'
                });
                console.log('  [2] fee:', {
                  isPresent: fixedTxBody.get(2) !== undefined,
                  type: typeof fixedTxBody.get(2),
                  value: fixedTxBody.get(2)
                });
                console.log('  [3] ttl:', {
                  isPresent: fixedTxBody.get(3) !== undefined,
                  type: typeof fixedTxBody.get(3), 
                  value: fixedTxBody.get(3)
                });
                
              } else if (typeof txBody === 'object' && txBody !== null) {
                // Already in map format, preserve as-is (including TTL)
                if (txBody instanceof Map) {
                  fixedTxBody = new Map(txBody);
                  console.log('✅ Using existing CBOR Map (preserving TTL)');
                } else {
                  // Plain object - convert to Map for CBOR encoding (preserve TTL)
                  fixedTxBody = new Map();
                  Object.keys(txBody).forEach(key => {
                    const numKey = parseInt(key, 10);
                    if (!isNaN(numKey)) {
                      fixedTxBody.set(numKey, txBody[key]);
                    }
                  });
                  console.log('✅ Object converted to CBOR Map (preserving TTL)');
                }
              } else {
                throw new Error(`Invalid Transaction Body type: ${typeof txBody}`);
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
              bodyType: fixedTxBody instanceof Map ? 'Map' : (Array.isArray(fixedTxBody) ? 'array' : typeof fixedTxBody),
              bodyKeys: fixedTxBody instanceof Map ? Array.from(fixedTxBody.keys()) : 'not a map',
              witnessType: processedWitnessSet instanceof Map ? 'Map' : typeof processedWitnessSet,
              witnessKeys: processedWitnessSet instanceof Map ? Array.from(processedWitnessSet.keys()) : 'not a map',
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
              type: completeTx[0] instanceof Map ? 'Map' : (Array.isArray(completeTx[0]) ? 'array' : typeof completeTx[0]),
              hasElements: completeTx[0] instanceof Map ? completeTx[0].size > 0 : (Array.isArray(completeTx[0]) ? completeTx[0].length > 0 : Object.keys(completeTx[0] || {}).length > 0),
              mapKeys: completeTx[0] instanceof Map ? Array.from(completeTx[0].keys()) : 'not a map'
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
                originalStructure: 'Conway Era: [Map, Map, boolean, null]',
                cborHexLength: signedTxHex.length,
                cborPrefix: signedTxHex.substring(0, 10) + '...',
                expectedPrefix: '84A4' // CBOR: 84=4-element array, A4=4-element map (txBody)
              });
              
              // Verify CBOR starts with correct Conway Era structure
              if (!signedTxHex.startsWith('84')) {
                console.warn('⚠️ CBOR does not start with 84 (4-element array), got:', signedTxHex.substring(0, 2));
              }
              if (signedTxHex.length >= 4 && !signedTxHex.startsWith('84A4')) {
                console.warn('⚠️ CBOR does not start with 84A4 (4-array + 4-map), got:', signedTxHex.substring(0, 4));
              } else if (signedTxHex.startsWith('84A4')) {
                console.log('✅ Perfect! CBOR starts with 84A4 (Conway Era format)');
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
          
          // 📊 Final transaction analysis
          if (isCompleteTransaction) {
            console.log('📊 Direct transaction usage:', {
              source: 'txBodyHex (already complete)',
              length: signedTxHex.length,
              cborPrefix: signedTxHex.substring(0, 8) + '...'
            });
          } else {
            console.log('✅ Complete transaction constructed with CBOR library');
            console.log('📊 Reconstructed transaction:', {
              source: 'CBOR library construction', 
              length: signedTxHex.length,
              cborPrefix: signedTxHex.substring(0, 8) + '...'
            });
          }
          
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
    
    // ⚙️ EXPERT RECOMMENDED: 送信前TTLバリデーション強化
    console.log('⚙️ Pre-submission validation starting...');
    
    const blockfrostApiKey = process.env.BLOCKFROST_API_KEY;
    if (!blockfrostApiKey) {
      throw new Error('BLOCKFROST_API_KEY environment variable is not set');
    }
    
    // 🔍 EXPERT RECOMMENDED: Blockfrost APIで現在スロット取得
    console.log('🔍 Getting current slot from Blockfrost...');
    const latestBlockResponse = await fetch('https://cardano-mainnet.blockfrost.io/api/v0/blocks/latest', {
      headers: { 'project_id': blockfrostApiKey }
    });
    
    if (!latestBlockResponse.ok) {
      console.warn('⚠️ Could not get current slot, proceeding without validation');
      console.warn('Blockfrost latest block error:', latestBlockResponse.status);
    } else {
      const latestBlock = await latestBlockResponse.json();
      const currentSlot = parseInt(latestBlock.slot);
      console.log('📊 Current mainnet slot:', currentSlot);
      
      // 🔍 EXPERT RECOMMENDED: トランザクションからTTL抽出して検証
      try {
        const txDecoded = cbor.decode(Buffer.from(signedTxHex, 'hex'));
        let ttlValue = null;
        
        if (Array.isArray(txDecoded) && txDecoded.length === 4) {
          // Conway Era完全トランザクション
          const txBodyFromComplete = txDecoded[0];
          if (txBodyFromComplete instanceof Map) {
            ttlValue = txBodyFromComplete.get(3);
          }
        }
        
        if (ttlValue !== null) {
          const ttlMargin = ttlValue - currentSlot;
          const marginHours = Math.floor(ttlMargin / 3600);
          
          console.log('📅 TTL Validation:', {
            currentSlot: currentSlot,
            ttlSlot: ttlValue,
            margin: ttlMargin,
            marginHours: marginHours,
            status: ttlMargin > 120 ? '✅ Valid' : '❌ Too close/expired'
          });
          
          // ⏰ IMPROVED: TTL余裕しきい値を環境変数で可変化
          const minTtlMarginSlots = parseInt(process.env.MIN_TTL_MARGIN_SLOTS) || 120; // デフォルト2分
          const warnTtlMarginSlots = parseInt(process.env.WARN_TTL_MARGIN_SLOTS) || 600; // デフォルト10分
          
          // 🚨 EXPERT RECOMMENDED: TTL余裕チェック（実運用では5-10分推奨）
          if (ttlMargin < minTtlMarginSlots) {
            throw new Error(`TTL too close to expiry. Margin: ${ttlMargin} slots (${marginHours} hours). Need at least ${minTtlMarginSlots} slots.`);
          } else if (ttlMargin < warnTtlMarginSlots) {
            console.warn('⚠️ TTL expires soon:', `${marginHours} hours remaining (${ttlMargin} slots)`);
          } else {
            console.log('✅ TTL has sufficient margin:', `${marginHours} hours remaining (${ttlMargin} slots)`);
          }
        } else {
          console.warn('⚠️ Could not extract TTL from transaction for validation');
        }
      } catch (ttlError) {
        console.warn('⚠️ TTL validation failed:', ttlError.message);
      }
    }
    
    // 🔑 EXPERT RECOMMENDED: MissingVKeyWitnesses事前検出
    console.log('🔑 Pre-submission key witness validation starting...');
    
    try {
      const txDecoded = cbor.decode(Buffer.from(signedTxHex, 'hex'));
      let txBodyFromTransaction = null;
      let witnessSetFromTransaction = null;
      
      // Extract transaction body and witness set from complete transaction
      if (Array.isArray(txDecoded) && txDecoded.length === 4) {
        // Conway Era complete transaction
        txBodyFromTransaction = txDecoded[0];
        witnessSetFromTransaction = txDecoded[1];
        console.log('✅ Extracted transaction components from Conway Era format');
      } else {
        console.warn('⚠️ Unexpected transaction format for key validation');
      }
      
      if (txBodyFromTransaction && witnessSetFromTransaction) {
        // Extract required key hashes from transaction inputs
        const requiredKeyHashes = new Set();
        
        if (txBodyFromTransaction instanceof Map && txBodyFromTransaction.has(0)) {
          const inputs = txBodyFromTransaction.get(0);
          console.log('🔍 Analyzing transaction inputs for required key hashes:', {
            inputCount: Array.isArray(inputs) ? inputs.length : 0
          });
          
          // 🎯 EXPERT RECOMMENDED: UTxO参照→address→keyhash抽出
          if (Array.isArray(inputs) && inputs.length > 0) {
            console.log('🔍 Extracting required key hashes from input UTxOs...');
            
            for (let i = 0; i < inputs.length; i++) {
              const input = inputs[i];
              
              if (Array.isArray(input) && input.length >= 2) {
                const txHashBytes = input[0];
                const outputIndex = input[1];
                
                if (txHashBytes && typeof outputIndex === 'number') {
                  const txHash = Buffer.from(txHashBytes).toString('hex');
                  console.log(`🔍 Input ${i}: txHash=${txHash.substring(0, 16)}..., index=${outputIndex}`);
                  
                  try {
                    // Blockfrost API: /txs/{hash}/utxos でUTxO情報を取得
                    const utxoResponse = await fetch(`https://cardano-mainnet.blockfrost.io/api/v0/txs/${txHash}/utxos`, {
                      headers: { 'project_id': blockfrostApiKey }
                    });
                    
                    if (utxoResponse.ok) {
                      const utxoData = await utxoResponse.json();
                      
                      if (utxoData.outputs && utxoData.outputs[outputIndex]) {
                        const output = utxoData.outputs[outputIndex];
                        const address = output.address;
                        
                        console.log(`🏠 Input ${i} address: ${address.substring(0, 20)}...`);
                        
                        try {
                          // 🔧 DYNAMIC: CSLでアドレスを解析して支払いkeyhashを抽出
                          const cslLib = await loadCSL();
                          
                          if (!cslLib) {
                            console.warn(`⚠️ Input ${i}: CSL not available, skipping key hash extraction`);
                            continue;
                          }
                          
                          const cslAddress = cslLib.Address.from_bech32(address);
                          const baseAddress = cslAddress.as_base();
                          
                          if (baseAddress) {
                            const paymentCred = baseAddress.payment_cred();
                            const keyHash = paymentCred.to_keyhash();
                            
                            if (keyHash) {
                              const keyHashHex = Buffer.from(keyHash.to_bytes()).toString('hex');
                              requiredKeyHashes.add(keyHashHex);
                              console.log(`✅ Required key hash for input ${i}: ${keyHashHex}`);
                            } else {
                              console.warn(`⚠️ Input ${i}: Payment credential is not a key hash (script?)`);
                            }
                          } else {
                            // Enterprise address や Pointer address の処理
                            const enterpriseAddress = cslAddress.as_enterprise();
                            if (enterpriseAddress) {
                              const paymentCred = enterpriseAddress.payment_cred();
                              const keyHash = paymentCred.to_keyhash();
                              
                              if (keyHash) {
                                const keyHashHex = Buffer.from(keyHash.to_bytes()).toString('hex');
                                requiredKeyHashes.add(keyHashHex);
                                console.log(`✅ Required key hash for input ${i} (enterprise): ${keyHashHex}`);
                              }
                            } else {
                              console.warn(`⚠️ Input ${i}: Unsupported address type`);
                            }
                          }
                        } catch (addressParseError) {
                          console.error(`❌ Failed to parse address for input ${i}:`, addressParseError.message);
                        }
                      } else {
                        console.warn(`⚠️ Input ${i}: Output index ${outputIndex} not found in UTxO data`);
                      }
                    } else {
                      console.warn(`⚠️ Failed to fetch UTxO data for input ${i}: ${utxoResponse.status}`);
                    }
                  } catch (utxoFetchError) {
                    console.error(`❌ UTxO fetch failed for input ${i}:`, utxoFetchError.message);
                  }
                } else {
                  console.warn(`⚠️ Invalid input structure at index ${i}`);
                }
              } else {
                console.warn(`⚠️ Input ${i} is not a valid array structure`);
              }
            }
          }
        }
        
        // Extract provided key hashes from witness set
        const providedKeyHashes = new Set();
        
        if (witnessSetFromTransaction instanceof Map && witnessSetFromTransaction.has(0)) {
          // 🔧 IMPROVED: より堅牢な完全Tx判定 - witnessSetのキー列ログ
          const witnessSetKeys = Array.from(witnessSetFromTransaction.keys());
          console.log('🔍 WitnessSet Map keys:', witnessSetKeys);
          
          // Log all witness set components for future script/redeemer support
          witnessSetKeys.forEach(key => {
            const keyName = {
              0: 'VKey witnesses',
              1: 'Native scripts', 
              2: 'Bootstrap witnesses',
              3: 'Plutus v1 scripts',
              4: 'Plutus data',
              5: 'Redeemers',
              6: 'Plutus v2 scripts',
              7: 'Plutus v3 scripts'
            }[key] || `Unknown key ${key}`;
            
            const value = witnessSetFromTransaction.get(key);
            console.log(`  [${key}] ${keyName}:`, {
              isPresent: !!value,
              type: Array.isArray(value) ? 'array' : typeof value,
              length: Array.isArray(value) ? value.length : undefined
            });
          });
          
          const vkeyWitnesses = witnessSetFromTransaction.get(0);
          
          if (Array.isArray(vkeyWitnesses)) {
            console.log('🔑 Analyzing VKey witnesses:', { count: vkeyWitnesses.length });
            
            for (let i = 0; i < vkeyWitnesses.length; i++) {
              const witness = vkeyWitnesses[i];
              
              if (Array.isArray(witness) && witness.length >= 2) {
                const publicKeyBytes = witness[0];
                const signatureBytes = witness[1];
                
                console.log(`🔍 VKey witness ${i}:`, {
                  pubKeyLength: publicKeyBytes ? publicKeyBytes.length : 0,
                  sigLength: signatureBytes ? signatureBytes.length : 0,
                  pubKeyHex: publicKeyBytes ? Buffer.from(publicKeyBytes).toString('hex') : 'missing'
                });
                
                if (publicKeyBytes && publicKeyBytes.length === 32) {
                  try {
                    // 🔧 DYNAMIC: CSLを動的ロードして key hash計算
                    const cslLib = await loadCSL();
                    
                    if (!cslLib) {
                      console.warn(`⚠️ Witness ${i}: CSL not available, skipping key hash computation`);
                      // Fallback: ログのみ、key hash計算はスキップ
                      console.log(`🔗 Key mapping ${i} (CSL unavailable):`, {
                        publicKey: Buffer.from(publicKeyBytes).toString('hex'),
                        computedHash: 'CSL_UNAVAILABLE',
                        signaturePresent: !!signatureBytes,
                        pubKeyType: typeof publicKeyBytes
                      });
                      continue;
                    }
                    
                    // 🔧 IMPROVED: witness公開鍵バイトの正規化
                    const normalizedPubKeyBytes = toUint8Array(publicKeyBytes);
                    
                    // Use CSL to compute Blake2b-224 key hash from public key
                    const publicKey = cslLib.PublicKey.from_bytes(normalizedPubKeyBytes);
                    const keyHash = publicKey.hash();
                    const keyHashHex = Buffer.from(keyHash.to_bytes()).toString('hex');
                    
                    providedKeyHashes.add(keyHashHex);
                    console.log(`✅ Computed key hash for witness ${i}:`, keyHashHex);
                    
                    // Log the mapping for debugging
                    console.log(`🔗 Key mapping ${i}:`, {
                      publicKey: Buffer.from(publicKeyBytes).toString('hex'),
                      computedHash: keyHashHex,
                      signaturePresent: !!signatureBytes,
                      pubKeyType: typeof publicKeyBytes,
                      normalizedType: normalizedPubKeyBytes.constructor.name
                    });
                    
                  } catch (cslError) {
                    console.error(`❌ CSL key hash computation failed for witness ${i}:`, cslError.message);
                    console.error(`  PublicKey type: ${typeof publicKeyBytes}, length: ${publicKeyBytes ? publicKeyBytes.length : 'null'}`);
                  }
                } else {
                  console.warn(`⚠️ Invalid public key length for witness ${i}:`, publicKeyBytes ? publicKeyBytes.length : 'missing');
                }
              } else {
                console.warn(`⚠️ Invalid witness structure at index ${i}`);
              }
            }
          } else {
            console.warn('⚠️ VKey witnesses is not an array');
          }
        } else {
          console.warn('⚠️ No VKey witnesses found in witness set');
        }
        
        // 🎯 EXPERT RECOMMENDED: required ↔ provided 照合
        const missingKeyHashes = new Set([...requiredKeyHashes].filter(hash => !providedKeyHashes.has(hash)));
        const extraKeyHashes = new Set([...providedKeyHashes].filter(hash => !requiredKeyHashes.has(hash)));
        
        console.log('📊 Key witness validation summary:', {
          requiredKeyHashes: Array.from(requiredKeyHashes),
          providedKeyHashes: Array.from(providedKeyHashes),
          missingKeyHashes: Array.from(missingKeyHashes),
          extraKeyHashes: Array.from(extraKeyHashes),
          validationResult: missingKeyHashes.size === 0 ? '✅ All required signatures present' : '❌ Missing signatures detected'
        });
        
        // 🚨 事前検証: MissingVKeyWitnesses の確実な検出
        if (missingKeyHashes.size > 0) {
          const missingHashList = Array.from(missingKeyHashes);
          console.error('❌ Pre-validation FAILED: Missing signatures for key hashes:', missingHashList);
          
          // Optional: 事前にエラーを投げてBlockfrost送信を防ぐ
          // throw new Error(`Pre-validation failed: Missing signatures for key hashes: ${missingHashList.join(', ')}`);
          
          console.warn('⚠️ Proceeding to Blockfrost submission despite missing signatures (will likely fail)');
        } else if (requiredKeyHashes.size > 0) {
          console.log('✅ All required key hashes have corresponding signatures');
        }
        
        // 🧹 IMPROVED: 既知のmissing key hashはログのみ（ハードコード除去）
        const knownProblematicKeyHash = 'ffe691911fa412e6b2718a290fcc2333d5e12039cd6b0d07f0feed63';
        if (providedKeyHashes.has(knownProblematicKeyHash)) {
          console.log('🔍 DEBUG: Previously problematic key hash is now present:', knownProblematicKeyHash);
        } else if (requiredKeyHashes.has(knownProblematicKeyHash)) {
          console.log('🔍 DEBUG: Previously problematic key hash is required but missing:', knownProblematicKeyHash);
        } else {
          console.log('🔍 DEBUG: Previously problematic key hash is not involved in this transaction:', knownProblematicKeyHash);
        }
        
      } else {
        console.warn('⚠️ Could not extract transaction components for key validation');
      }
      
    } catch (keyValidationError) {
      console.warn('⚠️ Key witness pre-validation failed:', keyValidationError.message);
      // Don't throw - let Blockfrost handle the validation
    }
    
    // Use Blockfrost API instead of cardano-cli for Vercel environment  
    console.log('🚀 Submitting transaction to Cardano network via Blockfrost API...');
    
    let txHash = null;
    let submitOutput = '';
    
    try {
      // Submit transaction using Blockfrost API
      const blockfrostUrl = 'https://cardano-mainnet.blockfrost.io/api/v0/tx/submit';
      
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
              analyzeTxBody = signedTxData.metadata?.txBody || txBodyHex;
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
              analyzeWitnessSet = witnessSetHex || signedTxData.signedTx;
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
      
      // 📊 IMPROVED: エラー情報を詳細ログ付きでRedisに保存
      const errorSignedTxData = {
        ...signedTxData,
        status: 'submit_failed',  
        submitError: submitError.message,
        failedAt: new Date().toISOString(),
        // 🔍 事後解析用の追加データ
        debugInfo: {
          latestSlotAtSubmit: currentSlot || 'unknown',
          decodedTtl: ttlValue || 'unknown', 
          ttlMargin: ttlValue && currentSlot ? (ttlValue - currentSlot) : 'unknown',
          providedKeyHashes: Array.from(providedKeyHashes || []),
          requiredKeyHashes: Array.from(requiredKeyHashes || []),
          missingKeyHashes: Array.from(missingKeyHashes || []),
          txCborPrefix: signedTxHex ? signedTxHex.substring(0, 16) : 'unknown',
          txCborLength: signedTxHex ? signedTxHex.length : 0,
          isCompleteTransaction: isCompleteTransaction || false,
          witnessSetKeys: witnessSetFromTransaction instanceof Map ? Array.from(witnessSetFromTransaction.keys()) : []
        }
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