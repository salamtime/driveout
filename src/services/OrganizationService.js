import { adminApiRequest } from './adminApi';
import { getHostContext, isFirstPartyTenantHost } from '../utils/hostContext';

export const BUSINESS_TENANT_TABLES = Object.freeze([
  'saharax_0u4w4d_vehicles',
  'app_4c3a7a6153_customers',
  'app_4c3a7a6153_rentals',
  'app_4c3a7a6153_base_prices',
  'app_4c3a7a6153_rental_km_packages',
  'app_4c3a7a6153_transport_fees',
  'app_4c3a7a6153_team_tasks',
  'app_4c3a7a6153_task_comments',
  'app_4c3a7a6153_task_notifications',
  'app_687f658e98_maintenance',
  'app_687f658e98_maintenance_parts',
  'app_687f658e98_tour_packages',
  'app_687f658e98_tour_bookings',
  'saharax_0u4w4d_inventory_items',
  'saharax_0u4w4d_inventory_movements',
  'saharax_0u4w4d_inventory_purchases',
  'saharax_0u4w4d_inventory_purchase_lines',
]);

export const getScopedOrganizationId = (userProfile) =>
  String(userProfile?.organizationId || userProfile?.organization_id || '').trim() || null;

export const isTenantScopedUser = (userProfile) =>
  String(userProfile?.role || '').toLowerCase() === 'business_owner' && Boolean(getScopedOrganizationId(userProfile));

export const applyOrganizationScope = (query, organizationId, columnName = 'organization_id') => {
  if (!organizationId) {
    return query;
  }

  return query.eq(columnName, organizationId);
};

export const shouldScopeSharedTenantData = (hostContext = getHostContext()) =>
  hostContext?.kind === 'tenant' && !isFirstPartyTenantHost(hostContext);

export const applyOrganizationMatch = (payload, organizationId, columnName = 'organization_id') => {
  if (!organizationId) {
    return payload;
  }

  return {
    ...payload,
    [columnName]: organizationId,
  };
};

const ORGANIZATION_CONTEXT_CACHE_TTL = 60 * 1000;

let organizationContextCache = {
  value: null,
  timestamp: 0,
  promise: null,
};

export const clearOrganizationContextCache = () => {
  organizationContextCache = {
    value: null,
    timestamp: 0,
    promise: null,
  };
};

export const getCurrentOrganizationContext = async () => {
  const now = Date.now();
  if (
    organizationContextCache.value &&
    now - organizationContextCache.timestamp < ORGANIZATION_CONTEXT_CACHE_TTL
  ) {
    return organizationContextCache.value;
  }

  if (organizationContextCache.promise) {
    return organizationContextCache.promise;
  }

  organizationContextCache.promise = (async () => {
    const hostContext = getHostContext();
    const shouldUseTenantSession = shouldScopeSharedTenantData(hostContext);

    const [profileResponse, tenantSessionResponse] = await Promise.all([
      adminApiRequest('/api/me/profile'),
      shouldUseTenantSession
        ? adminApiRequest('/api/tenants?resource=session').catch(() => null)
        : Promise.resolve(null),
    ]);

    const profile = profileResponse?.profile || null;
    const tenantSession = tenantSessionResponse?.session || null;

    if (!profile) {
      organizationContextCache.value = null;
      organizationContextCache.timestamp = Date.now();
      return null;
    }

    const tenantOrganizationId =
      String(tenantSession?.organization_id || tenantSession?.organizationId || '').trim() || null;

    const context = {
      organizationId: tenantOrganizationId || getScopedOrganizationId(profile),
      organizationName: profile.organization_name || profile.organizationName || '',
      organizationRole: profile.organization_role || profile.organizationRole || '',
      organizationStatus:
        tenantSession?.organization_status ||
        tenantSession?.tenant_status ||
        profile.organization_status ||
        profile.organizationStatus ||
        '',
      isPlatformOrganization:
        tenantOrganizationId
          ? false
          : Boolean(profile.is_platform_organization || profile.isPlatformOrganization),
    };
    organizationContextCache.value = context;
    organizationContextCache.timestamp = Date.now();
    return context;
  })();

  try {
    return await organizationContextCache.promise;
  } finally {
    organizationContextCache.promise = null;
  }
};

export const getCurrentOrganizationId = async () => {
  const context = await getCurrentOrganizationContext();
  return context?.organizationId || null;
};

export const requireCurrentOrganizationId = async (message = 'Workspace organization context is unavailable.') => {
  const organizationId = await getCurrentOrganizationId();
  if (!organizationId) {
    throw new Error(message);
  }
  return organizationId;
};
