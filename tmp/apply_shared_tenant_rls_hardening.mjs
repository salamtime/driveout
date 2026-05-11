import { config as loadEnv } from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';

loadEnv({ path: '.env.local', override: false });
loadEnv({ path: '.env.vercel.prod', override: false });

const MANAGEMENT_API = 'https://api.supabase.com/v1';
const projectUrl = String(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
const token = String(process.env.SUPABASE_MANAGEMENT_TOKEN || '').trim();

if (!projectUrl) {
  throw new Error('Missing VITE_SUPABASE_URL/SUPABASE_URL');
}

if (!token) {
  throw new Error('Missing SUPABASE_MANAGEMENT_TOKEN');
}

const targetProjectRef = new URL(projectUrl).hostname.split('.')[0];
const migrationPath = path.resolve('src/migrations/harden_shared_tenant_data_rls.sql');
const migrationSql = await fs.readFile(migrationPath, 'utf8');

const readResponse = async (response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

const runSql = async (query, readOnly = false) => {
  const response = await fetch(`${MANAGEMENT_API}/projects/${targetProjectRef}/database/query`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query, read_only: readOnly }),
  });

  const payload = await readResponse(response);
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || payload?.raw || `Query failed: ${response.status}`);
  }

  return Array.isArray(payload) ? payload : payload.data || payload.result || payload.rows || [];
};

await runSql(migrationSql);

const verification = await runSql(`
with function_checks as (
  select routine_name as item_name, 'function' as item_type
  from information_schema.routines
  where routine_schema = 'public'
    and routine_name in (
      'app_has_current_organization_access_text',
      'app_can_manage_current_organization_text'
    )
),
table_rls_checks as (
  select
    c.relname as item_name,
    'table' as item_type
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in (
      'app_4c3a7a6153_rentals',
      'app_4c3a7a6153_receive_funds_entries',
      'finance_expenses',
      'app_4c3a7a6153_team_tasks'
    )
    and c.relrowsecurity = true
    and c.relforcerowsecurity = true
),
policy_checks as (
  select policyname as item_name, 'policy' as item_type
  from pg_policies
  where schemaname = 'public'
    and (
      (tablename = 'app_4c3a7a6153_rentals' and policyname = 'shared tenant select app_4c3a7a6153_rentals')
      or (tablename = 'app_4c3a7a6153_receive_funds_entries' and policyname = 'shared tenant select app_4c3a7a6153_receive_funds_entries')
      or (tablename = 'finance_expenses' and policyname = 'shared tenant select finance_expenses')
      or (tablename = 'app_4c3a7a6153_team_tasks' and policyname = 'shared tenant select app_4c3a7a6153_team_tasks')
    )
)
select * from function_checks
union all
select * from table_rls_checks
union all
select * from policy_checks
order by item_type, item_name;
`, true);

console.log(JSON.stringify({
  targetProjectRef,
  migrationPath,
  verification,
}, null, 2));
