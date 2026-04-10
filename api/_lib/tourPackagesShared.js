import { APP_USERS_TABLE, createSupabaseClients } from './supabase.js';
import { authenticateRequest } from './auth.js';

export const TOUR_PACKAGES_TABLE = 'app_687f658e98_tour_packages';
export const TOUR_PACKAGE_MODEL_PRICES_TABLE = 'app_687f658e98_tour_package_model_prices';
export const VEHICLE_MODELS_TABLE = 'saharax_0u4w4d_vehicle_models';
const TOUR_PACKAGE_RULES_MARKER = '[tour_package_rules]';

const safeJsonParse = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const extractMarkedJson = (value, marker) => {
  const text = typeof value === 'string' ? value : '';
  const markerIndex = text.indexOf(marker);
  if (markerIndex === -1) return null;
  return safeJsonParse(text.slice(markerIndex + marker.length).trim());
};

const stripMarkedJson = (value, marker) => {
  const text = typeof value === 'string' ? value : '';
  const markerIndex = text.indexOf(marker);
  if (markerIndex === -1) return text.trim();
  return text.slice(0, markerIndex).trim();
};

const cleanPresentationText = (value, maxLength = 240) =>
  clampText(stripMarkedJson(value, TOUR_PACKAGE_RULES_MARKER), maxLength);

const appendMarkedJson = (text, marker, payload) => {
  const cleanedText = stripMarkedJson(text, marker);
  const serialized = `${marker}${JSON.stringify(payload)}`;
  return cleanedText ? `${cleanedText}\n\n${serialized}` : serialized;
};

export const errorToMessage = (error) => {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (error.message) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
};

export const parseBody = (body) => {
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

const clampText = (value, maxLength = 240) => String(value || '').trim().slice(0, maxLength);

const toSafeInteger = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : fallback;
};

const toSafeNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizeJsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const parsed = safeJsonParse(value);
    return Array.isArray(parsed) ? parsed : [];
  }
  return [];
};

const makePresentationId = (prefix, index) => `${prefix}_${index + 1}`;

