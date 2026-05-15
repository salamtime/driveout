import { createClient } from '@supabase/supabase-js';
import { APP_USERS_TABLE, PLATFORM_TENANTS_TABLE, createSupabaseClients, getSharedSupabaseTenantConfig } from './supabase.js';
import { authenticateRequest, getBearerToken, getServiceRoleKeyForProject } from './auth.js';
import {
  applyTenantQueryScope,
  resolveRequestTenantScope,
  stampTenantPayload,
} from './sharedTenantIsolation.js';
import {
  resolveTenantTenancyMode,
  runPlatformTenantSelectWithModeFallback,
} from './tenantRegistry.js';

export const TOUR_PACKAGES_TABLE = 'app_687f658e98_tour_packages';
export const TOUR_PACKAGE_MODEL_PRICES_TABLE = 'app_687f658e98_tour_package_model_prices';
export const VEHICLE_MODELS_TABLE = 'app_4c3a7a6153_vehicle_models';
const TOUR_PACKAGE_RULES_MARKER = '[tour_package_rules]';
const DRIVEOUT_BASE_DOMAIN = 'driveout.io';
const RESERVED_SUBDOMAINS = new Set(['www', 'admin', 'app']);
const FIRST_PARTY_TENANT_SLUGS = new Set(['saharax']);

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

const normalizeHostname = (value = '') => {
  const trimmed = String(value || '').trim().toLowerCase();
  if (!trimmed) return '';

  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).hostname.toLowerCase();
  } catch {
    return trimmed.split('/')[0].split(':')[0].toLowerCase();
  }
};

const getTenantSlugFromHostname = (hostname = '') => {
  const normalizedHostname = normalizeHostname(hostname);
  if (!normalizedHostname.endsWith(`.${DRIVEOUT_BASE_DOMAIN}`)) return '';

  const slug = normalizedHostname.slice(0, -(`.${DRIVEOUT_BASE_DOMAIN}`.length));
  return slug && !RESERVED_SUBDOMAINS.has(slug) ? slug : '';
};

