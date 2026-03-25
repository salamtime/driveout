import React, { useState, useEffect } from 'react';
import { useStripe, useElements, CardElement } from '@stripe/react-stripe-js';
import StripeErrorHandler from '../../utils/stripeErrorHandler';
import PaymentOptions from './PaymentOptions';

const PaymentForm = ({ 
  amount, 
  currency = 'usd', 
  onSuccess, 
  onError,
  clientSecret,
  bookingDetails = null 
}) => {
  const stripe = useStripe();
  const elements = useElements();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [connectionTested, setConnectionTested] = useState(false);
  const [canProcessPayments, setCanProcessPayments] = useState(false);

  useEffect(() => {
    // Stripe connectivity testing completely disabled
    setCanProcessPayments(false);
    setConnectionTested(true);
  }, [stripe]);

  const testConnection = async () => {
    if (!stripe) {
      setCanProcessPayments(false);
      setConnectionTested(true);
      return;
    }

    try {
      // Use safe connectivity test that doesn't call api.stripe.com
      const connectivityTest = await StripeErrorHandler.testStripeConnectivity();
      setCanProcessPayments(connectivityTest.connected);
      
      if (!connectivityTest.connected) {
        setError(connectivityTest.error);
        setShowAlternatives(true);
      }
    } catch (err) {
      console.error('Connection test failed:', err);
      setCanProcessPayments(false);
      setError(StripeErrorHandler.analyzeError(err));
      setShowAlternatives(true);
    } finally {
      setConnectionTested(true);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!stripe || !elements || !canProcessPayments) {
      setError({
        type: 'SYSTEM_ERROR',
        userFriendly: 'Payment system is not available. Please try alternative payment methods.'
      });
      setShowAlternatives(true);
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const cardElement = elements.getElement(CardElement);

      if (!cardElement) {
        throw new Error('Card element not found');
      }

      // Create payment method
      const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
      });

      if (pmError) {
        throw pmError;
      }

      // Confirm payment if clientSecret is provided
      if (clientSecret) {
        const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(
          clientSecret,
          {
            payment_method: paymentMethod.id
          }
        );

        if (confirmError) {
          throw confirmError;
        }

        if (paymentIntent.status === 'succeeded') {
          onSuccess && onSuccess(paymentIntent);
        }
      } else {
        // Handle case where no clientSecret (custom integration needed)
        onSuccess && onSuccess(paymentMethod);
      }

    } catch (err) {
      console.error('Payment processing error:', err);
      
      const errorAnalysis = StripeErrorHandler.analyzeError(err);
      setError(errorAnalysis);
      
      // Show alternatives for blocking errors
      if (errorAnalysis.category === 'blocking') {
        setShowAlternatives(true);
      }
      
      onError && onError(errorAnalysis);
    } finally {
      setIsProcessing(false);
    }
  };

  const cardElementOptions = {
    style: {
      base: {
        fontSize: '16px',
        color: '#424770',
        '::placeholder': {
          color: '#aab7c4',
        },
        fontFamily: 'system-ui, sans-serif',
      },
      invalid: {
        color: '#9e2146',
      },
    },
    hidePostalCode: false,
  };

  if (!connectionTested) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Testing payment connection...</span>
      </div>
    );
  }

  if (showAlternatives || !canProcessPayments) {
    return (
      <PaymentOptions
        amount={amount}
        currency={currency}
        bookingDetails={bookingDetails}
        error={error}
        onRetry={() => {
          setShowAlternatives(false);
          setError(null);
          testConnection();
        }}
      />
    );
  }

  return (
    <div className="payment-form-container">
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start">
            <svg className="h-5 w-5 text-red-400 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Payment Error</h3>
              <p className="mt-1 text-sm text-red-700">{error.userFriendly}</p>
              
              {error.category === 'blocking' && (
                <button
                  onClick={() => setShowAlternatives(true)}
                  className="mt-2 text-sm text-red-800 underline hover:no-underline"
                >
                  View alternative payment options
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white p-6 border border-gray-200 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Payment Details
          </h3>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Card Information
            </label>
            <div className="p-3 border border-gray-300 rounded-md bg-white">
              <CardElement options={cardElementOptions} />
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-gray-200">
            <div className="text-sm text-gray-600">
              Total: <span className="font-semibold">
                {new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: currency.toUpperCase(),
                }).format(amount / 100)}
              </span>
            </div>
            
            <button
              type="submit"
              disabled={!stripe || isProcessing}
              className={`px-6 py-2 rounded-md font-medium transition-colors ${
                isProcessing
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {isProcessing ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Processing...
                </div>
              ) : (
                'Pay Now'
              )}
            </button>
          </div>
        </div>

        <div className="text-center">
          <button
            type="button"
            onClick={() => setShowAlternatives(true)}
            className="text-sm text-blue-600 hover:text-blue-800 underline"
          >
            Need alternative payment options?
          </button>
        </div>
      </form>
    </div>
  );
};

export default PaymentForm;