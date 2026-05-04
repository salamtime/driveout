# Owner1 Schema Sync Plan

Last prepared: `2026-05-03`

## Status

`owner1` has now been converged through the guarded canonical tenant release flow and verified against the canonical release gate.

Current verified state:

- tenant: `owner1`
- target project ref: `tiynxhosawkclmgcyefe`
- release id: `2026-05-03-canonical-business-workspace-r2`
- verification result: `ok: true`

That means this document is now primarily historical/reference material for how the drift was approached before the canonical release flow was fully wired.

## Goal

Bring `owner1` to an **exact schema clone** of the current SaharaX structure while preserving tenant isolation of data.

This plan originally applied to:

- target tenant: `owner1`
- target project ref: `tiynxhosawkclmgcyefe`

It does **not** permit direct edits to the canonical SaharaX project.

## Guardrails

- Only modify `owner1`
- Never modify the canonical SaharaX project during tenant sync
- Treat SaharaX as the structural source of truth
- Preserve tenant data unless a phase explicitly requires empty-table rewrites
- Re-run live audit after every sync phase
- Extra tables and extra columns require an explicit decision, not automatic deletion

## Preferred path now

Do not use ad hoc owner1-only schema repair as the default path anymore.

Use the canonical release flow instead:

```bash
npm run schema:release:tenant -- --tenant owner1:tiynxhosawkclmgcyefe --apply-upgrade
```

That command is now the approved source-of-truth workflow for `owner1` convergence.

## Current drift summary

From the live grouped audit:

- missing tables: `0`
- missing columns: `0`
- extra tables: `2`
- extra columns: `87`
- grouped tables with drift: `171`

Most drift is concentrated in:

1. `app_4c3a7a6153_rentals`
2. `saharax_0u4w4d_vehicles`
3. `app_4c3a7a6153_rental_km_packages`
4. `vehicle_fuel_refills`

## Phase plan

### Phase A: Non-destructive add-only sync

Use when owner1 is missing structures from SaharaX.

Script:

- [tmp/sync_owner1_schema_guarded.mjs](/Users/amrani/Desktop/rental-system-frontend/tmp/sync_owner1_schema_guarded.mjs)

This phase is safe for:

- missing tables
- missing columns
- missing enums

This phase does **not** fix:

- extra tables
- extra columns
- type mismatches
- nullability mismatches
- default mismatches

### Phase B: High-risk core shape harmonization

Use for the business-critical tables where type/default/nullability drift can change behavior.

Focus tables:

- `app_4c3a7a6153_rentals`
- `saharax_0u4w4d_vehicles`
- `app_4c3a7a6153_rental_km_packages`
- `vehicle_fuel_refills`
- `fuel_refills`
- `fuel_withdrawals`
- `vehicle_fuel_state`
- `tour_vehicle_snapshots`

Existing script:

- [tmp/repair_owner1_core_type_compat_guarded.mjs](/Users/amrani/Desktop/rental-system-frontend/tmp/repair_owner1_core_type_compat_guarded.mjs)

Important:

- this script is intentionally guarded
- it refuses to run if key tables are not empty
- it is only appropriate when an empty-table reshape is acceptable

### Phase C: Compatibility column repair

Use for owner1-only missing compatibility columns that modules expect at runtime.

Existing script:

- [tmp/repair_owner1_module_compat_columns_guarded.mjs](/Users/amrani/Desktop/rental-system-frontend/tmp/repair_owner1_module_compat_columns_guarded.mjs)

This phase is narrower than exact-clone sync. It is useful for runtime stability but is not sufficient by itself.

### Phase D: Exactness decision on extra objects

Extra tables currently requiring an explicit keep/remove decision:

- `app_4c3a7a6153_transport_fees`
- `app_b30c02e74da644baad4668e3587d86b1_user_module_access`

Extra columns must be handled table-by-table:

- keep only if promoted into SaharaX too
- otherwise remove from owner1 as part of exact-clone alignment

### Phase E: Post-sync verification

Run after each phase:

```bash
npm run audit:owner1:public
npm run audit:owner1:schema
npm run audit:owner1:report
```

Success condition for strict exact clone:

- missing tables: `0`
- missing columns: `0`
- extra tables: `0` unless explicitly approved
- extra columns: `0` unless explicitly approved
- mismatches: `0` unless explicitly approved

## Recommendation

Do the actual synchronization in this order:

1. decide on the two extra tables
2. resolve high-risk business table drift first
3. fix the long tail of nullable/default mismatches
4. verify to zero drift or to a documented allowlist
