import { WalletInfo, WalletName } from '../types/cardano';

/**
 * Supported Cardano wallets configuration
 * Icons are base64-encoded SVGs for better reliability and consistent styling
 */
export const WALLET_CONFIG: Record<WalletName, WalletInfo> = {
  yoroi: {
    name: 'yoroi',
    displayName: 'Yoroi',
    icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiByeD0iMTAiIGZpbGw9IiM0Qzc2RkYiLz4KPHBhdGggZD0iTTEyIDEySDI4VjE2SDEyVjEyWiIgZmlsbD0id2hpdGUiLz4KPHBhdGggZD0iTTEyIDIwSDI4VjI0SDEyVjIwWiIgZmlsbD0id2hpdGUiLz4KPHBhdGggZD0iTTE2IDI4SDE2VjI0SDE2VjI4WiIgZmlsbD0id2hpdGUiLz4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iOCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIyIi8+Cjwvc3ZnPgo=',
    apiKey: 'yoroi',
    downloadUrl: 'https://yoroi-wallet.com/',
    description: 'Secure, fast and simple Cardano ADA wallet',
    mobileApp: {
      ios: {
        scheme: 'yoroi://',
        appStoreUrl: 'https://apps.apple.com/app/emurgo-yoroi-cardano-wallet/id1447326389',
      },
      android: {
        scheme: 'yoroi://',
        playStoreUrl: 'https://play.google.com/store/apps/details?id=com.emurgo',
        packageName: 'com.emurgo',
      },
    },
  },
  tokeo: {
    name: 'tokeo',
    displayName: 'Tokeo',
    icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiByeD0iMTAiIGZpbGw9IiNGRjZBMDAiLz4KPHBhdGggZD0iTTIwIDhMMjggMjBMMjAgMzJMMTIgMjBMMjAgOFoiIGZpbGw9IndoaXRlIi8+CjxjaXJjbGUgY3g9IjIwIiBjeT0iMjAiIHI9IjQiIGZpbGw9IiNGRjZBMDAiLz4KPC9zdmc+Cg==',
    apiKey: 'tokeo',
    downloadUrl: 'https://tokeo.io/',
    description: 'Advanced Cardano wallet with DeFi features',
    mobileApp: {
      ios: {
        scheme: 'tokeo://',
        appStoreUrl: 'https://apps.apple.com/app/tokeo-wallet/id1595301062',
      },
      android: {
        scheme: 'tokeo://',
        playStoreUrl: 'https://play.google.com/store/apps/details?id=io.tokeo.wallet',
        packageName: 'io.tokeo.wallet',
      },
    },
  },
  eternl: {
    name: 'eternl',
    displayName: 'Eternl',
    icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiByeD0iMTAiIGZpbGw9IiMwRjFBMzciLz4KPHBhdGggZD0iTTIwIDEwTDI2IDE0TDI2IDI2TDIwIDMwTDE0IDI2TDE0IDE0TDIwIDEwWiIgZmlsbD0id2hpdGUiLz4KPHBhdGggZD0iTTIwIDE2TDIyIDIwTDIwIDI0TDE4IDIwTDIwIDE2WiIgZmlsbD0iIzBGMUEzNyIvPgo8L3N2Zz4K',
    apiKey: 'eternl',
    downloadUrl: 'https://eternl.io/',
    description: 'Feature-rich Cardano wallet with staking pools',
    mobileApp: {
      ios: {
        scheme: 'eternl://',
        appStoreUrl: 'https://apps.apple.com/app/eternl/id1633447558',
      },
      android: {
        scheme: 'eternl://',
        playStoreUrl: 'https://play.google.com/store/apps/details?id=io.eternl.wallet',
        packageName: 'io.eternl.wallet',
      },
    },
  },
  nami: {
    name: 'nami',
    displayName: 'Nami',
    icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiByeD0iMTAiIGZpbGw9IiMwQkJBRjAiLz4KPHBhdGggZD0iTTEwIDIwUTEwIDEwIDIwIDEwUTMwIDEwIDMwIDIwUTMwIDMwIDIwIDMwUTEwIDMwIDEwIDIwWiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIzIi8+CjxjaXJjbGUgY3g9IjIwIiBjeT0iMjAiIHI9IjMiIGZpbGw9IndoaXRlIi8+Cjwvc3ZnPgo=',
    apiKey: 'nami',
    downloadUrl: 'https://namiwallet.io/',
    description: 'Simple and secure Cardano wallet',
    mobileApp: {
      ios: {
        scheme: 'nami://',
        appStoreUrl: 'https://apps.apple.com/app/nami-wallet/id1612818924',
      },
      android: {
        scheme: 'nami://',
        playStoreUrl: 'https://play.google.com/store/apps/details?id=io.nami.wallet',
        packageName: 'io.nami.wallet',
      },
    },
  },
  typhon: {
    name: 'typhon',
    displayName: 'Typhon',
    icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiByeD0iMTAiIGZpbGw9IiM4MzQzRkYiLz4KPHBhdGggZD0iTTIwIDhMMzAgMjBMMjAgMzJMMTAgMjBMMjAgOFoiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMiIvPgo8cGF0aCBkPSJNMTYgMTZMMjQgMTZMMjQgMjRMMTYgMjRMMTYgMTZaIiBmaWxsPSJ3aGl0ZSIvPgo8L3N2Zz4K',
    apiKey: 'typhon',
    downloadUrl: 'https://typhonwallet.io/',
    description: 'Multi-platform Cardano wallet with advanced features',
    mobileApp: {
      ios: {
        scheme: 'typhonwallet://',
        appStoreUrl: 'https://apps.apple.com/app/typhon-wallet/id1560093508',
      },
      android: {
        scheme: 'typhonwallet://',
        playStoreUrl: 'https://play.google.com/store/apps/details?id=io.typhonwallet.app',
        packageName: 'io.typhonwallet.app',
      },
    },
  },
  flint: {
    name: 'flint',
    displayName: 'Flint',
    icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiByeD0iMTAiIGZpbGw9IiNGRjQ3NTciLz4KPHBhdGggZD0iTTIwIDEwTDI4IDIwTDIwIDI2TDIwIDIwTDEyIDIwTDIwIDEwWiIgZmlsbD0id2hpdGUiLz4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyOCIgcj0iMyIgZmlsbD0id2hpdGUiLz4KPC9zdmc+Cg==',
    apiKey: 'flint',
    downloadUrl: 'https://flint-wallet.com/',
    description: 'Fast and lightweight Cardano wallet',
    mobileApp: {
      ios: {
        scheme: 'flint://',
        appStoreUrl: 'https://apps.apple.com/app/flint-wallet/id1555742083',
      },
      android: {
        scheme: 'flint://',
        playStoreUrl: 'https://play.google.com/store/apps/details?id=com.dcentwallet.flint',
        packageName: 'com.dcentwallet.flint',
      },
    },
  },
  lace: {
    name: 'lace',
    displayName: 'Lace',
    icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiByeD0iMTAiIGZpbGw9IiMwRTFCMjYiLz4KPHBhdGggZD0iTTEyIDEySDI4VjI4SDEyVjEyWiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIyIi8+CjxwYXRoIGQ9Ik0xNiAxNkgyNFYyNEgxNlYxNloiIGZpbGw9IndoaXRlIi8+CjxwYXRoIGQ9Ik0xOCAxOEgyMlYyMkgxOFYxOFoiIGZpbGw9IiMwRTFCMjYiLz4KPC9zdmc+Cg==',
    apiKey: 'lace',
    downloadUrl: 'https://www.lace.io/',
    description: 'Next-generation Cardano wallet by IOG',
    mobileApp: {
      ios: {
        scheme: 'lace://',
        appStoreUrl: 'https://apps.apple.com/app/lace-wallet/id6468903894',
      },
      android: {
        scheme: 'lace://',
        playStoreUrl: 'https://play.google.com/store/apps/details?id=io.lace.wallet',
        packageName: 'io.lace.wallet',
      },
    },
  },
  daedalus: {
    name: 'daedalus',
    displayName: 'Daedalus',
    icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiByeD0iMTAiIGZpbGw9IiMzQjgyRjYiLz4KPHBhdGggZD0iTTIwIDhMMzAgMTZMMjQgMjhMMTYgMjhMMTAgMTZMMjAgOFoiIGZpbGw9IndoaXRlIi8+CjxwYXRoIGQ9Ik0yMCAxNkwyNCAxOEwyMCAyMEwxNiAxOEwyMCAxNloiIGZpbGw9IiMzQjgyRjYiLz4KPC9zdmc+Cg==',
    apiKey: 'daedalus',
    downloadUrl: 'https://daedaluswallet.io/',
    description: 'Full-node Cardano wallet with maximum security',
    // Note: Daedalusは主にデスクトップウォレットのため、モバイル版は存在しない
    // mobileApp情報は意図的に追加しない
  },
  nufi: {
    name: 'nufi',
    displayName: 'NuFi',
    icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiByeD0iMTAiIGZpbGw9IiMwQ0E1NEMiLz4KPHBhdGggZD0iTTEyIDEySDIwVjIwSDI4VjI4SDIwVjIwSDEyVjEyWiIgZmlsbD0id2hpdGUiLz4KPGNpcmNsZSBjeD0iMjQiIGN5PSIxNiIgcj0iMiIgZmlsbD0iIzBDQTU0QyIvPgo8L3N2Zz4K',
    apiKey: 'nufi',
    downloadUrl: 'https://wallet.nu.fi/',
    description: 'Multi-chain wallet supporting Cardano',
    mobileApp: {
      ios: {
        scheme: 'nufi://',
        appStoreUrl: 'https://apps.apple.com/app/nufi/id1588915892',
      },
      android: {
        scheme: 'nufi://',
        playStoreUrl: 'https://play.google.com/store/apps/details?id=io.nufi.nufi',
        packageName: 'io.nufi.nufi',
      },
    },
  },
  gero: {
    name: 'gero',
    displayName: 'GeroWallet',
    icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiByeD0iMTAiIGZpbGw9IiNGRjk5MDAiLz4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMyIvPgo8Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSI0IiBmaWxsPSJ3aGl0ZSIvPgo8L3N2Zz4K',
    apiKey: 'gero',
    downloadUrl: 'https://gerowallet.io/',
    description: 'User-friendly Cardano wallet with DeFi integration',
    mobileApp: {
      ios: {
        scheme: 'gerowallet://',
        appStoreUrl: 'https://apps.apple.com/app/gero-wallet/id1580223637',
      },
      android: {
        scheme: 'gerowallet://',
        playStoreUrl: 'https://play.google.com/store/apps/details?id=io.gerowallet.mobile',
        packageName: 'io.gerowallet.mobile',
      },
    },
  },
};

/**
 * Get available wallets (installed and detected)
 */
export const getAvailableWallets = (): WalletInfo[] => {
  if (typeof window === 'undefined' || !window.cardano) {
    return [];
  }

  return Object.values(WALLET_CONFIG).filter(wallet => 
    window.cardano?.[wallet.apiKey as keyof typeof window.cardano]
  );
};

/**
 * Check if a specific wallet is installed
 */
export const isWalletInstalled = (walletName: WalletName): boolean => {
  if (typeof window === 'undefined' || !window.cardano) {
    return false;
  }

  const wallet = WALLET_CONFIG[walletName];
  return !!window.cardano[wallet.apiKey as keyof typeof window.cardano];
};

/**
 * Get wallet info by name
 */
export const getWalletInfo = (walletName: WalletName): WalletInfo => {
  return WALLET_CONFIG[walletName];
};