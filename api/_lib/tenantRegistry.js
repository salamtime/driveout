import {
  PLATFORM_BUSINESS_ACCOUNTS_TABLE,
  PLATFORM_BUSINESS_SUBSCRIPTIONS_TABLE,
  PLATFORM_TENANTS_TABLE,
  PLATFORM_TENANT_PROVISIONING_JOBS_TABLE,
} from './supabase.js';
import {
  DEFAULT_TENANCY_MODE,
  LEGACY_TENANCY_MODE,
  TENANCY_MODES,
  normalizeTenancyMode,
  resolveTenantTenancyMode,
} from './tenancyMode.js';

export const BUSINESS_OWNER_ACCOUNT_TYPES = new Set([
  'business_owner',
  'operator',
  'business',
  'rental_business',
]);

export const normalizeBusinessAccountType = (value) =>
  String(value || '').trim().toLowerCase();

export const isBusinessOwnerAccountType = (value) =>
  BUSINESS_OWNER_ACCOUNT_TYPES.has(normalizeBusinessAccountType(value));

export const normalizeRegistryStatus = (value, fallback = 'pending') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (['pending', 'approved', 'rejected', 'needs_info', 'suspended'].includes(normalized)) {
    return normalized;
  }
  return fallback;
};

export const normalizeSubscriptionStatus = (value, fallback = 'trial') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (['trial', 'active', 'expired', 'cancelled', 'suspended'].includes(normalized)) {
    return normalized;
  }
  return fallback;
};

export const normalizeBillingStatus = (value, fallback = 'none') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (['none', 'active', 'failed'].includes(normalized)) {
    return normalized;
  }
  return fallback;
};

export const normalizePlanType = (value, fallback = 'starter') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (['free', 'starter', 'growth', 'pro'].includes(normalized)) {
    return normalized;
  }
  return fallback;
};

export const getTenantTrialDays = () => {
  const raw = Number(process.env.TENANT_TRIAL_DAYS || 30);
  return Number.isFinite(raw) && raw > 0 ? Math.max(1, Math.floor(raw)) : 30;
};

export const getTenantDeletionRetentionDays = () => {
  const raw = Number(process.env.TENANT_DELETION_RETENTION_DAYS || 90);
  return Number.isFinite(raw) && raw > 0 ? Math.max(1, Math.floor(raw)) : 90;
};

export const buildTrialWindow = ({ startAt = new Date(), trialDays = getTenantTrialDays() } = {}) => {
  const startedAt = startAt instanceof Date ? startAt : new Date(startAt);
  const safeStartedAt = Number.isNaN(startedAt.getTime()) ? new Date() : startedAt;
  const endsAt = new Date(safeStartedAt.getTime() + trialDays * 24 * 60 * 60 * 1000);

  return {
    trialStartedAt: safeStartedAt.toISOString(),
    trialEndsAt: endsAt.toISOString(),
    trialDays,
  };
};

export const resolveEffectiveSubscriptionStatus = (subscription = {}, now = new Date()) => {
  const explicitStatus = normalizeSubscriptionStatus(subscription?.subscription_status || 'trial');
  if (['expired', 'cancelled', 'suspended'].includes(explicitStatus)) {
    return explicitStatus;
  }

  const trialEndsAt = String(subscription?.trial_ends_at || '').trim();
  if (explicitStatus === 'trial' && trialEndsAt) {
    const expiry = new Date(trialEndsAt);
    if (!Number.isNaN(expiry.getTime()) && expiry.getTime() <= now.getTime()) {
      return 'expired';
    }
  }

  return explicitStatus;
};

export const sanitizeTenantSlug = (value = '', fallback = 'tenant') => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return normalized || fallback;
};

export const buildTenantSlug = ({ email = '', userId = '', companyName = '' }) => {
  const emailLocalPart = String(email || '').split('@')[0] || '';
  return sanitizeTenantSlug(companyName || emailLocalPart || userId || 'tenant');
};

