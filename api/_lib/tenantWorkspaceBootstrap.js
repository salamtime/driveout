import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  CURRENT_TENANT_SCHEMA_CONTRACT_VERSION,
  CURRENT_TENANT_SCHEMA_RELEASE_ID,
} from './tenantSchemaRelease.js';
import {
  assertTenantTargetProjectRef,
  getCanonicalProjectRef,
} from './tenantSchemaMutationGuard.js';
import {
  APP_USERS_TABLE,
  ORGANIZATIONS_TABLE,
  ORGANIZATION_MEMBERS_TABLE,
} from './supabase.js';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(MODULE_DIR, '..', '..');
const SUPABASE_MANAGEMENT_API_BASE = 'https://api.supabase.com/v1';

const LEGACY_WORKSPACE_SQL_STEPS = Object.freeze([
  {
    name: 'legacy_workspace_core',
    relativePath: 'src/migrations/create_legacy_workspace_core.sql',
  },
  {
    name: 'legacy_workspace_team_tasks',
    relativePath: 'src/migrations/create_team_tasks.sql',
  },
  {
    name: 'legacy_workspace_tour_packages',
    relativePath: 'src/migrations/create_tour_packages_and_bookings_tables.sql',
  },
  {
    name: 'legacy_workspace_tour_snapshots',
    relativePath: 'src/migrations/create_tour_vehicle_snapshots.sql',
  },
  {
    name: 'legacy_workspace_vehicle_reports',
    relativePath: 'src/migrations/create_vehicle_reports_table.sql',
  },
  {
    name: 'legacy_workspace_maintenance_parts',
    relativePath: 'src/database/migrations/create_maintenance_parts_table.sql',
  },
  {
    name: 'legacy_workspace_rental_extensions',
    relativePath: 'src/migrations/rental_extensions_migration.sql',
  },
  {
    name: 'legacy_workspace_locations',
    relativePath: 'src/migrations/create_fleet_locations_v1.sql',
  },
  {
    name: 'legacy_workspace_foundation',
    relativePath: 'src/migrations/create_legacy_workspace_foundation.sql',
  },
]);

const CANONICAL_WORKSPACE_CONTRACT_VERSION = CURRENT_TENANT_SCHEMA_CONTRACT_VERSION;

const CANONICAL_EXTRA_TABLES_TO_REMOVE = Object.freeze([
  'app_4c3a7a6153_transport_fees',
  'app_b30c02e74da644baad4668e3587d86b1_user_module_access',
]);

const CANONICAL_EXTRA_USER_COLUMNS_TO_REMOVE = Object.freeze([
  'phone',
  'avatar_url',
  'metadata',
  'user_status',
  'plan_type',
  'billing_status',
  'suspended_at',
  'suspension_reason',
  'plan_changed_at',
]);

const CANONICAL_USERS_TABLE = 'app_b30c02e74da644baad4668e3587d86b1_users';

const quoteIdent = (value) => `"${String(value || '').replace(/"/g, '""')}"`;

const getManagementToken = () => String(process.env.SUPABASE_MANAGEMENT_TOKEN || '').trim();

const readSqlFile = (relativePath) => (
  readFileSync(path.join(WORKSPACE_ROOT, relativePath), 'utf8')
);

const escapeSqlLiteral = (value) => String(value || '').replace(/'/g, "''");

const slugify = (value, fallback = 'workspace') => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return normalized || fallback;
};

