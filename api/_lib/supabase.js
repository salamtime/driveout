import { createClient } from '@supabase/supabase-js';

export const APP_USERS_TABLE = 'app_b30c02e74da644baad4668e3587d86b1_users';
export const AUDIT_LOG_TABLE = process.env.AUDIT_LOG_TABLE || 'saharax_0u4w4d_audit_log';

const getRequiredEnv = (key, fallbackKey = null) => {
  const value = process.env[key] || (fallbackKey ? process.env[fallbackKey] : undefined);

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}${fallbackKey ? ` or ${fallbackKey}` : ''}`);
  }

  return value;
};

export const createSupabaseClients = () => {
  const supabaseUrl = getRequiredEnv('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const supabaseAnonKey = getRequiredEnv('VITE_SUPABASE_ANON_KEY');
  const supabaseServiceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');

  const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  return { anonClient, adminClient };
};
