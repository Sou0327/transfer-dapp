/**
 * Countdown Badge Component
 * Displays TTL countdown with real-time updates and visual indicators
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useRequestStatus } from '../lib/websocket';

interface CountdownBadgeProps {
  requestId?: string;
  ttlSlot: number;
  currentSlot?: number;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  showLabel?: boolean;
  onExpired?: () => void;
  onWarning?: (timeRemaining: number) => void;
}

interface TimeRemaining {
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
}

// Cardano slot duration (1 second per slot)
const SLOT_DURATION_MS = 1000;
const WARNING_THRESHOLD_MINUTES = 10;
const CRITICAL_THRESHOLD_MINUTES = 2;

export const CountdownBadge: React.FC<CountdownBadgeProps> = ({
  requestId,
  ttlSlot,
  currentSlot,
  className = '',
  size = 'md',
  showIcon = true,
  showLabel = true,
  onExpired,
  onWarning
}) => {
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining>({
    hours: 0,
    minutes: 0,
    seconds: 0,
    totalSeconds: 0
  });
  const [status, setStatus] = useState<'active' | 'warning' | 'critical' | 'expired'>('active');
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now());

  // Use WebSocket for real-time updates
  const { ttl: ttlUpdate, isConnected } = useRequestStatus(requestId);

  // Calculate time remaining
  const calculateTimeRemaining = useCallback((current: number, ttl: number): TimeRemaining => {
    const slotsRemaining = Math.max(0, ttl - current);
    const totalSeconds = slotsRemaining; // 1 slot = 1 second in Cardano

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return {
      hours,
      minutes,
      seconds,
      totalSeconds
    };
  }, []);

  // Update time remaining from WebSocket or props
  useEffect(() => {
    let effectiveCurrentSlot = currentSlot;
    
    // Use WebSocket data if available
    if (ttlUpdate && ttlUpdate.request_id === requestId) {
      effectiveCurrentSlot = ttlUpdate.current_slot;
      setLastUpdateTime(Date.now());
    }

    if (effectiveCurrentSlot !== undefined) {
      const newTimeRemaining = calculateTimeRemaining(effectiveCurrentSlot, ttlSlot);
      setTimeRemaining(newTimeRemaining);

      // Determine status
      const totalMinutes = newTimeRemaining.totalSeconds / 60;
      
      if (newTimeRemaining.totalSeconds <= 0) {
        setStatus('expired');
        onExpired?.();
      } else if (totalMinutes <= CRITICAL_THRESHOLD_MINUTES) {
        setStatus('critical');
        onWarning?.(newTimeRemaining.totalSeconds);
      } else if (totalMinutes <= WARNING_THRESHOLD_MINUTES) {
        setStatus('warning');
        onWarning?.(newTimeRemaining.totalSeconds);
      } else {
        setStatus('active');
      }
    }
  }, [ttlUpdate, currentSlot, ttlSlot, requestId, calculateTimeRemaining, onExpired, onWarning]);

  // Local countdown timer (for smooth updates between WebSocket messages)
  useEffect(() => {
    if (status === 'expired' || timeRemaining.totalSeconds <= 0) {
      return;
    }

    const interval = setInterval(() => {
      const timeSinceLastUpdate = Math.floor((Date.now() - lastUpdateTime) / 1000);
      const estimatedCurrentSlot = (currentSlot || 0) + timeSinceLastUpdate;
      
      const newTimeRemaining = calculateTimeRemaining(estimatedCurrentSlot, ttlSlot);
      
      if (newTimeRemaining.totalSeconds <= 0) {
        setStatus('expired');
        setTimeRemaining({ hours: 0, minutes: 0, seconds: 0, totalSeconds: 0 });
        onExpired?.();
        clearInterval(interval);
      } else {
        setTimeRemaining(newTimeRemaining);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [timeRemaining.totalSeconds, status, lastUpdateTime, currentSlot, ttlSlot, calculateTimeRemaining, onExpired]);

  // Format time display
  const formatTime = (time: TimeRemaining): string => {
    if (time.totalSeconds <= 0) return '期限切れ';
    
    if (time.hours > 0) {
      return `${time.hours}時間${time.minutes}分`;
    } else if (time.minutes > 0) {
      return `${time.minutes}分${time.seconds}秒`;
    } else {
      return `${time.seconds}秒`;
    }
  };

  // Get status colors and styles
  const getStatusStyles = () => {
    const baseClasses = {
      sm: 'px-2 py-1 text-xs',
      md: 'px-3 py-1.5 text-sm',
      lg: 'px-4 py-2 text-base'
    };

    const statusColors = {
      active: 'bg-green-100 text-green-800 border-green-200',
      warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      critical: 'bg-red-100 text-red-800 border-red-200 animate-pulse',
      expired: 'bg-gray-100 text-gray-600 border-gray-200'
    };

    return `${baseClasses[size]} ${statusColors[status]} inline-flex items-center border rounded-full font-medium`;
  };

  // Get status icon
  const getStatusIcon = () => {
    const iconClasses = size === 'sm' ? 'h-3 w-3' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4';
    
    switch (status) {
      case 'active':
        return (
          <svg className={`${iconClasses} text-green-500`} fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
        );
      case 'warning':
        return (
          <svg className={`${iconClasses} text-yellow-500`} fill="currentColor" viewBox="0 0 24 24">
            <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
          </svg>
        );
      case 'critical':
        return (
          <svg className={`${iconClasses} text-red-500`} fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
        );
      case 'expired':
        return (
          <svg className={`${iconClasses} text-gray-500`} fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11H7v-2h10v2z"/>
          </svg>
        );
      default:
        return null;
    }
  };

  // Connection indicator
  const ConnectionIndicator = () => {
    if (!requestId) return null;
    
    return (
      <div className="ml-2 flex items-center">
        <div 
          className={`h-2 w-2 rounded-full ${
            isConnected ? 'bg-green-400' : 'bg-gray-400'
          }`}
          title={isConnected ? 'リアルタイム接続中' : '接続なし'}
        />
      </div>
    );
  };

  return (
    <div className={`inline-flex items-center ${className}`}>
      <span className={getStatusStyles()}>
        {showIcon && (
          <span className="mr-1">
            {getStatusIcon()}
          </span>
        )}
        
        {showLabel && (
          <span className="mr-1">
            {status === 'expired' ? '期限:' : 'TTL:'}
          </span>
        )}
        
        <span className="font-mono">
          {formatTime(timeRemaining)}
        </span>
      </span>
      
      <ConnectionIndicator />
      
      {/* Additional info tooltip */}
      {size !== 'sm' && (
        <div className="ml-2 group relative">
          <svg className="h-4 w-4 text-gray-400 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
            <div className="text-center">
              <div>TTLスロット: {ttlSlot.toLocaleString()}</div>
              {currentSlot && (
                <div>現在スロット: {currentSlot.toLocaleString()}</div>
              )}
              <div>残りスロット: {Math.max(0, ttlSlot - (currentSlot || 0)).toLocaleString()}</div>
              {requestId && (
                <div className="mt-1 pt-1 border-t border-gray-700">
                  リアルタイム更新: {isConnected ? '有効' : '無効'}
                </div>
              )}
            </div>
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
          </div>
        </div>
      )}
    </div>
  );
};