import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { clearActiveSupabaseSessionStorage, supabase } from '../lib/supabase';
import { TABLE_NAMES } from '../config/tableNames';
import { getUserPermissions } from '../services/UserService';
import { shouldSyncCustomerAccount, syncCustomerAccountForAuthUser } from '../services/CustomerAccountSyncService';
import { adminApiRequest } from '../services/adminApi';
import appWarmupService from '../services/AppWarmupService';
import { clearPermissionCache } from '../utils/permissionHelpers';
import {
  normalizePermissionMap as normalizeCatalogPermissionMap,
  buildBusinessOwnerPermissionMap,
  buildDefaultPermissionsForRole,
  resolvePermissionKey,
} from '../utils/permissionCatalog';
import { getBusinessOwnerFreezeRedirect, hasBusinessOwnerRequest, isApprovedBusinessOwnerAccount, isPlatformOwnerEmail } from '../utils/accountType';
import { shouldScopeSharedTenantData } from '../services/OrganizationService';
import { resolveUserEntry } from '../utils/tenantEntryResolver';
import { getHostContext, isFirstPartyTenantHost } from '../utils/hostContext';
import { buildEffectiveTenantFeatureAccess, normalizeTenantPlanType } from '../config/tenantPlans';
import { isTenantFeatureEnabled, isTenantModuleEnabled } from '../utils/tenantFeatureAccess';

const GLOBAL_AUTH_CONTEXT_KEY = '__SAHARAX_AUTH_CONTEXT__';
const AuthContext = globalThis[GLOBAL_AUTH_CONTEXT_KEY] || createContext(null);

if (typeof globalThis !== 'undefined' && !globalThis[GLOBAL_AUTH_CONTEXT_KEY]) {
  globalThis[GLOBAL_AUTH_CONTEXT_KEY] = AuthContext;
}
const PENDING_ACCOUNT_INTENT_KEY = 'saharax_pending_account_type';
const PLATFORM_PERMISSION_MODULES = new Set(['Workspaces', 'Platform Admins']);
const AUTH_PROFILE_BOOTSTRAP_TIMEOUT_MS = 6000;
const AUTH_PERMISSION_BOOTSTRAP_TIMEOUT_MS = 3500;
const AUTH_TENANT_SESSION_BOOTSTRAP_TIMEOUT_MS = 3500;
const AUTH_TENANT_SESSION_DEFER_MS = 450;
const AUTH_PENDING_INTENT_TIMEOUT_MS = 2500;
const AUTH_BOOTSTRAP_TIMEOUT_CODE = 'AUTH_BOOTSTRAP_TIMEOUT';

const isAbortLikeError = (error) => {
  const code = String(error?.code || '').trim().toUpperCase();
  const name = String(error?.name || '').trim().toLowerCase();
  const message = String(error?.message || '').trim().toLowerCase();

  return (
    code === 'ABORT_ERR' ||
    name === 'aborterror' ||
    message.includes('signal is aborted') ||
    message.includes('aborted without reason')
  );
};

const isRetryableFetchLikeError = (error) => {
  const name = String(error?.name || '').trim().toLowerCase();
  const message = String(error?.message || '').trim().toLowerCase();

  return (
    name === 'authretryablefetcherror' ||
    message === 'failed to fetch' ||
    message.includes('failed to fetch')
  );
};

const createBootstrapTimeoutError = (label, timeoutMs) => {
  const error = new Error(`${label} timed out after ${timeoutMs}ms`);
  error.code = AUTH_BOOTSTRAP_TIMEOUT_CODE;
  error.isTimeout = true;
  return error;
};

const withBootstrapTimeout = async (promiseFactory, label, timeoutMs) => {
  let timeoutId = null;

  try {
    return await Promise.race([
      Promise.resolve().then(() => promiseFactory()),
      new Promise((_, reject) => {
        timeoutId = globalThis.setTimeout(() => {
          reject(createBootstrapTimeoutError(label, timeoutMs));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== null) {
      globalThis.clearTimeout(timeoutId);
    }
  }
};

const buildPlatformAccessFallback = (privilegedOwnerOverride) => (
  privilegedOwnerOverride
    ? {
        role: 'platform_owner',
        access_enabled: true,
        is_platform_owner: true,
        is_platform_admin: true,
        permissions: {
          Workspaces: true,
          'Platform Admins': true,
        },
      }
    : null
);

const getPendingAccountIntent = () => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.sessionStorage.getItem(PENDING_ACCOUNT_INTENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    console.warn('Failed to read pending account intent:', error);
    return null;
  }
};

const clearPendingAccountIntent = () => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(PENDING_ACCOUNT_INTENT_KEY);
  } catch (error) {
    console.warn('Failed to clear pending account intent:', error);
  }
};

const setPendingAccountIntent = (intent = {}) => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(PENDING_ACCOUNT_INTENT_KEY, JSON.stringify(intent));
  } catch (error) {
    console.warn('Failed to persist pending account intent:', error);
  }
};

const getPreferredOAuthRedirectTo = () => {
  if (typeof window === 'undefined') return undefined;
  const origin = String(window.location.origin || '').trim();
  const hostname = String(window.location.hostname || '').toLowerCase();
  const port = String(window.location.port || '').trim();
  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';

  if (import.meta.env.DEV && isLocalHost) {
    return `http://${hostname}${port ? `:${port}` : ''}/login`;
  }

  if (!origin) return undefined;
  return `${origin}/login`;
};

const buildPreferredOAuthUrl = (oauthUrl, redirectTo) => {
  if (!oauthUrl || !redirectTo || typeof window === 'undefined') {
    return oauthUrl;
  }

  try {
    const preferredUrl = new URL(oauthUrl);

    const normalizedRedirectTo = redirectTo.trim();
    preferredUrl.searchParams.set('redirect_to', normalizedRedirectTo);

    return preferredUrl.toString();
  } catch (error) {
    console.warn('Failed to normalize OAuth redirect URL:', error);
    return oauthUrl;
  }
};

const inferRoleFromPermissions = (permissionsMap = {}) => {
  const allowedModules = Object.entries(permissionsMap)
    .filter(([, isAllowed]) => isAllowed)
    .map(([moduleName]) => moduleName.toLowerCase());

  if (allowedModules.length === 0) {
    return 'customer';
  }

  const hasAny = (candidates) => candidates.some((candidate) => allowedModules.includes(candidate.toLowerCase()));

  if (hasAny(['User & Role Management', 'System Settings', 'Finance Management', 'Pricing Management', 'Project Export'])) {
    return 'admin';
  }

  if (hasAny(['Tours & Bookings']) && !hasAny(['Rental Management', 'Fleet Management'])) {
    return 'guide';
  }

  if (hasAny(['Dashboard', 'Rental Management', 'Fleet Management', 'Customer Management'])) {
    return 'employee';
  }

  return 'customer';
};

const resolveProfileVerificationState = (authUser, appUserRecord, fallbackStatus = 'pending') => {
  const verificationSummary =
    appUserRecord?.verification_summary && typeof appUserRecord.verification_summary === 'object'
      ? appUserRecord.verification_summary
      : null;
  const summaryStatus = String(verificationSummary?.status || '').trim().toLowerCase();
  const profileVerificationStatus = String(
    appUserRecord?.profile_verification_status ||
    summaryStatus ||
    ''
  ).trim().toLowerCase();
  const isComplete = Boolean(
    verificationSummary?.complete &&
      ['approved', 'verified'].includes(summaryStatus)
  );
  const verificationStatus = isComplete
    ? 'approved'
    : profileVerificationStatus ||
      appUserRecord?.verification_status ||
      authUser?.user_metadata?.verification_status ||
      authUser?.app_metadata?.verification_status ||
      fallbackStatus;

  return {
    verificationStatus,
    profileVerificationStatus: profileVerificationStatus || null,
    verificationSummary,
  };
};

