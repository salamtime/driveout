import { isLocalHost } from './storefrontHost';

export const PUBLIC_HOSTS = new Set(['driveout.io', 'www.driveout.io', 'saharax.co', 'www.saharax.co']);
export const ADMIN_HOSTS = new Set(['admin.driveout.io', 'admin.saharax.co']);
export const APP_SHELL_HOSTS = new Set(['app.driveout.io']);
export const DRIVEOUT_BASE_DOMAIN = 'driveout.io';
const LOCAL_TENANT_SESSION_KEY = 'driveout.localTenantSlug';

export const getCurrentHostname = () => {
  if (typeof window === 'undefined') return '';
  return String(window.location.hostname || '').toLowerCase();
};

export const getHostContext = (hostname = getCurrentHostname()) => {
  const normalizedHostname = String(hostname || '').toLowerCase();
  const localTenantSlug = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search || '').get('tenant')
    : '';
  const storedLocalTenantSlug = typeof window !== 'undefined'
    ? window.sessionStorage.getItem(LOCAL_TENANT_SESSION_KEY)
    : '';

  if (isLocalHost(normalizedHostname)) {
    const normalizedLocalTenantSlug = String(localTenantSlug || '').trim().toLowerCase();
    if (normalizedLocalTenantSlug && typeof window !== 'undefined') {
      window.sessionStorage.setItem(LOCAL_TENANT_SESSION_KEY, normalizedLocalTenantSlug);
    }

    const effectiveLocalTenantSlug = normalizedLocalTenantSlug || String(storedLocalTenantSlug || '').trim().toLowerCase();
    if (effectiveLocalTenantSlug) {
      return { hostname: normalizedHostname, kind: 'tenant', tenantSlug: effectiveLocalTenantSlug, isLocal: true };
    }

    return { hostname: normalizedHostname, kind: 'local', tenantSlug: null, isLocal: true };
  }

  if (ADMIN_HOSTS.has(normalizedHostname)) {
    return { hostname: normalizedHostname, kind: 'admin', tenantSlug: null, isLocal: false };
  }

  if (PUBLIC_HOSTS.has(normalizedHostname) || !normalizedHostname) {
    return { hostname: normalizedHostname, kind: 'public', tenantSlug: null, isLocal: false };
  }

  if (APP_SHELL_HOSTS.has(normalizedHostname)) {
    return { hostname: normalizedHostname, kind: 'app', tenantSlug: null, isLocal: false };
  }

  if (normalizedHostname.endsWith(`.${DRIVEOUT_BASE_DOMAIN}`)) {
    const tenantSlug = normalizedHostname.replace(`.${DRIVEOUT_BASE_DOMAIN}`, '');
    if (tenantSlug && tenantSlug !== 'www' && tenantSlug !== 'admin' && tenantSlug !== 'app') {
      return { hostname: normalizedHostname, kind: 'tenant', tenantSlug, isLocal: false };
    }
  }

  return { hostname: normalizedHostname, kind: 'public', tenantSlug: null, isLocal: false };
};

export const buildHostUrl = ({
  kind = 'public',
  pathname = '/',
  search = '',
  hash = '',
  tenantSlug = null,
}) => {
  const normalizedPath = pathname?.startsWith('/') ? pathname : `/${pathname || ''}`;
  const targetHost = kind === 'admin'
    ? 'admin.driveout.io'
    : kind === 'tenant' && tenantSlug
      ? `${tenantSlug}.${DRIVEOUT_BASE_DOMAIN}`
      : kind === 'app'
        ? 'app.driveout.io'
        : 'driveout.io';

  return `https://${targetHost}${normalizedPath}${search || ''}${hash || ''}`;
};

export const isTenantWorkspaceHost = (hostname = getCurrentHostname()) =>
  getHostContext(hostname).kind === 'tenant';
