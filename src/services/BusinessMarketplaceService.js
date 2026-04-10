import { supabase } from '../lib/supabase';

const VEHICLE_PROFILES_TABLE = 'app_vehicle_public_profiles';
const MARKETPLACE_LISTINGS_TABLE = 'app_marketplace_listings';
const BOOKING_REQUESTS_TABLE = 'app_booking_requests';
const MARKETPLACE_MESSAGES_TABLE = 'app_marketplace_messages';
const MARKETPLACE_MODERATION_HISTORY_TABLE = 'app_marketplace_moderation_history';
const REQUIRED_PROFILE_COLUMNS = new Set([
  'brand_name',
  'model_name',
  'year',
  'city_name',
  'country_name',
]);

const setupErrorCodes = new Set(['42P01', '42501', '42703', '22P02', 'PGRST116', 'PGRST204']);

const safeNumber = (value) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
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

const toStringArray = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

const toObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

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

const toArrayMedia = (media) => {
  if (Array.isArray(media)) {
    return media.filter((item) => item?.url).map((item, index) => ({
      id: item.id || `media-${index + 1}`,
      url: String(item.url || '').trim(),
      type: item.type || 'image',
      name: item.name || `Image ${index + 1}`,
      is_cover: Boolean(item.is_cover),
    }));
  }

  return [];
};

const enrichVehiclesWithModeration = async (ownerId, vehicles, listingsByProfileId) => {
  const listingIds = vehicles.map((vehicle) => vehicle.listingId).filter(Boolean);
  if (!ownerId || listingIds.length === 0) return vehicles;

  const [historyResponse, messagesResponse] = await Promise.all([
    supabase
      .from(MARKETPLACE_MODERATION_HISTORY_TABLE)
      .select('*')
      .eq('owner_id', ownerId)
      .in('listing_id', listingIds)
      .order('created_at', { ascending: false }),
    supabase
      .from(MARKETPLACE_MESSAGES_TABLE)
      .select('*')
      .eq('owner_id', ownerId)
      .in('listing_id', listingIds)
      .order('created_at', { ascending: false }),
  ]);

  if (historyResponse.error && !setupErrorCodes.has(String(historyResponse.error.code || ''))) {
    throw historyResponse.error;
  }
  if (messagesResponse.error && !setupErrorCodes.has(String(messagesResponse.error.code || ''))) {
    throw messagesResponse.error;
  }

  const latestHistoryByListing = new Map();
  for (const item of historyResponse.data || []) {
    if (!latestHistoryByListing.has(String(item.listing_id))) {
      latestHistoryByListing.set(String(item.listing_id), item);
    }
  }

  const latestMessageByListing = new Map();
  for (const item of messagesResponse.data || []) {
    if (!latestMessageByListing.has(String(item.listing_id))) {
      latestMessageByListing.set(String(item.listing_id), item);
    }
  }

  return vehicles.map((vehicle) => {
    const listing = listingsByProfileId.get(String(vehicle.id)) || vehicle.rawListing || null;
    const latestHistory = latestHistoryByListing.get(String(vehicle.listingId));
    const latestMessage = latestMessageByListing.get(String(vehicle.listingId));

    return {
      ...vehicle,
      adminFeedback: listing?.admin_feedback || latestHistory?.feedback || '',
      moderationStatus: normalizeStatus(listing?.moderation_status || vehicle.moderationStatus || 'not_reviewed'),
      latestOwnerMessage: latestMessage?.body || '',
    };
  });
};

export const getMarketplaceStatusLabel = (status) => {
  const normalized = normalizeStatus(status);
  const labels = {
    draft: 'Draft',
    pending_review: 'Pending review',
    approved: 'Approved',
    live: 'Live',
    rejected: 'Rejected',
    unpublished: 'Unpublished',
  };

  return labels[normalized] || normalized.replace(/_/g, ' ');
};

export const getMarketplaceStatusTone = (status) => {
  const normalized = normalizeStatus(status);
  const tones = {
    draft: 'bg-slate-100 text-slate-700 ring-slate-200',
    pending_review: 'bg-amber-100 text-amber-800 ring-amber-200',
    approved: 'bg-sky-100 text-sky-800 ring-sky-200',
    live: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
    rejected: 'bg-rose-100 text-rose-800 ring-rose-200',
    unpublished: 'bg-slate-100 text-slate-500 ring-slate-200',
  };

  return tones[normalized] || tones.draft;
};

