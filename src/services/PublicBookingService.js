import { supabase } from '../lib/supabase';

const requestPublicBookingApi = async (action, body, method = 'POST') => {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;

  const response = await fetch(`/api/public-bookings?action=${encodeURIComponent(action)}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body || {}),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('Public booking API error:', {
      action,
      status: response.status,
      error: payload?.error || payload,
    });
    throw new Error(payload?.error || 'Failed to process booking request');
  }

  return payload;
};

const requestPublicBookingLookup = async (action, params = {}) => {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  const searchParams = new URLSearchParams({ action });

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    searchParams.set(key, String(value));
  });

  const response = await fetch(`/api/public-bookings?${searchParams.toString()}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || 'Failed to load booking request');
  }

  return payload;
};

class PublicBookingService {
  static async createCertifiedBooking(payload) {
    return requestPublicBookingApi('create-certified', payload, 'POST');
  }

  static async createMarketplaceRequest(payload) {
    return requestPublicBookingApi('create-marketplace', payload, 'POST');
  }

  static async getExistingMarketplaceRequest(listingId, fallbackListingId = '') {
    if (!listingId && !fallbackListingId) return null;
    return requestPublicBookingLookup('existing-marketplace', {
      listingId,
      fallbackListingId,
    });
  }

  static async getExistingMarketplaceRequests() {
    return requestPublicBookingLookup('existing-marketplace-list');
  }

  static async updateWebsiteBookingState(rentalId, payload = {}) {
    if (!rentalId) return null;

    return requestPublicBookingApi('update-state', {
      ...payload,
      rentalId,
    }, 'PATCH');
  }
}

export default PublicBookingService;
