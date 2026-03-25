import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchAllSystemAlerts } from '../../../store/slices/vehiclesSlice';
import { format } from 'date-fns';

const FleetAlertsWidget = () => {
  const dispatch = useDispatch();
  const { systemAlertsData, loading } = useSelector(state => state.vehicles);
  const [expandedAlert, setExpandedAlert] = useState(null);

  useEffect(() => {
    // Fetch alerts when component mounts
    dispatch(fetchAllSystemAlerts());
    
    // Set up polling to refresh alerts every 30 seconds
    const interval = setInterval(() => {
      dispatch(fetchAllSystemAlerts());
    }, 30000);

    return () => clearInterval(interval);
  }, [dispatch]);

  const getPriorityColor = (priority) => {
    switch (priority?.toLowerCase()) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getAlertIcon = (type) => {
    switch (type) {
      case 'maintenance':
        return '🔧';
      case 'fuel':
        return '⛽';
      default:
        return '⚠️';
    }
  };

  const toggleExpanded = (alertId) => {
    setExpandedAlert(expandedAlert === alertId ? null : alertId);
  };

  if (loading && systemAlertsData.alerts.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6 lg:col-span-2">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Fleet Alerts</h3>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading alerts...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6 lg:col-span-2">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">Fleet Alerts</h3>
        <div className="flex items-center space-x-2">
          {systemAlertsData.totalCount > 0 && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
              {systemAlertsData.totalCount} Active
            </span>
          )}
          <button
            onClick={() => dispatch(fetchAllSystemAlerts())}
            disabled={loading}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <svg className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {systemAlertsData.totalCount === 0 ? (
        <div className="text-center py-8">
          <div className="text-4xl mb-2">✅</div>
          <p className="text-gray-500">No active alerts</p>
          <p className="text-sm text-gray-400">All vehicles are operating normally</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Alert Summary */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <div className="flex items-center">
                <span className="text-lg mr-2">🔧</span>
                <div>
                  <p className="text-sm font-medium text-yellow-800">Maintenance</p>
                  <p className="text-xl font-bold text-yellow-900">{systemAlertsData.maintenanceCount}</p>
                </div>
              </div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="flex items-center">
                <span className="text-lg mr-2">⛽</span>
                <div>
                  <p className="text-sm font-medium text-red-800">Low Fuel</p>
                  <p className="text-xl font-bold text-red-900">{systemAlertsData.fuelCount}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Alert List */}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {systemAlertsData.alerts.slice(0, 5).map((alert) => (
              <div key={alert.id} className="border border-gray-200 rounded-lg">
                <div 
                  className="p-3 cursor-pointer hover:bg-gray-50"
                  onClick={() => toggleExpanded(alert.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <span className="text-lg">{getAlertIcon(alert.type)}</span>
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <h4 className="font-medium text-gray-900">{alert.title}</h4>
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getPriorityColor(alert.priority)}`}>
                            {alert.priority?.toUpperCase() || 'MEDIUM'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">{alert.vehicleName}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-gray-500">
                        {format(new Date(alert.date), 'MMM dd')}
                      </span>
                      <svg 
                        className={`h-4 w-4 text-gray-400 transition-transform ${expandedAlert === alert.id ? 'rotate-180' : ''}`} 
                        fill="none" 
                        viewBox="0 0 24 24" 
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>
                
                {expandedAlert === alert.id && (
                  <div className="border-t border-gray-200 p-3 bg-gray-50">
                    <p className="text-sm text-gray-700 mb-2">{alert.description}</p>
                    <div className="flex space-x-2">
                      {alert.type === 'maintenance' && (
                        <button className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">
                          Schedule Service
                        </button>
                      )}
                      {alert.type === 'fuel' && (
                        <button className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700">
                          Record Refuel
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
            
            {systemAlertsData.alerts.length > 5 && (
              <div className="text-center py-2">
                <p className="text-sm text-gray-500">
                  Showing 5 of {systemAlertsData.alerts.length} alerts
                </p>
                <a href="/admin/alerts" className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                  View All Alerts →
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FleetAlertsWidget;