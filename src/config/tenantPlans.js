export const TENANT_PLAN_ORDER = Object.freeze(['free', 'starter', 'growth', 'pro']);

export const TENANT_FEATURE_KEYS = Object.freeze([
  'dashboard_basic',
  'calendar_module',
  'rentals_basic',
  'fleet_basic',
  'customers_basic',
  'documents_basic',
  'tours_module',
  'tasks_module',
  'live_map_module',
  'inventory_module',
  'alerts_module',
  'verification_module',
  'workspace_settings_module',
  'pricing_module',
  'finance_module',
  'fuel_module',
  'maintenance_module',
  'messages_module',
  'website_editor',
  'marketplace_module',
  'advanced_roles_permissions',
  'project_export',
  'pricing_km_packages',
  'pricing_tier_rules',
  'pricing_fuel_rules',
  'ocr_id_scan',
  'whatsapp_tools',
  'advanced_reporting',
  'multilingual_storefront',
  'online_booking',
  'public_storefront',
]);

export const TENANT_PLAN_LIMITS = Object.freeze({
  free: { vehicles: 5, staff: 1, listings: 0, storage_gb: 2 },
  starter: { vehicles: 10, staff: 3, listings: 5, storage_gb: 10 },
  growth: { vehicles: 30, staff: 10, listings: 20, storage_gb: 50 },
  pro: { vehicles: 100, staff: 30, listings: 100, storage_gb: 250 },
});

export const TENANT_PLAN_FEATURE_DEFAULTS = Object.freeze({
  free: Object.freeze({
    dashboard_basic: true,
    rentals_basic: true,
    fleet_basic: true,
    customers_basic: true,
    documents_basic: true,
    pricing_module: true,
  }),
  starter: Object.freeze({
    dashboard_basic: true,
    calendar_module: true,
    rentals_basic: true,
    fleet_basic: true,
    customers_basic: true,
    documents_basic: true,
    pricing_module: true,
    alerts_module: true,
    messages_module: true,
    verification_module: true,
    workspace_settings_module: true,
    public_storefront: true,
    online_booking: true,
  }),
  growth: Object.freeze({
    dashboard_basic: true,
    calendar_module: true,
    rentals_basic: true,
    fleet_basic: true,
    customers_basic: true,
    documents_basic: true,
    tours_module: true,
    tasks_module: true,
    live_map_module: true,
    inventory_module: true,
    alerts_module: true,
    verification_module: true,
    workspace_settings_module: true,
    pricing_module: true,
    finance_module: true,
    fuel_module: true,
    maintenance_module: true,
    messages_module: true,
    marketplace_module: true,
    pricing_km_packages: true,
    pricing_tier_rules: true,
    pricing_fuel_rules: true,
    ocr_id_scan: true,
    whatsapp_tools: true,
    public_storefront: true,
    online_booking: true,
  }),
  pro: Object.freeze({
    dashboard_basic: true,
    calendar_module: true,
    rentals_basic: true,
    fleet_basic: true,
    customers_basic: true,
    documents_basic: true,
    tours_module: true,
    tasks_module: true,
    live_map_module: true,
    inventory_module: true,
    alerts_module: true,
    verification_module: true,
    workspace_settings_module: true,
    pricing_module: true,
    finance_module: true,
    fuel_module: true,
    maintenance_module: true,
    messages_module: true,
    website_editor: true,
    marketplace_module: true,
    advanced_roles_permissions: true,
    project_export: true,
    pricing_km_packages: true,
    pricing_tier_rules: true,
    pricing_fuel_rules: true,
    ocr_id_scan: true,
    whatsapp_tools: true,
    advanced_reporting: true,
    multilingual_storefront: true,
    online_booking: true,
    public_storefront: true,
  }),
});

export const MODULE_FEATURE_REQUIREMENTS = Object.freeze({
  Dashboard: 'dashboard_basic',
  Calendar: 'calendar_module',
  'Tours & Bookings': 'tours_module',
  'Team Tasks': 'tasks_module',
  'Live Map': 'live_map_module',
  'Rental Management': 'rentals_basic',
  'Customer Management': 'customers_basic',
  'Fleet Management': 'fleet_basic',
  'Pricing Management': 'pricing_module',
  'Quad Maintenance': 'maintenance_module',
  'Fuel Logs': 'fuel_module',
  Inventory: 'inventory_module',
  'Finance Management': 'finance_module',
  Alerts: 'alerts_module',
  'User & Role Management': 'advanced_roles_permissions',
  'Verification Center': 'verification_module',
  Messages: 'messages_module',
  'Marketplace Review': 'marketplace_module',
  'System Settings': 'workspace_settings_module',
  'Project Export': 'project_export',
});

export const normalizeTenantPlanType = (value, fallback = 'starter') => {
  const normalized = String(value || '').trim().toLowerCase();
  return TENANT_PLAN_ORDER.includes(normalized) ? normalized : fallback;
};

export const getTenantPlanLimits = (planType = 'starter') => {
  const normalizedPlan = normalizeTenantPlanType(planType);
  return TENANT_PLAN_LIMITS[normalizedPlan] || TENANT_PLAN_LIMITS.starter;
};

export const getTenantPlanFeatureDefaults = (planType = 'starter') => {
  const normalizedPlan = normalizeTenantPlanType(planType);
  return TENANT_PLAN_FEATURE_DEFAULTS[normalizedPlan] || TENANT_PLAN_FEATURE_DEFAULTS.starter;
};

export const buildEffectiveTenantFeatureAccess = (planType = 'starter', overrides = {}) => {
  const defaults = getTenantPlanFeatureDefaults(planType);
  const sourceOverrides =
    overrides && typeof overrides === 'object' && !Array.isArray(overrides)
      ? overrides
      : {};

  return TENANT_FEATURE_KEYS.reduce((acc, key) => {
    if (typeof sourceOverrides[key] === 'boolean') {
      acc[key] = sourceOverrides[key];
      return acc;
    }

    acc[key] = defaults[key] === true;
    return acc;
  }, {});
};
