import { adminApiRequest } from './adminApi';

export const listBusinessOwnersFromRegistry = async () => {
  const response = await adminApiRequest('/api/tenants?resource=business-owners');
  return response?.business_owners || [];
};

export const listTenantProvisioningJobs = async (status = '') => {
  const query = new URLSearchParams({ resource: 'provisioning' });
  if (status) query.set('status', status);
  const response = await adminApiRequest(`/api/tenants?${query.toString()}`);
  return response?.jobs || [];
};

export const listBusinessOwnerProvisioningRegistry = async (status = '') => {
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
    body: JSON.stringify({
      action: 'start',
      job_id: jobId,
      business_account_id: businessAccountId,
    }),
  });

export const failTenantProvisioning = async (jobId, errorMessage) =>
  adminApiRequest('/api/tenants?resource=provisioning', {
    method: 'POST',
    body: JSON.stringify({
      action: 'fail',
      job_id: jobId,
      error_message: errorMessage,
    }),
  });

export const completeTenantProvisioning = async (jobId, payload) =>
  adminApiRequest('/api/tenants?resource=provisioning', {
    method: 'POST',
    body: JSON.stringify({
      action: 'complete',
      job_id: jobId,
      ...payload,
    }),
  });
