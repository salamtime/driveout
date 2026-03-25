import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { Shield, Lock, Unlock, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useModulePermissions, AVAILABLE_MODULES } from '../../hooks/useModulePermissions';

const ModulePermissionsSection = ({ targetUser, onPermissionChange = null }) => {
  const { user: currentUser } = useSelector(state => state.auth);
  const [showConfirmDialog, setShowConfirmDialog] = useState(null);
  
  const {
    permissions,
    loading,
    updatePermission,
    initializeUserPermissions,
    deactivateAllModules,
    getActiveModulesCount
  } = useModulePermissions(targetUser.id);
  
  // Only Owner and Admin can modify permissions
  const canModifyPermissions = currentUser?.role === 'owner' || currentUser?.role === 'admin';

  useEffect(() => {
    // Initialize permissions for new users or users without permissions
    if (!loading && targetUser && Object.keys(permissions).length === 0) {
      initializeUserPermissions(targetUser.id, targetUser.role);
    }
  }, [loading, targetUser, permissions]);

  const handlePermissionToggle = async (moduleName, newValue) => {
    if (!canModifyPermissions) {
      toast.error('You do not have permission to modify user access');
      return;
    }

    // Show confirmation dialog for disabling access
    if (!newValue) {
      setShowConfirmDialog({ moduleName, newValue });
      return;
    }

    await executePermissionChange(moduleName, newValue);
  };

  const executePermissionChange = async (moduleName, newValue) => {
    const success = await updatePermission(moduleName, newValue);
    
    if (success) {
      const action = newValue ? 'Granted' : 'Revoked';
      toast.success(`${action} access to ${moduleName} for ${targetUser.email}`);
      
      // Notify parent component if callback provided
      if (onPermissionChange) {
        onPermissionChange(targetUser.id, moduleName, newValue);
      }
      
      // If the current user's permissions were changed, suggest a refresh
      if (targetUser.id === currentUser?.id) {
        toast.info('Your permissions have changed. Please refresh the page to see updates.', {
          duration: 5000
        });
      }
    } else {
      toast.error('Failed to update permission. Please try again.');
    }
    
    setShowConfirmDialog(null);
  };

  const handleDeactivateAllModules = async () => {
    if (!canModifyPermissions) {
      toast.error('You do not have permission to modify user access');
      return;
    }

    // Show confirmation dialog for deactivating all modules
    setShowConfirmDialog({ 
      moduleName: 'ALL_MODULES', 
      newValue: false,
      isDeactivateAll: true 
    });
  };

  const executeDeactivateAllModules = async () => {
    const success = await deactivateAllModules();
    
    if (success) {
      toast.success(`All module access revoked for ${targetUser.email}`);
      
      // Notify parent component if callback provided
      if (onPermissionChange) {
        AVAILABLE_MODULES.forEach(moduleName => {
          onPermissionChange(targetUser.id, moduleName, false);
        });
      }
      
      // If the current user's permissions were changed, suggest a refresh
      if (targetUser.id === currentUser?.id) {
        toast.info('Your permissions have changed. Please refresh the page to see updates.', {
          duration: 5000
        });
      }
    } else {
      toast.error('Failed to deactivate all modules. Please try again.');
    }
    
    setShowConfirmDialog(null);
  };

  if (loading) {
    return (
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <div className="animate-pulse flex items-center space-x-2">
          <Shield className="h-5 w-5 text-gray-400" />
          <div className="h-4 bg-gray-300 rounded w-32"></div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mt-6 p-4 bg-gray-50 rounded-lg border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <Shield className="h-5 w-5 text-blue-600" />
            <h4 className="text-md font-semibold text-gray-900">Module Access Permissions</h4>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              getActiveModulesCount() === 0 
                ? 'bg-red-100 text-red-800' 
                : 'bg-blue-100 text-blue-800'
            }`}>
              {getActiveModulesCount()}/{AVAILABLE_MODULES.length} Active
            </span>
          </div>
          
          <div className="flex items-center space-x-2">
            {canModifyPermissions && (
              <button
                onClick={handleDeactivateAllModules}
                disabled={loading || getActiveModulesCount() === 0}
                className="px-3 py-1 text-xs font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Deactivate All ({getActiveModulesCount()})
              </button>
            )}
            
            {!canModifyPermissions && (
              <div className="flex items-center space-x-1 text-orange-600">
                <Lock className="h-4 w-4" />
                <span className="text-sm font-medium">View Only</span>
              </div>
            )}
          </div>
        </div>
        
        {!canModifyPermissions && (
          <p className="text-sm text-orange-600 mb-4 bg-orange-50 p-3 rounded-md">
            <AlertTriangle className="h-4 w-4 inline mr-2" />
            Contact Owner/Admin to modify permissions
          </p>
        )}

        {getActiveModulesCount() === 0 && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
            <div className="flex items-center">
              <AlertTriangle className="h-5 w-5 text-red-600 mr-2" />
              <div>
                <h5 className="text-sm font-medium text-red-800">No Active Modules</h5>
                <p className="text-sm text-red-600 mt-1">
                  This user currently has no access to any modules. They will only see a basic interface with no functional capabilities.
                </p>
              </div>
            </div>
          </div>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {AVAILABLE_MODULES.map((moduleName) => {
            const hasAccess = permissions[moduleName] === true;
            
            return (
              <div 
                key={moduleName} 
                className={`flex items-center justify-between p-4 bg-white rounded-lg border-2 transition-all duration-200 ${
                  hasAccess ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-2">
                    {hasAccess ? (
                      <Unlock className="h-4 w-4 text-green-600 flex-shrink-0" />
                    ) : (
                      <Lock className="h-4 w-4 text-red-600 flex-shrink-0" />
                    )}
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {moduleName}
                    </span>
                  </div>
                  
                  <div className="flex items-center">
                    {hasAccess ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                        ✅ Access Granted
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">
                        ❌ Access Denied
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="ml-4">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasAccess}
                      onChange={(e) => handlePermissionToggle(moduleName, e.target.checked)}
                      disabled={!canModifyPermissions}
                      className="sr-only"
                    />
                    <div className={`relative inline-block w-11 h-6 rounded-full transition-colors duration-200 ${
                      hasAccess ? 'bg-green-600' : 'bg-gray-300'
                    } ${!canModifyPermissions ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                      <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                        hasAccess ? 'translate-x-5' : 'translate-x-0'
                      }`}></div>
                    </div>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="flex-shrink-0">
                  <AlertTriangle className="h-6 w-6 text-orange-600" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900">
                    {showConfirmDialog?.isDeactivateAll ? 'Deactivate All Modules' : 'Revoke Module Access'}
                  </h3>
                </div>
              </div>
              
              <div className="mb-4">
                {showConfirmDialog.isDeactivateAll ? (
                  <>
                    <p className="text-sm text-gray-600">
                      Are you sure you want to <strong>deactivate ALL modules</strong> for {targetUser.email}?
                    </p>
                    <p className="text-sm text-red-600 mt-2 font-medium">
                      ⚠️ This will revoke access to all {AVAILABLE_MODULES.length} modules, leaving the user with no functional capabilities.
                    </p>
                    <p className="text-sm text-orange-600 mt-2">
                      The user will only see a basic interface and will need modules to be individually reactivated to regain functionality.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-gray-600">
                      Are you sure you want to revoke access to <strong>{showConfirmDialog.moduleName}</strong> for {targetUser.email}?
                    </p>
                    <p className="text-sm text-orange-600 mt-2">
                      This will immediately hide this module from their interface and block access to related features.
                    </p>
                  </>
                )}
              </div>
              
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowConfirmDialog(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Cancel
                </button>
                <button
                  onClick={() => showConfirmDialog.isDeactivateAll 
                    ? executeDeactivateAllModules() 
                    : executePermissionChange(showConfirmDialog.moduleName, showConfirmDialog.newValue)
                  }
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                >
                  {showConfirmDialog.isDeactivateAll ? 'Deactivate All Modules' : 'Revoke Access'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ModulePermissionsSection;