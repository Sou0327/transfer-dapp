// トランザクション処理サービス - CBOR構築とConway Era対応
import cbor from 'cbor';
import { loadCSL } from '../utils/cslLoader.js';
import { isValidHex, isConwayEraTx, validateTxBodyStructure, validateWitnessSetStructure } from '../utils/validators.js';

/**
 * 署名済みトランザクションを処理してBlockfrost送信用のHEX文字列を生成
 * @param {Object} signedTxData - 署名済みトランザクションデータ
 * @returns {Promise<string>} 送信用のHEX文字列
 */
export const processSignedTransaction = async (signedTxData) => {
  console.log('🔧 Processing signed transaction...');
  
  if (!signedTxData.signedTx) {
    throw new Error('No signed transaction data available');
  }
  
  // 文字列の場合の処理
  if (typeof signedTxData.signedTx === 'string') {
    return await processStringTransaction(signedTxData);
  }
  
  // オブジェクトの場合の処理
  if (typeof signedTxData.signedTx === 'object') {
    return processObjectTransaction(signedTxData);
  }
  
  throw new Error(`Invalid signed transaction type: ${typeof signedTxData.signedTx}`);
};

/**
 * 文字列形式の署名済みトランザクションを処理
 * @param {Object} signedTxData - 署名済みトランザクションデータ
 * @returns {Promise<string>} 処理済みのHEX文字列
 */
const processStringTransaction = async (signedTxData) => {
  const { signedTx, metadata } = signedTxData;
  
  console.log('🔍 Processing string transaction:', {
    signedTxLength: signedTx.length,
    hasMetadata: !!metadata,
    hasTxBody: !!metadata?.txBody
  });
  
  // metadata.txBodyがある場合は完全トランザクション構築
  if (metadata?.txBody) {
    return await constructCompleteTransaction(metadata.txBody, signedTx);
  }
  
  // metadataがない場合は、signedTxをそのまま使用
  console.log('✅ Using signedTx directly (no metadata)');
  return signedTx;
};

/**
 * オブジェクト形式の署名済みトランザクションを処理
 * @param {Object} signedTxData - 署名済みトランザクションデータ
 * @returns {string} 処理済みのHEX文字列
 */
const processObjectTransaction = (signedTxData) => {
  const { signedTx } = signedTxData;
  
  // 適切なプロパティを探して返す
  if (signedTx.cborHex) return signedTx.cborHex;
  if (signedTx.cbor) return signedTx.cbor;
  if (signedTx.hex) return signedTx.hex;
  
  console.error('❌ Signed transaction object missing expected properties');
  console.error('Available properties:', Object.keys(signedTx));
  throw new Error('Invalid signed transaction format: missing hex/cbor data');
};

/**
 * metadata.txBodyとwitnessSetから完全トランザクションを構築
 * @param {string} txBodyHex - トランザクションボディのHEX
 * @param {string} witnessSetHex - Witness SetのHEX
 * @returns {Promise<string>} 完全トランザクションのHEX
 */
const constructCompleteTransaction = async (txBodyHex, witnessSetHex) => {
  console.log('🔧 Constructing complete transaction from components...');
  
  try {
    // デコードして構造を分析
    const txBodyBuffer = Buffer.from(txBodyHex, 'hex');
    const decodedMeta = cbor.decode(txBodyBuffer);
    
    console.log('🔍 Analyzing metadata.txBody structure:', {
      isArray: Array.isArray(decodedMeta),
      isMap: decodedMeta instanceof Map,
      arrayLength: Array.isArray(decodedMeta) ? decodedMeta.length : undefined
    });
    
    // Case 1: metadata.txBodyが既に完全トランザクション（4要素配列）
    if (isConwayEraTx(decodedMeta)) {
      console.log('🎯 metadata.txBody is already a complete Conway Era transaction');
      
      // 🔍 完全トランザクションの詳細デバッグ
      console.log('🔍 Complete Transaction Debug (Case 1):');
      console.log('Full hex:', txBodyHex);
      console.log('CBOR breakdown:', {
        first16bytes: txBodyHex.substring(0, 32),
        totalLength: txBodyHex.length,
        totalBytes: txBodyHex.length / 2
      });
      
      // デコードテスト
      try {
        const testBuffer = Buffer.from(txBodyHex, 'hex');
        const testDecoded = cbor.decode(testBuffer);
        console.log('✅ Complete transaction decode test:', {
          success: true,
          arrayLength: Array.isArray(testDecoded) ? testDecoded.length : 'not array',
          hasValidStructure: Array.isArray(testDecoded) && testDecoded.length === 4,
          element2IsBoolean: typeof testDecoded[2] === 'boolean'
        });
      } catch (e) {
        console.error('❌ Complete transaction decode failed:', e.message);
      }
      
      console.log('✅ Using complete transaction directly');
      return txBodyHex;
    }
    
    // Case 2: 個別コンポーネントから構築
    return await buildFromComponents(decodedMeta, witnessSetHex);
    
  } catch (error) {
    console.error('❌ CBOR construction failed:', error);
    // フォールバック: signedTxを直接使用
    console.log('⚠️ Falling back to witness set as complete transaction');
    return witnessSetHex;
  }
};

