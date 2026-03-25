import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { supabase } from '../../utils/supabaseClient';

const MODULES = [
  { id: 'Dashboard', name: 'Dashboard', icon: '📊' },
  { id: 'Tours & Booking', name: 'Tours & Booking', icon: '🏍️' },
  { id: 'Booking Management', name: 'Booking Management', icon: '📅' },
  { id: 'Fleet Management', name: 'Fleet Management', icon: '🚗' },
  { id: 'Quad Maintenance', name: 'Quad Maintenance', icon: '🔧' },
  { id: 'Fuel Records', name: 'Fuel Records', icon: '⛽' },
  { id: 'Inventory', name: 'Inventory', icon: '📦' },
  { id: 'Finance Management', name: 'Finance Management', icon: '💰' },
  { id: 'Alerts', name: 'Alerts', icon: '🚨' },
  { id: 'User & Role Management', name: 'User & Role Management', icon: '👥' },
  { id: 'System Settings', name: 'System Settings', icon: '⚙️' }
];

const ModulePermissionsManager = ({ user, isExpanded, onPermissionChange }) => {
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState({});
  const { user: currentUser, userRole } = useSelector(state => state.auth);

  const canManagePermissions = userRole === 'owner' || userRole === 'admin';
  const APP_ID = 'b30c02e74da644baad4668e3587d86b1';

  useEffect(() => {
    if (isExpanded && user?.email) {
      loadUserPermissions();
    }
  }, [isExpanded, user?.email]);

  const loadUserPermissions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from(`app_${APP_ID}_user_module_permissions`)
        .select('module_name, has_access')
        .eq('user_email', user.email);

      if (error) throw error;

      // Create permissions map
      const permissionsMap = {};
      data?.forEach(perm => {
        permissionsMap[perm.module_name] = perm.has_access;
      });

      // Ensure all modules have entries
      const allPermissions = MODULES.map(module => ({
        ...module,
        hasAccess: permissionsMap[module.id] || false
      }));

      setPermissions(allPermissions);
    } catch (error) {
      console.error('Error loading user permissions:', error);
    } finally {
      setLoading(false);
    }
  };

  const togglePermission = async (moduleId) => {
    if (!canManagePermissions || updating[moduleId]) return;

    setUpdating(prev => ({ ...prev, [moduleId]: true }));

    try {
      const currentPermission = permissions.find(p => p.id === moduleId);
      const newAccessStatus = !currentPermission?.hasAccess;

      // Update in database
      const { error } = await supabase
        .from(`app_${APP_ID}_user_module_permissions`)
        .upsert({
          user_email: user.email,
          module_name: moduleId,
          has_access: newAccessStatus,
          granted_by: currentUser?.email || 'system',
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      // Update local state
      setPermissions(prev => prev.map(perm => 
        perm.id === moduleId 
          ? { ...perm, hasAccess: newAccessStatus }
          : perm
      ));

      // Log the change
      const { error: logError } = await supabase
        .from(`app_${APP_ID}_user_access_log`)
        .insert({
          user_email: user.email,
          action: `MODULE_${newAccessStatus ? 'GRANTED' : 'REVOKED'}`,
          changed_by: currentUser?.email || 'system',
          reason: `${moduleId} access ${newAccessStatus ? 'granted to' : 'revoked from'} ${user.email}`
        });

      if (logError) console.warn('Failed to log permission change:', logError);

      // Notify parent component
      if (onPermissionChange) {
        onPermissionChange(user.email, moduleId, newAccessStatus);
      }

      // Show success message
      const message = `${moduleId} access ${newAccessStatus ? 'granted' : 'revoked'} for ${user.name}`;
      if (window.showToast) {
        window.showToast(message, 'success');
      }

    } catch (error) {
      console.error('Error updating permission:', error);
      alert(`Failed to update permission: ${error.message}`);
    } finally {
      setUpdating(prev => ({ ...prev, [moduleId]: false }));
    }
  };

  const handleBatchUpdate = async (grantAll) => {
    if (!canManagePermissions) return;

    setLoading(true);
    try {
      const updates = MODULES.map(module => ({
        user_email: user.email,
        module_name: module.id,
        has_access: grantAll,
        granted_by: currentUser?.email || 'system',
        updated_at: new Date().toISOString()
      }));

      const { error } = await supabase
        .from(`app_${APP_ID}_user_module_permissions`)
        .upsert(updates);

      if (error) throw error;

      // Update local state
      setPermissions(prev => prev.map(perm => ({ ...perm, hasAccess: grantAll })));

      // Log the batch change
      await supabase
        .from(`app_${APP_ID}_user_access_log`)
        .insert({
          user_email: user.email,
          action: grantAll ? 'BATCH_GRANT_ALL' : 'BATCH_REVOKE_ALL',
          changed_by: currentUser?.email || 'system',
          reason: `All modules ${grantAll ? 'granted to' : 'revoked from'} ${user.email}`
        });

      const message = `All permissions ${grantAll ? 'granted' : 'revoked'} for ${user.name}`;
      if (window.showToast) {
        window.showToast(message, 'success');
      }

    } catch (error) {
      console.error('Error updating batch permissions:', error);
      alert(`Failed to update permissions: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getActiveModulesCount = () => {
    return permissions.filter(perm => perm.hasAccess).length;
  };

  if (!isExpanded) return null;

  return (
    <div className="mt-4 p-4 bg-gray-50 rounded-lg border">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center space-x-2">
          <h4 className="text-sm font-medium text-gray-900">Module Permissions</h4>
          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
            getActiveModulesCount() === 0 
              ? 'bg-red-100 text-red-800' 
              : 'bg-blue-100 text-blue-800'
          }`}>
            {getActiveModulesCount()}/{MODULES.length} Active
          </span>
        </div>
        
        {canManagePermissions && (
          <div className="flex space-x-2">
            <button
              onClick={() => handleBatchUpdate(true)}
              disabled={loading}
              className="text-xs bg-green-100 hover:bg-green-200 text-green-800 px-3 py-1 rounded transition-colors disabled:opacity-50"
            >
              Grant All
            </button>
            <button
              onClick={() => handleBatchUpdate(false)}
              disabled={loading || getActiveModulesCount() === 0}
              className="text-xs bg-red-100 hover:bg-red-200 text-red-800 px-3 py-1 rounded transition-colors disabled:opacity-50"
            >
              Deactivate All ({getActiveModulesCount()})
            </button>
          </div>
        )}
      </div>

      {getActiveModulesCount() === 0 && !loading && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <div className="flex items-center">
            <svg className="h-5 w-5 text-red-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 15.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div>
              <h5 className="text-sm font-medium text-red-800">No Active Modules</h5>
              <p className="text-sm text-red-600 mt-1">
                {user.name} currently has no access to any modules. Use "Grant All" or toggle individual modules to provide access.
              </p>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <svg className="animate-spin h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="ml-2 text-sm text-gray-600">Loading permissions...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {permissions.map((module) => (
            <div
              key={module.id}
              className="flex items-center justify-between p-3 bg-white border rounded-lg hover:shadow-sm transition-shadow"
            >
              <div className="flex items-center space-x-2">
                <span className="text-lg">{module.icon}</span>
                <div>
                  <div className="text-sm font-medium text-gray-900">{module.name}</div>
                  <div className={`text-xs ${
                    module.hasAccess ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {module.hasAccess ? 'Access Granted' : 'Access Denied'}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {updating[module.id] && (
                  <svg className="animate-spin h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
                
                <button
                  onClick={() => togglePermission(module.id)}
                  disabled={!canManagePermissions || updating[module.id]}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    module.hasAccess
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-red-600 hover:bg-red-700'
                  } ${
                    !canManagePermissions || updating[module.id]
                      ? 'opacity-50 cursor-not-allowed'
                      : 'cursor-pointer'
                  }`}
                >
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                      module.hasAccess ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!canManagePermissions && (
        <div className="mt-3 text-center text-xs text-gray-500">
          View only - You don't have permission to modify access controls
        </div>
      )}
    </div>
  );
};

export default ModulePermissionsManager;