import {
  ORGANIZATIONS_TABLE,
  PLATFORM_BUSINESS_ACCOUNTS_TABLE,
  PLATFORM_BUSINESS_SUBSCRIPTIONS_TABLE,
  PLATFORM_TENANTS_TABLE,
  createSupabaseClients,
  getSharedSupabaseTenantConfig,
} from './supabase.js';
import { requireOwnerOrAdmin } from './auth.js';
import { getCachedWorkspaceReadiness, resolveWorkspaceReadiness } from './tenantWorkspaceReadiness.js';
import { normalizeTenantSchemaVersion } from './tenantSchemaRelease.js';
import { buildEffectiveTenantFeatureAccess, normalizeTenantPlanType } from '../../src/config/tenantPlans.js';
import { resolveTenantTenancyMode, runPlatformTenantUpdateWithModeFallback } from './tenantRegistry.js';
import { buildLegacyDedicatedInfrastructure } from './legacyDedicatedTenant.js';
import { getTenantSlugFromHostname, normalizeHostname } from './tenantHostResolution.js';

const FIRST_PARTY_TENANT_HOSTS = new Set(['saharax.driveout.io']);
const FIRST_PARTY_TENANT_SLUGS = new Set(['saharax']);

const normalizeUrl = (value = '') => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
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

const getTenantMetadata = (tenant = {}) => (
  tenant?.metadata && typeof tenant.metadata === 'object' ? tenant.metadata : {}
);

const sanitizeWorkspaceDepositSettings = (settings = {}) => {
  const source = settings && typeof settings === 'object' ? settings : {};
  const normalized = {};

  if (typeof source.allow_custom_deposit === 'boolean') {
    normalized.allow_custom_deposit = source.allow_custom_deposit;
  }

  if (source.damage_deposit_presets && typeof source.damage_deposit_presets === 'object' && !Array.isArray(source.damage_deposit_presets)) {
    normalized.damage_deposit_presets = Object.entries(source.damage_deposit_presets).reduce((acc, [vehicleModelId, rawPresets]) => {
      if (!String(vehicleModelId || '').trim()) {
        return acc;
      }

      const normalizedPresets = Array.isArray(rawPresets)
        ? rawPresets
            .map((preset) => {
              if (!preset || typeof preset !== 'object') return null;

              const label = String(preset.label || '').trim();
              if (!label) return null;

              const amount = Number(preset.amount || 0);
              return {
                label,
                amount: Number.isFinite(amount) && amount >= 0 ? amount : 0,
                enabled: Boolean(preset.enabled),
                isDefault: Boolean(preset.isDefault ?? preset.is_default),
              };
            })
            .filter(Boolean)
            .slice(0, 3)
        : [];

      acc[String(vehicleModelId)] = normalizedPresets;

      return acc;
    }, {});
  }

  return normalized;
};

