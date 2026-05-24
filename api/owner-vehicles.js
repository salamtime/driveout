import { APP_USERS_TABLE, VEHICLES_TABLE } from './_lib/supabase.js';
import { authenticateRequest } from './_lib/auth.js';
import {
  applyTenantQueryScope,
  assertUserInTenantScope,
  resolveRequestTenantScope,
  stampTenantPayload,
} from './_lib/sharedTenantIsolation.js';

const VEHICLE_PROFILES_TABLE = 'app_vehicle_public_profiles';
const MARKETPLACE_LISTINGS_TABLE = 'app_marketplace_listings';
const BOOKING_REQUESTS_TABLE = 'app_booking_requests';
const RENTALS_TABLE = 'app_4c3a7a6153_rentals';
const setupErrorCodes = new Set(['42P01', '42501', '42703', '22P02', 'PGRST116', 'PGRST204']);
const REQUIRED_PROFILE_COLUMNS = new Set([
  'brand_name',
  'model_name',
  'year',
  'city_name',
  'country_name',
]);

const json = (res, status, body) => res.status(status).json(body);
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

const pickFirstRow = (data) => (
  Array.isArray(data) ? (data[0] || null) : (data || null)
);

const runFirstRowQuery = async (queryPromise) => {
  const { data, error } = await queryPromise;
  return {
    data: pickFirstRow(data),
    error,
  };
};

const optionalNumber = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
};

const optionalInteger = (value) => {
  const next = optionalNumber(value);
  return next === null ? null : Math.trunc(next);
};

const validateDistancePricing = (formData = {}) => {
  const includedKilometers = optionalNumber(formData.mileageLimitKm);
  const extraKilometerRate = optionalNumber(formData.extraKmRate);

  if (includedKilometers !== null && includedKilometers <= 0) {
    return 'Included kilometers must be greater than 0, or leave it empty for unlimited kilometers.';
  }
  if (extraKilometerRate !== null && extraKilometerRate <= 0) {
    return 'Extra kilometer rate must be greater than 0, or leave it empty when not applied.';
  }
  if (includedKilometers !== null && includedKilometers > 0 && (extraKilometerRate === null || extraKilometerRate <= 0)) {
    return 'Add the extra kilometer rate in MAD/km for kilometers beyond the included amount.';
  }
  if ((includedKilometers === null || includedKilometers <= 0) && extraKilometerRate !== null && extraKilometerRate > 0) {
    return 'Add included kilometers before setting an extra kilometer rate.';
  }

  return '';
};

const optionalDateString = (value) => {
  const next = String(value || '').trim();
  return next || null;
};

const toStringArray = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
};

const toArrayMedia = (media) => {
  if (!Array.isArray(media)) return [];
  return media
    .filter((item) => item?.url)
    .map((item, index) => ({
      id: item.id || `media-${index + 1}`,
      url: String(item.url || '').trim(),
      type: item.type || 'image',
      name: item.name || `Image ${index + 1}`,
      is_cover: Boolean(item.is_cover),
      shot_type: String(item.shot_type || item.shotType || '').trim().toLowerCase() || null,
      quality_status: String(item.quality_status || item.qualityStatus || '').trim().toLowerCase() || null,
    }));
};

const normalizeStatus = (status) => {
  const normalized = String(status || 'draft').trim().toLowerCase();
  const aliases = {
    pending: 'pending_review',
    active: 'live',
    published: 'live',
    hidden: 'unpublished',
    inactive: 'unpublished',
  };
  return aliases[normalized] || normalized;
};

const getMissingSchemaColumn = (error) => {
  const message = String(error?.message || error?.details || '');
  const singleQuoteMatch = message.match(/'([^']+)'\s+column/i);
  if (singleQuoteMatch?.[1]) return singleQuoteMatch[1];
  const doubleQuoteMatch = message.match(/column "([^"]+)"/i);
  return doubleQuoteMatch?.[1] || null;
};

const getNotNullSchemaColumn = (error) => {
  const message = String(error?.message || error?.details || '');
  const match = message.match(/null value in column "([^"]+)"/i);
  return match?.[1] || null;
};

const isUuidLike = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());

const getLegacyVehicleRefId = ({ ownerId, formData }) => {
  const existingRef = formData?.rawProfile?.vehicle_ref_id || formData?.vehicleRefId;
  if (existingRef) return existingRef;
  const visibleRef = String(formData?.plateNumber || `${formData?.brandName || 'vehicle'}-${formData?.modelName || ''}`)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `owner-${String(ownerId || 'vehicle').slice(0, 8)}-${visibleRef || Date.now()}`;
};

const getLegacyMarketplaceColumnValue = ({ column, ownerId, formData }) => {
  const legacyValues = {
    vehicle_ref_id: getLegacyVehicleRefId({ ownerId, formData }),
    source_type: 'owner_marketplace',
    source: 'owner_marketplace',
  };
  return legacyValues[column];
};

const buildFleetVehiclePayload = (formData = {}, fallbackName = '', ownerId = null) => ({
  name:
    String(formData.vehicleDisplayName || '').trim() ||
    String(fallbackName || '').trim() ||
    [formData.brandName, formData.modelName].filter(Boolean).join(' ').trim() ||
    'Owner vehicle',
  owner_user_id: ownerId || null,
  model: String(formData.modelName || '').trim() || null,
  vehicle_type: String(formData.categoryCode || 'atv').trim() || 'atv',
  plate_number: String(formData.plateNumber || '').trim() || null,
  image_url: String(formData.coverImageUrl || '').trim() || null,
  power_cc: optionalInteger(formData.engineCc),
  capacity: optionalInteger(formData.seats),
  color: String(formData.color || '').trim() || null,
  status: String(formData.fleetStatus || 'pending_review').trim() || 'pending_review',
  features: toStringArray(formData.extras),
  current_odometer: optionalNumber(formData.currentOdometer),
  engine_hours: optionalNumber(formData.engineHours),
  last_oil_change_date: optionalDateString(formData.lastOilChangeDate),
  last_oil_change_odometer: optionalNumber(formData.lastOilChangeOdometer),
  next_oil_change_due: optionalDateString(formData.nextOilChangeDue),
  next_oil_change_odometer: optionalNumber(formData.nextOilChangeOdometer),
  registration_number: String(formData.registrationNumber || '').trim() || null,
  registration_date: optionalDateString(formData.registrationDate),
  registration_expiry_date: optionalDateString(formData.registrationExpiryDate),
  insurance_policy_number: String(formData.insurancePolicyNumber || '').trim() || null,
  insurance_provider: String(formData.insuranceProvider || '').trim() || null,
  insurance_expiry_date: optionalDateString(formData.insuranceExpiryDate),
  purchase_cost_mad: optionalNumber(formData.purchaseCostMad),
  purchase_date: optionalDateString(formData.purchaseDate),
  purchase_supplier: String(formData.purchaseSupplier || '').trim() || null,
  purchase_invoice_url: String(formData.purchaseInvoiceUrl || '').trim() || null,
  general_notes: String(formData.shortDescription || '').trim() || null,
  notes: String(formData.fullDescription || '').trim() || null,
});

const resolveLinkedFleetVehicleId = (profile = {}, formData = null) => {
  const directId =
    profile?.linked_fleet_vehicle_id ||
    profile?.fleet_vehicle_id ||
    profile?.vehicle_ref_id ||
    formData?.vehicleRefId ||
    formData?.rawFleetVehicle?.id ||
    null;

  if (directId === null || directId === undefined || directId === '') {
    return null;
  }

  const numericId = Number(directId);
  if (Number.isFinite(numericId)) {
    return numericId;
  }

  return String(directId || '').trim() || null;
};

