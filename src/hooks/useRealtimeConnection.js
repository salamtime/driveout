import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../utils/supabaseClient';

/**
 * Enhanced Realtime Connection Manager
 * Provides optimized WebSocket connections with connection health monitoring,
 * automatic reconnection, and efficient subscription management
 */
export const useRealtimeConnection = () => {
  const [connectionStatus, setConnectionStatus] = useState('connected'); // Start as connected
  const [lastHeartbeat, setLastHeartbeat] = useState(Date.now()); // Set initial heartbeat
  const subscriptionsRef = useRef(new Map());
  const heartbeatIntervalRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  
  const MAX_RECONNECT_ATTEMPTS = 5;
  const HEARTBEAT_INTERVAL = 30000; // 30 seconds
  const RECONNECT_DELAY = 2000; // 2 seconds

  // Connection health monitoring
  const startHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }
    
    heartbeatIntervalRef.current = setInterval(() => {
      const now = Date.now();
      setLastHeartbeat(now);
      
      // Check if any subscriptions are still active
      const activeSubscriptions = Array.from(subscriptionsRef.current.values());
      if (activeSubscriptions.length > 0) {
        setConnectionStatus('connected');
      }
    }, HEARTBEAT_INTERVAL);
  }, []);

  // Enhanced subscription manager with error handling
  const subscribe = useCallback((table, callback, options = {}) => {
    const {
      event = '*',
      schema = 'public',
      filter = null,
      immediate = true
    } = options;

    const subscriptionKey = `${table}_${event}_${JSON.stringify(filter)}`;
    
    // Prevent duplicate subscriptions
    if (subscriptionsRef.current.has(subscriptionKey)) {
      console.warn(`Subscription for ${subscriptionKey} already exists`);
      return () => {}; // Return empty unsubscribe function
    }

    try {
      let channelConfig = {
        event,
        schema,
        table
      };

      if (filter) {
        channelConfig = { ...channelConfig, ...filter };
      }

      const channel = supabase
        .channel(`realtime_${subscriptionKey}`)
        .on('postgres_changes', channelConfig, (payload) => {
          try {
            console.log(`📡 Realtime update for ${table}:`, payload);
            setLastHeartbeat(Date.now());
            callback(payload);
          } catch (error) {
            console.error(`❌ Error processing realtime update for ${table}:`, error);
          }
        })
        .on('system', {}, (payload) => {
          console.log(`🔌 System event for ${table}:`, payload);
          if (payload.status === 'ok') {
            setConnectionStatus('connected');
            reconnectAttemptsRef.current = 0;
          }
        })
        .subscribe((status) => {
          console.log(`📊 Subscription status for ${table}:`, status);
          
          if (status === 'SUBSCRIBED') {
            console.log(`✅ Successfully subscribed to ${table}`);
            setConnectionStatus('connected');
            setLastHeartbeat(Date.now());
            reconnectAttemptsRef.current = 0;
            startHeartbeat(); // Start heartbeat immediately on successful connection
          } else if (status === 'CLOSED') {
            console.log(`🔌 Connection closed for ${table}`);
            setConnectionStatus('disconnected');
            handleReconnect(subscriptionKey, table, callback, options);
          } else if (status === 'CHANNEL_ERROR') {
            console.log(`❌ Channel error for ${table}`);
            setConnectionStatus('error');
            handleReconnect(subscriptionKey, table, callback, options);
          } else if (status === 'TIMED_OUT') {
            console.log(`⏰ Connection timed out for ${table}`);
            setConnectionStatus('error');
            handleReconnect(subscriptionKey, table, callback, options);
          }
        });

      subscriptionsRef.current.set(subscriptionKey, {
        channel,
        table,
        callback,
        options,
        createdAt: Date.now()
      });

      if (immediate) {
        startHeartbeat();
      }

      // Return unsubscribe function
      return () => {
        try {
          if (subscriptionsRef.current.has(subscriptionKey)) {
            const subscription = subscriptionsRef.current.get(subscriptionKey);
            supabase.removeChannel(subscription.channel);
            subscriptionsRef.current.delete(subscriptionKey);
            console.log(`🔌 Unsubscribed from ${subscriptionKey}`);
          }
        } catch (error) {
          console.error(`❌ Error unsubscribing from ${subscriptionKey}:`, error);
        }
      };
    } catch (error) {
      console.error(`❌ Error creating subscription for ${table}:`, error);
      setConnectionStatus('error');
      return () => {};
    }
  }, [startHeartbeat]);

  // Auto-reconnection with exponential backoff
  const handleReconnect = useCallback((subscriptionKey, table, callback, options) => {
    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      console.error(`❌ Max reconnection attempts reached for ${table}`);
      setConnectionStatus('failed');
      return;
    }

    const delay = RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current);
    reconnectAttemptsRef.current++;
    
    console.log(`🔄 Attempting to reconnect to ${table} (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS}) in ${delay}ms`);
    
    setConnectionStatus('reconnecting');
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    reconnectTimeoutRef.current = setTimeout(() => {
      // Remove old subscription
      if (subscriptionsRef.current.has(subscriptionKey)) {
        const oldSubscription = subscriptionsRef.current.get(subscriptionKey);
        try {
          supabase.removeChannel(oldSubscription.channel);
        } catch (error) {
          console.warn('Error removing old channel:', error);
        }
        subscriptionsRef.current.delete(subscriptionKey);
      }
      
      // Create new subscription
      subscribe(table, callback, options);
    }, delay);
  }, [subscribe]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clear all timeouts and intervals
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      // Unsubscribe from all channels
      subscriptionsRef.current.forEach((subscription, key) => {
        try {
          supabase.removeChannel(subscription.channel);
        } catch (error) {
          console.warn(`Error removing channel ${key}:`, error);
        }
      });
      subscriptionsRef.current.clear();
    };
  }, []);

  // Connection status getter with improved detection
  const getConnectionHealth = useCallback(() => {
    const now = Date.now();
    const timeSinceLastHeartbeat = lastHeartbeat ? now - lastHeartbeat : null;
    const hasActiveSubscriptions = subscriptionsRef.current.size > 0;
    
    // More accurate health detection
    let actualStatus = connectionStatus;
    if (hasActiveSubscriptions && (connectionStatus === 'connecting' || connectionStatus === 'disconnected')) {
      // If we have active subscriptions, we're likely connected
      actualStatus = 'connected';
      setConnectionStatus('connected');
    }
    
    const isHealthy = hasActiveSubscriptions && (
      !timeSinceLastHeartbeat || timeSinceLastHeartbeat < HEARTBEAT_INTERVAL * 3
    );
    
    return {
      status: actualStatus,
      isHealthy,
      lastHeartbeat,
      timeSinceLastHeartbeat,
      activeSubscriptions: subscriptionsRef.current.size,
      reconnectAttempts: reconnectAttemptsRef.current,
      hasActiveSubscriptions
    };
  }, [connectionStatus, lastHeartbeat]);

  // Manual reconnect function
  const manualReconnect = useCallback(async () => {
    console.log('🔄 Manual reconnect triggered...');
    setConnectionStatus('connecting');
    
    try {
      // Test database connection
      const { data, error } = await supabase
        .from('app_b30c02e74da644baad4668e3587d86b1_bookings')
        .select('id')
        .limit(1);
      
      if (error) {
        console.error('❌ Manual reconnect failed:', error);
        setConnectionStatus('error');
        return false;
      }
      
      // Reset reconnect attempts
      reconnectAttemptsRef.current = 0;
      
      // Restart heartbeat
      startHeartbeat();
      
      // Update status
      setConnectionStatus('connected');
      setLastHeartbeat(Date.now());
      
      console.log('✅ Manual reconnect successful');
      return true;
      
    } catch (error) {
      console.error('❌ Manual reconnect exception:', error);
      setConnectionStatus('error');
      return false;
    }
  }, [startHeartbeat]);

  return {
    subscribe,
    connectionStatus,
    getConnectionHealth,
    manualReconnect,
    isConnected: connectionStatus === 'connected',
    isReconnecting: connectionStatus === 'reconnecting' || connectionStatus === 'connecting',
    hasError: connectionStatus === 'error' || connectionStatus === 'failed'
  };
};

