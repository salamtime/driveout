import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
const get = (k) => {
  const line = env.split(/\n/).find((l) => l.startsWith(k + '='));
  return line ? line.slice(k.length + 1).replace(/^"|"$/g, '') : '';
};
const url = get('VITE_SUPABASE_URL') || get('SUPABASE_URL');
const key = get('SUPABASE_SERVICE_ROLE_KEY');
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const queries = [
  { name: 'tables_no_rls', sql: "select schemaname, tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename;" },
  { name: 'views_public', sql: "select schemaname, viewname, definition from pg_views where schemaname = 'public' order by viewname;" },
  { name: 'policies', sql: "select schemaname, tablename, policyname, roles, cmd, qual, with_check from pg_policies where schemaname = 'public' order by tablename, policyname;" },
  { name: 'sensitive_candidates', sql: "select table_schema, table_name, column_name from information_schema.columns where table_schema = 'public' and (column_name ilike '%password%' or column_name ilike '%email%' or column_name ilike '%phone%' or column_name ilike '%token%' or column_name ilike '%secret%' or column_name ilike '%license%' or column_name ilike '%passport%' or column_name ilike '%raw_user_meta_data%' or column_name ilike '%identit%') order by table_name, column_name;" },
  { name: 'view_auth_refs', sql: "select schemaname, viewname, definition from pg_views where schemaname = 'public' and definition ilike '%auth.users%';" },
  { name: 'users_tables', sql: "select table_schema, table_name from information_schema.tables where table_schema='public' and (table_name ilike '%user%' or table_name ilike '%profile%') order by table_name;" }
];
for (const q of queries) {
  const { data, error } = await supabase.rpc('exec', { sql: q.sql });
  console.log(JSON.stringify({ name: q.name, error: error && { message: error.message, details: error.details, hint: error.hint, code: error.code }, data }, null, 2));
}
