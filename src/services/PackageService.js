// PackageService.js
import { supabase } from '../lib/supabase';
import { assertTenantFeatureEnabled } from './TenantLimitService';
import {
  applyOrganizationMatch,
  applyOrganizationScope,
  getCurrentOrganizationId,
  shouldScopeSharedTenantData,
} from './OrganizationService';
import VehicleModelService from './VehicleModelService';

const PACKAGE_TABLE = 'app_4c3a7a6153_rental_km_packages';
const PACKAGE_ORG_COLUMN_CACHE_KEY = `${PACKAGE_TABLE}:supportsOrganizationColumn`;
let packageTableSupportsOrganizationColumn = (() => {
  try {
    if (typeof window === 'undefined') return true;
    const cached = window.localStorage.getItem(PACKAGE_ORG_COLUMN_CACHE_KEY);
    if (cached === 'false') return false;
  } catch (_error) {
    // Ignore browser storage access errors.
  }
  return true;
})();

const isMissingFuelChargeColumnError = (error) =>
  error?.code === 'PGRST204' &&
  String(error?.message || '').includes('fuel_charge_enabled');

const isMissingOrganizationColumnError = (error) =>
  ['42703', 'PGRST204'].includes(String(error?.code || '').toUpperCase()) &&
  `${error?.message || ''} ${error?.details || ''}`.toLowerCase().includes('organization_id');

const getMissingFuelChargeColumnMessage = () =>
  'Database schema is missing rental_km_packages.fuel_charge_enabled. Apply src/migrations/add_fuel_charge_policy_to_rental_packages.sql, then try again.';

const markPackageTableWithoutOrganizationColumn = () => {
  packageTableSupportsOrganizationColumn = false;
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(PACKAGE_ORG_COLUMN_CACHE_KEY, 'false');
  } catch (_error) {
    // Ignore browser storage access errors.
  }
};

const stripOrganizationField = (payload = {}) => {
  if (!payload || typeof payload !== 'object') return payload;
  const { organization_id: _organizationId, ...rest } = payload;
  return rest;
};

const applyTenantAwareReadScope = (query, organizationId) => {
  if (shouldScopeSharedTenantData()) {
    if (!organizationId) {
      throw new Error('Workspace organization context is required to load packages.');
    }
    return applyOrganizationScope(query, organizationId);
  }

  if (organizationId) {
    return query.or(`organization_id.is.null,organization_id.eq.${organizationId}`);
  }

  return query.is('organization_id', null);
};

const applyTenantAwareWriteScope = (payload, organizationId) => {
  if (shouldScopeSharedTenantData()) {
    if (!organizationId) {
      throw new Error('Workspace organization context is required to save packages.');
    }
    return applyOrganizationMatch(payload, organizationId);
  }

  return stripOrganizationField(payload);
};

const runPackageReadQuery = async (buildQuery, organizationId) => {
  if (packageTableSupportsOrganizationColumn === false) {
    if (shouldScopeSharedTenantData()) {
      throw new Error('Workspace organization context is required to load packages.');
    }
    return buildQuery();
  }

  if (!organizationId) {
    if (shouldScopeSharedTenantData()) {
      throw new Error('Workspace organization context is required to load packages.');
    }
    return buildQuery().is('organization_id', null);
  }

  const scopedResult = await applyTenantAwareReadScope(buildQuery(), organizationId);

  if (organizationId && isMissingOrganizationColumnError(scopedResult.error)) {
    if (shouldScopeSharedTenantData()) {
      throw new Error('Package workspace isolation is not installed yet. Apply the organization isolation migration before loading shared tenant packages.');
    }
    markPackageTableWithoutOrganizationColumn();
    console.warn('Package table has no organization_id column; retrying package read without organization filter.');
    return buildQuery();
  }

  return scopedResult;
};

