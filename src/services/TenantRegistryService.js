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
  };
};

export const getTenantWorkspaceLaunchUrl = (session) =>
  session?.tenantAppUrl || session?.tenantApiUrl || '';