const normalizeOwnerVehicle = (profile, listing) => {
  const title = [profile?.brand_name, profile?.model_name].filter(Boolean).join(' ') ||
    listing?.title ||
    'Marketplace vehicle';

  return {
    id: profile.id,
    listingId: listing?.id || null,
    title,
    brandName: profile?.brand_name || '',
    modelName: profile?.model_name || '',
    categoryCode: profile?.category_code || 'atv',
    cityName: profile?.city_name || 'Tangier',
    areaName: profile?.area_name || '',
    coverImageUrl: profile?.cover_image_url || null,
    shortDescription: profile?.short_description || '',
    marketplaceVisible: Boolean(profile?.marketplace_visible),
    isActive: profile?.is_active !== false,
    listingStatus: normalizeStatus(listing?.listing_status || listing?.status || 'draft'),
    reviewStatus: normalizeStatus(listing?.review_status || 'not_submitted'),
    bookingMode: listing?.booking_mode || 'request',
    hourlyPrice: safeNumber(listing?.hourly_price_amount),
    dailyPrice: safeNumber(listing?.daily_price_amount),
    weeklyPrice: safeNumber(listing?.weekly_price_amount),
    depositAmount: safeNumber(listing?.deposit_amount ?? profile?.deposit_amount),
    currencyCode: listing?.currency_code || 'MAD',
    adminFeedback: listing?.admin_feedback || '',
    moderationStatus: normalizeStatus(listing?.moderation_status || 'not_reviewed'),
    changesRequestedAt: listing?.changes_requested_at || null,
    resubmittedAt: listing?.resubmitted_at || null,
    latestOwnerMessage: '',
    submittedAt: listing?.submitted_at || null,
    reviewedAt: listing?.reviewed_at || null,
    publishedAt: listing?.published_at || null,
    updatedAt: listing?.updated_at || profile?.updated_at || profile?.created_at || null,
    rawProfile: profile,
    rawListing: listing || null,
  };
};

const normalizeOwnerRequest = (request, listing, profile) => {
  const status = normalizeStatus(request?.request_status || 'pending');
  const title =
    listing?.title ||
    [profile?.brand_name, profile?.model_name].filter(Boolean).join(' ') ||
    'Marketplace request';

  return {
    id: request.id,
    listingId: request.listing_id,
    vehiclePublicProfileId: request.vehicle_public_profile_id,
    ownerId: request.owner_id,
    customerId: request.customer_id || null,
    customerName: request.customer_name || 'Customer',
    customerEmail: request.customer_email || '',
    customerPhone: request.customer_phone || '',
    requestedStartAt: request.requested_start_at || null,
    requestedEndAt: request.requested_end_at || null,
    rentalType: request.rental_type || 'hourly',
    duration: safeNumber(request.duration),
    requestStatus: status,
    customerMessage: request.customer_message || '',
    ownerResponse: request.owner_response || '',
    counterOffer: request.counter_offer || {},
    createdAt: request.created_at || null,
    updatedAt: request.updated_at || request.created_at || null,
    acceptedAt: request.accepted_at || null,
    declinedAt: request.declined_at || null,
    negotiatedAt: request.negotiated_at || null,
    listingTitle: title,
    listingStatus: normalizeStatus(listing?.listing_status || 'draft'),
    currencyCode: listing?.currency_code || 'MAD',
    hourlyPrice: safeNumber(listing?.hourly_price_amount),
    dailyPrice: safeNumber(listing?.daily_price_amount),
    coverImageUrl: profile?.cover_image_url || '',
    cityName: profile?.city_name || 'Tangier',
    areaName: profile?.area_name || '',
    ownerDisplayName: profile?.owner_display_name || '',
    rawRequest: request,
    rawListing: listing || null,
    rawProfile: profile || null,
  };
};

