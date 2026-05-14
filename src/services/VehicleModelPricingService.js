import { assertTenantFeatureEnabled } from './TenantLimitService';
import VehicleModelService from './VehicleModelService';

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

      return await VehicleModelService.getActiveModels();
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

      return await VehicleModelService.getModelById(modelId);
    } catch (error) {
      console.error('VehicleModelPricingService.getVehicleModelById error:', error);
      return null;
    }
  }
}

export default VehicleModelPricingService;
