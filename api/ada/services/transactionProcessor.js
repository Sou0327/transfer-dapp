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
  const witnessSet = cbor.decode(witnessSetBuffer);
  
  const witnessValidation = validateWitnessSetStructure(witnessSet);
  if (!witnessValidation.valid) {
    throw new Error(`Invalid witness_set structure: ${witnessValidation.errors.join(', ')}`);
  }
  
  console.log('✅ Component validation passed:', {
    txBodyKeys: Array.from(txBody.keys()),
    witnessSetKeys: Array.from(witnessSet.keys()),
    vkeyWitnessCount: witnessValidation.vkeyCount
  });
  
  // Conway Era完全トランザクションの構築
  const completeTx = [
    txBody,      // transaction_body (Map)
    witnessSet,  // transaction_witness_set (Map)  
    true,        // is_valid (boolean) - REQUIRED for Conway Era
    null         // auxiliary_data - REQUIRED position even if null
  ];
  
  // 自己検証
  await performSelfValidation(completeTx);
  
  // CBOR エンコード
  const completeTxBuffer = cbor.encode(completeTx);
  const signedTxHex = completeTxBuffer.toString('hex');
  
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