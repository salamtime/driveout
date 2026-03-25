import { useEffect, useRef, useCallback } from 'react';
import { useRealtimeConnection } from './useRealtimeConnection';

/**
 * Optimized Realtime Hook for Dashboard Components
 * Provides efficient data updates with minimal re-renders
 */
export const useOptimizedRealtime = (tables, onUpdate, options = {}) => {
  const { subscribe, connectionStatus, getConnectionHealth } = useRealtimeConnection();
  const {
    batchWindow = 200, // Batch updates within 200ms
    debounceDelay = 100, // Debounce individual updates
    immediate = true
  } = options;

  const batchTimeoutRef = useRef(null);
  const debounceTimeoutRef = useRef(null);
  const pendingUpdatesRef = useRef([]);
  const unsubscribeFunctionsRef = useRef([]);

  // Optimized batch processing
  const processBatch = useCallback(() => {
    if (pendingUpdatesRef.current.length === 0) return;

    const updates = [...pendingUpdatesRef.current];
    pendingUpdatesRef.current = [];

    // Group updates by table and type for efficiency
    const groupedUpdates = updates.reduce((acc, update) => {
      const key = `${update.table}_${update.eventType}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(update);
      return acc;
    }, {});

    // Process grouped updates
    Object.entries(groupedUpdates).forEach(([key, updates]) => {
      const [table, eventType] = key.split('_');
      
      try {
        onUpdate({
          table,
          eventType,
          updates: updates.map(u => u.payload),
          timestamp: Date.now()
        });
      } catch (error) {
        console.error(`Error processing batch for ${key}:`, error);
      }
    });
  }, [onUpdate]);

  // Debounced update handler
  const handleUpdate = useCallback((table, payload) => {
    // Add to pending updates
    pendingUpdatesRef.current.push({
      table,
      eventType: payload.eventType,
      payload,
      timestamp: Date.now()
    });

    // Clear existing timeouts
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    if (batchTimeoutRef.current) {
      clearTimeout(batchTimeoutRef.current);
    }

    // Set debounce timeout
    debounceTimeoutRef.current = setTimeout(() => {
      // Set batch timeout
      batchTimeoutRef.current = setTimeout(processBatch, batchWindow);
    }, debounceDelay);
  }, [processBatch, batchWindow, debounceDelay]);

  // Setup subscriptions
  useEffect(() => {
    const subscriptions = [];

    tables.forEach(table => {
      const unsubscribe = subscribe(
        table,
        (payload) => handleUpdate(table, payload),
        { immediate }
      );
      subscriptions.push(unsubscribe);
    });

    unsubscribeFunctionsRef.current = subscriptions;

    return () => {
      // Clean up subscriptions
      subscriptions.forEach(unsubscribe => {
        try {
          unsubscribe();
        } catch (error) {
          console.warn('Error unsubscribing:', error);
        }
      });

      // Clear timeouts
      if (batchTimeoutRef.current) {
        clearTimeout(batchTimeoutRef.current);
      }
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }

      // Process any remaining updates
      if (pendingUpdatesRef.current.length > 0) {
        processBatch();
      }
    };
  }, [tables, subscribe, handleUpdate, immediate]);

  return {
    connectionStatus,
    connectionHealth: getConnectionHealth(),
    isConnected: connectionStatus === 'connected',
    pendingUpdates: pendingUpdatesRef.current.length
  };
};