const QUERY_CACHE_PREFIX = 'shared-query-cache:';

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
  keys() {
    if (typeof window === 'undefined') return [];
    try {
      return Object.keys(window.sessionStorage);
    } catch (_error) {
      return [];
    }
  },
};

class SharedQueryCacheService {
  constructor() {
    this.memoryCache = new Map();
    this.inFlight = new Map();
  }

  buildKey(namespace, params = {}) {
    return `${namespace}:${JSON.stringify(params)}`;
  }

  buildStorageKey(key) {
    return `${QUERY_CACHE_PREFIX}${key}`;
  }

  getEntry(key) {
    const inMemory = this.memoryCache.get(key);
    if (inMemory) {
      return inMemory;
    }

    const raw = safeSessionStorage.get(this.buildStorageKey(key));
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw);
      if (!parsed?.cachedAt) {
        return null;
      }
      this.memoryCache.set(key, parsed);
      return parsed;
    } catch (_error) {
      return null;
    }
  }

  setEntry(key, data) {
    const payload = {
      cachedAt: Date.now(),
      data,
    };

    this.memoryCache.set(key, payload);
    safeSessionStorage.set(this.buildStorageKey(key), JSON.stringify(payload));
    return data;
  }

  async fetchQuery(namespace, params, fetcher, options = {}) {
    const {
      ttlMs = 60 * 1000,
      staleWhileRevalidate = true,
      maxStaleMs = ttlMs * 3,
    } = options;

    const key = this.buildKey(namespace, params);
    const entry = this.getEntry(key);
    const entryAgeMs = entry ? Date.now() - entry.cachedAt : Number.POSITIVE_INFINITY;

    if (entry && entryAgeMs < ttlMs) {
      return entry.data;
    }

    if (this.inFlight.has(key)) {
      return this.inFlight.get(key);
    }

    const requestPromise = (async () => {
      try {
        const data = await fetcher();
        return this.setEntry(key, data);
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, requestPromise);

    if (entry && staleWhileRevalidate && entryAgeMs < maxStaleMs) {
      requestPromise.catch(() => null);
      return entry.data;
    }

    return requestPromise;
  }

  invalidateNamespace(namespace) {
    const prefix = `${namespace}:`;

    [...this.memoryCache.keys()].forEach((key) => {
      if (key.startsWith(prefix)) {
        this.memoryCache.delete(key);
      }
    });

    [...this.inFlight.keys()].forEach((key) => {
      if (key.startsWith(prefix)) {
        this.inFlight.delete(key);
      }
    });

    safeSessionStorage.keys().forEach((storageKey) => {
      if (storageKey.startsWith(QUERY_CACHE_PREFIX + prefix)) {
        safeSessionStorage.remove(storageKey);
      }
    });
  }
}

const sharedQueryCacheService = new SharedQueryCacheService();
export default sharedQueryCacheService;
