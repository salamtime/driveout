# Owner1 Schema Baseline

Last confirmed: `2026-05-02`

## Canonical source of truth

- Canonical tenant: `saharax`
- Canonical Supabase project ref: derived from `VITE_SUPABASE_URL` / `SUPABASE_URL`
- Current canonical project ref: `nnaymteoxvdnsnhlyvkk`

## Target tenant

- Target tenant: `owner1`
- Target Supabase project ref: `tiynxhosawkclmgcyefe`

## Policy

- Schema structure policy: `exact clone`
- Data policy: `isolated tenant data`

That means:

- `owner1` should match the SaharaX schema contract exactly for shared app structure:
  - tables
  - columns
  - nullability
  - defaults
  - identity behavior
  - shared views/functions/policies where applicable
- `owner1` must **not** share SaharaX operational data unless explicitly and safely intended.

## Audit commands

Run these against live Supabase to detect drift:

```bash
npm run audit:owner1:public
npm run audit:owner1:schema
```

## Guardrail

The canonical baseline used by the owner1 schema audit/sync scripts is declared in:

- [tmp/owner1_schema_baseline.mjs](/Users/amrani/Desktop/rental-system-frontend/tmp/owner1_schema_baseline.mjs)
- [api/_lib/tenantSchemaRelease.js](/Users/amrani/Desktop/rental-system-frontend/api/_lib/tenantSchemaRelease.js)

Scripts using this baseline should not hardcode a different source project without an explicit migration decision.
