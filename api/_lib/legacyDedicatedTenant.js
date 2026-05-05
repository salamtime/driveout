import { LEGACY_TENANCY_MODE, resolveTenantTenancyMode } from './tenancyMode.js';

const normalizeUrl = (value = '') => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

export const buildLegacyDedicatedInfrastructure = (tenant = {}) => {
  const tenancyMode = resolveTenantTenancyMode(tenant);
  if (tenancyMode !== LEGACY_TENANCY_MODE) {
    return null;
  }

  const projectRef = String(tenant?.tenant_project_ref || '').trim();
  const appUrl = normalizeUrl(tenant?.tenant_app_url || '');
  const apiUrl = normalizeUrl(tenant?.tenant_api_url || '');
  const anonKey = String(tenant?.tenant_anon_key || '').trim();
  const schemaVersion = String(tenant?.schema_version || '').trim();

  return {
    mode: LEGACY_TENANCY_MODE,
    preserved: true,
    projectRef: projectRef || null,
    appUrl: appUrl || null,
    apiUrl: apiUrl || null,
    anonKeyConfigured: Boolean(anonKey),
    schemaVersion: schemaVersion || null,
  };
};
