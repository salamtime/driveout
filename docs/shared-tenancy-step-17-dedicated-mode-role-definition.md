# Shared Tenancy Step 17: Dedicated Mode Role Definition

This step defines what preserved `dedicated` mode is actually for.

The goal is to stop treating dedicated mode as leftover infrastructure and instead make it an intentional secondary operating model.

## Final Product Rule

From this point forward:

- `shared` = standard/default tenancy model
- `dedicated` = explicit premium/special-case tenancy model

That means dedicated mode is not the normal onboarding path anymore.

It is the exception path for cases where isolation, compliance, or custom deployment requirements justify it.

## Dedicated Mode Is For

Dedicated mode should be used only when a tenant clearly fits one of these profiles:

1. `legacy_hold`
- existing dedicated tenant not yet migrated
- kept dedicated temporarily while shared rollout matures

2. `premium_isolated`
- high-value customer paying for stronger infrastructure isolation
- premium operational offering

3. `enterprise_compliance`
- compliance, contractual, or procurement pressure requires isolated infrastructure

4. `white_label_custom`
- custom-branded or custom-integrated deployment where shared runtime is too restrictive

5. `migration_staging`
- temporary isolated mode used during migration, validation, or structured transition

6. `emergency_fallback`
- tenant reverted to dedicated mode because shared rollout safety or stability was not acceptable

## Dedicated Mode Is Not For

Dedicated mode should **not** be used for:

- normal weekly onboarding volume
- low-friction trial signups
- tenants that can operate correctly in shared mode
- situations where the only reason is old habit or missing cleanup work

If a tenant does not clearly need dedicated mode, it should stay `shared`.

## Commercial and Operational Positioning

### Shared

Use shared mode for:

- normal business-owner onboarding
- growth-focused volume acquisition
- 30-day demos
- standard plans
- most production tenants once shared isolation gaps are closed

### Dedicated

Use dedicated mode for:

- premium isolated workspaces
- enterprise/contractual exceptions
- special migration and rollback cases
- customers where separate-project infrastructure is part of the offer

## Platform Decision Rule

When deciding tenancy mode:

1. default to `shared`
2. require an explicit reason to choose `dedicated`
3. record the dedicated profile in tenant metadata
4. treat dedicated mode as a reviewed operator choice, not an accident

## Recommended Metadata Contract

For dedicated tenants, the platform should preserve:

- `tenancy_mode = dedicated`
- `dedicated_tenant_profile`
- optional `dedicated_reason_note`

This keeps the reason for dedicated mode visible to future operators.

## Why This Matters

Without this step:

- dedicated mode stays preserved technically
- but nobody knows when it should actually be used

With this step:

- the old architecture becomes a deliberate secondary offering
- the shared model can scale cheaply
- the dedicated model stays valuable for the right customers

## Code-Level Policy Helper

The dedicated-mode profile categories are now frozen in:

- [dedicatedTenantPolicy.js](/Users/amrani/Desktop/rental-system-frontend/api/_lib/dedicatedTenantPolicy.js)

That helper defines:

- the allowed dedicated profiles
- the default dedicated profile
- normalization helpers for future admin/runtime use

## Step 17 Outcome

Step 17 completes the strategy layer of the tenancy program:

- shared mode is the default business model
- dedicated mode is the intentional premium/special-case model
- the old project-per-tenant system is now preserved with a defined future purpose instead of lingering as accidental legacy
