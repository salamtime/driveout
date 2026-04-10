import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { getUserPermissions } from '../services/UserService';
import { shouldSyncCustomerAccount, syncCustomerAccountForAuthUser } from '../services/CustomerAccountSyncService';
import { adminApiRequest } from '../services/adminApi';
import appWarmupService from '../services/AppWarmupService';
import { clearPermissionCache } from '../utils/permissionHelpers';
import {
  normalizePermissionMap as normalizeCatalogPermissionMap,
  buildBusinessOwnerPermissionMap,
} from '../utils/permissionCatalog';
import { getBusinessOwnerFreezeRedirect, hasBusinessOwnerRequest, isApprovedBusinessOwnerAccount, isPlatformOwnerEmail } from '../utils/accountType';
import { resolveUserEntry } from '../utils/tenantEntryResolver';

const AuthContext = createContext(null);
const PENDING_ACCOUNT_INTENT_KEY = 'saharax_pending_account_type';

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

const getPreferredOAuthRedirectTo = () => {
  if (typeof window === 'undefined') return undefined;
  const origin = String(window.location.origin || '').trim();
  const hostname = String(window.location.hostname || '').toLowerCase();
  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';

  if (import.meta.env.DEV && isLocalHost) {
    return 'http://localhost:5173/login';
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
    const currentHost = String(window.location.hostname || '').toLowerCase();
    const isLocalHost = currentHost === 'localhost' || currentHost === '127.0.0.1';

    if (!isLocalHost) {
      return preferredUrl.toString();
    }

    const normalizedRedirectTo = redirectTo.trim();
    const currentRedirectTo = preferredUrl.searchParams.get('redirect_to');
    const currentRedirectUri = preferredUrl.searchParams.get('redirect_uri');

    if (currentRedirectTo && currentRedirectTo !== normalizedRedirectTo) {
      preferredUrl.searchParams.set('redirect_to', normalizedRedirectTo);
    }

    if (currentRedirectUri && currentRedirectUri !== normalizedRedirectTo) {
      preferredUrl.searchParams.set('redirect_uri', normalizedRedirectTo);
    }

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

const buildApprovedBusinessOwnerProfile = (authUser, appUserRecord, fullName) => {
  const businessOwnerPermissions = buildBusinessOwnerPermissionMap();

  return {
    id: authUser.id,
    email: authUser.email,
    role: 'business_owner',
    fullName,
    accountType: authUser.user_metadata?.account_type || authUser.app_metadata?.account_type || 'operator',
    permissions: Object.entries(businessOwnerPermissions).map(([module_name, has_access]) => ({
      module_name,
      has_access,
    })),
    accessEnabled: appUserRecord?.access_enabled ?? true,
    verificationStatus: appUserRecord?.verification_status || authUser.user_metadata?.verification_status || 'approved',
    approvedAt: appUserRecord?.approved_at || authUser.user_metadata?.approved_at || null,
    approvedBy: appUserRecord?.approved_by || authUser.user_metadata?.approved_by || null,
    rejectionReason: appUserRecord?.rejection_reason || authUser.user_metadata?.rejection_reason || '',
    subscriptionPlan: appUserRecord?.subscription_plan || authUser.user_metadata?.subscription_plan || 'free_trial',
    subscriptionStatus: appUserRecord?.subscription_status || authUser.user_metadata?.subscription_status || 'trial',
    planType: appUserRecord?.plan_type || authUser.user_metadata?.plan_type || 'starter',
    billingStatus: appUserRecord?.billing_status || authUser.user_metadata?.billing_status || 'none',
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

export const AuthProvider = ({ children }) => {
  const [userProfile, setUserProfile] = useState(() => {
    try {
      const storedProfile = localStorage.getItem('userProfile');
      return storedProfile ? JSON.parse(storedProfile) : null;
    } catch (error) {
      console.warn('Failed to read persisted user profile:', error);
      return null;
    }
  });
  const [session, setSession] = useState(null);
  const [tenantSession, setTenantSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const isLoadingProfile = useRef(false);
  
  // ⚠️ CRITICAL FIX: Use ref to track latest session state for auth listener
  const sessionRef = useRef(null);
  const userProfileRef = useRef(null);
  const recordedAuthActivityRef = useRef(new Set());
  const syncedCustomerAccountsRef = useRef(new Set());

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
        localStorage.setItem('userProfile', JSON.stringify(userProfile));
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
      ['service_area', pendingIntent.service_area],
      ['vehicle_count_hint', pendingIntent.vehicle_count_hint],
      ['categories_interest', pendingIntent.categories_interest],
    ].forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        metadataPatch[key] = value;
      }
    });

    try {
      const { data, error } = await supabase.auth.updateUser({
        data: {
          ...authUser.user_metadata,
          ...metadataPatch,
        },
      });

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

  const loadUserProfile = useCallback(async (authUser, session) => {
    // Prevent duplicate profile loads
    if (isLoadingProfile.current) {
      return;
    }

    if (!authUser) {
      setUserProfile(null);
      setSession(null);
      setLoading(false);
      setInitialized(true);
      return;
    }

    isLoadingProfile.current = true;

    try {
      const appUserRecordPromise = adminApiRequest('/api/me/profile')
        .then((response) => ({ data: response?.profile || null, error: null }))
        .catch((error) => ({ data: null, error }));

      const rpcPermissionsPromise = getUserPermissions(authUser.id);
      const [
        { data: appUserRecord, error: appUserError },
        rpcPermissionsMap,
      ] = await Promise.all([appUserRecordPromise, rpcPermissionsPromise]);

      const metadataRole =
        authUser.user_metadata?.role ||
        authUser.app_metadata?.role ||
        null;
      const localStorageRole =
        typeof window !== 'undefined' ? window.localStorage.getItem('saharax_user_role') : null;
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
      const approvedBusinessOwner = !privilegedOwnerOverride && isApprovedBusinessOwnerAccount(authUser.user_metadata || authUser.app_metadata || {});
      const userPermissionsMap = approvedBusinessOwner
        ? {
            ...mergedPermissionMap,
            ...buildBusinessOwnerPermissionMap(),
          }
        : mergedPermissionMap;
      
      // Convert permissions map to array format for backward compatibility
      const userPermissions = Object.entries(userPermissionsMap).map(([module_name, is_allowed]) => ({
        module_name,
        has_access: is_allowed
      }));

      const inferredRole = inferRoleFromPermissions(userPermissionsMap);
      const userRole =
        approvedBusinessOwner
          ? 'business_owner'
          : appUserRecord?.role ||
        (metadataRole && metadataRole !== 'customer' ? metadataRole : null) ||
        (localStorageRole && localStorageRole !== 'customer' ? localStorageRole : null) ||
        (inferredRole !== 'customer' ? inferredRole : null) ||
        (privilegedOwnerOverride ? 'owner' : null) ||
        metadataRole ||
        'customer';
      
      const profile = approvedBusinessOwner
        ? buildApprovedBusinessOwnerProfile(authUser, appUserRecord, fullName)
        : {
            id: authUser.id,
            email: authUser.email,
            role: userRole,
            username: hasAppField('username') ? (appUserRecord?.username || '') : (authUser.user_metadata?.username || ''),
            fullName,
            full_name: hasAppField('full_name') ? appUserRecord?.full_name : fullName,
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
            verificationStatus: appUserRecord?.verification_status || authUser.user_metadata?.verification_status || authUser.app_metadata?.verification_status || 'pending',
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

      if (!privilegedOwnerOverride && hasBusinessOwnerRequest({
        account_type: profile?.accountType,
        certification_request_status: session?.user?.user_metadata?.certification_request_status || session?.user?.app_metadata?.certification_request_status,
      })) {
        try {
          const tenantResponse = await adminApiRequest('/api/tenants?resource=session');
          setTenantSession(tenantResponse?.session || null);
        } catch (tenantError) {
          console.warn('Unable to load tenant session:', tenantError);
          setTenantSession(null);
        }
      } else {
        setTenantSession(null);
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
      const fallbackProfile = !privilegedOwnerOverride && isApprovedBusinessOwnerAccount(authUser.user_metadata || authUser.app_metadata || {})
        ? buildApprovedBusinessOwnerProfile(
            authUser,
            null,
            authUser.user_metadata?.full_name || authUser.app_metadata?.full_name || authUser.email
          )
        : {
            id: authUser.id,
            email: authUser.email,
            role: privilegedOwnerOverride ? 'owner' : (authUser.user_metadata?.role || authUser.app_metadata?.role || 'customer'),
            username: authUser.user_metadata?.username || '',
            fullName: authUser.user_metadata?.full_name || authUser.app_metadata?.full_name || authUser.email,
            full_name: authUser.user_metadata?.full_name || authUser.app_metadata?.full_name || authUser.email,
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
            permissions: [],
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
      setTenantSession(null);

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
  }, []);

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

      const payload = {
        actor_id: authUser.id,
        actor_type: 'user',
        event_type: normalizedAction,
        entity_type: 'auth',
        entity_id: authUser.id,
        user_name: userName,
        payload: {
          description: isLogout ? 'User logged out' : 'User logged in',
          reason: isLogout ? `${userName} signed out` : `${userName} signed in successfully`,
          source: 'auth',
        },
        metadata: {
          email: authUser.email || null,
          role: authUser.user_metadata?.role || authUser.app_metadata?.role || null,
        },
      };

      const { error } = await supabase
        .from('saharax_0u4w4d_activity_log')
        .insert(payload);

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
        console.error('Auth initialization error:', error);
        if (mounted) {
          setLoading(false);
          setInitialized(true);
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
  }, [applyPendingAccountIntent, loadUserProfile, recordAuthActivity]);

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
      setSession(data.session);
      await loadUserProfile(data.session.user, data.session);
      void recordAuthActivity(data.session.user, data.session, 'user_login');
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

      if (data?.user?.id) {
        try {
          await supabase
            .from('app_b30c02e74da644baad4668e3587d86b1_users')
            .upsert({
              id: data.user.id,
              email,
              full_name: metadata.full_name || email,
              role: 'customer',
              phone_number: metadata.phone || null,
            }, { onConflict: 'id' });
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
    const emergencyRole = isPlatformOwnerEmail(normalizedEmail) ? 'owner' : null;

    if (userProfile.role === 'owner' || emergencyRole === 'owner' || emergencyRole === 'admin') {
        return true;
    }
    
    // Map short module names to full database names
    const nameMap = {
      'dashboard': 'Dashboard',
      'calendar': 'Calendar',
      'tours': 'Tours & Bookings',
      'tasks': 'Team Tasks',
      'rentals': 'Rental Management',
      'customers': 'Customer Management',
      'fleet': 'Fleet Management',
      'pricing': 'Pricing Management',
      'maintenance': 'Quad Maintenance',
      'fuel': 'Fuel Logs',
      'inventory': 'Inventory',
      'finance': 'Finance Management',
      'alerts': 'Alerts',
      'users': 'User & Role Management',
      'verification': 'Verification Center',
      'workspaces': 'Workspaces',
      'settings': 'System Settings',
      'export': 'Project Export'
    };

    if (['verification', 'workspaces'].includes(moduleName.toLowerCase()) && userProfile.role === 'admin') {
      return true;
    }
    
    // Get the full database name from the map, or use the original name if not found
    const dbName = nameMap[moduleName.toLowerCase()] || moduleName;
    const permission = userProfile.permissions.find(p => p.module_name.toLowerCase() === dbName.toLowerCase());
    return permission ? permission.has_access : false;
  }, [userProfile]);

  const refreshPermissions = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
        setLoading(true);
        await loadUserProfile(user, session);
    }
  }, [session, loadUserProfile]);

  const getBusinessOwnerHomePath = useCallback((metadata = null) => {
    const profileMetadata = metadata || {
      account_type: userProfile?.accountType || session?.user?.user_metadata?.account_type || session?.user?.app_metadata?.account_type,
      verification_status: userProfile?.verificationStatus || session?.user?.user_metadata?.verification_status || session?.user?.app_metadata?.verification_status,
      subscription_status: userProfile?.subscriptionStatus || session?.user?.user_metadata?.subscription_status || session?.user?.app_metadata?.subscription_status,
    };

    if (!hasBusinessOwnerRequest(profileMetadata)) {
      return null;
    }

    const workspaceState = String(tenantSession?.workspace_state || tenantSession?.workspaceState || '').trim().toLowerCase();
    if (workspaceState === 'expired') {
      return '/choose-plan';
    }

    if (workspaceState || tenantSession?.tenant || tenantSession?.tenantId) {
      const entry = resolveUserEntry({
        approved: isApprovedBusinessOwnerAccount(profileMetadata),
        tenantSession,
      });
      return entry.target;
    }

    return getBusinessOwnerFreezeRedirect(profileMetadata);
  }, [
    session?.user?.app_metadata?.account_type,
    session?.user?.app_metadata?.subscription_status,
    session?.user?.app_metadata?.verification_status,
    session?.user?.user_metadata?.account_type,
    session?.user?.user_metadata?.subscription_status,
    session?.user?.user_metadata?.verification_status,
    tenantSession?.workspaceState,
    tenantSession?.workspace_state,
    userProfile?.accountType,
    userProfile?.subscriptionStatus,
    userProfile?.verificationStatus,
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

  const value = {
    user: userProfile,
    userProfile,
    updateCurrentUserProfile,
    session,
    loading,
    initialized,
    signIn,
    signInWithGoogle,
    signUp,
    signOut,
    hasPermission,
    refreshPermissions,
    getUserRole,
    tenantSession,
    getBusinessOwnerHomePath,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;
