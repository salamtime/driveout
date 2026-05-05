# Shared Tenancy Target Model

This document freezes the target architecture for the next tenancy migration phase.

## Decision

DriveOut will move to a **shared-project multi-tenant** model as the default onboarding path.

- Default tenancy mode: `shared`
- Legacy tenancy mode: `dedicated`
- Current dedicated-project flow is preserved for future premium / special-case use
- Existing workspace UX, feature access, plan access, subdomain routing, and tenant registry stay conceptually in place

## What Stays the Same

- Tenant subdomains such as `owner1.driveout.io` and `offroad.driveout.io`
- Public/master host onboarding flow
- Workspace feature access model
- Plan and upgrade model
- Tenant registry model
- Business-owner trial flow
- Workspace progress / readiness UI

## What Changes

- New tenants no longer create a fresh Supabase project by default
- All standard tenant workspaces use one shared Supabase project
- Hostname resolves to tenant registry entry
- Tenant registry entry resolves to one tenant organization
- Business data isolation is enforced by `organization_id`
- Tenant registry/orchestration continues to use `tenant_id`

## Boundary Model

Use two layers intentionally:

1. `tenant_id`
   Used for:
   - registry
   - billing
   - provisioning jobs
   - audit
   - lifecycle automation
   - domain ownership

2. `organization_id`
   Used for:
   - vehicles
   - rentals
   - customers
   - pricing
   - maintenance
   - fuel
   - finance
   - inventory
   - tours
   - staff access inside the tenant workspace

In short:
- `tenant_id` = platform orchestration boundary
- `organization_id` = runtime business-data isolation boundary

## Tenancy Modes

### Shared

The default future mode.

- One shared Supabase project
- Tenant domain resolves to a tenant registry row
- Tenant registry row resolves to an organization
- RLS restricts all business data to the active organization

### Dedicated

Legacy / premium / future special-case mode.

- One tenant gets its own Supabase project
- Tenant row stores `tenant_project_ref`, `tenant_api_url`, `tenant_anon_key`
- Existing exact-clone / project-creation tooling remains preserved

## Routing Model

1. User opens `tenant-slug.driveout.io`
2. Hostname resolves to tenant registry row
3. Tenant registry row provides:
   - `tenant_id`
   - `tenant_slug`
   - `organization_id`
   - `tenancy_mode`
   - plan / feature access
4. App loads shared runtime config for shared mode
5. App loads dedicated project config only for dedicated mode

## Migration Rule

From this point forward:

- all new roadmap work should assume `shared` is the target default
- no current dedicated-project code should be deleted unless explicitly replaced later
- dedicated mode remains available for future enterprise / isolated tenants

## Non-Goals For Step 1

This step does **not**:

- migrate data
- change RLS
- remove dedicated provisioning
- change existing tenant records
- change public domains

This step only freezes the architecture so the remaining migration work can be executed consistently.
