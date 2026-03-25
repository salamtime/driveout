/**
 * Pagination Utilities for Large Dataset Management
 */

export class PaginationUtils {
  /**
   * Calculate pagination metadata
   * @param {number} totalItems - Total number of items
   * @param {number} currentPage - Current page number (1-based)
   * @param {number} itemsPerPage - Items per page
   * @returns {Object} Pagination metadata
   */
  static calculatePagination(totalItems, currentPage, itemsPerPage) {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const hasNextPage = currentPage < totalPages;
    const hasPreviousPage = currentPage > 1;
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
    
    return {
      totalItems,
      totalPages,
      currentPage,
      itemsPerPage,
      hasNextPage,
      hasPreviousPage,
      startIndex,
      endIndex,
      itemsOnCurrentPage: endIndex - startIndex,
      startItem: startIndex + 1,
      endItem: endIndex
    };
  }

  /**
   * Generate page numbers for pagination controls
   * @param {number} currentPage - Current page number
   * @param {number} totalPages - Total number of pages
   * @param {number} maxVisible - Maximum visible page numbers
   * @returns {Array} Array of page numbers to display
   */
  static generatePageNumbers(currentPage, totalPages, maxVisible = 5) {
    if (totalPages <= maxVisible) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const halfVisible = Math.floor(maxVisible / 2);
    let startPage = Math.max(1, currentPage - halfVisible);
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);

    // Adjust if we're near the end
    if (endPage - startPage + 1 < maxVisible) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }

    const pages = [];
    
    // Add first page and ellipsis if needed
    if (startPage > 1) {
      pages.push(1);
      if (startPage > 2) {
        pages.push('...');
      }
    }

    // Add visible pages
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    // Add ellipsis and last page if needed
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        pages.push('...');
      }
      pages.push(totalPages);
    }

    return pages;
  }

  /**
   * Create Supabase query with pagination
   * @param {Object} baseQuery - Base Supabase query
   * @param {number} page - Page number (1-based)
   * @param {number} limit - Items per page
   * @returns {Object} Query with pagination applied
   */
  static applyPagination(baseQuery, page, limit) {
    const offset = (page - 1) * limit;
    return baseQuery.range(offset, offset + limit - 1);
  }

  /**
   * Get pagination parameters from URL or defaults
   * @param {URLSearchParams} searchParams - URL search parameters
   * @param {Object} defaults - Default pagination values
   * @returns {Object} Pagination parameters
   */
  static getPaginationParams(searchParams, defaults = {}) {
    const defaultPage = defaults.page || 1;
    const defaultLimit = defaults.limit || 10;
    const maxLimit = defaults.maxLimit || 100;

    const page = Math.max(1, parseInt(searchParams.get('page')) || defaultPage);
    const limit = Math.min(maxLimit, Math.max(1, parseInt(searchParams.get('limit')) || defaultLimit));

    return { page, limit };
  }

  /**
   * Create pagination URL parameters
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @param {Object} additionalParams - Additional URL parameters
   * @returns {string} URL search parameters string
   */
  static createPaginationParams(page, limit, additionalParams = {}) {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      ...additionalParams
    });
    return params.toString();
  }
}

/**
 * Pagination Hook for React Components
 */
export class PaginationHook {
  constructor(initialPage = 1, initialLimit = 10) {
    this.page = initialPage;
    this.limit = initialLimit;
    this.totalItems = 0;
    this.loading = false;
    this.data = [];
    this.metadata = null;
  }

  /**
   * Update pagination state
   */
  updatePagination(page, limit = this.limit) {
    this.page = page;
    this.limit = limit;
    return this.calculateMetadata();
  }

  /**
   * Calculate pagination metadata
   */
  calculateMetadata() {
    this.metadata = PaginationUtils.calculatePagination(
      this.totalItems,
      this.page,
      this.limit
    );
    return this.metadata;
  }

  /**
   * Go to next page
   */
  nextPage() {
    if (this.metadata && this.metadata.hasNextPage) {
      return this.updatePagination(this.page + 1);
    }
    return this.metadata;
  }

  /**
   * Go to previous page
   */
  previousPage() {
    if (this.metadata && this.metadata.hasPreviousPage) {
      return this.updatePagination(this.page - 1);
    }
    return this.metadata;
  }

  /**
   * Go to specific page
   */
  goToPage(page) {
    return this.updatePagination(page);
  }

  /**
   * Change items per page
   */
  changeLimit(limit) {
    // Adjust current page to maintain roughly the same position
    const currentStartItem = (this.page - 1) * this.limit + 1;
    const newPage = Math.ceil(currentStartItem / limit);
    return this.updatePagination(newPage, limit);
  }
}

/**
 * Default pagination configurations for different data types
 */
export const PAGINATION_CONFIGS = {
  vehicles: {
    defaultLimit: 12,
    maxLimit: 50,
    allowedLimits: [6, 12, 24, 48]
  },
  bookings: {
    defaultLimit: 15,
    maxLimit: 100,
    allowedLimits: [10, 15, 25, 50, 100]
  },
  rentals: {
    defaultLimit: 15,
    maxLimit: 100,
    allowedLimits: [10, 15, 25, 50, 100]
  },
  tours: {
    defaultLimit: 8,
    maxLimit: 32,
    allowedLimits: [4, 8, 16, 32]
  },
  customers: {
    defaultLimit: 20,
    maxLimit: 100,
    allowedLimits: [10, 20, 50, 100]
  },
  notifications: {
    defaultLimit: 10,
    maxLimit: 50,
    allowedLimits: [5, 10, 20, 50]
  }
};

/**
 * Pagination service for consistent pagination across the app
 */
export class PaginationService {
  /**
   * Create paginated query for Supabase
   * @param {Object} supabaseQuery - Supabase query object
   * @param {Object} paginationParams - Pagination parameters
   * @param {string} dataType - Type of data being paginated
   * @returns {Promise<Object>} Paginated result with metadata
   */
  static async executePaginatedQuery(supabaseQuery, paginationParams, dataType = 'default') {
    const config = PAGINATION_CONFIGS[dataType] || PAGINATION_CONFIGS.vehicles;
    const { page = 1, limit = config.defaultLimit } = paginationParams;
    
    // Ensure limit doesn't exceed maximum
    const actualLimit = Math.min(limit, config.maxLimit);
    
    try {
      // Get total count
      const { count, error: countError } = await supabaseQuery
        .select('*', { count: 'exact', head: true });
      
      if (countError) throw countError;
      
      // Get paginated data
      const paginatedQuery = PaginationUtils.applyPagination(
        supabaseQuery.select('*'),
        page,
        actualLimit
      );
      
      const { data, error: dataError } = await paginatedQuery;
      
      if (dataError) throw dataError;
      
      // Calculate pagination metadata
      const metadata = PaginationUtils.calculatePagination(count, page, actualLimit);
      
      return {
        data: data || [],
        pagination: metadata,
        success: true
      };
    } catch (error) {
      console.error('Paginated query failed:', error);
      return {
        data: [],
        pagination: PaginationUtils.calculatePagination(0, page, actualLimit),
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create search parameters for paginated API calls
   * @param {Object} filters - Filter parameters
   * @param {Object} pagination - Pagination parameters
   * @param {Object} sorting - Sorting parameters
   * @returns {Object} Combined parameters
   */
  static createQueryParams(filters = {}, pagination = {}, sorting = {}) {
    return {
      ...filters,
      page: pagination.page || 1,
      limit: pagination.limit || 10,
      sortBy: sorting.sortBy || 'created_at',
      sortOrder: sorting.sortOrder || 'desc'
    };
  }
}

export default PaginationUtils;