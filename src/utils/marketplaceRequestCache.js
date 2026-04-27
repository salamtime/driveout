const MARKETPLACE_REQUEST_CACHE_KEY = 'saharax_marketplace_requested_listings';

const normalizeUserId = (userId) => String(userId || '').trim();
const normalizeListingId = (listingId) => String(listingId || '').trim();

const buildCacheKey = (userId) => normalizeUserId(userId) || 'guest';

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

  const cache = readCache();
  const userKey = buildCacheKey(userId);
  const currentUserCache = cache[userKey] && typeof cache[userKey] === 'object' ? cache[userKey] : {};

  cache[userKey] = {
    ...currentUserCache,
    [normalizedListingId]: {
      listingId: normalizedListingId,
      requestId: String(requestId || '').trim(),
      status: String(status || 'requested').trim() || 'requested',
      savedAt: new Date().toISOString(),
    },
  };

  writeCache(cache);
};

export const getCachedMarketplaceRequest = ({ userId, listingId }) => {
  const normalizedListingId = normalizeListingId(listingId);
  if (!normalizedListingId) return null;

  const cache = readCache();
  const userKey = buildCacheKey(userId);
  return cache?.[userKey]?.[normalizedListingId] || null;
};

export const getCachedMarketplaceRequestForUsers = ({ userIds = [], listingId }) => {
  const normalizedListingId = normalizeListingId(listingId);
  if (!normalizedListingId) return null;

  const cache = readCache();
  const identities = Array.isArray(userIds) ? userIds : [userIds];

  for (const identity of identities) {
    const userKey = buildCacheKey(identity);
    const match = cache?.[userKey]?.[normalizedListingId] || null;
    if (match) return match;
  }

  return null;
};