const PackageService = {
  async createPackage(packageData) {
    try {
      await assertTenantFeatureEnabled('pricing_km_packages', {
        message: 'Kilometer packages are not available on this plan.',
      });
      const organizationId = await getCurrentOrganizationId();
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
        show_on_print: packageData.show_on_print === true || packageData.showOnPrint === true,
      };

      // Fixed amount is always required. Kilometer fields are optional for unlimited packages.
      if (!dataToInsert.fixed_amount) {
        throw new Error('Fixed amount is required');
      }

      console.log('📦 Inserting data:', dataToInsert);

      const scopedPayload = packageTableSupportsOrganizationColumn !== false
        ? applyTenantAwareWriteScope(dataToInsert, organizationId)
        : stripOrganizationField(dataToInsert);

      let { error } = await supabase
        .from(PACKAGE_TABLE)
        .insert([scopedPayload]);

      if (organizationId && isMissingOrganizationColumnError(error)) {
        if (shouldScopeSharedTenantData()) {
          throw new Error('Package workspace isolation is not installed yet. Apply the organization isolation migration before creating shared tenant packages.');
        }
        markPackageTableWithoutOrganizationColumn();
        console.warn('Package table has no organization_id column; retrying package create without organization field.');
        ({ error } = await supabase
          .from(PACKAGE_TABLE)
          .insert([stripOrganizationField(dataToInsert)]));
      }

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
      const organizationId = await getCurrentOrganizationId();
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

      const scopedPayload = packageTableSupportsOrganizationColumn !== false
        ? applyTenantAwareWriteScope(dataToUpdate, organizationId)
        : stripOrganizationField(dataToUpdate);

      let query = supabase
        .from(PACKAGE_TABLE)
        .update(scopedPayload)
        .eq('id', id);

      if (organizationId && packageTableSupportsOrganizationColumn !== false) {
        query = applyTenantAwareReadScope(query, organizationId);
      }

      let { error } = await query;

      if (organizationId && isMissingOrganizationColumnError(error)) {
        if (shouldScopeSharedTenantData()) {
          throw new Error('Package workspace isolation is not installed yet. Apply the organization isolation migration before updating shared tenant packages.');
        }
        markPackageTableWithoutOrganizationColumn();
        console.warn('Package table has no organization_id column; retrying package update without organization filter.');
        ({ error } = await supabase
          .from(PACKAGE_TABLE)
          .update(stripOrganizationField(dataToUpdate))
          .eq('id', id));
      }

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
      const organizationId = await getCurrentOrganizationId();
      const { data, error } = await runPackageReadQuery(
        () => supabase
          .from(PACKAGE_TABLE)
          .select('*')
          .order('id'),
        organizationId
      );

      if (error) throw error;
      const vehicleModels = await VehicleModelService.getAllVehicleModels();
      const modelsById = new Map((vehicleModels || []).map((model) => [String(model.id), model]));
      return (data || []).map((pkg) => ({
        ...pkg,
        vehicle_model: modelsById.get(String(pkg.vehicle_model_id)) || null,
      }));
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
      return await VehicleModelService.getAllVehicleModels();
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
      const organizationId = await getCurrentOrganizationId();

      let query = supabase
        .from(PACKAGE_TABLE)
        .delete()
        .eq('id', id);

      if (organizationId && packageTableSupportsOrganizationColumn !== false) {
        query = applyTenantAwareReadScope(query, organizationId);
      }

      let { error } = await query;

      if (organizationId && isMissingOrganizationColumnError(error)) {
        if (shouldScopeSharedTenantData()) {
          throw new Error('Package workspace isolation is not installed yet. Apply the organization isolation migration before deleting shared tenant packages.');
        }
        markPackageTableWithoutOrganizationColumn();
        console.warn('Package table has no organization_id column; retrying package delete without organization filter.');
        ({ error } = await supabase
          .from(PACKAGE_TABLE)
          .delete()
          .eq('id', id));
      }

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error deleting package:', error);
      throw error;
    }
  }
};

export default PackageService;
