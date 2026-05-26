import { createSupabaseClients } from './supabase.js';
import { resolveRequestTenantScope } from './sharedTenantIsolation.js';
import { normalizeVehicleImageUrl } from '../../src/utils/vehicleImage.js';

const DEFAULT_CURRENCY = 'MAD';
const BOOST_REDEMPTIONS_TABLE = process.env.BOOST_REDEMPTIONS_TABLE || 'owner_listing_boost_redemptions';
const VERIFICATION_REQUESTS_TABLE = 'verification_requests';
const VEHICLE_DOCUMENT_VERIFICATION_TYPES = ['vehicle_registration', 'vehicle_insurance'];
const setupErrorCodes = new Set(['42P01', '42501', '42703', '22P02', 'PGRST116', 'PGRST204']);
const CERTIFIED_FLEET_CITY_PROVIDERS = {
  tangier: {
    city: 'Tangier',
    providerName: 'SaharaX',
    providerMark: 'SX',
  },
};

const safeText = (value, fallback = '') => {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
};

const isSetupError = (error) => setupErrorCodes.has(String(error?.code || ''));

const loadOptionalQuery = async (factory, fallbackValue) => {
  try {
    const result = await factory();
    if (result?.error) {
      if (isSetupError(result.error)) return fallbackValue;
      throw result.error;
    }
    return result?.data ?? fallbackValue;
  } catch (error) {
    if (isSetupError(error)) return fallbackValue;
    throw error;
  }
};

const formatMoney = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

const getVehicleVerificationLookupIds = (profile = {}) => {
  const candidates = [
    profile?.id,
    profile?.linked_fleet_vehicle_id,
    profile?.fleet_vehicle_id,
    profile?.vehicle_ref_id,
  ];

  return [...new Set(
    candidates
      .map((value) => safeText(value))
      .filter(Boolean)
  )];
};

const isActiveApprovedVerification = (row = {}) => {
  if (safeText(row?.status).toLowerCase() !== 'approved') return false;
  const verificationType = safeText(row?.verification_type).toLowerCase();
  if (verificationType === 'vehicle_insurance' && row?.expires_at) {
    const expiresAt = new Date(row.expires_at).getTime();
    if (Number.isFinite(expiresAt) && expiresAt < Date.now()) return false;
  }
  return VEHICLE_DOCUMENT_VERIFICATION_TYPES.includes(verificationType);
};

const buildVehicleDocumentVerificationMap = (rows = []) => {
  const verifiedByEntityId = new Map();

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    if (!isActiveApprovedVerification(row)) return;
    const entityId = safeText(row?.entity_id);
    const verificationType = safeText(row?.verification_type).toLowerCase();
    if (!entityId || !verificationType) return;

    const current = verifiedByEntityId.get(entityId) || new Set();
    current.add(verificationType);
    verifiedByEntityId.set(entityId, current);
  });

  return verifiedByEntityId;
};

const hasVerifiedVehicleDocuments = (profile = {}, verifiedByEntityId = new Map()) => {
  const lookupIds = getVehicleVerificationLookupIds(profile);
  return lookupIds.some((entityId) => {
    const verifiedTypes = verifiedByEntityId.get(entityId);
    return VEHICLE_DOCUMENT_VERIFICATION_TYPES.every((type) => verifiedTypes?.has(type));
  });
};

const formatQuantity = (value) => {
  const amount = formatMoney(value);
  return Number.isInteger(amount) ? String(amount) : String(amount).replace(/\.0+$/, '');
};

const formatPackageAllowanceLabel = (pkg, bucket) => {
  if (!pkg?.included_kilometers) {
    return safeText(pkg?.name, `${bucket === 'hourly' ? 'Hourly' : 'Daily'} package`);
  }

  const kilometers = formatQuantity(pkg.included_kilometers);
  const durationUnits = formatMoney(pkg.duration_units || 1);
  const durationLabel = formatQuantity(durationUnits);

  if (bucket === 'daily') {
    return durationUnits === 1
      ? `${kilometers} km included for one day`
      : `${kilometers} km included for ${durationLabel} days`;
  }

  if (durationUnits === 0.5) return `${kilometers} km included for 30 minutes`;
  if (durationUnits === 1) return `${kilometers} km included for one hour`;
  return `${kilometers} km included for ${durationLabel} hours`;
};

const normalizeMarketplaceStatus = (value, fallback = 'draft') => {
  const normalized = safeText(value, fallback).toLowerCase();
  const aliases = {
    pending: 'pending_review',
    active: 'live',
    published: 'live',
    hidden: 'unpublished',
    inactive: 'unpublished',
  };

  return aliases[normalized] || normalized;
};

const normalizeLookupKey = (value) =>
  safeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const GENERIC_UNKNOWN_KEYS = new Set([
  'unknown',
  'unknownunknown',
  'vehicle',
  'unknownvehicle',
  'vehicleunknown',
]);

const normalizeCategory = (vehicleType, modelData) =>
  safeText(vehicleType || modelData?.vehicle_type || modelData?.category || modelData?.type, 'ATV');

