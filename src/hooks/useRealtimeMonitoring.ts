/**
 * Real-time Monitoring Hook
 * Provides comprehensive real-time monitoring for OTC requests
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRequestStatus, webSocketService, StatusUpdate, TTLUpdate, UTxOUpdate } from '../lib/websocket';

export interface MonitoringState {
  // Connection status
  isConnected: boolean;
  lastUpdate: Date | null;
  error: string | null;
  
  // Request status
  currentStatus: StatusUpdate | null;
  statusHistory: StatusUpdate[];
  
  // TTL monitoring
  ttlInfo: TTLUpdate | null;
  isExpiringSoon: boolean;
  isExpired: boolean;
  
  // UTxO monitoring
  utxoInfo: UTxOUpdate | null;
  isUTxOConsumed: boolean;
}

export interface MonitoringOptions {
  requestId?: string;
  enableStatusMonitoring?: boolean;
  enableTTLMonitoring?: boolean;
  enableUTxOMonitoring?: boolean;
  warningThresholdMinutes?: number;
  criticalThresholdMinutes?: number;
  onStatusChange?: (status: StatusUpdate) => void;
  onTTLWarning?: (ttl: TTLUpdate) => void;
  onUTxOConsumed?: (utxo: UTxOUpdate) => void;
  onExpired?: () => void;
  onError?: (error: string) => void;
}

const DEFAULT_OPTIONS: Partial<MonitoringOptions> = {
  enableStatusMonitoring: true,
  enableTTLMonitoring: true,
  enableUTxOMonitoring: true,
  warningThresholdMinutes: 10,
  criticalThresholdMinutes: 2
};

export function useRealtimeMonitoring(options: MonitoringOptions = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const [state, setState] = useState<MonitoringState>({
    isConnected: false,
    lastUpdate: null,
    error: null,
    currentStatus: null,
    statusHistory: [],
    ttlInfo: null,
    isExpiringSoon: false,
    isExpired: false,
    utxoInfo: null,
    isUTxOConsumed: false
  });

  const statusHistoryRef = useRef<StatusUpdate[]>([]);
  const warningShownRef = useRef<boolean>(false);

  // Update state helper
  const updateState = useCallback((updates: Partial<MonitoringState>) => {
    setState(prev => ({
      ...prev,
      ...updates,
      lastUpdate: new Date()
    }));
  }, []);

  // Handle status updates
  const handleStatusUpdate = useCallback((update: StatusUpdate) => {
    // Add to history
    statusHistoryRef.current = [update, ...statusHistoryRef.current.slice(0, 9)]; // Keep last 10 updates

    updateState({
      currentStatus: update,
      statusHistory: [...statusHistoryRef.current]
    });

    // Call user callback
    opts.onStatusChange?.(update);

    console.log('📊 Status update received:', update);
  }, [opts.onStatusChange, updateState]);

  // Handle TTL updates
  const handleTTLUpdate = useCallback((update: TTLUpdate) => {
    const timeRemainingMinutes = update.time_remaining_seconds / 60;
    const isExpiringSoon = timeRemainingMinutes <= (opts.warningThresholdMinutes || 10);
    const isExpired = update.time_remaining_seconds <= 0;

    updateState({
      ttlInfo: update,
      isExpiringSoon,
      isExpired
    });

    // Handle warnings
    if (isExpired) {
      opts.onExpired?.();
    } else if (isExpiringSoon && !warningShownRef.current) {
      warningShownRef.current = true;
      opts.onTTLWarning?.(update);
    }

    console.log('⏰ TTL update received:', update);
  }, [opts.warningThresholdMinutes, opts.onExpired, opts.onTTLWarning, updateState]);

  // Handle UTxO updates
  const handleUTxOUpdate = useCallback((update: UTxOUpdate) => {
    updateState({
      utxoInfo: update,
      isUTxOConsumed: update.utxo_consumed
    });

    if (update.utxo_consumed) {
      opts.onUTxOConsumed?.(update);
    }

    console.log('💰 UTxO update received:', update);
  }, [opts.onUTxOConsumed, updateState]);

  // Handle connection status
  const handleConnection = useCallback(() => {
    updateState({
      isConnected: true,
      error: null
    });
    
    // Re-subscribe to request if specified
    if (opts.requestId) {
      webSocketService.subscribeToRequest(opts.requestId);
    }
  }, [opts.requestId, updateState]);

  const handleDisconnection = useCallback(() => {
    updateState({
      isConnected: false
    });
  }, [updateState]);

  const handleError = useCallback((error: string) => {
    updateState({
      error
    });
    opts.onError?.(error);
  }, [opts.onError, updateState]);

  // Use WebSocket hook with handlers
  const { isConnected } = useRequestStatus(opts.requestId);

  // Set up WebSocket handlers
  useEffect(() => {
    const handlers = {
      onConnect: handleConnection,
      onDisconnect: handleDisconnection,
      onError: handleError,
      ...(opts.enableStatusMonitoring && { onStatusUpdate: handleStatusUpdate }),
      ...(opts.enableTTLMonitoring && { onTTLUpdate: handleTTLUpdate }),
      ...(opts.enableUTxOMonitoring && { onUTxOUpdate: handleUTxOUpdate })
    };

    webSocketService.setHandlers(handlers);
  }, [
    opts.enableStatusMonitoring,
    opts.enableTTLMonitoring,
    opts.enableUTxOMonitoring,
    handleConnection,
    handleDisconnection,
    handleError,
    handleStatusUpdate,
    handleTTLUpdate,
    handleUTxOUpdate
  ]);

  // Update connection status
  useEffect(() => {
    updateState({ isConnected });
  }, [isConnected, updateState]);

  // Periodic health check
  useEffect(() => {
    if (!opts.requestId) return;

    const healthCheckInterval = setInterval(() => {
      if (webSocketService.isConnected()) {
        // Emit a ping to check if the request is still valid
        webSocketService.emit('health_check', { request_id: opts.requestId });
      }
    }, 30000); // Every 30 seconds

    return () => clearInterval(healthCheckInterval);
  }, [opts.requestId]);

  // Actions
  const actions = {
    /**
     * Force refresh status
     */
    refreshStatus: useCallback(() => {
      if (opts.requestId && webSocketService.isConnected()) {
        webSocketService.emit('request_status', { request_id: opts.requestId });
      }
    }, [opts.requestId]),

    /**
     * Subscribe to additional request
     */
    subscribeToRequest: useCallback((requestId: string) => {
      webSocketService.subscribeToRequest(requestId);
    }, []),

    /**
     * Unsubscribe from request
     */
    unsubscribeFromRequest: useCallback((requestId: string) => {
      webSocketService.unsubscribeFromRequest(requestId);
    }, []),

    /**
     * Reconnect WebSocket
     */
    reconnect: useCallback(() => {
      warningShownRef.current = false; // Reset warning flag
      webSocketService.reconnect();
    }, []),

    /**
     * Clear error state
     */
    clearError: useCallback(() => {
      updateState({ error: null });
    }, [updateState]),

    /**
     * Clear status history
     */
    clearHistory: useCallback(() => {
      statusHistoryRef.current = [];
      updateState({ statusHistory: [] });
    }, [updateState])
  };

  return {
    // State
    ...state,
    
    // Computed properties
    hasRecentActivity: state.lastUpdate && (Date.now() - state.lastUpdate.getTime()) < 60000,
    isHealthy: state.isConnected && !state.error,
    
    // Actions
    ...actions
  };
}

