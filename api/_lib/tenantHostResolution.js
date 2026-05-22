export const DRIVEOUT_BASE_DOMAIN = 'driveout.io';
export const RESERVED_SUBDOMAINS = new Set(['www', 'admin', 'app']);
export const LOCAL_TENANT_PORT_MAP = Object.freeze({
  '5173': 'saharax',
  '5174': 'offroad',
});

export const normalizeHostname = (value = '') => {
  const trimmed = String(value || '').trim().toLowerCase();
  if (!trimmed) return '';

  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).hostname.toLowerCase();
  } catch {
    return trimmed.split('/')[0].split(':')[0].toLowerCase();
  }
};

export const isLocalHostname = (value = '') => {
  const normalized = normalizeHostname(value);
  return normalized === 'localhost' || normalized === '127.0.0.1';
};

export const getTenantSlugFromHostname = (hostname = '') => {
  const rawHostname = String(hostname || '').trim().toLowerCase();
  const normalizedHostname = normalizeHostname(hostname);
  const localPort = rawHostname.split(':')[1] || '';

  if (isLocalHostname(normalizedHostname) && LOCAL_TENANT_PORT_MAP[localPort]) {
    return LOCAL_TENANT_PORT_MAP[localPort];
  }

  if (!normalizedHostname.endsWith(`.${DRIVEOUT_BASE_DOMAIN}`)) return '';

  const slug = normalizedHostname.slice(0, -(`.${DRIVEOUT_BASE_DOMAIN}`.length));
  return slug && !RESERVED_SUBDOMAINS.has(slug) ? slug : '';
};

export const buildTenantHostnameCandidates = (hostname = '') => {
  const rawHostname = String(hostname || '').trim().toLowerCase();
  const normalizedHostname = normalizeHostname(hostname);
  const candidates = new Set([rawHostname, normalizedHostname].filter(Boolean));
  const tenantSlug = getTenantSlugFromHostname(hostname);

  if (tenantSlug) {
    candidates.add(`${tenantSlug}.${DRIVEOUT_BASE_DOMAIN}`);
  }

  return Array.from(candidates);
};
