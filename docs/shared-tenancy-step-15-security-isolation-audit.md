# Shared Tenancy Step 15: Security and Isolation Audit

This step is the first explicit security/isolation audit for the shared-project tenancy model.

It does not pretend the cutover is already complete.

It freezes what is already in a good state, what is still high-risk, and what must be fixed before shared mode is treated as production-safe by default.

## Audit Goal

Confirm whether the current shared-tenancy implementation can safely prevent:

- cross-tenant reads
- cross-tenant writes
- cross-tenant file/media leaks
- public route leaks
- participant-flow leaks
- legacy dedicated-mode assumptions bypassing shared isolation

## What Is In Good Shape

These areas now have a real shared-tenancy foundation:

1. Runtime contract
- tenant session now carries:
  - `tenant_id`
  - `organization_id`
  - `tenancy_mode`
  - plan/feature context
  - workspace state

2. Shared readiness
- readiness is tenant-specific for shared mode, not only project-global

3. Core authenticated service layer
- organization-aware scoping/stamping exists for:
  - vehicles
  - rentals
  - kilometer packages
  - fuel

4. Core authenticated storage/media layer
- new uploads are tenant-scoped for:
  - vehicle images
  - vehicle documents
  - profile pictures

5. Core RLS rewrite
- authenticated shared workspace tables now have organization-aware policy helpers and organization-based RLS structure

## High-Risk Findings

These are the remaining high-risk surfaces.

### 1. Direct client/store queries still bypass the new service layer

Some client-side slices still talk to tenant tables directly through `supabase.from(...)` instead of going through the shared organization-aware services.

Representative example:
- [src/store/slices/maintenanceSlice.js](/Users/amrani/Desktop/rental-system-frontend/src/store/slices/maintenanceSlice.js)

Why this is risky:
- it depends on RLS alone
- it does not stamp `organization_id` on inserts
- it still carries older fields like `user_email` rather than shared-tenant ownership discipline

Same audit class also applies to:
- [src/store/slices/toursSlice.js](/Users/amrani/Desktop/rental-system-frontend/src/store/slices/toursSlice.js)
- [src/store/slices/notificationsSlice.js](/Users/amrani/Desktop/rental-system-frontend/src/store/slices/notificationsSlice.js)

Status:
- not yet shared-mode hardened

### 2. Messaging flows still use direct shared-thread/message/media access

Representative file:
- [api/messages.js](/Users/amrani/Desktop/rental-system-frontend/api/messages.js)

Why this is risky:
- direct reads/writes on:
  - `shared_message_threads`
  - `shared_messages`
  - `shared_message_media`
- thread/user/media resolution is complex and participant-driven
- this needs explicit shared-tenancy participant rules, not only generic authenticated-table assumptions

Status:
- partially compatible
- not yet fully audited rule-by-rule for shared isolation

### 3. Verification flows mix document access, shared threads, and entity lookups

Representative file:
- [api/verifications.js](/Users/amrani/Desktop/rental-system-frontend/api/verifications.js)

Why this is risky:
- signed URLs are created from stored file paths
- verification cases touch:
  - requests
  - events
  - vehicle/user entities
  - shared message threads
- these flows span admin review, owner-facing uploads, and entity-bound moderation

Status:
- not yet fully brought under the shared organization model

### 4. Marketplace/public participant flows still need explicit tenant-boundary review

Representative file:
- [api/marketplace-listings.js](/Users/amrani/Desktop/rental-system-frontend/api/marketplace-listings.js)

Why this is risky:
- public and moderation flows are not the same as internal authenticated admin CRUD
- listing/profile/message/moderation tables can bridge:
  - public viewers
  - tenant owners
  - platform admins
- these paths need deliberate shared-mode tenancy rules

Related audit surfaces:
- [api/tour-bookings.js](/Users/amrani/Desktop/rental-system-frontend/api/tour-bookings.js)
- [api/owner-vehicles.js](/Users/amrani/Desktop/rental-system-frontend/api/owner-vehicles.js)
- [api/growth-links.js](/Users/amrani/Desktop/rental-system-frontend/api/growth-links.js)

Status:
- still a blocking audit area before production shared cutover

### 5. The `/api/me` aggregation surface still carries legacy dedicated assumptions and broad table reach

Representative file:
- [api/me.js](/Users/amrani/Desktop/rental-system-frontend/api/me.js)

Why this is risky:
- it aggregates many cross-module reads
- it still references dedicated-era fields like:
  - `tenant_project_ref`
  - `tenant_api_url`
  - `tenant_anon_key`
- it touches many tenant-owned tables directly

Status:
- foundationally compatible with the new session model
- not yet fully reduced to a clean shared-only isolation story

### 6. Admin workspace screens still expose dedicated infrastructure as normal operator data

Representative file:
- [src/pages/admin/Workspaces.jsx](/Users/amrani/Desktop/rental-system-frontend/src/pages/admin/Workspaces.jsx)

Why this is risky:
- emergency/manual activation still centers:
  - project ref
  - API URL
  - anon key
- that is acceptable for preserved dedicated mode
- but it is still mixed into general admin workflow

Status:
- legacy path preserved
- not yet fully separated into:
  - shared operational controls
  - dedicated infrastructure controls

## Storage and Media Risks Still Open

The shared tenant-scoped storage convention exists, but these surfaces still need explicit migration/audit:

- OCR helper uploads
- rental detail uploads
- marketplace media
- message attachments
- customer-facing upload surfaces
- verification file paths

Representative files:
- [api/verifications.js](/Users/amrani/Desktop/rental-system-frontend/api/verifications.js)
- [api/messages.js](/Users/amrani/Desktop/rental-system-frontend/api/messages.js)

## Isolation Verdict

Current verdict:

- shared tenancy foundation: **present**
- shared tenancy production isolation: **not yet fully proven**

The biggest remaining risk is not the new shared core.

The biggest remaining risk is the older direct-query/direct-storage surfaces that have not yet been normalized around:

- `organization_id`
- tenant-scoped storage prefixes
- participant-aware shared RLS rules
- explicit shared-vs-dedicated admin separation

## Required Work Before Shared Production Default

1. Replace or wrap remaining direct client/store Supabase calls with organization-aware services
2. Audit messaging, verification, and marketplace flows rule-by-rule
3. Move remaining upload/media callers onto tenant-scoped storage helpers
4. Separate shared-mode admin controls from dedicated infrastructure controls in workspace admin
5. Reduce `/api/me` dedicated-era assumptions and broad direct table access

## Step 15 Outcome

Step 15 does not say “shared mode is finished.”

It gives the project an honest security boundary map:

- what is already safe enough as shared foundation
- what is still dangerous
- and exactly which surfaces must be completed before shared tenancy becomes the normal production mode
