export const TENANT_DATA_SCOPES = Object.freeze({
  PLATFORM_ONLY: 'platform_only',
  SHARED_REFERENCE: 'shared_reference',
  TENANT_OWNED: 'tenant_owned',
  LEGACY_DEDICATED_ONLY: 'legacy_dedicated_only',
});

export const TENANT_TABLE_SCOPE_MAP = Object.freeze({
  platform_business_accounts: TENANT_DATA_SCOPES.PLATFORM_ONLY,
  platform_business_subscriptions: TENANT_DATA_SCOPES.PLATFORM_ONLY,
  platform_tenants: TENANT_DATA_SCOPES.PLATFORM_ONLY,
  platform_tenant_provisioning_jobs: TENANT_DATA_SCOPES.PLATFORM_ONLY,
  platform_tenant_audit_log: TENANT_DATA_SCOPES.PLATFORM_ONLY,
  platform_tenant_workspace_pool: TENANT_DATA_SCOPES.LEGACY_DEDICATED_ONLY,
  platform_admin_accounts: TENANT_DATA_SCOPES.PLATFORM_ONLY,

  app_organizations: TENANT_DATA_SCOPES.TENANT_OWNED,
  app_organization_members: TENANT_DATA_SCOPES.TENANT_OWNED,
  app_b30c02e74da644baad4668e3587d86b1_users: TENANT_DATA_SCOPES.TENANT_OWNED,
  app_b30c02e74da644baad4668e3587d86b1_user_module_access: TENANT_DATA_SCOPES.TENANT_OWNED,

  saharax_0u4w4d_vehicle_models: TENANT_DATA_SCOPES.SHARED_REFERENCE,
  saharax_0u4w4d_locations: TENANT_DATA_SCOPES.SHARED_REFERENCE,
  rate_types: TENANT_DATA_SCOPES.SHARED_REFERENCE,

  saharax_0u4w4d_vehicles: TENANT_DATA_SCOPES.TENANT_OWNED,
  app_4c3a7a6153_customers: TENANT_DATA_SCOPES.TENANT_OWNED,
  app_4c3a7a6153_rentals: TENANT_DATA_SCOPES.TENANT_OWNED,
  rental_extensions: TENANT_DATA_SCOPES.TENANT_OWNED,

  app_4c3a7a6153_base_prices: TENANT_DATA_SCOPES.TENANT_OWNED,
  pricing_tiers: TENANT_DATA_SCOPES.TENANT_OWNED,
  app_4c3a7a6153_rental_km_packages: TENANT_DATA_SCOPES.TENANT_OWNED,
  app_4c3a7a6153_transport_fees: TENANT_DATA_SCOPES.TENANT_OWNED,

  app_4c3a7a6153_team_tasks: TENANT_DATA_SCOPES.TENANT_OWNED,
  app_4c3a7a6153_task_comments: TENANT_DATA_SCOPES.TENANT_OWNED,
  app_4c3a7a6153_task_notifications: TENANT_DATA_SCOPES.TENANT_OWNED,
  app_4c3a7a6153_vehicle_reports: TENANT_DATA_SCOPES.TENANT_OWNED,

  app_687f658e98_tour_packages: TENANT_DATA_SCOPES.TENANT_OWNED,
  app_687f658e98_tour_package_model_prices: TENANT_DATA_SCOPES.TENANT_OWNED,
  app_687f658e98_tour_bookings: TENANT_DATA_SCOPES.TENANT_OWNED,
  tour_vehicle_snapshots: TENANT_DATA_SCOPES.TENANT_OWNED,

  app_687f658e98_maintenance: TENANT_DATA_SCOPES.TENANT_OWNED,
  app_687f658e98_maintenance_parts: TENANT_DATA_SCOPES.TENANT_OWNED,

  saharax_0u4w4d_inventory_items: TENANT_DATA_SCOPES.TENANT_OWNED,
  saharax_0u4w4d_inventory_movements: TENANT_DATA_SCOPES.TENANT_OWNED,
  saharax_0u4w4d_inventory_purchases: TENANT_DATA_SCOPES.TENANT_OWNED,
  saharax_0u4w4d_inventory_purchase_lines: TENANT_DATA_SCOPES.TENANT_OWNED,

  fuel_tank: TENANT_DATA_SCOPES.TENANT_OWNED,
  fuel_refills: TENANT_DATA_SCOPES.TENANT_OWNED,
  vehicle_fuel_refills: TENANT_DATA_SCOPES.TENANT_OWNED,
  fuel_withdrawals: TENANT_DATA_SCOPES.TENANT_OWNED,
  vehicle_fuel_state: TENANT_DATA_SCOPES.TENANT_OWNED,
  fuel_operation_logs: TENANT_DATA_SCOPES.TENANT_OWNED,
  fuel_transactions_default_feed: TENANT_DATA_SCOPES.TENANT_OWNED,

  finance_expenses: TENANT_DATA_SCOPES.TENANT_OWNED,
  app_4c3a7a6153_receive_funds_entries: TENANT_DATA_SCOPES.TENANT_OWNED,

  shared_message_threads: TENANT_DATA_SCOPES.TENANT_OWNED,
  shared_message_participants: TENANT_DATA_SCOPES.TENANT_OWNED,
  shared_messages: TENANT_DATA_SCOPES.TENANT_OWNED,
  shared_message_media: TENANT_DATA_SCOPES.TENANT_OWNED,

  verification_requests: TENANT_DATA_SCOPES.TENANT_OWNED,
  verification_events: TENANT_DATA_SCOPES.TENANT_OWNED,
  short_links: TENANT_DATA_SCOPES.TENANT_OWNED,
  app_vehicle_public_profiles: TENANT_DATA_SCOPES.TENANT_OWNED,
  app_marketplace_listings: TENANT_DATA_SCOPES.TENANT_OWNED,
  app_booking_requests: TENANT_DATA_SCOPES.TENANT_OWNED,
  app_booking_messages: TENANT_DATA_SCOPES.TENANT_OWNED,
});

export const getTenantTableScope = (tableName, fallback = null) => (
  TENANT_TABLE_SCOPE_MAP[String(tableName || '').trim()] || fallback
);