const fetchLinkedFleetVehicleRecord = async ({ adminClient, profile, ownerId, tenantScope = null }) => {
  const linkedFleetVehicleId = resolveLinkedFleetVehicleId(profile);
  if (linkedFleetVehicleId) {
    const { data, error } = await applyTenantQueryScope(
      adminClient
        .from(VEHICLES_TABLE)
        .select('*')
        .eq('id', linkedFleetVehicleId)
        .maybeSingle(),
      tenantScope
    );

    if (!error && data) {
      return data;
    }

    const { data: legacyData, error: legacyError } = await adminClient
      .from(VEHICLES_TABLE)
      .select('*')
      .eq('id', linkedFleetVehicleId)
      .eq('owner_user_id', ownerId)
      .maybeSingle();

    if (!legacyError && legacyData) {
      return legacyData;
    }
  }

  const fallbackPlateNumber = String(profile?.plate_number || '').trim();
  if (!fallbackPlateNumber || !ownerId) {
    return null;
  }

  const { data, error } = await runFirstRowQuery(
    applyTenantQueryScope(
      adminClient
        .from(VEHICLES_TABLE)
        .select('*')
        .eq('plate_number', fallbackPlateNumber)
        .eq('owner_user_id', ownerId)
        .order('updated_at', { ascending: false })
        .limit(1),
      tenantScope
    )
  );

  if (error) {
    const { data: legacyVehicle, error: legacyVehicleError } = await runFirstRowQuery(
      adminClient
        .from(VEHICLES_TABLE)
        .select('*')
        .eq('plate_number', fallbackPlateNumber)
        .eq('owner_user_id', ownerId)
        .order('updated_at', { ascending: false })
        .limit(1)
    );

    return legacyVehicleError ? null : legacyVehicle || null;
  }

  if (data) return data;

  const { data: legacyVehicle, error: legacyVehicleError } = await runFirstRowQuery(
    adminClient
      .from(VEHICLES_TABLE)
      .select('*')
      .eq('plate_number', fallbackPlateNumber)
      .eq('owner_user_id', ownerId)
      .order('updated_at', { ascending: false })
      .limit(1)
  );

  return legacyVehicleError ? null : legacyVehicle || null;
};

const loadOwnerProfileByFleetVehicle = async ({ adminClient, ownerId, fleetVehicleId, tenantScope = null }) => {
  const numericFleetVehicleId = Number(fleetVehicleId);
  if (!ownerId || !Number.isFinite(numericFleetVehicleId)) {
    return null;
  }

  const { data: fleetVehicle, error: fleetVehicleError } = await applyTenantQueryScope(
    adminClient
      .from(VEHICLES_TABLE)
      .select('id, owner_user_id, plate_number')
      .eq('id', numericFleetVehicleId)
      .eq('owner_user_id', ownerId)
      .maybeSingle(),
    tenantScope
  );

  let resolvedFleetVehicle = fleetVehicle || null;

  if (fleetVehicleError || !resolvedFleetVehicle?.id) {
    const { data: legacyFleetVehicle, error: legacyFleetVehicleError } = await adminClient
      .from(VEHICLES_TABLE)
      .select('id, owner_user_id, plate_number')
      .eq('id', numericFleetVehicleId)
      .eq('owner_user_id', ownerId)
      .maybeSingle();

    if (legacyFleetVehicleError || !legacyFleetVehicle?.id) {
      return null;
    }

    resolvedFleetVehicle = legacyFleetVehicle;
  }

  const { data: profileByRef, error: profileByRefError } = await runFirstRowQuery(
    applyTenantQueryScope(
      adminClient
        .from(VEHICLE_PROFILES_TABLE)
        .select('*')
        .eq('owner_id', ownerId)
        .eq('vehicle_ref_id', String(resolvedFleetVehicle.id))
        .order('updated_at', { ascending: false })
        .limit(1),
      tenantScope
    )
  );

  if (profileByRefError && !setupErrorCodes.has(String(profileByRefError.code || ''))) {
    throw profileByRefError;
  }

  if (profileByRef?.id) {
    return { profile: profileByRef, fleetVehicle: resolvedFleetVehicle };
  }

  const plateNumber = String(resolvedFleetVehicle.plate_number || '').trim();
  if (!plateNumber) {
    return { profile: null, fleetVehicle: resolvedFleetVehicle };
  }

  const { data: profileByPlate, error: profileByPlateError } = await runFirstRowQuery(
    applyTenantQueryScope(
      adminClient
        .from(VEHICLE_PROFILES_TABLE)
        .select('*')
        .eq('owner_id', ownerId)
        .eq('plate_number', plateNumber)
        .order('updated_at', { ascending: false })
        .limit(1),
      tenantScope
    )
  );

  if (profileByPlateError && !setupErrorCodes.has(String(profileByPlateError.code || ''))) {
    throw profileByPlateError;
  }

  return {
    profile: profileByPlate || null,
    fleetVehicle: resolvedFleetVehicle,
  };
};

const loadOwnerProfileByListingId = async ({ adminClient, ownerId, listingId, tenantScope = null }) => {
  const normalizedListingId = String(listingId || '').trim();
  if (!ownerId || !normalizedListingId) {
    return null;
  }

  let { data: listing, error: listingError } = await applyTenantQueryScope(
    adminClient
      .from(MARKETPLACE_LISTINGS_TABLE)
      .select('*')
      .eq('owner_id', ownerId)
      .eq('id', normalizedListingId)
      .maybeSingle(),
    tenantScope
  );

  if (listingError && !setupErrorCodes.has(String(listingError.code || ''))) {
    throw listingError;
  }

  if (!listing?.id) {
    const tenantScopedListing = await applyTenantQueryScope(
      adminClient
        .from(MARKETPLACE_LISTINGS_TABLE)
        .select('*')
        .eq('id', normalizedListingId)
        .maybeSingle(),
      tenantScope
    );

    if (tenantScopedListing.error && !setupErrorCodes.has(String(tenantScopedListing.error.code || ''))) {
      throw tenantScopedListing.error;
    }

    listing = tenantScopedListing.data || null;
  }

  const profileId = String(listing?.vehicle_public_profile_id || '').trim();
  if (!profileId) {
    return null;
  }

  const { data: profile, error: profileError } = await applyTenantQueryScope(
    adminClient
      .from(VEHICLE_PROFILES_TABLE)
      .select('*')
      .eq('id', profileId)
      .maybeSingle(),
    tenantScope
  );

  if (profileError && !setupErrorCodes.has(String(profileError.code || ''))) {
    throw profileError;
  }

  if (!profile?.id) {
    return null;
  }

  return {
    profile,
    listing,
    fleetVehicle: null,
  };
};

