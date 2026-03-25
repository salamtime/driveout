import React from 'react';
import { Database, HardDrive, Package2 } from 'lucide-react';
import { useSettings } from '../../hooks/useSettings';

/**
 * Component that displays the current source of settings data
 * Shows an appropriate icon and text based on where settings are loaded from
 */
const DataSourceStatus = ({ className = '', compact = false }) => {
  const { source, online, initialized } = useSettings();
  
  const getSourceIcon = () => {
    switch (source) {
      case 'database':
        return <Database className="h-4 w-4 text-green-600" />;
      case 'cache':
        return <HardDrive className="h-4 w-4 text-amber-600" />;
      case 'default':
      default:
        return <Package2 className="h-4 w-4 text-blue-600" />;
    }
  };
  
  const getSourceLabel = () => {
    switch (source) {
      case 'database':
        return 'Database';
      case 'cache':
        return 'Local Cache';
      case 'default':
      default:
        return 'Default Values';
    }
  };
  
  const getSourceColor = () => {
    switch (source) {
      case 'database':
        return 'text-green-600';
      case 'cache':
        return 'text-amber-600';
      case 'default':
      default:
        return 'text-blue-600';
    }
  };
  
  const getSourceDescription = () => {
    switch (source) {
      case 'database':
        return 'Connected to database';
      case 'cache':
        return online ? 'Using cached settings (database issue)' : 'Using cached settings (offline)';
      case 'default':
      default:
        return online ? 'Using default settings (no database data)' : 'Using default settings (offline)';
    }
  };
  
  if (!initialized) {
    return null; // Don't show until settings are initialized
  }
  
  if (compact) {
    return (
      <div className={`flex items-center ${className}`}>
        {getSourceIcon()}
        <span className={`ml-1 text-xs font-medium ${getSourceColor()}`}>
          {getSourceLabel()}
        </span>
      </div>
    );
  }
  
  return (
    <div className={`flex items-center ${className}`}>
      {getSourceIcon()}
      <div className="ml-2">
        <div className={`text-sm font-medium ${getSourceColor()}`}>
          {getSourceLabel()}
        </div>
        <div className="text-xs text-gray-500">
          {getSourceDescription()}
        </div>
      </div>
    </div>
  );
};

export default DataSourceStatus;