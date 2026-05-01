import {
  PLATFORM_BUSINESS_ACCOUNTS_TABLE,
  PLATFORM_TENANTS_TABLE,
  PLATFORM_TENANT_AUDIT_LOG_TABLE,
  PLATFORM_TENANT_PROVISIONING_JOBS_TABLE,
  PLATFORM_TENANT_WORKSPACE_POOL_TABLE,
  createSupabaseClients,
} from './supabase.js';
import {
  getWorkspaceReadinessFailureMessage,
  mergeWorkspaceReadinessMetadata,
  resolveWorkspaceReadiness,
} from './tenantWorkspaceReadiness.js';
import { applyLegacyBusinessWorkspaceBootstrap } from './tenantWorkspaceBootstrap.js';

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
    return { ok: false, status: 401, error: 'Unauthorized provisioning worker request' };
  }

  return { ok: true };
};

const getRequiredBodyValue = (body, key, nestedKey = key) =>
  String(body?.[key] || body?.tenant?.[nestedKey] || body?.job?.[nestedKey] || body?.business_account?.[nestedKey] || '').trim();

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

const buildCompletionUrl = (req) => {
  const configuredUrl = String(process.env.TENANT_PROVISIONING_COMPLETE_URL || '').trim();
  if (configuredUrl) return configuredUrl;

  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim();
  const protocol = String(req.headers['x-forwarded-proto'] || 'https').trim();
  return host
    ? `${protocol}://${host}/api/tenants?resource=provisioning&action=internal-complete`
    : '/api/tenants?resource=provisioning&action=internal-complete';
};

const buildDefaultDriverUrl = (req) => {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim();
  const protocol = String(req.headers['x-forwarded-proto'] || 'https').trim();
  return host
    ? `${protocol}://${host}/api/tenants?resource=provisioning&action=internal-driver`
    : '';
};

