# Canonical Tenant Schema Release Flow

Last updated: `2026-05-03`

## Goal

Every schema change in the SaharaX master platform must become an explicit tenant release target instead of an informal `v1`-style assumption.

That means:

- one canonical schema release definition
- one canonical workspace contract version
- one canonical tenant migration target for existing workspaces
- one repeatable verification path after provisioning or upgrades

## Canonical release source

The current canonical tenant release is declared in:

- [api/_lib/tenantSchemaRelease.js](/Users/amrani/Desktop/rental-system-frontend/api/_lib/tenantSchemaRelease.js)

Current fields:

- `releaseId`
- `schemaVersion`
- `contractVersion`
- `migrations`
- `canonicalTenant`
- `structurePolicy`
- `dataPolicy`
- `upgradePolicy`

## Policy

- `SaharaX` is the canonical schema source of truth.
- New tenant workspaces must be provisioned against the canonical release target.
- Existing tenant workspaces must be upgraded toward the same canonical release target.
- Tenant business data stays isolated even when schema structure is synchronized.

## Release lifecycle

1. Update the canonical schema structure in the master platform.
2. Bump the canonical release definition in [api/_lib/tenantSchemaRelease.js](/Users/amrani/Desktop/rental-system-frontend/api/_lib/tenantSchemaRelease.js).
3. Register every approved tenant-facing schema migration in the release `migrations` manifest.
4. Update the workspace contract if required tables/functions changed.
5. Run tenant upgrade tooling against existing workspaces.
6. Run drift/readiness verification.
7. Mark tenants healthy only after the release target is met.

## Current repo integration

The canonical release is now used by:

- provisioning defaults
- tenant bootstrap metadata
- tenant readiness contract wiring
- workspace config responses

This repo now supports both:

- a canonical release definition
- a guarded tenant rollout path for existing workspaces

## Inspection command

```bash
npm run schema:release:current
```

Use this command whenever you need to confirm the current tenant schema release target before provisioning or upgrading workspaces.

## Tenant upgrade runner

The guarded tenant upgrade runner is:

- [tmp/run_tenant_schema_upgrade_guarded.mjs](/Users/amrani/Desktop/rental-system-frontend/tmp/run_tenant_schema_upgrade_guarded.mjs)

Repo command:

```bash
npm run schema:upgrade:tenant -- --target-project-ref <supabase-project-ref> --target-tenant <tenant-slug>
```

Apply mode:

```bash
npm run schema:upgrade:tenant -- --target-project-ref <supabase-project-ref> --target-tenant <tenant-slug> --apply
```

Current behavior:

- applies approved explicit release migrations from the canonical release manifest first
- adds missing enums
- adds missing tables
- adds missing columns
- restores missing primary/unique constraints needed by the canonical contract
- restores missing supporting key constraints for referenced support tables like `rate_types` and `platform_tenants`
- restores missing foreign keys
- removes extra managed foreign keys that should not exist under exact-clone policy
- respects equivalent existing constraints even if tenant-side names differ from canonical
- reports remaining manual drift:
  - extra tables
  - column definition mismatches

This is intentionally the safe guarded upgrade phase. Verification/blocking steps decide whether remaining drift is acceptable or should stop the release.

## Tenant verification gate

The guarded tenant verification gate is:

- [tmp/verify_tenant_schema_release_guarded.mjs](/Users/amrani/Desktop/rental-system-frontend/tmp/verify_tenant_schema_release_guarded.mjs)

Repo command:

```bash
npm run schema:verify:tenant -- --target-project-ref <supabase-project-ref> --target-tenant <tenant-slug>
```

Optional relaxed mode:

```bash
npm run schema:verify:tenant -- --target-project-ref <supabase-project-ref> --target-tenant <tenant-slug> --allow-extra
```

Blocking behavior:

- exits with code `0` only when the tenant matches the canonical release target
- exits non-zero when any blocking drift remains

Current blocking checks:

- missing tables
- missing columns
- mismatched column definitions
- missing foreign keys
- missing required contract tables
- missing required contract functions
- extra tables, columns, and foreign keys unless `--allow-extra` is used

## Hard protection

The hard protection layer is declared in:

- [api/_lib/tenantSchemaMutationGuard.js](/Users/amrani/Desktop/rental-system-frontend/api/_lib/tenantSchemaMutationGuard.js)

The official guarded mutation paths now enforce:

- tenant schema release targets may **not** point at the canonical SaharaX project
- tenant schema apply operations must use the **current approved** release id
- explicit migration ids must exist in the approved release manifest
- official workspace bootstrap/schema-write helpers are tenant-only and reject canonical-target writes

This means the default safe rule is now:

1. change canonical SaharaX first
2. register the migration in the canonical release manifest
3. run the guarded tenant release flow against tenant targets
4. verify the tenant passes the release gate

Direct tenant-only schema SQL is no longer the normal path.

## What is intentionally blocked

The guarded system should block these cases by default:

- running the tenant schema release against the canonical SaharaX project
- applying a tenant schema release with an outdated or unapproved release id
- applying migration ids that are not declared in the approved canonical release manifest
- using official tenant bootstrap helpers to mutate the canonical source project

## Deployment wiring

The canonical release flow is now wired into deployment operations with two orchestration scripts:

- [scripts/run-tenant-schema-release.mjs](/Users/amrani/Desktop/rental-system-frontend/scripts/run-tenant-schema-release.mjs)
- [scripts/deploy-production-with-tenant-release.mjs](/Users/amrani/Desktop/rental-system-frontend/scripts/deploy-production-with-tenant-release.mjs)

### 1. Upgrade + verify tenant targets

```bash
npm run schema:release:tenant -- --tenant owner1:tiynxhosawkclmgcyefe --apply-upgrade
```

This command:

1. runs the guarded tenant upgrade runner
2. runs the blocking verification gate
3. exits non-zero if any tenant target still drifts from the canonical release

Multiple tenant targets are supported:

```bash
npm run schema:release:tenant -- \
  --tenant owner1:tiynxhosawkclmgcyefe \
  --tenant another:projectrefhere \
  --apply-upgrade
```

### 2. Full production release with tenant schema gate

```bash
npm run deploy:production:tenant-release -- --tenant owner1:tiynxhosawkclmgcyefe
```

This command:

1. applies the tenant schema release flow to the provided tenant targets
2. stops immediately if verification fails
3. then runs the normal production deployment flow from the same local snapshot

So the operational release path is now:

1. canonical schema release target
2. tenant upgrade
3. tenant verification
4. production deploy

## Proven example

The current release was applied successfully to:

- tenant: `owner1`
- target project ref: `tiynxhosawkclmgcyefe`
- release id: `2026-05-03-canonical-business-workspace-r2`

Verified outcome:

- canonical release migration applied:
  - `2026-05-03-tour-maintenance-vehicle-link-columns`
- verification gate result:
  - `ok: true`
- no remaining:
  - missing tables
  - missing columns
  - mismatched columns
  - missing foreign keys
  - extra foreign keys
  - missing contract tables/functions

Use `owner1` as the known-good reference when validating future tenant release behavior.
