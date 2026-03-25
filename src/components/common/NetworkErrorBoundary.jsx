import React, { Component } from 'react';
import NetworkDiagnostics from '../../utils/NetworkDiagnostics';

class NetworkErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      diagnostics: null,
      isRunningDiagnostics: false
    };
    this.networkDiagnostics = new NetworkDiagnostics();
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error,
      errorInfo
    });

    // Check if this is a network-related error
    if (this.isNetworkError(error)) {
      this.runDiagnostics();
    }
  }

  isNetworkError(error) {
    const networkErrorIndicators = [
      'ERR_BLOCKED_BY_CLIENT',
      'Failed to fetch',
      'Network Error',
      'ERR_NETWORK',
      'ERR_INTERNET_DISCONNECTED',
      'TypeError: Failed to fetch'
    ];

    const errorString = error?.toString() || '';
    // Added defensive check for networkErrorIndicators array
    return networkErrorIndicators && networkErrorIndicators.some(indicator => 
      indicator && errorString && errorString.includes(indicator)
    );
  }

  runDiagnostics = async () => {
    this.setState({ isRunningDiagnostics: true });
    
    try {
      const diagnostics = await this.networkDiagnostics.runFullDiagnostics();
      this.setState({ 
        diagnostics,
        isRunningDiagnostics: false 
      });
    } catch (error) {
      console.error('Failed to run diagnostics:', error);
      this.setState({ isRunningDiagnostics: false });
    }
  };

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      diagnostics: null
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
          <div className="sm:mx-auto sm:w-full sm:max-w-md">
            <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
              <div className="text-center">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                  <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h2 className="mt-4 text-lg font-medium text-gray-900">
                  Connection Error
                </h2>
                <p className="mt-2 text-sm text-gray-600">
                  We're having trouble connecting to our services. This might be due to network restrictions or ad blockers.
                </p>
              </div>

              {/* Diagnostics Section */}
              <div className="mt-6">
                {this.state.isRunningDiagnostics && (
                  <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-2 text-sm text-gray-600">Running diagnostics...</p>
                  </div>
                )}

                {this.state.diagnostics && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-medium text-gray-900">Diagnostic Results:</h3>
                    
                    {/* Test Results */}
                    <div className="space-y-2">
                      {Object.entries(this.state.diagnostics.tests).map(([testName, result]) => {
                        if (testName === 'tables') {
                          return result.map((table, index) => (
                            <div key={index} className={`flex items-center text-xs p-2 rounded ${table.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                              <span className={`w-2 h-2 rounded-full mr-2 ${table.success ? 'bg-green-500' : 'bg-red-500'}`}></span>
                              {table.message}
                            </div>
                          ));
                        }
                        
                        return (
                          <div key={testName} className={`flex items-center text-xs p-2 rounded ${result.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                            <span className={`w-2 h-2 rounded-full mr-2 ${result.success ? 'bg-green-500' : 'bg-red-500'}`}></span>
                            {result.message}
                          </div>
                        );
                      })}
                    </div>

                    {/* Recommendations */}
                    {this.state.diagnostics.recommendations?.length > 0 && (
                      <div className="mt-4">
                        <h4 className="text-sm font-medium text-gray-900 mb-2">Recommended Solutions:</h4>
                        <div className="space-y-2">
                          {this.state.diagnostics.recommendations.map((rec, index) => (
                            <div key={index} className={`p-3 rounded-md border-l-4 ${
                              rec.priority === 'critical' ? 'bg-red-50 border-red-500' :
                              rec.priority === 'high' ? 'bg-yellow-50 border-yellow-500' :
                              'bg-blue-50 border-blue-500'
                            }`}>
                              <h5 className="text-sm font-medium text-gray-900">{rec.issue}</h5>
                              <p className="text-xs text-gray-700 mt-1">{rec.solution}</p>
                              {rec.details && (
                                <p className="text-xs text-gray-500 mt-1">{rec.details}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="mt-6 flex space-x-3">
                <button
                  onClick={this.handleRetry}
                  className="flex-1 bg-blue-600 text-white text-sm font-medium py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  Try Again
                </button>
                {!this.state.diagnostics && !this.state.isRunningDiagnostics && (
                  <button
                    onClick={this.runDiagnostics}
                    className="flex-1 bg-gray-600 text-white text-sm font-medium py-2 px-4 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
                  >
                    Run Diagnostics
                  </button>
                )}
              </div>

              {/* Technical Details (Collapsible) */}
              {this.state.error && (
                <details className="mt-4">
                  <summary className="text-xs text-gray-500 cursor-pointer">Technical Details</summary>
                  <div className="mt-2 text-xs text-gray-400 font-mono bg-gray-100 p-2 rounded">
                    <div>Error: {this.state.error.toString()}</div>
                    {this.state.errorInfo?.componentStack && (
                      <div className="mt-2">Stack: {this.state.errorInfo.componentStack}</div>
                    )}
                  </div>
                </details>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default NetworkErrorBoundary;