export const buildTenantAppUrl = (tenantSlug, rootDomain = process.env.TENANT_ROOT_DOMAIN || 'driveout.io') => {
  const slug = sanitizeTenantSlug(tenantSlug);
  const domain = String(rootDomain || 'driveout.io').trim().toLowerCase().replace(/^\*\./, '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return `https://${slug}.${domain}`;
};

export const PLATFORM_TENANT_REGISTRY_TABLES = {
  businessAccounts: PLATFORM_BUSINESS_ACCOUNTS_TABLE,
  subscriptions: PLATFORM_BUSINESS_SUBSCRIPTIONS_TABLE,
  tenants: PLATFORM_TENANTS_TABLE,
  provisioningJobs: PLATFORM_TENANT_PROVISIONING_JOBS_TABLE,
};

export const PLATFORM_TENANT_BASE_SELECT = [
  'id',
  'business_account_id',
  'tenant_name',
  'tenant_slug',
  'tenant_status',
  'tenant_project_ref',
  'tenant_app_url',
  'tenant_api_url',
  'tenant_anon_key',
  'schema_version',
  'metadata',
].join(', ');

export const PLATFORM_TENANT_SELECT_WITH_TENANCY_MODE = `${PLATFORM_TENANT_BASE_SELECT}, tenancy_mode`;

export const isMissingPlatformTenantColumnError = (error, columnName = 'tenancy_mode') => {
  const code = String(error?.code || '').trim().toUpperCase();
  const message = String(error?.message || '').trim().toLowerCase();
  const details = String(error?.details || '').trim().toLowerCase();
  const normalizedColumn = String(columnName || '').trim().toLowerCase();

  return (
    code === 'PGRST204' ||
    code === '42703' ||
    message.includes(`could not find the '${normalizedColumn}' column`) ||
    message.includes(`column ${normalizedColumn}`) ||
    details.includes(`column ${normalizedColumn}`) ||
    message.includes('schema cache') ||
    details.includes('schema cache')
  );
};

const normalizePlatformTenantRecord = (tenant = null) => {
  if (!tenant || typeof tenant !== 'object') {
    return tenant;
  }

  const resolvedTenancyMode = resolveTenantTenancyMode(tenant);

  return {
    ...tenant,
    tenancy_mode: resolvedTenancyMode,
    metadata:
      tenant?.metadata && typeof tenant.metadata === 'object'
        ? {
            ...tenant.metadata,
            tenancy_mode:
              tenant.metadata.tenancy_mode ||
              resolvedTenancyMode,
          }
        : {
            tenancy_mode: resolvedTenancyMode,
          },
  };
};

const normalizePlatformTenantData = (data) => {
  if (Array.isArray(data)) {
    return data.map((tenant) => normalizePlatformTenantRecord(tenant));
  }

  return normalizePlatformTenantRecord(data);
};

export const runPlatformTenantSelectWithModeFallback = async (buildQuery) => {
  let result = await buildQuery(PLATFORM_TENANT_SELECT_WITH_TENANCY_MODE);

  if (result?.error && isMissingPlatformTenantColumnError(result.error, 'tenancy_mode')) {
    result = await buildQuery(PLATFORM_TENANT_BASE_SELECT);
  }

  if (!result?.error) {
    return {
      ...result,
      data: normalizePlatformTenantData(result?.data),
    };
  }

  return result;
};

export const runPlatformTenantUpdateWithModeFallback = async (buildQuery, payload = {}) => {
  let result = await buildQuery(payload);

  if (
    result?.error &&
    Object.prototype.hasOwnProperty.call(payload, 'tenancy_mode') &&
    isMissingPlatformTenantColumnError(result.error, 'tenancy_mode')
  ) {
    const fallbackPayload = { ...payload };
    delete fallbackPayload.tenancy_mode;
    result = await buildQuery(fallbackPayload);
  }

  return result;
};

export {
  DEFAULT_TENANCY_MODE,
  LEGACY_TENANCY_MODE,
  TENANCY_MODES,
  normalizeTenancyMode,
  resolveTenantTenancyMode,
};
