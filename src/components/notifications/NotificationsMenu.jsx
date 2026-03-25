import React, { useEffect, useState, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import NotificationItem from './NotificationItem';
import {
  fetchNotifications,
  markAllNotificationsAsRead,
  subscribeToNotifications,
  unsubscribeFromNotifications
} from '../../store/slices/notificationsSlice';

const NotificationsMenu = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  const { items: notifications = [], unreadCount = 0, loading = false } = useSelector(state => state.notifications || {});
  const { isAuthenticated } = useSelector(state => state.auth);

  // Fetch notifications on component mount if authenticated
  useEffect(() => {
    if (isAuthenticated) {
      dispatch(fetchNotifications());
      dispatch(subscribeToNotifications());
    }
    
    return () => {
      if (isAuthenticated) {
        dispatch(unsubscribeFromNotifications());
      }
    };
  }, [dispatch, isAuthenticated]);

  // Handle clicks outside to close the dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  const handleMarkAllAsRead = () => {
    dispatch(markAllNotificationsAsRead());
  };

  if (!isAuthenticated) return null;

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={toggleMenu}
        className="relative rounded-full p-1 text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <span className="sr-only">{t('notifications.view')}</span>
        <svg
          className="h-6 w-6"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        
        {/* Badge for unread count */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-md shadow-lg overflow-hidden z-50">
          <div className="py-2">
            <div className="flex items-center justify-between px-4 py-2 border-b">
              <h3 className="text-lg font-medium text-gray-900">{t('notifications.title')}</h3>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllAsRead}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  {t('notifications.markAllAsRead')}
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto">
              {loading ? (
                <div className="flex justify-center items-center py-6">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                </div>
              ) : (notifications && notifications.length > 0) ? (
                notifications.map(notification => (
                  <NotificationItem key={notification.id} notification={notification} />
                ))
              ) : (
                <div className="px-4 py-6 text-center text-gray-500">
                  <svg
                    className="mx-auto h-12 w-12 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                    />
                  </svg>
                  <p className="mt-2 text-sm">{t('notifications.noNotifications')}</p>
                </div>
              )}
            </div>
            
            <div className="px-4 py-2 border-t text-center">
              <button
                type="button"
                className="text-sm text-blue-600 hover:text-blue-800"
                onClick={() => setIsOpen(false)}
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationsMenu;