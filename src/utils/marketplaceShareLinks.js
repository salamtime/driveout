const normalizeMarketplaceListingId = (listingId = '') => {
  const normalizedListingId = String(listingId || '').trim();
  if (!normalizedListingId) return '';
  if (normalizedListingId.startsWith('marketplace-')) return normalizedListingId;
  return `marketplace-${normalizedListingId}`;
};

export const buildMarketplaceListingPath = (listingId = '', params = {}) => {
  const normalizedListingId = normalizeMarketplaceListingId(listingId);
  if (!normalizedListingId) return '/marketplace';

  const searchParams = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    searchParams.set(key, String(value));
  });

  const search = searchParams.toString();
  return `/marketplace/${normalizedListingId}${search ? `?${search}` : ''}`;
};

export const buildMarketplaceRequestPath = (listingId = '', params = {}) => {
  const normalizedListingId = normalizeMarketplaceListingId(listingId);
  if (!normalizedListingId) return '/marketplace';

  const searchParams = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    searchParams.set(key, String(value));
  });

  const search = searchParams.toString();
  return `/marketplace/${normalizedListingId}/request${search ? `?${search}` : ''}`;
};

export const buildMarketplaceWhatsappShareHref = ({
  listingId = '',
  title = '',
  dailyPrice = '',
  currencyCode = 'MAD',
  locationLabel = '',
  tr = null,
  source = 'share',
} = {}) => {
  if (typeof window === 'undefined') return '';
  const normalizedListingId = String(listingId || '').trim();
  const normalizedMarketplaceListingId = normalizeMarketplaceListingId(normalizedListingId);
  if (!normalizedMarketplaceListingId) return '';

  const translate = typeof tr === 'function' ? tr : (en) => en;
  const requestPath = buildMarketplaceRequestPath(normalizedMarketplaceListingId, {
    source,
    via: 'whatsapp',
  });
  const requestUrl = `${window.location.origin}${requestPath}`;

  const parts = [
    String(title || '').trim(),
    dailyPrice ? `${dailyPrice} ${currencyCode}/day` : '',
    String(locationLabel || '').trim(),
    translate('Request here', 'Réserver ici') + `: ${requestUrl}`,
  ].filter(Boolean);

  return `https://wa.me/?text=${encodeURIComponent(parts.join('\n'))}`;
};
