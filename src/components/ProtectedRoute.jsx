import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

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
  requiredPermissions = [], // Expects an array of module names
  fallbackPath = '/login',
  unauthorizedPath = '/unauthorized'
}) => {
  const { user, userProfile, loading, initialized, hasPermission } = useAuth();
  const location = useLocation();
  const normalizedEmail = (userProfile?.email || user?.email || '').toLowerCase();
  const effectiveRole =
    normalizedEmail === 'salamtime2016@gmail.com'
      ? 'admin'
      : userProfile?.role;

  // Show loading while auth is initializing
  if (!initialized || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⏳</div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Check authentication requirement
  if (requireAuth && !user) {
    return <Navigate to={fallbackPath} state={{ from: location }} replace />;
  }

  // Check role requirements
  if (requiredRoles.length > 0) {
    const userHasRequiredRole = !!effectiveRole && requiredRoles.includes(effectiveRole);
    if (!userHasRequiredRole) {
      return <Navigate to={unauthorizedPath} replace />;
    }
  }

  // Check permission requirements (module-based)
  if (requiredPermissions.length > 0) {
    const hasRequiredPermissions = requiredPermissions.every(moduleName => hasPermission(moduleName));

    if (!hasRequiredPermissions) {
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
  <ProtectedRoute requiredRoles={['owner', 'admin', 'employee']}>
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