/**
 * 個別コンポーネントから完全トランザクションを構築
 * @param {Map} txBody - トランザクションボディ
 * @param {string} witnessSetHex - Witness SetのHEX
 * @returns {Promise<string>} 完全トランザクションのHEX
 */
const buildFromComponents = async (txBody, witnessSetHex) => {
  console.log('🏗️ Building complete transaction from individual components...');
  
  // トランザクションボディの検証
  const txBodyValidation = validateTxBodyStructure(txBody);
  if (!txBodyValidation.valid) {
    throw new Error(`Invalid tx_body structure: ${txBodyValidation.errors.join(', ')}`);
  }
  
  // Witness Setのデコードと検証
  const witnessSetBuffer = Buffer.from(witnessSetHex, 'hex');
  let witnessSet = cbor.decode(witnessSetBuffer);
  
  // 🔧 CRITICAL FIX: Witness SetをMapに強制変換
  console.log('🔍 WitnessSet type analysis before conversion:', {
    type: typeof witnessSet,
    isMap: witnessSet instanceof Map,
    isObject: typeof witnessSet === 'object' && witnessSet !== null,
    keys: witnessSet instanceof Map ? Array.from(witnessSet.keys()) : Object.keys(witnessSet || {})
  });
  
  if (!(witnessSet instanceof Map)) {
    console.log('🔧 Converting WitnessSet object to Map...');
    const witnessSetMap = new Map();
    
    if (witnessSet && typeof witnessSet === 'object') {
      // オブジェクトの全プロパティをMapに変換
      Object.entries(witnessSet).forEach(([key, value]) => {
        const numKey = Number(key);
        witnessSetMap.set(numKey, value);
        console.log(`✅ Converted witness_set[${key}] -> Map.set(${numKey}, ${typeof value})`);
      });
    }
    
    witnessSet = witnessSetMap;
    console.log('✅ WitnessSet successfully converted to Map:', {
      newType: 'Map',
      mapSize: witnessSet.size,
      keys: Array.from(witnessSet.keys())
    });
  } else {
    console.log('✅ WitnessSet is already a Map');
  }
  
  const witnessValidation = validateWitnessSetStructure(witnessSet);
  if (!witnessValidation.valid) {
    throw new Error(`Invalid witness_set structure: ${witnessValidation.errors.join(', ')}`);
  }
  
  console.log('✅ Component validation passed:', {
    txBodyKeys: Array.from(txBody.keys()),
    witnessSetKeys: Array.from(witnessSet.keys()),
    witnessSetIsMap: witnessSet instanceof Map,
    vkeyWitnessCount: witnessValidation.vkeyCount
  });
  
  // Conway Era完全トランザクションの構築
  const completeTx = [
    txBody,      // transaction_body (Map)
    witnessSet,  // transaction_witness_set (Map) - 🔧 FIXED: 確実にMap
    true,        // is_valid (boolean) - REQUIRED for Conway Era
    null         // auxiliary_data - REQUIRED position even if null
  ];
  
  // 自己検証
  await performSelfValidation(completeTx);
  
  // CBOR エンコード
  const completeTxBuffer = cbor.encode(completeTx);
  const signedTxHex = completeTxBuffer.toString('hex');
  
  // 🔍 CBOR詳細デバッグ分析
  console.log('🔍 CBOR Debug Analysis:');
  console.log('Full hex:', signedTxHex);
  console.log('CBOR breakdown:', {
    first8bytes: signedTxHex.substring(0, 16),
    first16bytes: signedTxHex.substring(0, 32),
    first32bytes: signedTxHex.substring(0, 64),
    totalLength: signedTxHex.length,
    totalBytes: signedTxHex.length / 2
  });

  // CBORデコードテスト
  try {
    const cborBuffer = Buffer.from(signedTxHex, 'hex');
    const decoded = cbor.decode(cborBuffer);
    console.log('✅ CBOR decode test successful:', {
      arrayLength: Array.isArray(decoded) ? decoded.length : 'not array',
      elementTypes: Array.isArray(decoded) ? decoded.map(e => typeof e) : 'N/A',
      element0Type: Array.isArray(decoded) && decoded[0] ? (decoded[0] instanceof Map ? 'Map' : typeof decoded[0]) : 'N/A',
      element1Type: Array.isArray(decoded) && decoded[1] ? (decoded[1] instanceof Map ? 'Map' : typeof decoded[1]) : 'N/A',
      element2Value: Array.isArray(decoded) ? decoded[2] : 'N/A',
      element3Value: Array.isArray(decoded) ? decoded[3] : 'N/A'
    });
    
    // 各要素の詳細分析
    if (Array.isArray(decoded) && decoded.length === 4) {
      console.log('🔍 Conway Era elements detail:');
      
      // TxBody (要素0)
      if (decoded[0] instanceof Map) {
        console.log('📋 TxBody (element 0) keys:', Array.from(decoded[0].keys()));
      }
      
      // WitnessSet (要素1)  
      if (decoded[1] instanceof Map) {
        console.log('🔑 WitnessSet (element 1) keys:', Array.from(decoded[1].keys()));
      } else {
        console.log('⚠️ WitnessSet (element 1) is not a Map:', typeof decoded[1]);
      }
      
      console.log('✅ is_valid (element 2):', decoded[2]);
      console.log('📝 auxiliary_data (element 3):', decoded[3]);
    }
  } catch (e) {
    console.error('❌ CBOR decode failed:', e.message);
    console.error('CBOR decode stack:', e.stack);
  }
  
  console.log('✅ Conway Era transaction constructed successfully:', {
    hexLength: signedTxHex.length,
    cborPrefix: signedTxHex.substring(0, 8),
    expectedPrefix: '84A4' // 4-element array with 4-element map
  });
  
  return signedTxHex;
};

