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
    throw new Error(message || 'Leaderboard request failed');
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

class LeaderboardApiService {
  static async getLeaderboard(type) {
    const headers = await getAuthHeaders();
    const response = await fetch(`/api/growth-links?resource=leaderboard&type=${encodeURIComponent(type)}`, {
      method: 'GET',
      headers,
    });
    return parseResponse(response);
  }
}

export default LeaderboardApiService;
