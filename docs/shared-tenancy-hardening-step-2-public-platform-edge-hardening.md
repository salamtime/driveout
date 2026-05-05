## Shared Tenancy Hardening Step 2: Public and Platform Edge Hardening

This pass closes the highest-risk shared-tenancy gaps on the marketplace and growth/public edges that still behaved like global surfaces.

### What changed

- `api/_lib/publicCatalogHandler.js`
  - resolves hostname tenant scope before serving the public catalog
  - shared tenant hosts now only load marketplace listings for their own `organization_id`
  - shared tenant hosts no longer merge in the global certified fleet feed
  - listing detail lookups inherit the same tenant-scoped catalog behavior

- `api/marketplace-listings.js`
  - resolves tenant scope for authenticated marketplace moderation requests
  - shared tenant hosts now require the acting user to belong to that tenant organization
  - listing detail and snapshot queries are constrained to the shared tenant `organization_id`
  - owner listing counters inside listing detail are also tenant-scoped
  - mirrored shared moderation messages are now stamped with `organization_id`

- `api/growth-links.js`
  - short-link redirect resolution now checks tenant scope on shared hosts before serving marketplace boost links
  - boost booking attribution now validates the target listing against the shared tenant organization
  - boost link creation now refuses shared-host listing links that do not belong to the current tenant organization
  - marketplace listing id parsing is normalized across raw ids and `marketplace-<id>` paths

### Result

The main remaining public/platform marketplace surfaces now respect the shared tenant boundary:

- tenant storefront catalog
- tenant marketplace moderation
- tenant marketplace boost link redirects and booking attribution

### Intentional boundary

This step does **not** claim that every platform/public edge is now fully finished. The remaining hardening work still includes:

- broader platform growth/leaderboard surfaces
- any remaining public reads outside the catalog and boost-link path
- final end-to-end verification across shared and dedicated coexistence
