## Shared Tenancy Hardening Step 4: Full Verification Pass

This step is the operational verification pass for shared-tenant isolation after the emergency containment work.

It is intentionally stricter than the earlier architecture-only audit.

The goal here is not to say "looks better."

The goal is to prove that one shared tenant cannot read or mutate another tenant's data, even if:
- a page still has a direct caller
- an older client bundle is open
- a future query path misses an explicit `organization_id` filter

## Mandatory Guardrail Command

Run this before and after every shared-tenant or RLS release:

```bash
npm run audit:shared-tenancy:isolation
```

This command uses real SaharaX/platform and OFFROAD auth sessions. It fails the release if:

- SaharaX loses access to its legacy `organization_id = null` rental rows.
- OFFROAD can read SaharaX legacy rows.
- OFFROAD can read platform-owned rows.
- OFFROAD visible totals differ from its own-organization totals.
- any protected table is missing forced RLS or the expected scoped policies.

The minimum expected SaharaX legacy rental count defaults to `100`. Override it only for an intentional legacy-data migration:

```bash
SAHARAX_MIN_LEGACY_RENTALS=100 npm run audit:shared-tenancy:isolation
```

Do not apply a tenant/RLS release if this command exits non-zero.

## Current Step 4 Status

As of May 11, 2026:

- Step 1 containment is deployed for `Rentals.jsx`
- Step 2 code audit confirmed the risk is systemic
- Step 3 database hardening migration now exists locally:
  - [harden_shared_tenant_data_rls.sql](/Users/amrani/Desktop/rental-system-frontend/src/migrations/harden_shared_tenant_data_rls.sql)

### Important limitation

This step cannot honestly certify production isolation until the Step 3 migration is:

1. pushed
2. applied to the live database
3. verified against at least two shared tenants

So the current Step 4 outcome is:

- **pre-apply verification runbook complete**
- **live certification still blocked on migration apply**

## What Step 4 Verifies

Step 4 must prove all four of these:

1. Shared tenants cannot read each other's data
2. Shared tenants cannot write into each other's data
3. Public/shared surfaces do not leak another tenant's documents or records
4. A missed frontend query filter is still stopped by RLS

## Pre-Apply Findings Confirmed In This Pass

### 1. Shared RLS foundation already exists

Verified in:
- [create_shared_tenant_workspace_rls.sql](/Users/amrani/Desktop/rental-system-frontend/src/migrations/create_shared_tenant_workspace_rls.sql)

Confirmed:
- organization-aware helper policies already exist for the main shared-tenant core
- many important tenant tables are already intended to be organization-scoped

### 2. Legacy permissive policies still exist in later migrations

Verified in:
- [create_receive_funds_entries.sql](/Users/amrani/Desktop/rental-system-frontend/src/migrations/create_receive_funds_entries.sql)
- [create_finance_expenses.sql](/Users/amrani/Desktop/rental-system-frontend/src/migrations/create_finance_expenses.sql)
- [create_team_tasks.sql](/Users/amrani/Desktop/rental-system-frontend/src/migrations/create_team_tasks.sql)
- [enable_activity_log_rls.sql](/Users/amrani/Desktop/rental-system-frontend/src/migrations/enable_activity_log_rls.sql)
- [fix_saharax_first_party_workspace_schema.sql](/Users/amrani/Desktop/rental-system-frontend/src/migrations/fix_saharax_first_party_workspace_schema.sql)
- [harden_pricing_management_rls.sql](/Users/amrani/Desktop/rental-system-frontend/src/migrations/harden_pricing_management_rls.sql)

Confirmed:
- later migrations reintroduced `using (true)` / `with check (true)` on some shared tables
- some finance tables use `organization_id text`, not `uuid`
- this means code discipline alone is not enough

### 3. The hardening migration closes the known database holes

Verified in:
- [harden_shared_tenant_data_rls.sql](/Users/amrani/Desktop/rental-system-frontend/src/migrations/harden_shared_tenant_data_rls.sql)

Confirmed:
- RLS is reasserted and forced for shared tenant core tables
- text-based organization tables now use safe helper functions
- shared finance tables no longer need permissive authenticated access

## Live Verification Checklist After Migration Apply

Use at least two shared tenants for every pass:

- `SaharaX`
- `OFFROAD`

Use separate browser sessions:

- normal window for tenant A
- incognito/private window for tenant B

Never verify both tenants in the same authenticated browser profile.

