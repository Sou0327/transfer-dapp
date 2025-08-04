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
          
          // 🔍 CRITICAL FIX: metadata.txBodyが完全トランザクションかtx_bodyかを正しく判定
          const txBodyBuffer = Buffer.from(txBodyHex, 'hex');
          const decodedMeta = cbor.decode(txBodyBuffer);
          
          console.log('🔍 Decoded metadata.txBody analysis:', {
            isArray: Array.isArray(decodedMeta),
            isMap: decodedMeta instanceof Map,
            length: Array.isArray(decodedMeta) ? decodedMeta.length : undefined,
            mapKeys: decodedMeta instanceof Map ? Array.from(decodedMeta.keys()) : undefined,
            element2Type: Array.isArray(decodedMeta) && decodedMeta.length > 2 ? typeof decodedMeta[2] : undefined,
            element2Value: Array.isArray(decodedMeta) && decodedMeta.length > 2 ? decodedMeta[2] : undefined
          });
          
          // 🎯 EXPERT RECOMMENDED: 完全トランザクションとtx_bodyを正しく分別
          let txBody, witnessSet;
          let isMetaCompleteTransaction = false;
          
          // 🔍 DEBUG: 判定条件を詳細チェック
          console.log('🔍 Judgment conditions check:', {
            isMap: decodedMeta instanceof Map,
            isArray: Array.isArray(decodedMeta),
            arrayLength: Array.isArray(decodedMeta) ? decodedMeta.length : 'not array',
            element2Type: Array.isArray(decodedMeta) && decodedMeta.length > 2 ? typeof decodedMeta[2] : 'not accessible',
            element2Boolean: Array.isArray(decodedMeta) && decodedMeta.length > 2 ? typeof decodedMeta[2] === 'boolean' : false,
            completeCondition: Array.isArray(decodedMeta) && decodedMeta.length === 4 && typeof decodedMeta[2] === 'boolean'
          });
          
          if (decodedMeta instanceof Map) {
            // Case 1: metadata.txBody is actually a transaction body (Map with integer keys)
            console.log('✅ metadata.txBody is a proper transaction body (Map)');
            txBody = decodedMeta;
            
            // Decode witness set separately
            const witnessSetBuffer = Buffer.from(witnessSetHex, 'hex');
            witnessSet = cbor.decode(witnessSetBuffer);
            
          } else if (Array.isArray(decodedMeta) && decodedMeta.length === 4 && typeof decodedMeta[2] === 'boolean') {
            // Case 2: metadata.txBody is actually a complete transaction (4-element array)
            console.log('🎯 BREAKTHROUGH: metadata.txBody is actually a COMPLETE TRANSACTION (4-element array)!');
            console.log('  Element [0] (tx_body):', typeof decodedMeta[0], decodedMeta[0] instanceof Map ? 'Map' : 'not Map');
            console.log('  Element [1] (witness_set):', typeof decodedMeta[1], decodedMeta[1] instanceof Map ? 'Map' : 'not Map'); 
            console.log('  Element [2] (is_valid):', typeof decodedMeta[2], decodedMeta[2]);
            console.log('  Element [3] (auxiliary_data):', typeof decodedMeta[3], decodedMeta[3]);
            
            isMetaCompleteTransaction = true;
            
            // Extract components from complete transaction
            txBody = decodedMeta[0];
            witnessSet = decodedMeta[1];
            
            console.log('✅ Using complete transaction directly - no reconstruction needed');
            signedTxHex = txBodyHex;  // Use the complete transaction as-is
            
          } else {
            throw new Error(`Invalid metadata.txBody structure: ${Array.isArray(decodedMeta) ? 'array length ' + decodedMeta.length : typeof decodedMeta}`);
          }
          
          console.log('✅ New logic: CBOR components processed');
          console.log('🔍 Final TxBody structure (new logic):', {
            isMap: txBody instanceof Map,
            mapKeys: txBody instanceof Map ? Array.from(txBody.keys()) : 'not a map',
            source: isMetaCompleteTransaction ? 'extracted from complete tx' : 'separate decode'
          });
          console.log('🔍 Final WitnessSet structure (new logic):', {
            isMap: witnessSet instanceof Map,
            mapKeys: witnessSet instanceof Map ? Array.from(witnessSet.keys()) : 'not a map',
            source: isMetaCompleteTransaction ? 'extracted from complete tx' : 'separate decode'
          });
          
          // Check if txBody is already a complete transaction (4-element array)
          // 🔍 EXPERT RECOMMENDED: 最終判定ロジック統一
          isCompleteTransaction = isMetaCompleteTransaction;
          
          console.log('🔍 Complete Transaction Detection (FINAL):', {
            isCompleteTransaction: isCompleteTransaction,
            source: isMetaCompleteTransaction ? 'metadata.txBody analysis' : 'components analysis',
            decision: isCompleteTransaction ? 'USE COMPLETE TX DIRECTLY' : 'RECONSTRUCT from components'
          });
          
          if (isCompleteTransaction) {
            console.log('🎯 VERIFIED: Using complete transaction directly (no reconstruction needed)');
            console.log('✅ Complete transaction ready for submission');
            
          } else {
            console.log('🔧 Constructing complete transaction from components...');
            
            // 🔧 CRITICAL FIX: tx_body構造の型バリデーション強化
            let fixedTxBody = txBody;
            
            // 🎯 EXPERT RECOMMENDED: tx_bodyは必ずMapでなければならない
            if (!(txBody instanceof Map)) {
              console.error('❌ CRITICAL ERROR: tx_body is not a Map!', {
                actualType: typeof txBody,
                isArray: Array.isArray(txBody),
                constructor: txBody ? txBody.constructor.name : 'null'
              });
              throw new Error('Invalid transaction body: must be a Map with integer keys');
            }
            
            // 🔍 tx_body Map構造の厳密バリデーション
            console.log('🔍 Validating tx_body Map structure:');
            const requiredKeys = [0, 1, 2]; // inputs, outputs, fee (TTL is optional in Conway)
            const txBodyKeys = Array.from(txBody.keys());
            
            for (const key of requiredKeys) {
              const value = txBody.get(key);
              const keyName = {0: 'inputs', 1: 'outputs', 2: 'fee'}[key];
              
              console.log(`  [${key}] ${keyName}:`, {
                present: txBody.has(key),
                type: value ? (Array.isArray(value) ? 'array' : typeof value) : 'missing',
                length: Array.isArray(value) ? value.length : undefined,
                isValid: key === 2 ? typeof value === 'number' : Array.isArray(value)
              });
              
              // 型チェック
              if (key <= 1 && !Array.isArray(value)) {
                throw new Error(`Invalid tx_body: key ${key} (${keyName}) must be an array, got ${typeof value}`);
              }
              if (key === 2 && typeof value !== 'number') {
                throw new Error(`Invalid tx_body: key 2 (fee) must be a number, got ${typeof value}`);
              }
            }
            
            // TTL検証（オプショナル）
            if (txBody.has(3)) {
              const ttlValue = txBody.get(3);
              console.log('  [3] ttl:', {
                present: true,
                type: typeof ttlValue,
                value: ttlValue,
                isValid: typeof ttlValue === 'number'
              });
              
              if (typeof ttlValue !== 'number') {
                throw new Error(`Invalid tx_body: key 3 (ttl) must be a number, got ${typeof ttlValue}`);
              }
            }
            
            console.log('✅ tx_body structure validation passed');
            fixedTxBody = new Map(txBody); // 安全なコピー
            
            // 🔍 witness_set構造の厳密バリデーション
            let processedWitnessSet = witnessSet;
            
            if (!(witnessSet instanceof Map)) {
              console.error('❌ CRITICAL ERROR: witness_set is not a Map!', {
                actualType: typeof witnessSet,
                isArray: Array.isArray(witnessSet),
                constructor: witnessSet ? witnessSet.constructor.name : 'null'
              });
              throw new Error('Invalid witness set: must be a Map with integer keys');
            }
            
            // witness_set Map構造の検証
            console.log('🔍 Validating witness_set Map structure:');
            const witnessKeys = Array.from(witnessSet.keys());
            console.log('  Witness set keys:', witnessKeys);
            
            if (witnessSet.has(0)) {
              const vkeyWitnesses = witnessSet.get(0);
              console.log('  [0] vkey_witnesses:', {
                present: true,
                type: Array.isArray(vkeyWitnesses) ? 'array' : typeof vkeyWitnesses,
                length: Array.isArray(vkeyWitnesses) ? vkeyWitnesses.length : undefined,
                isValid: Array.isArray(vkeyWitnesses)
              });
              
              if (!Array.isArray(vkeyWitnesses)) {
                throw new Error('Invalid witness_set: key 0 (vkey_witnesses) must be an array');
              }
            } else {
              console.warn('⚠️ No VKey witnesses found in witness set');
            }
            
            console.log('✅ witness_set structure validation passed');
            processedWitnessSet = new Map(witnessSet); // 安全なコピー
            
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
              
              // 📊 EXPERT RECOMMENDED: 送信前自己検証強化（破損検知）
              console.log('🔍 Performing comprehensive self-validation before submission...');
              
              try {
                const selfValidationTx = cbor.decode(Buffer.from(signedTxHex, 'hex'));
                
                // 最上位が配列4要素
                if (!Array.isArray(selfValidationTx) || selfValidationTx.length !== 4) {
                  throw new Error(`Self-validation FAILED: Expected 4-element array, got ${Array.isArray(selfValidationTx) ? selfValidationTx.length + '-element array' : typeof selfValidationTx}`);
                }
                
                // [0]がMap、[1]がMap、[2]がboolean、[3]がnult or Map
                const txBodySelf = selfValidationTx[0];
                const witnessSetSelf = selfValidationTx[1]; 
                const isValidSelf = selfValidationTx[2];
                const auxDataSelf = selfValidationTx[3];
                
                if (!(txBodySelf instanceof Map)) {
                  throw new Error(`Self-validation FAILED: tx_body must be Map, got ${typeof txBodySelf}`);
                }
                if (!(witnessSetSelf instanceof Map)) {
                  throw new Error(`Self-validation FAILED: witness_set must be Map, got ${typeof witnessSetSelf}`);
                }
                if (typeof isValidSelf !== 'boolean') {
                  throw new Error(`Self-validation FAILED: is_valid must be boolean, got ${typeof isValidSelf}`);
                }
                if (auxDataSelf !== null && !(auxDataSelf instanceof Map)) {
                  throw new Error(`Self-validation FAILED: auxiliary_data must be null or Map, got ${typeof auxDataSelf}`);
                }
                
                // tx_body Map内部構造検証
                if (!txBodySelf.has(0) || !Array.isArray(txBodySelf.get(0))) {
                  throw new Error('Self-validation FAILED: tx_body[0] (inputs) must be array');
                }
                if (!txBodySelf.has(1) || !Array.isArray(txBodySelf.get(1))) {
                  throw new Error('Self-validation FAILED: tx_body[1] (outputs) must be array');
                }
                if (!txBodySelf.has(2) || typeof txBodySelf.get(2) !== 'number') {
                  throw new Error('Self-validation FAILED: tx_body[2] (fee) must be number');
                }
                
                // witness_set VKey検証
                if (witnessSetSelf.has(0)) {
                  const vkeyWitnessesSelf = witnessSetSelf.get(0);
                  if (!Array.isArray(vkeyWitnessesSelf)) {
                    throw new Error('Self-validation FAILED: witness_set[0] (vkey_witnesses) must be array');
                  }
                  
                  // 各witnessが [vkey 32B, sig 64B] 構造かチェック
                  for (let i = 0; i < vkeyWitnessesSelf.length; i++) {
                    const witness = vkeyWitnessesSelf[i];
                    if (!Array.isArray(witness) || witness.length !== 2) {
                      throw new Error(`Self-validation FAILED: witness[${i}] must be 2-element array [vkey, sig]`);
                    }
                    if (!witness[0] || witness[0].length !== 32) {
                      throw new Error(`Self-validation FAILED: witness[${i}] vkey must be 32 bytes`);
                    }
                    if (!witness[1] || witness[1].length !== 64) {
                      throw new Error(`Self-validation FAILED: witness[${i}] signature must be 64 bytes`);
                    }
                  }
                }
                
                console.log('✅ Self-validation PASSED: Transaction structure is valid');
                console.log('📊 Self-validation results:', {
                  topLevel: '4-element array ✓',
                  txBodyType: 'Map ✓',
                  witnessSetType: 'Map ✓',
                  isValidType: 'boolean ✓',
                  auxDataType: auxDataSelf === null ? 'null ✓' : 'Map ✓',
                  inputsCount: txBodySelf.get(0).length,
                  outputsCount: txBodySelf.get(1).length,
                  feeValue: txBodySelf.get(2),
                  vkeyWitnessCount: witnessSetSelf.has(0) ? witnessSetSelf.get(0).length : 0
                });
                
              } catch (selfValidationError) {
                console.error('❌ SELF-VALIDATION FAILED:', selfValidationError.message);
                console.error('🚫 Aborting Blockfrost submission to prevent 400 error');
                throw new Error(`Pre-submission validation failed: ${selfValidationError.message}`);
              }
              
              // CBOR prefix verification
              if (!signedTxHex.startsWith('84')) {
                throw new Error(`Invalid CBOR: Expected 4-element array (84), got: ${signedTxHex.substring(0, 2)}`);
              }
              if (signedTxHex.length >= 4 && !signedTxHex.startsWith('84A4')) {
                console.warn('⚠️ CBOR prefix unexpected:', signedTxHex.substring(0, 4), '(expected 84A4)');
              } else {
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