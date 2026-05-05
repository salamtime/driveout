export const TENANCY_MODES = Object.freeze({
  SHARED: 'shared',
  DEDICATED: 'dedicated',
});

export const DEFAULT_TENANCY_MODE = TENANCY_MODES.SHARED;
export const LEGACY_TENANCY_MODE = TENANCY_MODES.DEDICATED;

export const normalizeTenancyMode = (value, fallback = DEFAULT_TENANCY_MODE) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === TENANCY_MODES.SHARED || normalized === TENANCY_MODES.DEDICATED) {
    return normalized;
  }
  return fallback;
};

export const resolveTenantTenancyMode = (tenant = {}) => {
  const metadata = tenant?.metadata && typeof tenant.metadata === 'object' ? tenant.metadata : {};
  const rowMode = normalizeTenancyMode(tenant?.tenancy_mode, '');
  if (rowMode) {
    return rowMode;
  }

  const tenantProjectRef = String(tenant?.tenant_project_ref || '').trim();
  const tenantApiUrl = String(tenant?.tenant_api_url || '').trim();
  const tenantAnonKey = String(tenant?.tenant_anon_key || '').trim();

  if (tenantProjectRef || tenantApiUrl || tenantAnonKey) {
    return TENANCY_MODES.DEDICATED;
  }

  const metadataMode = normalizeTenancyMode(
    metadata.tenancy_mode ||
    metadata.workspace_mode,
    ''
  );

  if (metadataMode) {
    return metadataMode;
  }

  return DEFAULT_TENANCY_MODE;
};
