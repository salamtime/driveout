import { supabase } from '../lib/supabase';
import { adminApiRequest } from './adminApi';
import { deriveEffectiveRentalStatus } from '../utils/rentalLifecycle';
import { calculateSimpleRentalPricing, isPackagePricingEnabled } from '../utils/simpleRentalPricing';
import { normalizePaymentStatus } from '../config/statusColors';
import { createTimedRequestCache } from '../utils/requestCache';
import {
  calculateMarketplaceCommission,
  getMarketplaceApprovalHoldExpiry,
  getMarketplaceChatGraceExpiry,
  getMarketplaceRequestDisplay,
  isMarketplaceChatUnlocked,
  normalizeMarketplaceRequestLifecycleStatus,
} from '../utils/marketplaceRequestState';
import walletTopupApi from './walletTopupApi';
import RentalEventService from './RentalEventService';

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const cleanOptionalValue = (value) => {
  if (value === undefined || value === null || value === '') return null;
  return value;
};

const normalizeComparableText = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const buildCustomerNameCandidates = (fullName, email) => {
  const normalizedFullName = String(fullName || '').trim();
  const localPart = String(email || '').split('@')[0]?.trim() || '';
  const firstName = normalizedFullName.split(/\s+/).filter(Boolean)[0] || '';
  const alphaPrefix = localPart.match(/[a-zA-Z]+/)?.[0] || '';

  return [...new Set([normalizedFullName, firstName, localPart, alphaPrefix].filter(Boolean))];
};

const isLikelyCustomerNameMatch = (rowCustomerName, nameCandidates) => {
  const normalizedRowName = normalizeComparableText(rowCustomerName);
  if (!normalizedRowName) return false;

  return nameCandidates.some((candidate) => {
    const normalizedCandidate = normalizeComparableText(candidate);
    if (!normalizedCandidate) return false;

    return (
      normalizedCandidate === normalizedRowName ||
      normalizedCandidate.includes(normalizedRowName) ||
      normalizedRowName.includes(normalizedCandidate)
    );
  });
};

const normalizeStatus = (row) =>
  String(deriveEffectiveRentalStatus(row) || row?.rental_status || row?.status || '').toLowerCase();

const WEBSITE_BOOKING_SOURCE_FIELDS = [
  'booking_source',
  'rental_source',
  'source',
  'channel',
  'origin',
  'created_via',
];

const WEBSITE_BOOKING_SOURCE_KEYWORDS = [
  'website',
  'web',
  'online',
  'customer',
  'self',
  'public',
];

const isWebsiteCustomerBooking = (row = {}) =>
  WEBSITE_BOOKING_SOURCE_FIELDS.some((field) => {
    const value = row?.[field];
    if (value === null || value === undefined) return false;
    const normalizedValue = String(value).trim().toLowerCase();
    return WEBSITE_BOOKING_SOURCE_KEYWORDS.some((keyword) => normalizedValue.includes(keyword));
  });

const normalizeDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const customerRequestCache = createTimedRequestCache(30000);

const buildCustomerCacheIdentity = (user) => {
  const userId = String(user?.id || '').trim();
  if (userId) return userId;
  return String(user?.email || '').trim().toLowerCase();
};

const buildCustomerCacheKey = (scope, user, suffix = '') => {
  const identity = buildCustomerCacheIdentity(user);
  return `${scope}:${identity || 'anonymous'}${suffix ? `:${suffix}` : ''}`;
};

const getLoyaltyTier = (points = 0) => {
  if (points >= 3000) return 'VIP';
  if (points >= 1500) return 'Gold';
  if (points >= 700) return 'Silver';
  return 'Standard';
};

const buildVehicleLabel = (vehicle = {}) => {
  const modelName = [vehicle?.name, vehicle?.model].filter(Boolean).join(' ').trim();
  const plate = vehicle?.plate_number || 'No plate';
  return [plate, modelName || 'Vehicle'].filter(Boolean).join(' • ');
};

const buildVehicleImageUrl = (vehicle = {}) =>
  vehicle?.vehicle_model?.image_url ||
  vehicle?.image_url ||
  '';

