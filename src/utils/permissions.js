// Role-based permission utility functions
export const ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin', 
  EMPLOYEE: 'employee',
  GUIDE: 'guide',
  CUSTOMER: 'customer'
};

// Module permissions matrix
export const PERMISSIONS = {
  dashboard: {
    [ROLES.OWNER]: ['view', 'create', 'edit', 'delete'],
    [ROLES.ADMIN]: ['view', 'create', 'edit', 'delete'],
    [ROLES.EMPLOYEE]: ['view', 'create', 'edit'],
    [ROLES.GUIDE]: ['view'],
    [ROLES.CUSTOMER]: ['view']
  },
  calendar: {
    [ROLES.OWNER]: ['view', 'create', 'edit', 'delete'],
    [ROLES.ADMIN]: ['view', 'create', 'edit', 'delete'],
    [ROLES.EMPLOYEE]: ['view', 'create', 'edit'],
    [ROLES.GUIDE]: ['view'],
    [ROLES.CUSTOMER]: ['view']
  },
  tours: {
    [ROLES.OWNER]: ['view', 'create', 'edit', 'delete'],
    [ROLES.ADMIN]: ['view', 'create', 'edit', 'delete'],
    [ROLES.EMPLOYEE]: ['view', 'create', 'edit'],
    [ROLES.GUIDE]: ['view'],
    [ROLES.CUSTOMER]: ['view']
  },
  rentals: {
    [ROLES.OWNER]: ['view', 'create', 'edit', 'delete'],
    [ROLES.ADMIN]: ['view', 'create', 'edit', 'delete'],
    [ROLES.EMPLOYEE]: ['view', 'create', 'edit'],
    [ROLES.GUIDE]: ['view'],
    [ROLES.CUSTOMER]: ['view']
  },
  fleet: {
    [ROLES.OWNER]: ['view', 'create', 'edit', 'delete'],
    [ROLES.ADMIN]: ['view', 'create', 'edit', 'delete'],
    [ROLES.EMPLOYEE]: ['view', 'create', 'edit'],
    [ROLES.GUIDE]: ['view'],
    [ROLES.CUSTOMER]: []
  },
  fuel: {
    [ROLES.OWNER]: ['view', 'create', 'edit', 'delete'],
    [ROLES.ADMIN]: ['view', 'create', 'edit', 'delete'],
    [ROLES.EMPLOYEE]: ['view', 'create', 'edit'],
    [ROLES.GUIDE]: [],
    [ROLES.CUSTOMER]: []
  },
  maintenance: {
    [ROLES.OWNER]: ['view', 'create', 'edit', 'delete'],
    [ROLES.ADMIN]: ['view', 'create', 'edit', 'delete'],
    [ROLES.EMPLOYEE]: ['view', 'create', 'edit'],
    [ROLES.GUIDE]: ['view', 'report'],
    [ROLES.CUSTOMER]: []
  },
  inventory: {
    [ROLES.OWNER]: ['view', 'create', 'edit', 'delete'],
    [ROLES.ADMIN]: ['view', 'create', 'edit', 'delete'],
    [ROLES.EMPLOYEE]: ['view', 'create', 'edit'],
    [ROLES.GUIDE]: [],
    [ROLES.CUSTOMER]: []
  },
  finance: {
    [ROLES.OWNER]: ['view', 'create', 'edit', 'delete'],
    [ROLES.ADMIN]: ['view', 'create', 'edit', 'delete'],
    [ROLES.EMPLOYEE]: [],
    [ROLES.GUIDE]: [],
    [ROLES.CUSTOMER]: []
  },
  users: {
    [ROLES.OWNER]: ['view', 'create', 'edit', 'delete'],
    [ROLES.ADMIN]: ['view', 'create', 'edit', 'delete'],
    [ROLES.EMPLOYEE]: [],
    [ROLES.GUIDE]: [],
    [ROLES.CUSTOMER]: []
  },
  alerts: {
    [ROLES.OWNER]: ['view', 'create', 'edit', 'delete'],
    [ROLES.ADMIN]: ['view', 'create', 'edit', 'delete'],
    [ROLES.EMPLOYEE]: [],
    [ROLES.GUIDE]: [],
    [ROLES.CUSTOMER]: []
  },
  liveMap: {
    [ROLES.OWNER]: ['view', 'create', 'edit', 'delete'],
    [ROLES.ADMIN]: ['view', 'create', 'edit', 'delete'],
    [ROLES.EMPLOYEE]: ['view', 'create', 'edit'],
    [ROLES.GUIDE]: ['view'],
    [ROLES.CUSTOMER]: []
  },
  tourHistory: {
    [ROLES.OWNER]: ['view', 'create', 'edit', 'delete'],
    [ROLES.ADMIN]: ['view', 'create', 'edit', 'delete'],
    [ROLES.EMPLOYEE]: ['view', 'create', 'edit'],
    [ROLES.GUIDE]: ['view'],
    [ROLES.CUSTOMER]: ['view']
  },
  systemPrefs: {
    [ROLES.OWNER]: ['view', 'create', 'edit', 'delete'],
    [ROLES.ADMIN]: [],
    [ROLES.EMPLOYEE]: [],
    [ROLES.GUIDE]: [],
    [ROLES.CUSTOMER]: []
  },
  settings: {
    [ROLES.OWNER]: ['view', 'create', 'edit', 'delete'],
    [ROLES.ADMIN]: [],
    [ROLES.EMPLOYEE]: [],
    [ROLES.GUIDE]: [],
    [ROLES.CUSTOMER]: []
  }
};

