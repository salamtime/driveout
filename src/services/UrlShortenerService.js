import { supabase } from '../lib/supabase.js';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const CACHE_PREFIX = 'url_short_';
const CACHE_DURATION = 60 * 60 * 1000;
const SHORT_LINKS_TABLE = import.meta.env.VITE_SHORT_LINKS_TABLE || 'short_links';
const DOCUMENT_TYPES = new Set([
  'contract',
  'receipt',
  'documents',
  'opening_video',
  'closing_video',
  'banking-info',
  'tour_tracking',
  'other',
]);

const generateCode = () =>
  Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');

const getCached = (url, type) => {
  try {
    const key = CACHE_PREFIX + type + '_' + btoa(url).substring(0, 30);
    const item = localStorage.getItem(key);
    if (item) {
      const { shortUrl, ts } = JSON.parse(item);
      if (Date.now() - ts < CACHE_DURATION) return shortUrl;
      localStorage.removeItem(key);
    }
  } catch {}
  return null;
};

const setCache = (url, shortUrl, type) => {
  try {
    const key = CACHE_PREFIX + type + '_' + btoa(url).substring(0, 30);
    localStorage.setItem(key, JSON.stringify({ shortUrl, ts: Date.now() }));
  } catch {}
};

const normalizeShortenArgs = (rentalId, documentType) => {
  if (
    typeof rentalId === 'string' &&
    DOCUMENT_TYPES.has(rentalId) &&
    (!documentType || documentType === 'other')
  ) {
    return { rentalId: null, documentType: rentalId };
  }

  return {
    rentalId,
    documentType: documentType || 'other',
  };
};

export const shortenUrl = async (url, rentalId = null, documentType = 'other') => {
  const normalizedArgs = normalizeShortenArgs(rentalId, documentType);
  const normalizedRentalId = normalizedArgs.rentalId;
  const normalizedDocumentType = normalizedArgs.documentType;
  const isPdf = ['contract', 'receipt'].includes(normalizedDocumentType);
  const isLocalhost =
    typeof window !== 'undefined' &&
    ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const isTargetLocalhost = (() => {
    try {
      const parsed = new URL(url);
      return ['localhost', '127.0.0.1'].includes(parsed.hostname);
    } catch {
      return false;
    }
  })();

  // Local dev commonly runs without the short_links table/server envs.
  // Only bypass shortening for true localhost targets.
  // Public/canonical URLs should still be shortened even during local testing.
  if (isLocalhost && isTargetLocalhost) {
    return url;
  }

  if (!isPdf) {
    const cached = getCached(url, normalizedDocumentType);
    if (cached) return cached;
  }

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    const response = await fetch('/api/public-links?resource=short-links&action=create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        originalUrl: url,
        rentalId: normalizedRentalId,
        documentType: normalizedDocumentType,
      }),
    });

    const body = await response.json().catch(() => ({}));
    if (response.ok && body?.shortUrl) {
      if (!isPdf) setCache(url, body.shortUrl, normalizedDocumentType);
      return body.shortUrl;
    }
  } catch (err) {
    console.warn('Server shortener failed, trying direct fallback:', err);
  }

  return url;
};

export const resolveShortCode = async (shortCode) => {
  try {
    const { data, error } = await supabase
      .from(SHORT_LINKS_TABLE)
      .select('original_url, expires_at')
      .eq('short_code', shortCode)
      .maybeSingle();
    if (error || !data) return null;
    supabase.from(SHORT_LINKS_TABLE)
      .update({ last_accessed_at: new Date().toISOString() })
      .eq('short_code', shortCode)
      .then(() => {});
    return { url: data.original_url, expired: new Date(data.expires_at) < new Date() };
  } catch {
    return null;
  }
};

export const cleanupExpiredUrls = async () => {
  try {
    const { data } = await supabase
      .from(SHORT_LINKS_TABLE)
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select('id');
    return data ? data.length : 0;
  } catch {
    return 0;
  }
};

export default { shortenUrl, resolveShortCode, cleanupExpiredUrls };