const normalizeRentalRecord = (row = {}) => {
  const vehicle = row.vehicle || {};
  const linkedPackage = row.package || null;
  const linkedReport = row.vehicleReport || row.vehicle_report || null;
  const linkedMaintenance = row.linkedMaintenance || row.linked_maintenance || linkedReport?.maintenance || null;
  const startDate = normalizeDate(row.rental_start_date || row.started_at || row.created_at);
  const endDate = normalizeDate(row.actual_end_date || row.rental_end_date || row.completed_at || row.created_at);
  const total = Math.max(0, toNumber(row.total_amount || row.pending_total_request || row.unit_price));
  const outstanding = Math.max(0, toNumber(row.remaining_amount));
  const depositAmount = Math.max(0, toNumber(row.damage_deposit || row.deposit_amount));
  const inferredPaid = total > 0 ? Math.max(0, total - outstanding) : 0;
  const paid = Math.max(0, toNumber(row.paid_amount || row.amount_paid || inferredPaid || row.deposit_amount));
  const status = normalizeStatus(row);
  const category = String(vehicle.vehicle_type || 'ATV');
  const modelName = [vehicle.name, vehicle.model].filter(Boolean).join(' ').trim() || 'Vehicle';
  const quantityHours = Number(row.quantity_hours || 0) || 0;
  const quantityDays = Number(row.quantity_days || 0) || 0;
  const packagePricingEnabled = isPackagePricingEnabled(row);
  const packageName =
    cleanOptionalValue(row.selected_package_name) ||
    cleanOptionalValue(linkedPackage?.name) ||
    cleanOptionalValue(linkedPackage?.title) ||
    '';
  const packageFixedAmount = toNumber(row.selected_package_fixed_amount || linkedPackage?.fixed_amount || row.unit_price);
  const packageIncludedKilometers =
    cleanOptionalValue(row.selected_package_total_included_km) ??
    cleanOptionalValue(row.package_total_included_km) ??
    cleanOptionalValue(row.selected_package_included_km) ??
    cleanOptionalValue(linkedPackage?.included_kilometers) ??
    null;
  const packageExtraRate =
    cleanOptionalValue(row.selected_package_extra_rate) ??
    cleanOptionalValue(linkedPackage?.extra_km_rate) ??
    null;
  const sourceType = String(row.marketplace_request_id ? 'marketplace' : 'certified');
  const depositMode = sourceType === 'marketplace' ? 'external' : String(row.deposit_mode || 'platform').trim().toLowerCase();
  const approvedExtensions = (Array.isArray(row.extensions) ? row.extensions : []).filter((extension) =>
    ['approved', 'completed', 'active'].includes(String(extension?.status || '').toLowerCase())
  );
  const totalExtensionFees = approvedExtensions.reduce((sum, extension) => (
    sum + Math.max(0, toNumber(extension?.extension_price))
  ), 0);
  const extensionHours = approvedExtensions.reduce((sum, extension) => (
    sum + Math.max(0, toNumber(extension?.extension_hours))
  ), 0);
  const extraKilometers = Math.max(
    0,
    toNumber(
      row.extra_kilometers ??
      row.overage_kilometers ??
      row.total_extra_km
    )
  );
  const extraKmRateApplied = Math.max(
    0,
    toNumber(
      row.extra_km_rate_applied ??
      row.selected_package_extra_rate ??
      linkedPackage?.extra_km_rate
    )
  );
  const overageCharge = Math.max(
    0,
    toNumber(
      row.overage_charge_total ??
      row.extra_km_charge ??
      row.extra_kilometer_charge ??
      (extraKilometers > 0 && extraKmRateApplied > 0 ? extraKilometers * extraKmRateApplied : 0)
    )
  );
  const maintenanceRepairAmount = Math.max(
    0,
    toNumber(
      linkedReport?.maintenance_cost_total ??
      row.linked_maintenance_cost_total ??
      linkedMaintenance?.cost
    )
  );
  const maintenanceStayAmount = Math.max(
    0,
    toNumber(
      linkedReport?.maintenance_daily_total ??
      row.linked_maintenance_daily_total
    )
  );
  const maintenanceDiscountAmount = Math.max(
    0,
    toNumber(
      linkedReport?.maintenance_daily_discount ??
      row.linked_maintenance_daily_discount
    )
  );
  const maintenanceCustomerChargeTotal = Math.max(
    0,
    toNumber(
      linkedReport?.customer_charge_amount ??
      row.linked_maintenance_customer_charge_total ??
      maintenanceRepairAmount + maintenanceStayAmount
    )
  );
  const simplePricingSummary = calculateSimpleRentalPricing({
    startTime: row.started_at || row.rental_start_date || startDate,
    endTime: row.actual_end_date || row.rental_end_date || endDate,
    gracePeriodMinutes: Number(row.booking_grace_period_minutes || row.rental_grace_period_minutes || 60),
    hourlyRate: Number(vehicle.hourly_rate || row.unit_price || 0),
    totalKmUsed: Math.max(0, toNumber(row.total_kilometers_driven || row.total_distance)),
    packages: [linkedPackage].filter(Boolean),
    usePackagePricing: packagePricingEnabled,
  });
  const normalizedPaymentStatus = normalizePaymentStatus(row.payment_status, outstanding);
  const normalizeEvidencePhotos = (photos = []) =>
    (Array.isArray(photos) ? photos : [])
      .map((photo, index) => ({
        id: String(photo?.id || `evidence-photo-${index}`).trim(),
        publicUrl: String(photo?.publicUrl || photo?.public_url || '').trim(),
        thumbnailUrl: String(photo?.thumbnailUrl || photo?.thumbnail_url || photo?.publicUrl || photo?.public_url || '').trim(),
        originalFilename: String(photo?.originalFilename || photo?.original_filename || '').trim(),
        createdAt: normalizeDate(photo?.createdAt || photo?.created_at),
      }))
      .filter((photo) => photo.publicUrl || photo.thumbnailUrl);
  const rawOwnerExecution =
    row?.ownerExecution && typeof row.ownerExecution === 'object'
      ? row.ownerExecution
      : row?.owner_execution && typeof row.owner_execution === 'object'
        ? row.owner_execution
        : row?.marketplaceRequestCounterOffer?.owner_execution && typeof row.marketplaceRequestCounterOffer.owner_execution === 'object'
          ? row.marketplaceRequestCounterOffer.owner_execution
          : row?.marketplace_request_counter_offer?.owner_execution && typeof row.marketplace_request_counter_offer.owner_execution === 'object'
            ? row.marketplace_request_counter_offer.owner_execution
            : {};
  const ownerExecution = {
    handoffPhotos: normalizeEvidencePhotos(rawOwnerExecution?.handoffPhotos),
    returnPhotos: normalizeEvidencePhotos(rawOwnerExecution?.returnPhotos),
  };

  return {
    id: String(row.id),
    rentalId: row.rental_id || `RNT-${row.id}`,
    status,
    sourceType,
    bookingSource: row.booking_source || row.inventory_source || row.booking_mode || '',
    isWebsiteBooking: isWebsiteCustomerBooking(row),
    paymentStatus: normalizedPaymentStatus,
    total,
    paid,
    outstanding,
    depositAmount,
    depositReturnAmount: Math.max(0, toNumber(row.deposit_return_amount)),
    depositReturnedAt: row.deposit_returned_at || null,
    startDate,
    endDate,
    startedAt: normalizeDate(row.started_at),
    createdAt: normalizeDate(row.created_at),
    category,
    modelName,
    vehicleLabel: buildVehicleLabel(vehicle),
    vehicleImageUrl: buildVehicleImageUrl(vehicle),
    city: row.pickup_city || vehicle.city || 'Tangier',
    country: row.pickup_country || vehicle.country || 'Morocco',
    customerName: row.customer_name || '',
    customerEmail: row.customer_email || row.email || '',
    customerPhone: row.customer_phone || row.phone || '',
    pickupLocation: row.pickup_location || vehicle.location || vehicle.city || '',
    returnLocation: row.return_location || row.dropoff_location || vehicle.location || vehicle.city || '',
    fuelCharge: Math.max(0, toNumber(row.fuel_charge)),
    fuelChargeEnabled: row.fuel_charge_enabled !== false,
    contractSigned: Boolean(row.contract_signed || row.signature_url),
    receiptIssued: Boolean(row.receipt_issued || normalizedPaymentStatus === 'paid'),
    rentalType: String(row.rental_type || (quantityDays > 0 ? 'daily' : 'hourly')),
    quantityHours,
    quantityDays,
    quantityLabel: quantityHours > 0 ? `${quantityHours}h` : quantityDays > 0 ? `${quantityDays}d` : '',
    durationMinutes: simplePricingSummary.durationMinutes,
    billedHours: simplePricingSummary.billedHours,
    hourlyRateApplied: simplePricingSummary.hourlyRate,
    calculatedTimePrice: simplePricingSummary.totalPrice,
    packageId: packagePricingEnabled ? (cleanOptionalValue(row.selected_package_id) || cleanOptionalValue(row.package_id) || linkedPackage?.id || null) : null,
    selectedPackageName: packagePricingEnabled ? packageName : '',
    packageName: packagePricingEnabled ? packageName : '',
    packageFixedAmount: packagePricingEnabled ? packageFixedAmount : 0,
    includedKilometers: packagePricingEnabled ? packageIncludedKilometers : null,
    extraKmRate: packagePricingEnabled ? packageExtraRate : 0,
    totalKilometersDriven: Math.max(0, toNumber(row.total_kilometers_driven)),
    extraKilometers: packagePricingEnabled ? extraKilometers : 0,
    extraKmRateApplied: packagePricingEnabled ? extraKmRateApplied : 0,
    overageCharge: packagePricingEnabled ? overageCharge : 0,
    depositMode,
    depositStatus: depositMode === 'external'
      ? (depositAmount > 0 ? 'external' : 'none')
      : row.deposit_returned_at ? 'returned' : depositAmount > 0 ? 'held' : 'none',
    extensions: Array.isArray(row.extensions) ? row.extensions : [],
    approvedExtensions,
    extensionHours,
    totalExtensionFees,
    vehicleReport: linkedReport,
    vehicle_report: linkedReport,
    linkedMaintenance,
    linked_maintenance: linkedMaintenance,
    maintenanceRepairAmount,
    maintenanceStayAmount,
    maintenanceDiscountAmount,
    maintenanceCustomerChargeTotal,
    vehicle,
    package: packagePricingEnabled ? linkedPackage : null,
    ownerExecution,
    owner_execution: ownerExecution,
    raw: row,
    href: `/rent?category=${encodeURIComponent(String(category).toLowerCase())}&search=${encodeURIComponent(modelName)}`,
    documentLinks: {
      contract: `/view/rental/${encodeURIComponent(row.id)}?type=contract`,
      receipt: `/view/rental/${encodeURIComponent(row.id)}?type=receipt`,
    },
  };
};

