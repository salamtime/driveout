## Shared Tenancy Blocker Step 4: `/api/me` Cleanup

This pass removes the biggest dedicated-project assumptions still living inside
`/api/me` and aligns its tenant/runtime behavior with the shared-first model.

### Hardened now

- `api/me.js`
  - tenant plan-selection flow no longer treats dedicated project credentials as
    the only definition of a provisioned tenant
  - shared tenants are now considered ready when their tenant record is active
    and the shared organization identity is present in metadata
  - marketplace approval message seeding now stamps shared thread/message rows
    with the owner organization scope instead of writing unscoped shared rows

### New helpers introduced inside `/api/me`

- `loadUserOrganizationId(...)`
  - resolves the current user’s organization from the app user profile or
    organization membership fallback

- `isTenantRecordReadyForCurrentMode(...)`
  - centralizes tenant readiness evaluation by tenancy mode
  - `shared` mode checks active status plus shared organization metadata
  - `dedicated` mode keeps the legacy project/app/api/key requirement

### Outcome

`/api/me` now behaves more like a shared-runtime entrypoint instead of a
dedicated-project compatibility layer with shared mode bolted on.

### Intentional boundary

This step does **not** fully rewrite all customer-facing marketplace and booking
queries in `/api/me` to organization-scoped services yet. It removes the most
important dedicated-era assumptions and fixes the unscoped shared-message write
path, while leaving the broader customer aggregation cleanup for later passes if
needed.
