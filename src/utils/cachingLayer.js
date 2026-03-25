/**
 * cachingLayer.js
 * Provides caching capabilities for API and database requests
 */

class CachingLayer {
  constructor() {
    this.cache = new Map();
    this.pendingRequests = new Map();
    this.defaultTTL = 30000; // 30 seconds default TTL
    
    // Configuration for different entity types
    this.entityConfig = {
      settings: { ttl: 300000 }, // 5 minutes for settings
      tours: { ttl: 60000 }, // 1 minute for tours
      bookings: { ttl: 30000 }, // 30 seconds for bookings
      users: { ttl: 300000 }, // 5 minutes for users
      static: { ttl: 600000 }, // 10 minutes for static content
    };
    
    // Performance metrics
    this.metrics = {
      hits: 0,
      misses: 0,
      errors: 0
    };
  }
  
  /**
   * Get the TTL for a specific entity type
   */
  getTTL(entityType) {
    return (this.entityConfig[entityType]?.ttl) || this.defaultTTL;
  }
  
  /**
   * Generate a cache key from query parameters
   */
  generateCacheKey(entityType, queryParams) {
    const normalizedParams = queryParams ? JSON.stringify(queryParams) : '';
    return `${entityType}_${normalizedParams}`;
  }
  
  /**
   * Check if a request result is cached and still valid
   */
  isInCache(key) {
    if (!this.cache.has(key)) return false;
    
    const { timestamp, ttl } = this.cache.get(key);
    const now = Date.now();
    const isValid = (now - timestamp) < ttl;
    
    if (!isValid) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }
  
  /**
   * Get cached request result
   */
  getCachedResult(key) {
    if (!this.isInCache(key)) {
      this.metrics.misses++;
      return null;
    }
    
    this.metrics.hits++;
    const { data } = this.cache.get(key);
    return data;
  }
  
  /**
   * Set request result in cache
   */
  setCachedResult(key, data, entityType) {
    const ttl = this.getTTL(entityType);
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }
  
  /**
   * Execute a request with caching
   * @param {string} entityType - Type of entity (tours, bookings, settings, etc.)
   * @param {Function} requestFn - Function that executes the actual request
   * @param {Object} params - Parameters for the request (optional)
   * @param {Object} options - Additional options
   * @returns {Promise<any>} - Result of the request
   */
  async executeRequest(entityType, requestFn, params = null, options = {}) {
    const { 
      forceFresh = false,
      ttl = null
    } = options;
    
    const cacheKey = this.generateCacheKey(entityType, params);
    
    // Check if there's already a pending request
    if (this.pendingRequests.has(cacheKey)) {
      return this.pendingRequests.get(cacheKey);
    }
    
    // Return cached result if available and not forcing fresh data
    if (!forceFresh && this.isInCache(cacheKey)) {
      return this.getCachedResult(cacheKey);
    }
    
    // Create a promise for this request and store it
    const requestPromise = (async () => {
      try {
        const result = await requestFn();
        
        // Only cache successful results
        if (result && !result.error && result.data !== undefined) {
          this.setCachedResult(cacheKey, result, entityType);
        } else {
          this.metrics.errors++;
        }
        
        return result;
      } catch (error) {
        this.metrics.errors++;
        throw error;
      } finally {
        // Clean up the pending request when done
        this.pendingRequests.delete(cacheKey);
      }
    })();
    
    // Store the promise so concurrent requests can reuse it
    this.pendingRequests.set(cacheKey, requestPromise);
    
    return requestPromise;
  }
  
  /**
   * Invalidate cache for a specific entity type
   */
  invalidateCache(entityType, params = null) {
    if (params) {
      // Invalidate specific request
      const cacheKey = this.generateCacheKey(entityType, params);
      this.cache.delete(cacheKey);
    } else {
      // Invalidate all requests for this entity type
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${entityType}_`)) {
          this.cache.delete(key);
        }
      }
    }
  }
  
  /**
   * Prefetch data that might be needed soon
   */
  async prefetch(entityType, requestFn, params = null) {
    const cacheKey = this.generateCacheKey(entityType, params);
    
    // Only prefetch if not already in cache or pending
    if (!this.isInCache(cacheKey) && !this.pendingRequests.has(cacheKey)) {
      // Lower priority - use a small timeout
      setTimeout(async () => {
        try {
          const result = await requestFn();
          if (result && !result.error && result.data !== undefined) {
            this.setCachedResult(cacheKey, result, entityType);
          }
        } catch (error) {
          console.debug(`Prefetch error for ${cacheKey}:`, error);
        }
      }, 100);
    }
  }
  
  /**
   * Get cache metrics
   */
  getMetrics() {
    const total = this.metrics.hits + this.metrics.misses;
    const hitRate = total > 0 ? (this.metrics.hits / total) * 100 : 0;
    
    return {
      ...this.metrics,
      total,
      hitRate: hitRate.toFixed(2) + '%',
      cacheSize: this.cache.size
    };
  }
  
  /**
   * Clear the entire cache
   */
  clearCache() {
    this.cache.clear();
  }
}

// Create a singleton instance
const cachingLayer = new CachingLayer();

export default cachingLayer;