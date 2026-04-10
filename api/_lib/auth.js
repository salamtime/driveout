import { createClient } from '@supabase/supabase-js';
import { APP_USERS_TABLE, createSupabaseClients } from './supabase.js';

const PLATFORM_OWNER_EMAILS = new Set(['salamtime2016@gmail.com']);
const isPlatformOwnerEmail = (email = '') =>
  PLATFORM_OWNER_EMAILS.has(String(email || '').trim().toLowerCase());

const getAuthHeader = (req) => req.headers.authorization || req.headers.Authorization;

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

const decodeJwtPayload = (token) => {
  if (!token) return null;
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'));
  } catch {
    return null;
  }
};

const getProjectUrlFromJwt = (token) => {
  const projectRef = extractProjectRefFromJwt(token);
  return projectRef ? `https://${projectRef}.supabase.co` : null;
};

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

    const authUrls = [
      publicSupabaseUrl,
      getProjectUrlFromJwt(token),
    ].filter(Boolean);

    const uniqueAuthUrls = [...new Set(authUrls)];
    let data = null;
    let error = null;

    for (const authUrl of uniqueAuthUrls) {
      const authClient = createClient(authUrl, publicSupabaseAnonKey, {
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

      const result = await authClient.auth.getUser(token);
      data = result.data;
      error = result.error;

      if (data?.user && !error) {
        break;
      }
    }

    if (error || !data?.user) {
      const tokenPayload = decodeJwtPayload(token);
      const expiresAt = Number(tokenPayload?.exp || 0);
      const isExpired = !expiresAt || expiresAt * 1000 <= Date.now();

      if (!tokenPayload?.sub || isExpired) {
        return {
          error: { status: 401, body: { error: 'Invalid or expired session' } },
        };
      }

      const tokenProjectRef = tokenPayload?.ref || null;
      const serviceProjectRef = extractProjectRefFromJwt(process.env.SUPABASE_SERVICE_ROLE_KEY);

      if (tokenProjectRef && serviceProjectRef && tokenProjectRef !== serviceProjectRef) {
        return {
          error: { status: 401, body: { error: 'Session does not belong to this Supabase project' } },
        };
      }

      const adminUserResult = await adminClient.auth.admin.getUserById(tokenPayload.sub);

      if (adminUserResult.error || !adminUserResult.data?.user) {
        return {
          error: { status: 401, body: { error: 'Invalid or expired session' } },
        };
      }

      data = { user: adminUserResult.data.user };
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

    if (effectiveRole !== 'owner' && !isPlatformOwnerEmail(user?.email)) {
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

export const requireOwnerOrAdmin = async (req) => {
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

    const effectiveRole = String(profile?.role || user.user_metadata?.role || user.app_metadata?.role || '').trim().toLowerCase();
    if (!['owner', 'admin'].includes(effectiveRole) && !isPlatformOwnerEmail(user?.email)) {
      return {
        error: { status: 403, body: { error: 'Owner or admin access required' } },
      };
    }

    return { user, adminClient };
  } catch (error) {
    return {
      error: { status: 500, body: { error: error.message } },
    };
  }
};
