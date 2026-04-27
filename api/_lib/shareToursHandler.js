import {
  DEFAULT_STOREFRONT_TENANT_SLUG,
  getCanonicalStorefrontOrigin,
} from '../../src/utils/storefrontHost.js';

const SAHARAX_LOGO_PATH = '/assets/logo.jpg';

const safeText = (value, fallback = '') => {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const sendResponse = (res, statusCode, contentType, body) => {
  if (typeof res.status === 'function') {
    res.status(statusCode);
  } else {
    res.statusCode = statusCode;
  }

  if (typeof res.setHeader === 'function') {
    res.setHeader('Content-Type', contentType);
  } else if (typeof res.set === 'function') {
    res.set('Content-Type', contentType);
  }

  if (typeof res.send === 'function') {
    return res.send(body);
  }

  return res.end(body);
};

const buildAppOrigin = (req) => {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'www.saharax.co';
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  return getCanonicalStorefrontOrigin({
    host: String(host).split(',')[0]?.trim(),
    protocol,
    tenantSlug: DEFAULT_STOREFRONT_TENANT_SLUG,
  });
};

export const buildToursShareTargetPath = (query = {}) => {
  const nextQuery = new URLSearchParams();

  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    nextQuery.set(key, String(value));
  });

  const queryString = nextQuery.toString();
  return `/tours${queryString ? `?${queryString}` : ''}`;
};

export const buildToursShareCopy = (lang = 'en', city = '') => {
  const isFrench = lang === 'fr';
  const cityLabel = safeText(city, 'Tangier');

  return {
    pageTitle: isFrench ? 'Choisissez votre tour | SaharaX' : 'Choose your tour | SaharaX',
    ogTitle: isFrench ? 'Choisissez votre tour SaharaX' : 'Choose your SaharaX tour',
    ogDescription: isFrench
      ? `Tours guidés SaharaX à ${cityLabel}. Ouvrez la page tour dans la bonne langue.`
      : `Guided SaharaX tours in ${cityLabel}. Open the tour page in the right language.`,
    eyebrow: isFrench ? 'TOURS SAHARAX' : 'SAHARAX TOURS',
    heading: isFrench ? 'Choisissez votre tour' : 'Choose your tour',
    subtitle: isFrench
      ? `Découvrez les parcours guidés SaharaX à ${cityLabel}.`
      : `Explore guided SaharaX routes in ${cityLabel}.`,
  };
};

export const renderToursShareHtml = (lang, copy, shareUrl, imageUrl, targetUrl) => `<!doctype html>
<html lang="${escapeHtml(lang)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(copy.pageTitle)}</title>
    <meta name="description" content="${escapeHtml(copy.ogDescription)}" />
    <meta property="og:title" content="${escapeHtml(copy.ogTitle)}" />
    <meta property="og:description" content="${escapeHtml(copy.ogDescription)}" />
    <meta property="og:image" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:url" content="${escapeHtml(shareUrl)}" />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(copy.ogTitle)}" />
    <meta name="twitter:description" content="${escapeHtml(copy.ogDescription)}" />
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
    <meta name="robots" content="noindex, nofollow" />
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: linear-gradient(180deg, #fcfbff 0%, #f3efff 46%, #ffffff 100%);
        font-family: Inter, system-ui, sans-serif;
        color: #0f172a;
      }
      .card {
        width: min(92vw, 30rem);
        border-radius: 32px;
        border: 1px solid rgba(196, 181, 253, 0.58);
        background: #ffffff;
        box-shadow: 0 28px 70px rgba(76, 29, 149, 0.12);
        overflow: hidden;
      }
      .hero {
        padding: 28px 24px 22px;
        background: linear-gradient(180deg, #f5f3ff 0%, #ede9fe 100%);
      }
      .eyebrow {
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.26em;
        color: #7c3aed;
      }
      .row {
        margin-top: 18px;
        display: flex;
        align-items: center;
        gap: 18px;
      }
      .logo-shell {
        display: grid;
        place-items: center;
        width: 84px;
        height: 84px;
        border-radius: 26px;
        background: #ffffff;
        border: 1px solid rgba(196, 181, 253, 0.42);
        box-shadow: 0 18px 40px rgba(124, 58, 237, 0.14);
        flex-shrink: 0;
      }
      .logo-shell img {
        width: 66px;
        height: 66px;
        object-fit: contain;
      }
      h1 {
        margin: 0;
        font-size: 32px;
        line-height: 1.02;
        letter-spacing: -0.045em;
      }
      p {
        margin: 10px 0 0;
        font-size: 16px;
        line-height: 1.5;
        color: #64748b;
      }
      .footer {
        padding: 18px 24px 24px;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 46px;
        padding: 0 18px;
        border-radius: 999px;
        background: linear-gradient(90deg, #7c3aed 0%, #5b31d6 100%);
        color: #ffffff;
        font-size: 14px;
        font-weight: 800;
        letter-spacing: 0.06em;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="hero">
        <div class="eyebrow">${escapeHtml(copy.eyebrow)}</div>
        <div class="row">
          <div class="logo-shell">
            <img src="${escapeHtml(imageUrl)}" alt="SaharaX logo" />
          </div>
          <div>
            <h1>${escapeHtml(copy.heading)}</h1>
            <p>${escapeHtml(copy.subtitle)}</p>
          </div>
        </div>
      </div>
      <div class="footer">
        <div class="pill">${escapeHtml(lang === 'fr' ? 'Ouverture du site...' : 'Opening website...')}</div>
      </div>
    </div>
    <script>
      (function() {
        try {
          const url = new URL(window.location.href);
          const nextLang = url.searchParams.get('lang');
          if (nextLang === 'fr' || nextLang === 'en' || nextLang === 'ar') {
            localStorage.setItem('app_language', nextLang);
            localStorage.setItem('saharax_language', nextLang);
          }
        } catch (error) {}
        window.location.replace(${JSON.stringify(targetUrl)});
      })();
    </script>
  </body>
</html>`;

export default async function handler(req, res) {
  try {
    const lang = String(req.query.lang || 'en').trim().toLowerCase() === 'fr' ? 'fr' : 'en';
    const city = safeText(req.query.city, 'Tangier');
    const origin = buildAppOrigin(req);
    const imageUrl = `${origin}${SAHARAX_LOGO_PATH}`;
    const passthroughQuery = {
      lang,
      ...(city ? { city } : {}),
    };
    const copy = buildToursShareCopy(lang, city);
    const targetPath = buildToursShareTargetPath(passthroughQuery);
    const targetUrl = `${origin}${targetPath}`;
    const shareQuery = new URLSearchParams();

    Object.entries(passthroughQuery).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      shareQuery.set(key, String(value));
    });

    const shareUrl = `${origin}/share/tours${shareQuery.toString() ? `?${shareQuery.toString()}` : ''}`;

    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=86400');
    return sendResponse(
      res,
      200,
      'text/html; charset=utf-8',
      renderToursShareHtml(lang, copy, shareUrl, imageUrl, targetUrl),
    );
  } catch (error) {
    return sendResponse(res, 500, 'text/plain; charset=utf-8', error?.message || 'Unable to render tours share page');
  }
}
