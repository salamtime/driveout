import {
  getTenantPlanLimits,
  normalizeTenantPlanType,
} from '../config/tenantPlans';

export const TENANT_WORKSPACE_TABLES = Object.freeze({
  WORKSPACE_METADATA: 'tenant_workspace_metadata',
  USERS: 'tenant_users',
  MEMBERS: 'tenant_members',
  SETTINGS: 'tenant_settings',
  VEHICLE_MODELS: 'tenant_vehicle_models',
  VEHICLES: 'tenant_vehicles',
  CUSTOMERS: 'tenant_customers',
  PRICING_RULES: 'tenant_pricing_rules',
  RENTALS: 'tenant_rentals',
  TASKS: 'tenant_tasks',
  TASK_COMMENTS: 'tenant_task_comments',
  MAINTENANCE: 'tenant_maintenance',
  MAINTENANCE_PARTS: 'tenant_maintenance_parts',
  FUEL_LOGS: 'tenant_fuel_logs',
  INVENTORY_ITEMS: 'tenant_inventory_items',
  INVENTORY_TRANSACTIONS: 'tenant_inventory_transactions',
  FINANCE_ENTRIES: 'tenant_finance_entries',
  ALERTS: 'tenant_alerts',
  TOURS: 'tenant_tours',
  TOUR_BOOKINGS: 'tenant_tour_bookings',
});

export const TENANT_WORKSPACE_MODULES = Object.freeze([
  'dashboard',
  'fleet',
  'rentals',
  'customers',
  'pricing',
  'calendar',
  'tasks',
  'maintenance',
  'fuel',
  'inventory',
  'finance',
  'tours',
  'settings',
  'staff',
]);

export const buildTenantWorkspaceBootstrap = ({
  tenant = null,
  subscription = null,
  businessAccount = null,
} = {}) => {
  const planType = normalizeTenantPlanType(subscription?.plan_type || subscription?.planType || 'starter');
  const limits = getTenantPlanLimits(planType);

  return {
    tenantId: tenant?.id || null,
    tenantKey: tenant?.tenant_key || tenant?.tenantKey || null,
    tenantName: tenant?.tenant_name || tenant?.tenantName || '',
    tenantSlug: tenant?.tenant_slug || tenant?.tenantSlug || '',
    tenantStatus: tenant?.tenant_status || tenant?.tenantStatus || 'provisioning',
    tenantAppUrl: tenant?.tenant_app_url || tenant?.tenantAppUrl || '',
    tenantApiUrl: tenant?.tenant_api_url || tenant?.tenantApiUrl || '',
    tenantProjectRef: tenant?.tenant_project_ref || tenant?.tenantProjectRef || '',
    tenantDatabaseName: tenant?.tenant_database_name || tenant?.tenantDatabaseName || '',
    schemaVersion: tenant?.schema_version || tenant?.schemaVersion || '',
    planType,
    subscriptionStatus: subscription?.subscription_status || subscription?.subscriptionStatus || 'trial',
    billingStatus: subscription?.billing_status || subscription?.billingStatus || 'none',
    planLimits: subscription?.plan_limits || subscription?.planLimits || limits,
    businessAccountId: businessAccount?.id || null,
    companyName: businessAccount?.company_name || businessAccount?.companyName || '',
    applicationStatus: businessAccount?.application_status || businessAccount?.applicationStatus || 'pending',
  };
};
