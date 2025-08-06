/**
 * WebSocket Client - Environment-aware
 * 本番環境では無効化、開発環境でのみSocket.IOを使用
 */
import * as React from 'react';

// 型定義
export interface StatusUpdate extends Record<string, unknown> {
  request_id: string;
  status: 'REQUESTED' | 'SIGNED' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED' | 'EXPIRED';
  tx_hash?: string;
  timestamp: string;
  details?: unknown;
}

export interface TTLUpdate {
  request_id: string;
  ttl_slot: number;
  current_slot: number;
  time_remaining_seconds: number;
  status: 'active' | 'warning' | 'expired';
}

export interface UTxOUpdate {
  request_id: string;
  utxo_consumed: boolean;
  consuming_tx?: string;
  timestamp: string;
}

interface WebSocketEventHandlers {
  onStatusUpdate?: (update: StatusUpdate) => void;
  onTTLUpdate?: (update: TTLUpdate) => void;
  onUTxOUpdate?: (update: UTxOUpdate) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: string) => void;
  onAuthRequired?: () => void;
  onAuthSuccess?: () => void;
  onAuthFailed?: (reason: string) => void;
}

// 環境判定
const isProduction = import.meta.env.PROD;

console.log('🔧 WebSocket Environment:', { 
  MODE: import.meta.env.MODE, 
  PROD: import.meta.env.PROD,
  isProduction 
});

// WebSocketService クラス
class WebSocketService {
  private static instance: WebSocketService | null = null;
  private socket: any = null;
  private handlers: WebSocketEventHandlers = {};
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private _isAuthenticated = false;
  private authToken: string | null = null;
  private connectionId: string | null = null;

  private constructor() {}

  static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  async connect(serverUrl?: string): Promise<void> {
    if (isProduction) {
      console.log('🔌 WebSocket disabled in production environment');
      return;
    }

    if (this.socket?.connected) {
      console.log('🔌 WebSocket already connected');
      return;
    }

    try {
      // 動的インポートで socket.io-client をロード
      const { io } = await import('socket.io-client');
      
      const url = serverUrl || import.meta.env.VITE_WEBSOCKET_URL || 'http://localhost:4000';
      console.log('🔌 Connecting to WebSocket server:', url);

      // 認証トークンの取得
      this.authToken = this.getToken();
      
      this.socket = io(url, {
        transports: ['websocket', 'polling'],
        upgrade: true,
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.reconnectDelay,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        forceNew: false,
        auth: {
          token: this.authToken
        },
        extraHeaders: {
          'User-Agent': 'OTC-WebSocket-Client'
        }
      });

      this.setupEventListeners();
    } catch (error) {
      console.error('❌ Failed to load socket.io-client:', error);
      console.log('🔌 WebSocket functionality disabled');
    }
  }

