// トランザクション検証サービス - TTL・witness検証
import cbor from 'cbor';
import { loadCSL } from '../utils/cslLoader.js';
import { getCurrentSlot, getUtxoInfo } from './blockfrostClient.js';

/**
 * TTL (Time To Live) バリデーション
 * @param {string} signedTxHex - 署名済みトランザクションのHEX
 * @param {string} blockfrostApiKey - Blockfrost APIキー
 * @returns {Promise<Object>} TTL検証結果
 */
export const validateTTL = async (signedTxHex, blockfrostApiKey) => {
  console.log('⚙️ Starting TTL validation...');
  
  const result = {
    valid: true,
    ttlSlot: null,
    currentSlot: null,
    margin: null,
    marginHours: null,
    warnings: [],
    errors: []
  };
  
  try {
    // 現在のスロット取得
    const currentSlot = await getCurrentSlot(blockfrostApiKey);
    if (!currentSlot) {
      result.warnings.push('Could not get current slot, skipping TTL validation');
      return result;
    }
    result.currentSlot = currentSlot;
    
    // CSLを使用してTTLを抽出
    const cslLib = await loadCSL();
    if (!cslLib) {
      result.warnings.push('CSL not available, skipping TTL validation');
      return result;
    }
    
    const tx = cslLib.Transaction.from_bytes(Buffer.from(signedTxHex, 'hex'));
    const body = tx.body();
    const ttl = body.ttl(); // BigNum | undefined
    
    if (ttl === undefined) {
      console.log('📅 TTL Validation: No TTL set (unlimited validity)');
      result.ttlSlot = null;
      return result;
    }
    
    const ttlSlot = Number(ttl.to_str());
    result.ttlSlot = ttlSlot;
    
    // TTL = 0 の致命的エラーチェック
    if (ttlSlot === 0) {
      result.valid = false;
      result.errors.push('TTL is 0 (invalidHereafter=0). This causes immediate expiry - transaction invalid.');
      return result;
    }
    
    // マージン計算
    const margin = ttlSlot - currentSlot;
    const marginHours = Math.floor(margin / 3600);
    result.margin = margin;
    result.marginHours = marginHours;
    
    console.log('📅 TTL Validation results:', {
      currentSlot,
      ttlSlot,
      margin,
      marginHours,
      status: margin > 120 ? '✅ Valid' : '❌ Too close/expired'
    });
    
    // 環境変数から閾値を取得
    const minTtlMarginSlots = parseInt(process.env.MIN_TTL_MARGIN_SLOTS) || 120; // デフォルト2分
    const warnTtlMarginSlots = parseInt(process.env.WARN_TTL_MARGIN_SLOTS) || 600; // デフォルト10分
    
    // TTL余裕チェック
    if (margin < minTtlMarginSlots) {
      result.valid = false;
      result.errors.push(`TTL too close to expiry. Margin: ${margin} slots (${marginHours} hours). Need at least ${minTtlMarginSlots} slots.`);
    } else if (margin < warnTtlMarginSlots) {
      result.warnings.push(`TTL expires soon: ${marginHours} hours remaining (${margin} slots)`);
    } else {
      console.log('✅ TTL has sufficient margin:', `${marginHours} hours remaining (${margin} slots)`);
    }
    
  } catch (error) {
    result.warnings.push(`TTL validation failed: ${error.message}`);
  }
  
  return result;
};

/**
 * Key witness バリデーション - MissingVKeyWitnesses事前検出
 * @param {string} signedTxHex - 署名済みトランザクションのHEX
 * @param {string} blockfrostApiKey - Blockfrost APIキー
 * @returns {Promise<Object>} Key witness検証結果
 */
