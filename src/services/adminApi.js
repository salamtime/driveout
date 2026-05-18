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

const buildRequestOptions = (options, headers) => ({
  ...options,
  cache: options.cache || 'no-store',
  headers,
});

const createAdminApiError = (message, response, payload) => {
  const error = new Error(message || 'Request failed');
  error.status = response?.status;
  error.payload = payload;
  return error;
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
    throw createAdminApiError(message || 'Request failed', response, data);
  }

  return data;
};

export const adminApiRequest = async (path, options = {}) => {
  const extraHeaders = options.body
    ? { 'Content-Type': 'application/json', ...(options.headers || {}) }
    : options.headers || {};
  let headers = await buildHeaders(extraHeaders);

  let response = await fetch(path, buildRequestOptions(options, headers));

  if (response.status === 401) {
    try {
      const refreshResult = await supabase.auth.refreshSession();
      const refreshedToken = refreshResult?.data?.session?.access_token;
      if (refreshedToken) {
        headers = {
          Authorization: `Bearer ${refreshedToken}`,
          ...extraHeaders,
        };
        response = await fetch(path, buildRequestOptions(options, headers));
      }
    } catch (refreshError) {
      // Fall through to the original 401 parse below.
    }
  }

  return parseResponse(response);
};
