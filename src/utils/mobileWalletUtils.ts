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

    // カスタムURLスキームでアプリを起動
    window.location.href = appConfig.scheme;
    
    return true;
  } catch (error) {
    console.error(`ウォレットアプリの起動に失敗しました: ${walletName}`, error);
    return false;
  }
};

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

  // アプリの起動を試行
  try {
    const launched = await launchWalletApp(walletName);
    
    if (launched) {
      return {
        success: true,
        action: 'launch',
        message: `${walletConfig.displayName} アプリを起動しています...`,
      };
    } else {
      return {
        success: false,
        action: 'install',
        message: `${walletConfig.displayName} アプリがインストールされていない可能性があります`,
      };
    }
  } catch {
    return {
      success: false,
      action: 'install',
      message: `${walletConfig.displayName} アプリの起動に問題が発生しました`,
    };
  }
};