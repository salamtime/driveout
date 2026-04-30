import { PLATFORM_TENANTS_TABLE } from './supabase.js';
import {
  getLegacyBusinessWorkspaceContract,
  LEGACY_BUSINESS_WORKSPACE_CONTRACT_VERSION,
} from './tenantWorkspaceContract.js';

const READINESS_METADATA_KEY = 'workspace_readiness';
const READINESS_CACHE_TTL_MS = 5 * 60 * 1000;

const {
  requiredTables: REQUIRED_TABLES,
  requiredFunctions: REQUIRED_FUNCTIONS,
} = getLegacyBusinessWorkspaceContract();

const getManagementToken = () => String(process.env.SUPABASE_MANAGEMENT_TOKEN || '').trim();

const buildMissingMessage = (readiness = {}) => {
  const missingTables = Array.isArray(readiness.missing_tables) ? readiness.missing_tables : [];
  const missingFunctions = Array.isArray(readiness.missing_functions) ? readiness.missing_functions : [];
  const issues = [
    ...missingTables.map((table) => `table:${table}`),
    ...missingFunctions.map((fn) => `function:${fn}`),
  ];

  if (issues.length === 0) {
    return 'Workspace schema readiness could not be verified.';
  }

  return `Workspace schema is incomplete (${issues.join(', ')})`;
};

const getTenantMetadata = (tenant = {}) => (
  tenant?.metadata && typeof tenant.metadata === 'object' ? tenant.metadata : {}
);

export const getCachedWorkspaceReadiness = (tenant = {}) => {
  const metadata = getTenantMetadata(tenant);
  const readiness = metadata[READINESS_METADATA_KEY];
  if (!readiness || typeof readiness !== 'object') return null;

  const checkedAt = new Date(readiness.checked_at || 0).getTime();
  if (!Number.isFinite(checkedAt) || checkedAt <= 0) return null;

  const fresh = Date.now() - checkedAt <= READINESS_CACHE_TTL_MS;
  return {
    ...readiness,
    fresh,
  };
};

export const mergeWorkspaceReadinessMetadata = (tenant = {}, readiness = {}) => {
  const metadata = getTenantMetadata(tenant);
  return {
    ...metadata,
    [READINESS_METADATA_KEY]: readiness,
    connection_ready: readiness.ready === true,
    schema_ready: readiness.ready === true,
    workspace_contract_version: readiness.contract_version || LEGACY_BUSINESS_WORKSPACE_CONTRACT_VERSION,
    schema_ready_checked_at: readiness.checked_at || new Date().toISOString(),
    schema_missing_tables: readiness.missing_tables || [],
    schema_missing_functions: readiness.missing_functions || [],
    schema_readiness_error: readiness.error_message || null,
  };
};

const parseManagementQueryResult = (payload) => {
  if (Array.isArray(payload?.result)) return payload.result[0] || {};
  if (Array.isArray(payload)) return payload[0] || {};
  if (payload?.data && Array.isArray(payload.data)) return payload.data[0] || {};
  return payload || {};
};

export const queryWorkspaceSchemaReadiness = async (projectRef) => {
  const token = getManagementToken();
  if (!token) {
    throw new Error('Missing SUPABASE_MANAGEMENT_TOKEN');
  }

  const tableChecks = REQUIRED_TABLES.map((tableName, index) => (
    `to_regclass('public.${tableName}') is not null as table_${index}`
  ));
  const functionChecks = REQUIRED_FUNCTIONS.map((functionName, index) => (
    `exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = '${functionName}'
    ) as function_${index}`
  ));

  const query = `
    select
      ${[...tableChecks, ...functionChecks].join(',\n      ')}
  `;

  const response = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/database/query`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      query,
      read_only: true,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload?.message ||
      payload?.error ||
      `Supabase schema readiness query failed with ${response.status}`;
    throw new Error(message);
  }

  const row = parseManagementQueryResult(payload);
  const missingTables = REQUIRED_TABLES.filter((_, index) => row[`table_${index}`] !== true);
  const missingFunctions = REQUIRED_FUNCTIONS.filter((_, index) => row[`function_${index}`] !== true);
  const checkedAt = new Date().toISOString();
  const ready = missingTables.length === 0 && missingFunctions.length === 0;

  return {
    status: ready ? 'ready' : 'incomplete',
    ready,
    contract_version: LEGACY_BUSINESS_WORKSPACE_CONTRACT_VERSION,
    checked_at: checkedAt,
    project_ref: projectRef,
    required_tables: REQUIRED_TABLES,
    required_functions: REQUIRED_FUNCTIONS,
    missing_tables: missingTables,
    missing_functions: missingFunctions,
    error_message: ready ? null : buildMissingMessage({
      missing_tables: missingTables,
      missing_functions: missingFunctions,
    }),
  };
};

export const resolveWorkspaceReadiness = async ({
  tenant,
  adminClient = null,
  forceFresh = false,
  persist = true,
} = {}) => {
  const cached = getCachedWorkspaceReadiness(tenant);
  if (!forceFresh && cached?.fresh) {
    return cached;
  }

  const projectRef = String(tenant?.tenant_project_ref || '').trim();
  if (!projectRef) {
    const readiness = {
      status: 'incomplete',
      ready: false,
      checked_at: new Date().toISOString(),
      project_ref: null,
      required_tables: REQUIRED_TABLES,
      required_functions: REQUIRED_FUNCTIONS,
      missing_tables: [...REQUIRED_TABLES],
      missing_functions: [...REQUIRED_FUNCTIONS],
      error_message: 'Workspace project reference is missing',
    };

    if (persist && adminClient && tenant?.id) {
      await adminClient
        .from(PLATFORM_TENANTS_TABLE)
        .update({ metadata: mergeWorkspaceReadinessMetadata(tenant, readiness) })
        .eq('id', tenant.id);
    }

    return readiness;
  }

  const readiness = await queryWorkspaceSchemaReadiness(projectRef);

  if (persist && adminClient && tenant?.id) {
    await adminClient
      .from(PLATFORM_TENANTS_TABLE)
      .update({ metadata: mergeWorkspaceReadinessMetadata(tenant, readiness) })
      .eq('id', tenant.id);
  }

  return readiness;
};

export const getWorkspaceReadinessMetadataKey = () => READINESS_METADATA_KEY;
export const getWorkspaceReadinessFailureMessage = buildMissingMessage;
