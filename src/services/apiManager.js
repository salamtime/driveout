/**
 * API Manager - Request queuing, caching, and deduplication
 * Ensures minimum delay between API calls, caches responses,
 * and prevents duplicate identical requests.
 */

const RENTAL_DEBUG = false;

class ApiManager {
  constructor() {
    this.cache = new Map();
    this.pendingRequests = new Map();
    this.lastRequestTime = 0;
    this.minDelay = 1000; // Minimum 1 second between API calls
    this.defaultTTL = 30000; // Cache TTL: 30 seconds
  }

  /**
   * Execute a request with caching and deduplication.
   * @param {string} cacheKey - Unique key for this request
   * @param {Function} fetchFn - Async function that performs the actual fetch
   * @param {object} options - Optional settings
   * @param {number} options.ttl - Cache time-to-live in ms (default: 30000)
   * @returns {Promise<any>} - The cached or fresh data
   */
  async request(cacheKey, fetchFn, options = {}) {
    const ttl = options.ttl || this.defaultTTL;

    // 1. Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < ttl) {
      if (RENTAL_DEBUG) console.log(`📦 Cache HIT for: ${cacheKey}`);
      return cached.data;
    }

    // 2. Check if there's already a pending request for this key (deduplication)
    if (this.pendingRequests.has(cacheKey)) {
      if (RENTAL_DEBUG) console.log(`⏳ Dedup: waiting for pending request: ${cacheKey}`);
      return this.pendingRequests.get(cacheKey);
    }

    // 3. Enforce minimum delay between requests
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minDelay) {
      const waitTime = this.minDelay - timeSinceLastRequest;
      if (RENTAL_DEBUG) console.log(`⏳ Queuing request, waiting ${waitTime}ms: ${cacheKey}`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    // 4. Execute the request
    const promise = (async () => {
      try {
        this.lastRequestTime = Date.now();
        if (RENTAL_DEBUG) console.log(`🔄 Fetching: ${cacheKey}`);
        const data = await fetchFn();

        // Store in cache
        this.cache.set(cacheKey, {
          data,
          timestamp: Date.now()
        });

        return data;
      } finally {
        // Remove from pending regardless of success/failure
        this.pendingRequests.delete(cacheKey);
      }
    })();

    // Store as pending for deduplication
    this.pendingRequests.set(cacheKey, promise);

    return promise;
  }

  /**
   * Invalidate a specific cache entry
   * @param {string} cacheKey - The key to invalidate
   */
  invalidate(cacheKey) {
    this.cache.delete(cacheKey);
    if (RENTAL_DEBUG) console.log(`🗑️ Cache invalidated: ${cacheKey}`);
  }

  /**
   * Invalidate all cache entries matching a prefix
   * @param {string} prefix - The prefix to match
   */
  invalidateByPrefix(prefix) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
    if (RENTAL_DEBUG) console.log(`🗑️ Cache invalidated by prefix: ${prefix}`);
  }

  /**
   * Clear all cache entries
   */
  clearAll() {
    this.cache.clear();
    if (RENTAL_DEBUG) console.log('🗑️ All cache cleared');
  }
}

export const apiManager = new ApiManager();
export default apiManager;