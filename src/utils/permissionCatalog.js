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
    extras: ['Edit Rental Contract', 'Edit Rental Cost', 'Change Extension Price', 'Require Extension Approval', 'Edit Extension History'],
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
  { module: 'Finance Management', extras: [] },
  { module: 'Alerts', extras: [] },
  { module: 'User & Role Management', extras: [] },
  { module: 'Verification Center', extras: [] },
  { module: 'Workspaces', extras: [] },
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
];

export const BUSINESS_OWNER_DISABLED_PERMISSION_KEYS = [
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

export const PERMISSION_ALIASES = {
  'Edit Rental Cost': ['Edit Rental Price', 'Edit Rental Price Without Approval', 'Change Rental Price'],
};

export const normalizePermissionMap = (permissionMap = {}) => {
  if (!permissionMap || Array.isArray(permissionMap) || typeof permissionMap !== 'object') {
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
