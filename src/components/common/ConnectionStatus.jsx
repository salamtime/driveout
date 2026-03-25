import React from 'react';
import { useConnectionStatus } from '../../hooks/useConnectionStatus';
import { Wifi, WifiOff, RotateCcw, Database, HardDrive, Package2 } from 'lucide-react';

const ConnectionStatus = ({ showLabel = true, compact = false }) => {
  const { isConnected, isChecking, lastChecked, retryCount, checkConnection } = useConnectionStatus();

  const getStatusColor = () => {
    if (isChecking) return 'text-yellow-500';
    return isConnected ? 'text-green-500' : 'text-red-500';
  };

  const getStatusText = () => {
    if (isChecking) return 'checking...';
    return isConnected ? 'connected' : 'disconnected';
  };

  const formatLastChecked = () => {
    if (!lastChecked) return '';
    return lastChecked.toLocaleTimeString();
  };

  // Get settings info from localStorage
  const getSettingsInfo = () => {
    try {
      const settingsCache = localStorage.getItem('quadventure_pricing_settings');
      if (!settingsCache) return { exists: false };
      
      const parsed = JSON.parse(settingsCache);
      const cachedAt = new Date(parsed.cachedAt);
      
      return {
        exists: true,
        cachedAt,
        cachedTimeAgo: getTimeAgo(cachedAt)
      };
    } catch (err) {
      return { exists: false, error: err };
    }
  };
  
  const getTimeAgo = (date) => {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return `${seconds} seconds ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    return `${Math.floor(seconds / 86400)} days ago`;
  };
  
  const settingsInfo = getSettingsInfo();

  if (compact) {
    return (
      <div className="flex items-center space-x-1">
        {isConnected ? (
          <Wifi className={`h-4 w-4 ${getStatusColor()}`} />
        ) : (
          <WifiOff className={`h-4 w-4 ${getStatusColor()}`} />
        )}
        {showLabel && (
          <span className={`text-xs ${getStatusColor()}`}>
            {getStatusText()}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 border-t border-gray-200">
      <div className="flex items-center space-x-2">
        {isConnected ? (
          <Wifi className={`h-4 w-4 ${getStatusColor()}`} />
        ) : (
          <WifiOff className={`h-4 w-4 ${getStatusColor()}`} />
        )}
        <div className="flex flex-col">
          <span className={`text-sm font-medium ${getStatusColor()}`}>
            Database: {getStatusText()}
          </span>
          {lastChecked && (
            <span className="text-xs text-gray-500">
              Last checked: {formatLastChecked()}
            </span>
          )}
          {retryCount > 0 && !isConnected && (
            <span className="text-xs text-orange-600">
              Retry attempt: {retryCount}/5
            </span>
          )}
        </div>
      </div>
      
      <div className="flex flex-col items-end">
        {settingsInfo.exists && (
          <div className="flex items-center text-xs text-gray-600">
            <HardDrive className="h-3 w-3 mr-1" />
            <span>Settings cached {settingsInfo.cachedTimeAgo}</span>
          </div>
        )}
        
        {!isConnected && !isChecking && (
          <button
            onClick={checkConnection}
            className="flex items-center space-x-1 px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors mt-1"
            disabled={isChecking}
          >
            <RotateCcw className="h-3 w-3" />
            <span>Retry</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default ConnectionStatus;