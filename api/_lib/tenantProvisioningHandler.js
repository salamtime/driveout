import { requirePlatformOwnerOrAdmin } from './auth.js';
import {
  PLATFORM_BUSINESS_ACCOUNTS_TABLE,
  PLATFORM_BUSINESS_SUBSCRIPTIONS_TABLE,
  PLATFORM_TENANTS_TABLE,
  PLATFORM_TENANT_PROVISIONING_JOBS_TABLE,
  PLATFORM_TENANT_AUDIT_LOG_TABLE,
  PLATFORM_TENANT_WORKSPACE_POOL_TABLE,
} from './supabase.js';
import {
  buildTenantAppUrl,
  buildTenantSlug,
  buildTrialWindow,
  normalizeBillingStatus,
  normalizePlanType,
  normalizeSubscriptionStatus,
  sanitizeTenantSlug,
} from './tenantRegistry.js';
import { buildAutomaticTenantWorkspace } from './tenantAutomationWorker.js';
import {
  getWorkspaceReadinessFailureMessage,
  mergeWorkspaceReadinessMetadata,
  resolveWorkspaceReadiness,
} from './tenantWorkspaceReadiness.js';
import {
  applyCanonicalBusinessWorkspaceSchema,
  seedCanonicalBusinessWorkspaceRuntime,
} from './tenantWorkspaceBootstrap.js';
import {
  CURRENT_TENANT_SCHEMA_RELEASE_ID,
  normalizeTenantSchemaVersion,
} from './tenantSchemaRelease.js';

const createHttpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const PROVISIONING_JOB_TYPES = new Set([
  'create_tenant',
  'seed_schema',
  'retry_seed',
  'suspend_tenant',
  'archive_tenant',
]);

const SCHEMA_JOB_TYPES = new Set([
  'schema_plan',
  'schema_upgrade',
  'schema_verify',
  'schema_drift',
]);

const isAutomaticSignupModeEnabled = () => {
  const signupMode = String(process.env.TENANT_SIGNUP_MODE || 'automatic').trim().toLowerCase();
  const autoProvisioningEnabled = String(process.env.TENANT_AUTO_PROVISIONING_ENABLED || 'true').trim().toLowerCase();
  return signupMode !== 'manual' && autoProvisioningEnabled !== 'false';
};

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

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

const normalizeUrl = (value = '') => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const getUrlHostname = (value = '') => {
  try {
    return new URL(normalizeUrl(value)).hostname.toLowerCase();
  } catch {
    return '';
  }
};

const getInvalidTenantConfigReason = ({ tenantProjectRef, tenantApiUrl, tenantAnonKey }) => {
  const projectRef = String(tenantProjectRef || '').trim();
  const apiHostname = getUrlHostname(tenantApiUrl);
  const anonKey = String(tenantAnonKey || '').trim();

  if (!projectRef || /placeholder|test2_project_ref/i.test(projectRef)) {
    return 'Workspace project reference is not a real Supabase project ref';
  }

  if (!apiHostname || !apiHostname.endsWith('.supabase.co') || /placeholder|test2_project_ref/i.test(apiHostname)) {
    return 'Workspace API URL is not a real Supabase project URL';
  }

  if (!anonKey || anonKey === 'test2_anon_key' || /placeholder/i.test(anonKey)) {
    return 'Workspace anon key is not configured';
  }

  return '';
};

const buildProvisioningResult = (payload = {}) => ({
  tenant_project_ref: payload.tenant_project_ref || null,
  tenant_app_url: payload.tenant_app_url || null,
  tenant_api_url: payload.tenant_api_url || null,
  tenant_database_name: payload.tenant_database_name || null,
  schema_version: normalizeTenantSchemaVersion(payload.schema_version),
});

const fetchProvisioningSubscription = async ({ adminClient, businessAccountId }) => {
  if (!businessAccountId) return null;
  const { data, error } = await adminClient
    .from(PLATFORM_BUSINESS_SUBSCRIPTIONS_TABLE)
    .select('trial_started_at, trial_ends_at')
    .eq('business_account_id', businessAccountId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
};

const hasUsableTenantWorkspaceConfig = (payload = {}) => (
  !getInvalidTenantConfigReason({
    tenantProjectRef: payload.tenant_project_ref,
    tenantApiUrl: payload.tenant_api_url,
    tenantAnonKey: payload.tenant_anon_key,
  })
);

const buildWorkspaceConfigFromTenantRecord = (tenant = {}) => ({
  tenantProjectRef: String(tenant.tenant_project_ref || '').trim(),
  tenantAppUrl: normalizeUrl(tenant.tenant_app_url || ''),
  tenantApiUrl: normalizeUrl(tenant.tenant_api_url || ''),
  tenantAnonKey: String(tenant.tenant_anon_key || '').trim(),
  tenantServiceRoleSecretRef: String(tenant.tenant_service_role_secret_ref || '').trim() || null,
  tenantDatabaseName: String(tenant.tenant_database_name || '').trim() || null,
  schemaVersion: normalizeTenantSchemaVersion(tenant.schema_version),
});

const buildWorkspaceConfigFromPoolRecord = (workspace = {}) => ({
  tenantProjectRef: String(workspace.tenant_project_ref || '').trim(),
  tenantAppUrl: normalizeUrl(workspace.tenant_app_url || ''),
  tenantApiUrl: normalizeUrl(workspace.tenant_api_url || ''),
  tenantAnonKey: String(workspace.tenant_anon_key || '').trim(),
  tenantServiceRoleSecretRef: String(workspace.tenant_service_role_secret_ref || '').trim() || null,
  tenantDatabaseName: String(workspace.tenant_database_name || '').trim() || null,
  schemaVersion: normalizeTenantSchemaVersion(workspace.schema_version),
});

const resolvePersistedTenantWorkspace = async ({ adminClient, tenant }) => {
  const tenantWorkspace = buildWorkspaceConfigFromTenantRecord(tenant);
  if (hasUsableTenantWorkspaceConfig({
    tenant_project_ref: tenantWorkspace.tenantProjectRef,
    tenant_api_url: tenantWorkspace.tenantApiUrl,
    tenant_anon_key: tenantWorkspace.tenantAnonKey,
  })) {
    return {
      source: 'tenant_record',
      workspacePoolEntry: null,
      workspace: tenantWorkspace,
    };
  }

  const candidateFilters = [
    { field: 'assigned_tenant_id', value: tenant.id },
    { field: 'tenant_project_ref', value: tenantWorkspace.tenantProjectRef },
    { field: 'tenant_app_url', value: tenantWorkspace.tenantAppUrl },
  ].filter((entry) => isNonEmptyString(entry.value));

  for (const candidate of candidateFilters) {
    const { data, error } = await adminClient
      .from(PLATFORM_TENANT_WORKSPACE_POOL_TABLE)
      .select('*')
      .eq(candidate.field, candidate.value)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) continue;

    const workspace = buildWorkspaceConfigFromPoolRecord(data);
    if (hasUsableTenantWorkspaceConfig({
      tenant_project_ref: workspace.tenantProjectRef,
      tenant_api_url: workspace.tenantApiUrl,
      tenant_anon_key: workspace.tenantAnonKey,
    })) {
      return {
        source: 'workspace_pool',
        workspacePoolEntry: data,
        workspace,
      };
    }
  }

  return null;
};

