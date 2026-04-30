import { PLATFORM_TENANT_AUDIT_LOG_TABLE } from './supabase.js';

export const insertTenantAuditLog = async ({
  adminClient,
  businessAccountId = null,
  tenantId = null,
  performedBy = null,
  action,
  metadata = {},
}) => {
  if (!adminClient || !action) return;

  try {
    await adminClient.from(PLATFORM_TENANT_AUDIT_LOG_TABLE).insert({
      business_account_id: businessAccountId || null,
      tenant_id: tenantId || null,
      performed_by: performedBy || null,
      action,
      metadata,
    });
  } catch (error) {
    console.warn(`Unable to write tenant audit log for ${action}:`, error?.message || error);
  }
};

