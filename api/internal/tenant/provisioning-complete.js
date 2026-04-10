import {
  PLATFORM_TENANTS_TABLE,
  PLATFORM_TENANT_AUDIT_LOG_TABLE,
  PLATFORM_TENANT_PROVISIONING_JOBS_TABLE,
  PLATFORM_TENANT_WORKSPACE_POOL_TABLE,
  createSupabaseClients,
} from '../../_lib/supabase.js';

const sendJson = (res, status, body) => {
  res.status(status).json(body);
};

const normalizeUrl = (value) => {
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

const assertInternalSecret = (req) => {
  const expectedSecret = String(process.env.TENANT_PROVISIONING_WEBHOOK_SECRET || '').trim();
  if (!expectedSecret) {
    return { ok: false, status: 500, error: 'TENANT_PROVISIONING_WEBHOOK_SECRET is not configured' };
  }

  const header = String(req.headers.authorization || req.headers.Authorization || '').trim();
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';

  if (!token || token !== expectedSecret) {
    return { ok: false, status: 401, error: 'Unauthorized provisioning callback' };
  }

  return { ok: true };
};

const getPayloadValue = (body, key) =>
  String(body?.[key] || body?.tenant?.[key] || body?.result?.[key] || '').trim();

const insertAuditLog = async ({ adminClient, businessAccountId, tenantId, action, metadata = {} }) => {
  try {
    await adminClient.from(PLATFORM_TENANT_AUDIT_LOG_TABLE).insert({
      business_account_id: businessAccountId || null,
      tenant_id: tenantId || null,
      performed_by: null,
      action,
      metadata,
    });
  } catch (error) {
    console.warn(`Unable to write tenant provisioning audit log for ${action}:`, error?.message || error);
  }
};

const failCompletion = async ({ adminClient, job, tenantId, status, message, metadata = {} }) => {
  await insertAuditLog({
    adminClient,
    businessAccountId: job?.business_account_id || null,
    tenantId: tenantId || job?.tenant_id || null,
    action: 'tenant_provisioning_completion_rejected',
    metadata: {
      job_id: job?.id || metadata.job_id || null,
      error_message: message,
      ...metadata,
    },
  });

  return { status, body: { error: message } };
};

const getAssignedWorkspace = async ({ adminClient, workspacePoolId, tenantId, jobId, tenantProjectRef }) => {
  let query = adminClient
    .from(PLATFORM_TENANT_WORKSPACE_POOL_TABLE)
    .select('*')
    .eq('status', 'assigned')
    .eq('assigned_tenant_id', tenantId)
    .eq('assigned_job_id', jobId);

  if (workspacePoolId) {
    query = query.eq('id', workspacePoolId);
  } else {
    query = query.eq('tenant_project_ref', tenantProjectRef);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data || null;
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const secretCheck = assertInternalSecret(req);
  if (!secretCheck.ok) {
    sendJson(res, secretCheck.status, { error: secretCheck.error });
    return;
  }

  const jobId = getPayloadValue(req.body, 'job_id');
  const tenantId = getPayloadValue(req.body, 'tenant_id');
  const workspacePoolId = getPayloadValue(req.body, 'workspace_pool_id');
  const tenantProjectRef = getPayloadValue(req.body, 'tenant_project_ref');
  const tenantAppUrl = normalizeUrl(getPayloadValue(req.body, 'tenant_app_url'));
  const tenantApiUrl = normalizeUrl(getPayloadValue(req.body, 'tenant_api_url'));
  const tenantAnonKey = getPayloadValue(req.body, 'tenant_anon_key');
  const tenantServiceRoleSecretRef = getPayloadValue(req.body, 'tenant_service_role_secret_ref');
  const tenantDatabaseName = getPayloadValue(req.body, 'tenant_database_name');
  const schemaVersion = getPayloadValue(req.body, 'schema_version') || 'v1';

  const missing = [
    ['job_id', jobId],
    ['tenant_id', tenantId],
    ['tenant_project_ref', tenantProjectRef],
    ['tenant_app_url', tenantAppUrl],
    ['tenant_api_url', tenantApiUrl],
    ['tenant_anon_key', tenantAnonKey],
    ['workspace_pool_id', workspacePoolId],
  ].filter(([, value]) => !value);

  if (missing.length) {
    sendJson(res, 400, {
      error: `Missing required provisioning completion fields: ${missing.map(([key]) => key).join(', ')}`,
    });
    return;
  }

  const invalidConfigReason = getInvalidTenantConfigReason({ tenantProjectRef, tenantApiUrl, tenantAnonKey });
  if (invalidConfigReason) {
    sendJson(res, 400, {
      error: 'Provisioning completion payload is not a usable tenant workspace configuration',
      reason: invalidConfigReason,
    });
    return;
  }

  const { adminClient } = createSupabaseClients();
  const nowIso = new Date().toISOString();

  try {
    const { data: job, error: jobError } = await adminClient
      .from(PLATFORM_TENANT_PROVISIONING_JOBS_TABLE)
      .select('*')
      .eq('id', jobId)
      .maybeSingle();

    if (jobError) throw jobError;
    if (!job) {
      sendJson(res, 404, { error: 'Provisioning job not found' });
      return;
    }

    if (String(job.tenant_id || '') !== tenantId) {
      const failure = await failCompletion({
        adminClient,
        job,
        tenantId,
        status: 409,
        message: 'Provisioning completion tenant_id does not match the job tenant',
        metadata: { job_id: jobId, received_tenant_id: tenantId, expected_tenant_id: job.tenant_id },
      });
      sendJson(res, failure.status, failure.body);
      return;
    }

    const { data: tenant, error: tenantError } = await adminClient
      .from(PLATFORM_TENANTS_TABLE)
      .select('*')
      .eq('id', tenantId)
      .maybeSingle();

    if (tenantError) throw tenantError;
    if (!tenant) {
      sendJson(res, 404, { error: 'Tenant not found for provisioning job' });
      return;
    }

    const workspace = await getAssignedWorkspace({
      adminClient,
      workspacePoolId,
      tenantId,
      jobId,
      tenantProjectRef,
    });

    if (!workspace) {
      const failure = await failCompletion({
        adminClient,
        job,
        tenantId,
        status: 409,
        message: 'Assigned workspace was not found for this tenant provisioning job',
        metadata: { job_id: jobId, workspace_pool_id: workspacePoolId, tenant_project_ref: tenantProjectRef },
      });
      sendJson(res, failure.status, failure.body);
      return;
    }

    const workspaceMismatch = [
      ['tenant_project_ref', workspace.tenant_project_ref, tenantProjectRef],
      ['tenant_app_url', normalizeUrl(workspace.tenant_app_url), tenantAppUrl],
      ['tenant_api_url', normalizeUrl(workspace.tenant_api_url), tenantApiUrl],
      ['tenant_anon_key', workspace.tenant_anon_key, tenantAnonKey],
    ].find(([, expected, received]) => String(expected || '') !== String(received || ''));

    if (workspaceMismatch) {
      const [field, expected, received] = workspaceMismatch;
      const failure = await failCompletion({
        adminClient,
        job,
        tenantId,
        status: 409,
        message: `Provisioning completion payload does not match assigned workspace field: ${field}`,
        metadata: {
          job_id: jobId,
          workspace_pool_id: workspace.id,
          field,
          expected,
          received,
        },
      });
      sendJson(res, failure.status, failure.body);
      return;
    }

    const [{ data: updatedTenant, error: tenantUpdateError }, { data: updatedJob, error: jobUpdateError }] = await Promise.all([
      adminClient
        .from(PLATFORM_TENANTS_TABLE)
        .update({
          tenant_status: 'active',
          tenant_project_ref: tenantProjectRef,
          tenant_app_url: tenantAppUrl,
          tenant_api_url: tenantApiUrl,
          tenant_anon_key: tenantAnonKey,
          tenant_service_role_secret_ref: tenantServiceRoleSecretRef || null,
          tenant_database_name: tenantDatabaseName || null,
          schema_version: schemaVersion,
          provisioned_at: nowIso,
          provisioning_completed_at: nowIso,
          provisioning_error: null,
          metadata: {
            ...(tenant.metadata || {}),
            connection_ready: true,
            provisioning_completed_by: 'provisioning_worker',
            provisioning_completed_via: 'internal_callback',
            provisioning_completed_at: nowIso,
          },
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
            tenant_project_ref: tenantProjectRef,
            tenant_app_url: tenantAppUrl,
            tenant_api_url: tenantApiUrl,
            tenant_database_name: tenantDatabaseName || null,
            schema_version: schemaVersion,
            workspace_pool_id: workspace.id,
            completed_by: 'provisioning_worker',
          },
        })
        .eq('id', job.id)
        .select('*')
        .single(),
    ]);

    if (tenantUpdateError) throw tenantUpdateError;
    if (jobUpdateError) throw jobUpdateError;

    await adminClient.from(PLATFORM_TENANT_AUDIT_LOG_TABLE).insert({
      business_account_id: job.business_account_id,
      tenant_id: tenant.id,
      performed_by: null,
      action: 'complete_tenant_provisioning_callback',
      metadata: {
        job_id: job.id,
        tenant_project_ref: tenantProjectRef,
        tenant_app_url: tenantAppUrl,
        tenant_api_url: tenantApiUrl,
        schema_version: schemaVersion,
        workspace_pool_id: workspace.id,
      },
    });

    await adminClient.from('platform_tenant_events').insert({
      tenant_id: tenant.id,
      actor_user_id: null,
      event_type: 'activated',
      payload: {
        job_id: job.id,
        tenant_project_ref: tenantProjectRef,
        tenant_app_url: tenantAppUrl,
        mode: 'worker_callback',
      },
    });

    sendJson(res, 200, { job: updatedJob, tenant: updatedTenant });
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Failed to complete tenant provisioning' });
  }
}
