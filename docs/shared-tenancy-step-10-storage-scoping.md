## Shared Tenancy Step 10

This step adds tenant/organization partitioning to storage paths so shared-project media uploads do not rely only on database row scoping.

### Files updated

- [src/utils/storageUpload.js](/Users/amrani/Desktop/rental-system-frontend/src/utils/storageUpload.js)
- [src/services/VehicleImageService.js](/Users/amrani/Desktop/rental-system-frontend/src/services/VehicleImageService.js)
- [src/services/DocumentService.js](/Users/amrani/Desktop/rental-system-frontend/src/services/DocumentService.js)
- [src/services/UserProfileService.js](/Users/amrani/Desktop/rental-system-frontend/src/services/UserProfileService.js)

### What this step adds

1. Shared storage path helpers
- `buildTenantStoragePrefix(...)`
- `buildTenantScopedStoragePath(...)`
- `buildStoragePathCandidates(...)`

New uploads now land under a tenant root shaped like:

- `tenant/<organization_id>/...`

2. Shared upload helper scoping

The central upload utility now stamps new uploads with the current tenant organization automatically.

That means services already using the shared upload helper inherit tenant-scoped storage without each one inventing its own path rules.

3. Core document/image/profile storage scoping

The main authenticated workspace media flows now use tenant-scoped paths for new uploads:

- vehicle images
- vehicle documents
- profile pictures

4. Legacy-read compatibility

For vehicle images and vehicle documents, reads now try:

- new shared-tenant path first
- legacy flat path second

That keeps existing files accessible while new files move onto the shared path structure.

### Important scope of this step

This is the storage-foundation pass for the core authenticated workspace media.

It does **not** yet rewrite every storage caller in:

- rental details
- OCR helper uploads
- customer page components
- marketplace media
- message attachments
- finance/supporting document flows

Those remain later-pass cleanup so we can migrate them deliberately instead of forcing a risky all-at-once storage rewrite.
