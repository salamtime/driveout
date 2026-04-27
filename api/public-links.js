import documentSharesHandler from './_lib/documentSharesHandler.js';
import publicBookingHandler from './_lib/publicBookingHandler.js';
import publicCatalogHandler from './_lib/publicCatalogHandler.js';
import publicPricingHandler from './_lib/publicPricingHandler.js';
import publicRentalHandler from './_lib/publicRentalHandler.js';
import shareExperienceHandler from './_lib/shareExperienceHandler.js';
import shareToursHandler from './_lib/shareToursHandler.js';
import shortLinksHandler from './_lib/shortLinksHandler.js';
import shareVehicleHandler from './_lib/shareVehicleHandler.js';

const json = (res, status, body) => res.status(status).json(body);

export default async function handler(req, res) {
  const resource = String(req.query?.resource || '').trim().toLowerCase();

  if (resource === 'health') {
    return json(res, 200, {
      status: 'ok',
      time: new Date().toISOString(),
      runtime: 'node',
      hasApiKey: !!process.env.GEMINI_API_KEY,
    });
  }

  if (resource === 'share-vehicle') {
    return shareVehicleHandler(req, res);
  }

  if (resource === 'share-experience') {
    return shareExperienceHandler(req, res);
  }

  if (resource === 'share-tours') {
    return shareToursHandler(req, res);
  }

  if (resource === 'public-catalog') {
    return publicCatalogHandler(req, res);
  }

  if (resource === 'public-pricing') {
    return publicPricingHandler(req, res);
  }

  if (resource === 'public-bookings') {
    return publicBookingHandler(req, res);
  }

  if (resource === 'public-rental') {
    return publicRentalHandler(req, res);
  }

  if (resource === 'document-shares') {
    return documentSharesHandler(req, res);
  }

  if (resource === 'short-links') {
    return shortLinksHandler(req, res);
  }

  return json(res, 404, { error: 'Unknown public-links resource' });
}
