## Shared Tenancy Step 11

This step replaces the old dedicated-project-style readiness assumption with tenant-specific shared readiness.

### File updated

- [api/_lib/tenantWorkspaceReadiness.js](/Users/amrani/Desktop/rental-system-frontend/api/_lib/tenantWorkspaceReadiness.js)

### What changed

1. Shared project ref is resolved internally

Readiness no longer depends on a shared-mode tenant row already carrying its own dedicated `tenant_project_ref`.

For `shared` tenants, the readiness layer now resolves the shared project ref directly from:

- [api/_lib/supabase.js](/Users/amrani/Desktop/rental-system-frontend/api/_lib/supabase.js)

2. Shared runtime readiness is now tenant-specific

The old runtime checks were effectively project-global:

- any owner user exists
- any tenant organization exists
- any owner membership exists

That is not safe in a shared database, because one tenant could make another tenant appear ready.

This step fixes that by validating the specific tenant:

- owner auth user can be resolved
- tenant organization can be resolved
- owner app user exists for that tenant
- owner primary organization matches that tenant organization
- owner has active `org_owner` membership in that tenant organization
- owner permissions and verification status are seeded
- owner trial window is present when trial status requires it

3. Shared and dedicated readiness now diverge intentionally

- `dedicated` tenants still use the project-query runtime readiness path
- `shared` tenants now use the tenant-specific runtime readiness path

Both still use the canonical schema contract, but only the shared path validates tenant runtime state against the specific tenant organization instead of the project as a whole.

### Why this matters

Without this step, shared tenancy could report false positives:

- tenant A is ready
- tenant B is not seeded correctly
- global runtime checks still pass because tenant A exists

Now readiness means:

- this exact tenant is connected to the shared runtime correctly

That is the behavior the shared-project model needs.
