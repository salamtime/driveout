import { APP_USERS_TABLE, createSupabaseClients } from './_lib/supabase.js';
import { authenticateRequest } from './_lib/auth.js';

const TOUR_PACKAGES_TABLE = 'app_687f658e98_tour_packages';

const json = (res, status, body) => res.status(status).json(body);
const errorToMessage = (error) => {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (error.message) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
};
const parseBody = (body) => {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return typeof body === 'object' ? body : {};
};

const isMissingTableError = (error) => {
  const message = String(error?.message || error?.details || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();
  return (
    code === '42p01' ||
    code === 'pgrst205' ||
    message.includes('relation') && message.includes('does not exist') ||
    message.includes('could not find the table') ||
    message.includes('not found')
  );
};

const normalizePackage = (pkg = {}) => ({
  id: String(pkg.id || ''),
  name: String(pkg.name || '').trim(),
  description: String(pkg.description || ''),
  location: String(pkg.location || 'Main Base'),
  duration: Number(pkg.duration || 1),
  default_rate_1h: Number(pkg.default_rate_1h || 0),
  default_rate_2h: Number(pkg.default_rate_2h || 0),
  vip_rate_1h: Number(pkg.vip_rate_1h || 0),
  vip_rate_2h: Number(pkg.vip_rate_2h || 0),
  is_active: pkg.is_active !== false,
  routeType: String(pkg.routeType || pkg.route_type || 'mountain'),
  requiresLicense: Boolean(pkg.requiresLicense ?? pkg.requires_license),
  maxQuads: Number(pkg.maxQuads || pkg.max_quads || 5),
  bufferBeforeMinutes: Number(pkg.bufferBeforeMinutes || pkg.buffer_before_minutes || 15),
  bufferAfterMinutes: Number(pkg.bufferAfterMinutes || pkg.buffer_after_minutes || 30),
  websiteVisible: Boolean(pkg.websiteVisible ?? pkg.website_visible),
  created_at: pkg.created_at || new Date().toISOString(),
  updated_at: pkg.updated_at || new Date().toISOString(),
});

const toTableRow = (pkg = {}) => {
  const normalized = normalizePackage(pkg);
  return {
    id: normalized.id,
    name: normalized.name,
    description: normalized.description,
    location: normalized.location,
    duration: normalized.duration,
    default_rate_1h: normalized.default_rate_1h,
    default_rate_2h: normalized.default_rate_2h,
    vip_rate_1h: normalized.vip_rate_1h,
    vip_rate_2h: normalized.vip_rate_2h,
    is_active: normalized.is_active,
    route_type: normalized.routeType,
    requires_license: normalized.requiresLicense,
    max_quads: normalized.maxQuads,
    buffer_before_minutes: normalized.bufferBeforeMinutes,
    buffer_after_minutes: normalized.bufferAfterMinutes,
    website_visible: normalized.websiteVisible,
    created_at: normalized.created_at,
    updated_at: normalized.updated_at,
  };
};

const createPackageId = () =>
  `tour_pkg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const readPackagesFromTable = async (adminClient) => {
  const { data, error } = await adminClient
    .from(TOUR_PACKAGES_TABLE)
    .select('*')
    .order('name', { ascending: true });

  if (error) throw error;
  return Array.isArray(data) ? data.map(normalizePackage) : [];
};

const createPackageInTable = async (adminClient, pkg) => {
  const { data, error } = await adminClient
    .from(TOUR_PACKAGES_TABLE)
    .insert([toTableRow(pkg)])
    .select('*')
    .single();

  if (error) throw error;
  return normalizePackage(data);
};

const updatePackageInTable = async (adminClient, pkg) => {
  const { data, error } = await adminClient
    .from(TOUR_PACKAGES_TABLE)
    .update(toTableRow(pkg))
    .eq('id', pkg.id)
    .select('*')
    .single();

  if (error) throw error;
  return normalizePackage(data);
};

const deactivatePackageInTable = async (adminClient, packageId) => {
  const { error } = await adminClient
    .from(TOUR_PACKAGES_TABLE)
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', packageId);

  if (error) throw error;
};

const requirePackageManager = async (req) => {
  const auth = await authenticateRequest(req);
  if (auth.error) return auth;

  const { user, adminClient } = auth;
  const { data: profile, error } = await adminClient
    .from(APP_USERS_TABLE)
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    return { error: { status: 500, body: { error: error.message } } };
  }

  const role = profile?.role || user.user_metadata?.role || '';
  if (!['owner', 'admin'].includes(String(role).toLowerCase())) {
    return { error: { status: 403, body: { error: 'Admin or owner access required' } } };
  }

  return { user, adminClient, role };
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    try {
      const { adminClient } = createSupabaseClients();
      const packages = await readPackagesFromTable(adminClient);
      return json(res, 200, {
        success: true,
        packages: packages.filter((pkg) => pkg.is_active !== false),
      });
    } catch (error) {
      console.error('tour-packages GET failed:', error);
      return json(res, isMissingTableError(error) ? 503 : 500, {
        error: isMissingTableError(error)
          ? 'Tour packages table is not ready yet'
          : errorToMessage(error),
      });
    }
  }

  if (!['POST', 'PATCH', 'DELETE'].includes(req.method)) {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const auth = await requirePackageManager(req);
  if (auth.error) {
    return json(res, auth.error.status, auth.error.body);
  }

  try {
    const { adminClient } = auth;
    const body = parseBody(req.body);

    if (req.method === 'POST') {
      const payload = normalizePackage({
        ...body,
        id: body?.id || createPackageId(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (!payload.name) {
        return json(res, 400, { error: 'Package name is required' });
      }
      const created = await createPackageInTable(adminClient, payload);
      return json(res, 200, { success: true, data: created });
    }

    if (req.method === 'PATCH') {
      const packageId = String(body?.id || '');
      if (!packageId) {
        return json(res, 400, { error: 'Package id is required' });
      }

      const { data: existingTableRow, error: existingTableError } = await adminClient
        .from(TOUR_PACKAGES_TABLE)
        .select('*')
        .eq('id', packageId)
        .maybeSingle();

      if (existingTableError) {
        throw existingTableError;
      }

      const payload = normalizePackage({
        ...(existingTableRow || {}),
        ...body,
        id: packageId,
        created_at: existingTableRow?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (!payload.name) {
        return json(res, 400, { error: 'Package name is required' });
      }
      const updated = await updatePackageInTable(adminClient, payload);
      return json(res, 200, { success: true, data: updated });
    }

    const packageId = String(req.query.id || body?.id || '');
    if (!packageId) {
      return json(res, 400, { error: 'Package id is required' });
    }

    await deactivatePackageInTable(adminClient, packageId);
    return json(res, 200, { success: true, id: packageId });
  } catch (error) {
    console.error('tour-packages write failed:', error);
    return json(res, 500, { error: errorToMessage(error) });
  }
}
