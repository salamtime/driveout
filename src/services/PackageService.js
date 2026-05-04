// PackageService.js
import { supabase } from '../lib/supabase';
import { assertTenantFeatureEnabled } from './TenantLimitService';

const isMissingFuelChargeColumnError = (error) =>
  error?.code === 'PGRST204' &&
  String(error?.message || '').includes('fuel_charge_enabled');

const getMissingFuelChargeColumnMessage = () =>
  'Database schema is missing rental_km_packages.fuel_charge_enabled. Apply src/migrations/add_fuel_charge_policy_to_rental_packages.sql, then try again.';

const PackageService = {
  async createPackage(packageData) {
    try {
      await assertTenantFeatureEnabled('pricing_km_packages', {
        message: 'Kilometer packages are not available on this plan.',
      });
      console.log('📦 PackageService.createPackage called with:', packageData);
      
      // Ensure all required fields are present and not null
      const dataToInsert = {
        name: packageData.name,
        description: packageData.description || '',
        vehicle_model_id: packageData.vehicle_model_id,
        rate_type_id: packageData.rate_type_id,
        included_kilometers: packageData.included_kilometers,
        extra_km_rate: packageData.extra_km_rate,
        fixed_amount: packageData.fixed_amount,
        fuel_charge_enabled: packageData.fuel_charge_enabled === true,
        duration_units: packageData.duration_units ?? packageData.durationUnits ?? 1,
        is_active: packageData.is_active !== undefined ? packageData.is_active : true,
        show_on_print: packageData.show_on_print === true || packageData.showOnPrint === true
      };

      // Fixed amount is always required. Kilometer fields are optional for unlimited packages.
      if (!dataToInsert.fixed_amount) {
        throw new Error('Fixed amount is required');
      }

      console.log('📦 Inserting data:', dataToInsert);

      const { error } = await supabase
        .from('app_4c3a7a6153_rental_km_packages')
        .insert([dataToInsert]);

      if (error) {
        console.error('❌ Supabase error:', error);
        if (isMissingFuelChargeColumnError(error)) {
          const schemaError = new Error(getMissingFuelChargeColumnMessage());
          schemaError.code = error.code;
          throw schemaError;
        }
        throw error;
      }

      console.log('✅ Package created successfully');
      return true;
    } catch (error) {
      console.error('❌ Error in createPackage:', error);
      throw error;
    }
  },

  async updatePackage(id, packageData) {
    try {
      await assertTenantFeatureEnabled('pricing_km_packages', {
        message: 'Kilometer packages are not available on this plan.',
      });
      console.log('📦 PackageService.updatePackage called with ID:', id, 'data:', packageData);
      
      const dataToUpdate = {
        name: packageData.name,
        description: packageData.description || '',
        vehicle_model_id: packageData.vehicle_model_id,
        rate_type_id: packageData.rate_type_id,
        included_kilometers: packageData.included_kilometers,
        extra_km_rate: packageData.extra_km_rate,
        fixed_amount: packageData.fixed_amount,
        fuel_charge_enabled: packageData.fuel_charge_enabled === true,
        duration_units: packageData.duration_units ?? packageData.durationUnits ?? 1,
        is_active: packageData.is_active,
        show_on_print: packageData.show_on_print === true || packageData.showOnPrint === true,
        updated_at: new Date().toISOString()
      };

      // Fixed amount is always required. Kilometer fields are optional for unlimited packages.
      if (!dataToUpdate.fixed_amount) {
        throw new Error('Fixed amount is required');
      }

      const { error } = await supabase
        .from('app_4c3a7a6153_rental_km_packages')
        .update(dataToUpdate)
        .eq('id', id);

      if (error) {
        console.error('❌ Supabase error:', error);
        if (isMissingFuelChargeColumnError(error)) {
          const schemaError = new Error(getMissingFuelChargeColumnMessage());
          schemaError.code = error.code;
          throw schemaError;
        }
        throw error;
      }

      console.log('✅ Package updated successfully');
      return true;
    } catch (error) {
      console.error('❌ Error in updatePackage:', error);
      throw error;
    }
  },

  async getPackages() {
    try {
      const { data, error } = await supabase
        .from('app_4c3a7a6153_rental_km_packages')
        .select(`
          *,
          vehicle_model:saharax_0u4w4d_vehicle_models(*)
        `)
        .order('id');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching packages:', error);
      throw error;
    }
  },

  async getRateTypes() {
    try {
      const { data, error } = await supabase
        .from('rate_types')
        .select('*')
        .order('id');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching rate types:', error);
      throw error;
    }
  },

  async getVehicleModels() {
    try {
      const { data, error } = await supabase
        .from('saharax_0u4w4d_vehicle_models')
        .select('*')
        .order('name');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching vehicle models:', error);
      throw error;
    }
  },

  async deletePackage(id) {
    try {
      await assertTenantFeatureEnabled('pricing_km_packages', {
        message: 'Kilometer packages are not available on this plan.',
      });
      const { error } = await supabase
        .from('app_4c3a7a6153_rental_km_packages')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error deleting package:', error);
      throw error;
    }
  }
};

export default PackageService;
