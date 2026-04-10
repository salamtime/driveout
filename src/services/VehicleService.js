import { supabase } from '../lib/supabase';

const DEFAULT_SCHEDULED_RENTAL_GRACE_MINUTES = 120;
const isExpiredScheduledConflict = (rentalLike, graceMinutes = DEFAULT_SCHEDULED_RENTAL_GRACE_MINUTES) => {
  if (String(rentalLike?.rental_status || '').toLowerCase() !== 'scheduled' || !rentalLike?.rental_start_date) {
    return false;
  }

  const scheduledStart = new Date(rentalLike.rental_start_date);
  if (Number.isNaN(scheduledStart.getTime())) return false;
  return Date.now() > scheduledStart.getTime() + graceMinutes * 60 * 1000;
};

/**
 * Vehicle Service - FIXED to use actual database tables instead of non-existent view
 * 
 * Uses the actual saharax_0u4w4d_vehicles table instead of vehicle_availability_view
 * Provides real-time availability checking through rental table queries
 */
class VehicleService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    this.availableVehiclesCache = {
      data: null,
      key: null,
      timestamp: null,
      TTL: 30000 // 30 seconds cache for available vehicles
    };
  }

  // =================== CACHE MANAGEMENT ===================

  getCacheKey(operation, params = {}) {
    const paramStr = Object.keys(params).length ? JSON.stringify(params) : '';
    return `vehicle:${operation}:${paramStr}`;
  }

  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  getCache(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > this.cacheTimeout) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }

  clearCache() {
    this.cache.clear();
  }

  // =================== RETRY MECHANISM ===================

  async withRetry(operation, maxRetries = 3, delay = 1000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        console.log(`Attempt ${attempt} failed:`, error);
        
        if (attempt === maxRetries) {
          throw error;
        }
        
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      }
    }
  }

  // =================== VEHICLE OPERATIONS ===================

  /**
   * FIXED: Get all vehicles using actual database table
   * This is the function that SmartVehicleSelector expects to exist
   */
  async getAllVehicles() {
    const cacheKey = this.getCacheKey('all_vehicles');
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    try {
      console.log('🔄 Loading vehicles from actual database table...');

      const result = await this.withRetry(async () => {
        const { data, error } = await supabase
          .from('saharax_0u4w4d_vehicles')
          .select(`
            id,
            name,
            model,
            vehicle_type,
            plate_number,
            status
          `)
          .order('name', { ascending: true });

        if (error) throw error;
        
        console.log(`✅ Loaded ${data?.length || 0} vehicles from database table`);
        return data || [];
      });

      this.setCache(cacheKey, result);
      return result;
      
    } catch (error) {
      console.error('❌ Error loading vehicles from database table:', error);
      throw error;
    }
  }

  /**
   * Legacy method for backward compatibility
   */
  async getVehicles() {
    const result = await this.getAllVehicles();
    return { success: true, vehicles: result };
  }

  /**
   * Get available vehicles for rental with enhanced availability checking
   */
  async getAvailableVehicles(startDate = null, endDate = null, forceRefresh = false) {
    // Check cache first
    const cacheKey = `${startDate || 'none'}-${endDate || 'none'}`;
    const cache = this.availableVehiclesCache;
    if (!forceRefresh && cache.data && cache.key === cacheKey &&
        cache.timestamp && Date.now() - cache.timestamp < cache.TTL) {
      console.log('📦 Using cached available vehicles');
      return { success: true, vehicles: cache.data };
    }

    const maxRetries = 3;
    let lastError;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        console.log(`🚗 Loading available vehicles (attempt ${attempt + 1})...`);

        const { data: vehicles, error } = await supabase
          .from('saharax_0u4w4d_vehicles')
          .select(`
            id,
            name,
            model,
            vehicle_type,
            plate_number,
            status
          `)
          .eq('status', 'available')
          .order('name', { ascending: true });

        if (error) throw error;

        let availableVehicles = vehicles || [];

        // Additional date-based filtering if dates provided
        if (startDate && endDate) {
          console.log('🔍 Applying additional date-based filtering...');
          
          const { data: conflictingRentals } = await supabase
            .from('app_4c3a7a6153_rentals')
            .select('vehicle_id')
            .or(`and(rental_start_date.lte.${endDate},rental_end_date.gte.${startDate})`)
            .in('rental_status', ['scheduled', 'active', 'confirmed']);

          const activeConflicts = (conflictingRentals || []).filter((rental) => !isExpiredScheduledConflict(rental));

          if (activeConflicts.length > 0) {
            const conflictingVehicleIds = activeConflicts.map(r => r.vehicle_id);
            availableVehicles = availableVehicles.filter(v => 
              !conflictingVehicleIds.includes(v.id)
            );
          }
        }

        // Update cache
        this.availableVehiclesCache = {
          data: availableVehicles,
          key: cacheKey,
          timestamp: Date.now(),
          TTL: 30000
        };

        console.log(`✅ Found ${availableVehicles.length} available vehicles`);
        return { success: true, vehicles: availableVehicles };

      } catch (error) {
        lastError = error;
        if (error?.status === 429 && attempt < maxRetries - 1) {
          const waitTime = Math.pow(2, attempt) * 1000;
          console.log(`⏳ Rate limited (429), retrying in ${waitTime}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        } else if (attempt < maxRetries - 1) {
          const waitTime = Math.pow(2, attempt) * 500;
          await new Promise(resolve => setTimeout(resolve, waitTime));
        } else {
          break;
        }
      }
    }

    console.error('❌ Error loading available vehicles after retries:', lastError);
    // Return cached data as fallback if available
    if (cache.data) {
      console.log('📦 Returning stale cache as fallback');
      return { success: true, vehicles: cache.data };
    }
    return { success: false, error: lastError?.message, vehicles: [] };
  }

  /**
   * Get single vehicle by ID
   */
  async getVehicle(id) {
    const cacheKey = this.getCacheKey('vehicle', { id });
    const cached = this.getCache(cacheKey);
    if (cached) return { success: true, vehicle: cached };

    try {
      console.log('🔍 Loading vehicle details...', id);

      const { data: vehicle, error } = await supabase
        .from('saharax_0u4w4d_vehicles')
        .select(`
          id,
          name,
          model,
          vehicle_type,
          plate_number,
          status
        `)
        .eq('id', id)
        .single();

      if (error) throw error;

      this.setCache(cacheKey, vehicle);
      return { success: true, vehicle };
    } catch (error) {
      console.error('❌ Error loading vehicle:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create new vehicle
   */
  async createVehicle(vehicleData) {
    try {
      console.log('💾 Creating new vehicle...');

      const { data: vehicle, error } = await supabase
        .from('saharax_0u4w4d_vehicles')
        .insert([{
          ...vehicleData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;

      // Clear cache
      this.clearCache();

      console.log('✅ Vehicle created successfully');
      return { success: true, vehicle };
    } catch (error) {
      console.error('❌ Error creating vehicle:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update vehicle
   */
  async updateVehicle(id, updates) {
    try {
      console.log('📝 Updating vehicle...', id);

      const { data: vehicle, error } = await supabase
        .from('saharax_0u4w4d_vehicles')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Clear cache
      this.clearCache();

      console.log('✅ Vehicle updated successfully');
      return { success: true, vehicle };
    } catch (error) {
      console.error('❌ Error updating vehicle:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete vehicle
   */
  async deleteVehicle(id) {
    try {
      console.log('🗑️ Deleting vehicle...', id);

      const { error } = await supabase
        .from('saharax_0u4w4d_vehicles')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Clear cache
      this.clearCache();

      console.log('✅ Vehicle deleted successfully');
      return { success: true };
    } catch (error) {
      console.error('❌ Error deleting vehicle:', error);
      return { success: false, error: error.message };
    }
  }

  // =================== VEHICLE STATISTICS ===================

  /**
   * Get vehicle statistics using actual table
   */
  async getVehicleStats() {
    const cacheKey = this.getCacheKey('stats');
    const cached = this.getCache(cacheKey);
    if (cached) return { success: true, ...cached };

    try {
      console.log('📊 Loading vehicle statistics from database table...');

      const { data: vehicles, error } = await supabase
        .from('saharax_0u4w4d_vehicles')
        .select('status');

      if (error) throw error;

      const stats = {
        total: vehicles.length,
        available: vehicles.filter(v => v.status === 'available').length,
        rented: vehicles.filter(v => v.status === 'rented').length,
        reserved: vehicles.filter(v => v.status === 'reserved').length,
        maintenance: vehicles.filter(v => v.status === 'maintenance').length,
        out_of_service: vehicles.filter(v => v.status === 'out_of_service').length,
        byStatus: this.groupBy(vehicles, 'status')
      };

      this.setCache(cacheKey, stats);
      return { success: true, ...stats };
    } catch (error) {
      console.error('❌ Error loading vehicle stats:', error);
      return { success: false, error: error.message };
    }
  }

  // =================== UTILITY METHODS ===================

  groupBy(array, key) {
    return array.reduce((groups, item) => {
      const group = item[key] || 'unknown';
      groups[group] = (groups[group] || 0) + 1;
      return groups;
    }, {});
  }

  /**
   * Search vehicles using actual table
   */
  async searchVehicles(searchTerm) {
    if (!searchTerm || searchTerm.length < 2) {
      return this.getVehicles();
    }

    try {
      console.log('🔍 Searching vehicles...', searchTerm);

      const { data: vehicles, error } = await supabase
        .from('saharax_0u4w4d_vehicles')
        .select(`
          id,
          name,
          model,
          vehicle_type,
          plate_number,
          status
        `)
        .or(`name.ilike.%${searchTerm}%,model.ilike.%${searchTerm}%,plate_number.ilike.%${searchTerm}%`)
        .order('name', { ascending: true });

      if (error) throw error;

      return { success: true, vehicles: vehicles || [] };
    } catch (error) {
      console.error('❌ Error searching vehicles:', error);
      return { success: false, error: error.message, vehicles: [] };
    }
  }

  /**
   * Get vehicle availability status for a specific date range
   */
  async getVehicleAvailabilityStatus(vehicleId, startDate, endDate) {
    const maxRetries = 3;
    let lastError;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        console.log('🔍 Checking specific vehicle availability...', { vehicleId, startDate, endDate, attempt: attempt + 1 });

        // First get the current status from the vehicle table
        const { data: vehicle, error: statusError } = await supabase
          .from('saharax_0u4w4d_vehicles')
          .select('status')
          .eq('id', vehicleId)
          .single();

        if (statusError) throw statusError;

        // Then check for conflicts in the specific date range
        const { data: conflicts, error: conflictError } = await supabase
          .from('app_4c3a7a6153_rentals')
          .select('rental_start_date, rental_end_date, rental_status')
          .eq('vehicle_id', vehicleId)
          .or(`and(rental_start_date.lte.${endDate},rental_end_date.gte.${startDate})`)
          .in('rental_status', ['scheduled', 'active', 'confirmed']);

        if (conflictError) throw conflictError;

        const activeConflicts = (conflicts || []).filter((rental) => !isExpiredScheduledConflict(rental));

        return {
          success: true,
          current_status: vehicle.status,
          has_conflicts: activeConflicts.length > 0,
          conflicts: activeConflicts
        };
      } catch (error) {
        lastError = error;
        if (error?.status === 429 && attempt < maxRetries - 1) {
          const waitTime = Math.pow(2, attempt) * 1000;
          console.log(`⏳ Rate limited (429) for vehicle ${vehicleId}, retrying in ${waitTime}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        } else if (attempt >= maxRetries - 1) {
          break;
        }
      }
    }

    console.error('❌ Error checking vehicle availability status:', lastError);
    return { success: false, error: lastError?.message };
  }
}

// Export singleton instance
const vehicleService = new VehicleService();
export default vehicleService;