const normalizeMarketplaceRequestRecord = (row = {}) => {
  const listing = row?.listing || {};
  const profile = row?.profile || {};
  const requestStatus = normalizeMarketplaceRequestLifecycleStatus(row);
  const requestDisplay = getMarketplaceRequestDisplay(requestStatus);
  const duration = toNumber(row?.duration || 0);
  const rentalType = String(row?.rental_type || 'hourly').trim().toLowerCase();
  const counterOffer = row?.counter_offer && typeof row.counter_offer === 'object' ? row.counter_offer : {};
  const counterPrice = toNumber(counterOffer?.price_amount);
  const hourlyPrice = toNumber(listing?.hourly_price_amount);
  const dailyPrice = toNumber(listing?.daily_price_amount);
  const estimatedAmount = counterPrice > 0
    ? counterPrice
    : rentalType === 'daily'
      ? dailyPrice * Math.max(1, duration)
      : hourlyPrice * Math.max(1, duration);

  return {
    id: String(row?.id || ''),
    requestReference: String(
      row?.requestReference ||
      row?.request_reference ||
      row?.reference ||
      ''
    ).trim(),
    listingId: row?.listing_id || null,
    vehiclePublicProfileId: row?.vehicle_public_profile_id || null,
    requestStatus,
    requestStatusLabel: requestDisplay.label,
    requestStatusTone: requestDisplay.tone,
    customerMessage: row?.customer_message || '',
    ownerResponse: row?.owner_response || '',
    requestedStartAt: normalizeDate(row?.requested_start_at),
    requestedEndAt: normalizeDate(row?.requested_end_at),
    createdAt: normalizeDate(row?.created_at),
    updatedAt: normalizeDate(row?.updated_at || row?.created_at),
    acceptedAt: normalizeDate(row?.accepted_at),
    declinedAt: normalizeDate(row?.declined_at),
    negotiatedAt: normalizeDate(row?.negotiated_at),
    rentalType,
    duration,
    listingTitle:
      listing?.title ||
      [profile?.brand_name, profile?.model_name].filter(Boolean).join(' ') ||
      'Marketplace vehicle',
    cityName: profile?.city_name || 'Tangier',
    areaName: profile?.area_name || '',
    coverImageUrl: profile?.cover_image_url || '',
    currencyCode: listing?.currency_code || 'MAD',
    estimatedAmount,
    commissionAmount: toNumber(counterOffer?.platform_fee_amount) || calculateMarketplaceCommission(estimatedAmount),
    damageDepositAmount: toNumber(counterOffer?.damage_deposit_amount || row?.damage_deposit || row?.deposit_amount),
    platformFeeStatus: String(counterOffer?.platform_fee_status || '').trim().toLowerCase(),
    damageDepositStatus: String(counterOffer?.damage_deposit_status || '').trim().toLowerCase(),
    chatUnlockedAt: normalizeDate(counterOffer?.chat_unlocked_at || row?.approved_at),
    chatGraceExpiresAt: normalizeDate(getMarketplaceChatGraceExpiry(counterOffer, row?.approved_at)),
    depositMode: 'external',
    chatUnlocked: isMarketplaceChatUnlocked(requestStatus),
    readOnlyReason: requestDisplay.readOnlyReason,
    counterOffer,
    holdExpiresAt: normalizeDate(getMarketplaceApprovalHoldExpiry(counterOffer, row?.accepted_at)),
    reminderSentAt: normalizeDate(counterOffer?.customer_reminder_sent_at),
    eventLog: Array.isArray(row?.eventLog) ? row.eventLog : [],
    raw: row,
  };
};

