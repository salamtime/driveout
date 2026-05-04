import {
  CURRENT_TENANT_SCHEMA_RELEASE,
  CURRENT_TENANT_SCHEMA_RELEASE_ID,
} from './tenantSchemaRelease.js';

export const getCanonicalProjectRef = () => {
  const supabaseUrl = String(
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    '',
  ).trim();

  if (!supabaseUrl) {
    throw new Error('Missing canonical Supabase URL from VITE_SUPABASE_URL/SUPABASE_URL');
  }

  try {
    return new URL(supabaseUrl).hostname.split('.')[0];
  } catch {
    throw new Error(`Invalid canonical Supabase URL: ${supabaseUrl}`);
  }
};

export const assertTenantTargetProjectRef = ({
  targetProjectRef,
  operation = 'tenant-schema-mutation',
  allowCanonical = false,
} = {}) => {
  const normalizedTargetProjectRef = String(targetProjectRef || '').trim();
  if (!normalizedTargetProjectRef) {
    throw new Error(`Missing target project ref for ${operation}`);
  }

  const canonicalProjectRef = getCanonicalProjectRef();
  if (!allowCanonical && normalizedTargetProjectRef === canonicalProjectRef) {
    throw new Error(
      `Unsafe ${operation}: target project ref ${normalizedTargetProjectRef} matches canonical source project`,
    );
  }

  return {
    canonicalProjectRef,
    targetProjectRef: normalizedTargetProjectRef,
  };
};

export const assertApprovedTenantSchemaRelease = ({
  targetProjectRef,
  release = CURRENT_TENANT_SCHEMA_RELEASE,
  migrationIds = [],
  operation = 'tenant-schema-release',
} = {}) => {
  const { canonicalProjectRef, targetProjectRef: normalizedTargetProjectRef } = assertTenantTargetProjectRef({
    targetProjectRef,
    operation,
  });

  const approvedRelease = CURRENT_TENANT_SCHEMA_RELEASE;
  if (!release || String(release.releaseId || '').trim() !== CURRENT_TENANT_SCHEMA_RELEASE_ID) {
    throw new Error(
      `Unsafe ${operation}: release ${String(release?.releaseId || 'unknown')} is not the current approved tenant schema release ${CURRENT_TENANT_SCHEMA_RELEASE_ID}`,
    );
  }

  const approvedMigrationIds = new Set((approvedRelease.migrations || []).map((migration) => String(migration.id || '').trim()));
  for (const migrationId of migrationIds) {
    const normalizedMigrationId = String(migrationId || '').trim();
    if (!normalizedMigrationId) continue;
    if (!approvedMigrationIds.has(normalizedMigrationId)) {
      throw new Error(
        `Unsafe ${operation}: migration ${normalizedMigrationId} is not in the approved release manifest for ${CURRENT_TENANT_SCHEMA_RELEASE_ID}`,
      );
    }
  }

  return {
    canonicalProjectRef,
    targetProjectRef: normalizedTargetProjectRef,
    releaseId: approvedRelease.releaseId,
    approvedMigrationIds: [...approvedMigrationIds],
  };
};