// Permission check functions (with custom permission support)
export const hasPermission = (userRole, module, action, userId = null) => {
  if (!userRole || !module || !action) return false;
  
  // Check for custom permissions first if userId provided
  if (userId) {
    try {
      // Dynamic import for custom permissions (fallback if not available)
      if (typeof window !== 'undefined' && window.customPermissions) {
        return window.customPermissions.hasCustomPermission(userId, userRole, module, action);
      }
    } catch (error) {
      // Fall back to role defaults if custom permissions not available
      console.warn('Custom permissions not available, falling back to role defaults');
    }
  }
  
  // Default role-based permission check
  const modulePermissions = PERMISSIONS[module];
  if (!modulePermissions) return false;
  const rolePermissions = modulePermissions[userRole];
  return rolePermissions && rolePermissions.includes(action);
};

export const canView = (userRole, module) => hasPermission(userRole, module, 'view');
export const canCreate = (userRole, module) => hasPermission(userRole, module, 'create');
export const canEdit = (userRole, module) => hasPermission(userRole, module, 'edit');
export const canDelete = (userRole, module) => hasPermission(userRole, module, 'delete');
export const canReport = (userRole, module) => hasPermission(userRole, module, 'report');

// Module access check
export const hasModuleAccess = (userRole, module) => {
  const modulePermissions = PERMISSIONS[module];
  if (!modulePermissions) return false;
  const rolePermissions = modulePermissions[userRole];
  return rolePermissions && rolePermissions.length > 0;
};

// Get user role display info
export const getRoleInfo = (role) => {
  const roleMap = {
    [ROLES.OWNER]: { label: 'Owner', color: 'green', icon: '🟢' },
    [ROLES.ADMIN]: { label: 'Admin', color: 'blue', icon: '🔵' },
    [ROLES.EMPLOYEE]: { label: 'Employee', color: 'orange', icon: '🟠' },
    [ROLES.GUIDE]: { label: 'Guide', color: 'purple', icon: '🟣' },
    [ROLES.CUSTOMER]: { label: 'Customer', color: 'yellow', icon: '🟡' }
  };
  return roleMap[role] || { label: 'User', color: 'gray', icon: '👤' };
};

// Special role behaviors
export const canManageUsers = (userRole, targetRole) => {
  if (userRole === ROLES.OWNER) return true;
  if (userRole === ROLES.ADMIN) {
    return targetRole === ROLES.EMPLOYEE || targetRole === ROLES.GUIDE || targetRole === ROLES.CUSTOMER;
  }
  return false;
};

export const canDeleteBooking = (userRole, bookingStatus) => {
  if (userRole === ROLES.OWNER) return true;
  if (userRole === ROLES.ADMIN) {
    return bookingStatus !== 'completed' && bookingStatus !== 'paid';
  }
  return false;
};

export const canMarkAsPaid = (userRole) => {
  return userRole === ROLES.OWNER || userRole === ROLES.ADMIN || userRole === ROLES.EMPLOYEE;
};

export const canStartTour = (userRole) => {
  return userRole === ROLES.OWNER || userRole === ROLES.ADMIN || userRole === ROLES.EMPLOYEE || userRole === ROLES.GUIDE;
};