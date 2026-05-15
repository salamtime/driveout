import {
  APP_USERS_TABLE,
  ORGANIZATIONS_TABLE,
  ORGANIZATION_MEMBERS_TABLE,
  PLATFORM_ADMIN_ACCOUNTS_TABLE,
  PLATFORM_BUSINESS_ACCOUNTS_TABLE,
  PLATFORM_TENANTS_TABLE,
  PLATFORM_BUSINESS_SUBSCRIPTIONS_TABLE,
  PLATFORM_TENANT_PROVISIONING_JOBS_TABLE,
  PLATFORM_TENANT_AUDIT_LOG_TABLE,
} from './_lib/supabase.js';
import { authenticateRequest, requireOwnerOrAdmin, requirePlatformOwner, requirePlatformOwnerOrAdmin } from './_lib/auth.js';
import {
  buildTenantAppUrl,
  buildTenantSlug,
  normalizeBillingStatus,
  normalizeBusinessAccountType,
  normalizePlanType,
  normalizeRegistryStatus,
  normalizeSubscriptionStatus,
  sanitizeTenantSlug,
} from './_lib/tenantRegistry.js';
import { resolveRequestTenantScope } from './_lib/sharedTenantIsolation.js';
import { getTenantPlanLimits, normalizeTenantPlanType } from '../src/config/tenantPlans.js';
import { buildDefaultPermissionsForRole } from '../src/utils/permissionCatalog.js';
import crypto from 'crypto';

const BUSINESS_OWNER_ACCOUNT_TYPES = new Set(['business_owner', 'operator', 'business', 'rental_business']);
const SHARED_TENANT_USER_ALLOWLIST = new Set(['oualidazzouni10@gmail.com']);
const BASE_APP_USER_FIELDS = 'id, email, username, full_name, first_name, last_name, role, phone_number, whatsapp_notifications, preferences, permissions, salary_amount, created_at, updated_at, access_enabled, primary_organization_id';
const BUSINESS_OWNER_APP_USER_FIELDS = `${BASE_APP_USER_FIELDS}, verification_status, approved_at, approved_by, rejection_reason, subscription_plan, subscription_status, trial_started_at, trial_ends_at, subscription_started_at, plan_type, billing_status, suspended_at, suspension_reason, plan_changed_at`;

const buildDisplayName = (...values) =>
  values
    .map((value) => String(value || '').trim())
    .find(Boolean) || null;

const createOrganizationSlug = (value) =>
  String(value || 'organization')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42) || 'organization';

const isSchemaCompatibilityError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  const details = String(error?.details || '').toLowerCase();
  const code = String(error?.code || '').toUpperCase();

  return (
    code === '42703' ||
    code === 'PGRST204' ||
    message.includes('schema cache') ||
    message.includes('column') ||
    details.includes('schema cache')
  );
};

const resolvePermissionsMap = (value) => {
  if (!value) return {};
  if (Array.isArray(value)) {
    return value.reduce((acc, permission) => {
      if (!permission?.module_name) return acc;
      acc[permission.module_name] = permission.has_access === true;
      return acc;
    }, {});
  }
  if (typeof value === 'object') {
    return value;
  }
  return {};
};

const resolveStaffPermissions = (role, explicitPermissions = null) => {
  const normalizedRole = String(role || 'employee').trim().toLowerCase() || 'employee';
  if (explicitPermissions && typeof explicitPermissions === 'object' && !Array.isArray(explicitPermissions)) {
    const keys = Object.keys(explicitPermissions);
    if (keys.length > 0) {
      return explicitPermissions;
    }
  }

  return buildDefaultPermissionsForRole(normalizedRole);
};

const canAccessStaffDirectory = async (req) => {
  const auth = await authenticateRequest(req);

  if (auth.error) {
    return auth;
  }

  const { user, adminClient } = auth;

  try {
    const { data: profile, error } = await adminClient
      .from(APP_USERS_TABLE)
      .select('role, permissions, access_enabled')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      return { error: { status: 500, body: { error: error.message } } };
    }

    const effectiveRole = String(profile?.role || user.user_metadata?.role || user.app_metadata?.role || '').trim().toLowerCase();
    const permissionsMap = resolvePermissionsMap(profile?.permissions || user.user_metadata?.permissions || null);
    const hasMessagesAccess = permissionsMap.Messages === true || permissionsMap.messages === true;
    const accessEnabled = profile?.access_enabled !== false;

    if (
      accessEnabled &&
      (
        ['owner', 'admin', 'employee', 'guide', 'business_owner'].includes(effectiveRole) ||
        hasMessagesAccess
      )
    ) {
      return { user, adminClient };
    }

    return { error: { status: 403, body: { error: 'Messages access required' } } };
  } catch (error) {
    return { error: { status: 500, body: { error: error.message } } };
  }
};

const normalizeBusinessOwnerVerificationStatus = (value) => {
  const normalized = String(value || 'pending').trim().toLowerCase();
  if (['approved', 'rejected', 'needs_info'].includes(normalized)) {
    return normalized;
  }
  return 'pending';
};

const normalizeBusinessOwnerSubscriptionPlan = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (['free_trial', 'saas', 'saas_web'].includes(normalized)) {
    return normalized;
  }
  return null;
};

const normalizeBusinessOwnerSubscriptionStatus = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (['trial', 'active', 'expired', 'cancelled', 'suspended'].includes(normalized)) {
    return normalized;
  }
  return null;
};

const normalizeBusinessOwnerPlanType = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalizeTenantPlanType(normalized, '');
};

const normalizeBusinessOwnerBillingStatus = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (['none', 'active', 'failed'].includes(normalized)) {
    return normalized;
  }
  return 'none';
};

const getPlanLimits = (planType) => getTenantPlanLimits(planType || 'starter');

const resolveUniqueTenantSlug = async ({ adminClient, requestedSlug = '', businessAccountId = '' }) => {
  const baseSlug = sanitizeTenantSlug(requestedSlug || 'tenant');

  const existingForAccount = await adminClient
    .from(PLATFORM_TENANTS_TABLE)
    .select('tenant_slug')
    .eq('business_account_id', businessAccountId)
    .maybeSingle();

  if (existingForAccount.error) {
    throw existingForAccount.error;
  }

  const existingSlug = String(existingForAccount.data?.tenant_slug || '').trim().toLowerCase();
  if (existingSlug) {
    return existingSlug;
  }

  const collisions = await adminClient
    .from(PLATFORM_TENANTS_TABLE)
    .select('tenant_slug')
    .like('tenant_slug', `${baseSlug}%`)
    .limit(200);

  if (collisions.error) {
    throw collisions.error;
  }

  const used = new Set((collisions.data || []).map((entry) => String(entry?.tenant_slug || '').trim().toLowerCase()).filter(Boolean));
  if (!used.has(baseSlug)) {
    return baseSlug;
  }

  for (let index = 2; index <= 200; index += 1) {
    const candidate = `${baseSlug}-${index}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Unable to allocate a unique tenant slug for base "${baseSlug}"`);
};

