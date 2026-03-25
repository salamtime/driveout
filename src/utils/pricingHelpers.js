import SimplePricingService from '../services/SimplePricingService';

/**
 * Calculate hours between two dates with proper rounding
 */
export function hoursBetween(startISO, endISO) {
  const ms = new Date(endISO) - new Date(startISO);
  return Math.max(ms / 3_600_000, 0);
}

/**
 * Calculate days between two dates
 */
export function daysBetween(startISO, endISO) {
  const ms = new Date(endISO) - new Date(startISO);
  return Math.max(ms / 86_400_000, 0);
}

/**
 * Round quantity based on pricing mode
 */
export function roundQty(priceMode, raw) {
  return priceMode === 'hour'
    ? Math.ceil(raw * 2) / 2          // 0.5h steps
    : Math.ceil(raw);                 // whole days
}

/**
 * Get vehicle type from vehicle object
 */
export function getVehicleType(vehicle) {
  if (!vehicle) return null;
  
  // Check various possible fields for vehicle type
  if (vehicle.vehicle_type) return vehicle.vehicle_type;
  if (vehicle.type) return vehicle.type;
  if (vehicle.category) return vehicle.category;
  
  // Try to infer from model name
  const model = (vehicle.model || vehicle.name || '').toUpperCase();
  if (model.includes('AT5')) return 'AT5';
  if (model.includes('AT6')) return 'AT6';
  if (model.includes('QUAD')) return 'Quad';
  if (model.includes('BUGGY')) return 'Buggy';
  
  // Default fallback
  return 'AT5';
}

/**
 * Validate payment status against financial amounts
 */
export function validatePaymentStatus(paymentStatus, totalAmount, depositAmount) {
  const total = parseFloat(totalAmount || 0);
  const deposit = parseFloat(depositAmount || 0);
  const remaining = Math.max(0, total - deposit);
  const tolerance = 0.01;

  switch (paymentStatus) {
    case 'paid_in_full':
      return remaining <= tolerance ? null : `Cannot mark as paid in full while balance is pending. Remaining: ${remaining.toFixed(2)} MAD`;
    
    case 'unpaid':
      return (deposit <= tolerance && total > tolerance) ? null : 'Unpaid status requires zero deposit and positive total amount';
    
    case 'partial':
      return (deposit > tolerance && remaining > tolerance) ? null : 'Partial payment requires both deposit and remaining balance to be positive';
    
    case 'refunded':
      return (deposit <= tolerance && total <= tolerance) ? null : 'Refunded status requires both deposit and total to be zero';
    
    default:
      return null;
  }
}

/**
 * Calculate rental pricing using SimplePricingService
 */
export async function calculateRentalPricing(params) {
  try {
    const {
      vehicleType,
      priceMode,
      startDate,
      endDate,
      promoCode,
      transportPickup = false,
      transportDropoff = false,
      pickupFeeMad = 0,
      dropoffFeeMad = 0
    } = params;

    if (!vehicleType || !priceMode || !startDate || !endDate) {
      return {
        success: false,
        error: 'Missing required parameters for pricing calculation'
      };
    }

    // Calculate quantity
    const rawQuantity = priceMode === 'hour' 
      ? hoursBetween(startDate, endDate)
      : daysBetween(startDate, endDate);
    
    const quantity = roundQty(priceMode, rawQuantity);

    if (quantity <= 0) {
      return {
        success: false,
        error: 'Invalid date range - end date must be after start date'
      };
    }

    // Use SimplePricingService to calculate pricing
    const result = await SimplePricingService.calculateRentalPricing({
      vehicleType,
      rateType: priceMode,
      quantity,
      promoCode: promoCode || null,
      transportPickup,
      transportDropoff,
      pickupFeeMad: parseFloat(pickupFeeMad || 0),
      dropoffFeeMad: parseFloat(dropoffFeeMad || 0)
    });

    return result;

  } catch (error) {
    console.error('Error in calculateRentalPricing:', error);
    return {
      success: false,
      error: error.message || 'Failed to calculate pricing'
    };
  }
}

/**
 * Format currency amount in MAD
 */
export function formatMAD(amount) {
  return `${parseFloat(amount || 0).toFixed(2)} MAD`;
}

/**
 * Auto-suggest payment status based on amounts
 */
export function suggestPaymentStatus(totalAmount, depositAmount) {
  const total = parseFloat(totalAmount || 0);
  const deposit = parseFloat(depositAmount || 0);
  const remaining = Math.max(0, total - deposit);
  const tolerance = 0.01;

  if (total <= tolerance) return 'refunded';
  if (remaining <= tolerance) return 'paid_in_full';
  if (deposit > tolerance) return 'partial';
  return 'unpaid';
}