const normalizeBrand = (vehicleName, modelData) => {
  const explicitBrand = safeText(modelData?.name || modelData?.brand);
  if (explicitBrand) return explicitBrand;

  const firstWord = safeText(vehicleName).split(/\s+/).filter(Boolean)[0];
  return firstWord || 'SaharaX';
};

const normalizeModel = (vehicleRow, modelData) =>
  safeText(
    modelData?.model ||
      vehicleRow?.model ||
      vehicleRow?.name ||
      [modelData?.name, modelData?.model].filter(Boolean).join(' '),
    'Vehicle'
  );

const resolveCertifiedListingImage = (vehicleRow, modelData) => {
  const preferredSources = [
    modelData?.image_url,
    modelData?.imageUrl,
    vehicleRow?.image_url,
    vehicleRow?.imageUrl,
  ];

  for (const source of preferredSources) {
    const normalized = normalizeVehicleImageUrl(source);
    if (normalized) return normalized;
  }

  return '/assets/images/atv-placeholder.jpg';
};

const buildVehicleModelLookups = (modelRows = []) => {
  const byId = new Map();
  const byKey = new Map();

  (modelRows || []).forEach((row) => {
    if (!row) return;
    byId.set(String(row.id), row);

    [
      row.id,
      row.model,
      row.name,
      [row.name, row.model].filter(Boolean).join(' '),
    ]
      .map((value) => normalizeLookupKey(value))
      .filter(Boolean)
      .forEach((key) => {
        if (!byKey.has(key)) {
          byKey.set(key, row);
        }
      });
  });

  return { byId, byKey };
};

const inferVehicleModelData = (vehicleRow, modelLookups) => {
  const explicitModelId = String(vehicleRow?.vehicle_model_id || '');
  if (explicitModelId && modelLookups.byId.has(explicitModelId)) {
    return modelLookups.byId.get(explicitModelId);
  }

  const candidateKeys = [
    vehicleRow?.vehicle_model_id,
    vehicleRow?.model,
    vehicleRow?.name,
    [vehicleRow?.name, vehicleRow?.model].filter(Boolean).join(' '),
  ]
    .map((value) => normalizeLookupKey(value))
    .filter(Boolean);

  for (const key of candidateKeys) {
    if (modelLookups.byKey.has(key)) {
      return modelLookups.byKey.get(key);
    }
  }

  return null;
};

const shouldHideCertifiedFleetVehicle = (vehicleRow, modelData) => {
  if (vehicleRow?.owner_user_id || !safeText(vehicleRow?.organization_id)) {
    return true;
  }

  if (modelData) return false;

  const rawKeys = [
    vehicleRow?.name,
    vehicleRow?.model,
    [vehicleRow?.name, vehicleRow?.model].filter(Boolean).join(' '),
  ]
    .map((value) => normalizeLookupKey(value))
    .filter(Boolean);

  const hasGenericUnknownIdentity = rawKeys.some((key) => GENERIC_UNKNOWN_KEYS.has(key));
  const hasNoModelLink = !safeText(vehicleRow?.vehicle_model_id);
  const hasNoPricing =
    formatMoney(vehicleRow?.hourly_rate ?? vehicleRow?.price ?? vehicleRow?.daily_rate) <= 0 &&
    formatMoney(vehicleRow?.daily_rate ?? vehicleRow?.price) <= 0;

  return hasNoModelLink && (hasGenericUnknownIdentity || hasNoPricing);
};

const shouldHideCertifiedFleetListing = (listing) => {
  const modelKey = normalizeLookupKey(listing?.model || listing?.title);
  if (GENERIC_UNKNOWN_KEYS.has(modelKey)) return true;

  const titleKey = normalizeLookupKey(listing?.title);
  if (GENERIC_UNKNOWN_KEYS.has(titleKey)) return true;

  return false;
};

const normalizeLocation = (vehicleRow) => {
  const area = safeText(vehicleRow?.location?.name || vehicleRow?.location_name || vehicleRow?.pickup_location || vehicleRow?.zone);
  const city = safeText(vehicleRow?.location?.city || vehicleRow?.city_name || vehicleRow?.city);
  const country = safeText(vehicleRow?.country || vehicleRow?.country_name, 'Morocco');
  const label = [area, city].filter(Boolean).join(' - ');

  return {
    country,
    city: city || 'Tangier',
    area: area || city || 'Tangier',
    label: label || area || city || 'Tangier',
  };
};

const normalizePassengerCapacity = (vehicleRow, modelData) => {
  const min = Number(modelData?.capacity_min || 0) || null;
  const max =
    Number(modelData?.capacity_max || 0) ||
    Number(vehicleRow?.capacity || modelData?.capacity || 0) ||
    null;

  if (!min && !max) return { min: null, max: null, label: '' };
  if (min && max && min !== max) {
    return { min, max, label: `${min}-${max} passengers` };
  }

  const seats = max || min;
  return {
    min: seats,
    max: seats,
    label: seats === 1 ? '1 passenger' : `${seats} passengers`,
  };
};

