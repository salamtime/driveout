## Shared Tenancy Step 6

This step adds `organization_id` to tenant-owned tables that were not covered by the older workspace foundation migrations.

### Covered by the new migration

- `pricing_tiers`
- `rental_extensions`
- `app_687f658e98_tour_package_model_prices`
- `tour_vehicle_snapshots`
- `fuel_tank`
- `fuel_refills`
- `vehicle_fuel_refills`
- `fuel_withdrawals`
- `vehicle_fuel_state`
- `fuel_operation_logs`
- `shared_message_threads`
- `shared_message_participants`
- `shared_messages`
- `shared_message_media`
- `verification_requests`
- `verification_events`
- `short_links`
- `app_vehicle_public_profiles`
- `app_marketplace_listings`
- `app_booking_requests`
- `app_booking_messages`

### Backfill strategy in this step

This migration is intentionally conservative:

- it adds the `organization_id` column and foreign key/index everywhere missing
- it backfills from obvious existing relationships first:
  - rental -> extension
  - package -> package model price
  - rental / vehicle -> tour snapshot
  - vehicle / actor user -> fuel tables
  - thread -> message / participant / media
  - owner user -> verification / marketplace profile
  - listing -> booking request
  - booking request -> booking message
  - rental -> short link
- any rows still unresolved are temporarily assigned to `driveout-platform`

That temporary fallback is deliberate. Step 6 is the schema-prep layer. Step 7 is the real tenant-by-tenant ownership normalization pass.

### Explicit exceptions

These tables already have an `organization_id` field, but it is text-typed today, so they are excluded from the UUID conversion in this step:

- `finance_expenses`
- `app_4c3a7a6153_receive_funds_entries`

They need a separate type-normalization pass later because changing them in place would be more destructive than the goal of step 6.

### Extra shared-tenancy improvement included here

`fuel_transactions_default_feed` is recreated to expose `organization_id` so the server-side unified fuel feed can be tenant-scoped in the shared-project model.
