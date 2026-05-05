## Shared Tenancy Hardening Step 3: Remaining Non-Core Storage Callers

This pass moves the remaining active non-core upload/media entry points onto the shared tenant storage model.

### What changed

- `src/components/VehicleImageUpload.jsx`
- `src/components/VehicleImageUpload.tsx`
  - vehicle image uploads now use the shared storage helper
  - new files land under tenant-scoped `vehicle-images` paths

- `src/pages/account/AccountMarketplaceVehicleProfile.jsx`
  - draft vehicle media restoration now checks tenant-scoped vehicle image prefixes first
  - legacy flat draft paths still work as a fallback

- `src/services/InventoryService.js`
  - inventory item document uploads now use tenant-scoped paths
  - inventory item image uploads now use tenant-scoped paths
  - inventory document listing now reads tenant-scoped folders first with legacy fallback

- `src/components/VehicleRefillModal.jsx`
- `src/components/FuelRefillModal.jsx`
  - fuel invoice uploads now use tenant-scoped paths in the `fuel_invoices` bucket

- `src/components/SignaturePadModal.jsx`
  - rental signature uploads now use tenant-scoped paths in `rental-signatures`

- `src/services/videoCaptureService.js`
  - rental video evidence uploads now use tenant-scoped storage paths before the media row is created

- `src/utils/imageUpload.js`
- `src/hooks/useStorage.js`
  - legacy shared helpers now write tenant-scoped vehicle-image paths instead of flat bucket paths
  - vehicle image listing now checks tenant-scoped prefixes before legacy fallback

### Result

The remaining active uploaders outside the core service pass now store new files under:

- tenant-scoped vehicle images
- tenant-scoped inventory media
- tenant-scoped fuel receipt images
- tenant-scoped signatures
- tenant-scoped rental video evidence

### Intentional boundary

This pass focuses on currently active non-core upload entry points. It does **not** claim that every old debugging or dormant storage helper has been modernized, and it does not replace the final end-to-end shared-tenancy verification pass.
