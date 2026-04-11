import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const get = (k) => {
  const m = env.match(new RegExp('^' + k + '=\\"?([^\\n\\"]+)', 'm'));
  return m && m[1];
};
const supabase = createClient(get('VITE_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'));
for (const name of ['vehicle_fuel_refills', 'fuel_withdrawals', 'vehicle_fuel_state']) {
  const { data, error } = await supabase.rpc('list_columns', { table_param: name });
  console.log(JSON.stringify({ table: name, error: error && { message: error.message, details: error.details, code: error.code, hint: error.hint }, data }, null, 2));
}
