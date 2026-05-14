import { supabase } from '../lib/supabase';
import { resolveTankCapacityLiters } from '../utils/vehicleModelSpecs';
import {
  getCurrentOrganizationId,
  shouldScopeSharedTenantData,
} from './OrganizationService';

/**
 * VehicleModelService - FIXED: Enhanced error handling and connection diagnostics
 */
class VehicleModelService {
  static QUERY_TIMEOUT = 15000; // Increased to 15 seconds for better reliability
  static MAX_RETRIES = 3; // Increased retries
  static CACHE_DURATION = 60000; // Increased cache to 60 seconds
  
  // In-memory cache
  static cache = new Map();
  static cacheTimestamps = new Map();
  static connectionTested = false;
  static MODEL_SELECT_COLUMNS = 'id, organization_id, name, model, vehicle_type, description, image_url, power_cc_min, power_cc_max, capacity_min, capacity_max, features, tank_capacity_liters, is_active';
  static MODEL_SELECT_COLUMNS_FALLBACK = 'id, organization_id, name, model, vehicle_type, description, image_url, power_cc_min, power_cc_max, capacity_min, capacity_max, features, is_active';
  static MODEL_SELECT_COLUMNS_MINIMAL = 'id, organization_id, name, model, vehicle_type, description, power_cc_min, power_cc_max, capacity_min, capacity_max, features, is_active';

  static isMissingOrganizationColumnError(error) {
    const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
    return ['42703', 'PGRST204'].includes(String(error?.code || '').toUpperCase()) && message.includes('organization_id');
  }

  static withoutOrganizationColumn(columns) {
    return String(columns || '')
      .split(',')
      .map((column) => column.trim())
      .filter((column) => column && column !== 'organization_id')
      .join(', ');
  }

  static async getOrganizationScope() {
    const organizationId = await getCurrentOrganizationId();
    const strictTenantScope = shouldScopeSharedTenantData();
    return {
      organizationId,
      strictTenantScope,
      cacheScope: strictTenantScope
        ? `tenant:${organizationId || 'missing'}`
        : `first-party:${organizationId || 'legacy'}`,
    };
  }

  static getModelsFallbackForCurrentHost(error = null) {
    if (shouldScopeSharedTenantData()) {
      console.warn('Vehicle model fallback suppressed for shared tenant isolation.', error);
      return [];
    }

    return this.getFallbackModels();
  }

  static applyReadScope(query, { organizationId, strictTenantScope }) {
    if (strictTenantScope) {
      if (!organizationId) {
        throw new Error('Workspace organization context is required to load vehicle models.');
      }
      return query.eq('organization_id', organizationId);
    }

    if (organizationId) {
      return query.or(`organization_id.is.null,organization_id.eq.${organizationId}`);
    }

    return query.is('organization_id', null);
  }

  static applyWriteScope(payload = {}, { organizationId, strictTenantScope }) {
    if (strictTenantScope) {
      if (!organizationId) {
        throw new Error('Workspace organization context is required to save vehicle models.');
      }
      return {
        ...payload,
        organization_id: organizationId,
      };
    }

    const { organization_id: _organizationId, ...legacyPayload } = payload || {};
    return legacyPayload;
  }

  static async selectVehicleModels(buildQuery, operation) {
    const scope = await this.getOrganizationScope();
    let result = await this.executeWithTimeout(buildQuery(this.MODEL_SELECT_COLUMNS, scope), operation);
    const primaryError = result?.error;

    if (this.isMissingOrganizationColumnError(primaryError)) {
      if (scope.strictTenantScope) {
        throw new Error('Vehicle model workspace isolation is not installed yet. Apply the organization isolation migration before loading shared tenant models.');
      }
      result = await this.executeWithTimeout(
        buildQuery(this.withoutOrganizationColumn(this.MODEL_SELECT_COLUMNS), { ...scope, ignoreOrganizationScope: true }),
        operation
      );
    }

    if (primaryError && `${primaryError.message || ''}`.toLowerCase().includes('tank_capacity_liters')) {
      result = await this.executeWithTimeout(buildQuery(this.MODEL_SELECT_COLUMNS_FALLBACK, scope), operation);
    }

    const secondaryError = result?.error;
    if (secondaryError && `${secondaryError.message || ''}`.toLowerCase().includes('image_url')) {
      result = await this.executeWithTimeout(buildQuery(this.MODEL_SELECT_COLUMNS_MINIMAL, scope), operation);
    }

    return result;
  }

