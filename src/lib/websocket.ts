/**
 * セキュアなWebSocketクライアント - リアルタイムステータス更新
 * OTCリクエストステータス変更のリアルタイム通信を処理
 */
import * as React from 'react';
import { io, Socket } from 'socket.io-client';
// Auth utilities for token management
const authUtils = {
  getToken: (): string | null => {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem('auth_token');
    }
    return null;
  }
};

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

class WebSocketService {
  private socket: Socket | null = null;
  private handlers: WebSocketEventHandlers = {};
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // 1秒から開始
  private _isAuthenticated = false;
  private authToken: string | null = null;
  private connectionId: string | null = null;

  /**
   * セキュアなWebSocket接続初期化
   */
  connect(serverUrl?: string): void {
    if (this.socket?.connected) {
      console.warn('WebSocketは既に接続されています');
      return;
    }

    // URLのバリデーション
    let url = serverUrl;
    if (!url) {
      if (typeof window !== 'undefined') {
        url = window.location.origin;
      } else {
        url = process.env.WEBSOCKET_URL || 'http://localhost:4000';
      }
    }

    // URLのセキュリティチェック
    try {
      const parsedUrl = new URL(url);
      if (!['http:', 'https:', 'ws:', 'wss:'].includes(parsedUrl.protocol)) {
        throw new Error('無効なWebSocket URLプロトコルです');
      }
    } catch (error) {
      console.error('無効なWebSocket URL:', url, error);
      this.handlers.onError?.('無効なWebSocket URLです');
      return;
    }

    console.log('🔌 WebSocketサーバーに接続中:', url);

    // 認証トークンの取得
    this.authToken = authUtils.getToken();
    
    this.socket = io(url, {
      transports: ['websocket'], // websocketのみを使用（セキュリティ強化）
      upgrade: false,
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: this.reconnectDelay,
      reconnectionDelayMax: 5000, // 最大5秒
      timeout: 10000,
      forceNew: false,
      auth: {
        token: this.authToken
      },
      extraHeaders: {
        'X-Requested-With': 'XMLHttpRequest',
        'X-Client-Type': 'transfer-dapp'
      }
    });

    this.setupEventListeners();
  }

  /**
   * セキュアなWebSocketイベントリスナー設定
   */
  private setupEventListeners(): void {
    if (!this.socket) return;

    // 接続イベント
    this.socket.on('connect', () => {
      console.log('✅ WebSocketが接続されました');
      this.reconnectAttempts = 0;
      this.connectionId = this.socket?.id || null;
      
      // 認証トークンがある場合は認証を実行
      if (this.authToken) {
        this.authenticate();
      } else {
        this.handlers.onAuthRequired?.();
      }
      
      this.handlers.onConnect?.();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('❌ WebSocketが切断されました:', reason);
      this._isAuthenticated = false;
      this.connectionId = null;
      this.handlers.onDisconnect?.();
    });

    this.socket.on('connect_error', (_error) => {
      console.error('🔌 WebSocket接続エラー:', _error);
      this.reconnectAttempts++;
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.handlers.onError?.('最大再試行回数後に接続に失敗しました');
      }
    });

    // 認証イベント
    this.socket.on('authenticated', () => {
      console.log('✅ WebSocket認証成功');
      this._isAuthenticated = true;
      this.handlers.onAuthSuccess?.();
    });

    this.socket.on('authentication_failed', (data: { reason: string }) => {
      console.error('❌ WebSocket認証失敗:', data.reason);
      this._isAuthenticated = false;
      this.handlers.onAuthFailed?.(data.reason);
    });

    this.socket.on('auth_required', () => {
      console.warn('🔒 WebSocket認証が必要です');
      this.handlers.onAuthRequired?.();
    });

