import {
  calculateBilledHours,
  calculateSimpleRentalPricing,
  DEFAULT_SIMPLE_RENTAL_GRACE_MINUTES,
} from './simpleRentalPricing';

/**
 * Legacy export name kept for compatibility with existing admin pricing UI.
 * The old tier-based logic is replaced with billed-hours x hourly-rate.
 */
export async function calculateTieredPrice(_vehicleModelId, hours, baseHourlyRate, options = {}) {
  const durationMinutes = Math.max(0, Number(hours || 0)) * 60;
  const gracePeriodMinutes = Number(
    options?.gracePeriodMinutes ?? DEFAULT_SIMPLE_RENTAL_GRACE_MINUTES
  );
  const billedHours = calculateBilledHours(durationMinutes, gracePeriodMinutes);
  const totalPrice = billedHours * (Number(baseHourlyRate || 0) || 0);

  return {
    totalPrice: Math.round(totalPrice * 100) / 100,
    savings: 0,
    tierUsed: null,
    method: 'time_based',
    billedHours,
    durationMinutes,
    gracePeriodMinutes,
  };
}

export async function calculateExtension(priceSource, hoursExtended, _vehicleModelId, baseRate, _basePriceId, options = {}) {
  if (priceSource === 'manual' || priceSource === 'negotiated') {
    return {
      method: 'manual_required',
      message: 'Manual price requires manual extension entry',
      canOverride: false,
    };
  }

  const pricing = calculateSimpleRentalPricing({
    startTime: new Date(0),
    endTime: new Date(Number(hoursExtended || 0) * 60 * 60 * 1000),
    gracePeriodMinutes: options?.gracePeriodMinutes ?? DEFAULT_SIMPLE_RENTAL_GRACE_MINUTES,
    hourlyRate: baseRate,
    totalKmUsed: 0,
    packages: [],
  });

  return {
    method: 'auto_calculated',
    amount: pricing.totalPrice,
    savings: 0,
    gracePeriodMinutes: pricing.gracePeriodMinutes,
    multiplier: 1,
    billedHours: pricing.billedHours,
    canOverride: true,
  };
}

export async function getPricingOptions(vehicleModelId, baseHourlyRate, maxHours = 24, options = {}) {
  const results = [];

  for (let hours = 1; hours <= maxHours; hours += 1) {
    const pricing = await calculateTieredPrice(vehicleModelId, hours, baseHourlyRate, options);
    results.push({
      hours,
      billedHours: pricing.billedHours,
      price: pricing.totalPrice,
      savings: 0,
      label:
        pricing.billedHours === hours
          ? `${hours} hour${hours > 1 ? 's' : ''} - ${pricing.totalPrice} MAD`
          : `${hours} hour${hours > 1 ? 's' : ''} - ${pricing.totalPrice} MAD (${pricing.billedHours} billed)`,
    });
  }

  return results;
}

export function formatPriceSource(priceSource) {
  switch (priceSource) {
    case 'auto':
      return {
        label: 'Auto-calculated',
        badge: 'bg-green-100 text-green-800',
        icon: '⚡',
      };
    case 'manual':
      return {
        label: 'Manual entry',
        badge: 'bg-yellow-100 text-yellow-800',
        icon: '👤',
      };
    case 'negotiated':
      return {
        label: 'Negotiated',
        badge: 'bg-blue-100 text-blue-800',
        icon: '🤝',
      };
    default:
      return {
        label: 'Time-based',
        badge: 'bg-gray-100 text-gray-800',
        icon: '⏱️',
      };
  }
}

