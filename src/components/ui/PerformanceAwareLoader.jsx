import React, { useState, useEffect } from 'react';
import { Loader2, Wifi, WifiOff, AlertCircle, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import PerformanceMonitor from '../../utils/PerformanceMonitor';
import CacheService from '../../services/CacheService';
import i18n from '../../i18n';

const PerformanceAwareLoader = ({ 
  isLoading, 
  error, 
  children, 
  loadingText,
  errorText,
  showPerformanceInfo = false,
  cacheService = null,
  className = ''
}) => {
  const tr = (en, fr) => (i18n.resolvedLanguage === 'fr' ? fr : en);
  const resolvedLoadingText = loadingText ?? tr('Loading...', 'Chargement...');
  const resolvedErrorText = errorText ?? tr('Something went wrong', "Une erreur s'est produite");
  const [connectionStatus, setConnectionStatus] = useState('connected');
  const [performanceData, setPerformanceData] = useState(null);
  const [loadingStartTime] = useState(Date.now());
  const [estimatedTime, setEstimatedTime] = useState(null);

  useEffect(() => {
    // Monitor connection status
    const handleOnline = () => setConnectionStatus('connected');
    const handleOffline = () => setConnectionStatus('disconnected');
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Set initial connection status
    setConnectionStatus(navigator.onLine ? 'connected' : 'disconnected');
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (showPerformanceInfo && isLoading) {
      // Get performance data
      const stats = PerformanceMonitor.getStats();
      setPerformanceData(stats);
      
      // Estimate loading time based on historical data
      if (stats.queries.averageDuration) {
        setEstimatedTime(Math.max(stats.queries.averageDuration * 1.5, 1000));
      }
    }
  }, [isLoading, showPerformanceInfo]);

  useEffect(() => {
    if (!isLoading && showPerformanceInfo) {
      // Record loading performance
      const loadingDuration = Date.now() - loadingStartTime;
      PerformanceMonitor.recordUserInteraction({
        type: 'component_load',
        element: 'performance_aware_loader',
        duration: loadingDuration,
        success: !error
      });
    }
  }, [isLoading, error, loadingStartTime, showPerformanceInfo]);

  const getConnectionIcon = () => {
    switch (connectionStatus) {
      case 'connected': return <Wifi className="h-4 w-4 text-green-500" />;
      case 'disconnected': return <WifiOff className="h-4 w-4 text-red-500" />;
      default: return <Wifi className="h-4 w-4 text-gray-500" />;
    }
  };

  const getConnectionText = () => {
    switch (connectionStatus) {
      case 'connected': return tr('Connected', 'Connecté');
      case 'disconnected': return tr('Offline', 'Hors ligne');
      default: return tr('Unknown', 'Inconnu');
    }
  };

  const getCacheStatus = () => {
    if (!cacheService) return null;
    
    const stats = cacheService.getStats();
    return {
      hitRate: stats.hitRate,
      size: stats.cacheSize
    };
  };

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`flex flex-col items-center justify-center p-8 ${className}`}
      >
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">{tr('Error', 'Erreur')}</h3>
          <p className="text-gray-600 mb-4">{resolvedErrorText}</p>
          
          {showPerformanceInfo && (
            <div className="bg-gray-50 rounded-lg p-4 text-left max-w-md">
              <h4 className="font-medium text-gray-900 mb-2">{tr('Debug Information', 'Informations de débogage')}</h4>
              <div className="space-y-1 text-sm text-gray-600">
                <div className="flex items-center justify-between">
                    <span>{tr('Connection:', 'Connexion :')}</span>
                  <div className="flex items-center gap-1">
                    {getConnectionIcon()}
                    <span>{getConnectionText()}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                    <span>{tr("Error Time:", "Heure de l'erreur :")}</span>
                  <span>{new Date().toLocaleTimeString()}</span>
                </div>
                {error.message && (
                  <div className="pt-2 border-t">
                    <span className="text-red-600 text-xs">{error.message}</span>
                  </div>
                )}
              </div>
            </div>
          )}
          
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {tr('Retry', 'Réessayer')}
          </button>
        </div>
      </motion.div>
    );
  }

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={`flex flex-col items-center justify-center p-8 ${className}`}
      >
        <div className="text-center">
          {/* Main Loading Spinner */}
          <div className="relative mb-6">
            <Loader2 className="h-12 w-12 text-blue-600 animate-spin mx-auto" />
            
            {/* Progress Ring */}
            {estimatedTime && (
              <motion.div
                className="absolute inset-0"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: estimatedTime / 1000, ease: "linear" }}
              >
                <svg className="w-12 h-12 transform -rotate-90">
                  <circle
                    cx="24"
                    cy="24"
                    r="20"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                    className="text-blue-200"
                  />
                  <motion.circle
                    cx="24"
                    cy="24"
                    r="20"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                    className="text-blue-600"
                    style={{
                      pathLength: 1,
                      strokeDasharray: "0 1"
                    }}
                  />
                </svg>
              </motion.div>
            )}
          </div>
          
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {resolvedLoadingText}
          </h3>
          
          {estimatedTime && (
            <p className="text-sm text-gray-600 mb-4">
              {tr('Estimated time:', 'Temps estimé :')} {Math.ceil(estimatedTime / 1000)}s
            </p>
          )}
          
          {showPerformanceInfo && (
            <div className="bg-gray-50 rounded-lg p-4 text-left max-w-md mx-auto">
              <h4 className="font-medium text-gray-900 mb-3">{tr('Performance Info', 'Informations de performance')}</h4>
              
              <div className="space-y-2 text-sm">
                {/* Connection Status */}
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">{tr('Connection:', 'Connexion :')}</span>
                  <div className="flex items-center gap-1">
                    {getConnectionIcon()}
                    <span className="text-gray-900">{getConnectionText()}</span>
                  </div>
                </div>
                
                {/* Cache Status */}
                {(() => {
                  const cacheStatus = getCacheStatus();
                  return cacheStatus && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">{tr('Cache Hit Rate:', 'Taux de succès du cache :')}</span>
                      <span className="text-gray-900">{cacheStatus.hitRate}</span>
                    </div>
                  );
                })()}
                
                {/* Performance Stats */}
                {performanceData && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">{tr('Avg Query Time:', 'Temps moyen des requêtes :')}</span>
                      <span className="text-gray-900">
                        {performanceData.queries.averageDuration || 0}ms
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">{tr('Total Queries:', 'Nombre total de requêtes :')}</span>
                      <span className="text-gray-900">
                        {performanceData.overall.totalQueries}
                      </span>
                    </div>
                  </>
                )}
                
                {/* Loading Duration */}
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-gray-600">{tr('Loading Time:', 'Temps de chargement :')}</span>
                  <span className="text-gray-900">
                    {Math.round((Date.now() - loadingStartTime) / 1000)}s
                  </span>
                </div>
              </div>
            </div>
          )}
          
          {/* Connection Warning */}
          {connectionStatus === 'disconnected' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg"
            >
              <div className="flex items-center gap-2 text-yellow-800">
                <WifiOff className="h-4 w-4" />
                <span className="text-sm">
                  {tr("You're offline. Some features may not work properly.", 'Vous êtes hors ligne. Certaines fonctionnalités peuvent ne pas fonctionner correctement.')}
                </span>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

// Enhanced Loading States Component
export const LoadingStates = {
  // Skeleton loader for lists
  ListSkeleton: ({ items = 3, className = '' }) => (
    <div className={`space-y-4 ${className}`}>
      {Array.from({ length: items }).map((_, index) => (
        <div key={index} className="animate-pulse">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-gray-200 rounded-lg"></div>
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  ),

  // Skeleton loader for cards
  CardSkeleton: ({ className = '' }) => (
    <div className={`animate-pulse ${className}`}>
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="flex items-center space-x-4 mb-4">
          <div className="w-10 h-10 bg-gray-200 rounded-lg"></div>
          <div className="flex-1">
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-1/4"></div>
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-3 bg-gray-200 rounded"></div>
          <div className="h-3 bg-gray-200 rounded w-5/6"></div>
          <div className="h-3 bg-gray-200 rounded w-4/6"></div>
        </div>
      </div>
    </div>
  ),

  // Table skeleton loader
  TableSkeleton: ({ rows = 5, columns = 4, className = '' }) => (
    <div className={`animate-pulse ${className}`}>
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {/* Header */}
        <div className="bg-gray-50 px-6 py-3 border-b">
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
            {Array.from({ length: columns }).map((_, index) => (
              <div key={index} className="h-4 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
        
        {/* Rows */}
        <div className="divide-y divide-gray-200">
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <div key={rowIndex} className="px-6 py-4">
              <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
                {Array.from({ length: columns }).map((_, colIndex) => (
                  <div key={colIndex} className="h-4 bg-gray-200 rounded"></div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  ),

  // Form skeleton loader
  FormSkeleton: ({ fields = 4, className = '' }) => (
    <div className={`animate-pulse space-y-6 ${className}`}>
      {Array.from({ length: fields }).map((_, index) => (
        <div key={index} className="space-y-2">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          <div className="h-10 bg-gray-200 rounded"></div>
        </div>
      ))}
      <div className="flex justify-end space-x-3 pt-4">
        <div className="h-10 bg-gray-200 rounded w-20"></div>
        <div className="h-10 bg-gray-200 rounded w-24"></div>
      </div>
    </div>
  )
};

// Connection Status Indicator
export const ConnectionStatus = ({ className = '' }) => {
  const [status, setStatus] = useState(navigator.onLine ? 'connected' : 'disconnected');
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  useEffect(() => {
    const handleOnline = () => {
      setStatus('connected');
      setLastUpdate(Date.now());
    };
    
    const handleOffline = () => {
      setStatus('disconnected');
      setLastUpdate(Date.now());
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const getStatusColor = () => {
    switch (status) {
      case 'connected': return 'text-green-600 bg-green-50 border-green-200';
      case 'disconnected': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'connected': return <CheckCircle className="h-4 w-4" />;
      case 'disconnected': return <WifiOff className="h-4 w-4" />;
      default: return <AlertCircle className="h-4 w-4" />;
    }
  };

  return (
    <AnimatePresence>
      {status === 'disconnected' && (
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -50 }}
          className={`fixed top-4 right-4 z-50 ${className}`}
        >
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium ${getStatusColor()}`}>
            {getStatusIcon()}
            <span>
              {status === 'connected' ? 'Back online' : 'You\'re offline'}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PerformanceAwareLoader;
