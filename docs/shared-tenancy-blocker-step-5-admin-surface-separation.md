## Shared-tenancy blocker step 5: workspace-admin surface separation

This pass separates shared-mode tenant controls from dedicated infrastructure controls inside the platform workspace admin.

What changed:

- `src/pages/admin/Workspaces.jsx`
  - the tenant health report is now tenancy-mode aware
  - `dedicated` tenants still use dedicated infrastructure checks:
    - project ref
    - API URL
    - anon key
    - app URL
  - `shared` tenants now use shared runtime checks:
    - organization id
    - organization slug
    - runtime URL availability
    - shared runtime readiness
  - emergency manual activation fields are now shown only for `dedicated` tenants
  - the dedicated `Schema release` panel is now shown only for `dedicated` tenants
  - `shared` tenants get a `Shared tenant readiness` panel instead, with runtime verification only
  - shared tenants are blocked from schema-release and project-level upgrade actions, but can still run runtime verification

Why this matters:

- shared tenants should not look unhealthy just because they do not have dedicated project credentials
- platform admins should not be offered legacy project/app/API fields for tenants that run on the shared runtime
- the admin UI now matches the actual tenancy model instead of mixing both operating modes into one surface

Boundary after this step:

- workspace admin is now honest about `shared` vs `dedicated` runtime controls
- dedicated infrastructure controls are preserved for legacy/premium tenants
- shared tenants now see organization/runtime-oriented health and verification instead of dedicated infrastructure tooling
