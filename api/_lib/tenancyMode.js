export const TENANCY_MODES = Object.freeze({
  SHARED: 'shared',
  DEDICATED: 'dedicated',
});

export const DEFAULT_TENANCY_MODE = TENANCY_MODES.SHARED;
export const LEGACY_TENANCY_MODE = TENANCY_MODES.DEDICATED;
const FIRST_PARTY_DEDICATED_TENANT_SLUGS = new Set(['saharax']);

export const normalizeTenancyMode = (value, fallback = DEFAULT_TENANCY_MODE) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === TENANCY_MODES.SHARED || normalized === TENANCY_MODES.DEDICATED) {
    return normalized;
  }
  return fallback;
};

export const resolveTenantTenancyMode = (tenant = {}) => {
  const metadata = tenant?.metadata && typeof tenant.metadata === 'object' ? tenant.metadata : {};
  const tenantName = String(tenant?.tenant_name || tenant?.tenantName || '').trim().toLowerCase();
  const tenantSlug = String(tenant?.tenant_slug || tenant?.tenantSlug || '').trim().toLowerCase();
  const tenantAppUrl = String(tenant?.tenant_app_url || tenant?.tenantAppUrl || '').trim().toLowerCase();

  if (
    FIRST_PARTY_DEDICATED_TENANT_SLUGS.has(tenantSlug) ||
    tenantName === 'saharax' ||
    tenantName === 'saharax xtreme' ||
    tenantAppUrl.includes('saharax.driveout.io')
  ) {
    return TENANCY_MODES.DEDICATED;
  }

  const rowMode = normalizeTenancyMode(tenant?.tenancy_mode, '');
  if (rowMode) {
    return rowMode;
  }

  const metadataMode = normalizeTenancyMode(
    metadata.tenancy_mode ||
    metadata.workspace_mode,
    ''
  );

  if (metadataMode) {
    return metadataMode;
  }

  const tenantProjectRef = String(tenant?.tenant_project_ref || '').trim();
  const tenantApiUrl = String(tenant?.tenant_api_url || '').trim();
  const tenantAnonKey = String(tenant?.tenant_anon_key || '').trim();

  if (tenantProjectRef || tenantApiUrl || tenantAnonKey) {
    return TENANCY_MODES.DEDICATED;
  }

  return DEFAULT_TENANCY_MODE;
};
