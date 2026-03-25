import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { 
  Shield, 
  Users, 
  Settings, 
  Save, 
  RotateCcw, 
  AlertTriangle,
  Check,
  X
} from 'lucide-react';
import {
  getUserCustomPermissions,
  setUserCustomPermissions,
  resetUserToRoleDefaults,
  getRoleDefaultPermissions,
  hasPermissionOverrides,
  validatePermissionStructure
} from '../../utils/customPermissions';
import { ROLES, getRoleInfo } from '../../utils/permissions';

const UserPermissionPanel = ({ user, onClose, onSave }) => {
  const { userRoles } = useSelector(state => state.auth);
  const currentUserRole = userRoles?.[0];
  
  const [permissions, setPermissions] = useState({});
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const userRole = user.role || 'customer';
  const roleInfo = getRoleInfo(userRole);

  // Initialize permissions when component mounts (must be before early returns)
  useEffect(() => {
    if (user && user.id && currentUserRole === 'owner') {
      loadUserPermissions();
    }
  }, [user.id, currentUserRole]);

  // Only allow Owner to access this panel
  if (currentUserRole !== 'owner') {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md">
          <div className="flex items-center text-red-600 mb-4">
            <AlertTriangle className="h-6 w-6 mr-2" />
            <h3 className="text-lg font-semibold">Access Denied</h3>
          </div>
          <p className="text-gray-600 mb-4">
            Only the system Owner can manage user permissions.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // Available modules and their display names
  const modules = [
    { key: 'dashboard', name: 'Dashboard' },
    { key: 'calendar', name: 'Calendar' },
    { key: 'tours', name: 'Tours Management' },
    { key: 'rentals', name: 'Rental Management' },
    { key: 'fleet', name: 'Fleet Management' },
    { key: 'fuel', name: 'Fuel Records' },
    { key: 'maintenance', name: 'Maintenance' },
    { key: 'inventory', name: 'Inventory' },
    { key: 'finance', name: 'Finance Management' },
    { key: 'users', name: 'User Accounts' },
    { key: 'alerts', name: 'System Alerts' },
    { key: 'liveMap', name: 'Live Tour Map' },
    { key: 'tourHistory', name: 'Tour History' },
    { key: 'systemPrefs', name: 'System Preferences' },
    { key: 'settings', name: 'Settings' }
  ];

  const actions = [
    { key: 'view', name: 'View', color: 'blue' },
    { key: 'create', name: 'Create', color: 'green' },
    { key: 'edit', name: 'Edit', color: 'yellow' },
    { key: 'delete', name: 'Delete', color: 'red' },
    { key: 'report', name: 'Report', color: 'purple' }
  ];



  const loadUserPermissions = () => {
    const customPermissions = getUserCustomPermissions();
    const userCustom = customPermissions[user.id] || {};
    
    // Initialize with role defaults or custom permissions
    const initialPermissions = {};
    modules.forEach(module => {
      const defaultPerms = getRoleDefaultPermissions(userRole, module.key);
      initialPermissions[module.key] = userCustom[module.key] || [...defaultPerms];
    });
    
    setPermissions(initialPermissions);
    setHasChanges(false);
  };

  const handlePermissionChange = (moduleKey, action, checked) => {
    setPermissions(prev => {
      const modulePermissions = [...(prev[moduleKey] || [])];
      
      if (checked) {
        if (!modulePermissions.includes(action)) {
          modulePermissions.push(action);
        }
      } else {
        const index = modulePermissions.indexOf(action);
        if (index > -1) {
          modulePermissions.splice(index, 1);
        }
      }
      
      return {
        ...prev,
        [moduleKey]: modulePermissions
      };
    });
    
    setHasChanges(true);
    setError(null);
    setSuccess(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    
    try {
      // Validate permission structure
      const validation = validatePermissionStructure(permissions);
      if (!validation.valid) {
        throw new Error(validation.error);
      }
      
      // Save custom permissions
      const success = setUserCustomPermissions(user.id, permissions);
      if (!success) {
        throw new Error('Failed to save permissions');
      }
      
      setHasChanges(false);
      setSuccess(true);
      onSave && onSave(permissions);
      
      // Auto-close success message after 2 seconds
      setTimeout(() => setSuccess(false), 2000);
      
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefaults = () => {
    if (window.confirm('Reset all permissions to role defaults? This will remove all custom overrides for this user.')) {
      resetUserToRoleDefaults(user.id);
      loadUserPermissions();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    }
  };

  const isPermissionChecked = (moduleKey, action) => {
    return permissions[moduleKey]?.includes(action) || false;
  };

  const isDefaultPermission = (moduleKey, action) => {
    const defaultPerms = getRoleDefaultPermissions(userRole, moduleKey);
    return defaultPerms.includes(action);
  };

  const hasUserOverrides = hasPermissionOverrides(user.id, userRole);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gray-50 px-6 py-4 border-b flex items-center justify-between">
          <div className="flex items-center">
            <Shield className="h-6 w-6 text-blue-600 mr-3" />
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                User Permission Management
              </h2>
              <div className="flex items-center mt-1">
                <span className="text-gray-600">
                  {user.name || user.email} - 
                </span>
                <span className={`ml-2 px-2 py-1 rounded-full text-xs font-semibold bg-${roleInfo.color}-100 text-${roleInfo.color}-800`}>
                  {roleInfo.icon} {roleInfo.label}
                </span>
                {hasUserOverrides && (
                  <span className="ml-2 px-2 py-1 bg-orange-100 text-orange-800 rounded-full text-xs font-semibold">
                    Custom Overrides
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {/* Status Messages */}
          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded flex items-center">
              <AlertTriangle className="h-5 w-5 mr-2" />
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded flex items-center">
              <Check className="h-5 w-5 mr-2" />
              Permissions saved successfully!
            </div>
          )}

          {/* Permission Matrix */}
          <div className="overflow-x-auto">
            <table className="w-full border border-gray-200 rounded-lg">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left font-semibold text-gray-900 border-b">
                    Module
                  </th>
                  {actions.map(action => (
                    <th key={action.key} className="px-3 py-3 text-center font-semibold text-gray-900 border-b border-l">
                      <div className="flex flex-col items-center">
                        <span className="text-sm">{action.name}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {modules.map((module, index) => (
                  <tr key={module.key} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-3 font-medium text-gray-900 border-b">
                      {module.name}
                    </td>
                    {actions.map(action => {
                      const isChecked = isPermissionChecked(module.key, action.key);
                      const isDefault = isDefaultPermission(module.key, action.key);
                      
                      return (
                        <td key={action.key} className="px-3 py-3 text-center border-b border-l">
                          <div className="flex flex-col items-center">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => handlePermissionChange(module.key, action.key, e.target.checked)}
                              className={`h-4 w-4 rounded border-gray-300 text-${action.color}-600 focus:ring-${action.color}-500`}
                            />
                            {isDefault && (
                              <span className="text-xs text-gray-500 mt-1">Default</span>
                            )}
                            {!isDefault && isChecked && (
                              <span className="text-xs text-blue-600 mt-1">Custom</span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <h4 className="font-semibold text-gray-900 mb-2">Legend:</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div className="flex items-center">
                <span className="w-3 h-3 bg-gray-300 rounded mr-2"></span>
                <span>Default (from role)</span>
              </div>
              <div className="flex items-center">
                <span className="w-3 h-3 bg-blue-500 rounded mr-2"></span>
                <span>Custom override</span>
              </div>
              <div className="flex items-center">
                <span className="w-3 h-3 bg-orange-500 rounded mr-2"></span>
                <span>Modified from default</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={handleResetToDefaults}
              className="flex items-center px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded hover:bg-gray-100 transition-colors"
              disabled={saving}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset to Role Defaults
            </button>
            {hasChanges && (
              <span className="text-sm text-orange-600 font-medium">
                Unsaved changes
              </span>
            )}
          </div>
          
          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded hover:bg-gray-100 transition-colors"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className="flex items-center px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Custom Permissions
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserPermissionPanel;