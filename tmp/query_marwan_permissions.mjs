import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env.local', 'utf8');
const get = (key) => {
  const line = env.split(/\n/).find((entry) => entry.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).replace(/^"|"$/g, '') : '';
};

const supabase = createClient(
  get('VITE_SUPABASE_URL'),
  get('SUPABASE_SERVICE_ROLE_KEY') || get('VITE_SUPABASE_ANON_KEY')
);

const email = 'marwan@gmail.com';

const { data: userRow, error: userError } = await supabase
  .from('app_b30c02e74da644baad4668e3587d86b1_users')
  .select('id, email, full_name, role, access_enabled, permissions, updated_at')
  .ilike('email', email)
  .maybeSingle();

let rpcData = null;
let rpcError = null;

if (userRow?.id) {
  const response = await supabase.rpc('get_user_effective_permissions', {
    v_user_id: userRow.id,
  });
  rpcData = response.data;
  rpcError = response.error;
}

console.log(JSON.stringify({
  userError,
  userRow,
  rpcError,
  rpcData,
}, null, 2));
