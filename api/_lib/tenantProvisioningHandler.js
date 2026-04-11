import { requireOwner } from './auth.js';
import {
  PLATFORM_BUSINESS_ACCOUNTS_TABLE,
  PLATFORM_BUSINESS_SUBSCRIPTIONS_TABLE,
  PLATFORM_TENANTS_TABLE,
  PLATFORM_TENANT_PROVISIONING_JOBS_TABLE,
  PLATFORM_TENANT_AUDIT_LOG_TABLE,
  PLATFORM_TENANT_WORKSPACE_POOL_TABLE,
} from './supabase.js';

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
  schema_version: payload.schema_version || 'v1',
});

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
    schema_version: schemaVersion || 'v1',
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
      real_config_sync_mode: 'manual_activation',
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

const buildTenantSlug = ({ email = '', companyName = '', businessAccountId = '' } = {}) => {
  const base = String(companyName || email || businessAccountId || 'workspace')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42);
  const suffix = String(businessAccountId || '').replace(/-/g, '').slice(0, 6);
  return [base || 'workspace', suffix].filter(Boolean).join('-');
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
    throw new Error('Tenant provisioning worker is not configured. Set TENANT_PROVISIONING_WEBHOOK_URL before starting automatic provisioning.');
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
    throw new Error(body?.error || body?.message || `Provisioning webhook failed with ${response.status}`);
  }

  return {
    dispatched: true,
    mode: 'webhook',
    response: body,
  };
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

  const tenantSlug = buildTenantSlug({
    email: businessAccount.email,
    companyName: businessAccount.company_name || businessAccount.full_name,
    businessAccountId,
  });

  const { data: tenant, error: tenantError } = await adminClient
    .from(PLATFORM_TENANTS_TABLE)
    .upsert(
      {
        business_account_id: businessAccountId,
        owner_user_id: businessAccount.auth_user_id,
        tenant_key: `tenant_${String(businessAccount.auth_user_id || businessAccountId).replace(/-/g, '')}`,
        tenant_name: businessAccount.company_name || businessAccount.full_name || businessAccount.email || 'Business Workspace',
        tenant_slug: tenantSlug,
        tenant_status: 'pending',
        db_provider: 'supabase',
        schema_version: 'v1',
        metadata: {
          source: 'manual_workspace_provisioning',
          created_by: userId || null,
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
  if (existingJob?.id) return { businessAccount, tenant, job: existingJob };

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

  return { businessAccount, tenant, job };
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const auth = await requireOwner(req);

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
        throw businessAccountsError;
      }

      const businessAccountIds = Array.isArray(businessAccounts)
        ? businessAccounts.map((account) => account?.id).filter(Boolean)
        : [];

      let subscriptions = [];
      let tenants = [];
      let allJobs = data || [];

      if (businessAccountIds.length > 0) {
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
      }

      const subscriptionMap = new Map(
        subscriptions.map((subscription) => [String(subscription.business_account_id), subscription])
      );
      const tenantMap = new Map(
        tenants.map((tenant) => [String(tenant.business_account_id), tenant])
      );
      const latestJobMap = new Map();

      allJobs.forEach((job) => {
        const key = String(job?.business_account_id || '').trim();
        if (!key || latestJobMap.has(key)) return;
        latestJobMap.set(key, job);
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
          provisioning_job: latestJobMap.get(businessAccountId) || null,
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
      try {
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

      res.status(200).json({ job: updatedJob, tenant: updatedTenant, automation });
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
    const schemaVersion = String(req.body?.schema_version || 'v1').trim();

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
    const tenantMetadata = {
      ...(tenant.metadata || {}),
      connection_ready: true,
      last_provisioned_by: user.id,
      last_provisioned_at: nowIso,
    };

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
    });

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
          schema_version: schemaVersion || 'v1',
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
    res.status(500).json({ error: error.message || 'Failed to process tenant provisioning' });
  }
}
