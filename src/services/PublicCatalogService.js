const CERTIFIED_FLEET_CITY_PROVIDERS = {
  tangier: {
    city: 'Tangier',
    providerName: 'SaharaX',
    providerMark: 'SX',
  },
};

const safeText = (value, fallback = '') => {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
};

const getCanonicalListingTitle = (listing = {}) =>
  [listing?.brand, listing?.model].map((value) => safeText(value)).filter(Boolean).join(' ').trim() ||
  safeText(listing?.title, 'Marketplace listing');

const normalizeCatalogListing = (listing) => {
  if (!listing || typeof listing !== 'object') return listing;
  return {
    ...listing,
    title: getCanonicalListingTitle(listing),
  };
};

const normalizeCatalogPayload = (body = {}) => {
  if (!body || typeof body !== 'object') return body;
  return {
    ...body,
    listing: body.listing ? normalizeCatalogListing(body.listing) : body.listing,
    listings: Array.isArray(body.listings) ? body.listings.map(normalizeCatalogListing) : body.listings,
    featuredListings: Array.isArray(body.featuredListings)
      ? body.featuredListings.map(normalizeCatalogListing)
      : body.featuredListings,
  };
};

const getPackageDurationRank = (pkg = {}) => {
  const name = safeText(pkg.name).toLowerCase();
  const durationUnits = Number(pkg.durationUnits || 0);
  if (name.includes('half hour') || name.includes('30 min') || durationUnits === 0.5) return 0;
  if (name.includes('hour') || durationUnits === 1) return 1;
  if (durationUnits > 1 && durationUnits < 4) return 2;
  if (name.includes('half day') || durationUnits === 4) return 2;
  if (name.includes('day')) return 3;
  return 9;
};

export const getMarketingPrintPackages = (packages = [], limit = 5) => {
  const activePackages = Array.isArray(packages) ? packages.filter(Boolean) : [];
  const selectedPackages = activePackages.filter((pkg) => pkg.showOnPrint === true || pkg.show_on_print === true);
  const sourcePackages = selectedPackages.length > 0 ? selectedPackages : activePackages;

  return [...sourcePackages]
    .sort((left, right) =>
      getPackageDurationRank(left) - getPackageDurationRank(right) ||
      Number(left.fixedAmount || left.fixed_amount || 0) - Number(right.fixedAmount || right.fixed_amount || 0) ||
      safeText(left.name).localeCompare(safeText(right.name))
    )
    .slice(0, Math.max(1, Math.min(Number(limit) || 5, 5)));
};

const getCertifiedFleetProviderByCity = (city) => {
  const normalizedCity = safeText(city, 'Tangier').toLowerCase();
  return (
    CERTIFIED_FLEET_CITY_PROVIDERS[normalizedCity] || {
      city: safeText(city, 'Tangier'),
      providerName: 'Certified Fleet',
      providerMark: 'CF',
    }
  );
};

class PublicCatalogService {
  static catalogCache = new Map();
  static cacheTtlMs = 0;

  static clearCache() {
    this.catalogCache.clear();
  }

  static async fetchServerCatalog(action = 'catalog', params = {}) {
    if (typeof fetch !== 'function') {
      throw new Error('Fetch is not available');
    }

    const search = new URLSearchParams();
    search.set('action', action);

    Object.entries(params || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      search.set(key, String(value));
    });

    const response = await fetch(`/api/public-catalog?${search.toString()}`, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
      },
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body?.error || 'Failed to load public catalog');
    }

    return normalizeCatalogPayload(body);
  }

  static async fetchCertifiedFleet() {
    const body = await this.getCatalog({
      flow: 'instant',
      source: 'certified_fleet',
    });
    return Array.isArray(body?.listings) ? body.listings : [];
  }

  static async fetchMarketplaceListings() {
    const body = await this.getCatalog({
      flow: 'request',
      source: 'marketplace',
    });
    return Array.isArray(body?.listings) ? body.listings : [];
  }

  static async getCatalog(filters = {}) {
    const normalizedFilters = Object.entries(filters || {})
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
    const cacheKey = `catalog:${JSON.stringify(normalizedFilters)}`;
    const now = Date.now();
    const cached = this.catalogCache.get(cacheKey);

    if (cached?.data && now - cached.timestamp < this.cacheTtlMs) {
      return cached.data;
    }

    if (cached?.promise) {
      return cached.promise;
    }

    const request = this.fetchServerCatalog('catalog', filters)
      .then((data) => {
        this.catalogCache.set(cacheKey, {
          data,
          timestamp: Date.now(),
        });
        return data;
      })
      .catch((error) => {
        this.catalogCache.delete(cacheKey);
        throw error;
      });

    this.catalogCache.set(cacheKey, {
      promise: request,
      timestamp: now,
    });

    return request;
  }

  static async getListingById(listingId, cityOverride) {
    const body = await this.fetchServerCatalog('listing', {
      listingId,
      city: cityOverride || '',
    });
    return body?.listing || null;
  }

  static getCertifiedFleetProviderByCity(city) {
    return getCertifiedFleetProviderByCity(city);
  }

  static getMarketingPrintPackages(packages = [], limit = 5) {
    return getMarketingPrintPackages(packages, limit);
  }

  static preloadCatalog(filters = {}) {
    return this.getCatalog(filters).catch(() => null);
  }
}

export default PublicCatalogService;
