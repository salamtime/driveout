import { supabase } from '../lib/supabase';
import { scopeTenantOwnedQuery, verifyTenantOwnedRows } from './OrganizationService';

const FUEL_PRICING_TABLE = 'fuel_pricing';

class FuelPricingService {
  /**
   * Fetch fuel pricing for a specific vehicle model.
   * Returns { hourly, daily } prices per line.
   *
   * @param {string} vehicleModelId
   * @param {string} rentalType - 'hourly' | 'daily'
   * @returns {Promise<number>} price per line for the given rental type
   */
  static async getFuelPricingForModel(vehicleModelId, rentalType = 'daily') {
    try {
      if (!vehicleModelId) {
        console.warn('⚠️ No vehicle model ID provided');
        return 0;
      }

      let query = supabase
        .from(FUEL_PRICING_TABLE)
        .select('organization_id, price_per_line, hourly_price_per_line, daily_price_per_line')
        .eq('model_id', vehicleModelId);

      query = await scopeTenantOwnedQuery(query, FUEL_PRICING_TABLE, {
        message: 'Workspace organization context is required to load fuel pricing.',
      });

      const { data, error } = await query.maybeSingle();

      if (error) {
        console.error('❌ Error fetching fuel pricing:', error);
        return 0;
      }

      await verifyTenantOwnedRows(data || [], FUEL_PRICING_TABLE, {
        message: 'Fuel pricing returned rows outside the active workspace.',
      });

      if (rentalType === 'hourly') {
        // Use hourly column; fall back to legacy price_per_line if column not yet added
        return parseFloat(data?.hourly_price_per_line ?? data?.price_per_line) || 0;
      }

      // Daily (default)
      return parseFloat(data?.daily_price_per_line ?? data?.price_per_line) || 0;

    } catch (err) {
      console.error('❌ FuelPricingService error:', err);
      return 0;
    }
  }

  /**
   * Fetch both hourly and daily prices for a model in one call.
   * @param {string} vehicleModelId
   * @returns {Promise<{ hourly: number, daily: number }>}
   */
  static async getBothPricesForModel(vehicleModelId) {
    try {
      if (!vehicleModelId) return { hourly: 0, daily: 0 };

      let query = supabase
        .from(FUEL_PRICING_TABLE)
        .select('organization_id, price_per_line, hourly_price_per_line, daily_price_per_line')
        .eq('model_id', vehicleModelId);

      query = await scopeTenantOwnedQuery(query, FUEL_PRICING_TABLE, {
        message: 'Workspace organization context is required to load fuel pricing.',
      });

      const { data, error } = await query.maybeSingle();

      if (error || !data) return { hourly: 0, daily: 0 };

      await verifyTenantOwnedRows(data, FUEL_PRICING_TABLE, {
        message: 'Fuel pricing returned rows outside the active workspace.',
      });

      return {
        hourly: parseFloat(data.hourly_price_per_line ?? data.price_per_line) || 0,
        daily:  parseFloat(data.daily_price_per_line  ?? data.price_per_line) || 0,
      };
    } catch (err) {
      console.error('❌ FuelPricingService error:', err);
      return { hourly: 0, daily: 0 };
    }
  }

  /**
   * Calculate fuel charge based on fuel level deficit.
   *
   * @param {number} startLevel   - Starting fuel level (0–8)
   * @param {number} endLevel     - Ending fuel level (0–8)
   * @param {number} pricePerLine - Price per missing line (already resolved for rental type)
   * @param {string} rentalType   - 'hourly' | 'daily'  (used only when pricePerLine not provided)
   * @returns {number} total fuel charge
   */
  static calculateFuelCharge(startLevel, endLevel, pricePerLine, rentalType = 'daily') {
    // Hourly rentals with price 0 = fuel included in rate
    if (rentalType === 'hourly' && (!pricePerLine || pricePerLine <= 0)) {
      return 0;
    }

    if (startLevel == null || endLevel == null || !pricePerLine || pricePerLine <= 0) {
      return 0;
    }

    const deficit = startLevel - endLevel;
    if (deficit <= 0) return 0;

    return deficit * pricePerLine;
  }
}

export default FuelPricingService;
