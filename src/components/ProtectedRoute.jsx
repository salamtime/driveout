import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import i18n from '../i18n';
import { isBusinessOwnerAccountType } from '../utils/accountType';
import AuthTransitionScreen from './auth/AuthTransitionScreen';

const BUSINESS_OWNER_STATUS_ROUTES = [
  '/pending-approval',
  '/no-workspace',
  '/workspace-pending',
  '/workspace-preparing',
  '/workspace-error',
  '/workspace-suspended',
  '/choose-plan',
  '/business/workspace',
];

const isBusinessOwnerStatusRoute = (pathname = '') =>
  BUSINESS_OWNER_STATUS_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));

const ExternalRedirect = ({ to }) => {
  React.useEffect(() => {
    if (typeof window !== 'undefined' && to) {
      window.location.href = to;
    }
  }, [to]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="mb-4 text-4xl">↗</div>
        <p className="text-gray-600">Opening workspace...</p>
      </div>
    </div>
  );
};

/**
 * ProtectedRoute - Route protection with role-based and module-based access control
 * 
 * Protects routes based on authentication status, user roles,
 * and specific module permissions.
 */
const ProtectedRoute = ({ 
  children, 
  requireAuth = true,
  requiredRoles = [],
  forbiddenRoles = [],
  requiredPermissions = [], // Expects an array of module names
  requiredFeature = '',
  requiredFeatures = [],
  fallbackPath = '/login',
  unauthorizedPath = '/unauthorized'
}) => {
  const { user, userProfile, session, loading, initialized, hasPermission, hasFeature, getBusinessOwnerHomePath } = useAuth();
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const location = useLocation();
  const normalizedEmail = (userProfile?.email || user?.email || '').toLowerCase();
  const platformOwnerOverride = normalizedEmail === 'salamtime2016@gmail.com';
  const effectiveRole =
    platformOwnerOverride
      ? 'owner'
      : userProfile?.role;
  const internalTenantRole = ['owner', 'admin', 'employee', 'guide'].includes(String(effectiveRole || '').trim().toLowerCase());
  const businessOwnerLike =
    !platformOwnerOverride && (
      effectiveRole === 'business_owner' ||
      (!internalTenantRole && isBusinessOwnerAccountType(userProfile?.accountType))
    );
  const businessOwnerFreezeRedirect = businessOwnerLike
    ? getBusinessOwnerHomePath({
        account_type: userProfile?.accountType,
        verification_status: userProfile?.verificationStatus,
        subscription_status: userProfile?.subscriptionStatus,
        billing_status: userProfile?.billingStatus,
      })
    : null;
  const isSameRouteRedirect =
    businessOwnerFreezeRedirect &&
    !/^https?:\/\//i.test(String(businessOwnerFreezeRedirect || '')) &&
    String(businessOwnerFreezeRedirect || '').trim() === String(location.pathname || '').trim();
  const isSameHostExternalRedirect = (() => {
    if (!businessOwnerFreezeRedirect || !/^https?:\/\//i.test(String(businessOwnerFreezeRedirect || '')) || typeof window === 'undefined') {
      return false;
    }

    try {
      const targetUrl = new URL(String(businessOwnerFreezeRedirect || '').trim());
      return (
        String(targetUrl.hostname || '').trim().toLowerCase() === String(window.location.hostname || '').trim().toLowerCase() &&
        String(targetUrl.pathname || '').trim() === String(location.pathname || '').trim()
      );
    } catch (error) {
      console.warn('Unable to compare business owner redirect target:', error);
      return false;
    }
  })();

  // Show loading while auth is initializing
  if (!initialized || loading) {
    return (
      <AuthTransitionScreen
        title={tr('Opening your workspace', 'Ouverture de votre espace')}
        description={tr('We are loading your workspace securely.', 'Nous chargeons votre espace en toute sécurité.')}
        badge={tr('Workspace access', 'Accès espace')}
      />
    );
  }

  // Check authentication requirement
  const isAuthenticated = Boolean(session?.user);

  if (requireAuth && !isAuthenticated) {
    return <Navigate to={fallbackPath} state={{ from: location }} replace />;
  }

  if (businessOwnerFreezeRedirect && !isBusinessOwnerStatusRoute(location.pathname) && !isSameRouteRedirect && !isSameHostExternalRedirect) {
    if (/^https?:\/\//i.test(businessOwnerFreezeRedirect)) {
      return <ExternalRedirect to={businessOwnerFreezeRedirect} />;
    }
    return <Navigate to={businessOwnerFreezeRedirect} replace />;
  }

  // Check role requirements
  if (requiredRoles.length > 0) {
    const userHasRequiredRole = !!effectiveRole && requiredRoles.includes(effectiveRole);
    if (!userHasRequiredRole) {
      return <Navigate to={unauthorizedPath} replace />;
    }
  }

  if (forbiddenRoles.length > 0 && effectiveRole && forbiddenRoles.includes(effectiveRole)) {
    return <Navigate to={unauthorizedPath} replace />;
  }

  // Check permission requirements (module-based)
  if (requiredPermissions.length > 0) {
    const hasRequiredPermissions = requiredPermissions.every(moduleName => hasPermission(moduleName));

    if (!hasRequiredPermissions) {
      return <Navigate to={unauthorizedPath} replace />;
    }
  }

  const featureRequirements = [
    ...(requiredFeature ? [requiredFeature] : []),
    ...(Array.isArray(requiredFeatures) ? requiredFeatures : []),
  ].filter(Boolean);

  if (featureRequirements.length > 0) {
    const hasRequiredFeatures = featureRequirements.every((featureKey) => hasFeature(featureKey));

    if (!hasRequiredFeatures) {
      return <Navigate to={unauthorizedPath} replace />;
    }
  }

  return children;
};

