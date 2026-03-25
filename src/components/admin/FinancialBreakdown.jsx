import React from 'react';
import { useTranslation } from 'react-i18next';

const FinancialBreakdown = ({ rental, compact = false }) => {
  const { t } = useTranslation();
  
  if (!rental) return null;

  // Safe parsing with proper fallbacks
  const totalAmount = parseFloat(rental.total_amount || 0);
  const depositAmount = parseFloat(rental.deposit_amount || 0);
  
  // BUSINESS RULE: Completed rentals must have $0 remaining balance
  let remainingAmount;
  if (rental.rental_status === 'completed') {
    remainingAmount = 0; // Force to $0 for completed rentals
  } else {
    remainingAmount = Math.max(0, totalAmount - depositAmount); // Normal calculation for non-completed
  }

  // Determine payment status based on amounts and rental status - use proper floating point comparison
  const getPaymentStatus = () => {
    // Use tolerance for floating point comparison
    const tolerance = 0.01;
    const isCompleted = rental.rental_status === 'completed';
    
    // BUSINESS RULE: Completed rentals must always show as "Paid" or "Fully Paid"
    if (isCompleted) {
      return { status: 'fully_paid', label: 'Fully Paid', color: 'text-green-600' };
    }
    
    // For non-completed rentals, use normal payment logic
    if (Math.abs(depositAmount) < tolerance) {
      return { status: 'pending_payment', label: 'Pending Payment', color: 'text-red-600' };
    }
    if (Math.abs(depositAmount - totalAmount) < tolerance) {
      return { status: 'fully_paid', label: 'Fully Paid', color: 'text-green-600' };
    }
    return { status: 'deposit_paid', label: 'Deposit Paid', color: 'text-yellow-600' };
  };

  const paymentStatus = getPaymentStatus();

  if (compact) {
    return (
      <div className="text-sm">
        <div className="font-semibold">${totalAmount.toFixed(2)}</div>
        {/* Always show deposit amount, even if $0 */}
        <div className="text-xs text-green-600">Deposit: ${depositAmount.toFixed(2)}</div>
        {/* Always show remaining amount */}
        <div className={`text-xs ${remainingAmount > 0 ? 'text-red-600' : 'text-green-600'}`}>
          Remaining: ${remainingAmount.toFixed(2)}
        </div>
        <div className={`text-xs font-medium ${paymentStatus.color}`}>
          {paymentStatus.label}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 p-4 rounded-lg">
      <h4 className="text-sm font-medium text-gray-900 mb-3">
        {t('admin.rentals.financialBreakdown', 'Financial Breakdown')}
      </h4>
      
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Total Amount:</span>
          <span className="text-sm font-semibold text-gray-900">${totalAmount.toFixed(2)}</span>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Deposit Paid:</span>
          <span className="text-sm font-medium text-green-600">${depositAmount.toFixed(2)}</span>
        </div>
        
        <div className="border-t pt-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700">Remaining:</span>
            <span className={`text-sm font-bold ${remainingAmount > 0 ? 'text-red-600' : 'text-green-600'}`}>
              ${remainingAmount.toFixed(2)}
            </span>
          </div>
        </div>
        
        <div className="pt-2 border-t">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Payment Status:</span>
            <span className={`text-sm font-medium ${paymentStatus.color}`}>
              {paymentStatus.label}
            </span>
          </div>
        </div>
        
        {/* Payment Progress Bar */}
        <div className="pt-2">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Payment Progress</span>
            <span>{((depositAmount / totalAmount) * 100).toFixed(0)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className={`h-2 rounded-full transition-all duration-300 ${
                depositAmount >= totalAmount ? 'bg-green-500' : 
                depositAmount > 0 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${Math.min((depositAmount / totalAmount) * 100, 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinancialBreakdown;