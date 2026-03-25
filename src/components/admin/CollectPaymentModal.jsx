import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';

const CollectPaymentModal = ({ rental, isOpen, onSave, onCancel }) => {
  const { t } = useTranslation();
  const [paymentData, setPaymentData] = useState({
    payment_amount: '',
    payment_method: 'cash',
    payment_notes: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Calculate financial breakdown with safe math
  const totalAmount = parseFloat(rental?.total_amount || 0);
  const currentDeposit = parseFloat(rental?.deposit_amount || 0);
  const remainingAmount = Math.max(0, totalAmount - currentDeposit);

  useEffect(() => {
    if (rental && isOpen) {
      setPaymentData({
        payment_amount: remainingAmount.toFixed(2),
        payment_method: 'cash',
        payment_notes: ''
      });
    }
  }, [rental, isOpen, remainingAmount]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setPaymentData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const paymentAmount = parseFloat(paymentData.payment_amount);
    
    if (paymentAmount <= 0) {
      toast.error('Payment amount must be greater than 0');
      return;
    }
    
    if (paymentAmount > remainingAmount) {
      toast.error('Payment amount cannot exceed remaining balance');
      return;
    }

    setIsSubmitting(true);

    try {
      const newDepositAmount = currentDeposit + paymentAmount;
      const tolerance = 0.01;
      
      // Use proper floating point comparison for payment status
      let newPaymentStatus;
      if (Math.abs(newDepositAmount - totalAmount) < tolerance) {
        newPaymentStatus = 'paid';
      } else if (newDepositAmount > tolerance) {
        newPaymentStatus = 'partial';
      } else {
        newPaymentStatus = 'pending';
      }

      const updatedRental = {
        ...rental,
        deposit_amount: newDepositAmount,
        payment_status: newPaymentStatus,
        payment_notes: paymentData.payment_notes
      };

      await onSave(updatedRental);
      
      toast.success(`Payment of $${paymentAmount.toFixed(2)} collected successfully!`);
      
      // Reset form
      setPaymentData({
        payment_amount: '',
        payment_method: 'cash',
        payment_notes: ''
      });
      
      onCancel(); // Close modal
    } catch (error) {
      console.error('Payment collection failed:', error);
      toast.error('Failed to process payment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !rental) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-md shadow-lg rounded-md bg-white">
        <div className="mt-3">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900">
              {t('admin.rentals.collectPayment', 'Collect Payment')}
            </h3>
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Customer & Rental Info */}
          <div className="bg-gray-50 p-4 rounded-lg mb-4">
            <div className="text-sm">
              <div className="font-medium text-gray-900">{rental.customer_name}</div>
              <div className="text-gray-500">{rental.customer_email}</div>
              <div className="text-xs text-gray-400 mt-1">
                {rental.rental_start_date ? new Date(rental.rental_start_date).toLocaleDateString() : 'N/A'}
                {' - '}
                {rental.rental_end_date ? new Date(rental.rental_end_date).toLocaleDateString() : 'N/A'}
              </div>
            </div>
          </div>

          {/* Financial Breakdown */}
          <div className="bg-blue-50 p-4 rounded-lg mb-4">
            <h4 className="font-medium text-gray-900 mb-2">Financial Summary</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Amount:</span>
                <span className="font-semibold">${totalAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Deposit Paid:</span>
                <span className="text-green-600">${currentDeposit.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="font-medium text-gray-700">Remaining Balance:</span>
                <span className="font-bold text-red-600">${remainingAmount.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Payment Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Amount *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-gray-500 sm:text-sm">$</span>
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={remainingAmount}
                  name="payment_amount"
                  value={paymentData.payment_amount}
                  onChange={handleInputChange}
                  className="block w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="0.00"
                  required
                />
              </div>
            </div>

            {/* Payment Method */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Method
              </label>
              <select
                name="payment_method"
                value={paymentData.payment_method}
                onChange={handleInputChange}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="cash">Cash</option>
                <option value="card">Credit/Debit Card</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="check">Check</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Payment Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Notes (Optional)
              </label>
              <textarea
                name="payment_notes"
                value={paymentData.payment_notes}
                onChange={handleInputChange}
                rows="2"
                className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Additional payment details..."
              />
            </div>

            {/* Form Actions */}
            <div className="flex justify-end space-x-3 pt-4 border-t">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className={`px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
                  isSubmitting 
                    ? 'bg-gray-400 cursor-not-allowed' 
                    : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                {isSubmitting ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Processing...
                  </div>
                ) : (
                  `Collect $${parseFloat(paymentData.payment_amount || 0).toFixed(2)}`
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CollectPaymentModal;