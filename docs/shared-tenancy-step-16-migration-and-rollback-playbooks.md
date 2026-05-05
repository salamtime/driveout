# Shared Tenancy Step 16: Migration and Rollback Playbooks

This step defines the operational playbooks for moving tenants safely while shared tenancy rolls out.

It is intentionally separate from the architecture steps.

The goal here is not to build more runtime behavior.

The goal is to make sure the team knows:

- how to onboard new shared tenants safely
- how to migrate legacy/dedicated tenants later
- how to pause or reverse a rollout when something goes wrong
- how to preserve the dedicated path without losing the current product

## Playbook Scope

This step covers:

1. New tenant onboarding in shared mode
2. Existing dedicated tenant migration planning
3. Dedicated-to-shared cutover checklist
4. Shared-to-safe-hold rollback actions
5. Dedicated-mode preservation rules

It does **not** assume that every existing tenant must be migrated immediately.

## Core Rule

Until the remaining step-15 security gaps are closed:

- `shared` may be the architectural default
- but production cutover must still be controlled tenant by tenant

That means migration should be gradual, not global.

## Playbook A: New Shared Tenant Onboarding

Use this for all standard future business-owner signups once shared mode is ready for controlled rollout.

### Entry conditions

- tenant signup is approved
- platform business account exists
- platform subscription/trial exists
- tenant row exists
- tenant is marked `tenancy_mode = shared`
- shared runtime readiness checks are healthy

### Provisioning sequence

1. Create or confirm the business account.
2. Create or confirm the tenant registry row.
3. Create or confirm the tenant organization row.
4. Create or confirm owner membership and owner app-user linkage.
5. Seed shared runtime defaults:
   - feature access
   - tenant settings
   - trial window
   - module access
6. Resolve tenant workspace config from the shared project.
7. Run shared readiness verification.
8. Mark workspace active only if readiness passes.

### Abort conditions

Stop onboarding and leave the tenant in a non-ready state if:

- organization linkage fails
- owner membership cannot be created
- shared readiness fails
- tenancy mode is accidentally set to `dedicated`

### Success condition

The tenant is considered ready only when:

- session resolves `tenant_id`
- session resolves `organization_id`
- shared readiness is `ready = true`
- workspace state resolves to `tenant_ready`

## Playbook B: Existing Dedicated Tenant Assessment

Use this before migrating any existing dedicated tenant into shared mode.

### Assess first

For each tenant, answer:

1. Is the tenant active and business-critical?
2. Is the schema already aligned to the canonical contract?
3. Is the tenant data ownership already backfilled or mappable to one organization?
4. Does the tenant use any of the still-risky step-15 surfaces heavily?
   - messaging
   - verification
   - marketplace/public flows
   - OCR/media uploads
5. Is there a rollback path prepared for that tenant specifically?

### Tenant classification

Classify each tenant as one of:

- `shared-ready`
  - can migrate once final security gaps are closed
- `shared-later`
  - keep dedicated for now
- `dedicated-permanent`
  - premium/special-case tenant that should stay isolated

### Recommendation

Do **not** migrate all legacy dedicated tenants automatically.

First classify them.

## Playbook C: Dedicated to Shared Migration

Use this only for a tenant that has already passed the assessment.

### Pre-cutover checklist

1. Snapshot tenant registry state.
2. Snapshot tenant business-account and subscription state.
3. Snapshot tenant schema/release verification state.
4. Snapshot tenant storage/media paths if uploads are in scope.
5. Confirm organization mapping exists and is unique.
6. Confirm step-15 risky surfaces are either:
   - already hardened for this tenant, or
   - not in active use
7. Confirm a rollback owner is assigned.

### Migration sequence

1. Freeze non-essential admin changes for the tenant.
2. Backfill and verify tenant-owned rows to the real `organization_id`.
3. Verify shared readiness prerequisites.
4. Switch tenant record to `tenancy_mode = shared` in a controlled admin action.
5. Re-resolve tenant workspace config against the shared project.
6. Run tenant session verification.
7. Run shared readiness verification.
8. Perform smoke tests:
   - login
   - dashboard
   - rentals
   - fleet
   - pricing
   - one public/participant surface if relevant

### Success condition

Migration succeeds only if:

- tenant session resolves shared runtime correctly
- shared readiness is healthy
- core smoke tests pass
- no cross-tenant leak is observed

## Playbook D: Shared Rollout Rollback

This is the emergency playbook if a migrated tenant shows isolation or readiness problems after shared cutover.

### Immediate response

1. Stop further migrations.
2. Mark the affected tenant as operationally blocked.
3. Disable any public/shared surface that is actively leaking or misrouting.
4. Preserve logs, audit rows, and tenant session evidence.

### Safe rollback options

#### Option 1: Shared safe-hold rollback

Use this if the issue is in app/runtime behavior but not data corruption.

Actions:

1. Set tenant status to non-ready or suspended operationally.
2. Keep `tenancy_mode = shared`.
3. Fix the application/query/RLS issue.
4. Re-run readiness and smoke tests.
5. Re-activate only after verification.

Use this when:

- tenant data is still correct
- issue is route/query/policy behavior

#### Option 2: Revert tenant to dedicated mode

Use this only if:

- the tenant already has a valid preserved dedicated path
- or the tenant is explicitly designated as `dedicated-permanent`

Actions:

1. Set tenant `tenancy_mode = dedicated`.
2. Restore dedicated runtime connection fields if needed:
   - `tenant_project_ref`
   - `tenant_api_url`
   - `tenant_anon_key`
3. Re-run dedicated readiness verification.
4. Confirm tenant workspace launch still resolves correctly.

Use this when:

- the shared issue is severe enough that operational isolation confidence is broken

### What not to do

Do not:

- bulk-flip all tenants back and forth
- mutate canonical SaharaX to solve a tenant-only isolation bug
- destroy preserved dedicated metadata during shared rollout

## Playbook E: Dedicated Mode Preservation

The current dedicated-project path stays preserved for:

- legacy tenants not yet migrated
- premium isolated tenants
- special-case enterprise tenants
- emergency fallback where a tenant must remain outside the shared runtime

### Preservation rules

1. Do not delete dedicated provisioning code yet.
2. Do not remove:
   - `tenant_project_ref`
   - `tenant_api_url`
   - `tenant_anon_key`
3. Do not collapse shared and dedicated admin surfaces into one ambiguous workflow.
4. Do not assume every tenant will become shared.

### Product rule

From now on:

- `shared` = normal onboarding path
- `dedicated` = explicit alternate path

That keeps current work reusable instead of abandoned.

## Required Operational Artifacts

Before production shared rollout is considered complete, the team should maintain:

1. A tenant migration checklist per tenant
2. A rollback owner per migration window
3. A tenant classification list:
   - shared-ready
   - shared-later
   - dedicated-permanent
4. A live issue log for step-15 risky surfaces
5. A preserved inventory of dedicated-mode tenants and their project refs

## Recommended Rollout Strategy

1. Keep new architecture default = `shared`
2. Do not mass-migrate active dedicated tenants yet
3. Finish the remaining step-15 security work
4. Migrate one internal/non-critical tenant first
5. Then migrate one real but low-risk tenant
6. Expand only after repeated successful verifications

## Step 16 Outcome

Step 16 gives the project the missing operational discipline:

- how to onboard shared tenants safely
- how to classify legacy dedicated tenants
- how to migrate a tenant intentionally
- how to stop and recover if shared rollout fails
- how to preserve the old dedicated path without throwing away existing work
