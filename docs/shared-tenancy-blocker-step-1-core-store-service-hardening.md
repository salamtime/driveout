# Shared Tenancy Blocker Step 1: Core Store Service Hardening

This pass closes the highest-risk authenticated workspace store slices that were still bypassing the shared-tenancy service layer and calling Supabase directly from Redux.

## Completed in this pass

The following store slices now flow through organization-aware services instead of issuing direct client-side Supabase CRUD:

- `src/store/slices/maintenanceSlice.js`
  - now uses `src/services/MaintenanceTrackingService.js`
- `src/store/slices/toursSlice.js`
  - now uses `src/services/ToursService.js`
- `src/store/slices/notificationsSlice.js`
  - now uses `src/services/NotificationService.js`
- `src/store/slices/vehiclesSlice.js`
  - now uses `src/services/VehicleService.js`
- `src/store/slices/rentalsSlice.js`
  - now uses `src/services/RentalService.js`
- `src/store/slices/bookingsSlice.js`
  - now uses `src/services/RentalService.js`

## Service hardening included

This pass also tightened the service layer that those slices rely on:

- `src/services/MaintenanceService.js`
  - core maintenance reads/writes now scope by `organization_id`
- `src/services/MaintenancePartsService.js`
  - maintenance parts reads/writes now scope and stamp `organization_id`
- `src/services/ToursService.js`
  - tour CRUD now scopes and stamps `organization_id`
- `src/services/NotificationService.js`
  - notification list/read/write/subscription paths now resolve current user + organization context
- `src/services/RentalService.js`
  - added organization-aware detailed rental CRUD and conflict-check helpers for shared workspace runtime

## Why this matters

Before this pass, these slices could bypass the shared-tenancy runtime contract entirely:

- no guaranteed `organization_id` scoping
- no single service-level enforcement point
- direct client-side table access spread across Redux logic

After this pass, the main day-to-day workspace store surfaces now go through the same organization-aware service boundary as the shared-tenancy foundation.

## Still remaining after this pass

There are still older or less-central Redux slices with direct Supabase access that need their own follow-up service migration:

- `src/store/slices/paymentsSlice.js`
- `src/store/slices/alertsSlice.js`
- `src/store/slices/financeSlice.js`
- `src/store/slices/usersSlice.js`
- `src/store/slices/activityLogSlice.js`

These remain outside the “core authenticated workspace store” cut line for this pass and should be handled next before calling blocker step 1 fully closed across the entire Redux store surface.
