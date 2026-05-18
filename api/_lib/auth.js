import { createClient } from '@supabase/supabase-js';
import { APP_USERS_TABLE, PLATFORM_ADMIN_ACCOUNTS_TABLE, PLATFORM_TENANTS_TABLE, createSupabaseClients, getSharedSupabaseTenantConfig } from './supabase.js';
import {
  resolveTenantTenancyMode,
  runPlatformTenantSelectWithModeFallback,
} from './tenantRegistry.js';

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
    if (json?.ref) return json.ref;

    const issuer = String(json?.iss || '').trim();
    if (!issuer) return null;

    const hostname = new URL(issuer).hostname;
    const [projectRef] = hostname.split('.');
    return projectRef || null;
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

const DRIVEOUT_BASE_DOMAIN = 'driveout.io';
const RESERVED_SUBDOMAINS = new Set(['www', 'admin', 'app']);
const LOCAL_TENANT_PORT_MAP = Object.freeze({
  '5174': 'offroad',
});

const normalizeHostname = (value = '') => {
  const trimmed = String(value || '').trim().toLowerCase();
  if (!trimmed) return '';

  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).hostname.toLowerCase();
  } catch {
    return trimmed.split('/')[0].split(':')[0].toLowerCase();
  }
};

const getTenantSlugFromHostname = (hostname = '') => {
  const rawHostname = String(hostname || '').trim().toLowerCase();
  const normalizedHostname = normalizeHostname(hostname);
  const localPort = rawHostname.split(':')[1] || '';
  if ((normalizedHostname === 'localhost' || normalizedHostname === '127.0.0.1') && LOCAL_TENANT_PORT_MAP[localPort]) {
    return LOCAL_TENANT_PORT_MAP[localPort];
  }

  if (!normalizedHostname.endsWith(`.${DRIVEOUT_BASE_DOMAIN}`)) return '';

  const slug = normalizedHostname.slice(0, -(`.${DRIVEOUT_BASE_DOMAIN}`.length));
  return slug && !RESERVED_SUBDOMAINS.has(slug) ? slug : '';
};

const tenantServiceRoleKeyCache = new Map();

export const getServiceRoleKeyForProject = async (projectRef) => {
  const normalizedProjectRef = String(projectRef || '').trim();
  if (!normalizedProjectRef) return null;

  if (tenantServiceRoleKeyCache.has(normalizedProjectRef)) {
    return tenantServiceRoleKeyCache.get(normalizedProjectRef);
  }

  const managementToken = process.env.SUPABASE_MANAGEMENT_TOKEN;
  if (!managementToken) {
    throw new Error('Missing SUPABASE_MANAGEMENT_TOKEN for tenant API authentication');
  }

  const response = await fetch(`https://api.supabase.com/v1/projects/${normalizedProjectRef}/api-keys?reveal=true`, {
    headers: {
      authorization: `Bearer ${managementToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Unable to load tenant service key for ${normalizedProjectRef}: ${response.status}`);
  }

  const payload = await response.json();
  const candidates = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.api_keys)
      ? payload.api_keys
      : Array.isArray(payload?.keys)
        ? payload.keys
        : Object.values(payload || {});

  const serviceRole = candidates.find((entry) => {
    const name = String(entry?.name || entry?.type || entry?.role || entry?.key || '').trim().toLowerCase();
    return name === 'service_role' || name === 'service-role' || name.includes('service');
  });

  const key = serviceRole?.api_key || serviceRole?.key || serviceRole?.value || serviceRole?.token || null;
  if (!key) {
    throw new Error(`Tenant service key for ${normalizedProjectRef} was not present in Supabase Management response`);
  }

  tenantServiceRoleKeyCache.set(normalizedProjectRef, key);
  return key;
};