### A. Session identity verification

For each tenant host, verify:

1. User profile shows the correct workspace identity
2. `organization_id` in `/api/me/profile` belongs to that tenant only
3. Host/session mismatch does not silently fall back to another workspace

Expected result:
- `offroad.driveout.io` resolves only OFFROAD organization context
- `saharax.driveout.io` resolves only SaharaX organization context

### B. Rentals isolation

Check:
- rentals list
- rental details
- receipt preview
- contract preview
- shared receipt/contract link

Expected result:
- OFFROAD cannot see SaharaX rental IDs, customers, vehicles, totals, receipts, contracts
- SaharaX cannot see OFFROAD rental IDs, customers, vehicles, totals, receipts, contracts

Specific negative test:
- open a known SaharaX rental id while logged into OFFROAD
- expected outcome: no row / permission denial / not found

### C. Vehicles isolation

Check:
- fleet list
- vehicle profile
- vehicle history
- maintenance links from vehicle pages

Expected result:
- vehicle plates and models shown in a tenant workspace belong only to that workspace organization
- no cross-tenant vehicle history appears

### D. Customers isolation

Check:
- customer list
- customer profile
- customer search / autocomplete from rental form

Expected result:
- OFFROAD customer search never returns SaharaX customers
- SaharaX customer search never returns OFFROAD customers

### E. Maintenance isolation

Check:
- maintenance list
- maintenance detail
- linked maintenance from rental details

Expected result:
- maintenance refs from one tenant are unreadable from another tenant
- linked maintenance lookups fail closed rather than silently showing foreign data

### F. Finance isolation

Check:
- receive funds
- finance expenses
- daily summaries
- any bank-deposit / receive-funds history

Expected result:
- no finance row from one tenant appears in another tenant
- text-based `organization_id` tables are still isolated correctly

This area is especially important because:
- `app_4c3a7a6153_receive_funds_entries`
- `finance_expenses`

were previously using permissive RLS patterns.

### G. Tasks and notifications isolation

Check:
- team tasks list
- task comments
- task notifications

Expected result:
- only task rows from the current organization appear
- comments and notifications do not bridge tenants

### H. Public/shared document isolation

Check:
- shared receipt links
- shared contract links
- short links

Expected result:
- shared public document links resolve only their own rental and tenant branding
- no tenant can use a foreign short link to discover another tenant's data

### I. Write protection test

While logged into tenant A:

1. try to update a record known to belong to tenant B
2. try to delete a record known to belong to tenant B
3. try to insert a tenant-owned row with tenant B's `organization_id`

Expected result:
- RLS blocks all of them

This is the most important proof that the database layer is truly doing its job.

## Pass/Fail Criteria

Step 4 can only be marked complete when all of the following are true:

1. The Step 3 migration is applied to the live database
2. Two shared tenants are tested side by side
3. Cross-tenant reads fail
4. Cross-tenant writes fail
5. Public shared document links do not leak foreign tenant data
6. No tenant-critical page is still showing another tenant's rows

## Current Residual Risks Even After This Step

Even after the migration is applied, these areas still deserve extra watch because they contain direct callers or complex relationship lookups:

- [RentalDetails.jsx](/Users/amrani/Desktop/rental-system-frontend/src/pages/admin/RentalDetails.jsx)
- [EnhancedStepperRentalForm.jsx](/Users/amrani/Desktop/rental-system-frontend/src/components/admin/EnhancedStepperRentalForm.jsx)
- [VehicleRefillService.js](/Users/amrani/Desktop/rental-system-frontend/src/services/VehicleRefillService.js)
- [receiveFundsService.js](/Users/amrani/Desktop/rental-system-frontend/src/services/receiveFundsService.js)
- [financeApiV2.ts](/Users/amrani/Desktop/rental-system-frontend/src/services/financeApiV2.ts)
- [Alerts.jsx](/Users/amrani/Desktop/rental-system-frontend/src/pages/admin/Alerts.jsx)

These should not block the RLS rollout, but they should remain on the hardening queue for explicit code-path cleanup.

## Step 4 Outcome

Current outcome:

- verification runbook: **complete**
- live database certification: **blocked until Step 3 is pushed and applied**

That means Step 4 is operationally ready, but it is not honest to call shared tenancy certified yet.

The next required move is:

1. push the Step 3 migration
2. apply it to staging and production databases
3. execute this checklist against at least `SaharaX` and `OFFROAD`
