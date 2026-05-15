import { adminApiRequest } from './adminApi';
import { getHostContext, isFirstPartyTenantHost } from '../utils/hostContext';

export const BUSINESS_TENANT_TABLES = Object.freeze([
  'saharax_0u4w4d_vehicles',
  'saharax_0u4w4d_vehicle_models',
  'app_4c3a7a6153_customers',
  'app_4c3a7a6153_rentals',
  'app_4c3a7a6153_base_prices',
  'app_4c3a7a6153_rental_km_packages',
  'app_4c3a7a6153_transport_fees',
  'pricing_tiers',
  'rental_extension_rules',
  'package_vehicle_type_mapping',
  'fuel_pricing',
  'app_4c3a7a6153_team_tasks',
  'app_4c3a7a6153_task_comments',
  'app_4c3a7a6153_task_notifications',
  'app_4c3a7a6153_vehicle_reports',
  'rental_extensions',
  'app_b30c02e74da644baad4668e3587d86b1_tours',
  'app_687f658e98_maintenance',
  'app_687f658e98_maintenance_parts',
  'app_687f658e98_tour_packages',
  'app_687f658e98_tour_package_model_prices',
  'app_687f658e98_tour_bookings',
  'tour_vehicle_snapshots',
  'saharax_0u4w4d_inventory_items',
  'saharax_0u4w4d_inventory_movements',
  'saharax_0u4w4d_inventory_purchases',
  'saharax_0u4w4d_inventory_purchase_lines',
  'fuel_tank',
  'fuel_refills',
  'vehicle_fuel_refills',
  'fuel_withdrawals',
  'vehicle_fuel_state',
  'fuel_operation_logs',
  'fuel_transactions_default_feed',
  'finance_expenses',
  'app_wallet_accounts',
  'app_wallet_transactions',
  'app_payment_proofs',
  'wallet_topups',
]);

const BUSINESS_TENANT_TABLE_SET = new Set(BUSINESS_TENANT_TABLES);

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

export const isTenantOwnedSharedTable = (tableName = '') =>
  BUSINESS_TENANT_TABLE_SET.has(String(tableName || '').trim());

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

export const scopeTenantOwnedQuery = async (
  query,
  tableName,
  {
    columnName = 'organization_id',
    organizationId = null,
    message = null,
  } = {},
) => {
  if (!shouldScopeSharedTenantData() || !isTenantOwnedSharedTable(tableName)) {
    return query;
  }

  const resolvedOrganizationId = organizationId || await requireCurrentOrganizationId(
    message || `Workspace organization context is required for ${tableName}.`
  );

  return applyOrganizationScope(query, resolvedOrganizationId, columnName);
};

export const matchTenantOwnedPayload = async (
  payload,
  tableName,
  {
    columnName = 'organization_id',
    organizationId = null,
    message = null,
  } = {},
) => {
  if (!shouldScopeSharedTenantData() || !isTenantOwnedSharedTable(tableName)) {
    return payload;
  }

  const resolvedOrganizationId = organizationId || await requireCurrentOrganizationId(
    message || `Workspace organization context is required for ${tableName}.`
  );

  return applyOrganizationMatch(payload, resolvedOrganizationId, columnName);
};

const normalizeOrganizationValue = (value) => String(value || '').trim();

export const verifyTenantOwnedRows = async (
  rows,
  tableName,
  {
    columnName = 'organization_id',
    organizationId = null,
    message = null,
  } = {},
) => {
  if (!shouldScopeSharedTenantData() || !isTenantOwnedSharedTable(tableName)) {
    return rows;
  }

  const resolvedOrganizationId = normalizeOrganizationValue(
    organizationId || await requireCurrentOrganizationId(
      message || `Workspace organization context is required for ${tableName}.`
    )
  );

  const records = Array.isArray(rows)
    ? rows
    : rows && typeof rows === 'object'
      ? [rows]
      : [];

  for (const record of records) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      continue;
    }

    if (!(columnName in record)) {
      throw new Error(
        message || `${tableName} responses must include ${columnName} for shared tenant verification.`
      );
    }

    if (normalizeOrganizationValue(record[columnName]) !== resolvedOrganizationId) {
      throw new Error(
        message || `${tableName} returned data outside the active workspace organization.`
      );
    }
  }

  return rows;
};
