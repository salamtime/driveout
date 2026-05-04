export const CURRENT_TENANT_SCHEMA_VERSION = 'v1';
export const CURRENT_TENANT_SCHEMA_RELEASE_ID = '2026-05-03-canonical-business-workspace-r2';
export const CURRENT_TENANT_SCHEMA_CONTRACT_VERSION = 'canonical_business_workspace_v2';
export const CURRENT_TENANT_SCHEMA_RELEASE_MIGRATIONS = Object.freeze([
  {
    id: '2026-05-03-tour-maintenance-vehicle-link-columns',
    relativePath: 'src/migrations/upgrade_tour_and_maintenance_vehicle_link_columns.sql',
    description: 'Align tour booking vehicle linkage and maintenance vehicle naming with canonical SaharaX schema.',
  },
]);

export const CURRENT_TENANT_SCHEMA_RELEASE = Object.freeze({
  releaseId: CURRENT_TENANT_SCHEMA_RELEASE_ID,
  schemaVersion: CURRENT_TENANT_SCHEMA_VERSION,
  contractVersion: CURRENT_TENANT_SCHEMA_CONTRACT_VERSION,
  migrations: CURRENT_TENANT_SCHEMA_RELEASE_MIGRATIONS,
  canonicalTenant: 'saharax',
  structurePolicy: 'exact-clone',
  dataPolicy: 'isolated-runtime-seed-only',
  upgradePolicy: 'versioned-tenant-migration-target',
});

export const normalizeTenantSchemaVersion = (value = '') =>
  String(value || CURRENT_TENANT_SCHEMA_VERSION).trim() || CURRENT_TENANT_SCHEMA_VERSION;

export const buildTenantSchemaReleaseMetadata = (overrides = {}) => ({
  ...CURRENT_TENANT_SCHEMA_RELEASE,
  ...overrides,
});
