import React from 'react';
import { Activity, Clock } from 'lucide-react';

const RecentActivity = () => {
  const activities = [
    { id: 1, action: 'New booking created', user: 'John Doe', time: '2 min ago', type: 'booking' },
    { id: 2, action: 'Vehicle maintenance completed', user: 'Mechanic', time: '15 min ago', type: 'maintenance' },
    { id: 3, action: 'Tour completed', user: 'Guide Mike', time: '1 hour ago', type: 'tour' },
    { id: 4, action: 'Payment received', user: 'System', time: '2 hours ago', type: 'payment' }
  ];

  const getActivityIcon = (type) => {
    switch (type) {
      case 'booking': return '📅';
      case 'maintenance': return '🔧';
      case 'tour': return '🏍️';
      case 'payment': return '💰';
      default: return '📋';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      <div className="p-4 border-b">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
          <Activity className="h-5 w-5 mr-2" />
          Recent Activity
        </h3>
      </div>
      <div className="p-4">
        <div className="space-y-4">
          {activities.map((activity) => (
            <div key={activity.id} className="flex items-start space-x-3">
              <div className="text-lg">{getActivityIcon(activity.type)}</div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{activity.action}</p>
                <p className="text-xs text-gray-500">{activity.user}</p>
              </div>
              <div className="flex items-center text-xs text-gray-400">
                <Clock className="h-3 w-3 mr-1" />
                {activity.time}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RecentActivity;