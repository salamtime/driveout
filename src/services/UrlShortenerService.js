import { supabase } from '../lib/supabase.js';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const CACHE_PREFIX = 'url_short_';
const CACHE_DURATION = 60 * 60 * 1000;
const DOCUMENT_TYPES = new Set([
  'contract',
  'receipt',
  'opening_video',
  'closing_video',
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

  if (!isPdf) {
    const cached = getCached(url, normalizedDocumentType);
    if (cached) return cached;
  }

  try {
    if (!isPdf && normalizedRentalId) {
      const { data } = await supabase
        .from('url_shortener')
        .select('short_code')
        .eq('rental_id', normalizedRentalId)
        .eq('document_type', normalizedDocumentType)
        .eq('original_url', url)
        .maybeSingle();
      if (data?.short_code) {
        const shortUrl = window.location.origin + '/s/' + data.short_code;
        setCache(url, shortUrl, normalizedDocumentType);
        return shortUrl;
      }
    }

    let code = generateCode();
    for (let i = 0; i < 10; i++) {
      const { data } = await supabase
        .from('url_shortener')
        .select('id')
        .eq('short_code', code)
        .maybeSingle();
      if (!data) break;
      code = generateCode();
    }

    const expires = new Date();
    expires.setDate(expires.getDate() + 30);

    const { data, error } = await supabase
      .from('url_shortener')
      .insert({
        original_url: url,
        short_code: code,
        rental_id: normalizedRentalId || null,
        document_type: normalizedDocumentType,
        expires_at: expires.toISOString(),
        click_count: 0
      })
      .select('short_code')
      .single();

    if (error) throw error;

    const shortUrl = window.location.origin + '/s/' + data.short_code;
    if (!isPdf) setCache(url, shortUrl, normalizedDocumentType);
    return shortUrl;

  } catch (err) {
    console.error('URL shortening failed:', err);
    return url;
  }
};

export const resolveShortCode = async (shortCode) => {
  try {
    const { data, error } = await supabase
      .from('url_shortener')
      .select('original_url, expires_at')
      .eq('short_code', shortCode)
      .maybeSingle();
    if (error || !data) return null;
    supabase.from('url_shortener')
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
      .from('url_shortener')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select('id');
    return data ? data.length : 0;
  } catch {
    return 0;
  }
};

export default { shortenUrl, resolveShortCode, cleanupExpiredUrls };
