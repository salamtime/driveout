import { adminApiRequest } from './adminApi';
import { buildTenantWorkspaceBootstrap } from './TenantWorkspaceService';
import { buildEffectiveTenantFeatureAccess } from '../config/tenantPlans';

export const getTenantSession = async () => {
  const response = await adminApiRequest('/api/tenants?resource=session');
  const session = response?.session || null;

  if (!session) {
    return null;
  }

  return {
    ...buildTenantWorkspaceBootstrap({
      tenant: {
        ...(session.tenant || {}),
        id: session?.tenant_id || session?.tenant?.id || null,
        tenant_slug: session?.tenant_slug || session?.tenant?.tenant_slug || '',
        tenant_name: session?.tenant_name || session?.tenant?.tenant_name || '',
        tenant_status: session?.tenant_status || session?.tenant?.tenant_status || 'pending',
        tenancy_mode: session?.tenancy_mode || session?.tenant?.tenancy_mode || 'shared',
        organization_id: session?.organization_id || session?.tenant?.organization_id || null,
        organization_slug: session?.organization_slug || session?.tenant?.organization_slug || '',
        legacy_dedicated_infrastructure:
          session?.legacy_dedicated_infrastructure ||
          session?.tenant?.legacy_dedicated_infrastructure ||
          null,
      },
      subscription: session.subscription,
      businessAccount: session.business_account,
    }),
    workspaceState: session.workspace_state || 'pending',
    provisioningJob: session.provisioning_job || null,
    tenant: session.tenant || null,
    subscription: session.subscription || null,
    businessAccount: session.business_account || null,
    featureAccess:
      session?.feature_access && typeof session.feature_access === 'object'
        ? session.feature_access
        : session?.tenant?.metadata?.feature_access && typeof session.tenant.metadata.feature_access === 'object'
          ? session.tenant.metadata.feature_access
        : {},
    tenantSettings:
      session?.tenant?.metadata?.tenant_settings && typeof session.tenant.metadata.tenant_settings === 'object'
        ? session.tenant.metadata.tenant_settings
        : {},
    commercialSettings:
      session?.tenant?.metadata?.commercial_settings && typeof session.tenant.metadata.commercial_settings === 'object'
        ? session.tenant.metadata.commercial_settings
        : {},
    effectiveFeatureAccess:
      session?.effective_feature_access && typeof session.effective_feature_access === 'object'
        ? session.effective_feature_access
        : session?.tenant?.metadata?.effective_feature_access && typeof session.tenant.metadata.effective_feature_access === 'object'
          ? session.tenant.metadata.effective_feature_access
        : buildEffectiveTenantFeatureAccess(
            session?.plan_type || session?.subscription?.plan_type || 'starter',
            session?.feature_access || session?.tenant?.metadata?.feature_access || {}
          ),
    tenantId: session?.tenant_id || session?.tenant?.id || null,
    tenantSlug: session?.tenant_slug || session?.tenant?.tenant_slug || '',
    tenantName: session?.tenant_name || session?.tenant?.tenant_name || '',
    tenantStatus: session?.tenant_status || session?.tenant?.tenant_status || 'pending',
    tenancyMode: session?.tenancy_mode || session?.tenant?.tenancy_mode || 'shared',
    organizationId: session?.organization_id || null,
    organizationSlug: session?.organization_slug || '',
    legacyDedicatedInfrastructure:
      session?.legacy_dedicated_infrastructure ||
      session?.tenant?.legacy_dedicated_infrastructure ||
      null,
    planType: session?.plan_type || session?.subscription?.plan_type || 'starter',
    publicFeatures:
      session?.public_features && typeof session.public_features === 'object'
        ? session.public_features
        : null,
    lifecycle:
      session?.lifecycle && typeof session.lifecycle === 'object'
        ? session.lifecycle
        : null,
    automaticSignupMode: session?.automatic_signup_mode !== false,
    platformAccess:
      session?.platform_access && typeof session.platform_access === 'object'
        ? session.platform_access
        : null,
  };
};

export const getTenantWorkspaceLaunchUrl = (session) =>
  session?.tenantAppUrl || session?.tenantApiUrl || '';
