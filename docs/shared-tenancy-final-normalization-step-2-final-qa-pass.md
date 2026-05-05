# Shared Tenancy Final Normalization Step 2

This pass validates the final shared-tenancy normalization against the local runtime after the page-level service migration.

## Verification performed

- `npm run build`
- local shared master host runtime check on `localhost:5173`
- local tenant workspace-config checks for:
  - `saharax.driveout.io`
  - `owner1.driveout.io`
  - `offroad.driveout.io`

## Result summary

### Pass

- `localhost:5173/api/me`
  - healthy after clean dev-server restart
  - anonymous request returns the expected `Missing bearer token`
- `localhost:5173/api/tenants?resource=workspace-config&hostname=saharax.driveout.io`
  - returns a valid shared workspace contract
  - includes:
    - `tenancyMode: "shared"`
    - `planType: "pro"`
    - populated `effectiveFeatureAccess`
    - populated shared `publicFeatures`
- `localhost:5173/api/tenants?resource=workspace-config&hostname=offroad.driveout.io`
  - returns the expected inactive tenant response
  - current result:
    - `code: "workspace_inactive"`
    - `tenant_status: "failed"`
  - this matches the previously known failed provisioning state for the test tenant

### Fail

- `localhost:5173/api/tenants?resource=workspace-config&hostname=owner1.driveout.io`
  - currently fails with:
    - `permission denied for table app_organizations`
  - this is the main remaining regression found by the final QA pass
  - it indicates the dedicated tenant workspace-config path is still touching shared organization resolution in a way that is not safe for anonymous tenant bootstrap

## Interpretation

- shared master runtime: working
- shared public feature contract: working
- failed tenant status handling: working
- dedicated tenant coexistence path: still not clean

## Next action

Fix the dedicated tenant workspace-config fallback so `owner1` resolves without anonymous permission errors while preserving the shared-first contract.
