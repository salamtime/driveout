import { CURRENT_TENANT_SCHEMA_CONTRACT_VERSION } from './tenantSchemaRelease.js';

export const CANONICAL_TENANT_WORKSPACE_CONTRACT_VERSION = CURRENT_TENANT_SCHEMA_CONTRACT_VERSION;

export const CANONICAL_TENANT_WORKSPACE_REQUIRED_TABLES = Object.freeze([
  'app_organizations',
  'app_organization_members',
  'app_b30c02e74da644baad4668e3587d86b1_users',
  'saharax_0u4w4d_vehicles',
  'saharax_0u4w4d_vehicle_models',
  'saharax_0u4w4d_locations',
  'app_4c3a7a6153_customers',
  'app_4c3a7a6153_rentals',
  'app_4c3a7a6153_base_prices',
  'app_4c3a7a6153_rental_km_packages',
  'pricing_tiers',
  'app_4c3a7a6153_team_tasks',
  'app_4c3a7a6153_task_comments',
  'app_4c3a7a6153_task_notifications',
  'app_4c3a7a6153_vehicle_reports',
  'app_687f658e98_maintenance',
  'app_687f658e98_maintenance_parts',
  'app_687f658e98_tour_packages',
  'app_687f658e98_tour_bookings',
  'saharax_0u4w4d_inventory_items',
  'saharax_0u4w4d_inventory_movements',
  'saharax_0u4w4d_inventory_purchases',
  'saharax_0u4w4d_inventory_purchase_lines',
  'fuel_tank',
  'vehicle_fuel_refills',
  'fuel_withdrawals',
  'vehicle_fuel_state',
  'rental_extensions',
  'tour_vehicle_snapshots',
]);

export const CANONICAL_TENANT_WORKSPACE_REQUIRED_FUNCTIONS = Object.freeze([
  'app_current_organization_id',
  'get_user_effective_permissions',
]);

export const getCanonicalTenantWorkspaceContract = () => ({
  version: CANONICAL_TENANT_WORKSPACE_CONTRACT_VERSION,
  requiredTables: CANONICAL_TENANT_WORKSPACE_REQUIRED_TABLES,
  requiredFunctions: CANONICAL_TENANT_WORKSPACE_REQUIRED_FUNCTIONS,
});

// Backward-compatible aliases while the rest of the platform finishes
// moving away from the "legacy" naming.
export const LEGACY_BUSINESS_WORKSPACE_CONTRACT_VERSION = CANONICAL_TENANT_WORKSPACE_CONTRACT_VERSION;
export const LEGACY_BUSINESS_WORKSPACE_REQUIRED_TABLES = CANONICAL_TENANT_WORKSPACE_REQUIRED_TABLES;
export const LEGACY_BUSINESS_WORKSPACE_REQUIRED_FUNCTIONS = CANONICAL_TENANT_WORKSPACE_REQUIRED_FUNCTIONS;
export const getLegacyBusinessWorkspaceContract = getCanonicalTenantWorkspaceContract;
