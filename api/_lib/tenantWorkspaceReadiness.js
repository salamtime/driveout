import {
  PLATFORM_BUSINESS_SUBSCRIPTIONS_TABLE,
  PLATFORM_TENANTS_TABLE,
} from './supabase.js';
import {
  getCanonicalTenantWorkspaceContract,
  CANONICAL_TENANT_WORKSPACE_CONTRACT_VERSION,
} from './tenantWorkspaceContract.js';

const READINESS_METADATA_KEY = 'workspace_readiness';
const READINESS_CACHE_TTL_MS = 5 * 60 * 1000;

const {
  requiredTables: REQUIRED_TABLES,
  requiredFunctions: REQUIRED_FUNCTIONS,
} = getCanonicalTenantWorkspaceContract();

const BASE_RUNTIME_REQUIREMENTS = Object.freeze([
  {
    key: 'owner_user',
    label: 'owner workspace user exists',
    sql: `exists (
      select 1
      from public.app_b30c02e74da644baad4668e3587d86b1_users u
      where u.role = 'owner'::public.user_role
    )`,
  },
  {
    key: 'tenant_organization',
    label: 'tenant organization exists',
    sql: `exists (
      select 1
      from public.app_organizations o
      where coalesce(o.is_platform_organization, false) = false
    )`,
  },
  {
    key: 'owner_primary_org_link',
    label: 'owner is linked to primary tenant organization',
    sql: `exists (
      select 1
      from public.app_b30c02e74da644baad4668e3587d86b1_users u
      join public.app_organizations o
        on o.owner_user_id = u.id
       and o.id = u.primary_organization_id
      where u.role = 'owner'::public.user_role
        and coalesce(o.is_platform_organization, false) = false
    )`,
  },
  {
    key: 'owner_membership',
    label: 'owner has active organization membership',
    sql: `exists (
      select 1
      from public.app_organization_members m
      join public.app_b30c02e74da644baad4668e3587d86b1_users u
        on u.id = m.user_id
      join public.app_organizations o
        on o.id = m.organization_id
      where u.role = 'owner'::public.user_role
        and m.member_role = 'org_owner'
        and m.membership_status = 'active'
        and coalesce(o.is_platform_organization, false) = false
    )`,
  },
  {
    key: 'owner_permissions',
    label: 'owner permissions are seeded',
    sql: `exists (
      select 1
      from public.app_b30c02e74da644baad4668e3587d86b1_users u
      where u.role = 'owner'::public.user_role
        and u.permissions is not null
        and jsonb_typeof(u.permissions) = 'object'
        and exists (
          select 1
          from jsonb_each(u.permissions)
          limit 1
        )
    )`,
  },
  {
    key: 'owner_verification_status',
    label: 'owner verification status is seeded',
    sql: `exists (
      select 1
      from public.app_b30c02e74da644baad4668e3587d86b1_users u
      where u.role = 'owner'::public.user_role
        and u.verification_status is not null
    )`,
  },
]);

const TRIAL_RUNTIME_REQUIREMENT = Object.freeze({
  key: 'owner_trial_window',
  label: 'owner trial window is seeded',
  sql: `exists (
    select 1
    from public.app_b30c02e74da644baad4668e3587d86b1_users u
    where u.role = 'owner'::public.user_role
      and u.trial_started_at is not null
      and u.trial_ends_at is not null
  )`,
});

const getManagementToken = () => String(process.env.SUPABASE_MANAGEMENT_TOKEN || '').trim();

const buildMissingMessage = (readiness = {}) => {
  const missingTables = Array.isArray(readiness.missing_tables) ? readiness.missing_tables : [];
  const missingFunctions = Array.isArray(readiness.missing_functions) ? readiness.missing_functions : [];
  const missingRuntime = Array.isArray(readiness.missing_runtime_requirements)
    ? readiness.missing_runtime_requirements
    : [];
  const issues = [
    ...missingTables.map((table) => `table:${table}`),
    ...missingFunctions.map((fn) => `function:${fn}`),
    ...missingRuntime.map((check) => `runtime:${check}`),
  ];

  if (issues.length === 0) {
    return 'Workspace readiness could not be verified.';
  }

  return `Workspace readiness is incomplete (${issues.join(', ')})`;
};

const getTenantMetadata = (tenant = {}) => (
  tenant?.metadata && typeof tenant.metadata === 'object' ? tenant.metadata : {}
);

