# Shared Tenancy Step 13: Preserve Dedicated Mode as a Legacy Path

This step does not bring dedicated-project tenancy back as the default.

It makes the existing dedicated-project path explicit, mode-aware, and safely preservable while `shared` remains the normal future runtime.

## What This Step Adds

1. A dedicated infrastructure snapshot contract

Shared tenants should not have to pretend they are project-per-tenant workspaces just because the old registry fields still exist.

To make that separation explicit, the platform now produces a `legacyDedicatedInfrastructure` snapshot only when:

- `tenancy_mode = dedicated`

That snapshot carries:

- `projectRef`
- `appUrl`
- `apiUrl`
- `anonKeyConfigured`
- `schemaVersion`
- `preserved = true`

This gives the app and admin surfaces one clean place to read dedicated-only infrastructure details without confusing them with the shared runtime contract.

2. Shared runtime remains the default contract

The shared runtime contract continues to rely on:

- `tenant_id`
- `organization_id`
- `organization_slug`
- `plan_type`
- `effective_feature_access`
- `workspace_state`

It no longer needs dedicated project credentials in order to explain itself to the UI.

3. Ready-state UI is now mode-aware

The tenant workspace ready screen no longer hardcodes dedicated-project copy for every tenant.

- Dedicated mode still shows isolated-project language
- Shared mode now shows shared-runtime and organization-isolation language

That preserves the old product path without forcing the new shared path to inherit dedicated-project messaging.

## Why This Matters

Before this step:

- dedicated-project infrastructure still existed
- shared mode was already becoming the default
- but the UI and session/config contracts still leaked dedicated assumptions

After this step:

- dedicated mode remains preserved and reusable
- shared mode stays cleanly defined as the main runtime
- the old project-per-tenant system is now a supported legacy path instead of just raw leftover fields

## Preserved Legacy Path

The following structures remain intentionally preserved for future use:

- dedicated project provisioning worker flow
- exact-clone schema tooling
- dedicated workspace readiness path
- tenant registry fields:
  - `tenant_project_ref`
  - `tenant_api_url`
  - `tenant_anon_key`

Those are no longer the normal shared-mode runtime contract, but they remain valid for:

- legacy tenants
- premium isolated tenants
- future enterprise / special-case workspace models

## Outcome

Step 13 turns the current dedicated-project system into an explicit legacy mode instead of letting it continue as an accidental hidden dependency of shared mode.
