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
for (const table of ['user_profiles']) {
  const { data, error } = await client.from(table).select('*').limit(1);
  console.log(JSON.stringify({ table, error: error && { message: error.message, details: error.details, hint: error.hint, code: error.code }, sampleKeys: data?.[0] ? Object.keys(data[0]).sort() : [], sample: data?.[0] || null }, null, 2));
}