const buildApprovedBusinessOwnerProfile = (authUser, appUserRecord, fullName) => {
  const businessOwnerPermissions = buildBusinessOwnerPermissionMap();
  const verificationState = resolveProfileVerificationState(authUser, appUserRecord, 'approved');
  const profilePictureUrl =
    appUserRecord?.profile_picture_url ||
    appUserRecord?.avatar_url ||
    authUser.user_metadata?.profile_picture_url ||
    authUser.user_metadata?.avatar_url ||
    authUser.app_metadata?.profile_picture_url ||
    authUser.app_metadata?.avatar_url ||
    null;

  return {
    id: authUser.id,
    email: authUser.email,
    role: 'business_owner',
    fullName,
    profile_picture_url: profilePictureUrl,
    avatar_url: profilePictureUrl,
    accountType: authUser.user_metadata?.account_type || authUser.app_metadata?.account_type || 'operator',
    companyName: authUser.user_metadata?.company_name || authUser.app_metadata?.company_name || '',
    companyIceNumber:
      authUser.user_metadata?.company_ice_number ||
      authUser.app_metadata?.company_ice_number ||
      authUser.user_metadata?.company_rc_number ||
      authUser.app_metadata?.company_rc_number ||
      '',
    permissions: Object.entries(businessOwnerPermissions).map(([module_name, has_access]) => ({
      module_name,
      has_access,
    })),
    accessEnabled: appUserRecord?.access_enabled ?? true,
    verificationStatus: verificationState.verificationStatus,
    profileVerificationStatus: verificationState.profileVerificationStatus,
    profile_verification_status: verificationState.profileVerificationStatus,
    verificationSummary: verificationState.verificationSummary,
    verification_summary: verificationState.verificationSummary,
    approvedAt: appUserRecord?.approved_at || authUser.user_metadata?.approved_at || null,
    approvedBy: appUserRecord?.approved_by || authUser.user_metadata?.approved_by || null,
    rejectionReason: appUserRecord?.rejection_reason || authUser.user_metadata?.rejection_reason || '',
    subscriptionPlan: appUserRecord?.subscription_plan || authUser.user_metadata?.subscription_plan || 'free_trial',
    subscriptionStatus: appUserRecord?.subscription_status || authUser.user_metadata?.subscription_status || 'trial',
    planType: appUserRecord?.plan_type || authUser.user_metadata?.plan_type || 'starter',
    billingStatus: appUserRecord?.billing_status || authUser.user_metadata?.billing_status || 'none',
    activationPendingCompliance: Boolean(
      authUser.user_metadata?.activation_pending_compliance ||
      authUser.app_metadata?.activation_pending_compliance
    ),
    upgradeRequirements: Array.isArray(authUser.user_metadata?.upgrade_requirements)
      ? authUser.user_metadata.upgrade_requirements
      : (Array.isArray(authUser.app_metadata?.upgrade_requirements) ? authUser.app_metadata.upgrade_requirements : []),
    trialStartedAt: appUserRecord?.trial_started_at || authUser.user_metadata?.trial_started_at || null,
    trialEndsAt: appUserRecord?.trial_ends_at || authUser.user_metadata?.trial_ends_at || null,
    subscriptionStartedAt: appUserRecord?.subscription_started_at || authUser.user_metadata?.subscription_started_at || null,
    suspendedAt: appUserRecord?.suspended_at || authUser.user_metadata?.suspended_at || null,
    suspensionReason: appUserRecord?.suspension_reason || authUser.user_metadata?.suspension_reason || '',
    organizationId: appUserRecord?.organization_id || appUserRecord?.primary_organization_id || authUser.user_metadata?.organization_id || null,
    organizationName: appUserRecord?.organization_name || authUser.user_metadata?.organization_name || '',
    organizationRole: appUserRecord?.organization_role || authUser.user_metadata?.organization_role || 'org_owner',
    organizationStatus: appUserRecord?.organization_status || authUser.user_metadata?.organization_status || 'active',
    isPlatformOrganization: Boolean(appUserRecord?.is_platform_organization || authUser.user_metadata?.is_platform_organization),
  };
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

const getProfileStorageContextKey = () => {
  if (typeof window === 'undefined') {
    return 'server';
  }

  const host = getHostContext();
  return [
    host.kind || 'unknown',
    host.hostname || window.location.hostname || '',
    host.tenantSlug || '',
  ].join('|');
};

export const AuthProvider = ({ children }) => {
  const [userProfile, setUserProfile] = useState(() => {
    try {
      const storedProfile = localStorage.getItem('userProfile');
      if (!storedProfile) return null;

      const parsed = JSON.parse(storedProfile);
      const currentContextKey = getProfileStorageContextKey();
      const host = getHostContext();
      const storedRole = String(parsed?.profile?.role || '').trim().toLowerCase();

      if (
        host.kind === 'tenant' &&
        storedRole === 'business_owner'
      ) {
        return null;
      }

      if (parsed?.profile && parsed?.contextKey === currentContextKey) {
        return parsed.profile;
      }

      return null;
    } catch (error) {
      console.warn('Failed to read persisted user profile:', error);
      return null;
    }
  });
  const [session, setSession] = useState(null);
  const [tenantSession, setTenantSession] = useState(null);
  const [platformAccess, setPlatformAccess] = useState(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const isLoadingProfile = useRef(false);
  
  // ⚠️ CRITICAL FIX: Use ref to track latest session state for auth listener
  const sessionRef = useRef(null);
  const userProfileRef = useRef(null);
  const recordedAuthActivityRef = useRef(new Set());
  const syncedCustomerAccountsRef = useRef(new Set());
  const tenantSessionLoadSequenceRef = useRef(0);

  const resetAuthState = useCallback(() => {
    tenantSessionLoadSequenceRef.current += 1;
    setUserProfile(null);
    setSession(null);
    setTenantSession(null);
    setPlatformAccess(null);
    setLoading(false);
    setInitialized(true);
    isLoadingProfile.current = false;
  }, []);

  const waitForActiveProfileLoad = useCallback(() => new Promise((resolve) => {
    const startedAt = Date.now();
    const wait = () => {
      if (!isLoadingProfile.current || Date.now() - startedAt > 5000) {
        resolve();
        return;
      }

      window.setTimeout(wait, 50);
    };

    wait();
  }), []);

  // Update refs whenever state changes
  useEffect(() => {
    sessionRef.current = session;
    userProfileRef.current = userProfile;
  }, [session, userProfile]);

  useEffect(() => {
    if (!initialized || !session?.user?.id) {
      return undefined;
    }

    let cancelled = false;
    const scheduleWarmup = () => {
      if (cancelled) return;
      void appWarmupService.warmCriticalModules();
    };

    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      const warmupId = window.requestIdleCallback(scheduleWarmup, { timeout: 300 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback?.(warmupId);
      };
    }

    const timeoutId = window.setTimeout(scheduleWarmup, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [initialized, session?.user?.id]);

  useEffect(() => {
    clearPermissionCache();

    if (userProfile) {
      try {
        localStorage.setItem('userProfile', JSON.stringify({
          contextKey: getProfileStorageContextKey(),
          profile: userProfile,
        }));
      } catch (error) {
        console.warn('Failed to persist user profile locally:', error);
      }
      return;
    }

    try {
      localStorage.removeItem('userProfile');
    } catch (error) {
      console.warn('Failed to clear persisted user profile:', error);
    }
  }, [userProfile]);

  const applyPendingAccountIntent = useCallback(async (authUser) => {
    if (!authUser?.id) return authUser;

    const pendingIntent = getPendingAccountIntent();
    if (!pendingIntent?.account_type) return authUser;

    const nextAccountType = String(pendingIntent.account_type || 'customer').trim().toLowerCase();
    const currentAccountType = String(
      authUser.user_metadata?.account_type ||
      authUser.app_metadata?.account_type ||
      'customer'
    ).trim().toLowerCase();

    // Do not overwrite an already-established business/staff account with stale signup intent.
    if (currentAccountType && currentAccountType !== 'customer' && currentAccountType !== nextAccountType) {
      clearPendingAccountIntent();
      return authUser;
    }

    const metadataPatch = {
      role: authUser.user_metadata?.role || authUser.app_metadata?.role || 'customer',
      account_type: nextAccountType,
      marketplace_enabled: Boolean(pendingIntent.marketplace_enabled),
      verification_status: nextAccountType === 'customer' ? 'active' : 'pending_verification',
      onboarding_completed: true,
    };

    [
      ['default_language', pendingIntent.default_language],
      ['phone', pendingIntent.phone],
      ['city', pendingIntent.city],
      ['country', pendingIntent.country],
      ['company_name', pendingIntent.company_name],
      ['company_ice_number', pendingIntent.company_ice_number || pendingIntent.company_rc_number],
      ['service_area', pendingIntent.service_area],
      ['vehicle_count_hint', pendingIntent.vehicle_count_hint],
      ['categories_interest', pendingIntent.categories_interest],
    ].forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        metadataPatch[key] = value;
      }
    });

    const currentMetadata = authUser?.user_metadata && typeof authUser.user_metadata === 'object'
      ? authUser.user_metadata
      : {};
    const pendingIntentAlreadyApplied = Object.entries(metadataPatch).every(([key, value]) => {
      const currentValue = currentMetadata[key];

      if (typeof value === 'boolean') {
        return Boolean(currentValue) === value;
      }

      return String(currentValue ?? '').trim() === String(value ?? '').trim();
    });

    if (pendingIntentAlreadyApplied) {
      clearPendingAccountIntent();
      return authUser;
    }

    try {
      const { data, error } = await withBootstrapTimeout(
        () => supabase.auth.updateUser({
          data: {
            ...authUser.user_metadata,
            ...metadataPatch,
          },
        }),
        'Pending account bootstrap',
        AUTH_PENDING_INTENT_TIMEOUT_MS
      );

      if (error) throw error;
      clearPendingAccountIntent();
      return data?.user || {
        ...authUser,
        user_metadata: {
          ...authUser.user_metadata,
          ...metadataPatch,
        },
      };
    } catch (error) {
      console.warn('Unable to apply pending account intent after OAuth:', error);
      return authUser;
    }
  }, []);

  const hydrateTenantSession = useCallback(async ({ requestId, privilegedOwnerOverride }) => {
    try {
      const tenantResponse = await withBootstrapTimeout(
        () => adminApiRequest('/api/tenants?resource=session'),
        'Workspace session bootstrap',
        AUTH_TENANT_SESSION_BOOTSTRAP_TIMEOUT_MS
      );

      if (tenantSessionLoadSequenceRef.current !== requestId) {
        return;
      }

      const nextSession = tenantResponse?.session || null;
      setTenantSession(nextSession);
      setPlatformAccess(
        nextSession?.platform_access && typeof nextSession.platform_access === 'object'
          ? nextSession.platform_access
          : buildPlatformAccessFallback(privilegedOwnerOverride)
      );
    } catch (tenantError) {
      if (tenantSessionLoadSequenceRef.current !== requestId) {
        return;
      }

      console.warn('Unable to load tenant session:', tenantError);
      setTenantSession(null);
      setPlatformAccess(buildPlatformAccessFallback(privilegedOwnerOverride));
    }
  }, []);

  const loadUserProfile = useCallback(async (authUser, session) => {
    // Prevent duplicate profile loads
    if (isLoadingProfile.current) {
      await waitForActiveProfileLoad();
      return;
    }

    if (!authUser) {
      resetAuthState();
      return;
    }

    isLoadingProfile.current = true;

    try {
      const appUserRecordPromise = withBootstrapTimeout(
        () => adminApiRequest('/api/me/profile'),
        'Profile bootstrap',
        AUTH_PROFILE_BOOTSTRAP_TIMEOUT_MS
      )
        .then((response) => ({ data: response?.profile || null, error: null }))
        .catch((error) => ({ data: null, error }));

      const rpcPermissionsPromise = withBootstrapTimeout(
        () => getUserPermissions(authUser.id),
        'Permission bootstrap',
        AUTH_PERMISSION_BOOTSTRAP_TIMEOUT_MS
      ).catch((error) => {
        console.warn('Unable to load user permissions during bootstrap:', error);
        return {};
      });
      const [
        { data: appUserRecord, error: appUserError },
        rpcPermissionsMap,
      ] = await Promise.all([appUserRecordPromise, rpcPermissionsPromise]);

      const metadataRole =
        authUser.user_metadata?.role ||
        authUser.app_metadata?.role ||
        null;
      const localStorageRole =
        typeof window !== 'undefined'
          ? (
            window.localStorage.getItem('driveout_user_role') ||
            window.localStorage.getItem('saharax_user_role')
          )
          : null;
      const appRecordRole = String(appUserRecord?.role || '').trim().toLowerCase() || null;
      const normalizedMetadataRole = String(metadataRole || '').trim().toLowerCase() || null;
      const normalizedLocalStorageRole = String(localStorageRole || '').trim().toLowerCase() || null;
      const hasAppField = (field) => Boolean(appUserRecord) && Object.prototype.hasOwnProperty.call(appUserRecord, field);
      const fullName =
        (hasAppField('full_name') ? appUserRecord.full_name : null) ||
        authUser.user_metadata?.full_name ||
        authUser.app_metadata?.full_name ||
        authUser.email;
      
      if (!authUser.id) {
        throw new Error(`Invalid userId: ${authUser.id}`);
      }

      if (appUserError && appUserError.code !== '42P17') {
        console.warn('Failed to load app user record, falling back to auth metadata:', appUserError);
      }

      const hostContext = getHostContext();
      const internalTenantRoles = new Set(['owner', 'admin', 'employee', 'guide']);
      const appRecordIndicatesInternalTenantRole = internalTenantRoles.has(appRecordRole || '');
      const normalizedOrganizationRole = String(
        appUserRecord?.organization_role ||
        authUser.user_metadata?.organization_role ||
        authUser.app_metadata?.organization_role ||
        ''
      ).trim().toLowerCase();
      const tenantHostRoleOverride =
        hostContext.kind === 'tenant'
          ? (
            appRecordIndicatesInternalTenantRole
              ? (appRecordRole || null)
              : (
                ['org_owner', 'owner'].includes(normalizedOrganizationRole)
                  ? 'owner'
                  : ['org_admin', 'admin'].includes(normalizedOrganizationRole)
                    ? 'admin'
                    : null
              )
          )
          : null;

      const storedPermissionsMap = normalizeCatalogPermissionMap(
        appUserRecord?.permissions && typeof appUserRecord.permissions === 'object' && !Array.isArray(appUserRecord.permissions)
          ? appUserRecord.permissions
          : {}
      );
      const mergedPermissionMap = {
        ...storedPermissionsMap,
        ...rpcPermissionsMap,
      };
      const privilegedOwnerOverride = isPlatformOwnerEmail(authUser.email);
      const businessOwnerRequestMetadata = {
        ...(authUser.app_metadata || {}),
        ...(authUser.user_metadata || {}),
      };
      const businessOwnerLikeAccount = !privilegedOwnerOverride
        && hostContext.kind !== 'tenant'
        && hasBusinessOwnerRequest(businessOwnerRequestMetadata);
      const approvedBusinessOwner = businessOwnerLikeAccount && isApprovedBusinessOwnerAccount({
        ...(authUser.app_metadata || {}),
        ...(authUser.user_metadata || {}),
      });
      const resolvedRoleForPermissions =
        tenantHostRoleOverride ||
        (businessOwnerLikeAccount ? 'business_owner' : appRecordRole) ||
        normalizedMetadataRole ||
        normalizedLocalStorageRole ||
        (privilegedOwnerOverride ? 'owner' : null) ||
        'customer';
      const normalizedResolvedRoleForPermissions = String(resolvedRoleForPermissions || '').trim().toLowerCase();
      const userPermissionsMap = businessOwnerLikeAccount
        ? {
            ...mergedPermissionMap,
            ...buildBusinessOwnerPermissionMap(),
          }
        : ['owner', 'admin'].includes(normalizedResolvedRoleForPermissions)
          ? {
              ...mergedPermissionMap,
              ...buildDefaultPermissionsForRole(normalizedResolvedRoleForPermissions),
            }
          : {
              ...buildDefaultPermissionsForRole(normalizedResolvedRoleForPermissions),
              ...mergedPermissionMap,
            };
      
      // Convert permissions map to array format for backward compatibility
      const userPermissions = Object.entries(userPermissionsMap).map(([module_name, is_allowed]) => ({
        module_name,
        has_access: is_allowed
      }));

      const inferredRole = inferRoleFromPermissions(userPermissionsMap);
      const userRole =
        tenantHostRoleOverride ||
        (businessOwnerLikeAccount
          ? 'business_owner'
          : appRecordRole) ||
        (normalizedMetadataRole && normalizedMetadataRole !== 'customer' ? normalizedMetadataRole : null) ||
        (inferredRole !== 'customer' ? inferredRole : null) ||
        (privilegedOwnerOverride ? 'owner' : null) ||
        normalizedMetadataRole ||
        (normalizedLocalStorageRole && normalizedLocalStorageRole !== 'customer' ? normalizedLocalStorageRole : null) ||
        'customer';

      if (typeof window !== 'undefined') {
        if (appRecordRole || normalizedMetadataRole) {
          window.localStorage.removeItem('driveout_user_role');
          window.localStorage.removeItem('saharax_user_role');
        } else if (userRole && userRole !== 'customer') {
          window.localStorage.setItem('driveout_user_role', userRole);
          window.localStorage.setItem('saharax_user_role', userRole);
        }
      }

      const verificationState = resolveProfileVerificationState(authUser, appUserRecord, 'pending');
      
      const profile = approvedBusinessOwner
        ? buildApprovedBusinessOwnerProfile(authUser, appUserRecord, fullName)
        : {
            id: authUser.id,
            email: authUser.email,
            role: userRole,
            username: hasAppField('username') ? (appUserRecord?.username || '') : (authUser.user_metadata?.username || ''),
            fullName,
            full_name: hasAppField('full_name') ? appUserRecord?.full_name : fullName,
            profile_picture_url:
              (hasAppField('profile_picture_url') ? appUserRecord?.profile_picture_url : null) ||
              (hasAppField('avatar_url') ? appUserRecord?.avatar_url : null) ||
              authUser.user_metadata?.profile_picture_url ||
              authUser.user_metadata?.avatar_url ||
              authUser.app_metadata?.profile_picture_url ||
              authUser.app_metadata?.avatar_url ||
              null,
            avatar_url:
              (hasAppField('avatar_url') ? appUserRecord?.avatar_url : null) ||
              (hasAppField('profile_picture_url') ? appUserRecord?.profile_picture_url : null) ||
              authUser.user_metadata?.avatar_url ||
              authUser.user_metadata?.profile_picture_url ||
              authUser.app_metadata?.avatar_url ||
              authUser.app_metadata?.profile_picture_url ||
              null,
            first_name: hasAppField('first_name') ? (appUserRecord?.first_name || '') : (authUser.user_metadata?.first_name || ''),
            last_name: hasAppField('last_name') ? (appUserRecord?.last_name || '') : (authUser.user_metadata?.last_name || ''),
            phone: hasAppField('phone_number') ? (appUserRecord?.phone_number || '') : (authUser.user_metadata?.phone || ''),
            phone_number: hasAppField('phone_number') ? (appUserRecord?.phone_number || '') : (authUser.user_metadata?.phone || ''),
            address: hasAppField('address') ? (appUserRecord?.address || '') : (authUser.user_metadata?.address || ''),
            date_of_birth: hasAppField('date_of_birth') ? (appUserRecord?.date_of_birth || '') : (authUser.user_metadata?.date_of_birth || ''),
            emergency_contact: hasAppField('emergency_contact') ? (appUserRecord?.emergency_contact || '') : (authUser.user_metadata?.emergency_contact || ''),
            emergency_phone: hasAppField('emergency_phone') ? (appUserRecord?.emergency_phone || '') : (authUser.user_metadata?.emergency_phone || ''),
            preferences: hasAppField('preferences') ? (appUserRecord?.preferences || {}) : (authUser.user_metadata?.preferences || {}),
            staff_id_documents: hasAppField('staff_id_documents') ? (appUserRecord?.staff_id_documents || []) : (authUser.user_metadata?.staff_id_documents || []),
            accountType: authUser.user_metadata?.account_type || authUser.app_metadata?.account_type || 'customer',
            permissions: userPermissions,
            accessEnabled: appUserRecord?.access_enabled ?? true,
            verificationStatus: verificationState.verificationStatus,
            profileVerificationStatus: verificationState.profileVerificationStatus,
            profile_verification_status: verificationState.profileVerificationStatus,
            verificationSummary: verificationState.verificationSummary,
            verification_summary: verificationState.verificationSummary,
            approvedAt: appUserRecord?.approved_at || authUser.user_metadata?.approved_at || authUser.app_metadata?.approved_at || null,
            approvedBy: appUserRecord?.approved_by || authUser.user_metadata?.approved_by || authUser.app_metadata?.approved_by || null,
            rejectionReason: appUserRecord?.rejection_reason || authUser.user_metadata?.rejection_reason || authUser.app_metadata?.rejection_reason || '',
            subscriptionPlan: appUserRecord?.subscription_plan || authUser.user_metadata?.subscription_plan || authUser.app_metadata?.subscription_plan || null,
            subscriptionStatus: appUserRecord?.subscription_status || authUser.user_metadata?.subscription_status || authUser.app_metadata?.subscription_status || null,
            planType: appUserRecord?.plan_type || authUser.user_metadata?.plan_type || authUser.app_metadata?.plan_type || 'starter',
            billingStatus: appUserRecord?.billing_status || authUser.user_metadata?.billing_status || authUser.app_metadata?.billing_status || 'none',
            trialStartedAt: appUserRecord?.trial_started_at || authUser.user_metadata?.trial_started_at || authUser.app_metadata?.trial_started_at || null,
            trialEndsAt: appUserRecord?.trial_ends_at || authUser.user_metadata?.trial_ends_at || authUser.app_metadata?.trial_ends_at || null,
            subscriptionStartedAt: appUserRecord?.subscription_started_at || authUser.user_metadata?.subscription_started_at || authUser.app_metadata?.subscription_started_at || null,
            suspendedAt: appUserRecord?.suspended_at || authUser.user_metadata?.suspended_at || authUser.app_metadata?.suspended_at || null,
            suspensionReason: appUserRecord?.suspension_reason || authUser.user_metadata?.suspension_reason || authUser.app_metadata?.suspension_reason || '',
            organizationId: appUserRecord?.organization_id || appUserRecord?.primary_organization_id || authUser.user_metadata?.organization_id || authUser.app_metadata?.organization_id || null,
            organizationName: appUserRecord?.organization_name || authUser.user_metadata?.organization_name || authUser.app_metadata?.organization_name || '',
            organizationRole: appUserRecord?.organization_role || authUser.user_metadata?.organization_role || authUser.app_metadata?.organization_role || null,
            organizationStatus: appUserRecord?.organization_status || authUser.user_metadata?.organization_status || authUser.app_metadata?.organization_status || null,
            isPlatformOrganization: Boolean(appUserRecord?.is_platform_organization || authUser.user_metadata?.is_platform_organization || authUser.app_metadata?.is_platform_organization),
          };
      setUserProfile(profile);
      setSession(session);

      const shouldLoadWorkspaceSession =
        privilegedOwnerOverride ||
        userRole === 'owner' ||
        userRole === 'admin' ||
        userPermissionsMap.Workspaces === true ||
        userPermissionsMap['Platform Admins'] === true ||
        hasBusinessOwnerRequest({
          account_type: profile?.accountType,
          certification_request_status: session?.user?.user_metadata?.certification_request_status || session?.user?.app_metadata?.certification_request_status,
        });

      if (shouldLoadWorkspaceSession) {
        const nextTenantSessionRequestId = tenantSessionLoadSequenceRef.current + 1;
        tenantSessionLoadSequenceRef.current = nextTenantSessionRequestId;
        setTenantSession(null);
        setPlatformAccess(buildPlatformAccessFallback(privilegedOwnerOverride));
        globalThis.setTimeout(() => {
          void hydrateTenantSession({
            requestId: nextTenantSessionRequestId,
            privilegedOwnerOverride,
          });
        }, AUTH_TENANT_SESSION_DEFER_MS);
      } else {
        tenantSessionLoadSequenceRef.current += 1;
        setTenantSession(null);
        setPlatformAccess(null);
      }

      if (shouldSyncCustomerAccount(profile, authUser) && !syncedCustomerAccountsRef.current.has(authUser.id)) {
        syncedCustomerAccountsRef.current.add(authUser.id);
        void syncCustomerAccountForAuthUser(authUser, profile).catch((syncError) => {
          syncedCustomerAccountsRef.current.delete(authUser.id);
          console.warn('Unable to sync Gmail customer account into Customer Management:', syncError);
        });
      }
    } catch (error) {
      console.error('Failed to load user profile and permissions:', error);
      const privilegedOwnerOverride = isPlatformOwnerEmail(authUser.email);
      const hostContext = getHostContext();
      const fallbackAuthRole = String(authUser.user_metadata?.role || authUser.app_metadata?.role || '').trim().toLowerCase();
      const fallbackInternalTenantRole = ['owner', 'admin', 'employee', 'guide'].includes(fallbackAuthRole);
      const fallbackBusinessOwnerLikeAccount = !privilegedOwnerOverride
        && !(hostContext.kind === 'tenant' && fallbackInternalTenantRole)
        && hasBusinessOwnerRequest({
          ...(authUser.app_metadata || {}),
          ...(authUser.user_metadata || {}),
        });
      const fallbackApprovedBusinessOwner = fallbackBusinessOwnerLikeAccount && isApprovedBusinessOwnerAccount({
        ...(authUser.app_metadata || {}),
        ...(authUser.user_metadata || {}),
      });
      const fallbackProfile = fallbackApprovedBusinessOwner
        ? buildApprovedBusinessOwnerProfile(
            authUser,
            null,
            authUser.user_metadata?.full_name || authUser.app_metadata?.full_name || authUser.email
          )
        : {
            id: authUser.id,
            email: authUser.email,
            role: privilegedOwnerOverride ? 'owner' : (fallbackBusinessOwnerLikeAccount ? 'business_owner' : (authUser.user_metadata?.role || authUser.app_metadata?.role || 'customer')),
            username: authUser.user_metadata?.username || '',
            fullName: authUser.user_metadata?.full_name || authUser.app_metadata?.full_name || authUser.email,
            full_name: authUser.user_metadata?.full_name || authUser.app_metadata?.full_name || authUser.email,
            profile_picture_url:
              authUser.user_metadata?.profile_picture_url ||
              authUser.user_metadata?.avatar_url ||
              authUser.app_metadata?.profile_picture_url ||
              authUser.app_metadata?.avatar_url ||
              null,
            avatar_url:
              authUser.user_metadata?.avatar_url ||
              authUser.user_metadata?.profile_picture_url ||
              authUser.app_metadata?.avatar_url ||
              authUser.app_metadata?.profile_picture_url ||
              null,
            first_name: authUser.user_metadata?.first_name || '',
            last_name: authUser.user_metadata?.last_name || '',
            phone: authUser.user_metadata?.phone || '',
            phone_number: authUser.user_metadata?.phone || '',
            address: authUser.user_metadata?.address || '',
            date_of_birth: authUser.user_metadata?.date_of_birth || '',
            emergency_contact: authUser.user_metadata?.emergency_contact || '',
            emergency_phone: authUser.user_metadata?.emergency_phone || '',
            preferences: authUser.user_metadata?.preferences || {},
            staff_id_documents: authUser.user_metadata?.staff_id_documents || [],
            accountType: authUser.user_metadata?.account_type || authUser.app_metadata?.account_type || 'customer',
            permissions: Object.entries(
              fallbackBusinessOwnerLikeAccount
                ? buildBusinessOwnerPermissionMap()
                : {}
            ).map(([module_name, has_access]) => ({
              module_name,
              has_access,
            })),
            verificationStatus: authUser.user_metadata?.verification_status || authUser.app_metadata?.verification_status || 'pending',
            approvedAt: authUser.user_metadata?.approved_at || authUser.app_metadata?.approved_at || null,
            approvedBy: authUser.user_metadata?.approved_by || authUser.app_metadata?.approved_by || null,
            rejectionReason: authUser.user_metadata?.rejection_reason || authUser.app_metadata?.rejection_reason || '',
            subscriptionPlan: authUser.user_metadata?.subscription_plan || authUser.app_metadata?.subscription_plan || null,
            subscriptionStatus: authUser.user_metadata?.subscription_status || authUser.app_metadata?.subscription_status || null,
            planType: authUser.user_metadata?.plan_type || authUser.app_metadata?.plan_type || 'starter',
            billingStatus: authUser.user_metadata?.billing_status || authUser.app_metadata?.billing_status || 'none',
            trialStartedAt: authUser.user_metadata?.trial_started_at || authUser.app_metadata?.trial_started_at || null,
            trialEndsAt: authUser.user_metadata?.trial_ends_at || authUser.app_metadata?.trial_ends_at || null,
            subscriptionStartedAt: authUser.user_metadata?.subscription_started_at || authUser.app_metadata?.subscription_started_at || null,
            suspendedAt: authUser.user_metadata?.suspended_at || authUser.app_metadata?.suspended_at || null,
            suspensionReason: authUser.user_metadata?.suspension_reason || authUser.app_metadata?.suspension_reason || '',
            organizationId: authUser.user_metadata?.organization_id || authUser.app_metadata?.organization_id || null,
            organizationName: authUser.user_metadata?.organization_name || authUser.app_metadata?.organization_name || '',
            organizationRole: authUser.user_metadata?.organization_role || authUser.app_metadata?.organization_role || null,
            organizationStatus: authUser.user_metadata?.organization_status || authUser.app_metadata?.organization_status || null,
            isPlatformOrganization: Boolean(authUser.user_metadata?.is_platform_organization || authUser.app_metadata?.is_platform_organization),
      };
      setUserProfile(fallbackProfile);
      setSession(session);
      tenantSessionLoadSequenceRef.current += 1;
      setTenantSession(null);
      setPlatformAccess(buildPlatformAccessFallback(privilegedOwnerOverride));

      if (shouldSyncCustomerAccount(fallbackProfile, authUser) && !syncedCustomerAccountsRef.current.has(authUser.id)) {
        syncedCustomerAccountsRef.current.add(authUser.id);
        void syncCustomerAccountForAuthUser(authUser, fallbackProfile).catch((syncError) => {
          syncedCustomerAccountsRef.current.delete(authUser.id);
          console.warn('Unable to sync Gmail customer account into Customer Management:', syncError);
        });
      }
    } finally {
      setLoading(false);
      setInitialized(true);
      isLoadingProfile.current = false;
    }
  }, [hydrateTenantSession, resetAuthState, waitForActiveProfileLoad]);

  const recordAuthActivity = useCallback(async (authUser, currentSession, actionType = 'user_login') => {
    if (!authUser?.id || !currentSession?.access_token) {
      return;
    }

    const normalizedAction = actionType === 'user_logout' ? 'user_logout' : 'user_login';
    const sessionKey = `${authUser.id}:${normalizedAction}:${currentSession.access_token.slice(-16)}`;
    if (recordedAuthActivityRef.current.has(sessionKey)) {
      return;
    }

    try {
      const userName =
        authUser.user_metadata?.full_name ||
        authUser.app_metadata?.full_name ||
        authUser.email ||
        'User';
      const isLogout = normalizedAction === 'user_logout';

      const legacyPayload = {
        action: normalizedAction,
        user_email: authUser.email || userName,
        details: {
          description: isLogout ? 'User logged out' : 'User logged in',
          reason: isLogout ? `${userName} signed out` : `${userName} signed in successfully`,
          source: 'auth',
          role: authUser.user_metadata?.role || authUser.app_metadata?.role || null,
          actor_id: authUser.id,
        },
        created_at: new Date().toISOString(),
      };

      let { error } = await supabase
        .from(TABLE_NAMES.ACTIVITY_LOG)
        .insert(legacyPayload);

      if (error) {
        const fallbackPayload = {
          ...legacyPayload,
          title: normalizedAction,
        };

        ({ error } = await supabase
          .from(TABLE_NAMES.ACTIVITY_LOG)
          .insert(fallbackPayload));
      }

      if (error) {
        console.warn(`⚠️ Failed to record ${normalizedAction} activity:`, error);
        return;
      }

      recordedAuthActivityRef.current.add(sessionKey);
    } catch (error) {
      console.warn(`⚠️ Failed to record ${actionType} activity:`, error);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    let authListener = null;

    const initializeAuth = async () => {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();

        if (mounted) {
          if (currentSession?.user) {
            setSession(currentSession);
            void appWarmupService.warmCriticalModules();
          }
          const hydratedUser = currentSession?.user
            ? await applyPendingAccountIntent(currentSession.user)
            : null;
          await loadUserProfile(hydratedUser, currentSession);
        }

        // Set up auth state listener
        const { data: listener } = supabase.auth.onAuthStateChange(
          async (event, newSession) => {
            // Avoid full reloads only for true duplicate sign-in events, such as tab focus
            // refreshes for the same already-loaded user. A fresh login still needs profile
            // and permission loading.
            if (event === 'SIGNED_IN' && sessionRef.current) {
              const currentUserId = sessionRef.current?.user?.id;
              const nextUserId = newSession?.user?.id;
              const hasLoadedProfile = userProfileRef.current?.id === nextUserId;

              if (nextUserId && currentUserId === nextUserId && hasLoadedProfile) {
                if (mounted) {
                  setSession(newSession);
                  setLoading(false);
                  setInitialized(true);
                  void appWarmupService.warmCriticalModules();
                }
                return;
              }
            }
            
            // Only reload profile on actual auth state changes
            if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
              if (mounted) {
                if (event !== 'USER_UPDATED') {
                  setLoading(true);
                }
                if (newSession?.user) {
                  const hydratedUser = await applyPendingAccountIntent(newSession.user);
                  const hydratedSession = hydratedUser === newSession.user
                    ? newSession
                    : { ...newSession, user: hydratedUser };
                  setSession(hydratedSession);
                  void appWarmupService.warmCriticalModules();
                  await loadUserProfile(hydratedUser, hydratedSession);
                  if (event === 'SIGNED_IN') {
                    void recordAuthActivity(hydratedUser, hydratedSession, 'user_login');
                  }
                } else {
                  await loadUserProfile(null, newSession);
                }
              }
            } else if (event === 'TOKEN_REFRESHED') {
              // Just update the session without reloading the entire profile
              if (mounted) {
                setSession(newSession);
              }
            }
          }
        );

        authListener = listener;
      } catch (error) {
        if (isAbortLikeError(error)) {
          console.warn('Auth initialization aborted during client reconfiguration.');
        } else if (isRetryableFetchLikeError(error)) {
          console.warn('Auth initialization failed while recovering a persisted session. Clearing local auth cache.', error);
          clearActiveSupabaseSessionStorage();
        } else {
          console.error('Auth initialization error:', error);
        }
        if (mounted) {
          resetAuthState();
        }
      }
    };

    initializeAuth();

    return () => {
      mounted = false;
      if (authListener) {
        authListener.subscription.unsubscribe();
      }
    };
  }, [applyPendingAccountIntent, loadUserProfile, recordAuthActivity, resetAuthState]);

  useEffect(() => {
    if (!userProfile?.id || !session?.user) return;

    const permissionChannel = supabase
      .channel(`auth_profile_permissions_${userProfile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'app_b30c02e74da644baad4668e3587d86b1_users',
          filter: `id=eq.${userProfile.id}`,
        },
        async () => {
          try {
            await loadUserProfile(session.user, session);
          } catch (error) {
            console.error('Failed to refresh user profile after permission update:', error);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(permissionChannel);
    };
  }, [userProfile?.id, session, loadUserProfile]);

  const signIn = async (email, password) => {
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error && data?.session) {
      const hydratedUser = await applyPendingAccountIntent(data.session.user);
      const hydratedSession = hydratedUser === data.session.user
        ? data.session
        : { ...data.session, user: hydratedUser };
      setSession(hydratedSession);
      void appWarmupService.warmCriticalModules();
      await loadUserProfile(hydratedUser, hydratedSession);
      void recordAuthActivity(hydratedUser, hydratedSession, 'user_login');
    }
    if (error) {
      setLoading(false);
    }
    return { data, error };
  };

  const signInWithGoogle = async () => {
    setLoading(true);

    try {
      const redirectTo = getPreferredOAuthRedirectTo();

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
        },
      });

      if (error) {
        setLoading(false);
        return { data, error };
      }

      const destinationUrl = buildPreferredOAuthUrl(data?.url, redirectTo);

      if (destinationUrl && typeof window !== 'undefined') {
        window.location.assign(destinationUrl);
        return { data: { ...data, url: destinationUrl }, error: null };
      }

      setLoading(false);
      return { data, error };
    } catch (error) {
      setLoading(false);
      return { data: null, error };
    }
  };

  const signUp = async (email, password, userData = {}) => {
    setLoading(true);

    try {
      const accountType = userData.account_type || 'customer';
      const normalizedLanguage = userData.default_language || 'en';
      const verificationStatus =
        accountType === 'customer'
          ? 'active'
          : userData.verification_status || 'pending_verification';

      const metadata = {
        full_name: userData.full_name || '',
        role: 'customer',
        account_type: accountType,
        default_language: normalizedLanguage,
        phone: userData.phone || '',
        city: userData.city || '',
        country: userData.country || '',
        company_name: userData.company_name || '',
        company_ice_number: userData.company_ice_number || userData.company_rc_number || '',
        service_area: userData.service_area || '',
        vehicle_count_hint: userData.vehicle_count_hint || '',
        categories_interest: userData.categories_interest || [],
        marketplace_enabled: Boolean(userData.marketplace_enabled),
        verification_status: verificationStatus,
        onboarding_completed: true,
      };

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: metadata,
        }
      });

      if (error) {
        setLoading(false);
        return { user: null, error };
      }

      if (data?.user?.id && data?.session) {
        try {
          const { error: profileSeedError } = await supabase
            .from('app_b30c02e74da644baad4668e3587d86b1_users')
            .upsert({
              id: data.user.id,
              email,
              full_name: metadata.full_name || email,
              role: 'customer',
              phone_number: metadata.phone || null,
            }, { onConflict: 'id' });
          if (profileSeedError) {
            console.warn('Unable to seed app user profile during signup:', profileSeedError);
          }
        } catch (profileError) {
          console.warn('Unable to seed app user profile during signup:', profileError);
        }
      }

      setLoading(false);
      return { user: data?.user || null, error: null };
    } catch (error) {
      setLoading(false);
      return { user: null, error };
    }
  };

  const signOut = async () => {
    setLoading(true);
    
    try {
      // Check if there's an active session first
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      
      if (!currentSession) {
        // Clear local state manually
        setUserProfile(null);
        setSession(null);
        setLoading(false);
        
        // Clear storage
        localStorage.clear();
        sessionStorage.clear();
        
        return { error: null };
      }

      await recordAuthActivity(currentSession.user, currentSession, 'user_logout');
      
      // Use local scope instead of global to avoid 403 errors
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      
      if (error) {
        console.error('❌ Sign out error:', error);

        // If sign out fails, try fallback method
        // Clear local state
        setUserProfile(null);
        setSession(null);
        
        // Clear all storage
        localStorage.clear();
        sessionStorage.clear();
        
        // Clear cookies
        document.cookie.split(";").forEach((c) => {
          document.cookie = c
            .replace(/^ +/, "")
            .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
        });
        
        setLoading(false);
        return { error: null }; // Return success even if API failed, since we cleared locally
      }
      
      setLoading(false);
      return { error: null };
      
    } catch (err) {
      console.error('❌ Sign out exception:', err);
      
      // Fallback: clear everything locally
      setUserProfile(null);
      setSession(null);
      localStorage.clear();
      sessionStorage.clear();
      setLoading(false);
      
      return { error: null }; // Return success since we cleared locally
    }
  };

  const hasPermission = useCallback((moduleName) => {
    if (!userProfile) return false;
    const normalizedEmail = (userProfile.email || '').toLowerCase();
    const platformOwnerOverride = isPlatformOwnerEmail(normalizedEmail);
    const hostContext = getHostContext();
    const isFirstPartyWorkspace = isFirstPartyTenantHost(hostContext);
    const rawTenantFeatureAccess =
      tenantSession?.effectiveFeatureAccess && typeof tenantSession.effectiveFeatureAccess === 'object'
        ? tenantSession.effectiveFeatureAccess
        : tenantSession?.tenant?.metadata?.effective_feature_access && typeof tenantSession.tenant.metadata.effective_feature_access === 'object'
          ? tenantSession.tenant.metadata.effective_feature_access
        : (
          tenantSession?.featureAccess && typeof tenantSession.featureAccess === 'object'
            ? tenantSession.featureAccess
            : tenantSession?.tenant?.metadata?.feature_access && typeof tenantSession.tenant.metadata.feature_access === 'object'
              ? tenantSession.tenant.metadata.feature_access
            : {}
        );
    const tenantPlanType = normalizeTenantPlanType(
      tenantSession?.subscription?.plan_type ||
      tenantSession?.planType ||
      userProfile?.planType ||
      session?.user?.user_metadata?.plan_type ||
      session?.user?.app_metadata?.plan_type ||
      (isFirstPartyWorkspace ? 'pro' : 'starter')
    );
    const tenantFeatureAccess = buildEffectiveTenantFeatureAccess(
      isFirstPartyWorkspace ? 'pro' : tenantPlanType,
      rawTenantFeatureAccess
    );
    const enforceTenantFeatureAccess =
      !isFirstPartyWorkspace && (
        String(userProfile.role || '').toLowerCase() === 'business_owner'
        || shouldScopeSharedTenantData(hostContext)
      );
    const resolvedModuleKey = resolvePermissionKey(moduleName);
    const normalizedPlatformPermissions =
      platformAccess?.permissions && typeof platformAccess.permissions === 'object' && !Array.isArray(platformAccess.permissions)
        ? platformAccess.permissions
        : {};

    if (PLATFORM_PERMISSION_MODULES.has(resolvedModuleKey)) {
      if (platformOwnerOverride) {
        return true;
      }

      if (platformAccess?.access_enabled === false) {
        return false;
      }

      return normalizedPlatformPermissions[resolvedModuleKey] === true;
    }

    if (String(userProfile.role || '').toLowerCase() === 'owner' || platformOwnerOverride) {
      return enforceTenantFeatureAccess
        ? isTenantModuleEnabled(moduleName, tenantFeatureAccess, tenantPlanType)
        : true;
    }

    const dbName = resolvedModuleKey;
    const permissionList = Array.isArray(userProfile.permissions) ? userProfile.permissions : [];
    const permission = permissionList.find((entry) =>
      String(entry?.module_name || '').toLowerCase() === dbName.toLowerCase()
    );

    const hasBasePermission = permission ? permission.has_access === true : false;

    if (!hasBasePermission) {
      return false;
    }

    if (!enforceTenantFeatureAccess) {
      return true;
    }

    return isTenantModuleEnabled(moduleName, tenantFeatureAccess, tenantPlanType);
  }, [
    platformAccess?.access_enabled,
    platformAccess?.permissions,
    session?.user?.app_metadata?.plan_type,
    session?.user?.user_metadata?.plan_type,
    tenantSession?.planType,
    tenantSession?.subscription?.plan_type,
    tenantSession?.effectiveFeatureAccess,
    tenantSession?.featureAccess,
    tenantSession?.tenant?.metadata?.effective_feature_access,
    tenantSession?.tenant?.metadata?.feature_access,
    userProfile,
  ]);

  const hasFeature = useCallback((featureKey) => {
    if (!userProfile) return false;

    const normalizedEmail = (userProfile.email || '').toLowerCase();
    if (isPlatformOwnerEmail(normalizedEmail)) {
      return true;
    }

    const hostContext = getHostContext();
    if (isFirstPartyTenantHost(hostContext)) {
      return true;
    }

    const tenantPlanType = normalizeTenantPlanType(
      tenantSession?.subscription?.plan_type ||
      tenantSession?.planType ||
      userProfile?.planType ||
      session?.user?.user_metadata?.plan_type ||
      session?.user?.app_metadata?.plan_type ||
      'starter'
    );
    const rawTenantFeatureAccess =
      tenantSession?.effectiveFeatureAccess && typeof tenantSession.effectiveFeatureAccess === 'object'
        ? tenantSession.effectiveFeatureAccess
        : tenantSession?.tenant?.metadata?.effective_feature_access && typeof tenantSession.tenant.metadata.effective_feature_access === 'object'
          ? tenantSession.tenant.metadata.effective_feature_access
        : (
          tenantSession?.featureAccess && typeof tenantSession.featureAccess === 'object'
            ? tenantSession.featureAccess
            : tenantSession?.tenant?.metadata?.feature_access && typeof tenantSession.tenant.metadata.feature_access === 'object'
              ? tenantSession.tenant.metadata.feature_access
            : {}
        );
    const tenantFeatureAccess = buildEffectiveTenantFeatureAccess(tenantPlanType, rawTenantFeatureAccess);

    return isTenantFeatureEnabled(featureKey, tenantFeatureAccess, tenantPlanType);
  }, [
    session?.user?.app_metadata?.plan_type,
    session?.user?.user_metadata?.plan_type,
    tenantSession?.planType,
    tenantSession?.subscription?.plan_type,
    tenantSession?.effectiveFeatureAccess,
    tenantSession?.featureAccess,
    tenantSession?.tenant?.metadata?.effective_feature_access,
    tenantSession?.tenant?.metadata?.feature_access,
    userProfile,
  ]);

  const refreshPermissions = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
        setLoading(true);
        await loadUserProfile(user, session);
    }
  }, [session, loadUserProfile]);

  const getBusinessOwnerHomePath = useCallback((metadata = null) => {
    const normalizedEmail = String(userProfile?.email || session?.user?.email || '').trim().toLowerCase();
    if (isPlatformOwnerEmail(normalizedEmail)) {
      return null;
    }
    const host = getHostContext();
    if (host?.isLocal && host?.kind === 'admin') {
      return null;
    }
    const normalizedRole = String(userProfile?.role || session?.user?.user_metadata?.role || session?.user?.app_metadata?.role || '').trim().toLowerCase();
    if (host.kind === 'tenant' && ['owner', 'admin', 'employee', 'guide'].includes(normalizedRole)) {
      return null;
    }

    const profileMetadata = metadata || {
      account_type: userProfile?.accountType || session?.user?.user_metadata?.account_type || session?.user?.app_metadata?.account_type,
      verification_status: userProfile?.verificationStatus || session?.user?.user_metadata?.verification_status || session?.user?.app_metadata?.verification_status,
      subscription_status: userProfile?.subscriptionStatus || session?.user?.user_metadata?.subscription_status || session?.user?.app_metadata?.subscription_status,
      billing_status: userProfile?.billingStatus || session?.user?.user_metadata?.billing_status || session?.user?.app_metadata?.billing_status,
    };

    if (!hasBusinessOwnerRequest(profileMetadata)) {
      return null;
    }

    const workspaceState = String(tenantSession?.workspace_state || tenantSession?.workspaceState || '').trim().toLowerCase();
    if (workspaceState === 'expired' || workspaceState === 'billing_issue') {
      return '/choose-plan';
    }

    if (workspaceState || tenantSession?.tenant || tenantSession?.tenantId) {
      const sessionIndicatesProvisionedBusinessOwner =
        Boolean(tenantSession?.tenant || tenantSession?.tenantId) ||
        ['pending', 'provisioning', 'tenant_ready', 'failed', 'suspended', 'no_workspace'].includes(workspaceState);
      const entry = resolveUserEntry({
        approved: isApprovedBusinessOwnerAccount(profileMetadata) || sessionIndicatesProvisionedBusinessOwner,
        tenantSession,
      });

      if (entry?.type === 'external' && entry?.target) {
        if (host.kind === 'tenant' && typeof window !== 'undefined') {
          try {
            const targetUrl = new URL(entry.target);
            const currentHostname = String(window.location.hostname || '').trim().toLowerCase();
            const targetHostname = String(targetUrl.hostname || '').trim().toLowerCase();

            if (currentHostname && currentHostname === targetHostname) {
              return null;
            }
          } catch (error) {
            console.warn('Unable to normalize tenant workspace redirect target:', error);
          }
        }
      }

      return entry.target;
    }

    return getBusinessOwnerFreezeRedirect(profileMetadata);
  }, [
    session?.user?.app_metadata?.account_type,
    session?.user?.app_metadata?.billing_status,
    session?.user?.app_metadata?.subscription_status,
    session?.user?.app_metadata?.verification_status,
    session?.user?.user_metadata?.account_type,
    session?.user?.user_metadata?.billing_status,
    session?.user?.user_metadata?.subscription_status,
    session?.user?.user_metadata?.verification_status,
    tenantSession?.workspaceState,
    tenantSession?.workspace_state,
    userProfile?.email,
    userProfile?.accountType,
    userProfile?.billingStatus,
    userProfile?.subscriptionStatus,
    userProfile?.verificationStatus,
    session?.user?.email,
  ]);

  const getUserRole = useCallback(() => {
    if (userProfile?.role) {
      return userProfile.role;
    }

    return session?.user?.user_metadata?.role || session?.user?.app_metadata?.role || 'customer';
  }, [session?.user?.app_metadata?.role, session?.user?.user_metadata?.role, userProfile?.role]);

  const updateCurrentUserProfile = useCallback((updates = {}) => {
    setUserProfile((prev) => {
      const nextFirstName = updates?.first_name ?? prev?.first_name ?? '';
      const nextLastName = updates?.last_name ?? prev?.last_name ?? '';
      const nextFullName =
        String(
          updates?.fullName ||
          updates?.full_name ||
          [nextFirstName, nextLastName].filter(Boolean).join(' ').trim() ||
          prev?.fullName ||
          prev?.full_name ||
          prev?.email ||
          ''
        ).trim();

      return {
        ...(prev || {}),
        ...updates,
        username: updates?.username ?? prev?.username ?? '',
        first_name: nextFirstName,
        last_name: nextLastName,
        fullName: nextFullName,
        full_name: nextFullName,
      };
    });
  }, []);

  const startPrivateOwnerSetup = useCallback(async () => {
    const currentAccountType = String(
      userProfile?.accountType ||
      session?.user?.user_metadata?.account_type ||
      session?.user?.app_metadata?.account_type ||
      'customer'
    ).trim().toLowerCase();

    if (currentAccountType === 'business_owner' || currentAccountType === 'operator' || currentAccountType === 'business') {
      return { success: false, skipped: true, reason: 'business_owner_account' };
    }

    return { success: true, persisted: false };
  }, [session?.user?.app_metadata?.account_type, session?.user?.user_metadata?.account_type, userProfile?.accountType]);

  const activatePrivateOwnerAccount = useCallback(async (intent = {}) => {
    const currentAccountType = String(
      userProfile?.accountType ||
      session?.user?.user_metadata?.account_type ||
      session?.user?.app_metadata?.account_type ||
      'customer'
    ).trim().toLowerCase();

    if (currentAccountType === 'business_owner' || currentAccountType === 'operator' || currentAccountType === 'business') {
      return { success: false, skipped: true, reason: 'business_owner_account' };
    }

    const pendingIntent = {
      account_type: 'private_owner',
      marketplace_enabled: true,
      ...intent,
    };
    setPendingAccountIntent(pendingIntent);

    const localProfilePatch = {
      accountType: 'private_owner',
      account_type: 'private_owner',
      marketplaceEnabled: true,
      verificationStatus:
        currentAccountType === 'customer'
          ? 'pending_verification'
          : userProfile?.verificationStatus || 'pending_verification',
    };

    updateCurrentUserProfile(localProfilePatch);

    if (!session?.user) {
      return { success: true, persisted: false };
    }

    const nextMetadata = {
      ...session.user.user_metadata,
      account_type: 'private_owner',
      marketplace_enabled: true,
      verification_status:
        session.user.user_metadata?.verification_status === 'approved'
          ? 'approved'
          : 'pending_verification',
    };

    try {
      const { data, error } = await supabase.auth.updateUser({ data: nextMetadata });
      if (error) throw error;

      if (data?.user) {
        setSession((prev) => (prev ? { ...prev, user: data.user } : prev));
        updateCurrentUserProfile({
          accountType: data.user.user_metadata?.account_type || 'private_owner',
          account_type: data.user.user_metadata?.account_type || 'private_owner',
          verificationStatus: data.user.user_metadata?.verification_status || localProfilePatch.verificationStatus,
          marketplaceEnabled: Boolean(data.user.user_metadata?.marketplace_enabled),
        });
      }

      clearPendingAccountIntent();

      return { success: true, persisted: true };
    } catch (error) {
      console.warn('Failed to persist private owner setup immediately:', error);
      return { success: true, persisted: false, error };
    }
  }, [session?.user, updateCurrentUserProfile, userProfile?.accountType, userProfile?.verificationStatus]);

  const value = {
    user: userProfile,
    userProfile,
    updateCurrentUserProfile,
    startPrivateOwnerSetup,
    activatePrivateOwnerAccount,
    session,
    loading,
    initialized,
    signIn,
    signInWithGoogle,
    signUp,
    signOut,
    hasPermission,
    hasFeature,
    refreshPermissions,
    getUserRole,
    tenantSession,
    platformAccess,
    getBusinessOwnerHomePath,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;
