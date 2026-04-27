import { authenticateRequest } from './_lib/auth.js';
import { APP_USERS_TABLE, createSupabaseClients } from './_lib/supabase.js';
import { handleTourPackages } from './_lib/tourPackagesShared.js';
import { handleTourTracking } from './_lib/tourTrackingShared.js';
import {
  EMAIL_SENDERS,
  buildBookingConfirmationEmail,
  sendResendEmail,
} from './_lib/email.js';

const TOUR_BOOKINGS_TABLE = 'app_687f658e98_tour_bookings';
const TOUR_PACKAGES_TABLE = 'app_687f658e98_tour_packages';
const TOUR_PACKAGE_MODEL_PRICES_TABLE = 'app_687f658e98_tour_package_model_prices';
const TOUR_BOOKING_MARKER = '[tour_booking]';
const GLOBAL_TOUR_PRICING_KEY = '__global_tour_pricing__';

const json = (res, status, body) => res.status(status).json(body);

const isTourBookingsSchemaUnavailable = (error) => {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || error?.details || '').toLowerCase();
  return (
    code === '42P01' ||
    code === '42703' ||
    code === '42501' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    message.includes('tour_bookings') ||
    message.includes('tour_packages') ||
    message.includes('tour_package_model_prices') ||
    message.includes('does not exist') ||
    message.includes('permission denied') ||
    message.includes('schema cache')
  );
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

const createBookingId = () => crypto.randomUUID();

const normalizeEmail = (value = '') => String(value || '').trim().toLowerCase();

const getRequestOrigin = (req) => {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const host = forwardedHost || String(req.headers.host || '').trim();
  const proto = forwardedProto || (host.includes('localhost') ? 'http' : 'https');
  return host ? `${proto}://${host}` : 'https://saharax.driveout.io';
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

const getSafeAccountPath = (groupId) => `/account/tours/${encodeURIComponent(String(groupId || ''))}`;

const buildAccountAccessUrls = ({ publicOrigin, accountPath, email = '', hasAccount = false }) => {
  const safePath = String(accountPath || '').startsWith('/') ? String(accountPath) : '/account/tours';
  const normalizedEmail = normalizeEmail(email);
  const loginUrl = `${publicOrigin}/login?redirect=${encodeURIComponent(safePath)}`;
  const signUpUrl = `${publicOrigin}/register?redirect=${encodeURIComponent(safePath)}${normalizedEmail ? `&email=${encodeURIComponent(normalizedEmail)}` : ''}`;

  return {
    openBookingUrl: hasAccount ? loginUrl : signUpUrl,
    signInUrl: loginUrl,
    signUpUrl,
  };
};

const lookupExistingAccountByEmail = async (adminClient, email) => {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;

  const { data, error } = await adminClient
    .from(APP_USERS_TABLE)
    .select('id')
    .ilike('email', normalized)
    .limit(1);

  if (error) {
    console.warn('tour booking account lookup failed:', error?.message || error);
    return false;
  }

  return Boolean(data?.[0]?.id);
};

const sendTourBookingConfirmationEmail = async ({
  adminClient,
  requestOrigin,
  groupId,
  packageName,
  totalAmount,
  scheduledStart,
  customerName,
  customerEmail,
  quadCount,
  ridersCount,
}) => {
  const normalizedEmail = normalizeEmail(customerEmail);
  if (!normalizedEmail) return;

  const hasAccount = await lookupExistingAccountByEmail(adminClient, normalizedEmail);
  const accessUrls = buildAccountAccessUrls({
    publicOrigin: requestOrigin,
    accountPath: getSafeAccountPath(groupId),
    email: normalizedEmail,
    hasAccount,
  });

  const emailPayload = buildBookingConfirmationEmail({
    bookingType: 'tour',
    customerName,
    bookingReference: groupId,
    hasAccount,
    openBookingUrl: accessUrls.openBookingUrl,
    signInUrl: accessUrls.signInUrl,
    signUpUrl: accessUrls.signUpUrl,
    summaryRows: [
      { label: 'Tour', value: String(packageName || 'Tour booking') },
      { label: 'Scheduled for', value: formatDateTimeForEmail(scheduledStart) },
      { label: 'Guests', value: `${Number(ridersCount || quadCount || 1)} guest${Number(ridersCount || quadCount || 1) > 1 ? 's' : ''}` },
      { label: 'Quads', value: `${Number(quadCount || 1)}` },
      { label: 'Total', value: formatMoneyForEmail(totalAmount) },
    ],
  });

  await sendResendEmail({
    from: EMAIL_SENDERS.bookings,
    to: normalizedEmail,
    subject: emailPayload.subject,
    html: emailPayload.html,
    replyTo: 'bookings@send.saharax.driveout.io',
  });
};

const extractMarkedJson = (text, marker) => {
  const source = String(text || '');
  const index = source.indexOf(marker);
  if (index === -1) return null;

  const payload = source.slice(index + marker.length).trim();
  if (!payload) return null;

  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
};

const normalizeTimestamp = (value, fallback = null) => {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
};

const normalizeDate = (value, fallback = null) => {
  const iso = normalizeTimestamp(value);
  return iso ? iso.slice(0, 10) : fallback;
};

const normalizeDuration = (value) => {
  const duration = Number(value || 0);
  return Number.isFinite(duration) && duration > 0 ? Number(duration.toFixed(1)) : 1;
};

const normalizeSelectedModelMix = (value = []) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      modelId: String(item?.modelId || item?.vehicleModelId || item?.vehicle_model_id || '').trim(),
      label: String(item?.label || item?.vehicleModelLabel || item?.vehicle_model_label || '').trim(),
      count: Math.max(0, Number(item?.count || 0) || 0),
    }))
    .filter((item) => item.modelId && item.count > 0);
};

