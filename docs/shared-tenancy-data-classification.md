# Shared Tenancy Data Classification

This document defines the logical separation between platform-only data, shared reference data, and tenant-owned business data for the shared-project tenancy migration.

It is intentionally grounded in the current codebase and migrations, not an abstract redesign.

## Purpose

Before strict shared-project RLS can be implemented, every table must have one of these classifications:

1. `platform_only`
2. `shared_reference`
3. `tenant_owned`
4. `legacy_dedicated_only`

This classification becomes the migration contract for:

- RLS design
- `organization_id` backfills
- service/query audits
- public route isolation
- storage partitioning
- future tenancy-mode branching

## Classification Rules

### `platform_only`

Tables used for platform orchestration, billing, provisioning, lifecycle, and audit.

These are not tenant business records and should not be scoped by tenant `organization_id`.

### `shared_reference`

Tables that may remain globally shared across the app if the product decision is that they are reusable catalog/config/reference rows.

These should be treated carefully:
- if the data is SaharaX-specific branding or business logic, it should be moved out of this category later
- if it is a neutral catalog/reference source, it may remain shared

### `tenant_owned`

Tables containing actual workspace business data.

These are the core shared-project migration tables and must be isolated by `organization_id`.

### `legacy_dedicated_only`

Tables or fields that exist only to support the current dedicated-project provisioning model.

They are preserved for legacy/premium dedicated mode, but should not define the default shared-project runtime.

## Current Classification

### Platform-only

- `platform_business_accounts`
- `platform_business_subscriptions`
- `platform_tenants`
- `platform_tenant_provisioning_jobs`
- `platform_tenant_audit_log`
- `platform_tenant_workspace_pool`
- `platform_admin_accounts`

### Shared reference

These are currently candidates to remain globally shared, but some may later be reclassified if you want fully tenant-specific catalogs.

- `saharax_0u4w4d_vehicle_models`
- `saharax_0u4w4d_locations`
- `rate_types`
- `system_settings` / `app_settings` style global config tables
- `tax_settings` if intended as shared platform defaults

Important note:
- `vehicle_models` and `locations` are only safe as shared reference data if they are neutral and not SaharaX-branded operational content

### Tenant-owned

Core workspace identity and membership:
- `app_organizations`
- `app_organization_members`
- `app_b30c02e74da644baad4668e3587d86b1_users`
- `app_b30c02e74da644baad4668e3587d86b1_user_module_access`

Fleet / rentals / customers:
- `saharax_0u4w4d_vehicles`
- `app_4c3a7a6153_customers`
- `app_4c3a7a6153_rentals`
- `rental_extensions`
- `app_4c3a7a6153_rental_events`
- `app_4c3a7a6153_rental_photos`
- `app_4c3a7a6153_rental_vehicle_history`

Pricing / commercial logic:
- `app_4c3a7a6153_base_prices`
- `pricing_tiers`
- `app_4c3a7a6153_rental_km_packages`
- `app_4c3a7a6153_transport_fees`

Tasks / operations / reports:
- `app_4c3a7a6153_team_tasks`
- `app_4c3a7a6153_task_comments`
- `app_4c3a7a6153_task_notifications`
- `app_4c3a7a6153_vehicle_reports`

Tours:
- `app_687f658e98_tour_packages`
- `app_687f658e98_tour_package_model_prices`
- `app_687f658e98_tour_bookings`
- `tour_vehicle_snapshots`

Maintenance:
- `app_687f658e98_maintenance`
- `app_687f658e98_maintenance_parts`

Inventory:
- `saharax_0u4w4d_inventory_items`
- `saharax_0u4w4d_inventory_movements`
- `saharax_0u4w4d_inventory_purchases`
- `saharax_0u4w4d_inventory_purchase_lines`

Fuel:
- `fuel_tank`
- `fuel_refills`
- `vehicle_fuel_refills`
- `fuel_withdrawals`
- `vehicle_fuel_state`
- `fuel_operation_logs`
- `fuel_transactions_default_feed`

Finance:
- `finance_expenses`
- `app_4c3a7a6153_receive_funds_entries`

Messaging / shared customer communication:
- `shared_message_threads`
- `shared_message_participants`
- `shared_messages`
- `shared_message_media`

Verification / public share / booking / marketplace flows that contain tenant business data:
- `verification_requests`
- `verification_events`
- `short_links`
- `app_vehicle_public_profiles`
- `app_marketplace_listings`
- `app_booking_requests`
- `app_booking_messages`

Growth / wallets / boosts when tied to one business workspace:
- `wallet_topups`
- `owner_boost_ledger`
- `owner_listing_boost_redemptions`
- `owner_boost_share_links`

### Legacy dedicated-only

These fields remain valid for legacy/premium dedicated mode, but should no longer define standard shared-mode readiness or runtime:

- `platform_tenants.tenant_project_ref`
- `platform_tenants.tenant_api_url`
- `platform_tenants.tenant_anon_key`
- `platform_tenants.tenant_service_role_secret_ref`
- `platform_tenants.tenant_database_name`
- `platform_tenant_workspace_pool`
- dedicated project creation / workspace pool assignment metadata

## Immediate Migration Meaning

From this point forward:

- `platform_only` tables are not part of tenant business RLS
- `tenant_owned` tables must eventually enforce `organization_id`
- `shared_reference` tables need an explicit product decision before hardening
- `legacy_dedicated_only` structures stay preserved but are no longer the default shared runtime contract

## Step 2 Outcome

After this step, the migration has a stable inventory answering:

- what belongs to the platform
- what belongs to the tenant
- what might be shared reference data
- what belongs only to the legacy dedicated-project path

This is the boundary required before Step 3 can redefine provisioning and Step 8 can rewrite RLS safely.
