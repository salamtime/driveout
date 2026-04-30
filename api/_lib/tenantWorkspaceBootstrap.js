import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

const buildOwnerSeedSql = ({
  tenantName,
  tenantSlug,
  ownerAuthUserId,
  ownerEmail,
  ownerFullName,
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
    plan_type,
    billing_status,
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
    'pro'::public.driveout_plan_type,
    'active'::public.driveout_billing_status,
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
    plan_type = 'pro'::public.driveout_plan_type,
    billing_status = 'active'::public.driveout_billing_status,
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

export const getLegacyBusinessWorkspaceBootstrapSteps = () => (
  LEGACY_WORKSPACE_SQL_STEPS.map((step) => ({
    ...step,
    sql: readSqlFile(step.relativePath),
  }))
);

export const applyLegacyBusinessWorkspaceBootstrap = async ({
  projectRef,
  tenantName,
  tenantSlug,
  ownerAuthUserId,
  ownerEmail,
  ownerFullName,
} = {}) => {
  const normalizedProjectRef = String(projectRef || '').trim();
  if (!normalizedProjectRef) {
    throw new Error('Tenant project reference is required for workspace bootstrap');
  }

  const executedSteps = [];
  for (const step of getLegacyBusinessWorkspaceBootstrapSteps()) {
    await runProjectManagementSql({
      projectRef: normalizedProjectRef,
      query: step.sql,
      readOnly: false,
    });
    executedSteps.push(step.name);
  }

  const ownerSeedSql = buildOwnerSeedSql({
    tenantName,
    tenantSlug,
    ownerAuthUserId,
    ownerEmail,
    ownerFullName,
  });

  if (ownerSeedSql) {
    await runProjectManagementSql({
      projectRef: normalizedProjectRef,
      query: ownerSeedSql,
      readOnly: false,
    });
    executedSteps.push('legacy_workspace_owner_seed');
  }

  return {
    projectRef: normalizedProjectRef,
    executedSteps,
    ownerSeeded: Boolean(ownerSeedSql),
  };
};