export const validateKeyWitnesses = async (signedTxHex, blockfrostApiKey) => {
  console.log('🔑 Starting key witness validation...');
  
  const result = {
    valid: true,
    requiredKeyHashes: new Set(),
    providedKeyHashes: new Set(),
    missingKeyHashes: new Set(),
    extraKeyHashes: new Set(),
    warnings: [],
    errors: []
  };
  
  try {
    // トランザクションをデコード
    const txDecoded = cbor.decode(Buffer.from(signedTxHex, 'hex'));
    
    if (!Array.isArray(txDecoded) || txDecoded.length !== 4) {
      result.warnings.push('Unexpected transaction format for key validation');
      return result;
    }
    
    const [txBody, witnessSet] = txDecoded;
    
    // 必要なキーハッシュを抽出
    await extractRequiredKeyHashes(txBody, result.requiredKeyHashes, blockfrostApiKey);
    
    // 提供されたキーハッシュを抽出
    await extractProvidedKeyHashes(signedTxHex, witnessSet, result.providedKeyHashes);
    
    // 不足・余分なキーハッシュを計算
    result.missingKeyHashes = new Set([...result.requiredKeyHashes].filter(hash => !result.providedKeyHashes.has(hash)));
    result.extraKeyHashes = new Set([...result.providedKeyHashes].filter(hash => !result.requiredKeyHashes.has(hash)));
    
    // 検証結果
    if (result.missingKeyHashes.size > 0) {
      result.valid = false;
      result.errors.push(`Missing signatures for key hashes: ${Array.from(result.missingKeyHashes).join(', ')}`);
    } else if (result.requiredKeyHashes.size > 0) {
      console.log('✅ All required key hashes have corresponding signatures');
    }
    
    console.log('📊 Key witness validation summary:', {
      requiredCount: result.requiredKeyHashes.size,
      providedCount: result.providedKeyHashes.size,
      missingCount: result.missingKeyHashes.size,
      extraCount: result.extraKeyHashes.size,
      validationResult: result.valid ? '✅ All required signatures present' : '❌ Missing signatures detected'
    });
    
  } catch (error) {
    result.warnings.push(`Key witness validation failed: ${error.message}`);
  }
  
  return result;
};

/**
 * トランザクション入力から必要なキーハッシュを抽出
 * @param {Map} txBody - トランザクションボディ
 * @param {Set} requiredKeyHashes - 必要なキーハッシュを格納するSet
 * @param {string} blockfrostApiKey - Blockfrost APIキー
 */
const extractRequiredKeyHashes = async (txBody, requiredKeyHashes, blockfrostApiKey) => {
  if (!(txBody instanceof Map) || !txBody.has(0)) {
    console.warn('⚠️ Invalid transaction body structure for key hash extraction');
    return;
  }
  
  const inputs = txBody.get(0);
  if (!Array.isArray(inputs)) {
    console.warn('⚠️ Transaction inputs is not an array');
    return;
  }
  
  console.log('🔍 Extracting required key hashes from input UTxOs:', { inputCount: inputs.length });
  
  const cslLib = await loadCSL();
  if (!cslLib) {
    console.warn('⚠️ CSL not available for key hash extraction');
    return;
  }
  
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    
    if (!Array.isArray(input) || input.length < 2) {
      console.warn(`⚠️ Invalid input structure at index ${i}`);
      continue;
    }
    
    const [txHashBytes, outputIndex] = input;
    if (!txHashBytes || typeof outputIndex !== 'number') {
      console.warn(`⚠️ Invalid input data at index ${i}`);
      continue;
    }
    
    const txHash = Buffer.from(txHashBytes).toString('hex');
    console.log(`🔍 Processing input ${i}: ${txHash.substring(0, 16)}...#${outputIndex}`);
    
    try {
      // UTxO情報を取得
      const utxoData = await getUtxoInfo(txHash, blockfrostApiKey);
      if (!utxoData?.outputs?.[outputIndex]) {
        console.warn(`⚠️ UTxO not found for input ${i}`);
        continue;
      }
      
      const output = utxoData.outputs[outputIndex];
      const address = output.address;
      
      console.log(`🏠 Input ${i} address: ${address.substring(0, 20)}...`);
      
      // アドレスからキーハッシュを抽出
      const keyHash = await extractKeyHashFromAddress(address, cslLib);
      if (keyHash) {
        requiredKeyHashes.add(keyHash);
        console.log(`✅ Required key hash for input ${i}: ${keyHash}`);
      }
      
    } catch (error) {
      console.error(`❌ Failed to process input ${i}:`, error.message);
    }
  }
};