    // ビジネスロジックイベント (認証済みのみ受信)
    this.socket.on('request_updated', (update: StatusUpdate) => {
      if (!this._isAuthenticated) {
        console.warn('認証されていない状態でのステータス更新を無視します');
        return;
      }
      
      // データ検証
      if (!this.isValidStatusUpdate(update)) {
        console.error('無効なステータス更新データ:', update);
        return;
      }
      
      console.log('📊 リクエストステータス更新:', update);
      this.handlers.onStatusUpdate?.(update);
    });

    this.socket.on('ttl_update', (update: TTLUpdate) => {
      if (!this._isAuthenticated) return;
      
      if (!this.isValidTTLUpdate(update)) {
        console.error('無効なTTL更新データ:', update);
        return;
      }
      
      console.log('⏰ TTL更新:', update);
      this.handlers.onTTLUpdate?.(update);
    });

    this.socket.on('utxo_update', (update: UTxOUpdate) => {
      if (!this._isAuthenticated) return;
      
      if (!this.isValidUTxOUpdate(update)) {
        console.error('無効なUTxO更新データ:', update);
        return;
      }
      
      console.log('💰 UTxO更新:', update);
      this.handlers.onUTxOUpdate?.(update);
    });

    // エラーハンドリング
    this.socket.on('error', (error) => {
      console.error('🚨 WebSocketエラー:', error);
      this.handlers.onError?.(typeof error === 'string' ? error : '不明なエラーが発生しました');
    });

    // 管理者専用イベント
    this.socket.on('admin_alert', (alert: { type: string; message: string; timestamp?: number; severity?: string }) => {
      if (!this._isAuthenticated) return;
      
      if (!this.isValidAdminAlert(alert)) {
        console.error('無効な管理者アラート:', alert);
        return;
      }
      
      console.warn('🚨 管理者アラート:', alert);
    });