const normalizeBookingRow = (row = {}) => ({
  ...row,
  id: String(row.id || createBookingId()),
  created_at: row.created_at || new Date().toISOString(),
  updated_at: row.updated_at || new Date().toISOString(),
});

const toTableRow = (row = {}) => {
  const normalized = normalizeBookingRow(row);
  const meta = extractMarkedJson(normalized.notes, TOUR_BOOKING_MARKER) || {};
  const scheduledFor = normalizeTimestamp(
    meta.scheduledStartAt || normalized.scheduled_for || normalized.rental_start_date,
    normalized.created_at
  );
  const scheduledEndAt = normalizeTimestamp(
    meta.scheduledEndAt || normalized.scheduled_end_at || normalized.rental_end_date,
    null
  );

  return {
    id: normalized.id,
    booking_payload: normalized,
    rental_status: String(normalized.rental_status || meta.rentalStatus || normalized.status || 'scheduled'),
    assignment_mode: String(meta.assignmentMode || normalized.assignment_mode || 'assign_on_arrival'),
    package_id: meta.packageId || normalized.package_id || null,
    package_name: meta.packageName || normalized.package_name || null,
    route_type: meta.routeType || normalized.route_type || null,
    location: meta.packageLocation || normalized.location || null,
    guide_id: meta.guideId || normalized.guide_id || null,
    guide_name: meta.guideName || normalized.guide_name || null,
    booked_by_user_id: meta.bookedByUserId || normalized.booked_by_user_id || null,
    booked_by_name: meta.bookedByName || normalized.booked_by_name || null,
    booking_date: normalizeDate(normalized.created_at, new Date().toISOString().slice(0, 10)),
    scheduled_date: normalizeDate(meta.scheduledStartAt || normalized.scheduled_date || normalized.rental_start_date, null),
    scheduled_time: normalized.scheduled_time || (scheduledFor ? scheduledFor.slice(11, 16) : null),
    scheduled_for: scheduledFor,
    scheduled_end_at: scheduledEndAt,
    started_at: normalizeTimestamp(meta.startedAt || normalized.started_at, null),
    completed_at: normalizeTimestamp(meta.completedAt || normalized.completed_at, null),
    cancelled_at: normalizeTimestamp(meta.cancelledAt || normalized.cancelled_at, null),
    quad_count: Number(meta.quadCount || normalized.quad_count || 1),
    riders_count: Number(meta.ridersCount || normalized.riders_count || 1),
    total_amount_mad: Number(
      normalized.total_amount_mad ?? normalized.total_amount ?? meta.totalAmount ?? meta.totalAmountMad ?? 0
    ),
    requires_license: Boolean(meta.requiresLicense ?? normalized.requires_license),
    share_contract: Boolean(meta.shareContract ?? normalized.share_contract),
    receipt_issued: Boolean(meta.receiptIssued ?? normalized.receipt_issued),
    receipt_issued_at: normalizeTimestamp(meta.receiptIssuedAt || normalized.receipt_issued_at, null),
    customer_name: normalized.customer_name || meta.customerName || null,
    customer_phone: normalized.phone || normalized.customer_phone || meta.customerPhone || null,
    customer_email: normalized.customer_email ?? meta.customerEmail ?? '',
    id_number: normalized.id_number || meta.idNumber || null,
    license_number: normalized.license_number || meta.licenseNumber || null,
    notes: String(normalized.notes || ''),
    created_at: normalized.created_at,
    updated_at: normalized.updated_at,
  };
};