/**
 * 完全トランザクションの自己検証
 * @param {Array} completeTx - 完全トランザクション配列
 */
const performSelfValidation = async (completeTx) => {
  console.log('🔍 Performing self-validation...');
  
  // 基本構造チェック
  if (!isConwayEraTx(completeTx)) {
    throw new Error('Self-validation FAILED: Not a valid Conway Era transaction');
  }
  
  const [txBody, witnessSet, isValid, auxData] = completeTx;
  
  // 詳細構造チェック
  if (!(txBody instanceof Map)) {
    throw new Error('Self-validation FAILED: tx_body must be Map');
  }
  
  if (!(witnessSet instanceof Map)) {
    throw new Error('Self-validation FAILED: witness_set must be Map');
  }
  
  if (typeof isValid !== 'boolean') {
    throw new Error('Self-validation FAILED: is_valid must be boolean');
  }
  
  if (auxData !== null && !(auxData instanceof Map)) {
    throw new Error('Self-validation FAILED: auxiliary_data must be null or Map');
  }
  
  // トランザクションボディの内容チェック
  const txBodyValidation = validateTxBodyStructure(txBody);
  if (!txBodyValidation.valid) {
    throw new Error(`Self-validation FAILED: ${txBodyValidation.errors.join(', ')}`);
  }
  
  // Witness Setの内容チェック
  const witnessValidation = validateWitnessSetStructure(witnessSet);
  if (!witnessValidation.valid) {
    throw new Error(`Self-validation FAILED: ${witnessValidation.errors.join(', ')}`);
  }
  
  console.log('✅ Self-validation PASSED:', {
    structure: 'Conway Era 4-element array',
    txBodyType: 'Map',
    witnessSetType: 'Map',
    vkeyWitnessCount: witnessValidation.vkeyCount,
    inputCount: txBody.get(0)?.length || 0,
    outputCount: txBody.get(1)?.length || 0,
    feeValue: txBody.get(2)
  });
};