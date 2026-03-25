import React, { useState, useEffect } from 'react';
import { DollarSign, Clock, Calculator, AlertTriangle } from 'lucide-react';

const PricingCalculator = ({ booking, actualDuration, isOnTour }) => {
  const [pricing, setPricing] = useState({
    basePrice: 150, // Base price for 4-hour tour
    baseDurationHours: 4,
    overtimeRate: 30, // Per hour overtime rate
    totalPrice: 150,
    extraCharges: 0,
    balance: 0
  });

  useEffect(() => {
    if (actualDuration && actualDuration > pricing.baseDurationHours * 60) {
      // Calculate overtime
      const overtimeMinutes = actualDuration - (pricing.baseDurationHours * 60);
      const overtimeHours = Math.ceil(overtimeMinutes / 60); // Round up to full hours
      const extraCharges = overtimeHours * pricing.overtimeRate;
      const totalPrice = pricing.basePrice + extraCharges;
      
      setPricing(prev => ({
        ...prev,
        extraCharges,
        totalPrice,
        balance: totalPrice - pricing.basePrice // Assuming base price was already paid
      }));
    }
  }, [actualDuration, pricing.basePrice, pricing.baseDurationHours, pricing.overtimeRate]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDuration = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const hasOvertime = pricing.extraCharges > 0;

  return (
    <div className="bg-gray-50 rounded-lg p-4 space-y-4">
      <div className="flex items-center">
        <Calculator className="h-5 w-5 text-blue-600 mr-2" />
        <h4 className="font-medium text-gray-900">Pricing Summary</h4>
      </div>

      {/* Base Pricing */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <div className="flex items-center text-sm text-gray-600">
            <Clock className="h-4 w-4 mr-1" />
            Base Tour ({pricing.baseDurationHours}h)
          </div>
          <span className="font-medium text-gray-900">
            {formatCurrency(pricing.basePrice)}
          </span>
        </div>

        {/* Show actual duration if tour is ongoing or completed */}
        {(isOnTour || actualDuration) && (
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              Actual Duration
            </div>
            <span className="font-medium text-gray-900">
              {actualDuration ? formatDuration(actualDuration) : 'In progress...'}
            </span>
          </div>
        )}

        {/* Overtime charges */}
        {hasOvertime && (
          <>
            <div className="border-t border-gray-200 pt-2">
              <div className="flex justify-between items-center">
                <div className="flex items-center text-sm text-orange-600">
                  <AlertTriangle className="h-4 w-4 mr-1" />
                  Extra Time Charges
                </div>
                <span className="font-medium text-orange-600">
                  {formatCurrency(pricing.extraCharges)}
                </span>
              </div>
            </div>

            {/* Balance due */}
            <div className="bg-orange-50 border border-orange-200 rounded p-3">
              <div className="flex justify-between items-center">
                <span className="font-medium text-orange-900">
                  Additional Balance Due
                </span>
                <span className="text-lg font-bold text-orange-900">
                  {formatCurrency(pricing.balance)}
                </span>
              </div>
              <p className="text-xs text-orange-700 mt-1">
                To be collected after tour completion
              </p>
            </div>
          </>
        )}
      </div>

      {/* Total */}
      <div className="border-t border-gray-200 pt-3">
        <div className="flex justify-between items-center">
          <span className="font-semibold text-gray-900">Total Amount</span>
          <span className="text-xl font-bold text-blue-600">
            {formatCurrency(pricing.totalPrice)}
          </span>
        </div>
      </div>

      {/* Payment Status */}
      <div className="text-xs text-gray-500 space-y-1">
        <div className="flex justify-between">
          <span>Reservation Paid:</span>
          <span className="text-green-600 font-medium">
            {formatCurrency(pricing.basePrice)}
          </span>
        </div>
        {hasOvertime && (
          <div className="flex justify-between">
            <span>Outstanding Balance:</span>
            <span className="text-orange-600 font-medium">
              {formatCurrency(pricing.balance)}
            </span>
          </div>
        )}
      </div>

      {/* Pricing Notes */}
      <div className="text-xs text-gray-500 bg-white rounded p-2">
        <p className="font-medium mb-1">Pricing Policy:</p>
        <ul className="space-y-1">
          <li>• Base rate: {formatCurrency(pricing.basePrice)} for {pricing.baseDurationHours} hours</li>
          <li>• Overtime: {formatCurrency(pricing.overtimeRate)}/hour (rounded up)</li>
          <li>• Payment accepted: Cash, Card, Transfer</li>
        </ul>
      </div>
    </div>
  );
};

export default PricingCalculator;