const normalizeFuelIncluded = (vehicleRow, modelData) => {
  const liters =
    Number(modelData?.tank_capacity_liters || 0) ||
    Number(vehicleRow?.tank_capacity_liters || 0) ||
    null;

  if (!liters) return { liters: null, label: '' };
  return { liters, label: `${liters}L` };
};

const normalizePowerCc = (vehicleRow, modelData) => {
  const minPower = Number(modelData?.power_cc_min || 0) || 0;
  const maxPower = Number(modelData?.power_cc_max || 0) || 0;

  if (minPower > 0 && maxPower > 0) {
    return { value: maxPower, label: `${maxPower}cc` };
  }

  if (maxPower > 0) {
    return { value: maxPower, label: `${maxPower}cc` };
  }

  const exactPower = Number(modelData?.power_cc || 0) || Number(vehicleRow?.power_cc || 0) || 0;
  if (exactPower > 0) {
    return { value: exactPower, label: `${exactPower}cc` };
  }

  return { value: null, label: '' };
};

const inferPackageDurationUnits = (name, rentalType) => {
  const normalizedName = safeText(name).toLowerCase();
  if (
    normalizedName.includes('half hour') ||
    normalizedName.includes('half-hour') ||
    normalizedName.includes('30 min') ||
    normalizedName.includes('30-minute') ||
    normalizedName.includes('30 minute') ||
    normalizedName.includes('30 minutes')
  ) {
    return rentalType === 'hourly' ? 0.5 : 1;
  }
  if (normalizedName.includes('half day') || normalizedName.includes('half-day') || normalizedName.includes('demi-journ')) {
    return rentalType === 'hourly' ? 4 : 1;
  }

  const match = normalizedName.match(/(\d+(?:\.\d+)?)\s*(hour|hours|hr|hrs|h|day|days|jour|jours|j)/);
  if (!match) return 1;

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return 1;

  const unit = match[2];
  const looksHourly = ['hour', 'hours', 'hr', 'hrs', 'h'].includes(unit);
  const looksDaily = ['day', 'days', 'jour', 'jours', 'j'].includes(unit);

  if (rentalType === 'hourly' && looksHourly) return value;
  if (rentalType === 'daily' && looksDaily) return value;
  return 1;
};

const normalizeDamageDepositPresets = (presets) => {
  if (!presets || typeof presets !== 'object' || Array.isArray(presets)) return {};

  return Object.fromEntries(
    Object.entries(presets).map(([vehicleModelId, rawPresets]) => [
      String(vehicleModelId),
      Array.isArray(rawPresets)
        ? rawPresets
            .map((preset) => {
              if (!preset || typeof preset !== 'object') return null;
              return {
                label: safeText(preset.label),
                amount: formatMoney(preset.amount),
                enabled: Boolean(preset.enabled),
                isDefault: Boolean(preset.isDefault ?? preset.is_default),
              };
            })
            .filter((preset) => preset?.label)
        : [],
    ])
  );
};

const getDefaultDamageDepositPreset = (presets = []) => {
  const enabledPresets = Array.isArray(presets) ? presets.filter((preset) => preset?.enabled) : [];
  return enabledPresets.find((preset) => preset.isDefault) || enabledPresets[0] || null;
};

const getDamageDepositPresetsForLookup = (presetsByKey = {}, candidates = []) => {
  for (const candidate of candidates) {
    const directKey = String(candidate || '').trim();
    if (directKey && Array.isArray(presetsByKey[directKey])) {
      return presetsByKey[directKey];
    }
  }

  const normalizedCandidates = candidates.map((value) => normalizeLookupKey(value)).filter(Boolean);
  if (!normalizedCandidates.length) return [];

  for (const [key, presets] of Object.entries(presetsByKey || {})) {
    const normalizedKey = normalizeLookupKey(key);
    if (normalizedCandidates.includes(normalizedKey)) {
      return Array.isArray(presets) ? presets : [];
    }
  }

  return [];
};

