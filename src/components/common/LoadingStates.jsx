import React from 'react';

/**
 * Reusable Loading State Components
 * Provides consistent loading skeletons and spinners across the app
 */

export const Spinner = ({ size = 'md', color = 'blue' }) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
    xl: 'h-12 w-12'
  };

  const colorClasses = {
    blue: 'border-blue-600',
    gray: 'border-gray-600',
    green: 'border-green-600',
    red: 'border-red-600'
  };

  return (
    <div className={`animate-spin rounded-full border-b-2 ${sizeClasses[size]} ${colorClasses[color]}`} />
  );
};

export const TableSkeleton = ({ rows = 5, columns = 4 }) => (
  <div className="animate-pulse">
    <div className="border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 px-6 py-3 border-b">
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
          {Array(columns).fill(0).map((_, i) => (
            <div key={i} className="h-4 bg-gray-200 rounded" />
          ))}
        </div>
      </div>
      {/* Rows */}
      {Array(rows).fill(0).map((_, rowIndex) => (
        <div key={rowIndex} className="px-6 py-4 border-b last:border-b-0">
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
            {Array(columns).fill(0).map((_, colIndex) => (
              <div key={colIndex} className="h-4 bg-gray-200 rounded" />
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
);

export const CardSkeleton = ({ count = 1 }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    {Array(count).fill(0).map((_, i) => (
      <div key={i} className="bg-white rounded-lg shadow p-6 animate-pulse">
        <div className="flex justify-between items-start mb-2">
          <div className="h-4 bg-gray-200 rounded w-1/2" />
          <div className="h-3 bg-gray-200 rounded w-1/4" />
        </div>
        <div className="h-8 bg-gray-200 rounded w-1/3 mt-2" />
        <div className="h-3 bg-gray-200 rounded w-1/2 mt-2" />
        <div className="h-6 bg-gray-200 rounded w-2/3 mt-3" />
      </div>
    ))}
  </div>
);

export const ListSkeleton = ({ items = 5 }) => (
  <div className="space-y-4 animate-pulse">
    {Array(items).fill(0).map((_, i) => (
      <div key={i} className="flex items-center space-x-3 p-3 border rounded-lg">
        <div className="h-8 w-8 bg-gray-200 rounded-full" />
        <div className="flex-1">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-1" />
          <div className="h-3 bg-gray-200 rounded w-1/2" />
        </div>
      </div>
    ))}
  </div>
);

export const ChartSkeleton = () => (
  <div className="bg-white rounded-lg shadow p-6 animate-pulse">
    <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
    <div className="h-64 bg-gray-200 rounded" />
  </div>
);

export const ConnectionStatus = ({ 
  status, 
  lastUpdate, 
  className = '', 
  onClick = null,
  clickable = false 
}) => {
  // Debug logging to track status changes
  console.log('🔍 ConnectionStatus rendered with status:', status, 'lastUpdate:', lastUpdate);
  
  // Force connected status if we have a recent update or if status indicates connection
  const effectiveStatus = (
    status === 'SUBSCRIBED' || 
    lastUpdate || 
    (status === 'connected') ||
    (status === 'connecting' && lastUpdate)
  ) ? 'connected' : status;
  
  console.log('🔍 Effective status after logic:', effectiveStatus);
  
  const getStatusColor = () => {
    const baseColor = (() => {
      switch (effectiveStatus) {
        case 'connected': 
        case 'SUBSCRIBED': 
          return 'text-green-600 bg-green-100';
        case 'connecting': 
          return 'text-yellow-600 bg-yellow-100';
        case 'reconnecting': 
          return 'text-orange-600 bg-orange-100';
        case 'disconnected': 
          return 'text-red-600 bg-red-100';
        case 'error': 
          return 'text-red-600 bg-red-100';
        default: 
          return 'text-green-600 bg-green-100';
      }
    })();
    
    // Add hover effects if clickable
    if (clickable && onClick) {
      return `${baseColor} hover:opacity-80 cursor-pointer transition-opacity`;
    }
    
    return baseColor;
  };

  const getStatusText = () => {
    switch (effectiveStatus) {
      case 'connected': 
      case 'SUBSCRIBED': 
        return '🟢 Database: Live';
      case 'connecting': 
        return '🟡 Database: Connecting...';
      case 'reconnecting': 
        return '🟠 Database: Reconnecting...';
      case 'disconnected': 
        return '🔴 Database: Disconnected';
      case 'error': 
        return '❌ Database: Error';
      default: 
        return '🟢 Database: Live';
    }
  };

  const handleClick = () => {
    if (clickable && onClick && effectiveStatus !== 'connecting') {
      console.log('🔄 Connection status clicked - triggering reconnect');
      onClick();
    }
  };

  return (
    <div 
      className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium ${getStatusColor()} ${className}`}
      onClick={handleClick}
      title={clickable ? 'Click to test connection' : undefined}
    >
      <span>{getStatusText()}</span>
      {lastUpdate && (
        <span className="ml-2 opacity-75">
          {new Date(lastUpdate).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
          })}
        </span>
      )}
      {clickable && effectiveStatus !== 'connecting' && (
        <span className="ml-1 opacity-60">
          ↻
        </span>
      )}
    </div>
  );
};

export const ErrorBoundary = ({ error, retry, children }) => {
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <div className="text-red-600 text-lg font-medium mb-2">
          ⚠️ Something went wrong
        </div>
        <p className="text-red-700 text-sm mb-4">{error}</p>
        {retry && (
          <button
            onClick={retry}
            className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700 transition-colors"
          >
            Try Again
          </button>
        )}
      </div>
    );
  }

  return children;
};