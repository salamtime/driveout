import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Clock, User, Calendar, Car, Wrench, Fuel } from 'lucide-react';
import DashboardService from '../../services/DashboardService';
import { useOptimizedRealtime } from '../../hooks/useOptimizedRealtime';
import { ListSkeleton, ConnectionStatus, ErrorBoundary } from '../common/LoadingStates';

const ActivityFeed = () => {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const lastUpdateRef = useRef(null);

  // Optimized realtime updates
  const handleRealtimeUpdate = useCallback(({ table, eventType, updates, timestamp }) => {
    console.log('📡 Activity feed realtime update:', { table, eventType, updates });
    
    if (table.includes('activity_log')) {
      // Efficiently update activities based on event type
      setActivities(prev => {
        switch (eventType) {
          case 'INSERT':
            // Add new activities to the beginning
            const newActivities = updates.filter(activity => 
              !prev.some(existing => existing.id === activity.id)
            );
            return [...newActivities, ...prev].slice(0, 50); // Keep only latest 50
          
          case 'UPDATE':
            // Update existing activities
            return prev.map(activity => {
              const update = updates.find(u => u.id === activity.id);
              return update ? { ...activity, ...update } : activity;
            });
          
          case 'DELETE':
            // Remove deleted activities
            const deletedIds = updates.map(u => u.id);
            return prev.filter(activity => !deletedIds.includes(activity.id));
          
          default:
            return prev;
        }
      });
      lastUpdateRef.current = timestamp;
    }
  }, []);

  const { connectionStatus, isConnected } = useOptimizedRealtime(
    ['app_b30c02e74da644baad4668e3587d86b1_activity_log'],
    handleRealtimeUpdate,
    { batchWindow: 300, immediate: true }
  );

  const loadActivities = useCallback(async () => {
    try {
      setError(null);
      const activitiesData = await DashboardService.getActivityFeed();
      setActivities(activitiesData);
      lastUpdateRef.current = Date.now();
    } catch (error) {
      console.error('Error loading activities:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  const getActivityIcon = (actionType) => {
    switch (actionType) {
      case 'booking_created':
      case 'booking_updated':
        return <Calendar className="h-4 w-4 text-blue-500" />;
      case 'vehicle_rented':
      case 'vehicle_returned':
        return <Car className="h-4 w-4 text-green-500" />;
      case 'maintenance_scheduled':
      case 'maintenance_completed':
        return <Wrench className="h-4 w-4 text-orange-500" />;
      case 'fuel_refill':
        return <Fuel className="h-4 w-4 text-purple-500" />;
      case 'user_login':
      case 'user_created':
        return <User className="h-4 w-4 text-indigo-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getTimeAgo = (dateString) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffInMs = now - date;
    const diffInMins = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInMins < 1) return 'Just now';
    if (diffInMins < 60) return `${diffInMins}m ago`;
    if (diffInHours < 24) return `${diffInHours}h ago`;
    return `${diffInDays}d ago`;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center space-x-3">
              <div className="h-8 w-8 bg-gray-200 rounded-full"></div>
              <div className="flex-1">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-1"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Recent Activity</h3>
        <span className="text-sm text-gray-500">Live feed</span>
      </div>
      
      {activities.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Clock className="h-12 w-12 mx-auto mb-2" />
          <p>No recent activity</p>
        </div>
      ) : (
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {activities.map((activity) => (
            <div key={activity.id} className="flex items-start space-x-3 p-3 hover:bg-gray-50 rounded-lg">
              <div className="flex-shrink-0 mt-1">
                {getActivityIcon(activity.action_type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900">{activity.description}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-gray-500">{activity.entity_type}</span>
                  <span className="text-xs text-gray-400">•</span>
                  <span className="text-xs text-gray-500">{getTimeAgo(activity.created_at)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ActivityFeed;