import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { selectRentals } from '../../store/slices/rentalsSlice';

const ScheduledRentalsTable = ({ onViewRental, onCollectPayment, onStartRental }) => {
  const { t } = useTranslation();
  const allRentals = useSelector(selectRentals) || [];

  // Filter for scheduled rentals (future start date, not completed/cancelled)
  const scheduledRentals = allRentals.filter(rental => {
    const startDate = new Date(rental.rental_start_date);
    const now = new Date();
    return (
      startDate > now &&
      rental.rental_status !== 'completed' &&
      rental.rental_status !== 'cancelled' &&
      (rental.deposit_amount > 0 || rental.payment_status === 'deposit' || rental.payment_status === 'partial')
    );
  });

  // Calculate financial breakdown with safe math
  const calculateFinancials = (rental) => {
    const total = parseFloat(rental.total_amount || 0);
    const deposit = parseFloat(rental.deposit_amount || 0);
    const isCompleted = rental.rental_status === 'completed';
    
    // BUSINESS RULE: Completed rentals must have $0 remaining balance
    let remaining;
    if (isCompleted) {
      remaining = 0; // Force to $0 for completed rentals
    } else {
      remaining = Math.max(0, total - deposit); // Normal calculation for non-completed
    }
    
    return {
      total: total.toFixed(2),
      deposit: deposit.toFixed(2),
      remaining: remaining.toFixed(2),
      hasRemaining: remaining > 0.01 // Use tolerance for floating point
    };
  };

  // Get status based on payment logic with proper floating point comparison
  const getPaymentStatus = (rental) => {
    const total = parseFloat(rental.total_amount || 0);
    const deposit = parseFloat(rental.deposit_amount || 0);
    const tolerance = 0.01;
    const isCompleted = rental.rental_status === 'completed';

    // BUSINESS RULE: Completed rentals must always show as fully paid
    if (isCompleted) return 'fully_paid';

    // For non-completed rentals, use normal payment logic
    if (Math.abs(deposit) < tolerance) return 'pending_payment';
    if (Math.abs(deposit - total) < tolerance) return 'fully_paid';
    return 'deposit_paid';
  };

  const getStatusBadge = (status) => {
    const badges = {
      pending_payment: 'bg-red-100 text-red-800',
      deposit_paid: 'bg-yellow-100 text-yellow-800',
      fully_paid: 'bg-green-100 text-green-800'
    };
    
    const labels = {
      pending_payment: 'Pending Payment',
      deposit_paid: 'Deposit Paid',
      fully_paid: 'Fully Paid'
    };

    return (
      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${badges[status]}`}>
        {labels[status]}
      </span>
    );
  };

  if (scheduledRentals.length === 0) {
    return (
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          {t('admin.rentals.scheduledRentals', 'Scheduled Rentals')}
        </h3>
        <div className="text-center py-8">
          <div className="text-gray-400 mb-2">
            <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-gray-500">No scheduled rentals found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white shadow overflow-hidden sm:rounded-lg">
      <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
        <h3 className="text-lg leading-6 font-medium text-gray-900">
          {t('admin.rentals.scheduledRentals', 'Scheduled Rentals')}
        </h3>
        <p className="mt-1 max-w-2xl text-sm text-gray-500">
          {scheduledRentals.length} upcoming rentals requiring attention
        </p>
      </div>
      
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Customer
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Rental Dates
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Vehicle Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Financial Breakdown
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {scheduledRentals.map((rental) => {
              const financials = calculateFinancials(rental);
              const paymentStatus = getPaymentStatus(rental);
              
              return (
                <tr key={rental.id} className={`hover:bg-gray-50 ${financials.hasRemaining ? 'border-l-4 border-l-yellow-400' : ''}`}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {rental.customer_name || 'N/A'}
                      </div>
                      <div className="text-sm text-gray-500">{rental.customer_email}</div>
                      {rental.customer_phone && (
                        <div className="text-xs text-gray-400">{rental.customer_phone}</div>
                      )}
                    </div>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div>
                      <div className="font-medium">
                        {rental.rental_start_date ? new Date(rental.rental_start_date).toLocaleDateString() : 'N/A'}
                      </div>
                      <div className="text-xs text-gray-400">
                        to {rental.rental_end_date ? new Date(rental.rental_end_date).toLocaleDateString() : 'N/A'}
                      </div>
                      <div className="text-xs text-blue-600 font-medium">
                        {Math.ceil((new Date() - new Date(rental.rental_start_date)) / (-1000 * 60 * 60 * 24))} days to go
                      </div>
                    </div>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="font-medium capitalize">{rental.rental_type || 'N/A'}</div>
                    <div className="text-xs text-gray-400">
                      {rental.vehicle_plate_number || (rental.vehicle_id ? `Vehicle ID: ${rental.vehicle_id}` : 'N/A')}
                    </div>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Total:</span>
                        <span className="font-semibold">${financials.total}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Deposit:</span>
                        <span className="text-green-600">${financials.deposit}</span>
                      </div>
                      <div className="flex justify-between border-t pt-1">
                        <span className="text-gray-700 font-medium">Remaining:</span>
                        <span className={`font-bold ${financials.hasRemaining ? 'text-red-600' : 'text-green-600'}`}>
                          ${financials.remaining}
                        </span>
                      </div>
                    </div>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(paymentStatus)}
                    {financials.hasRemaining && (
                      <div className="mt-1">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                          <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                          Balance Due
                        </span>
                      </div>
                    )}
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex flex-col space-y-1">
                      <button
                        onClick={() => onViewRental(rental)}
                        className="text-blue-600 hover:text-blue-900 text-xs"
                      >
                        View Details
                      </button>
                      
                      {financials.hasRemaining && (
                        <button
                          onClick={() => onCollectPayment(rental)}
                          className="text-green-600 hover:text-green-900 text-xs font-medium"
                        >
                          Collect Remaining
                        </button>
                      )}
                      
                      <button
                        onClick={() => onStartRental(rental)}
                        className="text-purple-600 hover:text-purple-900 text-xs"
                        disabled={financials.hasRemaining}
                      >
                        {financials.hasRemaining ? 'Payment Required' : 'Start Rental'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ScheduledRentalsTable;