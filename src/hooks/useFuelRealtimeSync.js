import { useEffect, useRef } from 'react';
import FuelTransactionService from '../services/FuelTransactionService';

const FUEL_REALTIME_TABLES = [
  'fuel_tank',
  'fuel_refills',
  'vehicle_fuel_refills',
  'fuel_withdrawals',
  'vehicle_fuel_state',
  'fuel_operation_logs',
];

export default function useFuelRealtimeSync(onChange, { enabled = true, debounceMs = 180 } = {}) {
  const latestCallbackRef = useRef(onChange);
  const timeoutRef = useRef(null);

  useEffect(() => {
    latestCallbackRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const schedule = (payload = {}) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        latestCallbackRef.current?.(payload);
      }, debounceMs);
    };

    const unsubscribeLocal = FuelTransactionService.subscribeToClientChanges(schedule);
    const unsubscribeRealtime = FuelTransactionService.subscribeToChanges((payload) => {
      FuelTransactionService.clearTransactionCaches();
      schedule({
        ...payload,
        source: 'realtime',
      });
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        FuelTransactionService.clearTransactionCaches();
        schedule({ source: 'visibility' });
      }
    };

    const handleFocus = () => {
      FuelTransactionService.clearTransactionCaches();
      schedule({ source: 'focus' });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      unsubscribeLocal?.();
      unsubscribeRealtime?.();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [enabled, debounceMs]);

  return FUEL_REALTIME_TABLES;
}
