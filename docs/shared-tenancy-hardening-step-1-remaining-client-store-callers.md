## Shared-tenancy hardening step 1: remaining Redux/client callers

This pass removes the remaining high-visibility Redux slices that were still calling Supabase directly instead of going through the service layer.

Updated slices:

- `src/store/slices/paymentsSlice.js`
  - now uses `src/services/PaymentService.js`
- `src/store/slices/alertsSlice.js`
  - now uses `src/services/WorkspaceAlertsService.js`
- `src/store/slices/financeSlice.js`
  - now uses `src/services/FinanceRecordsService.js`
- `src/store/slices/usersSlice.js`
  - now uses `src/services/UserService.js`
- `src/store/slices/activityLogSlice.js`
  - now uses `src/services/ActivityLogService.js`

New service-layer additions:

- `src/services/WorkspaceAlertsService.js`
  - tenant-scoped alert reads, updates, inserts, and realtime subscription
- `src/services/FinanceRecordsService.js`
  - tenant-scoped finance-record CRUD
- `src/services/ActivityLogService.js`
  - tenant-scoped activity-log reads, inserts, and realtime subscription

Service hardening:

- `src/services/PaymentService.js`
  - now owns process/link/sync flows that were previously embedded in the Redux slice

Why this matters:

- these slices no longer bypass the shared-tenancy service boundary
- organization-aware scoping now happens in the service layer instead of raw store thunks
- the Redux layer is closer to the same pattern already used for rentals, vehicles, maintenance, tours, notifications, and packages

Boundary after this step:

- the remaining direct Supabase work is now concentrated outside these Redux slices
- future hardening can focus on public/platform edge cases and older component-level callers rather than the main store layer
