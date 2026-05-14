import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.trim() === '' || supabaseAnonKey.trim() === '') {
  throw new Error('Supabase configuration error: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set.');
}

const getHostname = () => {
  if (typeof window === 'undefined') return 'server';
  return String(window.location.hostname || 'local').toLowerCase();
};

const getPort = () => {
  if (typeof window === 'undefined') return '';
  return String(window.location.port || '').trim();
};

const LOCAL_TENANT_PORT_MAP = Object.freeze({
  '5174': 'offroad',
});

const buildHostStorageScope = () => {
  const hostname = getHostname();
  const port = getPort();
  return hostname === 'localhost' || hostname === '127.0.0.1'
    ? `${hostname}:${port || 'default'}`
    : hostname;
};

const isTenantHostname = () => {
  const hostname = getHostname();
  const port = getPort();
  if ((hostname === 'localhost' || hostname === '127.0.0.1') && LOCAL_TENANT_PORT_MAP[port]) {
    return true;
  }
  return hostname.endsWith('.driveout.io') && !['www.driveout.io', 'admin.driveout.io', 'app.driveout.io'].includes(hostname);
};

const buildStorageKey = ({ projectRef = 'master', hostname = buildHostStorageScope() } = {}) =>
  `driveout.auth.${hostname}.${projectRef || 'workspace'}`;

const createSupabaseClient = ({ url, anonKey, storageKey, applicationName = 'rental-management-system' }) =>
  createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      storageKey,
      flowType: 'pkce',
      debug: false,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
    global: {
      headers: {
        'x-application-name': applicationName,
      },
    },
  });

const shutdownSupabaseClient = (client) => {
  if (!client) return;

  try {
    const channels = typeof client.getChannels === 'function' ? client.getChannels() : [];
    channels.forEach((channel) => {
      try {
        client.removeChannel(channel);
      } catch {
        // Ignore channel cleanup failures during client swap.
      }
    });
  } catch {
    // Ignore channel enumeration failures during client swap.
  }

  try {
    client.realtime?.disconnect?.();
  } catch {
    // Ignore realtime disconnect failures during client swap.
  }
};

const masterConfig = {
  mode: 'master',
  url: supabaseUrl,
  anonKey: supabaseAnonKey,
  projectRef: 'master',
  storageKey: buildStorageKey({ projectRef: 'master' }),
};

let activeConfig = masterConfig;
let activeClient = isTenantHostname()
  ? null
  : createSupabaseClient({
      url: masterConfig.url,
      anonKey: masterConfig.anonKey,
      storageKey: masterConfig.storageKey,
    });

export const configureSupabaseClient = ({
  mode = 'tenant',
  url,
  anonKey,
  projectRef = '',
  appUrl = '',
} = {}) => {
  const normalizedUrl = String(url || '').trim();
  const normalizedAnonKey = String(anonKey || '').trim();
  const normalizedProjectRef = String(projectRef || '').trim() || 'tenant';

  if (!normalizedUrl || !normalizedAnonKey) {
    throw new Error('Tenant Supabase configuration is incomplete.');
  }

  shutdownSupabaseClient(activeClient);

  activeConfig = {
    mode,
    url: normalizedUrl,
    anonKey: normalizedAnonKey,
    projectRef: normalizedProjectRef,
    appUrl,
    storageKey: buildStorageKey({ projectRef: normalizedProjectRef }),
  };
  activeClient = createSupabaseClient({
    url: activeConfig.url,
    anonKey: activeConfig.anonKey,
    storageKey: activeConfig.storageKey,
    applicationName: mode === 'tenant' ? 'driveout-tenant-workspace' : 'rental-management-system',
  });

  return activeClient;
};

export const configureMasterSupabaseClient = () => {
  if (activeClient && activeConfig.mode === 'master') return activeClient;
  shutdownSupabaseClient(activeClient);
  activeConfig = masterConfig;
  activeClient = createSupabaseClient({
    url: masterConfig.url,
    anonKey: masterConfig.anonKey,
    storageKey: masterConfig.storageKey,
  });
  return activeClient;
};

export const getSupabaseClientConfig = () => ({ ...activeConfig, anonKey: activeConfig.anonKey ? '[redacted]' : '' });

export const getActiveSupabaseClient = () => {
  if (!activeClient) {
    throw new Error('Tenant workspace is still loading. Supabase is not configured for this host yet.');
  }

  return activeClient;
};

export const supabase = new Proxy({}, {
  get(_target, prop) {
    const client = getActiveSupabaseClient();
    const value = client[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

if (import.meta.env.DEV) {
  console.log('🔧 Supabase Client Initialized:', {
    regularClient: !isTenantHostname(),
    mode: activeConfig.mode,
    url: activeConfig.url.slice(0, 30) + '...',
  });
}

export default supabase;