const mapRentalEventToTimelineItem = (event = {}, index = 0) => ({
  key: String(event?.id || `${event?.eventType || 'event'}-${index}`),
  label: String(event?.label || event?.eventType || 'Rental event').trim(),
  at: event?.createdAt || null,
});

const mergeTimelineWithRentalEvents = (baseTimeline = [], eventLog = []) =>
  [
    ...(Array.isArray(eventLog) ? eventLog : []).map(mapRentalEventToTimelineItem),
    ...(Array.isArray(baseTimeline) ? baseTimeline : []),
  ]
    .filter((item) => item?.at)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .filter((item, index, items) => {
      const normalizedLabel = String(item?.label || '').trim().toLowerCase();
      const normalizedAt = String(item?.at || '').trim();
      return index === items.findIndex((candidate) =>
        String(candidate?.label || '').trim().toLowerCase() === normalizedLabel &&
        String(candidate?.at || '').trim() === normalizedAt
      );
    });

const normalizeTourStatus = (status) => String(status || 'scheduled').trim().toLowerCase();

const normalizeTourRecord = (row = {}) => {
  const scheduledFor = normalizeDate(row?.scheduledFor || row?.scheduled_for || row?.scheduled_for_at || row?.scheduled_date);
  const scheduledEndAt = normalizeDate(row?.scheduledEndAt || row?.scheduled_end_at);
  const createdAt = normalizeDate(row?.createdAt || row?.created_at);
  const updatedAt = normalizeDate(row?.updatedAt || row?.updated_at || row?.created_at);
  const totalAmount = Math.max(0, toNumber(row?.totalAmountMad || row?.total_amount_mad || row?.total_amount));
  const remainingAmount = Math.max(0, toNumber(row?.remainingAmountMad || row?.remaining_amount_mad || row?.remaining_amount));
  const paidAmount = Math.max(0, toNumber(row?.paidAmountMad || row?.paid_amount_mad || (totalAmount - remainingAmount)));
  const status = normalizeTourStatus(row?.status);
  const operatorName = String(
    row?.operatorName ||
    row?.tenantName ||
    row?.organizationName ||
    row?.companyName ||
    row?.metadata?.operatorName ||
    row?.metadata?.tenantName ||
    row?.metadata?.organizationName ||
    row?.metadata?.companyName ||
    'Tour operator'
  ).trim();

  return {
    id: String(row?.id || row?.groupId || ''),
    groupId: String(row?.groupId || row?.id || ''),
    status,
    packageName: String(row?.packageName || 'Tour package').trim(),
    routeType: String(row?.routeType || '').trim(),
    location: String(row?.location || '').trim(),
    scheduledFor,
    scheduledEndAt,
    scheduledDate: String(row?.scheduledDate || '').trim(),
    scheduledTime: String(row?.scheduledTime || '').trim(),
    createdAt,
    updatedAt,
    totalAmount,
    remainingAmount,
    paidAmount,
    paymentStatus: String(row?.paymentStatus || (remainingAmount > 0 ? 'pending' : 'paid')).trim().toLowerCase(),
    customerName: String(row?.customerName || '').trim(),
    customerEmail: String(row?.customerEmail || '').trim(),
    customerPhone: String(row?.customerPhone || '').trim(),
    guideName: String(row?.guideName || '').trim(),
    guideId: String(row?.guideId || '').trim(),
    operatorName,
    quadCount: Math.max(1, Number(row?.quadCount || 1) || 1),
    ridersCount: Math.max(1, Number(row?.ridersCount || row?.quadCount || 1) || 1),
    durationHours: Math.max(0, Number(row?.durationHours || 0) || 0),
    assignmentMode: String(row?.assignmentMode || 'assign_on_arrival').trim().toLowerCase(),
    requiresLicense: Boolean(row?.requiresLicense),
    shareContract: Boolean(row?.shareContract),
    receiptIssued: Boolean(row?.receiptIssued),
    receiptIssuedAt: normalizeDate(row?.receiptIssuedAt),
    trackingUrl: String(row?.trackingUrl || '').trim(),
    startedAt: normalizeDate(row?.startedAt),
    completedAt: normalizeDate(row?.completedAt),
    cancelledAt: normalizeDate(row?.cancelledAt),
    selectedModelMix: Array.isArray(row?.selectedModelMix) ? row.selectedModelMix : [],
    rows: Array.isArray(row?.rows) ? row.rows : [],
    metadata: row?.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    documents: {
      contractShared: Boolean(row?.shareContract),
      receiptIssued: Boolean(row?.receiptIssued),
    },
  };
};

class CustomerExperienceService {
  async getCustomerAccessContext(user, options = {}) {
    const authUser = user?.id ? user : null;
    const email = String(authUser?.email || '').trim().toLowerCase();
    const fullName = String(
      authUser?.user_metadata?.full_name ||
      authUser?.user_metadata?.name ||
      ''
    ).trim();

    if (!authUser && !email) {
      return {
        customerId: null,
        email: '',
        fullName: '',
        identity: null,
      };
    }

    return customerRequestCache.get(
      buildCustomerCacheKey('access-context', authUser || { email }),
      async () => {
        try {
          const identity = authUser ? await this.getCustomerIdentityForBooking(authUser, options) : null;
          return {
            customerId: identity?.id || null,
            email: String(identity?.email || email || '').trim().toLowerCase(),
            fullName: String(identity?.fullName || fullName || '').trim(),
            identity,
          };
        } catch {
          return {
            customerId: null,
            email,
            fullName,
            identity: null,
          };
        }
      },
      { ttl: 60000, forceRefresh: options.forceRefresh }
    );
  }

