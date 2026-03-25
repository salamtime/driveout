import { supabase } from '../lib/supabase';
import { TBL } from '../config/tables';

/**
 * Optimized Rental Service - High-performance rental data management
 * Implements pagination, caching, and optimized queries for fast loading
 */
class OptimizedRentalService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 2 * 60 * 1000; // 2 minutes
    this.defaultPageSize = 25;
  }

  // =================== CACHE MANAGEMENT ===================

  getCacheKey(operation, params = {}) {
    const paramStr = Object.keys(params).length ? JSON.stringify(params) : '';
    return `rental:${operation}:${paramStr}`;
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

  clearCache(pattern = '') {
    if (!pattern) {
      this.cache.clear();
      return;
    }
    
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  // =================== OPTIMIZED RENTAL LOADING ===================

  /**
   * Get paginated rentals with optimized query and caching
   */
  async getRentals(options = {}) {
    const {
      page = 1,
      pageSize = this.defaultPageSize,
      sortBy = 'created_at',
      sortOrder = 'desc',
      status = null,
      vehicleId = null,
      searchTerm = null
    } = options;

    const cacheKey = this.getCacheKey('rentals', options);
    const cached = this.getCache(cacheKey);
    if (cached) {
      return { success: true, ...cached };
    }

    try {
      const startTime = Date.now();
      
      // Build optimized query with selective JOINs including extensions
      let query = supabase
        .from(TBL.RENTALS)
        .select(`
          *,
          vehicle:saharax_0u4w4d_vehicles!inner (
            id,
            name,
            model,
            plate_number,
            status
          ),
          extensions:rental_extensions!rental_extensions_rental_id_fkey(id, extension_hours, status, created_at)
        `, { count: 'exact' });

      // Apply filters efficiently
      if (status && status !== 'all') {
        query = query.eq('rental_status', status);
      }
      
      if (vehicleId) {
        query = query.eq('vehicle_id', vehicleId);
      }
      
      if (searchTerm && searchTerm.length >= 2) {
        // Use ilike for case-insensitive search
        query = query.or(`customer_name.ilike.%${searchTerm}%,customer_email.ilike.%${searchTerm}%`);
      }

      // Apply sorting and pagination
      query = query
        .order(sortBy, { ascending: sortOrder === 'asc' })
        .range((page - 1) * pageSize, page * pageSize - 1);

      const { data: rentals, error, count } = await query;
      
      console.log('Raw rental data from Supabase:', rentals);

      if (error) {
        throw error;
      }

      const loadTime = Date.now() - startTime;

      // Transform data for UI consumption
      const transformedRentals = (rentals || []).map(rental => ({
        ...rental,
        duration_days: this.calculateDuration(rental.rental_start_date, rental.rental_end_date),
        status_color: this.getStatusColor(rental.rental_status),
        amount_formatted: this.formatCurrency(rental.total_amount)
      }));

      const result = {
        rentals: transformedRentals,
        pagination: {
          page,
          pageSize,
          total: count,
          totalPages: Math.ceil(count / pageSize),
          hasNext: page * pageSize < count,
          hasPrev: page > 1
        },
        loadTime
      };

      // Cache the result
      this.setCache(cacheKey, result);

      return { success: true, ...result };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        rentals: [],
        pagination: { page: 1, pageSize, total: 0, totalPages: 0, hasNext: false, hasPrev: false }
      };
    }
  }

  /**
   * Get rental statistics for dashboard
   */
  async getRentalStats() {
    const cacheKey = this.getCacheKey('stats');
    const cached = this.getCache(cacheKey);
    if (cached) return { success: true, ...cached };

    try {
      const { data: stats, error } = await supabase
        .from(TBL.RENTALS)
        .select(`
          rental_status,
          total_amount,
          rental_start_date,
          rental_end_date
        `);

      if (error) throw error;

      const result = this.calculateStats(stats || []);
      this.setCache(cacheKey, result);

      return { success: true, ...result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get single rental with full details
   */
  async getRental(id) {
    const cacheKey = this.getCacheKey('rental', { id });
    const cached = this.getCache(cacheKey);
    if (cached) return { success: true, rental: cached };

    try {
      const { data: rental, error } = await supabase
        .from(TBL.RENTALS)
        .select(`
          *,
          vehicle:saharax_0u4w4d_vehicles (
            id,
            name,
            model,
            plate_number,
            status,
            image_url
          ),
          extensions:rental_extensions!rental_extensions_rental_id_fkey(id, extension_hours, status, created_at)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;

      const transformedRental = {
        ...rental,
        duration_days: this.calculateDuration(rental.rental_start_date, rental.rental_end_date),
        status_color: this.getStatusColor(rental.rental_status),
        amount_formatted: this.formatCurrency(rental.total_amount)
      };

      this.setCache(cacheKey, transformedRental);

      return { success: true, rental: transformedRental };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // =================== RENTAL OPERATIONS ===================

  /**
   * Create new rental
   */
  async createRental(rentalData) {
    try {
      const { data: rental, error } = await supabase
        .from(TBL.RENTALS)
        .insert([{
          ...rentalData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select(`
          *,
          vehicle:saharax_0u4w4d_vehicles (
            id,
            name,
            model,
            plate_number,
            status
          )
        `)
        .single();

      if (error) throw error;

      // Clear relevant caches
      this.clearCache('rentals');
      this.clearCache('stats');

      return { success: true, rental };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Update rental
   */
  async updateRental(id, updates) {
    try {
      const { data: rental, error } = await supabase
        .from(TBL.RENTALS)
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select(`
          *,
          vehicle:saharax_0u4w4d_vehicles (
            id,
            name,
            model,
            plate_number,
            status
          )
        `)
        .single();

      if (error) throw error;

      // Clear relevant caches
      this.clearCache('rentals');
      this.clearCache('stats');
      this.clearCache(`rental:${id}`);

      return { success: true, rental };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete rental
   */
  async deleteRental(id) {
    try {
      const { error } = await supabase
        .from(TBL.RENTALS)
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Clear relevant caches
      this.clearCache('rentals');
      this.clearCache('stats');
      this.clearCache(`rental:${id}`);

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // =================== UTILITY METHODS ===================

  calculateDuration(startDate, endDate) {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  getStatusColor(status) {
    const colors = {
      'pending': 'yellow',
      'scheduled': 'blue',
      'active': 'green',
      'completed': 'gray',
      'cancelled': 'red'
    };
    return colors[status?.toLowerCase()] || 'gray';
  }

  formatCurrency(amount) {
    if (!amount) return '0 MAD';
    return `${parseFloat(amount).toFixed(0)} MAD`;
  }

  calculateStats(rentals) {
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    return {
      total: rentals.length,
      active: rentals.filter(r => r.rental_status === 'active').length,
      scheduled: rentals.filter(r => r.rental_status === 'scheduled').length,
      completed: rentals.filter(r => r.rental_status === 'completed').length,
      thisMonth: rentals.filter(r => new Date(r.rental_start_date) >= thisMonth).length,
      totalRevenue: rentals.reduce((sum, r) => sum + (parseFloat(r.total_amount) || 0), 0),
      averageValue: rentals.length > 0 
        ? rentals.reduce((sum, r) => sum + (parseFloat(r.total_amount) || 0), 0) / rentals.length 
        : 0
    };
  }

  // =================== SEARCH AND FILTERING ===================

  /**
   * Search rentals with debounced queries
   */
  async searchRentals(searchTerm, options = {}) {
    if (!searchTerm || searchTerm.length < 2) {
      return this.getRentals(options);
    }

    return this.getRentals({
      ...options,
      searchTerm
    });
  }
}

// Export singleton instance
const optimizedRentalService = new OptimizedRentalService();
export default optimizedRentalService;