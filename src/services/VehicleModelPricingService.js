import { supabase } from '../lib/supabase';
import { assertTenantFeatureEnabled } from './TenantLimitService';

/**
 * Service for managing vehicle models in pricing components
 * Reads from saharax_0u4w4d_vehicle_models table
 */
export class VehicleModelPricingService {
  /**
   * Get all active vehicle models for pricing dropdowns
   * @returns {Promise<Array>} Array of vehicle models with id, name, model
   */
  static async getActiveVehicleModels() {
    try {
      await assertTenantFeatureEnabled(
        'pricing_module',
        'Your tenant plan does not include Pricing Management.'
      );

      const { data, error } = await supabase
        .from('saharax_0u4w4d_vehicle_models')
        .select('id, name, model, is_active')
        .eq('is_active', true)
        .order('name', { ascending: true, nullsFirst: false })
        .order('model', { ascending: true });

      if (error) {
        console.error('Error fetching vehicle models:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('VehicleModelPricingService.getActiveVehicleModels error:', error);
      throw error;
    }
  }

  /**
   * Format vehicle model for display in dropdown
   * @param {Object} model - Vehicle model object with name, model, id
   * @returns {string} Formatted display string
   */
  static formatModelDisplay(model) {
    if (!model) return 'Unknown Model';
    
    const displayName = [model.name, model.model].filter(Boolean).join(' ');
    return `${displayName} — ID: ${model.id}`;
  }

  /**
   * Get vehicle model by ID
   * @param {string|number} modelId - The model ID
   * @returns {Promise<Object|null>} Vehicle model object or null
   */
  static async getVehicleModelById(modelId) {
    try {
      await assertTenantFeatureEnabled(
        'pricing_module',
        'Your tenant plan does not include Pricing Management.'
      );

      const { data, error } = await supabase
        .from('saharax_0u4w4d_vehicle_models')
        .select('id, name, model, is_active')
        .eq('id', modelId)
        .single();

      if (error) {
        console.error('Error fetching vehicle model by ID:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('VehicleModelPricingService.getVehicleModelById error:', error);
      return null;
    }
  }
}

export default VehicleModelPricingService;
