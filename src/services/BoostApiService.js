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
    throw new Error(message || 'Boost request failed');
  }

  return body;
};

const getAuthHeaders = async (headers = {}) => {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;

  if (!accessToken) {
    throw new Error('No active session');
  }

  return {
    Authorization: `Bearer ${accessToken}`,
    ...headers,
  };
};

class BoostApiService {
  static async getSnapshot() {
    const headers = await getAuthHeaders();
    const response = await fetch('/api/boost', {
      method: 'GET',
      headers,
    });
    return parseResponse(response);
  }

  static async claimDailyVisit() {
    const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
    const response = await fetch('/api/boost', {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'claim_daily_visit' }),
    });
    return parseResponse(response);
  }

  static async createShareLink({ listingId, platform = 'generic', lang = 'en' }) {
    const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
    const response = await fetch('/api/boost', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'create_share_link',
        listingId,
        platform,
        lang,
      }),
    });
    return parseResponse(response);
  }

  static async redeemReward({ listingId, rewardId }) {
    const headers = await getAuthHeaders({ 'Content-Type': 'application/json' });
    const response = await fetch('/api/boost', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'redeem_reward',
        listingId,
        rewardId,
      }),
    });
    return parseResponse(response);
  }
}

export default BoostApiService;