const buildBusinessOwnerActivationPayload = ({ action, reason, adminId }) => {
  const nowIso = new Date().toISOString();
  const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  if (action === 'approve_business_owner') {
    return {
      verification_status: 'approved',
      approved_at: nowIso,
      approved_by: adminId,
      rejection_reason: null,
      subscription_plan: 'free_trial',
      subscription_status: 'trial',
      plan_type: 'starter',
      billing_status: 'none',
      trial_started_at: nowIso,
      trial_ends_at: thirtyDaysFromNow,
      subscription_started_at: null,
      suspended_at: null,
      suspension_reason: null,
      plan_changed_at: nowIso,
      updated_at: nowIso,
    };
  }

  if (action === 'reject_business_owner') {
    return {
      verification_status: 'rejected',
      rejection_reason: String(reason || '').trim(),
      suspended_at: null,
      suspension_reason: null,
      updated_at: nowIso,
    };
  }

  if (action === 'request_business_owner_info') {
    return {
      verification_status: 'needs_info',
      suspended_at: null,
      suspension_reason: null,
      updated_at: nowIso,
    };
  }

  return null;
};

const loadAppUsersWithCompatibility = async (adminClient) => {
  const fullResult = await adminClient
    .from(APP_USERS_TABLE)
    .select(BUSINESS_OWNER_APP_USER_FIELDS);

  if (!fullResult.error) {
    return fullResult;
  }

  if (!isSchemaCompatibilityError(fullResult.error)) {
    return fullResult;
  }

  return adminClient
    .from(APP_USERS_TABLE)
    .select(BASE_APP_USER_FIELDS);
};

const syncBusinessOwnerActivationProfile = async (adminClient, userId, authUser, activationPayload) => {
  const safeRole = String(
    authUser?.user_metadata?.role ||
    authUser?.app_metadata?.role ||
    'customer'
  ).trim().toLowerCase() || 'customer';

  const baseProfilePayload = {
    id: userId,
    email: authUser?.email || null,
    full_name:
      authUser?.user_metadata?.full_name ||
      authUser?.user_metadata?.name ||
      authUser?.email ||
      'Business Owner',
    role: safeRole,
    primary_organization_id: activationPayload?.primary_organization_id || null,
    updated_at: new Date().toISOString(),
    access_enabled: true,
    ...activationPayload,
  };

  let result = await adminClient
    .from(APP_USERS_TABLE)
    .upsert(baseProfilePayload, { onConflict: 'id' })
    .select('*')
    .maybeSingle();

  if (result.error && isSchemaCompatibilityError(result.error)) {
    const {
      verification_status,
      approved_at,
      approved_by,
      rejection_reason,
      subscription_plan,
      subscription_status,
      trial_started_at,
      trial_ends_at,
      subscription_started_at,
      plan_type,
      billing_status,
      suspended_at,
      suspension_reason,
      plan_changed_at,
      primary_organization_id,
      ...fallbackPayload
    } = baseProfilePayload;

    result = await adminClient
      .from(APP_USERS_TABLE)
      .upsert(fallbackPayload, { onConflict: 'id' })
      .select(BASE_APP_USER_FIELDS)
      .maybeSingle();
  }

  return result;
};

const ensureBusinessOwnerOrganization = async (adminClient, userId, authUser) => {
  const existingMembershipResult = await adminClient
    .from(ORGANIZATION_MEMBERS_TABLE)
    .select('organization_id, member_role, organization:app_organizations(id, name, slug, organization_status, is_platform_organization)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!existingMembershipResult.error && existingMembershipResult.data?.organization_id) {
    return {
      organizationId: existingMembershipResult.data.organization_id,
      organization: existingMembershipResult.data.organization || null,
      memberRole: existingMembershipResult.data.member_role || 'org_owner',
    };
  }

  const companyName = String(
    authUser?.user_metadata?.company_name ||
    authUser?.app_metadata?.company_name ||
    authUser?.user_metadata?.full_name ||
    authUser?.email ||
    'Business Workspace'
  ).trim();

  const slugBase = createOrganizationSlug(companyName);
  const orgInsertResult = await adminClient
    .from(ORGANIZATIONS_TABLE)
    .insert({
      name: companyName,
      slug: `${slugBase}-${String(userId).slice(0, 8)}`,
      owner_user_id: userId,
      organization_type: 'business_tenant',
      organization_status: 'active',
      is_platform_organization: false,
    })
    .select('id, name, slug, organization_status, is_platform_organization')
    .single();

  if (orgInsertResult.error) {
    return { error: orgInsertResult.error };
  }

  const organization = orgInsertResult.data || null;
  const organizationId = organization?.id || null;

  if (!organizationId) {
    return { error: new Error('Failed to create organization') };
  }

  const membershipInsertResult = await adminClient
    .from(ORGANIZATION_MEMBERS_TABLE)
    .upsert(
      {
        organization_id: organizationId,
        user_id: userId,
        member_role: 'org_owner',
        membership_status: 'active',
      },
      { onConflict: 'organization_id,user_id' }
    )
    .select('organization_id, member_role')
    .single();

  if (membershipInsertResult.error) {
    return { error: membershipInsertResult.error };
  }

  return {
    organizationId,
    organization,
    memberRole: membershipInsertResult.data?.member_role || 'org_owner',
  };
};

const upsertPlatformBusinessAccount = async ({
  adminClient,
  userId,
  authUser,
  activationPayload = {},
  organizationContext = {},
}) => {
  const payload = {
    auth_user_id: userId,
    full_name:
      authUser?.user_metadata?.full_name ||
      authUser?.user_metadata?.name ||
      authUser?.email ||
      'Business Owner',
    email: authUser?.email || null,
    company_name:
      authUser?.user_metadata?.company_name ||
      authUser?.app_metadata?.company_name ||
      organizationContext?.organization?.name ||
      authUser?.email ||
      'Business Workspace',
    phone:
      authUser?.user_metadata?.phone ||
      authUser?.app_metadata?.phone ||
      null,
    account_type: normalizeBusinessAccountType(
      authUser?.user_metadata?.account_type ||
      authUser?.app_metadata?.account_type ||
      'business_owner'
    ),
    application_status: normalizeRegistryStatus(
      activationPayload?.verification_status ||
      authUser?.user_metadata?.verification_status ||
      authUser?.app_metadata?.verification_status ||
      'pending'
    ),
    approval_status: normalizeRegistryStatus(
      activationPayload?.verification_status ||
      authUser?.user_metadata?.verification_status ||
      authUser?.app_metadata?.verification_status ||
      'pending'
    ),
    approved_at: activationPayload?.approved_at || authUser?.user_metadata?.approved_at || null,
    approved_by: activationPayload?.approved_by || authUser?.user_metadata?.approved_by || null,
    rejection_reason: activationPayload?.rejection_reason || authUser?.user_metadata?.rejection_reason || null,
    metadata: {
      organization_id: organizationContext?.organizationId || null,
      organization_slug: organizationContext?.organization?.slug || null,
      source: 'admin_users_action',
    },
  };

  return adminClient
    .from(PLATFORM_BUSINESS_ACCOUNTS_TABLE)
    .upsert(payload, { onConflict: 'auth_user_id' })
    .select('*')
    .single();
};

