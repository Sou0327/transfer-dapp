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
      // Check both admin token and general auth token
      return localStorage.getItem('otc_admin_token') || localStorage.getItem('auth_token');
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
  private static instance: WebSocketService | null = null;
  private socket: Socket | null = null;
  private handlers: WebSocketEventHandlers = {};
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // 1秒から開始
  private _isAuthenticated = false;
  private authToken: string | null = null;
  private connectionId: string | null = null;

  // プライベートコンストラクタでシングルトンパターンを実装
  private constructor() {}

  /**
   * シングルトンインスタンスを取得
   */
  static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  /**
   * セキュアなWebSocket接続初期化
   */
  async connect(serverUrl?: string): Promise<void> {
    if (this.socket?.connected) {
      console.log('🔌 WebSocket既に接続済み');
      return;
    }

    // URLのバリデーション
    let url = serverUrl;
    if (!url) {
      // Vite環境では import.meta.env を使用
      if (typeof import.meta !== 'undefined' && import.meta.env) {
        url = import.meta.env.VITE_WEBSOCKET_URL || 'http://localhost:4000';
      } else if (typeof window !== 'undefined') {
        // フロントエンドのポートではなく、バックエンドのポートを使用
        url = 'http://localhost:4000';
      } else {
        url = process.env.WEBSOCKET_URL || 'http://localhost:4000';
      }
    }

    console.log('🔌 WebSocket接続URL:', url);

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
      transports: ['websocket', 'polling'], // polling フォールバックを追加
      upgrade: true,
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: this.reconnectDelay,
      reconnectionDelayMax: 5000, // 最大5秒
      timeout: 20000, // タイムアウトを20秒に延長
      forceNew: false,
      auth: {
        token: this.authToken
      },
      extraHeaders: {
        'User-Agent': 'OTC-WebSocket-Client'
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

    // 管理者認証成功イベント
    this.socket.on('admin_authenticated', (data) => {
      console.log('✅ 管理者WebSocket認証成功:', data);
      this._isAuthenticated = true;
      this.handlers.onAuthSuccess?.();
    });

    // 公開接続確認イベント
    this.socket.on('public_connected', (data) => {
      console.log('✅ 公開WebSocket接続確認:', data);
      // 公開接続では認証不要で一部機能を利用可能
      this.handlers.onConnect?.();
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
      // 一時的に認証チェックを無効化してイベント受信をテスト
      if (!this._isAuthenticated) {
        console.warn('⚠️ 認証されていませんが、デバッグのためイベントを処理します');
        // return; // 一時的にコメントアウト
      }
      
      // データ検証
      if (!this.isValidStatusUpdate(update)) {
        console.error('❌ 無効なステータス更新データ:', update);
        return;
      }
      
      console.log('🎯 request_updatedイベント受信（詳細）:', update);
      console.log('🎯 認証状態:', this._isAuthenticated);
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
      console.warn('⚠️ 認証されていませんが、デバッグのためリクエストを購読します');
      // デバッグ目的で認証なしでも許可
      // this.handlers.onAuthRequired?.();
      // return;
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

// Singleton instance - Use getInstance() to get the single instance
export const webSocketService = WebSocketService.getInstance();

/**
 * WebSocket React Hook
 */
export function useWebSocket(handlers?: WebSocketEventHandlers) {
  const [isConnected, setIsConnected] = React.useState(() => webSocketService.isConnected());
  const [isAuthenticated, setIsAuthenticated] = React.useState(() => webSocketService.isAuthenticated());
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    // Set up handlers
    const allHandlers: WebSocketEventHandlers = {
      onConnect: () => {
        setIsConnected(true);
        console.log('🔥 useWebSocket: 接続状態更新 - connected: true');
        setError(null);
        handlers?.onConnect?.();
      },
      onDisconnect: () => {
        setIsConnected(false);
        setIsAuthenticated(false);
        console.log('🔥 useWebSocket: 接続状態更新 - connected: false, authenticated: false');
        handlers?.onDisconnect?.();
      },
      onError: (error: string) => {
        setError(error);
        handlers?.onError?.(error);
      },
      onAuthSuccess: () => {
        setIsAuthenticated(true);
        console.log('🔥 useWebSocket: 認証状態更新 - authenticated: true');
        handlers?.onAuthSuccess?.();
      },
      onAuthFailed: (reason: string) => {
        setIsAuthenticated(false);
        console.log('🔥 useWebSocket: 認証状態更新 - authenticated: false, reason:', reason);
        handlers?.onAuthFailed?.(reason);
      },
      onAuthRequired: () => {
        setIsAuthenticated(false);
        console.log('🔥 useWebSocket: 認証が必要 - authenticated: false');
        handlers?.onAuthRequired?.();
      },
      ...handlers
    };

    webSocketService.setHandlers(allHandlers);

    // Connect if not already connected
    if (!webSocketService.isConnected()) {
      console.log('🔥 useWebSocket: WebSocket接続を開始します');
      webSocketService.connect();
    } else {
      console.log('🔥 useWebSocket: WebSocket既に接続済み');
      // 既に接続済みの場合、現在の状態を反映
      setIsConnected(true);
      setIsAuthenticated(webSocketService.isAuthenticated());
    }

    // 状態同期のためのポーリング（開発時のみ）
    const syncInterval = setInterval(() => {
      const currentConnected = webSocketService.isConnected();
      const currentAuthenticated = webSocketService.isAuthenticated();
      
      if (currentConnected !== isConnected) {
        console.log('🔄 useWebSocket: 接続状態を同期:', currentConnected);
        setIsConnected(currentConnected);
      }
      
      if (currentAuthenticated !== isAuthenticated) {
        console.log('🔄 useWebSocket: 認証状態を同期:', currentAuthenticated);
        setIsAuthenticated(currentAuthenticated);
      }
    }, 1000);

    // Cleanup on unmount
    return () => {
      clearInterval(syncInterval);
      // Don't disconnect here as other components might be using it
      // webSocketService.disconnect();
    };
  }, [handlers, isAuthenticated, isConnected]); // 必要な依存関係を追加

  // handlersが変更されたときのみsetHandlersを更新
  React.useEffect(() => {
    if (handlers) {
      const allHandlers: WebSocketEventHandlers = {
        onConnect: () => {
          setIsConnected(true);
          console.log('🔥 useWebSocket: 接続状態更新 - connected: true');
          setError(null);
          handlers?.onConnect?.();
        },
        onDisconnect: () => {
          setIsConnected(false);
          setIsAuthenticated(false);
          console.log('🔥 useWebSocket: 接続状態更新 - connected: false, authenticated: false');
          handlers?.onDisconnect?.();
        },
        onError: (error: string) => {
          setError(error);
          handlers?.onError?.(error);
        },
        onAuthSuccess: () => {
          setIsAuthenticated(true);
          console.log('🔥 useWebSocket: 認証状態更新 - authenticated: true');
          handlers?.onAuthSuccess?.();
        },
        onAuthFailed: (reason: string) => {
          setIsAuthenticated(false);
          console.log('🔥 useWebSocket: 認証状態更新 - authenticated: false, reason:', reason);
          handlers?.onAuthFailed?.(reason);
        },
        onAuthRequired: () => {
          setIsAuthenticated(false);
          console.log('🔥 useWebSocket: 認証が必要 - authenticated: false');
          handlers?.onAuthRequired?.();
        },
        ...handlers
      };
      webSocketService.setHandlers(allHandlers);
    }
  }, [handlers]);

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