  static buildScopedModelQuery(baseQuery, scope) {
    if (scope?.ignoreOrganizationScope) {
      return baseQuery;
    }

    return this.applyReadScope(baseQuery, scope);
  }

  /**
   * Check if cached data is still valid
   */
  static isCacheValid(key) {
    const timestamp = this.cacheTimestamps.get(key);
    if (!timestamp) return false;
    return Date.now() - timestamp < this.CACHE_DURATION;
  }

  /**
   * Test Supabase connection with detailed diagnostics
   */
  static async testConnection() {
    try {
      console.log('🔍 VehicleModelService: Testing Supabase connection...');
      console.log('📊 Connection details:', {
        url: import.meta.env.VITE_SUPABASE_URL,
        hasAnonKey: !!import.meta.env.VITE_SUPABASE_ANON_KEY,
        userAgent: navigator.userAgent
      });

      // Simple connection test
      const scope = await this.getOrganizationScope();
      const { data, error } = await this.buildScopedModelQuery(
        supabase
        .from('saharax_0u4w4d_vehicle_models')
        .select('count', { count: 'exact', head: true })
          .limit(1),
        scope
      );

      if (error) {
        console.error('❌ VehicleModelService: Connection test failed:', error);
        throw error;
      }

      console.log('✅ VehicleModelService: Connection test successful');
      this.connectionTested = true;
      return true;
    } catch (error) {
      console.error('❌ VehicleModelService: Connection test error:', error);
      this.connectionTested = false;
      return false;
    }
  }

