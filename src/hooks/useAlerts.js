import { useState, useEffect, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { 
  fetchAlerts, 
  markAlertAsRead, 
  markAllAlertsAsRead, 
  createAlert,
  setupAlertsRealtimeSubscription,
  selectAllAlerts, 
  selectUnreadAlertsCount,
  selectIsLoading, 
  selectError 
} from '../store/slices/alertsSlice';

export const useAlerts = () => {
  const dispatch = useDispatch();
  const alerts = useSelector(selectAllAlerts);
  const unreadCount = useSelector(selectUnreadAlertsCount);
  const isLoading = useSelector(selectIsLoading);
  const error = useSelector(selectError);
  
  // Audio reference to prevent recreation on each render
  const audioRef = useRef(null);
  
  const [audioEnabled, setAudioEnabled] = useState(() => {
    const savedPreference = localStorage.getItem('alerts-audio-enabled');
    return savedPreference !== null ? JSON.parse(savedPreference) : true;
  });
  
  const [filterOptions, setFilterOptions] = useState({
    type: 'all',
    severity: 'all',
    readStatus: 'all',
    dateRange: 'all',
  });

  // Initialize audio on mount
  useEffect(() => {
    // Check if we're in a browser environment
    if (typeof window !== 'undefined') {
      audioRef.current = new Audio('/assets/sounds/notification.mp3');
      
      // Fallback to default sound if the custom one fails to load
      audioRef.current.onerror = () => {
        console.warn('Could not load custom notification sound, using fallback');
        audioRef.current = new Audio('/alert-sound.mp3');
      };
    }
    
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  // Load alerts on component mount
  useEffect(() => {
    dispatch(fetchAlerts());
    
    // Setup real-time subscription
    const setupSubscription = async () => {
      await dispatch(setupAlertsRealtimeSubscription());
    };
    
    setupSubscription();
    
    // Listen for alert events
    const handleNewAlert = (event) => {
      if (audioEnabled && audioRef.current) {
        audioRef.current.play().catch(error => {
          console.error('Error playing notification sound:', error);
        });
      }
      
      // Show browser notification if permission granted
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const { title, message, alert_type, severity } = event.detail;
        new Notification('QuadVenture Alert', {
          body: `${severity || ''} ${alert_type || ''}: ${title}`,
          icon: '/favicon.ico',
          tag: `quad-alert-${alert_type || 'general'}-${new Date().getTime()}`
        });
      }
    };
    
    document.addEventListener('supabase:alert-insert', handleNewAlert);
    
    // Request notification permissions
    if (typeof Notification !== 'undefined' && 
        Notification.permission !== 'granted' && 
        Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
    
    return () => {
      document.removeEventListener('supabase:alert-insert', handleNewAlert);
    };
  }, [dispatch, audioEnabled]);

  // Toggle audio notifications
  const toggleAudio = useCallback(() => {
    setAudioEnabled(prev => {
      const newValue = !prev;
      localStorage.setItem('alerts-audio-enabled', JSON.stringify(newValue));
      return newValue;
    });
  }, []);

  // Mark an alert as read
  const markAsRead = useCallback((alertId) => {
    dispatch(markAlertAsRead(alertId));
  }, [dispatch]);

  // Mark all alerts as read
  const markAllAsRead = useCallback(() => {
    dispatch(markAllAlertsAsRead());
  }, [dispatch]);

  // Create a new alert
  const addAlert = useCallback((alertData) => {
    dispatch(createAlert(alertData));
  }, [dispatch]);

  // Filter alerts
  const filteredAlerts = alerts.filter(alert => {
    // Filter by alert type
    if (filterOptions.type !== 'all' && alert.alert_type?.toLowerCase() !== filterOptions.type.toLowerCase()) {
      return false;
    }
    
    // Filter by severity
    if (filterOptions.severity !== 'all' && alert.severity?.toLowerCase() !== filterOptions.severity.toLowerCase()) {
      return false;
    }

    // Filter by read status
    if (filterOptions.readStatus === 'read' && !alert.is_read) {
      return false;
    }
    if (filterOptions.readStatus === 'unread' && alert.is_read) {
      return false;
    }

    // Filter by date range
    if (filterOptions.dateRange !== 'all') {
      const now = new Date();
      const alertDate = new Date(alert.created_at);
      const diffDays = Math.floor((now - alertDate) / (1000 * 60 * 60 * 24));
      
      if (filterOptions.dateRange === 'today' && diffDays !== 0) {
        return false;
      }
      if (filterOptions.dateRange === 'week' && diffDays > 7) {
        return false;
      }
      if (filterOptions.dateRange === 'month' && diffDays > 30) {
        return false;
      }
    }

    return true;
  });

  return {
    alerts: filteredAlerts,
    allAlerts: alerts,
    unreadCount,
    isLoading,
    error,
    audioEnabled,
    filterOptions,
    setFilterOptions,
    toggleAudio,
    markAsRead,
    markAllAsRead,
    addAlert,
  };
};