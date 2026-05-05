class CacheService {
  constructor(namespace = 'global') {
    this.namespace = namespace;
    this.cache = new Map();
    this.patterns = new Map();
  }

  normalizeKey(key) {
    return `${this.namespace}:${String(key)}`;
  }

  parseSetOptions(thirdArg = null, fourthArg = null) {
    if (typeof thirdArg === 'number') {
      return { ttl: thirdArg, pattern: typeof fourthArg === 'string' ? fourthArg : null };
    }

    if (typeof thirdArg === 'string') {
      return { ttl: null, pattern: thirdArg };
    }

    if (thirdArg && typeof thirdArg === 'object') {
      return {
        ttl: typeof thirdArg.ttl === 'number' ? thirdArg.ttl : null,
        pattern: typeof thirdArg.pattern === 'string' ? thirdArg.pattern : null,
      };
    }

    return { ttl: null, pattern: null };
  }

  set(key, value, thirdArg = null, fourthArg = null) {
    const normalizedKey = this.normalizeKey(key);
    const { ttl, pattern } = this.parseSetOptions(thirdArg, fourthArg);

    this.cache.set(normalizedKey, {
      key,
      value,
      timestamp: Date.now(),
      expiresAt: typeof ttl === 'number' ? Date.now() + ttl : null,
      pattern,
    });

    if (pattern) {
      if (!this.patterns.has(pattern)) {
        this.patterns.set(pattern, new Set());
      }
      this.patterns.get(pattern).add(normalizedKey);
    }

    return value;
  }

  get(key, maxAge = null) {
    const normalizedKey = this.normalizeKey(key);
    const entry = this.cache.get(normalizedKey);

    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (entry.expiresAt && now > entry.expiresAt) {
      this.delete(key);
      return null;
    }

    if (typeof maxAge === 'number' && now - entry.timestamp > maxAge) {
      this.delete(key);
      return null;
    }

    return entry.value;
  }

  has(key) {
    return this.get(key) !== null;
  }

  delete(key) {
    const normalizedKey = this.normalizeKey(key);
    const entry = this.cache.get(normalizedKey);

    if (entry?.pattern) {
      const patternSet = this.patterns.get(entry.pattern);
      if (patternSet) {
        patternSet.delete(normalizedKey);
        if (patternSet.size === 0) {
          this.patterns.delete(entry.pattern);
        }
      }
    }

    this.cache.delete(normalizedKey);
  }

  clearPattern(pattern) {
    if (!pattern) {
      return;
    }

    if (this.patterns.has(pattern)) {
      const keysToDelete = Array.from(this.patterns.get(pattern));
      keysToDelete.forEach((normalizedKey) => {
        const entry = this.cache.get(normalizedKey);
        if (entry) {
          this.delete(entry.key);
        }
      });
      this.patterns.delete(pattern);
      return;
    }

    for (const [normalizedKey, entry] of this.cache.entries()) {
      if (entry.pattern === pattern || String(entry.key).includes(pattern)) {
        this.delete(entry.key);
      }
    }
  }

  invalidateRelated(prefix) {
    this.clearPattern(prefix);
  }

  clear() {
    this.cache.clear();
    this.patterns.clear();
  }

  cleanExpired(maxAge = 60 * 60 * 1000) {
    const now = Date.now();
    for (const [, entry] of this.cache.entries()) {
      const expiredByTtl = entry.expiresAt && now > entry.expiresAt;
      const expiredByAge = now - entry.timestamp > maxAge;
      if (expiredByTtl || expiredByAge) {
        this.delete(entry.key);
      }
    }
  }

  generateCacheKey(domain, action, params = {}) {
    const stableParams = Object.keys(params)
      .sort()
      .reduce((acc, key) => {
        acc[key] = params[key];
        return acc;
      }, {});

    return `${domain}:${action}:${JSON.stringify(stableParams)}`;
  }

  getStats() {
    return {
      namespace: this.namespace,
      totalEntries: this.cache.size,
      totalPatterns: this.patterns.size,
      patterns: Array.from(this.patterns.keys()),
    };
  }

  getHealthReport() {
    const stats = this.getStats();
    return {
      ...stats,
      status: stats.totalEntries > 0 ? 'active' : 'idle',
      memoryPressure: stats.totalEntries > 500 ? 'high' : stats.totalEntries > 100 ? 'medium' : 'low',
    };
  }
}

const cacheService = new CacheService();

export { CacheService };
export default cacheService;
