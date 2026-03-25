import React from 'react';
import PropTypes from 'prop-types';

/**
 * PaymentStatus component displays the result of a payment transaction
 * @param {Object} props - Component props
 * @param {string} props.status - Payment status ('success' or 'failed')
 * @param {string} props.bookingId - The booking ID
 * @param {number} props.totalAmount - The total amount paid
 * @param {Function} props.onComplete - Callback function when user confirms the status
 */
const PaymentStatus = ({ status, bookingId, totalAmount, onComplete }) => {
  const isSuccess = status === 'success';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          {/* Status Icon */}
          <div className={`mx-auto flex items-center justify-center h-20 w-20 rounded-full ${
            isSuccess ? 'bg-green-100' : 'bg-red-100'
          }`}>
            {isSuccess ? (
              <svg className="h-10 w-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
              </svg>
            ) : (
              <svg className="h-10 w-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            )}
          </div>

          {/* Status Message */}
          <h2 className={`mt-6 text-3xl font-extrabold ${
            isSuccess ? 'text-green-900' : 'text-red-900'
          }`}>
            {isSuccess ? 'Payment Successful!' : 'Payment Failed'}
          </h2>

          <p className="mt-2 text-sm text-gray-600">
            {isSuccess 
              ? 'Your booking has been confirmed and payment processed successfully.'
              : 'There was an issue processing your payment. Please try again.'
            }
          </p>

          {/* Booking Details */}
          <div className="mt-6 bg-white shadow rounded-lg p-6">
            <div className="text-left space-y-3">
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-500">Booking ID:</span>
                <span className="text-sm text-gray-900">{bookingId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-500">Amount:</span>
                <span className="text-sm text-gray-900">{totalAmount} MAD</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-gray-500">Status:</span>
                <span className={`text-sm font-medium ${
                  isSuccess ? 'text-green-600' : 'text-red-600'
                }`}>
                  {isSuccess ? 'Confirmed' : 'Failed'}
                </span>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className="mt-8">
            {isSuccess ? (
              <button
                onClick={onComplete} 
                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              >
                Continue
              </button>
            ) : (
              <div className="space-y-3">
                <button
                  onClick={onComplete}
                  className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Try Again
                </button>
                <button
                  onClick={onComplete} 
                  className="group relative w-full flex justify-center py-3 px-4 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Back to Booking
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// PropTypes validation
PaymentStatus.propTypes = {
  status: PropTypes.oneOf(['success', 'failed']).isRequired,
  bookingId: PropTypes.string.isRequired,
  totalAmount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  onComplete: PropTypes.func.isRequired
};

export default PaymentStatus;