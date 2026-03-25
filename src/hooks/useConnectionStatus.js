import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';

export const useConnectionStatus = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [lastChecked, setLastChecked] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  const checkConnection = async () => {
    try {
      setIsChecking(true);
      
      // Check if we have valid credentials first
      if (supabase._isMockClient || !supabase._hasValidCredentials) {
        setIsConnected(false);
        setRetryCount(0);
        return;
      }

      // Test connection with a simple auth check (always available in Supabase)
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        console.error('Database connection error:', error);
        setIsConnected(false);
        setRetryCount(prev => prev + 1);
      } else {
        // Connection successful
        setIsConnected(true);
        setRetryCount(0);
        console.log('✅ Database connection verified');
      }
    } catch (error) {
      console.error('Connection check failed:', error);
      setIsConnected(false);
      setRetryCount(prev => prev + 1);
    } finally {
      setIsChecking(false);
      setLastChecked(new Date());
    }
  };

  useEffect(() => {
    // Initial connection check
    checkConnection();

    // Set up periodic connection checks every 30 seconds
    const interval = setInterval(checkConnection, 30000);

    return () => clearInterval(interval);
  }, []);

  // Retry logic - exponential backoff
  useEffect(() => {
    if (!isConnected && retryCount > 0 && retryCount <= 5) {
      const retryDelay = Math.min(1000 * Math.pow(2, retryCount - 1), 30000);
      const timeout = setTimeout(checkConnection, retryDelay);
      return () => clearTimeout(timeout);
    }
  }, [retryCount, isConnected]);

  return {
    isConnected,
    isChecking,
    lastChecked,
    retryCount,
    checkConnection,
    connectionStatus: isConnected ? 'connected' : 'disconnected'
  };
};