export const getCachedWorkspaceReadiness = (tenant = {}) => {
  const metadata = getTenantMetadata(tenant);
  const readiness = metadata[READINESS_METADATA_KEY];
  if (!readiness || typeof readiness !== 'object') return null;

  if (readiness.contract_version !== CANONICAL_TENANT_WORKSPACE_CONTRACT_VERSION) {
    return null;
  }

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
    schema_ready: readiness.schema_ready === true,
    runtime_ready: readiness.runtime_ready === true,
    workspace_contract_version: readiness.contract_version || CANONICAL_TENANT_WORKSPACE_CONTRACT_VERSION,
    schema_ready_checked_at: readiness.checked_at || new Date().toISOString(),
    schema_missing_tables: readiness.missing_tables || [],
    schema_missing_functions: readiness.missing_functions || [],
    runtime_missing_requirements: readiness.missing_runtime_requirements || [],
    schema_readiness_error: readiness.schema_ready === false ? (readiness.error_message || null) : null,
    runtime_readiness_error: readiness.runtime_ready === false ? (readiness.error_message || null) : null,
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
    schema_ready: ready,
    checked_at: checkedAt,
    project_ref: projectRef,
    required_tables: REQUIRED_TABLES,
    required_functions: REQUIRED_FUNCTIONS,
    missing_tables: missingTables,
    missing_functions: missingFunctions,
  };
};

const getRuntimeRequirements = ({ expectTrialWindow = false } = {}) => (
  expectTrialWindow
    ? [...BASE_RUNTIME_REQUIREMENTS, TRIAL_RUNTIME_REQUIREMENT]
    : [...BASE_RUNTIME_REQUIREMENTS]
);

const inferRuntimeReadinessOptions = async ({ tenant = {}, adminClient = null } = {}) => {
  const businessAccountId = String(tenant?.business_account_id || '').trim();
  if (!businessAccountId || !adminClient) {
    return { expectTrialWindow: false };
  }

  const { data, error } = await adminClient
    .from(PLATFORM_BUSINESS_SUBSCRIPTIONS_TABLE)
    .select('subscription_status, trial_started_at, trial_ends_at')
    .eq('business_account_id', businessAccountId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const subscriptionStatus = String(data?.subscription_status || '').trim().toLowerCase();
  const expectTrialWindow = (
    subscriptionStatus === 'trial' ||
    Boolean(data?.trial_started_at) ||
    Boolean(data?.trial_ends_at)
  );

  return { expectTrialWindow };
};

export const queryWorkspaceRuntimeReadiness = async (projectRef, options = {}) => {
  const token = getManagementToken();
  if (!token) {
    throw new Error('Missing SUPABASE_MANAGEMENT_TOKEN');
  }

  const requirements = getRuntimeRequirements(options);
  const checks = requirements.map((requirement, index) => (
    `${requirement.sql} as runtime_${index}`
  ));

  const query = `
    select
      ${checks.join(',\n      ')}
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
      `Supabase runtime readiness query failed with ${response.status}`;
    throw new Error(message);
  }

  const row = parseManagementQueryResult(payload);
  const missingRuntimeRequirements = requirements
    .filter((_, index) => row[`runtime_${index}`] !== true)
    .map((requirement) => requirement.key);

  return {
    runtime_ready: missingRuntimeRequirements.length === 0,
    required_runtime_requirements: requirements.map((requirement) => requirement.key),
    missing_runtime_requirements: missingRuntimeRequirements,
    expected_trial_window: options.expectTrialWindow === true,
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
      schema_ready: false,
      runtime_ready: false,
      checked_at: new Date().toISOString(),
      project_ref: null,
      required_tables: REQUIRED_TABLES,
      required_functions: REQUIRED_FUNCTIONS,
      required_runtime_requirements: getRuntimeRequirements().map((requirement) => requirement.key),
      missing_tables: [...REQUIRED_TABLES],
      missing_functions: [...REQUIRED_FUNCTIONS],
      missing_runtime_requirements: getRuntimeRequirements().map((requirement) => requirement.key),
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

  let readiness = null;

  try {
    const runtimeOptions = await inferRuntimeReadinessOptions({ tenant, adminClient });
    const [schemaReadiness, runtimeReadiness] = await Promise.all([
      queryWorkspaceSchemaReadiness(projectRef),
      queryWorkspaceRuntimeReadiness(projectRef, runtimeOptions),
    ]);
    const ready = schemaReadiness.schema_ready === true && runtimeReadiness.runtime_ready === true;
    readiness = {
      status: ready ? 'ready' : 'incomplete',
      ready,
      contract_version: CANONICAL_TENANT_WORKSPACE_CONTRACT_VERSION,
      checked_at: new Date().toISOString(),
      project_ref: projectRef,
      ...schemaReadiness,
      ...runtimeReadiness,
      error_message: ready ? null : buildMissingMessage({
        missing_tables: schemaReadiness.missing_tables,
        missing_functions: schemaReadiness.missing_functions,
        missing_runtime_requirements: runtimeReadiness.missing_runtime_requirements,
      }),
    };
  } catch (error) {
    const message = String(error?.message || '').toLowerCase();
    const isRateLimited = message.includes('429') || message.includes('too many requests') || message.includes('rate limit');

    if (isRateLimited && cached?.ready === true) {
      return {
        ...cached,
        fresh: false,
        throttled: true,
        last_verification_error: error?.message || 'Workspace readiness verification was rate limited',
      };
    }

    throw error;
  }

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
