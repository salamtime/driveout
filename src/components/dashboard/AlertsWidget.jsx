import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AlertTriangle, CheckCircle, Eye, X } from 'lucide-react';
import DashboardService from '../../services/DashboardService';
import { useOptimizedRealtime } from '../../hooks/useOptimizedRealtime';
import { ListSkeleton, ConnectionStatus, ErrorBoundary } from '../common/LoadingStates';

const AlertsWidget = () => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const lastUpdateRef = useRef(null);

  // Optimized realtime updates for alerts
  const handleRealtimeUpdate = useCallback(({ table, eventType, updates, timestamp }) => {
    console.log('📡 Alerts widget realtime update:', { table, eventType, updates });
    
    if (table.includes('alerts')) {
      setAlerts(prev => {
        switch (eventType) {
          case 'INSERT':
            // Add new alerts, filter duplicates
            const newAlerts = updates.filter(alert => 
              !prev.some(existing => existing.id === alert.id)
            );
            return [...newAlerts, ...prev].sort((a, b) => 
              new Date(b.created_at) - new Date(a.created_at)
            );
          
          case 'UPDATE':
            // Update existing alerts
            return prev.map(alert => {
              const update = updates.find(u => u.id === alert.id);
              return update ? { ...alert, ...update } : alert;
            });
          
          case 'DELETE':
            // Remove deleted alerts
            const deletedIds = updates.map(u => u.id);
            return prev.filter(alert => !deletedIds.includes(alert.id));
          
          default:
            return prev;
        }
      });
      lastUpdateRef.current = timestamp;
    }
  }, []);

  const { connectionStatus, isConnected } = useOptimizedRealtime(
    ['app_b30c02e74da644baad4668e3587d86b1_alerts'],
    handleRealtimeUpdate,
    { batchWindow: 200, immediate: true }
  );

  const loadAlerts = useCallback(async () => {
    try {
      setError(null);
      const alertsData = await DashboardService.getSystemAlerts();
      setAlerts(alertsData);
      lastUpdateRef.current = Date.now();
    } catch (error) {
      console.error('Error loading alerts:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleResolveAlert = async (alertId) => {
    try {
      setActionLoading(alertId);
      await DashboardService.resolveAlert(alertId);
      // The realtime update will handle the UI update
      console.log('✅ Alert resolved:', alertId);
    } catch (error) {
      console.error('Error resolving alert:', error);
      setError('Failed to resolve alert');
    } finally {
      setActionLoading(null);
    }
  };

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'critical': return 'text-red-600 bg-red-100';
      case 'high': return 'text-red-500 bg-red-50';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'low': return 'text-blue-600 bg-blue-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">System Alerts</h3>
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">System Alerts</h3>
        <span className="text-sm text-gray-500">{alerts.length} active</span>
      </div>
      
      {alerts.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
          <p>No active alerts</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-80 overflow-y-auto">
          {alerts.map((alert) => (
            <div key={alert.id} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(alert.priority)}`}>
                      {alert.priority?.toUpperCase()}
                    </span>
                    <span className="text-xs text-gray-500">{alert.type}</span>
                  </div>
                  <h4 className="font-medium text-gray-900 mb-1">{alert.title}</h4>
                  <p className="text-sm text-gray-600">{alert.message}</p>
                  <p className="text-xs text-gray-400 mt-2">
                    {new Date(alert.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-1 ml-4">
                  <button
                    onClick={() => handleResolveAlert(alert.id)}
                    className="p-1 text-green-600 hover:bg-green-50 rounded"
                    title="Mark as resolved"
                  >
                    <CheckCircle className="h-4 w-4" />
                  </button>
                  <button
                    className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                    title="View details"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AlertsWidget;