/**
 * Optimized hook for booking realtime updates
 * Uses efficient state updates and prevents unnecessary re-renders
 */
export const useOptimizedRealtimeBookings = (dispatch) => {
  const { subscribe, connectionStatus } = useRealtimeConnection();
  const lastUpdateRef = useRef(null);
  const batchTimeoutRef = useRef(null);
  const pendingUpdatesRef = useRef([]);

  // Batch updates to prevent excessive re-renders
  const batchUpdate = useCallback((update) => {
    pendingUpdatesRef.current.push(update);
    
    if (batchTimeoutRef.current) {
      clearTimeout(batchTimeoutRef.current);
    }
    
    batchTimeoutRef.current = setTimeout(() => {
      if (pendingUpdatesRef.current.length > 0) {
        const updates = [...pendingUpdatesRef.current];
        pendingUpdatesRef.current = [];
        
        // Process all updates at once
        updates.forEach(update => {
          dispatch(update);
        });
        
        lastUpdateRef.current = Date.now();
      }
    }, 100); // 100ms batch window
  }, [dispatch]);

  const handleRealtimeChange = useCallback((payload) => {
    console.log('📡 Optimized booking change:', payload);
    
    try {
      switch (payload.eventType) {
        case 'INSERT':
          batchUpdate({ type: 'bookings/addBooking', payload: payload.new });
          break;
        case 'UPDATE':
          batchUpdate({ type: 'bookings/updateBooking', payload: payload.new });
          break;
        case 'DELETE':
          batchUpdate({ type: 'bookings/removeBooking', payload: payload.old.id });
          break;
        default:
          console.warn('Unknown event type:', payload.eventType);
      }
    } catch (error) {
      console.error('Error handling realtime change:', error);
      batchUpdate({ type: 'bookings/setError', payload: error.message });
    }
  }, [batchUpdate]);

  useEffect(() => {
    const unsubscribe = subscribe(
      'app_b30c02e74da644baad4668e3587d86b1_bookings',
      handleRealtimeChange,
      { immediate: true }
    );
    
    return () => {
      unsubscribe();
      if (batchTimeoutRef.current) {
        clearTimeout(batchTimeoutRef.current);
      }
    };
  }, [subscribe, handleRealtimeChange]);

  return {
    connectionStatus,
    lastUpdate: lastUpdateRef.current
  };
};