const getTenantConnectionConfig = (tenant = {}) => {
  const tenancyMode = resolveTenantTenancyMode(tenant);
  if (tenancyMode === 'shared') {
    const sharedConfig = getSharedSupabaseTenantConfig();
    return {
      tenancyMode,
      projectRef: sharedConfig.projectRef,
      apiUrl: normalizeUrl(sharedConfig.apiUrl),
      anonKey: sharedConfig.anonKey,
      appUrl: normalizeUrl(tenant.tenant_app_url),
    };
  }

  return {
    tenancyMode,
    projectRef: String(tenant.tenant_project_ref || '').trim(),
    apiUrl: normalizeUrl(tenant.tenant_api_url || ''),
    anonKey: String(tenant.tenant_anon_key || '').trim(),
    appUrl: normalizeUrl(tenant.tenant_app_url),
  };
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

  if (businessAccountError) {
    throw businessAccountError;
  }

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

  if (organizationError) {
    throw organizationError;
  }

  return {
    organizationId: String(organization?.id || '').trim() || null,
    organizationSlug: String(organization?.slug || '').trim() || null,
  };
};

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
    tenancy_mode: 'shared',
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

  const requestedHostInput = String(
    req.query?.hostname ||
    req.headers['x-forwarded-host'] ||
    req.headers.host ||
    ''
  ).trim();
  const requestedHostname = normalizeHostname(requestedHostInput);
  const tenantSlug = getTenantSlugFromHostname(requestedHostInput);

  if (req.method === 'PATCH') {
    if (String(req.query?.action || '').trim().toLowerCase() !== 'deposit-presets') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    if (!requestedHostname || !tenantSlug) {
      res.status(400).json({ error: 'A tenant workspace hostname is required' });
      return;
    }

    const auth = await requireOwnerOrAdmin(req);
    if (auth.error) {
      res.status(auth.error.status).json(auth.error.body);
      return;
    }

    try {
      const { adminClient, tenantRuntime } = auth;
      const tenant = await findTenantByHostname({ adminClient, hostname: requestedHostname, tenantSlug });

      if (!tenant) {
        res.status(404).json({
          error: 'Workspace unavailable',
          code: 'unknown_tenant',
          tenant_slug: tenantSlug,
        });
        return;
      }

      if (resolveTenantTenancyMode(tenant) !== 'shared' || tenant.first_party) {
        res.status(409).json({
          error: 'This workspace does not use shared-tenant deposit preset storage.',
        });
        return;
      }

      const runtimeTenantId = String(tenantRuntime?.id || '').trim();
      const runtimeTenantSlug = String(tenantRuntime?.tenant_slug || tenantRuntime?.slug || '').trim().toLowerCase();
      const matchedTenantId = String(tenant.id || '').trim();
      const matchedTenantSlug = String(tenant.tenant_slug || '').trim().toLowerCase();
      const matchesRuntimeTenant =
        (runtimeTenantId && matchedTenantId && runtimeTenantId === matchedTenantId) ||
        (runtimeTenantSlug && matchedTenantSlug && runtimeTenantSlug === matchedTenantSlug);

      if (!matchesRuntimeTenant) {
        res.status(403).json({ error: 'Tenant workspace context mismatch' });
        return;
      }

      const settingsPatch = sanitizeWorkspaceDepositSettings(req.body?.settings);
      if (Object.keys(settingsPatch).length === 0) {
        res.status(400).json({ error: 'No valid deposit settings were provided.' });
        return;
      }

      const existingMetadata = getTenantMetadata(tenant);
      const existingTenantSettings =
        existingMetadata?.tenant_settings && typeof existingMetadata.tenant_settings === 'object'
          ? existingMetadata.tenant_settings
          : {};

      const nextMetadata = {
        ...existingMetadata,
        tenant_settings: {
          ...existingTenantSettings,
          ...settingsPatch,
        },
      };

      const { data: updatedTenant, error: updateError } = await runPlatformTenantUpdateWithModeFallback(
        (payload) => adminClient
          .from(PLATFORM_TENANTS_TABLE)
          .update(payload)
          .eq('id', tenant.id)
          .select('id, metadata')
          .maybeSingle(),
        { metadata: nextMetadata }
      );

      if (updateError) {
        throw updateError;
      }

      const updatedMetadata = getTenantMetadata(updatedTenant);
      res.status(200).json({
        success: true,
        settings:
          updatedMetadata?.tenant_settings && typeof updatedMetadata.tenant_settings === 'object'
            ? updatedMetadata.tenant_settings
            : {},
      });
      return;
    } catch (error) {
      res.status(500).json({ error: error.message || 'Failed to update workspace deposit presets' });
      return;
    }
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

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
    const tenantConnection = getTenantConnectionConfig(tenant);
    const legacyDedicatedInfrastructure = buildLegacyDedicatedInfrastructure({
      ...tenant,
      tenant_project_ref: tenantConnection.projectRef,
      tenant_app_url: tenantConnection.appUrl,
      tenant_api_url: tenantConnection.apiUrl,
      tenant_anon_key: tenantConnection.anonKey,
    });

    if (tenantStatus !== 'active') {
      res.status(409).json({
        error: 'Workspace is not active yet',
        code: tenantStatus === 'suspended' ? 'workspace_suspended' : 'workspace_inactive',
        tenant_status: tenantStatus || 'unknown',
      });
      return;
    }

    if (!tenantConnection.projectRef || !tenantConnection.appUrl || !tenantConnection.apiUrl || !tenantConnection.anonKey) {
      res.status(409).json({
        error: 'Workspace configuration is incomplete',
        code: 'missing_tenant_config',
        tenant_status: tenantStatus,
      });
      return;
    }

    const invalidConfigReason = tenant.first_party || tenantConnection.tenancyMode === 'shared'
      ? ''
      : getInvalidTenantConfigReason({
        ...tenant,
        tenant_project_ref: tenantConnection.projectRef,
        tenant_api_url: tenantConnection.apiUrl,
        tenant_anon_key: tenantConnection.anonKey,
      });
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

    if (!tenant.first_party && tenantConnection.tenancyMode !== 'shared' && isMasterSupabaseUrl(tenantConnection.apiUrl)) {
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
          tenant: {
            ...tenant,
            tenant_project_ref: tenantConnection.projectRef,
            tenant_api_url: tenantConnection.apiUrl,
            tenant_anon_key: tenantConnection.anonKey,
          },
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

    const tenantMetadata = getTenantMetadata(tenant);
    let effectivePlanType = 'pro';
    let featureAccessOverrides = tenantMetadata?.feature_access && typeof tenantMetadata.feature_access === 'object'
      ? tenantMetadata.feature_access
      : {};
    let effectiveFeatureAccess = buildEffectiveTenantFeatureAccess('pro', featureAccessOverrides);
    let publicFeatures = extractTenantPublicFeatures(effectiveFeatureAccess);
    let organizationContext = {
      organizationId: null,
      organizationSlug: null,
    };

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
      effectiveFeatureAccess = buildEffectiveTenantFeatureAccess(
        effectivePlanType,
        featureAccessOverrides
      );
      publicFeatures = extractTenantPublicFeatures(effectiveFeatureAccess);
      if (tenantConnection.tenancyMode === 'shared') {
        organizationContext = await resolveTenantOrganizationContext({
          adminClient,
          tenant,
        });
      }
    }

    res.status(200).json({
      tenant: {
        id: tenant.id,
        name: tenant.tenant_name,
        slug: tenant.tenant_slug,
        status: tenantStatus,
        mode: tenant.first_party ? 'first_party' : 'tenant',
        tenancyMode: tenantConnection.tenancyMode,
        organizationId: organizationContext.organizationId,
        organizationSlug: organizationContext.organizationSlug,
        legacyDedicatedInfrastructure,
        projectRef: tenantConnection.projectRef,
        appUrl: tenantConnection.appUrl,
        apiUrl: tenantConnection.apiUrl,
        anonKey: tenantConnection.anonKey,
        schemaVersion: normalizeTenantSchemaVersion(tenant.schema_version),
        planType: effectivePlanType,
        featureAccess: featureAccessOverrides,
        effectiveFeatureAccess,
        tenantSettings:
          tenantMetadata?.tenant_settings && typeof tenantMetadata.tenant_settings === 'object'
            ? tenantMetadata.tenant_settings
            : {},
        commercialSettings:
          tenantMetadata?.commercial_settings && typeof tenantMetadata.commercial_settings === 'object'
            ? tenantMetadata.commercial_settings
            : {},
        publicFeatures,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to resolve tenant workspace' });
  }
}
