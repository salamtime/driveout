import { supabase as defaultSupabase } from '../lib/supabase';

export const RENTAL_COMPLETION_SNAPSHOTS_TABLE = 'app_4c3a7a6153_rental_completion_snapshots';
const RENTALS_TABLE = 'app_4c3a7a6153_rentals';
const VEHICLES_TABLE = 'saharax_0u4w4d_vehicles';
const IMMUTABLE_ROW_KEYS = new Set(['id', 'created_at']);
const VEHICLE_RESTORE_KEYS = new Set(['status', 'location_id', 'current_location', 'current_location_id']);

const sanitizeJsonObject = (value) => {
  if (!value || typeof value !== 'object') return {};
  return JSON.parse(JSON.stringify(value));
};

const resolveOrganizationId = (rental = {}) =>
  rental.organization_id ||
  rental.tenant_organization_id ||
  rental.workspace_organization_id ||
  rental.vehicle?.organization_id ||
  null;

const resolveVehicleId = (rental = {}) =>
  rental.vehicle_id ||
  rental.selected_vehicle_id_snapshot ||
  rental.vehicle?.id ||
  null;

const buildRowRestorePayload = (snapshot = {}, currentRow = {}, extra = {}) => {
  const payload = {};
  Object.keys(currentRow || {}).forEach((key) => {
    if (IMMUTABLE_ROW_KEYS.has(key)) return;
    if (!Object.prototype.hasOwnProperty.call(snapshot, key)) return;
    payload[key] = snapshot[key];
  });

  return {
    ...payload,
    ...extra,
    updated_at: new Date().toISOString(),
  };
};

const buildVehicleRestorePayload = (snapshot = {}, currentVehicle = {}) => {
  const payload = {};
  Object.keys(currentVehicle || {}).forEach((key) => {
    if (!VEHICLE_RESTORE_KEYS.has(key)) return;
    if (!Object.prototype.hasOwnProperty.call(snapshot, key)) return;
    payload[key] = snapshot[key];
  });

  if (Object.keys(payload).length === 0) {
    return null;
  }

  return {
    ...payload,
    updated_at: new Date().toISOString(),
  };
};

export const createRentalCompletionSnapshot = async ({
  supabase = defaultSupabase,
  rental,
  rentalId,
  vehicleId,
  actorUserId = null,
  actorName = null,
  reason = 'before_completion',
  completionPayload = {},
} = {}) => {
  const resolvedRentalId = rentalId || rental?.id;
  if (!resolvedRentalId) {
    throw new Error('Rental completion snapshot requires a rental id.');
  }

  const { data: latestRental, error: rentalError } = await supabase
    .from(RENTALS_TABLE)
    .select('*')
    .eq('id', resolvedRentalId)
    .maybeSingle();

  if (rentalError) {
    throw rentalError;
  }

  const rentalSnapshot = {
    ...(latestRental || {}),
    ...(rental || {}),
  };
  const resolvedVehicleId = vehicleId || resolveVehicleId(rentalSnapshot);

  let vehicleSnapshot = rentalSnapshot.vehicle && typeof rentalSnapshot.vehicle === 'object'
    ? rentalSnapshot.vehicle
    : {};

  if (resolvedVehicleId) {
    const { data: latestVehicle, error: vehicleError } = await supabase
      .from(VEHICLES_TABLE)
      .select('*')
      .eq('id', resolvedVehicleId)
      .maybeSingle();

    if (vehicleError) {
      throw vehicleError;
    }

    vehicleSnapshot = {
      ...(latestVehicle || {}),
      ...vehicleSnapshot,
    };
  }

  const payload = {
    rental_id: resolvedRentalId,
    organization_id: resolveOrganizationId(rentalSnapshot),
    vehicle_id: resolvedVehicleId,
    snapshot_reason: reason,
    rental_status_before: rentalSnapshot.rental_status || rentalSnapshot.status || null,
    vehicle_status_before: vehicleSnapshot.status || null,
    rental_snapshot: sanitizeJsonObject(rentalSnapshot),
    vehicle_snapshot: sanitizeJsonObject(vehicleSnapshot),
    completion_payload: sanitizeJsonObject(completionPayload),
    created_by_user_id: actorUserId || null,
    created_by_name: actorName || null,
  };

  const { data, error } = await supabase
    .from(RENTAL_COMPLETION_SNAPSHOTS_TABLE)
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
};

