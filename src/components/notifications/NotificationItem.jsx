import React from 'react';
import { useDispatch } from 'react-redux';
import { format } from 'date-fns';
import { markNotificationAsRead } from '../../store/slices/notificationsSlice';

const NotificationItem = ({ notification }) => {
  const dispatch = useDispatch();
  
  const handleMarkAsRead = () => {
    if (!notification.read) {
      dispatch(markNotificationAsRead(notification.id));
    }
  };

  const getNotificationIcon = () => {
    switch (notification.type) {
      case 'booking_created':
        return (
          <div className="flex-shrink-0 rounded-full bg-blue-100 p-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
            </svg>
          </div>
        );
      case 'status_update':
        return (
          <div className="flex-shrink-0 rounded-full bg-green-100 p-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          </div>
        );
      default:
        return (
          <div className="flex-shrink-0 rounded-full bg-gray-100 p-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
        );
    }
  };

  const formattedDate = notification.created_at 
    ? format(new Date(notification.created_at), 'MMM d, h:mm a')
    : '';

  return (
    <div 
      className={`flex p-4 border-b cursor-pointer hover:bg-gray-50 ${!notification.read ? 'bg-blue-50' : ''}`}
      onClick={handleMarkAsRead}
    >
      {getNotificationIcon()}
      <div className="ml-3 flex-1">
        <div className="flex items-baseline justify-between">
          <h3 className={`text-sm font-medium ${!notification.read ? 'text-blue-900 font-semibold' : 'text-gray-900'}`}>
            {notification.title}
          </h3>
          <span className="text-xs text-gray-500">{formattedDate}</span>
        </div>
        <p className={`text-sm ${!notification.read ? 'text-blue-800' : 'text-gray-600'}`}>
          {notification.message}
        </p>
        
        {notification.related_id && (
          <div className="mt-1">
            <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20">
              {notification.related_type === 'rental' ? 'Rental' : 'Tour'} #{notification.related_id}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationItem;