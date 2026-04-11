import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
const get = (k) => {
  const line = env.split(/\n/).find((l) => l.startsWith(k + '='));
  return line ? line.slice(k.length + 1).replace(/^"|"$/g, '') : '';
};
const url = get('VITE_SUPABASE_URL') || get('SUPABASE_URL');
const anon = get('VITE_SUPABASE_ANON_KEY');
const service = get('SUPABASE_SERVICE_ROLE_KEY');
const anonClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
const serviceClient = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
const tables = [
  'users',
  'profiles',
  'user_profiles',
  'app_b30c02e74da644baad4668e3587d86b1_users',
  'app_4c3a7a6153_users',
  'app_user_accounts'
];
for (const table of tables) {
  const { data, error } = await anonClient.from(table).select('*').limit(1);
  console.log(JSON.stringify({ kind: 'table_probe', table, anonError: error && { message: error.message, details: error.details, hint: error.hint, code: error.code }, sampleKeys: data?.[0] ? Object.keys(data[0]).sort() : [], sample: data?.[0] || null }, null, 2));
}
const user = await serviceClient.auth.admin.listUsers({ page: 1, perPage: 1 });
console.log(JSON.stringify({ kind: 'auth_admin_probe', error: user.error && { message: user.error.message, details: user.error.details, hint: user.error.hint, code: user.error.code }, sampleUserKeys: user.data?.users?.[0] ? Object.keys(user.data.users[0]).sort() : [] }, null, 2));
