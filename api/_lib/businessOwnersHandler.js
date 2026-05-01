import { requirePlatformOwnerOrAdmin } from './auth.js';
import {
  PLATFORM_BUSINESS_ACCOUNTS_TABLE,
  PLATFORM_BUSINESS_SUBSCRIPTIONS_TABLE,
  PLATFORM_TENANTS_TABLE,
  PLATFORM_TENANT_PROVISIONING_JOBS_TABLE,
} from './supabase.js';

const BUSINESS_OWNER_ACCOUNT_TYPES = new Set([
  'operator',
  'business_owner',
  'business',
  'rental_business',
  'private_owner',
]);

const BUSINESS_OWNER_REQUEST_STATUSES = new Set([
  'pending',
  'pending_review',
  'pending_verification',
  'approved',
  'rejected',
  'needs_info',
  'suspended',
]);

const normalizeStatus = (value, fallback = 'pending') => {
  const status = String(value || '').trim().toLowerCase();
  if (status === 'pending_verification') return 'pending';
  return BUSINESS_OWNER_REQUEST_STATUSES.has(status) ? status : fallback;
};

const getBusinessOwnerMetadata = (user = {}) => ({
  ...(user.app_metadata || {}),
  ...(user.user_metadata || {}),
});

const hasLegacyBusinessOwnerRequest = (user = {}) => {
  const metadata = getBusinessOwnerMetadata(user);
  const accountType = String(metadata.account_type || metadata.accountType || '').trim().toLowerCase();
  const certificationStatus = String(metadata.certification_request_status || '').trim().toLowerCase();
  const verificationStatus = String(metadata.verification_status || '').trim().toLowerCase();

  return (
    BUSINESS_OWNER_ACCOUNT_TYPES.has(accountType) ||
    BUSINESS_OWNER_REQUEST_STATUSES.has(certificationStatus) ||
    BUSINESS_OWNER_REQUEST_STATUSES.has(verificationStatus)
  );
};

const isPermissionDenied = (error) => (
  String(error?.code || '') === '42501' ||
  String(error?.message || '').toLowerCase().includes('permission denied')
);

const buildLegacyBusinessOwnerEntry = (user = {}) => {
  const metadata = getBusinessOwnerMetadata(user);
  const applicationStatus = normalizeStatus(
    metadata.certification_request_status || metadata.verification_status,
    'pending'
  );
  const businessAccountId = `legacy_${user.id}`;
  const fullName = metadata.full_name || metadata.name || [metadata.first_name, metadata.last_name].filter(Boolean).join(' ');
  const companyName = metadata.company_name || metadata.business_name || metadata.organization_name || fullName || user.email;

  return {
    business_account: {
      id: businessAccountId,
      auth_user_id: user.id,
      full_name: fullName || user.email,
      email: user.email,
      company_name: companyName,
      phone: metadata.phone || metadata.phone_number || '',
      account_type: metadata.account_type || 'business_owner',
      application_status: applicationStatus,
      approval_status: applicationStatus,
      approved_at: metadata.approved_at || null,
      approved_by: metadata.approved_by || null,
      rejection_reason: metadata.rejection_reason || '',
      metadata: {
        source: 'legacy_auth_metadata',
        app_metadata: user.app_metadata || {},
        user_metadata: user.user_metadata || {},
      },
      created_at: user.created_at || null,
      updated_at: user.updated_at || user.last_sign_in_at || user.created_at || null,
    },
    subscription: {
      id: `${businessAccountId}_subscription`,
      business_account_id: businessAccountId,
      plan_type: metadata.plan_type || metadata.subscription_plan || 'starter',
      subscription_status: metadata.subscription_status || (applicationStatus === 'approved' ? 'trial' : 'pending'),
      billing_status: metadata.billing_status || 'none',
      trial_started_at: metadata.trial_started_at || null,
      trial_ends_at: metadata.trial_ends_at || null,
      subscription_started_at: metadata.subscription_started_at || null,
      suspended_at: metadata.suspended_at || null,
      plan_limits: {},
      metadata: {
        source: 'legacy_auth_metadata',
      },
    },
    tenant: null,
    provisioning_job: null,
  };
};

const loadLegacyBusinessOwnersFromAuth = async (adminClient) => {
  const users = [];
  let page = 1;
  const perPage = 1000;

  while (page <= 10) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const batch = Array.isArray(data?.users) ? data.users : [];
    users.push(...batch);

    if (batch.length < perPage) break;
    page += 1;
  }

  return users
    .filter(hasLegacyBusinessOwnerRequest)
    .sort((first, second) => new Date(second.created_at || 0) - new Date(first.created_at || 0))
    .slice(0, 200)
    .map(buildLegacyBusinessOwnerEntry);
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

  const auth = await requirePlatformOwnerOrAdmin(req, 'Workspaces');

  if (auth.error) {
    res.status(auth.error.status).json(auth.error.body);
    return;
  }

  const { adminClient } = auth;

  try {
    const { data: businessAccounts, error: businessAccountsError } = await adminClient
      .from(PLATFORM_BUSINESS_ACCOUNTS_TABLE)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (businessAccountsError) {
      if (isPermissionDenied(businessAccountsError)) {
        const businessOwners = await loadLegacyBusinessOwnersFromAuth(adminClient);
        res.status(200).json({
          business_owners: businessOwners,
          source: 'legacy_auth_metadata',
          warning: 'platform_business_accounts grants are not available yet',
        });
        return;
      }

      throw businessAccountsError;
    }

    const businessAccountIds = Array.isArray(businessAccounts)
      ? businessAccounts.map((account) => account?.id).filter(Boolean)
      : [];

    if (!businessAccountIds.length) {
      res.status(200).json({ business_owners: [] });
      return;
    }

    const [subscriptionsResult, tenantsResult, jobsResult] = await Promise.all([
      adminClient
        .from(PLATFORM_BUSINESS_SUBSCRIPTIONS_TABLE)
        .select('*')
        .in('business_account_id', businessAccountIds),
      adminClient
        .from(PLATFORM_TENANTS_TABLE)
        .select('*')
        .in('business_account_id', businessAccountIds),
      adminClient
        .from(PLATFORM_TENANT_PROVISIONING_JOBS_TABLE)
        .select('*')
        .in('business_account_id', businessAccountIds)
        .order('created_at', { ascending: false }),
    ]);

    if (subscriptionsResult.error) throw subscriptionsResult.error;
    if (tenantsResult.error) throw tenantsResult.error;
    if (jobsResult.error) throw jobsResult.error;

    const subscriptionMap = new Map(
      (subscriptionsResult.data || []).map((subscription) => [String(subscription.business_account_id), subscription])
    );
    const tenantMap = new Map(
      (tenantsResult.data || []).map((tenant) => [String(tenant.business_account_id), tenant])
    );
    const latestJobMap = new Map();

    (jobsResult.data || []).forEach((job) => {
      const key = String(job?.business_account_id || '').trim();
      if (!key || latestJobMap.has(key)) return;
      latestJobMap.set(key, job);
    });

    const businessOwners = (businessAccounts || []).map((businessAccount) => {
      const businessAccountId = String(businessAccount?.id || '').trim();
      return {
        business_account: businessAccount,
        subscription: subscriptionMap.get(businessAccountId) || null,
        tenant: tenantMap.get(businessAccountId) || null,
        provisioning_job: latestJobMap.get(businessAccountId) || null,
      };
    });

    res.status(200).json({ business_owners: businessOwners });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load business owners' });
  }
}
