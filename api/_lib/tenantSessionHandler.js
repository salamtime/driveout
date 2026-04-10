import { authenticateRequest } from './auth.js';
import {
  PLATFORM_BUSINESS_ACCOUNTS_TABLE,
  PLATFORM_BUSINESS_SUBSCRIPTIONS_TABLE,
  PLATFORM_TENANTS_TABLE,
  PLATFORM_TENANT_PROVISIONING_JOBS_TABLE,
} from './supabase.js';
import {
  isBusinessOwnerAccountType,
  normalizeRegistryStatus,
  normalizeSubscriptionStatus,
} from './tenantRegistry.js';

const buildTenantWorkspaceState = ({
  businessAccount = null,
  subscription = null,
  tenant = null,
  provisioningJob = null,
}) => {
  const approvalStatus = normalizeRegistryStatus(
    businessAccount?.approval_status || businessAccount?.application_status || 'pending'
  );
  const subscriptionStatus = normalizeSubscriptionStatus(
    subscription?.subscription_status || 'trial'
  );
  const tenantStatus = String(tenant?.tenant_status || '').trim().toLowerCase();
  const provisioningStatus = String(provisioningJob?.job_status || '').trim().toLowerCase();

  if (approvalStatus === 'rejected') {
    return 'rejected';
  }

  if (approvalStatus === 'needs_info') {
    return 'needs_info';
  }

  if (approvalStatus === 'suspended' || subscriptionStatus === 'suspended' || tenantStatus === 'suspended') {
    return 'suspended';
  }

  if (approvalStatus !== 'approved') {
    return 'pending';
  }

  if (subscriptionStatus === 'expired' || subscriptionStatus === 'cancelled') {
    return 'expired';
  }

  if (!tenant?.id) {
    return 'no_workspace';
  }

  if (tenantStatus === 'pending') {
    return 'pending';
  }

  if (tenantStatus === 'archived' || tenantStatus === 'failed') {
    return 'failed';
  }

  if (tenantStatus !== 'active') {
    return 'provisioning';
  }

  if (provisioningStatus === 'queued' || provisioningStatus === 'running') {
    return 'provisioning';
  }

  if (!tenant?.tenant_app_url && !tenant?.tenant_api_url) {
    return 'provisioning';
  }

  return 'tenant_ready';
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

  const auth = await authenticateRequest(req);

  if (auth.error) {
    res.status(auth.error.status).json(auth.error.body);
    return;
  }

  const { user, adminClient } = auth;
  const accountType = String(
    user?.user_metadata?.account_type ||
    user?.app_metadata?.account_type ||
    ''
  ).trim().toLowerCase();

  if (!isBusinessOwnerAccountType(accountType)) {
    res.status(403).json({ error: 'Business owner access required' });
    return;
  }

  try {
    const businessAccountResult = await adminClient
      .from(PLATFORM_BUSINESS_ACCOUNTS_TABLE)
      .select('*')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    const businessAccount = businessAccountResult.data || null;
    const businessAccountId = businessAccount?.id || null;

    const [subscriptionResult, tenantResult, provisioningJobResult] = await Promise.all([
      businessAccountId
        ? adminClient
            .from(PLATFORM_BUSINESS_SUBSCRIPTIONS_TABLE)
            .select('*')
            .eq('business_account_id', businessAccountId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      businessAccountId
        ? adminClient
            .from(PLATFORM_TENANTS_TABLE)
            .select('*')
            .eq('business_account_id', businessAccountId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      businessAccountId
        ? adminClient
            .from(PLATFORM_TENANT_PROVISIONING_JOBS_TABLE)
            .select('*')
            .eq('business_account_id', businessAccountId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    const subscription = subscriptionResult.data || null;
    const tenant = tenantResult.data || null;
    const provisioningJob = provisioningJobResult.data || null;
    const workspaceState = buildTenantWorkspaceState({
      businessAccount,
      subscription,
      tenant,
      provisioningJob,
    });

    res.status(200).json({
      session: {
        account_type: accountType,
        workspace_state: workspaceState,
        business_account: businessAccount,
        subscription,
        tenant,
        provisioning_job: provisioningJob,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to resolve tenant session' });
  }
}