  /**
   * Enhanced execute with timeout and better error handling
   */
  static async executeWithTimeout(queryPromise, operation = 'query') {
    let lastError;
    
    // Test connection first if not tested
    if (!this.connectionTested) {
      const connectionOk = await this.testConnection();
      if (!connectionOk) {
        console.warn('⚠️ VehicleModelService: Connection test failed, proceeding with fallback');
        throw new Error('Supabase connection failed - using fallback data');
      }
    }
    
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        console.log(`🔄 VehicleModelService: Attempt ${attempt}/${this.MAX_RETRIES} for ${operation}`);
        
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`${operation} timeout after ${this.QUERY_TIMEOUT}ms`)), this.QUERY_TIMEOUT)
        );

        const result = await Promise.race([queryPromise, timeoutPromise]);
        console.log(`✅ VehicleModelService: ${operation} completed successfully on attempt ${attempt}`);
        return result;
        
      } catch (error) {
        lastError = error;
        console.warn(`⚠️ VehicleModelService: ${operation} failed on attempt ${attempt}:`, error.message);
        
        // Check for specific error types
        if (error.message.includes('ERR_BLOCKED_BY_CLIENT')) {
          console.error('🚫 VehicleModelService: Request blocked by client (ad blocker/extension)');
          break; // Don't retry blocked requests
        }
        
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
          console.error('🌐 VehicleModelService: Network connectivity issue');
        }
        
        if (attempt < this.MAX_RETRIES) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 3000);
          console.log(`⏳ VehicleModelService: Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * FIXED: Get all active vehicle models with enhanced error handling
   */
  static async getActiveModels() {
    try {
      const scope = await this.getOrganizationScope();
      const cacheKey = `${scope.cacheScope}:active_models`;
      
      if (this.isCacheValid(cacheKey)) {
        console.log('✅ VehicleModelService: Cache hit for active models');
        return this.cache.get(cacheKey);
      }

      console.log('🚀 VehicleModelService: Fetching active models with enhanced error handling...');
      
      const { data, error } = await this.selectVehicleModels(
        (columns, queryScope) =>
          this.buildScopedModelQuery(
            supabase
            .from('saharax_0u4w4d_vehicle_models')
            .select(columns)
            .eq('is_active', true)
            .order('name', { ascending: true })
              .limit(50),
            queryScope
          ),
        'getActiveModels'
      );

      if (error) {
        console.error('❌ VehicleModelService: Error fetching active models:', error);
        throw error;
      }

      const result = data || this.getFallbackModels();
      
      // Cache the result
      this.cache.set(cacheKey, result);
      this.cacheTimestamps.set(cacheKey, Date.now());

      console.log('✅ VehicleModelService: Active models fetched successfully:', result.length, 'models');
      return result;
    } catch (error) {
      console.error('❌ VehicleModelService: Error in getActiveModels, using fallback:', error);
      return this.getModelsFallbackForCurrentHost(error);
    }
  }

  /**
   * FIXED: Get all vehicle models with enhanced error handling
   */
  static async getAllModels() {
    try {
      const scope = await this.getOrganizationScope();
      const cacheKey = `${scope.cacheScope}:all_models`;
      
      if (this.isCacheValid(cacheKey)) {
        console.log('✅ VehicleModelService: Cache hit for all models');
        return this.cache.get(cacheKey);
      }

      console.log('🚀 VehicleModelService: Fetching all models with enhanced error handling...');
      
      const { data, error } = await this.selectVehicleModels(
        (columns, queryScope) =>
          this.buildScopedModelQuery(
            supabase
            .from('saharax_0u4w4d_vehicle_models')
            .select(columns)
            .order('name', { ascending: true })
              .limit(100),
            queryScope
          ),
        'getAllModels'
      );

      if (error) {
        console.error('❌ VehicleModelService: Error fetching all models:', error);
        throw error;
      }

      const result = data || this.getFallbackModels();
      
      // Cache the result
      this.cache.set(cacheKey, result);
      this.cacheTimestamps.set(cacheKey, Date.now());

      console.log('✅ VehicleModelService: All models fetched successfully:', result.length, 'models');
      return result;
    } catch (error) {
      console.error('❌ VehicleModelService: Error in getAllModels, using fallback:', error);
      return this.getModelsFallbackForCurrentHost(error);
    }
  }

  /**
   * FIXED: getAllVehicleModels method that components expect
   */
  static async getAllVehicleModels() {
    try {
      console.log('🔧 VehicleModelService: getAllVehicleModels called - using enhanced getAllModels...');
      return await this.getAllModels();
    } catch (error) {
      console.error('❌ VehicleModelService: Error in getAllVehicleModels, using fallback:', error);
      return this.getModelsFallbackForCurrentHost(error);
    }
  }

  /**
   * FIXED: Get vehicle model by ID with enhanced error handling
   */
  static async getModelById(modelId) {
    try {
      console.log('🚀 VehicleModelService: Fetching model by ID with enhanced error handling:', modelId);
      
      const { data, error } = await this.selectVehicleModels(
        (columns, queryScope) =>
          this.buildScopedModelQuery(
            supabase
            .from('saharax_0u4w4d_vehicle_models')
            .select(columns)
            .eq('id', modelId)
              .single(),
            queryScope
          ),
        'getModelById'
      );

      if (error) {
        console.error('❌ VehicleModelService: Error fetching model by ID:', error);
        return null;
      }

      console.log('✅ VehicleModelService: Model fetched by ID successfully:', data?.name);
      return data;
    } catch (error) {
      console.error('❌ VehicleModelService: Error in getModelById:', error);
      return null;
    }
  }

  /**
   * FIXED: Create new vehicle model with enhanced error handling
   */
  static async createModel(modelData) {
    try {
      console.log('🚀 VehicleModelService: Creating model with enhanced error handling:', modelData);
      const scope = await this.getOrganizationScope();

      const payload = this.applyWriteScope({
        ...modelData,
        tank_capacity_liters: resolveTankCapacityLiters(
          modelData.tank_capacity_liters,
          modelData.model,
          modelData.name
        ),
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, scope);

      const buildInsertPromise = ({ includeTankCapacity = true, includeImageUrl = true } = {}) => supabase
        .from('saharax_0u4w4d_vehicle_models')
        .insert([{
          ...payload,
          ...(includeTankCapacity ? {} : { tank_capacity_liters: undefined }),
          ...(includeImageUrl ? {} : { image_url: undefined }),
        }])
        .select(this.MODEL_SELECT_COLUMNS_FALLBACK);

      let { data, error } = await this.executeWithTimeout(buildInsertPromise({ includeTankCapacity: true, includeImageUrl: true }), 'createModel');

      if (
        error &&
        `${error.message || ''} ${error.details || ''}`.toLowerCase().includes('tank_capacity_liters')
      ) {
        ({ data, error } = await this.executeWithTimeout(buildInsertPromise({ includeTankCapacity: false, includeImageUrl: true }), 'createModel'));
      }

      if (
        error &&
        `${error.message || ''} ${error.details || ''}`.toLowerCase().includes('image_url')
      ) {
        ({ data, error } = await this.executeWithTimeout(buildInsertPromise({ includeTankCapacity: false, includeImageUrl: false }), 'createModel'));
      }

      if (error) {
        console.error('❌ VehicleModelService: Error creating model:', error);
        throw error;
      }

      // Clear cache after successful creation
      this.clearCache();

      console.log('✅ VehicleModelService: Model created successfully:', data?.[0]);
      return data?.[0];
    } catch (error) {
      console.error('❌ VehicleModelService: Error in createModel:', error);
      throw error;
    }
  }

  /**
   * FIXED: createVehicleModel method that components expect
   */
  static async createVehicleModel(modelData) {
    return this.createModel(modelData);
  }

  /**
   * FIXED: Update vehicle model with enhanced error handling
   */
  static async updateModel(modelId, modelData) {
    try {
      console.log('🚀 VehicleModelService: Updating model with enhanced error handling:', modelId);
      const scope = await this.getOrganizationScope();

      const payload = this.applyWriteScope({
        ...modelData,
        tank_capacity_liters: resolveTankCapacityLiters(
          modelData.tank_capacity_liters,
          modelData.model,
          modelData.name
        ),
        updated_at: new Date().toISOString()
      }, scope);

      const buildUpdatePromise = ({ includeTankCapacity = true, includeImageUrl = true } = {}) =>
        this.buildScopedModelQuery(
          supabase
            .from('saharax_0u4w4d_vehicle_models')
            .update({
              ...payload,
              ...(includeTankCapacity ? {} : { tank_capacity_liters: undefined }),
              ...(includeImageUrl ? {} : { image_url: undefined }),
            })
            .eq('id', modelId)
            .select(this.MODEL_SELECT_COLUMNS_FALLBACK),
          scope
        );

      let { data, error } = await this.executeWithTimeout(buildUpdatePromise({ includeTankCapacity: true, includeImageUrl: true }), 'updateModel');

      if (
        error &&
        `${error.message || ''} ${error.details || ''}`.toLowerCase().includes('tank_capacity_liters')
      ) {
        ({ data, error } = await this.executeWithTimeout(buildUpdatePromise({ includeTankCapacity: false, includeImageUrl: true }), 'updateModel'));
      }

      if (
        error &&
        `${error.message || ''} ${error.details || ''}`.toLowerCase().includes('image_url')
      ) {
        ({ data, error } = await this.executeWithTimeout(buildUpdatePromise({ includeTankCapacity: false, includeImageUrl: false }), 'updateModel'));
      }

      if (error) {
        console.error('❌ VehicleModelService: Error updating model:', error);
        throw error;
      }

      // Clear cache after successful update
      this.clearCache();

      console.log('✅ VehicleModelService: Model updated successfully:', data?.[0]);
      return data?.[0];
    } catch (error) {
      console.error('❌ VehicleModelService: Error in updateModel:', error);
      throw error;
    }
  }

  /**
   * FIXED: Delete vehicle model with enhanced error handling
   */
  static async deleteModel(modelId) {
    try {
      console.log('🚀 VehicleModelService: Deleting model with enhanced error handling:', modelId);
      const scope = await this.getOrganizationScope();
      
      const deletePromise = this.buildScopedModelQuery(
        supabase
          .from('saharax_0u4w4d_vehicle_models')
          .delete()
          .eq('id', modelId),
        scope
      );

      const { error } = await this.executeWithTimeout(deletePromise, 'deleteModel');

      if (error) {
        console.error('❌ VehicleModelService: Error deleting model:', error);
        throw error;
      }

      // Clear cache after successful deletion
      this.clearCache();

      console.log('✅ VehicleModelService: Model deleted successfully');
      return { success: true };
    } catch (error) {
      console.error('❌ VehicleModelService: Error in deleteModel:', error);
      throw error;
    }
  }

  /**
   * FIXED: deleteVehicleModel method that components expect
   */
  static async deleteVehicleModel(modelId) {
    return this.deleteModel(modelId);
  }

  /**
   * FIXED: Toggle model active status with enhanced error handling
   */
  static async toggleActiveStatus(modelId, active) {
    try {
      console.log('🚀 VehicleModelService: Toggling active status with enhanced error handling:', modelId, active);
      const scope = await this.getOrganizationScope();
      
      const { data, error } = await this.selectVehicleModels(
        (columns, queryScope) =>
          this.buildScopedModelQuery(
            supabase
            .from('saharax_0u4w4d_vehicle_models')
            .update({
              is_active: active,
              updated_at: new Date().toISOString()
            })
            .eq('id', modelId)
              .select(columns),
            queryScope || scope
          ),
        'toggleActiveStatus'
      );

      if (error) {
        console.error('❌ VehicleModelService: Error toggling active status:', error);
        throw error;
      }

      // Clear cache after successful update
      this.clearCache();

      console.log('✅ VehicleModelService: Active status toggled successfully:', data?.[0]);
      return data?.[0];
    } catch (error) {
      console.error('❌ VehicleModelService: Error in toggleActiveStatus:', error);
      throw error;
    }
  }

  /**
   * FIXED: Search vehicle models with enhanced error handling
   */
  static async searchModels(searchTerm) {
    try {
      if (!searchTerm || searchTerm.trim().length < 2) {
        return [];
      }

      console.log('🚀 VehicleModelService: Searching models with enhanced error handling:', searchTerm);

      const { data, error } = await this.selectVehicleModels(
        (columns, queryScope) =>
          this.buildScopedModelQuery(
            supabase
            .from('saharax_0u4w4d_vehicle_models')
            .select(columns)
            .eq('is_active', true)
            .or(`name.ilike.%${searchTerm}%,model.ilike.%${searchTerm}%`)
            .order('name', { ascending: true })
              .limit(25),
            queryScope
          ),
        'searchModels'
      );

      if (error) {
        console.error('❌ VehicleModelService: Error searching models:', error);
        return [];
      }

      console.log('✅ VehicleModelService: Models search completed:', data?.length || 0, 'results');
      return data || [];
    } catch (error) {
      console.error('❌ VehicleModelService: Error in searchModels:', error);
      return [];
    }
  }

  /**
   * Get display label for a vehicle model
   */
  static getDisplayLabel(model) {
    if (!model) return 'Unknown Model';
    
    const name = model.name || '';
    const modelName = model.model || 'Unknown Model';
    
    return name ? `${name} ${modelName}` : modelName;
  }

  /**
   * Get detailed display label with type and ID
   */
  static getDetailedLabel(model) {
    if (!model) return 'Unknown Model';
    
    const displayName = this.getDisplayLabel(model);
    const vehicleType = model.vehicle_type ? ` (${model.vehicle_type})` : '';
    const shortId = model.id ? model.id.substring(0, 8) : 'unknown';
    
    return `${displayName}${vehicleType} • ${shortId}`;
  }

  /**
   * Validate vehicle model data
   */
  static validateModel(modelData) {
    const errors = [];

    if (!modelData.name || modelData.name.trim() === '') {
      errors.push('Model name is required');
    }

    if (!modelData.model || modelData.model.trim() === '') {
      errors.push('Model field is required');
    }

    if (!modelData.vehicle_type || modelData.vehicle_type.trim() === '') {
      errors.push('Vehicle type is required');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * ENHANCED: Get fallback models data with more comprehensive data
   */
  static getFallbackModels() {
    console.log('🔄 VehicleModelService: Using fallback models data');
    return [
      { id: '1', name: 'SEGWAY', model: 'AT5', vehicle_type: 'ATV', is_active: true, tank_capacity_liters: 19, image_url: null, description: '', power_cc_min: 0, power_cc_max: 0, capacity_min: 1, capacity_max: 1, features: [] },
      { id: '2', name: 'SEGWAY', model: 'AT6', vehicle_type: 'ATV', is_active: true, tank_capacity_liters: 23, image_url: null, description: '', power_cc_min: 0, power_cc_max: 0, capacity_min: 1, capacity_max: 1, features: [] },
      { id: '3', name: 'SEGWAY', model: 'AT5', vehicle_type: 'Quad', is_active: true, tank_capacity_liters: 19, image_url: null, description: '', power_cc_min: 0, power_cc_max: 0, capacity_min: 1, capacity_max: 1, features: [] },
      { id: '4', name: 'SEGWAY', model: 'AT6', vehicle_type: 'Quad', is_active: true, tank_capacity_liters: 23, image_url: null, description: '', power_cc_min: 0, power_cc_max: 0, capacity_min: 1, capacity_max: 1, features: [] },
      { id: '5', name: 'YAMAHA', model: 'YFZ450R', vehicle_type: 'ATV', is_active: true, image_url: null, description: '', power_cc_min: 0, power_cc_max: 0, capacity_min: 1, capacity_max: 1, features: [] },
      { id: '6', name: 'HONDA', model: 'TRX450R', vehicle_type: 'ATV', is_active: true, image_url: null, description: '', power_cc_min: 0, power_cc_max: 0, capacity_min: 1, capacity_max: 1, features: [] },
      { id: '7', name: 'KAWASAKI', model: 'KFX450R', vehicle_type: 'ATV', is_active: true, image_url: null, description: '', power_cc_min: 0, power_cc_max: 0, capacity_min: 1, capacity_max: 1, features: [] },
      { id: '8', name: 'SUZUKI', model: 'LTR450', vehicle_type: 'ATV', is_active: true, image_url: null, description: '', power_cc_min: 0, power_cc_max: 0, capacity_min: 1, capacity_max: 1, features: [] }
    ];
  }

  /**
   * Clear all cache
   */
  static clearCache() {
    this.cache.clear();
    this.cacheTimestamps.clear();
    console.log('🗑️ VehicleModelService: Cache cleared');
  }

  /**
   * Get cache statistics
   */
  static getCacheStats() {
    return {
      cacheSize: this.cache.size,
      cacheKeys: Array.from(this.cache.keys()),
      timestamps: Array.from(this.cacheTimestamps.entries()),
      connectionTested: this.connectionTested
    };
  }

  /**
   * ENHANCED: Health check method with detailed diagnostics
   */
  static async healthCheck() {
    try {
      console.log('🏥 VehicleModelService: Running comprehensive health check...');
      
      // Test environment variables
      const envCheck = {
        hasUrl: !!import.meta.env.VITE_SUPABASE_URL,
        hasAnonKey: !!import.meta.env.VITE_SUPABASE_ANON_KEY,
        url: import.meta.env.VITE_SUPABASE_URL
      };
      
      console.log('📊 Environment check:', envCheck);
      
      if (!envCheck.hasUrl || !envCheck.hasAnonKey) {
        throw new Error('Missing Supabase environment variables');
      }
      
      // Test basic connection
      const connectionOk = await this.testConnection();
      if (!connectionOk) {
        throw new Error('Supabase connection test failed');
      }
      
      // Test actual query
      const scope = await this.getOrganizationScope();
      const queryPromise = this.buildScopedModelQuery(
        supabase
          .from('saharax_0u4w4d_vehicle_models')
          .select('id')
          .limit(1),
        scope
      );

      await this.executeWithTimeout(queryPromise, 'healthCheck');
      
      console.log('✅ VehicleModelService: Comprehensive health check passed');
      return {
        success: true,
        environment: envCheck,
        connection: true,
        query: true
      };
    } catch (err) {
      console.error('❌ VehicleModelService: Health check failed:', err);
      return {
        success: false,
        error: err.message,
        environment: {
          hasUrl: !!import.meta.env.VITE_SUPABASE_URL,
          hasAnonKey: !!import.meta.env.VITE_SUPABASE_ANON_KEY
        },
        connection: false,
        query: false
      };
    }
  }

  /**
   * ENHANCED: Force refresh data (clear cache and fetch fresh)
   */
  static async forceRefresh() {
    console.log('🔄 VehicleModelService: Force refreshing all data...');
    this.clearCache();
    this.connectionTested = false;
    
    try {
      const models = await this.getAllModels();
      console.log('✅ VehicleModelService: Force refresh completed:', models.length, 'models');
      return models;
    } catch (error) {
      console.error('❌ VehicleModelService: Force refresh failed:', error);
      return this.getModelsFallbackForCurrentHost(error);
    }
  }
}

export default VehicleModelService;
