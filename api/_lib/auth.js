import { createClient } from '@supabase/supabase-js';
import { APP_USERS_TABLE, PLATFORM_ADMIN_ACCOUNTS_TABLE, createSupabaseClients } from './supabase.js';

const PLATFORM_OWNER_EMAILS = new Set(['salamtime2016@gmail.com']);
const PLATFORM_ADMIN_EMAILS = new Set([]);
const isPlatformOwnerEmail = (email = '') =>
  PLATFORM_OWNER_EMAILS.has(String(email || '').trim().toLowerCase());
const isPlatformAdminEmail = (email = '') =>
  PLATFORM_ADMIN_EMAILS.has(String(email || '').trim().toLowerCase());

const resolvePermissionsMap = (value) => {
  if (!value) return {};
  if (Array.isArray(value)) {
    return value.reduce((acc, permission) => {
      if (!permission?.module_name) return acc;
      acc[permission.module_name] = permission.has_access === true;
      return acc;
    }, {});
  }
  if (typeof value === 'object') {
    return value;
  }
  return {};
};

const isPlatformAccessTableUnavailable = (error) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  const details = String(error?.details || '').toLowerCase();

  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    code === 'PGRST204' ||
    message.includes('does not exist') ||
    message.includes('schema cache') ||
    details.includes('schema cache')
  );
};

const loadPlatformAccessRecord = async (adminClient, user) => {
  if (!user?.id) {
    return null;
  }

  const { data, error } = await adminClient
    .from(PLATFORM_ADMIN_ACCOUNTS_TABLE)
    .select('*')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (error) {
    if (isPlatformAccessTableUnavailable(error)) {
      return null;
    }
    throw error;
  }

  return data || null;
};

export const resolvePlatformAccessContext = async (adminClient, user) => {
  const normalizedEmail = String(user?.email || '').trim().toLowerCase();
  const record = await loadPlatformAccessRecord(adminClient, user);
  const recordPermissions = resolvePermissionsMap(record?.permissions);
  const roleFromRecord = String(record?.platform_role || '').trim().toLowerCase();
  const accessEnabled = record ? record.access_enabled !== false : true;
  const isOwner =
    accessEnabled &&
    (roleFromRecord === 'platform_owner' || isPlatformOwnerEmail(normalizedEmail));
  const isAdmin =
    accessEnabled &&
    (
      roleFromRecord === 'platform_owner' ||
      roleFromRecord === 'platform_admin' ||
      isPlatformOwnerEmail(normalizedEmail) ||
      isPlatformAdminEmail(normalizedEmail)
    );

  return {
    record,
    permissions: recordPermissions,
    accessEnabled,
    isPlatformOwner: isOwner,
    isPlatformAdmin: isAdmin,
  };
};

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
      .select('role, permissions')
      .eq('id', user.id)
      .maybeSingle();

    const platformAccess = await resolvePlatformAccessContext(adminClient, user);
    const effectiveRole = profile?.role || user.user_metadata?.role;

    if (effectiveRole !== 'owner' && !platformAccess.isPlatformOwner) {
      return {
        error: { status: 403, body: { error: 'Owner access required' } },
      };
    }

    return { user, adminClient, platformAccess };
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
      .select('role, permissions')
      .eq('id', user.id)
      .maybeSingle();

    const platformAccess = await resolvePlatformAccessContext(adminClient, user);
    const effectiveRole = String(profile?.role || user.user_metadata?.role || user.app_metadata?.role || '').trim().toLowerCase();
    const permissionsMap = resolvePermissionsMap(profile?.permissions || user.user_metadata?.permissions || null);
    const adminSignals = [
      'User & Role Management',
      'System Settings',
      'Finance Management',
      'Pricing Management',
      'Project Export',
    ];
    const hasAdminPermission = adminSignals.some((permissionKey) => permissionsMap[permissionKey] === true);

    if (!['owner', 'admin'].includes(effectiveRole) && !hasAdminPermission && !platformAccess.isPlatformAdmin) {
      return {
        error: { status: 403, body: { error: 'Owner or admin access required' } },
      };
    }

    return { user, adminClient, platformAccess };
  } catch (error) {
    return {
      error: { status: 500, body: { error: error.message } },
    };
  }
};

export const requirePlatformOwner = async (req) => {
  const auth = await authenticateRequest(req);

  if (auth.error) {
    return auth;
  }

  const { user, adminClient } = auth;

  try {
    const platformAccess = await resolvePlatformAccessContext(adminClient, user);

    if (!platformAccess.isPlatformOwner) {
      return {
        error: { status: 403, body: { error: 'Platform owner access required' } },
      };
    }

    return { user, adminClient, platformAccess };
  } catch (error) {
    return {
      error: { status: 500, body: { error: error.message } },
    };
  }
};

export const requirePlatformOwnerOrAdmin = async (req, requiredPermission = '') => {
  const auth = await authenticateRequest(req);

  if (auth.error) {
    return auth;
  }

  const { user, adminClient } = auth;

  try {
    const platformAccess = await resolvePlatformAccessContext(adminClient, user);

    if (!platformAccess.isPlatformAdmin) {
      return {
        error: { status: 403, body: { error: 'Platform admin access required' } },
      };
    }

    const resolvedPermission = String(requiredPermission || '').trim();
    if (
      resolvedPermission &&
      !platformAccess.isPlatformOwner &&
      platformAccess.permissions[resolvedPermission] !== true
    ) {
      return {
        error: { status: 403, body: { error: `${resolvedPermission} permission required` } },
      };
    }

    return { user, adminClient, platformAccess };
  } catch (error) {
    return {
      error: { status: 500, body: { error: error.message } },
    };
  }
};