const resolveTenantRuntimeFromToken = async (masterAdminClient, token) => {
  const projectRef = extractProjectRefFromJwt(token);
  if (!projectRef) return null;

  const serviceProjectRef = extractProjectRefFromJwt(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (serviceProjectRef && projectRef === serviceProjectRef) {
    return null;
  }

  const { data: tenant, error } = await masterAdminClient
    .from(PLATFORM_TENANTS_TABLE)
    .select('id, tenant_slug, tenant_status, tenant_project_ref, tenant_api_url, tenant_anon_key')
    .eq('tenant_project_ref', projectRef)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!tenant || String(tenant.tenant_status || '').trim().toLowerCase() !== 'active') {
    return null;
  }

  const apiUrl = String(tenant.tenant_api_url || `https://${projectRef}.supabase.co`).trim();
  const anonKey = String(tenant.tenant_anon_key || '').trim();
  if (!apiUrl || !anonKey) {
    throw new Error(`Tenant ${tenant.tenant_slug || projectRef} is missing API URL or anon key`);
  }

  const serviceRoleKey = await getServiceRoleKeyForProject(projectRef);

  return {
    tenant,
    projectRef,
    apiUrl,
    anonKey,
    serviceRoleKey,
  };
};

const resolveSharedTenantRuntimeFromRequest = async (masterAdminClient, req) => {
  const requestedHost = String(
    req.headers['x-forwarded-host'] ||
    req.headers.host ||
    ''
  );
  const tenantSlug = getTenantSlugFromHostname(requestedHost);
  if (!tenantSlug) {
    return null;
  }

  const { data: tenant, error } = await runPlatformTenantSelectWithModeFallback((selectClause) =>
    masterAdminClient
      .from(PLATFORM_TENANTS_TABLE)
      .select(selectClause)
      .eq('tenant_slug', tenantSlug)
      .maybeSingle()
  );

  if (error) {
    throw error;
  }

  if (!tenant || String(tenant.tenant_status || '').trim().toLowerCase() !== 'active') {
    return null;
  }

  if (resolveTenantTenancyMode(tenant) !== 'shared') {
    return null;
  }

  const sharedConfig = getSharedSupabaseTenantConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  return {
    tenant,
    projectRef: sharedConfig.projectRef,
    apiUrl: sharedConfig.apiUrl,
    anonKey: sharedConfig.anonKey,
    serviceRoleKey,
  };
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
    const { adminClient: masterAdminClient } = createSupabaseClients();
    const publicSupabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const publicSupabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    const tenantRuntime =
      await resolveTenantRuntimeFromToken(masterAdminClient, token) ||
      await resolveSharedTenantRuntimeFromRequest(masterAdminClient, req);
    const effectiveSupabaseUrl = tenantRuntime?.apiUrl || publicSupabaseUrl;
    const effectiveSupabaseAnonKey = tenantRuntime?.anonKey || publicSupabaseAnonKey;
    const effectiveAdminClient = tenantRuntime
      ? createClient(tenantRuntime.apiUrl, tenantRuntime.serviceRoleKey, {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false,
          },
        })
      : masterAdminClient;

    const authUrls = [
      effectiveSupabaseUrl,
      tenantRuntime ? null : getProjectUrlFromJwt(token),
    ].filter(Boolean);

    const uniqueAuthUrls = [...new Set(authUrls)];
    let data = null;
    let error = null;

    for (const authUrl of uniqueAuthUrls) {
      const authClient = createClient(authUrl, effectiveSupabaseAnonKey, {
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

      if (!tenantRuntime && tokenProjectRef && serviceProjectRef && tokenProjectRef !== serviceProjectRef) {
        return {
          error: { status: 401, body: { error: 'Session does not belong to this Supabase project' } },
        };
      }

      const adminUserResult = await effectiveAdminClient.auth.admin.getUserById(tokenPayload.sub);

      if (adminUserResult.error || !adminUserResult.data?.user) {
        return {
          error: { status: 401, body: { error: 'Invalid or expired session' } },
        };
      }

      data = { user: adminUserResult.data.user };
    }

    const userClient = createClient(effectiveSupabaseUrl, effectiveSupabaseAnonKey, {
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

    return {
      user: data.user,
      adminClient: effectiveAdminClient,
      userClient,
      tenantRuntime: tenantRuntime?.tenant || null,
      masterAdminClient,
    };
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

  const { user, adminClient, tenantRuntime, masterAdminClient, userClient } = auth;

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

    return { user, adminClient, platformAccess, tenantRuntime, masterAdminClient, userClient };
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

  const { user, adminClient, tenantRuntime, masterAdminClient, userClient } = auth;

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

    return { user, adminClient, platformAccess, tenantRuntime, masterAdminClient, userClient };
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
