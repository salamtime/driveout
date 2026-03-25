import React, { useState } from 'react';
import StripeErrorHandler from '../../utils/stripeErrorHandler';

const PaymentOptions = ({ 
  amount, 
  currency = 'usd', 
  bookingDetails = null, 
  error = null,
  onRetry 
}) => {
  const [selectedOption, setSelectedOption] = useState('retry');
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactFormData, setContactFormData] = useState({
    name: '',
    email: '',
    phone: '',
    preferredMethod: 'phone'
  });

  const formatAmount = (amount, currency) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

  const handleContactSubmit = (e) => {
    e.preventDefault();
    // Handle contact form submission
    console.log('Payment contact request:', { contactFormData, amount, bookingDetails });
    alert('Thank you! We will contact you shortly to process your payment.');
    setShowContactForm(false);
  };

  const handleInputChange = (e) => {
    setContactFormData({
      ...contactFormData,
      [e.target.name]: e.target.value
    });
  };

  const paymentOptions = [
    {
      id: 'retry',
      title: 'Try Again',
      description: 'Retry the online payment after fixing browser issues',
      icon: '🔄',
      action: () => onRetry && onRetry()
    },
    {
      id: 'phone',
      title: 'Pay by Phone',
      description: 'Call us to complete your payment securely',
      icon: '📞',
      details: '+1-555-123-4567'
    },
    {
      id: 'email',
      title: 'Pay by Email',
      description: 'We\'ll send you secure payment instructions',
      icon: '📧',
      details: 'payments@quadventure.com'
    },
    {
      id: 'person',
      title: 'Pay in Person',
      description: 'Visit our location or arrange on-site payment',
      icon: '🏢',
      details: 'Sahara Desert Adventure Center'
    }
  ];

  return (
    <div className="payment-options-container">
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
        <div className="flex items-start">
          <svg className="h-6 w-6 text-yellow-600 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <div className="ml-4">
            <h3 className="text-lg font-semibold text-yellow-800 mb-2">
              Online Payment Temporarily Unavailable
            </h3>
            <p className="text-yellow-700 mb-3">
              {error?.userFriendly || 'The online payment system is currently blocked by your browser or security settings.'}
            </p>
            
            {error && error.category === 'blocking' && (
              <div className="mb-4">
                <p className="font-medium text-yellow-800 mb-2">Quick fixes to try:</p>
                <ul className="text-sm text-yellow-700 list-disc list-inside space-y-1">
                  {StripeErrorHandler.getTroubleshootingSteps(error.type).map((step, index) => (
                    <li key={index}>{step}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="bg-white p-4 rounded border">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Total Amount:</span>
                <span className="text-xl font-bold text-gray-900">
                  {formatAmount(amount, currency)}
                </span>
              </div>
              {bookingDetails && (
                <div className="mt-2 text-sm text-gray-600">
                  <p>Booking: {bookingDetails.type || 'Adventure Booking'}</p>
                  {bookingDetails.date && <p>Date: {bookingDetails.date}</p>}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Alternative Payment Methods
        </h3>

        <div className="grid gap-4 md:grid-cols-2">
          {paymentOptions.map((option) => (
            <div
              key={option.id}
              className={`border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md ${
                selectedOption === option.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => setSelectedOption(option.id)}
            >
              <div className="flex items-start space-x-3">
                <span className="text-2xl">{option.icon}</span>
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900">{option.title}</h4>
                  <p className="text-sm text-gray-600 mt-1">{option.description}</p>
                  {option.details && (
                    <p className="text-sm font-medium text-blue-600 mt-2">
                      {option.details}
                    </p>
                  )}
                </div>
                <div className="flex-shrink-0">
                  <div className={`w-4 h-4 rounded-full border-2 ${
                    selectedOption === option.id
                      ? 'border-blue-500 bg-blue-500'
                      : 'border-gray-300'
                  }`}>
                    {selectedOption === option.id && (
                      <div className="w-2 h-2 bg-white rounded-full mx-auto mt-0.5"></div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex space-x-4 pt-6">
          {selectedOption === 'retry' && (
            <button
              onClick={() => onRetry && onRetry()}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 px-6 rounded-lg font-medium transition-colors"
            >
              Try Online Payment Again
            </button>
          )}

          {selectedOption === 'phone' && (
            <a
              href="tel:+1-555-123-4567"
              className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 px-6 rounded-lg font-medium text-center transition-colors"
            >
              Call Now: +1-555-123-4567
            </a>
          )}

          {selectedOption === 'email' && (
            <a
              href={`mailto:payments@quadventure.com?subject=Payment Request&body=I need to make a payment of ${formatAmount(amount, currency)}`}
              className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-3 px-6 rounded-lg font-medium text-center transition-colors"
            >
              Send Email Request
            </a>
          )}

          {(selectedOption === 'person' || selectedOption === 'email') && (
            <button
              onClick={() => setShowContactForm(true)}
              className="flex-1 bg-orange-600 hover:bg-orange-700 text-white py-3 px-6 rounded-lg font-medium transition-colors"
            >
              Schedule Payment
            </button>
          )}
        </div>
      </div>

      {/* Contact Form Modal */}
      {showContactForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Schedule Payment</h3>
              <button
                onClick={() => setShowContactForm(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleContactSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  value={contactFormData.name}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  name="email"
                  required
                  value={contactFormData.email}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number *
                </label>
                <input
                  type="tel"
                  name="phone"
                  required
                  value={contactFormData.phone}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Preferred Contact Method
                </label>
                <select
                  name="preferredMethod"
                  value={contactFormData.preferredMethod}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="phone">Phone Call</option>
                  <option value="email">Email</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
              </div>

              <div className="bg-gray-50 p-3 rounded border">
                <p className="text-sm text-gray-600">
                  <strong>Amount to Pay:</strong> {formatAmount(amount, currency)}
                </p>
                {bookingDetails && (
                  <p className="text-sm text-gray-600">
                    <strong>Booking:</strong> {bookingDetails.type || 'Adventure Booking'}
                  </p>
                )}
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowContactForm(false)}
                  className="flex-1 py-2 px-4 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors"
                >
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentOptions;