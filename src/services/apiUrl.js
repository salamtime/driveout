const normalizeBaseUrl = (value = '') => String(value || '').trim().replace(/\/+$/, '');

export const getApiBaseUrl = () => normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL);

export const buildApiUrl = (path = '') => {
  const rawPath = String(path || '').trim();
  if (!rawPath) return rawPath;

  if (/^https?:\/\//i.test(rawPath)) {
    return rawPath;
  }

  const normalizedPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  const baseUrl = getApiBaseUrl();

  return baseUrl ? `${baseUrl}${normalizedPath}` : normalizedPath;
};

export const GEMINI_PROXY_PATH = '/api/gemini-proxy';