export const normalizeOwnerVehicleForForm = (profile, listing) => {
  const media = toArrayMedia(profile?.media);
  const availability = toObject(profile?.availability);
  const specs = toObject(profile?.specs);
  const rules = toObject(profile?.rules);
  const safetyInfo = toObject(profile?.safety_info);
  const workingHours = toObject(profile?.working_hours);

  return {
    id: profile?.id || '',
    listingId: listing?.id || '',
    brandName: profile?.brand_name || '',
    modelName: profile?.model_name || '',
    categoryCode: profile?.category_code || 'atv',
    year: profile?.year || '',
    plateNumber: profile?.plate_number || '',
    cityName: profile?.city_name || 'Tangier',
    countryName: profile?.country_name || 'Morocco',
    areaName: profile?.area_name || '',
    shortDescription: profile?.short_description || '',
    fullDescription: profile?.full_description || '',
    seats: profile?.seats || '',
    engineCc: profile?.engine_cc || '',
    transmission: profile?.transmission || '',
    fuelType: profile?.fuel_type || '',
    vehicleCondition: profile?.vehicle_condition || '',
    color: profile?.color || '',
    extras: toStringArray(profile?.extras),
    fuelPolicy: profile?.fuel_policy || '',
    depositAmount: listing?.deposit_amount ?? profile?.deposit_amount ?? '',
    mileageLimitKm: profile?.mileage_limit_km || listing?.included_km || '',
    extraKmRate: listing?.extra_km_rate ?? profile?.extra_km_rate ?? '',
    coverImageUrl: profile?.cover_image_url || media.find((item) => item.is_cover)?.url || media[0]?.url || '',
    media,
    hourlyPriceAmount: listing?.hourly_price_amount ?? '',
    dailyPriceAmount: listing?.daily_price_amount ?? '',
    weeklyPriceAmount: listing?.weekly_price_amount ?? '',
    monthlyPriceAmount: listing?.monthly_price_amount ?? '',
    currencyCode: listing?.currency_code || 'MAD',
    seasonalPricing: Array.isArray(listing?.seasonal_pricing) ? listing.seasonal_pricing : [],
    listingTitle: listing?.title || '',
    listingStatus: normalizeStatus(listing?.listing_status || 'draft'),
    reviewStatus: normalizeStatus(listing?.review_status || 'not_submitted'),
    rejectionReason: listing?.rejection_reason || '',
    adminFeedback: listing?.admin_feedback || '',
    moderationStatus: normalizeStatus(listing?.moderation_status || 'not_reviewed'),
    moderationHistory: [],
    ownerMessages: [],
    minimumDriverAge: profile?.minimum_driver_age ?? '',
    minimumLicenseYears: profile?.minimum_license_years ?? '',
    driverLicenseRequired: profile?.driver_license_required !== false,
    acceptedLicenseClasses: toStringArray(profile?.accepted_license_classes),
    cancellationPolicy: profile?.cancellation_policy || '',
    lateReturnPenaltyType: profile?.late_return_penalty_type || '',
    lateReturnPenaltyAmount: profile?.late_return_penalty_amount ?? '',
    mileagePolicyType: profile?.mileage_limit_km ? 'limited' : 'unlimited',
    smokingAllowed: Boolean(rules?.smoking_allowed),
    petsAllowed: Boolean(rules?.pets_allowed),
    offroadAllowed: Boolean(rules?.offroad_allowed),
    secondDriverAllowed: Boolean(rules?.second_driver_allowed),
    customRulesText: rules?.custom_rules_text || '',
    pickupLocationName: profile?.pickup_location_name || '',
    pickupAddress: profile?.pickup_address || '',
    pickupLat: profile?.pickup_lat ?? '',
    pickupLng: profile?.pickup_lng ?? '',
    deliveryAvailable: Boolean(profile?.delivery_available),
    deliveryRadiusKm: profile?.delivery_radius_km ?? '',
    deliveryFeeAmount: profile?.delivery_fee_amount ?? '',
    pickupNotes: profile?.pickup_notes || '',
    dropoffNotes: profile?.dropoff_notes || '',
    workingDays: toStringArray(profile?.working_days),
    workingHoursStart: workingHours?.start || '',
    workingHoursEnd: workingHours?.end || '',
    blockedDates: toStringArray(profile?.blocked_dates),
    advanceNoticeHours: profile?.advance_notice_hours ?? '',
    minimumBookingHours: profile?.minimum_booking_hours ?? '',
    maximumBookingDays: profile?.maximum_booking_days ?? '',
    availabilityNote: availability?.note || '',
    termsTemplateKey: profile?.terms_template_key || 'standard_owner_terms',
    customTermsText: profile?.custom_terms_text || '',
    termsAcceptedForSubmission: Boolean(profile?.terms_accepted_for_submission),
    lastMaintenanceDate: profile?.last_maintenance_date || '',
    insuranceIncluded:
      profile?.insurance_included === null || profile?.insurance_included === undefined
        ? ''
        : Boolean(profile?.insurance_included),
    insuranceNotes: profile?.insurance_notes || '',
    roadsideAssistanceIncluded: Boolean(profile?.roadside_assistance_included),
    helmetIncluded: Boolean(safetyInfo?.helmet_included),
    registrationVerified: Boolean(safetyInfo?.registration_verified),
    inspectionCompleted: Boolean(safetyInfo?.inspection_completed),
    safetyNotes: safetyInfo?.notes || '',
    verificationNotes: profile?.verification_notes || '',
    rawProfile: profile || null,
    rawListing: listing || null,
  };
};

