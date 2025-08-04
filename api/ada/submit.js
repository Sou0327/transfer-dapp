// Vercel Serverless Function: POST /api/ada/submit (リファクタリング版)
// 署名済みトランザクションをCardanoネットワークに送信

import { getSignedTxData, getRequestData, updateSignedTxData, updateRequestStatus } from './utils/redisHelper.js';
import { processSignedTransaction } from './services/transactionProcessor.js';
import { validateTTL, validateKeyWitnesses } from './services/transactionValidator.js';
import { submitTransaction, analyzeBlockfrostError } from './services/blockfrostClient.js';
import { isValidRequestId, isValidSignedTxData, isValidHex } from './utils/validators.js';

/**
 * メインハンドラー関数
 * @param {Object} req - HTTP リクエスト
 * @param {Object} res - HTTP レスポンス
 */
export default async function handler(req, res) {
  console.log('=== 🚀 Submit Transaction API (Refactored) ===');
  
  // CORS設定
  setCORSHeaders(res);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed - POST only' });
  }
  
  try {
    // 1. リクエストデータの取得と検証
    const { requestId } = req.body;
    
    if (!isValidRequestId(requestId)) {
      return res.status(400).json({ error: 'Request ID is required' });
    }
    
    console.log(`📤 Processing transaction submission for: ${requestId}`);
    
    // 2. 署名済みトランザクションデータの取得
    const signedTxData = await getSignedTxData(requestId);
    if (!signedTxData) {
      return res.status(404).json({ error: 'Signed transaction not found' });
    }
    
    if (!isValidSignedTxData(signedTxData)) {
      return res.status(400).json({ error: 'Invalid signed transaction data' });
    }
    
    console.log('📋 Found signed transaction:', {
      requestId: signedTxData.requestId,
      status: signedTxData.status,
      hasSignedTx: !!signedTxData.signedTx
    });
    
    // 3. 元のリクエストデータを取得（TTL情報などのため）
    const requestData = await getRequestData(requestId);
    if (requestData) {
      console.log('📋 Original request data:', {
        ttl_slot: requestData.ttl_slot,
        ttl_absolute: requestData.ttl_absolute,
        amount_mode: requestData.amount_mode
      });
    }
    
    // 4. トランザクション処理 - CBOR構築
    const signedTxHex = await processSignedTransaction(signedTxData);
    
    if (!isValidHex(signedTxHex)) {
      throw new Error('Invalid transaction hex format after processing');
    }
    
    console.log('✅ Transaction processed successfully:', {
      hexLength: signedTxHex.length,
      cborPrefix: signedTxHex.substring(0, 16)
    });
    
    // 5. 送信前バリデーション
    await performPreSubmissionValidation(signedTxHex);
    
    // 6. Blockfrost APIに送信
    const submissionResult = await submitTransaction(signedTxHex, process.env.BLOCKFROST_API_KEY);
    
    // 7. 成功時のデータベース更新
    await updateDatabaseOnSuccess(requestId, signedTxData, submissionResult);
    
    // 8. 成功レスポンス
    return res.status(200).json({
      success: true,
      message: 'トランザクションが正常に送信されました',
      requestId,
      txHash: submissionResult.txHash,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('💥 Transaction submission failed:', error);
    
    // エラー時のデータベース更新
    if (req.body?.requestId) {
      await updateDatabaseOnError(req.body.requestId, error);
    }
    
    return res.status(500).json({
      error: 'Transaction submission failed',
      details: error.message,
      requestId: req.body?.requestId
    });
  }
}

/**
 * CORS ヘッダーを設定
 * @param {Object} res - HTTP レスポンス
 */
const setCORSHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};

/**
 * 送信前バリデーションを実行
 * @param {string} signedTxHex - 署名済みトランザクションのHEX
 */
const performPreSubmissionValidation = async (signedTxHex) => {
  console.log('🔍 Performing pre-submission validation...');
  
  const blockfrostApiKey = process.env.BLOCKFROST_API_KEY;
  if (!blockfrostApiKey) {
    throw new Error('BLOCKFROST_API_KEY environment variable is not set');
  }
  
  // TTL バリデーション
  const ttlResult = await validateTTL(signedTxHex, blockfrostApiKey);
  if (!ttlResult.valid) {
    throw new Error(`TTL validation failed: ${ttlResult.errors.join(', ')}`);
  }
  
  if (ttlResult.warnings.length > 0) {
    console.warn('⚠️ TTL validation warnings:', ttlResult.warnings);
  }
  
  // Key witness バリデーション（警告のみ、エラーで止めない）
  const witnessResult = await validateKeyWitnesses(signedTxHex, blockfrostApiKey);
  if (!witnessResult.valid) {
    console.warn('⚠️ Key witness validation warnings:', witnessResult.errors);
    console.warn('Proceeding to Blockfrost submission (will likely fail with MissingVKeyWitnesses)');
  }
  
  if (witnessResult.warnings.length > 0) {
    console.warn('⚠️ Key witness validation info:', witnessResult.warnings);
  }
  
  console.log('✅ Pre-submission validation completed');
};

/**
 * 成功時のデータベース更新
 * @param {string} requestId - リクエストID
 * @param {Object} signedTxData - 元の署名済みトランザクションデータ
 * @param {Object} submissionResult - 送信結果
 */
const updateDatabaseOnSuccess = async (requestId, signedTxData, submissionResult) => {
  console.log('📝 Updating database on successful submission...');
  
  // 署名済みトランザクションデータを更新
  const updatedSignedTxData = {
    ...signedTxData,
    status: 'submitted',
    submittedAt: new Date().toISOString(),
    txHash: submissionResult.txHash,
    submitOutput: submissionResult.message
  };
  
  await updateSignedTxData(requestId, updatedSignedTxData);
  
  // リクエストステータスを更新
  const updatedRequest = {
    status: 'SUBMITTED',
    submittedAt: new Date().toISOString(),
    txHash: submissionResult.txHash,
    updated_at: new Date().toISOString()
  };
  
  await updateRequestStatus(requestId, updatedRequest);
  
  console.log('✅ Database updated successfully');
};

/**
 * エラー時のデータベース更新
 * @param {string} requestId - リクエストID
 * @param {Error} error - エラーオブジェクト
 */
const updateDatabaseOnError = async (requestId, error) => {
  console.log('📝 Updating database on submission error...');
  
  try {
    const signedTxData = await getSignedTxData(requestId);
    if (!signedTxData) return;
    
    // エラー解析
    const errorAnalysis = error.message.includes('Blockfrost') 
      ? analyzeBlockfrostError(error.message)
      : { errorType: 'processing_error', details: {}, suggestions: [] };
    
    const errorSignedTxData = {
      ...signedTxData,
      status: 'submit_failed',
      submitError: error.message,
      failedAt: new Date().toISOString(),
      errorAnalysis
    };
    
    await updateSignedTxData(requestId, errorSignedTxData);
    console.log('✅ Error information saved to database');
    
  } catch (updateError) {
    console.error('❌ Failed to update database on error:', updateError);
  }
};