const loadLatestListingForProfile = async ({ adminClient, ownerId, profileId, tenantScope = null }) => {
  const normalizedProfileId = String(profileId || '').trim();
  if (!normalizedProfileId) {
    return null;
  }

  const ownerScopedResult = await runFirstRowQuery(
    applyTenantQueryScope(
      adminClient
        .from(MARKETPLACE_LISTINGS_TABLE)
        .select('*')
        .eq('owner_id', ownerId)
        .eq('vehicle_public_profile_id', normalizedProfileId)
        .order('updated_at', { ascending: false })
        .limit(1),
      tenantScope
    )
  );

  if (ownerScopedResult.error && !setupErrorCodes.has(String(ownerScopedResult.error.code || ''))) {
    throw ownerScopedResult.error;
  }

  if (ownerScopedResult.data?.id) {
    return ownerScopedResult.data;
  }

  const tenantScopedResult = await runFirstRowQuery(
    applyTenantQueryScope(
      adminClient
        .from(MARKETPLACE_LISTINGS_TABLE)
        .select('*')
        .eq('vehicle_public_profile_id', normalizedProfileId)
        .order('updated_at', { ascending: false })
        .limit(1),
      tenantScope
    )
  );

  if (tenantScopedResult.error && !setupErrorCodes.has(String(tenantScopedResult.error.code || ''))) {
    throw tenantScopedResult.error;
  }

  return tenantScopedResult.data || null;
};

const loadOwnerProfileByRequestId = async ({ adminClient, ownerId, requestId, tenantScope = null }) => {
  const normalizedRequestId = String(requestId || '').trim();
  if (!ownerId || !normalizedRequestId) {
    return null;
  }

  let { data: requestRow, error: requestError } = await applyTenantQueryScope(
    adminClient
      .from(BOOKING_REQUESTS_TABLE)
      .select('id, owner_id, listing_id, vehicle_public_profile_id')
      .eq('owner_id', ownerId)
      .eq('id', normalizedRequestId)
      .maybeSingle(),
    tenantScope
  );

  if (requestError && !setupErrorCodes.has(String(requestError.code || ''))) {
    throw requestError;
  }

  if (!requestRow?.id) {
    const tenantScopedRequest = await applyTenantQueryScope(
      adminClient
        .from(BOOKING_REQUESTS_TABLE)
        .select('id, owner_id, listing_id, vehicle_public_profile_id')
        .eq('id', normalizedRequestId)
        .maybeSingle(),
      tenantScope
    );

    if (tenantScopedRequest.error && !setupErrorCodes.has(String(tenantScopedRequest.error.code || ''))) {
      throw tenantScopedRequest.error;
    }

    requestRow = tenantScopedRequest.data || null;
  }

  const requestProfileId = String(requestRow?.vehicle_public_profile_id || '').trim();
  if (requestProfileId) {
    const { data: profile, error: profileError } = await applyTenantQueryScope(
      adminClient
        .from(VEHICLE_PROFILES_TABLE)
        .select('*')
        .eq('id', requestProfileId)
        .maybeSingle(),
      tenantScope
    );

    if (profileError && !setupErrorCodes.has(String(profileError.code || ''))) {
      throw profileError;
    }

    if (profile?.id) {
      return {
        profile,
        listing: null,
        fleetVehicle: null,
      };
    }
  }

  const requestListingId = String(requestRow?.listing_id || '').trim();
  if (requestListingId) {
    return loadOwnerProfileByListingId({
      adminClient,
      ownerId,
      listingId: requestListingId,
      tenantScope,
    });
  }

  return null;
};

const loadOwnerProfileByRentalId = async ({ adminClient, ownerId, rentalId, tenantScope = null }) => {
  const normalizedRentalId = String(rentalId || '').trim();
  if (!ownerId || !normalizedRentalId) {
    return null;
  }

  let { data: rentalRow, error: rentalError } = await applyTenantQueryScope(
    adminClient
      .from(RENTALS_TABLE)
      .select('id, vehicle_id')
      .eq('id', normalizedRentalId)
      .maybeSingle(),
    tenantScope
  );

  if (rentalError && !setupErrorCodes.has(String(rentalError.code || ''))) {
    throw rentalError;
  }

  if (!rentalRow?.id) {
    return null;
  }

  if (!rentalRow?.vehicle_id) {
    return null;
  }

  return loadOwnerProfileByFleetVehicle({
    adminClient,
    ownerId,
    fleetVehicleId: rentalRow.vehicle_id,
    tenantScope,
  });
};

const resolveOwnerProfileRecord = async ({ adminClient, ownerId, vehicleId, tenantScope = null }) => {
  const normalizedVehicleId = String(vehicleId || '').trim();
  if (!ownerId || !normalizedVehicleId) {
    return null;
  }

  const { data: directProfile, error: directProfileError } = await applyTenantQueryScope(
    adminClient
      .from(VEHICLE_PROFILES_TABLE)
      .select('*')
      .eq('owner_id', ownerId)
      .eq('id', normalizedVehicleId)
      .maybeSingle(),
    tenantScope
  );

  if (directProfileError && !setupErrorCodes.has(String(directProfileError.code || ''))) {
    throw directProfileError;
  }

  if (directProfile?.id) {
    return {
      profile: directProfile,
      fleetVehicle: null,
    };
  }

  const { data: tenantScopedProfile, error: tenantScopedProfileError } = await applyTenantQueryScope(
    adminClient
      .from(VEHICLE_PROFILES_TABLE)
      .select('*')
      .eq('id', normalizedVehicleId)
      .maybeSingle(),
    tenantScope
  );

  if (tenantScopedProfileError && !setupErrorCodes.has(String(tenantScopedProfileError.code || ''))) {
    throw tenantScopedProfileError;
  }

  if (tenantScopedProfile?.id) {
    return {
      profile: tenantScopedProfile,
      fleetVehicle: null,
    };
  }

  const requestResolution = await loadOwnerProfileByRequestId({
    adminClient,
    ownerId,
    requestId: normalizedVehicleId,
    tenantScope,
  });

  if (requestResolution?.profile?.id) {
    return requestResolution;
  }

  const listingResolution = await loadOwnerProfileByListingId({
    adminClient,
    ownerId,
    listingId: normalizedVehicleId,
    tenantScope,
  });

  if (listingResolution?.profile?.id) {
    return listingResolution;
  }

  const rentalResolution = await loadOwnerProfileByRentalId({
    adminClient,
    ownerId,
    rentalId: normalizedVehicleId,
    tenantScope,
  });

  if (rentalResolution?.profile?.id) {
    return rentalResolution;
  }

  return loadOwnerProfileByFleetVehicle({
    adminClient,
    ownerId,
    fleetVehicleId: normalizedVehicleId,
    tenantScope,
  });
};

