import { supabase } from '../lib/supabase';

const parseResponse = async (response) => {
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : await response.text().catch(() => '');

  if (!response.ok) {
    const message = typeof body === 'string'
      ? body
      : body?.error || body?.message || response.statusText;
    throw new Error(message || 'Growth request failed');
  }

  return body;
};

const getAuthHeaders = async (headers = {}) => {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;

  return {
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...headers,
  };
};

class GrowthLoopApiService {
  static async getSnapshot(type) {
    const headers = await getAuthHeaders();
    const response = await fetch(`/api/growth-links?type=${encodeURIComponent(type)}`, {
      method: 'GET',
      headers,
    });
    return parseResponse(response);
  }

  static async createShareLink(payload) {
    const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
    const response = await fetch('/api/growth-links', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'create_link',
        ...payload,
      }),
    });
    return parseResponse(response);
  }

  static async trackSignup({ code, referredUserId }) {
    const response = await fetch('/api/growth-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'track_signup',
        code,
        referredUserId,
      }),
    });
    return parseResponse(response);
  }

  static async trackBooking({ code, bookingRequestId, listingId }) {
    const response = await fetch('/api/growth-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'track_booking',
        code,
        bookingRequestId,
        listingId,
      }),
    });
    return parseResponse(response);
  }
}

export default GrowthLoopApiService;
