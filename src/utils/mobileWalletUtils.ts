/**
 * モバイルウォレットアプリとの連携ユーティリティ
 * Mobile wallet app integration utilities
 */

import { WalletName, WalletInfo } from '../types/cardano';
import { WALLET_CONFIG } from './walletConfig';
import { getDeviceInfo } from './deviceUtils';

/**
 * モバイルウォレットアプリを起動する
 * Launch mobile wallet app
 */
export const launchWalletApp = async (walletName: WalletName): Promise<boolean> => {
  const deviceInfo = getDeviceInfo();
  
  if (deviceInfo.isDesktop) {
    console.warn('デスクトップ環境ではモバイルアプリを起動できません');
    return false;
  }

  const walletConfig = WALLET_CONFIG[walletName];
  
  if (!walletConfig.mobileApp) {
    console.warn(`${walletName} はモバイルアプリに対応していません`);
    return false;
  }

  try {
    const appConfig = deviceInfo.platform === 'ios' 
      ? walletConfig.mobileApp.ios 
      : walletConfig.mobileApp.android;

    if (!appConfig) {
      console.warn(`${walletName} は ${deviceInfo.platform} に対応していません`);
      return false;
    }

    // 現代的なモバイルアプリ起動方法
    return new Promise<boolean>((resolve) => {
      const startTime = Date.now();
      let isAppLaunched = false;
      
      // タイムアウト設定（2.5秒）
      const timeout = setTimeout(() => {
        if (!isAppLaunched) {
          console.log(`${walletName} アプリの起動がタイムアウトしました。アプリストアに誘導します。`);
          // アプリストアへのフォールバック
          const storeUrl = deviceInfo.platform === 'ios' 
            ? appConfig.appStoreUrl 
            : appConfig.playStoreUrl;
          
          if (storeUrl) {
            window.open(storeUrl, '_blank');
          }
          resolve(false);
        }
      }, 2500);

      // ページフォーカス変更の監視
      const handleVisibilityChange = () => {
        if (document.hidden || document.visibilityState === 'hidden') {
          // ページが非表示になったらアプリが起動したと判断
          isAppLaunched = true;
          clearTimeout(timeout);
          document.removeEventListener('visibilitychange', handleVisibilityChange);
          resolve(true);
        }
      };

      // ページフォーカス喪失の監視
      const handleBlur = () => {
        // フォーカスが失われたらアプリが起動したと判断
        const elapsed = Date.now() - startTime;
        if (elapsed < 2000) { // 2秒以内のフォーカス喪失はアプリ起動
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

      // iOS Safari用の追加処理
      if (deviceInfo.platform === 'ios') {
        // iOS Safariでは location.href が効果的
        try {
          window.location.href = appConfig.scheme;
        } catch (error) {
          console.error('iOS URLスキーム起動エラー:', error);
          clearTimeout(timeout);
          resolve(false);
        }
      } else {
        // Android Chrome用：iframe方式
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = appConfig.scheme;
        
        iframe.onload = () => {
          // iframeがロードされたらアプリが起動しなかった可能性が高い
          setTimeout(() => {
            if (!isAppLaunched) {
              document.body.removeChild(iframe);
            }
          }, 100);
        };

        iframe.onerror = () => {
          // エラーが発生した場合もアプリが起動しなかった可能性
          if (!isAppLaunched) {
            document.body.removeChild(iframe);
          }
        };

        document.body.appendChild(iframe);
        
        // フォールバック用の直接的なlocation変更も試行
        setTimeout(() => {
          if (!isAppLaunched) {
            try {
              window.location.href = appConfig.scheme;
            } catch (error) {
              console.error('Android URLスキーム起動エラー:', error);
            }
          }
        }, 25);
      }
    });
  } catch (error) {
    console.error(`ウォレットアプリの起動に失敗しました: ${walletName}`, error);
    return false;
  }
};;

/**
 * ウォレットアプリがインストールされているかチェック（推定）
 * Check if wallet app is installed (estimated)
 */
export const isWalletAppInstalled = async (walletName: WalletName): Promise<boolean> => {
  const deviceInfo = getDeviceInfo();
  
  if (deviceInfo.isDesktop) {
    return false;
  }

  const walletConfig = WALLET_CONFIG[walletName];
  
  if (!walletConfig.mobileApp) {
    return false;
  }

  try {
    const appConfig = deviceInfo.platform === 'ios' 
      ? walletConfig.mobileApp.ios 
      : walletConfig.mobileApp.android;

    if (!appConfig) {
      return false;
    }

    // Android の場合、インストール状況をより詳細に確認する試み
    if (deviceInfo.platform === 'android' && appConfig.packageName) {
      // Note: 実際のAndroidアプリのインストール状況は
      // セキュリティ上の理由でブラウザからは完全には確認できません
      // ここではベストエフォート的なアプローチを使用します
      return true; // 基本的に利用可能と仮定
    }

    // iOS の場合もアプリストアへのリンクが存在すれば利用可能と仮定
    return !!appConfig.appStoreUrl || !!appConfig.playStoreUrl;
  } catch (error) {
    console.error(`ウォレットアプリの確認に失敗しました: ${walletName}`, error);
    return false;
  }
};

/**
 * アプリストアへのリンクを開く
 * Open app store link
 */
export const openAppStore = (walletName: WalletName): void => {
  const deviceInfo = getDeviceInfo();
  const walletConfig = WALLET_CONFIG[walletName];
  
  if (!walletConfig.mobileApp) {
    console.warn(`${walletName} はモバイルアプリに対応していません`);
    return;
  }

  const appConfig = deviceInfo.platform === 'ios' 
    ? walletConfig.mobileApp.ios 
    : walletConfig.mobileApp.android;

  if (!appConfig) {
    console.warn(`${walletName} は ${deviceInfo.platform} に対応していません`);
    return;
  }

  const storeUrl = deviceInfo.platform === 'ios' 
    ? appConfig.appStoreUrl 
    : appConfig.playStoreUrl;

  if (storeUrl) {
    window.open(storeUrl, '_blank');
  } else {
    console.warn(`${walletName} の ${deviceInfo.platform} アプリストアURLが見つかりません`);
  }
};

/**
 * モバイル対応ウォレットの一覧を取得
 * Get list of mobile-compatible wallets
 */
export const getMobileCompatibleWallets = (): WalletInfo[] => {
  return Object.values(WALLET_CONFIG).filter(wallet => !!wallet.mobileApp);
};

/**
 * 特定のプラットフォームに対応したウォレットの一覧を取得
 * Get wallets compatible with specific platform
 */
export const getPlatformCompatibleWallets = (platform: 'ios' | 'android'): WalletInfo[] => {
  return Object.values(WALLET_CONFIG).filter(wallet => 
    wallet.mobileApp && wallet.mobileApp[platform]
  );
};

/**
 * ウォレット選択時のモバイル対応処理
 * Handle mobile compatibility when selecting wallet
 */
export const handleMobileWalletSelection = async (walletName: WalletName): Promise<{
  success: boolean;
  action: 'launch' | 'install' | 'unsupported';
  message: string;
}> => {
  const deviceInfo = getDeviceInfo();
  
  if (deviceInfo.isDesktop) {
    return {
      success: false,
      action: 'unsupported',
      message: 'デスクトップ環境ではブラウザ拡張機能を使用してください',
    };
  }

  const walletConfig = WALLET_CONFIG[walletName];
  
  if (!walletConfig.mobileApp) {
    return {
      success: false,
      action: 'unsupported',
      message: `${walletConfig.displayName} はモバイルアプリに対応していません`,
    };
  }

  const appConfig = deviceInfo.platform === 'ios' 
    ? walletConfig.mobileApp.ios 
    : walletConfig.mobileApp.android;

  if (!appConfig) {
    return {
      success: false,
      action: 'unsupported',
      message: `${walletConfig.displayName} は ${deviceInfo.platform} に対応していません`,
    };
  }

  // アプリの起動を試行（改善された方式）
  try {
    console.log(`${walletConfig.displayName} アプリの起動を試行中...`);
    const launched = await launchWalletApp(walletName);
    
    if (launched) {
      return {
        success: true,
        action: 'launch',
        message: `${walletConfig.displayName} アプリが起動されました`,
      };
    } else {
      // アプリが起動しなかった場合、アプリストアに誘導
      return {
        success: false,
        action: 'install',
        message: `${walletConfig.displayName} アプリをインストールしてください`,
      };
    }
  } catch (error) {
    console.error(`${walletName} アプリ起動エラー:`, error);
    return {
      success: false,
      action: 'install',
      message: `${walletConfig.displayName} アプリの起動に問題が発生しました`,
    };
  }
};;