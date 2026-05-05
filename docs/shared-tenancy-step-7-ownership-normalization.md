## Shared Tenancy Step 7

This step performs the real ownership normalization pass after step 6 added the missing `organization_id` columns.

### Goal

Move tenant-owned rows away from the temporary `driveout-platform` fallback and into the correct tenant organization.

### Source of truth for ownership

This step uses:

- `platform_tenants.owner_user_id`
- the non-platform `app_organizations` row owned by that user

That gives a stable tenant-to-organization map without depending on dedicated-project infrastructure.

### What the migration does

File:

- [src/migrations/normalize_shared_tenant_ownership.sql](/Users/amrani/Desktop/rental-system-frontend/src/migrations/normalize_shared_tenant_ownership.sql)

It performs four categories of work:

1. Registry normalization
- stamps `platform_tenants.metadata.organization_id`
- stamps `platform_tenants.metadata.organization_slug`
- preserves shared-mode metadata for the new path

2. Owner/runtime normalization
- sets `app_users.tenant_id` for tenant owners
- fixes `primary_organization_id` for business owners that still point at `driveout-platform`
- syncs `app_b30c02e74da644baad4668e3587d86b1_user_module_access.organization_id`

3. Relational normalization
- updates rows through reliable ownership chains, for example:
  - vehicle reports from rentals / vehicles / maintenance
  - maintenance parts from maintenance / inventory item
  - inventory movements from inventory items
  - inventory purchase lines from purchases / items
  - task comments / notifications from tasks
  - bookings from vehicles

4. Guarded single-tenant fallback
- if the shared project currently has exactly one tenant business organization,
  unresolved `driveout-platform` rows are reassigned to that single tenant org
- each fallback table is existence-checked before update so the migration stays portable
  across current legacy schema variants

This fallback is intentional for today’s migration reality:
- your existing data mostly comes from one workspace lineage
- many root business tables still lack explicit creator/owner attribution

### Important limitation

If the project contains multiple real tenant organizations with mixed historical rows, the single-tenant fallback does not run.

That is by design.

In that case, unresolved root tables remain a manual or later scripted ownership-cleanup problem instead of being incorrectly reassigned.

### What is still not solved by this step

These remain separate follow-up work:

- text-typed `organization_id` tables:
  - `finance_expenses`
  - `app_4c3a7a6153_receive_funds_entries`
- strict RLS rewrite
- service/query enforcement
- storage path tenant scoping

Those belong to later steps in the shared-tenancy rollout.