  async getCustomerIdentityForBooking(user, options = {}) {
    if (!user?.id && !user?.email) {
      return null;
    }

    return customerRequestCache.get(
      buildCustomerCacheKey('booking-identity', user),
      async () => {
        const response = await adminApiRequest('/api/me?resource=booking-identity');
        const customerRow = response?.identity || null;
        if (!customerRow) return null;

        return {
          id: customerRow.id,
          fullName: String(customerRow.full_name || '').trim(),
          email: String(customerRow.email || '').trim(),
          phone: String(customerRow.phone || '').trim(),
          licenseNumber: String(customerRow.licence_number || '').trim(),
          idNumber: String(customerRow.id_number || '').trim(),
          licenseDocumentUrl: String(customerRow.id_scan_url || '').trim(),
          initialScanComplete: Boolean(customerRow.initial_scan_complete),
          scanMetadata: customerRow.scan_metadata && typeof customerRow.scan_metadata === 'object'
            ? customerRow.scan_metadata
            : {},
        };
      },
      { ttl: 60000, forceRefresh: options.forceRefresh }
    );
  }

  async getCustomerDashboardSnapshot(user) {
    const { email } = await this.getCustomerAccessContext(user);
    if (!email) {
      return this.getEmptySnapshot(user);
    }

    const response = await adminApiRequest('/api/me?resource=rentals');
    const rentals = Array.isArray(response?.rentals) ? response.rentals : [];
    return this.buildSnapshot(user, rentals);
  }

  async getCustomerAccountSnapshot(user, options = {}) {
    const authUser = user?.id ? user : null;
    if (!authUser?.id) {
      return {
        profile: {
          fullName: authUser?.user_metadata?.full_name || authUser?.email || 'Customer',
          email: String(authUser?.email || '').trim().toLowerCase(),
          phone: authUser?.user_metadata?.phone || '',
          city: authUser?.user_metadata?.city || 'Tangier',
          country: authUser?.user_metadata?.country || 'Morocco',
          preferredLanguage: authUser?.user_metadata?.default_language || 'en',
          accountType: authUser?.user_metadata?.account_type || 'customer',
          profilePictureUrl: null,
        },
        wallet: this.getEmptyWallet(),
        walletTransactions: [],
        loyalty: this.getEmptySnapshot(authUser).loyalty,
        active: [],
        recent: [],
        upcoming: [],
      };
    }

    return customerRequestCache.get(
      buildCustomerCacheKey('account-snapshot', authUser),
      async () => {
        const response = await adminApiRequest('/api/me?resource=account-snapshot');
        return {
          profile: response?.profile || {},
          wallet: response?.wallet || this.getEmptyWallet(),
          walletTransactions: Array.isArray(response?.walletTransactions) ? response.walletTransactions : [],
          loyalty: response?.loyalty || this.getEmptySnapshot(authUser).loyalty,
          active: Array.isArray(response?.active) ? response.active : [],
          recent: Array.isArray(response?.recent) ? response.recent : [],
          upcoming: Array.isArray(response?.upcoming) ? response.upcoming : [],
        };
      },
      { ttl: 25000, forceRefresh: options.forceRefresh }
    );
  }

  async resolveCustomerId(email) {
    try {
      const { data, error } = await supabase
        .from('app_4c3a7a6153_customers')
        .select('id,email')
        .ilike('email', email)
        .limit(1)
        .maybeSingle();

      if (error) return null;
      return data?.id || null;
    } catch (error) {
      return null;
    }
  }