const buildPayloads = ({ ownerId, accountType, metadata = {}, formData, submitForReview = false, existingListing = null }) => {
  const cleanMedia = toArrayMedia(formData.media);
  const coverImageUrl = String(formData.coverImageUrl || '').trim() || cleanMedia[0]?.url || null;
  const normalizedOwnerType = ['individual_owner', 'operator', 'owner'].includes(String(accountType || '').trim())
    ? String(accountType).trim()
    : 'individual_owner';
  const listingStatus = submitForReview ? 'pending_review' : normalizeStatus(existingListing?.listing_status || 'draft');

  const profilePayload = {
    owner_id: ownerId,
    owner_type: normalizedOwnerType,
    owner_display_name: metadata.company_name || metadata.full_name || metadata.name || '',
    brand_name: String(formData.brandName || '').trim(),
    model_name: String(formData.modelName || '').trim(),
    category_code: String(formData.categoryCode || 'atv').trim() || 'atv',
    year: optionalInteger(formData.year),
    plate_number: String(formData.plateNumber || '').trim() || null,
    city_name: String(formData.cityName || metadata.city || 'Tangier').trim() || 'Tangier',
    country_name: String(formData.countryName || metadata.country || 'Morocco').trim() || 'Morocco',
    area_name: String(formData.areaName || '').trim() || null,
    short_description: String(formData.shortDescription || '').trim() || null,
    full_description: String(formData.fullDescription || '').trim() || null,
    seats: optionalInteger(formData.seats),
    engine_cc: optionalInteger(formData.engineCc),
    transmission: String(formData.transmission || '').trim() || null,
    fuel_type: String(formData.fuelType || '').trim() || null,
    vehicle_condition: String(formData.vehicleCondition || '').trim() || null,
    color: String(formData.color || '').trim() || null,
    extras: toStringArray(formData.extras),
    registration_number: String(formData.registrationNumber || '').trim() || null,
    registration_date: optionalDateString(formData.registrationDate),
    registration_expiry_date: optionalDateString(formData.registrationExpiryDate),
    insurance_policy_number: String(formData.insurancePolicyNumber || '').trim() || null,
    insurance_provider: String(formData.insuranceProvider || '').trim() || null,
    insurance_expiry_date: optionalDateString(formData.insuranceExpiryDate),
    fuel_policy: String(formData.fuelPolicy || '').trim() || 'return_same_level',
    deposit_amount: optionalNumber(formData.depositAmount),
    mileage_limit_km: optionalInteger(formData.mileageLimitKm),
    extra_km_rate: optionalNumber(formData.extraKmRate),
    minimum_driver_age: optionalInteger(formData.minimumDriverAge),
    minimum_license_years: optionalInteger(formData.minimumLicenseYears),
    driver_license_required: formData.driverLicenseRequired !== false,
    accepted_license_classes: toStringArray(formData.acceptedLicenseClasses),
    cancellation_policy: String(formData.cancellationPolicy || '').trim() || null,
    late_return_penalty_type: String(formData.lateReturnPenaltyType || '').trim() || null,
    late_return_penalty_amount: optionalNumber(formData.lateReturnPenaltyAmount),
    pickup_location_name: String(formData.pickupLocationName || '').trim() || null,
    pickup_address: String(formData.pickupAddress || '').trim() || null,
    pickup_lat: optionalNumber(formData.pickupLat),
    pickup_lng: optionalNumber(formData.pickupLng),
    delivery_available: Boolean(formData.deliveryAvailable),
    delivery_radius_km: optionalInteger(formData.deliveryRadiusKm),
    delivery_fee_amount: optionalNumber(formData.deliveryFeeAmount),
    pickup_notes: String(formData.pickupNotes || '').trim() || null,
    dropoff_notes: String(formData.dropoffNotes || '').trim() || null,
    working_days: toStringArray(formData.workingDays),
    working_hours: {
      start: String(formData.workingHoursStart || '').trim(),
      end: String(formData.workingHoursEnd || '').trim(),
    },
    blocked_dates: toStringArray(formData.blockedDates),
    advance_notice_hours: optionalInteger(formData.advanceNoticeHours),
    maximum_booking_days: optionalInteger(formData.maximumBookingDays),
    terms_template_key: String(formData.termsTemplateKey || '').trim() || null,
    custom_terms_text: String(formData.customTermsText || '').trim() || null,
    terms_accepted_for_submission: Boolean(formData.termsAcceptedForSubmission),
    last_maintenance_date: String(formData.lastMaintenanceDate || '').trim() || null,
    insurance_included:
      formData.insuranceIncluded === '' || formData.insuranceIncluded === null || formData.insuranceIncluded === undefined
        ? null
        : Boolean(formData.insuranceIncluded),
    insurance_notes: String(formData.insuranceNotes || '').trim() || null,
    roadside_assistance_included: Boolean(formData.roadsideAssistanceIncluded),
    safety_info: {
      helmet_included: Boolean(formData.helmetIncluded),
      registration_verified: Boolean(formData.registrationVerified),
      inspection_completed: Boolean(formData.inspectionCompleted),
      notes: String(formData.safetyNotes || '').trim(),
    },
    verification_notes: String(formData.verificationNotes || '').trim() || null,
    availability: {
      note: String(formData.availabilityNote || '').trim(),
    },
    specs: {
      transmission: String(formData.transmission || '').trim(),
      seats: optionalInteger(formData.seats),
      engine_cc: optionalInteger(formData.engineCc),
      fuel_type: String(formData.fuelType || '').trim(),
      color: String(formData.color || '').trim(),
    },
    rules: {
      smoking_allowed: Boolean(formData.smokingAllowed),
      pets_allowed: Boolean(formData.petsAllowed),
      offroad_allowed: Boolean(formData.offroadAllowed),
      second_driver_allowed: Boolean(formData.secondDriverAllowed),
      custom_rules_text: String(formData.customRulesText || '').trim(),
    },
    media: cleanMedia,
    cover_image_url: coverImageUrl,
    marketplace_visible: existingListing?.listing_status === 'live',
    is_active: true,
  };

  const listingPayload = {
    owner_id: ownerId,
    owner_type: normalizedOwnerType,
    listing_status: listingStatus,
    review_status: submitForReview ? 'pending_review' : normalizeStatus(existingListing?.review_status || 'not_submitted'),
    moderation_status: submitForReview ? 'pending_review' : normalizeStatus(existingListing?.moderation_status || 'not_reviewed'),
    booking_mode: 'request',
    title: String(formData.listingTitle || `${profilePayload.brand_name} ${profilePayload.model_name}`).trim(),
    currency_code: String(formData.currencyCode || 'MAD').trim() || 'MAD',
    daily_price_amount: optionalNumber(formData.dailyPriceAmount),
    hourly_price_amount: null,
    weekly_price_amount: null,
    monthly_price_amount: null,
    deposit_amount: optionalNumber(formData.depositAmount),
    included_km: optionalInteger(formData.mileageLimitKm),
    extra_km_rate: optionalNumber(formData.extraKmRate),
    seasonal_pricing: Array.isArray(formData.seasonalPricing) ? formData.seasonalPricing : [],
    pricing: {
      daily: optionalNumber(formData.dailyPriceAmount),
      half_day: {
        price: optionalNumber(formData.halfDayPriceAmount),
        min_hours: optionalInteger(formData.halfDayMinHours),
        max_hours: optionalInteger(formData.halfDayMaxHours),
      },
      distance: {
        included_km: optionalInteger(formData.mileageLimitKm),
        extra_km_rate: optionalNumber(formData.extraKmRate),
      },
      currency: String(formData.currencyCode || 'MAD').trim() || 'MAD',
      seasonal_pricing: Array.isArray(formData.seasonalPricing) ? formData.seasonalPricing : [],
    },
    submitted_at: submitForReview ? new Date().toISOString() : existingListing?.submitted_at || null,
    resubmitted_at: submitForReview && existingListing?.id ? new Date().toISOString() : existingListing?.resubmitted_at || null,
    changes_requested_at: submitForReview ? null : existingListing?.changes_requested_at || null,
    admin_feedback: submitForReview ? null : existingListing?.admin_feedback || null,
    rejection_reason: submitForReview ? null : existingListing?.rejection_reason || null,
  };

  return { profilePayload, listingPayload };
};

