export const TENANT_ENTRY_ROUTES = Object.freeze({
  pendingApproval: '/pending-approval',
  noWorkspace: '/no-workspace',
  pending: '/workspace-pending',
  provisioning: '/workspace-preparing',
  failed: '/workspace-error',
  suspended: '/workspace-suspended',
  choosePlan: '/choose-plan',
});

export const isExternalUrl = (value = '') => /^https?:\/\//i.test(String(value || '').trim());

export const resolveUserEntry = ({ approved = false, tenantSession = null } = {}) => {
  if (!approved) {
    return { type: 'route', target: TENANT_ENTRY_ROUTES.pendingApproval };
  }

  const tenant = tenantSession?.tenant || null;
  const tenantStatus = String(
    tenant?.tenant_status ||
    tenantSession?.tenantStatus ||
    ''
  ).trim().toLowerCase();
  const workspaceState = String(
    tenantSession?.workspace_state ||
    tenantSession?.workspaceState ||
    ''
  ).trim().toLowerCase();

  if (!tenant?.id && !tenantSession?.tenantId) {
    return { type: 'route', target: TENANT_ENTRY_ROUTES.noWorkspace };
  }

  if (tenantStatus === 'pending' || workspaceState === 'pending') {
    return { type: 'route', target: TENANT_ENTRY_ROUTES.pending };
  }

  if (tenantStatus === 'failed' || workspaceState === 'failed') {
    return { type: 'route', target: TENANT_ENTRY_ROUTES.failed };
  }

  if (tenantStatus === 'suspended' || workspaceState === 'suspended') {
    return { type: 'route', target: TENANT_ENTRY_ROUTES.suspended };
  }

  if (workspaceState === 'expired' || workspaceState === 'billing_issue') {
    return { type: 'route', target: TENANT_ENTRY_ROUTES.choosePlan };
  }

  const appUrl = String(tenant?.tenant_app_url || tenantSession?.tenantAppUrl || '').trim();
  if ((tenantStatus === 'active' || workspaceState === 'tenant_ready') && appUrl) {
    return { type: 'external', target: appUrl };
  }

  return { type: 'route', target: TENANT_ENTRY_ROUTES.provisioning };
};
