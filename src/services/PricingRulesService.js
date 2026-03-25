import { supabase } from '../lib/supabase';
import VehicleModelService from './VehicleModelService';

export class PricingRulesService {
  /**
   * Get vehicle models - DEPRECATED: Use VehicleModelService.getActiveModels() instead
   * @deprecated Use VehicleModelService.getActiveModels() for consistent data access
   */
  static async getVehicleModels() {
    console.warn('⚠️ PricingRulesService.getVehicleModels() is deprecated. Use VehicleModelService.getActiveModels() instead.');
    
    try {
      return await VehicleModelService.getActiveModels();
    } catch (error) {
      console.error('Error in getVehicleModels:', error);
      return [];
    }
  }

  /**
   * Get pricing rules - FIXED: Updated to use correct table name
   */
  static async getPricingRules() {
    try {
      const { data, error } = await supabase
        .from('saharax_0u4w4d_pricing_simple')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching pricing rules:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in getPricingRules:', error);
      return [];
    }
  }

  /**
   * Upsert pricing rule - FIXED: Updated to use correct table name
   */
  static async upsertPricingRule(ruleData) {
    try {
      // Check if user is authenticated
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        throw new Error('Authentication required. Please log in to save pricing rules.');
      }
      
      console.log('✅ User authenticated:', {
        userId: user?.id,
        email: user?.email
      });

      // Only use columns that actually exist in the database schema
      const dbData = {
        vehicle_model_id: ruleData.vehicle_model_id,
        rule_type: ruleData.rule_type || 'base_price',
        duration_type: ruleData.duration_type || 'daily',
        price: ruleData.price || ruleData.daily_rate || ruleData.hourly_rate || null,
        is_active: ruleData.is_active !== false,
        updated_at: new Date().toISOString()
      };

      // Remove any null values to avoid issues
      Object.keys(dbData).forEach(key => {
        if (dbData[key] === null || dbData[key] === undefined) {
          delete dbData[key];
        }
      });

      console.log('📝 Attempting to upsert pricing rule:', dbData);

      const { data, error } = await supabase
        .from('saharax_0u4w4d_pricing_simple')
        .upsert([dbData])
        .select();

      if (error) {
        console.error('❌ Upsert failed:', error);
        
        if (error.message.includes('permission denied')) {
          throw new Error(`Permission denied: User authentication may not be properly recognized. Please try logging out and back in. Original error: ${error.message}`);
        }
        
        throw new Error(`Failed to upsert pricing rule: ${error.message}`);
      }

      console.log('✅ Upsert successful:', data[0]);
      return data[0];
    } catch (error) {
      console.error('❌ Error upserting pricing rule:', error);
      throw error;
    }
  }

  /**
   * Delete pricing rule - FIXED: Updated to use correct table name
   */
  static async deletePricingRule(ruleId) {
    try {
      // Check if user is authenticated
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        throw new Error('Authentication required. Please log in to delete pricing rules.');
      }

      const { error } = await supabase
        .from('saharax_0u4w4d_pricing_simple')
        .delete()
        .eq('id', ruleId);

      if (error) {
        if (error.message.includes('permission denied')) {
          throw new Error(`Permission denied: User authentication may not be properly recognized. Please try logging out and back in. Original error: ${error.message}`);
        }
        throw new Error(`Failed to delete pricing rule: ${error.message}`);
      }

      return true;
    } catch (error) {
      console.error('Error deleting pricing rule:', error);
      throw error;
    }
  }

  /**
   * Calculate rental price - FIXED: Updated to use correct table name
   */
  static async calculatePrice(vehicleModelId, startDate, endDate, rentalType = 'daily') {
    try {
      // Get vehicle model info
      const vehicleModel = await VehicleModelService.getById(vehicleModelId);
      if (!vehicleModel) {
        throw new Error('Vehicle model not found');
      }

      // Get pricing rules for this vehicle model using the vehicle_model_id field
      const { data: rules, error } = await supabase
        .from('saharax_0u4w4d_pricing_simple')
        .select('*')
        .eq('vehicle_model_id', vehicleModelId)
        .eq('is_active', true);

      if (error) {
        console.error('Error fetching pricing rules:', error);
        return { price: 0, breakdown: [] };
      }

      if (!rules || rules.length === 0) {
        return { price: 0, breakdown: ['No pricing rules found'] };
      }

      // Simple calculation - use the first active rule
      const rule = rules.find(r => r.duration_type === rentalType) || rules[0];
      const start = new Date(startDate);
      const end = new Date(endDate);
      const diffTime = Math.abs(end - start);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      let price = 0;
      const breakdown = [];

      if (rentalType === 'daily' && rule.price) {
        price = rule.price * diffDays;
        breakdown.push(`${diffDays} days × ${rule.price} MAD = ${price} MAD`);
      } else if (rentalType === 'hourly' && rule.price) {
        const diffHours = Math.ceil(diffTime / (1000 * 60 * 60));
        price = rule.price * diffHours;
        breakdown.push(`${diffHours} hours × ${rule.price} MAD = ${price} MAD`);
      } else {
        price = rule.price * diffDays; // fallback to daily
        breakdown.push(`${diffDays} days × ${rule.price} MAD = ${price} MAD (fallback)`);
      }

      return { price, breakdown };
    } catch (error) {
      console.error('Error calculating price:', error);
      return { price: 0, breakdown: ['Error calculating price'] };
    }
  }
}

export default PricingRulesService;