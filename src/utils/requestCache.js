export const createTimedRequestCache = (defaultTtlMs = 30000) => {
  const valueCache = new Map();
  const inflightCache = new Map();

  const get = async (key, loader, options = {}) => {
    const { forceRefresh = false, ttl = defaultTtlMs } = options;
    const normalizedKey = String(key || '').trim();

    if (!normalizedKey) {
      return loader();
    }

    const now = Date.now();
    const cached = valueCache.get(normalizedKey);
    if (!forceRefresh && cached && cached.expiresAt > now) {
      return cached.value;
    }

    if (!forceRefresh && inflightCache.has(normalizedKey)) {
      return inflightCache.get(normalizedKey);
    }

    const request = Promise.resolve()
      .then(loader)
      .then((value) => {
        valueCache.set(normalizedKey, {
          value,
          expiresAt: Date.now() + Math.max(0, Number(ttl || 0)),
        });
        inflightCache.delete(normalizedKey);
        return value;
      })
      .catch((error) => {
        inflightCache.delete(normalizedKey);
        throw error;
      });

    inflightCache.set(normalizedKey, request);
    return request;
  };

  const invalidate = (matcher) => {
    if (typeof matcher === 'function') {
      [...valueCache.keys()].forEach((key) => {
        if (matcher(key)) valueCache.delete(key);
      });
      [...inflightCache.keys()].forEach((key) => {
        if (matcher(key)) inflightCache.delete(key);
      });
      return;
    }

    const normalizedKey = String(matcher || '').trim();
    if (!normalizedKey) return;
    valueCache.delete(normalizedKey);
    inflightCache.delete(normalizedKey);
  };

  const clear = () => {
    valueCache.clear();
    inflightCache.clear();
  };

  return {
    get,
    invalidate,
    clear,
  };
};