const syncManualWorkspacePoolEntry = async ({
  adminClient,
  tenant,
  job,
  tenantProjectRef,
  tenantAppUrl,
  tenantApiUrl,
  tenantAnonKey,
  tenantServiceRoleSecretRef,
  tenantDatabaseName,
  schemaVersion,
  userId,
  syncMode = 'manual_activation',
}) => {
  const nowIso = new Date().toISOString();
  let workspace = null;

  const { data: assignedWorkspace, error: assignedError } = await adminClient
    .from(PLATFORM_TENANT_WORKSPACE_POOL_TABLE)
    .select('*')
    .eq('assigned_tenant_id', tenant.id)
    .order('assigned_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (assignedError) throw assignedError;
  workspace = assignedWorkspace || null;

  if (!workspace) {
    const { data: projectWorkspace, error: projectError } = await adminClient
      .from(PLATFORM_TENANT_WORKSPACE_POOL_TABLE)
      .select('*')
      .eq('tenant_project_ref', tenantProjectRef)
      .limit(1)
      .maybeSingle();

    if (projectError) throw projectError;
    workspace = projectWorkspace || null;
  }

  if (!workspace) {
    const { data: appWorkspace, error: appError } = await adminClient
      .from(PLATFORM_TENANT_WORKSPACE_POOL_TABLE)
      .select('*')
      .eq('tenant_app_url', tenantAppUrl)
      .limit(1)
      .maybeSingle();

    if (appError) throw appError;
    workspace = appWorkspace || null;
  }

  const payload = {
    workspace_name: workspace?.workspace_name || tenant.tenant_slug || tenantProjectRef,
    tenant_project_ref: tenantProjectRef,
    tenant_app_url: tenantAppUrl,
    tenant_api_url: tenantApiUrl,
    tenant_anon_key: tenantAnonKey,
    tenant_service_role_secret_ref: tenantServiceRoleSecretRef || null,
    tenant_database_name: tenantDatabaseName || null,
    schema_version: normalizeTenantSchemaVersion(schemaVersion),
    status: 'assigned',
    assigned_tenant_id: tenant.id,
    assigned_business_account_id: job.business_account_id,
    assigned_job_id: job.id,
    assigned_at: workspace?.assigned_at || nowIso,
    updated_at: nowIso,
    metadata: {
      ...(workspace?.metadata || {}),
      real_config_synced_at: nowIso,
      real_config_synced_by: userId || null,
      real_config_sync_mode: syncMode,
    },
  };

  if (workspace?.id) {
    const { data, error } = await adminClient
      .from(PLATFORM_TENANT_WORKSPACE_POOL_TABLE)
      .update(payload)
      .eq('id', workspace.id)
      .select('*')
      .single();

    if (error) throw error;
    return data;
  }

  const { data, error } = await adminClient
    .from(PLATFORM_TENANT_WORKSPACE_POOL_TABLE)
    .insert(payload)
    .select('*')
    .single();

  if (error) throw error;
  return data;
};

const getProvisioningWebhookConfig = () => {
  const url = String(process.env.TENANT_PROVISIONING_WEBHOOK_URL || '').trim();
  const secret = String(process.env.TENANT_PROVISIONING_WEBHOOK_SECRET || '').trim();

  return { url, secret };
};

const getProvisioningTimeoutMinutes = () => {
  const raw = Number(process.env.TENANT_PROVISIONING_TIMEOUT_MINUTES || 30);
  return Number.isFinite(raw) && raw > 0 ? Math.max(raw, 5) : 30;
};

const insertProvisioningAuditLog = async ({ adminClient, businessAccountId, tenantId, performedBy = null, action, metadata = {} }) => {
  try {
    await adminClient.from(PLATFORM_TENANT_AUDIT_LOG_TABLE).insert({
      business_account_id: businessAccountId || null,
      tenant_id: tenantId || null,
      performed_by: performedBy || null,
      action,
      metadata,
    });
  } catch (error) {
    console.warn(`Unable to write tenant provisioning audit log for ${action}:`, error?.message || error);
  }
};

const expireStaleProvisioningJobs = async (adminClient) => {
  const timeoutMinutes = getProvisioningTimeoutMinutes();
  const cutoffIso = new Date(Date.now() - timeoutMinutes * 60 * 1000).toISOString();

  const { data: staleJobs, error } = await adminClient
    .from(PLATFORM_TENANT_PROVISIONING_JOBS_TABLE)
    .select('*')
    .eq('job_type', 'create_tenant')
    .eq('job_status', 'running')
    .lt('started_at', cutoffIso)
    .limit(50);

  if (error) throw error;
  if (!Array.isArray(staleJobs) || staleJobs.length === 0) return;

  const nowIso = new Date().toISOString();
  const errorMessage = `Tenant provisioning timed out after ${timeoutMinutes} minutes`;

  await Promise.all(staleJobs.map(async (staleJob) => {
    let staleTenant = null;
    if (staleJob.tenant_id) {
      const { data: tenantData, error: tenantError } = await adminClient
        .from(PLATFORM_TENANTS_TABLE)
        .select('metadata')
        .eq('id', staleJob.tenant_id)
        .maybeSingle();

      if (tenantError) throw tenantError;
      staleTenant = tenantData || null;
    }

    await Promise.all([
      adminClient
        .from(PLATFORM_TENANT_PROVISIONING_JOBS_TABLE)
        .update({
          job_status: 'failed',
          error_message: errorMessage,
          finished_at: nowIso,
          result: {
            ...(staleJob.result || {}),
            failure_reason: errorMessage,
            failed_at: nowIso,
          },
        })
        .eq('id', staleJob.id)
        .eq('job_status', 'running'),
      staleJob.tenant_id
        ? adminClient
            .from(PLATFORM_TENANTS_TABLE)
            .update({
              tenant_status: 'failed',
              provisioning_error: errorMessage,
              metadata: {
                ...(staleTenant?.metadata || {}),
                provisioning_timeout_at: nowIso,
                provisioning_timeout_minutes: timeoutMinutes,
              },
            })
            .eq('id', staleJob.tenant_id)
            .eq('tenant_status', 'provisioning')
        : Promise.resolve(),
    ]);

    await insertProvisioningAuditLog({
      adminClient,
      businessAccountId: staleJob.business_account_id,
      tenantId: staleJob.tenant_id,
      action: 'tenant_provisioning_timeout',
      metadata: {
        job_id: staleJob.id,
        cutoff_at: cutoffIso,
        timeout_minutes: timeoutMinutes,
      },
    });
  }));
};

const dispatchProvisioningAutomation = async ({ job, tenant, businessAccount, userId }) => {
  const { url, secret } = getProvisioningWebhookConfig();

  if (!url) {
    throw createHttpError(
      409,
      'Tenant provisioning worker is not configured. Set TENANT_PROVISIONING_WEBHOOK_URL before starting automatic provisioning.'
    );
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(secret ? { authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify({
      event: 'tenant.provisioning.requested',
      job,
      tenant,
      business_account: businessAccount || null,
      requested_by: userId || null,
    }),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw createHttpError(
      response.status >= 400 && response.status < 600 ? response.status : 502,
      body?.error || body?.message || `Provisioning webhook failed with ${response.status}`
    );
  }

  return {
    dispatched: true,
    mode: 'webhook',
    response: body,
  };
};

const runAutomaticProvisioningWorker = async ({
  adminClient,
  job,
  tenant,
  businessAccount,
  userId,
}) => {
  const nowIso = new Date().toISOString();
  const persistedWorkspace = await resolvePersistedTenantWorkspace({
    adminClient,
    tenant,
  });
  const createdAutomatically = !persistedWorkspace;
  const workspace = persistedWorkspace?.workspace || await buildAutomaticTenantWorkspace({
    tenantName: tenant.tenant_name || businessAccount?.company_name || businessAccount?.full_name || businessAccount?.email || 'Business Workspace',
    tenantSlug: tenant.tenant_slug,
  });

  const updatedWorkspacePoolEntry = await syncManualWorkspacePoolEntry({
    adminClient,
    tenant,
    job,
    tenantProjectRef: workspace.tenantProjectRef,
    tenantAppUrl: workspace.tenantAppUrl,
    tenantApiUrl: workspace.tenantApiUrl,
    tenantAnonKey: workspace.tenantAnonKey,
    tenantServiceRoleSecretRef: workspace.tenantServiceRoleSecretRef || null,
    tenantDatabaseName: workspace.tenantDatabaseName,
    schemaVersion: workspace.schemaVersion,
    userId,
    syncMode: 'automatic_inline',
  });

  const subscription = await fetchProvisioningSubscription({
    adminClient,
    businessAccountId: job.business_account_id,
  });

  try {
    await applyCanonicalBusinessWorkspaceSchema({
      projectRef: workspace.tenantProjectRef,
    });

    await seedCanonicalBusinessWorkspaceRuntime({
      projectRef: workspace.tenantProjectRef,
      tenantName: tenant.tenant_name || businessAccount?.company_name || businessAccount?.full_name || businessAccount?.email || 'Business Workspace',
      tenantSlug: tenant.tenant_slug,
      ownerAuthUserId: businessAccount?.auth_user_id || null,
      ownerEmail: businessAccount?.email || null,
      ownerFullName: businessAccount?.full_name || null,
      trialStartedAt: subscription?.trial_started_at || null,
      trialEndsAt: subscription?.trial_ends_at || null,
    });
  } catch (bootstrapError) {
    throw createHttpError(
      502,
      `Unable to bootstrap tenant workspace schema: ${bootstrapError?.message || bootstrapError}`
    );
  }

  let workspaceReadiness;
  try {
    workspaceReadiness = await resolveWorkspaceReadiness({
      tenant: {
        ...tenant,
        tenant_project_ref: workspace.tenantProjectRef,
      },
      adminClient,
      forceFresh: true,
      persist: false,
    });
  } catch (readinessError) {
    const readinessMessage = `Unable to verify workspace schema readiness: ${readinessError?.message || readinessError}`;
    throw createHttpError(502, readinessMessage);
  }

  if (workspaceReadiness?.ready !== true) {
    const readinessMessage = getWorkspaceReadinessFailureMessage(workspaceReadiness);
    const failedMetadata = mergeWorkspaceReadinessMetadata(tenant, workspaceReadiness);

    await Promise.all([
      adminClient
        .from(PLATFORM_TENANTS_TABLE)
        .update({
          tenant_status: 'failed',
          tenant_project_ref: workspace.tenantProjectRef,
          tenant_app_url: workspace.tenantAppUrl,
          tenant_api_url: workspace.tenantApiUrl,
          tenant_anon_key: workspace.tenantAnonKey,
          tenant_service_role_secret_ref: workspace.tenantServiceRoleSecretRef || null,
          tenant_database_name: workspace.tenantDatabaseName || null,
          schema_version: normalizeTenantSchemaVersion(workspace.schemaVersion),
          provisioning_error: readinessMessage,
          metadata: {
            ...failedMetadata,
            provisioning_mode: 'automatic',
            provisioning_failed_at: nowIso,
            provisioning_failed_via: 'schema_readiness_guard',
            workspace_pool_id: updatedWorkspacePoolEntry.id,
          },
        })
        .eq('id', tenant.id),
      adminClient
        .from(PLATFORM_TENANT_PROVISIONING_JOBS_TABLE)
        .update({
          job_status: 'failed',
          started_at: job.started_at || nowIso,
          finished_at: nowIso,
          error_message: readinessMessage,
          result: {
            ...(job.result || {}),
            tenant_project_ref: workspace.tenantProjectRef,
            tenant_app_url: workspace.tenantAppUrl,
            tenant_api_url: workspace.tenantApiUrl,
            workspace_pool_id: updatedWorkspacePoolEntry.id,
            mode: 'automatic_inline',
            failure_reason: readinessMessage,
            workspace_readiness: workspaceReadiness,
          },
        })
        .eq('id', job.id),
    ]);

    await insertProvisioningAuditLog({
      adminClient,
      businessAccountId: job.business_account_id,
      tenantId: tenant.id,
      performedBy: userId,
      action: 'tenant_schema_readiness_failed',
      metadata: {
        job_id: job.id,
        tenant_project_ref: workspace.tenantProjectRef,
        workspace_pool_id: updatedWorkspacePoolEntry.id,
        workspace_readiness: workspaceReadiness,
      },
    });

    throw createHttpError(409, readinessMessage);
  }

  const tenantMetadata = {
    ...mergeWorkspaceReadinessMetadata(tenant, workspaceReadiness),
    provisioning_mode: 'automatic',
    provisioning_completed_by: userId,
    provisioning_completed_via: 'inline_worker',
    provisioning_completed_at: nowIso,
    automatic_workspace_project_ref: workspace.tenantProjectRef,
    automatic_workspace_domain_ready: createdAutomatically ? workspace.wildcardDomainReady === true : null,
    automatic_workspace_organization_slug: createdAutomatically ? workspace.organizationSlug || null : null,
    automatic_workspace_source: persistedWorkspace?.source || 'supabase_management_api',
    automatic_workspace_created: createdAutomatically,
    workspace_pool_id: updatedWorkspacePoolEntry.id,
  };

  const provisioningResult = buildProvisioningResult({
    tenant_project_ref: workspace.tenantProjectRef,
    tenant_app_url: workspace.tenantAppUrl,
    tenant_api_url: workspace.tenantApiUrl,
    tenant_database_name: workspace.tenantDatabaseName,
    schema_version: workspace.schemaVersion,
  });

  const [{ data: updatedTenant, error: tenantUpdateError }, { data: updatedJob, error: jobUpdateError }] = await Promise.all([
    adminClient
      .from(PLATFORM_TENANTS_TABLE)
      .update({
        tenant_status: 'active',
        tenant_project_ref: workspace.tenantProjectRef,
        tenant_app_url: workspace.tenantAppUrl,
        tenant_api_url: workspace.tenantApiUrl,
        tenant_anon_key: workspace.tenantAnonKey,
        tenant_service_role_secret_ref: workspace.tenantServiceRoleSecretRef || null,
        tenant_database_name: workspace.tenantDatabaseName || null,
        schema_version: normalizeTenantSchemaVersion(workspace.schemaVersion),
        provisioned_at: nowIso,
        provisioning_completed_at: nowIso,
        provisioning_error: null,
        metadata: tenantMetadata,
      })
      .eq('id', tenant.id)
      .select('*')
      .single(),
    adminClient
      .from(PLATFORM_TENANT_PROVISIONING_JOBS_TABLE)
      .update({
        job_status: 'completed',
        started_at: job.started_at || nowIso,
        finished_at: nowIso,
        error_message: null,
        result: {
          ...(job.result || {}),
          ...provisioningResult,
          workspace_pool_id: updatedWorkspacePoolEntry.id,
          completed_by: userId,
          mode: 'automatic_inline',
          workspace_source: persistedWorkspace?.source || 'supabase_management_api',
        },
      })
      .eq('id', job.id)
      .select('*')
      .single(),
  ]);

  if (tenantUpdateError) throw tenantUpdateError;
  if (jobUpdateError) throw jobUpdateError;

  await insertProvisioningAuditLog({
    adminClient,
    businessAccountId: job.business_account_id,
    tenantId: tenant.id,
    performedBy: userId,
    action: 'complete_tenant_provisioning_automatic',
    metadata: {
      job_id: job.id,
      tenant_project_ref: workspace.tenantProjectRef,
      tenant_app_url: workspace.tenantAppUrl,
      tenant_api_url: workspace.tenantApiUrl,
      schema_version: workspace.schemaVersion,
      workspace_pool_id: updatedWorkspacePoolEntry.id,
      provisioning_mode: 'automatic_inline',
      workspace_source: persistedWorkspace?.source || 'supabase_management_api',
    },
  });

  await adminClient.from('platform_tenant_events').insert({
    tenant_id: tenant.id,
    actor_user_id: userId || null,
    event_type: 'activated',
    payload: {
      job_id: job.id,
      tenant_project_ref: workspace.tenantProjectRef,
      tenant_app_url: workspace.tenantAppUrl,
      workspace_pool_id: updatedWorkspacePoolEntry.id,
      mode: 'automatic_inline',
      workspace_source: persistedWorkspace?.source || 'supabase_management_api',
    },
  });

  return {
    dispatched: true,
    completed: true,
    mode: 'automatic_inline',
    workspace,
    workspace_pool_id: updatedWorkspacePoolEntry.id,
    job: updatedJob,
    tenant: updatedTenant,
  };
};

const resolveUniqueTenantSlug = async ({ adminClient, requestedSlug = '', businessAccountId = '' }) => {
  const baseSlug = sanitizeTenantSlug(requestedSlug || 'tenant');

  const { data: existingForAccount, error: existingForAccountError } = await adminClient
    .from(PLATFORM_TENANTS_TABLE)
    .select('tenant_slug')
    .eq('business_account_id', businessAccountId)
    .maybeSingle();

  if (existingForAccountError) throw existingForAccountError;

  const existingAccountSlug = String(existingForAccount?.tenant_slug || '').trim().toLowerCase();
  if (existingAccountSlug) {
    return existingAccountSlug;
  }

  const { data: collisions, error: collisionsError } = await adminClient
    .from(PLATFORM_TENANTS_TABLE)
    .select('tenant_slug')
    .like('tenant_slug', `${baseSlug}%`)
    .limit(200);

  if (collisionsError) throw collisionsError;

  const used = new Set((collisions || []).map((entry) => String(entry?.tenant_slug || '').trim().toLowerCase()).filter(Boolean));
  if (!used.has(baseSlug)) {
    return baseSlug;
  }

  for (let index = 2; index <= 200; index += 1) {
    const candidate = `${baseSlug}-${index}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }

  throw createHttpError(409, `Unable to allocate a unique tenant slug for base "${baseSlug}"`);
};

const ensureBusinessSubscriptionRecord = async ({
  adminClient,
  businessAccountId,
  existingSubscription = null,
}) => {
  const nowIso = new Date().toISOString();
  const trialWindow = buildTrialWindow({ startAt: nowIso });
  const metadata = existingSubscription?.metadata && typeof existingSubscription.metadata === 'object'
    ? existingSubscription.metadata
    : {};

  const subscriptionPayload = {
    business_account_id: businessAccountId,
    plan_type: normalizePlanType(existingSubscription?.plan_type || 'starter'),
    subscription_status: normalizeSubscriptionStatus(existingSubscription?.subscription_status || 'trial'),
    billing_status: normalizeBillingStatus(existingSubscription?.billing_status || 'none'),
    trial_started_at: existingSubscription?.trial_started_at || trialWindow.trialStartedAt,
    trial_ends_at: existingSubscription?.trial_ends_at || trialWindow.trialEndsAt,
    subscription_started_at: existingSubscription?.subscription_started_at || null,
    suspended_at: existingSubscription?.suspended_at || null,
    metadata: {
      ...metadata,
      trial_days: metadata.trial_days || trialWindow.trialDays,
      onboarding_mode: metadata.onboarding_mode || 'automatic',
      lifecycle_policy: {
        ...((metadata.lifecycle_policy && typeof metadata.lifecycle_policy === 'object')
          ? metadata.lifecycle_policy
          : {}),
        trial_days: trialWindow.trialDays,
        deletion_retention_days: Number(process.env.TENANT_DELETION_RETENTION_DAYS || 90),
      },
    },
  };

  const { data, error } = await adminClient
    .from(PLATFORM_BUSINESS_SUBSCRIPTIONS_TABLE)
    .upsert(subscriptionPayload, { onConflict: 'business_account_id' })
    .select('*')
    .single();

  if (error) throw error;
  return data;
};

const ensureAutomaticBusinessAccountRecord = async ({ adminClient, authUser }) => {
  const metadata = {
    ...(authUser.app_metadata || {}),
    ...(authUser.user_metadata || {}),
  };

  const { data: existingBusinessAccount, error: existingBusinessAccountError } = await adminClient
    .from(PLATFORM_BUSINESS_ACCOUNTS_TABLE)
    .select('*')
    .eq('auth_user_id', authUser.id)
    .maybeSingle();

  if (existingBusinessAccountError) throw existingBusinessAccountError;
  if (existingBusinessAccount) {
    const approvalStatus = String(
      existingBusinessAccount.approval_status || existingBusinessAccount.application_status || ''
    )
      .trim()
      .toLowerCase();

    if (approvalStatus === 'approved') {
      return existingBusinessAccount;
    }

    const nowIso = new Date().toISOString();
    const pendingUpgradeRequirements = ['company_ice_number', 'company_legal_form', 'company_registration_city'];
    const { data, error } = await adminClient
      .from(PLATFORM_BUSINESS_ACCOUNTS_TABLE)
      .update({
        application_status: 'approved',
        approval_status: 'approved',
        approved_at: existingBusinessAccount.approved_at || nowIso,
        approved_by: existingBusinessAccount.approved_by || authUser.id,
        rejection_reason: null,
        metadata: {
          ...(existingBusinessAccount.metadata || {}),
          source: existingBusinessAccount.metadata?.source || 'automatic_signup_bootstrap',
          owner_email: authUser.email,
          onboarding_mode: 'automatic',
          auto_approved_from_legacy_pending: true,
          company_ice_number:
            existingBusinessAccount.metadata?.company_ice_number ||
            String(metadata.company_ice_number || metadata.company_rc_number || '').trim() ||
            null,
          activation_pending_compliance: true,
          upgrade_requirements: pendingUpgradeRequirements,
        },
      })
      .eq('id', existingBusinessAccount.id)
      .select('*')
      .single();

    if (error) throw error;
    return data;
  }

  const pendingUpgradeRequirements = ['company_ice_number', 'company_legal_form', 'company_registration_city'];
  const nowIso = new Date().toISOString();
  const fullName =
    String(metadata.full_name || metadata.name || '').trim() ||
    authUser.email ||
    'Business Owner';
  const companyName =
    String(metadata.company_name || metadata.business_name || metadata.organization_name || '').trim() ||
    fullName ||
    authUser.email ||
    'Business Workspace';

  const { data, error } = await adminClient
    .from(PLATFORM_BUSINESS_ACCOUNTS_TABLE)
    .insert({
      auth_user_id: authUser.id,
      full_name: fullName,
      email: authUser.email,
      company_name: companyName,
      phone: String(metadata.phone || metadata.phone_number || '').trim() || null,
      account_type: String(metadata.account_type || 'business_owner').trim().toLowerCase() || 'business_owner',
      application_status: 'approved',
      approval_status: 'approved',
      approved_at: nowIso,
      approved_by: authUser.id,
      metadata: {
        source: 'automatic_signup_bootstrap',
        owner_email: authUser.email,
        onboarding_mode: 'automatic',
        company_ice_number: String(metadata.company_ice_number || metadata.company_rc_number || '').trim() || null,
        activation_pending_compliance: true,
        upgrade_requirements: pendingUpgradeRequirements,
      },
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
};

const ensureTenantProvisioningRecord = async ({ adminClient, businessAccountId, userId }) => {
  const { data: businessAccount, error: businessAccountError } = await adminClient
    .from(PLATFORM_BUSINESS_ACCOUNTS_TABLE)
    .select('*')
    .eq('id', businessAccountId)
    .maybeSingle();

  if (businessAccountError) throw businessAccountError;
  if (!businessAccount) {
    return { error: { status: 404, body: { error: 'Business account not found' } } };
  }

  const { data: existingSubscription, error: existingSubscriptionError } = await adminClient
    .from(PLATFORM_BUSINESS_SUBSCRIPTIONS_TABLE)
    .select('*')
    .eq('business_account_id', businessAccountId)
    .maybeSingle();

  if (existingSubscriptionError) throw existingSubscriptionError;
  const subscription = await ensureBusinessSubscriptionRecord({
    adminClient,
    businessAccountId,
    existingSubscription,
  });

  const requestedSlug = buildTenantSlug({
    email: businessAccount.email,
    userId: businessAccount.auth_user_id || businessAccountId,
    companyName: businessAccount.company_name || businessAccount.full_name,
  });
  const tenantSlug = await resolveUniqueTenantSlug({
    adminClient,
    requestedSlug,
    businessAccountId,
  });
  const tenantAppUrl = buildTenantAppUrl(tenantSlug);

  const { data: tenant, error: tenantError } = await adminClient
    .from(PLATFORM_TENANTS_TABLE)
    .upsert(
      {
        business_account_id: businessAccountId,
        owner_user_id: businessAccount.auth_user_id,
        tenant_key: `tenant_${String(businessAccount.auth_user_id || businessAccountId).replace(/-/g, '')}`,
        tenant_name: businessAccount.company_name || businessAccount.full_name || businessAccount.email || 'Business Workspace',
        tenant_slug: tenantSlug,
        tenant_app_url: tenantAppUrl,
        tenant_status: 'pending',
        db_provider: 'supabase',
        schema_version: normalizeTenantSchemaVersion(),
        metadata: {
          source: 'manual_workspace_provisioning',
          created_by: userId || null,
          requested_subdomain: tenantSlug,
          schema_release_id: CURRENT_TENANT_SCHEMA_RELEASE_ID,
        },
      },
      { onConflict: 'business_account_id' }
    )
    .select('*')
    .single();

  if (tenantError) throw tenantError;

  const { data: existingJob, error: existingJobError } = await adminClient
    .from(PLATFORM_TENANT_PROVISIONING_JOBS_TABLE)
    .select('*')
    .eq('business_account_id', businessAccountId)
    .eq('job_type', 'create_tenant')
    .in('job_status', ['queued', 'running'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingJobError) throw existingJobError;
  if (existingJob?.id) return { businessAccount, subscription, tenant, job: existingJob };

  const { data: job, error: jobError } = await adminClient
    .from(PLATFORM_TENANT_PROVISIONING_JOBS_TABLE)
    .insert({
      business_account_id: businessAccountId,
      tenant_id: tenant.id,
      job_type: 'create_tenant',
      job_status: 'queued',
      payload: { source: 'manual_workspace_provisioning' },
      result: {},
    })
    .select('*')
    .single();

  if (jobError) throw jobError;

  await adminClient.from('platform_tenant_events').insert({
    tenant_id: tenant.id,
    actor_user_id: userId || null,
    event_type: 'created',
    payload: { business_account_id: businessAccountId },
  });

  return { businessAccount, subscription, tenant, job };
};

export const bootstrapAutomaticBusinessOwnerProvisioning = async ({
  adminClient,
  authUser,
}) => {
  if (!authUser?.id || !isAutomaticSignupModeEnabled()) {
    return null;
  }

  const normalizedAccountType = String(
    authUser?.user_metadata?.account_type || authUser?.app_metadata?.account_type || ''
  )
    .trim()
    .toLowerCase();

  if (!BUSINESS_OWNER_ACCOUNT_TYPES.has(normalizedAccountType)) {
    return null;
  }

  const businessAccount = await ensureAutomaticBusinessAccountRecord({
    adminClient,
    authUser,
  });

  const provisioning = await ensureTenantProvisioningRecord({
    adminClient,
    businessAccountId: businessAccount.id,
    userId: authUser.id,
  });

  if (provisioning?.error) {
    throw createHttpError(provisioning.error.status || 500, provisioning.error.body?.error || 'Provisioning bootstrap failed');
  }

  const currentTenantStatus = String(provisioning?.tenant?.tenant_status || '').trim().toLowerCase();
  const currentJobStatus = String(provisioning?.job?.job_status || '').trim().toLowerCase();

  if (currentTenantStatus === 'active' || currentJobStatus === 'completed') {
    return {
      businessAccount: provisioning.businessAccount || businessAccount,
      subscription: provisioning.subscription || null,
      tenant: provisioning.tenant || null,
      job: provisioning.job || null,
    };
  }

  if (currentJobStatus === 'running') {
    return {
      businessAccount: provisioning.businessAccount || businessAccount,
      subscription: provisioning.subscription || null,
      tenant: provisioning.tenant || null,
      job: provisioning.job || null,
    };
  }

  const startedAt = new Date().toISOString();

  const [{ data: updatedJob, error: updatedJobError }, { data: updatedTenant, error: updatedTenantError }] = await Promise.all([
    adminClient
      .from(PLATFORM_TENANT_PROVISIONING_JOBS_TABLE)
      .update({
        job_status: 'running',
        started_at: provisioning.job?.started_at || startedAt,
        finished_at: null,
        error_message: null,
      })
      .eq('id', provisioning.job.id)
      .select('*')
      .single(),
    adminClient
      .from(PLATFORM_TENANTS_TABLE)
      .update({
        tenant_status: 'provisioning',
        provisioning_started_at: startedAt,
        provisioning_error: null,
        metadata: {
          ...(provisioning.tenant?.metadata || {}),
          provisioning_mode: 'automatic',
          provisioning_started_by: authUser.id,
          onboarding_source: 'public_signup',
        },
      })
      .eq('id', provisioning.tenant.id)
      .select('*')
      .single(),
  ]);

  if (updatedJobError) throw updatedJobError;
  if (updatedTenantError) throw updatedTenantError;

  let automation = null;
  try {
    const webhookConfig = getProvisioningWebhookConfig();

    if (webhookConfig.url) {
      automation = await dispatchProvisioningAutomation({
        job: updatedJob,
        tenant: updatedTenant,
        businessAccount,
        userId: authUser.id,
      });

      await adminClient
        .from(PLATFORM_TENANTS_TABLE)
        .update({
          metadata: {
            ...(updatedTenant.metadata || {}),
            provisioning_mode: 'automatic',
            provisioning_dispatch: automation,
            provisioning_dispatch_at: new Date().toISOString(),
          },
        })
        .eq('id', updatedTenant.id);

      return {
        businessAccount,
        subscription: provisioning.subscription || null,
        tenant: updatedTenant,
        job: updatedJob,
      };
    }

    automation = await runAutomaticProvisioningWorker({
      adminClient,
      job: updatedJob,
      tenant: updatedTenant,
      businessAccount,
      userId: authUser.id,
    });

    return {
      businessAccount,
      subscription: provisioning.subscription || null,
      tenant: automation.tenant || updatedTenant,
      job: automation.job || updatedJob,
    };
  } catch (automationError) {
    const errorMessage = automationError?.message || 'Provisioning automation failed';

    await Promise.all([
      adminClient
        .from(PLATFORM_TENANTS_TABLE)
        .update({
          tenant_status: 'failed',
          provisioning_error: errorMessage,
          metadata: {
            ...(updatedTenant.metadata || {}),
            provisioning_mode: 'automatic',
            provisioning_dispatch_failed_at: new Date().toISOString(),
          },
        })
        .eq('id', updatedTenant.id),
      adminClient
        .from(PLATFORM_TENANT_PROVISIONING_JOBS_TABLE)
        .update({
          job_status: 'failed',
          error_message: errorMessage,
          finished_at: new Date().toISOString(),
        })
        .eq('id', updatedJob.id),
    ]);

    throw automationError;
  }
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const auth = await requirePlatformOwnerOrAdmin(req, 'Workspaces');

  if (auth.error) {
    res.status(auth.error.status).json(auth.error.body);
    return;
  }

  const { adminClient, user } = auth;

  try {
    await expireStaleProvisioningJobs(adminClient);

    if (req.method === 'GET') {
      const statusFilter = String(req.query?.status || '').trim().toLowerCase();
      let query = adminClient
        .from(PLATFORM_TENANT_PROVISIONING_JOBS_TABLE)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (statusFilter) {
        query = query.eq('job_status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      const { data: businessAccounts, error: businessAccountsError } = await adminClient
        .from(PLATFORM_BUSINESS_ACCOUNTS_TABLE)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (businessAccountsError) {
        if (isPermissionDenied(businessAccountsError)) {
          const businessOwners = await loadLegacyBusinessOwnersFromAuth(adminClient);
          res.status(200).json({
            jobs: data || [],
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
        const businessOwners = await loadLegacyBusinessOwnersFromAuth(adminClient);
        res.status(200).json({
          jobs: data || [],
          business_owners: businessOwners,
          source: businessOwners.length > 0 ? 'legacy_auth_metadata' : 'platform_tables',
          warning: businessOwners.length > 0
            ? 'platform_business_accounts is empty; showing legacy owner records from auth metadata'
            : undefined,
        });
        return;
      }

      let subscriptions = [];
      let tenants = [];
      let allJobs = data || [];

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

      subscriptions = subscriptionsResult.data || [];
      tenants = tenantsResult.data || [];
      allJobs = jobsResult.data || allJobs;

      const subscriptionMap = new Map(
        subscriptions.map((subscription) => [String(subscription.business_account_id), subscription])
      );
      const tenantMap = new Map(
        tenants.map((tenant) => [String(tenant.business_account_id), tenant])
      );
      const latestProvisioningJobMap = new Map();
      const latestSchemaJobMap = new Map();

      allJobs.forEach((job) => {
        const key = String(job?.business_account_id || '').trim();
        if (!key) return;

        const jobType = String(job?.job_type || '').trim().toLowerCase();
        if (PROVISIONING_JOB_TYPES.has(jobType) && !latestProvisioningJobMap.has(key)) {
          latestProvisioningJobMap.set(key, job);
        }
        if (SCHEMA_JOB_TYPES.has(jobType) && !latestSchemaJobMap.has(key)) {
          latestSchemaJobMap.set(key, job);
        }
      });

      const businessAccountMap = new Map(
        (businessAccounts || []).map((account) => [String(account.id), account])
      );
      const tenantByIdMap = new Map(
        tenants.map((tenant) => [String(tenant.id), tenant])
      );

      const hydratedJobs = (data || []).map((job) => ({
        ...job,
        business_account: businessAccountMap.get(String(job?.business_account_id || '').trim()) || null,
        tenant: tenantByIdMap.get(String(job?.tenant_id || '').trim()) || null,
      }));

      const businessOwners = (businessAccounts || []).map((businessAccount) => {
        const businessAccountId = String(businessAccount?.id || '').trim();
        return {
          business_account: businessAccount,
          subscription: subscriptionMap.get(businessAccountId) || null,
          tenant: tenantMap.get(businessAccountId) || null,
          provisioning_job: latestProvisioningJobMap.get(businessAccountId) || null,
          latest_schema_job: latestSchemaJobMap.get(businessAccountId) || null,
        };
      });

      res.status(200).json({ jobs: hydratedJobs, business_owners: businessOwners });
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const action = String(req.body?.action || 'complete').trim().toLowerCase();
    let jobId = String(req.body?.job_id || '').trim();
    const businessAccountId = String(req.body?.business_account_id || '').trim();
    let createdProvisioning = null;

    if (!jobId && action === 'start' && businessAccountId) {
      createdProvisioning = await ensureTenantProvisioningRecord({
        adminClient,
        businessAccountId,
        userId: user.id,
      });

      if (createdProvisioning?.error) {
        res.status(createdProvisioning.error.status).json(createdProvisioning.error.body);
        return;
      }

      jobId = createdProvisioning?.job?.id || '';
    }

    if (!jobId) {
      res.status(400).json({ error: 'job_id is required' });
      return;
    }

    const { data: job, error: jobError } = await adminClient
      .from(PLATFORM_TENANT_PROVISIONING_JOBS_TABLE)
      .select('*')
      .eq('id', jobId)
      .maybeSingle();

    if (jobError) throw jobError;
    const effectiveJob = job || createdProvisioning?.job || null;
    if (!effectiveJob) {
      res.status(404).json({ error: 'Provisioning job not found' });
      return;
    }

    const { data: tenant, error: tenantError } = await adminClient
      .from(PLATFORM_TENANTS_TABLE)
      .select('*')
      .eq('id', effectiveJob.tenant_id)
      .maybeSingle();

    if (tenantError) throw tenantError;
    const effectiveTenant = tenant || createdProvisioning?.tenant || null;
    if (!effectiveTenant) {
      res.status(404).json({ error: 'Tenant record not found for provisioning job' });
      return;
    }

    if (action === 'start') {
      const { data: businessAccountForAutomation, error: businessAccountForAutomationError } = await adminClient
        .from(PLATFORM_BUSINESS_ACCOUNTS_TABLE)
        .select('*')
        .eq('id', effectiveJob.business_account_id)
        .maybeSingle();

      if (businessAccountForAutomationError) throw businessAccountForAutomationError;

      const { data: updatedJob, error } = await adminClient
        .from(PLATFORM_TENANT_PROVISIONING_JOBS_TABLE)
        .update({
          job_status: 'running',
          error_message: null,
          started_at: new Date().toISOString(),
        })
        .eq('id', effectiveJob.id)
        .select('*')
        .single();

      if (error) throw error;

      const { data: updatedTenant, error: tenantStartError } = await adminClient
        .from(PLATFORM_TENANTS_TABLE)
        .update({
          tenant_status: 'provisioning',
          provisioning_started_at: new Date().toISOString(),
          provisioning_error: null,
          metadata: {
            ...(effectiveTenant.metadata || {}),
            provisioning_mode: 'automatic',
            provisioning_started_by: user.id,
          },
        })
        .eq('id', effectiveTenant.id)
        .select('*')
        .single();

      if (tenantStartError) throw tenantStartError;

      await adminClient
        .from(PLATFORM_TENANT_AUDIT_LOG_TABLE)
        .insert({
          business_account_id: effectiveJob.business_account_id,
          tenant_id: effectiveJob.tenant_id,
          performed_by: user.id,
          action: 'start_tenant_provisioning',
          metadata: { job_id: effectiveJob.id },
        });

      await adminClient.from('platform_tenant_events').insert({
        tenant_id: effectiveTenant.id,
        actor_user_id: user.id,
        event_type: 'provisioning_started',
        payload: { job_id: effectiveJob.id, mode: 'automatic' },
      });

      let automation = null;
      let responseJob = updatedJob;
      let responseTenant = updatedTenant;
      try {
        const webhookConfig = getProvisioningWebhookConfig();

        if (webhookConfig.url) {
          automation = await dispatchProvisioningAutomation({
            job: updatedJob,
            tenant: updatedTenant,
            businessAccount: businessAccountForAutomation,
            userId: user.id,
          });

          await adminClient
            .from(PLATFORM_TENANTS_TABLE)
            .update({
              metadata: {
                ...(updatedTenant.metadata || {}),
                provisioning_mode: 'automatic',
                provisioning_dispatch: automation,
                provisioning_dispatch_at: new Date().toISOString(),
              },
            })
            .eq('id', effectiveTenant.id);
        } else {
          automation = await runAutomaticProvisioningWorker({
            adminClient,
            job: updatedJob,
            tenant: updatedTenant,
            businessAccount: businessAccountForAutomation,
            userId: user.id,
          });
          responseJob = automation.job || updatedJob;
          responseTenant = automation.tenant || updatedTenant;
        }
      } catch (automationError) {
        const errorMessage = automationError?.message || 'Provisioning automation failed';

        await Promise.all([
          adminClient
            .from(PLATFORM_TENANTS_TABLE)
            .update({
              tenant_status: 'failed',
              provisioning_error: errorMessage,
              metadata: {
                ...(updatedTenant.metadata || {}),
                provisioning_mode: 'automatic',
                provisioning_dispatch_failed_at: new Date().toISOString(),
              },
            })
            .eq('id', effectiveTenant.id),
          adminClient
            .from(PLATFORM_TENANT_PROVISIONING_JOBS_TABLE)
            .update({
              job_status: 'failed',
              error_message: errorMessage,
              finished_at: new Date().toISOString(),
            })
            .eq('id', effectiveJob.id),
        ]);

        await insertProvisioningAuditLog({
          adminClient,
          businessAccountId: effectiveJob.business_account_id,
          tenantId: effectiveJob.tenant_id,
          performedBy: user.id,
          action: 'tenant_provisioning_dispatch_failed',
          metadata: {
            job_id: effectiveJob.id,
            error_message: errorMessage,
          },
        });

        throw automationError;
      }

      res.status(200).json({ job: responseJob, tenant: responseTenant, automation });
      return;
    }

    if (action === 'fail') {
      const errorMessage = String(req.body?.error_message || 'Provisioning failed').trim();
      const nowIso = new Date().toISOString();

      const [{ data: updatedTenant, error: tenantUpdateError }, { data: updatedJob, error: jobUpdateError }] = await Promise.all([
        adminClient
          .from(PLATFORM_TENANTS_TABLE)
          .update({
            tenant_status: 'failed',
            provisioning_error: errorMessage,
            metadata: {
              ...(tenant.metadata || {}),
              last_provisioning_error: errorMessage,
            },
          })
          .eq('id', tenant.id)
          .select('*')
          .single(),
        adminClient
          .from(PLATFORM_TENANT_PROVISIONING_JOBS_TABLE)
          .update({
            job_status: 'failed',
            error_message: errorMessage,
            finished_at: nowIso,
          })
          .eq('id', jobId)
          .select('*')
          .single(),
      ]);

      if (tenantUpdateError) throw tenantUpdateError;
      if (jobUpdateError) throw jobUpdateError;

      await adminClient
        .from(PLATFORM_TENANT_AUDIT_LOG_TABLE)
        .insert({
          business_account_id: job.business_account_id,
          tenant_id: job.tenant_id,
          performed_by: user.id,
          action: 'fail_tenant_provisioning',
          metadata: { job_id: jobId, error_message: errorMessage },
        });

      await adminClient.from('platform_tenant_events').insert({
        tenant_id: tenant.id,
        actor_user_id: user.id,
        event_type: 'failed',
        payload: { job_id: jobId, error_message: errorMessage },
      });

      res.status(200).json({ job: updatedJob, tenant: updatedTenant });
      return;
    }

    if (action === 'suspend' || action === 'reactivate') {
      const nextStatus = action === 'suspend' ? 'suspended' : 'active';
      const eventType = action === 'suspend' ? 'suspended' : 'reactivated';
      const reason = String(req.body?.error_message || '').trim();

      const { data: updatedTenant, error: tenantUpdateError } = await adminClient
        .from(PLATFORM_TENANTS_TABLE)
        .update({
          tenant_status: nextStatus,
          provisioning_error: action === 'suspend' ? reason || tenant.provisioning_error || null : null,
          metadata: {
            ...(tenant.metadata || {}),
            last_status_change_by: user.id,
            last_status_change_at: new Date().toISOString(),
            suspension_reason: action === 'suspend' ? reason : null,
          },
        })
        .eq('id', tenant.id)
        .select('*')
        .single();

      if (tenantUpdateError) throw tenantUpdateError;

      await adminClient
        .from(PLATFORM_TENANT_AUDIT_LOG_TABLE)
        .insert({
          business_account_id: job.business_account_id,
          tenant_id: tenant.id,
          performed_by: user.id,
          action: action === 'suspend' ? 'suspend_tenant' : 'reactivate_tenant',
          metadata: { job_id: jobId, reason: reason || null },
        });

      await adminClient.from('platform_tenant_events').insert({
        tenant_id: tenant.id,
        actor_user_id: user.id,
        event_type: eventType,
        payload: { job_id: jobId, reason: reason || null },
      });

      res.status(200).json({ job, tenant: updatedTenant });
      return;
    }

    const tenantProjectRef = String(req.body?.tenant_project_ref || '').trim();
    const tenantAppUrl = String(req.body?.tenant_app_url || '').trim();
    const tenantApiUrl = String(req.body?.tenant_api_url || '').trim();
    const tenantAnonKey = String(req.body?.tenant_anon_key || '').trim();
    const tenantServiceRoleSecretRef = String(req.body?.tenant_service_role_secret_ref || '').trim();
    const tenantDatabaseName = String(req.body?.tenant_database_name || '').trim();
    const schemaVersion = normalizeTenantSchemaVersion(req.body?.schema_version);

    if (!isNonEmptyString(tenantProjectRef) || !isNonEmptyString(tenantAppUrl) || !isNonEmptyString(tenantApiUrl) || !isNonEmptyString(tenantAnonKey)) {
      res.status(400).json({
        error: 'tenant_project_ref, tenant_app_url, tenant_api_url, and tenant_anon_key are required to complete provisioning',
      });
      return;
    }

    const invalidConfigReason = getInvalidTenantConfigReason({ tenantProjectRef, tenantApiUrl, tenantAnonKey });
    if (invalidConfigReason) {
      res.status(400).json({
        error: 'Tenant workspace configuration is not usable',
        reason: invalidConfigReason,
      });
      return;
    }

    const nowIso = new Date().toISOString();

    const provisioningResult = buildProvisioningResult({
      tenant_project_ref: tenantProjectRef,
      tenant_app_url: normalizeUrl(tenantAppUrl),
      tenant_api_url: normalizeUrl(tenantApiUrl),
      tenant_database_name: tenantDatabaseName,
      schema_version: schemaVersion,
    });

    const updatedWorkspacePoolEntry = await syncManualWorkspacePoolEntry({
      adminClient,
      tenant,
      job,
      tenantProjectRef,
      tenantAppUrl: normalizeUrl(tenantAppUrl),
      tenantApiUrl: normalizeUrl(tenantApiUrl),
      tenantAnonKey,
      tenantServiceRoleSecretRef,
    tenantDatabaseName,
    schemaVersion,
    userId: user.id,
    syncMode: 'manual_activation',
  });

    const subscription = await fetchProvisioningSubscription({
      adminClient,
      businessAccountId: job.business_account_id,
    });

    try {
      await applyCanonicalBusinessWorkspaceSchema({
        projectRef: tenantProjectRef,
      });

      await seedCanonicalBusinessWorkspaceRuntime({
        projectRef: tenantProjectRef,
        tenantName: tenant.tenant_name || businessAccount?.company_name || businessAccount?.full_name || businessAccount?.email || 'Business Workspace',
        tenantSlug: tenant.tenant_slug,
        ownerAuthUserId: businessAccount?.auth_user_id || null,
        ownerEmail: businessAccount?.email || null,
        ownerFullName: businessAccount?.full_name || null,
        trialStartedAt: subscription?.trial_started_at || null,
        trialEndsAt: subscription?.trial_ends_at || null,
      });
    } catch (bootstrapError) {
      res.status(502).json({
        error: 'Unable to bootstrap tenant workspace schema',
        reason: bootstrapError?.message || 'Unknown workspace bootstrap error',
      });
      return;
    }

    let workspaceReadiness;
    try {
      workspaceReadiness = await resolveWorkspaceReadiness({
        tenant: {
          ...tenant,
          tenant_project_ref: tenantProjectRef,
        },
        adminClient,
        forceFresh: true,
        persist: false,
      });
    } catch (readinessError) {
      res.status(502).json({
        error: 'Unable to verify workspace readiness',
        reason: readinessError?.message || 'Unknown workspace readiness verification error',
      });
      return;
    }

    if (workspaceReadiness?.ready !== true) {
      const readinessMessage = getWorkspaceReadinessFailureMessage(workspaceReadiness);
      const failedMetadata = mergeWorkspaceReadinessMetadata(tenant, workspaceReadiness);

      const [{ data: failedTenant }, { data: failedJob }] = await Promise.all([
        adminClient
          .from(PLATFORM_TENANTS_TABLE)
          .update({
            tenant_status: 'failed',
            tenant_project_ref: tenantProjectRef,
            tenant_app_url: normalizeUrl(tenantAppUrl),
            tenant_api_url: normalizeUrl(tenantApiUrl),
            tenant_anon_key: tenantAnonKey,
            tenant_service_role_secret_ref: tenantServiceRoleSecretRef || null,
            tenant_database_name: tenantDatabaseName || null,
            schema_version: normalizeTenantSchemaVersion(schemaVersion),
            provisioning_error: readinessMessage,
            metadata: {
              ...failedMetadata,
              last_provisioned_by: user.id,
              last_provisioned_at: nowIso,
              provisioning_failed_at: nowIso,
              provisioning_failed_via: 'manual_schema_readiness_guard',
              workspace_pool_id: updatedWorkspacePoolEntry.id,
            },
          })
          .eq('id', tenant.id)
          .select('*')
          .single(),
        adminClient
          .from(PLATFORM_TENANT_PROVISIONING_JOBS_TABLE)
          .update({
            job_status: 'failed',
            started_at: job.started_at || nowIso,
            finished_at: nowIso,
            error_message: readinessMessage,
            result: {
              ...provisioningResult,
              completed_by: user.id,
              workspace_pool_id: updatedWorkspacePoolEntry.id,
              failure_reason: readinessMessage,
              workspace_readiness: workspaceReadiness,
            },
          })
          .eq('id', jobId)
          .select('*')
          .single(),
      ]);

      await adminClient
        .from(PLATFORM_TENANT_AUDIT_LOG_TABLE)
        .insert({
          business_account_id: job.business_account_id,
          tenant_id: tenant.id,
          performed_by: user.id,
          action: 'tenant_schema_readiness_failed',
          metadata: {
            job_id: jobId,
            tenant_project_ref: tenantProjectRef,
            workspace_pool_id: updatedWorkspacePoolEntry.id,
            workspace_readiness: workspaceReadiness,
          },
        });

      res.status(409).json({
        error: readinessMessage,
        tenant: failedTenant || null,
        job: failedJob || null,
        readiness: workspaceReadiness,
      });
      return;
    }

    const tenantMetadata = {
      ...mergeWorkspaceReadinessMetadata(tenant, workspaceReadiness),
      last_provisioned_by: user.id,
      last_provisioned_at: nowIso,
    };

    const [{ data: updatedTenant, error: tenantUpdateError }, { data: updatedJob, error: jobUpdateError }] = await Promise.all([
      adminClient
        .from(PLATFORM_TENANTS_TABLE)
        .update({
          tenant_status: 'active',
          tenant_project_ref: tenantProjectRef,
          tenant_app_url: normalizeUrl(tenantAppUrl),
          tenant_api_url: normalizeUrl(tenantApiUrl),
          tenant_anon_key: tenantAnonKey,
          tenant_service_role_secret_ref: tenantServiceRoleSecretRef || null,
          tenant_database_name: tenantDatabaseName || null,
          schema_version: normalizeTenantSchemaVersion(schemaVersion),
          provisioned_at: nowIso,
          provisioning_completed_at: nowIso,
          provisioning_error: null,
          metadata: tenantMetadata,
        })
        .eq('id', tenant.id)
        .select('*')
        .single(),
      adminClient
        .from(PLATFORM_TENANT_PROVISIONING_JOBS_TABLE)
        .update({
          job_status: 'completed',
          started_at: job.started_at || nowIso,
          finished_at: nowIso,
          error_message: null,
          result: {
            ...provisioningResult,
            completed_by: user.id,
            workspace_pool_id: updatedWorkspacePoolEntry.id,
          },
        })
        .eq('id', jobId)
        .select('*')
        .single(),
    ]);

    if (tenantUpdateError) throw tenantUpdateError;
    if (jobUpdateError) throw jobUpdateError;

    await adminClient
      .from(PLATFORM_TENANT_AUDIT_LOG_TABLE)
      .insert({
        business_account_id: job.business_account_id,
        tenant_id: tenant.id,
        performed_by: user.id,
        action: 'complete_tenant_provisioning',
          metadata: {
            job_id: jobId,
            tenant_project_ref: tenantProjectRef,
            tenant_app_url: normalizeUrl(tenantAppUrl),
            tenant_api_url: normalizeUrl(tenantApiUrl),
            schema_version: schemaVersion,
            schema_release_id: CURRENT_TENANT_SCHEMA_RELEASE_ID,
            workspace_pool_id: updatedWorkspacePoolEntry.id,
          },
        });

    await adminClient.from('platform_tenant_events').insert({
      tenant_id: tenant.id,
      actor_user_id: user.id,
      event_type: 'activated',
      payload: {
        job_id: jobId,
        tenant_project_ref: tenantProjectRef,
        tenant_app_url: normalizeUrl(tenantAppUrl),
        workspace_pool_id: updatedWorkspacePoolEntry.id,
        mode: 'manual',
      },
    });

    res.status(200).json({ job: updatedJob, tenant: updatedTenant });
    return;
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Failed to process tenant provisioning' });
  }
}
