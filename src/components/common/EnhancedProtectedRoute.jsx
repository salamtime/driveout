import React from 'react';
import { useSelector } from 'react-redux';
import { usePermissions } from '../../hooks/usePermissions';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Enhanced Protected Route Component with secure role handling
 * Only uses Supabase metadata for role-based access control
 */
const EnhancedProtectedRoute = ({ 
  children, 
  requiredModule, 
  requiredRole, 
  fallbackRoles = [],
  fallback = null 
}) => {
  console.log('🔒 === ENHANCED PROTECTED ROUTE ===');
  console.log('🔍 Required Module:', requiredModule);
  console.log('🔍 Required Role:', requiredRole);
  console.log('🔍 Fallback Roles:', fallbackRoles);
  
  // Get authentication state from multiple sources
  const { user, userRoles, isAuthenticated } = useSelector(state => state.auth);
  const auth = useAuth(); // Direct access to useAuth context
  const { hasModuleAccess, hasRoleAccess } = usePermissions();
  
  // Extract role from authenticated user (from Supabase metadata only)
  const userRole = auth.user?.role || null;
  const email = auth.user?.email || user?.email;
  
  console.log('🔍 EnhancedProtectedRoute - Authentication State:', {
    email: email,
    isAuthenticated: isAuthenticated,
    userRole: userRole,
    hasAuthUser: !!auth.user,
    hasReduxUser: !!user,
    userMetadata: auth.user?.user_metadata,
    appMetadata: auth.user?.app_metadata
  });

  // Check if user is authenticated
  if (!isAuthenticated || (!user && !auth.user)) {
    console.log('❌ Authentication check failed - redirecting to login');
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6">
          <div className="text-center">
            <svg className="mx-auto h-12 w-12 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <h2 className="mt-2 text-lg font-medium text-gray-900">Authentication Required</h2>
            <p className="mt-1 text-sm text-gray-600">
              Please log in to access this page.
            </p>
            <div className="mt-6">
              <button
                onClick={() => window.location.href = '/login'}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Go to Login
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Check if user has no role assigned (should not happen in production)
  if (!userRole) {
    console.warn('⚠️ User has no role assigned in metadata');
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6">
          <div className="text-center">
            <svg className="mx-auto h-12 w-12 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <h2 className="mt-2 text-lg font-medium text-gray-900">Role Assignment Required</h2>
            <p className="mt-1 text-sm text-gray-600">
              Your account doesn't have a role assigned. Please contact your administrator.
            </p>
            <div className="mt-3 text-xs text-gray-500 space-y-1">
              <p>User: <span className="font-medium">{email}</span></p>
              <p>Metadata Role: <span className="font-medium">Not assigned</span></p>
            </div>
            <div className="mt-6">
              <button
                onClick={() => window.history.back()}
                className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Go Back
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Dashboard route access control - only admin level roles
  const isDashboard = requiredModule === 'Dashboard' || 
                      requiredModule?.toLowerCase().includes('dashboard');
  
  if (isDashboard) {
    const allowedDashboardRoles = ['owner', 'admin', 'employee', 'guide'];
    
    if (!allowedDashboardRoles.includes(userRole)) {
      console.log('❌ Dashboard access denied - insufficient role:', userRole);
      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50">
          <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6">
            <div className="text-center">
              <svg className="mx-auto h-12 w-12 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
              <h2 className="mt-2 text-lg font-medium text-gray-900">Dashboard Access Denied</h2>
              <p className="mt-1 text-sm text-gray-600">
                You don't have sufficient permissions to access the admin dashboard.
              </p>
              <div className="mt-3 text-xs text-gray-500 space-y-1">
                <p>Required Roles: <span className="font-medium">owner, admin, employee, guide</span></p>
                <p>Your Role: <span className="font-medium">{userRole}</span></p>
                <p>User: <span className="font-medium">{email}</span></p>
              </div>
              <div className="mt-6">
                <button
                  onClick={() => window.location.href = '/'}
                  className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Go to Home
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }
    
    console.log('✅ Dashboard access granted:', { email, userRole });
    return children;
  }

  // Check role-based access for other routes
  if (requiredRole) {
    const rolesArray = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    
    console.log('🔍 Checking role access:', { userRole, requiredRoles: rolesArray });
    
    if (!rolesArray.includes(userRole)) {
      console.log('❌ Role access check failed');
      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50">
          <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6">
            <div className="text-center">
              <svg className="mx-auto h-12 w-12 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
              <h2 className="mt-2 text-lg font-medium text-gray-900">Access Denied</h2>
              <p className="mt-1 text-sm text-gray-600">
                You don't have the required role to access this page.
              </p>
              <div className="mt-3 text-xs text-gray-500 space-y-1">
                <p>Required Role: <span className="font-medium">{rolesArray.join(', ')}</span></p>
                <p>Your Role: <span className="font-medium">{userRole}</span></p>
                <p>User: <span className="font-medium">{email}</span></p>
              </div>
              <div className="mt-6">
                <button
                  onClick={() => window.history.back()}
                  className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Go Back
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }
  }

  // Check module-based access
  if (requiredModule) {
    const hasAccess = hasModuleAccess(requiredModule);
    console.log('🔍 Module-based access check:', { requiredModule, userRole, hasAccess });
    
    // Owner and admin always have access to all modules
    const isOwnerOrAdmin = userRole === 'owner' || userRole === 'admin';
    
    if (!hasAccess && !isOwnerOrAdmin) {
      console.log('❌ Module access denied');
      
      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50">
          <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6">
            <div className="text-center">
              <svg className="mx-auto h-12 w-12 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <h2 className="mt-2 text-lg font-medium text-gray-900">Module Access Required</h2>
              <p className="mt-1 text-sm text-gray-600">
                You don't have permission to access this module. Contact your administrator to request access.
              </p>
              <div className="mt-3 text-xs text-gray-500 space-y-1">
                <p>Module: <span className="font-medium">{requiredModule}</span></p>
                <p>Current Role: <span className="font-medium">{userRole}</span></p>
                <p>User: <span className="font-medium">{email}</span></p>
              </div>
              <div className="mt-6">
                <button
                  onClick={() => window.history.back()}
                  className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Go Back
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }
  }

  // Render fallback if provided
  if (fallback) {
    return fallback;
  }

  // All checks passed, render children
  console.log('✅ Access granted:', { email, userRole, requiredModule, requiredRole });
  return children;
};

export default EnhancedProtectedRoute;