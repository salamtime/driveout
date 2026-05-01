import { supabase } from './supabaseClient';

const buildHeaders = async (extraHeaders = {}) => {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('No active session');
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
    ...extraHeaders,
  };
};

const parseResponse = async (response) => {
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (response.ok && !contentType.includes('application/json')) {
    throw new Error(
      `Admin API returned unexpected content type: ${contentType || 'unknown'}. ` +
      'This usually means the API route is unavailable in the current app host.'
    );
  }

  if (!response.ok) {
    const message = typeof data === 'string'
      ? data
      : data?.error || data?.message || response.statusText;
    throw new Error(message || 'Request failed');
  }

  return data;
};

export const adminApiRequest = async (path, options = {}) => {
  const headers = await buildHeaders(options.body
    ? { 'Content-Type': 'application/json', ...(options.headers || {}) }
    : options.headers || {});

  const response = await fetch(path, {
    ...options,
    cache: options.cache || 'no-store',
    headers,
  });

  return parseResponse(response);
};
