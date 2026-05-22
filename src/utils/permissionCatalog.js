export const PERMISSION_GROUPS = [
  { module: 'Dashboard', extras: [] },
  { module: 'Calendar', extras: [] },
  {
    module: 'Tours & Bookings',
    extras: ['Manage Tour Packages', 'Choose Tour Guide'],
  },
  { module: 'Team Tasks', extras: [] },
  {
    module: 'Rental Management',
    extras: ['Edit Rental Contract', 'Edit Rental Cost', 'Edit Rental Security Deposit', 'Change Extension Price', 'Require Extension Approval', 'Edit Extension History'],
  },
  {
    module: 'Fleet Management',
    extras: ['Adjust Vehicle Fuel Level'],
  },
  {
    module: 'Customer Management',
    extras: ['Edit Customer Profile'],
  },
  { module: 'Pricing Management', extras: [] },
  { module: 'Quad Maintenance', extras: [] },
  {
    module: 'Fuel Logs',
    extras: ['Adjust Fuel Tank Level'],
  },
  { module: 'Inventory', extras: [] },
  {
    module: 'Finance Management',
    extras: ['Record Receive Funds', 'Review Receive Funds', 'Use Bank Deposit Method'],
  },
  { module: 'Alerts', extras: [] },
  { module: 'User & Role Management', extras: [] },
  { module: 'Verification Center', extras: [] },
  { module: 'Messages', extras: [] },
  { module: 'Workspaces', extras: [] },
  { module: 'Platform Admins', extras: [] },
  { module: 'Marketplace Review', extras: [] },
  { module: 'System Settings', extras: [] },
  { module: 'Project Export', extras: [] },
  { module: 'WhatsApp Alerts', extras: [] },
];

export const MODULE_PERMISSION_KEYS = PERMISSION_GROUPS.map((group) => group.module);
export const EXTRA_PERMISSION_KEYS = PERMISSION_GROUPS.flatMap((group) => group.extras);
export const ALL_PERMISSION_KEYS = [...MODULE_PERMISSION_KEYS, ...EXTRA_PERMISSION_KEYS];
export const SPECIAL_PERMISSION_KEYS = [...EXTRA_PERMISSION_KEYS];
export const DEFAULT_STAFF_PERMISSION_KEYS = [
  'Dashboard',
  'Calendar',
  'Tours & Bookings',
  'Team Tasks',
  'Rental Management',
  'Fuel Logs',
  'Record Receive Funds',
];

export const BUSINESS_OWNER_DISABLED_PERMISSION_KEYS = [
  'Workspaces',
  'Platform Admins',
  'Marketplace Review',
  'Project Export',
];

export const buildBusinessOwnerPermissionMap = () => {
  const permissionMap = ALL_PERMISSION_KEYS.reduce((acc, permissionKey) => {
    acc[permissionKey] = true;
    return acc;
  }, {});

  BUSINESS_OWNER_DISABLED_PERMISSION_KEYS.forEach((permissionKey) => {
    permissionMap[permissionKey] = false;
  });

  return permissionMap;
};

export const buildDefaultPermissionsForRole = (role) => {
  const normalizedRole = String(role || 'customer').trim().toLowerCase();
  const permissionMap = ALL_PERMISSION_KEYS.reduce((acc, permissionKey) => {
    acc[permissionKey] = false;
    return acc;
  }, {});

  if (normalizedRole === 'owner' || normalizedRole === 'admin') {
    ALL_PERMISSION_KEYS.forEach((permissionKey) => {
      permissionMap[permissionKey] = true;
    });
    return permissionMap;
  }

  if (normalizedRole === 'business_owner') {
    return buildBusinessOwnerPermissionMap();
  }

  if (normalizedRole === 'employee') {
    DEFAULT_STAFF_PERMISSION_KEYS.forEach((permissionKey) => {
      permissionMap[permissionKey] = true;
    });
    return permissionMap;
  }

  if (normalizedRole === 'guide') {
    ['Dashboard', 'Tours & Bookings', 'Choose Tour Guide', 'Alerts'].forEach((permissionKey) => {
      permissionMap[permissionKey] = true;
    });
    return permissionMap;
  }

  return permissionMap;
};

export const PERMISSION_ALIASES = {
  'Edit Rental Cost': ['Edit Rental Price', 'Edit Rental Price Without Approval', 'Change Rental Price'],
  'Edit Rental Security Deposit': ['Edit Security Deposit', 'Edit Damage Deposit', 'Change Security Deposit'],
};

