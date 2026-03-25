import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.trim() === '' || supabaseAnonKey.trim() === '') {
  throw new Error('Supabase configuration error: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
    storageKey: 'supabase.auth.token',
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
      'x-application-name': 'rental-management-system',
    },
  },
});

if (import.meta.env.DEV) {
  console.log('🔧 Supabase Client Initialized:', {
    regularClient: !!supabase,
    url: supabaseUrl.slice(0, 30) + '...',
  });
}

export default supabase;