const fromTableRow = (row = {}) => {
  const payload = row.booking_payload && typeof row.booking_payload === 'object'
    ? row.booking_payload
    : {};

  return normalizeBookingRow({
    ...payload,
    id: row.id || payload.id,
    vehicle_id: payload.vehicle_id ?? row.vehicle_id ?? null,
    customer_name: payload.customer_name ?? row.customer_name ?? '',
    customer_email: payload.customer_email ?? row.customer_email ?? null,
    phone: payload.phone ?? row.customer_phone ?? '',
    rental_start_date: payload.rental_start_date ?? row.scheduled_for ?? null,
    rental_end_date: payload.rental_end_date ?? row.scheduled_end_at ?? null,
    rental_status: payload.rental_status ?? row.rental_status ?? row.booking_status ?? 'scheduled',
    payment_status: payload.payment_status ?? 'unpaid',
    total_amount: payload.total_amount ?? row.total_amount_mad ?? 0,
    remaining_amount: payload.remaining_amount ?? row.total_amount_mad ?? 0,
    notes: payload.notes ?? row.notes ?? '',
    package_id: payload.package_id ?? row.package_id ?? null,
    package_name: payload.package_name ?? row.package_name ?? null,
    scheduled_for: payload.scheduled_for ?? row.scheduled_for ?? null,
    scheduled_end_at: payload.scheduled_end_at ?? row.scheduled_end_at ?? null,
    scheduled_date: payload.scheduled_date ?? row.scheduled_date ?? null,
    scheduled_time: payload.scheduled_time ?? row.scheduled_time ?? null,
    guide_name: payload.guide_name ?? row.guide_name ?? null,
    guide_id: payload.guide_id ?? row.guide_id ?? null,
    booked_by_name: payload.booked_by_name ?? row.booked_by_name ?? null,
    booked_by_user_id: payload.booked_by_user_id ?? row.booked_by_user_id ?? null,
    created_at: row.created_at || payload.created_at,
    updated_at: row.updated_at || payload.updated_at,
  });
};

const readBookingsFromTable = async (adminClient) => {
  const { data, error } = await adminClient
    .from(TOUR_BOOKINGS_TABLE)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    if (isTourBookingsSchemaUnavailable(error)) {
      return [];
    }
    throw error;
  }
  return Array.isArray(data) ? data.map(fromTableRow) : [];
};

const insertBookings = async (adminClient, rows = []) => {
  const now = new Date().toISOString();
  const normalizedRows = rows.map((row) => normalizeBookingRow({
    ...row,
    id: row.id || createBookingId(),
    created_at: row.created_at || now,
    updated_at: row.updated_at || now,
  }));

  const tableRows = normalizedRows.map(toTableRow);
  const { data, error } = await adminClient
    .from(TOUR_BOOKINGS_TABLE)
    .insert(tableRows)
    .select('*');

  if (error) throw error;
  return Array.isArray(data) ? data.map(fromTableRow) : [];
};

const getPublicTourPrice = async (adminClient, { packageId, vehicleModelId, durationHours }) => {
  const normalizedDuration = normalizeDuration(durationHours);

  const { data: exactRows, error: exactError } = await adminClient
    .from(TOUR_PACKAGE_MODEL_PRICES_TABLE)
    .select('price_mad')
    .eq('package_id', packageId)
    .eq('vehicle_model_id', vehicleModelId)
    .eq('duration_hours', normalizedDuration)
    .eq('is_active', true)
    .limit(1);

  if (exactError) throw exactError;
  const exactPrice = Number(exactRows?.[0]?.price_mad || 0);
  if (exactPrice > 0) return exactPrice;

  const { data: globalRows, error: globalError } = await adminClient
    .from(TOUR_PACKAGE_MODEL_PRICES_TABLE)
    .select('price_mad')
    .eq('package_id', GLOBAL_TOUR_PRICING_KEY)
    .eq('vehicle_model_id', vehicleModelId)
    .eq('duration_hours', normalizedDuration)
    .eq('is_active', true)
    .limit(1);

  if (globalError) throw globalError;
  return Number(globalRows?.[0]?.price_mad || 0);
};

