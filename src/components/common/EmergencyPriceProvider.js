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
  console.log('🚨 Using emergency fallback pricing values');
  return { ...EMERGENCY_PRICES };
};

/**
 * Validate if pricing values are reasonable
 * @param {Object} prices - Pricing object to validate
 * @returns {boolean} True if prices seem reasonable
 */
export const validatePricing = (prices) => {
  if (!prices || typeof prices !== 'object') {
    return false;
  }
  
  const {
    defaultRate1h,
    defaultRate2h,
    vipRate1h,
    vipRate2h,
    extraPassengerFee,
    depositPercentage
  } = prices;
  
  // Check if all required fields exist and are positive numbers
  const requiredFields = [
    defaultRate1h,
    defaultRate2h,
    vipRate1h,
    vipRate2h,
    extraPassengerFee,
    depositPercentage
  ];
  
  const allFieldsValid = requiredFields.every(field => 
    typeof field === 'number' && field > 0 && !isNaN(field)
  );
  
  if (!allFieldsValid) {
    return false;
  }
  
  // Check logical relationships
  if (defaultRate2h <= defaultRate1h) {
    console.warn('⚠️ 2-hour rate should be higher than 1-hour rate');
    return false;
  }
  
  if (vipRate1h <= defaultRate1h) {
    console.warn('⚠️ VIP rate should be higher than standard rate');
    return false;
  }
  
  if (depositPercentage < 0 || depositPercentage > 100) {
    console.warn('⚠️ Deposit percentage should be between 0 and 100');
    return false;
  }
  
  return true;
};

/**
 * Get safe pricing with validation and fallbacks
 * @param {Object} inputPrices - Input pricing object
 * @returns {Object} Safe pricing object
 */
export const getSafePricing = (inputPrices) => {
  // If input is valid, use it
  if (validatePricing(inputPrices)) {
    console.log('✅ Input pricing is valid');
    return { ...inputPrices };
  }
  
  // Otherwise, use emergency prices
  console.warn('⚠️ Input pricing invalid, using emergency prices');
  return getEmergencyPrices();
};

/**
 * Emergency Price Provider Component
 * Renders a UI with hard-coded prices when all pricing sources fail
 */
const EmergencyPriceProvider = ({ children, showNotice = false }) => {
  return (
    <div className="emergency-price-provider">
      {children}
      {showNotice && (
        <div className="emergency-price-notice mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
          <h3 className="text-amber-700 font-medium text-sm mb-2">
            🚨 Emergency Pricing Active
          </h3>
          <p className="text-xs text-amber-600">
            Using guaranteed pricing values. Standard rates: ${EMERGENCY_PRICES.defaultRate1h}/hr (1h), ${EMERGENCY_PRICES.defaultRate2h} (2h).
            VIP rates: ${EMERGENCY_PRICES.vipRate1h}/hr (1h), ${EMERGENCY_PRICES.vipRate2h} (2h).
            Extra passenger: ${EMERGENCY_PRICES.extraPassengerFee}.
          </p>
        </div>
      )}
    </div>
  );
};

export default EmergencyPriceProvider;