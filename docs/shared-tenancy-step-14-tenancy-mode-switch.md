# Shared Tenancy Step 14: Explicit Tenancy Mode Switch

This step turns tenancy mode into an intentional platform control instead of a hidden architectural assumption.

## What This Step Adds

1. A saved tenancy mode control

Tenant controls can now explicitly persist:

- `shared`
- `dedicated`

That choice is stored on the tenant row as `tenancy_mode` and mirrored in tenant metadata for backward compatibility.

2. Admin control-path support

The workspace controls flow now treats tenancy mode like any other deliberate platform control:

- admins can choose the mode
- the controls API persists it
- audit logs record `tenancy_mode` changes inside `changed_fields.core_controls`

3. Immediate UI consistency after save

The workspace admin UI now merges the saved tenancy mode back into its local draft state without waiting for a full page refresh.

That means the selector and the saved tenant state stay aligned as soon as controls are saved.

## Why This Matters

Before this step:

- `shared` was the new default
- `dedicated` was preserved in code
- but the platform still did not expose tenancy mode as a first-class operator decision

After this step:

- shared and dedicated tenants can coexist intentionally
- the platform can explicitly mark which model a workspace belongs to
- control changes are auditable and repeatable

## Operational Rule

Going forward:

- normal onboarding defaults to `shared`
- legacy, premium, or special-case isolated tenants can be marked `dedicated`
- the mode should be changed deliberately by platform operators, not inferred from old project fields

## Outcome

Step 14 completes the platform-level mode switch layer:

- `shared` is the normal path
- `dedicated` is the preserved alternate path
- both modes are now explicitly manageable side by side