const saveVehicleRecord = async ({ adminClient, ownerId, accountType, metadata, vehicleId, formData, submitForReview = false, saveListing = false, tenantScope = null }) => {
  const distancePricingError = validateDistancePricing(formData);
  if (distancePricingError) {
    const error = new Error(distancePricingError);
    error.status = 400;
    throw error;
  }

  let existingListing = null;
  if (vehicleId) {
    existingListing = await loadLatestListingForProfile({
      adminClient,
      ownerId,
      profileId: vehicleId,
      tenantScope,
    });
  }

  const { profilePayload, listingPayload } = buildPayloads({
    ownerId,
    accountType,
    metadata,
    formData,
    submitForReview,
    existingListing,
  });

  let savedProfile = null;
  let compatibleProfilePayload = { ...profilePayload };

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const { data, error } = vehicleId
      ? await applyTenantQueryScope(adminClient.from(VEHICLE_PROFILES_TABLE).update(stampTenantPayload(compatibleProfilePayload, tenantScope)).eq('id', vehicleId).eq('owner_id', ownerId).select('*').single(), tenantScope)
      : await adminClient.from(VEHICLE_PROFILES_TABLE).insert(stampTenantPayload(compatibleProfilePayload, tenantScope)).select('*').single();

    if (!error) {
      savedProfile = data;
      break;
    }

    const missingColumn = getMissingSchemaColumn(error);
    if (missingColumn && Object.prototype.hasOwnProperty.call(compatibleProfilePayload, missingColumn)) {
      if ((submitForReview || saveListing) && REQUIRED_PROFILE_COLUMNS.has(missingColumn)) {
        throw new Error(`Marketplace vehicle setup is incomplete: required column "${missingColumn}" is missing in app_vehicle_public_profiles.`);
      }
      const { [missingColumn]: _removed, ...nextPayload } = compatibleProfilePayload;
      compatibleProfilePayload = nextPayload;
      continue;
    }

    const notNullColumn = getNotNullSchemaColumn(error);
    const legacyValue = getLegacyMarketplaceColumnValue({ column: notNullColumn, ownerId, formData });
    if (legacyValue !== undefined && !Object.prototype.hasOwnProperty.call(compatibleProfilePayload, notNullColumn)) {
      compatibleProfilePayload = { ...compatibleProfilePayload, [notNullColumn]: legacyValue };
      continue;
    }

    throw error;
  }

  if (!savedProfile) {
    throw new Error('Unable to save vehicle profile with the current marketplace schema.');
  }

  const fleetVehiclePayload = buildFleetVehiclePayload(formData, [savedProfile?.brand_name, savedProfile?.model_name].filter(Boolean).join(' '), ownerId);
  let linkedFleetVehicleId =
    savedProfile?.linked_fleet_vehicle_id ||
    savedProfile?.fleet_vehicle_id ||
    formData?.vehicleRefId ||
    formData?.rawFleetVehicle?.id ||
    null;

  if (fleetVehiclePayload?.plate_number) {
      const { data: existingPlateVehicle, error: plateError } = await runFirstRowQuery(
        applyTenantQueryScope(
          adminClient
            .from(VEHICLES_TABLE)
            .select('*')
            .eq('plate_number', fleetVehiclePayload.plate_number)
            .order('id', { ascending: false })
            .limit(1),
          tenantScope
        )
      );

    if (plateError && !setupErrorCodes.has(String(plateError.code || ''))) {
      throw plateError;
    }

    if (existingPlateVehicle?.id) {
      if (
        existingPlateVehicle?.owner_user_id &&
        String(existingPlateVehicle.owner_user_id) !== String(ownerId)
      ) {
        throw new Error('This plate number is already used by another vehicle.');
      }
      linkedFleetVehicleId = existingPlateVehicle.id;
    }
  }

  let savedFleetVehicle = null;
  let compatibleFleetPayload = { ...fleetVehiclePayload };

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const { data, error } = linkedFleetVehicleId
      ? await applyTenantQueryScope(adminClient.from(VEHICLES_TABLE).update(stampTenantPayload(compatibleFleetPayload, tenantScope)).eq('id', linkedFleetVehicleId).select('*').single(), tenantScope)
      : await adminClient.from(VEHICLES_TABLE).insert([stampTenantPayload({ ...compatibleFleetPayload, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, tenantScope)]).select('*').single();

    if (!error) {
      savedFleetVehicle = data;
      break;
    }

    const missingColumn = getMissingSchemaColumn(error);
    if (String(error?.code || '') === '42703' && missingColumn && Object.prototype.hasOwnProperty.call(compatibleFleetPayload, missingColumn)) {
      const { [missingColumn]: _removed, ...nextPayload } = compatibleFleetPayload;
      compatibleFleetPayload = nextPayload;
      continue;
    }

    const duplicatePlateConstraint = String(error?.message || error?.details || '').includes('plate_number_key')
      || String(error?.constraint || '') === 'saharax_0u4w4d_vehicles_plate_number_key';
    if (String(error?.code || '') === '23505' && duplicatePlateConstraint && compatibleFleetPayload?.plate_number) {
      const { data: duplicateVehicle } = await runFirstRowQuery(
        applyTenantQueryScope(
          adminClient
            .from(VEHICLES_TABLE)
            .select('*')
            .eq('plate_number', compatibleFleetPayload.plate_number)
            .order('id', { ascending: false })
            .limit(1),
          tenantScope
        )
      );
      if (duplicateVehicle?.id && (!duplicateVehicle?.owner_user_id || String(duplicateVehicle.owner_user_id) === String(ownerId))) {
        savedFleetVehicle = duplicateVehicle;
        linkedFleetVehicleId = duplicateVehicle.id;
        break;
      }
    }

    throw error;
  }

  if (!savedFleetVehicle?.id) {
    throw new Error('Unable to save the linked fleet vehicle record.');
  }

  let compatibleLinkPayload = {
    linked_fleet_vehicle_id: savedFleetVehicle.id,
    fleet_vehicle_id: savedFleetVehicle.id,
    vehicle_ref_table: VEHICLES_TABLE,
  };
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { error } = await applyTenantQueryScope(
      adminClient
      .from(VEHICLE_PROFILES_TABLE)
      .update(stampTenantPayload(compatibleLinkPayload, tenantScope))
      .eq('id', savedProfile.id)
      .eq('owner_id', ownerId),
      tenantScope
    );
    if (!error) break;
    const missingColumn = getMissingSchemaColumn(error);
    if (missingColumn && Object.prototype.hasOwnProperty.call(compatibleLinkPayload, missingColumn)) {
      const { [missingColumn]: _removed, ...nextPayload } = compatibleLinkPayload;
      compatibleLinkPayload = nextPayload;
      continue;
    }
    throw error;
  }

  let savedListing = existingListing || null;
  if (submitForReview || saveListing || existingListing?.id) {
    let compatibleListingPayload = {
      ...listingPayload,
      vehicle_public_profile_id: savedProfile.id,
    };
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const { data, error } = existingListing?.id
        ? await applyTenantQueryScope(adminClient.from(MARKETPLACE_LISTINGS_TABLE).update(stampTenantPayload(compatibleListingPayload, tenantScope)).eq('id', existingListing.id).select('*').single(), tenantScope)
        : await adminClient.from(MARKETPLACE_LISTINGS_TABLE).insert(stampTenantPayload(compatibleListingPayload, tenantScope)).select('*').single();
      if (!error) {
        savedListing = data;
        break;
      }
      const missingColumn = getMissingSchemaColumn(error);
      if (missingColumn && Object.prototype.hasOwnProperty.call(compatibleListingPayload, missingColumn)) {
        const { [missingColumn]: _removed, ...nextPayload } = compatibleListingPayload;
        compatibleListingPayload = nextPayload;
        continue;
      }
      throw error;
    }
  }

  if (submitForReview) {
    const persistedListingStatus = normalizeStatus(savedListing?.listing_status || '', 'draft');
    const persistedReviewStatus = normalizeStatus(savedListing?.review_status || '', 'not_submitted');
    const persistedModerationStatus = normalizeStatus(savedListing?.moderation_status || '', 'not_reviewed');
    const reviewWasPersisted = (
      persistedListingStatus === 'pending_review' ||
      persistedReviewStatus === 'pending_review' ||
      persistedModerationStatus === 'pending_review' ||
      persistedListingStatus === 'approved' ||
      persistedListingStatus === 'live'
    );

    if (!reviewWasPersisted) {
      throw new Error('Review submission did not persist. Please try again.');
    }
  }

  return {
    profile: {
      ...savedProfile,
      linked_fleet_vehicle_id: savedFleetVehicle.id,
      fleet_vehicle_id: savedFleetVehicle.id,
      vehicle_ref_table: VEHICLES_TABLE,
    },
    listing: savedListing || null,
    fleetVehicle: savedFleetVehicle,
  };
};

