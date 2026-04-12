import { createSupabaseClients } from './supabase.js';
import { authenticateRequest } from './auth.js';
import { randomUUID } from 'crypto';

const WEBSITE_BOOKING_SOURCE = 'website';
const WEBSITE_BLOCKING_STATUSES = ['verified', 'awaiting_payment', 'payment_submitted', 'confirmed'];
const WEBSITE_ACTIVE_DEDUPE_STATUSES = ['pending', 'verified', 'awaiting_payment', 'payment_submitted', 'confirmed'];
const REAL_BLOCKING_RENTAL_STATUSES = ['scheduled', 'confirmed', 'active', 'in_progress', 'checked_out'];
const DEFAULT_BUFFER_MINUTES = 60;
const DEFAULT_SCHEDULED_GRACE_MINUTES = 120;

const json = (res, status, body) => res.status(status).json(body);

const createHttpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const isCustomersTablePermissionError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  const details = String(error?.details || '').toLowerCase();
  const code = String(error?.code || '').toUpperCase();

  return (
    code === '42501' &&
    (message.includes('app_4c3a7a6153_customers') || details.includes('app_4c3a7a6153_customers'))
  );
};

const isSchemaCompatibilityError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  const details = String(error?.details || '').toLowerCase();
  const code = String(error?.code || '').toUpperCase();

  return (
    code === '42703' ||
    code === 'PGRST204' ||
    message.includes('schema cache') ||
    message.includes('does not exist') ||
    message.includes('column') ||
    details.includes('schema cache')
  );
};

