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

const optionalNumber = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
};

const optionalInteger = (value) => {
  const next = optionalNumber(value);
  return next === null ? null : Math.trunc(next);
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
  status: String(formData.fleetStatus || 'available').trim() || 'available',
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
    fuel_policy: String(formData.fuelPolicy || '').trim() || null,
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
  let existingListing = null;
  if (vehicleId) {
    const { data: listing } = await applyTenantQueryScope(
      adminClient
      .from(MARKETPLACE_LISTINGS_TABLE)
      .select('*')
      .eq('owner_id', ownerId)
      .eq('vehicle_public_profile_id', vehicleId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
      tenantScope
    );
    existingListing = listing || null;
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
    const { data: existingPlateVehicle, error: plateError } = await applyTenantQueryScope(
      adminClient
      .from(VEHICLES_TABLE)
      .select('*')
      .eq('plate_number', fleetVehiclePayload.plate_number)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle(),
      tenantScope
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
      const { data: duplicateVehicle } = await applyTenantQueryScope(
        adminClient
        .from(VEHICLES_TABLE)
        .select('*')
        .eq('plate_number', compatibleFleetPayload.plate_number)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle(),
        tenantScope
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
        ? await applyTenantQueryScope(adminClient.from(MARKETPLACE_LISTINGS_TABLE).update(stampTenantPayload(compatibleListingPayload, tenantScope)).eq('id', existingListing.id).eq('owner_id', ownerId).select('*').single(), tenantScope)
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

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const auth = await authenticateRequest(req);
  if (auth.error) {
    return json(res, auth.error.status, auth.error.body);
  }

  const { adminClient, user, tenantRuntime } = auth;

  try {
    const body = parseBody(req.body);
    const tenantScope = await resolveRequestTenantScope({ req, adminClient, tenantRuntime, payload: body });
    const userInScope = await assertUserInTenantScope({ adminClient, userId: user.id, tenantScope });
    if (!userInScope) {
      return json(res, 403, { error: 'You do not have access to this workspace' });
    }
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

    const result = await saveVehicleRecord({
      adminClient,
      ownerId,
      accountType: body.accountType,
      metadata: body.metadata || {},
      vehicleId: body.vehicleId || null,
      formData: body.formData || {},
      submitForReview: Boolean(body.submitForReview),
      saveListing: Boolean(body.saveListing),
      tenantScope,
    });

    return json(res, 200, {
      success: true,
      vehicle: result,
      submitted: Boolean(body.submitForReview),
    });
  } catch (error) {
    console.error('Owner vehicle save failed:', {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
      status: error?.status,
    });
    return json(res, 500, { error: error?.message || 'Unable to save vehicle right now.' });
  }
}
