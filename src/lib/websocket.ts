/**
 * WebSocket Client for Real-time Status Updates
 * Handles real-time communication for OTC request status changes
 */
import { io, Socket } from 'socket.io-client';

export interface StatusUpdate {
  request_id: string;
  status: 'REQUESTED' | 'SIGNED' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED' | 'EXPIRED';
  tx_hash?: string;
  timestamp: string;
  details?: any;
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
}

class WebSocketService {
  private socket: Socket | null = null;
  private handlers: WebSocketEventHandlers = {};
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second

  /**
   * Initialize WebSocket connection
   */
  connect(serverUrl?: string): void {
    if (this.socket?.connected) {
      console.warn('WebSocket already connected');
      return;
    }

    const url = serverUrl || 
                 (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4000');

    console.log('🔌 Connecting to WebSocket server:', url);

    this.socket = io(url, {
      transports: ['websocket', 'polling'],
      upgrade: true,
      rememberUpgrade: true,
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: this.reconnectDelay,
      timeout: 10000,
      forceNew: false
    });

    this.setupEventListeners();
  }

  /**
   * Setup WebSocket event listeners
   */
  private setupEventListeners(): void {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', () => {
      console.log('✅ WebSocket connected');
      this.reconnectAttempts = 0;
      this.handlers.onConnect?.();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('❌ WebSocket disconnected:', reason);
      this.handlers.onDisconnect?.();
    });

    this.socket.on('connect_error', (error) => {
      console.error('🔌 WebSocket connection error:', error);
      this.reconnectAttempts++;
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.handlers.onError?.('Connection failed after maximum retry attempts');
      }
    });

    // Business logic events
    this.socket.on('request_updated', (update: StatusUpdate) => {
      console.log('📊 Request status update:', update);
      this.handlers.onStatusUpdate?.(update);
    });

    this.socket.on('ttl_update', (update: TTLUpdate) => {
      console.log('⏰ TTL update:', update);
      this.handlers.onTTLUpdate?.(update);
    });

    this.socket.on('utxo_update', (update: UTxOUpdate) => {
      console.log('💰 UTxO update:', update);
      this.handlers.onUTxOUpdate?.(update);
    });

    // Error handling
    this.socket.on('error', (error) => {
      console.error('🚨 WebSocket error:', error);
      this.handlers.onError?.(error.toString());
    });

    // Admin-specific events
    this.socket.on('admin_alert', (alert: any) => {
      console.warn('🚨 Admin alert:', alert);
    });
  }

  /**
   * Subscribe to request updates
   */
  subscribeToRequest(requestId: string): void {
    if (!this.socket?.connected) {
      console.warn('WebSocket not connected, cannot subscribe to request');
      return;
    }

    console.log('🔔 Subscribing to request updates:', requestId);
    this.socket.emit('subscribe_request', { request_id: requestId });
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
   * Subscribe to admin dashboard updates
   */
  subscribeToAdminUpdates(adminId: string): void {
    if (!this.socket?.connected) {
      console.warn('WebSocket not connected, cannot subscribe to admin updates');
      return;
    }

    console.log('👤 Subscribing to admin updates:', adminId);
    this.socket.emit('subscribe_admin', { admin_id: adminId });
  }

  /**
   * Set event handlers
   */
  setHandlers(handlers: WebSocketEventHandlers): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  /**
   * Send a message to server
   */
  emit(event: string, data: any): void {
    if (!this.socket?.connected) {
      console.warn('WebSocket not connected, cannot emit event:', event);
      return;
    }

    this.socket.emit(event, data);
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
   * Get current socket instance (for debugging)
   */
  getSocket(): Socket | null {
    return this.socket;
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
  }, []);

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
  }, [requestId, isConnected]);

  return {
    status,
    ttl,
    utxo,
    isConnected
  };
}

// Import React for hooks
import * as React from 'react';