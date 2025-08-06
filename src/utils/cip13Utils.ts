/**
 * CIP-13 Cardano URI Scheme utilities
 * Generates deep links for mobile wallet integration
 */

import { WalletName } from '../types/cardano';
import { getDeviceInfo } from './deviceUtils';

export interface TransactionSigningRequest {
  txHex: string;
  requestId?: string;
  walletName?: WalletName;
  returnUrl?: string;
  metadata?: {
    amount?: string;
    recipient?: string;
    fee?: string;
  };
}

export interface CIP13SigningResult {
  success: boolean;
  witnessSet?: string;
  error?: string;
  requestId?: string;
}

/**
 * Generate CIP-13 URI for transaction signing
 * Format: web+cardano://sign?tx=<tx_cbor>&return=<callback_url>&[additional_params]
 */
export function generateSigningURI(request: TransactionSigningRequest): string {
  const params = new URLSearchParams();
  
  // Required parameters
  params.set('tx', request.txHex);
  
  // Return URL for callback
  if (request.returnUrl) {
    params.set('return', request.returnUrl);
  } else {
    // Default return URL to current page with callback handler
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('signing_callback', 'true');
    if (request.requestId) {
      currentUrl.searchParams.set('request_id', request.requestId);
    }
    params.set('return', currentUrl.toString());
  }
  
  // Optional metadata
  if (request.requestId) {
    params.set('request_id', request.requestId);
  }
  
  if (request.walletName) {
    params.set('wallet', request.walletName);
  }
  
  if (request.metadata?.amount) {
    params.set('amount', request.metadata.amount);
  }
  
  if (request.metadata?.recipient) {
    params.set('recipient', request.metadata.recipient);
  }
  
  if (request.metadata?.fee) {
    params.set('fee', request.metadata.fee);
  }
  
  // Add timestamp for uniqueness
  params.set('timestamp', Date.now().toString());
  
  return `web+cardano://sign?${params.toString()}`;
}

/**
 * Generate wallet-specific deep link URI
 * Some wallets may have their own custom schemes
 */
export function generateWalletSpecificURI(
  walletName: WalletName, 
  request: TransactionSigningRequest
): string {
  // For now, use standard CIP-13 format
  // In the future, can add wallet-specific customizations here
  switch (walletName) {
    case 'yoroi':
      // Yoroi supports CIP-13 standard
      return generateSigningURI(request);
      
    case 'eternl':
      // Eternl supports CIP-13 standard
      return generateSigningURI(request);
      
    case 'nami':
      // Nami doesn't have mobile app, fallback to standard
      return generateSigningURI(request);
      
    default:
      return generateSigningURI(request);
  }
}

/**
 * Launch mobile wallet app with signing request
 */
export async function launchWalletForSigning(
  walletName: WalletName,
  request: TransactionSigningRequest
): Promise<boolean> {
  const deviceInfo = getDeviceInfo();
  
  if (deviceInfo.isDesktop) {
    console.warn('デスクトップ環境ではモバイルアプリ署名は利用できません');
    return false;
  }

  try {
    const signingURI = generateWalletSpecificURI(walletName, request);
    
    console.log(`🚀 ウォレット署名URI生成:`, {
      walletName,
      uri: signingURI,
      requestId: request.requestId
    });

    // Use improved mobile app launching function
    // Import mobileWalletUtils for future use if needed
    
    // First try to launch the app with custom URI
    return new Promise<boolean>((resolve) => {
      const startTime = Date.now();
      let isAppLaunched = false;
      
      // タイムアウト設定（3秒）
      const timeout = setTimeout(() => {
        if (!isAppLaunched) {
          console.log(`${walletName} 署名URI起動がタイムアウトしました`);
          resolve(false);
        }
      }, 3000);

      // ページフォーカス変更の監視
      const handleVisibilityChange = () => {
        if (document.hidden || document.visibilityState === 'hidden') {
          isAppLaunched = true;
          clearTimeout(timeout);
          document.removeEventListener('visibilitychange', handleVisibilityChange);
          resolve(true);
        }
      };

      // ページフォーカス喪失の監視
      const handleBlur = () => {
        const elapsed = Date.now() - startTime;
        if (elapsed < 2500) {
          isAppLaunched = true;
          clearTimeout(timeout);
          window.removeEventListener('blur', handleBlur);
          document.removeEventListener('visibilitychange', handleVisibilityChange);
          resolve(true);
        }
      };

      // イベントリスナー登録
      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('blur', handleBlur);

      // URI起動試行
      try {
        if (deviceInfo.platform === 'ios') {
          // iOS Safari用
          window.location.href = signingURI;
        } else {
          // Android Chrome用：iframe方式
          const iframe = document.createElement('iframe');
          iframe.style.display = 'none';
          iframe.src = signingURI;
          
          iframe.onload = () => {
            setTimeout(() => {
              if (!isAppLaunched) {
                document.body.removeChild(iframe);
              }
            }, 100);
          };

          document.body.appendChild(iframe);
          
          // フォールバック用の直接的なlocation変更も試行
          setTimeout(() => {
            if (!isAppLaunched) {
              try {
                window.location.href = signingURI;
              } catch (error) {
                console.error('Android署名URI起動エラー:', error);
              }
            }
          }, 25);
        }
      } catch (error) {
        console.error(`署名URI起動エラー: ${walletName}`, error);
        clearTimeout(timeout);
        resolve(false);
      }
    });

  } catch (error) {
    console.error(`署名URI生成エラー: ${walletName}`, error);
    return false;
  }
}

/**
 * Parse signing callback result from URL parameters
 */
export function parseSigningCallback(): CIP13SigningResult | null {
  const urlParams = new URLSearchParams(window.location.search);
  
  if (!urlParams.get('signing_callback')) {
    return null;
  }
  
  const success = urlParams.get('success') === 'true';
  const witnessSet = urlParams.get('witness');
  const error = urlParams.get('error');
  const requestId = urlParams.get('request_id');
  
  return {
    success,
    witnessSet: witnessSet || undefined,
    error: error || undefined,
    requestId: requestId || undefined
  };
}

/**
 * Clean signing callback parameters from URL
 */
export function cleanSigningCallbackUrl() {
  const url = new URL(window.location.href);
  
  // Remove signing callback parameters
  url.searchParams.delete('signing_callback');
  url.searchParams.delete('success');
  url.searchParams.delete('witness');
  url.searchParams.delete('error');
  url.searchParams.delete('request_id');
  
  // Update URL without reload
  window.history.replaceState({}, '', url.toString());
}

/**
 * Check if wallet supports mobile signing via CIP-13
 */
export function supportsNativeSigning(walletName: WalletName): boolean {
  // List of wallets that support CIP-13 mobile signing
  const supportedWallets: WalletName[] = ['yoroi', 'eternl', 'tokeo'];
  
  return supportedWallets.includes(walletName);
}

/**
 * Create a comprehensive signing request with all necessary metadata
 */
export function createSigningRequest(
  txHex: string,
  requestId: string,
  walletName: WalletName,
  metadata?: {
    amount?: string;
    recipient?: string;
    fee?: string;
  }
): TransactionSigningRequest {
  return {
    txHex,
    requestId,
    walletName,
    metadata,
    returnUrl: undefined // Will be auto-generated
  };
}