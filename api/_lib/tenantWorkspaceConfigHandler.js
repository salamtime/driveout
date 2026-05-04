import {
  PLATFORM_BUSINESS_SUBSCRIPTIONS_TABLE,
  PLATFORM_TENANTS_TABLE,
  createSupabaseClients,
} from './supabase.js';
import { getCachedWorkspaceReadiness, resolveWorkspaceReadiness } from './tenantWorkspaceReadiness.js';
import { normalizeTenantSchemaVersion } from './tenantSchemaRelease.js';
import { buildEffectiveTenantFeatureAccess, normalizeTenantPlanType } from '../../src/config/tenantPlans.js';

const DRIVEOUT_BASE_DOMAIN = 'driveout.io';
const RESERVED_SUBDOMAINS = new Set(['www', 'admin', 'app']);
const FIRST_PARTY_TENANT_HOSTS = new Set(['saharax.driveout.io']);
const FIRST_PARTY_TENANT_SLUGS = new Set(['saharax']);

const normalizeHostname = (value = '') => {
  const trimmed = String(value || '').trim().toLowerCase();
  if (!trimmed) return '';

  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).hostname.toLowerCase();
  } catch {
    return trimmed.split('/')[0].split(':')[0].toLowerCase();
  }
};

const normalizeUrl = (value = '') => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const getTenantSlugFromHostname = (hostname = '') => {
  const normalizedHostname = normalizeHostname(hostname);
  if (!normalizedHostname.endsWith(`.${DRIVEOUT_BASE_DOMAIN}`)) return '';

  const slug = normalizedHostname.slice(0, -(`.${DRIVEOUT_BASE_DOMAIN}`.length));
  return slug && !RESERVED_SUBDOMAINS.has(slug) ? slug : '';
};

const getUrlHostname = (value = '') => {
  try {
    return new URL(normalizeUrl(value)).hostname.toLowerCase();
  } catch {
    return '';
  }
};

const isMasterSupabaseUrl = (tenantApiUrl = '') => {
  const tenantHost = getUrlHostname(tenantApiUrl);
  const masterHost = getUrlHostname(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '');
  return Boolean(tenantHost && masterHost && tenantHost === masterHost);
};

const getInvalidTenantConfigReason = (tenant = {}) => {
  const projectRef = String(tenant.tenant_project_ref || '').trim();
  const apiUrl = normalizeUrl(tenant.tenant_api_url || '');
  const apiHostname = getUrlHostname(apiUrl);
  const anonKey = String(tenant.tenant_anon_key || '').trim();

  if (!projectRef || /placeholder|test2_project_ref/i.test(projectRef)) {
    return 'Workspace project reference is not a real Supabase project ref';
  }

  if (!apiUrl || !apiHostname.endsWith('.supabase.co') || /placeholder|test2_project_ref/i.test(apiHostname)) {
    return 'Workspace API URL is not a real Supabase project URL';
  }

  if (!anonKey || anonKey === 'test2_anon_key' || /placeholder/i.test(anonKey)) {
    return 'Workspace anon key is not configured';
  }

  return '';
};

const getProjectRefFromSupabaseUrl = (value = '') => {
  const hostname = getUrlHostname(value);
  return hostname.endsWith('.supabase.co') ? hostname.split('.')[0] || 'master' : 'master';
};

const extractTenantPublicFeatures = (featureAccess = {}) => ({
  public_storefront: featureAccess.public_storefront === true,
  online_booking: featureAccess.online_booking === true,
  multilingual_storefront: featureAccess.multilingual_storefront === true,
});