  async loadCustomerRentals(email, customerId, fullName = '') {
    const queries = [];
    const nameCandidates = buildCustomerNameCandidates(fullName, email);

    if (customerId) {
      queries.push(
        supabase
          .from('app_4c3a7a6153_rentals')
          .select(`
            id,
            rental_id,
            customer_id,
            customer_name,
            customer_email,
            customer_phone,
            booking_source,
            inventory_source,
            booking_mode,
            rental_type,
            rental_status,
            payment_status,
            total_amount,
            deposit_amount,
            damage_deposit,
            remaining_amount,
            fuel_charge,
            pickup_location,
            return_location,
            rental_start_date,
            rental_end_date,
            started_at,
            actual_end_date,
            completed_at,
            deposit_return_amount,
            deposit_returned_at,
            quantity_days,
            quantity_hours,
            unit_price,
            signature_url,
            contract_signed,
            receipt_issued,
            package_id,
            selected_package_id,
            selected_package_name,
            selected_package_fixed_amount,
            selected_package_included_km,
            selected_package_extra_rate,
            created_at,
            vehicle_id,
            vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(
              id,
              name,
              model,
              image_url,
              vehicle_type,
              plate_number,
              location,
              city,
              country,
              vehicle_model:saharax_0u4w4d_vehicle_models!vehicle_model_id(
                id,
                name,
                model,
                image_url
              )
            ),
            package:app_4c3a7a6153_rental_km_packages!package_id(
              id,
              name,
              title,
              included_kilometers,
              extra_km_rate,
              fixed_amount
            )
          `)
          .eq('customer_id', customerId)
          .order('created_at', { ascending: false })
      );
    }

    if (email) {
      queries.push(
        supabase
          .from('app_4c3a7a6153_rentals')
          .select(`
            id,
            rental_id,
            customer_id,
            customer_name,
            customer_email,
            customer_phone,
            booking_source,
            inventory_source,
            booking_mode,
            vehicle_id,
            rental_type,
            rental_status,
            payment_status,
            total_amount,
            deposit_amount,
            damage_deposit,
            remaining_amount,
            fuel_charge,
            pickup_location,
            return_location,
            rental_start_date,
            rental_end_date,
            started_at,
            actual_end_date,
            completed_at,
            deposit_return_amount,
            deposit_returned_at,
            quantity_days,
            quantity_hours,
            unit_price,
            signature_url,
            contract_signed,
            receipt_issued,
            package_id,
            selected_package_id,
            selected_package_name,
            selected_package_fixed_amount,
            selected_package_included_km,
            selected_package_extra_rate,
            vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(
              id,
              name,
              model,
              image_url,
              vehicle_type,
              plate_number,
              location,
              city,
              country,
              vehicle_model:saharax_0u4w4d_vehicle_models!vehicle_model_id(
                id,
                name,
                model,
                image_url
              )
            ),
            package:app_4c3a7a6153_rental_km_packages!package_id(
              id,
              name,
              title,
              included_kilometers,
              extra_km_rate,
              fixed_amount
            ),
            created_at
          `)
          .ilike('customer_email', email)
          .order('created_at', { ascending: false })
      );
    }

    if (nameCandidates.length) {
      queries.push(
        supabase
          .from('app_4c3a7a6153_rentals')
          .select(`
            id,
            rental_id,
            customer_id,
            customer_name,
            customer_email,
            customer_phone,
            booking_source,
            inventory_source,
            booking_mode,
            vehicle_id,
            rental_type,
            rental_status,
            payment_status,
            total_amount,
            deposit_amount,
            damage_deposit,
            remaining_amount,
            fuel_charge,
            pickup_location,
            return_location,
            rental_start_date,
            rental_end_date,
            started_at,
            actual_end_date,
            completed_at,
            deposit_return_amount,
            deposit_returned_at,
            quantity_days,
            quantity_hours,
            unit_price,
            signature_url,
            contract_signed,
            receipt_issued,
            package_id,
            selected_package_id,
            selected_package_name,
            selected_package_fixed_amount,
            selected_package_included_km,
            selected_package_extra_rate,
            vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(
              id,
              name,
              model,
              image_url,
              vehicle_type,
              plate_number,
              location,
              city,
              country,
              vehicle_model:saharax_0u4w4d_vehicle_models!vehicle_model_id(
                id,
                name,
                model,
                image_url
              )
            ),
            package:app_4c3a7a6153_rental_km_packages!package_id(
              id,
              name,
              title,
              included_kilometers,
              extra_km_rate,
              fixed_amount
            ),
            created_at
          `)
          .eq('booking_source', 'website')
          .eq('inventory_source', 'certified_fleet')
          .is('customer_id', null)
          .is('customer_email', null)
          .order('created_at', { ascending: false })
          .limit(40)
      );
    }

    if (queries.length === 0) {
      return [];
    }

    const results = await Promise.allSettled(queries);
    const merged = new Map();

    results.forEach((result) => {
      if (result.status !== 'fulfilled') return;
      const { data, error } = result.value;
      if (error || !Array.isArray(data)) return;
      data.forEach((row) => {
        merged.set(String(row.id), row);
      });
    });

    const filteredRows = Array.from(merged.values()).filter((row) => {
      const rowCustomerId = String(row?.customer_id || '').trim();
      const rowCustomerEmail = String(row?.customer_email || '').trim().toLowerCase();
      const rowCustomerName = normalizeComparableText(row?.customer_name);

      if (customerId && rowCustomerId && rowCustomerId === customerId) return true;
      if (email && rowCustomerEmail && rowCustomerEmail === email) return true;

      if (!rowCustomerId && !rowCustomerEmail && isLikelyCustomerNameMatch(rowCustomerName, nameCandidates)) {
        return true;
      }

      return false;
    });

    const rows = filteredRows.sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );

    const vehicleIds = [...new Set(rows.map((row) => row?.vehicle_id).filter(Boolean))];
    let vehicleMap = new Map();

    if (vehicleIds.length > 0) {
      const { data: vehicleRows, error: vehicleError } = await supabase
        .from('saharax_0u4w4d_vehicles')
        .select('id, name, model, vehicle_type, plate_number, location, city, country')
        .in('id', vehicleIds);

      if (!vehicleError && Array.isArray(vehicleRows)) {
        vehicleMap = new Map(vehicleRows.map((row) => [row.id, row]));
      }
    }

