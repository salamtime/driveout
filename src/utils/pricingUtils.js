import { getEmergencyPrices } from '../components/common/EmergencyPriceProvider';

/**
 * Enhanced Pricing Utilities with robust error handling and fallbacks
 * Provides consistent pricing calculations across the entire application
 */

/**
 * Calculate booking price with comprehensive error handling
 * @param {Object} params - Pricing parameters
 * @param {Object} settings - Pricing settings from context
 * @returns {Object} Pricing breakdown with all amounts
 */
export const calculateBookingPrice = (params, settings) => {
  try {
    console.log('💰 calculateBookingPrice called with:', { params, settings });
    
    // Ensure we have valid settings with fallbacks
    const safeSettings = getSafeSettings(settings);
    console.log('💰 Using safe settings:', safeSettings);
    
    // Extract and validate parameters
    const {
      rentalType = 'tour',
      duration = 1,
      passengers = 1,
      isVip = false,
      isWeekend = false,
      isHoliday = false,
      equipmentItems = []
    } = params || {};
    
    // Validate inputs
    const safeDuration = Math.max(1, parseFloat(duration) || 1);
    const safePassengers = Math.max(1, parseInt(passengers) || 1);
    
    console.log('💰 Validated params:', { 
      rentalType, 
      duration: safeDuration, 
      passengers: safePassengers, 
      isVip, 
      isWeekend, 
      isHoliday 
    });
    
    // Calculate base price
    let basePrice = 0;
    
    if (isVip) {
      basePrice = safeDuration === 1 ? safeSettings.vipRate1h : safeSettings.vipRate2h;
    } else {
      basePrice = safeDuration === 1 ? safeSettings.defaultRate1h : safeSettings.defaultRate2h;
    }
    
    // Apply duration multiplier for longer rentals
    if (safeDuration > 2) {
      const hourlyRate = isVip ? safeSettings.vipRate1h : safeSettings.defaultRate1h;
      basePrice = hourlyRate * safeDuration;
    }
    
    console.log('💰 Base price calculated:', basePrice);
    
    // Calculate extra passenger fees
    const extraPassengers = Math.max(0, safePassengers - 1);
    const extraPassengerFees = extraPassengers * safeSettings.extraPassengerFee;
    
    console.log('💰 Extra passenger calculation:', {
      totalPassengers: safePassengers,
      extraPassengers,
      feePerExtra: safeSettings.extraPassengerFee,
      totalExtraFees: extraPassengerFees
    });
    
    // Calculate subtotal
    const subtotal = basePrice + extraPassengerFees;
    
    // Apply weekend/holiday surcharge if applicable
    let surcharge = 0;
    if (isWeekend || isHoliday) {
      surcharge = subtotal * 0.15; // 15% surcharge
    }
    
    // Calculate equipment costs
    const equipmentCost = (equipmentItems || []).reduce((sum, item) => {
      return sum + (parseFloat(item.price) || 0) * (parseInt(item.quantity) || 1);
    }, 0);
    
    // Calculate final totals
    const subtotalWithSurcharge = subtotal + surcharge + equipmentCost;
    const depositAmount = subtotalWithSurcharge * (safeSettings.depositPercentage / 100);
    const total = subtotalWithSurcharge;
    
    const result = {
      basePrice: parseFloat(basePrice.toFixed(2)),
      extraPassengers,
      extraPassengerFees: parseFloat(extraPassengerFees.toFixed(2)),
      subtotal: parseFloat(subtotal.toFixed(2)),
      surcharge: parseFloat(surcharge.toFixed(2)),
      equipmentCost: parseFloat(equipmentCost.toFixed(2)),
      deposit: parseFloat(depositAmount.toFixed(2)),
      total: parseFloat(total.toFixed(2)),
      // Additional metadata
      settings: safeSettings,
      calculations: {
        isVip,
        isWeekend,
        isHoliday,
        duration: safeDuration,
        passengers: safePassengers,
        depositPercentage: safeSettings.depositPercentage
      }
    };
    
    console.log('💰 Final pricing result:', result);
    return result;
    
  } catch (error) {
    console.error('❌ Error in calculateBookingPrice:', error);
    
    // Return emergency fallback pricing
    const emergencyPrices = getEmergencyPrices();
    const fallbackTotal = emergencyPrices.defaultRate1h * (parseFloat(params?.duration) || 1);
    
    return {
      basePrice: fallbackTotal,
      extraPassengers: 0,
      extraPassengerFees: 0,
      subtotal: fallbackTotal,
      surcharge: 0,
      equipmentCost: 0,
      deposit: fallbackTotal * 0.25,
      total: fallbackTotal,
      error: 'Used emergency pricing due to calculation error'
    };
  }
};

