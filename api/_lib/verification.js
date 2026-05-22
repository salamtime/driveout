import {
  APP_USERS_TABLE,
  VEHICLES_TABLE,
  VERIFICATION_EVENTS_TABLE,
  VERIFICATION_REQUESTS_TABLE,
} from './supabase.js';

export const VERIFICATION_STATUSES = new Set(['pending', 'approved', 'rejected', 'suspended', 'expired']);
export const VERIFICATION_ENTITY_TYPES = new Set(['user', 'vehicle']);

const VEHICLE_REQUIRED_TYPES = ['vehicle_registration', 'vehicle_insurance'];
const USER_REQUIRED_TYPES = ['profile_id', 'driver_license'];
const VEHICLE_PROFILES_TABLE = 'app_vehicle_public_profiles';

const getRequiredTypes = (entityType) => (
  entityType === 'vehicle' ? VEHICLE_REQUIRED_TYPES : USER_REQUIRED_TYPES
);

const getVehicleProfileVerificationStatus = (status) => {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'approved') return 'verified';
  if (normalized === 'pending') return 'pending_verification';
  return normalized || 'pending_verification';
};

const isVerificationPersistenceUnavailable = (error) => {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || error?.details || '').toLowerCase();
  return (
    code === '42P01' ||
    code === '42703' ||
    code === '22P02' ||
    code === '42501' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    message.includes('verification_status') ||
    message.includes('verification_summary') ||
    message.includes('profile_verification_status') ||
    message.includes('insurance_expires_at') ||
    message.includes('is_listable') ||
    message.includes('permission denied') ||
    message.includes('schema cache')
  );
};

const parseVerificationNotes = (notes) => {
  const raw = String(notes || '').trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const isRemovedVerificationRow = (row) => Boolean(parseVerificationNotes(row?.notes)?.removedAt);
const isArchivedVerificationRow = (row) => {
  const metadata = parseVerificationNotes(row?.notes);
  return String(row?.status || '').trim().toLowerCase() === 'archived' || Boolean(metadata?.archivedAt);
};
const getActiveVerificationRows = (rows = []) => rows.filter((row) => !isArchivedVerificationRow(row));

export const expireInsuranceVerifications = async (adminClient) => {
  const { data, error } = await adminClient
    .from(VERIFICATION_REQUESTS_TABLE)
    .update({ status: 'expired' })
    .eq('verification_type', 'vehicle_insurance')
    .eq('status', 'approved')
    .lt('expires_at', new Date().toISOString())
    .select('id, entity_type, entity_id');

  if (error) {
    throw error;
  }

  return data || [];
};

export const addVerificationEvent = async (
  adminClient,
  { verificationRequestId, action, fromStatus, toStatus, actorUserId, note }
) => {
  const { error } = await adminClient
    .from(VERIFICATION_EVENTS_TABLE)
    .insert({
      verification_request_id: verificationRequestId,
      action,
      from_status: fromStatus || null,
      to_status: toStatus || null,
      actor_user_id: actorUserId || null,
      note: note || null,
    });

  if (error) {
    console.warn('Unable to write verification event:', error.message);
  }
};

export const getEntityVerificationRows = async (adminClient, entityType, entityId) => {
  const { data, error } = await adminClient
    .from(VERIFICATION_REQUESTS_TABLE)
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', String(entityId))
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).filter((row) => !isRemovedVerificationRow(row));
};

export const buildVerificationSummary = (rows, entityType) => {
  const activeRows = getActiveVerificationRows(rows);
  const latestByType = {};
  activeRows.forEach((row) => {
    if (!latestByType[row.verification_type]) {
      latestByType[row.verification_type] = row;
    }
  });

  const requiredTypes = getRequiredTypes(entityType);
  const missing = requiredTypes.filter((type) => !latestByType[type]);
  const rejected = requiredTypes.filter((type) => latestByType[type]?.status === 'rejected');
  const suspended = requiredTypes.filter((type) => latestByType[type]?.status === 'suspended');
  const expired = requiredTypes.filter((type) => {
    const request = latestByType[type];
    if (!request) return false;
    if (request.status === 'expired') return true;
    return request.verification_type === 'vehicle_insurance' &&
      request.expires_at &&
      new Date(request.expires_at).getTime() < Date.now();
  });
  const pending = requiredTypes.filter((type) => latestByType[type]?.status === 'pending');
  const approved = requiredTypes.filter((type) => latestByType[type]?.status === 'approved' && !expired.includes(type));
  const complete = requiredTypes.length > 0 && approved.length === requiredTypes.length;

  let status = 'pending';
  if (suspended.length) status = 'suspended';
  else if (expired.length) status = 'expired';
  else if (rejected.length) status = 'rejected';
  else if (complete) status = 'approved';
  else if (pending.length || missing.length) status = 'pending';

  const insurance = latestByType.vehicle_insurance || null;

  return {
    status,
    complete,
    requiredTypes,
    missing,
    pending,
    approved,
    rejected,
    suspended,
    expired,
    latestByType,
    insuranceExpiresAt: insurance?.expires_at || null,
    updatedAt: new Date().toISOString(),
  };
};