const upsertPlatformBusinessSubscription = async ({
  adminClient,
  businessAccountId,
  authUser,
  activationPayload = {},
}) => {
  const planType = normalizePlanType(
    activationPayload?.plan_type ||
    authUser?.user_metadata?.plan_type ||
    authUser?.app_metadata?.plan_type ||
    'starter'
  );
  const subscriptionStatus = normalizeSubscriptionStatus(
    activationPayload?.subscription_status ||
    authUser?.user_metadata?.subscription_status ||
    authUser?.app_metadata?.subscription_status ||
    'trial'
  );
  const billingStatus = normalizeBillingStatus(
    activationPayload?.billing_status ||
    authUser?.user_metadata?.billing_status ||
    authUser?.app_metadata?.billing_status ||
    'none'
  );

  return adminClient
    .from(PLATFORM_BUSINESS_SUBSCRIPTIONS_TABLE)
    .upsert(
      {
        business_account_id: businessAccountId,
        plan_type: planType,
        subscription_status: subscriptionStatus,
        billing_status: billingStatus,
        trial_started_at: activationPayload?.trial_started_at || authUser?.user_metadata?.trial_started_at || null,
        trial_ends_at: activationPayload?.trial_ends_at || authUser?.user_metadata?.trial_ends_at || null,
        subscription_started_at: activationPayload?.subscription_started_at || authUser?.user_metadata?.subscription_started_at || null,
        suspended_at: activationPayload?.suspended_at || authUser?.user_metadata?.suspended_at || null,
        plan_limits: getPlanLimits(planType),
        metadata: { source: 'admin_users_action' },
      },
      { onConflict: 'business_account_id' }
    )
    .select('*')
    .single();
};

const upsertPlatformTenantRecord = async ({
  adminClient,
  businessAccountId,
  authUser,
  organizationContext = {},
  requestedStatus = 'provisioning',
}) => {
  const requestedSlug = organizationContext?.organization?.slug || buildTenantSlug({
    email: authUser?.email,
    userId: authUser?.id,
    companyName:
      authUser?.user_metadata?.company_name ||
      authUser?.app_metadata?.company_name ||
      organizationContext?.organization?.name ||
      '',
  });
  const tenantSlug = await resolveUniqueTenantSlug({
    adminClient,
    requestedSlug,
    businessAccountId,
  });
  const tenantAppUrl = buildTenantAppUrl(tenantSlug);

  return adminClient
    .from(PLATFORM_TENANTS_TABLE)
    .upsert(
      {
        business_account_id: businessAccountId,
        tenant_key: `tenant_${String(authUser?.id || '').replace(/-/g, '')}`,
        tenant_name:
          organizationContext?.organization?.name ||
          authUser?.user_metadata?.company_name ||
          authUser?.app_metadata?.company_name ||
          authUser?.email ||
          'Business Workspace',
        tenant_slug: tenantSlug,
        tenant_app_url: tenantAppUrl,
        tenant_status: requestedStatus,
        db_provider: 'supabase',
        metadata: {
          source_organization_id: organizationContext?.organizationId || null,
          source_organization_slug: organizationContext?.organization?.slug || null,
        },
      },
      { onConflict: 'business_account_id' }
    )
    .select('*')
    .single();
};

const ensureTenantProvisioningJob = async ({
  adminClient,
  businessAccountId,
  tenantId,
}) => {
  const existingJobResult = await adminClient
    .from(PLATFORM_TENANT_PROVISIONING_JOBS_TABLE)
    .select('id, job_status')
    .eq('business_account_id', businessAccountId)
    .eq('job_type', 'create_tenant')
    .in('job_status', ['queued', 'running'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!existingJobResult.error && existingJobResult.data?.id) {
    return existingJobResult;
  }

  return adminClient
    .from(PLATFORM_TENANT_PROVISIONING_JOBS_TABLE)
    .insert({
      business_account_id: businessAccountId,
      tenant_id: tenantId || null,
      job_type: 'create_tenant',
      job_status: 'queued',
      payload: { source: 'admin_approval' },
      result: {},
    })
    .select('*')
    .single();
};

const insertTenantAuditLog = async ({
  adminClient,
  businessAccountId,
  tenantId,
  performedBy,
  action,
  metadata = {},
}) =>
  adminClient.from(PLATFORM_TENANT_AUDIT_LOG_TABLE).insert({
    business_account_id: businessAccountId || null,
    tenant_id: tenantId || null,
    performed_by: performedBy || null,
    action,
    metadata,
  });

const mergeAuthUserWithAppUser = (authUser, appUser = {}) => {
  const hasAppField = (field) => Object.prototype.hasOwnProperty.call(appUser || {}, field);
  const combinedName = [appUser?.first_name, appUser?.last_name]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
  const authAccountType =
    authUser?.user_metadata?.account_type ||
    authUser?.app_metadata?.account_type ||
    '';
  const authRole =
    appUser?.role ||
    authUser?.user_metadata?.role ||
    authUser?.app_metadata?.role ||
    '';
  const resolvedRole = authRole || 'customer';
  const resolvedAccountType = authAccountType || (resolvedRole === 'customer' ? 'customer' : '');

  const verificationStatus =
    normalizeBusinessOwnerVerificationStatus(
      authUser?.user_metadata?.verification_status ||
      authUser?.app_metadata?.verification_status ||
      appUser?.verification_status ||
      'pending'
    );
  const subscriptionPlan =
    normalizeBusinessOwnerSubscriptionPlan(
      authUser?.user_metadata?.subscription_plan ||
      authUser?.app_metadata?.subscription_plan ||
      appUser?.subscription_plan
    );
  const subscriptionStatus =
    normalizeBusinessOwnerSubscriptionStatus(
      authUser?.user_metadata?.subscription_status ||
      authUser?.app_metadata?.subscription_status ||
      appUser?.subscription_status
    );
  const planType =
    normalizeBusinessOwnerPlanType(
      authUser?.user_metadata?.plan_type ||
      authUser?.app_metadata?.plan_type ||
      appUser?.plan_type ||
      (subscriptionPlan === 'saas_web' ? 'growth' : 'starter')
    ) || 'starter';
  const billingStatus =
    normalizeBusinessOwnerBillingStatus(
      authUser?.user_metadata?.billing_status ||
      authUser?.app_metadata?.billing_status ||
      appUser?.billing_status
    );

  return {
    ...authUser,
    id: authUser?.id,
    email: appUser?.email || authUser?.email || null,
    username: hasAppField('username') ? appUser?.username : (authUser?.user_metadata?.username || null),
    first_name: hasAppField('first_name') ? (appUser?.first_name || '') : (authUser?.user_metadata?.first_name || ''),
    last_name: hasAppField('last_name') ? (appUser?.last_name || '') : (authUser?.user_metadata?.last_name || ''),
    name:
      buildDisplayName(
        combinedName,
        hasAppField('full_name') ? appUser?.full_name : null,
        authUser?.user_metadata?.full_name,
        authUser?.user_metadata?.name,
        authUser?.email,
      ) || 'No Name',
    full_name:
      buildDisplayName(
        combinedName,
        hasAppField('full_name') ? appUser?.full_name : null,
        authUser?.user_metadata?.full_name,
        authUser?.user_metadata?.name,
        authUser?.email,
      ) || 'No Name',
    role: resolvedRole,
    account_type: resolvedAccountType,
    company_name:
      authUser?.user_metadata?.company_name ||
      authUser?.app_metadata?.company_name ||
      '',
    service_area:
      authUser?.user_metadata?.service_area ||
      authUser?.app_metadata?.service_area ||
      '',
    verification_status: verificationStatus,
    approved_at: authUser?.user_metadata?.approved_at || authUser?.app_metadata?.approved_at || appUser?.approved_at || null,
    approved_by: authUser?.user_metadata?.approved_by || authUser?.app_metadata?.approved_by || appUser?.approved_by || null,
    rejection_reason: authUser?.user_metadata?.rejection_reason || authUser?.app_metadata?.rejection_reason || appUser?.rejection_reason || '',
    subscription_plan: subscriptionPlan,
    subscription_status: subscriptionStatus,
    plan_type: planType,
    billing_status: billingStatus,
    trial_started_at: authUser?.user_metadata?.trial_started_at || authUser?.app_metadata?.trial_started_at || appUser?.trial_started_at || null,
    trial_ends_at: authUser?.user_metadata?.trial_ends_at || authUser?.app_metadata?.trial_ends_at || appUser?.trial_ends_at || null,
    subscription_started_at: authUser?.user_metadata?.subscription_started_at || authUser?.app_metadata?.subscription_started_at || appUser?.subscription_started_at || null,
    suspended_at: authUser?.user_metadata?.suspended_at || authUser?.app_metadata?.suspended_at || appUser?.suspended_at || null,
    suspension_reason: authUser?.user_metadata?.suspension_reason || authUser?.app_metadata?.suspension_reason || appUser?.suspension_reason || '',
    plan_changed_at: authUser?.user_metadata?.plan_changed_at || authUser?.app_metadata?.plan_changed_at || appUser?.plan_changed_at || null,
    phone_number: appUser?.phone_number || '',
    whatsapp_notifications: Boolean(appUser?.whatsapp_notifications),
    preferences: appUser?.preferences && typeof appUser.preferences === 'object' && !Array.isArray(appUser.preferences)
      ? appUser.preferences
      : authUser?.user_metadata?.preferences || {},
    permissions:
      appUser?.permissions && typeof appUser.permissions === 'object' && !Array.isArray(appUser.permissions)
        ? appUser.permissions
        : {},
    salary_amount: appUser?.salary_amount ?? null,
    staff_id_documents: Array.isArray(authUser?.user_metadata?.staff_id_documents)
      ? authUser.user_metadata.staff_id_documents
      : [],
    access_enabled: appUser?.access_enabled ?? true,
    primary_organization_id: appUser?.primary_organization_id || null,
    created_at: appUser?.created_at || authUser?.created_at || null,
    updated_at: appUser?.updated_at || authUser?.updated_at || null,
  };
};

const PLATFORM_ADMIN_PERMISSION_DEFAULTS = {
  Workspaces: true,
  'Platform Admins': false,
  'Marketplace Review': false,
  'System Settings': false,
};

const normalizePlatformAdminPermissions = (value) => {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    return { ...PLATFORM_ADMIN_PERMISSION_DEFAULTS };
  }

  return {
    ...PLATFORM_ADMIN_PERMISSION_DEFAULTS,
    ...Object.entries(value).reduce((acc, [key, enabled]) => {
      acc[String(key)] = enabled === true;
      return acc;
    }, {}),
  };
};