/**
 * Calculate tour pricing specifically
 * @param {Object} params - Tour parameters
 * @param {Object} settings - Pricing settings
 * @returns {Object} Tour pricing breakdown
 */
export const calculateTourPrice = (params, settings) => {
  try {
    console.log('🎯 calculateTourPrice called with:', { params, settings });
    
    const safeSettings = getSafeSettings(settings);
    
    const {
      tourType = 'standard',
      duration = 2,
      groupSize = 1,
      isVip = false,
      location = 'main'
    } = params || {};
    
    // Tour-specific pricing logic
    let baseRate = isVip ? safeSettings.vipRate2h : safeSettings.defaultRate2h;
    
    // Apply tour type multipliers
    const tourMultipliers = {
      'desert_adventure': 1.2,
      'mountain_trail': 1.3,
      'sunset_tour': 1.0,
      'standard': 1.0
    };
    
    const multiplier = tourMultipliers[tourType] || 1.0;
    baseRate = baseRate * multiplier;
    
    // Calculate for group size
    const safeGroupSize = Math.max(1, parseInt(groupSize) || 1);
    const basePrice = baseRate * safeGroupSize;
    
    // Calculate extra passenger fees (if group size > base capacity)
    const baseCapacity = 1; // 1 person per quad
    const extraPassengers = Math.max(0, safeGroupSize - baseCapacity);
    const extraPassengerFees = extraPassengers * safeSettings.extraPassengerFee;
    
    const subtotal = basePrice + extraPassengerFees;
    const depositAmount = subtotal * (safeSettings.depositPercentage / 100);
    
    const result = {
      basePrice: parseFloat(basePrice.toFixed(2)),
      extraPassengers,
      extraPassengerFees: parseFloat(extraPassengerFees.toFixed(2)),
      subtotal: parseFloat(subtotal.toFixed(2)),
      deposit: parseFloat(depositAmount.toFixed(2)),
      total: parseFloat(subtotal.toFixed(2)),
      tourDetails: {
        tourType,
        duration,
        groupSize: safeGroupSize,
        multiplier,
        location
      }
    };
    
    console.log('🎯 Tour pricing result:', result);
    return result;
    
  } catch (error) {
    console.error('❌ Error in calculateTourPrice:', error);
    
    // Fallback pricing
    const emergencyPrices = getEmergencyPrices();
    const fallbackTotal = emergencyPrices.defaultRate2h;
    
    return {
      basePrice: fallbackTotal,
      extraPassengers: 0,
      extraPassengerFees: 0,
      subtotal: fallbackTotal,
      deposit: fallbackTotal * 0.25,
      total: fallbackTotal,
      error: 'Used emergency pricing due to calculation error'
    };
  }
};

/**
 * Get safe settings with proper fallbacks
 * @param {Object} settings - Raw settings object
 * @returns {Object} Safe settings with guaranteed values
 */