const buildCertifiedListing = (vehicleRow, modelData) => {
  const hourlyPrice = formatMoney(vehicleRow?.hourly_rate ?? vehicleRow?.price ?? vehicleRow?.daily_rate);
  const dailyPrice = formatMoney(vehicleRow?.daily_rate ?? vehicleRow?.price);
  const category = normalizeCategory(vehicleRow?.vehicle_type, modelData);
  const brand = normalizeBrand(vehicleRow?.name, modelData);
  const model = normalizeModel(vehicleRow, modelData);
  const location = normalizeLocation(vehicleRow);
  const passengerCapacity = normalizePassengerCapacity(vehicleRow, modelData);
  const fuelIncluded = normalizeFuelIncluded(vehicleRow, modelData);
  const powerCc = normalizePowerCc(vehicleRow, modelData);

  return {
    id: `fleet-${vehicleRow.id}`,
    sourceId: vehicleRow.id,
    sourceType: 'vehicle',
    vehicleModelId: modelData?.id || vehicleRow?.vehicle_model_id || null,
    inventorySource: 'certified_fleet',
    bookingMode: 'instant',
    title: [brand, model].filter(Boolean).join(' ').trim(),
    brand,
    model,
    category,
    categoryKey: category.toLowerCase(),
    imageUrl: resolveCertifiedListingImage(vehicleRow, modelData),
    riderCapacity: passengerCapacity.max,
    riderCapacityMin: passengerCapacity.min,
    riderCapacityMax: passengerCapacity.max,
    riderCapacityLabel: passengerCapacity.label,
    powerCc: powerCc.value,
    powerCcLabel: powerCc.label,
    fuelIncludedLiters: fuelIncluded.liters,
    fuelIncludedLabel: fuelIncluded.label,
    shortSpec: [passengerCapacity.label || null, fuelIncluded.label ? `Fuel ${fuelIncluded.label}` : null, vehicleRow?.vehicle_type]
      .filter(Boolean)
      .join(' • '),
    description: safeText(vehicleRow?.description, `${brand} ${model} ready for direct booking from our certified fleet.`),
    location,
    priceFrom: hourlyPrice || dailyPrice,
    hourlyPrice,
    dailyPrice,
    depositAmount: formatMoney(vehicleRow?.security_deposit || vehicleRow?.deposit_amount),
    currencyCode: DEFAULT_CURRENCY,
    badge: 'Certified Fleet',
    ownerLabel: 'Managed by Sahara X',
    isAvailable: vehicleRow?.status === 'available' || !vehicleRow?.status,
    packageCatalog: { hourly: [], daily: [] },
    unlimitedRates: { hourly: hourlyPrice || 0, daily: dailyPrice || 0 },
    raw: vehicleRow,
  };
};

const buildMarketplaceListing = (listingRow) => {
  const profile = listingRow?.vehicle_public_profile || {};
  const pricing = listingRow?.pricing && typeof listingRow.pricing === 'object' ? listingRow.pricing : {};
  const halfDayPricing = pricing?.half_day && typeof pricing.half_day === 'object' ? pricing.half_day : {};
  const media = Array.isArray(profile?.media) ? profile.media : [];
  const coverImageUrl = profile?.cover_image_url || media.find((item) => item?.is_cover)?.url || media[0]?.url || '';
  const location = {
    country: safeText(profile?.country_name, 'Morocco'),
    city: safeText(profile?.city_name, 'Tangier'),
    area: safeText(profile?.area_name, profile?.location_name || 'Tangier'),
    label: [profile?.area_name, profile?.city_name].filter(Boolean).join(' - ') || 'Tangier',
  };

  const dailyPrice = formatMoney(listingRow?.daily_price_amount);
  const halfDayPrice = formatMoney(halfDayPricing?.price);
  const halfDayMinHours = Number(halfDayPricing?.min_hours || 0) || null;
  const halfDayMaxHours = Number(halfDayPricing?.max_hours || 0) || null;
  const distancePricing = pricing?.distance && typeof pricing.distance === 'object' ? pricing.distance : {};
  const canonicalVehicleTitle = [profile?.brand_name, profile?.model_name].filter(Boolean).join(' ').trim();

  return {
    id: `marketplace-${listingRow.id}`,
    sourceId: listingRow.id,
    vehiclePublicProfileId: listingRow.vehicle_public_profile_id || null,
    ownerId: listingRow.owner_id || null,
    sourceType: 'listing',
    inventorySource: 'marketplace',
    bookingMode: safeText(listingRow?.booking_mode, 'request'),
    listingStatus: normalizeMarketplaceStatus(listingRow?.listing_status, 'live'),
    reviewStatus: normalizeMarketplaceStatus(listingRow?.review_status, 'approved'),
    title: safeText(canonicalVehicleTitle || listingRow?.title, safeText(profile?.short_description, 'Marketplace Listing')),
    brand: safeText(profile?.brand_name, 'Marketplace'),
    model: safeText(profile?.model_name, 'Vehicle'),
    category: safeText(profile?.category_code, 'ATV'),
    categoryKey: safeText(profile?.category_code, 'atv').toLowerCase(),
    imageUrl: normalizeVehicleImageUrl(coverImageUrl) || '/assets/images/atv-placeholder.jpg',
    shortSpec: safeText(profile?.short_description, 'Verified marketplace vehicle'),
    description: safeText(profile?.full_description || profile?.short_description, 'Public listing available by request.'),
    location,
    priceFrom: dailyPrice || halfDayPrice || formatMoney(listingRow?.weekly_price_amount),
    hourlyPrice: 0,
    dailyPrice,
    halfDayPrice,
    halfDayMinHours,
    halfDayMaxHours,
    depositAmount: formatMoney(listingRow?.deposit_amount),
    includedKm: formatMoney(listingRow?.included_km ?? distancePricing?.included_km),
    extraKmRate: formatMoney(listingRow?.extra_km_rate ?? distancePricing?.extra_km_rate),
    currencyCode: safeText(listingRow?.currency_code, DEFAULT_CURRENCY),
    badge: listingRow?.owner_type === 'operator' ? 'Verified Operator' : 'Owner Listing',
    ownerLabel: listingRow?.owner_type === 'operator' ? 'Verified operator listing' : 'Independent owner listing',
    ownerDisplayName: safeText(profile?.owner_display_name),
    vehicleDocumentsVerified: Boolean(listingRow?.vehicle_documents_verified),
    riderCapacity: Number(profile?.seats || 0) || null,
    powerCc: Number(profile?.engine_cc || 0) || null,
    powerCcLabel: profile?.engine_cc ? `${profile.engine_cc}cc` : '',
    fuelPolicy: safeText(profile?.fuel_policy),
    transmission: safeText(profile?.transmission),
    media,
    isAvailable: normalizeMarketplaceStatus(listingRow?.listing_status, 'live') === 'live' && profile?.marketplace_visible !== false,
    detailHref: `/marketplace/marketplace-${listingRow.id}`,
    requestHref: `/marketplace/marketplace-${listingRow.id}/request`,
    boostScore: Number(listingRow?.boost_score || 0),
    boostRewards: Array.isArray(listingRow?.boost_rewards) ? listingRow.boost_rewards : [],
    raw: listingRow,
  };
};

