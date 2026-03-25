import { supabase } from '../lib/supabase';

export class PaginatedVehicleService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  async getVehicles({
    page = 1,
    pageSize = 20,
    search = '',
    status = 'all',
    vehicleType = 'all',
    sortBy = 'name',
    sortOrder = 'asc'
  } = {}) {
    try {
      console.log('🚗 Fetching paginated vehicles...');
      
      const offset = (page - 1) * pageSize;
      
      let query = supabase
        .from('saharax_0u4w4d_vehicles')
        .select('*', { count: 'exact' });

      // Apply filters
      if (status !== 'all') {
        query = query.eq('status', status);
      }

      if (vehicleType !== 'all') {
        query = query.eq('vehicle_type', vehicleType);
      }

      if (search && search.trim()) {
        query = query.or(
          `name.ilike.%${search}%,model.ilike.%${search}%,vehicle_type.ilike.%${search}%,plate_number.ilike.%${search}%`
        );
      }

      // Apply sorting
      query = query.order(sortBy, { ascending: sortOrder === 'asc' });

      // Apply pagination
      query = query.range(offset, offset + pageSize - 1);

      const { data: vehicles, error, count } = await query;

      if (error) {
        console.error('❌ Error fetching vehicles:', error);
        return {
          data: [],
          total: 0,
          pages: 0,
          currentPage: page,
          pageSize
        };
      }

      const totalPages = Math.ceil((count || 0) / pageSize);

      console.log(`✅ Fetched ${vehicles?.length || 0} vehicles (page ${page}/${totalPages})`);
      
      return {
        data: vehicles || [],
        total: count || 0,
        pages: totalPages,
        currentPage: page,
        pageSize
      };

    } catch (error) {
      console.error('❌ Error in getVehicles:', error);
      return {
        data: [],
        total: 0,
        pages: 0,
        currentPage: page,
        pageSize
      };
    }
  }

  async getVehicleById(id) {
    try {
      const { data: vehicle, error } = await supabase
        .from('saharax_0u4w4d_vehicles')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error('❌ Error fetching vehicle by ID:', error);
        return null;
      }

      return vehicle;
    } catch (error) {
      console.error('❌ Error in getVehicleById:', error);
      return null;
    }
  }

  async createVehicle(vehicleData) {
    try {
      console.log('➕ Creating new vehicle...');
      
      const { data: vehicle, error } = await supabase
        .from('saharax_0u4w4d_vehicles')
        .insert([vehicleData])
        .select()
        .single();

      if (error) {
        console.error('❌ Error creating vehicle:', error);
        throw error;
      }

      console.log('✅ Vehicle created successfully:', vehicle.id);
      this.clearCache();
      return vehicle;
    } catch (error) {
      console.error('❌ Error in createVehicle:', error);
      throw error;
    }
  }

  async updateVehicle(id, updateData) {
    try {
      console.log('✏️ Updating vehicle:', id);
      
      const { data: vehicle, error } = await supabase
        .from('saharax_0u4w4d_vehicles')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('❌ Error updating vehicle:', error);
        throw error;
      }

      console.log('✅ Vehicle updated successfully');
      this.clearCache();
      return vehicle;
    } catch (error) {
      console.error('❌ Error in updateVehicle:', error);
      throw error;
    }
  }

  async deleteVehicle(id) {
    try {
      console.log('🗑️ Deleting vehicle:', id);
      
      const { error } = await supabase
        .from('saharax_0u4w4d_vehicles')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('❌ Error deleting vehicle:', error);
        throw error;
      }

      console.log('✅ Vehicle deleted successfully');
      this.clearCache();
      return true;
    } catch (error) {
      console.error('❌ Error in deleteVehicle:', error);
      throw error;
    }
  }

  async getVehicleStats() {
    try {
      const { data: vehicles, error } = await supabase
        .from('saharax_0u4w4d_vehicles')
        .select('status, vehicle_type');

      if (error) {
        console.error('❌ Error fetching vehicle stats:', error);
        return {
          total: 0,
          byStatus: {},
          byType: {}
        };
      }

      const stats = {
        total: vehicles?.length || 0,
        byStatus: {},
        byType: {}
      };

      vehicles?.forEach(vehicle => {
        // Count by status
        const status = vehicle.status || 'unknown';
        stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;

        // Count by type
        const type = vehicle.vehicle_type || 'unknown';
        stats.byType[type] = (stats.byType[type] || 0) + 1;
      });

      return stats;
    } catch (error) {
      console.error('❌ Error in getVehicleStats:', error);
      return {
        total: 0,
        byStatus: {},
        byType: {}
      };
    }
  }

  async searchVehicles(searchTerm, limit = 10) {
    try {
      if (!searchTerm || searchTerm.trim().length < 2) {
        return [];
      }

      const { data: vehicles, error } = await supabase
        .from('saharax_0u4w4d_vehicles')
        .select('id, name, model, vehicle_type, plate_number, status')
        .or(`name.ilike.%${searchTerm}%,model.ilike.%${searchTerm}%,vehicle_type.ilike.%${searchTerm}%,plate_number.ilike.%${searchTerm}%`)
        .limit(limit);

      if (error) {
        console.error('❌ Error searching vehicles:', error);
        return [];
      }

      return vehicles || [];
    } catch (error) {
      console.error('❌ Error in searchVehicles:', error);
      return [];
    }
  }

  async getAvailableVehicles(startDate, endDate) {
    try {
      // Get all active vehicles
      const { data: allVehicles, error: vehicleError } = await supabase
        .from('saharax_0u4w4d_vehicles')
        .select('*')
        .eq('status', 'available');

      if (vehicleError) {
        console.error('❌ Error fetching vehicles:', vehicleError);
        return [];
      }

      // Get vehicles that are booked during the specified period
      const { data: bookedVehicles, error: bookingError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .select('vehicle_id')
        .or(`and(rental_start_date.lte.${endDate},rental_end_date.gte.${startDate})`)
        .in('status', ['confirmed', 'active']);

      if (bookingError) {
        console.warn('⚠️ Error checking bookings:', bookingError);
        return allVehicles || [];
      }

      const bookedVehicleIds = bookedVehicles?.map(b => b.vehicle_id) || [];
      const availableVehicles = allVehicles?.filter(v => !bookedVehicleIds.includes(v.id)) || [];

      console.log(`✅ Found ${availableVehicles.length} available vehicles`);
      return availableVehicles;
    } catch (error) {
      console.error('❌ Error in getAvailableVehicles:', error);
      return [];
    }
  }

  // Cache management
  getCacheKey(method, params) {
    return `${method}_${JSON.stringify(params)}`;
  }

  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    return null;
  }

  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  clearCache() {
    this.cache.clear();
    console.log('✅ Vehicle service cache cleared');
  }
}

export const paginatedVehicleService = new PaginatedVehicleService();
export default paginatedVehicleService;