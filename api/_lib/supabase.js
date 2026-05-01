import { createClient } from '@supabase/supabase-js';

export const APP_USERS_TABLE = 'app_b30c02e74da644baad4668e3587d86b1_users';
export const AUDIT_LOG_TABLE = process.env.AUDIT_LOG_TABLE || 'saharax_0u4w4d_audit_log';
export const VEHICLES_TABLE = 'saharax_0u4w4d_vehicles';
export const VERIFICATION_REQUESTS_TABLE = 'verification_requests';
export const VERIFICATION_EVENTS_TABLE = 'verification_events';
export const VERIFICATION_DOCUMENTS_BUCKET = 'verification-documents';
export const SHARED_MESSAGES_TABLE = 'shared_messages';
export const SHARED_MESSAGE_MEDIA_TABLE = 'shared_message_media';
export const ORGANIZATIONS_TABLE = 'app_organizations';
export const ORGANIZATION_MEMBERS_TABLE = 'app_organization_members';
export const PLATFORM_BUSINESS_ACCOUNTS_TABLE = 'platform_business_accounts';
export const PLATFORM_ADMIN_ACCOUNTS_TABLE = 'platform_admin_accounts';
export const PLATFORM_TENANTS_TABLE = 'platform_tenants';
export const PLATFORM_BUSINESS_SUBSCRIPTIONS_TABLE = 'platform_business_subscriptions';
export const PLATFORM_TENANT_PROVISIONING_JOBS_TABLE = 'platform_tenant_provisioning_jobs';
export const PLATFORM_TENANT_AUDIT_LOG_TABLE = 'platform_tenant_audit_log';
export const PLATFORM_TENANT_WORKSPACE_POOL_TABLE = 'platform_tenant_workspace_pool';

const getRequiredEnv = (key, fallbackKey = null) => {
  const value = process.env[key] || (fallbackKey ? process.env[fallbackKey] : undefined);

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}${fallbackKey ? ` or ${fallbackKey}` : ''}`);
  }

  return value;
};

const extractProjectRefFromUrl = (url) => {
  if (!url) return null;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (!hostname.endsWith('.supabase.co')) {
      return null;
    }
    return hostname.split('.')[0] || null;
  } catch {
    return null;
  }
};

const extractProjectRefFromJwt = (token) => {
  if (!token) return null;
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'));
    return json?.ref || null;
  } catch {
    return null;
  }
};

const assertMatchingSupabaseProject = ({ publicUrl, serverUrl, anonKey, serviceRoleKey }) => {
  const publicRef = extractProjectRefFromUrl(publicUrl);
  const serverRef = extractProjectRefFromUrl(serverUrl);
  const anonRef = extractProjectRefFromJwt(anonKey);
  const serviceRef = extractProjectRefFromJwt(serviceRoleKey);

  const refs = [
    ['VITE_SUPABASE_URL project ref', publicRef],
    ['SUPABASE_URL project ref', serverRef],
    ['VITE_SUPABASE_ANON_KEY', anonRef],
    ['SUPABASE_SERVICE_ROLE_KEY', serviceRef],
  ].filter(([, value]) => Boolean(value));

  const uniqueRefs = [...new Set(refs.map(([, value]) => value))];

  if (uniqueRefs.length > 1) {
    const detail = refs.map(([key, value]) => `${key}=${value}`).join(', ');
    throw new Error(`Supabase key/project mismatch detected: ${detail}. Custom auth domains are allowed; this error only means the configured Supabase keys or *.supabase.co project refs do not point to the same project.`);
  }
};

export const createSupabaseClients = () => {
  const publicSupabaseUrl = getRequiredEnv('VITE_SUPABASE_URL', 'SUPABASE_URL');
  const supabaseUrl = process.env.SUPABASE_URL || publicSupabaseUrl;
  const supabaseAnonKey = getRequiredEnv('VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY');
  const supabaseServiceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');

  assertMatchingSupabaseProject({
    publicUrl: publicSupabaseUrl,
    serverUrl: supabaseUrl,
    anonKey: supabaseAnonKey,
    serviceRoleKey: supabaseServiceRoleKey,
  });

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
