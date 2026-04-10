import {
  PLATFORM_BUSINESS_ACCOUNTS_TABLE,
  PLATFORM_BUSINESS_SUBSCRIPTIONS_TABLE,
  PLATFORM_TENANTS_TABLE,
  PLATFORM_TENANT_PROVISIONING_JOBS_TABLE,
} from './supabase.js';

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
  if (['starter', 'growth', 'pro'].includes(normalized)) {
    return normalized;
  }
  return fallback;
};

export const buildTenantSlug = ({ email = '', userId = '', companyName = '' }) => {
  const base = String(companyName || email || userId || 'tenant')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const suffix = String(userId || '').replace(/-/g, '').slice(0, 8);
  return `biz-${base.slice(0, 40) || 'tenant'}${suffix ? `-${suffix}` : ''}`;
};

export const PLATFORM_TENANT_REGISTRY_TABLES = {
  businessAccounts: PLATFORM_BUSINESS_ACCOUNTS_TABLE,
  subscriptions: PLATFORM_BUSINESS_SUBSCRIPTIONS_TABLE,
  tenants: PLATFORM_TENANTS_TABLE,
  provisioningJobs: PLATFORM_TENANT_PROVISIONING_JOBS_TABLE,
};