  private getToken(): string | null {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem('otc_admin_token') || localStorage.getItem('auth_token');
    }
    return null;
  }

  private setupEventListeners(): void {
    if (!this.socket || isProduction) return;

    this.socket.on('connect', () => {
      console.log('✅ WebSocket connected');
      this.reconnectAttempts = 0;
      this.connectionId = this.socket?.id || null;
      
      if (this.authToken) {
        this.authenticate();
      } else {
        this.handlers.onAuthRequired?.();
      }
      
      this.handlers.onConnect?.();
    });

    this.socket.on('disconnect', (reason: string) => {
      console.log('❌ WebSocket disconnected:', reason);
      this._isAuthenticated = false;
      this.connectionId = null;
      this.handlers.onDisconnect?.();
    });

    this.socket.on('connect_error', (error: any) => {
      console.error('🔌 WebSocket connection error:', error);
      this.reconnectAttempts++;
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.handlers.onError?.('Max reconnection attempts reached');
      }
    });

    // 認証関連イベント
    this.socket.on('authenticated', () => {
      console.log('✅ WebSocket authenticated');
      this._isAuthenticated = true;
      this.handlers.onAuthSuccess?.();
    });

    this.socket.on('admin_authenticated', (data: any) => {
      console.log('✅ Admin WebSocket authenticated:', data);
      this._isAuthenticated = true;
      this.handlers.onAuthSuccess?.();
    });

    this.socket.on('public_connected', (data: any) => {
      console.log('✅ Public WebSocket connected:', data);
      this.handlers.onConnect?.();
    });

    this.socket.on('authentication_failed', (data: { reason: string }) => {
      console.error('❌ WebSocket authentication failed:', data.reason);
      this._isAuthenticated = false;
      this.handlers.onAuthFailed?.(data.reason);
    });

    this.socket.on('auth_required', () => {
      console.warn('🔒 WebSocket authentication required');
      this.handlers.onAuthRequired?.();
    });

    // ビジネスロジックイベント
    this.socket.on('request_updated', (update: StatusUpdate) => {
      if (this.isValidStatusUpdate(update)) {
        console.log('🎯 Request updated:', update);
        this.handlers.onStatusUpdate?.(update);
      }
    });

    this.socket.on('ttl_update', (update: TTLUpdate) => {
      if (this.isValidTTLUpdate(update)) {
        console.log('⏰ TTL update:', update);
        this.handlers.onTTLUpdate?.(update);
      }
    });

    this.socket.on('utxo_update', (update: UTxOUpdate) => {
      if (this.isValidUTxOUpdate(update)) {
        console.log('💰 UTxO update:', update);
        this.handlers.onUTxOUpdate?.(update);
      }
    });

    this.socket.on('error', (error: any) => {
      console.error('🚨 WebSocket error:', error);
      this.handlers.onError?.(typeof error === 'string' ? error : 'Unknown WebSocket error');
    });
  }

  private authenticate(): void {
    if (!this.socket || !this.authToken || isProduction) return;

    this.socket.emit('authenticate', {
      token: this.authToken,
      timestamp: Date.now(),
      client_type: 'transfer-dapp'
    });
  }

  setHandlers(handlers: WebSocketEventHandlers): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  subscribeToRequest(requestId: string): void {
    if (isProduction || !this.socket?.connected) {
      console.log('🔔 WebSocket subscription disabled in production');
      return;
    }

    if (!this.isValidRequestId(requestId)) {
      console.error('Invalid request ID:', requestId);
      return;
    }

    console.log('🔔 Subscribing to request updates:', requestId);
    this.socket.emit('subscribe_request', { 
      request_id: requestId,
      timestamp: Date.now()
    });
  }

  unsubscribeFromRequest(requestId: string): void {
    if (isProduction || !this.socket?.connected) return;

    console.log('🔕 Unsubscribing from request updates:', requestId);
    this.socket.emit('unsubscribe_request', { request_id: requestId });
  }

  subscribeToAdminUpdates(adminId: string): void {
    if (isProduction || !this.socket?.connected) {
      console.log('👤 Admin WebSocket disabled in production');
      return;
    }

    if (!adminId || typeof adminId !== 'string' || adminId.length > 100) {
      console.error('Invalid admin ID:', adminId);
      return;
    }

    console.log('👤 Subscribing to admin updates:', adminId);
    this.socket.emit('subscribe_admin', { 
      admin_id: adminId,
      timestamp: Date.now()
    });
  }

  emit(event: string, data: unknown): void {
    if (isProduction || !this.socket?.connected) {
      console.warn('WebSocket emit disabled in production:', event);
      return;
    }

    if (!this._isAuthenticated && event !== 'authenticate') {
      console.warn('Not authenticated, cannot emit event:', event);
      this.handlers.onAuthRequired?.();
      return;
    }

    if (!this.isValidEventName(event)) {
      console.error('Invalid event name:', event);
      return;
    }

    const dataStr = JSON.stringify(data);
    if (dataStr.length > 100000) {
      console.error('Data too large:', dataStr.length);
      return;
    }

    this.socket.emit(event, {
      ...data as Record<string, unknown>,
      timestamp: Date.now(),
      connection_id: this.connectionId
    });
  }

  isConnected(): boolean {
    return isProduction ? false : this.socket?.connected || false;
  }

  isAuthenticated(): boolean {
    return isProduction ? false : this._isAuthenticated;
  }

  reconnect(): void {
    if (isProduction) {
      console.log('🔄 WebSocket reconnect disabled in production');
      return;
    }

    if (this.socket) {
      console.log('🔄 Manual WebSocket reconnection');
      this.socket.connect();
    }
  }

  disconnect(): void {
    if (this.socket) {
      console.log('🔌 Disconnecting WebSocket');
      this.socket.disconnect();
      this.socket = null;
    }
  }

  updateAuthToken(token: string): void {
    this.authToken = token;
    if (this.socket?.connected && !isProduction) {
      this.authenticate();
    }
  }

  getSocket(): any {
    return isProduction ? null : this.socket;
  }

  // バリデーションメソッド
  private isValidStatusUpdate(update: unknown): update is StatusUpdate {
    if (!update || typeof update !== 'object') return false;
    const u = update as Record<string, unknown>;
    return typeof u.request_id === 'string' && 
           typeof u.status === 'string' &&
           typeof u.timestamp === 'string' &&
           u.request_id.length > 0 &&
           u.request_id.length <= 100;
  }

  private isValidTTLUpdate(update: unknown): update is TTLUpdate {
    if (!update || typeof update !== 'object') return false;
    const u = update as Record<string, unknown>;
    return typeof u.request_id === 'string' && 
           typeof u.ttl_slot === 'number' &&
           typeof u.current_slot === 'number' &&
           u.request_id.length > 0 &&
           u.request_id.length <= 100;
  }

  private isValidUTxOUpdate(update: unknown): update is UTxOUpdate {
    if (!update || typeof update !== 'object') return false;
    const u = update as Record<string, unknown>;
    return typeof u.request_id === 'string' && 
           typeof u.utxo_consumed === 'boolean' &&
           u.request_id.length > 0 &&
           u.request_id.length <= 100;
  }

  private isValidRequestId(requestId: string): boolean {
    return typeof requestId === 'string' && 
           requestId.length > 0 && 
           requestId.length <= 100 &&
           /^[a-zA-Z0-9_-]+$/.test(requestId);
  }

  private isValidEventName(event: string): boolean {
    const allowedEvents = [
      'authenticate', 'subscribe_request', 'unsubscribe_request', 
      'subscribe_admin', 'ping', 'heartbeat'
    ];
    return typeof event === 'string' && 
           event.length > 0 && 
           event.length <= 50 &&
           allowedEvents.includes(event);
  }
}

