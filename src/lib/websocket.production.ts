/**
 * Production WebSocket Client - Server-Side Only
 * 本番環境では管理画面はサーバーレス関数として動作するため、WebSocketクライアントは無効
 */
import * as React from 'react';

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

// No-op WebSocket service for production
class NoOpWebSocketService {
  private static instance: NoOpWebSocketService | null = null;

  private constructor() {}

  static getInstance(): NoOpWebSocketService {
    if (!NoOpWebSocketService.instance) {
      NoOpWebSocketService.instance = new NoOpWebSocketService();
    }
    return NoOpWebSocketService.instance;
  }

  async connect(): Promise<void> {
    console.log('🔌 WebSocket disabled in production environment');
  }

  setHandlers(_handlers: WebSocketEventHandlers): void {
    // No-op
  }

  subscribeToRequest(_requestId: string): void {
    console.log('🔔 WebSocket subscription disabled in production');
  }

  unsubscribeFromRequest(_requestId: string): void {
    // No-op
  }

  subscribeToAdminUpdates(_adminId: string): void {
    console.log('👤 Admin WebSocket disabled in production');
  }

  emit(_event: string, _data: unknown): void {
    console.warn('⚠️ WebSocket emit disabled in production');
  }

  isConnected(): boolean {
    return false;
  }

  isAuthenticated(): boolean {
    return false;
  }

  reconnect(): void {
    console.log('🔄 WebSocket reconnect disabled in production');
  }

  disconnect(): void {
    // No-op
  }

  updateAuthToken(_token: string): void {
    // No-op
  }

  getSocket(): null {
    return null;
  }
}

export const webSocketService = NoOpWebSocketService.getInstance();

/**
 * Production WebSocket React Hook - Always returns disconnected state
 */
export function useWebSocket(handlers?: WebSocketEventHandlers) {
  const [isConnected] = React.useState(false);
  const [isAuthenticated] = React.useState(false);
  const [error] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (handlers?.onConnect) {
      console.log('WebSocket handlers set but WebSocket disabled in production');
    }
  }, [handlers]);

  return {
    isConnected,
    isAuthenticated,
    error,
    subscribe: (_requestId: string) => console.log('WebSocket subscribe disabled in production'),
    unsubscribe: (_requestId: string) => console.log('WebSocket unsubscribe disabled in production'),
    emit: (_event: string, _data: unknown) => console.warn('WebSocket emit disabled in production'),
    reconnect: () => console.log('WebSocket reconnect disabled in production')
  };
}

/**
 * Production Request Status Hook - Returns empty state
 */
export function useRequestStatus(_requestId?: string) {
  const [status] = React.useState<StatusUpdate | null>(null);
  const [ttl] = React.useState<TTLUpdate | null>(null);
  const [utxo] = React.useState<UTxOUpdate | null>(null);

  return {
    status,
    ttl,
    utxo,
    isConnected: false
  };
}