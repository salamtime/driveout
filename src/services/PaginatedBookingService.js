import { supabase } from '../utils/supabaseClient';
import { TBL } from '../config/tables.js';
import { PaginationService, PAGINATION_CONFIGS } from '../utils/PaginationUtils.js';
import cacheService from './CacheService';

/**
 * Paginated Booking Service with caching support
 */
class PaginatedBookingService {
  
  /**
   * Get bookings with pagination and caching
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} Paginated result with metadata
   */
  static async getBookingsPaginated(params = {}) {
    const {
      page = 1,
      limit = PAGINATION_CONFIGS.bookings.defaultLimit,
      status = '',
      customerId = '',
      vehicleId = '',
      startDate = '',
      endDate = '',
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = params;

    const cacheKey = cacheService.generateCacheKey('bookings', 'paginated', {
      page, limit, status, customerId, vehicleId, startDate, endDate, sortBy, sortOrder
    });

    const cached = cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      let baseQuery = supabase
        .from(TBL.BOOKINGS)
        .select(`
          *,
          vehicle:${TBL.VEHICLES}(id, name, model, plate_number, vehicle_type),
          customer:${TBL.CUSTOMERS}(id, name, email, phone),
          tour:${TBL.TOURS}(id, name, duration, price)
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
        baseQuery = baseQuery.gte('booking_date', startDate);
      }

      if (endDate) {
        baseQuery = baseQuery.lte('booking_date', endDate);
      }

      // Apply sorting
      baseQuery = baseQuery.order(sortBy, { ascending: sortOrder === 'asc' });

      const result = await PaginationService.executePaginatedQuery(
        baseQuery,
        { page, limit },
        'bookings'
      );

      if (result.success) {
        cacheService.set(cacheKey, result, 2 * 60 * 1000); // 2 minutes TTL
      }

      return result;
    } catch (error) {
      console.error('PaginatedBookingService.getBookingsPaginated error:', error);
      throw error;
    }
  }

  /**
   * Get upcoming bookings with pagination
   */
  static async getUpcomingBookingsPaginated(params = {}) {
    const {
      page = 1,
      limit = PAGINATION_CONFIGS.bookings.defaultLimit,
      days = 30,
      sortBy = 'booking_date',
      sortOrder = 'asc'
    } = params;

    const today = new Date().toISOString().split('T')[0];
    const futureDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const cacheKey = cacheService.generateCacheKey('bookings', 'upcomingPaginated', {
      page, limit, days, sortBy, sortOrder
    });

    const cached = cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      let baseQuery = supabase
        .from(TBL.BOOKINGS)
        .select(`
          *,
          vehicle:${TBL.VEHICLES}(id, name, model, plate_number),
          customer:${TBL.CUSTOMERS}(id, name, email, phone),
          tour:${TBL.TOURS}(id, name, duration)
        `)
        .gte('booking_date', today)
        .lte('booking_date', futureDate)
        .in('status', ['Confirmed', 'Pending']);

      baseQuery = baseQuery.order(sortBy, { ascending: sortOrder === 'asc' });

      const result = await PaginationService.executePaginatedQuery(
        baseQuery,
        { page, limit },
        'bookings'
      );

      if (result.success) {
        cacheService.set(cacheKey, result, 1 * 60 * 1000); // 1 minute TTL for upcoming
      }

      return result;
    } catch (error) {
      console.error('PaginatedBookingService.getUpcomingBookingsPaginated error:', error);
      throw error;
    }
  }

  /**
   * Get bookings by date range with pagination
   */
  static async getBookingsByDateRangePaginated(startDate, endDate, params = {}) {
    const {
      page = 1,
      limit = PAGINATION_CONFIGS.bookings.defaultLimit,
      status = '',
      sortBy = 'booking_date',
      sortOrder = 'asc'
    } = params;

    const cacheKey = cacheService.generateCacheKey('bookings', 'dateRangePaginated', {
      startDate, endDate, page, limit, status, sortBy, sortOrder
    });

    const cached = cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      let baseQuery = supabase
        .from(TBL.BOOKINGS)
        .select(`
          *,
          vehicle:${TBL.VEHICLES}(id, name, model, plate_number),
          customer:${TBL.CUSTOMERS}(id, name, email, phone),
          tour:${TBL.TOURS}(id, name, duration, price)
        `)
        .gte('booking_date', startDate)
        .lte('booking_date', endDate);

      if (status) {
        baseQuery = baseQuery.eq('status', status);
      }

      baseQuery = baseQuery.order(sortBy, { ascending: sortOrder === 'asc' });

      const result = await PaginationService.executePaginatedQuery(
        baseQuery,
        { page, limit },
        'bookings'
      );

      if (result.success) {
        cacheService.set(cacheKey, result, 5 * 60 * 1000); // 5 minutes TTL for date ranges
      }

      return result;
    } catch (error) {
      console.error('PaginatedBookingService.getBookingsByDateRangePaginated error:', error);
      throw error;
    }
  }

  /**
   * Search bookings with pagination
   */
  static async searchBookingsPaginated(searchTerm, params = {}) {
    const {
      page = 1,
      limit = PAGINATION_CONFIGS.bookings.defaultLimit,
      filters = {},
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = params;

    if (!searchTerm || searchTerm.trim() === '') {
      return this.getBookingsPaginated({ page, limit, sortBy, sortOrder, ...filters });
    }

    const cacheKey = cacheService.generateCacheKey('bookings', 'searchPaginated', {
      searchTerm, page, limit, filters, sortBy, sortOrder
    });

    const cached = cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      let baseQuery = supabase
        .from(TBL.BOOKINGS)
        .select(`
          *,
          vehicle:${TBL.VEHICLES}(id, name, model, plate_number),
          customer:${TBL.CUSTOMERS}(id, name, email, phone),
          tour:${TBL.TOURS}(id, name)
        `);

      // Search in booking reference, customer name, or vehicle details
      // Note: For related table searches, we might need to use separate queries
      // This is a simplified version focusing on direct booking fields
      baseQuery = baseQuery.or(`booking_reference.ilike.%${searchTerm}%,notes.ilike.%${searchTerm}%`);

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
        'bookings'
      );

      if (result.success) {
        cacheService.set(cacheKey, result, 3 * 60 * 1000); // 3 minutes TTL for searches
      }

      return result;
    } catch (error) {
      console.error('PaginatedBookingService.searchBookingsPaginated error:', error);
      throw error;
    }
  }

  /**
   * Invalidate booking cache
   */
  static invalidateCache() {
    cacheService.invalidateRelated('bookings');
  }
}

export default PaginatedBookingService;