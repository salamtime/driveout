import {
  APP_USERS_TABLE,
  ORGANIZATION_MEMBERS_TABLE,
  ORGANIZATIONS_TABLE,
  PLATFORM_BUSINESS_ACCOUNTS_TABLE,
  PLATFORM_TENANTS_TABLE,
} from './supabase.js';
import {
  resolveTenantTenancyMode,
  runPlatformTenantSelectWithModeFallback,
} from './tenantRegistry.js';
import {
  buildTenantHostnameCandidates,
  getTenantSlugFromHostname,
  normalizeHostname,
} from './tenantHostResolution.js';

const normalizeUrlHostname = (value = '') => {
  try {
    return new URL(/^https?:\/\//i.test(String(value || '').trim()) ? String(value).trim() : `https://${String(value || '').trim()}`).hostname.toLowerCase();
  } catch {
    return '';
  }
};

export const getRequestedHostname = (req, payload = null) =>
  String(
    payload?.hostname ||
    req.query?.hostname ||
    req.headers['x-forwarded-host'] ||
    req.headers.host ||
    ''
  ).trim().toLowerCase();

const getTenantMetadata = (tenant = {}) => (
  tenant?.metadata && typeof tenant.metadata === 'object' ? tenant.metadata : {}
);

const findTenantByHostname = async ({ adminClient, hostname }) => {
  const tenantSlug = getTenantSlugFromHostname(hostname);
  if (!tenantSlug) return null;

  const { data: bySlug, error: slugError } = await runPlatformTenantSelectWithModeFallback((selectClause) =>
    adminClient
      .from(PLATFORM_TENANTS_TABLE)
      .select(selectClause)
      .eq('tenant_slug', tenantSlug)
      .maybeSingle()
  );

  if (slugError) throw slugError;
  if (bySlug) return bySlug;

  const hostnameCandidates = buildTenantHostnameCandidates(hostname);
  const { data, error } = await runPlatformTenantSelectWithModeFallback((selectClause) =>
    adminClient
      .from(PLATFORM_TENANTS_TABLE)
      .select(selectClause)
      .limit(100)
  );

  if (error) throw error;

  return (
    (data || []).find((tenant) => {
      const tenantUrlHostname = normalizeUrlHostname(tenant.tenant_app_url);
      const normalizedTenantSlug = String(tenant?.tenant_slug || '').trim().toLowerCase();

      return hostnameCandidates.includes(tenantUrlHostname) || (tenantSlug && normalizedTenantSlug === tenantSlug);
    }) || null
  );
};

const resolveTenantOrganizationContext = async ({ adminClient, tenant }) => {
  const tenancyMode = resolveTenantTenancyMode(tenant);
  if (tenancyMode !== 'shared') {
    return {
      organizationId: null,
      organizationSlug: null,
    };
  }

  const metadata = getTenantMetadata(tenant);
  const metadataOrganizationId = String(
    metadata.organization_id ||
    metadata.shared_organization_id ||
    ''
  ).trim();
  const metadataOrganizationSlug = String(
    metadata.organization_slug ||
    metadata.shared_organization_slug ||
    ''
  ).trim();

  if (metadataOrganizationId || metadataOrganizationSlug) {
    return {
      organizationId: metadataOrganizationId || null,
      organizationSlug: metadataOrganizationSlug || null,
    };
  }

  const businessAccountId = String(tenant?.business_account_id || '').trim();
  if (!businessAccountId) {
    return {
      organizationId: null,
      organizationSlug: null,
    };
  }

  const { data: businessAccount, error: businessAccountError } = await adminClient
    .from(PLATFORM_BUSINESS_ACCOUNTS_TABLE)
    .select('auth_user_id')
    .eq('id', businessAccountId)
    .maybeSingle();

  if (businessAccountError) throw businessAccountError;

  const ownerUserId = String(businessAccount?.auth_user_id || '').trim();
  if (!ownerUserId) {
    return {
      organizationId: null,
      organizationSlug: null,
    };
  }

  const { data: organization, error: organizationError } = await adminClient
    .from(ORGANIZATIONS_TABLE)
    .select('id, slug')
    .eq('owner_user_id', ownerUserId)
    .eq('is_platform_organization', false)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (organizationError) throw organizationError;

  return {
    organizationId: String(organization?.id || '').trim() || null,
    organizationSlug: String(organization?.slug || '').trim() || null,
  };
};

export const resolveRequestTenantScope = async ({
  req,
  adminClient,
  tenantRuntime = null,
  payload = null,
} = {}) => {
  const requestedHostname = getRequestedHostname(req, payload);
  const runtimeTenant = tenantRuntime || null;
  const tenant = runtimeTenant || (requestedHostname ? await findTenantByHostname({ adminClient, hostname: requestedHostname }) : null);
  const tenancyMode = resolveTenantTenancyMode(tenant || {});
  const organizationContext = tenant
    ? await resolveTenantOrganizationContext({ adminClient, tenant })
    : { organizationId: null, organizationSlug: null };

  return {
    requestedHostname,
    tenant,
    tenantSlug: String(tenant?.tenant_slug || getTenantSlugFromHostname(requestedHostname) || '').trim() || null,
    tenancyMode,
    organizationId: organizationContext.organizationId,
    organizationSlug: organizationContext.organizationSlug,
    isShared: tenancyMode === 'shared' && Boolean(organizationContext.organizationId),
  };
};

export const applyTenantQueryScope = (query, tenantScope, columnName = 'organization_id') => {
  if (!tenantScope?.isShared || !tenantScope?.organizationId) {
    return query;
  }

  return query.eq(columnName, tenantScope.organizationId);
};

export const stampTenantPayload = (payload = {}, tenantScope, columnName = 'organization_id') => {
  if (!tenantScope?.isShared || !tenantScope?.organizationId) {
    return payload;
  }

  return {
    ...payload,
    [columnName]: tenantScope.organizationId,
  };
};

export const assertUserInTenantScope = async ({
  adminClient,
  userId,
  tenantScope,
} = {}) => {
  if (!tenantScope?.isShared || !tenantScope?.organizationId || !userId) {
    return true;
  }

  const normalizedUserId = String(userId || '').trim();
  const normalizedOrganizationId = String(tenantScope.organizationId || '').trim();
  if (!normalizedUserId || !normalizedOrganizationId) {
    return false;
  }

  const { data: profile, error: profileError } = await adminClient
    .from(APP_USERS_TABLE)
    .select('id, primary_organization_id')
    .eq('id', normalizedUserId)
    .maybeSingle();

  if (profileError) throw profileError;

  if (String(profile?.primary_organization_id || '').trim() === normalizedOrganizationId) {
    return true;
  }

  const { data: membership, error: membershipError } = await adminClient
    .from(ORGANIZATION_MEMBERS_TABLE)
    .select('organization_id, membership_status')
    .eq('user_id', normalizedUserId)
    .eq('organization_id', normalizedOrganizationId)
    .maybeSingle();

  if (membershipError) throw membershipError;

  return Boolean(
    membership?.organization_id &&
    String(membership.membership_status || '').trim().toLowerCase() !== 'inactive'
  );
};