const createPublicTourBooking = async (req, body = {}) => {
  const packageId = String(body.packageId || body.package_id || '').trim();
  const vehicleModelId = String(body.vehicleModelId || body.vehicle_model_id || '').trim();
  const requestedMix = normalizeSelectedModelMix(body.selectedModelMix || body.selected_model_mix);
  const date = String(body.date || '').trim();
  const time = String(body.time || '').trim();
  const customerName = String(body.customerName || body.customer_name || '').trim();
  const customerPhone = String(body.customerPhone || body.customer_phone || body.phone || '').trim();
  const customerEmail = String(body.customerEmail || body.customer_email || '').trim();
  const fallbackQuadCount = Math.max(1, Math.min(12, Number(body.quadCount || body.quad_count || 1) || 1));
  const selectedModelMix = requestedMix.length > 0
    ? requestedMix
    : vehicleModelId
      ? [{
          modelId: vehicleModelId,
          label: String(body.vehicleModelLabel || body.vehicle_model_label || 'Selected model'),
          count: fallbackQuadCount,
        }]
      : [];
  const quadCount = Math.max(1, Math.min(12, selectedModelMix.reduce((sum, item) => sum + Number(item.count || 0), 0) || fallbackQuadCount));
  const ridersCount = Math.max(quadCount, Number(body.ridersCount || body.riders_count || quadCount) || quadCount);

  if (!packageId || selectedModelMix.length === 0 || !date || !time || !customerName || !customerPhone) {
    return { status: 400, body: { error: 'Package, model mix, date, time, name, and phone are required' } };
  }

  const scheduledStart = new Date(`${date}T${time}:00`);
  if (Number.isNaN(scheduledStart.getTime())) {
    return { status: 400, body: { error: 'Invalid tour date or time' } };
  }

  const { adminClient } = createSupabaseClients();
  const { data: packageRow, error: packageError } = await adminClient
    .from(TOUR_PACKAGES_TABLE)
    .select('*')
    .eq('id', packageId)
    .eq('is_active', true)
    .maybeSingle();

  if (packageError) throw packageError;
  if (!packageRow) {
    return { status: 404, body: { error: 'Tour package is not available' } };
  }

  const durationHours = normalizeDuration(packageRow.duration || body.durationHours || body.duration_hours || 1);
  const pricedModelMix = [];
  for (const item of selectedModelMix) {
    const unitPrice = await getPublicTourPrice(adminClient, {
      packageId,
      vehicleModelId: item.modelId,
      durationHours,
    });

    if (!(unitPrice > 0)) {
      return { status: 409, body: { error: `Tour pricing is not configured for ${item.label || 'this model'} and package` } };
    }

    pricedModelMix.push({
      modelId: item.modelId,
      label: item.label || 'Selected model',
      count: item.count,
      unitPrice,
      lineTotal: unitPrice * item.count,
    });
  }

  const scheduledEnd = new Date(scheduledStart.getTime() + durationHours * 60 * 60 * 1000);
  const bufferBeforeMinutes = Number(packageRow.buffer_before_minutes || 15);
  const bufferAfterMinutes = Number(packageRow.buffer_after_minutes || 30);
  const blockingStart = new Date(scheduledStart.getTime() - bufferBeforeMinutes * 60 * 1000);
  const blockingEnd = new Date(scheduledEnd.getTime() + bufferAfterMinutes * 60 * 1000);
  const groupId = `WEB-TOUR-${Date.now().toString(36).toUpperCase()}`;
  const totalAmount = pricedModelMix.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
  const now = new Date().toISOString();

  const metadata = {
    kind: 'tour_booking',
    source: 'public_website',
    groupId,
    packageId,
    packageName: packageRow.name,
    durationHours,
    routeType: packageRow.route_type || '',
    requiresLicense: Boolean(packageRow.requires_license),
    scheduledStartAt: scheduledStart.toISOString(),
    scheduledEndAt: scheduledEnd.toISOString(),
    blockingStartAt: blockingStart.toISOString(),
    blockingEndAt: blockingEnd.toISOString(),
    quadCount,
    ridersCount,
    customerName,
    customerPhone,
    customerEmail,
    packageLocation: packageRow.location || '',
    assignmentMode: 'assign_on_arrival',
    selectedModelMix: pricedModelMix,
    publicNotes: String(body.notes || '').trim(),
    createdAt: now,
  };

  const notes = `${String(body.notes || '').trim()}\n\n${TOUR_BOOKING_MARKER}${JSON.stringify(metadata)}`.trim();
  const rows = pricedModelMix.flatMap((item) =>
    Array.from({ length: item.count }, () => ({
      customer_name: customerName,
      customer_email: customerEmail,
      phone: customerPhone,
      vehicle_id: null,
      vehicle_model_id: item.modelId,
      vehicle_model_label: item.label,
      rental_start_date: blockingStart.toISOString(),
      rental_end_date: blockingEnd.toISOString(),
      rental_status: 'scheduled',
      payment_status: 'unpaid',
      total_amount: item.unitPrice,
      remaining_amount: item.unitPrice,
      package_id: packageId,
      package_name: packageRow.name,
      scheduled_for: scheduledStart.toISOString(),
      scheduled_end_at: scheduledEnd.toISOString(),
      scheduled_date: date,
      scheduled_time: time,
      notes,
      created_at: now,
      updated_at: now,
    }))
  );

  const createdRows = await insertBookings(adminClient, rows);
  void sendTourBookingConfirmationEmail({
    adminClient,
    requestOrigin: getRequestOrigin(req),
    groupId,
    packageName: packageRow.name,
    totalAmount,
    scheduledStart: scheduledStart.toISOString(),
    customerName,
    customerEmail,
    quadCount,
    ridersCount,
  }).catch((emailError) => {
    console.warn('tour booking confirmation email failed:', emailError?.message || emailError);
  });

  return {
    status: 200,
    body: {
      success: true,
      groupId,
      totalAmount,
      rows: createdRows,
    },
  };
};

