import { adminApiRequest } from './adminApi';
import { buildTenantWorkspaceBootstrap } from './TenantWorkspaceService';

export const getTenantSession = async () => {
  const response = await adminApiRequest('/api/tenants?resource=session');
  const session = response?.session || null;

  if (!session) {
    return null;
  }

  return {
    ...buildTenantWorkspaceBootstrap({
      tenant: session.tenant,
      subscription: session.subscription,
      businessAccount: session.business_account,
    }),
    workspaceState: session.workspace_state || 'pending',
    provisioningJob: session.provisioning_job || null,
    tenant: session.tenant || null,
    subscription: session.subscription || null,
    businessAccount: session.business_account || null,
    featureAccess:
      session?.tenant?.metadata?.feature_access && typeof session.tenant.metadata.feature_access === 'object'
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
    lifecycle:
      session?.lifecycle && typeof session.lifecycle === 'object'
        ? session.lifecycle
        : null,
    platformAccess:
      session?.platform_access && typeof session.platform_access === 'object'
        ? session.platform_access
        : null,
  };
};

export const getTenantWorkspaceLaunchUrl = (session) =>
  session?.tenantAppUrl || session?.tenantApiUrl || '';
