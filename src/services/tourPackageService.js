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

/**
 * Fetch all active tour packages
 * @returns {Promise<{data: Array|null, error: Error|null}>}
 */
export const fetchTourPackages = async () => {
  try {
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
    return {
      data: packages,
      pricingRows: Array.isArray(payload?.pricingRows) ? payload.pricingRows : [],
      vehicleModels: Array.isArray(payload?.vehicleModels) ? payload.vehicleModels : [],
      error: null,
    };
  } catch (apiError) {
    console.warn('Tour packages request failed:', apiError.message);
    return { data: null, error: apiError };
  }
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