    // レート制限イベント
    this.socket.on('rate_limit_exceeded', (data: { limit: number; reset_time: number }) => {
      console.warn('🚨 レート制限超過:', data);
      this.handlers.onError?.(`レート制限を超過しました。${new Date(data.reset_time).toLocaleTimeString()}以降に再試行してください。`);
    });
  }

  /**
   * リクエスト更新の購読（認証済みのみ）
   */
  subscribeToRequest(requestId: string): void {
    if (!this.socket?.connected) {
      console.warn('WebSocketが接続されていないため、リクエストを購読できません');
      return;
    }

    if (!this._isAuthenticated) {
      console.warn('認証されていないため、リクエストを購読できません');
      this.handlers.onAuthRequired?.();
      return;
    }

    // リクエストIDの検証
    if (!this.isValidRequestId(requestId)) {
      console.error('無効なリクエストID:', requestId);
      return;
    }

    console.log('🔔 リクエスト更新を購読中:', requestId);
    this.socket.emit('subscribe_request', { 
      request_id: requestId,
      timestamp: Date.now()
    });
  }

  /**
   * Unsubscribe from request updates
   */
  unsubscribeFromRequest(requestId: string): void {
    if (!this.socket?.connected) {
      return;
    }

    console.log('🔕 Unsubscribing from request updates:', requestId);
    this.socket.emit('unsubscribe_request', { request_id: requestId });
  }

  /**
   * 管理者ダッシュボード更新の購読（認証済みのみ）
   */
  subscribeToAdminUpdates(adminId: string): void {
    if (!this.socket?.connected) {
      console.warn('WebSocketが接続されていないため、管理者更新を購読できません');
      return;
    }

    if (!this._isAuthenticated) {
      console.warn('認証されていないため、管理者更新を購読できません');
      this.handlers.onAuthRequired?.();
      return;
    }

    // 管理者IDの検証
    if (!adminId || typeof adminId !== 'string' || adminId.length > 100) {
      console.error('無効な管理者ID:', adminId);
      return;
    }

    console.log('👤 管理者更新を購読中:', adminId);
    this.socket.emit('subscribe_admin', { 
      admin_id: adminId,
      timestamp: Date.now()
    });
  }

  /**
   * Set event handlers
   */
  setHandlers(handlers: WebSocketEventHandlers): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  /**
   * セキュアなメッセージ送信
   */
  emit(event: string, data: unknown): void {
    if (!this.socket?.connected) {
      console.warn('WebSocketが接続されていないため、イベントを送信できません:', event);
      return;
    }

    if (!this._isAuthenticated && event !== 'authenticate') {
      console.warn('認証されていないため、イベントを送信できません:', event);
      this.handlers.onAuthRequired?.();
      return;
    }

    // イベント名の検証
    if (!this.isValidEventName(event)) {
      console.error('無効なイベント名:', event);
      return;
    }

    // データサイズ制限（100KB）
    const dataStr = JSON.stringify(data);
    if (dataStr.length > 100000) {
      console.error('データサイズが大きすぎます:', dataStr.length);
      return;
    }

    this.socket.emit(event, {
      ...data as Record<string, unknown>,
      timestamp: Date.now(),
      connection_id: this.connectionId
    });
  }

  /**
   * Get connection status
   */
  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  /**
   * Manually reconnect
   */
  reconnect(): void {
    if (this.socket) {
      console.log('🔄 Manual WebSocket reconnection');
      this.socket.connect();
    }
  }

  /**
   * Disconnect WebSocket
   */
  disconnect(): void {
    if (this.socket) {
      console.log('🔌 Disconnecting WebSocket');
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /**
   * 認証処理
   */
  private authenticate(): void {
    if (!this.socket || !this.authToken) return;

    this.socket.emit('authenticate', {
      token: this.authToken,
      timestamp: Date.now(),
      client_type: 'transfer-dapp'
    });
  }

  /**
   * データ検証メソッド
   */
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

  private isValidAdminAlert(alert: unknown): alert is { type: string; message: string; timestamp?: number; severity?: string } {
    if (!alert || typeof alert !== 'object') return false;
    const a = alert as Record<string, unknown>;
    return typeof a.type === 'string' && 
           typeof a.message === 'string' &&
           a.type.length > 0 &&
           a.type.length <= 50 &&
           a.message.length > 0 &&
           a.message.length <= 500;
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

  /**
   * 現在のソケットインスタンスを取得（デバッグ用）
   */
  getSocket(): Socket | null {
    return this.socket;
  }

  /**
   * 認証状態を取得
   */
  isAuthenticated(): boolean {
    return this._isAuthenticated;
  }

  /**
   * 認証トークンを更新
   */
  updateAuthToken(token: string): void {
    this.authToken = token;
    if (this.socket?.connected) {
      this.authenticate();
    }
  }
}

// Singleton instance
export const webSocketService = new WebSocketService();

/**
 * WebSocket React Hook
 */
export function useWebSocket(handlers?: WebSocketEventHandlers) {
  const [isConnected, setIsConnected] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    // Set up handlers
    const allHandlers: WebSocketEventHandlers = {
      onConnect: () => {
        setIsConnected(true);
        setError(null);
        handlers?.onConnect?.();
      },
      onDisconnect: () => {
        setIsConnected(false);
        handlers?.onDisconnect?.();
      },
      onError: (error: string) => {
        setError(error);
        handlers?.onError?.(error);
      },
      ...handlers
    };

    webSocketService.setHandlers(allHandlers);

    // Connect if not already connected
    if (!webSocketService.isConnected()) {
      webSocketService.connect();
    }

    // Cleanup on unmount
    return () => {
      // Don't disconnect here as other components might be using it
      // webSocketService.disconnect();
    };
  }, [handlers]);

  return {
    isConnected,
    error,
    subscribe: webSocketService.subscribeToRequest.bind(webSocketService),
    unsubscribe: webSocketService.unsubscribeFromRequest.bind(webSocketService),
    emit: webSocketService.emit.bind(webSocketService),
    reconnect: webSocketService.reconnect.bind(webSocketService)
  };
}

/**
 * Request Status Hook with WebSocket
 */
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
    if (requestId && isConnected) {
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

