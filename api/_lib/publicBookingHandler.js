import { APP_USERS_TABLE, createSupabaseClients } from './supabase.js';
import { authenticateRequest } from './auth.js';
import { randomUUID } from 'crypto';
import {
  EMAIL_SENDERS,
  buildBookingConfirmationEmail,
  sendResendEmail,
} from './email.js';
import { insertRentalEvent } from './rentalEvents.js';
import { processTelegramRentalAlert } from './telegramAlertsHandler.js';
import {
  buildThreadKey,
  SHARED_MESSAGES_TABLE,
  SHARED_MESSAGE_THREADS_TABLE,
  isSharedMessagesSchemaUnavailable,
  isSharedMessageThreadsSchemaUnavailable,
} from './messages.js';

const WEBSITE_BOOKING_SOURCE = 'website';
const WEBSITE_BLOCKING_STATUSES = ['verified', 'awaiting_payment', 'payment_submitted', 'confirmed'];
const WEBSITE_ACTIVE_DEDUPE_STATUSES = ['pending', 'verified', 'awaiting_payment', 'payment_submitted', 'confirmed'];
const REAL_BLOCKING_RENTAL_STATUSES = ['scheduled', 'confirmed', 'active', 'in_progress', 'checked_out'];
const DEFAULT_BUFFER_MINUTES = 60;
const DEFAULT_SCHEDULED_GRACE_MINUTES = 120;

const json = (res, status, body) => res.status(status).json(body);

const getRequestOrigin = (req) => {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const host = forwardedHost || String(req.headers.host || '').trim();
  const proto = forwardedProto || (host.includes('localhost') ? 'http' : 'https');
  return host ? `${proto}://${host}` : 'https://saharax.driveout.io';
};

const getRequestHostname = (req) => {
  try {
    return new URL(getRequestOrigin(req)).hostname;
  } catch {
    return String(req?.headers?.host || '').split(':')[0].trim();
  }
};

const formatDateTimeForEmail = (value, locale = 'en-MA') => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const formatMoneyForEmail = (value, currency = 'MAD', locale = 'en-MA') =>
  `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Number(value || 0))} ${currency}`;

const escapeHtml = (value = '') =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const buildAccountAccessUrls = ({ publicOrigin, accountPath, email = '', hasAccount = false }) => {
  const safePath = String(accountPath || '').startsWith('/') ? String(accountPath) : '/account';
  const normalizedEmail = normalizeEmail(email);
  const loginUrl = `${publicOrigin}/login?redirect=${encodeURIComponent(safePath)}`;
  const signUpUrl = `${publicOrigin}/register?redirect=${encodeURIComponent(safePath)}${normalizedEmail ? `&email=${encodeURIComponent(normalizedEmail)}` : ''}`;

  return {
    openBookingUrl: hasAccount ? loginUrl : signUpUrl,
    signInUrl: loginUrl,
    signUpUrl,
  };
};

const buildOwnerMarketplaceRequestUrl = ({ requestId = '' }) => {
  const safeRequestId = String(requestId || '').trim();
  if (!safeRequestId) {
    return 'https://driveout.io/account/vehicles';
  }

  return `https://driveout.io/account/vehicles?requestId=${encodeURIComponent(safeRequestId)}#requests`;
};

const lookupExistingAccountByEmail = async (adminClient, email) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return false;

  const { data, error } = await adminClient
    .from(APP_USERS_TABLE)
    .select('id')
    .ilike('email', normalizedEmail)
    .limit(1);

  if (error) {
    console.warn('booking email account lookup failed:', error?.message || error);
    return false;
  }

  return Boolean(data?.[0]?.id);
};