const getMissingColumnName = (error) => {
  const message = String(error?.message || '');
  const directMatch = message.match(/column\s+[\w."]*\.?("?)([a-zA-Z0-9_]+)\1\s+does not exist/i);
  if (directMatch?.[2]) return directMatch[2];

  const schemaMatch = message.match(/'([a-zA-Z0-9_]+)' column/i);
  if (schemaMatch?.[1]) return schemaMatch[1];

  return null;
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

const cleanValue = (value) => {
  if (value === undefined || value === null || value === '') return null;
  return value;
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeText = (value) => String(value || '').trim();

const toIsoDateTime = (date, time = '10:00') => {
  if (!date) return null;
  const value = new Date(`${date}T${time}:00`);
  if (Number.isNaN(value.getTime())) return null;
  return value.toISOString();
};

const addDuration = (startIso, duration, rentalType) => {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return null;

  if (rentalType === 'hourly') {
    start.setMinutes(start.getMinutes() + (Number(duration || 1) * 60));
  } else {
    start.setDate(start.getDate() + Number(duration || 1));
  }

  return start.toISOString();
};

const toLocalTimeValue = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const toDate = (value, fallbackTime = '00:00') => {
  if (!value) return null;
  const source = String(value);
  if (source.includes('T')) {
    const parsed = new Date(source);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(`${source}T${fallbackTime}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeMinutes = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
};

const normalizePhone = (value = '') => String(value || '').replace(/[^\d]/g, '');

const windowsOverlap = (leftStart, leftEnd, rightStart, rightEnd) =>
  Boolean(leftStart && leftEnd && rightStart && rightEnd && leftStart < rightEnd && leftEnd > rightStart);

const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60 * 1000);
const addHours = (date, hours) => new Date(date.getTime() + hours * 60 * 60 * 1000);

const isWebsiteBooking = (rental = {}) =>
  String(rental?.booking_source || '').trim().toLowerCase() === WEBSITE_BOOKING_SOURCE;

const hasActiveHold = (rental = {}, nowValue = new Date()) => {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  if (!rental?.is_vehicle_locked) return false;

  const holdExpiresAt = rental?.hold_expires_at ? new Date(rental.hold_expires_at) : null;
  if (!holdExpiresAt || Number.isNaN(holdExpiresAt.getTime())) return true;
  return holdExpiresAt.getTime() > now.getTime();
};

const shouldWebsiteBookingBlockInventory = (rental = {}, nowValue = new Date()) => {
  if (!isWebsiteBooking(rental)) return false;
  const status = String(rental?.website_booking_status || '').trim().toLowerCase();
  if (!WEBSITE_BLOCKING_STATUSES.includes(status)) return false;
  return hasActiveHold(rental, nowValue);
};

const shouldRentalBlockInventory = (rental = {}, nowValue = new Date()) => {
  const rentalStatus = String(rental?.rental_status || rental?.status || '').trim().toLowerCase();
  if (isWebsiteBooking(rental)) {
    return shouldWebsiteBookingBlockInventory(rental, nowValue);
  }
  return REAL_BLOCKING_RENTAL_STATUSES.includes(rentalStatus);
};

const getWebsiteLockConfig = ({ bookingSecurityOption, websiteBookingStatus, startIso, nowValue = new Date() }) => {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  const requestedStart = startIso ? new Date(startIso) : null;
  const option = String(bookingSecurityOption || '').trim().toLowerCase();
  const normalizedStatus = String(websiteBookingStatus || '').trim().toLowerCase();

  if (option === 'scan_hold' || normalizedStatus === 'verified') {
    return {
      websiteBookingStatus: 'verified',
      isVehicleLocked: true,
      holdStrength: 'soft',
      holdExpiresAt: addMinutes(now, 30).toISOString(),
      statusChangeReason: 'Website license verification hold',
    };
  }

  if (option === 'deposit') {
    return {
      websiteBookingStatus: 'awaiting_payment',
      isVehicleLocked: true,
      holdStrength: 'strong',
      holdExpiresAt: addHours(now, 4).toISOString(),
      statusChangeReason: 'Website bank deposit hold',
    };
  }

  if (option === 'full') {
    const twelveHoursFromNow = addHours(now, 12);
    const holdUntil =
      requestedStart && requestedStart.getTime() < twelveHoursFromNow.getTime()
        ? requestedStart
        : twelveHoursFromNow;

    return {
      websiteBookingStatus: 'awaiting_payment',
      isVehicleLocked: true,
      holdStrength: 'strong',
      holdExpiresAt: holdUntil.toISOString(),
      statusChangeReason: 'Website full-payment hold',
    };
  }

  if (normalizedStatus === 'payment_submitted') {
    return {
      websiteBookingStatus: 'payment_submitted',
      isVehicleLocked: true,
      holdStrength: 'strong',
      holdExpiresAt: null,
      statusChangeReason: 'Website payment proof submitted',
    };
  }

  if (normalizedStatus === 'confirmed') {
    return {
      websiteBookingStatus: 'confirmed',
      isVehicleLocked: true,
      holdStrength: 'strong',
      holdExpiresAt: null,
      statusChangeReason: 'Website booking confirmed by staff',
    };
  }

  return {
    websiteBookingStatus: 'pending',
    isVehicleLocked: false,
    holdStrength: 'none',
    holdExpiresAt: null,
    statusChangeReason: 'Website booking created without security hold',
  };
};

const buildWebsiteBookingUpdate = ({
  bookingSecurityOption,
  websiteBookingStatus,
  startIso,
  actorName = 'website',
  nowValue = new Date(),
}) => {
  const lifecycle = getWebsiteLockConfig({
    bookingSecurityOption,
    websiteBookingStatus,
    startIso,
    nowValue,
  });

  return {
    website_booking_status: lifecycle.websiteBookingStatus,
    is_vehicle_locked: lifecycle.isVehicleLocked,
    hold_strength: lifecycle.holdStrength,
    hold_expires_at: lifecycle.holdExpiresAt,
    status_changed_at: new Date(nowValue).toISOString(),
    status_changed_by: actorName,
    status_change_reason: lifecycle.statusChangeReason,
  };
};

const isExpiredScheduledConflict = (rentalLike, graceMinutes = DEFAULT_SCHEDULED_GRACE_MINUTES) => {
  if (String(rentalLike?.rental_status || '').toLowerCase() !== 'scheduled' || !rentalLike?.rental_start_date) {
    return false;
  }

  const scheduledStart = new Date(rentalLike.rental_start_date);
  if (Number.isNaN(scheduledStart.getTime())) return false;
  return Date.now() > scheduledStart.getTime() + normalizeMinutes(graceMinutes, DEFAULT_SCHEDULED_GRACE_MINUTES) * 60 * 1000;
};

const applyBufferWindow = (start, end, bufferMinutes) => ({
  start: new Date(start.getTime() - bufferMinutes * 60 * 1000),
  end: new Date(end.getTime() + bufferMinutes * 60 * 1000),
});

const cleanupExpiredWebsiteBookingLocks = async (adminClient, nowValue = new Date()) => {
  const nowIso = new Date(nowValue).toISOString();

  const { data: expiredRows, error: fetchError } = await adminClient
    .from('app_4c3a7a6153_rentals')
    .select('id, vehicle_id, website_booking_status, is_vehicle_locked, hold_expires_at')
    .eq('booking_source', WEBSITE_BOOKING_SOURCE)
    .eq('is_vehicle_locked', true)
    .in('website_booking_status', ['verified', 'awaiting_payment', 'payment_submitted'])
    .not('hold_expires_at', 'is', null)
    .lt('hold_expires_at', nowIso);

  if (fetchError) throw fetchError;
  if (!expiredRows?.length) return { updated: 0 };

  const ids = expiredRows.map((row) => row.id).filter(Boolean);
  const { error: updateError } = await adminClient
    .from('app_4c3a7a6153_rentals')
    .update({
      rental_status: 'expired',
      website_booking_status: 'expired',
      is_vehicle_locked: false,
      hold_strength: 'none',
      status_changed_at: nowIso,
      status_changed_by: 'system',
      status_change_reason: 'Website hold expired automatically',
    })
    .in('id', ids);

  if (updateError) throw updateError;

  const vehicleIds = [...new Set(expiredRows.map((row) => row.vehicle_id).filter(Boolean))];
  await Promise.all(
    vehicleIds.map((vehicleId) =>
      reconcileVehicleOperationalStatus(adminClient, vehicleId, {
        excludeRentalIds: ids,
        nowValue,
      }).catch(() => null)
    )
  );

  return { updated: ids.length, ids };
};

const reconcileVehicleOperationalStatus = async (adminClient, vehicleId, { excludeRentalIds = [], nowValue = new Date() } = {}) => {
  if (!vehicleId) return null;

  let query = adminClient
    .from('app_4c3a7a6153_rentals')
    .select('id, rental_status, booking_source, website_booking_status, is_vehicle_locked, hold_expires_at')
    .eq('vehicle_id', vehicleId)
    .not('rental_status', 'in', '(cancelled,completed,expired,void)');

  if (excludeRentalIds.length > 0) {
    query = query.not('id', 'in', `(${excludeRentalIds.join(',')})`);
  }

  const { data: relatedRentals, error } = await query;
  if (error) throw error;

  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  const activeRentals = (relatedRentals || []).filter((rental) => {
    const status = String(rental?.rental_status || '').toLowerCase();
    return ['active', 'in_progress', 'checked_out', 'confirmed'].includes(status);
  });

  let nextVehicleStatus = 'available';
  if (activeRentals.length > 0) {
    nextVehicleStatus = 'rented';
  } else {
    const blockingFutureRentals = (relatedRentals || []).filter((rental) => shouldRentalBlockInventory(rental, now));
    if (blockingFutureRentals.length > 0) {
      nextVehicleStatus = 'scheduled';
    }
  }

  const { error: updateError } = await adminClient
    .from('saharax_0u4w4d_vehicles')
    .update({ status: nextVehicleStatus })
    .eq('id', vehicleId);

  if (updateError) throw updateError;
  return nextVehicleStatus;
};

const getFleetCandidates = async (adminClient, anchorListing) => {
  const anchorVehicle = anchorListing?.raw || {};
  const anchorModelId = String(anchorVehicle?.vehicle_model_id || anchorVehicle?.vehicle_model?.id || '');
  const anchorCategory = String(anchorListing?.category || anchorVehicle?.vehicle_type || '').toLowerCase();
  const anchorModel = String(anchorListing?.model || anchorVehicle?.model || '').toLowerCase();

  const { data, error } = await adminClient
    .from('saharax_0u4w4d_vehicles')
    .select('id, name, model, vehicle_type, status, current_odometer, vehicle_model_id')
    .in('status', ['available', 'scheduled'])
    .order('current_odometer', { ascending: true, nullsFirst: true });

  if (error) throw error;

  const vehicles = data || [];
  const sameModelCandidates = vehicles.filter((vehicle) => {
    const vehicleModelId = String(vehicle?.vehicle_model_id || '');
    if (anchorModelId && vehicleModelId) {
      return vehicleModelId === anchorModelId;
    }

    const vehicleCategory = String(vehicle?.vehicle_type || '').toLowerCase();
    const vehicleModel = String(vehicle?.model || '').toLowerCase();
    return vehicleCategory === anchorCategory && vehicleModel === anchorModel;
  });

  return sameModelCandidates.length > 0
    ? sameModelCandidates
    : vehicles.filter((vehicle) => {
        const vehicleCategory = String(vehicle?.vehicle_type || '').toLowerCase();
        return !anchorCategory || vehicleCategory === anchorCategory;
      });
};

const getBlockingRentals = async (adminClient, vehicleIds, excludeRentalId = null) => {
  if (!vehicleIds.length) return [];

  await cleanupExpiredWebsiteBookingLocks(adminClient).catch(() => {});

  let query = adminClient
    .from('app_4c3a7a6153_rentals')
    .select('id, vehicle_id, rental_start_date, rental_end_date, rental_status, customer_name, booking_source, website_booking_status, is_vehicle_locked, hold_expires_at')
    .in('vehicle_id', vehicleIds)
    .not('rental_status', 'in', '(cancelled,completed,expired,void)');

  if (excludeRentalId) {
    query = query.neq('id', excludeRentalId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).filter((conflict) => {
    if (String(conflict?.booking_source || '').toLowerCase() === 'website') {
      return shouldRentalBlockInventory(conflict, new Date());
    }

    return !isExpiredScheduledConflict(conflict, DEFAULT_SCHEDULED_GRACE_MINUTES) &&
      shouldRentalBlockInventory(conflict, new Date());
  });
};

const chooseBestVehicle = async ({
  adminClient,
  anchorListing,
  requestedStart,
  requestedEnd,
  excludeRentalId = null,
  bufferMinutes = DEFAULT_BUFFER_MINUTES,
}) => {
  const requestStart = toDate(requestedStart);
  const requestEnd = toDate(requestedEnd);
  if (!requestStart || !requestEnd) {
    throw new Error('Invalid booking window for assignment.');
  }

  const normalizedBuffer = normalizeMinutes(bufferMinutes, DEFAULT_BUFFER_MINUTES);
  const candidates = await getFleetCandidates(adminClient, anchorListing);
  if (candidates.length === 0) {
    return {
      assignedVehicle: null,
      alternatives: [],
      conflicts: [],
      reason: 'No eligible vehicles available.',
    };
  }

  const blockingRentals = await getBlockingRentals(
    adminClient,
    candidates.map((vehicle) => vehicle.id),
    excludeRentalId
  );

  const eligible = [];
  const rejected = [];

  candidates.forEach((candidate) => {
    const candidateConflicts = blockingRentals.filter((rental) => String(rental.vehicle_id) === String(candidate.id));

    const isBlocked = candidateConflicts.some((conflict) => {
      const conflictStart = toDate(conflict.rental_start_date);
      const conflictEnd = toDate(conflict.rental_end_date, '23:59');
      if (!conflictStart || !conflictEnd) return false;

      const bufferedConflict = applyBufferWindow(conflictStart, conflictEnd, normalizedBuffer);
      return windowsOverlap(requestStart, requestEnd, bufferedConflict.start, bufferedConflict.end);
    });

    if (isBlocked) {
      rejected.push({ vehicle: candidate, conflicts: candidateConflicts });
      return;
    }

    eligible.push(candidate);
  });

  eligible.sort((left, right) => {
    const leftOdometer = Number(left.current_odometer || 0);
    const rightOdometer = Number(right.current_odometer || 0);
    if (leftOdometer !== rightOdometer) return leftOdometer - rightOdometer;
    return Number(left.id || 0) - Number(right.id || 0);
  });

  return {
    assignedVehicle: eligible[0] || null,
    alternatives: eligible.slice(1),
    conflicts: rejected,
    reason: eligible[0] ? null : 'All matching vehicles are protected by other bookings.',
    bufferMinutes: normalizedBuffer,
  };
};

const isSameVehicleIntent = (row, listing, assignedVehicle) => {
  const rowVehicle = row?.vehicle || {};
  const rowModelId = String(rowVehicle?.vehicle_model_id || row?.vehicle_model_id || '');
  const listingModelId = String(listing?.vehicleModelId || listing?.raw?.vehicle_model_id || '');
  if (rowModelId && listingModelId && rowModelId === listingModelId) {
    return true;
  }

  const rowModel = String(rowVehicle?.model || row?.vehicle?.model || '').trim().toLowerCase();
  const listingModel = String(listing?.model || assignedVehicle?.model || '').trim().toLowerCase();
  if (rowModel && listingModel && rowModel === listingModel) {
    return true;
  }

  const rowType = String(rowVehicle?.vehicle_type || '').trim().toLowerCase();
  const listingType = String(listing?.category || listing?.raw?.vehicle_type || '').trim().toLowerCase();
  return Boolean(rowType && listingType && rowType === listingType);
};

const findExistingWebsiteBooking = async ({
  adminClient,
  customerPhone,
  startIso,
  endIso,
  listing,
  assignedVehicle,
  bookingSessionKey,
}) => {
  const nowIso = new Date().toISOString();
  const normalizedPhone = normalizePhone(customerPhone);
  const requestStart = new Date(startIso);
  const requestEnd = new Date(endIso);

  if (bookingSessionKey) {
    const { data: sessionMatches, error: sessionError } = await adminClient
      .from('app_4c3a7a6153_rentals')
      .select(`
        id,
        customer_phone,
        booking_source,
        website_booking_status,
        is_vehicle_locked,
        hold_expires_at,
        rental_status,
        rental_start_date,
        rental_end_date,
        booking_session_key,
        vehicle_id,
        vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(
          id,
          model,
          vehicle_type,
          vehicle_model_id
        )
      `)
      .eq('booking_source', WEBSITE_BOOKING_SOURCE)
      .eq('booking_session_key', bookingSessionKey)
      .in('website_booking_status', WEBSITE_ACTIVE_DEDUPE_STATUSES)
      .order('created_at', { ascending: false })
      .limit(1);

    if (sessionError && !isSchemaCompatibilityError(sessionError)) throw sessionError;
    if (sessionMatches?.[0]) {
      return { type: 'reuse_website_booking', row: sessionMatches[0] };
    }
  }

  const { data: candidates, error } = await adminClient
    .from('app_4c3a7a6153_rentals')
    .select(`
      id,
      customer_name,
      customer_phone,
      booking_source,
      website_booking_status,
      is_vehicle_locked,
      hold_expires_at,
      rental_status,
      rental_start_date,
      rental_end_date,
      booking_session_key,
      vehicle_id,
      vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(
        id,
        model,
        vehicle_type,
        vehicle_model_id
      )
    `)
    .lte('rental_start_date', endIso)
    .gte('rental_end_date', startIso)
    .in('booking_source', [WEBSITE_BOOKING_SOURCE, 'staff', 'admin'])
    .not('rental_status', 'in', '(cancelled,completed,expired,void)');

  if (error) throw error;

  const matchingRows = (candidates || []).filter((row) => {
    const rowPhone = normalizePhone(row.customer_phone);
    if (!normalizedPhone || !rowPhone || rowPhone !== normalizedPhone) return false;

    const rowStart = new Date(row.rental_start_date);
    const rowEnd = new Date(row.rental_end_date);
    if (!windowsOverlap(requestStart, requestEnd, rowStart, rowEnd)) return false;

    return isSameVehicleIntent(row, listing, assignedVehicle);
  });

  const reusableWebsiteBooking = matchingRows.find((row) => {
    if (String(row.booking_source || '').toLowerCase() !== WEBSITE_BOOKING_SOURCE) return false;
    return WEBSITE_ACTIVE_DEDUPE_STATUSES.includes(String(row.website_booking_status || '').toLowerCase());
  });
  if (reusableWebsiteBooking) {
    return { type: 'reuse_website_booking', row: reusableWebsiteBooking };
  }

  const blockingRealBooking = matchingRows.find((row) => {
    const source = String(row.booking_source || '').toLowerCase();
    if (source === WEBSITE_BOOKING_SOURCE) {
      return shouldWebsiteBookingBlockInventory(row, new Date(nowIso)) &&
        String(row.website_booking_status || '').toLowerCase() === 'confirmed';
    }
    return REAL_BLOCKING_RENTAL_STATUSES.includes(String(row.rental_status || '').toLowerCase());
  });

  if (blockingRealBooking) {
    return { type: 'conflict_real_booking', row: blockingRealBooking };
  }

  return null;
};

const tryInsertVariants = async (adminClient, tableName, variants) => {
  let lastError = null;

  for (const payload of variants) {
    let sanitizedPayload = Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== undefined)
    );

    while (sanitizedPayload && Object.keys(sanitizedPayload).length > 0) {
      const { data, error } = await adminClient
        .from(tableName)
        .insert([sanitizedPayload])
        .select('*')
        .single();

      if (!error) return data;
      lastError = error;

      if (['42501', 'PGRST301'].includes(String(error.code || ''))) {
        break;
      }

      if (!isSchemaCompatibilityError(error)) {
        break;
      }

      const missingColumn = getMissingColumnName(error);
      if (!missingColumn || !Object.prototype.hasOwnProperty.call(sanitizedPayload, missingColumn)) {
        break;
      }

      const { [missingColumn]: _removed, ...nextPayload } = sanitizedPayload;
      sanitizedPayload = nextPayload;
    }
  }

  throw lastError || new Error(`Failed to insert into ${tableName}`);
};

const tryUpdateWithCompatibility = async (adminClient, tableName, rowId, payload) => {
  let sanitizedPayload = Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  );
  let lastError = null;

  while (sanitizedPayload && Object.keys(sanitizedPayload).length > 0) {
    const { data, error } = await adminClient
      .from(tableName)
      .update(sanitizedPayload)
      .eq('id', rowId)
      .select('*')
      .single();

    if (!error) return data;
    lastError = error;

    if (['42501', 'PGRST301'].includes(String(error.code || ''))) {
      break;
    }

    if (!isSchemaCompatibilityError(error)) {
      break;
    }

    const missingColumn = getMissingColumnName(error);
    if (!missingColumn || !Object.prototype.hasOwnProperty.call(sanitizedPayload, missingColumn)) {
      break;
    }

    const { [missingColumn]: _removed, ...nextPayload } = sanitizedPayload;
    sanitizedPayload = nextPayload;
  }

  throw lastError || new Error(`Failed to update ${tableName}`);
};

const createBookingId = () => {
  if (typeof randomUUID === 'function') return randomUUID();
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return null;
};

const createRequestReference = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    const slug = crypto.randomUUID().split('-')[0];
    return `RQ-${slug.toUpperCase()}`;
  }
  return `RQ-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
};

const isUuid = (value = '') => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));
const sanitizeUuid = (value) => (isUuid(value) ? String(value) : null);

const getAuthenticatedCustomerLink = async (adminClient, user, payload = {}) => {
  const userId = String(user?.id || '').trim();
  const authEmail = normalizeEmail(user?.email);
  const payloadEmail = normalizeEmail(payload?.customerEmail);
  const fallbackEmail = authEmail || payloadEmail || '';
  const authCustomerId = userId ? `cust_auth_${userId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)}` : '';

  if (!userId && !fallbackEmail) {
    return {
      customerId: null,
      customerEmail: cleanValue(payload?.customerEmail),
      customerName: cleanValue(payload?.customerName),
      customerPhone: cleanValue(payload?.customerPhone),
    };
  }

  const [customerByIdResult, customerByEmailResult] = await Promise.all([
    authCustomerId
      ? adminClient
          .from('app_4c3a7a6153_customers')
          .select('id, full_name, email, phone, licence_number, id_number, id_scan_url, initial_scan_complete, scan_metadata')
          .eq('id', authCustomerId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    fallbackEmail
      ? adminClient
          .from('app_4c3a7a6153_customers')
          .select('id, full_name, email, phone, licence_number, id_number, id_scan_url, initial_scan_complete, scan_metadata')
          .ilike('email', fallbackEmail)
          .limit(1)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (customerByIdResult.error) throw customerByIdResult.error;
  if (customerByEmailResult.error) throw customerByEmailResult.error;

  const existingCustomer = customerByIdResult.data || customerByEmailResult.data?.[0] || null;
  const linkedCustomerId = existingCustomer?.id || authCustomerId || null;
  const linkedEmail = cleanValue(existingCustomer?.email || authEmail || payload?.customerEmail);
  const linkedName = cleanValue(payload?.customerName || existingCustomer?.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name);
  const linkedPhone = cleanValue(payload?.customerPhone || existingCustomer?.phone || user?.user_metadata?.phone);
  const linkedLicenseNumber = cleanValue(payload?.customerLicenseNumber || existingCustomer?.licence_number);
  const linkedIdNumber = cleanValue(payload?.customerIdNumber || existingCustomer?.id_number);
  const linkedScanUrl = cleanValue(payload?.licenseDocumentUrl || existingCustomer?.id_scan_url);

  if (linkedCustomerId) {
    const upsertPayload = {
      id: linkedCustomerId,
      full_name: linkedName,
      email: linkedEmail,
      phone: linkedPhone,
      licence_number: linkedLicenseNumber,
      id_number: linkedIdNumber,
      id_scan_url: linkedScanUrl,
      initial_scan_complete: Boolean(linkedLicenseNumber || linkedScanUrl || existingCustomer?.initial_scan_complete),
      scan_metadata:
        existingCustomer?.scan_metadata && typeof existingCustomer.scan_metadata === 'object'
          ? existingCustomer.scan_metadata
          : {},
    };

    const { error: upsertError } = await adminClient
      .from('app_4c3a7a6153_customers')
      .upsert(upsertPayload, { onConflict: 'id' });

    if (upsertError) throw upsertError;
  }

  return {
    customerId: linkedCustomerId,
    customerEmail: linkedEmail,
    customerName: linkedName,
    customerPhone: linkedPhone,
    customerLicenseNumber: linkedLicenseNumber,
    licenseDocumentUrl: linkedScanUrl,
  };
};

const repairAuthenticatedRentalLink = async (adminClient, rental, user, linkedCustomer, payload = {}) => {
  if (!rental?.id || !user) {
    return rental;
  }

  const resolvedEmail = cleanValue(
    linkedCustomer?.customerEmail ||
    user?.email ||
    payload?.customerEmail
  );
  const resolvedName = cleanValue(
    linkedCustomer?.customerName ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    payload?.customerName
  );
  const resolvedPhone = cleanValue(
    linkedCustomer?.customerPhone ||
    user?.user_metadata?.phone ||
    payload?.customerPhone
  );
  const resolvedCustomerId = cleanValue(linkedCustomer?.customerId);
  const resolvedLicenseNumber = cleanValue(
    linkedCustomer?.customerLicenseNumber ||
    payload?.customerLicenseNumber
  );
  const resolvedLicenseDocumentUrl = cleanValue(
    linkedCustomer?.licenseDocumentUrl ||
    payload?.licenseDocumentUrl
  );

  const needsRepair =
    (!rental.customer_id && resolvedCustomerId) ||
    (!normalizeText(rental.customer_email) && resolvedEmail) ||
    (!normalizeText(rental.customer_phone) && resolvedPhone) ||
    (!normalizeText(rental.customer_name) && resolvedName) ||
    (!normalizeText(rental.customer_licence_number) && resolvedLicenseNumber) ||
    (!normalizeText(rental.customer_id_image) && resolvedLicenseDocumentUrl);

  if (!needsRepair) {
    return rental;
  }

  return tryUpdateWithCompatibility(adminClient, 'app_4c3a7a6153_rentals', rental.id, {
    customer_id: resolvedCustomerId,
    customer_name: resolvedName,
    customer_email: resolvedEmail,
    customer_phone: resolvedPhone,
    customer_licence_number: resolvedLicenseNumber,
    customer_id_image: resolvedLicenseDocumentUrl,
  });
};

const createCertifiedBooking = async (adminClient, payload, { user = null } = {}) => {
  const {
    listing,
    customerName,
    customerEmail,
    customerPhone,
    customerLicenseNumber,
    customerIdNumber,
    licenseDocumentUrl,
    rentalType,
    packageSelection,
    startDate,
    startTime,
    durationUnits,
    notes,
    websiteBookingStatus,
    bookingSecurityOption,
    bookingSessionKey,
  } = payload;
  const linkedCustomer = user
    ? await getAuthenticatedCustomerLink(adminClient, user, {
        customerName,
        customerEmail,
        customerPhone,
        customerLicenseNumber,
        customerIdNumber,
        licenseDocumentUrl,
      })
    : {
        customerId: null,
        customerEmail: cleanValue(customerEmail),
        customerName: cleanValue(customerName),
        customerPhone: cleanValue(customerPhone),
        customerLicenseNumber: cleanValue(customerLicenseNumber),
        licenseDocumentUrl: cleanValue(licenseDocumentUrl),
      };

  const resolvedCustomerName = cleanValue(linkedCustomer.customerName || customerName);
  const resolvedCustomerEmail = cleanValue(linkedCustomer.customerEmail || customerEmail);
  const resolvedCustomerPhone = cleanValue(linkedCustomer.customerPhone || customerPhone);
  const resolvedCustomerLicenseNumber = cleanValue(linkedCustomer.customerLicenseNumber || customerLicenseNumber);
  const resolvedLicenseDocumentUrl = cleanValue(linkedCustomer.licenseDocumentUrl || licenseDocumentUrl);

  if (!String(resolvedCustomerName || '').trim()) throw createHttpError(400, 'Full name is required.');
  if (!String(resolvedCustomerPhone || '').trim()) throw createHttpError(400, 'Phone number is required.');

  const normalizedDurationUnits = Math.max(
    rentalType === 'hourly' ? 0.5 : 1,
    Number(durationUnits || packageSelection?.durationUnits || 1)
  );
  const startIso = toIsoDateTime(startDate, startTime);
  const endIso = addDuration(startIso, normalizedDurationUnits, rentalType);
  const localStart = startIso ? new Date(startIso) : null;
  const localEnd = endIso ? new Date(endIso) : null;

  if (!startIso || !endIso) throw createHttpError(400, 'Please choose a valid booking window.');
  if (!localStart || Number.isNaN(localStart.getTime()) || !localEnd || Number.isNaN(localEnd.getTime())) {
    throw createHttpError(400, 'Please choose a valid booking date and start time.');
  }
  if (localStart.getTime() <= Date.now()) throw createHttpError(400, 'Please choose a future reservation time.');

  await cleanupExpiredWebsiteBookingLocks(adminClient).catch(() => {});

  const assignment = await chooseBestVehicle({
    adminClient,
    anchorListing: listing,
    requestedStart: startIso,
    requestedEnd: endIso,
  });

  if (!assignment.assignedVehicle) {
    throw createHttpError(409, assignment.reason || 'This vehicle is no longer available for the selected period.');
  }

  const assignedVehicle = assignment.assignedVehicle;
  const lifecycleFields = buildWebsiteBookingUpdate({
    bookingSecurityOption,
    websiteBookingStatus,
    startIso,
    actorName: 'website',
  });

  const duplicateResolution = await findExistingWebsiteBooking({
    adminClient,
    customerPhone: resolvedCustomerPhone,
    startIso,
    endIso,
    listing,
    assignedVehicle,
    bookingSessionKey,
  });

  if (duplicateResolution?.type === 'conflict_real_booking') {
    throw createHttpError(409, 'A reservation already exists for this customer during the selected time window. Please review the existing booking instead of creating another one.');
  }

  const totalAmount = Number(packageSelection?.amount || 0) || Number(listing.priceFrom || 0);
  const basePayload = {
    customer_id: cleanValue(linkedCustomer.customerId),
    customer_name: resolvedCustomerName,
    customer_email: resolvedCustomerEmail,
    customer_phone: resolvedCustomerPhone,
    customer_licence_number: resolvedCustomerLicenseNumber,
    customer_id_image: resolvedLicenseDocumentUrl,
    vehicle_id: assignedVehicle?.id || listing.sourceId,
    rental_start_date: startIso,
    rental_end_date: endIso,
    rental_start_time: cleanValue(toLocalTimeValue(localStart)),
    rental_end_time: cleanValue(toLocalTimeValue(localEnd)),
    rental_type: rentalType,
    quantity_hours: rentalType === 'hourly' ? normalizedDurationUnits : null,
    quantity_days: rentalType === 'daily' ? normalizedDurationUnits : null,
    total_amount: totalAmount,
    remaining_amount: totalAmount,
    payment_status: 'unpaid',
    rental_status: 'scheduled',
    damage_deposit: Number(listing.depositAmount || 0),
    selected_package_id: cleanValue(packageSelection?.id),
    selected_package_name: cleanValue(packageSelection?.name),
    selected_package_fixed_amount: Number(packageSelection?.amount || 0),
    selected_package_included_km:
      packageSelection?.kind === 'unlimited'
        ? null
        : cleanValue(Number(packageSelection?.includedKilometers || 0) || null),
    selected_package_extra_rate: cleanValue(Number(packageSelection?.extraKmRate || 0) || null),
    use_package_pricing: true,
    notes: cleanValue(notes),
    booking_source: 'website',
    inventory_source: 'certified_fleet',
    booking_mode: 'instant',
    booking_session_key: cleanValue(bookingSessionKey),
    ...lifecycleFields,
  };

  if (lifecycleFields.website_booking_status === 'confirmed') {
    basePayload.confirmed_at = new Date().toISOString();
    basePayload.confirmed_by = 'website';
  }

  const variants = [
    basePayload,
    {
      ...basePayload,
      damage_deposit: undefined,
      selected_package_id: undefined,
      selected_package_name: undefined,
      selected_package_fixed_amount: undefined,
      selected_package_included_km: undefined,
      selected_package_extra_rate: undefined,
      customer_id_image: resolvedLicenseDocumentUrl,
      customer_licence_number: resolvedCustomerLicenseNumber,
    },
    {
      customer_id: cleanValue(linkedCustomer.customerId),
      customer_name: resolvedCustomerName,
      customer_email: resolvedCustomerEmail,
      customer_phone: resolvedCustomerPhone,
      vehicle_id: assignedVehicle?.id || listing.sourceId,
      rental_start_date: startIso,
      rental_end_date: endIso,
      total_amount: totalAmount,
      payment_status: 'unpaid',
      rental_status: 'scheduled',
      notes: cleanValue(notes),
      booking_source: 'website',
      inventory_source: 'certified_fleet',
      booking_mode: 'instant',
      booking_session_key: cleanValue(bookingSessionKey),
      ...lifecycleFields,
    },
  ];

  let rental;
  if (duplicateResolution?.type === 'reuse_website_booking' && duplicateResolution.row?.id) {
    rental = await tryUpdateWithCompatibility(
      adminClient,
      'app_4c3a7a6153_rentals',
      duplicateResolution.row.id,
      basePayload
    );
  } else {
    rental = await tryInsertVariants(adminClient, 'app_4c3a7a6153_rentals', variants);
  }

  rental = await repairAuthenticatedRentalLink(
    adminClient,
    rental,
    user,
    linkedCustomer,
    {
      customerName: resolvedCustomerName,
      customerEmail: resolvedCustomerEmail,
      customerPhone: resolvedCustomerPhone,
      customerLicenseNumber: resolvedCustomerLicenseNumber,
      licenseDocumentUrl: resolvedLicenseDocumentUrl,
    }
  );

  return {
    ...rental,
    assigned_vehicle: assignedVehicle || null,
    assignment_alternatives: assignment.alternatives || [],
    assignment_buffer_minutes: assignment.bufferMinutes || null,
  };
};

const createMarketplaceRequest = async (adminClient, payload) => {
  const {
    listing,
    userId,
    customerName,
    customerEmail,
    customerPhone,
    startDate,
    startTime,
    duration,
    rentalType,
    message,
  } = payload;

  const startIso = toIsoDateTime(startDate, startTime);
  const endIso = addDuration(startIso, duration, rentalType);
  if (!startIso || !endIso) {
    throw createHttpError(400, 'Please choose a valid requested start date, time, and duration.');
  }

  const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const extractUuid = (value) => {
    const text = cleanValue(value);
    if (!text) return null;
    const match = text.match(uuidRegex);
    return match ? match[0] : null;
  };

  const listingId =
    extractUuid(listing?.sourceId) ||
    extractUuid(listing?.raw?.id) ||
    extractUuid(listing?.id);
  const ownerId = cleanValue(listing.ownerId);
  const customerNameValue = cleanValue(customerName);
  const customerEmailValue = cleanValue(customerEmail);
  const customerPhoneValue = cleanValue(customerPhone);

  if (!listingId || !ownerId) {
    throw createHttpError(400, 'This marketplace listing is missing owner information. Please try another listing.');
  }
  if (!customerNameValue || !customerEmailValue) {
    throw createHttpError(400, 'Please enter your name and email before sending the request.');
  }
  if (!customerPhoneValue) {
    throw createHttpError(400, 'Please enter your WhatsApp or phone number before sending the request.');
  }

  const normalizedUserId = cleanValue(userId);
  const payloadRow = {
    id: createBookingId(),
    request_reference: createRequestReference(),
    listing_id: sanitizeUuid(listingId),
    vehicle_public_profile_id: sanitizeUuid(cleanValue(listing.vehiclePublicProfileId)),
    owner_id: sanitizeUuid(ownerId),
    customer_id: normalizedUserId,
    customer_name: customerNameValue,
    customer_email: customerEmailValue,
    customer_phone: customerPhoneValue,
    request_status: 'pending',
    requested_start_at: startIso,
    requested_end_at: endIso,
    rental_type: rentalType === 'daily' ? 'daily' : 'hourly',
    duration: Number(duration || 1),
    customer_message: cleanValue(message),
    counter_offer: {},
  };

  if (!isUuid(payloadRow.id)) delete payloadRow.id;
  if (!payloadRow.listing_id || !payloadRow.owner_id) {
    throw createHttpError(400, 'This marketplace listing is missing owner information. Please try another listing.');
  }

  const { error } = await adminClient.from('app_booking_requests').insert([payloadRow]);
  if (error) throw error;
  return payloadRow;
};

const updateWebsiteBookingState = async (adminClient, rentalId, payload) => {
  if (!rentalId) return null;

  const { bookingSecurityOption, websiteBookingStatus, actorName = 'website', reason } = payload;
  const { data: existing, error: fetchError } = await adminClient
    .from('app_4c3a7a6153_rentals')
    .select('id, rental_start_date, booking_source')
    .eq('id', rentalId)
    .single();

  if (fetchError) throw fetchError;

  const lifecycleFields = buildWebsiteBookingUpdate({
    bookingSecurityOption,
    websiteBookingStatus,
    startIso: existing?.rental_start_date,
    actorName,
  });

  const updatePayload = {
    ...lifecycleFields,
    status_change_reason: reason || lifecycleFields.status_change_reason,
  };

  if (lifecycleFields.website_booking_status === 'confirmed') {
    updatePayload.rental_status = 'scheduled';
    updatePayload.confirmed_at = new Date().toISOString();
    updatePayload.confirmed_by = actorName;
  }

  if (lifecycleFields.website_booking_status === 'expired' || lifecycleFields.website_booking_status === 'cancelled') {
    updatePayload.is_vehicle_locked = false;
    updatePayload.hold_strength = 'none';
  }

  const { data, error } = await adminClient
    .from('app_4c3a7a6153_rentals')
    .update(updatePayload)
    .eq('id', rentalId)
    .select('*')
    .single();

  if (error) throw error;
  return data;
};

const getAuthenticatedUserId = async (req) => {
  const auth = await authenticateRequest(req);
  if (auth.error) return null;
  return auth.user?.id || null;
};

const getAuthenticatedUser = async (req) => {
  const auth = await authenticateRequest(req);
  if (auth.error) return null;
  return auth.user || null;
};

export default async function publicBookingHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const action = String(req.query?.action || '').trim().toLowerCase();
  const { adminClient } = createSupabaseClients();

  try {
    if (req.method === 'POST' && action === 'create-certified') {
      const body = parseBody(req.body);
      const authenticatedUser = await getAuthenticatedUser(req);
      const rental = await createCertifiedBooking(adminClient, body, { user: authenticatedUser });
      return json(res, 200, rental);
    }

    if (req.method === 'POST' && action === 'create-marketplace') {
      const body = parseBody(req.body);
      const authenticatedUserId = await getAuthenticatedUserId(req);
      const requestRow = await createMarketplaceRequest(adminClient, {
        ...body,
        userId: authenticatedUserId || body.userId || null,
      });
      return json(res, 200, requestRow);
    }

    if ((req.method === 'POST' || req.method === 'PATCH') && action === 'update-state') {
      const body = parseBody(req.body);
      const rentalId = String(body.rentalId || '').trim();
      if (!rentalId) {
        return json(res, 400, { error: 'Missing rentalId' });
      }
      const rental = await updateWebsiteBookingState(adminClient, rentalId, body);
      return json(res, 200, rental);
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    if (isCustomersTablePermissionError(error)) {
      return json(res, 500, {
        error:
          'Database grant missing: service_role cannot access app_4c3a7a6153_customers. Apply src/migrations/grant_service_role_customers_access.sql and retry.',
      });
    }

    return json(res, Number(error?.status || 500), { error: error.message || 'Failed to process public booking request' });
  }
}
