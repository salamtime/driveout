import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { supabase } from '../utils/supabaseClient';
import { ALL_PERMISSION_KEYS, DEFAULT_STAFF_PERMISSION_KEYS } from '../utils/permissionCatalog';

export const AVAILABLE_MODULES = ALL_PERMISSION_KEYS;

export const useModulePermissions = (userId = null) => {
  const authState = useSelector(state => state.auth || {});
  const { user } = authState;
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(true);
  
  const targetUserId = userId || user?.id;
  const targetUser = userId ? null : user;

  // Initialize default permissions on mount
  useEffect(() => {
    const defaultPermissions = {};
    AVAILABLE_MODULES.forEach(module => {
      defaultPermissions[module] = false;
    });
    setPermissions(defaultPermissions);
  }, []);

  useEffect(() => {
    if (targetUserId) {
      loadPermissions();
    } else {
      // If no user ID is available, set loading to false and use default permissions
      setLoading(false);
    }
  }, [targetUserId]);

  const loadPermissions = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('app_b30c02e74da644baad4668e3587d86b1_user_module_access')
        .select('module_name, has_access')
        .eq('user_id', targetUserId);

      if (error && !error.message.includes('configure Supabase credentials')) {
        console.warn('Database connection error:', error);
        throw error;
      }

      const permissionsMap = {};
      
      // Initialize all modules with default permissions based on role
      AVAILABLE_MODULES.forEach(module => {
        permissionsMap[module] = false; // Default to false
      });

      // Override with actual data from database
      if (data) {
        data.forEach(perm => {
          permissionsMap[perm.module_name] = perm.has_access;
        });
      }

      setPermissions(permissionsMap);
    } catch (error) {
      console.error('Error loading permissions:', error);
      
      // Fallback: owner keeps access, everyone else follows stored permissions only
      const defaultPermissions = {};
      AVAILABLE_MODULES.forEach(module => {
        if (targetUser?.role === 'owner') {
          defaultPermissions[module] = true;
        } else {
          defaultPermissions[module] = false;
        }
      });
      
      setPermissions(defaultPermissions);
    } finally {
      setLoading(false);
    }
  };

  const hasModuleAccess = (moduleName) => {
    if (targetUser?.role === 'owner') {
      console.log(`🔑 OWNER access granted for ${moduleName}`);
      return true;
    }

    const hasAccess = permissions[moduleName] === true;
    console.log(`🔐 Module permission check for ${moduleName}:`, hasAccess, 'Role:', targetUser?.role);
    return hasAccess;
  };

  const updatePermission = async (moduleName, hasAccess) => {
    try {
      const { error } = await supabase
        .from('app_b30c02e74da644baad4668e3587d86b1_user_module_access')
        .upsert({
          user_id: targetUserId,
          module_name: moduleName,
          has_access: hasAccess,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,module_name'
        });

      if (error) throw error;

      // Update local state
      setPermissions(prev => ({
        ...prev,
        [moduleName]: hasAccess
      }));

      return true;
    } catch (error) {
      console.error('Error updating permission:', error);
      return false;
    }
  };

  const deactivateAllModules = async () => {
    try {
      const updates = AVAILABLE_MODULES.map(module => ({
        user_id: targetUserId,
        module_name: module,
        has_access: false,
        updated_at: new Date().toISOString()
      }));

      const { error } = await supabase
        .from('app_b30c02e74da644baad4668e3587d86b1_user_module_access')
        .upsert(updates, {
          onConflict: 'user_id,module_name'
        });

      if (error) throw error;

      // Update local state to deactivate all modules
      const deactivatedPermissions = {};
      AVAILABLE_MODULES.forEach(module => {
        deactivatedPermissions[module] = false;
      });
      setPermissions(deactivatedPermissions);

      return true;
    } catch (error) {
      console.error('Error deactivating all modules:', error);
      return false;
    }
  };

  const getActiveModulesCount = () => {
    return Object.values(permissions).filter(Boolean).length;
  };

  const initializeUserPermissions = async (userId, userRole) => {
    try {
      const defaultPermissions = AVAILABLE_MODULES.map(module => {
        let hasAccess = false;
        
        if (userRole === 'owner' || userRole === 'admin') {
          hasAccess = true;
        } else if (userRole === 'guide') {
          hasAccess = ['Dashboard', 'Tours & Bookings', 'Choose Tour Guide', 'Alerts'].includes(module);
        } else if (userRole === 'employee') {
          hasAccess = DEFAULT_STAFF_PERMISSION_KEYS.includes(module);
        }

        return {
          user_id: userId,
          module_name: module,
          has_access: hasAccess,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      });

      const { error } = await supabase
        .from('app_b30c02e74da644baad4668e3587d86b1_user_module_access')
        .upsert(defaultPermissions, {
          onConflict: 'user_id,module_name'
        });

      if (error) throw error;
      
      return true;
    } catch (error) {
      console.error('Error initializing user permissions:', error);
      return false;
    }
  };

  // Ensure we always return a valid object structure
  return {
    permissions: permissions || {},
    loading: loading ?? true,
    hasModuleAccess: hasModuleAccess || (() => false),
    updatePermission: updatePermission || (() => Promise.resolve(false)),
    initializeUserPermissions: initializeUserPermissions || (() => Promise.resolve(false)),
    refreshPermissions: loadPermissions || (() => Promise.resolve()),
    deactivateAllModules: deactivateAllModules || (() => Promise.resolve(false)),
    getActiveModulesCount: getActiveModulesCount || (() => 0)
  };
};