const loadVehicleRecord = async ({ adminClient, ownerId, vehicleId, tenantScope = null }) => {
  if (!ownerId || !vehicleId) {
    return null;
  }

  let { data: profile, error: profileError } = await applyTenantQueryScope(
    adminClient
      .from(VEHICLE_PROFILES_TABLE)
      .select('*')
      .eq('owner_id', ownerId)
      .eq('id', vehicleId)
      .maybeSingle(),
    tenantScope
  );

  if (profileError) {
    throw profileError;
  }

  if (!profile) {
    const { data: tenantScopedProfile, error: tenantScopedProfileError } = await applyTenantQueryScope(
      adminClient
        .from(VEHICLE_PROFILES_TABLE)
        .select('*')
        .eq('id', vehicleId)
        .maybeSingle(),
      tenantScope
    );

    if (tenantScopedProfileError && !setupErrorCodes.has(String(tenantScopedProfileError.code || ''))) {
      throw tenantScopedProfileError;
    }

    if (tenantScopedProfile?.id) {
      profile = tenantScopedProfile;
    }
  }

  if (!profile) {
    const requestResolution = await loadOwnerProfileByRequestId({
      adminClient,
      ownerId,
      requestId: vehicleId,
      tenantScope,
    });

    if (requestResolution?.profile?.id) {
      profile = requestResolution.profile;
    }
  }

  if (!profile) {
    const listingResolution = await loadOwnerProfileByListingId({
      adminClient,
      ownerId,
      listingId: vehicleId,
      tenantScope,
    });

    if (listingResolution?.profile?.id) {
      profile = listingResolution.profile;
    }
  }

  if (!profile) {
    const rentalResolution = await loadOwnerProfileByRentalId({
      adminClient,
      ownerId,
      rentalId: vehicleId,
      tenantScope,
    });

    if (rentalResolution?.profile?.id) {
      profile = rentalResolution.profile;
    }
  }

  if (!profile) {
    const fleetResolution = await loadOwnerProfileByFleetVehicle({
      adminClient,
      ownerId,
      fleetVehicleId: vehicleId,
      tenantScope,
    });

    if (!fleetResolution?.profile) {
      return null;
    }

    profile = fleetResolution.profile;
  }

  const listing = await loadLatestListingForProfile({
    adminClient,
    ownerId,
    profileId: profile.id,
    tenantScope,
  });

  const fleetVehicle = await fetchLinkedFleetVehicleRecord({
    adminClient,
    profile,
    ownerId,
    tenantScope,
  });

  return {
    profile,
    listing: listing || null,
    fleetVehicle: fleetVehicle || null,
  };
};

const updateCompatibleSingleRecord = async ({ initialPayload, buildQuery, fallbackErrorMessage, contextLabel = 'ownerVehicleSectionSave' }) => {
  let compatiblePayload = { ...initialPayload };

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data, error } = await buildQuery(compatiblePayload);
    if (!error) {
      return data || null;
    }

    const missingColumn = getMissingSchemaColumn(error);
    if (missingColumn && Object.prototype.hasOwnProperty.call(compatiblePayload, missingColumn)) {
      const { [missingColumn]: _removed, ...nextPayload } = compatiblePayload;
      compatiblePayload = nextPayload;
      continue;
    }

    error.saveContext = contextLabel;
    throw error;
  }

  const error = new Error(fallbackErrorMessage || 'Unable to save this section with the current marketplace schema.');
  error.saveContext = contextLabel;
  throw error;
};

const saveListingCopySection = async ({ adminClient, ownerId, accountType, vehicleId, formData, tenantScope = null }) => {
  const resolvedProfileRecord = await resolveOwnerProfileRecord({
    adminClient,
    ownerId,
    vehicleId,
    tenantScope,
  });
  const profileId = String(resolvedProfileRecord?.profile?.id || vehicleId || '').trim();
  if (!profileId) {
    const error = new Error('Choose a vehicle before saving listing copy.');
    error.status = 400;
    throw error;
  }

  const now = new Date().toISOString();
  const shortDescription = String(formData.shortDescription || '').trim() || null;
  const fullDescription = String(formData.fullDescription || '').trim() || null;
  const listingTitle = String(formData.listingTitle || '').trim();
  const normalizedOwnerType = ['individual_owner', 'operator', 'owner'].includes(String(accountType || '').trim())
    ? String(accountType).trim()
    : 'individual_owner';

  const savedProfile = await updateCompatibleSingleRecord({
    initialPayload: {
      short_description: shortDescription,
      full_description: fullDescription,
      updated_at: now,
    },
    buildQuery: (payload) =>
      applyTenantQueryScope(
        adminClient
          .from(VEHICLE_PROFILES_TABLE)
          .update(stampTenantPayload(payload, tenantScope))
          .eq('id', profileId)
          .select('*')
          .single(),
        tenantScope
      ),
    fallbackErrorMessage: 'Unable to save listing copy with the current marketplace schema.',
    contextLabel: 'saveListingCopySection.profileUpdate',
  });

  if (!savedProfile?.id) {
    const error = new Error('Vehicle not found.');
    error.status = 404;
    throw error;
  }

  let existingListing = null;
  try {
    existingListing = await loadLatestListingForProfile({
      adminClient,
      ownerId,
      profileId: savedProfile.id,
      tenantScope,
    });
  } catch (listingLookupError) {
    listingLookupError.saveContext = 'saveListingCopySection.listingLookup';
    throw listingLookupError;
  }

  const fallbackTitle = [savedProfile.brand_name, savedProfile.model_name].filter(Boolean).join(' ').trim() || 'Marketplace listing';
  const listingCopyPayload = {
    title: listingTitle || fallbackTitle,
    short_description: shortDescription,
    full_description: fullDescription,
    updated_at: now,
  };

  const savedListing = await updateCompatibleSingleRecord({
    initialPayload: existingListing?.id
      ? listingCopyPayload
      : {
          owner_id: ownerId,
          owner_type: normalizedOwnerType,
          vehicle_public_profile_id: savedProfile.id,
          listing_status: 'draft',
          review_status: 'not_submitted',
          moderation_status: 'not_reviewed',
          booking_mode: 'request',
          currency_code: String(formData.currencyCode || 'MAD').trim() || 'MAD',
          created_at: now,
          ...listingCopyPayload,
        },
    buildQuery: (payload) =>
      existingListing?.id
        ? applyTenantQueryScope(
            adminClient
              .from(MARKETPLACE_LISTINGS_TABLE)
              .update(stampTenantPayload(payload, tenantScope))
              .eq('id', existingListing.id)
              .select('*')
              .single(),
            tenantScope
          )
        : adminClient
            .from(MARKETPLACE_LISTINGS_TABLE)
            .insert(stampTenantPayload(payload, tenantScope))
            .select('*')
            .single(),
    fallbackErrorMessage: 'Unable to save marketplace listing copy with the current schema.',
    contextLabel: existingListing?.id
      ? 'saveListingCopySection.listingUpdate'
      : 'saveListingCopySection.listingInsert',
  });

  // Keep listing-copy saves lightweight. This path only edits public text,
  // so we can return the updated profile/listing directly without reloading
  // linked fleet data or other heavier vehicle workspace context.
  return {
    profile: savedProfile,
    listing: savedListing || existingListing || null,
    fleetVehicle: null,
  };
};

