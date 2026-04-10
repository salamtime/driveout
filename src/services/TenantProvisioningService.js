import { adminApiRequest } from './adminApi';

export const listTenants = async (status = '') => {
  const query = new URLSearchParams({ resource: 'provisioning' });
  if (status) query.set('status', status);
  const response = await adminApiRequest(`/api/tenants?${query.toString()}`);
  return {
    jobs: response?.jobs || [],
    businessOwners: response?.business_owners || [],
  };
};

export const startTenantProvisioning = async (jobId, businessAccountId = '') =>
  adminApiRequest('/api/tenants?resource=provisioning', {
    method: 'POST',
    body: JSON.stringify({ action: 'start', job_id: jobId, business_account_id: businessAccountId }),
  });

export const completeTenantProvisioning = async (jobId, payload) =>
  adminApiRequest('/api/tenants?resource=provisioning', {
    method: 'POST',
    body: JSON.stringify({ action: 'complete', job_id: jobId, ...payload }),
  });

export const failTenantProvisioning = async (jobId, errorMessage) =>
  adminApiRequest('/api/tenants?resource=provisioning', {
    method: 'POST',
    body: JSON.stringify({ action: 'fail', job_id: jobId, error_message: errorMessage }),
  });

export const suspendTenant = async (jobId, reason = '') =>
  adminApiRequest('/api/tenants?resource=provisioning', {
    method: 'POST',
    body: JSON.stringify({ action: 'suspend', job_id: jobId, error_message: reason }),
  });

export const reactivateTenant = async (jobId) =>
  adminApiRequest('/api/tenants?resource=provisioning', {
    method: 'POST',
    body: JSON.stringify({ action: 'reactivate', job_id: jobId }),
  });

export const provisionTenant = async (tenantId) => ({
  tenantId,
  mode: 'manual',
  status: 'pending_manual_configuration',
});
