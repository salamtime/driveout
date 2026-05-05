export const DEDICATED_TENANT_PROFILES = Object.freeze({
  LEGACY_HOLD: 'legacy_hold',
  PREMIUM_ISOLATED: 'premium_isolated',
  ENTERPRISE_COMPLIANCE: 'enterprise_compliance',
  WHITE_LABEL_CUSTOM: 'white_label_custom',
  MIGRATION_STAGING: 'migration_staging',
  EMERGENCY_FALLBACK: 'emergency_fallback',
});

export const DEFAULT_DEDICATED_TENANT_PROFILE = DEDICATED_TENANT_PROFILES.PREMIUM_ISOLATED;

const DEDICATED_TENANT_PROFILE_VALUES = new Set(Object.values(DEDICATED_TENANT_PROFILES));

export const normalizeDedicatedTenantProfile = (
  value,
  fallback = DEFAULT_DEDICATED_TENANT_PROFILE
) => {
  const normalized = String(value || '').trim().toLowerCase();
  return DEDICATED_TENANT_PROFILE_VALUES.has(normalized) ? normalized : fallback;
};

export const resolveDedicatedTenantProfile = (tenant = {}) => {
  const metadata = tenant?.metadata && typeof tenant.metadata === 'object' ? tenant.metadata : {};
  return normalizeDedicatedTenantProfile(
    tenant?.dedicated_tenant_profile ||
    metadata.dedicated_tenant_profile ||
    metadata.dedicated_profile
  );
};

export const shouldPreferDedicatedTenancy = (profile) => {
  const normalized = normalizeDedicatedTenantProfile(profile);
  return normalized !== DEDICATED_TENANT_PROFILES.LEGACY_HOLD;
};
