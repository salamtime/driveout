import { authenticateRequest } from './_lib/auth.js';

const TOUR_BOOKINGS_TABLE = 'app_687f658e98_tour_bookings';
const TOUR_BOOKING_MARKER = '[tour_booking]';

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

const createBookingId = () => crypto.randomUUID();

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

  if (error) throw error;
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

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (!['GET', 'POST', 'PATCH'].includes(req.method)) {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const auth = await authenticateRequest(req);
  if (auth.error) {
    return json(res, auth.error.status, auth.error.body);
  }

  const { adminClient } = auth;

  try {
    if (req.method === 'GET') {
      const rows = await readBookingsFromTable(adminClient);
      return json(res, 200, { success: true, rows });
    }

    const body = parseBody(req.body);

    if (req.method === 'POST') {
      const rows = Array.isArray(body?.rows) ? body.rows : [];
      const createdRows = await insertBookings(adminClient, rows);
      return json(res, 200, { success: true, rows: createdRows });
    }

    const updates = Array.isArray(body?.updates) ? body.updates : [];
    if (updates.length === 0) {
      return json(res, 400, { error: 'Updates array is required' });
    }

    const rows = await updateBookingRows(adminClient, updates);
    return json(res, 200, { success: true, rows });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Unknown error' });
  }
}
