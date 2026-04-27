import { createSupabaseClients } from './supabase.js';
import {
  DEFAULT_STOREFRONT_TENANT_SLUG,
  getCanonicalStorefrontOrigin,
} from '../../src/utils/storefrontHost.js';

const PLACEHOLDER_IMAGE_URL = 'https://www.saharax.co/og-image.png';

const safeText = (value, fallback = '') => {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
};

const formatNumeric = (value) => {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

const normalizeVehicleImageUrl = (url) => {
  if (!url || typeof url !== 'string') return '';

  try {
    const parsed = new URL(url);
    const signMarker = '/storage/v1/object/sign/vehicle-images/';
    const publicMarker = '/storage/v1/object/public/vehicle-images/';

    if (parsed.pathname.includes(publicMarker)) return url;

    if (parsed.pathname.includes(signMarker)) {
      const encodedPath = parsed.pathname.split(signMarker)[1] || '';
      const decodedPath = decodeURIComponent(encodedPath);
      return `${parsed.origin}${publicMarker}${decodedPath}`;
    }

    return url;
  } catch (_error) {
    return url;
  }
};

const parseListingSourceId = (listingId) => {
  const normalized = safeText(listingId);
  if (!normalized) return null;

  if (normalized.startsWith('fleet-')) {
    const rawId = normalized.slice('fleet-'.length);
    const parsed = Number.parseInt(rawId, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const resolveBrand = (vehicleRow, modelRow) =>
  safeText(modelRow?.name || modelRow?.brand || vehicleRow?.name?.split(/\s+/)?.[0], 'SaharaX');

const resolveModel = (vehicleRow, modelRow) =>
  safeText(modelRow?.model || vehicleRow?.model || vehicleRow?.name, 'Vehicle');

const resolvePassengerCapacity = (vehicleRow, modelRow) => {
  const min = formatNumeric(modelRow?.capacity_min);
  const max = formatNumeric(modelRow?.capacity_max || modelRow?.capacity || vehicleRow?.capacity);

  if (min && max && min !== max) return `${min}-${max} riders`;
  if (max) return `${max} riders`;
  if (min) return `${min} riders`;
  return 'Certified fleet';
};

const resolvePower = (vehicleRow, modelRow) => {
  const power =
    formatNumeric(modelRow?.power_cc_max) ||
    formatNumeric(modelRow?.power_cc) ||
    formatNumeric(vehicleRow?.power_cc);

  return power ? `${power}cc` : 'Adventure ready';
};

const resolveCategory = (vehicleRow, modelRow, lang = 'en') => {
  const rawCategory = safeText(
    vehicleRow?.vehicle_type || modelRow?.vehicle_type || modelRow?.category,
    lang === 'fr' ? 'Flotte certifiee' : 'Certified fleet'
  );

  return rawCategory;
};

const resolveShareVehicleImage = (vehicleRow, modelRow) => {
  const preferredSources = [
    modelRow?.image_url,
    modelRow?.imageUrl,
    vehicleRow?.image_url,
    vehicleRow?.imageUrl,
  ];

  for (const source of preferredSources) {
    const normalized = normalizeVehicleImageUrl(source);
    if (normalized) return normalized;
  }

  return PLACEHOLDER_IMAGE_URL;
};

export const buildAppOrigin = (req) => {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'www.saharax.co';
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  return getCanonicalStorefrontOrigin({
    host: String(host).split(',')[0]?.trim(),
    protocol,
    tenantSlug: DEFAULT_STOREFRONT_TENANT_SLUG,
  });
};

export const buildVehicleShareTargetPath = (listingId, query = {}) => {
  const nextQuery = new URLSearchParams();

  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    nextQuery.set(key, String(value));
  });

  const queryString = nextQuery.toString();
  return `/rent/${encodeURIComponent(listingId)}${queryString ? `?${queryString}` : ''}`;
};

export const fetchPublicVehicleShareData = async (listingId, lang = 'en') => {
  const sourceId = parseListingSourceId(listingId);
  if (!sourceId) {
    throw new Error('Invalid vehicle listing id');
  }

  const { adminClient } = createSupabaseClients();

  const { data: vehicleRow, error: vehicleError } = await adminClient
    .from('saharax_0u4w4d_vehicles')
    .select('*')
    .eq('id', sourceId)
    .maybeSingle();

  if (vehicleError) throw vehicleError;
  if (!vehicleRow) throw new Error('Vehicle not found');

  let modelRow = null;
  let tenantSettings = null;
  if (vehicleRow.vehicle_model_id) {
    const { data, error } = await adminClient
      .from('saharax_0u4w4d_vehicle_models')
      .select('*')
      .eq('id', vehicleRow.vehicle_model_id)
      .maybeSingle();

    if (error) throw error;
    modelRow = data || null;
  }

  const { data: settingsData } = await adminClient
    .from('app_settings')
    .select('logo_url, stamp_url')
    .eq('id', 1)
    .maybeSingle()
    .then((result) => result)
    .catch(() => ({ data: null }));
  tenantSettings = settingsData || null;

  const brand = resolveBrand(vehicleRow, modelRow);
  const model = resolveModel(vehicleRow, modelRow);
  const riders = resolvePassengerCapacity(vehicleRow, modelRow);
  const power = resolvePower(vehicleRow, modelRow);
  const category = resolveCategory(vehicleRow, modelRow, lang);
  const city = safeText(vehicleRow?.city || vehicleRow?.location || 'Tangier');
  const imageUrl = resolveShareVehicleImage(vehicleRow, modelRow);

  return {
    listingId: safeText(listingId, `fleet-${sourceId}`),
    sourceId,
    brand,
    model,
    title: `${brand} ${model}`.trim(),
    badge: lang === 'fr' ? 'Flotte certifiee' : 'Certified fleet',
    city,
    riders,
    power,
    category,
    imageUrl,
    logoUrl: safeText(tenantSettings?.logo_url),
    stampUrl: safeText(tenantSettings?.stamp_url),
  };
};

export const buildVehicleShareCopy = (vehicle, lang = 'en') => {
  const isFrench = lang === 'fr';
  const specLine = [vehicle.riders, vehicle.power, vehicle.badge].filter(Boolean).join(' • ');

  return {
    pageTitle: isFrench
      ? `${vehicle.model} | SaharaX Maroc`
      : `${vehicle.model} | SaharaX Morocco`,
    ogTitle: isFrench
      ? `${vehicle.model} - Louez avec SaharaX`
      : `${vehicle.model} - Rent with SaharaX`,
    ogDescription: isFrench
      ? `${specLine}. Reservez votre experience a ${vehicle.city} avec SaharaX.`
      : `${specLine}. Book your experience in ${vehicle.city} with SaharaX.`,
    ctaLabel: isFrench ? 'Ouverture de votre reservation...' : 'Opening your reservation...',
    subtitle: isFrench
      ? 'Redirection vers la page de reservation'
      : 'Redirecting to the booking page',
    brandChip: isFrench ? 'Reserve en direct' : 'Book direct',
    specLine,
  };
};

export const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
