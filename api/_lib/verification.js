import {
  APP_USERS_TABLE,
  VEHICLES_TABLE,
  VERIFICATION_EVENTS_TABLE,
  VERIFICATION_REQUESTS_TABLE,
} from './supabase.js';

export const VERIFICATION_STATUSES = new Set(['pending', 'approved', 'rejected', 'suspended', 'expired']);
export const VERIFICATION_ENTITY_TYPES = new Set(['user', 'vehicle']);

const VEHICLE_REQUIRED_TYPES = ['vehicle_registration', 'vehicle_insurance'];
const USER_REQUIRED_TYPES = ['profile_id'];

const getRequiredTypes = (entityType) => (
  entityType === 'vehicle' ? VEHICLE_REQUIRED_TYPES : USER_REQUIRED_TYPES
);

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

  return data || [];
};

export const buildVerificationSummary = (rows, entityType) => {
  const latestByType = {};
  rows.forEach((row) => {
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

  if (entityType === 'vehicle') {
    const { error } = await adminClient
      .from(VEHICLES_TABLE)
      .update({
        verification_status: summary.status,
        verification_summary: summary,
        insurance_expires_at: summary.insuranceExpiresAt,
        is_listable: summary.complete,
      })
      .eq('id', entityId);

    if (error) throw error;
  }

  if (entityType === 'user') {
    const { error } = await adminClient
      .from(APP_USERS_TABLE)
      .update({
        profile_verification_status: summary.status,
        verification_summary: summary,
      })
      .eq('id', entityId);

    if (error) throw error;
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