const normalizeEmail = (value = '') => String(value || '').trim().toLowerCase();

const isSharedTenantUserAllowlisted = (candidate = {}) =>
  SHARED_TENANT_USER_ALLOWLIST.has(normalizeEmail(candidate?.email));

const resolveOrganizationMemberRole = (role = '') => {
  const normalizedRole = String(role || '').trim().toLowerCase();
  if (normalizedRole === 'owner' || normalizedRole === 'admin') return 'org_admin';
  if (normalizedRole === 'guide') return 'guide';
  if (normalizedRole === 'mechanic') return 'mechanic';
  if (normalizedRole === 'finance') return 'finance';
  return 'org_member';
};

const loadTenantScopedUserIds = async (adminClient, tenantScope) => {
  if (!tenantScope?.isShared || !tenantScope?.organizationId) {
    return null;
  }

  const organizationId = String(tenantScope.organizationId || '').trim();
  if (!organizationId) {
    return null;
  }

  const [profileResult, membershipResult] = await Promise.all([
    adminClient
      .from(APP_USERS_TABLE)
      .select('id')
      .eq('primary_organization_id', organizationId),
    adminClient
      .from(ORGANIZATION_MEMBERS_TABLE)
      .select('user_id, membership_status')
      .eq('organization_id', organizationId),
  ]);

  if (profileResult.error) {
    throw profileResult.error;
  }

  if (membershipResult.error) {
    throw membershipResult.error;
  }

  const scopedIds = new Set(
    (profileResult.data || [])
      .map((row) => String(row?.id || '').trim())
      .filter(Boolean)
  );

  (membershipResult.data || []).forEach((row) => {
    const membershipStatus = String(row?.membership_status || '').trim().toLowerCase();
    if (!['active', 'invited'].includes(membershipStatus)) {
      return;
    }
    const userId = String(row?.user_id || '').trim();
    if (userId) {
      scopedIds.add(userId);
    }
  });

  return scopedIds;
};

const filterUsersForTenantScope = ({
  users = [],
  scopedUserIds = null,
  currentUserId = null,
} = {}) => {
  if (!(scopedUserIds instanceof Set)) {
    return users;
  }

  const normalizedCurrentUserId = String(currentUserId || '').trim();
  return users.filter((candidate) => {
    const candidateId = String(candidate?.id || '').trim();
    if (candidateId && candidateId === normalizedCurrentUserId) {
      return true;
    }
    if (candidateId && scopedUserIds.has(candidateId)) {
      return true;
    }
    return isSharedTenantUserAllowlisted(candidate);
  });
};

const ensureTenantScopedStaffMembership = async ({
  adminClient,
  tenantScope,
  userId,
  email = '',
  role = 'employee',
  fullName = '',
} = {}) => {
  if (!tenantScope?.isShared || !tenantScope?.organizationId || !userId || isSharedTenantUserAllowlisted({ email })) {
    return;
  }

  const organizationId = String(tenantScope.organizationId || '').trim();
  if (!organizationId) {
    return;
  }

  const normalizedRole = String(role || 'employee').trim().toLowerCase() || 'employee';
  const profilePayload = {
    id: userId,
    email: email || null,
    full_name: fullName || email || null,
    role: normalizedRole,
    primary_organization_id: organizationId,
    access_enabled: true,
    updated_at: new Date().toISOString(),
  };

  const { error: profileError } = await adminClient
    .from(APP_USERS_TABLE)
    .upsert(profilePayload, { onConflict: 'id' });

  if (profileError && !isSchemaCompatibilityError(profileError)) {
    throw profileError;
  }

  const { error: membershipError } = await adminClient
    .from(ORGANIZATION_MEMBERS_TABLE)
    .upsert(
      {
        organization_id: organizationId,
        user_id: userId,
        member_role: resolveOrganizationMemberRole(normalizedRole),
        membership_status: 'active',
      },
      { onConflict: 'organization_id,user_id' }
    );

  if (membershipError) {
    throw membershipError;
  }
};

const listAllAuthUsers = async (adminClient) => {
  const { data, error } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });

  if (error) {
    throw error;
  }

  return data?.users || [];
};

