# Shared Tenancy Final Normalization Step 1

This pass removes the last direct `supabase.from(...)` reads and writes from the high-risk page-level workspace surfaces that were still bypassing the organization-aware service layer.

## Normalized pages

- `src/pages/admin/Fleet.jsx`
- `src/pages/admin/Dashboard.jsx`
- `src/pages/admin/RentalDetails.jsx`
- `src/components/admin/EnhancedStepperRentalForm.jsx`
- `src/components/admin/ViewCustomerDetailsDrawer.jsx`
- `src/components/maintenance/AddMaintenanceForm.jsx`
- `src/components/maintenance/src/components/maintenance/AddMaintenanceForm.jsx`

## Service changes used by this pass

- `src/services/FleetLocationService.js`
  - locations are now organization-scoped on read/write
- `src/services/EnhancedUnifiedCustomerService.js`
  - customer reads/search/history/latest-rental helpers are now organization-aware
  - default exported singleton now exposes the static customer helpers safely
- `src/services/RentalService.js`
  - added shared-safe helpers for:
    - rental by id
    - latest rental by customer id
    - scheduling conflicts for a date range
    - start odometer updates
    - expiring a rental and releasing its vehicle
- `src/services/DashboardWorkspaceService.js`
  - centralizes dashboard core and secondary shared-tenant data hydration

## Result

The target page-level surfaces no longer call tenant business tables directly with raw `supabase.from(...)`. They now flow through organization-aware services that respect shared-tenancy runtime context.

## Verification

- `npm run build`
- targeted scan confirms no direct `supabase.from(...)` calls remain in the normalized page list