export const getSafeSettings = (settings) => {
  const emergencyPrices = getEmergencyPrices();
  
  if (!settings || typeof settings !== 'object') {
    console.warn('⚠️ No settings provided, using emergency prices');
    return emergencyPrices;
  }
  
  // Create safe settings with fallbacks
  const safeSettings = {
    defaultRate1h: getSafePrice(settings.defaultRate1h, emergencyPrices.defaultRate1h),
    defaultRate2h: getSafePrice(settings.defaultRate2h, emergencyPrices.defaultRate2h),
    vipRate1h: getSafePrice(settings.vipRate1h, emergencyPrices.vipRate1h),
    vipRate2h: getSafePrice(settings.vipRate2h, emergencyPrices.vipRate2h),
    extraPassengerFee: getSafePrice(settings.extraPassengerFee, emergencyPrices.extraPassengerFee),
    depositPercentage: getSafePercentage(settings.depositPercentage, emergencyPrices.depositPercentage)
  };
  
  // Log if we had to use fallbacks
  const usedFallbacks = Object.keys(safeSettings).filter(key => {
    const original = settings[key];
    const safe = safeSettings[key];
    return !original || original === 0 || original !== safe;
  });
  
  if (usedFallbacks.length > 0) {
    console.warn('⚠️ Used fallback values for:', usedFallbacks);
  }
  
  return safeSettings;
};

/**
 * Get safe price value with fallback
 * @param {*} value - Original value
 * @param {number} fallback - Fallback value
 * @returns {number} Safe price value
 */
const getSafePrice = (value, fallback) => {
  const parsed = parseFloat(value);
  return (parsed && parsed > 0) ? parsed : fallback;
};

/**
 * Get safe percentage value with fallback
 * @param {*} value - Original value
 * @param {number} fallback - Fallback value
 * @returns {number} Safe percentage value
 */
const getSafePercentage = (value, fallback) => {
  const parsed = parseFloat(value);
  return (parsed && parsed >= 0 && parsed <= 100) ? parsed : fallback;
};

/**
 * Check if a given date is a weekend (Saturday or Sunday)
 * @param {Date} date - The date to check
 * @returns {boolean} True if weekend, false otherwise
 */
export const isWeekend = (date) => {
  if (!date || !(date instanceof Date)) {
    return false;
  }
  const day = date.getDay();
  return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
};

/**
 * Simple holiday checker (can be expanded in the future)
 * Currently checks for major US holidays
 * @param {Date} date - The date to check
 * @returns {boolean} True if holiday, false otherwise
 */
export const isHoliday = (date) => {
  if (!date || !(date instanceof Date)) {
    return false;
  }
  
  const month = date.getMonth() + 1; // months are 0-indexed
  const day = date.getDate();
  
  // New Year's Day
  if (month === 1 && day === 1) return true;
  
  // Independence Day
  if (month === 7 && day === 4) return true;
  
  // Christmas
  if (month === 12 && day === 25) return true;
  
  // Add other holidays as needed
  
  return false;
};

/**
 * Format a price for display
 * @param {number} price - The price to format
 * @param {string} currencySymbol - The currency symbol to use
 * @returns {string} Formatted price
 */
export const formatPrice = (price, currencySymbol = '$') => {
  if (typeof price !== 'number' || isNaN(price)) {
    return `${currencySymbol}0.00`;
  }
  return `${currencySymbol}${price.toFixed(2)}`;
};

/**
 * Create a pricing snapshot for booking records
 * This ensures past bookings are unaffected by future setting changes
 * @param {Object} pricingResult - Result from calculateBookingPrice or calculateTourPrice
 * @returns {Object} Snapshot object for database storage
 */
export const createPricingSnapshot = (pricingResult) => {
  if (!pricingResult || typeof pricingResult !== 'object') {
    console.warn('⚠️ Invalid pricing result for snapshot');
    return {
      subtotal_amount: 0,
      tax_enabled: false,
      tax_percent_applied: 0,
      tax_amount: 0,
      total_amount: 0
    };
  }
  
  return {
    subtotal_amount: pricingResult.subtotal || 0,
    tax_enabled: false, // Will be updated by tax calculation if applicable
    tax_percent_applied: 0,
    tax_amount: 0,
    total_amount: pricingResult.total || 0,
    // Additional snapshot data
    base_price: pricingResult.basePrice || 0,
    extra_passenger_fees: pricingResult.extraPassengerFees || 0,
    deposit_amount: pricingResult.deposit || 0,
    surcharge: pricingResult.surcharge || 0,
    equipment_cost: pricingResult.equipmentCost || 0
  };
};

