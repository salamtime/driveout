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
    throw new Error(payload?.error || 'Failed to process booking request');
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

  static async updateWebsiteBookingState(rentalId, payload = {}) {
    if (!rentalId) return null;

    return requestPublicBookingApi('update-state', {
      ...payload,
      rentalId,
    }, 'PATCH');
  }
}

export default PublicBookingService;
