import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { requirePlatformOwnerOrAdmin } from './auth.js';
import {
  PLATFORM_TENANTS_TABLE,
  PLATFORM_TENANT_PROVISIONING_JOBS_TABLE,
} from './supabase.js';
import {
  CURRENT_TENANT_SCHEMA_CONTRACT_VERSION,
  CURRENT_TENANT_SCHEMA_RELEASE,
  CURRENT_TENANT_SCHEMA_RELEASE_ID,
  CURRENT_TENANT_SCHEMA_VERSION,
} from './tenantSchemaRelease.js';
import { insertTenantAuditLog } from './tenantAuditLog.js';

const execFileAsync = promisify(execFile);
const json = (res, status, body) => res.status(status).json(body);

const WORKSPACE_ROOT = path.resolve(process.cwd());
const GUARDED_UPGRADE_SCRIPT = path.resolve(WORKSPACE_ROOT, 'tmp/run_tenant_schema_upgrade_guarded.mjs');
const GUARDED_VERIFY_SCRIPT = path.resolve(WORKSPACE_ROOT, 'tmp/verify_tenant_schema_release_guarded.mjs');
const GUARDED_RUNTIME_VERIFY_SCRIPT = path.resolve(WORKSPACE_ROOT, 'tmp/verify_tenant_post_upgrade_guarded.mjs');

const SCHEMA_ACTIONS = new Set(['plan', 'apply', 'verify', 'drift', 'runtime']);
const SCHEMA_JOB_TYPE_BY_ACTION = {
  plan: 'schema_plan',
  apply: 'schema_upgrade',
  verify: 'schema_verify',
  drift: 'schema_drift',
};

const getRequestAction = (req) =>
  String(req.query?.action || req.body?.action || '')
    .trim()
    .toLowerCase();

const toBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(normalized);
};

const extractJsonObjects = (text = '') => {
  const source = String(text || '');
  const results = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let startIndex = -1;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      if (depth === 0) {
        startIndex = index;
      }
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0 && startIndex >= 0) {
        const candidate = source.slice(startIndex, index + 1);
        try {
          results.push(JSON.parse(candidate));
        } catch {
          // Ignore unparsable blocks.
        }
        startIndex = -1;
      }
    }
  }

  return results;
};

const runNodeScript = async (scriptPath, args = []) => {
  try {
    const result = await execFileAsync(process.execPath, [scriptPath, ...args], {
      cwd: WORKSPACE_ROOT,
      maxBuffer: 20 * 1024 * 1024,
    });

    return {
      ok: true,
      exitCode: 0,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      jsonObjects: extractJsonObjects(result.stdout || ''),
    };
  } catch (error) {
    return {
      ok: false,
      exitCode: Number(error?.code) || 1,
      stdout: error?.stdout || '',
      stderr: error?.stderr || error?.message || '',
      jsonObjects: extractJsonObjects(error?.stdout || ''),
      error,
    };
  }
};