const sendCertifiedBookingConfirmationEmail = async ({
  adminClient,
  rental,
  listing,
  packageSelection,
  assignedVehicle,
  publicOrigin,
}) => {
  const customerEmail = normalizeEmail(rental?.customer_email);
  if (!customerEmail) return;

  const hasAccount = await lookupExistingAccountByEmail(adminClient, customerEmail);
  const accountPath = `/account/rentals/${encodeURIComponent(String(rental?.id || ''))}`;
  const accessUrls = buildAccountAccessUrls({
    publicOrigin,
    accountPath,
    email: customerEmail,
    hasAccount,
  });

  const reference =
    String(rental?.rental_id || '').trim() ||
    String(rental?.id || '').trim();
  const vehicleLabel =
    [listing?.brand, listing?.model].filter(Boolean).join(' ') ||
    [assignedVehicle?.name, assignedVehicle?.model].filter(Boolean).join(' ') ||
    'Certified fleet vehicle';
  const contractUrl = `${publicOrigin}/view/rental/${encodeURIComponent(String(rental?.id || ''))}?type=contract`;
  const receiptUrl = `${publicOrigin}/view/rental/${encodeURIComponent(String(rental?.id || ''))}?type=receipt`;

  const emailPayload = buildBookingConfirmationEmail({
    bookingType: 'rental',
    customerName: rental?.customer_name,
    bookingReference: reference,
    hasAccount,
    openBookingUrl: accessUrls.openBookingUrl,
    signInUrl: accessUrls.signInUrl,
    signUpUrl: accessUrls.signUpUrl,
    contractUrl,
    receiptUrl,
    summaryRows: [
      { label: 'Vehicle', value: vehicleLabel },
      { label: 'Start', value: formatDateTimeForEmail(rental?.rental_start_date) },
      { label: 'End', value: formatDateTimeForEmail(rental?.rental_end_date) },
      { label: 'Package', value: String(packageSelection?.name || rental?.selected_package_name || 'Standard booking') },
      { label: 'Total', value: formatMoneyForEmail(rental?.total_amount) },
    ],
  });

  await sendResendEmail({
    from: EMAIL_SENDERS.bookings,
    to: customerEmail,
    subject: emailPayload.subject,
    html: emailPayload.html,
    replyTo: 'bookings@send.saharax.driveout.io',
  });
};

