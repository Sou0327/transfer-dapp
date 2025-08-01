/**
 * UI State Slice
 * Manages user interface state, theme, modals, and navigation
 */

import { StateCreator } from 'zustand';

export type ThemeType = 'light' | 'dark' | 'auto';
export type ViewType = 'dashboard' | 'transfer' | 'utxo' | 'admin' | 'signing';

export interface UiState {
  theme: ThemeType;
  activeView: ViewType;
  modals: {
    walletSelect: boolean;
    coinControl: boolean;
    txPreview: boolean;
    settings: boolean;
    about: boolean;
  };
  notifications: Array<{
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    message: string;
    description?: string;
    timestamp: string;
    autoClose?: boolean;
    duration?: number;
  }>;
  preferences: {
    autoRefreshUtxos: boolean;
    refreshInterval: number;
    showAdvancedFeatures: boolean;
    virtualizationThreshold: number;
    confirmTransactions: boolean;
    soundEnabled: boolean;
    animationsEnabled: boolean;
  };
  layout: {
    sidebarCollapsed: boolean;
    contentWidth: 'narrow' | 'wide' | 'full';
  };
  performance: {
    enableVirtualization: boolean;
    enableLazyLoading: boolean;
    debugMode: boolean;
  };
}

export interface UiActions {
  setTheme: (theme: ThemeType) => void;
  setActiveView: (view: ViewType) => void;
  toggleModal: (modal: keyof UiState['modals'], open?: boolean) => void;
  addNotification: (notification: Omit<UiState['notifications'][0], 'id' | 'timestamp'>) => void;
  removeNotification: (id: string) => void;
  clearAllNotifications: () => void;
  updatePreferences: (preferences: Partial<UiState['preferences']>) => void;
  updateLayout: (layout: Partial<UiState['layout']>) => void;
  updatePerformanceSettings: (settings: Partial<UiState['performance']>) => void;
}

export interface UiSlice {
  ui: UiState;
  setTheme: UiActions['setTheme'];
  setActiveView: UiActions['setActiveView'];
  toggleModal: UiActions['toggleModal'];
  addNotification: UiActions['addNotification'];
  removeNotification: UiActions['removeNotification'];
  clearAllNotifications: UiActions['clearAllNotifications'];
  updatePreferences: UiActions['updatePreferences'];
  updateLayout: UiActions['updateLayout'];
  updatePerformanceSettings: UiActions['updatePerformanceSettings'];
}

const initialUiState: UiState = {
  theme: 'auto',
  activeView: 'dashboard',
  modals: {
    walletSelect: false,
    coinControl: false,
    txPreview: false,
    settings: false,
    about: false,
  },
  notifications: [],
  preferences: {
    autoRefreshUtxos: true,
    refreshInterval: 30000, // 30 seconds
    showAdvancedFeatures: false,
    virtualizationThreshold: 100,
    confirmTransactions: true,
    soundEnabled: true,
    animationsEnabled: true,
  },
  layout: {
    sidebarCollapsed: false,
    contentWidth: 'wide',
  },
  performance: {
    enableVirtualization: true,
    enableLazyLoading: true,
    debugMode: import.meta.env.NODE_ENV === 'development' || import.meta.env.DEV,
  },
};

export const createUiSlice: StateCreator<
  UiSlice,
  [],
  [],
  UiSlice
> = (set, get) => ({
  ui: initialUiState,

  setTheme: (theme: ThemeType) => {
    set((state) => ({
      ...state,
      ui: {
        ...state.ui,
        theme: theme,
      },
    }));

    // Apply theme to document
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else if (theme === 'light') {
      root.classList.remove('dark');
    } else {
      // Auto theme - detect system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    }
  },

  setActiveView: (view: ViewType) => {
    set((state) => ({
      ...state,
      ui: {
        ...state.ui,
        activeView: view,
      },
    }));
  },

  toggleModal: (modal: keyof UiState['modals'], open?: boolean) => {
    set((state) => ({
      ...state,
      ui: {
        ...state.ui,
        modals: {
          ...state.ui.modals,
          [modal]: typeof open === 'boolean' ? open : !state.ui.modals[modal],
        },
      },
    }));
  },

  addNotification: (notification) => {
    const id = `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    set((state) => ({
      ...state,
      ui: {
        ...state.ui,
        notifications: [
          ...state.ui.notifications,
          {
            ...notification,
            id,
            timestamp: new Date().toISOString(),
          },
        ],
      },
    }));

    // Auto-remove notification if specified
    if (notification.autoClose !== false) {
      const duration = notification.duration || (notification.type === 'error' ? 10000 : 5000);
      setTimeout(() => {
        get().removeNotification(id);
      }, duration);
    }
  },

  removeNotification: (id: string) => {
    set((state) => ({
      ...state,
      ui: {
        ...state.ui,
        notifications: state.ui.notifications.filter(n => n.id !== id),
      },
    }));
  },

  clearAllNotifications: () => {
    set((state) => ({
      ...state,
      ui: {
        ...state.ui,
        notifications: [],
      },
    }));
  },

  updatePreferences: (preferences: Partial<UiState['preferences']>) => {
    set((state) => ({
      ...state,
      ui: {
        ...state.ui,
        preferences: {
          ...state.ui.preferences,
          ...preferences,
        },
      },
    }));
  },

  updateLayout: (layout: Partial<UiState['layout']>) => {
    set((state) => ({
      ...state,
      ui: {
        ...state.ui,
        layout: {
          ...state.ui.layout,
          ...layout,
        },
      },
    }));
  },

  updatePerformanceSettings: (settings: Partial<UiState['performance']>) => {
    set((state) => ({
      ...state,
      ui: {
        ...state.ui,
        performance: {
          ...state.ui.performance,
          ...settings,
        },
      },
    }));
  },
});