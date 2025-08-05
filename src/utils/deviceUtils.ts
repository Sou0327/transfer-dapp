/**
 * Device and platform detection utilities
 * モバイルデバイスとプラットフォームの検知ユーティリティ
 */

export interface DeviceInfo {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  platform: 'ios' | 'android' | 'desktop';
  userAgent: string;
}

/**
 * モバイルデバイスを検知する
 */
export const isMobileDevice = (): boolean => {
  if (typeof window === 'undefined') return false;

  const userAgent = window.navigator.userAgent.toLowerCase();
  
  // モバイルデバイスのユーザーエージェントパターン
  const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
  
  return mobileRegex.test(userAgent);
};

/**
 * タブレットデバイスを検知する
 */
export const isTabletDevice = (): boolean => {
  if (typeof window === 'undefined') return false;

  const userAgent = window.navigator.userAgent.toLowerCase();
  
  // タブレットの検知パターン
  const tabletRegex = /ipad|android(?!.*mobile)|tablet/i;
  
  return tabletRegex.test(userAgent);
};

/**
 * プラットフォームを検知する
 */
export const detectPlatform = (): 'ios' | 'android' | 'desktop' => {
  if (typeof window === 'undefined') return 'desktop';

  const userAgent = window.navigator.userAgent.toLowerCase();
  
  if (/iphone|ipad|ipod/i.test(userAgent)) {
    return 'ios';
  }
  
  if (/android/i.test(userAgent)) {
    return 'android';
  }
  
  return 'desktop';
};

/**
 * 詳細なデバイス情報を取得する
 */
export const getDeviceInfo = (): DeviceInfo => {
  const isMobile = isMobileDevice();
  const isTablet = isTabletDevice();
  const platform = detectPlatform();
  
  return {
    isMobile,
    isTablet,
    isDesktop: !isMobile && !isTablet,
    platform,
    userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : '',
  };
};

/**
 * 特定のプラットフォームかどうか確認する
 */
export const isPlatform = (targetPlatform: 'ios' | 'android' | 'desktop'): boolean => {
  return detectPlatform() === targetPlatform;
};

/**
 * タッチデバイスかどうか確認する
 */
export const isTouchDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    (navigator as Navigator & { msMaxTouchPoints?: number }).msMaxTouchPoints > 0
  );
};