const buildCertifiedModelAggregate = (baseListing, siblingListings = []) => {
  const pool = [baseListing, ...siblingListings].filter(Boolean);
  const availableUnits = pool.filter((item) => item.isAvailable);

  return {
    ...baseListing,
    isAvailable: availableUnits.length > 0,
    availableCount: availableUnits.length,
    totalModelCount: pool.length,
    pooledVehicleIds: pool.map((item) => item.sourceId).filter(Boolean),
  };
};

const getCertifiedFleetProviderByCity = (city) => {
  const key = safeText(city, 'Tangier').toLowerCase();
  return CERTIFIED_FLEET_CITY_PROVIDERS[key] || {
    city: safeText(city, 'Tangier'),
    providerName: 'Certified Fleet',
    providerMark: 'CF',
  };
};

const applyFilters = (listings, filters = {}) => {
  const {
    category = 'all',
    source = 'all',
    brand = 'all',
    city = 'all',
    country = 'all',
    area = 'all',
    bookingMode = 'all',
    search = '',
  } = filters;

  const normalizedSearch = safeText(search).toLowerCase();

  return listings.filter((listing) => {
    if (source !== 'all' && listing.inventorySource !== source) return false;
    if (category !== 'all' && listing.categoryKey !== safeText(category).toLowerCase()) return false;
    if (brand !== 'all' && safeText(listing.brand).toLowerCase() !== safeText(brand).toLowerCase()) return false;
    if (country !== 'all' && safeText(listing.location?.country).toLowerCase() !== safeText(country).toLowerCase()) return false;
    if (city !== 'all' && safeText(listing.location?.city).toLowerCase() !== safeText(city).toLowerCase()) return false;
    if (area !== 'all' && safeText(listing.location?.area).toLowerCase() !== safeText(area).toLowerCase()) return false;
    if (bookingMode !== 'all' && listing.bookingMode !== bookingMode) return false;

    if (
      normalizedSearch &&
      ![listing.title, listing.brand, listing.model, listing.category, listing.location?.label]
        .filter(Boolean)
        .some((value) => safeText(value).toLowerCase().includes(normalizedSearch))
    ) {
      return false;
    }

    return true;
  });
};

