## Shared Tenancy Step 9

This step makes the core authenticated service/query layer match the shared-tenancy RLS contract instead of depending on the old dedicated-project assumption.

### Files updated

- [src/services/OrganizationService.js](/Users/amrani/Desktop/rental-system-frontend/src/services/OrganizationService.js)
- [src/services/VehicleService.js](/Users/amrani/Desktop/rental-system-frontend/src/services/VehicleService.js)
- [src/services/RentalService.js](/Users/amrani/Desktop/rental-system-frontend/src/services/RentalService.js)
- [src/services/PackageService.js](/Users/amrani/Desktop/rental-system-frontend/src/services/PackageService.js)
- [src/services/FuelService.js](/Users/amrani/Desktop/rental-system-frontend/src/services/FuelService.js)

### What this step adds

1. Shared organization context helper
- cached current-organization lookup
- `getCurrentOrganizationId()`
- `requireCurrentOrganizationId()`
- `applyOrganizationMatch(...)` for inserts/updates
- `applyOrganizationScope(...)` for reads

2. Core vehicle service enforcement
- vehicle reads now scope by `organization_id`
- vehicle writes now stamp `organization_id`
- updates/deletes are organization-bound

3. Core rental dashboard service enforcement
- rental dashboard/service reads now scope by `organization_id`

4. Core pricing package service enforcement
- package reads and writes now scope by `organization_id`

5. Core fuel service enforcement
- refill/withdrawal writes now stamp `organization_id`
- fuel transaction reads now scope by `organization_id`
- vehicle lookup inside fuel flow is organization-scoped

### Important scope of this step

This is the shared-runtime foundation pass, not the full final audit of every direct Supabase call in the app.

There are still query hotspots outside these shared service layers, especially in:

- large admin page components
- public storefront flows
- marketplace/booking participant flows
- verification and messaging surfaces
- finance tables with legacy text `organization_id`

Those remain later-step work on purpose.

### Why this is still a valid step

The old dedicated-project model relied on database-level isolation by project, so many shared runtime services never had to carry tenant context themselves.

This step changes that assumption at the service layer for the main authenticated workspace paths first, which is the minimum safe foundation before the remaining direct page/component queries are audited one by one.
