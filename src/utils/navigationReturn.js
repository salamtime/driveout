export const getCurrentLocationPath = (location) => {
  if (!location || typeof location !== 'object') return '/';
  return `${location.pathname || ''}${location.search || ''}${location.hash || ''}` || '/';
};

export const resolveReturnPath = (location, fallback = '/') => {
  const from = location?.state?.from;

  if (typeof from === 'string' && from.trim()) {
    return from;
  }

  if (from && typeof from === 'object' && typeof from.pathname === 'string') {
    return `${from.pathname}${from.search || ''}${from.hash || ''}` || fallback;
  }

  return fallback;
};
