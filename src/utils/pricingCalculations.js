import { supabase } from '../lib/supabase';

/**
 * Calculate tiered price based on hours and pricing tiers
 * @param {string} vehicleModelId - Vehicle model ID
 * @param {number} hours - Number of rental hours
 * @param {number} baseHourlyRate - Base hourly rate
 * @returns {Promise<{totalPrice: number, savings: number, tierUsed: object, method: string}>}
 */
export async function calculateTieredPrice(vehicleModelId, hours, baseHourlyRate) {
  try {
    // Fetch pricing tiers for this vehicle model
    const { data: tiers, error } = await supabase
      .from('pricing_tiers')
      .select('*')
      .eq('vehicle_model_id', vehicleModelId)
      .eq('is_active', true)
      .lte('min_hours', hours)
      .gte('max_hours', hours)
      .order('min_hours', { ascending: true })
      .limit(1);

    if (error) {
      console.error('Error fetching pricing tiers:', error);
      throw error;
    }

    if (!tiers || tiers.length === 0) {
      // No tier found, use base hourly rate
      return {
        totalPrice: baseHourlyRate * hours,
        savings: 0,
        tierUsed: null,
        method: 'hourly'
      };
    }

    const tier = tiers[0];
    let totalPrice;

    switch (tier.calculation_method) {
      case 'percentage':
        // Calculate price using percentage discount
        const discountMultiplier = (100 - (tier.discount_percentage || 0)) / 100;
        totalPrice = baseHourlyRate * hours * discountMultiplier;
        break;
      case 'fixed':
        totalPrice = tier.price_amount;
        break;
      case 'custom':
        totalPrice = tier.price_amount;
        break;
      default:
        totalPrice = baseHourlyRate * hours;
    }

    const standardPrice = baseHourlyRate * hours;
    const savings = Math.max(0, standardPrice - totalPrice);

    return {
      totalPrice: Math.round(totalPrice * 100) / 100,
      savings: Math.round(savings * 100) / 100,
      tierUsed: tier,
      method: tier.calculation_method
    };
  } catch (error) {
    console.error('Error calculating tiered price:', error);
    return {
      totalPrice: baseHourlyRate * hours,
      savings: 0,
      tierUsed: null,
      method: 'hourly'
    };
  }
}

/**
 * Calculate extension price
 * @param {string} priceSource - 'auto', 'manual', or 'negotiated'
 * @param {number} hoursExtended - Number of hours to extend
 * @param {string} vehicleModelId - Vehicle model ID
 * @param {number} baseRate - Base hourly rate
 * @param {string} basePriceId - Base price ID for extension rules
 * @returns {Promise<object>}
 */
export async function calculateExtension(priceSource, hoursExtended, vehicleModelId, baseRate, basePriceId) {
  if (priceSource === 'manual' || priceSource === 'negotiated') {
    return {
      method: 'manual_required',
      message: 'Manual price requires manual extension entry',
      canOverride: false
    };
  }

  try {
    // Fetch extension rules
    const { data: rules, error } = await supabase
      .from('rental_extension_rules')
      .select('*')
      .eq('base_price_id', basePriceId)
      .limit(1);

    if (error) {
      console.error('Error fetching extension rules:', error);
      throw error;
    }

    const rule = rules && rules.length > 0 ? rules[0] : {
      extension_price_multiplier: 1.0,
      grace_period_minutes: 15,
      auto_adjust_enabled: true
    };

    // Calculate tiered price for extension
    const extensionPricing = await calculateTieredPrice(vehicleModelId, hoursExtended, baseRate);
    const finalAmount = extensionPricing.totalPrice * rule.extension_price_multiplier;

    return {
      method: 'auto_calculated',
      amount: Math.round(finalAmount * 100) / 100,
      savings: extensionPricing.savings,
      gracePeriodMinutes: rule.grace_period_minutes,
      multiplier: rule.extension_price_multiplier,
      canOverride: true
    };
  } catch (error) {
    console.error('Error calculating extension:', error);
    return {
      method: 'error',
      message: 'Failed to calculate extension price',
      canOverride: true
    };
  }
}

/**
 * Get all pricing options for a vehicle model
 * @param {string} vehicleModelId - Vehicle model ID
 * @param {number} baseHourlyRate - Base hourly rate
 * @param {number} maxHours - Maximum hours to calculate (default 24)
 * @returns {Promise<Array>}
 */
export async function getPricingOptions(vehicleModelId, baseHourlyRate, maxHours = 24) {
  const options = [];
  
  for (let hours = 1; hours <= maxHours; hours++) {
    const pricing = await calculateTieredPrice(vehicleModelId, hours, baseHourlyRate);
    options.push({
      hours,
      price: pricing.totalPrice,
      savings: pricing.savings,
      label: pricing.savings > 0 
        ? `${hours} hour${hours > 1 ? 's' : ''} - ${pricing.totalPrice} MAD (save ${pricing.savings} MAD)`
        : `${hours} hour${hours > 1 ? 's' : ''} - ${pricing.totalPrice} MAD`
    });
  }
  
  return options;
}

/**
 * Format price source for display
 * @param {string} priceSource - 'auto', 'manual', or 'negotiated'
 * @returns {object} - {label, badge, icon}
 */
export function formatPriceSource(priceSource) {
  switch (priceSource) {
    case 'auto':
      return {
        label: 'Auto-calculated',
        badge: 'bg-green-100 text-green-800',
        icon: '⚡'
      };
    case 'manual':
      return {
        label: 'Manual entry',
        badge: 'bg-yellow-100 text-yellow-800',
        icon: '👤'
      };
    case 'negotiated':
      return {
        label: 'Negotiated',
        badge: 'bg-blue-100 text-blue-800',
        icon: '🤝'
      };
    default:
      return {
        label: 'Standard',
        badge: 'bg-gray-100 text-gray-800',
        icon: '📋'
      };
  }
}