const readResponse = async (response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

const runProjectManagementSql = async ({ projectRef, query, readOnly = false }) => {
  const token = getManagementToken();
  if (!token) {
    throw new Error('Missing SUPABASE_MANAGEMENT_TOKEN');
  }

  const response = await fetch(`${SUPABASE_MANAGEMENT_API_BASE}/projects/${encodeURIComponent(projectRef)}/database/query`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      query,
      read_only: readOnly,
    }),
  });

  const payload = await readResponse(response);
  if (!response.ok) {
    const message = payload?.message || payload?.error || payload?.raw || `Supabase management query failed with ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
};

const rowsFromPayload = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.result)) return payload.result;
  if (Array.isArray(payload?.rows)) return payload.rows;
  return [];
};

const fetchPublicForeignKeys = async (projectRef) => {
  const payload = await runProjectManagementSql({
    projectRef,
    readOnly: true,
    query: `
      select
        c.conname as constraint_name,
        rel.relname as table_name,
        pg_get_constraintdef(c.oid, true) as constraint_definition
      from pg_constraint c
      join pg_class rel on rel.oid = c.conrelid
      join pg_namespace n on n.oid = rel.relnamespace
      where n.nspname = 'public'
        and c.contype = 'f'
      order by rel.relname, c.conname;
    `,
  });

  return rowsFromPayload(payload);
};

const buildCanonicalWorkspaceNormalizationSql = () => {
  const dropColumnSql = CANONICAL_EXTRA_USER_COLUMNS_TO_REMOVE.map(
    (columnName) =>
      `alter table public.${quoteIdent(CANONICAL_USERS_TABLE)} drop column if exists ${quoteIdent(columnName)};`,
  ).join('\n');

  const dropTableSql = CANONICAL_EXTRA_TABLES_TO_REMOVE.map(
    (tableName) => `drop table if exists public.${quoteIdent(tableName)} cascade;`,
  ).join('\n');

  return `begin;
${dropColumnSql}
${dropTableSql}

alter table public.app_4c3a7a6153_rental_km_packages
  alter column created_at set default now(),
  alter column updated_at set default now();

alter table public.app_687f658e98_maintenance_parts
  alter column created_at set default now(),
  alter column updated_at set default now();

alter table public.saharax_0u4w4d_inventory_items
  alter column reorder_level set default 0;

alter table public.saharax_0u4w4d_inventory_items
  alter column id drop identity if exists;

create sequence if not exists public.saharax_0u4w4d_inventory_items_id_seq;
alter table public.saharax_0u4w4d_inventory_items
  alter column id set default nextval('public.saharax_0u4w4d_inventory_items_id_seq'::regclass);
alter sequence public.saharax_0u4w4d_inventory_items_id_seq owned by public.saharax_0u4w4d_inventory_items.id;

alter table public.saharax_0u4w4d_vehicles
  alter column current_odometer set default 0;

alter table public.vehicle_fuel_refills
  drop column if exists total_cost;

alter table public.vehicle_fuel_refills
  add column total_cost numeric(10,2) generated always as (liters * price_per_liter) stored;

alter table public.app_687f658e98_activity_log
  alter column user_email set not null,
  alter column action set not null;

alter table public.app_b30c02e74da644baad4668e3587d86b1_users
  alter column access_enabled set not null,
  alter column permissions drop not null,
  alter column profile_verification_status set not null,
  alter column verification_summary set not null;

notify pgrst, 'reload schema';
commit;`;
};

const applyCanonicalWorkspaceForeignKeys = async ({ projectRef }) => {
  assertTenantTargetProjectRef({
    targetProjectRef: projectRef,
    operation: 'workspace-bootstrap-foreign-keys',
  });

  const canonicalProjectRef = getCanonicalProjectRef();
  if (canonicalProjectRef === projectRef) {
    return [];
  }

  const [sourceForeignKeys, targetForeignKeys] = await Promise.all([
    fetchPublicForeignKeys(canonicalProjectRef),
    fetchPublicForeignKeys(projectRef),
  ]);

  const targetConstraintNames = new Set(targetForeignKeys.map((row) => row.constraint_name));
  const missingConstraints = sourceForeignKeys.filter((row) => !targetConstraintNames.has(row.constraint_name));
  const appliedConstraintNames = [];

  for (const row of missingConstraints) {
    await runProjectManagementSql({
      projectRef,
      readOnly: false,
      query: `alter table public.${quoteIdent(row.table_name)} add constraint ${quoteIdent(row.constraint_name)} ${row.constraint_definition};`,
    });
    appliedConstraintNames.push(row.constraint_name);
  }

  if (appliedConstraintNames.length) {
    await runProjectManagementSql({
      projectRef,
      readOnly: false,
      query: `notify pgrst, 'reload schema';`,
    });
  }

  return appliedConstraintNames;
};

const applyCanonicalWorkspaceNormalization = async ({ projectRef }) => {
  assertTenantTargetProjectRef({
    targetProjectRef: projectRef,
    operation: 'workspace-bootstrap-normalization',
  });

  await runProjectManagementSql({
    projectRef,
    query: buildCanonicalWorkspaceNormalizationSql(),
    readOnly: false,
  });

  const appliedConstraintNames = await applyCanonicalWorkspaceForeignKeys({ projectRef });

  return {
    removedExtraTables: [...CANONICAL_EXTRA_TABLES_TO_REMOVE],
    removedExtraUserColumns: [...CANONICAL_EXTRA_USER_COLUMNS_TO_REMOVE],
    appliedConstraintNames,
    releaseId: CURRENT_TENANT_SCHEMA_RELEASE_ID,
    contractVersion: CANONICAL_WORKSPACE_CONTRACT_VERSION,
  };
};

const buildOwnerPermissionsSql = () => `jsonb_build_object(
  'Dashboard', true,
  'Fleet', true,
  'Rentals', true,
  'Customers', true,
  'Maintenance', true,
  'Team Tasks', true,
  'Fuel', true,
  'Pricing', true,
  'Inventory', true,
  'Finance', true,
  'Calendar', true,
  'Marketplace', true,
  'Settings', true
)`;

const buildOwnerPermissionsObject = () => ({
  Dashboard: true,
  Fleet: true,
  Rentals: true,
  Customers: true,
  Maintenance: true,
  'Team Tasks': true,
  Fuel: true,
  Pricing: true,
  Inventory: true,
  Finance: true,
  Calendar: true,
  Marketplace: true,
  Settings: true,
});

const buildWorkspaceRuntimeSeedSql = ({
  tenantName,
  tenantSlug,
  ownerAuthUserId,
  ownerEmail,
  ownerFullName,
  trialStartedAt,
  trialEndsAt,
} = {}) => {
  const ownerId = String(ownerAuthUserId || '').trim();
  const ownerEmailText = String(ownerEmail || '').trim();

  if (!ownerId || !ownerEmailText) {
    return '';
  }

  const safeTenantName = escapeSqlLiteral(tenantName || ownerFullName || ownerEmailText || 'Business Workspace');
  const safeTenantSlug = escapeSqlLiteral(slugify(tenantSlug || tenantName || ownerEmailText.split('@')[0], 'workspace'));
  const safeOwnerEmail = escapeSqlLiteral(ownerEmailText);
  const safeOwnerName = escapeSqlLiteral(ownerFullName || ownerEmailText);
  const safeOwnerId = escapeSqlLiteral(ownerId);
  const safeTrialStartedAt = trialStartedAt ? `'${escapeSqlLiteral(trialStartedAt)}'::timestamptz` : 'null';
  const safeTrialEndsAt = trialEndsAt ? `'${escapeSqlLiteral(trialEndsAt)}'::timestamptz` : 'null';

  return `
do $bootstrap_owner$
declare
  owner_uuid uuid := '${safeOwnerId}'::uuid;
  owner_email text := '${safeOwnerEmail}';
  owner_name text := '${safeOwnerName}';
  workspace_name text := '${safeTenantName}';
  workspace_slug_base text := '${safeTenantSlug}';
  workspace_slug text;
  tenant_org_id uuid;
  platform_org_id uuid;
begin
  workspace_slug := left(workspace_slug_base, 42) || '-' || left(replace(owner_uuid::text, '-', ''), 8);

  insert into public.app_b30c02e74da644baad4668e3587d86b1_users (
    id,
    email,
    full_name,
    role,
    permissions,
    verification_status,
    trial_started_at,
    trial_ends_at,
    created_at,
    updated_at
  )
  values (
    owner_uuid,
    owner_email,
    owner_name,
    'owner'::public.user_role,
    ${buildOwnerPermissionsSql()},
    'approved'::public.driveout_verification_status,
    ${safeTrialStartedAt},
    ${safeTrialEndsAt},
    now(),
    now()
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(nullif(excluded.full_name, ''), public.app_b30c02e74da644baad4668e3587d86b1_users.full_name),
    role = 'owner'::public.user_role,
    permissions = ${buildOwnerPermissionsSql()} || coalesce(public.app_b30c02e74da644baad4668e3587d86b1_users.permissions, '{}'::jsonb),
    verification_status = 'approved'::public.driveout_verification_status,
    trial_started_at = coalesce(public.app_b30c02e74da644baad4668e3587d86b1_users.trial_started_at, ${safeTrialStartedAt}),
    trial_ends_at = coalesce(public.app_b30c02e74da644baad4668e3587d86b1_users.trial_ends_at, ${safeTrialEndsAt}),
    updated_at = now();

  insert into public.app_organizations (
    name,
    slug,
    owner_user_id,
    organization_type,
    organization_status,
    is_platform_organization
  )
  values (
    workspace_name,
    workspace_slug,
    owner_uuid,
    'business_tenant',
    'active',
    false
  )
  on conflict (slug) do update
  set
    name = excluded.name,
    owner_user_id = excluded.owner_user_id,
    updated_at = now()
  returning id into tenant_org_id;

  update public.app_b30c02e74da644baad4668e3587d86b1_users
  set
    primary_organization_id = tenant_org_id,
    updated_at = now()
  where id = owner_uuid;

  insert into public.app_organization_members (
    organization_id,
    user_id,
    member_role,
    membership_status,
    created_at,
    updated_at
  )
  values (
    tenant_org_id,
    owner_uuid,
    'org_owner',
    'active',
    now(),
    now()
  )
  on conflict (organization_id, user_id) do update
  set
    member_role = 'org_owner',
    membership_status = 'active',
    updated_at = now();

  select id
  into platform_org_id
  from public.app_organizations
  where slug = 'driveout-platform'
  limit 1;

  if platform_org_id is not null then
    delete from public.app_organization_members
    where organization_id = platform_org_id
      and user_id = owner_uuid;
  end if;
end;
$bootstrap_owner$;

notify pgrst, 'reload schema';
`;
};

export const getCanonicalBusinessWorkspaceBootstrapSteps = () => (
  LEGACY_WORKSPACE_SQL_STEPS.map((step) => ({
    ...step,
    sql: readSqlFile(step.relativePath),
  }))
);

export const applyCanonicalBusinessWorkspaceSchema = async ({
  projectRef,
} = {}) => {
  const normalizedProjectRef = String(projectRef || '').trim();
  if (!normalizedProjectRef) {
    throw new Error('Tenant project reference is required for workspace bootstrap');
  }

  assertTenantTargetProjectRef({
    targetProjectRef: normalizedProjectRef,
    operation: 'workspace-bootstrap-schema',
  });

  const executedSteps = [];
  for (const step of getCanonicalBusinessWorkspaceBootstrapSteps()) {
    await runProjectManagementSql({
      projectRef: normalizedProjectRef,
      query: step.sql,
      readOnly: false,
    });
    executedSteps.push(step.name);
  }

  const normalization = await applyCanonicalWorkspaceNormalization({
    projectRef: normalizedProjectRef,
  });
  executedSteps.push('canonical_workspace_normalization');

  return {
    projectRef: normalizedProjectRef,
    bootstrapMode: 'canonical_exact_clone',
    releaseId: CURRENT_TENANT_SCHEMA_RELEASE_ID,
    contractVersion: CANONICAL_WORKSPACE_CONTRACT_VERSION,
    executedSteps,
    normalization,
  };
};

export const seedCanonicalBusinessWorkspaceRuntime = async ({
  projectRef,
  tenantName,
  tenantSlug,
  ownerAuthUserId,
  ownerEmail,
  ownerFullName,
  trialStartedAt,
  trialEndsAt,
} = {}) => {
  const normalizedProjectRef = String(projectRef || '').trim();
  if (!normalizedProjectRef) {
    throw new Error('Tenant project reference is required for workspace bootstrap');
  }

  assertTenantTargetProjectRef({
    targetProjectRef: normalizedProjectRef,
    operation: 'workspace-runtime-seed',
  });

  const runtimeSeedSql = buildWorkspaceRuntimeSeedSql({
    tenantName,
    tenantSlug,
    ownerAuthUserId,
    ownerEmail,
    ownerFullName,
    trialStartedAt,
    trialEndsAt,
  });

  if (runtimeSeedSql) {
    await runProjectManagementSql({
      projectRef: normalizedProjectRef,
      query: runtimeSeedSql,
      readOnly: false,
    });
  }

  return {
    projectRef: normalizedProjectRef,
    runtimeSeeded: Boolean(runtimeSeedSql),
    runtimeSeedMode: 'owner_org_permissions_trial_only',
  };
};

export const seedSharedBusinessWorkspaceRuntime = async ({
  adminClient,
  tenantName,
  tenantSlug,
  ownerAuthUserId,
  ownerEmail,
  ownerFullName,
  trialStartedAt,
  trialEndsAt,
} = {}) => {
  const ownerId = String(ownerAuthUserId || '').trim();
  const ownerEmailText = String(ownerEmail || '').trim();

  if (!adminClient) {
    throw new Error('Admin client is required for shared workspace runtime seed');
  }

  if (!ownerId || !ownerEmailText) {
    return {
      runtimeSeeded: false,
      runtimeSeedMode: 'shared_platform_project',
      organizationId: null,
    };
  }

  const workspaceName = String(tenantName || ownerFullName || ownerEmailText || 'Business Workspace').trim();
  const ownerName = String(ownerFullName || ownerEmailText).trim() || ownerEmailText;
  const workspaceSlugBase = slugify(tenantSlug || tenantName || ownerEmailText.split('@')[0], 'workspace');
  const workspaceSlug = `${workspaceSlugBase.slice(0, 42)}-${ownerId.replace(/-/g, '').slice(0, 8)}`;
  const ownerPermissions = buildOwnerPermissionsObject();

  const userPayload = {
    id: ownerId,
    email: ownerEmailText,
    full_name: ownerName,
    role: 'owner',
    permissions: ownerPermissions,
    verification_status: 'approved',
    updated_at: new Date().toISOString(),
  };

  if (trialStartedAt) userPayload.trial_started_at = trialStartedAt;
  if (trialEndsAt) userPayload.trial_ends_at = trialEndsAt;

  const { error: userUpsertError } = await adminClient
    .from(APP_USERS_TABLE)
    .upsert(userPayload, { onConflict: 'id' });

  if (userUpsertError) throw userUpsertError;

  const { data: organization, error: organizationError } = await adminClient
    .from(ORGANIZATIONS_TABLE)
    .upsert({
      name: workspaceName,
      slug: workspaceSlug,
      owner_user_id: ownerId,
      organization_type: 'business_tenant',
      organization_status: 'active',
      is_platform_organization: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'slug' })
    .select('id')
    .single();

  if (organizationError) throw organizationError;

  const organizationId = organization?.id || null;
  if (!organizationId) {
    throw new Error('Shared workspace organization could not be resolved');
  }

  const { error: primaryOrganizationError } = await adminClient
    .from(APP_USERS_TABLE)
    .update({
      primary_organization_id: organizationId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ownerId);

  if (primaryOrganizationError) throw primaryOrganizationError;

  const { error: membershipError } = await adminClient
    .from(ORGANIZATION_MEMBERS_TABLE)
    .upsert({
      organization_id: organizationId,
      user_id: ownerId,
      member_role: 'org_owner',
      membership_status: 'active',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,user_id' });

  if (membershipError) throw membershipError;

  const { data: platformOrganization, error: platformOrganizationError } = await adminClient
    .from(ORGANIZATIONS_TABLE)
    .select('id')
    .eq('slug', 'driveout-platform')
    .maybeSingle();

  if (platformOrganizationError) throw platformOrganizationError;

  if (platformOrganization?.id) {
    const { error: cleanupMembershipError } = await adminClient
      .from(ORGANIZATION_MEMBERS_TABLE)
      .delete()
      .eq('organization_id', platformOrganization.id)
      .eq('user_id', ownerId);

    if (cleanupMembershipError) throw cleanupMembershipError;
  }

  return {
    runtimeSeeded: true,
    runtimeSeedMode: 'shared_platform_project',
    organizationId,
    organizationSlug: workspaceSlug,
  };
};

export const applyCanonicalBusinessWorkspaceBootstrap = async ({
  projectRef,
  tenantName,
  tenantSlug,
  ownerAuthUserId,
  ownerEmail,
  ownerFullName,
  trialStartedAt,
  trialEndsAt,
} = {}) => {
  const schema = await applyCanonicalBusinessWorkspaceSchema({
    projectRef,
  });

  const runtime = await seedCanonicalBusinessWorkspaceRuntime({
    projectRef,
    tenantName,
    tenantSlug,
    ownerAuthUserId,
    ownerEmail,
    ownerFullName,
    trialStartedAt,
    trialEndsAt,
  });

  return {
    ...schema,
    ownerSeeded: runtime.runtimeSeeded,
    runtime,
  }
};

export const getLegacyBusinessWorkspaceBootstrapSteps = getCanonicalBusinessWorkspaceBootstrapSteps;
export const applyLegacyBusinessWorkspaceBootstrap = applyCanonicalBusinessWorkspaceBootstrap;
