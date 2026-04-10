const MODULE_CACHE_PREFIX = 'critical-module-cache:';

const safeSessionStorage = {
  get(key) {
    if (typeof window === 'undefined') return null;
    try {
      return window.sessionStorage.getItem(key);
    } catch (_error) {
      return null;
    }
  },
  set(key, value) {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(key, value);
    } catch (_error) {
      // Ignore storage failures
    }
  },
  remove(key) {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.removeItem(key);
    } catch (_error) {
      // Ignore storage failures
    }
  },
};

class CriticalModuleCacheService {
  constructor() {
    this.memoryCache = new Map();
  }

  buildKey(moduleName) {
    return `${MODULE_CACHE_PREFIX}${moduleName}`;
  }

  get(moduleName, maxAgeMs = 60 * 1000) {
    const inMemory = this.memoryCache.get(moduleName);
    if (inMemory && Date.now() - inMemory.cachedAt < maxAgeMs) {
      return inMemory.data;
    }

    const raw = safeSessionStorage.get(this.buildKey(moduleName));
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);
      if (!parsed?.cachedAt || Date.now() - parsed.cachedAt > maxAgeMs) {
        return null;
      }

      this.memoryCache.set(moduleName, parsed);
      return parsed.data;
    } catch (_error) {
      return null;
    }
  }

  set(moduleName, data) {
    const payload = {
      cachedAt: Date.now(),
      data,
    };

    this.memoryCache.set(moduleName, payload);
    safeSessionStorage.set(this.buildKey(moduleName), JSON.stringify(payload));
  }

  clear(moduleName) {
    this.memoryCache.delete(moduleName);
    safeSessionStorage.remove(this.buildKey(moduleName));
  }
}

const criticalModuleCacheService = new CriticalModuleCacheService();
export default criticalModuleCacheService;
