import React, { useState, useEffect } from 'react';
import { Bell, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import AlertsService from '../../services/AlertsService';

const AlertBadge = ({ onClick, className = '' }) => {
  const [alertSummary, setAlertSummary] = useState({
    total: 0,
    critical: 0,
    warning: 0,
    info: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAlertSummary();
    // Refresh alerts every 5 minutes
    const interval = setInterval(fetchAlertSummary, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchAlertSummary = async () => {
    try {
      const summary = await AlertsService.getAlertSummary();
      setAlertSummary(summary);
    } catch (error) {
      console.error('Error fetching alert summary:', error);
    } finally {
      setLoading(false);
    }
  };

  const getBadgeColor = () => {
    if (alertSummary.critical > 0) return 'bg-red-500';
    if (alertSummary.warning > 0) return 'bg-yellow-500';
    if (alertSummary.info > 0) return 'bg-blue-500';
    return 'bg-gray-400';
  };

  const getIconColor = () => {
    if (alertSummary.critical > 0) return 'text-red-600';
    if (alertSummary.warning > 0) return 'text-yellow-600';
    if (alertSummary.info > 0) return 'text-blue-600';
    return 'text-gray-400';
  };

  if (loading) {
    return (
      <button className={`relative p-2 rounded-lg hover:bg-gray-100 transition-colors ${className}`}>
        <Bell className="w-5 h-5 text-gray-400" />
      </button>
    );
  }

  return (
    <button 
      onClick={onClick}
      className={`relative p-2 rounded-lg hover:bg-gray-100 transition-colors ${className}`}
      title={`${alertSummary.total} inventory alerts`}
    >
      <Bell className={`w-5 h-5 ${getIconColor()}`} />
      
      {alertSummary.total > 0 && (
        <span className={`absolute -top-1 -right-1 ${getBadgeColor()} text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-medium`}>
          {alertSummary.total > 99 ? '99+' : alertSummary.total}
        </span>
      )}
      
      {/* Tooltip */}
      {alertSummary.total > 0 && (
        <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
          <div className="text-sm font-medium text-gray-900 mb-2">Inventory Alerts</div>
          <div className="space-y-1 text-xs">
            {alertSummary.critical > 0 && (
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <AlertCircle className="w-3 h-3 text-red-500 mr-1" />
                  <span className="text-red-600">Critical</span>
                </div>
                <span className="font-medium">{alertSummary.critical}</span>
              </div>
            )}
            {alertSummary.warning > 0 && (
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <AlertTriangle className="w-3 h-3 text-yellow-500 mr-1" />
                  <span className="text-yellow-600">Warning</span>
                </div>
                <span className="font-medium">{alertSummary.warning}</span>
              </div>
            )}
            {alertSummary.info > 0 && (
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <Info className="w-3 h-3 text-blue-500 mr-1" />
                  <span className="text-blue-600">Info</span>
                </div>
                <span className="font-medium">{alertSummary.info}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </button>
  );
};

export default AlertBadge;