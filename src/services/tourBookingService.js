import { supabase } from '../lib/supabase';
import { adminApiRequest } from './adminApi';
import { scopeTenantOwnedQuery, matchTenantOwnedPayload } from './OrganizationService';
import { TABLE_NAMES } from '../config/tableNames';

const VEHICLE_TABLE = TABLE_NAMES.VEHICLES;

const isMissingTableError = (error) => {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || error?.details || '').toLowerCase();
  return (
    code === '42p01' ||
    code === '404' ||
    message.includes('does not exist') ||
    message.includes('not found')
  );
};

const isOpaqueSupabaseError = (error) =>
  Boolean(error) &&
  typeof error === 'object' &&
  !Array.isArray(error) &&
  Object.keys(error).length === 0;

const attachVehicles = async (rows = []) => {
  const vehicleIds = [...new Set(rows.map((row) => row.vehicle_id).filter(Boolean))];
  if (vehicleIds.length === 0) return rows.map((row) => ({ ...row, vehicle: null }));

  let query = supabase
    .from(VEHICLE_TABLE)
    .select('id, name, model, plate_number, vehicle_type, status, current_odometer')
    .in('id', vehicleIds);
  query = await scopeTenantOwnedQuery(query, VEHICLE_TABLE, {
    message: 'Workspace organization context is required to load tour vehicles.',
  });

  const { data: vehicles, error } = await query;

  if (error) {
    return rows.map((row) => ({ ...row, vehicle: null }));
  }

  const vehicleMap = new Map((vehicles || []).map((vehicle) => [vehicle.id, vehicle]));
  return rows.map((row) => ({ ...row, vehicle: vehicleMap.get(row.vehicle_id) || null }));
};

const updateVehicleStatuses = async (vehicleIds = [], status) => {
  const normalizedVehicleIds = [...new Set(vehicleIds.filter(Boolean).map(String))];
  if (normalizedVehicleIds.length === 0) return;

  let query = supabase
    .from(VEHICLE_TABLE)
    .update(await matchTenantOwnedPayload({
      status,
      updated_at: new Date().toISOString(),
    }, VEHICLE_TABLE, {
      message: 'Workspace organization context is required to update tour vehicles.',
    }))
    .in('id', normalizedVehicleIds);
  query = await scopeTenantOwnedQuery(query, VEHICLE_TABLE, {
    message: 'Workspace organization context is required to update tour vehicles.',
  });

  const { error } = await query;

  if (error && !isMissingTableError(error) && !isOpaqueSupabaseError(error)) {
    throw error;
  }
};

const loadRowsByIds = async (rowIds = []) => {
  const normalizedRowIds = rowIds.filter(Boolean).map(String);
  if (normalizedRowIds.length === 0) return [];

  const response = await adminApiRequest('/api/tour-bookings');
  const sharedRows = Array.isArray(response?.rows) ? response.rows : [];
  return sharedRows.filter((row) => normalizedRowIds.includes(String(row.id)));
};

export const fetchTourBookings = async () => {
  const response = await adminApiRequest('/api/tour-bookings');
  const rows = Array.isArray(response?.rows) ? response.rows : [];
  return attachVehicles(rows);
};

export const createTourBookings = async (rows) => {
  const response = await adminApiRequest('/api/tour-bookings', {
    method: 'POST',
    body: JSON.stringify({
      rows: rows.map((row) => ({
        ...row,
        created_at: row.created_at || new Date().toISOString(),
        updated_at: row.updated_at || new Date().toISOString(),
      })),
    }),
  });
  const sharedRows = Array.isArray(response?.rows) ? response.rows : [];
  await updateVehicleStatuses(sharedRows.map((row) => row.vehicle_id), 'tour');
  return sharedRows;
};

export const updateTourBookingStatus = async (rowIds = [], status) => {
  const normalizedRowIds = rowIds.filter(Boolean);
  if (normalizedRowIds.length === 0) return;

  const timestamp = new Date().toISOString();
  const affectedRows = await loadRowsByIds(normalizedRowIds);
  const affectedVehicleIds = affectedRows.map((row) => row.vehicle_id).filter(Boolean);

  await adminApiRequest('/api/tour-bookings', {
    method: 'PATCH',
    body: JSON.stringify({
      updates: normalizedRowIds.map((id) => ({
        id,
        rental_status: status,
        updated_at: timestamp,
      })),
    }),
  });

  if (['completed', 'cancelled'].includes(String(status || '').toLowerCase())) {
    await updateVehicleStatuses(affectedVehicleIds, 'available');
  }
};