const updateBookingRows = async (adminClient, updates = []) => {
  const changedRows = [];

  for (const item of updates) {
    const bookingId = String(item.id || '');
    if (!bookingId) continue;

    const { data: current, error: loadError } = await adminClient
      .from(TOUR_BOOKINGS_TABLE)
      .select('*')
      .eq('id', bookingId)
      .single();

    if (loadError) throw loadError;

    const currentRow = fromTableRow(current);
    const nextRow = normalizeBookingRow({
      ...currentRow,
      ...item,
      updated_at: item.updated_at || new Date().toISOString(),
    });

    const { data: updated, error: updateError } = await adminClient
      .from(TOUR_BOOKINGS_TABLE)
      .update(toTableRow(nextRow))
      .eq('id', bookingId)
      .select('*')
      .single();

    if (updateError) throw updateError;
    changedRows.push(fromTableRow(updated));
  }

  return changedRows;
};

const deleteBookingRows = async (adminClient, rowIds = []) => {
  const normalizedRowIds = rowIds.filter(Boolean).map(String);
  if (normalizedRowIds.length === 0) return [];

  const { data: existingRows, error: loadError } = await adminClient
    .from(TOUR_BOOKINGS_TABLE)
    .select('*')
    .in('id', normalizedRowIds);

  if (loadError) throw loadError;

  const { error: deleteError } = await adminClient
    .from(TOUR_BOOKINGS_TABLE)
    .delete()
    .in('id', normalizedRowIds);

  if (deleteError) throw deleteError;

  return Array.isArray(existingRows) ? existingRows.map(fromTableRow) : [];
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const resource = String(req.query?.resource || '').trim().toLowerCase();
  if (resource === 'packages') {
    return handleTourPackages(req, res, json);
  }

  if (resource === 'tracking') {
    return handleTourTracking(req, res, json);
  }

  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const body = parseBody(req.body);

  if (req.method === 'POST' && body?.publicBooking === true) {
    try {
      const result = await createPublicTourBooking(req, body);
      return json(res, result.status, result.body);
    } catch (error) {
      return json(res, 500, { error: error.message || 'Unknown error' });
    }
  }

  const auth = await authenticateRequest(req);
  if (auth.error) {
    return json(res, auth.error.status, auth.error.body);
  }

  const { adminClient } = auth;

  try {
    if (req.method === 'GET') {
      const rows = await readBookingsFromTable(adminClient);
      return json(res, 200, { success: true, rows, setup_required: false });
    }

    if (req.method === 'POST') {
      const rows = Array.isArray(body?.rows) ? body.rows : [];
      const createdRows = await insertBookings(adminClient, rows);
      return json(res, 200, { success: true, rows: createdRows });
    }

    if (req.method === 'DELETE') {
      const rowIds = Array.isArray(body?.rowIds) ? body.rowIds : [];
      if (rowIds.length === 0) {
        return json(res, 400, { error: 'rowIds array is required' });
      }

      const rows = await deleteBookingRows(adminClient, rowIds);
      return json(res, 200, { success: true, rows });
    }

    const updates = Array.isArray(body?.updates) ? body.updates : [];
    if (updates.length === 0) {
      return json(res, 400, { error: 'Updates array is required' });
    }

    const rows = await updateBookingRows(adminClient, updates);
    return json(res, 200, { success: true, rows });
  } catch (error) {
    if (req.method === 'GET' && isTourBookingsSchemaUnavailable(error)) {
      return json(res, 200, { success: true, rows: [], setup_required: true });
    }
    return json(res, 500, { error: error.message || 'Unknown error' });
  }
}
