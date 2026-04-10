import { createSupabaseClients } from './supabase.js';
import {
  buildAppOrigin,
  buildVehicleShareCopy,
  fetchPublicVehicleShareData,
} from './publicVehicleShare.js';
import {
  DEFAULT_STOREFRONT_TENANT_SLUG,
  DRIVEOUT_BASE_DOMAIN,
} from '../../src/utils/storefrontHost.js';
import { renderVehicleShareHtml } from './shareVehicleHandler.js';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const SHORT_LINKS_TABLE = process.env.SHORT_LINKS_TABLE || 'short_links';

const json = (res, status, body) => res.status(status).json(body);

const parseShareVehicleUrl = (value) => {
  try {
    const parsed = new URL(value);
    const match = parsed.pathname.match(/^\/share\/rent\/([^/]+)$/i);
    if (!match) return null;

    const listingId = decodeURIComponent(match[1] || '').trim();
    if (!listingId) return null;

    const lang = String(parsed.searchParams.get('lang') || 'en').trim().toLowerCase() === 'fr' ? 'fr' : 'en';
    const query = {};
    parsed.searchParams.forEach((queryValue, key) => {
      query[key] = queryValue;
    });

    return {
      origin: parsed.origin,
      listingId,
      lang,
      query,
      targetUrl: value,
    };
  } catch {
    return null;
  }
};

const getAllowedOrigins = (req) => {
  const requestOrigin = req.headers.origin || `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host || ''}`;
  const origins = new Set();

  const pushOrigin = (value) => {
    try {
      if (!value) return;
      origins.add(new URL(value).origin);
    } catch {}
  };

  pushOrigin(requestOrigin);
  pushOrigin(process.env.SUPABASE_URL);
  pushOrigin(process.env.VITE_SUPABASE_URL);
  pushOrigin(process.env.VITE_PUBLIC_APP_URL);
  pushOrigin(process.env.VITE_APP_URL);
  pushOrigin(`https://${DEFAULT_STOREFRONT_TENANT_SLUG}.${DRIVEOUT_BASE_DOMAIN}`);
  pushOrigin('https://www.saharax.co');
  pushOrigin('https://rental-system-frontend.vercel.app');

  return { requestOrigin, origins };
};

const isAllowedOriginalUrl = (value, origins) => {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) && origins.has(parsed.origin);
  } catch {
    return false;
  }
};

const generateCode = () =>
  Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');

