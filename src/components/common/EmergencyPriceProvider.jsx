import React from 'react';

/**
 * Emergency Price Provider
 * Provides hard-coded fallback pricing values when database and cached settings fail
 * Acts as the final safety net in the multi-layered fallback strategy
 */
const EMERGENCY_PRICES = {
  defaultRate1h: 49.99,
  defaultRate2h: 89.99,
  vipRate1h: 74.99,
  vipRate2h: 139.99,
  extraPassengerFee: 14.99,
  depositPercentage: 25
};

/**
 * Get emergency pricing values
 * These values are hard-coded and will be used when all other sources fail
 * @returns {Object} Hard-coded pricing values
 */
export const getEmergencyPrices = () => {
  console.log('Using emergency fallback pricing values');
  return EMERGENCY_PRICES;
};

/**
 * Emergency Price Provider Component
 * Renders a UI with hard-coded prices when all pricing sources fail
 */
const EmergencyPriceProvider = ({ children }) => {
  return (
    <div className="emergency-price-provider">
      {children}
      <div className="emergency-price-notice mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
        <h3 className="text-amber-700 font-medium text-sm mb-2">
          Emergency Pricing Active
        </h3>
        <p className="text-xs text-amber-600">
          Using guaranteed pricing values. Standard rates: ${EMERGENCY_PRICES.defaultRate1h}/hr, 
          VIP rates: ${EMERGENCY_PRICES.vipRate1h}/hr.
        </p>
      </div>
    </div>
  );
};

export default EmergencyPriceProvider;