const fetchCertifiedFleet = async (adminClient) => {
  const { data, error } = await adminClient
    .from('saharax_0u4w4d_vehicles')
    .select('*')
    .not('organization_id', 'is', null)
    .is('owner_user_id', null)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const vehicles = data || [];
  const vehicleModelIds = [...new Set(vehicles.map((vehicle) => vehicle.vehicle_model_id).filter(Boolean))];

  const { data: modelRows, error: modelError } = vehicleModelIds.length > 0
    ? await adminClient
        .from('saharax_0u4w4d_vehicle_models')
        .select('*')
    : { data: [], error: null };

  if (modelError) throw modelError;
  const modelLookups = buildVehicleModelLookups(modelRows || []);

  let basePricesByModelId = new Map();
  if (vehicleModelIds.length > 0) {
    const { data: basePriceRows, error: basePriceError } = await adminClient
      .from('app_4c3a7a6153_base_prices')
      .select('*')
      .in('vehicle_model_id', vehicleModelIds)
      .eq('is_active', true);

    if (basePriceError) throw basePriceError;
    basePricesByModelId = new Map((basePriceRows || []).map((row) => [String(row.vehicle_model_id), row]));
  }

  let packageRows = [];
  if (vehicleModelIds.length > 0) {
    const { data: packageData, error: packageError } = await adminClient
      .from('app_4c3a7a6153_rental_km_packages')
      .select('*, rate_types(name)')
      .in('vehicle_model_id', vehicleModelIds)
      .eq('is_active', true)
      .order('fixed_amount', { ascending: true });

    if (packageError) throw packageError;
    packageRows = packageData || [];
  }

  let fuelPricingByModelId = new Map();
  if (vehicleModelIds.length > 0) {
    try {
      const fuelPricingRows = await loadOptionalQuery(
        () =>
          adminClient
            .from('fuel_pricing')
            .select('model_id, price_per_line, hourly_price_per_line, daily_price_per_line')
            .in('model_id', vehicleModelIds),
        []
      );
      fuelPricingByModelId = new Map((fuelPricingRows || []).map((row) => [String(row.model_id), row]));
    } catch {
      fuelPricingByModelId = new Map();
    }
  }

  let damageDepositPresetsByModelId = {};
  const { data: appSettingsData, error: appSettingsError } = await adminClient
    .from('app_settings')
    .select('damage_deposit_presets')
    .eq('id', 1)
    .maybeSingle();

  if (appSettingsError) throw appSettingsError;
  if (appSettingsData?.damage_deposit_presets) {
    damageDepositPresetsByModelId = normalizeDamageDepositPresets(appSettingsData.damage_deposit_presets);
  }

  const packagesByModelId = new Map();
  packageRows.forEach((pkg) => {
    const key = String(pkg.vehicle_model_id);
    const current = packagesByModelId.get(key) || { hourly: [], daily: [] };
    const rateName = safeText(pkg?.rate_types?.name).toLowerCase();
    const bucket = rateName.includes('day') || Number(pkg?.rate_type_id) === 2 ? 'daily' : 'hourly';

    current[bucket].push({
      id: pkg.id,
      name: safeText(pkg.name, `${bucket === 'hourly' ? 'Hourly' : 'Daily'} package`),
      displayName: formatPackageAllowanceLabel(pkg, bucket),
      fixedAmount: formatMoney(pkg.fixed_amount),
      includedKilometers: formatMoney(pkg.included_kilometers),
      extraKmRate: formatMoney(pkg.extra_km_rate),
      fuelChargeEnabled: pkg.fuel_charge_enabled === true,
      fuel_charge_enabled: pkg.fuel_charge_enabled === true,
      kind: pkg.included_kilometers ? 'limited' : 'unlimited',
      durationUnits: Number(pkg.duration_units),
      showOnPrint: pkg.show_on_print === true,
    });

    packagesByModelId.set(key, current);
  });

  return vehicles.map((vehicle) => {
    const modelData = inferVehicleModelData(vehicle, modelLookups);
    if (shouldHideCertifiedFleetVehicle(vehicle, modelData)) {
      return null;
    }

    const modelId = String(modelData?.id || vehicle.vehicle_model_id || '');
    const listing = buildCertifiedListing(vehicle, modelData);
    const basePrices = basePricesByModelId.get(modelId);
    const packageCatalog = packagesByModelId.get(modelId) || { hourly: [], daily: [] };
    const fuelPricing = fuelPricingByModelId.get(modelId) || null;
    const damageDepositPresets = getDamageDepositPresetsForLookup(damageDepositPresetsByModelId, [
      modelId,
      modelData?.id,
      modelData?.model,
      modelData?.name,
      [modelData?.name, modelData?.model].filter(Boolean).join(' '),
      vehicle?.vehicle_model_id,
      vehicle?.model,
      vehicle?.name,
      [vehicle?.name, vehicle?.model].filter(Boolean).join(' '),
    ]);
    const defaultDamageDepositPreset = getDefaultDamageDepositPreset(damageDepositPresets);

    const enrichedListing = {
      ...listing,
      hourlyPrice: formatMoney(basePrices?.hourly_price ?? listing.hourlyPrice),
      dailyPrice: formatMoney(basePrices?.daily_price ?? listing.dailyPrice),
      priceFrom: formatMoney(basePrices?.hourly_price ?? basePrices?.daily_price ?? listing.priceFrom),
      unlimitedRates: {
        hourly: formatMoney(basePrices?.hourly_price ?? listing.hourlyPrice),
        daily: formatMoney(basePrices?.daily_price ?? listing.dailyPrice),
      },
      fuelLineChargeHourly: formatMoney(fuelPricing?.hourly_price_per_line ?? fuelPricing?.price_per_line),
      fuelLineChargeDaily: formatMoney(fuelPricing?.daily_price_per_line ?? fuelPricing?.price_per_line),
      depositAmount: defaultDamageDepositPreset?.amount ?? listing.depositAmount,
      defaultDamageDepositPreset,
      packageCatalog,
    };

    return shouldHideCertifiedFleetListing(enrichedListing) ? null : enrichedListing;
  }).filter(Boolean);
};