const buildPayloads = ({ ownerId, accountType, metadata = {}, formData, submitForReview = false, existingListing = null }) => {
  const cleanMedia = toArrayMedia(formData.media);
  const coverImageUrl = String(formData.coverImageUrl || '').trim() || cleanMedia[0]?.url || null;
  const normalizedOwnerType = ['individual_owner', 'operator', 'owner'].includes(String(accountType || '').trim())
    ? String(accountType).trim()
    : 'individual_owner';
  const listingStatus = submitForReview ? 'pending_review' : normalizeStatus(existingListing?.listing_status || 'draft');
  const nextListingStatus = ['pending_review', 'approved', 'live'].includes(listingStatus) && !submitForReview
    ? listingStatus
    : listingStatus;

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
    minimum_booking_hours: optionalInteger(formData.minimumBookingHours),
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
    listing_status: nextListingStatus,
    review_status: submitForReview ? 'pending' : normalizeStatus(existingListing?.review_status || 'not_submitted'),
    moderation_status: submitForReview ? 'pending' : normalizeStatus(existingListing?.moderation_status || 'not_reviewed'),
    booking_mode: 'request',
    title: String(formData.listingTitle || `${profilePayload.brand_name} ${profilePayload.model_name}`).trim(),
    currency_code: String(formData.currencyCode || 'MAD').trim() || 'MAD',
    hourly_price_amount: optionalNumber(formData.hourlyPriceAmount),
    daily_price_amount: optionalNumber(formData.dailyPriceAmount),
    weekly_price_amount: optionalNumber(formData.weeklyPriceAmount),
    monthly_price_amount: optionalNumber(formData.monthlyPriceAmount),
    deposit_amount: optionalNumber(formData.depositAmount),
    included_km: optionalInteger(formData.mileageLimitKm),
    extra_km_rate: optionalNumber(formData.extraKmRate),
    seasonal_pricing: Array.isArray(formData.seasonalPricing) ? formData.seasonalPricing : [],
    pricing: {
      hourly: optionalNumber(formData.hourlyPriceAmount),
      daily: optionalNumber(formData.dailyPriceAmount),
      weekly: optionalNumber(formData.weeklyPriceAmount),
      monthly: optionalNumber(formData.monthlyPriceAmount),
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

export const validateOwnerVehicleForm = (formData, submitForReview = false) => {
  const errors = {};

  if (!String(formData.brandName || '').trim()) errors.brandName = 'Brand is required.';
  if (!String(formData.modelName || '').trim()) errors.modelName = 'Model is required.';
  if (!String(formData.categoryCode || '').trim()) errors.categoryCode = 'Category is required.';
  if (!String(formData.cityName || '').trim()) errors.cityName = 'City is required.';

  if (submitForReview) {
    if (!formData.hourlyPriceAmount && !formData.dailyPriceAmount && !formData.weeklyPriceAmount && !formData.monthlyPriceAmount) {
      errors.pricing = 'Add at least one rental price before review.';
    }
    if (formData.depositAmount === '' || formData.depositAmount === null || formData.depositAmount === undefined) {
      errors.depositAmount = 'Security deposit is required before review.';
    }
    if (!String(formData.coverImageUrl || '').trim() && toArrayMedia(formData.media).length === 0) {
      errors.media = 'Add at least one image URL before review.';
    }
  }

  return errors;
};

class BusinessMarketplaceService {
  static async getOwnerVehicles(ownerId) {
    if (!ownerId) {
      return { vehicles: [], setupRequired: false, error: null };
    }

    const { data: profiles, error: profileError } = await supabase
      .from(VEHICLE_PROFILES_TABLE)
      .select('*')
      .eq('owner_id', ownerId)
      .order('updated_at', { ascending: false });

    if (profileError) {
      return {
        vehicles: [],
        setupRequired: setupErrorCodes.has(String(profileError.code || '')),
        error: profileError,
      };
    }

    const profileRows = profiles || [];
    const profileIds = profileRows.map((profile) => profile.id).filter(Boolean);

    let listingsByProfileId = new Map();
    if (profileIds.length > 0) {
      const { data: listings, error: listingError } = await supabase
        .from(MARKETPLACE_LISTINGS_TABLE)
        .select('*')
        .in('vehicle_public_profile_id', profileIds)
        .order('updated_at', { ascending: false });

      if (listingError) {
        return {
          vehicles: profileRows.map((profile) => normalizeOwnerVehicle(profile, null)),
          setupRequired: setupErrorCodes.has(String(listingError.code || '')),
          error: listingError,
        };
      }

      listingsByProfileId = new Map(
        (listings || []).map((listing) => [String(listing.vehicle_public_profile_id), listing])
      );
    }

    const normalizedVehicles = profileRows.map((profile) =>
      normalizeOwnerVehicle(profile, listingsByProfileId.get(String(profile.id)))
    );

    try {
      return {
        vehicles: await enrichVehiclesWithModeration(ownerId, normalizedVehicles, listingsByProfileId),
        setupRequired: false,
        error: null,
      };
    } catch (moderationError) {
      return {
        vehicles: normalizedVehicles,
        setupRequired: setupErrorCodes.has(String(moderationError.code || '')),
        error: moderationError,
      };
    }
  }

  static async getOwnerVehicle(ownerId, vehicleId) {
    if (!ownerId || !vehicleId) {
      return { vehicle: null, setupRequired: false, error: null };
    }

    const { data: profile, error: profileError } = await supabase
      .from(VEHICLE_PROFILES_TABLE)
      .select('*')
      .eq('owner_id', ownerId)
      .eq('id', vehicleId)
      .maybeSingle();

    if (profileError) {
      return {
        vehicle: null,
        setupRequired: setupErrorCodes.has(String(profileError.code || '')),
        error: profileError,
      };
    }

    if (!profile) {
      return { vehicle: null, setupRequired: false, error: null };
    }

    const { data: listing, error: listingError } = await supabase
      .from(MARKETPLACE_LISTINGS_TABLE)
      .select('*')
      .eq('owner_id', ownerId)
      .eq('vehicle_public_profile_id', vehicleId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (listingError) {
      return {
        vehicle: normalizeOwnerVehicleForForm(profile, null),
        setupRequired: setupErrorCodes.has(String(listingError.code || '')),
        error: listingError,
      };
    }

    const vehicle = normalizeOwnerVehicleForForm(profile, listing);

    if (!listing?.id) {
      return {
        vehicle,
        setupRequired: false,
        error: null,
      };
    }

    const [historyResponse, messagesResponse] = await Promise.all([
      supabase
        .from(MARKETPLACE_MODERATION_HISTORY_TABLE)
        .select('*')
        .eq('listing_id', listing.id)
        .order('created_at', { ascending: false }),
      supabase
        .from(MARKETPLACE_MESSAGES_TABLE)
        .select('*')
        .eq('listing_id', listing.id)
        .order('created_at', { ascending: false }),
    ]);

    if (historyResponse.error && !setupErrorCodes.has(String(historyResponse.error.code || ''))) {
      return {
        vehicle,
        setupRequired: false,
        error: historyResponse.error,
      };
    }

    if (messagesResponse.error && !setupErrorCodes.has(String(messagesResponse.error.code || ''))) {
      return {
        vehicle,
        setupRequired: false,
        error: messagesResponse.error,
      };
    }

    return {
      vehicle: {
        ...vehicle,
        moderationHistory: (historyResponse.data || []).map((item) => ({
          id: item.id,
          actionType: item.action_type || 'message_sent',
          reason: item.reason || '',
          feedback: item.feedback || '',
          suggestions: Array.isArray(item.suggestions) ? item.suggestions : [],
          createdAt: item.created_at || null,
        })),
        ownerMessages: (messagesResponse.data || []).map((item) => ({
          id: item.id,
          senderType: item.sender_type || 'admin',
          messageType: item.message_type || 'message',
          body: item.body || '',
          createdAt: item.created_at || null,
        })),
      },
      setupRequired: false,
      error: null,
    };
  }

  static async saveOwnerVehicle({ ownerId, accountType, metadata, vehicleId, formData, submitForReview = false }) {
    if (!ownerId) {
      throw new Error('You must be signed in to save a marketplace vehicle.');
    }

    const errors = validateOwnerVehicleForm(formData, submitForReview);
    if (Object.keys(errors).length > 0) {
      const firstError = Object.values(errors)[0];
      throw new Error(firstError);
    }

    let existingListing = null;
    if (vehicleId) {
      const { data: listing } = await supabase
        .from(MARKETPLACE_LISTINGS_TABLE)
        .select('*')
        .eq('owner_id', ownerId)
        .eq('vehicle_public_profile_id', vehicleId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

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

    let savedProfile;
    let compatibleProfilePayload = { ...profilePayload };

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const { data, error } = vehicleId
        ? await supabase
            .from(VEHICLE_PROFILES_TABLE)
            .update(compatibleProfilePayload)
            .eq('id', vehicleId)
            .eq('owner_id', ownerId)
            .select('*')
            .single()
        : await supabase
            .from(VEHICLE_PROFILES_TABLE)
            .insert(compatibleProfilePayload)
            .select('*')
            .single();

      if (!error) {
        savedProfile = data;
        break;
      }

      const missingColumn = getMissingSchemaColumn(error);
      if (missingColumn && Object.prototype.hasOwnProperty.call(compatibleProfilePayload, missingColumn)) {
        if (REQUIRED_PROFILE_COLUMNS.has(missingColumn)) {
          throw new Error(
            `Marketplace vehicle setup is incomplete: required column "${missingColumn}" is missing in app_vehicle_public_profiles. Run the latest marketplace compatibility SQL patch, then save again.`
          );
        }
        const { [missingColumn]: _removed, ...nextPayload } = compatibleProfilePayload;
        compatibleProfilePayload = nextPayload;
        continue;
      }

      const notNullColumn = getNotNullSchemaColumn(error);
      const legacyValue = getLegacyMarketplaceColumnValue({ column: notNullColumn, ownerId, formData });
      if (
        legacyValue !== undefined &&
        !Object.prototype.hasOwnProperty.call(compatibleProfilePayload, notNullColumn)
      ) {
        compatibleProfilePayload = {
          ...compatibleProfilePayload,
          [notNullColumn]: legacyValue,
        };
        continue;
      }

      throw error;
    }

    if (!savedProfile) {
      throw new Error('Unable to save vehicle profile with the current marketplace schema.');
    }

    const listingWithProfile = {
      ...listingPayload,
      vehicle_public_profile_id: savedProfile.id,
    };

    let savedListing;
    let compatibleListingPayload = { ...listingWithProfile };

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const { data, error } = existingListing?.id
        ? await supabase
            .from(MARKETPLACE_LISTINGS_TABLE)
            .update(compatibleListingPayload)
            .eq('id', existingListing.id)
            .eq('owner_id', ownerId)
            .select('*')
            .single()
        : await supabase
            .from(MARKETPLACE_LISTINGS_TABLE)
            .insert(compatibleListingPayload)
            .select('*')
            .single();

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

    if (!savedListing) {
      throw new Error('Unable to save marketplace listing with the current schema.');
    }

    return {
      vehicle: normalizeOwnerVehicleForForm(savedProfile, savedListing),
      submitted: submitForReview,
    };
  }

  static async getOwnerRequests(ownerId, status = 'all') {
    if (!ownerId) {
      return { requests: [], setupRequired: false, error: null };
    }

    let query = supabase
      .from(BOOKING_REQUESTS_TABLE)
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('request_status', status);
    }

    const { data: requests, error: requestError } = await query;

    if (requestError) {
      return {
        requests: [],
        setupRequired: setupErrorCodes.has(String(requestError.code || '')),
        error: requestError,
      };
    }

    const requestRows = requests || [];
    const listingIds = [...new Set(requestRows.map((request) => request.listing_id).filter(Boolean))];

    let listingsById = new Map();
    let profilesById = new Map();

    if (listingIds.length > 0) {
      const { data: listings, error: listingError } = await supabase
        .from(MARKETPLACE_LISTINGS_TABLE)
        .select('*')
        .eq('owner_id', ownerId)
        .in('id', listingIds);

      if (listingError) {
        return {
          requests: requestRows.map((request) => normalizeOwnerRequest(request, null, null)),
          setupRequired: setupErrorCodes.has(String(listingError.code || '')),
          error: listingError,
        };
      }

      listingsById = new Map((listings || []).map((listing) => [String(listing.id), listing]));
      const profileIds = [...new Set((listings || []).map((listing) => listing.vehicle_public_profile_id).filter(Boolean))];

      if (profileIds.length > 0) {
        const { data: profiles, error: profileError } = await supabase
          .from(VEHICLE_PROFILES_TABLE)
          .select('*')
          .eq('owner_id', ownerId)
          .in('id', profileIds);

        if (profileError) {
          return {
            requests: requestRows.map((request) => normalizeOwnerRequest(request, listingsById.get(String(request.listing_id)), null)),
            setupRequired: setupErrorCodes.has(String(profileError.code || '')),
            error: profileError,
          };
        }

        profilesById = new Map((profiles || []).map((profile) => [String(profile.id), profile]));
      }
    }

    return {
      requests: requestRows.map((request) => {
        const listing = listingsById.get(String(request.listing_id)) || null;
        const profile = listing ? profilesById.get(String(listing.vehicle_public_profile_id)) || null : null;
        return normalizeOwnerRequest(request, listing, profile);
      }),
      setupRequired: false,
      error: null,
    };
  }

  static async updateOwnerRequest(ownerId, requestId, updates) {
    if (!ownerId || !requestId) {
      throw new Error('Missing request context.');
    }

    const { data, error } = await supabase
      .from(BOOKING_REQUESTS_TABLE)
      .update(updates)
      .eq('id', requestId)
      .eq('owner_id', ownerId)
      .select('*')
      .single();

    if (error) throw error;
    return data;
  }

  static acceptRequest(ownerId, requestId, message = '') {
    return this.updateOwnerRequest(ownerId, requestId, {
      request_status: 'accepted',
      owner_response: String(message || '').trim() || 'Accepted by owner.',
      accepted_at: new Date().toISOString(),
      closed_at: null,
    });
  }

  static declineRequest(ownerId, requestId, reason = '') {
    return this.updateOwnerRequest(ownerId, requestId, {
      request_status: 'declined',
      owner_response: String(reason || '').trim() || 'Declined by owner.',
      declined_at: new Date().toISOString(),
      closed_at: new Date().toISOString(),
    });
  }

  static sendCounterOffer(ownerId, requestId, counterOffer = {}) {
    return this.updateOwnerRequest(ownerId, requestId, {
      request_status: 'negotiated',
      owner_response: String(counterOffer.message || '').trim() || 'Counter offer sent.',
      counter_offer: {
        price_amount: optionalNumber(counterOffer.priceAmount),
        message: String(counterOffer.message || '').trim(),
        sent_at: new Date().toISOString(),
      },
      negotiated_at: new Date().toISOString(),
      closed_at: null,
    });
  }
}

export default BusinessMarketplaceService;
