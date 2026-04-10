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

const assertInternalSecret = (req) => {
  const expectedSecret = String(process.env.TENANT_PROVISIONING_WEBHOOK_SECRET || '').trim();
  if (!expectedSecret) {
    return { ok: false, status: 500, error: 'TENANT_PROVISIONING_WEBHOOK_SECRET is not configured' };
  }

  const header = String(req.headers.authorization || req.headers.Authorization || '').trim();
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';

  if (!token || token !== expectedSecret) {
    return { ok: false, status: 401, error: 'Unauthorized provisioning driver request' };
  }

  return { ok: true };
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

const getInvalidWorkspaceReason = (workspace = {}) => {
  const projectRef = String(workspace.tenant_project_ref || '').trim();
  const apiHostname = getUrlHostname(workspace.tenant_api_url);
  const anonKey = String(workspace.tenant_anon_key || '').trim();

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

const getRequiredBodyValue = (body, key, nestedKey = key) =>
  String(body?.[key] || body?.tenant?.[nestedKey] || body?.job?.[nestedKey] || body?.business_account?.[nestedKey] || '').trim();

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

const failProvisioning = async ({ adminClient, jobId, tenantId, businessAccountId, message, metadata = {} }) => {
  const nowIso = new Date().toISOString();
  let tenantMetadata = metadata.tenant_metadata || null;
  let jobResult = metadata.job_result || null;

  if (tenantId && !tenantMetadata) {
    const { data: tenant } = await adminClient
      .from(PLATFORM_TENANTS_TABLE)
      .select('metadata')
      .eq('id', tenantId)
      .maybeSingle();
    tenantMetadata = tenant?.metadata || {};
  }

  if (jobId && !jobResult) {
    const { data: job } = await adminClient
      .from(PLATFORM_TENANT_PROVISIONING_JOBS_TABLE)
      .select('result')
      .eq('id', jobId)
      .maybeSingle();
    jobResult = job?.result || {};
  }

  await Promise.all([
    tenantId
      ? adminClient
          .from(PLATFORM_TENANTS_TABLE)
          .update({
            tenant_status: 'failed',
            provisioning_error: message,
            metadata: {
              ...(tenantMetadata || {}),
              last_provisioning_error: message,
              provisioning_failed_at: nowIso,
            },
          })
          .eq('id', tenantId)
      : Promise.resolve(),
    jobId
      ? adminClient
          .from(PLATFORM_TENANT_PROVISIONING_JOBS_TABLE)
          .update({
            job_status: 'failed',
            error_message: message,
            finished_at: nowIso,
            result: {
              ...(jobResult || {}),
              failure_reason: message,
              failed_at: nowIso,
            },
          })
          .eq('id', jobId)
      : Promise.resolve(),
  ]);

  await insertAuditLog({
    adminClient,
    businessAccountId,
    tenantId,
    action: 'tenant_provisioning_failed',
    metadata: {
      job_id: jobId || null,
      error_message: message,
      ...metadata,
    },
  });
};

const getProvisioningContext = async ({ adminClient, tenantId, jobId }) => {
  const { data: job, error: jobError } = await adminClient
    .from(PLATFORM_TENANT_PROVISIONING_JOBS_TABLE)
    .select('*')
    .eq('id', jobId)
    .maybeSingle();

  if (jobError) throw jobError;
  if (!job) {
    return { error: { status: 404, body: { error: 'Provisioning job not found' } } };
  }

  if (String(job.tenant_id || '') !== String(tenantId || '')) {
    return { error: { status: 409, body: { error: 'Provisioning job does not belong to the requested tenant' } } };
  }

  const { data: tenant, error: tenantError } = await adminClient
    .from(PLATFORM_TENANTS_TABLE)
    .select('*')
    .eq('id', tenantId)
    .maybeSingle();

  if (tenantError) throw tenantError;
  if (!tenant) {
    return { error: { status: 404, body: { error: 'Tenant not found' } } };
  }

  return { job, tenant };
};

const getExistingAssignedWorkspace = async ({ adminClient, tenantId, businessAccountId, jobId }) => {
  const { data: existingWorkspace, error } = await adminClient
    .from(PLATFORM_TENANT_WORKSPACE_POOL_TABLE)
    .select('*')
    .eq('status', 'assigned')
    .eq('assigned_tenant_id', tenantId)
    .order('assigned_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  if (!existingWorkspace) return null;
  if (String(existingWorkspace.assigned_job_id || '') === String(jobId || '')) return existingWorkspace;

  const { data: reboundWorkspace, error: reboundError } = await adminClient
    .from(PLATFORM_TENANT_WORKSPACE_POOL_TABLE)
    .update({
      assigned_business_account_id: businessAccountId,
      assigned_job_id: jobId,
      updated_at: new Date().toISOString(),
      metadata: {
        ...(existingWorkspace.metadata || {}),
        rebound_by: 'tenant_provisioning_driver',
        rebound_at: new Date().toISOString(),
        previous_assigned_job_id: existingWorkspace.assigned_job_id || null,
      },
    })
    .eq('id', existingWorkspace.id)
    .eq('status', 'assigned')
    .eq('assigned_tenant_id', tenantId)
    .select('*')
    .maybeSingle();

  if (reboundError) throw reboundError;
  return reboundWorkspace || existingWorkspace;
};

const claimAvailableWorkspace = async ({ adminClient, tenantId, businessAccountId, jobId }) => {
  const existingAssignedWorkspace = await getExistingAssignedWorkspace({
    adminClient,
    tenantId,
    businessAccountId,
    jobId,
  });
  if (existingAssignedWorkspace) return existingAssignedWorkspace;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data: candidate, error: candidateError } = await adminClient
      .from(PLATFORM_TENANT_WORKSPACE_POOL_TABLE)
      .select('*')
      .eq('status', 'available')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (candidateError) throw candidateError;
    if (!candidate) return null;

    const { data: claimed, error: claimError } = await adminClient
      .from(PLATFORM_TENANT_WORKSPACE_POOL_TABLE)
      .update({
        status: 'assigned',
        assigned_tenant_id: tenantId,
        assigned_business_account_id: businessAccountId,
        assigned_job_id: jobId,
        assigned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: {
          ...(candidate.metadata || {}),
          claimed_by: 'tenant_provisioning_driver',
          claimed_at: new Date().toISOString(),
        },
      })
      .eq('id', candidate.id)
      .eq('status', 'available')
      .select('*')
      .maybeSingle();

    if (claimError) throw claimError;
    if (claimed) return claimed;
  }

  return null;
};

const markWorkspaceFailed = async ({ adminClient, workspaceId, message }) => {
  if (!workspaceId) return;

  const { data: workspace } = await adminClient
    .from(PLATFORM_TENANT_WORKSPACE_POOL_TABLE)
    .select('metadata')
    .eq('id', workspaceId)
    .maybeSingle();

  await adminClient
    .from(PLATFORM_TENANT_WORKSPACE_POOL_TABLE)
    .update({
      status: 'failed',
      updated_at: new Date().toISOString(),
      metadata: {
        ...(workspace?.metadata || {}),
        failure_reason: message,
        failed_at: new Date().toISOString(),
      },
    })
    .eq('id', workspaceId);
};

export const runProvisioningDriver = async ({ body = {}, headers = {}, skipAuth = false } = {}) => {
  console.log('driver started');

  const reqLike = { body, headers };
  if (!skipAuth) {
    const secretCheck = assertInternalSecret(reqLike);
    if (!secretCheck.ok) {
      return { status: secretCheck.status, body: { error: secretCheck.error } };
    }
  }

  const jobId = getRequiredBodyValue(body, 'job_id', 'id');
  const tenantId = getRequiredBodyValue(body, 'tenant_id', 'id');
  const businessAccountId = getRequiredBodyValue(body, 'business_account_id', 'id');
  const completionCallbackUrl = normalizeUrl(String(body?.completion_callback_url || '').trim());

  const missing = [
    ['job_id', jobId],
    ['tenant_id', tenantId],
    ['business_account_id', businessAccountId],
    ['completion_callback_url', completionCallbackUrl],
  ].filter(([, value]) => !value);

  if (missing.length) {
    return {
      status: 400,
      body: {
        error: `Missing required provisioning driver fields: ${missing.map(([key]) => key).join(', ')}`,
      },
    };
  }

  const { adminClient } = createSupabaseClients();

  try {
    const context = await getProvisioningContext({ adminClient, tenantId, jobId });
    if (context.error) {
      await failProvisioning({
        adminClient,
        jobId,
        tenantId,
        businessAccountId,
        message: context.error.body.error,
      });
      return { status: context.error.status, body: context.error.body };
    }

    const workspace = await claimAvailableWorkspace({
      adminClient,
      tenantId,
      businessAccountId,
      jobId,
    });

    if (!workspace) {
      const message = 'No available tenant workspace pool entries. Add a pre-created workspace to platform_tenant_workspace_pool.';
      await failProvisioning({
        adminClient,
        jobId,
        tenantId,
        businessAccountId,
        message,
        metadata: {
          tenant_metadata: context.tenant?.metadata || {},
          job_result: context.job?.result || {},
        },
      });
      return { status: 409, body: { error: message } };
    }

    const invalidWorkspaceReason = getInvalidWorkspaceReason(workspace);
    if (invalidWorkspaceReason) {
      const message = `Assigned tenant workspace is not usable: ${invalidWorkspaceReason}`;
      await markWorkspaceFailed({ adminClient, workspaceId: workspace.id, message });
      await failProvisioning({
        adminClient,
        jobId,
        tenantId,
        businessAccountId,
        message,
        metadata: {
          tenant_metadata: context.tenant?.metadata || {},
          job_result: context.job?.result || {},
          workspace_pool_id: workspace.id,
        },
      });
      return { status: 409, body: { error: message } };
    }

    await insertAuditLog({
      adminClient,
      businessAccountId,
      tenantId,
      action: 'tenant_workspace_assigned',
      metadata: {
        job_id: jobId,
        workspace_pool_id: workspace.id,
        tenant_project_ref: workspace.tenant_project_ref,
        tenant_app_url: workspace.tenant_app_url,
      },
    });
    console.log('workspace assigned', {
      tenant_id: tenantId,
      workspace_pool_id: workspace.id,
      tenant_project_ref: workspace.tenant_project_ref,
    });

    const completionResponse = await fetch(completionCallbackUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${String(process.env.TENANT_PROVISIONING_WEBHOOK_SECRET || '').trim()}`,
      },
      body: JSON.stringify({
        job_id: jobId,
        tenant_id: tenantId,
        tenant_project_ref: workspace.tenant_project_ref,
        tenant_app_url: workspace.tenant_app_url,
        tenant_api_url: workspace.tenant_api_url,
        tenant_anon_key: workspace.tenant_anon_key,
        tenant_service_role_secret_ref: workspace.tenant_service_role_secret_ref,
        tenant_database_name: workspace.tenant_database_name,
        schema_version: workspace.schema_version || 'v1',
        workspace_pool_id: workspace.id,
      }),
    });

    const completionPayload = await completionResponse.json().catch(() => ({}));

    if (!completionResponse.ok) {
      const message = completionPayload?.error || completionPayload?.message || `Provisioning completion failed with ${completionResponse.status}`;
      await markWorkspaceFailed({ adminClient, workspaceId: workspace.id, message });
      await failProvisioning({
        adminClient,
        jobId,
        tenantId,
        businessAccountId,
        message,
        metadata: {
          tenant_metadata: context.tenant?.metadata || {},
          job_result: context.job?.result || {},
          workspace_pool_id: workspace.id,
          completion_status: completionResponse.status,
          completion_payload: completionPayload,
        },
      });
      return { status: completionResponse.status, body: { error: message, details: completionPayload } };
    }

    console.log('provisioning completed', {
      tenant_id: tenantId,
      workspace_pool_id: workspace.id,
      tenant_project_ref: workspace.tenant_project_ref,
    });

    return {
      status: 202,
      body: {
        status: 'accepted',
        mode: 'workspace_pool',
        workspace_pool_id: workspace.id,
        tenant_project_ref: workspace.tenant_project_ref,
        tenant_app_url: workspace.tenant_app_url,
        completion: completionPayload,
      },
    };
  } catch (error) {
    return { status: 500, body: { error: error.message || 'Tenant provisioning driver failed' } };
  }
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

  const result = await runProvisioningDriver({
    body: req.body,
    headers: req.headers,
    skipAuth: false,
  });
  sendJson(res, result.status, result.body);
}