export const getLatestRentalCompletionSnapshot = async ({
  supabase = defaultSupabase,
  rentalId,
} = {}) => {
  if (!rentalId) {
    return null;
  }

  const { data, error } = await supabase
    .from(RENTAL_COMPLETION_SNAPSHOTS_TABLE)
    .select('*')
    .eq('rental_id', rentalId)
    .is('reinstated_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
};

export const reinstateRentalFromCompletionSnapshot = async ({
  supabase = defaultSupabase,
  rentalId,
  snapshotId,
  actorUserId = null,
  actorName = null,
  note = '',
} = {}) => {
  if (!rentalId || !snapshotId) {
    throw new Error('Reinstating a rental requires a rental id and snapshot id.');
  }

  const { data: snapshot, error: snapshotError } = await supabase
    .from(RENTAL_COMPLETION_SNAPSHOTS_TABLE)
    .select('*')
    .eq('id', snapshotId)
    .eq('rental_id', rentalId)
    .is('reinstated_at', null)
    .maybeSingle();

  if (snapshotError) {
    throw snapshotError;
  }

  if (!snapshot) {
    throw new Error('No unused completion snapshot was found for this rental.');
  }

  const rentalSnapshot = snapshot.rental_snapshot && typeof snapshot.rental_snapshot === 'object'
    ? snapshot.rental_snapshot
    : {};
  const beforeStatus = String(snapshot.rental_status_before || rentalSnapshot.rental_status || '').toLowerCase();
  if (!beforeStatus || beforeStatus === 'completed') {
    throw new Error('This snapshot does not contain a safe pre-completion rental state.');
  }

  const { data: currentRental, error: currentRentalError } = await supabase
    .from(RENTALS_TABLE)
    .select('*')
    .eq('id', rentalId)
    .maybeSingle();

  if (currentRentalError) {
    throw currentRentalError;
  }

  if (!currentRental) {
    throw new Error('Rental was not found.');
  }

  const currentStatus = String(currentRental.rental_status || currentRental.status || '').toLowerCase();
  if (currentStatus !== 'completed') {
    throw new Error('Only completed rentals can be reinstated from a completion snapshot.');
  }

  const rentalRestorePayload = buildRowRestorePayload(rentalSnapshot, currentRental);

  const { data: restoredRental, error: restoreRentalError } = await supabase
    .from(RENTALS_TABLE)
    .update(rentalRestorePayload)
    .eq('id', rentalId)
    .select('*')
    .single();

  if (restoreRentalError) {
    throw restoreRentalError;
  }

  const vehicleId = snapshot.vehicle_id || resolveVehicleId(rentalSnapshot);
  let restoredVehicle = null;
  if (vehicleId) {
    const { data: currentVehicle, error: currentVehicleError } = await supabase
      .from(VEHICLES_TABLE)
      .select('*')
      .eq('id', vehicleId)
      .maybeSingle();

    if (currentVehicleError) {
      throw currentVehicleError;
    }

    const vehicleSnapshot = snapshot.vehicle_snapshot && typeof snapshot.vehicle_snapshot === 'object'
      ? snapshot.vehicle_snapshot
      : {};
    const vehicleRestorePayload = buildVehicleRestorePayload(vehicleSnapshot, currentVehicle || {});

    if (vehicleRestorePayload) {
      const { data: updatedVehicle, error: restoreVehicleError } = await supabase
        .from(VEHICLES_TABLE)
        .update(vehicleRestorePayload)
        .eq('id', vehicleId)
        .select('*')
        .single();

      if (restoreVehicleError) {
        throw restoreVehicleError;
      }

      restoredVehicle = updatedVehicle;
    }
  }

  const reinstatedAt = new Date().toISOString();
  const { error: markSnapshotError } = await supabase
    .from(RENTAL_COMPLETION_SNAPSHOTS_TABLE)
    .update({
      reinstated_at: reinstatedAt,
      reinstated_by_user_id: actorUserId || null,
      reinstated_by_name: actorName || null,
      reinstatement_note: note || null,
    })
    .eq('id', snapshotId);

  if (markSnapshotError) {
    throw markSnapshotError;
  }

  return {
    rental: restoredRental,
    vehicle: restoredVehicle,
    snapshot,
    reinstatedAt,
  };
};

export default {
  createRentalCompletionSnapshot,
  getLatestRentalCompletionSnapshot,
  reinstateRentalFromCompletionSnapshot,
};
