/**
 * WebSocket hook for real-time updates
 */
import { useEffect, useRef, useState, useCallback } from 'react';

interface WebSocketState {
  isConnected: boolean;
  lastMessage: any;
  error: string | null;
}

interface UseWebSocketReturn extends WebSocketState {
  sendMessage: (message: any) => void;
  connect: () => void;
  disconnect: () => void;
}

export const useWebSocket = (url?: string): UseWebSocketReturn => {
  const [state, setState] = useState<WebSocketState>({
    isConnected: false,
    lastMessage: null,
    error: null,
  });
  
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (!url || wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setState(prev => ({ ...prev, isConnected: true, error: null }));
      };

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        setState(prev => ({ ...prev, lastMessage: message }));
      };

      ws.onerror = (error) => {
        setState(prev => ({ ...prev, error: 'WebSocket error occurred' }));
      };

      ws.onclose = () => {
        setState(prev => ({ ...prev, isConnected: false }));
      };
    } catch (error) {
      setState(prev => ({ ...prev, error: 'Failed to connect to WebSocket' }));
    }
  }, [url]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    ...state,
    sendMessage,
    connect,
    disconnect,
  };
};