export const runProvisioningDriver = async ({ body = {}, headers = {}, skipAuth = false } = {}) => {
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

export const handleInternalProvisioningStart = async (req, res) => {
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

  const jobId = String(req.body?.job?.id || req.body?.job_id || '').trim();
  const tenantId = String(req.body?.tenant?.id || req.body?.tenant_id || '').trim();
  const businessAccountId = String(req.body?.business_account?.id || req.body?.business_account_id || '').trim();

  if (!jobId || !tenantId || !businessAccountId) {
    sendJson(res, 400, {
      error: 'job.id, tenant.id, and business_account.id are required to start tenant provisioning',
    });
    return;
  }

  const driverBody = {
    ...req.body,
    job_id: jobId,
    tenant_id: tenantId,
    business_account_id: businessAccountId,
    completion_callback_url: buildCompletionUrl(req),
  };

  try {
    const directResult = await runProvisioningDriver({
      body: driverBody,
      headers: req.headers || {},
      skipAuth: true,
    });

    sendJson(res, directResult.status, {
      ...directResult.body,
      job_id: jobId,
      tenant_id: tenantId,
      completion_callback_url: buildCompletionUrl(req),
      driver_mode: 'internal',
    });
    return;
  } catch (internalError) {
    console.error('Internal provisioning driver call failed; falling back to configured driver URL if available.', internalError);
  }

  const driverUrl = String(process.env.TENANT_PROVISIONING_DRIVER_URL || buildDefaultDriverUrl(req)).trim();

  if (!driverUrl) {
    sendJson(res, 501, {
      error: 'Tenant provisioning driver is not configured. Set TENANT_PROVISIONING_DRIVER_URL to the service that creates the isolated Supabase/Vercel workspace.',
      job_id: jobId,
      tenant_id: tenantId,
      business_account_id: businessAccountId,
      completion_callback_url: buildCompletionUrl(req),
    });
    return;
  }

  let response;
  try {
    response = await fetch(driverUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${String(process.env.TENANT_PROVISIONING_WEBHOOK_SECRET || '').trim()}`,
      },
      body: JSON.stringify(driverBody),
    });
  } catch (error) {
    sendJson(res, 502, {
      error: error?.message || 'Tenant provisioning driver request failed',
      job_id: jobId,
      tenant_id: tenantId,
      business_account_id: businessAccountId,
    });
    return;
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    sendJson(res, response.status, {
      error: payload?.error || payload?.message || `Tenant provisioning driver failed with ${response.status}`,
      details: payload,
    });
    return;
  }

  sendJson(res, 202, {
    status: 'accepted',
    job_id: jobId,
    tenant_id: tenantId,
    driver: payload,
    completion_callback_url: buildCompletionUrl(req),
  });
};

export const handleInternalProvisioningDriver = async (req, res) => {
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
};

export const handleInternalProvisioningComplete = async (req, res) => {
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
      await insertAuditLog({
        adminClient,
        businessAccountId: job?.business_account_id || null,
        tenantId,
        action: 'tenant_provisioning_completion_rejected',
        metadata: {
          job_id: jobId,
          error_message: 'Provisioning completion tenant_id does not match the job tenant',
          received_tenant_id: tenantId,
          expected_tenant_id: job.tenant_id,
        },
      });
      sendJson(res, 409, { error: 'Provisioning completion tenant_id does not match the job tenant' });
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

    const { data: businessAccount, error: businessAccountError } = await adminClient
      .from(PLATFORM_BUSINESS_ACCOUNTS_TABLE)
      .select('id, auth_user_id, email, full_name, company_name')
      .eq('id', job.business_account_id)
      .maybeSingle();

    if (businessAccountError) throw businessAccountError;

    const workspace = await getAssignedWorkspace({
      adminClient,
      workspacePoolId,
      tenantId,
      jobId,
      tenantProjectRef,
    });

    if (!workspace) {
      await insertAuditLog({
        adminClient,
        businessAccountId: job.business_account_id,
        tenantId,
        action: 'tenant_provisioning_completion_rejected',
        metadata: {
          job_id: jobId,
          error_message: 'Assigned workspace was not found for this tenant provisioning job',
          workspace_pool_id: workspacePoolId,
          tenant_project_ref: tenantProjectRef,
        },
      });
      sendJson(res, 409, { error: 'Assigned workspace was not found for this tenant provisioning job' });
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
      await insertAuditLog({
        adminClient,
        businessAccountId: job.business_account_id,
        tenantId,
        action: 'tenant_provisioning_completion_rejected',
        metadata: {
          job_id: jobId,
          error_message: `Provisioning completion payload does not match assigned workspace field: ${field}`,
          workspace_pool_id: workspace.id,
          field,
          expected,
          received,
        },
      });
      sendJson(res, 409, { error: `Provisioning completion payload does not match assigned workspace field: ${field}` });
      return;
    }

    try {
      await applyLegacyBusinessWorkspaceBootstrap({
        projectRef: tenantProjectRef,
        tenantName: tenant.tenant_name || businessAccount?.company_name || businessAccount?.full_name || businessAccount?.email || 'Business Workspace',
        tenantSlug: tenant.tenant_slug,
        ownerAuthUserId: businessAccount?.auth_user_id || null,
        ownerEmail: businessAccount?.email || null,
        ownerFullName: businessAccount?.full_name || null,
      });
    } catch (bootstrapError) {
      const bootstrapMessage = `Unable to bootstrap tenant workspace schema: ${bootstrapError?.message || bootstrapError}`;
      await failProvisioning({
        adminClient,
        jobId,
        tenantId,
        businessAccountId: job.business_account_id,
        message: bootstrapMessage,
        metadata: {
          tenant_project_ref: tenantProjectRef,
          tenant_app_url: tenantAppUrl,
          tenant_api_url: tenantApiUrl,
          workspace_pool_id: workspace.id,
        },
      });
      sendJson(res, 502, { error: bootstrapMessage });
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
      const readinessMessage = `Unable to verify workspace schema readiness: ${readinessError?.message || readinessError}`;
      await failProvisioning({
        adminClient,
        jobId,
        tenantId,
        businessAccountId: job.business_account_id,
        message: readinessMessage,
        metadata: {
          tenant_project_ref: tenantProjectRef,
          tenant_app_url: tenantAppUrl,
          tenant_api_url: tenantApiUrl,
          workspace_pool_id: workspace.id,
        },
      });
      sendJson(res, 502, { error: readinessMessage });
      return;
    }

    if (workspaceReadiness?.ready !== true) {
      const readinessMessage = getWorkspaceReadinessFailureMessage(workspaceReadiness);
      const failedMetadata = mergeWorkspaceReadinessMetadata(tenant, workspaceReadiness);
      const nowIso = new Date().toISOString();

      await Promise.all([
        adminClient
          .from(PLATFORM_TENANTS_TABLE)
          .update({
            tenant_status: 'failed',
            tenant_project_ref: tenantProjectRef,
            tenant_app_url: tenantAppUrl,
            tenant_api_url: tenantApiUrl,
            tenant_anon_key: tenantAnonKey,
            tenant_service_role_secret_ref: tenantServiceRoleSecretRef || null,
            tenant_database_name: tenantDatabaseName || null,
            schema_version: schemaVersion,
            provisioning_error: readinessMessage,
            metadata: {
              ...failedMetadata,
              provisioning_completed_by: 'provisioning_worker',
              provisioning_failed_at: nowIso,
              provisioning_failed_via: 'internal_callback_schema_readiness_guard',
              workspace_pool_id: workspace.id,
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
              tenant_project_ref: tenantProjectRef,
              tenant_app_url: tenantAppUrl,
              tenant_api_url: tenantApiUrl,
              tenant_database_name: tenantDatabaseName || null,
              schema_version: schemaVersion,
              workspace_pool_id: workspace.id,
              failure_reason: readinessMessage,
              workspace_readiness: workspaceReadiness,
            },
          })
          .eq('id', job.id),
      ]);

      await insertAuditLog({
        adminClient,
        businessAccountId: job.business_account_id,
        tenantId,
        action: 'tenant_schema_readiness_failed',
        metadata: {
          job_id: job.id,
          tenant_project_ref: tenantProjectRef,
          workspace_pool_id: workspace.id,
          workspace_readiness: workspaceReadiness,
        },
      });

      sendJson(res, 409, {
        error: readinessMessage,
        readiness: workspaceReadiness,
      });
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
            ...mergeWorkspaceReadinessMetadata(tenant, workspaceReadiness),
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
            workspace_readiness: workspaceReadiness,
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
};
