## Shared Tenancy Step 8

This step replaces the old permissive workspace RLS shape with organization-scoped policies for the internal shared-tenant runtime.

### Goal

Make the shared-project model enforce tenant isolation at the database layer for authenticated workspace users.

### File

- [src/migrations/create_shared_tenant_workspace_rls.sql](/Users/amrani/Desktop/rental-system-frontend/src/migrations/create_shared_tenant_workspace_rls.sql)

### What this migration adds

1. Shared-tenancy RLS helpers
- `app_is_platform_admin()`
- `app_has_current_organization_access(organization_id)`
- `app_can_manage_current_organization(organization_id)`

These helpers let policies express:
- platform-admin bypass when explicitly needed
- strict access to the current organization only
- future room for stronger org-admin write policies

2. Organization-control table policies
- `app_organizations`
- `app_organization_members`
- `app_b30c02e74da644baad4668e3587d86b1_users`
- `app_b30c02e74da644baad4668e3587d86b1_user_module_access`

These tables get explicit policies instead of inheriting the old broad authenticated access patterns.

3. Internal workspace table rewrite

The migration drops existing policies on the main authenticated workspace tables and recreates them as `organization_id`-scoped policies for:

- vehicles
- customers
- rentals
- rental extensions
- pricing tables
- team tasks and task activity
- maintenance
- tours
- inventory
- fuel

### Important boundary of this step

This step is intentionally limited to the internal authenticated workspace runtime.

It does **not** finish the public or participant-driven surfaces yet:

- marketplace/public storefront tables
- booking request public-entry flows
- verification request flows
- shared message participation flows
- `finance_expenses`
- `app_4c3a7a6153_receive_funds_entries`

Those still need follow-up work because they either:
- depend on public access,
- depend on participant-specific rules,
- or still have legacy `organization_id` typing that must be normalized first.

### Why this is the right split

If we tried to fold public storefront and participant tables into the same generic `organization_id` rewrite right now, we would either:
- break live product behavior,
- or create fake “secure” rules that are not actually correct.

So this step locks down the core authenticated tenant workspace first, and leaves the more nuanced flows for the next service/query enforcement pass.