const fetchMarketplaceListings = async (adminClient, tenantScope = null) => {
  try {
    let listingsQuery = adminClient
      .from('app_marketplace_listings')
      .select('*')
      .eq('listing_status', 'live')
      .limit(48);

    if (tenantScope?.isShared && tenantScope.organizationId) {
      listingsQuery = listingsQuery.eq('organization_id', tenantScope.organizationId);
    }

    const { data: listingRows, error } = await listingsQuery;

    if (error) throw error;

    const rows = listingRows || [];
    const profileIds = [...new Set(rows.map((row) => row.vehicle_public_profile_id).filter(Boolean))];

    let profilesById = new Map();
    let profileRows = [];
    if (profileIds.length > 0) {
      const { data: loadedProfileRows, error: profileError } = await adminClient
        .from('app_vehicle_public_profiles')
        .select('*')
        .in('id', profileIds);

      if (profileError) throw profileError;
      profileRows = loadedProfileRows || [];
      profilesById = new Map((profileRows || []).map((row) => [String(row.id), row]));
    }

    const vehicleVerificationLookupIds = [...new Set(
      profileRows.flatMap((profile) => getVehicleVerificationLookupIds(profile))
    )];
    const vehicleVerificationRows = vehicleVerificationLookupIds.length > 0
      ? await loadOptionalQuery(
          () =>
            adminClient
              .from(VERIFICATION_REQUESTS_TABLE)
              .select('entity_id, verification_type, status, expires_at')
              .eq('entity_type', 'vehicle')
              .in('entity_id', vehicleVerificationLookupIds)
              .in('verification_type', VEHICLE_DOCUMENT_VERIFICATION_TYPES)
              .eq('status', 'approved'),
          []
        )
      : [];
    const verifiedDocumentsByEntityId = buildVehicleDocumentVerificationMap(vehicleVerificationRows);

    const listingIds = rows.map((row) => row.id).filter(Boolean);
    const activeBoostRows = listingIds.length > 0
      ? await loadOptionalQuery(
          () =>
            adminClient
              .from(BOOST_REDEMPTIONS_TABLE)
              .select('listing_id, reward_id, status, ends_at')
              .in('listing_id', listingIds)
              .eq('status', 'active'),
          []
        )
      : [];

    const boostsByListingId = new Map();
    for (const boostRow of activeBoostRows || []) {
      if (boostRow?.ends_at && new Date(boostRow.ends_at).getTime() <= Date.now()) continue;
      const key = String(boostRow.listing_id || '');
      if (!key) continue;
      const current = boostsByListingId.get(key) || [];
      current.push(String(boostRow.reward_id || '').trim());
      boostsByListingId.set(key, current);
    }

    const getBoostScore = (rewardIds = []) =>
      rewardIds.reduce((sum, rewardId) => {
        if (rewardId === 'top_boost_48h') return sum + 50;
        if (rewardId === 'featured_row_24h') return sum + 30;
        if (rewardId === 'highlight_badge_7d') return sum + 20;
        return sum;
      }, 0);

    return rows
      .filter((row) => normalizeMarketplaceStatus(row?.listing_status || row?.status, 'live') === 'live')
      .map((row) =>
        buildMarketplaceListing({
          ...row,
          boost_rewards: boostsByListingId.get(String(row.id)) || [],
          boost_score: getBoostScore(boostsByListingId.get(String(row.id)) || []),
          vehicle_public_profile: profilesById.get(String(row.vehicle_public_profile_id)) || {},
          vehicle_documents_verified: hasVerifiedVehicleDocuments(
            profilesById.get(String(row.vehicle_public_profile_id)) || {},
            verifiedDocumentsByEntityId
          ),
        })
      )
      .filter((listing) => listing.isAvailable);
  } catch {
    return [];
  }
};

const buildCatalog = async (adminClient, filters = {}, tenantScope = null) => {
  const [certifiedFleet, marketplace] = await Promise.all([
    tenantScope?.isShared ? [] : fetchCertifiedFleet(adminClient),
    fetchMarketplaceListings(adminClient, tenantScope),
  ]);

  const allListings = [...certifiedFleet, ...marketplace];
  const filteredListings = applyFilters(allListings, filters);
  const sortWeight = { certified_fleet: 0, marketplace: 1 };

  filteredListings.sort((left, right) => {
    const boostDiff = Number(right.boostScore || 0) - Number(left.boostScore || 0);
    if (boostDiff !== 0) return boostDiff;
    const sourceDiff = (sortWeight[left.inventorySource] ?? 99) - (sortWeight[right.inventorySource] ?? 99);
    if (sourceDiff !== 0) return sourceDiff;
    if (right.isAvailable !== left.isAvailable) return Number(right.isAvailable) - Number(left.isAvailable);
    return (left.priceFrom || 0) - (right.priceFrom || 0);
  });

  const optionSet = {
    brands: new Set(),
    cities: new Set(),
    countries: new Set(),
    areas: new Set(),
    categories: new Set(),
  };

  allListings.forEach((listing) => {
    if (listing.brand) optionSet.brands.add(listing.brand);
    if (listing.location?.country) optionSet.countries.add(listing.location.country);
    if (listing.location?.city) optionSet.cities.add(listing.location.city);
    if (listing.location?.area) optionSet.areas.add(listing.location.area);
    if (listing.categoryKey) optionSet.categories.add(listing.categoryKey);
  });

  return {
    listings: filteredListings,
    featuredListings: [...allListings]
      .sort((left, right) => Number(right.boostScore || 0) - Number(left.boostScore || 0))
      .slice(0, 6),
    filters: {
      brands: Array.from(optionSet.brands).sort(),
      countries: Array.from(optionSet.countries).sort(),
      cities: Array.from(optionSet.cities).sort(),
      areas: Array.from(optionSet.areas).sort(),
      categories: Array.from(optionSet.categories).sort(),
    },
    regionalSummary: {
      defaultCurrency: DEFAULT_CURRENCY,
      supportedLanguages: ['EN', 'FR', 'AR'],
      countries: Array.from(optionSet.countries).sort(),
      citiesCount: optionSet.cities.size,
      areasCount: optionSet.areas.size,
    },
  };
};