const getFirstPartyTenantConfig = ({ hostname, tenantSlug }) => {
  const normalizedHostname = normalizeHostname(hostname);
  const normalizedSlug = String(tenantSlug || '').trim().toLowerCase();

  if (!FIRST_PARTY_TENANT_HOSTS.has(normalizedHostname) || !FIRST_PARTY_TENANT_SLUGS.has(normalizedSlug)) {
    return null;
  }

  const apiUrl = normalizeUrl(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '');
  const anonKey = String(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();

  if (!apiUrl || !anonKey) {
    throw new Error('First-party SaharaX workspace configuration is incomplete.');
  }

  return {
    id: 'first-party-saharax',
    tenant_name: 'SaharaX',
    tenant_slug: 'saharax',
    tenant_status: 'active',
    tenant_project_ref: getProjectRefFromSupabaseUrl(apiUrl),
    tenant_app_url: `https://${normalizedHostname}`,
    tenant_api_url: apiUrl,
    tenant_anon_key: anonKey,
    schema_version: 'saharax_0u4w4d',
    first_party: true,
  };
};

const findTenantByHostname = async ({ adminClient, hostname, tenantSlug }) => {
  if (tenantSlug) {
    const { data, error } = await adminClient
      .from(PLATFORM_TENANTS_TABLE)
      .select('id, business_account_id, tenant_name, tenant_slug, tenant_status, tenant_project_ref, tenant_app_url, tenant_api_url, tenant_anon_key, schema_version, metadata')
      .eq('tenant_slug', tenantSlug)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  const { data, error } = await adminClient
    .from(PLATFORM_TENANTS_TABLE)
    .select('id, business_account_id, tenant_name, tenant_slug, tenant_status, tenant_project_ref, tenant_app_url, tenant_api_url, tenant_anon_key, schema_version, metadata')
    .ilike('tenant_app_url', `%${hostname}%`)
    .limit(10);

  if (error) throw error;

  return (data || []).find((tenant) => getUrlHostname(tenant.tenant_app_url) === hostname) || null;
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const requestedHostname = normalizeHostname(
    req.query?.hostname ||
    req.headers['x-forwarded-host'] ||
    req.headers.host ||
    ''
  );
  const tenantSlug = getTenantSlugFromHostname(requestedHostname);

  if (!requestedHostname || !tenantSlug) {
    res.status(400).json({ error: 'A tenant workspace hostname is required' });
    return;
  }

  try {
    const { adminClient } = createSupabaseClients();
    const tenant = getFirstPartyTenantConfig({ hostname: requestedHostname, tenantSlug })
      || await findTenantByHostname({ adminClient, hostname: requestedHostname, tenantSlug });

    if (!tenant) {
      res.status(404).json({
        error: 'Workspace unavailable',
        code: 'unknown_tenant',
        tenant_slug: tenantSlug,
      });
      return;
    }

    const tenantStatus = String(tenant.tenant_status || '').trim().toLowerCase();
    const appHostname = getUrlHostname(tenant.tenant_app_url);

    if (tenantStatus !== 'active') {
      res.status(409).json({
        error: 'Workspace is not active yet',
        code: tenantStatus === 'suspended' ? 'workspace_suspended' : 'workspace_inactive',
        tenant_status: tenantStatus || 'unknown',
      });
      return;
    }

    if (!tenant.tenant_project_ref || !tenant.tenant_app_url || !tenant.tenant_api_url || !tenant.tenant_anon_key) {
      res.status(409).json({
        error: 'Workspace configuration is incomplete',
        code: 'missing_tenant_config',
        tenant_status: tenantStatus,
      });
      return;
    }

    const invalidConfigReason = tenant.first_party ? '' : getInvalidTenantConfigReason(tenant);
    if (invalidConfigReason) {
      res.status(409).json({
        error: 'Workspace configuration is not ready',
        code: 'invalid_tenant_config',
        reason: invalidConfigReason,
      });
      return;
    }

    if (appHostname && appHostname !== requestedHostname) {
      res.status(409).json({
        error: 'Workspace hostname does not match tenant configuration',
        code: 'tenant_hostname_mismatch',
        expected_hostname: appHostname,
        received_hostname: requestedHostname,
      });
      return;
    }

    if (!tenant.first_party && isMasterSupabaseUrl(tenant.tenant_api_url)) {
      res.status(409).json({
        error: 'Workspace API URL points to the master project',
        code: 'master_project_config_rejected',
      });
      return;
    }

    if (!tenant.first_party) {
      let workspaceReadiness = getCachedWorkspaceReadiness(tenant);
      try {
        workspaceReadiness = await resolveWorkspaceReadiness({
          tenant,
          adminClient,
          forceFresh: !workspaceReadiness?.fresh || workspaceReadiness?.ready !== true,
          persist: true,
        });
      } catch (readinessError) {
        res.status(409).json({
          error: 'Workspace readiness could not be verified',
          code: 'workspace_readiness_unverified',
          reason: readinessError?.message || 'Unknown workspace readiness verification error',
        });
        return;
      }

      if (workspaceReadiness?.ready !== true) {
        const schemaIncomplete = workspaceReadiness?.schema_ready !== true;
        res.status(409).json({
          error: schemaIncomplete ? 'Workspace schema is not ready' : 'Workspace runtime is not ready',
          code: schemaIncomplete ? 'workspace_schema_incomplete' : 'workspace_runtime_incomplete',
          readiness: workspaceReadiness,
        });
        return;
      }
    }

    let effectivePlanType = 'pro';
    let publicFeatures = extractTenantPublicFeatures(
      buildEffectiveTenantFeatureAccess('pro', tenant?.metadata?.feature_access || {})
    );

    if (!tenant.first_party) {
      const { data: subscription, error: subscriptionError } = await adminClient
        .from(PLATFORM_BUSINESS_SUBSCRIPTIONS_TABLE)
        .select('plan_type')
        .eq('business_account_id', tenant.business_account_id)
        .maybeSingle();

      if (subscriptionError) {
        throw subscriptionError;
      }

      effectivePlanType = normalizeTenantPlanType(subscription?.plan_type || 'starter');
      publicFeatures = extractTenantPublicFeatures(
        buildEffectiveTenantFeatureAccess(
          effectivePlanType,
          tenant?.metadata?.feature_access && typeof tenant.metadata.feature_access === 'object'
            ? tenant.metadata.feature_access
            : {}
        )
      );
    }

    res.status(200).json({
      tenant: {
        id: tenant.id,
        name: tenant.tenant_name,
        slug: tenant.tenant_slug,
        status: tenantStatus,
        mode: tenant.first_party ? 'first_party' : 'tenant',
        projectRef: tenant.tenant_project_ref,
        appUrl: normalizeUrl(tenant.tenant_app_url),
        apiUrl: normalizeUrl(tenant.tenant_api_url),
        anonKey: tenant.tenant_anon_key,
        schemaVersion: normalizeTenantSchemaVersion(tenant.schema_version),
        planType: effectivePlanType,
        publicFeatures,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to resolve tenant workspace' });
  }
}
