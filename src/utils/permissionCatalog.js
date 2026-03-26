export const PERMISSION_GROUPS = [
  { module: 'Dashboard', extras: [] },
  { module: 'Calendar', extras: [] },
  {
    module: 'Tours & Bookings',
    extras: ['Manage Tour Packages', 'Choose Tour Guide'],
  },
  {
    module: 'Rental Management',
    extras: ['Change Rental Price', 'Change Extension Price'],
  },
  {
    module: 'Fleet Management',
    extras: ['Adjust Vehicle Fuel Level'],
  },
  { module: 'Customer Management', extras: [] },
  { module: 'Pricing Management', extras: [] },
  { module: 'Quad Maintenance', extras: [] },
  { module: 'Fuel Logs', extras: [] },
  { module: 'Inventory', extras: [] },
  { module: 'Finance Management', extras: [] },
  { module: 'Alerts', extras: [] },
  { module: 'User & Role Management', extras: [] },
  { module: 'System Settings', extras: [] },
  { module: 'Project Export', extras: [] },
  { module: 'WhatsApp Alerts', extras: [] },
];

export const MODULE_PERMISSION_KEYS = PERMISSION_GROUPS.map((group) => group.module);
export const EXTRA_PERMISSION_KEYS = PERMISSION_GROUPS.flatMap((group) => group.extras);
export const ALL_PERMISSION_KEYS = [...MODULE_PERMISSION_KEYS, ...EXTRA_PERMISSION_KEYS];
export const SPECIAL_PERMISSION_KEYS = [...EXTRA_PERMISSION_KEYS];

