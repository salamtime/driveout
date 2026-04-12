import { adminApiRequest } from './adminApi';

/**
 * Tour Package Service for managing tour packages
 * Handles CRUD operations for the tour packages table
 */
const sanitizePackagePayload = (tourPackage = {}) => {
  const payload = {
    ...tourPackage,
  };

  [
    'public_title',
    'public_summary',
    'route_label',
    'route_stops_json',
    'media_gallery_json',
    'public_highlights_json',
    'display_order',
    'cover_image_url',
    'duration_display',
    'stop_count',
    'difficulty_label',
  ].forEach((legacyKey) => {
    delete payload[legacyKey];
  });

  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined) {
      delete payload[key];
    }
  });

  return payload;
};

const normalizeVehicleModel = (model = {}) => ({
  ...model,
  id: String(model.id || ''),
  name: String(model.name || '').trim(),
  model: String(model.model || '').trim(),
  vehicleType: String(model.vehicleType || model.vehicle_type || '').trim(),
  vehicle_type: String(model.vehicle_type || model.vehicleType || '').trim(),
  imageUrl: String(model.imageUrl || model.image_url || '').trim(),
  image_url: String(model.image_url || model.imageUrl || '').trim(),
  capacityMin: Number(model.capacityMin || model.capacity_min || 0) || 0,
  capacity_max: Number(model.capacity_max || model.capacityMax || 0) || 0,
  capacityMax: Number(model.capacityMax || model.capacity_max || 0) || 0,
  capacity_min: Number(model.capacity_min || model.capacityMin || 0) || 0,
});

let cachedTourPackages = null;
let cachedTourPackagesAt = 0;
let inFlightTourPackagesRequest = null;
const TOUR_PACKAGES_CACHE_TTL_MS = 60 * 1000;

/**
 * Fetch all active tour packages
 * @returns {Promise<{data: Array|null, error: Error|null}>}
 */
export const fetchTourPackages = async () => {
  const now = Date.now();
  if (cachedTourPackages && now - cachedTourPackagesAt < TOUR_PACKAGES_CACHE_TTL_MS) {
    return cachedTourPackages;
  }

  if (inFlightTourPackagesRequest) {
    return inFlightTourPackagesRequest;
  }

  try {
    inFlightTourPackagesRequest = (async () => {
      const response = await fetch('/api/tour-packages', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      const contentType = response.headers.get('content-type') || '';

      if (!contentType.includes('application/json')) {
        throw new Error(`Unexpected response type: ${contentType || 'unknown'}`);
      }

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || response.statusText || 'Could not load tour packages');
      }

      const packages = Array.isArray(payload?.packages) ? payload.packages : [];
      const result = {
        data: packages,
        pricingRows: Array.isArray(payload?.pricingRows) ? payload.pricingRows : [],
        vehicleModels: Array.isArray(payload?.vehicleModels) ? payload.vehicleModels.map(normalizeVehicleModel) : [],
        error: null,
      };

      cachedTourPackages = result;
      cachedTourPackagesAt = Date.now();
      return result;
    })();

    const result = await inFlightTourPackagesRequest;
    inFlightTourPackagesRequest = null;
    return result;
  } catch (apiError) {
    inFlightTourPackagesRequest = null;
    console.warn('Tour packages request failed:', apiError.message);
    return { data: null, error: apiError };
  }
};

export const preloadTourPackages = async () => {
  const result = await fetchTourPackages();
  return result;
};

/**
 * Create a new tour package
 * @param {Object} tourPackage - Tour package data
 * @returns {Promise<{data: Object|null, error: Error|null}>}
 */
export const createTourPackage = async (tourPackage) => {
  const basePayload = sanitizePackagePayload(tourPackage);
  const response = await adminApiRequest('/api/tour-packages', {
    method: 'POST',
    body: JSON.stringify(basePayload),
  });
  return { data: response?.data || null, error: null };
};

/**
 * Update an existing tour package
 * @param {string} id - Tour package ID
 * @param {Object} updates - Updates to apply
 * @returns {Promise<{data: Object|null, error: Error|null}>}
 */
export const updateTourPackage = async (id, updates) => {
  const basePayload = sanitizePackagePayload(updates);
  const response = await adminApiRequest('/api/tour-packages', {
    method: 'PATCH',
    body: JSON.stringify({ id, ...basePayload }),
  });
  return { data: response?.data || null, error: null };
};

/**
 * Delete (deactivate) a tour package
 * @param {string} id - Tour package ID
 * @returns {Promise<{data: Object|null, error: Error|null}>}
 */
export const deleteTourPackage = async (id) => {
  await adminApiRequest(`/api/tour-packages?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return { data: { id }, error: null };
};

/**
 * Get pricing for a specific tour package
 * @param {Object} tourPackage - Tour package object
 * @param {number} duration - Duration in hours (1 or 2)
 * @param {boolean} isVip - Whether it's VIP pricing
 * @returns {number} - Price for the tour
 */
export const getTourPackagePrice = (tourPackage, duration, isVip = false) => {
  if (!tourPackage) return 0;
  
  if (duration === 1) {
    return isVip ? (tourPackage.vip_rate_1h || 0) : (tourPackage.default_rate_1h || 0);
  } else if (duration === 2) {
    return isVip ? (tourPackage.vip_rate_2h || 0) : (tourPackage.default_rate_2h || 0);
  }
  
  return 0;
};