export const refreshEntityVerificationSummary = async (adminClient, entityType, entityId) => {
  const rows = await getEntityVerificationRows(adminClient, entityType, entityId);
  const summary = buildVerificationSummary(rows, entityType);
  const normalizedEntityId = String(entityId || '').trim();
  const numericVehicleEntityId = Number(normalizedEntityId);
  const canPersistOnFleetVehicle =
    normalizedEntityId !== '' &&
    Number.isFinite(numericVehicleEntityId) &&
    String(Math.trunc(numericVehicleEntityId)) === normalizedEntityId;

  if (entityType === 'vehicle') {
    const persistFleetVehicleSummary = async (vehicleId) => {
      if (!vehicleId && vehicleId !== 0) return;
      const numericVehicleId = Number(vehicleId);
      if (!Number.isFinite(numericVehicleId)) return;

      const { error } = await adminClient
        .from(VEHICLES_TABLE)
        .update({
          verification_status: summary.status,
          verification_summary: summary,
          insurance_expires_at: summary.insuranceExpiresAt,
          is_listable: summary.complete,
        })
        .eq('id', numericVehicleId);

      if (error) {
        if (isVerificationPersistenceUnavailable(error)) {
          console.warn('Vehicle verification summary persistence unavailable:', error.message || error);
        } else {
          throw error;
        }
      }
    };

    if (canPersistOnFleetVehicle) {
      await persistFleetVehicleSummary(numericVehicleEntityId);
    } else {
      const { data: profile, error: profileError } = await adminClient
        .from(VEHICLE_PROFILES_TABLE)
        .select('*')
        .eq('id', normalizedEntityId)
        .maybeSingle();

      if (profileError) {
        if (isVerificationPersistenceUnavailable(profileError)) {
          console.warn('Vehicle profile verification summary persistence unavailable:', profileError.message || profileError);
        } else {
          throw profileError;
        }
      }

      if (profile?.id) {
        const { error: profileUpdateError } = await adminClient
          .from(VEHICLE_PROFILES_TABLE)
          .update({
            verification_status: getVehicleProfileVerificationStatus(summary.status),
          })
          .eq('id', profile.id);

        if (profileUpdateError && !isVerificationPersistenceUnavailable(profileUpdateError)) {
          throw profileUpdateError;
        }

        const directFleetId =
          profile.linked_fleet_vehicle_id ||
          profile.fleet_vehicle_id ||
          (/^\d+$/.test(String(profile.vehicle_ref_id || '').trim()) ? profile.vehicle_ref_id : null);

        if (directFleetId) {
          await persistFleetVehicleSummary(directFleetId);
        } else if (profile.owner_id && profile.plate_number) {
          const { data: fleetVehicle, error: fleetLookupError } = await adminClient
            .from(VEHICLES_TABLE)
            .select('id')
            .eq('owner_user_id', profile.owner_id)
            .eq('plate_number', profile.plate_number)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (fleetLookupError) {
            if (isVerificationPersistenceUnavailable(fleetLookupError)) {
              console.warn('Linked fleet vehicle lookup unavailable:', fleetLookupError.message || fleetLookupError);
            } else {
              throw fleetLookupError;
            }
          }

          if (fleetVehicle?.id) {
            await persistFleetVehicleSummary(fleetVehicle.id);
          }
        }
      }
    }
  }

  if (entityType === 'user') {
    const { error } = await adminClient
      .from(APP_USERS_TABLE)
      .update({
        profile_verification_status: summary.status,
        verification_summary: summary,
      })
      .eq('id', entityId);

    if (error) {
      if (isVerificationPersistenceUnavailable(error)) {
        console.warn('User verification summary persistence unavailable:', error.message || error);
      } else {
        throw error;
      }
    }
  }

  return summary;
};

export const getActorRole = async (adminClient, user) => {
  const { data } = await adminClient
    .from(APP_USERS_TABLE)
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  return String(data?.role || user.user_metadata?.role || user.app_metadata?.role || '').toLowerCase();
};
