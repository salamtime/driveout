import { supabase } from '../utils/supabaseClient';
import { TBL } from '../config/tables.js';
import { PaginationService, PAGINATION_CONFIGS } from '../utils/PaginationUtils.js';
import cacheService from './CacheService';

/**
 * Paginated Rental Service with caching support
 */
class PaginatedRentalService {
  
  /**
   * Get rentals with pagination and caching
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} Paginated result with metadata
   */
  static async getRentalsPaginated(params = {}) {
    const {
      page = 1,
      limit = PAGINATION_CONFIGS.rentals.defaultLimit,
      status = '',
      customerId = '',
      vehicleId = '',
      startDate = '',
      endDate = '',
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = params;

    const cacheKey = cacheService.generateCacheKey('rentals', 'paginated', {
      page, limit, status, customerId, vehicleId, startDate, endDate, sortBy, sortOrder
    });

    const cached = cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      let baseQuery = supabase
        .from(TBL.RENTALS)
        .select(`
          *,
          vehicle:${TBL.VEHICLES}(id, name, model, plate_number, vehicle_type),
          customer:${TBL.CUSTOMERS}(id, name, email, phone),
          pricing:${TBL.PRICING}(hourly_mad, daily_mad)
        `);

      // Apply filters
      if (status) {
        baseQuery = baseQuery.eq('status', status);
      }

      if (customerId) {
        baseQuery = baseQuery.eq('customer_id', customerId);
      }

      if (vehicleId) {
        baseQuery = baseQuery.eq('vehicle_id', vehicleId);
      }

      if (startDate) {
        baseQuery = baseQuery.gte('start_date', startDate);
      }

      if (endDate) {
        baseQuery = baseQuery.lte('end_date', endDate);
      }

      // Apply sorting
      baseQuery = baseQuery.order(sortBy, { ascending: sortOrder === 'asc' });

      const result = await PaginationService.executePaginatedQuery(
        baseQuery,
        { page, limit },
        'rentals'
      );

      if (result.success) {
        cacheService.set(cacheKey, result, 2 * 60 * 1000); // 2 minutes TTL
      }

      return result;
    } catch (error) {
      console.error('PaginatedRentalService.getRentalsPaginated error:', error);
      throw error;
    }
  }

