import React, { useState, useEffect } from 'react';
import StripeErrorHandler from '../../utils/stripeErrorHandler';

const StripeConnectionStatus = ({ onRetry }) => {
  const [connectionStatus, setConnectionStatus] = useState('checking');
  const [error, setError] = useState(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    setConnectionStatus('checking');
    setError(null);

    try {
      // Use StripeErrorHandler directly - no need for useStripe() hook
      const connectivityTest = await StripeErrorHandler.testStripeConnectivity();
      
      if (connectivityTest.connected) {
        setConnectionStatus('connected');
      } else {
        setConnectionStatus('blocked');
        setError(connectivityTest.error);
      }
    } catch (err) {
      console.error('Connection check failed:', err);
      setConnectionStatus('error');
      setError(StripeErrorHandler.analyzeError(err));
    }
  };

  const getStatusIcon = () => {
    switch (connectionStatus) {
      case 'connected':
        return (
          <svg className="h-4 w-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        );
      case 'blocked':
      case 'error':
        return (
          <svg className="h-4 w-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        );
      case 'unavailable':
        return (
          <svg className="h-4 w-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        );
      default:
        return (
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
        );
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'Payment system ready';
      case 'blocked':
        return 'Payment blocked by browser';
      case 'error':
        return 'Payment system error';
      case 'unavailable':
        return 'Payment system unavailable';
      case 'checking':
        return 'Checking payment system...';
      default:
        return 'Unknown status';
    }
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'text-green-700 bg-green-50 border-green-200';
      case 'blocked':
      case 'error':
        return 'text-red-700 bg-red-50 border-red-200';
      case 'unavailable':
        return 'text-yellow-700 bg-yellow-50 border-yellow-200';
      default:
        return 'text-blue-700 bg-blue-50 border-blue-200';
    }
  };

  // Don't show status if everything is working fine
  if (connectionStatus === 'connected') {
    return null;
  }

  return (
    <div className={`border rounded-lg p-3 m-4 ${getStatusColor()}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {getStatusIcon()}
          <span className="text-sm font-medium">{getStatusText()}</span>
        </div>
        
        <div className="flex items-center space-x-2">
          {(connectionStatus === 'blocked' || connectionStatus === 'error') && (
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-xs underline hover:no-underline"
            >
              {showDetails ? 'Hide Details' : 'Show Help'}
            </button>
          )}
          
          {onRetry && (
            <button
              onClick={onRetry}
              className="text-xs bg-white px-2 py-1 rounded border hover:bg-gray-50 transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      </div>

      {showDetails && error && (
        <div className="mt-3 pt-3 border-t border-current border-opacity-20">
          <div className="text-sm">
            <p className="font-medium mb-2">How to fix this:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              {StripeErrorHandler.getTroubleshootingSteps(error.type).map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ul>
            
            <div className="mt-3 p-2 bg-white bg-opacity-50 rounded text-xs">
              <p className="font-medium">Alternative Options:</p>
              <p>Contact us at: <a href="tel:+1-555-123-4567" className="underline">+1-555-123-4567</a></p>
              <p>Email: <a href="mailto:payments@quadventure.com" className="underline">payments@quadventure.com</a></p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StripeConnectionStatus;