import { requirePlatformOwnerOrAdmin } from './auth.js';
import { PLATFORM_TENANT_AUDIT_LOG_TABLE } from './supabase.js';
import { insertTenantAuditLog } from './tenantAuditLog.js';

const json = (res, status, body) => res.status(status).json(body);

const sanitizeAction = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, '_')
    .slice(0, 80);

const sanitizeMetadata = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
};

export default async function tenantAuditHandler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const auth = await requirePlatformOwnerOrAdmin(req, 'Workspaces');
  if (auth.error) {
    return json(res, auth.error.status, auth.error.body);
  }

  const { adminClient, user } = auth;

  if (req.method === 'GET') {
    const tenantId = String(req.query?.tenant_id || '').trim();
    const businessAccountId = String(req.query?.business_account_id || '').trim();
    const actionPrefix = sanitizeAction(req.query?.action_prefix || '');
    const limit = Math.min(Math.max(Number(req.query?.limit || 12), 1), 50);

    if (!tenantId && !businessAccountId) {
      return json(res, 400, { error: 'tenant_id or business_account_id is required' });
    }

    try {
      let query = adminClient
        .from(PLATFORM_TENANT_AUDIT_LOG_TABLE)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (tenantId) query = query.eq('tenant_id', tenantId);
      if (businessAccountId) query = query.eq('business_account_id', businessAccountId);
      if (actionPrefix) query = query.ilike('action', `${actionPrefix}%`);

      const { data, error } = await query;
      if (error) throw error;

      return json(res, 200, {
        items: Array.isArray(data) ? data : [],
      });
    } catch (error) {
      return json(res, 500, { error: error.message || 'Unable to load tenant audit log' });
    }
  }

  if (req.method === 'POST') {
    const businessAccountId = String(req.body?.business_account_id || '').trim();
    const tenantId = String(req.body?.tenant_id || '').trim();
    const action = sanitizeAction(req.body?.action);
    const metadata = sanitizeMetadata(req.body?.metadata);

    if (!businessAccountId || !tenantId || !action) {
      return json(res, 400, { error: 'business_account_id, tenant_id, and action are required' });
    }

    try {
      await insertTenantAuditLog({
        adminClient,
        businessAccountId,
        tenantId,
        performedBy: user?.id || null,
        action,
        metadata: {
          ...metadata,
          performed_by_email: String(user?.email || '').trim().toLowerCase() || null,
          source: metadata?.source || 'platform_admin_ui',
        },
      });

      return json(res, 200, { ok: true });
    } catch (error) {
      return json(res, 500, { error: error.message || 'Unable to write tenant audit log' });
    }
  }

  return json(res, 405, { error: 'Method not allowed' });
}
