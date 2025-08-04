// Blockfrost API クライアント - メインネット統合とエラー解析
import cbor from 'cbor';

/**
 * 現在のスロット番号を取得
 * @param {string} blockfrostApiKey - Blockfrost APIキー
 * @returns {Promise<number|null>} 現在のスロット番号またはnull
 */
export const getCurrentSlot = async (blockfrostApiKey) => {
  try {
    const response = await fetch('https://cardano-mainnet.blockfrost.io/api/v0/blocks/latest', {
      headers: { 'project_id': blockfrostApiKey }
    });
    
    if (!response.ok) {
      throw new Error(`Blockfrost API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.slot;
    
  } catch (error) {
    console.error('❌ Failed to get current slot:', error.message);
    return null;
  }
};

/**
 * UTxO情報を取得
 * @param {string} txHash - トランザクションハッシュ
 * @param {string} blockfrostApiKey - Blockfrost APIキー
 * @returns {Promise<Object|null>} UTxO情報またはnull
 */
export const getUtxoInfo = async (txHash, blockfrostApiKey) => {
  try {
    const response = await fetch(`https://cardano-mainnet.blockfrost.io/api/v0/txs/${txHash}/utxos`, {
      headers: { 'project_id': blockfrostApiKey }
    });
    
    if (!response.ok) {
      throw new Error(`Blockfrost UTxO API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data;
    
  } catch (error) {
    console.error(`❌ Failed to get UTxO info for ${txHash}:`, error.message);
    return null;
  }
};

/**
 * トランザクションをBlockfrostに送信
 * @param {string} signedTxHex - 署名済みトランザクションのHEX
 * @param {string} blockfrostApiKey - Blockfrost APIキー
 * @returns {Promise<Object>} 送信結果
 */
export const submitTransaction = async (signedTxHex, blockfrostApiKey) => {
  console.log('🚀 Submitting transaction to Blockfrost...');
  
  // 🔍 送信前の詳細CBOR分析
  console.log('🔍 Blockfrost Submission CBOR Analysis:');
  console.log('Transaction hex (full):', signedTxHex);
  console.log('Hex analysis:', {
    length: signedTxHex.length,
    byteLength: signedTxHex.length / 2,
    first16chars: signedTxHex.substring(0, 16),
    first32chars: signedTxHex.substring(0, 32),
    first64chars: signedTxHex.substring(0, 64),
    last16chars: signedTxHex.substring(signedTxHex.length - 16)
  });
  
  // CBORデコード検証
  try {
    const cborBuffer = Buffer.from(signedTxHex, 'hex');
    console.log('Buffer created:', { bufferLength: cborBuffer.length });
    
    const decoded = cbor.decode(cborBuffer);
    console.log('✅ Pre-submission CBOR decode successful:', {
      isArray: Array.isArray(decoded),
      length: Array.isArray(decoded) ? decoded.length : 'N/A',
      conwayStructure: Array.isArray(decoded) && decoded.length === 4,
      element0: decoded[0] instanceof Map ? 'Map' : typeof decoded[0],
      element1: decoded[1] instanceof Map ? 'Map' : typeof decoded[1],
      element2: typeof decoded[2],
      element3: decoded[3] === null ? 'null' : typeof decoded[3]
    });
  } catch (decodeError) {
    console.error('❌ Pre-submission CBOR decode failed:', decodeError.message);
    console.error('This will definitely fail at Blockfrost');
  }
  
  const requestBody = signedTxHex;
  
  console.log('📤 Transaction submission details:', {
    hexLength: signedTxHex.length,
    cborPrefix: signedTxHex.substring(0, 16),
    apiKeyLength: blockfrostApiKey ? blockfrostApiKey.length : 0
  });
  
  try {
    const response = await fetch('https://cardano-mainnet.blockfrost.io/api/v0/tx/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/cbor',
        'project_id': blockfrostApiKey
      },
      body: requestBody
    });
    
    const responseText = await response.text();
    console.log('📥 Blockfrost response:', {
      status: response.status,
      statusText: response.statusText,
      responseLength: responseText.length,
      responsePreview: responseText.substring(0, 200)
    });
    
    if (!response.ok) {
      throw new Error(`Blockfrost submission failed: ${response.status} ${response.statusText}: ${responseText}`);
    }
    
    // 成功レスポンスの解析
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (jsonError) {
      // レスポンスがプレーンテキストの場合
      responseData = { raw: responseText };
    }
    
    // トランザクションハッシュの抽出
    let txHash = null;
    if (typeof responseData === 'string') {
      txHash = responseData;
    } else if (responseData.hash) {
      txHash = responseData.hash;
    } else if (responseData.id) {
      txHash = responseData.id;
    } else if (responseData.raw && typeof responseData.raw === 'string') {
      txHash = responseData.raw;
    }
    
    const result = {
      success: true,
      txHash: txHash,
      message: 'Transaction submitted successfully',
      blockfrostResponse: responseData,
      timestamp: new Date().toISOString()
    };
    
    console.log('✅ Transaction submitted successfully:', {
      txHash: txHash,
      responseType: typeof responseData
    });
    
    return result;
    
  } catch (error) {
    console.error('💥 Blockfrost submission failed:', error);
    
    // 詳細なエラー解析
    const errorDetails = analyzeBlockfrostError(error.message);
    
    const errorResult = {
      success: false,
      error: error.message,
      errorAnalysis: errorDetails,
      timestamp: new Date().toISOString()
    };
    
    throw new Error(`Blockfrost submission failed: ${error.message}`);
  }
};

/**
 * Blockfrost エラーメッセージの詳細解析
 * @param {string} errorMessage - エラーメッセージ
 * @returns {Object} エラー解析結果
 */
export const analyzeBlockfrostError = (errorMessage) => {
  console.log('🔍 Analyzing Blockfrost error:', errorMessage);
  
  const analysis = {
    errorType: 'unknown',
    severity: 'error',
    category: 'general',
    details: {},
    suggestions: [],
    isRetryable: false
  };
  
  const message = errorMessage.toLowerCase();
  
  // 1. TTL関連エラー
  if (message.includes('past expiry') || message.includes('ttl') || message.includes('expiry')) {
    analysis.errorType = 'ttl_expired';
    analysis.category = 'transaction_validity';
    analysis.details.issue = 'Transaction TTL has expired';
    analysis.suggestions = [
      'Rebuild transaction with extended TTL',
      'Check system clock synchronization',
      'Consider setting longer TTL margin'
    ];
    analysis.isRetryable = true;
  }
  
  // 2. Witness関連エラー
  else if (message.includes('missingvkeywitnesses') || message.includes('missing') && message.includes('witness')) {
    analysis.errorType = 'missing_witnesses';
    analysis.category = 'transaction_authorization';
    analysis.details.issue = 'Required signatures are missing';
    analysis.suggestions = [
      'Ensure all required UTxO owners have signed',
      'Check witness set construction',
      'Verify key hash computation',
      'Validate address-to-keyhash mapping'
    ];
    analysis.isRetryable = true;
  }
  
  // 3. UTxO関連エラー
  else if (message.includes('utxo') || message.includes('input') && message.includes('not found')) {
    analysis.errorType = 'utxo_not_found';
    analysis.category = 'transaction_inputs';
    analysis.details.issue = 'Referenced UTxO does not exist or already spent';
    analysis.suggestions = [
      'Verify UTxO still exists on chain',
      'Check for concurrent spending',
      'Refresh UTxO set before rebuilding'
    ];
    analysis.isRetryable = true;
  }
  
  // 4. Fee関連エラー
  else if (message.includes('fee') || message.includes('too small') || message.includes('insufficient')) {
    analysis.errorType = 'insufficient_fee';
    analysis.category = 'transaction_fee';
    analysis.details.issue = 'Transaction fee is insufficient';
    analysis.suggestions = [
      'Increase transaction fee',
      'Fetch latest protocol parameters',
      'Calculate minimum fee correctly'
    ];
    analysis.isRetryable = true;
  }
  
  // 5. フォーマット関連エラー
  else if (message.includes('malformed') || message.includes('invalid') || message.includes('cbor')) {
    analysis.errorType = 'malformed_transaction';
    analysis.category = 'transaction_format';
    analysis.details.issue = 'Transaction format is invalid';
    analysis.suggestions = [
      'Verify CBOR encoding',
      'Check Conway Era transaction structure',
      'Validate all required fields are present'
    ];
    analysis.isRetryable = false;
  }
  
  // 6. API関連エラー
  else if (message.includes('403') || message.includes('unauthorized')) {
    analysis.errorType = 'api_unauthorized';
    analysis.category = 'api_access';
    analysis.details.issue = 'Blockfrost API access denied';
    analysis.suggestions = [
      'Check API key validity',
      'Verify API key permissions',
      'Check account limits'
    ];
    analysis.isRetryable = false;
  }
  
  // 7. ネットワーク関連エラー
  else if (message.includes('timeout') || message.includes('network') || message.includes('connection')) {
    analysis.errorType = 'network_error';
    analysis.category = 'network';
    analysis.details.issue = 'Network connectivity problem';
    analysis.suggestions = [
      'Retry submission',
      'Check internet connection',
      'Verify Blockfrost service status'
    ];
    analysis.isRetryable = true;
  }
  
  // 8. レート制限
  else if (message.includes('429') || message.includes('rate limit')) {
    analysis.errorType = 'rate_limited';
    analysis.category = 'api_limits';
    analysis.details.issue = 'API rate limit exceeded';
    analysis.suggestions = [
      'Wait before retrying',
      'Implement exponential backoff',
      'Consider upgrading API plan'
    ];
    analysis.isRetryable = true;
  }
  
  // 9. サーバーエラー
  else if (message.includes('500') || message.includes('internal server')) {
    analysis.errorType = 'server_error';
    analysis.category = 'server';
    analysis.details.issue = 'Blockfrost server error';
    analysis.suggestions = [
      'Retry after delay',
      'Check Blockfrost status page',
      'Report if persistent'
    ];
    analysis.isRetryable = true;
  }
  
  // 重要度の設定
  if (['missing_witnesses', 'ttl_expired', 'malformed_transaction'].includes(analysis.errorType)) {
    analysis.severity = 'critical';
  } else if (['utxo_not_found', 'insufficient_fee'].includes(analysis.errorType)) {
    analysis.severity = 'high';
  } else if (['network_error', 'rate_limited'].includes(analysis.errorType)) {
    analysis.severity = 'medium';
  }
  
  console.log('📊 Error analysis result:', {
    type: analysis.errorType,
    category: analysis.category,
    severity: analysis.severity,
    retryable: analysis.isRetryable,
    suggestionCount: analysis.suggestions.length
  });
  
  return analysis;
};

/**
 * Blockfrost APIキーの妥当性をチェック
 * @param {string} apiKey - チェック対象のAPIキー
 * @returns {boolean} 妥当かどうか
 */
export const isValidBlockfrostApiKey = (apiKey) => {
  return apiKey && 
         typeof apiKey === 'string' && 
         apiKey.startsWith('mainnet') && 
         apiKey.length > 20;
};

/**
 * Blockfrost接続テスト
 * @param {string} blockfrostApiKey - Blockfrost APIキー
 * @returns {Promise<Object>} 接続テスト結果
 */
export const testBlockfrostConnection = async (blockfrostApiKey) => {
  console.log('🔍 Testing Blockfrost connection...');
  
  const result = {
    connected: false,
    latestBlock: null,
    networkInfo: null,
    error: null
  };
  
  try {
    if (!isValidBlockfrostApiKey(blockfrostApiKey)) {
      throw new Error('Invalid Blockfrost API key format');
    }
    
    const response = await fetch('https://cardano-mainnet.blockfrost.io/api/v0/blocks/latest', {
      headers: { 'project_id': blockfrostApiKey }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    result.connected = true;
    result.latestBlock = {
      height: data.height,
      slot: data.slot,
      hash: data.hash
    };
    
    console.log('✅ Blockfrost connection successful:', {
      blockHeight: data.height,
      currentSlot: data.slot
    });
    
  } catch (error) {
    result.error = error.message;
    console.error('❌ Blockfrost connection failed:', error.message);
  }
  
  return result;
};