## Shared Tenancy Step 12

This step is the verification and cutover review for the shared-project tenancy path.

### Files updated

- [src/pages/WorkspaceStatusPage.jsx](/Users/amrani/Desktop/rental-system-frontend/src/pages/WorkspaceStatusPage.jsx)
- [docs/shared-tenancy-step-12-cutover-verification.md](/Users/amrani/Desktop/rental-system-frontend/docs/shared-tenancy-step-12-cutover-verification.md)

### What was verified

1. Default architectural direction
- new tenancy model is frozen as `shared`
- dedicated mode is preserved as a secondary path

2. Shared provisioning path
- shared tenants provision owner/org/runtime state without creating a new Supabase project
- shared tenant workspace config resolves the shared project credentials correctly

3. Shared runtime contract
- tenant session now carries:
  - `tenant_id`
  - `organization_id`
  - `tenancy_mode`
  - plan / feature access
  - workspace state

4. Shared schema/runtime preparation
- missing `organization_id` columns were added
- ownership normalization pass exists
- core authenticated RLS rewrite exists
- core workspace services now carry organization scope
- core storage helper now writes tenant-scoped paths
- readiness now validates the specific shared tenant, not just the project globally

5. Shared provisioning UI alignment
- workspace progress UI no longer assumes dedicated-project provisioning for shared mode
- shared mode now shows organization-preparation steps instead of “private database initialized”

### Remaining blockers before a true production cutover

These are the honest remaining gaps:

1. Direct page/component Supabase queries
- many admin components still query shared tables directly instead of always going through the organization-aware service layer
- these are likely to work only where RLS alone is enough, but they have not all been audited explicitly

2. Public and participant-driven surfaces
- marketplace/public storefront
- booking request participant flows
- verification flows
- shared message/media flows

These need dedicated rule-by-rule validation because they do not fit the generic authenticated workspace model.

3. Storage callers outside the core media services
- OCR uploads
- rental detail uploads
- marketplace media
- message attachments
- customer upload surfaces

The shared storage convention is in place, but not every upload caller uses it yet.

4. Legacy dedicated-project admin surfaces
- some platform admin and workspace management screens still expose or expect dedicated fields such as:
  - `tenant_project_ref`
  - `tenant_api_url`
  - `tenant_anon_key`

That is acceptable for legacy/premium dedicated mode, but those screens are not yet cleanly separated into:
- shared-mode operational data
- dedicated-mode infrastructure data

### Cutover status

Shared tenancy is now:

- structurally built
- internally coherent
- ready for the final app-wide audit phase

But it is **not yet a clean production cutover** until the remaining direct-query, public-surface, and storage-call gaps are audited and tightened.

### Practical decision after step 12

You now have:

- a working shared-tenancy foundation
- a preserved dedicated-tenancy fallback
- a clear blocker list for final rollout

So the right next move is not another architecture redesign.

The right next move is:

- targeted final audit and cleanup of the remaining shared-surface gaps
- then a controlled shared-mode production cutover
