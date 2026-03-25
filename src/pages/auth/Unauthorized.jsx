import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Unauthorized Component
 * 
 * Displays when users try to access resources they don't have permission for.
 * Provides helpful information about their current role and available actions.
 */
const Unauthorized = () => {
  const { user, signOut } = useAuth();
  const userRole = user ? user.role : 'customer';

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const getRoleInfo = () => {
    const roleInfo = {
      owner: {
        name: 'Owner',
        color: 'purple',
        description: 'Full system access',
        capabilities: ['System management', 'User management', 'All administrative functions']
      },
      admin: {
        name: 'Administrator',
        color: 'blue',
        description: 'Administrative access',
        capabilities: ['Fleet management', 'Rental operations', 'User management', 'Reports']
      },
      employee: {
        name: 'Employee',
        color: 'green',
        description: 'Daily operations',
        capabilities: ['Rental management', 'Vehicle updates', 'Customer service']
      },
      guide: {
        name: 'Guide',
        color: 'yellow',
        description: 'Tour operations',
        capabilities: ['Tour management', 'Assigned vehicles', 'Customer communication']
      },
      customer: {
        name: 'Customer',
        color: 'gray',
        description: 'Self-service access',
        capabilities: ['Vehicle booking', 'Rental history', 'Profile management']
      }
    };

    return roleInfo[userRole] || roleInfo.customer;
  };

  const roleInfo = getRoleInfo();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="mx-auto h-12 w-12 bg-red-600 rounded-lg flex items-center justify-center">
          <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Access Denied
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          You don't have permission to access this resource
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {/* Current User Info */}
          {user && (
            <div className="mb-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Current User</h3>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center space-x-3 mb-3">
                  <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center">
                    <span className="text-sm font-medium text-gray-700">
                      {user.email?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {user.email}
                    </p>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-${roleInfo.color}-100 text-${roleInfo.color}-800`}>
                      {roleInfo.name}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-gray-600 mb-3">{roleInfo.description}</p>
                
                <div>
                  <h4 className="text-xs font-medium text-gray-700 mb-2">Your Capabilities:</h4>
                  <ul className="text-xs text-gray-600 space-y-1">
                    {roleInfo.capabilities.map((capability, index) => (
                      <li key={index} className="flex items-center">
                        <span className="w-1 h-1 bg-gray-400 rounded-full mr-2"></span>
                        {capability}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-4">
            <Link
              to="/dashboard"
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Go to Dashboard
            </Link>

            <Link
              to="/"
              className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Go to Home
            </Link>

            <button
              onClick={handleSignOut}
              className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Sign Out & Try Different Account
            </button>
          </div>

          {/* Help Text */}
          <div className="mt-6 p-4 bg-yellow-50 rounded-lg">
            <h4 className="text-sm font-medium text-yellow-800 mb-2">Need Different Access?</h4>
            <p className="text-xs text-yellow-700 mb-3">
              If you need access to this feature, please contact your administrator or try logging in with a different account that has the required permissions.
            </p>
            <div className="text-xs text-yellow-700">
              <strong>Demo Accounts Available:</strong>
              <ul className="mt-1 space-y-1">
                <li>• Owner: owner_demo@saharax.com (Full access)</li>
                <li>• Admin: admin@saharax.com (Administrative access)</li>
                <li>• Employee: employee_demo@saharax.com (Operations access)</li>
                <li>• Guide: guide_demo@saharax.com (Tour access)</li>
                <li>• Customer: test@saharax.com (Limited access)</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Unauthorized;