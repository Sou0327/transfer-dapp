// CSL (Cardano Serialization Library) 動的ローダー
// Cold Start時間を最小化するため遅延ロード

let CSL = null;

/**
 * CSLライブラリを動的にロード
 * @returns {Promise<Object|null>} CSLライブラリインスタンスまたはnull
 */
export const loadCSL = async () => {
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

/**
 * バイト配列をUint8Arrayに正規化
 * @param {any} bytes - 変換対象のバイト配列
 * @returns {Uint8Array} 正規化されたUint8Array
 */
export const toUint8Array = (bytes) => {
  if (bytes instanceof Uint8Array) return bytes;
  if (Buffer.isBuffer(bytes)) return new Uint8Array(bytes);
  if (Array.isArray(bytes)) return new Uint8Array(bytes);
  throw new Error(`Cannot convert to Uint8Array: ${typeof bytes}`);
};