const isCrawlerRequest = (req) => {
  const userAgent = String(req.headers['user-agent'] || '').toLowerCase();
  if (!userAgent) return false;

  return [
    'telegrambot',
    'twitterbot',
    'whatsapp',
    'facebookexternalhit',
    'facebot',
    'linkedinbot',
    'slackbot',
    'discordbot',
    'googlebot',
    'bingbot',
    'embedly',
    'quora link preview',
    'pinterest',
    'vkshare',
    'skypeuripreview',
    'crawler',
    'spider',
    'bot',
  ].some((token) => userAgent.includes(token));
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const action = String(req.query?.action || '').trim().toLowerCase();
  const code = String(req.query?.code || '').trim();

  try {
    const { adminClient } = createSupabaseClients();

    if (req.method === 'GET' && code) {
      const { data, error } = await adminClient
        .from(SHORT_LINKS_TABLE)
        .select('original_url, expires_at, click_count')
        .eq('short_code', code)
        .maybeSingle();

      if (error) {
        return json(res, 500, { error: error.message || 'Failed to load short link' });
      }

      if (!data) {
        return json(res, 404, { error: 'URL not found or has been deleted' });
      }

      const isExpired = data.expires_at ? new Date(data.expires_at) < new Date() : false;
      if (isExpired) {
        return json(res, 410, { error: 'This link has expired' });
      }

      adminClient
        .from(SHORT_LINKS_TABLE)
        .update({
          click_count: Number(data.click_count || 0) + 1,
          last_accessed_at: new Date().toISOString(),
        })
        .eq('short_code', code)
        .then(() => {});

      const wantsHtml =
        String(req.query?.mode || '').trim().toLowerCase() === 'redirect' ||
        String(req.headers.accept || '').includes('text/html');
      const crawlerRequest = isCrawlerRequest(req);

      if (wantsHtml && crawlerRequest) {
        const shareVehicle = parseShareVehicleUrl(data.original_url);

        if (shareVehicle) {
          const vehicle = await fetchPublicVehicleShareData(shareVehicle.listingId, shareVehicle.lang);
          const copy = buildVehicleShareCopy(vehicle, shareVehicle.lang);
          const shareOrigin = shareVehicle.origin || buildAppOrigin(req);
          const shareUrl = `${shareOrigin}/s/${encodeURIComponent(code)}`;
          const imageUrl = `${shareOrigin}/api/public-links?resource=share-vehicle&mode=image&listingId=${encodeURIComponent(shareVehicle.listingId)}&lang=${encodeURIComponent(shareVehicle.lang)}&shortCode=${encodeURIComponent(code)}`;

          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=86400');
          res.end(renderVehicleShareHtml(shareVehicle.lang, copy, vehicle, shareUrl, imageUrl, data.original_url));
          return;
        }

        res.statusCode = 302;
        res.setHeader('Location', data.original_url);
        res.end();
        return;
      }

      if (wantsHtml) {
        res.statusCode = 302;
        res.setHeader('Location', data.original_url);
        res.end();
        return;
      }

      return json(res, 200, { url: data.original_url });
    }

    if (req.method === 'POST' && action === 'create') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const originalUrl = String(body.originalUrl || '').trim();
      const rentalId = body.rentalId ? String(body.rentalId) : null;
      const documentType = String(body.documentType || 'other').trim() || 'other';

      if (!originalUrl) {
        return json(res, 400, { error: 'Missing originalUrl' });
      }

      const { requestOrigin, origins } = getAllowedOrigins(req);
      const shareVehicle = parseShareVehicleUrl(originalUrl);
      if (!requestOrigin || !isAllowedOriginalUrl(originalUrl, origins)) {
        return json(res, 400, { error: 'Invalid originalUrl origin' });
      }

      const existingQuery = adminClient
        .from(SHORT_LINKS_TABLE)
        .select('short_code')
        .eq('original_url', originalUrl)
        .eq('document_type', documentType)
        .limit(1);

      const { data: existingRows, error: existingError } = rentalId
        ? await existingQuery.eq('rental_id', rentalId)
        : await existingQuery.is('rental_id', null);

      if (existingError) {
        return json(res, 500, { error: existingError.message || 'Failed to lookup existing short link' });
      }

      const existingShortCode = existingRows?.[0]?.short_code;
      if (existingShortCode) {
        const shortOrigin = shareVehicle?.origin || requestOrigin;
        return json(res, 200, {
          shortCode: existingShortCode,
          shortUrl: `${shortOrigin}/s/${existingShortCode}`,
        });
      }

      let nextCode = generateCode();
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const { data: usedRows } = await adminClient
          .from(SHORT_LINKS_TABLE)
          .select('id')
          .eq('short_code', nextCode)
          .limit(1);

        if (!usedRows?.length) break;
        nextCode = generateCode();
      }

      const expires = new Date();
      expires.setDate(expires.getDate() + 7);

      const { error: insertError } = await adminClient
        .from(SHORT_LINKS_TABLE)
        .insert({
          original_url: originalUrl,
          short_code: nextCode,
          rental_id: rentalId,
          document_type: documentType,
          expires_at: expires.toISOString(),
          click_count: 0,
        });

      if (insertError) {
        return json(res, 500, { error: insertError.message || 'Failed to create short link' });
      }

      return json(res, 200, {
        shortCode: nextCode,
        shortUrl: `${shareVehicle?.origin || requestOrigin}/s/${nextCode}`,
      });
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Short link handler failed' });
  }
}