export const PERMISSION_LOOKUP_ALIASES = {
  dashboard: 'Dashboard',
  calendar: 'Calendar',
  tours: 'Tours & Bookings',
  'tours & bookings': 'Tours & Bookings',
  tasks: 'Team Tasks',
  'team tasks': 'Team Tasks',
  rentals: 'Rental Management',
  'rental management': 'Rental Management',
  customers: 'Customer Management',
  'customer management': 'Customer Management',
  fleet: 'Fleet Management',
  'fleet management': 'Fleet Management',
  pricing: 'Pricing Management',
  'pricing management': 'Pricing Management',
  maintenance: 'Quad Maintenance',
  'quad maintenance': 'Quad Maintenance',
  fuel: 'Fuel Logs',
  'fuel logs': 'Fuel Logs',
  inventory: 'Inventory',
  finance: 'Finance Management',
  'finance management': 'Finance Management',
  alerts: 'Alerts',
  users: 'User & Role Management',
  'user & role management': 'User & Role Management',
  verification: 'Verification Center',
  'verification center': 'Verification Center',
  messages: 'Messages',
  workspaces: 'Workspaces',
  'platform admins': 'Platform Admins',
  'platform admin': 'Platform Admins',
  tenant: 'Workspaces',
  tenants: 'Workspaces',
  marketplace: 'Marketplace Review',
  'marketplace review': 'Marketplace Review',
  settings: 'System Settings',
  'system settings': 'System Settings',
  website: 'System Settings',
  'website editor': 'System Settings',
  export: 'Project Export',
  'project export': 'Project Export',
};

export const TENANT_FEATURE_MODULE_MAP = Object.freeze({
  finance_module: ['Finance Management'],
  ocr_id_scan: ['Verification Center'],
  whatsapp_tools: ['WhatsApp Alerts'],
});

export const resolvePermissionKey = (permissionName) => {
  const rawName = String(permissionName || '').trim();
  if (!rawName) return '';

  const aliasHit = PERMISSION_LOOKUP_ALIASES[rawName.toLowerCase()];
  if (aliasHit) {
    return aliasHit;
  }

  const exactCatalogHit = ALL_PERMISSION_KEYS.find(
    (permissionKey) => permissionKey.toLowerCase() === rawName.toLowerCase()
  );

  return exactCatalogHit || rawName;
};

export const isModuleAllowedByTenantFeatures = (moduleName, featureAccess = {}) => {
  const normalizedFeatureAccess =
    featureAccess && typeof featureAccess === 'object' && !Array.isArray(featureAccess)
      ? featureAccess
      : {};
  const resolvedModuleKey = resolvePermissionKey(moduleName);

  if (!resolvedModuleKey) {
    return true;
  }

  return Object.entries(TENANT_FEATURE_MODULE_MAP).every(([featureKey, gatedModules]) => {
    if (!Array.isArray(gatedModules) || !gatedModules.includes(resolvedModuleKey)) {
      return true;
    }

    return normalizedFeatureAccess[featureKey] !== false;
  });
};

export const normalizePermissionMap = (permissionMap = {}) => {
  if (!permissionMap) {
    return {};
  }

  if (Array.isArray(permissionMap)) {
    const normalizedFromArray = {};
    const stringPermissions = permissionMap
      .filter((entry) => typeof entry === 'string')
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);

    if (stringPermissions.some((entry) => entry.toLowerCase() === 'all')) {
      ALL_PERMISSION_KEYS.forEach((permissionKey) => {
        normalizedFromArray[permissionKey] = true;
      });
      return normalizedFromArray;
    }

    permissionMap.forEach((entry) => {
      if (entry && typeof entry === 'object' && !Array.isArray(entry) && entry.module_name) {
        normalizedFromArray[entry.module_name] = entry.has_access === true;
        return;
      }

      if (typeof entry === 'string') {
        const resolvedKey = resolvePermissionKey(entry);
        if (resolvedKey) {
          normalizedFromArray[resolvedKey] = true;
        }
      }
    });

    return normalizedFromArray;
  }

  if (typeof permissionMap !== 'object') {
    return {};
  }

  const normalized = { ...permissionMap };

  Object.entries(PERMISSION_ALIASES).forEach(([canonicalKey, legacyKeys]) => {
    const canonicalEnabled = normalized[canonicalKey] === true;
    const legacyEnabled = legacyKeys.some((legacyKey) => normalized[legacyKey] === true);

    if (canonicalEnabled || legacyEnabled) {
      normalized[canonicalKey] = true;
    }
  });

  return normalized;
};
