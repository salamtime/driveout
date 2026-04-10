import {
  buildAppOrigin,
  buildVehicleShareCopy,
  buildVehicleShareTargetPath,
  escapeHtml,
  fetchPublicVehicleShareData,
} from './publicVehicleShare.js';

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

export const renderVehicleShareHtml = (lang, copy, vehicle, shareUrl, imageUrl, targetUrl) => `<!doctype html>
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
        background: linear-gradient(180deg, #fcfbff 0%, #f6f1ff 42%, #ffffff 100%);
        font-family: Inter, system-ui, sans-serif;
        color: #0f172a;
      }
      .card {
        position: relative;
        width: min(90vw, 28rem);
        border-radius: 28px;
        border: 1px solid rgba(196, 181, 253, 0.55);
        background: #ffffff;
        box-shadow: 0 24px 60px rgba(76, 29, 149, 0.10);
        overflow: hidden;
      }
      .media {
        position: relative;
        z-index: 1;
        aspect-ratio: 16/9;
        background: #ffffff;
        padding: 42px 0 0;
      }
      .media img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        transform: scale(1.34);
        transform-origin: center center;
      }
      .content {
        padding: 0 22px 18px;
      }
      h1 {
        margin: 0;
        font-size: 28px;
        line-height: 1.05;
        position: absolute;
        top: 18px;
        left: 22px;
        z-index: 2;
      }
      .brand-logo {
        position: absolute;
        top: 18px;
        right: 18px;
        z-index: 3;
        width: 68px;
        height: 68px;
        border-radius: 20px;
        object-fit: cover;
        box-shadow: 0 12px 28px rgba(226, 51, 33, 0.18);
      }
    </style>
  </head>
  <body>
    <div class="card">
      <img class="brand-logo" src="${escapeHtml(vehicle.logoUrl || '/assets/logo.png')}" alt="${escapeHtml(vehicle.brand || 'Tenant logo')}" />
      <div class="media">
        <img src="${escapeHtml(vehicle.imageUrl)}" alt="${escapeHtml(vehicle.title)}" />
      </div>
      <div class="content">
        <h1>${escapeHtml(vehicle.model)}</h1>
      </div>
    </div>
    <script>
      (function() {
        try {
          const url = new URL(window.location.href);
          const lang = url.searchParams.get('lang');
          if (lang === 'fr' || lang === 'en' || lang === 'ar') {
            localStorage.setItem('app_language', lang);
            localStorage.setItem('saharax_language', lang);
          }
        } catch (error) {}
        window.location.replace(${JSON.stringify(targetUrl)});
      })();
    </script>
  </body>
</html>`;

export default async function handler(req, res) {
  try {
    const listingId = String(req.query.listingId || '').trim();
    if (!listingId) {
      return sendResponse(res, 400, 'text/plain; charset=utf-8', 'Missing listingId');
    }

    const lang = String(req.query.lang || 'en').trim().toLowerCase() === 'fr' ? 'fr' : 'en';
    const vehicle = await fetchPublicVehicleShareData(listingId, lang);

    if (String(req.query.mode || '').trim().toLowerCase() === 'image') {
      const imageResponse = await fetch(vehicle.imageUrl);
      if (!imageResponse.ok) {
        return sendResponse(res, 502, 'text/plain; charset=utf-8', 'Unable to load vehicle image');
      }

      const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
      const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
      res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=86400');
      return sendResponse(res, 200, contentType, imageBuffer);
    }

    const origin = buildAppOrigin(req);
    const copy = buildVehicleShareCopy(vehicle, lang);

    const passthroughQuery = { ...req.query };
    delete passthroughQuery.listingId;

    const targetPath = buildVehicleShareTargetPath(listingId, passthroughQuery);
    const targetUrl = `${origin}${targetPath}`;
    const shareQuery = new URLSearchParams();
    Object.entries(passthroughQuery).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      shareQuery.set(key, String(value));
    });
    const shareUrl = `${origin}/share/rent/${encodeURIComponent(listingId)}${shareQuery.toString() ? `?${shareQuery.toString()}` : ''}`;
    const imageUrl = `${origin}/api/public-links?resource=share-vehicle&mode=image&listingId=${encodeURIComponent(listingId)}&lang=${encodeURIComponent(lang)}`;

    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=86400');
    return sendResponse(
      res,
      200,
      'text/html; charset=utf-8',
      renderVehicleShareHtml(lang, copy, vehicle, shareUrl, imageUrl, targetUrl),
    );
  } catch (error) {
    return sendResponse(res, 500, 'text/plain; charset=utf-8', error?.message || 'Unable to render vehicle share page');
  }
}