// シングルトンインスタンス
export const webSocketService = WebSocketService.getInstance();

// React Hooks
export function useWebSocket(handlers?: WebSocketEventHandlers) {
  const [isConnected, setIsConnected] = React.useState(() => webSocketService.isConnected());
  const [isAuthenticated, setIsAuthenticated] = React.useState(() => webSocketService.isAuthenticated());
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (isProduction) {
      console.log('🔌 WebSocket hooks disabled in production');
      return;
    }

    const allHandlers: WebSocketEventHandlers = {
      onConnect: () => {
        setIsConnected(true);
        setError(null);
        handlers?.onConnect?.();
      },
      onDisconnect: () => {
        setIsConnected(false);
        setIsAuthenticated(false);
        handlers?.onDisconnect?.();
      },
      onError: (error: string) => {
        setError(error);
        handlers?.onError?.(error);
      },
      onAuthSuccess: () => {
        setIsAuthenticated(true);
        handlers?.onAuthSuccess?.();
      },
      onAuthFailed: (reason: string) => {
        setIsAuthenticated(false);
        handlers?.onAuthFailed?.(reason);
      },
      onAuthRequired: () => {
        setIsAuthenticated(false);
        handlers?.onAuthRequired?.();
      },
      ...handlers
    };

    webSocketService.setHandlers(allHandlers);

    if (!webSocketService.isConnected()) {
      webSocketService.connect();
    } else {
      setIsConnected(true);
      setIsAuthenticated(webSocketService.isAuthenticated());
    }

    const syncInterval = setInterval(() => {
      const currentConnected = webSocketService.isConnected();
      const currentAuthenticated = webSocketService.isAuthenticated();
      
      if (currentConnected !== isConnected) {
        setIsConnected(currentConnected);
      }
      
      if (currentAuthenticated !== isAuthenticated) {
        setIsAuthenticated(currentAuthenticated);
      }
    }, 1000);

    return () => {
      clearInterval(syncInterval);
    };
  }, [handlers, isAuthenticated, isConnected]);

  return {
    isConnected,
    isAuthenticated,
    error,
    subscribe: webSocketService.subscribeToRequest.bind(webSocketService),
    unsubscribe: webSocketService.unsubscribeFromRequest.bind(webSocketService),
    emit: webSocketService.emit.bind(webSocketService),
    reconnect: webSocketService.reconnect.bind(webSocketService)
  };
}

export function useRequestStatus(requestId?: string) {
  const [status, setStatus] = React.useState<StatusUpdate | null>(null);
  const [ttl, setTTL] = React.useState<TTLUpdate | null>(null);
  const [utxo, setUTxO] = React.useState<UTxOUpdate | null>(null);

  const { isConnected, subscribe, unsubscribe } = useWebSocket({
    onStatusUpdate: (update) => {
      if (!requestId || update.request_id === requestId) {
        setStatus(update);
      }
    },
    onTTLUpdate: (update) => {
      if (!requestId || update.request_id === requestId) {
        setTTL(update);
      }
    },
    onUTxOUpdate: (update) => {
      if (!requestId || update.request_id === requestId) {
        setUTxO(update);
      }
    }
  });

  React.useEffect(() => {
    if (requestId && isConnected && !isProduction) {
      subscribe(requestId);
      return () => unsubscribe(requestId);
    }
  }, [requestId, isConnected, subscribe, unsubscribe]);

  return {
    status,
    ttl,
    utxo,
    isConnected
  };
}