/**
 * アドレスからキーハッシュを抽出
 * @param {string} address - Cardanoアドレス
 * @param {Object} cslLib - CSLライブラリインスタンス
 * @returns {Promise<string|null>} キーハッシュまたはnull
 */
const extractKeyHashFromAddress = async (address, cslLib) => {
  try {
    const cslAddress = cslLib.Address.from_bech32(address);
    
    // Base address の場合
    const baseAddress = cslAddress.as_base();
    if (baseAddress) {
      const paymentCred = baseAddress.payment_cred();
      const keyHash = paymentCred.to_keyhash();
      if (keyHash) {
        return Buffer.from(keyHash.to_bytes()).toString('hex');
      }
    }
    
    // Enterprise address の場合
    const enterpriseAddress = cslAddress.as_enterprise();
    if (enterpriseAddress) {
      const paymentCred = enterpriseAddress.payment_cred();
      const keyHash = paymentCred.to_keyhash();
      if (keyHash) {
        return Buffer.from(keyHash.to_bytes()).toString('hex');
      }
    }
    
    console.warn('⚠️ Unsupported address type or script address');
    return null;
    
  } catch (error) {
    console.error('❌ Failed to parse address:', error.message);
    return null;
  }
};

/**
 * 提供されたキーハッシュを抽出（CSL + CBOR フォールバック）
 * @param {string} signedTxHex - 署名済みトランザクションのHEX
 * @param {Map} witnessSet - Witness Set
 * @param {Set} providedKeyHashes - 提供されたキーハッシュを格納するSet
 */
const extractProvidedKeyHashes = async (signedTxHex, witnessSet, providedKeyHashes) => {
  // Method 1: CSL Library (最も堅牢)
  const cslLib = await loadCSL();
  if (cslLib) {
    try {
      console.log('🔍 Using CSL for witness extraction...');
      const tx = cslLib.Transaction.from_bytes(Buffer.from(signedTxHex, 'hex'));
      const wset = tx.witness_set();
      const vkeys = wset.vkeys(); // Vkeywitnesses | undefined
      
      if (vkeys) {
        console.log('🔑 CSL VKey witnesses found:', { count: vkeys.len() });
        for (let i = 0; i < vkeys.len(); i++) {
          const w = vkeys.get(i);
          const pubKey = w.vkey().public_key();
          const keyHash = Buffer.from(pubKey.hash().to_bytes()).toString('hex');
          providedKeyHashes.add(keyHash);
          console.log(`✅ CSL computed key hash for witness ${i}:`, keyHash);
        }
        return; // CSL成功時は早期リターン
      }
    } catch (cslError) {
      console.warn('⚠️ CSL witness extraction failed:', cslError.message);
    }
  }
  
  // Method 2: CBOR直読み（フォールバック）
  console.log('🔄 Using CBOR direct method as fallback...');
  
  const witnessSetMap = convertToNumKeyMap(witnessSet);
  if (witnessSetMap?.has?.(0)) {
    const vkeyWitnesses = witnessSetMap.get(0);
    
    if (Array.isArray(vkeyWitnesses)) {
      console.log('🔑 CBOR VKey witnesses found:', { count: vkeyWitnesses.length });
      
      for (let i = 0; i < vkeyWitnesses.length; i++) {
        const witness = vkeyWitnesses[i];
        
        if (Array.isArray(witness) && witness.length >= 2) {
          const publicKeyBytes = witness[0];
          
          if (publicKeyBytes && publicKeyBytes.length === 32) {
            console.log(`🔍 CBOR witness ${i}: Found 32-byte public key`);
            // Note: CBOR method cannot compute key hash without CSL
            // This is logged for debugging purposes only
          }
        }
      }
    }
  }
};

/**
 * Witness Setを数値キーのMapに変換（型差吸収）
 * @param {Map|Object} witnessSet - Witness Set
 * @returns {Map} 数値キーのMap
 */
const convertToNumKeyMap = (witnessSet) => {
  if (witnessSet && typeof witnessSet.get === 'function' && typeof witnessSet.has === 'function') {
    return witnessSet; // 既にMap互換
  }
  
  // plain objectをMapに変換
  return new Map(Object.entries(witnessSet ?? {}).map(([k, v]) => [Number(k), v]));
};