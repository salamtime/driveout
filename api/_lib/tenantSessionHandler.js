import { authenticateRequest, resolvePlatformAccessContext } from './auth.js';
import {
  ORGANIZATIONS_TABLE,
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
  resolveTenantTenancyMode,
} from './tenantRegistry.js';
import { bootstrapAutomaticBusinessOwnerProvisioning } from './tenantProvisioningHandler.js';
import { getCachedWorkspaceReadiness, resolveWorkspaceReadiness } from './tenantWorkspaceReadiness.js';
import {
  buildEffectiveTenantFeatureAccess,
  getTenantPlanLimits,
  normalizeTenantPlanType,
} from '../../src/config/tenantPlans.js';
import { buildLegacyDedicatedInfrastructure } from './legacyDedicatedTenant.js';
import { getTenantSlugFromHostname, normalizeHostname } from './tenantHostResolution.js';

const isAutomaticSignupModeEnabled = () => {
  const signupMode = String(process.env.TENANT_SIGNUP_MODE || 'automatic').trim().toLowerCase();
  const autoProvisioningEnabled = String(process.env.TENANT_AUTO_PROVISIONING_ENABLED || 'true').trim().toLowerCase();
  return signupMode !== 'manual' && autoProvisioningEnabled !== 'false';
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

const getTenantMetadata = (tenant = {}) => (
  tenant?.metadata && typeof tenant.metadata === 'object' ? tenant.metadata : {}
);

const extractTenantPublicFeatures = (featureAccess = {}) => ({
  public_storefront: featureAccess.public_storefront === true,
  online_booking: featureAccess.online_booking === true,
  multilingual_storefront: featureAccess.multilingual_storefront === true,
});

const resolveTenantOrganizationContext = async ({ tenant = null, businessAccount = null, adminClient = null } = {}) => {
  const tenancyMode = resolveTenantTenancyMode(tenant);
  if (tenancyMode !== 'shared') {
    return {
      organizationId: null,
      organizationSlug: null,
    };
  }

  const tenantMetadata = getTenantMetadata(tenant);
  const metadataOrganizationId = String(
    tenantMetadata.organization_id ||
    tenantMetadata.shared_organization_id ||
    ''
  ).trim();
  const metadataOrganizationSlug = String(
    tenantMetadata.organization_slug ||
    tenantMetadata.shared_organization_slug ||
    ''
  ).trim();

  if (metadataOrganizationId || metadataOrganizationSlug) {
    return {
      organizationId: metadataOrganizationId || null,
      organizationSlug: metadataOrganizationSlug || null,
    };
  }

  const ownerUserId = String(businessAccount?.auth_user_id || '').trim();
  if (!ownerUserId || !adminClient) {
    return {
      organizationId: null,
      organizationSlug: null,
    };
  }

  const { data: organization, error } = await adminClient
    .from(ORGANIZATIONS_TABLE)
    .select('id, slug')
    .eq('owner_user_id', ownerUserId)
    .eq('is_platform_organization', false)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  return {
    organizationId: String(organization?.id || '').trim() || null,
    organizationSlug: String(organization?.slug || '').trim() || null,
  };
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
  const tenancyMode = resolveTenantTenancyMode(tenant);

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

  if (tenantStatus === 'archived') {
    return 'failed';
  }

  if (tenantStatus === 'failed') {
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

  const { user, adminClient, masterAdminClient, tenantRuntime } = auth;
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

  const requestedHost = String(
    req.query?.hostname ||
    req.headers['x-forwarded-host'] ||
    req.headers.host ||
    ''
  ).trim();
  const requestedHostname = normalizeHostname(requestedHost);
  const requestedTenantSlug = getTenantSlugFromHostname(requestedHost);

  try {
    const canUseBusinessOwnerSession = isBusinessOwnerAccountType(accountType);
  const canUseTenantHostSession =
    !canUseBusinessOwnerSession &&
    Boolean(requestedTenantSlug) &&
    (
      hasPlatformAccess ||
      String(tenantRuntime?.tenant_slug || '').trim().toLowerCase() === requestedTenantSlug
    );

    if (!canUseBusinessOwnerSession && !canUseTenantHostSession) {
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
    } else if (canUseTenantHostSession) {
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
    const featureAccessOverrides =
      tenant?.metadata?.feature_access && typeof tenant.metadata.feature_access === 'object'
        ? tenant.metadata.feature_access
        : {};
    const effectiveFeatureAccess = buildEffectiveTenantFeatureAccess(
      effectivePlanType,
      featureAccessOverrides
    );
    const publicFeatures = extractTenantPublicFeatures(effectiveFeatureAccess);
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
            ...getTenantMetadata(tenant),
            effective_feature_access: effectiveFeatureAccess,
          },
        }
      : null;
    const organizationContext = await resolveTenantOrganizationContext({
      tenant: effectiveTenant,
      businessAccount,
      adminClient: registryClient,
    });
    const tenancyMode = resolveTenantTenancyMode(effectiveTenant || tenant);
    const legacyDedicatedInfrastructure = buildLegacyDedicatedInfrastructure(effectiveTenant || tenant || {});
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
        tenant_id: effectiveTenant?.id || null,
        tenant_slug: effectiveTenant?.tenant_slug || null,
        tenant_name: effectiveTenant?.tenant_name || null,
        tenant_status: effectiveTenant?.tenant_status || null,
        tenancy_mode: tenancyMode,
        organization_id: organizationContext.organizationId,
        organization_slug: organizationContext.organizationSlug,
        legacy_dedicated_infrastructure: legacyDedicatedInfrastructure,
        plan_type: effectivePlanType,
        feature_access: featureAccessOverrides,
        effective_feature_access: effectiveFeatureAccess,
        public_features: publicFeatures,
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
