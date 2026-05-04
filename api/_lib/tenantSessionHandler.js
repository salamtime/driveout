import { authenticateRequest, resolvePlatformAccessContext } from './auth.js';
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
  resolveEffectiveSubscriptionStatus,
} from './tenantRegistry.js';
import { bootstrapAutomaticBusinessOwnerProvisioning } from './tenantProvisioningHandler.js';
import { getCachedWorkspaceReadiness, resolveWorkspaceReadiness } from './tenantWorkspaceReadiness.js';
import {
  buildEffectiveTenantFeatureAccess,
  getTenantPlanLimits,
  normalizeTenantPlanType,
} from '../../src/config/tenantPlans.js';

const DRIVEOUT_BASE_DOMAIN = 'driveout.io';
const RESERVED_SUBDOMAINS = new Set(['www', 'admin', 'app']);

const normalizeHostname = (value = '') => {
  const trimmed = String(value || '').trim().toLowerCase();
  if (!trimmed) return '';

  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).hostname.toLowerCase();
  } catch {
    return trimmed.split('/')[0].split(':')[0].toLowerCase();
  }
};

const getTenantSlugFromHostname = (hostname = '') => {
  const normalizedHostname = normalizeHostname(hostname);
  if (!normalizedHostname.endsWith(`.${DRIVEOUT_BASE_DOMAIN}`)) return '';

  const slug = normalizedHostname.slice(0, -(`.${DRIVEOUT_BASE_DOMAIN}`.length));
  return slug && !RESERVED_SUBDOMAINS.has(slug) ? slug : '';
};

const isRetryableTenantBootstrapFailure = (tenant = {}, provisioningJob = null) => {
  const tenantStatus = String(tenant?.tenant_status || '').trim().toLowerCase();
  const jobStatus = String(provisioningJob?.job_status || '').trim().toLowerCase();
  const metadata = tenant?.metadata && typeof tenant.metadata === 'object' ? tenant.metadata : {};
  const failedVia = String(metadata.provisioning_failed_via || '').trim().toLowerCase();

  if (tenantStatus !== 'failed' && jobStatus !== 'failed') {
    return true;
  }

  return !failedVia.includes('schema_readiness_guard');
};