/**
 * Simplified hook for basic status monitoring
 */
export function useRequestMonitoring(requestId?: string) {
  const monitoring = useRealtimeMonitoring({
    requestId,
    enableStatusMonitoring: true,
    enableTTLMonitoring: false,
    enableUTxOMonitoring: false
  });

  return {
    status: monitoring.currentStatus,
    isConnected: monitoring.isConnected,
    error: monitoring.error,
    refresh: monitoring.refreshStatus
  };
}

/**
 * Hook specifically for TTL monitoring with countdown
 */
export function useTTLMonitoring(
  requestId?: string, 
  onWarning?: (timeRemaining: number) => void,
  onExpired?: () => void
) {
  const monitoring = useRealtimeMonitoring({
    requestId,
    enableStatusMonitoring: false,
    enableTTLMonitoring: true,
    enableUTxOMonitoring: false,
    onTTLWarning: (ttl) => onWarning?.(ttl.time_remaining_seconds),
    onExpired
  });

  return {
    ttlInfo: monitoring.ttlInfo,
    isExpiringSoon: monitoring.isExpiringSoon,
    isExpired: monitoring.isExpired,
    isConnected: monitoring.isConnected,
    timeRemaining: monitoring.ttlInfo?.time_remaining_seconds || 0
  };
}

/**
 * Hook for admin dashboard monitoring (multiple requests)
 */
export function useAdminMonitoring(adminId?: string) {
  const [requests, setRequests] = useState<Map<string, MonitoringState>>(new Map());

  useEffect(() => {
    if (!adminId) return;

    // Subscribe to admin updates
    webSocketService.subscribeToAdminUpdates(adminId);

    const handleAdminUpdate = (update: Record<string, unknown>) => {
      const { request_id } = update;
      
      setRequests(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(request_id) || {
          isConnected: true,
          lastUpdate: new Date(),
          error: null,
          currentStatus: null,
          statusHistory: [],
          ttlInfo: null,
          isExpiringSoon: false,
          isExpired: false,
          utxoInfo: null,
          isUTxOConsumed: false
        };

        newMap.set(request_id, {
          ...existing,
          currentStatus: update,
          lastUpdate: new Date()
        });

        return newMap;
      });
    };

    webSocketService.setHandlers({
      onStatusUpdate: handleAdminUpdate
    });

    return () => {
      // Cleanup handled by WebSocket service
    };
  }, [adminId]);

  return {
    requests: Array.from(requests.values()),
    requestsMap: requests,
    totalRequests: requests.size,
    activeRequests: Array.from(requests.values()).filter(r => 
      r.currentStatus && !['CONFIRMED', 'FAILED', 'EXPIRED'].includes(r.currentStatus.status)
    ).length
  };
}