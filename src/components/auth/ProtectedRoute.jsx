import React from 'react';
import { useSelector } from 'react-redux';
import { useAuth } from '../../contexts/AuthContext';

const ProtectedRoute = ({ children, requiredRole, fallback = null }) => {
  const { user, isAuthenticated } = useSelector(state => state.auth);
  const auth = useAuth();

  // Clean role extraction from metadata only
  const userRole = auth.user?.role;

  console.log('🔒 ProtectedRoute - Clean auth check:', {
    isAuthenticated,
    userRole,
    requiredRole,
    email: auth.user?.email
  });

  // Check authentication
  if (!isAuthenticated || !auth.user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-lg font-semibold">Authentication Required</h2>
          <p className="text-gray-600">Please log in to continue.</p>
          <button 
            onClick={() => window.location.href = '/auth/login'}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  // Check role access if required
  if (requiredRole) {
    const rolesArray = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    
    if (!userRole || !rolesArray.includes(userRole)) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h2 className="text-lg font-semibold">Access Denied</h2>
            <p className="text-gray-600">
              You don't have the required permissions to access this page.
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Required: {rolesArray.join(', ')} | Your role: {userRole || 'none'}
            </p>
            <button 
              onClick={() => window.history.back()}
              className="mt-4 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Go Back
            </button>
          </div>
        </div>
      );
    }
  }

  console.log('✅ ProtectedRoute - Access granted');
  return children;
};

export default ProtectedRoute;