/**
 * Calculate pricing for multiple quads/vehicles
 * @param {Array} quadSelections - Array of quad selection objects
 * @param {Object} settings - Pricing settings
 * @returns {Object} Combined pricing breakdown
 */
export const calculateMultiQuadPricing = (quadSelections, settings) => {
  try {
    console.log('🚗 calculateMultiQuadPricing called with:', { quadSelections, settings });
    
    if (!Array.isArray(quadSelections) || quadSelections.length === 0) {
      console.warn('⚠️ No quad selections provided');
      return {
        basePrice: 0,
        extraPassengerFees: 0,
        subtotal: 0,
        deposit: 0,
        total: 0,
        quadCount: 0,
        totalParticipants: 0
      };
    }
    
    const safeSettings = getSafeSettings(settings);
    let totalBasePrice = 0;
    let totalExtraPassengerFees = 0;
    let totalParticipants = 0;
    
    // Calculate pricing for each quad
    quadSelections.forEach((quad, index) => {
      const hasExtraPassenger = quad.extraPassenger || false;
      const participantsForThisQuad = hasExtraPassenger ? 2 : 1;
      
      // Base price per quad (assuming 2-hour tour as default)
      const basePrice = safeSettings.defaultRate2h;
      totalBasePrice += basePrice;
      
      // Extra passenger fee if applicable
      if (hasExtraPassenger) {
        totalExtraPassengerFees += safeSettings.extraPassengerFee;
      }
      
      totalParticipants += participantsForThisQuad;
      
      console.log(`🚗 Quad ${index + 1}:`, {
        quadId: quad.quadId,
        hasExtraPassenger,
        participantsForThisQuad,
        basePrice,
        extraFee: hasExtraPassenger ? safeSettings.extraPassengerFee : 0
      });
    });
    
    const subtotal = totalBasePrice + totalExtraPassengerFees;
    const depositAmount = subtotal * (safeSettings.depositPercentage / 100);
    
    const result = {
      basePrice: parseFloat(totalBasePrice.toFixed(2)),
      extraPassengerFees: parseFloat(totalExtraPassengerFees.toFixed(2)),
      subtotal: parseFloat(subtotal.toFixed(2)),
      deposit: parseFloat(depositAmount.toFixed(2)),
      total: parseFloat(subtotal.toFixed(2)),
      quadCount: quadSelections.length,
      totalParticipants,
      breakdown: quadSelections.map((quad, index) => ({
        quadId: quad.quadId,
        basePrice: safeSettings.defaultRate2h,
        extraPassenger: quad.extraPassenger || false,
        extraPassengerFee: quad.extraPassenger ? safeSettings.extraPassengerFee : 0,
        participants: quad.extraPassenger ? 2 : 1
      }))
    };
    
    console.log('🚗 Multi-quad pricing result:', result);
    return result;
    
  } catch (error) {
    console.error('❌ Error in calculateMultiQuadPricing:', error);
    
    // Fallback pricing
    const emergencyPrices = getEmergencyPrices();
    const quadCount = Array.isArray(quadSelections) ? quadSelections.length : 1;
    const fallbackTotal = emergencyPrices.defaultRate2h * quadCount;
    
    return {
      basePrice: fallbackTotal,
      extraPassengerFees: 0,
      subtotal: fallbackTotal,
      deposit: fallbackTotal * 0.25,
      total: fallbackTotal,
      quadCount,
      totalParticipants: quadCount,
      error: 'Used emergency pricing due to calculation error'
    };
  }
};

export default {
  calculateBookingPrice,
  calculateTourPrice,
  calculateMultiQuadPricing,
  getSafeSettings,
  isWeekend,
  isHoliday,
  formatPrice,
  createPricingSnapshot
};