// Module name mapping configuration
const MODULE_NAME_MAP = {
  // UI module name (lowercase): Server module name (exact match)
  'dashboard': 'Dashboard',
  'calendar': 'Calendar',
  'tours': 'Tours & Bookings',
  'rentals': 'Rental Management',
  'customers': 'Customer Management',
  'fleet': 'Fleet Management',
  'pricing': 'Pricing Management',
  'maintenance': 'Quad Maintenance',
  'fuel': 'Fuel Logs',
  'inventory': 'Inventory',
  'finance': 'Financial Reports',
  'alerts': 'Alerts & Notifications',
  'users': 'User Management',
  'settings': 'System Settings',
  'export': 'Data Export',
  'admin': 'Administration' // Add this for admin/owner checks
};

// ✅ Permission cache with TTL to prevent repeated permission checks and rate limiting
const permissionCache = {
  cache: new Map(),
  timestamp: null,
  TTL: 60000, // Cache for 1 minute
  get(userId, moduleName) {
    // Invalidate cache if TTL expired
    if (this.timestamp && Date.now() - this.timestamp > this.TTL) {
      this.clear();
      return undefined;
    }
    const key = `${userId}_${moduleName}`;
    return this.cache.get(key);
  },
  set(userId, moduleName, result) {
    const key = `${userId}_${moduleName}`;
    this.cache.set(key, result);
    this.timestamp = this.timestamp || Date.now();
    return result;
  },
  clear() {
    this.cache.clear();
    this.timestamp = null;
  }
};

const normalizePermissionMap = (user) => {
  if (!user) return {};

  if (user.permissions && !Array.isArray(user.permissions) && typeof user.permissions === 'object') {
    return user.permissions;
  }

  if (Array.isArray(user.permissions)) {
    return user.permissions.reduce((acc, permission) => {
      if (!permission?.module_name) return acc;
      acc[permission.module_name] = permission.has_access === true;
      return acc;
    }, {});
  }

  return {};
};

// Get current user from locally persisted auth state, if available.
export const getCurrentUser = () => {
  try {
    const raw = localStorage.getItem('userProfile');
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

// ✅ UPDATED: Main permission checking function with caching
export const hasPermission = (moduleName, user = null) => {
  const userProfile = user || getCurrentUser();
  
  if (!userProfile || !userProfile.id) {
    return false;
  }
  
  // ✅ Check cache first to avoid repeated permission lookups
  const cached = permissionCache.get(userProfile.id, moduleName);
  if (cached !== undefined) {
    return cached;
  }
  
  // For owner role, always return true for all permissions
  if (userProfile.role === 'owner') {
    return permissionCache.set(userProfile.id, moduleName, true);
  }
  
  const permissionMap = normalizePermissionMap(userProfile);

  if (!Object.keys(permissionMap).length) {
    return permissionCache.set(userProfile.id, moduleName, false);
  }
  
  // Get the mapped module name, fallback to the input if no mapping
  const mappedModuleName = MODULE_NAME_MAP[moduleName.toLowerCase()] || moduleName;
  
  console.log(`🔍 Checking permission: ${moduleName} -> ${mappedModuleName}`);

  const directHit = Object.entries(permissionMap).find(([permissionName]) =>
    permissionName.toLowerCase() === mappedModuleName.toLowerCase() ||
    permissionName.toLowerCase() === moduleName.toLowerCase()
  );

  const result = directHit ? directHit[1] === true : false;
  return permissionCache.set(userProfile.id, moduleName, result);
};

// ✅ NEW: Clear permission cache (call this when user logs out or permissions change)
export const clearPermissionCache = () => {
  permissionCache.clear();
  console.log('🔄 Permission cache cleared');
};

// Legacy helper for older screens that still group admin + owner together.
export const isAdminOrOwner = (user) => {
  if (!user) {
    const currentUser = getCurrentUser();
    return currentUser.role === 'admin' || currentUser.role === 'owner';
  }
  return user.role === 'admin' || user.role === 'owner';
};

// Check if user can approve price overrides
export const canApprovePriceOverrides = (user) => {
  const userProfile = user || getCurrentUser();

  if (String(userProfile?.role || '').toLowerCase() === 'owner') {
    return true;
  }
  
  return hasPermission('Pricing Management', userProfile);
};

export const canEditRentalPrice = (user) => {
  const userProfile = user || getCurrentUser();

  if (String(userProfile?.role || '').toLowerCase() === 'owner') {
    return true;
  }

  return hasPermission('Change Rental Price', userProfile);
};

export const canEditExtensionPrice = (user) => {
  const userProfile = user || getCurrentUser();

  if (String(userProfile?.role || '').toLowerCase() === 'owner') {
    return true;
  }

  return hasPermission('Change Extension Price', userProfile);
};

export const canChooseTourGuide = (user) => {
  const userProfile = user || getCurrentUser();

  if (String(userProfile?.role || '').toLowerCase() === 'owner') {
    return true;
  }

  return hasPermission('Choose Tour Guide', userProfile);
};

// Alternative: Case-insensitive comparison
export const hasPermissionCaseInsensitive = (moduleName) => {
  const userProfile = getCurrentUser();
  
  if (!userProfile || !userProfile.permissions) {
    return false;
  }
  
  // For owner role, always return true
  if (userProfile.role === 'owner') {
    return true;
  }
  
  // Try to find permission with case-insensitive comparison
  const permission = userProfile.permissions.find(p => 
    p.module_name.toLowerCase() === moduleName.toLowerCase()
  );
  
  return permission ? permission.has_access : false;
};
