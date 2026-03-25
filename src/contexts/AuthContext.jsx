import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { getUserPermissions } from '../services/UserService';

const AuthContext = createContext(null);
const EMERGENCY_ADMIN_EMAILS = ['salamtime2016@gmail.com'];

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

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [userProfile, setUserProfile] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const isLoadingProfile = useRef(false);
  
  // ⚠️ CRITICAL FIX: Use ref to track latest session state for auth listener
  const sessionRef = useRef(null);
  const userProfileRef = useRef(null);

  // Update refs whenever state changes
  useEffect(() => {
    sessionRef.current = session;
    userProfileRef.current = userProfile;
    console.log('🔄 State refs updated - session:', session ? 'Has session' : 'NULL', '- userProfile:', userProfile ? 'Has user' : 'NULL');
  }, [session, userProfile]);

  const loadUserProfile = useCallback(async (authUser, session) => {
    // Prevent duplicate profile loads
    if (isLoadingProfile.current) {
      console.log('🔄 Profile load already in progress, skipping...');
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
      const { data: appUserRecord, error: appUserError } = await supabase
        .from('app_b30c02e74da644baad4668e3587d86b1_users')
        .select('role, full_name, access_enabled, permissions')
        .eq('id', authUser.id)
        .maybeSingle();

      if (appUserError) {
        console.warn('Failed to load app user record, falling back to auth metadata:', appUserError);
      }

      const metadataRole =
        authUser.user_metadata?.role ||
        authUser.app_metadata?.role ||
        null;
      const localStorageRole =
        typeof window !== 'undefined' ? window.localStorage.getItem('saharax_user_role') : null;
      const fullName =
        appUserRecord?.full_name ||
        authUser.user_metadata?.full_name ||
        authUser.app_metadata?.full_name ||
        authUser.email;
      
      if (!authUser.id) {
        throw new Error(`Invalid userId: ${authUser.id}`);
      }

      // Call getUserPermissions with only userId parameter
      const rpcPermissionsMap = await getUserPermissions(authUser.id);
      const storedPermissionsMap =
        appUserRecord?.permissions && typeof appUserRecord.permissions === 'object' && !Array.isArray(appUserRecord.permissions)
          ? appUserRecord.permissions
          : {};
      const userPermissionsMap = {
        ...storedPermissionsMap,
        ...rpcPermissionsMap,
      };
      
      console.log('🔍 DEBUG: userPermissionsMap from getUserPermissions:', userPermissionsMap);
      
      // Convert permissions map to array format for backward compatibility
      const userPermissions = Object.entries(userPermissionsMap).map(([module_name, is_allowed]) => ({
        module_name,
        has_access: is_allowed
      }));

      const inferredRole = inferRoleFromPermissions(userPermissionsMap);
      const userRole =
        appUserRecord?.role ||
        (metadataRole && metadataRole !== 'customer' ? metadataRole : null) ||
        (localStorageRole && localStorageRole !== 'customer' ? localStorageRole : null) ||
        (inferredRole !== 'customer' ? inferredRole : null) ||
        (EMERGENCY_ADMIN_EMAILS.includes((authUser.email || '').toLowerCase()) ? 'admin' : null) ||
        metadataRole ||
        'customer';
      
      console.log('🔍 DEBUG: userPermissions array after conversion:', userPermissions);
      console.log('🔍 DEBUG: Role resolution:', {
        appUserRole: appUserRecord?.role,
        metadataRole,
        localStorageRole,
        inferredRole,
        finalRole: userRole,
      });
      
      const profile = {
        id: authUser.id,
        email: authUser.email,
        role: userRole,
        fullName,
        permissions: userPermissions,
        accessEnabled: appUserRecord?.access_enabled ?? true,
      };
      
      console.log('🔍 DEBUG: Final profile object:', profile);

      setUserProfile(profile);
      setSession(session);
    } catch (error) {
      console.error('Failed to load user profile and permissions:', error);
      setUserProfile({
        id: authUser.id,
        email: authUser.email,
        role: authUser.user_metadata?.role || authUser.app_metadata?.role || 'customer',
        fullName: authUser.user_metadata?.full_name || authUser.app_metadata?.full_name || authUser.email,
        permissions: [],
      });
      setSession(session);
    } finally {
      setLoading(false);
      setInitialized(true);
      isLoadingProfile.current = false;
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    let authListener = null;

    const initializeAuth = async () => {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        
        if (mounted) {
          await loadUserProfile(currentSession?.user ?? null, currentSession);
        }

        // Set up auth state listener
        const { data: listener } = supabase.auth.onAuthStateChange(
          async (event, newSession) => {
            console.log('🔐 Auth state change:', event);
            console.log('🔍 Current userProfile (from ref):', userProfileRef.current);
            console.log('🔍 Current session (from ref):', sessionRef.current);
            console.log('🔍 New session:', newSession);
            
            
            // ⚠️ CRITICAL FIX: Use ref to check session state instead of closure variable
            // This prevents tab switching from triggering full auth reloads
            if (event === 'SIGNED_IN' && sessionRef.current) {
              console.log('🔄 Already signed in - skipping tab focus auth reload');
              // Just update the session silently without reloading profile
              if (mounted) {
                setSession(newSession);
              }
              return;
            }
            
            // Only reload profile on actual auth state changes
            if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
              if (mounted) {
                setLoading(true);
                await loadUserProfile(newSession?.user ?? null, newSession);
              }
            } else if (event === 'TOKEN_REFRESHED') {
              // Just update the session without reloading the entire profile
              console.log('🔄 Token refreshed silently');
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
  }, [loadUserProfile]);

  const signIn = async (email, password) => {
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
    }
    return { data, error };
  };

  const signOut = async () => {
    console.log('🚪 signOut called');
    setLoading(true);
    
    try {
      // Check if there's an active session first
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      
      if (!currentSession) {
        console.log('⚠️ No active session found, clearing local state');
        // Clear local state manually
        setUserProfile(null);
        setSession(null);
        setLoading(false);
        
        // Clear storage
        localStorage.clear();
        sessionStorage.clear();
        
        return { error: null };
      }
      
      console.log('✅ Active session found, attempting sign out with scope: local');
      
      // Use local scope instead of global to avoid 403 errors
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      
      if (error) {
        console.error('❌ Sign out error:', error);
        
        // If sign out fails, try fallback method
        console.log('🔄 Attempting fallback logout...');
        
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
      
      console.log('✅ Sign out successful');
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
    console.log("🔍 hasPermission called with moduleName:", moduleName);
    console.log("🔍 userProfile:", userProfile);
    console.log("🔍 userProfile.permissions:", userProfile?.permissions);
    
    if (!userProfile) return false;
    const normalizedEmail = (userProfile.email || '').toLowerCase();
    const isEmergencyAdmin = EMERGENCY_ADMIN_EMAILS.includes(normalizedEmail);

    if (userProfile.role === 'owner' || isEmergencyAdmin) {
        return true;
    }
    
    // Map short module names to full database names
    const nameMap = {
      'dashboard': 'Dashboard',
      'calendar': 'Calendar',
      'tours': 'Tours & Bookings',
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
      'settings': 'System Settings',
      'export': 'Project Export'
    };
    
    // Get the full database name from the map, or use the original name if not found
    const dbName = nameMap[moduleName.toLowerCase()] || moduleName;
    console.log("🔍 Mapped module name:", moduleName, "->", dbName);
    
    const permission = userProfile.permissions.find(p => p.module_name.toLowerCase() === dbName.toLowerCase());
    console.log("🔍 Found permission:", permission);
    const result = permission ? permission.has_access : false;
    console.log("🔍 hasPermission result:", result);
    return result;
  }, [userProfile]);

  const refreshPermissions = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
        setLoading(true);
        await loadUserProfile(user, session);
    }
  }, [session, loadUserProfile]);

  const value = {
    user: userProfile,
    userProfile,
    session,
    loading,
    initialized,
    signIn,
    signOut,
    hasPermission,
    refreshPermissions,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;