const mergePlatformAdminRecord = (record, authUser = null) => ({
  id: record?.id || null,
  auth_user_id: record?.auth_user_id || authUser?.id || null,
  email: record?.email || authUser?.email || null,
  full_name:
    record?.full_name ||
    authUser?.user_metadata?.full_name ||
    authUser?.user_metadata?.name ||
    authUser?.email ||
    'Platform admin',
  platform_role: record?.platform_role || 'platform_admin',
  access_enabled: record?.access_enabled !== false,
  permissions: normalizePlatformAdminPermissions(record?.permissions),
  notes: record?.notes || '',
  granted_by: record?.granted_by || null,
  disabled_by: record?.disabled_by || null,
  disabled_at: record?.disabled_at || null,
  metadata: record?.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)
    ? record.metadata
    : {},
  created_at: record?.created_at || null,
  updated_at: record?.updated_at || null,
});

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const scope = String(req.query?.scope || '').trim().toLowerCase();

  if (scope === 'platform-admins') {
    const scopedAuth = req.method === 'GET'
      ? await requirePlatformOwnerOrAdmin(req, 'Platform Admins')
      : await requirePlatformOwner(req);

    if (scopedAuth.error) {
      res.status(scopedAuth.error.status).json(scopedAuth.error.body);
      return;
    }

    const { adminClient, user } = scopedAuth;
    const targetAuthUserId = req.query?.userId ? String(req.query.userId) : null;

    try {
      if (req.method === 'GET') {
        const [platformAdminsResult, authUsers] = await Promise.all([
          adminClient
            .from(PLATFORM_ADMIN_ACCOUNTS_TABLE)
            .select('*')
            .order('created_at', { ascending: true }),
          listAllAuthUsers(adminClient),
        ]);

        if (platformAdminsResult.error) {
          throw platformAdminsResult.error;
        }

        const authUserMap = new Map(authUsers.map((authUser) => [String(authUser.id), authUser]));
        const admins = (platformAdminsResult.data || []).map((record) =>
          mergePlatformAdminRecord(record, authUserMap.get(String(record.auth_user_id)) || null)
        );

        res.status(200).json({ admins });
        return;
      }

      if (req.method === 'POST') {
        const {
          email,
          platform_role = 'platform_admin',
          access_enabled = true,
          permissions = {},
          notes = '',
        } = req.body || {};

        const normalizedEmail = String(email || '').trim().toLowerCase();

        if (!normalizedEmail) {
          res.status(400).json({ error: 'Email is required' });
          return;
        }

        const authUsers = await listAllAuthUsers(adminClient);
        const authUser = authUsers.find(
          (candidate) => String(candidate.email || '').trim().toLowerCase() === normalizedEmail
        );

        if (!authUser?.id) {
          res.status(404).json({ error: 'User not found in authentication records' });
          return;
        }

        const payload = {
          auth_user_id: authUser.id,
          email: normalizedEmail,
          full_name:
            authUser.user_metadata?.full_name ||
            authUser.user_metadata?.name ||
            normalizedEmail,
          platform_role: String(platform_role || 'platform_admin').trim().toLowerCase() === 'platform_owner'
            ? 'platform_owner'
            : 'platform_admin',
          access_enabled: access_enabled !== false,
          permissions: normalizePlatformAdminPermissions(permissions),
          notes: String(notes || '').trim() || null,
          granted_by: user?.id || null,
          disabled_by: access_enabled === false ? user?.id || null : null,
          disabled_at: access_enabled === false ? new Date().toISOString() : null,
          metadata: { source: 'platform_admins_page' },
        };

        const { data, error } = await adminClient
          .from(PLATFORM_ADMIN_ACCOUNTS_TABLE)
          .upsert(payload, { onConflict: 'auth_user_id' })
          .select('*')
          .single();

        if (error) {
          throw error;
        }

        res.status(200).json({ admin: mergePlatformAdminRecord(data, authUser) });
        return;
      }

      if (req.method === 'PATCH') {
        if (!targetAuthUserId) {
          res.status(400).json({ error: 'userId is required' });
          return;
        }

        const { platform_role, access_enabled, permissions, notes } = req.body || {};
        const updatePayload = {
          updated_at: new Date().toISOString(),
        };

        if (platform_role) {
          updatePayload.platform_role =
            String(platform_role).trim().toLowerCase() === 'platform_owner'
              ? 'platform_owner'
              : 'platform_admin';
        }

        if (typeof access_enabled === 'boolean') {
          updatePayload.access_enabled = access_enabled;
          updatePayload.disabled_by = access_enabled ? null : user?.id || null;
          updatePayload.disabled_at = access_enabled ? null : new Date().toISOString();
        }

        if (permissions && typeof permissions === 'object' && !Array.isArray(permissions)) {
          updatePayload.permissions = normalizePlatformAdminPermissions(permissions);
        }

        if (typeof notes !== 'undefined') {
          updatePayload.notes = String(notes || '').trim() || null;
        }

        const { data, error } = await adminClient
          .from(PLATFORM_ADMIN_ACCOUNTS_TABLE)
          .update(updatePayload)
          .eq('auth_user_id', targetAuthUserId)
          .select('*')
          .single();

        if (error) {
          throw error;
        }

        const authUserResult = await adminClient.auth.admin.getUserById(targetAuthUserId);
        const authUser = authUserResult?.data?.user || null;

        res.status(200).json({ admin: mergePlatformAdminRecord(data, authUser) });
        return;
      }

      if (req.method === 'DELETE') {
        if (!targetAuthUserId) {
          res.status(400).json({ error: 'userId is required' });
          return;
        }

        const { data, error } = await adminClient
          .from(PLATFORM_ADMIN_ACCOUNTS_TABLE)
          .update({
            access_enabled: false,
            disabled_by: user?.id || null,
            disabled_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('auth_user_id', targetAuthUserId)
          .select('*')
          .single();

        if (error) {
          throw error;
        }

        const authUserResult = await adminClient.auth.admin.getUserById(targetAuthUserId);
        const authUser = authUserResult?.data?.user || null;

        res.status(200).json({ admin: mergePlatformAdminRecord(data, authUser) });
        return;
      }

      res.status(405).json({ error: 'Method not allowed' });
      return;
    } catch (error) {
      console.error('admin-users platform-admins failed:', {
        message: error?.message,
        code: error?.code,
        details: error?.details,
      });
      res.status(500).json({ error: error.message || 'Failed to manage platform admins' });
      return;
    }
  }

  if (req.method === 'GET' && !req.query?.userId && scope === 'staff-directory') {
    const scopedAuth = await canAccessStaffDirectory(req);

    if (scopedAuth.error) {
      res.status(scopedAuth.error.status).json(scopedAuth.error.body);
      return;
    }

    const { adminClient, user } = scopedAuth;

    try {
      const tenantScope = await resolveRequestTenantScope({ req, adminClient });
      const scopedUserIds = await loadTenantScopedUserIds(adminClient, tenantScope);
      const { data, error } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });

      if (error) {
        throw error;
      }

      const authUsers = data?.users || [];
      let appUsers = [];
      const { data: appUsersData, error: appUsersError } = await loadAppUsersWithCompatibility(adminClient);

      if (!appUsersError) {
        appUsers = appUsersData || [];
      }

      const appUserMap = new Map(appUsers.map((candidate) => [String(candidate.id), candidate]));
      const mergedUsers = filterUsersForTenantScope({
        users: authUsers
          .map((authUser) => mergeAuthUserWithAppUser(authUser, appUserMap.get(String(authUser.id)) || {}))
          .filter((candidate) => {
            const role = String(candidate?.role || '').trim().toLowerCase();
            return ['owner', 'admin', 'employee', 'guide', 'business_owner'].includes(role) && String(candidate?.id || '') !== String(user?.id || '');
          })
          .map((candidate) => ({
            id: candidate.id,
            email: candidate.email,
            full_name: candidate.full_name || null,
            first_name: candidate.first_name || null,
            last_name: candidate.last_name || null,
            username: candidate.username || null,
            role: candidate.role || 'employee',
            access_enabled: candidate.access_enabled !== false,
            created_at: candidate.created_at || null,
            updated_at: candidate.updated_at || null,
          })),
        scopedUserIds,
        currentUserId: user?.id || null,
      });

      res.status(200).json({ users: mergedUsers });
      return;
    } catch (error) {
      console.error('admin-users staff-directory failed:', {
        message: error?.message,
        code: error?.code,
        details: error?.details,
      });
      res.status(500).json({ error: error.message || 'Failed to load staff directory' });
      return;
    }
  }

  const auth = await requireOwnerOrAdmin(req);

  if (auth.error) {
    res.status(auth.error.status).json(auth.error.body);
    return;
  }

  const { adminClient } = auth;
  const userId = req.query?.userId ? String(req.query.userId) : null;

  try {
    const tenantScope = await resolveRequestTenantScope({ req, adminClient });
    const scopedUserIds = await loadTenantScopedUserIds(adminClient, tenantScope);

    if (req.method === 'GET' && !userId) {
      const { data, error } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });

      if (error) {
        throw error;
      }

      const authUsers = data?.users || [];

      let appUsers = [];
      const { data: appUsersData, error: appUsersError } = await loadAppUsersWithCompatibility(adminClient);

      if (!appUsersError) {
        appUsers = appUsersData || [];
      }

      const appUserMap = new Map(appUsers.map((user) => [String(user.id), user]));
      const mergedUsers = filterUsersForTenantScope({
        users: authUsers.map((authUser) =>
          mergeAuthUserWithAppUser(authUser, appUserMap.get(String(authUser.id)) || {})
        ),
        scopedUserIds,
        currentUserId: auth.user?.id || null,
      });

      res.status(200).json({ users: mergedUsers });
      return;
    }

    if (req.method === 'GET' && userId) {
      const authUserResult = await adminClient.auth.admin.getUserById(userId);
      const targetAuthUser = authUserResult?.data?.user || null;

      if (!targetAuthUser) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      let appUser = {};
      const { data: appUserData, error: appUserError } = await loadAppUsersWithCompatibility(adminClient);

      if (!appUserError && Array.isArray(appUserData)) {
        appUser = appUserData.find((candidate) => String(candidate?.id) === String(userId)) || {};
      }

      const mergedUser = mergeAuthUserWithAppUser(targetAuthUser, appUser);
      const visibleUsers = filterUsersForTenantScope({
        users: [mergedUser],
        scopedUserIds,
        currentUserId: auth.user?.id || null,
      });

      if (visibleUsers.length === 0) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.status(200).json({ user: visibleUsers[0] });
      return;
    }

    if (req.method === 'POST' && !userId) {
      const { email, password, email_confirm = true, user_metadata = {}, app_profile = {}, promote_existing = false } = req.body || {};

      if (!email || (!password && !promote_existing)) {
        res.status(400).json({ error: 'Email and password are required' });
        return;
      }

      let createdUser = null;

      if (promote_existing) {
        const { data: existingUsers, error: listError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
        if (listError) {
          throw listError;
        }

        const normalizedEmail = String(email || '').trim().toLowerCase();
        const existingUser = (existingUsers?.users || []).find(
          (candidate) => String(candidate.email || '').trim().toLowerCase() === normalizedEmail
        );

        const fallbackMetadata = {
          ...user_metadata,
          full_name: user_metadata.full_name || app_profile.full_name || email,
          role: user_metadata.role || app_profile.role || 'employee',
          permissions: resolveStaffPermissions(
            user_metadata.role || app_profile.role || 'employee',
            user_metadata.permissions && typeof user_metadata.permissions === 'object' && !Array.isArray(user_metadata.permissions)
              ? user_metadata.permissions
              : app_profile.permissions
          ),
          account_type: 'staff',
          staff_access_prepared: true,
          staff_access_prepared_at: new Date().toISOString(),
        };

        if (!existingUser?.id) {
          const generatedPassword = `${crypto.randomBytes(24).toString('base64url')}Aa1!`;
          const { data: pendingAuthUser, error: createPendingError } = await adminClient.auth.admin.createUser({
            email,
            password: generatedPassword,
            email_confirm: true,
            user_metadata: fallbackMetadata,
          });

          if (createPendingError) {
            throw createPendingError;
          }

          createdUser = pendingAuthUser?.user || null;
        } else {
          const mergedMetadata = {
            ...(existingUser.user_metadata || {}),
            ...fallbackMetadata,
            full_name:
              user_metadata.full_name ||
              existingUser.user_metadata?.full_name ||
              existingUser.user_metadata?.name ||
              email,
          };

          const { data: updatedAuthUser, error: updateError } = await adminClient.auth.admin.updateUserById(existingUser.id, {
            user_metadata: mergedMetadata,
          });

          if (updateError) {
            throw updateError;
          }

          createdUser = updatedAuthUser?.user || existingUser;
        }
      } else {
        const { data, error } = await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm,
          user_metadata,
        });

        if (error) {
          throw error;
        }

        createdUser = data?.user || null;
      }

      if (createdUser?.id) {
        const upsertPayload = {
          id: createdUser.id,
          email: createdUser.email || email,
          full_name: app_profile.full_name || user_metadata.full_name || createdUser.user_metadata?.full_name || email,
          role: app_profile.role || user_metadata.role || createdUser.user_metadata?.role || 'employee',
          phone_number: app_profile.phone_number || null,
          whatsapp_notifications: Boolean(app_profile.whatsapp_notifications),
          preferences: app_profile.preferences && typeof app_profile.preferences === 'object' && !Array.isArray(app_profile.preferences)
            ? app_profile.preferences
            : {},
          access_enabled: app_profile.access_enabled ?? true,
          permissions: resolveStaffPermissions(
            app_profile.role || user_metadata.role || createdUser.user_metadata?.role || 'employee',
            app_profile.permissions && typeof app_profile.permissions === 'object' && !Array.isArray(app_profile.permissions)
              ? app_profile.permissions
              : user_metadata.permissions
          ),
          updated_at: new Date().toISOString(),
        };

        if (app_profile.salary_amount !== undefined && app_profile.salary_amount !== '') {
          upsertPayload.salary_amount = Number(app_profile.salary_amount) || 0;
        }

        let { error: upsertError } = await adminClient
          .from(APP_USERS_TABLE)
          .upsert(upsertPayload, { onConflict: 'id' });

        if (upsertError && String(upsertError.message || '').includes('salary_amount')) {
          const { salary_amount, ...retryPayload } = upsertPayload;
          const retryResult = await adminClient
            .from(APP_USERS_TABLE)
            .upsert(retryPayload, { onConflict: 'id' });
          upsertError = retryResult.error;
        }

        if (upsertError) {
          console.warn('Failed to sync app user profile during create:', upsertError);
        }

        await ensureTenantScopedStaffMembership({
          adminClient,
          tenantScope,
          userId: createdUser.id,
          email: createdUser.email || email,
          role: upsertPayload.role,
          fullName: upsertPayload.full_name,
        });
      }

      res.status(201).json({ user: createdUser });
      return;
    }

    if (req.method === 'PATCH' && userId) {
      const { email, password, user_metadata, app_profile = {} } = req.body || {};
      const updatePayload = {};

      if (email) {
        updatePayload.email = email;
      }

      if (password) {
        updatePayload.password = password;
      }

      if (user_metadata) {
        updatePayload.user_metadata = user_metadata;
      }

      let updatedUser = null;

      if (Object.keys(updatePayload).length > 0) {
        const { data, error } = await adminClient.auth.admin.updateUserById(userId, updatePayload);

        if (error) {
          throw error;
        }

        updatedUser = data?.user || null;
      }

      const appUserUpdate = {
        updated_at: new Date().toISOString(),
      };

      if (req.body?.action) {
        const action = String(req.body.action || '').trim();
        console.log('admin-users business-owner action start:', { action, userId, actorId: auth.user?.id || null });
        if (![
          'approve_business_owner',
          'reject_business_owner',
          'request_business_owner_info',
          'suspend_business_owner',
          'reactivate_business_owner',
          'extend_business_owner_trial',
          'activate_business_owner_subscription',
          'change_business_owner_plan',
        ].includes(action)) {
          res.status(400).json({ error: 'Invalid business owner action' });
          return;
        }

        const authUserResult = await adminClient.auth.admin.getUserById(userId);
        console.log('admin-users target auth lookup:', {
          userId,
          lookupError: authUserResult?.error || null,
          found: Boolean(authUserResult?.data?.user),
        });
        const targetAuthUser = authUserResult?.data?.user || null;
        const targetAccountType = String(
          targetAuthUser?.user_metadata?.account_type ||
          targetAuthUser?.app_metadata?.account_type ||
          ''
        ).trim().toLowerCase();

        if (!BUSINESS_OWNER_ACCOUNT_TYPES.has(targetAccountType)) {
          res.status(400).json({ error: 'Target user is not a business owner account' });
          return;
        }

        if (action === 'reject_business_owner' && !String(req.body?.reason || '').trim()) {
          res.status(400).json({ error: 'Rejection reason is required' });
          return;
        }
        const nowIso = new Date().toISOString();
        const currentTrialEndsAt = targetAuthUser?.user_metadata?.trial_ends_at || targetAuthUser?.app_metadata?.trial_ends_at || null;
        const currentPlanType = normalizeBusinessOwnerPlanType(
          targetAuthUser?.user_metadata?.plan_type ||
          targetAuthUser?.app_metadata?.plan_type ||
          'starter'
        ) || 'starter';
        const requestedPlanType = normalizeBusinessOwnerPlanType(req.body?.plan_type || currentPlanType) || currentPlanType;
        let activationPayload = buildBusinessOwnerActivationPayload({
          action,
          reason: req.body?.reason,
          adminId: auth.user?.id || null,
        });

        if (action === 'suspend_business_owner') {
          activationPayload = {
            verification_status: 'approved',
            subscription_status: 'suspended',
            suspended_at: nowIso,
            suspension_reason: String(req.body?.reason || '').trim() || null,
            updated_at: nowIso,
          };
        }

        if (action === 'reactivate_business_owner') {
          const nextStatus = currentTrialEndsAt && new Date(currentTrialEndsAt).getTime() > Date.now() ? 'trial' : 'active';
          activationPayload = {
            verification_status: 'approved',
            subscription_status: nextStatus,
            suspended_at: null,
            suspension_reason: null,
            updated_at: nowIso,
          };
        }

        if (action === 'extend_business_owner_trial') {
          const currentEndDate = currentTrialEndsAt ? new Date(currentTrialEndsAt) : new Date();
          const baseDate = Number.isNaN(currentEndDate.getTime()) || currentEndDate.getTime() < Date.now()
            ? new Date()
            : currentEndDate;
          baseDate.setDate(baseDate.getDate() + 7);
          activationPayload = {
            verification_status: 'approved',
            subscription_status: 'trial',
            trial_ends_at: baseDate.toISOString(),
            suspended_at: null,
            suspension_reason: null,
            updated_at: nowIso,
          };
        }

        if (action === 'activate_business_owner_subscription') {
          activationPayload = {
            verification_status: 'approved',
            subscription_status: 'active',
            billing_status: 'active',
            subscription_started_at: nowIso,
            suspended_at: null,
            suspension_reason: null,
            updated_at: nowIso,
          };
        }

        if (action === 'change_business_owner_plan') {
          activationPayload = {
            verification_status: 'approved',
            plan_type: requestedPlanType,
            plan_changed_at: nowIso,
            updated_at: nowIso,
          };
        }

        let organizationContext = {
          organizationId: null,
          organization: null,
          memberRole: null,
        };

        if (action === 'approve_business_owner' || action === 'reactivate_business_owner' || action === 'activate_business_owner_subscription' || action === 'change_business_owner_plan') {
          const ensuredOrganization = await ensureBusinessOwnerOrganization(adminClient, userId, targetAuthUser);
          if (ensuredOrganization?.error && !isSchemaCompatibilityError(ensuredOrganization.error)) {
            throw ensuredOrganization.error;
          }
          if (ensuredOrganization?.organizationId) {
            organizationContext = ensuredOrganization;
            activationPayload = {
              ...activationPayload,
              primary_organization_id: ensuredOrganization.organizationId,
            };
          }
        }

        const nextUserMetadata = {
          ...(targetAuthUser?.user_metadata || {}),
          ...activationPayload,
        };

        const { data: activationUpdate, error: activationError } = await adminClient.auth.admin.updateUserById(userId, {
          user_metadata: nextUserMetadata,
        });

        if (activationError) {
          console.error('admin-users auth activation update failed:', {
            userId,
            action,
            activationError,
          });
          throw activationError;
        }

        console.log('admin-users auth activation update success:', {
          userId,
          action,
          metadataKeys: Object.keys(nextUserMetadata || {}),
        });

        let updatedAppUser = null;
        const { data: activationProfileData, error: appUpdateError } = await syncBusinessOwnerActivationProfile(
          adminClient,
          userId,
          activationUpdate?.user || targetAuthUser,
          activationPayload
        );

        if (appUpdateError && !isSchemaCompatibilityError(appUpdateError)) {
          console.warn('Business owner activation profile sync failed:', appUpdateError);
        }

        if (activationProfileData) {
          updatedAppUser = activationProfileData;
        }

        let registryBusinessAccount = null;
        let registrySubscription = null;
        let registryTenant = null;
        let registryProvisioningJob = null;

        const registryBusinessAccountResult = await upsertPlatformBusinessAccount({
          adminClient,
          userId,
          authUser: activationUpdate?.user || targetAuthUser,
          activationPayload,
          organizationContext,
        });

        if (!registryBusinessAccountResult.error && registryBusinessAccountResult.data?.id) {
          registryBusinessAccount = registryBusinessAccountResult.data;

          const registrySubscriptionResult = await upsertPlatformBusinessSubscription({
            adminClient,
            businessAccountId: registryBusinessAccount.id,
            authUser: activationUpdate?.user || targetAuthUser,
            activationPayload,
          });

          if (!registrySubscriptionResult.error) {
            registrySubscription = registrySubscriptionResult.data || null;
          }

          const shouldPrepareTenant = ['approve_business_owner', 'reactivate_business_owner', 'activate_business_owner_subscription', 'change_business_owner_plan'].includes(action);
          if (shouldPrepareTenant) {
            const tenantStatus = action === 'reactivate_business_owner' ? 'provisioning' : 'provisioning';
            const registryTenantResult = await upsertPlatformTenantRecord({
              adminClient,
              businessAccountId: registryBusinessAccount.id,
              authUser: activationUpdate?.user || targetAuthUser,
              organizationContext,
              requestedStatus: tenantStatus,
            });

            if (!registryTenantResult.error) {
              registryTenant = registryTenantResult.data || null;

              const provisioningJobResult = await ensureTenantProvisioningJob({
                adminClient,
                businessAccountId: registryBusinessAccount.id,
                tenantId: registryTenant?.id || null,
              });

              if (!provisioningJobResult.error) {
                registryProvisioningJob = provisioningJobResult.data || null;
              }
            }
          }

          if (action === 'suspend_business_owner') {
            const suspendedTenantResult = await adminClient
              .from(PLATFORM_TENANTS_TABLE)
              .update({
                tenant_status: 'suspended',
                updated_at: nowIso,
              })
              .eq('business_account_id', registryBusinessAccount.id)
              .select('*')
              .maybeSingle();

            if (!suspendedTenantResult.error) {
              registryTenant = suspendedTenantResult.data || registryTenant;
            }
          }

          if (action === 'reject_business_owner') {
            const archivedTenantResult = await adminClient
              .from(PLATFORM_TENANTS_TABLE)
              .update({
                tenant_status: 'archived',
                updated_at: nowIso,
              })
              .eq('business_account_id', registryBusinessAccount.id)
              .select('*')
              .maybeSingle();

            if (!archivedTenantResult.error) {
              registryTenant = archivedTenantResult.data || registryTenant;
            }
          }

          await insertTenantAuditLog({
            adminClient,
            businessAccountId: registryBusinessAccount.id,
            tenantId: registryTenant?.id || null,
            performedBy: auth.user?.id || null,
            action,
            metadata: {
              organization_id: organizationContext.organizationId || null,
              verification_status: activationPayload?.verification_status || null,
              subscription_status: activationPayload?.subscription_status || null,
              plan_type: activationPayload?.plan_type || null,
            },
          });
        }

        console.log('admin-users business-owner action complete:', {
          userId,
          action,
          appProfileSynced: Boolean(updatedAppUser),
        });

        res.status(200).json({
          user: activationUpdate?.user || targetAuthUser,
          profile: updatedAppUser,
          organization: organizationContext.organization,
          organization_id: organizationContext.organizationId,
          organization_role: organizationContext.memberRole,
          business_account: registryBusinessAccount,
          tenant: registryTenant,
          subscription: registrySubscription,
          provisioning_job: registryProvisioningJob,
        });
        return;
      }

      if (email !== undefined) appUserUpdate.email = email;
      if (app_profile.full_name !== undefined) appUserUpdate.full_name = app_profile.full_name;
      if (app_profile.role !== undefined) appUserUpdate.role = app_profile.role;
      if (app_profile.phone_number !== undefined) appUserUpdate.phone_number = app_profile.phone_number || null;
      if (app_profile.whatsapp_notifications !== undefined) appUserUpdate.whatsapp_notifications = Boolean(app_profile.whatsapp_notifications);
      if (app_profile.preferences && typeof app_profile.preferences === 'object' && !Array.isArray(app_profile.preferences)) appUserUpdate.preferences = app_profile.preferences;
      if (app_profile.access_enabled !== undefined) appUserUpdate.access_enabled = Boolean(app_profile.access_enabled);
      if (app_profile.permissions && typeof app_profile.permissions === 'object') appUserUpdate.permissions = app_profile.permissions;
      if (app_profile.salary_amount !== undefined && app_profile.salary_amount !== '') {
        appUserUpdate.salary_amount = Number(app_profile.salary_amount) || 0;
      }
      if (tenantScope?.isShared && tenantScope.organizationId && !isSharedTenantUserAllowlisted({ email })) {
        appUserUpdate.primary_organization_id = tenantScope.organizationId;
      }

      if (Array.isArray(app_profile.staff_id_documents)) {
        const existingAuthUser = updatedUser || (await adminClient.auth.admin.getUserById(userId))?.data?.user;
        const mergedMetadata = {
          ...(existingAuthUser?.user_metadata || {}),
          ...(user_metadata || {}),
          staff_id_documents: app_profile.staff_id_documents,
        };
        const { data: metadataUpdate, error: metadataError } = await adminClient.auth.admin.updateUserById(userId, {
          user_metadata: mergedMetadata,
        });
        if (metadataError) {
          throw metadataError;
        }
        updatedUser = metadataUpdate?.user || updatedUser;
      }

      if (Object.keys(appUserUpdate).length > 1) {
        let { error: updateError } = await adminClient
          .from(APP_USERS_TABLE)
          .update(appUserUpdate)
          .eq('id', userId);

        if (updateError && String(updateError.message || '').includes('salary_amount')) {
          delete appUserUpdate.salary_amount;
          const retryResult = await adminClient
            .from(APP_USERS_TABLE)
            .update(appUserUpdate)
            .eq('id', userId);
          updateError = retryResult.error;
        }

        if (updateError) {
          console.warn('Failed to sync app user profile during update:', updateError);
        }
      }

      await ensureTenantScopedStaffMembership({
        adminClient,
        tenantScope,
        userId,
        email: email || updatedUser?.email || '',
        role: app_profile.role || user_metadata?.role || updatedUser?.user_metadata?.role || 'employee',
        fullName:
          app_profile.full_name ||
          user_metadata?.full_name ||
          updatedUser?.user_metadata?.full_name ||
          updatedUser?.email ||
          '',
      });

      res.status(200).json({ user: updatedUser });
      return;
    }

    if (req.method === 'DELETE' && userId) {
      const isTenantHostRequest = Boolean(String(tenantScope?.tenantSlug || '').trim());

      if (isTenantHostRequest && tenantScope?.tenancyMode === 'shared' && !tenantScope?.organizationId) {
        res.status(409).json({
          error: 'Workspace user removal is unavailable because the tenant organization context could not be resolved.',
        });
        return;
      }

      if (tenantScope?.isShared && tenantScope.organizationId) {
        const { data: targetProfile, error: targetProfileError } = await adminClient
          .from(APP_USERS_TABLE)
          .select('id, email, primary_organization_id')
          .eq('id', userId)
          .maybeSingle();

        if (targetProfileError && !isSchemaCompatibilityError(targetProfileError)) {
          throw targetProfileError;
        }

        const targetEmail = targetProfile?.email || '';
        if (!isSharedTenantUserAllowlisted({ email: targetEmail })) {
          const normalizedTenantOrganizationId = String(tenantScope.organizationId || '').trim();

          const { error: membershipDetachError } = await adminClient
            .from(ORGANIZATION_MEMBERS_TABLE)
            .update({
              membership_status: 'suspended',
              updated_at: new Date().toISOString(),
            })
            .eq('organization_id', normalizedTenantOrganizationId)
            .eq('user_id', userId);

          if (membershipDetachError && !isSchemaCompatibilityError(membershipDetachError)) {
            throw membershipDetachError;
          }

          const normalizedPrimaryOrganizationId = String(targetProfile?.primary_organization_id || '').trim();
          if (normalizedPrimaryOrganizationId === normalizedTenantOrganizationId) {
            const { error: detachError } = await adminClient
              .from(APP_USERS_TABLE)
              .update({
                primary_organization_id: null,
                access_enabled: false,
                updated_at: new Date().toISOString(),
              })
              .eq('id', userId);

            if (detachError && !isSchemaCompatibilityError(detachError)) {
              throw detachError;
            }
          }
        }

        res.status(200).json({ success: true, detached: true });
        return;
      }

      if (isTenantHostRequest) {
        res.status(409).json({
          error: 'Workspace user removal is limited to the current tenant scope and cannot fall back to a global account delete.',
        });
        return;
      }

      const { error } = await adminClient.auth.admin.deleteUser(userId);

      if (error) {
        throw error;
      }

      const { error: deleteProfileError } = await adminClient
        .from(APP_USERS_TABLE)
        .delete()
        .eq('id', userId);

      if (deleteProfileError) {
        console.warn('Failed to delete app user profile during user delete:', deleteProfileError);
      }

      res.status(200).json({ success: true });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('admin-users handler failed:', {
      method: req.method,
      userId,
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
      stack: error?.stack,
    });
    res.status(500).json({ error: error.message || 'Admin request failed' });
  }
}
