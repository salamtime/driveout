/**
 * Simple Cache Service for managing application cache
 * FIXED: Proper clearPattern implementation
 */
class CacheService {
  constructor() {
    this.cache = new Map();
    this.patterns = new Map();
  }

  /**
   * Set a cache entry with optional pattern tracking
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {string} pattern - Optional pattern for bulk clearing
   */
  set(key, value, pattern = null) {
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      pattern
    });

    // Track patterns for bulk clearing
    if (pattern) {
      if (!this.patterns.has(pattern)) {
        this.patterns.set(pattern, new Set());
      }
      this.patterns.get(pattern).add(key);
    }
  }

  /**
   * Get a cache entry
   * @param {string} key - Cache key
   * @returns {any} Cached value or null
   */
  get(key) {
    const entry = this.cache.get(key);
    return entry ? entry.value : null;
  }

  /**
   * Check if a key exists in cache
   * @param {string} key - Cache key
   * @returns {boolean}
   */
  has(key) {
    return this.cache.has(key);
  }

  /**
   * Remove a specific cache entry
   * @param {string} key - Cache key
   */
  delete(key) {
    const entry = this.cache.get(key);
    if (entry && entry.pattern) {
      const patternSet = this.patterns.get(entry.pattern);
      if (patternSet) {
        patternSet.delete(key);
        if (patternSet.size === 0) {
          this.patterns.delete(entry.pattern);
        }
      }
    }
    this.cache.delete(key);
  }

  /**
   * Clear all cache entries matching a pattern
   * FIXED: Proper implementation that actually works
   * @param {string} pattern - Pattern to match
   */
  clearPattern(pattern) {
    try {
      console.log(`🧹 Clearing cache pattern: ${pattern}`);
      
      if (!pattern) {
        console.warn('⚠️ No pattern provided to clearPattern');
        return;
      }

      // Method 1: Clear by tracked pattern
      if (this.patterns.has(pattern)) {
        const keysToDelete = Array.from(this.patterns.get(pattern));
        keysToDelete.forEach(key => {
          this.cache.delete(key);
        });
        this.patterns.delete(pattern);
        console.log(`✅ Cleared ${keysToDelete.length} entries for pattern: ${pattern}`);
        return;
      }

      // Method 2: Clear by pattern matching (fallback)
      const keysToDelete = [];
      for (const [key, entry] of this.cache.entries()) {
        // Match by stored pattern or key pattern
        if (entry.pattern === pattern || key.includes(pattern)) {
          keysToDelete.push(key);
        }
      }

      keysToDelete.forEach(key => this.delete(key));
      console.log(`✅ Cleared ${keysToDelete.length} entries matching pattern: ${pattern}`);
      
    } catch (error) {
      console.error(`❌ Error clearing cache pattern ${pattern}:`, error);
      // Don't throw - cache clearing should be non-blocking
    }
  }

  /**
   * Clear all cache entries
   */
  clear() {
    try {
      console.log('🧹 Clearing all cache entries');
      this.cache.clear();
      this.patterns.clear();
      console.log('✅ All cache cleared');
    } catch (error) {
      console.error('❌ Error clearing all cache:', error);
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getStats() {
    return {
      totalEntries: this.cache.size,
      totalPatterns: this.patterns.size,
      patterns: Array.from(this.patterns.keys())
    };
  }

  /**
   * Clean expired entries (if TTL is implemented later)
   * @param {number} maxAge - Maximum age in milliseconds
   */
  cleanExpired(maxAge = 3600000) { // 1 hour default
    try {
      const now = Date.now();
      const keysToDelete = [];
      
      for (const [key, entry] of this.cache.entries()) {
        if (now - entry.timestamp > maxAge) {
          keysToDelete.push(key);
        }
      }
      
      keysToDelete.forEach(key => this.delete(key));
      
      if (keysToDelete.length > 0) {
        console.log(`🧹 Cleaned ${keysToDelete.length} expired cache entries`);
      }
    } catch (error) {
      console.error('❌ Error cleaning expired cache:', error);
    }
  }
}

// Export singleton instance
export default new CacheService();