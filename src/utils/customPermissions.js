// Custom permission management for Owner-level user control
import { PERMISSIONS, ROLES } from './permissions';

// Storage key for custom permissions
const CUSTOM_PERMISSIONS_KEY = 'saharax_custom_permissions';

// Get custom permissions from storage
export const getCustomPermissions = () => {
  try {
    const stored = localStorage.getItem(CUSTOM_PERMISSIONS_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.error('Error loading custom permissions:', error);
    return {};
  }
};

// Save custom permissions to storage
export const saveCustomPermissions = (permissions) => {
  try {
    localStorage.setItem(CUSTOM_PERMISSIONS_KEY, JSON.stringify(permissions));
    return true;
  } catch (error) {
    console.error('Error saving custom permissions:', error);
    return false;
  }
};

// Get user's effective permissions (custom overrides default role permissions)
export const getUserPermissions = (userId, userRole) => {
  const customPermissions = getCustomPermissions();
  const userCustom = customPermissions[userId];
  
  // If no custom permissions, return role defaults
  if (!userCustom) {
    return PERMISSIONS;
  }
  
  // Merge custom permissions with role defaults
  const effectivePermissions = { ...PERMISSIONS };
  
  Object.keys(userCustom).forEach(module => {
    effectivePermissions[module] = {
      ...effectivePermissions[module],
      [userRole]: userCustom[module]
    };
  });
  
  return effectivePermissions;
};

// Set custom permissions for a specific user
export const setUserCustomPermissions = (userId, modulePermissions) => {
  const customPermissions = getCustomPermissions();
  customPermissions[userId] = modulePermissions;
  return saveCustomPermissions(customPermissions);
};

// Reset user to role defaults
export const resetUserToRoleDefaults = (userId) => {
  const customPermissions = getCustomPermissions();
  delete customPermissions[userId];
  return saveCustomPermissions(customPermissions);
};

// Check if user has custom permission override
export const hasCustomPermission = (userId, userRole, module, action) => {
  const customPermissions = getCustomPermissions();
  const userCustom = customPermissions[userId];
  
  if (!userCustom || !userCustom[module]) {
    // Fall back to role defaults
    const modulePermissions = PERMISSIONS[module];
    if (!modulePermissions) return false;
    const rolePermissions = modulePermissions[userRole];
    return rolePermissions && rolePermissions.includes(action);
  }
  
  // Use custom permissions
  return userCustom[module].includes(action);
};

// Get all users with custom permissions
export const getUsersWithCustomPermissions = () => {
  const customPermissions = getCustomPermissions();
  return Object.keys(customPermissions);
};

// Get user's custom permission summary
export const getUserCustomPermissionSummary = (userId) => {
  const customPermissions = getCustomPermissions();
  return customPermissions[userId] || null;
};

// Validate permission structure
export const validatePermissionStructure = (permissions) => {
  const validActions = ['view', 'create', 'edit', 'delete', 'report'];
  const validModules = Object.keys(PERMISSIONS);
  
  for (const module in permissions) {
    if (!validModules.includes(module)) {
      return { valid: false, error: `Invalid module: ${module}` };
    }
    
    if (!Array.isArray(permissions[module])) {
      return { valid: false, error: `Module ${module} permissions must be an array` };
    }
    
    for (const action of permissions[module]) {
      if (!validActions.includes(action)) {
        return { valid: false, error: `Invalid action: ${action} in module ${module}` };
      }
    }
  }
  
  return { valid: true };
};

// Get default role permissions for a module
export const getRoleDefaultPermissions = (role, module) => {
  const modulePermissions = PERMISSIONS[module];
  if (!modulePermissions) return [];
  return modulePermissions[role] || [];
};

// Check if permissions are different from role defaults
export const hasPermissionOverrides = (userId, userRole) => {
  const customPermissions = getCustomPermissions();
  const userCustom = customPermissions[userId];
  
  if (!userCustom) return false;
  
  // Check if any custom permissions differ from role defaults
  for (const module in userCustom) {
    const customPerms = userCustom[module];
    const defaultPerms = getRoleDefaultPermissions(userRole, module);
    
    if (JSON.stringify(customPerms.sort()) !== JSON.stringify(defaultPerms.sort())) {
      return true;
    }
  }
  
  return false;
};