import { createClient } from '@supabase/supabase-js';
import { APP_USERS_TABLE, createSupabaseClients } from './supabase.js';

const getAuthHeader = (req) => req.headers.authorization || req.headers.Authorization;

export const getBearerToken = (req) => {
  const authHeader = getAuthHeader(req);

  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.slice('Bearer '.length).trim();
};

export const authenticateRequest = async (req) => {
  const token = getBearerToken(req);

  if (!token) {
    return {
      error: { status: 401, body: { error: 'Missing bearer token' } },
    };
  }

  try {
    const { anonClient, adminClient } = createSupabaseClients();
    const publicSupabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const publicSupabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    const authClient = createClient(publicSupabaseUrl, publicSupabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const { data, error } = await authClient.auth.getUser(token);

    if (error || !data?.user) {
      return {
        error: { status: 401, body: { error: 'Invalid or expired session' } },
      };
    }

    const userClient = createClient(publicSupabaseUrl, publicSupabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    return { user: data.user, adminClient, userClient };
  } catch (error) {
    return {
      error: { status: 500, body: { error: error.message } },
    };
  }
};

export const requireOwner = async (req) => {
  const auth = await authenticateRequest(req);

  if (auth.error) {
    return auth;
  }

  const { user, adminClient } = auth;

  try {
    const { data: profile } = await adminClient
      .from(APP_USERS_TABLE)
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    const effectiveRole = profile?.role || user.user_metadata?.role;

    if (effectiveRole !== 'owner') {
      return {
        error: { status: 403, body: { error: 'Owner access required' } },
      };
    }

    return { user, adminClient };
  } catch (error) {
    return {
      error: { status: 500, body: { error: error.message } },
    };
  }
};