export const assignTourVehicles = async (rowIds = [], vehicleIds = [], status = null) => {
  const normalizedRowIds = rowIds.filter(Boolean);
  const normalizedVehicleIds = vehicleIds.filter(Boolean);

  if (normalizedRowIds.length === 0) return;

  const timestamp = new Date().toISOString();

  await adminApiRequest('/api/tour-bookings', {
    method: 'PATCH',
    body: JSON.stringify({
      updates: normalizedRowIds.map((id, index) => ({
        id,
        vehicle_id: normalizedVehicleIds[index] || null,
        ...(status ? { rental_status: status } : {}),
        updated_at: timestamp,
      })),
    }),
  });

  await updateVehicleStatuses(normalizedVehicleIds, 'tour');
};

export const updateTourBookingRows = async (updatesById = []) => {
  const updates = updatesById.filter((item) => item?.id);
  if (updates.length === 0) return;

  const timestamp = new Date().toISOString();
  const existingRows = await loadRowsByIds(updates.map((item) => item.id));
  const existingRowMap = new Map(existingRows.map((row) => [String(row.id), row]));

  await adminApiRequest('/api/tour-bookings', {
    method: 'PATCH',
    body: JSON.stringify({
      updates: updates.map((item) => ({
        ...item,
        updated_at: item.updated_at || timestamp,
      })),
    }),
  });

  const releaseVehicleIds = new Set();
  const reserveVehicleIds = new Set();

  updates.forEach((item) => {
    const existing = existingRowMap.get(String(item.id)) || {};
    const previousVehicleId = existing.vehicle_id || null;
    const nextVehicleId = Object.prototype.hasOwnProperty.call(item, 'vehicle_id')
      ? item.vehicle_id
      : existing.vehicle_id || null;
    const nextStatus = String(item.rental_status || existing.rental_status || '').toLowerCase();

    if (previousVehicleId && String(previousVehicleId) !== String(nextVehicleId || '')) {
      releaseVehicleIds.add(String(previousVehicleId));
    }

    if (['completed', 'cancelled'].includes(nextStatus)) {
      if (previousVehicleId) releaseVehicleIds.add(String(previousVehicleId));
      if (nextVehicleId) releaseVehicleIds.add(String(nextVehicleId));
      return;
    }

    if (nextVehicleId) {
      reserveVehicleIds.add(String(nextVehicleId));
    }
  });

  const idsToRelease = [...releaseVehicleIds].filter((id) => !reserveVehicleIds.has(id));
  if (idsToRelease.length > 0) await updateVehicleStatuses(idsToRelease, 'available');
  if (reserveVehicleIds.size > 0) await updateVehicleStatuses([...reserveVehicleIds], 'tour');
};

export const deleteTourBookingRows = async (rowIds = []) => {
  const normalizedRowIds = rowIds.filter(Boolean).map(String);
  if (normalizedRowIds.length === 0) return;

  const existingRows = await loadRowsByIds(normalizedRowIds);
  const releaseVehicleIds = [
    ...new Set(existingRows.map((row) => row.vehicle_id).filter(Boolean).map(String)),
  ];

  await adminApiRequest('/api/tour-bookings', {
    method: 'DELETE',
    body: JSON.stringify({
      rowIds: normalizedRowIds,
    }),
  });

  if (releaseVehicleIds.length > 0) {
    await updateVehicleStatuses(releaseVehicleIds, 'available');
  }
};

export const reconcileTourVehicleStatuses = async (tourRows = []) => {
  const assignedVehicleIds = [...new Set(
    tourRows
      .filter((row) => !['completed', 'cancelled'].includes(String(row.rental_status || row.status || '').toLowerCase()))
      .map((row) => row.vehicle_id)
      .filter(Boolean)
      .map(String)
  )];

  let query = supabase
    .from(VEHICLE_TABLE)
    .select('id, status')
    .eq('status', 'tour');
  query = await scopeTenantOwnedQuery(query, VEHICLE_TABLE, {
    message: 'Workspace organization context is required to reconcile tour vehicle statuses.',
  });

  const { data: tourVehicles, error } = await query;

  if (error) {
    if (!isMissingTableError(error) && !isOpaqueSupabaseError(error)) {
      throw error;
    }
    return { released: 0, reserved: 0 };
  }

  const currentTourIds = new Set((tourVehicles || []).map((vehicle) => String(vehicle.id)));
  const assignedSet = new Set(assignedVehicleIds);
  const toRelease = [...currentTourIds].filter((id) => !assignedSet.has(id));
  const toReserve = assignedVehicleIds.filter((id) => !currentTourIds.has(id));

  if (toRelease.length > 0) {
    await updateVehicleStatuses(toRelease, 'available');
  }

  if (toReserve.length > 0) {
    await updateVehicleStatuses(toReserve, 'tour');
  }

  return { released: toRelease.length, reserved: toReserve.length };
};