const saveVehicleWorkspaceSection = async ({ adminClient, ownerId, vehicleId, formData, tenantScope = null }) => {
  const resolvedProfileRecord = await resolveOwnerProfileRecord({
    adminClient,
    ownerId,
    vehicleId,
    tenantScope,
  });
  const profileId = String(resolvedProfileRecord?.profile?.id || vehicleId || '').trim();
  if (!profileId) {
    const error = new Error('Choose a vehicle before saving vehicle setup.');
    error.status = 400;
    throw error;
  }

  const now = new Date().toISOString();
  const savedProfile = await updateCompatibleSingleRecord({
    initialPayload: {
      brand_name: String(formData.brandName || '').trim() || null,
      model_name: String(formData.modelName || '').trim() || null,
      category_code: String(formData.categoryCode || '').trim() || 'atv',
      year: optionalInteger(formData.year),
      plate_number: String(formData.plateNumber || '').trim() || null,
      city_name: String(formData.cityName || '').trim() || 'Tangier',
      area_name: String(formData.areaName || '').trim() || null,
      seats: optionalInteger(formData.seats),
      engine_cc: optionalInteger(formData.engineCc),
      color: String(formData.color || '').trim() || null,
      current_odometer: optionalInteger(formData.currentOdometer),
      engine_hours: optionalInteger(formData.engineHours),
      updated_at: now,
    },
    buildQuery: (payload) =>
      applyTenantQueryScope(
        adminClient
          .from(VEHICLE_PROFILES_TABLE)
          .update(stampTenantPayload(payload, tenantScope))
          .eq('id', profileId)
          .select('*')
          .single(),
        tenantScope
      ),
    fallbackErrorMessage: 'Unable to save vehicle setup with the current marketplace schema.',
    contextLabel: 'saveVehicleWorkspaceSection.profileUpdate',
  });

  if (!savedProfile?.id) {
    const error = new Error('Vehicle not found.');
    error.status = 404;
    throw error;
  }

  let existingListing = null;
  try {
    existingListing = await loadLatestListingForProfile({
      adminClient,
      ownerId,
      profileId: savedProfile.id,
      tenantScope,
    });
  } catch (listingLookupError) {
    listingLookupError.saveContext = 'saveVehicleWorkspaceSection.listingLookup';
    throw listingLookupError;
  }

  return {
    profile: savedProfile,
    listing: existingListing || null,
    fleetVehicle: null,
  };
};

const saveListingWorkspaceSection = async ({ adminClient, ownerId, accountType, vehicleId, formData, tenantScope = null }) => {
  const resolvedProfileRecord = await resolveOwnerProfileRecord({
    adminClient,
    ownerId,
    vehicleId,
    tenantScope,
  });
  const profileId = String(resolvedProfileRecord?.profile?.id || vehicleId || '').trim();
  if (!profileId) {
    const error = new Error('Choose a vehicle before saving pricing and publish details.');
    error.status = 400;
    throw error;
  }

  const now = new Date().toISOString();
  const shortDescription = String(formData.shortDescription || '').trim() || null;
  const fullDescription = String(formData.fullDescription || '').trim() || null;
  const listingTitle = String(formData.listingTitle || '').trim();
  const normalizedOwnerType = ['individual_owner', 'operator', 'owner'].includes(String(accountType || '').trim())
    ? String(accountType).trim()
    : 'individual_owner';

  const savedProfile = await updateCompatibleSingleRecord({
    initialPayload: {
      short_description: shortDescription,
      full_description: fullDescription,
      deposit_amount: optionalNumber(formData.depositAmount),
      mileage_limit_km: optionalInteger(formData.mileageLimitKm),
      extra_km_rate: optionalNumber(formData.extraKmRate),
      pickup_location_name: String(formData.pickupLocationName || '').trim() || null,
      pickup_address: String(formData.pickupAddress || '').trim() || null,
      fuel_policy: String(formData.fuelPolicy || '').trim() || null,
      extras: toStringArray(formData.extrasText),
      terms_accepted_for_submission: Boolean(formData.termsAcceptedForSubmission),
      updated_at: now,
    },
    buildQuery: (payload) =>
      applyTenantQueryScope(
        adminClient
          .from(VEHICLE_PROFILES_TABLE)
          .update(stampTenantPayload(payload, tenantScope))
          .eq('id', profileId)
          .select('*')
          .single(),
        tenantScope
      ),
    fallbackErrorMessage: 'Unable to save listing details with the current marketplace schema.',
    contextLabel: 'saveListingWorkspaceSection.profileUpdate',
  });

  if (!savedProfile?.id) {
    const error = new Error('Vehicle not found.');
    error.status = 404;
    throw error;
  }

  let existingListing = null;
  try {
    existingListing = await loadLatestListingForProfile({
      adminClient,
      ownerId,
      profileId: savedProfile.id,
      tenantScope,
    });
  } catch (listingLookupError) {
    listingLookupError.saveContext = 'saveListingWorkspaceSection.listingLookup';
    throw listingLookupError;
  }

  const listingPayload = {
    title: listingTitle || [savedProfile.brand_name, savedProfile.model_name].filter(Boolean).join(' ').trim() || 'Marketplace listing',
    short_description: shortDescription,
    full_description: fullDescription,
    currency_code: String(formData.currencyCode || 'MAD').trim() || 'MAD',
    daily_price_amount: optionalNumber(formData.dailyPriceAmount),
    deposit_amount: optionalNumber(formData.depositAmount),
    included_km: optionalInteger(formData.mileageLimitKm),
    extra_km_rate: optionalNumber(formData.extraKmRate),
    pricing: {
      daily: optionalNumber(formData.dailyPriceAmount),
      half_day: {
        price: optionalNumber(formData.halfDayPriceAmount),
        min_hours: optionalInteger(formData.halfDayMinHours),
        max_hours: optionalInteger(formData.halfDayMaxHours),
      },
      distance: {
        included_km: optionalInteger(formData.mileageLimitKm),
        extra_km_rate: optionalNumber(formData.extraKmRate),
      },
      currency: String(formData.currencyCode || 'MAD').trim() || 'MAD',
      seasonal_pricing: Array.isArray(formData.seasonalPricing) ? formData.seasonalPricing : [],
    },
    updated_at: now,
  };

  const savedListing = await updateCompatibleSingleRecord({
    initialPayload: existingListing?.id
      ? listingPayload
      : {
          owner_id: ownerId,
          owner_type: normalizedOwnerType,
          vehicle_public_profile_id: savedProfile.id,
          listing_status: 'draft',
          review_status: 'not_submitted',
          moderation_status: 'not_reviewed',
          booking_mode: 'request',
          created_at: now,
          ...listingPayload,
        },
    buildQuery: (payload) =>
      existingListing?.id
        ? applyTenantQueryScope(
            adminClient
              .from(MARKETPLACE_LISTINGS_TABLE)
              .update(stampTenantPayload(payload, tenantScope))
              .eq('id', existingListing.id)
              .select('*')
              .single(),
            tenantScope
          )
        : adminClient
            .from(MARKETPLACE_LISTINGS_TABLE)
            .insert(stampTenantPayload(payload, tenantScope))
            .select('*')
            .single(),
    fallbackErrorMessage: 'Unable to save pricing and listing details with the current schema.',
    contextLabel: existingListing?.id
      ? 'saveListingWorkspaceSection.listingUpdate'
      : 'saveListingWorkspaceSection.listingInsert',
  });

  return {
    profile: savedProfile,
    listing: savedListing || existingListing || null,
    fleetVehicle: null,
  };
};