const getListingById = async (adminClient, listingId, cityOverride, tenantScope = null) => {
  const catalog = await buildCatalog(adminClient, {}, tenantScope);
  const directMatch = catalog.listings.find((listing) => listing.id === listingId)
    || catalog.featuredListings.find((listing) => listing.id === listingId)
    || null;

  if (!directMatch) return null;
  if (directMatch.inventorySource !== 'certified_fleet') return directMatch;

  const normalizedCityOverride = safeText(cityOverride);
  const effectiveCity = normalizedCityOverride || safeText(directMatch.location?.city);
  const locationOverride = normalizedCityOverride
    ? {
        ...directMatch.location,
        city: normalizedCityOverride,
        area: normalizedCityOverride,
        label: normalizedCityOverride,
      }
    : directMatch.location;

  const siblings = catalog.featuredListings.filter((listing) => {
    if (listing.id === directMatch.id) return false;
    if (listing.inventorySource !== 'certified_fleet') return false;

    const sameModel =
      String(listing.vehicleModelId || '') === String(directMatch.vehicleModelId || '') ||
      safeText(listing.model).toLowerCase() === safeText(directMatch.model).toLowerCase();
    const sameCity = safeText(listing.location?.city).toLowerCase() === effectiveCity.toLowerCase();

    return sameModel && sameCity;
  });

  let latestDefaultDamageDepositPreset = directMatch.defaultDamageDepositPreset || null;
  try {
    const { data: appSettingsData } = await adminClient
      .from('app_settings')
      .select('damage_deposit_presets')
      .eq('id', 1)
      .maybeSingle();

    const normalizedPresets = normalizeDamageDepositPresets(appSettingsData?.damage_deposit_presets);
    latestDefaultDamageDepositPreset = getDefaultDamageDepositPreset(
      getDamageDepositPresetsForLookup(normalizedPresets, [
        directMatch.vehicleModelId,
        directMatch.model,
        directMatch.brand,
        [directMatch.brand, directMatch.model].filter(Boolean).join(' '),
        directMatch.title,
        directMatch.raw?.vehicle_model_id,
        directMatch.raw?.model,
        directMatch.raw?.name,
        [directMatch.raw?.name, directMatch.raw?.model].filter(Boolean).join(' '),
      ])
    ) || latestDefaultDamageDepositPreset;
  } catch {
    // keep catalog-derived value
  }

  return buildCertifiedModelAggregate(
    {
      ...directMatch,
      location: locationOverride,
      depositAmount: latestDefaultDamageDepositPreset?.amount ?? directMatch.depositAmount,
      defaultDamageDepositPreset: latestDefaultDamageDepositPreset,
    },
    siblings
  );
};

const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600');
  res.end(JSON.stringify(body));
};

export default async function publicCatalogHandler(req, res) {
  try {
    const { adminClient } = createSupabaseClients();
    const tenantScope = await resolveRequestTenantScope({ req, adminClient });
    const action = String(req.query?.action || 'catalog').trim().toLowerCase();

    if (req.method !== 'GET') {
      return json(res, 405, { error: 'Method not allowed' });
    }

    if (action === 'listing') {
      const listingId = safeText(req.query?.listingId);
      const city = safeText(req.query?.city);
      if (!listingId) {
        return json(res, 400, { error: 'Missing listingId' });
      }

      const listing = await getListingById(adminClient, listingId, city, tenantScope);
      if (!listing) {
        return json(res, 404, { error: 'Listing not found' });
      }

      return json(res, 200, { listing });
    }

    if (action === 'provider') {
      const city = safeText(req.query?.city, 'Tangier');
      return json(res, 200, { provider: getCertifiedFleetProviderByCity(city) });
    }

    const filters = {
      category: safeText(req.query?.category, 'all'),
      source: safeText(req.query?.source, 'all'),
      brand: safeText(req.query?.brand, 'all'),
      city: safeText(req.query?.city, 'all'),
      country: safeText(req.query?.country, 'all'),
      area: safeText(req.query?.area, 'all'),
      bookingMode: safeText(req.query?.bookingMode, 'all'),
      search: safeText(req.query?.search, ''),
    };

    const catalog = await buildCatalog(adminClient, filters, tenantScope);
    return json(res, 200, catalog);
  } catch (error) {
    return json(res, 500, { error: error?.message || 'Failed to load public catalog' });
  }
}
