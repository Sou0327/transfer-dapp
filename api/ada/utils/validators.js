// 共通バリデーション関数

/**
 * HEX文字列の妥当性をチェック
 * @param {string} hexString - チェック対象のHEX文字列
 * @returns {boolean} 妥当かどうか
 */
export const isValidHex = (hexString) => {
  return hexString && typeof hexString === 'string' && /^[0-9a-fA-F]+$/.test(hexString);
};

/**
 * リクエストIDの妥当性をチェック
 * @param {string} requestId - チェック対象のリクエストID
 * @returns {boolean} 妥当かどうか
 */
export const isValidRequestId = (requestId) => {
  return requestId && typeof requestId === 'string' && requestId.trim().length > 0;
};

/**
 * 署名済みトランザクションデータの構造をチェック
 * @param {Object} signedTxData - チェック対象のデータ
 * @returns {boolean} 妥当かどうか
 */
export const isValidSignedTxData = (signedTxData) => {
  return signedTxData && 
         typeof signedTxData === 'object' && 
         signedTxData.signedTx && 
         signedTxData.requestId;
};

/**
 * CBOR配列が4要素のConway Era形式かチェック
 * @param {Array} cborArray - チェック対象の配列
 * @returns {boolean} Conway Era形式かどうか
 */
export const isConwayEraTx = (cborArray) => {
  return Array.isArray(cborArray) && 
         cborArray.length === 4 && 
         typeof cborArray[2] === 'boolean';
};

/**
 * トランザクションボディ（Map）の必須フィールドを検証
 * @param {Map} txBody - チェック対象のトランザクションボディ
 * @returns {Object} 検証結果
 */
export const validateTxBodyStructure = (txBody) => {
  const result = { valid: true, errors: [] };
  
  if (!(txBody instanceof Map)) {
    result.valid = false;
    result.errors.push('tx_body must be a Map');
    return result;
  }
  
  // 必須フィールドのチェック
  const requiredFields = [
    { key: 0, name: 'inputs', type: 'array' },
    { key: 1, name: 'outputs', type: 'array' },
    { key: 2, name: 'fee', type: 'number' }
  ];
  
  for (const field of requiredFields) {
    if (!txBody.has(field.key)) {
      result.valid = false;
      result.errors.push(`Missing required field: ${field.name} (key ${field.key})`);
      continue;
    }
    
    const value = txBody.get(field.key);
    if (field.type === 'array' && !Array.isArray(value)) {
      result.valid = false;
      result.errors.push(`Field ${field.name} must be an array, got ${typeof value}`);
    } else if (field.type === 'number' && typeof value !== 'number') {
      result.valid = false;
      result.errors.push(`Field ${field.name} must be a number, got ${typeof value}`);
    }
  }
  
  // TTL（オプショナル）のチェック
  if (txBody.has(3)) {
    const ttl = txBody.get(3);
    if (typeof ttl !== 'number') {
      result.valid = false;
      result.errors.push(`TTL must be a number, got ${typeof ttl}`);
    }
  }
  
  return result;
};

/**
 * Witness Set（Map）の構造を検証
 * @param {Map} witnessSet - チェック対象のWitness Set
 * @returns {Object} 検証結果
 */
export const validateWitnessSetStructure = (witnessSet) => {
  const result = { valid: true, errors: [], vkeyCount: 0 };
  
  if (!(witnessSet instanceof Map)) {
    result.valid = false;
    result.errors.push('witness_set must be a Map');
    return result;
  }
  
  // VKey witnessesの検証
  if (witnessSet.has(0)) {
    const vkeyWitnesses = witnessSet.get(0);
    if (!Array.isArray(vkeyWitnesses)) {
      result.valid = false;
      result.errors.push('vkey_witnesses must be an array');
    } else {
      result.vkeyCount = vkeyWitnesses.length;
      
      // 各witnessの構造チェック
      for (let i = 0; i < vkeyWitnesses.length; i++) {
        const witness = vkeyWitnesses[i];
        if (!Array.isArray(witness) || witness.length !== 2) {
          result.valid = false;
          result.errors.push(`witness[${i}] must be 2-element array [vkey, sig]`);
          continue;
        }
        
        const [vkey, sig] = witness;
        if (!vkey || vkey.length !== 32) {
          result.valid = false;
          result.errors.push(`witness[${i}] vkey must be 32 bytes`);
        }
        if (!sig || sig.length !== 64) {
          result.valid = false;
          result.errors.push(`witness[${i}] signature must be 64 bytes`);
        }
      }
    }
  }
  
  return result;
};