    return rows.map((row) => ({
      ...row,
      vehicle: row.vehicle || vehicleMap.get(row.vehicle_id) || null,
    }));
  }

  async getCustomerRentalHistory(user, options = {}) {
    const { email } = await this.getCustomerAccessContext(user, options);
    if (!email) return [];

    return customerRequestCache.get(
      buildCustomerCacheKey('rental-history', user),
      async () => {
        const response = await adminApiRequest('/api/me?resource=rentals');
        const rentals = Array.isArray(response?.rentals) ? response.rentals : [];
        const normalizedRentals = rentals.map((row) => normalizeRentalRecord(row));
        const eventMap = await RentalEventService.listEvents(normalizedRentals.map((rental) => rental.id));
        return normalizedRentals.map((rental) => ({
          ...rental,
          eventLog: eventMap.get(String(rental.id)) || [],
        }));
      },
      { ttl: 25000, forceRefresh: options.forceRefresh }
    );
  }

  async getCustomerRentalDetail(user, rentalLookupId, options = {}) {
    const { email } = await this.getCustomerAccessContext(user, options);
    if (!email || !rentalLookupId) {
      throw new Error('Missing customer session or rental id');
    }
    return customerRequestCache.get(
      buildCustomerCacheKey('rental-detail', user, String(rentalLookupId)),
      async () => {
        const response = await adminApiRequest(`/api/me?resource=rental-detail&rentalId=${encodeURIComponent(String(rentalLookupId))}`);
        const rental = response?.rental || null;

        if (!rental) {
          throw new Error('Rental not found');
        }

        const detail = normalizeRentalRecord({
          ...rental,
          vehicleReport: rental?.vehicleReport || rental?.vehicle_report || null,
          vehicle_report: rental?.vehicleReport || rental?.vehicle_report || null,
          linkedMaintenance: rental?.linkedMaintenance || rental?.linked_maintenance || null,
          linked_maintenance: rental?.linkedMaintenance || rental?.linked_maintenance || null,
        });
        const eventMap = await RentalEventService.listEvents([detail.id]);
        const eventLog = eventMap.get(String(detail.id)) || [];
        const baseTimeline = [
          rental.created_at ? { key: 'created', label: 'Booked', at: rental.created_at } : null,
          rental.rental_start_date ? { key: 'pickup', label: 'Pickup scheduled', at: rental.rental_start_date } : null,
          rental.started_at ? { key: 'started', label: 'Rental started', at: rental.started_at } : null,
          Array.isArray(rental.extensions) && rental.extensions.some((extension) => ['approved', 'completed', 'active'].includes(String(extension?.status || '').toLowerCase()))
            ? { key: 'extension', label: 'Extension approved', at: rental.extensions.find((extension) => ['approved', 'completed', 'active'].includes(String(extension?.status || '').toLowerCase()))?.created_at || null }
            : null,
          rental.actual_end_date ? { key: 'ended', label: 'Rental finished', at: rental.actual_end_date } : null,
          (rental?.vehicleReport || rental?.vehicle_report)?.created_at
            ? { key: 'report', label: 'Vehicle report saved', at: (rental.vehicleReport || rental.vehicle_report).created_at }
            : null,
          (rental?.linkedMaintenance || rental?.linked_maintenance)?.created_at
            ? { key: 'maintenance', label: 'Maintenance opened', at: (rental.linkedMaintenance || rental.linked_maintenance).created_at }
            : null,
          String(detail?.depositMode || '').toLowerCase() === 'external'
            ? null
            : rental.deposit_returned_at ? { key: 'deposit_returned', label: 'Deposit returned', at: rental.deposit_returned_at } : null,
        ].filter(Boolean);

        return {
          ...detail,
          eventLog,
          vehicleReport: rental?.vehicleReport || rental?.vehicle_report || null,
          linkedMaintenance: rental?.linkedMaintenance || rental?.linked_maintenance || null,
          timeline: mergeTimelineWithRentalEvents(baseTimeline, eventLog),
        };
      },
      { ttl: 25000, forceRefresh: options.forceRefresh }
    );
  }

  async getCustomerMarketplaceRequests(user, options = {}) {
    if (!user?.id && !user?.email) {
      return [];
    }

    return customerRequestCache.get(
      buildCustomerCacheKey('marketplace-requests', user),
      async () => {
        const response = await adminApiRequest('/api/me?resource=marketplace-requests');
        const rows = Array.isArray(response?.requests) ? response.requests : [];
        const requests = rows.map((row) => normalizeMarketplaceRequestRecord(row));
        const eventMap = await RentalEventService.listEvents(requests.map((request) => request.id));
        return requests.map((request) => ({
          ...request,
          eventLog: eventMap.get(String(request.id)) || [],
        }));
      },
      { ttl: 20000, forceRefresh: options.forceRefresh }
    );
  }

  async getCustomerMarketplaceRequestDetail(user, requestId, options = {}) {
    if ((!user?.id && !user?.email) || !requestId) {
      throw new Error('Missing customer session or marketplace request id');
    }

    return customerRequestCache.get(
      buildCustomerCacheKey('marketplace-request-detail', user, String(requestId)),
      async () => {
        const response = await adminApiRequest(`/api/me?resource=marketplace-request-detail&requestId=${encodeURIComponent(String(requestId))}`);
        const request = response?.request || null;

        if (!request) {
          throw new Error('Marketplace request not found');
        }

        const detail = normalizeMarketplaceRequestRecord(request);
        const eventMap = await RentalEventService.listEvents([detail.id]);
        return {
          ...detail,
          eventLog: eventMap.get(String(detail.id)) || [],
        };
      },
      { ttl: 20000, forceRefresh: options.forceRefresh }
    );
  }

  async getMarketplaceRequestRecovery(user, requestId, options = {}) {
    if ((!user?.id && !user?.email) || !requestId) {
      throw new Error('Missing customer session or marketplace request id');
    }

    return customerRequestCache.get(
      buildCustomerCacheKey('marketplace-request-recovery', user, String(requestId)),
      async () => {
        const response = await adminApiRequest(`/api/me?resource=marketplace-request-recovery&requestId=${encodeURIComponent(String(requestId))}`);
        const recovery = response?.recovery || null;

        if (!recovery?.vehicleId) {
          throw new Error('Marketplace request not found');
        }

        return {
          requestId: String(recovery.requestId || '').trim(),
          listingId: String(recovery.listingId || recovery.vehicleId || '').trim(),
          vehicleId: String(recovery.vehicleId || '').trim(),
          startTime: recovery.startTime || null,
          endTime: recovery.endTime || null,
          rentalType: recovery.rentalType || '',
          duration: Number(recovery.duration || 0) || 0,
        };
      },
      { ttl: 20000, forceRefresh: options.forceRefresh }
    );
  }

  async confirmMarketplaceRequest(requestId) {
    if (!requestId) {
      throw new Error('Missing marketplace request id');
    }

    const result = await adminApiRequest(`/api/me?resource=marketplace-request-confirmation`, {
      method: 'POST',
      body: JSON.stringify({ requestId }),
    });
    this.invalidateCustomerCache(['marketplace-requests', 'marketplace-request-detail', 'account-snapshot', 'rental-history']);
    return result;
  }

  async sendMarketplaceRequestReminder(requestId) {
    if (!requestId) {
      throw new Error('Missing marketplace request id');
    }

    const result = await adminApiRequest(`/api/me?resource=marketplace-request-reminder`, {
      method: 'POST',
      body: JSON.stringify({ requestId }),
    });
    this.invalidateCustomerCache(['marketplace-requests', 'marketplace-request-detail']);
    return result;
  }

  async getCustomerTourHistory(user, options = {}) {
    const authUser = user?.id ? user : null;
    if (!authUser?.id) {
      return [];
    }

    return customerRequestCache.get(
      buildCustomerCacheKey('tour-history', authUser),
      async () => {
        const response = await adminApiRequest('/api/me?resource=tours');
        const tours = Array.isArray(response?.tours) ? response.tours : [];
        return tours.map((row) => normalizeTourRecord(row));
      },
      { ttl: 45000, forceRefresh: options.forceRefresh }
    );
  }

  async getCustomerTourDetail(user, tourLookupId, options = {}) {
    const authUser = user?.id ? user : null;
    if (!authUser?.id || !tourLookupId) {
      throw new Error('Missing customer session or tour id');
    }

    return customerRequestCache.get(
      buildCustomerCacheKey('tour-detail', authUser, String(tourLookupId)),
      async () => {
        const response = await adminApiRequest(`/api/me?resource=tour-detail&tourId=${encodeURIComponent(String(tourLookupId))}`);
        const tour = response?.tour || null;

        if (!tour) {
          throw new Error('Tour not found');
        }

        const detail = normalizeTourRecord(tour);
        const activityLogs = Array.isArray(tour?.activityLogs) ? tour.activityLogs : [];
        const activityTimeline = activityLogs.map((entry, index) => ({
          key: String(entry?.id || `${entry?.action || 'activity'}-${index}`),
          label: String(entry?.details?.description || entry?.action || 'Tour activity').trim(),
          at: entry?.created_at || null,
        }));

        return {
          ...detail,
          timeline: [
            detail.createdAt ? { key: 'created', label: 'Tour booked', at: detail.createdAt.toISOString() } : null,
            detail.scheduledFor ? { key: 'scheduled', label: 'Tour scheduled', at: detail.scheduledFor.toISOString() } : null,
            detail.startedAt ? { key: 'started', label: 'Tour started', at: detail.startedAt.toISOString() } : null,
            detail.completedAt ? { key: 'completed', label: 'Tour completed', at: detail.completedAt.toISOString() } : null,
            detail.cancelledAt ? { key: 'cancelled', label: 'Tour cancelled', at: detail.cancelledAt.toISOString() } : null,
            detail.receiptIssuedAt ? { key: 'receipt', label: 'Receipt issued', at: detail.receiptIssuedAt.toISOString() } : null,
            ...activityTimeline,
          ]
            .filter((item) => item?.at)
            .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()),
        };
      },
      { ttl: 45000, forceRefresh: options.forceRefresh }
    );
  }

  invalidateCustomerCache(scopes = []) {
    const scopeList = Array.isArray(scopes) ? scopes.filter(Boolean) : [scopes].filter(Boolean);
    if (!scopeList.length) {
      customerRequestCache.clear();
      return;
    }

    customerRequestCache.invalidate((key) => scopeList.some((scope) => key.startsWith(`${scope}:`)));
  }

  async submitWalletTopup(payload) {
    const response = await walletTopupApi.submitTopup(payload);
    this.invalidateCustomerCache(['account-snapshot']);
    return response;
  }

  buildSnapshot(user, rentals) {
    const now = new Date();
    const safeRentals = Array.isArray(rentals) ? rentals : [];

    const normalizedRows = safeRentals.map((row) => normalizeRentalRecord(row));

    const completed = normalizedRows.filter((row) => ['completed', 'closed'].includes(row.status));
    const active = normalizedRows.filter((row) => ['active', 'ready_to_finish'].includes(row.status));
    const upcoming = normalizedRows.filter((row) => {
      const status = String(row?.status || '').toLowerCase();
      if (!['scheduled', 'confirmed'].includes(status)) return false;
      if (!(row.startDate instanceof Date) || Number.isNaN(row.startDate.getTime())) return true;
      return row.startDate.getTime() >= now.getTime();
    });

    const totalSpend = Math.round(completed.reduce((sum, row) => sum + Math.max(row.paid, row.total), 0));
    const points = Math.round(completed.length * 100 + totalSpend / 20);
    const loyaltyTier = getLoyaltyTier(points);

    const categoryCount = new Map();
    const operatorCount = new Map();
    normalizedRows.forEach((row) => {
      categoryCount.set(row.category, (categoryCount.get(row.category) || 0) + 1);
      operatorCount.set(row.city, (operatorCount.get(row.city) || 0) + 1);
    });

    const favoriteCategory =
      Array.from(categoryCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'ATV';
    const favoriteRegion =
      Array.from(operatorCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || (user?.user_metadata?.city || 'Tangier');

    const rebookSuggestions = completed.slice(0, 3).map((row) => ({
      id: row.id,
      title: row.modelName,
      detail: `${row.category} • ${row.city}`,
      href: row.href,
    }));

    return {
      loyalty: {
        points,
        tier: loyaltyTier,
        totalSpend,
        completedBookings: completed.length,
        activeBookings: active.length,
      },
      profile: {
        preferredLanguage: user?.user_metadata?.default_language || 'en',
        country: user?.user_metadata?.country || 'Morocco',
        city: user?.user_metadata?.city || favoriteRegion || 'Tangier',
      },
      favorites: {
        category: favoriteCategory,
        region: favoriteRegion,
      },
      rebookSuggestions,
      active: active.slice(0, 4),
      upcoming: upcoming.slice(0, 4),
      recent: normalizedRows.slice(0, 6),
    };
  }

  getEmptySnapshot(user) {
    return {
      loyalty: {
        points: 0,
        tier: 'Standard',
        totalSpend: 0,
        completedBookings: 0,
        activeBookings: 0,
      },
      profile: {
        preferredLanguage: user?.user_metadata?.default_language || 'en',
        country: user?.user_metadata?.country || 'Morocco',
        city: user?.user_metadata?.city || 'Tangier',
      },
      favorites: {
        category: 'ATV',
        region: user?.user_metadata?.city || 'Tangier',
      },
      rebookSuggestions: [],
      active: [],
      upcoming: [],
      recent: [],
    };
  }

  getEmptyWallet() {
    return {
      id: null,
      balance: 0,
      currencyCode: 'MAD',
      verificationState: 'not_active',
      approvedTopups: 0,
      pendingTopups: 0,
    };
  }
}

const customerExperienceService = new CustomerExperienceService();

export default customerExperienceService;