const normalizeUrl = (value = '') => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const createTenantAdminClientFromRecord = async (tenant = {}) => {
  const tenancyMode = resolveTenantTenancyMode(tenant);
  if (tenancyMode === 'shared') {
    const sharedConfig = getSharedSupabaseTenantConfig();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    return createClient(sharedConfig.apiUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  }

  const projectRef = String(tenant?.tenant_project_ref || '').trim();
  const apiUrl = normalizeUrl(tenant?.tenant_api_url || '');

  if (!projectRef || !apiUrl) {
    throw new Error('Tenant workspace is missing API configuration');
  }

  const serviceRoleKey = await getServiceRoleKeyForProject(projectRef);
  return createClient(apiUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
};

const resolveAdminClientForPublicTenantRequest = async (req) => {
  const requestedHostname = normalizeHostname(
    req.headers['x-forwarded-host'] ||
    req.headers.host ||
    ''
  );
  const tenantSlug = getTenantSlugFromHostname(requestedHostname);
  const { adminClient: masterAdminClient } = createSupabaseClients();

  if (!tenantSlug || FIRST_PARTY_TENANT_SLUGS.has(tenantSlug)) {
    return masterAdminClient;
  }

  const { data: tenant, error } = await runPlatformTenantSelectWithModeFallback((selectClause) =>
    masterAdminClient
      .from(PLATFORM_TENANTS_TABLE)
      .select(selectClause)
      .eq('tenant_slug', tenantSlug)
      .maybeSingle()
  );

  if (error) {
    throw error;
  }

  if (!tenant || String(tenant.tenant_status || '').trim().toLowerCase() !== 'active') {
    throw new Error(`Tenant workspace ${tenantSlug} is not active`);
  }

  return createTenantAdminClientFromRecord(tenant);
};

const STORAGE_URL_MARKER = '/storage/v1/object/public/';

const parseStorageTargetFromUrl = (url) => {
  if (!url || typeof url !== 'string') return null;
  const markerIndex = url.indexOf(STORAGE_URL_MARKER);
  if (markerIndex === -1) return null;
  const storagePath = url.slice(markerIndex + STORAGE_URL_MARKER.length);
  const firstSlash = storagePath.indexOf('/');
  if (firstSlash === -1) return null;
  const bucket = storagePath.slice(0, firstSlash);
  const path = decodeURIComponent(storagePath.slice(firstSlash + 1));
  if (!bucket || !path) return null;
  return { bucket, path };
};

const addUrlToSet = (set, value) => {
  const normalized = String(value || '').trim();
  if (normalized) {
    set.add(normalized);
  }
};

const buildMediaUrlSet = (mediaGallery = [], coverUrl = '') => {
  const urls = new Set();
  (mediaGallery || []).forEach((item) => {
    addUrlToSet(urls, item?.url);
    addUrlToSet(urls, item?.thumbnail_url);
    addUrlToSet(urls, item?.thumbnailUrl);
    addUrlToSet(urls, item?.previewUrl);
  });
  addUrlToSet(urls, coverUrl);
  return urls;
};

const resolveRemovedMediaTargets = (previousPackage = {}, nextPackage = {}) => {
  const previousUrls = buildMediaUrlSet(previousPackage.mediaGallery, previousPackage.coverImageUrl);
  const nextUrls = buildMediaUrlSet(nextPackage.mediaGallery, nextPackage.coverImageUrl);
  const removedUrls = [...previousUrls].filter((url) => !nextUrls.has(url));
  const targets = [];
  const seen = new Set();
  removedUrls.forEach((url) => {
    const target = parseStorageTargetFromUrl(url);
    if (!target) return;
    const key = `${target.bucket}:${target.path}`;
    if (seen.has(key)) return;
    seen.add(key);
    targets.push(target);
  });
  return targets;
};

const removeStorageTargets = async (adminClient, targets = []) => {
  if (!targets.length) return;
  const grouped = targets.reduce((acc, target) => {
    if (!acc[target.bucket]) acc[target.bucket] = [];
    acc[target.bucket].push(target.path);
    return acc;
  }, {});

  await Promise.all(
    Object.entries(grouped).map(async ([bucket, paths]) => {
      const { error } = await adminClient.storage.from(bucket).remove(paths);
      if (error) {
        console.warn('Failed to remove tour package media from storage:', error);
      }
    })
  );
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

const isInstagramUrl = (value) => /instagram\.com/i.test(String(value || ''));

const INSTAGRAM_REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'x-ig-app-id': '936619743392459',
};

const clampInstagramPreviewCount = 3;

const makePresentationId = (prefix, index) => `${prefix}_${index + 1}`;

const normalizeStopMedia = (value) => normalizeMediaGallery(value).slice(0, 3);

const normalizeRouteStops = (value) => {
  const allowedKinds = new Set(['start', 'drive', 'stop', 'end', 'note']);
  return normalizeJsonArray(value)
    .slice(0, 24)
    .map((stop, index) => {
      const item = typeof stop === 'object' && stop !== null ? stop : { title: stop };
      const kind = clampText(item.kind || item.type || 'stop', 24).toLowerCase();
      const title = clampText(item.title, 90);
      const note = clampText(item.note, 180);
      const media = normalizeStopMedia(item.media || item.mediaGallery || item.media_gallery_json || []);
      const durationMinutes = Math.max(0, toSafeInteger(item.duration_minutes, 0));
      if (!title && !note && media.length === 0 && durationMinutes === 0) return null;

      return {
        id: clampText(item.id, 64) || makePresentationId('stop', index),
        kind: allowedKinds.has(kind) ? kind : 'stop',
        title,
        duration_minutes: durationMinutes,
        note,
        media,
        sort_order: toSafeInteger(item.sort_order, index + 1),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((item, index) => ({
      ...item,
      sort_order: index + 1,
    }));
};

const normalizeMediaGallery = (value) => {
  const allowedTypes = new Set(['image', 'video', 'instagram']);
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
        external_url: clampText(item.external_url || item.externalUrl || item.instagram_url || item.instagramUrl, 900),
        thumbnail_url: clampText(item.thumbnail_url || item.thumbnailUrl || item.preview_url || item.previewUrl || '', 900),
        caption: clampText(item.caption, 120),
        duration: Math.max(0, toSafeInteger(item.duration, 0)),
        sort_order: toSafeInteger(item.sort_order, index + 1),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((item, index) => ({
      ...item,
      sort_order: index + 1,
    }));
};

const extractInstagramUsername = (value) => {
  const source = String(value || '').trim();
  if (!source) return '';

  try {
    const normalized = source.startsWith('http') ? source : `https://${source.replace(/^\/+/, '')}`;
    const url = new URL(normalized);
    if (!/instagram\.com$/i.test(url.hostname.replace(/^www\./i, ''))) return '';
    const [username] = url.pathname.split('/').filter(Boolean);
    if (!username || ['p', 'reel', 'reels', 'tv', 'stories'].includes(username.toLowerCase())) return '';
    return username.replace(/^@/, '');
  } catch {
    return '';
  }
};

const instagramCaptionFromNode = (node = {}) => {
  const edges = node?.edge_media_to_caption?.edges;
  return clampText(edges?.[0]?.node?.text || node?.accessibility_caption || '', 120);
};

const mapInstagramNodeToMedia = (node = {}, index = 0) => {
  const shortcode = String(node?.shortcode || '').trim();
  const externalUrl = shortcode ? `https://www.instagram.com/p/${shortcode}/` : '';
  const thumbnailUrl = clampText(
    node?.thumbnail_src ||
      node?.display_url ||
      node?.display_src ||
      node?.thumbnail_url ||
      node?.image_versions2?.candidates?.[0]?.url ||
      '',
    900
  );

  if (!externalUrl && !thumbnailUrl) return null;

  return {
    id: clampText(`instagram_${shortcode || index + 1}`, 64),
    type: 'instagram',
    url: externalUrl || thumbnailUrl,
    external_url: externalUrl || thumbnailUrl,
    thumbnail_url: thumbnailUrl,
    caption: instagramCaptionFromNode(node) || `Instagram preview ${index + 1}`,
    duration: 0,
    sort_order: index + 1,
  };
};

const fetchInstagramProfilePreviewItems = async (instagramUrl) => {
  const username = extractInstagramUsername(instagramUrl);
  if (!username) return [];

  const response = await fetch(
    `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
    { headers: INSTAGRAM_REQUEST_HEADERS }
  );

  if (!response.ok) {
    throw new Error(`Instagram profile lookup failed (${response.status})`);
  }

  const payload = await response.json().catch(() => ({}));
  const user =
    payload?.data?.user ||
    payload?.user ||
    payload?.graphql?.user ||
    payload?.profile ||
    null;

  if (!user) return [];

  const pinnedEdges =
    user?.edge_pinned_for_users_to_timeline_media?.edges ||
    user?.xdt_api__v1__feed__user_timeline_graphql_connection?.edges ||
    [];
  const timelineEdges =
    user?.edge_owner_to_timeline_media?.edges ||
    user?.edge_felix_video_timeline?.edges ||
    [];

  const combinedNodes = [...pinnedEdges, ...timelineEdges]
    .map((entry) => entry?.node || entry)
    .filter(Boolean);

  const uniqueNodes = combinedNodes.filter((node, index, items) => {
    const currentKey = String(node?.id || node?.shortcode || index);
    return items.findIndex((candidate) => String(candidate?.id || candidate?.shortcode || index) === currentKey) === index;
  });

  return uniqueNodes
    .slice(0, clampInstagramPreviewCount)
    .map((node, index) => mapInstagramNodeToMedia(node, index))
    .filter(Boolean);
};

const fetchInstagramEmbedPreviewItem = async (instagramUrl) => {
  const response = await fetch(instagramUrl, { headers: INSTAGRAM_REQUEST_HEADERS });
  if (!response.ok) {
    throw new Error(`Instagram page lookup failed (${response.status})`);
  }

  const html = await response.text();
  const imageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
  const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
  const externalUrl = clampText(instagramUrl, 900);
  const thumbnailUrl = clampText(imageMatch?.[1] || '', 900);

  if (!thumbnailUrl && !externalUrl) return [];

  return [{
    id: clampText(`instagram_embed_${Date.now()}`, 64),
    type: 'instagram',
    url: externalUrl,
    external_url: externalUrl,
    thumbnail_url: thumbnailUrl,
    caption: clampText(titleMatch?.[1] || 'Instagram preview', 120),
    duration: 0,
    sort_order: 1,
  }];
};

const resolveInstagramPreviewItems = async (instagramUrl) => {
  const source = String(instagramUrl || '').trim();
  if (!isInstagramUrl(source)) return [];

  const isProfileUrl = Boolean(extractInstagramUsername(source));
  try {
    if (isProfileUrl) {
      const profileItems = await fetchInstagramProfilePreviewItems(source);
      if (profileItems.length > 0) return profileItems;
    }
  } catch (error) {
    console.warn('Instagram profile preview lookup failed:', error?.message || error);
  }

  try {
    return await fetchInstagramEmbedPreviewItem(source);
  } catch (error) {
    console.warn('Instagram embed preview lookup failed:', error?.message || error);
    return [{
      id: clampText(`instagram_fallback_${Date.now()}`, 64),
      type: 'instagram',
      url: source,
      external_url: source,
      thumbnail_url: '',
      caption: 'Instagram preview',
      duration: 0,
      sort_order: 1,
    }];
  }
};

const enrichInstagramMediaGallery = async (mediaGallery = []) => {
  const items = Array.isArray(mediaGallery) ? mediaGallery : [];
  const resolved = [];

  for (const item of items) {
    if (String(item?.type || '').toLowerCase() !== 'instagram') {
      resolved.push(item);
      continue;
    }

    const previewItems = await resolveInstagramPreviewItems(item.url || item.external_url || item.externalUrl);
    if (previewItems.length === 0) {
      resolved.push(item);
      continue;
    }

    previewItems.forEach((previewItem, previewIndex) => {
      resolved.push({
        ...previewItem,
        sort_order: toSafeInteger(item.sort_order, resolved.length + 1) + previewIndex,
      });
    });
  }

  return normalizeMediaGallery(resolved).slice(0, 12);
};

const enrichPackageInstagramMedia = async (pkg = {}) => {
  const mediaGallery = await enrichInstagramMediaGallery(pkg.mediaGallery || []);
  return {
    ...pkg,
    mediaGallery,
  };
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
  const resolvedRouteStops = Array.isArray(pkg.route_stops_json) && pkg.route_stops_json.length > 0
    ? pkg.route_stops_json
    : (Array.isArray(publicPresentation.routeStops) && publicPresentation.routeStops.length > 0
      ? publicPresentation.routeStops
      : (pkg.routeStops || []));
  const resolvedMediaGallery = Array.isArray(publicPresentation.mediaGallery) && publicPresentation.mediaGallery.length > 0
    ? publicPresentation.mediaGallery
    : (pkg.mediaGallery || pkg.media_gallery_json || []);
  const resolvedHighlights = Array.isArray(publicPresentation.publicHighlights) && publicPresentation.publicHighlights.length > 0
    ? publicPresentation.publicHighlights
    : (pkg.publicHighlights || pkg.public_highlights_json || []);
  const routeStops = normalizeRouteStops(resolvedRouteStops);
  const mediaGallery = normalizeMediaGallery(resolvedMediaGallery);
  const publicHighlights = normalizeHighlights(resolvedHighlights);
  const stopCountSource = pkg.stopCount ?? pkg.stop_count ?? publicPresentation.stopCount ?? routeStops.length;
  const stopCount = routeStops.length > 0 ? routeStops.length : toSafeInteger(stopCountSource, routeStops.length);

  return {
    id: String(pkg.id || ''),
    name: clampText(pkg.name, 140),
    description: stripMarkedJson(pkg.description || '', TOUR_PACKAGE_RULES_MARKER),
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
    difficultyLabel: clampText(pkg.difficultyLabel || publicPresentation.difficultyLabel || pkg.difficulty_label, 60),
    created_at: pkg.created_at || new Date().toISOString(),
    updated_at: pkg.updated_at || new Date().toISOString(),
  };
};

export const toPackageTableRow = async (pkg = {}) => {
  const normalized = normalizePackage(pkg);
  const resolvedMediaGallery = await enrichInstagramMediaGallery(normalized.mediaGallery);
  const resolvedCoverImageUrl =
    normalized.coverImageUrl ||
    resolvedMediaGallery.find((item) => item.type === 'image')?.url ||
    resolvedMediaGallery.find((item) => item.type === 'instagram')?.thumbnail_url ||
    resolvedMediaGallery.find((item) => item.thumbnail_url)?.thumbnail_url ||
    resolvedMediaGallery[0]?.url ||
    '';

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
        mediaGallery: resolvedMediaGallery,
        publicHighlights: normalized.publicHighlights,
        displayOrder: normalized.displayOrder,
        coverImageUrl: resolvedCoverImageUrl,
        durationDisplay: normalized.durationDisplay,
        stopCount: normalized.stopCount,
        difficultyLabel: normalized.difficultyLabel,
      },
    }),
    media_gallery_json: resolvedMediaGallery,
    cover_image_url: resolvedCoverImageUrl,
    route_stops_json: normalized.routeStops,
    public_highlights_json: normalized.publicHighlights,
    stop_count: normalized.stopCount,
    difficulty_label: normalized.difficultyLabel || null,
    display_order: normalized.displayOrder,
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

export const createPackageId = () =>
  `tour_pkg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const readPackagesFromTable = async (adminClient, tenantScope = null) => {
  const { data, error } = await applyTenantQueryScope(
    adminClient
      .from(TOUR_PACKAGES_TABLE)
      .select('*')
      .order('name', { ascending: true }),
    tenantScope
  );

  if (error) throw error;
  const normalizedPackages = Array.isArray(data) ? data.map(normalizePackage) : [];
  const repairTargets = Array.isArray(data)
    ? data
        .map((row, index) => ({ raw: row, normalized: normalizedPackages[index] }))
        .filter(({ normalized, raw }) =>
          Array.isArray(normalized?.routeStops) &&
          normalized.routeStops.length > 0 &&
          (!Array.isArray(raw?.route_stops_json) || raw.route_stops_json.length === 0)
        )
    : [];
  if (repairTargets.length > 0) {
    await Promise.all(
      repairTargets.map(async ({ normalized }) => {
        const { error: repairError } = await adminClient
          .from(TOUR_PACKAGES_TABLE)
          .update({
            route_stops_json: normalized.routeStops,
            stop_count: normalized.routeStops.length,
            updated_at: new Date().toISOString(),
          })
          .eq('id', normalized.id)
          .match(stampTenantPayload({}, tenantScope));
        if (repairError) {
          console.warn('Failed to repair route roadmap on read:', repairError);
        }
      })
    );
  }
  normalizedPackages.sort((left, right) => {
    const leftOrder = toSafeInteger(left.displayOrder, 0);
    const rightOrder = toSafeInteger(right.displayOrder, 0);
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return String(left.name || '').localeCompare(String(right.name || ''));
  });
  return Promise.all(normalizedPackages.map((pkg) => enrichPackageInstagramMedia(pkg)));
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
  image_url: String(model.image_url || '').trim(),
  capacity_min: Number(model.capacity_min || 0) || null,
  capacity_max: Number(model.capacity_max || model.capacity || 0) || null,
});

export const readTourPackagePricingContext = async (adminClient, tenantScope = null) => {
  const [pricingResult, modelResult] = await Promise.all([
    applyTenantQueryScope(
      adminClient
        .from(TOUR_PACKAGE_MODEL_PRICES_TABLE)
        .select('id,package_id,vehicle_model_id,duration_hours,price_mad,is_active')
        .eq('is_active', true)
        .order('package_id', { ascending: true })
        .order('vehicle_model_id', { ascending: true })
        .order('duration_hours', { ascending: true }),
      tenantScope
    ),
    applyTenantQueryScope(
      adminClient
        .from(VEHICLE_MODELS_TABLE)
        .select('id,name,model,vehicle_type,image_url,capacity_min,capacity_max')
        .order('name', { ascending: true }),
      tenantScope
    ),
  ]);

  if (pricingResult.error) throw pricingResult.error;

  return {
    pricingRows: Array.isArray(pricingResult.data) ? pricingResult.data.map(normalizePricingRow) : [],
    vehicleModels: modelResult.error ? [] : (Array.isArray(modelResult.data) ? modelResult.data.map(normalizeVehicleModel) : []),
  };
};

export const createPackageInTable = async (adminClient, pkg, tenantScope = null) => {
  const tableRow = stampTenantPayload(await toPackageTableRow(pkg), tenantScope);
  const { data, error } = await adminClient
    .from(TOUR_PACKAGES_TABLE)
    .insert([tableRow])
    .select('*')
    .single();

  if (error) throw error;
  return enrichPackageInstagramMedia(normalizePackage(data));
};

export const updatePackageInTable = async (adminClient, pkg, tenantScope = null) => {
  const tableRow = stampTenantPayload(await toPackageTableRow(pkg), tenantScope);
  const { data, error } = await adminClient
    .from(TOUR_PACKAGES_TABLE)
    .update(tableRow)
    .eq('id', pkg.id)
    .match(stampTenantPayload({}, tenantScope))
    .select('*')
    .single();

  if (error) throw error;
  return enrichPackageInstagramMedia(normalizePackage(data));
};

export const deactivatePackageInTable = async (adminClient, packageId, tenantScope = null) => {
  const { error } = await adminClient
    .from(TOUR_PACKAGES_TABLE)
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', packageId)
    .match(stampTenantPayload({}, tenantScope));

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
      let adminClient = null;
      let tenantScope = null;
      const bearerToken = getBearerToken(req);

      if (bearerToken) {
        const auth = await authenticateRequest(req);
        if (auth.error) {
          return json(res, auth.error.status, auth.error.body);
        }
        adminClient = auth.adminClient;
        tenantScope = await resolveRequestTenantScope({
          req,
          adminClient,
          tenantRuntime: auth.tenantRuntime || null,
        });
      } else {
        adminClient = await resolveAdminClientForPublicTenantRequest(req);
        tenantScope = await resolveRequestTenantScope({ req, adminClient });
      }

      const [packages, pricingContext] = await Promise.all([
        readPackagesFromTable(adminClient, tenantScope),
        readTourPackagePricingContext(adminClient, tenantScope).catch((pricingError) => {
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
    const tenantScope = await resolveRequestTenantScope({ req, adminClient, tenantRuntime: auth.tenantRuntime || null });
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
      const created = await createPackageInTable(adminClient, payload, tenantScope);
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
        .match(stampTenantPayload({}, tenantScope))
        .maybeSingle();

      if (existingTableError) {
        throw existingTableError;
      }

      const existingPackage = normalizePackage(existingTableRow || {});

      if (String(body?.action || '').toLowerCase() === 'update-media') {
        const nextMediaGallery = normalizeMediaGallery(body?.mediaGallery || existingPackage.mediaGallery || []);
        const requestedCoverUrl = clampText(body?.coverImageUrl || existingPackage.coverImageUrl || '', 900);
        const coverStillExists = nextMediaGallery.some((item) => {
          const url = String(item?.url || '').trim();
          const thumb = String(item?.thumbnailUrl || item?.thumbnail_url || '').trim();
          return Boolean(requestedCoverUrl && (requestedCoverUrl === url || requestedCoverUrl === thumb));
        });
        const nextCoverUrl = coverStillExists
          ? requestedCoverUrl
          : clampText(
            String(nextMediaGallery[0]?.thumbnailUrl || nextMediaGallery[0]?.thumbnail_url || nextMediaGallery[0]?.url || ''),
            900
          );
        const mediaPayload = {
          routeType: existingPackage.routeType,
          requiresLicense: existingPackage.requiresLicense,
          maxQuads: existingPackage.maxQuads,
          bufferBeforeMinutes: existingPackage.bufferBeforeMinutes,
          bufferAfterMinutes: existingPackage.bufferAfterMinutes,
          websiteVisible: existingPackage.websiteVisible,
          publicPresentation: {
            publicTitle: existingPackage.publicTitle,
            publicSummary: existingPackage.publicSummary,
            routeLabel: existingPackage.routeLabel,
            routeStops: existingPackage.routeStops,
            mediaGallery: nextMediaGallery,
            publicHighlights: existingPackage.publicHighlights,
            displayOrder: existingPackage.displayOrder,
            coverImageUrl: nextCoverUrl,
            durationDisplay: existingPackage.durationDisplay,
            stopCount: existingPackage.stopCount,
            difficultyLabel: existingPackage.difficultyLabel,
          },
        };

        const nextDescription = appendMarkedJson(
          existingPackage.description || '',
          TOUR_PACKAGE_RULES_MARKER,
          mediaPayload
        );
        const removedTargets = resolveRemovedMediaTargets(existingPackage, {
          ...existingPackage,
          mediaGallery: nextMediaGallery,
          coverImageUrl: nextCoverUrl,
        });

        const { data: updatedRow, error: updateError } = await adminClient
          .from(TOUR_PACKAGES_TABLE)
          .update({
            description: nextDescription,
            media_gallery_json: nextMediaGallery,
            cover_image_url: nextCoverUrl || null,
            route_stops_json: existingPackage.routeStops || [],
            public_highlights_json: existingPackage.publicHighlights || [],
            stop_count: existingPackage.routeStops?.length || existingPackage.stopCount || 0,
            display_order: existingPackage.displayOrder || 0,
            difficulty_label: existingPackage.difficultyLabel || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', packageId)
          .match(stampTenantPayload({}, tenantScope))
          .select('*')
          .single();

        if (updateError) {
          throw updateError;
        }

        await removeStorageTargets(adminClient, removedTargets);
        return json(res, 200, { success: true, data: normalizePackage(updatedRow || {}) });
      }

      if (String(body?.action || '').toLowerCase() === 'update-roadmap') {
        const rawStops = normalizeJsonArray(body?.routeStops || existingPackage.routeStops || []);
        let nextRouteStops = normalizeRouteStops(rawStops);
        if (nextRouteStops.length === 0 && rawStops.length > 0) {
          nextRouteStops = rawStops
            .map((stop, index) => {
              const item = typeof stop === 'object' && stop !== null ? stop : { title: stop };
              const title = clampText(item.title || item.name || item.label || item.stopTitle || '', 90);
              const note = clampText(item.note || item.description || '', 180);
              const media = normalizeStopMedia(item.media || item.mediaGallery || item.media_gallery_json || []);
              if (!title && !note && media.length === 0) return null;
              return {
                id: clampText(item.id, 64) || makePresentationId('stop', index),
                kind: clampText(item.kind || item.type || 'stop', 24).toLowerCase(),
                title,
                duration_minutes: Math.max(0, toSafeInteger(item.duration_minutes, 0)),
                note,
                media,
                sort_order: toSafeInteger(item.sort_order, index + 1),
              };
            })
            .filter(Boolean);
        }

        const stopsForStorage = nextRouteStops;
        const stopsForPresentation = nextRouteStops;
        const roadmapPayload = {
          routeType: existingPackage.routeType,
          requiresLicense: existingPackage.requiresLicense,
          maxQuads: existingPackage.maxQuads,
          bufferBeforeMinutes: existingPackage.bufferBeforeMinutes,
          bufferAfterMinutes: existingPackage.bufferAfterMinutes,
          websiteVisible: existingPackage.websiteVisible,
          publicPresentation: {
            publicTitle: existingPackage.publicTitle,
            publicSummary: existingPackage.publicSummary,
            routeLabel: existingPackage.routeLabel,
            routeStops: stopsForPresentation,
            mediaGallery: existingPackage.mediaGallery,
            publicHighlights: existingPackage.publicHighlights,
            displayOrder: existingPackage.displayOrder,
            coverImageUrl: existingPackage.coverImageUrl,
            durationDisplay: existingPackage.durationDisplay,
            stopCount: (stopsForPresentation || []).length,
            difficultyLabel: existingPackage.difficultyLabel,
          },
        };

        const nextDescription = appendMarkedJson(
          existingPackage.description || '',
          TOUR_PACKAGE_RULES_MARKER,
          roadmapPayload
        );

        const { data: updatedRow, error: updateError } = await adminClient
          .from(TOUR_PACKAGES_TABLE)
          .update({
            description: nextDescription,
            route_stops_json: stopsForStorage,
            stop_count: (stopsForStorage || []).length,
            media_gallery_json: existingPackage.mediaGallery || [],
            cover_image_url: existingPackage.coverImageUrl || null,
            public_highlights_json: existingPackage.publicHighlights || [],
            display_order: existingPackage.displayOrder || 0,
            difficulty_label: existingPackage.difficultyLabel || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', packageId)
          .match(stampTenantPayload({}, tenantScope))
          .select('*')
          .single();

        if (updateError) {
          throw updateError;
        }
        const normalizedUpdated = normalizePackage(updatedRow || {});
        const shouldRepair =
          Array.isArray(nextRouteStops) &&
          nextRouteStops.length > 0 &&
          (!Array.isArray(updatedRow?.route_stops_json) || updatedRow.route_stops_json.length === 0);

        if (shouldRepair) {
          const fallbackPayload = {
            routeType: existingPackage.routeType,
            requiresLicense: existingPackage.requiresLicense,
            maxQuads: existingPackage.maxQuads,
            bufferBeforeMinutes: existingPackage.bufferBeforeMinutes,
            bufferAfterMinutes: existingPackage.bufferAfterMinutes,
            websiteVisible: existingPackage.websiteVisible,
            publicPresentation: {
              publicTitle: existingPackage.publicTitle,
              publicSummary: existingPackage.publicSummary,
              routeLabel: existingPackage.routeLabel,
              routeStops: nextRouteStops,
              mediaGallery: existingPackage.mediaGallery,
              publicHighlights: existingPackage.publicHighlights,
              displayOrder: existingPackage.displayOrder,
              coverImageUrl: existingPackage.coverImageUrl,
              durationDisplay: existingPackage.durationDisplay,
              stopCount: nextRouteStops.length,
              difficultyLabel: existingPackage.difficultyLabel,
            },
          };
          const fallbackDescription = appendMarkedJson(
            existingPackage.description || '',
            TOUR_PACKAGE_RULES_MARKER,
            fallbackPayload
          );

          const { data: repairedRow, error: repairError } = await adminClient
            .from(TOUR_PACKAGES_TABLE)
            .update({
              description: fallbackDescription,
              route_stops_json: nextRouteStops,
              stop_count: nextRouteStops.length,
              updated_at: new Date().toISOString(),
            })
            .eq('id', packageId)
            .match(stampTenantPayload({}, tenantScope))
            .select('*')
            .single();

          if (!repairError && repairedRow) {
            return json(res, 200, { success: true, data: normalizePackage(repairedRow) });
          }
          if (repairError) {
            console.warn('Route roadmap repair failed:', repairError);
          }
        }

        if (!Array.isArray(updatedRow?.route_stops_json) || updatedRow.route_stops_json.length === 0) {
          const roadmapFromDescription =
            extractMarkedJson(updatedRow?.description || '', TOUR_PACKAGE_RULES_MARKER)?.publicPresentation?.routeStops || [];
          if (Array.isArray(roadmapFromDescription) && roadmapFromDescription.length > 0) {
            const repairedStops = normalizeRouteStops(roadmapFromDescription);
            if (repairedStops.length > 0) {
              const { data: repairedRow, error: repairError } = await adminClient
                .from(TOUR_PACKAGES_TABLE)
                .update({
                  route_stops_json: repairedStops,
                  stop_count: repairedStops.length,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', packageId)
                .match(stampTenantPayload({}, tenantScope))
                .select('*')
                .single();
              if (!repairError && repairedRow) {
                return json(res, 200, { success: true, data: normalizePackage(repairedRow) });
              }
              if (repairError) {
                console.warn('Route roadmap description repair failed:', repairError);
              }
            }
          }
        }

        return json(res, 200, { success: true, data: normalizedUpdated });
      }

      const mergedPayload = {
        ...(existingTableRow || {}),
        ...body,
        route_stops_json: body?.routeStops ?? body?.route_stops_json ?? existingTableRow?.route_stops_json ?? [],
        media_gallery_json: body?.mediaGallery ?? body?.media_gallery_json ?? existingTableRow?.media_gallery_json ?? [],
        public_highlights_json: body?.publicHighlights ?? body?.public_highlights_json ?? existingTableRow?.public_highlights_json ?? [],
        cover_image_url: body?.coverImageUrl ?? body?.cover_image_url ?? existingTableRow?.cover_image_url ?? null,
        duration_display: body?.durationDisplay ?? body?.duration_display ?? existingTableRow?.duration_display ?? '',
        stop_count: body?.stopCount ?? body?.stop_count ?? existingTableRow?.stop_count ?? 0,
        difficulty_label: body?.difficultyLabel ?? body?.difficulty_label ?? existingTableRow?.difficulty_label ?? null,
        display_order: body?.displayOrder ?? body?.display_order ?? existingTableRow?.display_order ?? 0,
        public_title: body?.publicTitle ?? body?.public_title ?? existingTableRow?.public_title ?? '',
        public_summary: body?.publicSummary ?? body?.public_summary ?? existingTableRow?.public_summary ?? '',
        route_label: body?.routeLabel ?? body?.route_label ?? existingTableRow?.route_label ?? '',
        id: packageId,
        created_at: existingTableRow?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const payload = normalizePackage(mergedPayload);

      if (!payload.name) {
        return json(res, 400, { error: 'Package name is required' });
      }
      const removedTargets = resolveRemovedMediaTargets(existingPackage, payload);
      const updated = await updatePackageInTable(adminClient, payload, tenantScope);
      await removeStorageTargets(adminClient, removedTargets);
      return json(res, 200, { success: true, data: updated });
    }

    const packageId = String(req.query.id || body?.id || '');
    if (!packageId) {
      return json(res, 400, { error: 'Package id is required' });
    }

    await deactivatePackageInTable(adminClient, packageId, tenantScope);
    return json(res, 200, { success: true, id: packageId });
  } catch (error) {
    console.error('tour-packages write failed:', error);
    return json(res, 500, { error: errorToMessage(error) });
  }
};