const normalizeRouteStops = (value) => {
  const allowedKinds = new Set(['start', 'drive', 'stop', 'end', 'note']);
  return normalizeJsonArray(value)
    .slice(0, 24)
    .map((stop, index) => {
      const item = typeof stop === 'object' && stop !== null ? stop : { title: stop };
      const kind = clampText(item.kind || item.type || 'stop', 24).toLowerCase();
      const title = clampText(item.title, 90);
      const note = clampText(item.note, 180);
      if (!title && !note) return null;

      return {
        id: clampText(item.id, 64) || makePresentationId('stop', index),
        kind: allowedKinds.has(kind) ? kind : 'stop',
        title,
        duration_minutes: Math.max(0, toSafeInteger(item.duration_minutes, 0)),
        note,
        sort_order: toSafeInteger(item.sort_order, index + 1),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.sort_order - right.sort_order);
};

const normalizeMediaGallery = (value) => {
  const allowedTypes = new Set(['image', 'video']);
  return normalizeJsonArray(value)
    .slice(0, 12)
    .map((media, index) => {
      const item = typeof media === 'object' && media !== null ? media : { url: media };
      const url = clampText(item.url, 900);
      const isSafeUrl = /^https?:\/\//i.test(url) || url.startsWith('/');
      if (!isSafeUrl) return null;
      const type = clampText(item.type || 'image', 24).toLowerCase();

      return {
        id: clampText(item.id, 64) || makePresentationId('media', index),
        type: allowedTypes.has(type) ? type : 'image',
        url,
        caption: clampText(item.caption, 120),
        sort_order: toSafeInteger(item.sort_order, index + 1),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.sort_order - right.sort_order);
};

const normalizeHighlights = (value) => normalizeJsonArray(value)
  .slice(0, 12)
  .map((highlight, index) => {
    const item = typeof highlight === 'object' && highlight !== null ? highlight : { label: highlight };
    const label = clampText(item.label, 60);
    if (!label) return null;
    return {
      id: clampText(item.id, 64) || makePresentationId('highlight', index),
      label,
    };
  })
  .filter(Boolean);

export const isMissingTableError = (error) => {
  const message = String(error?.message || error?.details || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();
  return (
    code === '42p01' ||
    code === 'pgrst205' ||
    (message.includes('relation') && message.includes('does not exist')) ||
    message.includes('could not find the table') ||
    message.includes('not found')
  );
};

export const normalizePackage = (pkg = {}) => {
  const rules = extractMarkedJson(pkg.description, TOUR_PACKAGE_RULES_MARKER) || {};
  const publicPresentation = rules.publicPresentation || {};
  const routeStops = normalizeRouteStops(pkg.routeStops || pkg.route_stops_json || publicPresentation.routeStops);
  const mediaGallery = normalizeMediaGallery(pkg.mediaGallery || pkg.media_gallery_json || publicPresentation.mediaGallery);
  const publicHighlights = normalizeHighlights(pkg.publicHighlights || pkg.public_highlights_json || publicPresentation.publicHighlights);
  const stopCount = toSafeInteger(pkg.stopCount ?? pkg.stop_count ?? publicPresentation.stopCount ?? routeStops.length, routeStops.length);

  return {
    id: String(pkg.id || ''),
    name: clampText(pkg.name, 140),
    description: cleanPresentationText(pkg.description || '', 500),
    location: cleanPresentationText(pkg.location || 'Main Base', 140),
    duration: toSafeNumber(pkg.duration, 1),
    default_rate_1h: toSafeNumber(pkg.default_rate_1h, 0),
    default_rate_2h: toSafeNumber(pkg.default_rate_2h, 0),
    vip_rate_1h: toSafeNumber(pkg.vip_rate_1h, 0),
    vip_rate_2h: toSafeNumber(pkg.vip_rate_2h, 0),
    is_active: pkg.is_active !== false,
    routeType: clampText(pkg.routeType || pkg.route_type || rules.routeType || 'mountain', 80),
    requiresLicense: Boolean(pkg.requiresLicense ?? pkg.requires_license ?? rules.requiresLicense),
    maxQuads: Math.max(1, toSafeInteger(pkg.maxQuads || pkg.max_quads || rules.maxQuads, 5)),
    bufferBeforeMinutes: Math.max(0, toSafeInteger(pkg.bufferBeforeMinutes || pkg.buffer_before_minutes || rules.bufferBeforeMinutes, 15)),
    bufferAfterMinutes: Math.max(0, toSafeInteger(pkg.bufferAfterMinutes || pkg.buffer_after_minutes || rules.bufferAfterMinutes, 30)),
    websiteVisible: Boolean(pkg.websiteVisible ?? pkg.website_visible ?? rules.websiteVisible),
    publicTitle: cleanPresentationText(pkg.publicTitle || pkg.public_title || publicPresentation.publicTitle, 140),
    publicSummary: cleanPresentationText(pkg.publicSummary || pkg.public_summary || publicPresentation.publicSummary, 360),
    routeLabel: cleanPresentationText(pkg.routeLabel || pkg.route_label || publicPresentation.routeLabel, 100),
    routeStops,
    mediaGallery,
    publicHighlights,
    displayOrder: toSafeInteger(pkg.displayOrder ?? pkg.display_order ?? publicPresentation.displayOrder, 0),
    coverImageUrl: clampText(pkg.coverImageUrl || pkg.cover_image_url || publicPresentation.coverImageUrl, 900),
    durationDisplay: clampText(pkg.durationDisplay || pkg.duration_display || publicPresentation.durationDisplay, 60),
    stopCount: Math.max(0, stopCount),
    difficultyLabel: clampText(pkg.difficultyLabel || pkg.difficulty_label || publicPresentation.difficultyLabel, 60),
    created_at: pkg.created_at || new Date().toISOString(),
    updated_at: pkg.updated_at || new Date().toISOString(),
  };
};

export const toPackageTableRow = (pkg = {}) => {
  const normalized = normalizePackage(pkg);
  return {
    id: normalized.id,
    name: normalized.name,
    description: appendMarkedJson(normalized.description, TOUR_PACKAGE_RULES_MARKER, {
      routeType: normalized.routeType,
      requiresLicense: normalized.requiresLicense,
      maxQuads: normalized.maxQuads,
      bufferBeforeMinutes: normalized.bufferBeforeMinutes,
      bufferAfterMinutes: normalized.bufferAfterMinutes,
      websiteVisible: normalized.websiteVisible,
      publicPresentation: {
        publicTitle: normalized.publicTitle,
        publicSummary: normalized.publicSummary,
        routeLabel: normalized.routeLabel,
        routeStops: normalized.routeStops,
        mediaGallery: normalized.mediaGallery,
        publicHighlights: normalized.publicHighlights,
        displayOrder: normalized.displayOrder,
        coverImageUrl: normalized.coverImageUrl,
        durationDisplay: normalized.durationDisplay,
        stopCount: normalized.stopCount,
        difficultyLabel: normalized.difficultyLabel,
      },
    }),
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
    public_title: normalized.publicTitle,
    public_summary: normalized.publicSummary,
    route_label: normalized.routeLabel,
    route_stops_json: normalized.routeStops,
    media_gallery_json: normalized.mediaGallery,
    public_highlights_json: normalized.publicHighlights,
    display_order: normalized.displayOrder,
    cover_image_url: normalized.coverImageUrl,
    duration_display: normalized.durationDisplay,
    stop_count: normalized.stopCount,
    difficulty_label: normalized.difficultyLabel,
    created_at: normalized.created_at,
    updated_at: normalized.updated_at,
  };
};

export const createPackageId = () =>
  `tour_pkg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const readPackagesFromTable = async (adminClient) => {
  const { data, error } = await adminClient
    .from(TOUR_PACKAGES_TABLE)
    .select('*')
    .order('display_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) throw error;
  return Array.isArray(data) ? data.map(normalizePackage) : [];
};

const normalizePricingRow = (row = {}) => ({
  id: String(row.id || ''),
  package_id: String(row.package_id || ''),
  vehicle_model_id: String(row.vehicle_model_id || ''),
  duration_hours: Number(row.duration_hours || 0),
  price_mad: Number(row.price_mad || 0),
  is_active: row.is_active !== false,
});

const normalizeVehicleModel = (model = {}) => ({
  id: String(model.id || ''),
  name: String(model.name || '').trim(),
  model: String(model.model || '').trim(),
  vehicle_type: String(model.vehicle_type || '').trim(),
});

export const readTourPackagePricingContext = async (adminClient) => {
  const [pricingResult, modelResult] = await Promise.all([
    adminClient
      .from(TOUR_PACKAGE_MODEL_PRICES_TABLE)
      .select('id,package_id,vehicle_model_id,duration_hours,price_mad,is_active')
      .eq('is_active', true)
      .order('package_id', { ascending: true })
      .order('vehicle_model_id', { ascending: true })
      .order('duration_hours', { ascending: true }),
    adminClient
      .from(VEHICLE_MODELS_TABLE)
      .select('id,name,model,vehicle_type')
      .order('name', { ascending: true }),
  ]);

  if (pricingResult.error) throw pricingResult.error;

  return {
    pricingRows: Array.isArray(pricingResult.data) ? pricingResult.data.map(normalizePricingRow) : [],
    vehicleModels: modelResult.error ? [] : (Array.isArray(modelResult.data) ? modelResult.data.map(normalizeVehicleModel) : []),
  };
};

export const createPackageInTable = async (adminClient, pkg) => {
  const { data, error } = await adminClient
    .from(TOUR_PACKAGES_TABLE)
    .insert([toPackageTableRow(pkg)])
    .select('*')
    .single();

  if (error) throw error;
  return normalizePackage(data);
};

export const updatePackageInTable = async (adminClient, pkg) => {
  const { data, error } = await adminClient
    .from(TOUR_PACKAGES_TABLE)
    .update(toPackageTableRow(pkg))
    .eq('id', pkg.id)
    .select('*')
    .single();

  if (error) throw error;
  return normalizePackage(data);
};

export const deactivatePackageInTable = async (adminClient, packageId) => {
  const { error } = await adminClient
    .from(TOUR_PACKAGES_TABLE)
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', packageId);

  if (error) throw error;
};

export const requirePackageManager = async (req) => {
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

export const handleTourPackages = async (req, res, json) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    try {
      const { adminClient } = createSupabaseClients();
      const [packages, pricingContext] = await Promise.all([
        readPackagesFromTable(adminClient),
        readTourPackagePricingContext(adminClient).catch((pricingError) => {
          console.warn('tour-packages pricing context unavailable:', pricingError);
          return { pricingRows: [], vehicleModels: [] };
        }),
      ]);
      return json(res, 200, {
        success: true,
        packages: packages.filter((pkg) => pkg.is_active !== false),
        pricingRows: pricingContext.pricingRows,
        vehicleModels: pricingContext.vehicleModels,
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
};
