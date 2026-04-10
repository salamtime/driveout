export const DRIVEOUT_BASE_DOMAIN = 'driveout.io';
export const DEFAULT_STOREFRONT_TENANT_SLUG = 'saharax';

const RESERVED_SUBDOMAINS = new Set(['www', 'admin', 'app']);
const LEGACY_PUBLIC_HOSTS = new Set(['saharax.co', 'www.saharax.co']);
const MARKETPLACE_HOSTS = new Set(['driveout.io', 'www.driveout.io']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

const splitHost = (value = '') => {
  const host = String(value || '').trim().toLowerCase();
  if (!host) return { host: '', hostname: '' };

  if (host.startsWith('[')) {
    const closingIndex = host.indexOf(']');
    if (closingIndex >= 0) {
      return {
        host,
        hostname: host.slice(1, closingIndex),
      };
    }
  }

  const lastColonIndex = host.lastIndexOf(':');
  const hasSinglePortSeparator = lastColonIndex > -1 && host.indexOf(':') === lastColonIndex;

  return {
    host,
    hostname: hasSinglePortSeparator ? host.slice(0, lastColonIndex) : host,
  };
};

export const getTenantStorefrontHost = (tenantSlug = DEFAULT_STOREFRONT_TENANT_SLUG) =>
  `${String(tenantSlug || DEFAULT_STOREFRONT_TENANT_SLUG).trim().toLowerCase()}.${DRIVEOUT_BASE_DOMAIN}`;

export const isLocalHost = (value = '') => {
  const { hostname } = splitHost(value);
  return LOCAL_HOSTS.has(hostname);
};

export const getCanonicalStorefrontOrigin = ({
  host = '',
  protocol = 'https',
  tenantSlug = DEFAULT_STOREFRONT_TENANT_SLUG,
} = {}) => {
  const normalizedProtocol = String(protocol || 'https').replace(/:$/, '') || 'https';
  const { host: normalizedHost, hostname } = splitHost(host);
  const tenantHost = getTenantStorefrontHost(tenantSlug);

  if (!hostname) {
    return `${normalizedProtocol}://${tenantHost}`;
  }

  if (isLocalHost(normalizedHost)) {
    return `${normalizedProtocol}://${normalizedHost}`;
  }

  if (hostname === tenantHost) {
    return `${normalizedProtocol}://${hostname}`;
  }

  if (hostname.endsWith(`.${DRIVEOUT_BASE_DOMAIN}`)) {
    const subdomain = hostname.slice(0, -(`.${DRIVEOUT_BASE_DOMAIN}`.length));
    if (subdomain && !RESERVED_SUBDOMAINS.has(subdomain)) {
      return `${normalizedProtocol}://${hostname}`;
    }
  }

  if (MARKETPLACE_HOSTS.has(hostname) || LEGACY_PUBLIC_HOSTS.has(hostname) || RESERVED_SUBDOMAINS.has(hostname)) {
    return `${normalizedProtocol}://${tenantHost}`;
  }

  return `${normalizedProtocol}://${tenantHost}`;
};