const buildTenantWorkspaceState = ({
  businessAccount = null,
  subscription = null,
  tenant = null,
  provisioningJob = null,
  workspaceReadiness = null,
  automaticSignupModeEnabled = false,
}) => {
  const approvalStatus = normalizeRegistryStatus(
    businessAccount?.approval_status || businessAccount?.application_status || 'pending'
  );
  const subscriptionStatus = resolveEffectiveSubscriptionStatus(subscription);
  const billingStatus = String(subscription?.billing_status || 'none').trim().toLowerCase();
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

  if (billingStatus === 'failed') {
    return 'billing_issue';
  }

  if (!tenant?.id) {
    return automaticSignupModeEnabled ? 'provisioning' : 'no_workspace';
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

  if (workspaceReadiness && workspaceReadiness.ready !== true) {
    return provisioningStatus === 'queued' || provisioningStatus === 'running'
      ? 'provisioning'
      : 'failed';
  }

  if (provisioningStatus === 'queued' || provisioningStatus === 'running') {
    return 'provisioning';
  }

  if (!tenant?.tenant_app_url && !tenant?.tenant_api_url) {
    return 'provisioning';
  }

  return 'tenant_ready';
};

const buildTenantLifecycleSummary = ({ subscription = null, tenant = null }) => {
  const subscriptionMetadata =
    subscription?.metadata && typeof subscription.metadata === 'object'
      ? subscription.metadata
      : {};
  const tenantMetadata =
    tenant?.metadata && typeof tenant.metadata === 'object'
      ? tenant.metadata
      : {};

  const lifecyclePolicy =
    tenantMetadata.lifecycle_policy && typeof tenantMetadata.lifecycle_policy === 'object'
      ? tenantMetadata.lifecycle_policy
      : subscriptionMetadata.lifecycle_policy && typeof subscriptionMetadata.lifecycle_policy === 'object'
        ? subscriptionMetadata.lifecycle_policy
        : {};

  return {
    trial_ends_at: subscription?.trial_ends_at || null,
    trial_expired_at: subscriptionMetadata.trial_expired_at || null,
    deletion_retention_days: Number(lifecyclePolicy.deletion_retention_days || 0) || null,
    deletion_due_at: tenantMetadata.deletion_due_at || subscriptionMetadata.deletion_due_at || null,
    deletion_scheduled_at: tenantMetadata.deletion_scheduled_at || null,
    suspension_reason: tenantMetadata.lifecycle_suspension_reason || null,
    suspended_at: tenantMetadata.lifecycle_suspended_at || null,
  };
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

  const { user, adminClient, masterAdminClient } = auth;
  const registryClient = masterAdminClient || adminClient;
  const accountType = String(
    user?.user_metadata?.account_type ||
    user?.app_metadata?.account_type ||
    ''
  ).trim().toLowerCase();
  const automaticSignupModeEnabled = isAutomaticSignupModeEnabled();
  const platformAccess = await resolvePlatformAccessContext(registryClient, user);
  const hasPlatformAccess =
    Boolean(platformAccess?.record) ||
    platformAccess?.isPlatformOwner === true ||
    platformAccess?.isPlatformAdmin === true;
  const platformAccessPayload = {
    role:
      platformAccess?.record?.platform_role ||
      (platformAccess?.isPlatformOwner ? 'platform_owner' : platformAccess?.isPlatformAdmin ? 'platform_admin' : null),
    access_enabled: hasPlatformAccess && platformAccess?.accessEnabled !== false,
    is_platform_owner: platformAccess?.isPlatformOwner === true,
    is_platform_admin: platformAccess?.isPlatformAdmin === true,
    permissions: platformAccess?.permissions || {},
  };

  const requestedHostname = normalizeHostname(
    req.query?.hostname ||
    req.headers['x-forwarded-host'] ||
    req.headers.host ||
    ''
  );
  const requestedTenantSlug = getTenantSlugFromHostname(requestedHostname);

  try {
    const canUseBusinessOwnerSession = isBusinessOwnerAccountType(accountType);
    const canUsePlatformTenantHostSession =
      !canUseBusinessOwnerSession &&
      hasPlatformAccess &&
      Boolean(requestedTenantSlug);

    if (!canUseBusinessOwnerSession && !canUsePlatformTenantHostSession) {
      res.status(200).json({
        session: {
          account_type: accountType,
          workspace_state: null,
          business_account: null,
          subscription: null,
          tenant: null,
          provisioning_job: null,
          platform_access: platformAccessPayload,
        },
      });
      return;
    }

    let businessAccount = null;
    let businessAccountId = null;
    let subscription = null;
    let tenant = null;
    let provisioningJob = null;

    if (canUseBusinessOwnerSession) {
      const businessAccountResult = await registryClient
        .from(PLATFORM_BUSINESS_ACCOUNTS_TABLE)
        .select('*')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      businessAccount = businessAccountResult.data || null;
      businessAccountId = businessAccount?.id || null;

      const [subscriptionResult, tenantResult, provisioningJobResult] = await Promise.all([
        businessAccountId
          ? registryClient
              .from(PLATFORM_BUSINESS_SUBSCRIPTIONS_TABLE)
              .select('*')
              .eq('business_account_id', businessAccountId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        businessAccountId
          ? registryClient
              .from(PLATFORM_TENANTS_TABLE)
              .select('*')
              .eq('business_account_id', businessAccountId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        businessAccountId
          ? registryClient
              .from(PLATFORM_TENANT_PROVISIONING_JOBS_TABLE)
              .select('*')
              .eq('business_account_id', businessAccountId)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      subscription = subscriptionResult.data || null;
      tenant = tenantResult.data || null;
      provisioningJob = provisioningJobResult.data || null;
    } else if (canUsePlatformTenantHostSession) {
      const tenantResult = await registryClient
        .from(PLATFORM_TENANTS_TABLE)
        .select('*')
        .eq('tenant_slug', requestedTenantSlug)
        .maybeSingle();

      tenant = tenantResult.data || null;
      businessAccountId = tenant?.business_account_id || null;

      const [businessAccountResult, subscriptionResult, provisioningJobResult] = await Promise.all([
        businessAccountId
          ? registryClient
              .from(PLATFORM_BUSINESS_ACCOUNTS_TABLE)
              .select('*')
              .eq('id', businessAccountId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        businessAccountId
          ? registryClient
              .from(PLATFORM_BUSINESS_SUBSCRIPTIONS_TABLE)
              .select('*')
              .eq('business_account_id', businessAccountId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        businessAccountId
          ? registryClient
              .from(PLATFORM_TENANT_PROVISIONING_JOBS_TABLE)
              .select('*')
              .eq('business_account_id', businessAccountId)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      businessAccount = businessAccountResult.data || null;
      subscription = subscriptionResult.data || null;
      provisioningJob = provisioningJobResult.data || null;
    }

    const tenantStatus = String(tenant?.tenant_status || '').trim().toLowerCase();
    const provisioningStatus = String(provisioningJob?.job_status || '').trim().toLowerCase();
    const shouldBootstrapAutomaticSignup =
      canUseBusinessOwnerSession &&
      automaticSignupModeEnabled &&
      (!businessAccountId ||
        !tenant?.id ||
        tenantStatus === 'pending' ||
        (tenantStatus === 'failed' && isRetryableTenantBootstrapFailure(tenant, provisioningJob)) ||
        provisioningStatus === 'queued');

    if (shouldBootstrapAutomaticSignup) {
      try {
        const bootstrapped = await bootstrapAutomaticBusinessOwnerProvisioning({
          adminClient: registryClient,
          authUser: user,
        });

        if (bootstrapped) {
          businessAccount = bootstrapped.businessAccount || businessAccount;
          businessAccountId = businessAccount?.id || businessAccountId;
          subscription = bootstrapped.subscription || subscription;
          tenant = bootstrapped.tenant || tenant;
          provisioningJob = bootstrapped.job || provisioningJob;
        }
      } catch (bootstrapError) {
        console.error('Automatic business-owner provisioning bootstrap failed:', bootstrapError);
      }
    }

    let workspaceReadiness = tenant ? getCachedWorkspaceReadiness(tenant) : null;
    if (tenant?.id) {
      try {
        workspaceReadiness = await resolveWorkspaceReadiness({
          tenant,
          adminClient: registryClient,
          forceFresh: !workspaceReadiness?.fresh,
          persist: true,
        });
        tenant = {
          ...tenant,
          metadata: {
            ...(tenant?.metadata && typeof tenant.metadata === 'object' ? tenant.metadata : {}),
            workspace_readiness: workspaceReadiness,
          },
        };
      } catch (readinessError) {
        workspaceReadiness = workspaceReadiness || {
          status: 'unverified',
          ready: false,
          checked_at: new Date().toISOString(),
          project_ref: tenant?.tenant_project_ref || null,
          error_message: readinessError?.message || 'Workspace readiness verification failed',
        };
        console.warn('Unable to verify tenant workspace readiness:', readinessError?.message || readinessError);
      }
    }

    const effectiveSubscriptionStatus = resolveEffectiveSubscriptionStatus(subscription);
    const effectivePlanType = normalizeTenantPlanType(subscription?.plan_type || 'starter');
    const effectiveSubscription = subscription
      ? {
          ...subscription,
          plan_type: effectivePlanType,
          plan_limits: {
            ...getTenantPlanLimits(effectivePlanType),
            ...((subscription?.plan_limits && typeof subscription.plan_limits === 'object')
              ? subscription.plan_limits
              : {}),
          },
          subscription_status: effectiveSubscriptionStatus,
        }
      : null;
    const effectiveTenant = tenant
      ? {
          ...tenant,
          metadata: {
            ...(tenant?.metadata && typeof tenant.metadata === 'object' ? tenant.metadata : {}),
            effective_feature_access: buildEffectiveTenantFeatureAccess(
              effectivePlanType,
              tenant?.metadata?.feature_access && typeof tenant.metadata.feature_access === 'object'
                ? tenant.metadata.feature_access
                : {}
            ),
          },
        }
      : null;
    const workspaceState = buildTenantWorkspaceState({
      businessAccount,
      subscription: effectiveSubscription,
      tenant: effectiveTenant,
      provisioningJob,
      workspaceReadiness,
      automaticSignupModeEnabled,
    });
    const lifecycle = buildTenantLifecycleSummary({
      subscription: effectiveSubscription,
      tenant: effectiveTenant,
    });

    res.status(200).json({
      session: {
        account_type: accountType,
        workspace_state: workspaceState,
        business_account: businessAccount,
        subscription: effectiveSubscription,
        tenant: effectiveTenant,
        provisioning_job: provisioningJob,
        automatic_signup_mode: automaticSignupModeEnabled,
        platform_access: platformAccessPayload,
        lifecycle,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to resolve tenant session' });
  }
}
