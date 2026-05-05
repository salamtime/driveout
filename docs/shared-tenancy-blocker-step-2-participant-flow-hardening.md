## Shared Tenancy Blocker Step 2: Participant and Public Flow Hardening

This pass moves the highest-risk shared/public APIs onto the shared-tenant
organization boundary so they no longer rely on hostname resolution alone.

### Hardened now

- `api/messages.js`
  - resolves tenant scope from request hostname or tenant runtime
  - verifies the authenticated user belongs to the shared tenant organization
  - scopes shared thread/message/media/event reads by `organization_id`
  - stamps new shared messages, thread states, and shared media rows with `organization_id`

- `api/verifications.js`
  - scopes verification queue and entity-summary reads by tenant organization
  - stamps new verification requests and verification thread/message rows
  - scopes verification review and delete flows to the current tenant organization

- `api/tour-bookings.js`
  - scopes admin booking reads/writes by tenant organization
  - stamps shared-mode tour booking rows with `organization_id`
  - resolves public booking hostname to the correct shared tenant before pricing and inserts

- `api/owner-vehicles.js`
  - verifies the authenticated owner is acting inside the correct shared tenant workspace
  - scopes existing vehicle/listing lookups by tenant organization
  - stamps shared-mode vehicle profile, linked fleet vehicle, and listing writes with `organization_id`

### Intentional boundary

This step focuses on participant-owned or public workflow surfaces that create
or mutate tenant business data directly.

It does **not** yet reclassify these broader platform-style surfaces:

- `api/marketplace-listings.js`
- `api/growth-links.js`

Those need a separate review because they mix moderation, discovery, or
cross-tenant growth behavior that should not be blindly collapsed into
tenant-owned scoping rules.

### Outcome

Step 2 closes the most important shared-tenancy gap for:

- shared messaging
- verification submission and review
- public tour booking
- owner marketplace vehicle submission

The next blocker steps can now focus on:

1. remaining upload/media callers
2. `/api/me` cleanup
3. admin shared-vs-dedicated surface separation
