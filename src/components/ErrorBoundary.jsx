import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('🚨 ERROR BOUNDARY CAUGHT ERROR:', {
      error: error,
      errorInfo: errorInfo,
      componentStack: errorInfo?.componentStack || 'No component stack available',
      errorBoundary: this.props.name || 'Unknown'
    });
    
    this.setState({
      error: error,
      errorInfo: errorInfo
    });

    // Log the exact error details for debugging
    if (error && error.message && error.message.includes('map')) {
      console.error('🎯 MAP ERROR DETECTED:', {
        message: error.message,
        stack: error.stack || 'No stack trace available',
        componentStack: errorInfo?.componentStack || 'No component stack available'
      });
    }
  }

  render() {
    if (this.state.hasError) {
      // Safe access to error and errorInfo with fallbacks
      const errorMessage = this.state.error ? this.state.error.toString() : 'Unknown error occurred';
      const componentStack = this.state.errorInfo?.componentStack || 'Component stack not available';
      const errorStack = this.state.error?.stack || 'Error stack not available';
      const boundaryName = this.props.name || 'Unknown ErrorBoundary';

      return (
        <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl w-full">
            <h2 className="text-xl font-bold text-red-600 mb-4">
              🚨 Application Error Detected
            </h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-gray-900">Error Boundary:</h3>
                <p className="text-blue-600 bg-blue-50 p-2 rounded text-sm">
                  {boundaryName}
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900">Error Message:</h3>
                <p className="text-red-600 bg-red-50 p-2 rounded text-sm">
                  {errorMessage}
                </p>
              </div>
              
              <div>
                <h3 className="font-semibold text-gray-900">Component Stack:</h3>
                <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-40">
                  {componentStack}
                </pre>
              </div>
              
              <div>
                <h3 className="font-semibold text-gray-900">Error Stack:</h3>
                <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-40">
                  {errorStack}
                </pre>
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={() => window.location.reload()}
                  className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                >
                  Reload Application
                </button>
                <button
                  onClick={() => {
                    this.setState({ hasError: false, error: null, errorInfo: null });
                  }}
                  className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
                >
                  Try Again
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;