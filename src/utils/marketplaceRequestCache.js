const MARKETPLACE_REQUEST_CACHE_KEY = 'saharax_marketplace_requested_listings';
const MARKETPLACE_REQUEST_CACHE_TTL_MS = 10 * 60 * 1000;
const TERMINAL_MARKETPLACE_REQUEST_STATUSES = new Set([
  'completed',
  'expired',
  'declined',
  'rejected',
  'cancelled',
  'canceled',
]);

const normalizeUserId = (userId) => String(userId || '').trim();
const normalizeListingId = (listingId) => String(listingId || '').trim();
const normalizeStatus = (status) =>
  String(status || '')
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]+/g, '')
    .replace(/\s+/g, '_');

const buildCacheKey = (userId) => normalizeUserId(userId) || 'guest';

const isCacheEntryUsable = (entry) => {
  if (!entry || typeof entry !== 'object') return false;
  if (TERMINAL_MARKETPLACE_REQUEST_STATUSES.has(normalizeStatus(entry.status))) return false;

  const savedAtMs = entry.savedAt ? new Date(entry.savedAt).getTime() : 0;
  if (!savedAtMs) return false;

  return Date.now() - savedAtMs <= MARKETPLACE_REQUEST_CACHE_TTL_MS;
};

const pruneCache = (cache) => {
  let changed = false;
  const nextCache = cache && typeof cache === 'object' ? { ...cache } : {};

  Object.entries(nextCache).forEach(([userKey, userCache]) => {
    if (!userCache || typeof userCache !== 'object') {
      delete nextCache[userKey];
      changed = true;
      return;
    }

    const nextUserCache = { ...userCache };
    Object.entries(nextUserCache).forEach(([listingKey, entry]) => {
      if (!isCacheEntryUsable(entry)) {
        delete nextUserCache[listingKey];
        changed = true;
      }
    });

    if (Object.keys(nextUserCache).length === 0) {
      delete nextCache[userKey];
      changed = true;
    } else if (nextUserCache !== userCache) {
      nextCache[userKey] = nextUserCache;
    }
  });

  return { cache: nextCache, changed };
};

const readCache = () => {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(MARKETPLACE_REQUEST_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeCache = (nextValue) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(MARKETPLACE_REQUEST_CACHE_KEY, JSON.stringify(nextValue || {}));
  } catch {
    // ignore localStorage failures
  }
};

export const markMarketplaceListingRequested = ({ userId, listingId, requestId = '', status = 'requested' }) => {
  const normalizedListingId = normalizeListingId(listingId);
  if (!normalizedListingId) return;

  const { cache } = pruneCache(readCache());
  const userKey = buildCacheKey(userId);
  const currentUserCache = cache[userKey] && typeof cache[userKey] === 'object' ? cache[userKey] : {};
  const normalizedStatus = normalizeStatus(status) || 'requested';

  if (TERMINAL_MARKETPLACE_REQUEST_STATUSES.has(normalizedStatus)) {
    const nextUserCache = { ...currentUserCache };
    delete nextUserCache[normalizedListingId];

    if (Object.keys(nextUserCache).length === 0) {
      delete cache[userKey];
    } else {
      cache[userKey] = nextUserCache;
    }

    writeCache(cache);
    return;
  }

  cache[userKey] = {
    ...currentUserCache,
    [normalizedListingId]: {
      listingId: normalizedListingId,
      requestId: String(requestId || '').trim(),
      status: normalizedStatus,
      savedAt: new Date().toISOString(),
    },
  };

  writeCache(cache);
};

export const getCachedMarketplaceRequest = ({ userId, listingId }) => {
  const normalizedListingId = normalizeListingId(listingId);
  if (!normalizedListingId) return null;

  const { cache, changed } = pruneCache(readCache());
  if (changed) writeCache(cache);

  const userKey = buildCacheKey(userId);
  return cache?.[userKey]?.[normalizedListingId] || null;
};

export const getCachedMarketplaceRequestForUsers = ({ userIds = [], listingId }) => {
  const normalizedListingId = normalizeListingId(listingId);
  if (!normalizedListingId) return null;

  const { cache, changed } = pruneCache(readCache());
  if (changed) writeCache(cache);

  const identities = Array.isArray(userIds) ? userIds : [userIds];

  for (const identity of identities) {
    const userKey = buildCacheKey(identity);
    const match = cache?.[userKey]?.[normalizedListingId] || null;
    if (match) return match;
  }

  return null;
};
