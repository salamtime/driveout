import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
const get = (k) => {
  const line = env.split(/\n/).find((l) => l.startsWith(k + '='));
  return line ? line.slice(k.length + 1).replace(/^"|"$/g, '') : '';
};
const url = get('VITE_SUPABASE_URL') || get('SUPABASE_URL');
const anon = get('VITE_SUPABASE_ANON_KEY');
const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
const names = ['profiles','users_with_permission_count','user_permissions_test','app_b30c02e74da644baad4668e3587d86b1_user_access_log','user_profiles'];
for (const name of names) {
  const { data, error } = await client.from(name).select('*').limit(1);
  console.log(JSON.stringify({ name, error: error && { message: error.message, details: error.details, hint: error.hint, code: error.code }, keys: data?.[0] ? Object.keys(data[0]).sort() : [], sample: data?.[0] || null }, null, 2));
}