const sendMarketplaceOwnerRequestEmail = async ({
  adminClient,
  requestRow,
  listing,
}) => {
  const ownerId = String(requestRow?.owner_id || listing?.owner_id || '').trim();
  if (!ownerId) return;

  const { data: ownerRow, error: ownerError } = await adminClient
    .from(APP_USERS_TABLE)
    .select('id, email, full_name, username')
    .eq('id', ownerId)
    .maybeSingle();

  if (ownerError) {
    throw ownerError;
  }

  const ownerEmail = normalizeEmail(ownerRow?.email);
  if (!ownerEmail) return;

  const listingTitle = String(
    listing?.title ||
    requestRow?.listing_title ||
    'Marketplace vehicle'
  ).trim();
  const customerName = String(requestRow?.customer_name || 'Customer').trim();
  const customerEmail = normalizeEmail(requestRow?.customer_email);
  const customerPhone = normalizeText(requestRow?.customer_phone);
  const startLabel = formatDateTimeForEmail(requestRow?.requested_start_at);
  const endLabel = formatDateTimeForEmail(requestRow?.requested_end_at);
  const duration = Math.max(1, Number(requestRow?.duration || 1));
  const rentalType = String(requestRow?.rental_type || 'hourly').trim().toLowerCase();
  const baseAmount = rentalType === 'daily'
    ? Number(listing?.daily_price_amount || 0) * duration
    : Number(listing?.hourly_price_amount || 0) * duration;
  const requestUrl = buildOwnerMarketplaceRequestUrl({ requestId: requestRow?.id });

  const messageBlock = normalizeText(requestRow?.customer_message)
    ? `
      <div style="margin:18px 0 0 0;border:1px solid #e2e8f0;border-radius:18px;padding:16px;background:#f8fafc;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#64748b;">Customer note</div>
        <p style="margin:10px 0 0 0;font-size:14px;line-height:22px;color:#0f172a;">${escapeHtml(requestRow.customer_message)}</p>
      </div>
    `
    : '';

  await sendResendEmail({
    from: EMAIL_SENDERS.bookings,
    to: ownerEmail,
    subject: `New marketplace request • ${listingTitle}`,
    replyTo: customerEmail || undefined,
    html: `
      <div style="font-size:15px;line-height:24px;color:#475569;">
        <p style="margin:0 0 12px 0;">Hello ${escapeHtml(ownerRow?.full_name || ownerRow?.username || 'Owner')},</p>
        <p style="margin:0 0 12px 0;"><strong>${escapeHtml(customerName)}</strong> just sent a marketplace request for <strong>${escapeHtml(listingTitle)}</strong>.</p>
        <div style="margin:0 0 18px 0;border:1px solid #ede9fe;border-radius:22px;padding:18px;background:linear-gradient(180deg,#ffffff 0%,#faf5ff 100%);">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#8b5cf6;">Request summary</div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:16px;">
            <tr><td style="padding:0 0 12px 0;font-size:13px;color:#64748b;">Vehicle</td><td style="padding:0 0 12px 18px;font-size:14px;color:#0f172a;font-weight:700;text-align:right;">${escapeHtml(listingTitle)}</td></tr>
            <tr><td style="padding:0 0 12px 0;font-size:13px;color:#64748b;">Customer</td><td style="padding:0 0 12px 18px;font-size:14px;color:#0f172a;font-weight:700;text-align:right;">${escapeHtml(customerName)}</td></tr>
            <tr><td style="padding:0 0 12px 0;font-size:13px;color:#64748b;">Start</td><td style="padding:0 0 12px 18px;font-size:14px;color:#0f172a;font-weight:700;text-align:right;">${escapeHtml(startLabel || 'Pending')}</td></tr>
            <tr><td style="padding:0 0 12px 0;font-size:13px;color:#64748b;">End</td><td style="padding:0 0 12px 18px;font-size:14px;color:#0f172a;font-weight:700;text-align:right;">${escapeHtml(endLabel || 'Pending')}</td></tr>
            <tr><td style="padding:0 0 12px 0;font-size:13px;color:#64748b;">Duration</td><td style="padding:0 0 12px 18px;font-size:14px;color:#0f172a;font-weight:700;text-align:right;">${duration} ${rentalType === 'daily' ? 'day(s)' : 'hour(s)'}</td></tr>
            <tr><td style="padding:0 0 12px 0;font-size:13px;color:#64748b;">Est. amount</td><td style="padding:0 0 12px 18px;font-size:14px;color:#0f172a;font-weight:700;text-align:right;">${escapeHtml(formatMoneyForEmail(baseAmount || 0))}</td></tr>
            ${customerPhone ? `<tr><td style="padding:0;font-size:13px;color:#64748b;">Phone</td><td style="padding:0 0 0 18px;font-size:14px;color:#0f172a;font-weight:700;text-align:right;">${escapeHtml(customerPhone)}</td></tr>` : ''}
          </table>
          ${messageBlock}
        </div>
        <div style="margin:0 0 14px 0;">
          <a href="${escapeHtml(requestUrl)}" style="display:inline-flex;align-items:center;justify-content:center;border-radius:999px;background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:12px 20px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">Review request</a>
        </div>
        <p style="margin:0;">Open your owner workspace to approve, decline, or send a counter-offer.</p>
      </div>
    `,
  });
};

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

const isSharedMessageParticipantsSchemaUnavailable = (error) => {
  const code = String(error?.code || '').trim().toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === '42703' ||
    code === '42501' ||
    code === 'PGRST205' ||
    message.includes('shared_message_participants') ||
    message.includes('permission denied') ||
    message.includes('schema cache')
  );
};

const updateBookingRequestWithCompatiblePayload = async (adminClient, requestId, payload = {}) => {
  const safeRequestId = String(requestId || '').trim();
  if (!safeRequestId) return null;

  let compatiblePayload = { ...payload };

  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (!Object.keys(compatiblePayload).length) return null;

    const { data, error } = await adminClient
      .from('app_booking_requests')
      .update(compatiblePayload)
      .eq('id', safeRequestId)
      .select('*')
      .maybeSingle();

    if (!error) return data || null;

    const missingColumn = getMissingColumnName(error);
    if (missingColumn && Object.prototype.hasOwnProperty.call(compatiblePayload, missingColumn)) {
      const { [missingColumn]: _removed, ...nextPayload } = compatiblePayload;
      compatiblePayload = nextPayload;
      continue;
    }

    throw error;
  }

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

