import {
  ORGANIZATIONS_TABLE,
  PLATFORM_BUSINESS_SUBSCRIPTIONS_TABLE,
  PLATFORM_BUSINESS_ACCOUNTS_TABLE,
  PLATFORM_TENANTS_TABLE,
  APP_USERS_TABLE,
  ORGANIZATION_MEMBERS_TABLE,
  getSharedSupabaseTenantConfig,
} from './supabase.js';
import {
  getCanonicalTenantWorkspaceContract,
  CANONICAL_TENANT_WORKSPACE_CONTRACT_VERSION,
} from './tenantWorkspaceContract.js';
import { resolveTenantTenancyMode } from './tenantRegistry.js';

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

const DEDICATED_RUNTIME_REQUIREMENTS = Object.freeze([
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

const resolveWorkspaceProjectRef = (tenant = {}) => {
  const tenancyMode = resolveTenantTenancyMode(tenant);
  if (tenancyMode === 'shared') {
    return String(getSharedSupabaseTenantConfig().projectRef || '').trim();
  }
  return String(tenant?.tenant_project_ref || '').trim();
};

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

const getRuntimeRequirements = ({ expectTrialWindow = false, tenancyMode = 'shared' } = {}) => {
  const baseRequirements = tenancyMode === 'dedicated'
    ? [...DEDICATED_RUNTIME_REQUIREMENTS]
    : [...BASE_RUNTIME_REQUIREMENTS];

  return expectTrialWindow
    ? [...baseRequirements, TRIAL_RUNTIME_REQUIREMENT]
    : baseRequirements;
};

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

const resolveSharedTenantRuntimeContext = async ({ tenant = {}, adminClient = null } = {}) => {
  const metadata = getTenantMetadata(tenant);
  const businessAccountId = String(tenant?.business_account_id || '').trim();
  const tenantOwnerUserId = String(tenant?.owner_user_id || '').trim();
  const metadataOrganizationId = String(
    metadata.organization_id ||
    metadata.shared_organization_id ||
    ''
  ).trim();

  let ownerAuthUserId = tenantOwnerUserId || null;
  if (!ownerAuthUserId && businessAccountId && adminClient) {
    const { data: businessAccount, error: businessAccountError } = await adminClient
      .from(PLATFORM_BUSINESS_ACCOUNTS_TABLE)
      .select('auth_user_id')
      .eq('id', businessAccountId)
      .maybeSingle();

    if (businessAccountError) {
      throw businessAccountError;
    }

    ownerAuthUserId = String(businessAccount?.auth_user_id || '').trim() || null;
  }

  let organizationId = metadataOrganizationId || null;
  if (!organizationId && ownerAuthUserId && adminClient) {
    const { data: organization, error: organizationError } = await adminClient
      .from(ORGANIZATIONS_TABLE)
      .select('id')
      .eq('owner_user_id', ownerAuthUserId)
      .eq('is_platform_organization', false)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (organizationError) {
      throw organizationError;
    }

    organizationId = String(organization?.id || '').trim() || null;
  }

  return {
    ownerAuthUserId,
    organizationId,
  };
};

const querySharedWorkspaceRuntimeReadiness = async ({
  tenant = {},
  adminClient = null,
  expectTrialWindow = false,
} = {}) => {
  if (!adminClient) {
    throw new Error('Shared workspace runtime readiness requires admin client access');
  }

  const { ownerAuthUserId, organizationId } = await resolveSharedTenantRuntimeContext({
    tenant,
    adminClient,
  });

  const requiredRuntimeRequirements = [
    'shared_owner_user',
    'shared_tenant_organization',
    'shared_owner_primary_org_link',
    'shared_owner_membership',
    'shared_owner_permissions',
    'shared_owner_verification_status',
  ];
  if (expectTrialWindow) {
    requiredRuntimeRequirements.push('shared_owner_trial_window');
  }

  const missingRuntimeRequirements = [];

  if (!ownerAuthUserId) {
    missingRuntimeRequirements.push(
      'shared_owner_user',
      'shared_owner_primary_org_link',
      'shared_owner_membership',
      'shared_owner_permissions',
      'shared_owner_verification_status'
    );
    if (expectTrialWindow) {
      missingRuntimeRequirements.push('shared_owner_trial_window');
    }
  }

  if (!organizationId) {
    missingRuntimeRequirements.push(
      'shared_tenant_organization',
      'shared_owner_primary_org_link',
      'shared_owner_membership'
    );
  }

  let ownerUser = null;
  if (ownerAuthUserId) {
    const { data, error } = await adminClient
      .from(APP_USERS_TABLE)
      .select('id, role, primary_organization_id, permissions, verification_status, trial_started_at, trial_ends_at')
      .eq('id', ownerAuthUserId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    ownerUser = data || null;
    const ownerRole = String(ownerUser?.role || '').trim().toLowerCase();
    if (!ownerUser || !['owner', 'business_owner', 'admin'].includes(ownerRole)) {
      missingRuntimeRequirements.push('shared_owner_user');
    }
    if (
      !ownerUser?.permissions ||
      typeof ownerUser.permissions !== 'object' ||
      Object.keys(ownerUser.permissions || {}).length === 0
    ) {
      missingRuntimeRequirements.push('shared_owner_permissions');
    }
    if (!ownerUser?.verification_status) {
      missingRuntimeRequirements.push('shared_owner_verification_status');
    }
    if (
      expectTrialWindow &&
      (!ownerUser?.trial_started_at || !ownerUser?.trial_ends_at)
    ) {
      missingRuntimeRequirements.push('shared_owner_trial_window');
    }
  }

  if (organizationId) {
    const { data: organization, error: organizationError } = await adminClient
      .from(ORGANIZATIONS_TABLE)
      .select('id, owner_user_id, is_platform_organization')
      .eq('id', organizationId)
      .maybeSingle();

    if (organizationError) {
      throw organizationError;
    }

    if (!organization || organization.is_platform_organization === true) {
      missingRuntimeRequirements.push('shared_tenant_organization');
    }

    if (
      !ownerUser ||
      String(ownerUser?.primary_organization_id || '').trim() !== String(organizationId)
    ) {
      missingRuntimeRequirements.push('shared_owner_primary_org_link');
    }

    if (ownerAuthUserId) {
      const { data: membership, error: membershipError } = await adminClient
        .from(ORGANIZATION_MEMBERS_TABLE)
        .select('organization_id, user_id, member_role, membership_status')
        .eq('organization_id', organizationId)
        .eq('user_id', ownerAuthUserId)
        .eq('membership_status', 'active')
        .eq('member_role', 'org_owner')
        .maybeSingle();

      if (membershipError) {
        throw membershipError;
      }

      if (!membership) {
        missingRuntimeRequirements.push('shared_owner_membership');
      }
    }
  }

  return {
    runtime_ready: [...new Set(missingRuntimeRequirements)].length === 0,
    required_runtime_requirements: requiredRuntimeRequirements,
    missing_runtime_requirements: [...new Set(missingRuntimeRequirements)],
    expected_trial_window: expectTrialWindow === true,
    readiness_mode: 'shared_tenant_runtime',
    organization_id: organizationId || null,
    owner_user_id: ownerAuthUserId || null,
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

  const tenancyMode = resolveTenantTenancyMode(tenant);
  const projectRef = resolveWorkspaceProjectRef(tenant);
  if (!projectRef) {
    const readiness = {
      status: 'incomplete',
      ready: false,
      contract_version: CANONICAL_TENANT_WORKSPACE_CONTRACT_VERSION,
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
    const schemaPromise = queryWorkspaceSchemaReadiness(projectRef);
    const runtimePromise = tenancyMode === 'shared'
      ? querySharedWorkspaceRuntimeReadiness({
        tenant,
        adminClient,
        expectTrialWindow: runtimeOptions.expectTrialWindow === true,
      })
      : queryWorkspaceRuntimeReadiness(projectRef, {
        ...runtimeOptions,
        tenancyMode,
      });
    const [schemaReadiness, runtimeReadiness] = await Promise.all([
      schemaPromise,
      runtimePromise,
    ]);
    const ready = schemaReadiness.schema_ready === true && runtimeReadiness.runtime_ready === true;
    readiness = {
      status: ready ? 'ready' : 'incomplete',
      ready,
      contract_version: CANONICAL_TENANT_WORKSPACE_CONTRACT_VERSION,
      checked_at: new Date().toISOString(),
      project_ref: projectRef,
      tenancy_mode: tenancyMode,
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
    const isDedicatedOrganizationPermissionError = (
      tenancyMode === 'dedicated' &&
      message.includes('permission denied for table app_organizations')
    );

    if (isRateLimited && cached?.ready === true) {
      return {
        ...cached,
        fresh: false,
        throttled: true,
        last_verification_error: error?.message || 'Workspace readiness verification was rate limited',
      };
    }

    if (isDedicatedOrganizationPermissionError) {
      const runtimeOptions = await inferRuntimeReadinessOptions({ tenant, adminClient });
      const schemaReadiness = await queryWorkspaceSchemaReadiness(projectRef);
      const fallbackRuntimeRequirements = getRuntimeRequirements({
        ...runtimeOptions,
        tenancyMode,
      }).map((requirement) => requirement.key);
      const ready = schemaReadiness.schema_ready === true;

      readiness = {
        status: ready ? 'ready' : 'incomplete',
        ready,
        contract_version: CANONICAL_TENANT_WORKSPACE_CONTRACT_VERSION,
        checked_at: new Date().toISOString(),
        project_ref: projectRef,
        tenancy_mode: tenancyMode,
        ...schemaReadiness,
        runtime_ready: true,
        required_runtime_requirements: fallbackRuntimeRequirements,
        missing_runtime_requirements: [],
        expected_trial_window: runtimeOptions.expectTrialWindow === true,
        readiness_mode: 'dedicated_legacy_runtime_fallback',
        warning_message: error?.message || 'Dedicated runtime verification skipped because shared organization tables are not available.',
        error_message: ready ? null : buildMissingMessage({
          missing_tables: schemaReadiness.missing_tables,
          missing_functions: schemaReadiness.missing_functions,
          missing_runtime_requirements: [],
        }),
      };
    } else {
      throw error;
    }
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