const normalizeScriptFailure = (result, fallbackMessage) => {
  const lastJsonObject = result.jsonObjects[result.jsonObjects.length - 1] || null;
  return {
    error: lastJsonObject?.error || result.stderr || result.stdout || fallbackMessage,
    details: lastJsonObject,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
};

const buildTenantSelectorQuery = ({ tenantId = '', businessAccountId = '', tenantSlug = '', targetProjectRef = '' }) => {
  let query = null;
  return (adminClient) => {
    query = adminClient
      .from(PLATFORM_TENANTS_TABLE)
      .select('*');

    if (tenantId) {
      query = query.eq('id', tenantId);
    } else if (targetProjectRef) {
      query = query.eq('tenant_project_ref', targetProjectRef);
    } else if (tenantSlug) {
      query = query.eq('tenant_slug', tenantSlug);
    }

    if (businessAccountId) {
      query = query.eq('business_account_id', businessAccountId);
    }

    return query.maybeSingle();
  };
};

const resolveTenantTarget = async ({ adminClient, req }) => {
  const tenantId = String(req.query?.tenant_id || req.body?.tenant_id || '').trim();
  const businessAccountId = String(req.query?.business_account_id || req.body?.business_account_id || '').trim();
  const tenantSlug = String(req.query?.tenant_slug || req.body?.tenant_slug || '').trim();
  const targetProjectRef = String(req.query?.target_project_ref || req.body?.target_project_ref || '').trim();

  if (!tenantId && !targetProjectRef && !tenantSlug) {
    return {
      error: 'tenant_id, target_project_ref, or tenant_slug is required',
    };
  }

  const { data, error } = await buildTenantSelectorQuery({
    tenantId,
    businessAccountId,
    tenantSlug,
    targetProjectRef,
  })(adminClient);

  if (error) throw error;
  if (!data) {
    return {
      error: 'Tenant not found',
    };
  }

  const normalizedTargetProjectRef = String(data.tenant_project_ref || targetProjectRef || '').trim();
  if (!normalizedTargetProjectRef) {
    return {
      error: 'Tenant project ref is not configured yet',
    };
  }

  return {
    tenant: data,
    targetProjectRef: normalizedTargetProjectRef,
    targetTenant: String(data.tenant_slug || tenantSlug || 'unknown').trim() || 'unknown',
  };
};

const summarizeTenantRecord = (tenant = {}) => ({
  id: tenant.id,
  business_account_id: tenant.business_account_id || null,
  tenant_name: tenant.tenant_name || '',
  tenant_slug: tenant.tenant_slug || '',
  tenant_status: tenant.tenant_status || '',
  tenant_project_ref: tenant.tenant_project_ref || '',
  schema_version: tenant.schema_version || '',
  schema_release_id: tenant.metadata?.schema_release_id || null,
  schema_contract_version: tenant.metadata?.schema_contract_version || null,
  schema_last_verified_at: tenant.metadata?.schema_last_verified_at || null,
  schema_verification_ok: tenant.metadata?.schema_verification_ok ?? null,
  runtime_last_verified_at: tenant.metadata?.runtime_last_verified_at || null,
  runtime_verification_ok: tenant.metadata?.runtime_verification_ok ?? null,
});

const createSchemaJobRecord = async ({
  adminClient,
  tenant,
  action,
  user,
  targetProjectRef,
  targetTenant,
}) => {
  const jobType = SCHEMA_JOB_TYPE_BY_ACTION[action];
  if (!jobType) return null;

  try {
    const { data, error } = await adminClient
      .from(PLATFORM_TENANT_PROVISIONING_JOBS_TABLE)
      .insert({
        business_account_id: tenant.business_account_id || null,
        tenant_id: tenant.id,
        job_type: jobType,
        job_status: 'running',
        payload: {
          action,
          target_project_ref: targetProjectRef,
          target_tenant: targetTenant,
          release_id: CURRENT_TENANT_SCHEMA_RELEASE_ID,
          contract_version: CURRENT_TENANT_SCHEMA_CONTRACT_VERSION,
          requested_by: String(user?.email || '').trim().toLowerCase() || null,
          source: 'platform_admin_schema_api',
        },
        started_at: new Date().toISOString(),
      })
      .select('*')
      .maybeSingle();

    if (error) throw error;
    return data || null;
  } catch (error) {
    console.warn(`Unable to create schema job record for ${action}:`, error?.message || error);
    return null;
  }
};

const finalizeSchemaJobRecord = async ({
  adminClient,
  jobId,
  status,
  resultPayload = {},
  errorMessage = '',
}) => {
  if (!jobId) return null;

  try {
    const updatePayload = {
      job_status: status,
      finished_at: new Date().toISOString(),
      result: resultPayload && typeof resultPayload === 'object' ? resultPayload : {},
      error_message: errorMessage || null,
    };

    const { data, error } = await adminClient
      .from(PLATFORM_TENANT_PROVISIONING_JOBS_TABLE)
      .update(updatePayload)
      .eq('id', jobId)
      .select('*')
      .maybeSingle();

    if (error) throw error;
    return data || null;
  } catch (error) {
    console.warn(`Unable to finalize schema job record ${jobId}:`, error?.message || error);
    return null;
  }
};

const persistTenantSchemaMetadata = async ({
  adminClient,
  tenant,
  action,
  resultPayload,
}) => {
  const existingMetadata = tenant?.metadata && typeof tenant.metadata === 'object'
    ? tenant.metadata
    : {};

  const nextMetadata = {
    ...existingMetadata,
    schema_release_id: CURRENT_TENANT_SCHEMA_RELEASE_ID,
    schema_contract_version: CURRENT_TENANT_SCHEMA_CONTRACT_VERSION,
    schema_release: CURRENT_TENANT_SCHEMA_RELEASE,
  };

  const timestamp = new Date().toISOString();

  if (action === 'plan') {
    nextMetadata.schema_last_planned_at = timestamp;
    nextMetadata.schema_last_plan = resultPayload;
  }

  if (action === 'apply') {
    nextMetadata.schema_last_applied_at = timestamp;
    nextMetadata.schema_last_apply = resultPayload?.apply || resultPayload;
    if (typeof resultPayload?.verification?.ok === 'boolean') {
      nextMetadata.schema_last_verified_at = timestamp;
      nextMetadata.schema_verification_ok = resultPayload.verification.ok;
      nextMetadata.schema_last_verification = resultPayload.verification;
    }
  }

  if (action === 'verify' || action === 'drift') {
    nextMetadata.schema_last_verified_at = timestamp;
    nextMetadata.schema_verification_ok = resultPayload?.ok === true;
    nextMetadata.schema_last_verification = resultPayload;
    if (action === 'drift') {
      nextMetadata.schema_last_drift = resultPayload;
    }
  }

  if (action === 'runtime') {
    nextMetadata.runtime_last_verified_at = timestamp;
    nextMetadata.runtime_verification_ok = resultPayload?.ok === true;
    nextMetadata.runtime_last_verification = resultPayload;
  }

  const updatePayload = {
    schema_version: CURRENT_TENANT_SCHEMA_VERSION,
    metadata: nextMetadata,
  };

  const { data, error } = await adminClient
    .from(PLATFORM_TENANTS_TABLE)
    .update(updatePayload)
    .eq('id', tenant.id)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return data || tenant;
};

const createAuditLog = async ({
  adminClient,
  user,
  tenant,
  action,
  metadata,
}) => insertTenantAuditLog({
  adminClient,
  businessAccountId: tenant.business_account_id || null,
  tenantId: tenant.id,
  performedBy: user?.id || null,
  action: `schema_${action}`,
  metadata: {
    ...metadata,
    performed_by_email: String(user?.email || '').trim().toLowerCase() || null,
    source: 'platform_admin_schema_api',
  },
});

const runPlan = async ({ targetProjectRef, targetTenant }) => {
  const result = await runNodeScript(GUARDED_UPGRADE_SCRIPT, [
    '--target-project-ref',
    targetProjectRef,
    '--target-tenant',
    targetTenant,
  ]);

  if (!result.ok) {
    throw Object.assign(
      new Error('Unable to plan tenant schema upgrade'),
      normalizeScriptFailure(result, 'Unable to plan tenant schema upgrade'),
    );
  }

  return result.jsonObjects[0] || null;
};

const runApply = async ({ targetProjectRef, targetTenant }) => {
  const result = await runNodeScript(GUARDED_UPGRADE_SCRIPT, [
    '--target-project-ref',
    targetProjectRef,
    '--target-tenant',
    targetTenant,
    '--apply',
  ]);

  if (!result.ok || result.jsonObjects.length < 2) {
    throw Object.assign(
      new Error('Unable to apply tenant schema upgrade'),
      normalizeScriptFailure(result, 'Unable to apply tenant schema upgrade'),
    );
  }

  return {
    plan: result.jsonObjects[0] || null,
    apply: result.jsonObjects[result.jsonObjects.length - 1] || null,
  };
};

const runVerify = async ({ targetProjectRef, targetTenant, allowExtra = false }) => {
  const args = [
    '--target-project-ref',
    targetProjectRef,
    '--target-tenant',
    targetTenant,
  ];

  if (allowExtra) {
    args.push('--allow-extra');
  }

  const result = await runNodeScript(GUARDED_VERIFY_SCRIPT, args);
  const summary = result.jsonObjects[result.jsonObjects.length - 1] || null;

  if (!summary) {
    throw Object.assign(
      new Error('Unable to verify tenant schema release'),
      normalizeScriptFailure(result, 'Unable to verify tenant schema release'),
    );
  }

  return summary;
};

const runRuntimeVerify = async ({ targetProjectRef, targetTenant, appUrl = '' }) => {
  const args = [
    '--target-project-ref',
    targetProjectRef,
    '--target-tenant',
    targetTenant,
  ];

  if (appUrl) {
    args.push('--app-url', appUrl);
  }

  const result = await runNodeScript(GUARDED_RUNTIME_VERIFY_SCRIPT, args);
  const summary = result.jsonObjects[result.jsonObjects.length - 1] || null;

  if (!summary) {
    throw Object.assign(
      new Error('Unable to verify tenant runtime integrity'),
      normalizeScriptFailure(result, 'Unable to verify tenant runtime integrity'),
    );
  }

  return summary;
};

export default async function tenantSchemaHandler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const action = getRequestAction(req);
  if (!SCHEMA_ACTIONS.has(action)) {
    return json(res, 400, { error: 'schema action must be one of: plan, apply, verify, drift, runtime' });
  }

  if (req.method === 'GET' && action === 'apply') {
    return json(res, 405, { error: 'Apply must use POST' });
  }

  if (!['GET', 'POST'].includes(req.method)) {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const auth = await requirePlatformOwnerOrAdmin(req, 'Workspaces');
  if (auth.error) {
    return json(res, auth.error.status, auth.error.body);
  }

  const { adminClient, user } = auth;

  try {
    const targetResolution = await resolveTenantTarget({ adminClient, req });
    if (targetResolution.error) {
      return json(res, 400, { error: targetResolution.error });
    }

    const { tenant, targetProjectRef, targetTenant } = targetResolution;
    const allowExtra = toBoolean(req.query?.allow_extra ?? req.body?.allow_extra, false);
    let schemaJob = null;

    if (action === 'plan') {
      schemaJob = await createSchemaJobRecord({
        adminClient,
        tenant,
        action,
        user,
        targetProjectRef,
        targetTenant,
      });

      try {
        const plan = await runPlan({ targetProjectRef, targetTenant });
        const updatedTenant = await persistTenantSchemaMetadata({
          adminClient,
          tenant,
          action: 'plan',
          resultPayload: plan,
        });

        const completedJob = await finalizeSchemaJobRecord({
          adminClient,
          jobId: schemaJob?.id,
          status: 'completed',
          resultPayload: {
            release_id: plan?.release?.releaseId || CURRENT_TENANT_SCHEMA_RELEASE_ID,
            safe_plan: plan?.safePlan || null,
          },
        });

        await createAuditLog({
          adminClient,
          user,
          tenant: updatedTenant,
          action: 'plan',
          metadata: {
            release_id: plan?.release?.releaseId || CURRENT_TENANT_SCHEMA_RELEASE_ID,
            safe_plan: plan?.safePlan || null,
            schema_job_id: completedJob?.id || schemaJob?.id || null,
          },
        });

        return json(res, 200, {
          ok: true,
          action: 'plan',
          tenant: summarizeTenantRecord(updatedTenant),
          job: completedJob || schemaJob,
          plan,
        });
      } catch (error) {
        await finalizeSchemaJobRecord({
          adminClient,
          jobId: schemaJob?.id,
          status: 'failed',
          resultPayload: error?.details || {},
          errorMessage: error?.message || 'Unable to plan tenant schema upgrade',
        });
        throw error;
      }
    }

    if (action === 'apply') {
      schemaJob = await createSchemaJobRecord({
        adminClient,
        tenant,
        action,
        user,
        targetProjectRef,
        targetTenant,
      });

      try {
        const applyResult = await runApply({ targetProjectRef, targetTenant });
        const verification = await runVerify({ targetProjectRef, targetTenant, allowExtra: false });
        const runtimeVerification = await runRuntimeVerify({
          targetProjectRef,
          targetTenant,
          appUrl: tenant.app_url || tenant.metadata?.app_url || '',
        });

        const updatedTenant = await persistTenantSchemaMetadata({
          adminClient,
          tenant,
          action: 'apply',
          resultPayload: {
            ...applyResult,
            verification,
            runtimeVerification,
          },
        });

        const completedJob = await finalizeSchemaJobRecord({
          adminClient,
          jobId: schemaJob?.id,
          status: verification?.ok === true && runtimeVerification?.ok === true ? 'completed' : 'failed',
          resultPayload: {
            release_id: applyResult?.apply?.releaseId || CURRENT_TENANT_SCHEMA_RELEASE_ID,
            explicit_migration_ids: applyResult?.apply?.explicitMigrationIds || [],
            applied_statement_count: applyResult?.apply?.appliedStatementCount || 0,
            verification_ok: verification?.ok === true,
            runtime_ok: runtimeVerification?.ok === true,
            blocking_issues: verification?.blockingIssues || [],
            runtime_blocking_issues: runtimeVerification?.blockingIssues || [],
          },
          errorMessage:
            verification?.ok === true && runtimeVerification?.ok === true
              ? ''
              : 'Schema apply completed but post-upgrade verification still requires review',
        });

        await createAuditLog({
          adminClient,
          user,
          tenant: updatedTenant,
          action: 'apply',
          metadata: {
            release_id: applyResult?.apply?.releaseId || CURRENT_TENANT_SCHEMA_RELEASE_ID,
            explicit_migration_ids: applyResult?.apply?.explicitMigrationIds || [],
            applied_statement_count: applyResult?.apply?.appliedStatementCount || 0,
            verification_ok: verification?.ok === true,
            runtime_ok: runtimeVerification?.ok === true,
            runtime_blocking_issues: runtimeVerification?.blockingIssues || [],
            schema_job_id: completedJob?.id || schemaJob?.id || null,
          },
        });

        return json(res, 200, {
          ok: verification?.ok === true && runtimeVerification?.ok === true,
          action: 'apply',
          tenant: summarizeTenantRecord(updatedTenant),
          job: completedJob || schemaJob,
          plan: applyResult.plan,
          apply: applyResult.apply,
          verification,
          runtimeVerification,
        });
      } catch (error) {
        await finalizeSchemaJobRecord({
          adminClient,
          jobId: schemaJob?.id,
          status: 'failed',
          resultPayload: error?.details || {},
          errorMessage: error?.message || 'Unable to apply tenant schema upgrade',
        });
        throw error;
      }
    }

    if (action === 'verify' || action === 'drift') {
      schemaJob = await createSchemaJobRecord({
        adminClient,
        tenant,
        action,
        user,
        targetProjectRef,
        targetTenant,
      });

      try {
        const verification = await runVerify({
          targetProjectRef,
          targetTenant,
          allowExtra: action === 'drift' ? true : allowExtra,
        });

        const updatedTenant = await persistTenantSchemaMetadata({
          adminClient,
          tenant,
          action,
          resultPayload: verification,
        });

        const completedJob = await finalizeSchemaJobRecord({
          adminClient,
          jobId: schemaJob?.id,
          status: verification?.ok === true ? 'completed' : 'failed',
          resultPayload: {
            release_id: verification?.release?.releaseId || CURRENT_TENANT_SCHEMA_RELEASE_ID,
            verification_ok: verification?.ok === true,
            blocking_issues: verification?.blockingIssues || [],
            drift: verification?.drift || null,
          },
          errorMessage: verification?.ok === true ? '' : 'Schema verification requires review',
        });

        await createAuditLog({
          adminClient,
          user,
          tenant: updatedTenant,
          action,
          metadata: {
            release_id: verification?.release?.releaseId || CURRENT_TENANT_SCHEMA_RELEASE_ID,
            verification_ok: verification?.ok === true,
            blocking_issues: verification?.blockingIssues || [],
            drift: verification?.drift || null,
            schema_job_id: completedJob?.id || schemaJob?.id || null,
          },
        });

        return json(res, 200, {
          ok: verification?.ok === true,
          action,
          tenant: summarizeTenantRecord(updatedTenant),
          job: completedJob || schemaJob,
          verification,
        });
      } catch (error) {
        await finalizeSchemaJobRecord({
          adminClient,
          jobId: schemaJob?.id,
          status: 'failed',
          resultPayload: error?.details || {},
          errorMessage: error?.message || 'Unable to verify tenant schema release',
        });
        throw error;
      }
    }

    if (action === 'runtime') {
      try {
        const runtimeVerification = await runRuntimeVerify({
          targetProjectRef,
          targetTenant,
          appUrl: tenant.app_url || tenant.metadata?.app_url || '',
        });

        const updatedTenant = await persistTenantSchemaMetadata({
          adminClient,
          tenant,
          action,
          resultPayload: runtimeVerification,
        });

        await createAuditLog({
          adminClient,
          user,
          tenant: updatedTenant,
          action,
          metadata: {
            runtime_ok: runtimeVerification?.ok === true,
            blocking_issues: runtimeVerification?.blockingIssues || [],
          },
        });

        return json(res, 200, {
          ok: runtimeVerification?.ok === true,
          action,
          tenant: summarizeTenantRecord(updatedTenant),
          runtimeVerification,
        });
      } catch (error) {
        throw error;
      }
    }

    return json(res, 400, { error: 'Unsupported schema action' });
  } catch (error) {
    const status = error?.message?.toLowerCase().includes('tenant not found') ? 404 : 500;
    return json(res, status, {
      error: error?.message || 'Tenant schema action failed',
      details: error?.details || null,
      stdout: error?.stdout || '',
      stderr: error?.stderr || '',
    });
  }
}