  /**
   * Get active rentals with pagination
   */
  static async getActiveRentalsPaginated(params = {}) {
    const {
      page = 1,
      limit = PAGINATION_CONFIGS.rentals.defaultLimit,
      sortBy = 'start_date',
      sortOrder = 'asc'
    } = params;

    const cacheKey = cacheService.generateCacheKey('rentals', 'activePaginated', {
      page, limit, sortBy, sortOrder
    });

    const cached = cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      let baseQuery = supabase
        .from(TBL.RENTALS)
        .select(`
          *,
          vehicle:${TBL.VEHICLES}(id, name, model, plate_number, vehicle_type),
          customer:${TBL.CUSTOMERS}(id, name, email, phone),
          pricing:${TBL.PRICING}(hourly_mad, daily_mad)
        `)
        .in('status', ['Active', 'In Progress']);

      baseQuery = baseQuery.order(sortBy, { ascending: sortOrder === 'asc' });

      const result = await PaginationService.executePaginatedQuery(
        baseQuery,
        { page, limit },
        'rentals'
      );

      if (result.success) {
        cacheService.set(cacheKey, result, 1 * 60 * 1000); // 1 minute TTL for active rentals
      }

      return result;
    } catch (error) {
      console.error('PaginatedRentalService.getActiveRentalsPaginated error:', error);
      throw error;
    }
  }

  /**
   * Get rentals by customer with pagination
   */
  static async getRentalsByCustomerPaginated(customerId, params = {}) {
    const {
      page = 1,
      limit = PAGINATION_CONFIGS.rentals.defaultLimit,
      status = '',
      sortBy = 'start_date',
      sortOrder = 'desc'
    } = params;

    const cacheKey = cacheService.generateCacheKey('rentals', 'byCustomerPaginated', {
      customerId, page, limit, status, sortBy, sortOrder
    });

    const cached = cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      let baseQuery = supabase
        .from(TBL.RENTALS)
        .select(`
          *,
          vehicle:${TBL.VEHICLES}(id, name, model, plate_number, vehicle_type),
          pricing:${TBL.PRICING}(hourly_mad, daily_mad)
        `)
        .eq('customer_id', customerId);

      if (status) {
        baseQuery = baseQuery.eq('status', status);
      }

      baseQuery = baseQuery.order(sortBy, { ascending: sortOrder === 'asc' });

      const result = await PaginationService.executePaginatedQuery(
        baseQuery,
        { page, limit },
        'rentals'
      );

      if (result.success) {
        cacheService.set(cacheKey, result, 5 * 60 * 1000); // 5 minutes TTL
      }

      return result;
    } catch (error) {
      console.error('PaginatedRentalService.getRentalsByCustomerPaginated error:', error);
      throw error;
    }
  }

  /**
   * Get rentals by vehicle with pagination
   */
  static async getRentalsByVehiclePaginated(vehicleId, params = {}) {
    const {
      page = 1,
      limit = PAGINATION_CONFIGS.rentals.defaultLimit,
      status = '',
      sortBy = 'start_date',
      sortOrder = 'desc'
    } = params;

    const cacheKey = cacheService.generateCacheKey('rentals', 'byVehiclePaginated', {
      vehicleId, page, limit, status, sortBy, sortOrder
    });

    const cached = cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      let baseQuery = supabase
        .from(TBL.RENTALS)
        .select(`
          *,
          customer:${TBL.CUSTOMERS}(id, name, email, phone),
          pricing:${TBL.PRICING}(hourly_mad, daily_mad)
        `)
        .eq('vehicle_id', vehicleId);

      if (status) {
        baseQuery = baseQuery.eq('status', status);
      }

      baseQuery = baseQuery.order(sortBy, { ascending: sortOrder === 'asc' });

      const result = await PaginationService.executePaginatedQuery(
        baseQuery,
        { page, limit },
        'rentals'
      );

      if (result.success) {
        cacheService.set(cacheKey, result, 5 * 60 * 1000); // 5 minutes TTL
      }

      return result;
    } catch (error) {
      console.error('PaginatedRentalService.getRentalsByVehiclePaginated error:', error);
      throw error;
    }
  }

  /**
   * Get rentals by date range with pagination
   */
  static async getRentalsByDateRangePaginated(startDate, endDate, params = {}) {
    const {
      page = 1,
      limit = PAGINATION_CONFIGS.rentals.defaultLimit,
      status = '',
      sortBy = 'start_date',
      sortOrder = 'asc'
    } = params;

    const cacheKey = cacheService.generateCacheKey('rentals', 'dateRangePaginated', {
      startDate, endDate, page, limit, status, sortBy, sortOrder
    });

    const cached = cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      let baseQuery = supabase
        .from(TBL.RENTALS)
        .select(`
          *,
          vehicle:${TBL.VEHICLES}(id, name, model, plate_number),
          customer:${TBL.CUSTOMERS}(id, name, email, phone),
          pricing:${TBL.PRICING}(hourly_mad, daily_mad)
        `)
        .gte('start_date', startDate)
        .lte('end_date', endDate);

      if (status) {
        baseQuery = baseQuery.eq('status', status);
      }

      baseQuery = baseQuery.order(sortBy, { ascending: sortOrder === 'asc' });

      const result = await PaginationService.executePaginatedQuery(
        baseQuery,
        { page, limit },
        'rentals'
      );

      if (result.success) {
        cacheService.set(cacheKey, result, 5 * 60 * 1000); // 5 minutes TTL for date ranges
      }

      return result;
    } catch (error) {
      console.error('PaginatedRentalService.getRentalsByDateRangePaginated error:', error);
      throw error;
    }
  }

  /**
   * Search rentals with pagination
   */
  static async searchRentalsPaginated(searchTerm, params = {}) {
    const {
      page = 1,
      limit = PAGINATION_CONFIGS.rentals.defaultLimit,
      filters = {},
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = params;

    if (!searchTerm || searchTerm.trim() === '') {
      return this.getRentalsPaginated({ page, limit, sortBy, sortOrder, ...filters });
    }

    const cacheKey = cacheService.generateCacheKey('rentals', 'searchPaginated', {
      searchTerm, page, limit, filters, sortBy, sortOrder
    });

    const cached = cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      let baseQuery = supabase
        .from(TBL.RENTALS)
        .select(`
          *,
          vehicle:${TBL.VEHICLES}(id, name, model, plate_number),
          customer:${TBL.CUSTOMERS}(id, name, email, phone),
          pricing:${TBL.PRICING}(hourly_mad, daily_mad)
        `);

      // Search in rental reference, notes, or other text fields
      baseQuery = baseQuery.or(`rental_reference.ilike.%${searchTerm}%,notes.ilike.%${searchTerm}%`);

      // Apply additional filters
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== '') {
          baseQuery = baseQuery.eq(key, value);
        }
      });

      baseQuery = baseQuery.order(sortBy, { ascending: sortOrder === 'asc' });

      const result = await PaginationService.executePaginatedQuery(
        baseQuery,
        { page, limit },
        'rentals'
      );

      if (result.success) {
        cacheService.set(cacheKey, result, 3 * 60 * 1000); // 3 minutes TTL for searches
      }

      return result;
    } catch (error) {
      console.error('PaginatedRentalService.searchRentalsPaginated error:', error);
      throw error;
    }
  }

  /**
   * Invalidate rental cache
   */
  static invalidateCache() {
    cacheService.invalidateRelated('rentals');
  }
}

export default PaginatedRentalService;