const buildWebsiteReservationVehicleLabel = ({ rental = {}, listing = {}, assignedVehicle = {} } = {}) => {
  const vehicleModel =
    normalizeText(rental.selected_vehicle_model_snapshot) ||
    normalizeText(assignedVehicle.model) ||
    normalizeText(assignedVehicle.model_name) ||
    normalizeText(assignedVehicle.name) ||
    normalizeText(listing.modelName) ||
    normalizeText(listing.model_name) ||
    normalizeText(listing.title) ||
    'Reserved vehicle';
  const vehicleCode =
    normalizeText(rental.vehicle_plate_number) ||
    normalizeText(assignedVehicle.vehicle_number) ||
    normalizeText(assignedVehicle.plate_number) ||
    normalizeText(assignedVehicle.code) ||
    normalizeText(listing.vehicleNumber);

  return [vehicleModel, vehicleCode].filter(Boolean).join(' • ');
};

const dispatchWebsiteReservationTelegramAlert = async ({
  adminClient,
  rental,
  listing = {},
  packageSelection = {},
  assignedVehicle = null,
  hostname = '',
}) => {
  if (!adminClient || !rental?.id) return null;

  const payload = {
    id: rental.id,
    eventType: 'website_reservation_created',
    reference: rental.rental_id || rental.rental_reference || '',
    vehicle: buildWebsiteReservationVehicleLabel({ rental, listing, assignedVehicle: assignedVehicle || {} }),
    customer: rental.customer_name || '',
    customerPhone: rental.customer_phone || '',
    start: rental.rental_start_date || rental.start_date || '',
    end: rental.rental_end_date || rental.end_date || '',
    total:
      rental.total_amount ??
      rental.selected_package_fixed_amount ??
      packageSelection?.amount ??
      listing?.priceFrom ??
      0,
    remaining: rental.remaining_amount ?? 0,
    tenant_id: rental.tenant_id || listing.tenantId || listing.raw?.tenant_id || '',
    business_account_id: rental.business_account_id || listing.businessAccountId || listing.raw?.business_account_id || '',
    tenant_slug: rental.tenant_slug || listing.tenantSlug || listing.raw?.tenant_slug || '',
    bookingSource: 'website',
    createdBy: 'Website',
  };

  const result = await processTelegramRentalAlert({
    adminClient,
    actorUser: null,
    payload,
    hostname,
  });

  if (result?.status && result.status >= 400) {
    throw new Error(result?.body?.error || result?.body?.reason || 'Website reservation Telegram alert failed');
  }

  return result?.body || result || null;
};

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
const isRqReference = (value = '') => String(value || '').toLowerCase().startsWith('rq_');
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

  const normalizedRentalType = rentalType === 'half_day' ? 'hourly' : rentalType;
  const startIso = toIsoDateTime(startDate, startTime);
  const endIso = addDuration(startIso, duration, normalizedRentalType);
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

  const existingRequestsQuery = await adminClient
    .from('app_booking_requests')
    .select('*')
    .eq('listing_id', sanitizeUuid(listingId))
    .order('created_at', { ascending: false })
    .limit(25);

  if (existingRequestsQuery.error) {
    throw existingRequestsQuery.error;
  }

  const normalizedCustomerEmail = customerEmailValue.trim().toLowerCase();
  const normalizedUserId = cleanValue(userId);
  const initialEstimatedAmount = normalizedRentalType === 'daily'
    ? Number(listing?.dailyPrice || listing?.daily_price_amount || 0) * Math.max(1, Number(duration || 1))
    : Number(listing?.hourlyPrice || listing?.hourly_price_amount || 0) * Math.max(1, Number(duration || 1));
  const initialCommissionAmount = Math.max(0, Math.round(Number(initialEstimatedAmount || 0) * 0.15));
  const initialDepositAmount = Math.max(
    0,
    Number(
      listing?.depositAmount ||
      listing?.deposit_amount ||
      listing?.raw?.deposit_amount ||
      0
    )
  );

  if (!normalizedUserId) {
    throw createHttpError(400, 'Please sign in and open Wallet before sending a marketplace request.');
  }

  if (initialDepositAmount > 0) {
    const { data: walletRow, error: walletError } = await adminClient
      .from('app_wallet_accounts')
      .select('*')
      .eq('owner_id', normalizedUserId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (walletError) {
      throw walletError;
    }

    const walletBalance = Math.max(
      0,
      Number(walletRow?.current_balance ?? walletRow?.balance ?? walletRow?.wallet_balance ?? 0)
    );

    if (!walletRow?.id) {
      throw createHttpError(
        400,
        `Open Wallet first. ${initialDepositAmount} MAD is required to cover the damage deposit before sending this request.`
      );
    }

    if (walletBalance < initialDepositAmount) {
      throw createHttpError(
        400,
        `You need ${initialDepositAmount} MAD in your wallet to cover the damage deposit before sending this request.`
      );
    }
  }

  const openRequestStatuses = new Set(['pending', 'countered', 'pre_approved', 'approved']);
  const existingOpenRequest = (Array.isArray(existingRequestsQuery.data) ? existingRequestsQuery.data : []).find((row) => {
    const requestStatus = String(row?.request_status || '').trim().toLowerCase();
    if (!openRequestStatuses.has(requestStatus)) return false;

    const rowCustomerId = cleanValue(row?.customer_id);
    const rowCustomerExtId = cleanValue(row?.customer_ext_id);
    const rowCustomerEmail = String(row?.customer_email || '').trim().toLowerCase();

    if (normalizedUserId && (rowCustomerId === normalizedUserId || rowCustomerExtId === normalizedUserId)) {
      return true;
    }

    return Boolean(normalizedCustomerEmail) && rowCustomerEmail === normalizedCustomerEmail;
  });

  if (existingOpenRequest) {
    return {
      ...existingOpenRequest,
      duplicate_request_blocked: true,
    };
  }

  const requestReference = createRequestReference();
  const customerExtId = isUuid(normalizedUserId) ? normalizedUserId : null;
  const payloadRow = {
    id: createBookingId(),
    request_reference: requestReference,
    listing_id: sanitizeUuid(listingId),
    vehicle_public_profile_id: sanitizeUuid(cleanValue(listing.vehiclePublicProfileId)),
    owner_id: sanitizeUuid(ownerId),
    customer_id: normalizedUserId,
    customer_ext_id: customerExtId,
    customer_name: customerNameValue,
    customer_email: customerEmailValue,
    customer_phone: customerPhoneValue,
    request_status: 'pending',
    requested_start_at: startIso,
    requested_end_at: endIso,
    rental_type: normalizedRentalType === 'daily' ? 'daily' : 'hourly',
    duration: Number(duration || 1),
    customer_message: cleanValue(message),
    counter_offer: {
      funds_model: 'owner_fee_customer_deposit',
      platform_fee_amount: initialCommissionAmount,
      platform_fee_status: 'pending',
      damage_deposit_amount: initialDepositAmount,
      damage_deposit_status: initialDepositAmount > 0 ? 'pending' : 'not_required',
    },
  };

  if (!isUuid(payloadRow.id)) delete payloadRow.id;
  if (!payloadRow.listing_id || !payloadRow.owner_id) {
    throw createHttpError(400, 'This marketplace listing is missing owner information. Please try another listing.');
  }

  let createdRow = null;
  let { data, error } = await adminClient
    .from('app_booking_requests')
    .insert([payloadRow])
    .select('*')
    .single();
  if (error) {
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('invalid input syntax for type uuid')) {
      const fallback = {
        ...payloadRow,
        request_reference: requestReference,
        counter_offer: {
          ...(payloadRow.counter_offer || {}),
          request_reference: requestReference,
        },
      };
      if (!isUuid(fallback.id)) delete fallback.id;
      ({ data, error } = await adminClient
        .from('app_booking_requests')
        .insert([fallback])
        .select('*')
        .single());
    }
  }
  if (error) throw error;
  createdRow = data || null;
  const createdRequest = {
    ...payloadRow,
    ...(createdRow || {}),
    request_reference: cleanValue(createdRow?.request_reference) || requestReference,
  };
  await insertRentalEvent(adminClient, {
    rentalId: createdRequest.id,
    eventType: 'request_sent',
    actor: 'renter',
    metadata: {
      listingId: createdRequest.listing_id,
      ownerId: createdRequest.owner_id,
      customerId: createdRequest.customer_id || null,
      requestedStartAt: createdRequest.requested_start_at,
      requestedEndAt: createdRequest.requested_end_at,
      duration: createdRequest.duration,
      rentalType: createdRequest.rental_type,
    },
  });

  const createMarketplaceRequestThread = async () => {
    const ownerUserId = String(createdRequest.owner_id || '').trim();
    const customerUserId = String(createdRequest.customer_id || '').trim();
    const senderUserId = customerUserId || ownerUserId;
    const recipientUserId = ownerUserId || customerUserId;
    if (!senderUserId || !recipientUserId) return null;

    const threadKey = buildThreadKey({
      family: 'marketplace',
      threadType: 'marketplace_customer_request',
      entityType: 'marketplace_request',
      entityId: createdRequest.id,
      recipientUserId,
      senderUserId,
    });

    const threadPayload = {
      thread_key: threadKey,
      family: 'marketplace',
      thread_type: 'marketplace_customer_request',
      entity_type: 'marketplace_request',
      entity_id: String(createdRequest.id || '').trim(),
      context_type: 'request',
      context_id: String(createdRequest.id || '').trim(),
      sender_user_id: senderUserId,
      recipient_user_id: recipientUserId,
      priority: 'normal',
      waiting_on: 'owner',
      workflow_status: 'active',
      visibility_scope: 'public',
      metadata: {
        requestId: String(createdRequest.id || '').trim(),
        requestReference,
      },
      updated_at: new Date().toISOString(),
    };

    const { data: threadRow, error: threadError } = await adminClient
      .from(SHARED_MESSAGE_THREADS_TABLE)
      .upsert(threadPayload, {
        onConflict: 'thread_key',
      })
      .select('*')
      .maybeSingle();

    if (threadError) {
      if (isSharedMessageThreadsSchemaUnavailable(threadError)) {
        return { threadKey, threadRow: null };
      }
      throw threadError;
    }

    const threadLinkPayload = {
      thread_key: threadKey,
    };
    const threadRowId = threadRow?.id ? String(threadRow.id).trim() : '';
    if (threadRowId) {
      threadLinkPayload.thread_id = threadRowId;
    }

    const updatedRequest = await updateBookingRequestWithCompatiblePayload(
      adminClient,
      createdRequest.id,
      threadLinkPayload
    );

    if (updatedRequest) {
      Object.assign(createdRequest, updatedRequest);
    } else {
      createdRequest.thread_key = threadKey;
      if (threadRowId) createdRequest.thread_id = threadRowId;
    }

    return {
      threadKey,
      threadRow,
    };
  };

  const threadState = await createMarketplaceRequestThread().catch((threadError) => {
    console.warn('marketplace request thread creation failed:', threadError?.message || threadError);
    return null;
  });

  const syncMarketplaceThreadParticipants = async () => {
    const threadRowId = String(threadState?.threadRow?.id || createdRequest.thread_id || '').trim();
    const ownerUserId = String(createdRequest.owner_id || '').trim();
    const customerUserId = String(createdRequest.customer_id || '').trim();
    if (!threadRowId || !ownerUserId) return null;

    const participantRows = [
      {
        thread_id: threadRowId,
        user_id: ownerUserId,
        participant_role: 'owner',
        visibility_scope: 'public',
        is_primary: true,
        metadata: {
          contextType: 'marketplace_request',
          contextId: String(createdRequest.id || '').trim(),
          requestReference,
          syncSource: 'public_booking_request_create',
        },
      },
    ];

    if (customerUserId) {
      participantRows.push({
        thread_id: threadRowId,
        user_id: customerUserId,
        participant_role: 'customer',
        visibility_scope: 'public',
        is_primary: true,
        metadata: {
          contextType: 'marketplace_request',
          contextId: String(createdRequest.id || '').trim(),
          requestReference,
          syncSource: 'public_booking_request_create',
        },
      });
    }

    const { error: participantError } = await adminClient
      .from('shared_message_participants')
      .upsert(participantRows, {
        onConflict: 'thread_id,user_id',
      });

    if (participantError) {
      if (isSharedMessageParticipantsSchemaUnavailable(participantError)) {
        return null;
      }
      throw participantError;
    }

    return participantRows.length;
  };

  await syncMarketplaceThreadParticipants().catch((participantError) => {
    console.warn('marketplace thread participant sync failed:', participantError?.message || participantError);
    return null;
  });

  const createMarketplaceSubmissionEvent = async () => {
    const customerUserId = String(createdRequest.customer_id || '').trim();
    const ownerUserId = String(createdRequest.owner_id || '').trim();
    const senderUserId = customerUserId || ownerUserId;
    const recipientUserId = ownerUserId || customerUserId;
    if (!senderUserId || !recipientUserId) return;

    const threadKey =
      String(createdRequest.thread_key || '').trim() ||
      String(threadState?.threadKey || '').trim() ||
      buildThreadKey({
        family: 'marketplace',
        threadType: 'marketplace_customer_request',
        entityType: 'marketplace_request',
        entityId: createdRequest.id,
        recipientUserId,
        senderUserId,
      });

    const detailParts = [
      listing?.title || 'Marketplace request',
      startIso ? formatDateTimeForEmail(startIso) : '',
      Number(duration || 0) > 0
        ? `${Number(duration)} ${normalizedRentalType === 'daily' ? (Number(duration) === 1 ? 'day' : 'days') : (Number(duration) === 1 ? 'hour' : 'hours')}`
        : '',
    ].filter(Boolean);

    const metadata = {
      type: 'marketplace_request',
      event: 'request_submitted',
      requestId: String(createdRequest.id || '').trim(),
      requestReference,
      requestStatus: 'pending',
      status: 'pending',
      replyEnabled: false,
      href: `/account/rentals/requests/${encodeURIComponent(String(createdRequest.id || ''))}`,
      listingId: String(createdRequest.listing_id || '').trim(),
      listingTitle: String(listing?.title || '').trim(),
      vehicleName: String(listing?.title || '').trim(),
      imageUrl: String(listing?.imageUrl || listing?.image_url || listing?.coverImageUrl || '').trim(),
      requestedStartAt: createdRequest.requested_start_at,
      requestedEndAt: createdRequest.requested_end_at,
      rentalType: createdRequest.rental_type,
      duration: createdRequest.duration,
      customerName: createdRequest.customer_name,
      customerNote: String(createdRequest.customer_message || '').trim(),
      detailLine: detailParts.join(' • '),
    };
    const threadRowId = String(threadState?.threadRow?.id || createdRequest.thread_id || '').trim();

    const { data: sharedMessageRow, error: messageError } = await adminClient
      .from(SHARED_MESSAGES_TABLE)
      .insert({
        ...(threadRowId ? { thread_id: threadRowId } : {}),
        thread_key: threadKey,
        family: 'marketplace',
        thread_type: 'marketplace_customer_request',
        entity_type: 'marketplace_request',
        entity_id: String(createdRequest.id || '').trim(),
        message_type: 'submission_event',
        subject: String(listing?.title || 'Marketplace request').trim() || 'Marketplace request',
        body: 'Request submitted',
        sender_user_id: senderUserId,
        sender_role: customerUserId ? 'customer' : 'system',
        recipient_user_id: recipientUserId,
        recipient_role: 'owner',
        metadata,
        is_internal: false,
        status: 'sent',
      })
      .select('id')
      .maybeSingle();

    if (!messageError) {
      return {
        channel: 'shared_messages',
        id: sharedMessageRow?.id || null,
      };
    }

    if (!isSharedMessagesSchemaUnavailable(messageError)) {
      throw messageError;
    }

    const senderType = customerUserId ? 'customer' : 'system';
    const { data: bookingMessageRow, error: bookingMessageError } = await adminClient
      .from('app_booking_messages')
      .insert({
        booking_request_id: createdRequest.id,
        sender_id: customerUserId || null,
        sender_type: senderType,
        message_body: String(createdRequest.customer_message || '').trim() || 'Request submitted',
        message_kind: 'submission_event',
        metadata,
      })
      .select('id')
      .maybeSingle();

    if (bookingMessageError) {
      throw bookingMessageError;
    }

    return {
      channel: 'app_booking_messages',
      id: bookingMessageRow?.id || null,
    };
  };

  await createMarketplaceSubmissionEvent();
  return createdRequest;
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
      void sendCertifiedBookingConfirmationEmail({
        adminClient,
        rental,
        listing: body?.listing || {},
        packageSelection: body?.packageSelection || {},
        assignedVehicle: rental?.assigned_vehicle || null,
        publicOrigin: getRequestOrigin(req),
      }).catch((emailError) => {
        console.warn('certified booking confirmation email failed:', emailError?.message || emailError);
      });
      void dispatchWebsiteReservationTelegramAlert({
        adminClient,
        rental,
        listing: body?.listing || {},
        packageSelection: body?.packageSelection || {},
        assignedVehicle: rental?.assigned_vehicle || null,
        hostname: getRequestHostname(req),
      }).catch((telegramError) => {
        console.warn('website reservation Telegram alert failed (non-blocking):', telegramError?.message || telegramError);
      });
      return json(res, 200, rental);
    }

    if (req.method === 'POST' && action === 'create-marketplace') {
      const body = parseBody(req.body);
      const authenticatedUserId = await getAuthenticatedUserId(req);
      const requestRow = await createMarketplaceRequest(adminClient, {
        ...body,
        userId: authenticatedUserId || body.userId || null,
      });
      if (!requestRow?.duplicate_request_blocked) {
        await sendMarketplaceOwnerRequestEmail({
          adminClient,
          requestRow,
          listing: body?.listing || {},
        }).catch((emailError) => {
          console.warn('marketplace owner request email failed:', emailError?.message || emailError);
        });
      }
      return json(res, 200, requestRow);
    }

    if (req.method === 'GET' && action === 'existing-marketplace') {
      const listingId = String(req.query?.listingId || '').trim();
      const authenticatedUser = await getAuthenticatedUser(req);
      const authenticatedUserId = authenticatedUser?.id || null;
      const authenticatedUserEmail = String(authenticatedUser?.email || '').trim().toLowerCase();

      if (!listingId || (!authenticatedUserId && !authenticatedUserEmail)) {
        return json(res, 200, null);
      }

      const { data, error } = await adminClient
        .from('app_booking_requests')
        .select('*')
        .eq('listing_id', sanitizeUuid(listingId))
        .order('created_at', { ascending: false })
        .limit(25);

      if (error) throw error;

      const openRequestStatuses = new Set(['pending', 'countered', 'pre_approved', 'approved']);
      const existingRequest = (Array.isArray(data) ? data : []).find((row) => {
        const requestStatus = String(row?.request_status || '').trim().toLowerCase();
        if (!openRequestStatuses.has(requestStatus)) return false;

        const rowCustomerId = cleanValue(row?.customer_id);
        const rowCustomerExtId = cleanValue(row?.customer_ext_id);
        const rowCustomerEmail = String(row?.customer_email || '').trim().toLowerCase();

        if (authenticatedUserId && (rowCustomerId === authenticatedUserId || rowCustomerExtId === authenticatedUserId)) {
          return true;
        }

        return Boolean(authenticatedUserEmail) && rowCustomerEmail === authenticatedUserEmail;
      });

      return json(res, 200, existingRequest || null);
    }

    if (req.method === 'GET' && action === 'existing-marketplace-list') {
      const authenticatedUser = await getAuthenticatedUser(req);
      const authenticatedUserId = authenticatedUser?.id || null;
      const authenticatedUserEmail = String(authenticatedUser?.email || '').trim().toLowerCase();

      if (!authenticatedUserId && !authenticatedUserEmail) {
        return json(res, 200, []);
      }

      const { data, error } = await adminClient
        .from('app_booking_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;

      const openRequestStatuses = new Set(['pending', 'countered', 'pre_approved', 'approved']);
      const requestsByListing = new Map();

      (Array.isArray(data) ? data : []).forEach((row) => {
        const requestStatus = String(row?.request_status || '').trim().toLowerCase();
        if (!openRequestStatuses.has(requestStatus)) return;

        const rowCustomerId = cleanValue(row?.customer_id);
        const rowCustomerExtId = cleanValue(row?.customer_ext_id);
        const rowCustomerEmail = String(row?.customer_email || '').trim().toLowerCase();
        const matchesUser =
          (authenticatedUserId && (rowCustomerId === authenticatedUserId || rowCustomerExtId === authenticatedUserId)) ||
          (authenticatedUserEmail && rowCustomerEmail === authenticatedUserEmail);

        if (!matchesUser) return;

        const listingId = cleanValue(row?.listing_id);
        if (!listingId || requestsByListing.has(listingId)) return;
        requestsByListing.set(listingId, row);
      });

      return json(res, 200, Array.from(requestsByListing.values()));
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
