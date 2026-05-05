## Shared Tenancy Blocker Step 3: Storage Caller Hardening

This pass finishes the highest-risk upload/media callers that were still writing
flat storage paths even after the shared storage foundation was introduced.

### Hardened now

- `src/services/MessageAttachmentService.js`
  - chat photo uploads now use tenant-scoped storage paths
  - path shape now resolves under `tenant/<organization_id>/...`

- `src/services/VerificationService.js`
  - verification document uploads now use tenant-scoped storage paths
  - verification file paths remain compatible with the existing verification API

- `src/services/ocr/fallbackOcrService.js`
  - fallback OCR image uploads now use tenant-scoped storage paths

- `src/services/ocr/optimizedGeminiVisionOcr.js`
  - direct OCR image uploads now use tenant-scoped storage paths

- `src/services/EnhancedUnifiedCustomerService.js`
  - prepared OCR source image uploads now use tenant-scoped storage paths

- `src/services/UnifiedCustomerService.js`
  - legacy ID scan image saves now use tenant-scoped storage paths

### Intentional boundary

This step focuses on the active customer, OCR, verification, and shared-message
media flows that still wrote new objects into flat storage locations.

It does **not** yet rewrite every legacy storage helper or dormant utility, for
example:

- `src/hooks/useStorage.js`
- `src/utils/imageUpload.js`

Those can be retired or migrated later, but they are not part of the current
shared-tenancy critical path because the live product flows already use the
service layer covered above.

### Outcome

New uploads created through the active shared-tenancy customer and messaging
surfaces now land in tenant-scoped storage instead of global flat paths.
