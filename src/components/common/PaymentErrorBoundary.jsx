import React from 'react';
import StripeErrorHandler from '../../utils/stripeErrorHandler';

class PaymentErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error for monitoring
    console.error('Payment Error Boundary caught an error:', error, errorInfo);
    
    // Analyze the error using our Stripe error handler
    const analysis = StripeErrorHandler.analyzeError(error);
    
    // Log detailed error information
    StripeErrorHandler.logError('payment_error_boundary', error, analysis);

    this.setState({
      error: error,
      errorInfo: errorInfo,
      analysis: analysis
    });
  }

  handleRetry = () => {
    // Reset error state to retry
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false
    });
  };

  handleShowAlternatives = () => {
    // Trigger parent component to show alternative payment options
    if (this.props.onShowAlternatives) {
      this.props.onShowAlternatives();
    }
  };

  render() {
    if (this.state.hasError) {
      const { error, analysis, showDetails } = this.state;
      const isStripeError = error?.message?.includes('stripe') || 
                           error?.message?.includes('payment') ||
                           error?.message?.includes('ERR_BLOCKED_BY_CLIENT');

      return (
        <div className="payment-error-boundary">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 m-4">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              
              <div className="ml-4 flex-1">
                <h3 className="text-lg font-semibold text-red-800 mb-2">
                  Payment System Error
                </h3>
                
                <p className="text-red-700 mb-4">
                  {analysis?.userFriendly || 'An unexpected error occurred with the payment system.'}
                </p>

                {isStripeError && analysis?.category === 'blocking' && (
                  <div className="mb-4 p-4 bg-white border border-red-200 rounded">
                    <h4 className="font-medium text-red-800 mb-2">
                      This appears to be a browser blocking issue
                    </h4>
                    <ul className="text-sm text-red-700 list-disc list-inside space-y-1">
                      {StripeErrorHandler.getTroubleshootingSteps(analysis.type).map((step, index) => (
                        <li key={index}>{step}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex flex-wrap gap-3 mb-4">
                  <button
                    onClick={this.handleRetry}
                    className="bg-red-100 hover:bg-red-200 text-red-800 px-4 py-2 rounded-md text-sm font-medium transition-colors"
                  >
                    Try Again
                  </button>
                  
                  <button
                    onClick={this.handleShowAlternatives}
                    className="bg-blue-100 hover:bg-blue-200 text-blue-800 px-4 py-2 rounded-md text-sm font-medium transition-colors"
                  >
                    Alternative Payment Options
                  </button>
                  
                  <button
                    onClick={() => this.setState({ showDetails: !showDetails })}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-md text-sm font-medium transition-colors"
                  >
                    {showDetails ? 'Hide' : 'Show'} Technical Details
                  </button>
                </div>

                {showDetails && (
                  <div className="bg-white border border-red-200 rounded p-4 text-sm">
                    <h5 className="font-medium text-gray-800 mb-2">Technical Details:</h5>
                    <div className="text-gray-600 space-y-2">
                      <p><strong>Error:</strong> {error?.message || 'Unknown error'}</p>
                      <p><strong>Type:</strong> {analysis?.type || 'Unknown'}</p>
                      <p><strong>Category:</strong> {analysis?.category || 'Unknown'}</p>
                      {analysis?.severity && (
                        <p><strong>Severity:</strong> {analysis.severity}</p>
                      )}
                    </div>
                  </div>
                )}

                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded">
                  <h4 className="font-medium text-blue-800 mb-2">Need Help?</h4>
                  <div className="text-sm text-blue-700 space-y-1">
                    <p>📞 Call us: <a href="tel:+1-555-123-4567" className="underline">+1-555-123-4567</a></p>
                    <p>📧 Email: <a href="mailto:payments@quadventure.com" className="underline">payments@quadventure.com</a></p>
                    <p>💬 We're here to help complete your booking!</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Render children in error state if they can handle it */}
          <div className="payment-fallback-content">
            {this.props.fallbackComponent ? (
              <this.props.fallbackComponent 
                error={error} 
                analysis={analysis}
                onRetry={this.handleRetry}
              />
            ) : (
              <div className="text-center p-8 bg-gray-50 rounded-lg m-4">
                <p className="text-gray-600 mb-4">
                  Payment processing is temporarily unavailable, but we can still help you complete your booking.
                </p>
                <button
                  onClick={this.handleShowAlternatives}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                >
                  View Payment Alternatives
                </button>
              </div>
            )}
          </div>
        </div>
      );
    }

    // No error, render children normally
    return this.props.children;
  }
}

// HOC wrapper for functional components
export const withPaymentErrorBoundary = (Component, options = {}) => {
  return React.forwardRef((props, ref) => (
    <PaymentErrorBoundary 
      onShowAlternatives={options.onShowAlternatives}
      fallbackComponent={options.fallbackComponent}
    >
      <Component {...props} ref={ref} />
    </PaymentErrorBoundary>
  ));
};

export default PaymentErrorBoundary;