const publishOwnerListing = async ({ adminClient, ownerId, vehicleId, tenantScope = null }) => {
  const vehicle = await loadVehicleRecord({
    adminClient,
    ownerId,
    vehicleId,
    tenantScope,
  });

  const listing = vehicle?.listing || null;
  const profile = vehicle?.profile || null;
  if (!listing?.id || !profile?.id) {
    const error = new Error('This listing needs to be saved before it can be published.');
    error.status = 400;
    throw error;
  }

  const listingStatus = normalizeStatus(listing.listing_status || listing.status || 'draft');
  const reviewStatus = normalizeStatus(listing.review_status || 'not_submitted');
  if (listingStatus === 'live') {
    return vehicle;
  }

  if (listingStatus !== 'approved' && reviewStatus !== 'approved') {
    const error = new Error('Admin approval is required before publishing this listing.');
    error.status = 409;
    throw error;
  }

  const now = new Date().toISOString();
  const listingUpdates = {
    listing_status: 'live',
    review_status: 'approved',
    moderation_status: 'approved',
    published_at: now,
    unpublished_at: null,
    updated_at: now,
  };
  const profileUpdates = {
    marketplace_visible: true,
    is_active: true,
    updated_at: now,
  };

  const { error: listingError } = await applyTenantQueryScope(
    adminClient
      .from(MARKETPLACE_LISTINGS_TABLE)
      .update(stampTenantPayload(listingUpdates, tenantScope))
      .eq('id', listing.id)
      .eq('owner_id', ownerId),
    tenantScope
  );
  if (listingError) throw listingError;

  const { error: profileError } = await applyTenantQueryScope(
    adminClient
      .from(VEHICLE_PROFILES_TABLE)
      .update(stampTenantPayload(profileUpdates, tenantScope))
      .eq('id', profile.id)
      .eq('owner_id', ownerId),
    tenantScope
  );
  if (profileError) throw profileError;

  return loadVehicleRecord({
    adminClient,
    ownerId,
    vehicleId: profile.id,
    tenantScope,
  });
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const auth = await authenticateRequest(req);
  if (auth.error) {
    return json(res, auth.error.status, auth.error.body);
  }

  const { adminClient, user, tenantRuntime } = auth;

  try {
    const requestPayload = req.method === 'GET' ? (req.query || {}) : parseBody(req.body);
    const tenantScope = await resolveRequestTenantScope({ req, adminClient, tenantRuntime, payload: requestPayload });
    const userInScope = await assertUserInTenantScope({ adminClient, userId: user.id, tenantScope });
    const requestAction = String(requestPayload.action || '').trim().toLowerCase();
    if (!userInScope && req.method !== 'GET' && requestAction !== 'publish_listing') {
      return json(res, 403, { error: 'You do not have access to this workspace' });
    }
    const effectiveTenantScope = userInScope ? tenantScope : null;
    const ownerId = user.id;
    const { data: profile } = await adminClient
      .from(APP_USERS_TABLE)
      .select('role')
      .eq('id', ownerId)
      .maybeSingle();

    const effectiveRole = String(profile?.role || user.user_metadata?.role || user.app_metadata?.role || '').trim().toLowerCase();
    if (!['owner', 'admin', 'customer', 'user'].includes(effectiveRole)) {
      return json(res, 403, { error: 'Account access required' });
    }

    if (req.method === 'GET') {
      const vehicleId = String(req.query?.vehicleId || '').trim();
      if (!vehicleId) {
        return json(res, 400, { error: 'vehicleId is required' });
      }

      const vehicle = await loadVehicleRecord({
        adminClient,
        ownerId,
        vehicleId,
        tenantScope: effectiveTenantScope,
      });

      return json(res, 200, {
        success: true,
        vehicle,
      });
    }

    if (req.method !== 'POST') {
      return json(res, 405, { error: 'Method not allowed' });
    }

    if (requestAction === 'publish_listing') {
      const vehicleId = String(requestPayload.vehicleId || '').trim();
      if (!vehicleId) {
        return json(res, 400, { error: 'vehicleId is required' });
      }

      const vehicle = await publishOwnerListing({
        adminClient,
        ownerId,
        vehicleId,
        tenantScope: effectiveTenantScope,
      });

      return json(res, 200, {
        success: true,
        vehicle,
        published: true,
      });
    }

    const sectionKey = String(requestPayload.sectionKey || '').trim();
    if (sectionKey && requestPayload.vehicleId && !requestPayload.submitForReview) {
      let result = null;

      if (sectionKey === 'listingCopy') {
        result = await saveListingCopySection({
          adminClient,
          ownerId,
          accountType: requestPayload.accountType,
          vehicleId: requestPayload.vehicleId,
          formData: requestPayload.formData || {},
          tenantScope: effectiveTenantScope,
        });
      } else if (sectionKey === 'vehicleWorkspace') {
        result = await saveVehicleWorkspaceSection({
          adminClient,
          ownerId,
          vehicleId: requestPayload.vehicleId,
          formData: requestPayload.formData || {},
          tenantScope: effectiveTenantScope,
        });
      } else if (sectionKey === 'listingWorkspace') {
        result = await saveListingWorkspaceSection({
          adminClient,
          ownerId,
          accountType: requestPayload.accountType,
          vehicleId: requestPayload.vehicleId,
          formData: requestPayload.formData || {},
          tenantScope: effectiveTenantScope,
        });
      }

      if (result) {
        return json(res, 200, {
          success: true,
          vehicle: result,
          submitted: false,
          sectionKey,
        });
      }
    }

    const result = await saveVehicleRecord({
      adminClient,
      ownerId,
      accountType: requestPayload.accountType,
      metadata: requestPayload.metadata || {},
      vehicleId: requestPayload.vehicleId || null,
      formData: requestPayload.formData || {},
      submitForReview: Boolean(requestPayload.submitForReview),
      saveListing: Boolean(requestPayload.saveListing),
      tenantScope: effectiveTenantScope,
    });

    return json(res, 200, {
      success: true,
      vehicle: result,
      submitted: Boolean(requestPayload.submitForReview),
    });
  } catch (error) {
    console.error('Owner vehicle save failed:', {
      context: error?.saveContext,
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
      status: error?.status,
    });
    return json(res, error?.status || 500, { error: error?.message || 'Unable to save vehicle right now.' });
  }
}
