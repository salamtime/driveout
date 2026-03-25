import React, { useState, useEffect, useRef } from 'react';
import { Bell, X, Check, AlertCircle, Info, CheckCircle, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import notificationService from '../../services/NotificationService';
import PerformanceMonitor from '../../utils/PerformanceMonitor';

const NotificationCenter = () => {
  const { t } = useTranslation();
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [isLoading, setIsLoading] = useState(true);
  const dropdownRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    
    const initializeNotifications = async () => {
      const startTime = performance.now();
      
      try {
        // Initialize notification service
        await notificationService.initialize();
        
        // Load cached notifications
        const cachedNotifications = await notificationService.getCachedNotifications();
        if (mounted) {
          setNotifications(cachedNotifications);
          setUnreadCount(cachedNotifications.filter(n => !n.read).length);
        }
        
        // Set up real-time subscriptions
        const unsubscribeNotification = notificationService.subscribe('notification', (notification) => {
          if (mounted) {
            setNotifications(prev => {
              const updated = [notification, ...prev.slice(0, 49)]; // Keep max 50
              return updated;
            });
            setUnreadCount(prev => prev + 1);
            
            // Show browser notification if permission granted
            showBrowserNotification(notification);
          }
        });

        const unsubscribeConnection = notificationService.subscribe('connection:success', () => {
          if (mounted) {
            setConnectionStatus('connected');
          }
        });

        const unsubscribeConnectionFailed = notificationService.subscribe('connection:failed', () => {
          if (mounted) {
            setConnectionStatus('error');
          }
        });

        if (mounted) {
          setIsLoading(false);
          setConnectionStatus(notificationService.getConnectionStatus().status);
        }

        PerformanceMonitor.recordMetric('notification_center_init', performance.now() - startTime);

        // Cleanup function
        return () => {
          unsubscribeNotification();
          unsubscribeConnection();
          unsubscribeConnectionFailed();
        };
        
      } catch (error) {
        console.error('Error initializing notifications:', error);
        if (mounted) {
          setIsLoading(false);
          setConnectionStatus('error');
        }
      }
    };

    const cleanup = initializeNotifications();
    
    return () => {
      mounted = false;
      if (cleanup && typeof cleanup.then === 'function') {
        cleanup.then(cleanupFn => cleanupFn && cleanupFn());
      }
    };
  }, []);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Request notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const showBrowserNotification = (notification) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(notification.title, {
        body: notification.message,
        icon: '/favicon.ico',
        tag: notification.id,
        requireInteraction: notification.priority === 'high'
      });
    }
  };

  const markAsRead = (notificationId) => {
    setNotifications(prev => 
      prev.map(n => 
        n.id === notificationId ? { ...n, read: true } : n
      )
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const clearNotification = (notificationId) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
    setUnreadCount(prev => {
      const notification = notifications.find(n => n.id === notificationId);
      return notification && !notification.read ? prev - 1 : prev;
    });
  };

  const clearAllNotifications = () => {
    setNotifications([]);
    setUnreadCount(0);
  };

  const getNotificationIcon = (type, priority) => {
    const iconProps = { className: "h-4 w-4" };
    
    switch (type) {
      case 'booking_created':
      case 'rental_created':
        return <CheckCircle {...iconProps} className="h-4 w-4 text-green-500" />;
      case 'booking_status_changed':
      case 'rental_status_changed':
        return <Clock {...iconProps} className="h-4 w-4 text-blue-500" />;
      case 'vehicle_status_changed':
        return <AlertCircle {...iconProps} className="h-4 w-4 text-yellow-500" />;
      case 'system_notification':
        return <Info {...iconProps} className="h-4 w-4 text-gray-500" />;
      default:
        return priority === 'high' ? 
          <AlertCircle {...iconProps} className="h-4 w-4 text-red-500" /> :
          <Info {...iconProps} className="h-4 w-4 text-blue-500" />;
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return 'border-l-red-500 bg-red-50';
      case 'medium': return 'border-l-yellow-500 bg-yellow-50';
      case 'low': return 'border-l-green-500 bg-green-50';
      default: return 'border-l-gray-500 bg-gray-50';
    }
  };

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'text-green-500';
      case 'error': return 'text-red-500';
      case 'reconnecting': return 'text-yellow-500';
      default: return 'text-gray-500';
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMinutes = Math.floor((now - date) / (1000 * 60));
    
    if (diffInMinutes < 1) return t('notifications.justNow', 'Just now');
    if (diffInMinutes < 60) return t('notifications.minutesAgo', '{{count}} minutes ago', { count: diffInMinutes });
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return t('notifications.hoursAgo', '{{count}} hours ago', { count: diffInHours });
    
    const diffInDays = Math.floor(diffInHours / 24);
    return t('notifications.daysAgo', '{{count}} days ago', { count: diffInDays });
  };

  if (isLoading) {
    return (
      <div className="relative">
        <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
          <Bell className="h-6 w-6 animate-pulse" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Notification Bell */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-lg"
        aria-label={t('notifications.toggleNotifications', 'Toggle notifications')}
      >
        <Bell className="h-6 w-6" />
        
        {/* Unread Count Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
        
        {/* Connection Status Indicator */}
        <div className={`absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-white ${
          connectionStatus === 'connected' ? 'bg-green-500' :
          connectionStatus === 'error' ? 'bg-red-500' :
          connectionStatus === 'reconnecting' ? 'bg-yellow-500' : 'bg-gray-500'
        }`} />
      </button>

      {/* Notification Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-96 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                {t('notifications.title', 'Notifications')}
              </h3>
              <div className="flex items-center space-x-2">
                <span className={`text-xs font-medium ${getConnectionStatusColor()}`}>
                  {connectionStatus === 'connected' && '● Live'}
                  {connectionStatus === 'error' && '● Offline'}
                  {connectionStatus === 'reconnecting' && '● Reconnecting'}
                </span>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            
            {/* Action Buttons */}
            {notifications.length > 0 && (
              <div className="flex items-center justify-between mt-2">
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  disabled={unreadCount === 0}
                >
                  {t('notifications.markAllRead', 'Mark all as read')}
                </button>
                <button
                  onClick={clearAllNotifications}
                  className="text-xs text-red-600 hover:text-red-800 font-medium"
                >
                  {t('notifications.clearAll', 'Clear all')}
                </button>
              </div>
            )}
          </div>

          {/* Notifications List */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500">
                <Bell className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">
                  {t('notifications.noNotifications', 'No notifications yet')}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`px-4 py-3 hover:bg-gray-50 transition-colors border-l-4 ${
                      getPriorityColor(notification.priority)
                    } ${!notification.read ? 'bg-blue-50' : ''}`}
                  >
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0 mt-1">
                        {getNotificationIcon(notification.type, notification.priority)}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className={`text-sm font-medium ${
                              !notification.read ? 'text-gray-900' : 'text-gray-700'
                            }`}>
                              {notification.title}
                            </p>
                            <p className="text-sm text-gray-600 mt-1">
                              {notification.message}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                              {formatTimestamp(notification.timestamp)}
                            </p>
                          </div>
                          
                          <div className="flex items-center space-x-1 ml-2">
                            {!notification.read && (
                              <button
                                onClick={() => markAsRead(notification.id)}
                                className="p-1 text-gray-400 hover:text-green-600 transition-colors"
                                title={t('notifications.markAsRead', 'Mark as read')}
                              >
                                <Check className="h-3 w-3" />
                              </button>
                            )}
                            <button
                              onClick={() => clearNotification(notification.id)}
                              className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                              title={t('notifications.dismiss', 'Dismiss')}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;