/**
 * AdminRoute - Routes for admin and owner roles
 */
export const AdminRoute = ({ children }) => (
  <ProtectedRoute requiredRoles={['owner', 'admin']}>
    {children}
  </ProtectedRoute>
);

/**
 * EmployeeRoute - Routes for employees and above
 */
export const EmployeeRoute = ({ children }) => (
  <ProtectedRoute requiredRoles={['owner', 'admin', 'employee', 'business_owner']}>
    {children}
  </ProtectedRoute>
);

/**
 * GuideRoute - Routes for guides
 */
export const GuideRoute = ({ children }) => (
  <ProtectedRoute requiredRoles={['owner', 'admin', 'guide']}>
    {children}
  </ProtectedRoute>
);

/**
 * CustomerRoute - Routes for customers
 */
export const CustomerRoute = ({ children }) => (
  <ProtectedRoute requiredRoles={['customer']} unauthorizedPath="/">
    {children}
  </ProtectedRoute>
);

export const BusinessRoute = ({ children }) => (
  <ProtectedRoute requiredRoles={['customer', 'business_owner']} unauthorizedPath="/">
    {children}
  </ProtectedRoute>
);

/**
 * Permission Gate - Component-level permission control for modules
 */
export const PermissionGate = ({ 
  children, 
  moduleName, // Changed from resource/action
  roles = [],
  fallback = null,
  showFallback = true
}) => {
  const { userProfile, hasPermission } = useAuth(); // Use useAuth directly

  console.log('🔍 PermissionGate check:', {
    moduleName,
    roles,
    userProfile: userProfile ? { role: userProfile.role, email: userProfile.email } : null,
    hasUserProfile: !!userProfile
  });

  // Check permission for the module
  const hasRequiredPermission = moduleName ? hasPermission(moduleName) : true;
  
  console.log('🔍 Permission check result:', {
    moduleName,
    hasRequiredPermission,
    rolesCheck: roles.length > 0 ? `Checking roles: ${roles.join(', ')}` : 'No role check'
  });
  
  // Check roles
  const hasRequiredRole = roles.length > 0 ? (userProfile && roles.includes(userProfile.role)) : true;

  console.log('🔍 Final gate decision:', {
    moduleName,
    hasRequiredPermission,
    hasRequiredRole,
    willRender: hasRequiredPermission && hasRequiredRole
  });

  if (hasRequiredPermission && hasRequiredRole) {
    return children;
  }

  if (showFallback && fallback) {
    return fallback;
  }

  if (showFallback && !fallback) {
    return (
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-yellow-700">You don't have permission to access this feature.</p>
      </div>
    );
  }

  return null;
};

export default ProtectedRoute;
