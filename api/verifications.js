import { authenticateRequest, requireOwnerOrAdmin } from './_lib/auth.js';
import { APP_USERS_TABLE, VEHICLES_TABLE, VERIFICATION_DOCUMENTS_BUCKET, VERIFICATION_EVENTS_TABLE, VERIFICATION_REQUESTS_TABLE } from './_lib/supabase.js';
import { SHARED_MESSAGES_TABLE, SHARED_MESSAGE_THREADS_TABLE, isSharedMessageThreadsSchemaUnavailable } from './_lib/messages.js';
import {
  applyTenantQueryScope,
  assertUserInTenantScope,
  resolveRequestTenantScope,
  stampTenantPayload,
} from './_lib/sharedTenantIsolation.js';
import {
  addVerificationEvent,
  buildVerificationSummary,
  expireInsuranceVerifications,
  getActorRole,
  refreshEntityVerificationSummary,
  VERIFICATION_ENTITY_TYPES,
  VERIFICATION_STATUSES,
} from './_lib/verification.js';

const VEHICLE_PROFILES_TABLE = 'app_vehicle_public_profiles';
const VERIFICATION_CASES_TABLE = 'verification_cases';
const REPLACEABLE_VEHICLE_VERIFICATION_TYPES = new Set([
  'vehicle_registration',
  'vehicle_insurance',
  'proof_of_ownership',
]);

const sendJson = (res, status, body) => {
  res.status(status).json(body);
};

const getAction = (req) => String(req.query?.action || '').trim();

const withSignedFileUrls = async (adminClient, rows = []) => Promise.all(rows.map(async (row) => {
  if (!row.file_path) return row;

  const { data } = await adminClient.storage
    .from(VERIFICATION_DOCUMENTS_BUCKET)
    .createSignedUrl(row.file_path, 60 * 60);

  return {
    ...row,
    file_url: data?.signedUrl || row.file_url,
  };
}));

const assertString = (value, label) => {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
};

const isVerificationSchemaUnavailable = (error) => {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === '42501' ||
    code === 'PGRST205' ||
    message.includes('verification_status') ||
    message.includes('verification_requests') ||
    message.includes('verification_events') ||
    message.includes('permission denied') ||
    message.includes('schema cache')
  );
};

const emptyVerificationResponse = (res, extra = {}) => sendJson(res, 200, {
  requests: [],
  groupedRequests: [],
  setup_required: true,
  ...extra,
});

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

const buildRemovedVerificationNotes = (existingNotes, userId) => ({
  ...(parseVerificationNotes(existingNotes) || {}),
  removedAt: new Date().toISOString(),
  removedBy: String(userId || '').trim() || null,
  removalSource: 'user_delete',
});

const isArchivedVerificationRow = (row) => {
  const metadata = parseVerificationNotes(row?.notes);
  return String(row?.status || '').trim().toLowerCase() === 'archived' || Boolean(metadata?.archivedAt);
};

const buildArchivedVerificationNotes = (existingNotes, userId, previousStatus) => ({
  ...(parseVerificationNotes(existingNotes) || {}),
  archivedAt: new Date().toISOString(),
  archivedBy: String(userId || '').trim() || null,
  archiveSource: 'user_delete',
  archivedFromStatus: String(previousStatus || '').trim().toLowerCase() || null,
});

const getSubmissionSourceLabel = (source, metadata = null) => {
  const normalized = String(source || '').trim().toLowerCase();
  const ocrAttempted = Boolean(metadata?.ocrAttempted || normalized === 'ocr_scan');
  const ocrSucceeded = Boolean(metadata?.ocrSucceeded);
  const customerReviewed = Boolean(
    metadata?.customerReviewedFields &&
    typeof metadata.customerReviewedFields === 'object' &&
    Object.keys(metadata.customerReviewedFields).length > 0
  );

  if (ocrAttempted && ocrSucceeded && customerReviewed) {
    return normalized === 'ocr_scan'
      ? 'Scanned and confirmed'
      : 'Uploaded, scanned, and confirmed';
  }
  if (ocrAttempted && !ocrSucceeded) return 'Uploaded for manual review';
  if (normalized === 'ocr_scan') return 'Scanned with OCR';
  if (normalized === 'drag_drop_upload') return 'Dragged and uploaded';
  if (normalized === 'manual_upload') return 'Added manually';
  return 'Submitted document';
};

const getSubmissionSourceDetail = (source, metadata = null) => {
  const normalized = String(source || '').trim().toLowerCase();
  const ocrAttempted = Boolean(metadata?.ocrAttempted || normalized === 'ocr_scan');
  const ocrSucceeded = Boolean(metadata?.ocrSucceeded);
  const customerReviewed = Boolean(
    metadata?.customerReviewedFields &&
    typeof metadata.customerReviewedFields === 'object' &&
    Object.keys(metadata.customerReviewedFields).length > 0
  );

  if (ocrAttempted && ocrSucceeded && customerReviewed) {
    return 'OCR extracted the document and the customer reviewed the visible fields before submission.';
  }
  if (ocrAttempted && !ocrSucceeded) {
    return 'The upload was saved even though OCR could not complete, so admin can continue with manual review.';
  }
  if (normalized === 'drag_drop_upload') return 'The file was dropped into the verification card and submitted directly.';
  if (normalized === 'manual_upload') return 'The file was uploaded directly without the scan modal.';
  if (normalized === 'ocr_scan') return 'The document was submitted from the scan flow.';
  return 'The document was submitted for verification.';
};

const buildVerificationThreadKey = ({ entityType, entityId }) =>
  ['verification', 'verification', String(entityType || '').trim().toLowerCase(), String(entityId || '').trim()].join(':');

const buildVerificationCaseThreadKey = (caseId = '') =>
  ['verification', String(caseId || '').trim()].join(':');

const isVerificationCasesSchemaUnavailable = (error) => {
  const code = String(error?.code || '').trim().toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === '42501' ||
    code === 'PGRST205' ||
    message.includes('verification_cases') ||
    message.includes('permission denied') ||
    message.includes('schema cache')
  );
};

const ensureVerificationCaseThread = async (adminClient, {
  entityType,
  entityId,
  ownerUserId,
  tenantScope = null,
} = {}) => {
  const normalizedEntityType = String(entityType || '').trim().toLowerCase();
  const normalizedEntityId = String(entityId || '').trim();
  const normalizedOwnerUserId = String(ownerUserId || '').trim();
  if (!normalizedEntityType || !normalizedEntityId || !normalizedOwnerUserId) return null;

  const caseType = normalizedEntityType === 'user' ? 'profile' : 'vehicle';

  let caseRow = null;
  try {
    const { data, error } = await adminClient
      .from(VERIFICATION_CASES_TABLE)
      .upsert(stampTenantPayload({
        case_type: caseType,
        entity_type: normalizedEntityType,
        entity_id: normalizedEntityId,
        owner_user_id: normalizedOwnerUserId,
        case_status: 'pending',
        opened_at: new Date().toISOString(),
      }, tenantScope), {
        onConflict: 'case_type,entity_type,entity_id,owner_user_id',
      })
      .select('*')
      .single();

    if (error) {
      if (isVerificationCasesSchemaUnavailable(error)) return null;
      throw error;
    }

    caseRow = data || null;
  } catch (error) {
    if (isVerificationCasesSchemaUnavailable(error)) return null;
    throw error;
  }

  if (!caseRow?.id) return null;

  const threadKey = String(caseRow.thread_key || '').trim() || buildVerificationCaseThreadKey(caseRow.id);
  const workflowStatus = String(caseRow.case_status || '').trim().toLowerCase() === 'approved' ? 'resolved' : 'active';

  let threadRow = null;
  try {
    const { data, error } = await adminClient
      .from(SHARED_MESSAGE_THREADS_TABLE)
      .upsert(stampTenantPayload({
        thread_key: threadKey,
        family: 'verification',
        thread_type: 'verification',
        entity_type: 'verification',
        entity_id: String(caseRow.id),
        context_type: 'verification',
        context_id: String(caseRow.id),
        sender_user_id: normalizedOwnerUserId,
        recipient_user_id: normalizedOwnerUserId,
        priority: 'normal',
        waiting_on: workflowStatus === 'resolved' ? null : 'admin',
        workflow_status: workflowStatus,
        visibility_scope: 'mixed',
        metadata: {
          verificationCaseId: caseRow.id,
          ownerUserId: normalizedOwnerUserId,
          entityType: normalizedEntityType,
          entityId: normalizedEntityId,
        },
        updated_at: new Date().toISOString(),
      }, tenantScope), {
        onConflict: 'thread_key',
      })
      .select('*')
      .single();

    if (error) {
      if (isSharedMessageThreadsSchemaUnavailable(error)) {
        return {
          caseId: String(caseRow.id),
          threadId: null,
          threadKey,
        };
      }
      throw error;
    }

    threadRow = data || null;
  } catch (error) {
    if (isSharedMessageThreadsSchemaUnavailable(error)) {
      return {
        caseId: String(caseRow.id),
        threadId: null,
        threadKey,
      };
    }
    throw error;
  }

  if ((caseRow.thread_id !== threadRow?.id || caseRow.thread_key !== threadRow?.thread_key) && threadRow?.id) {
    await adminClient
      .from(VERIFICATION_CASES_TABLE)
      .update({
        thread_id: threadRow.id,
        thread_key: threadRow.thread_key,
        updated_at: new Date().toISOString(),
      })
      .eq('id', caseRow.id);
  }

  return {
    caseId: String(caseRow.id),
    threadId: threadRow?.id ? String(threadRow.id) : null,
    threadKey: String(threadRow?.thread_key || threadKey),
  };
};

const removeVerificationArtifacts = async (adminClient, verificationRow, tenantScope = null) => {
  if (!verificationRow?.id) return;

  if (verificationRow.file_path) {
    try {
      await adminClient.storage
        .from(VERIFICATION_DOCUMENTS_BUCKET)
        .remove([verificationRow.file_path]);
    } catch (storageError) {
      console.warn('Unable to remove verification file from storage:', storageError?.message || storageError);
    }
  }

  let relatedMessages = [];
  try {
    const { data, error } = await applyTenantQueryScope(
      adminClient
      .from(SHARED_MESSAGES_TABLE)
      .select('id, metadata')
      .eq('family', 'verification')
      .eq('entity_type', verificationRow.entity_type)
      .eq('entity_id', verificationRow.entity_id),
      tenantScope
    );

    if (error) {
      console.warn('Unable to load related verification messages:', error.message || error);
    } else {
      relatedMessages = data || [];
    }
  } catch (messageLoadError) {
    console.warn('Unable to load related verification messages:', messageLoadError?.message || messageLoadError);
  }

  const relatedMessageIds = (relatedMessages || [])
    .filter((message) => String(message?.metadata?.verificationRequestId || '') === String(verificationRow.id))
    .map((message) => message.id)
    .filter(Boolean);

  if (relatedMessageIds.length) {
    try {
      const { error } = await applyTenantQueryScope(
        adminClient
        .from(SHARED_MESSAGES_TABLE)
        .delete()
        .in('id', relatedMessageIds),
        tenantScope
      );

      if (error) {
        console.warn('Unable to remove related verification messages:', error.message || error);
      }
    } catch (messageDeleteError) {
      console.warn('Unable to remove related verification messages:', messageDeleteError?.message || messageDeleteError);
    }
  }

  try {
    const { error } = await applyTenantQueryScope(
      adminClient
      .from(VERIFICATION_EVENTS_TABLE)
      .delete()
      .eq('verification_request_id', verificationRow.id),
      tenantScope
    );

    if (error) {
      console.warn('Unable to remove verification events:', error.message || error);
    }
  } catch (eventsDeleteError) {
    console.warn('Unable to remove verification events:', eventsDeleteError?.message || eventsDeleteError);
  }
};

const buildVerificationReviewPath = ({ role = 'customer', entityType, entityId, requestId, documentType }) => {
  const params = new URLSearchParams();
  if (entityType) params.set('entityType', String(entityType));
  if (entityId) params.set('entityId', String(entityId));
  if (requestId) params.set('documentId', String(requestId));
  if (documentType) params.set('documentType', String(documentType));
  return `${role === 'admin' ? '/admin/verification' : '/account/verification'}?${params.toString()}`;
};

const getVerificationDocumentLabel = (verificationType = '') => {
  const normalized = String(verificationType || '').trim().toLowerCase();
  if (normalized === 'driver_license') return 'Driver license';
  if (normalized === 'profile_id') return 'Profile ID';
  if (normalized === 'vehicle_registration') return 'Vehicle registration';
  if (normalized === 'vehicle_insurance') return 'Vehicle insurance';
  return String(verificationType || 'Verification document').replace(/_/g, ' ');
};

const buildVerificationStatusMessage = ({ verificationType, status, reason = '' }) => {
  const label = getVerificationDocumentLabel(verificationType);
  const cleanedReason = String(reason || '').trim();
  if (status === 'approved') {
    return `Your ${label} has been approved.`;
  }
  if (status === 'rejected') {
    return cleanedReason
      ? `Your ${label} needs to be replaced. ${cleanedReason}`
      : `Your ${label} needs to be replaced.`;
  }
  if (status === 'expired') {
    return `Your ${label} has expired.`;
  }
  if (status === 'suspended') {
    return cleanedReason
      ? `Your ${label} has been suspended for review. ${cleanedReason}`
      : `Your ${label} has been suspended for review.`;
  }
  return `Your ${label} status changed to ${String(status || 'pending').replace(/_/g, ' ')}.`;
};

const buildVerificationCompletionMessage = (entityType = 'user') => (
  entityType === 'vehicle'
    ? 'Your vehicle verification is now complete.'
    : 'Your profile verification is now complete.'
);

const decorateVerificationRows = (rows = []) => rows.map((row) => {
  const metadata = parseVerificationNotes(row.notes);
  const submissionSource = String(
    metadata?.submissionSource ||
    metadata?.source ||
    ''
  ).trim().toLowerCase() || null;

  return {
    ...row,
    submission_source: submissionSource,
    submission_source_label: getSubmissionSourceLabel(submissionSource, metadata),
    submission_source_detail: getSubmissionSourceDetail(submissionSource, metadata),
    submission_metadata: metadata || null,
    is_archived: isArchivedVerificationRow(row),
  };
});

const buildVerificationQueueGroupKey = (row, vehicleAliasMap = new Map()) => {
  if (row.entity_type === 'user') {
    return `user:${row.entity_id}`;
  }

  if (row.entity_type === 'vehicle') {
    const canonicalVehicleId = vehicleAliasMap.get(String(row.entity_id || '').trim()) || String(row.entity_id || '').trim();
    return `vehicle:${canonicalVehicleId}`;
  }

  return `request:${row.id}`;
};

const rankStatus = (status) => {
  switch (status) {
    case 'pending':
      return 4;
    case 'rejected':
    case 'suspended':
      return 3;
    case 'expired':
      return 2;
    case 'approved':
      return 1;
    default:
      return 0;
  }
};

const chooseGroupStatus = (rows = []) => (
  rows.reduce((current, row) => (
    rankStatus(row.status) > rankStatus(current) ? row.status : current
  ), rows[0]?.status || 'pending')
);

const buildUserLookup = async (adminClient, rows = []) => {
  const userIds = [...new Set(
    rows
      .flatMap((row) => {
        const ids = [];
        if (row.entity_type === 'user' && row.entity_id) ids.push(String(row.entity_id));
        if (row.owner_user_id) ids.push(String(row.owner_user_id));
        return ids;
      })
  )];

  if (!userIds.length) return new Map();

  const { data, error } = await adminClient
    .from(APP_USERS_TABLE)
    .select('id, email, username, full_name, first_name, last_name, phone_number, date_of_birth')
    .in('id', userIds);

  if (error) {
    console.warn('Unable to enrich verification queue with app users:', error.message);
    return new Map();
  }

  const lookup = new Map((data || []).map((row) => [String(row.id), row]));
  const unresolvedUserIds = userIds.filter((id) => !lookup.has(id));

  await Promise.all(unresolvedUserIds.map(async (userId) => {
    try {
      const { data: authData, error: authError } = await adminClient.auth.admin.getUserById(userId);
      if (authError || !authData?.user) return;

      const authUser = authData.user;
      lookup.set(userId, {
        id: userId,
        email: authUser.email || null,
        username: authUser.user_metadata?.username || null,
        full_name: authUser.user_metadata?.full_name || authUser.user_metadata?.name || null,
        first_name: authUser.user_metadata?.first_name || null,
        last_name: authUser.user_metadata?.last_name || null,
        phone_number: authUser.user_metadata?.phone || null,
        date_of_birth: authUser.user_metadata?.date_of_birth || null,
      });
    } catch (fallbackError) {
      console.warn(`Unable to enrich verification queue user ${userId}:`, fallbackError.message);
    }
  }));

  return lookup;
};

const getUserDisplayName = (user) => {
  if (!user) return '';
  const combined = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  return String(user.full_name || combined || user.username || user.email || '').trim();
};

const normalizeIdentifier = (value) => String(value || '').trim();

const pickLatestVerificationRows = (rows = []) => (
  [...rows].sort((left, right) => {
    const leftCreatedAt = Date.parse(left?.created_at || '') || 0;
    const rightCreatedAt = Date.parse(right?.created_at || '') || 0;
    return rightCreatedAt - leftCreatedAt;
  })
);

const resolveVehicleVerificationAliases = async (adminClient, { entityId, ownerUserId } = {}) => {
  const normalizedEntityId = normalizeIdentifier(entityId);
  const normalizedOwnerUserId = normalizeIdentifier(ownerUserId);
  const aliasSet = new Set([normalizedEntityId].filter(Boolean));
  if (!normalizedEntityId && !normalizedOwnerUserId) return aliasSet;

  try {
    let profileQuery = adminClient.from(VEHICLE_PROFILES_TABLE).select('*');
    if (normalizedOwnerUserId) {
      profileQuery = profileQuery.eq('owner_id', normalizedOwnerUserId);
    } else if (normalizedEntityId) {
      profileQuery = profileQuery.eq('id', normalizedEntityId);
    }

    const { data: profileRows, error: profileError } = await profileQuery.limit(200);
    if (profileError) {
      console.warn('Unable to resolve vehicle verification profile aliases:', profileError.message || profileError);
      return aliasSet;
    }

    const profiles = Array.isArray(profileRows) ? profileRows : [];
    let matchingProfiles = profiles.filter((profile) => {
      const profileId = normalizeIdentifier(profile?.id);
      const vehicleRefId = normalizeIdentifier(profile?.vehicle_ref_id);
      const linkedFleetVehicleId = normalizeIdentifier(profile?.linked_fleet_vehicle_id);
      const fleetVehicleId = normalizeIdentifier(profile?.fleet_vehicle_id);
      return [
        profileId,
        vehicleRefId,
        linkedFleetVehicleId,
        fleetVehicleId,
      ].some((value) => value && value === normalizedEntityId);
    });

    if (!matchingProfiles.length && profiles.length === 1) {
      matchingProfiles = profiles;
    }

    const plateNumbers = new Set();
    matchingProfiles.forEach((profile) => {
      const profileId = normalizeIdentifier(profile?.id);
      const vehicleRefId = normalizeIdentifier(profile?.vehicle_ref_id);
      const linkedFleetVehicleId = normalizeIdentifier(profile?.linked_fleet_vehicle_id);
      const fleetVehicleId = normalizeIdentifier(profile?.fleet_vehicle_id);
      const plateNumber = normalizeIdentifier(profile?.plate_number);

      [profileId, vehicleRefId, linkedFleetVehicleId, fleetVehicleId].filter(Boolean).forEach((value) => aliasSet.add(value));
      if (plateNumber) plateNumbers.add(plateNumber);
    });

    if (normalizedOwnerUserId && plateNumbers.size) {
      const { data: fleetRows, error: fleetError } = await adminClient
        .from(VEHICLES_TABLE)
        .select('id, owner_user_id, plate_number')
        .eq('owner_user_id', normalizedOwnerUserId)
        .in('plate_number', [...plateNumbers]);

      if (!fleetError) {
        (fleetRows || []).forEach((row) => {
          const fleetId = normalizeIdentifier(row?.id);
          if (fleetId) aliasSet.add(fleetId);
        });
      }
    }
  } catch (error) {
    console.warn('Unable to resolve vehicle verification aliases:', error?.message || error);
  }

  return aliasSet;
};

const buildVehicleEntityAliasMap = async (adminClient, rows = []) => {
  const vehicleRows = (Array.isArray(rows) ? rows : []).filter((row) => String(row?.entity_type || '').trim().toLowerCase() === 'vehicle');
  if (!vehicleRows.length) return new Map();

  const ownerIds = [...new Set(vehicleRows.map((row) => String(row?.owner_user_id || '').trim()).filter(Boolean))];
  const entityIds = [...new Set(vehicleRows.map((row) => String(row?.entity_id || '').trim()).filter(Boolean))];
  if (!ownerIds.length && !entityIds.length) return new Map();

  try {
    const { data, error } = await adminClient
      .from(VEHICLE_PROFILES_TABLE)
      .select('*')
      .in('owner_id', ownerIds);

    if (error) {
      console.warn('Unable to load vehicle profile aliases for verification queue:', error.message || error);
      return new Map();
    }

    const { data: fleetRows, error: fleetError } = await adminClient
      .from(VEHICLES_TABLE)
      .select('id, owner_user_id, plate_number')
      .in('owner_user_id', ownerIds);

    if (fleetError) {
      console.warn('Unable to load fleet vehicle aliases for verification queue:', fleetError.message || fleetError);
    }

    const fleetByOwnerAndPlate = new Map();
    (fleetRows || []).forEach((row) => {
      const ownerUserId = normalizeIdentifier(row?.owner_user_id);
      const plateNumber = normalizeIdentifier(row?.plate_number);
      const fleetId = normalizeIdentifier(row?.id);
      if (!ownerUserId || !plateNumber || !fleetId) return;
      fleetByOwnerAndPlate.set(`${ownerUserId}:${plateNumber}`, fleetId);
    });

    const aliasMap = new Map();
    const relevantOwnerIds = new Set(ownerIds);
    const relevantEntityIds = new Set(entityIds);

    (data || []).forEach((profile) => {
      const canonicalId = String(profile?.id || '').trim();
      if (!canonicalId) return;

      const profileOwnerId = String(profile?.owner_id || '').trim();
      const linkedFleetVehicleId = String(profile?.linked_fleet_vehicle_id || '').trim();
      const fleetVehicleId = String(profile?.fleet_vehicle_id || '').trim();
      const legacyVehicleRefId = String(profile?.vehicle_ref_id || '').trim();
      const plateNumber = String(profile?.plate_number || '').trim();

      const isRelevant =
        relevantOwnerIds.has(profileOwnerId) ||
        relevantEntityIds.has(canonicalId) ||
        (linkedFleetVehicleId && relevantEntityIds.has(linkedFleetVehicleId)) ||
        (fleetVehicleId && relevantEntityIds.has(fleetVehicleId)) ||
        (legacyVehicleRefId && relevantEntityIds.has(legacyVehicleRefId)) ||
        (plateNumber && fleetByOwnerAndPlate.has(`${profileOwnerId}:${plateNumber}`));

      if (!isRelevant) return;

      aliasMap.set(canonicalId, canonicalId);

      if (linkedFleetVehicleId) {
        aliasMap.set(linkedFleetVehicleId, canonicalId);
      }

      if (fleetVehicleId) {
        aliasMap.set(fleetVehicleId, canonicalId);
      }

      if (legacyVehicleRefId) {
        aliasMap.set(legacyVehicleRefId, canonicalId);
      }

      const matchedFleetId = fleetByOwnerAndPlate.get(`${profileOwnerId}:${plateNumber}`);
      if (matchedFleetId) {
        aliasMap.set(matchedFleetId, canonicalId);
      }
    });

    return aliasMap;
  } catch (error) {
    console.warn('Unable to build vehicle profile alias map:', error?.message || error);
    return new Map();
  }
};

const buildGroupedRequests = (rows = [], userLookup = new Map(), vehicleAliasMap = new Map()) => {
  const groups = new Map();

  rows.forEach((row) => {
    const key = buildVerificationQueueGroupKey(row, vehicleAliasMap);
    const linkedUser = row.entity_type === 'user' ? userLookup.get(String(row.entity_id)) : null;
    const linkedOwner = userLookup.get(String(row.owner_user_id));
    const existing = groups.get(key);
    const resolvedProfileUser = linkedUser || linkedOwner || null;
    const canonicalVehicleId = row.entity_type === 'vehicle'
      ? (vehicleAliasMap.get(String(row.entity_id || '').trim()) || String(row.entity_id || '').trim())
      : String(row.entity_id || '').trim();
    const profileParams = new URLSearchParams();
    if (row.entity_type === 'user' && row.entity_id) {
      profileParams.set('authUserId', String(row.entity_id));
    }
    if (linkedUser?.email || linkedOwner?.email) {
      profileParams.set('email', linkedUser?.email || linkedOwner?.email);
    }
    const customerProfilePath = resolvedProfileUser
      ? `/admin/customers/profile?${profileParams.toString()}`
      : null;

    if (!existing) {
      const ownerDisplayName = getUserDisplayName(linkedOwner);
      const ownerEmail = linkedOwner?.email || null;
      const vehicleDisplayLabel = canonicalVehicleId
        ? `Vehicle ${canonicalVehicleId}`
        : (row.entity_id ? `Vehicle ${row.entity_id}` : 'Vehicle');

      groups.set(key, {
        id: key,
        group_key: key,
        entity_type: row.entity_type,
        entity_id: canonicalVehicleId || row.entity_id,
        owner_user_id: row.owner_user_id,
        status: row.status,
        created_at: row.created_at,
        expires_at: row.expires_at,
        documents: [row],
        document_count: 1,
        verification_types: [row.verification_type],
        display_name:
          row.entity_type === 'user'
            ? (linkedUser?.email || linkedOwner?.email || getUserDisplayName(linkedUser) || getUserDisplayName(linkedOwner) || row.entity_id)
            : (ownerEmail || ownerDisplayName || vehicleDisplayLabel),
        display_subtitle:
          row.entity_type === 'user'
            ? (getUserDisplayName(linkedUser) || getUserDisplayName(linkedOwner) || row.entity_type)
            : [vehicleDisplayLabel, ownerDisplayName].filter(Boolean).join(' • ') || row.entity_type,
        entity_email: linkedUser?.email || linkedOwner?.email || null,
        entity_username: linkedUser?.username || linkedOwner?.username || null,
        owner_email: linkedOwner?.email || null,
        profile_path: customerProfilePath,
        profile_snapshot: resolvedProfileUser
          ? {
              full_name: getUserDisplayName(resolvedProfileUser) || null,
              email: resolvedProfileUser.email || null,
              username: resolvedProfileUser.username || null,
              phone_number: resolvedProfileUser.phone_number || null,
              date_of_birth: resolvedProfileUser.date_of_birth || null,
            }
          : null,
      });
      return;
    }

    existing.documents.push(row);
    existing.document_count = existing.documents.length;
    existing.created_at = new Date(row.created_at).getTime() > new Date(existing.created_at).getTime()
      ? row.created_at
      : existing.created_at;
    existing.expires_at = existing.expires_at || row.expires_at || null;
    existing.verification_types = [...new Set([...existing.verification_types, row.verification_type])];
    existing.status = chooseGroupStatus(existing.documents);
  });

  return Array.from(groups.values()).map((group) => {
    let documents = [...group.documents].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    if (String(group.entity_type || '').trim().toLowerCase() === 'vehicle') {
      const latestVehicleDocumentByType = new Map();
      documents.forEach((document) => {
        const verificationType = normalizeIdentifier(document?.verification_type).toLowerCase();
        if (!verificationType) return;
        if (!REPLACEABLE_VEHICLE_VERIFICATION_TYPES.has(verificationType)) {
          latestVehicleDocumentByType.set(`${verificationType}:${document.id}`, document);
          return;
        }
        if (!latestVehicleDocumentByType.has(verificationType)) {
          latestVehicleDocumentByType.set(verificationType, document);
        }
      });
      documents = [...latestVehicleDocumentByType.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    return {
      ...group,
      documents,
      document_count: documents.length,
      verification_types: [...new Set(documents.map((document) => String(document?.verification_type || '').trim()).filter(Boolean))],
      status: chooseGroupStatus(documents),
    };
  }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
};

const handleGet = async (req, res) => {
  const action = getAction(req);

  if (action === 'list') {
    const auth = await requireOwnerOrAdmin(req);
    if (auth.error) return sendJson(res, auth.error.status, auth.error.body);

    const { adminClient, user, tenantRuntime } = auth;
    const tenantScope = await resolveRequestTenantScope({ req, adminClient, tenantRuntime });
    const userInScope = await assertUserInTenantScope({ adminClient, userId: user.id, tenantScope });
    if (!userInScope) {
      return sendJson(res, 403, { error: 'You do not have access to this workspace' });
    }
    try {
      await expireInsuranceVerifications(adminClient);
    } catch (error) {
      if (isVerificationSchemaUnavailable(error)) {
        return emptyVerificationResponse(res, {
          warning: 'Verification schema is not available yet. Run create_verification_system.sql.',
        });
      }

      throw error;
    }

    let query = applyTenantQueryScope(
      adminClient
      .from(VERIFICATION_REQUESTS_TABLE)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Number(req.query.limit || 120)),
      tenantScope
    );

    if (req.query.status && req.query.status !== 'all') {
      query = query.eq('status', req.query.status);
    }
    if (req.query.entityType && req.query.entityType !== 'all') query = query.eq('entity_type', req.query.entityType);
    if (req.query.entityId) query = query.eq('entity_id', String(req.query.entityId));
    if (req.query.ownerUserId) query = query.eq('owner_user_id', String(req.query.ownerUserId));
    if (req.query.verificationType && req.query.verificationType !== 'all') query = query.eq('verification_type', req.query.verificationType);

    const { data, error } = await query;
    if (error) {
      if (isVerificationSchemaUnavailable(error)) {
        return emptyVerificationResponse(res, {
          warning: 'Verification schema is not available yet. Run create_verification_system.sql.',
        });
      }

      return sendJson(res, 500, { error: error.message });
    }
    const signedRequests = decorateVerificationRows(await withSignedFileUrls(adminClient, data || []))
      .filter((row) => !row.is_archived);
    const userLookup = await buildUserLookup(adminClient, signedRequests);
    const vehicleAliasMap = await buildVehicleEntityAliasMap(adminClient, signedRequests);
    const groupedRequests = buildGroupedRequests(signedRequests, userLookup, vehicleAliasMap);

    return sendJson(res, 200, {
      requests: signedRequests,
      groupedRequests,
    });
  }

  if (action === 'entity-summary') {
    const auth = await authenticateRequest(req);
    if (auth.error) return sendJson(res, auth.error.status, auth.error.body);

    const { adminClient, user, tenantRuntime } = auth;
    const tenantScope = await resolveRequestTenantScope({ req, adminClient, tenantRuntime });
    const userInScope = await assertUserInTenantScope({ adminClient, userId: user.id, tenantScope });
    if (!userInScope) {
      return sendJson(res, 403, { error: 'You do not have access to this workspace' });
    }
    const entityType = assertString(req.query.entityType, 'entityType');
    const entityId = assertString(req.query.entityId, 'entityId');

    if (!VERIFICATION_ENTITY_TYPES.has(entityType)) {
      return sendJson(res, 400, { error: 'Invalid entityType' });
    }

    const rowsQuery = applyTenantQueryScope(
      adminClient
      .from(VERIFICATION_REQUESTS_TABLE)
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false }),
      tenantScope
    );

    const { data, error } = await rowsQuery;
    if (error) {
      if (isVerificationSchemaUnavailable(error)) {
        return emptyVerificationResponse(res, {
          summary: null,
          warning: 'Verification schema is not available yet. Run create_verification_system.sql.',
        });
      }

      return sendJson(res, 500, { error: error.message });
    }

    const actorRole = await getActorRole(adminClient, user);
    const isAdminActor = actorRole === 'admin';
    const isOwnUserEntity = entityType === 'user' && entityId === user.id;
    const ownRows = (data || []).filter((row) => row.owner_user_id === user.id);
    const rows = isAdminActor || isOwnUserEntity ? data || [] : ownRows;
    const activeRows = rows.filter((row) => !isArchivedVerificationRow(row));
    const historyRows = rows.filter((row) => isArchivedVerificationRow(row));
    let summary = null;
    try {
      summary = await refreshEntityVerificationSummary(adminClient, entityType, entityId);
    } catch (refreshError) {
      if (isVerificationSchemaUnavailable(refreshError)) {
        summary = buildVerificationSummary(data || [], entityType);
      } else {
        return sendJson(res, 500, { error: refreshError.message || 'Unable to refresh verification summary' });
      }
    }

    return sendJson(res, 200, {
      requests: decorateVerificationRows(await withSignedFileUrls(adminClient, activeRows)),
      historyRequests: decorateVerificationRows(await withSignedFileUrls(adminClient, historyRows)),
      summary,
    });
  }

  return sendJson(res, 400, { error: 'Unsupported verification action' });
};

const handlePost = async (req, res) => {
  const action = getAction(req);

  if (action !== 'create') {
    return sendJson(res, 400, { error: 'Unsupported verification action' });
  }

  const auth = await authenticateRequest(req);
  if (auth.error) return sendJson(res, auth.error.status, auth.error.body);

  const { adminClient, user, tenantRuntime } = auth;
  const body = req.body || {};
  const tenantScope = await resolveRequestTenantScope({ req, adminClient, tenantRuntime, payload: body });
  const userInScope = await assertUserInTenantScope({ adminClient, userId: user.id, tenantScope });
  if (!userInScope) {
    return sendJson(res, 403, { error: 'You do not have access to this workspace' });
  }
  const entityType = assertString(body.entityType, 'entityType');
  const entityId = assertString(body.entityId, 'entityId');
  const verificationType = assertString(body.verificationType, 'verificationType');
  const fileUrl = assertString(body.fileUrl, 'fileUrl');

  if (!VERIFICATION_ENTITY_TYPES.has(entityType)) {
    return sendJson(res, 400, { error: 'Invalid entityType' });
  }

  const ownerUserId = body.ownerUserId || user.id;
  if (ownerUserId !== user.id && entityType === 'user') {
    return sendJson(res, 403, { error: 'Users can only submit their own profile verification' });
  }

  if (entityType === 'vehicle' && REPLACEABLE_VEHICLE_VERIFICATION_TYPES.has(verificationType)) {
    const vehicleAliasSet = await resolveVehicleVerificationAliases(adminClient, {
      entityId,
      ownerUserId,
    });
    const { data: existingRows, error: existingRowsError } = await applyTenantQueryScope(
      adminClient
      .from(VERIFICATION_REQUESTS_TABLE)
      .select('*')
      .eq('entity_type', entityType)
      .eq('owner_user_id', ownerUserId)
      .eq('verification_type', verificationType),
      tenantScope
    );

    if (existingRowsError) {
      return sendJson(res, 500, { error: existingRowsError.message || 'Unable to prepare verification replacement' });
    }

    const replaceableRows = (existingRows || []).filter((row) => {
      if (isArchivedVerificationRow(row)) return false;
      const rowEntityId = normalizeIdentifier(row?.entity_id);
      return vehicleAliasSet.size ? vehicleAliasSet.has(rowEntityId) : rowEntityId === entityId;
    });

    for (const existingRow of replaceableRows) {
      await removeVerificationArtifacts(adminClient, existingRow, tenantScope);

      const { error: deleteExistingError } = await applyTenantQueryScope(
        adminClient
        .from(VERIFICATION_REQUESTS_TABLE)
        .delete()
        .eq('id', existingRow.id),
        tenantScope
      );

      if (deleteExistingError) {
        return sendJson(res, 500, {
          error: deleteExistingError.message || 'Unable to replace previous verification document',
        });
      }
    }
  }

  const insertPayload = {
    entity_type: entityType,
    entity_id: entityId,
    owner_user_id: ownerUserId,
    verification_type: verificationType,
    file_url: fileUrl,
    file_path: body.filePath || null,
    file_name: body.fileName || null,
    file_mime_type: body.fileMimeType || null,
    file_size: body.fileSize || null,
    status: 'pending',
    expires_at: body.expiresAt || null,
    notes: body.notes || null,
  };

  const { data, error } = await adminClient
    .from(VERIFICATION_REQUESTS_TABLE)
    .insert(stampTenantPayload(insertPayload, tenantScope))
    .select('*')
    .single();

  if (error) return sendJson(res, 500, { error: error.message });

  const canonicalThread = await ensureVerificationCaseThread(adminClient, {
    entityType,
    entityId,
    ownerUserId,
    tenantScope,
  });

  if (canonicalThread?.threadKey || canonicalThread?.threadId || canonicalThread?.caseId) {
    const workflowMetadata = {
      canonicalThreadId: canonicalThread?.threadId || null,
      canonicalThreadKey: canonicalThread?.threadKey || null,
      verificationCaseId: canonicalThread?.caseId || null,
      normalizedAt: new Date().toISOString(),
      normalizedSource: 'api_verifications_create',
    };

    const { data: updatedVerification } = await applyTenantQueryScope(
      adminClient
      .from(VERIFICATION_REQUESTS_TABLE)
      .update({
        verification_case_id: canonicalThread?.caseId || null,
        thread_id: canonicalThread?.threadId || null,
        thread_key: canonicalThread?.threadKey || null,
        workflow_metadata: workflowMetadata,
      })
      .eq('id', data.id)
      .select('*')
      .single(),
      tenantScope
    );

    if (updatedVerification?.id) {
      Object.assign(data, updatedVerification);
    }
  }

  await addVerificationEvent(adminClient, {
    verificationRequestId: data.id,
    action: 'submitted',
    toStatus: 'pending',
    actorUserId: user.id,
    note: body.notes || null,
  });

  const summary = await refreshEntityVerificationSummary(adminClient, entityType, entityId);
  const [signedRequest] = decorateVerificationRows(await withSignedFileUrls(adminClient, [data]));

  const verificationThreadKey = String(data.thread_key || '').trim() || buildVerificationThreadKey({
    entityType,
    entityId,
  });

  await adminClient
    .from(SHARED_MESSAGES_TABLE)
    .insert(stampTenantPayload({
      ...(data.thread_id ? { thread_id: data.thread_id } : {}),
      thread_key: verificationThreadKey,
      family: 'verification',
      thread_type: 'verification',
      entity_type: entityType,
      entity_id: entityId,
      message_type: 'submission_event',
      subject: 'Verification review',
      body: `${getVerificationDocumentLabel(verificationType)} submitted for review.`,
      sender_user_id: user.id,
      sender_role: entityType === 'vehicle' ? 'owner' : 'customer',
      recipient_user_id: ownerUserId,
      recipient_role: entityType === 'vehicle' ? 'owner' : 'customer',
      metadata: {
        type: 'verification_card',
        reviewTitle: 'Verification review',
        verificationRequestId: signedRequest.id,
        verificationType,
        documentType: verificationType,
        verificationStatus: 'pending',
        status: 'pending',
        imageUrl: signedRequest.file_url || null,
        fileUrl: signedRequest.file_url || null,
        fileName: signedRequest.file_name || null,
        entityId,
        entityType,
        href: buildVerificationReviewPath({
          role: 'customer',
          entityType,
          entityId,
          requestId: signedRequest.id,
          documentType: verificationType,
        }),
        adminHref: buildVerificationReviewPath({
          role: 'admin',
          entityType,
          entityId,
          requestId: signedRequest.id,
          documentType: verificationType,
        }),
        source: 'verification_submission',
      },
      status: 'sent',
    }, tenantScope));

  return sendJson(res, 201, { request: signedRequest, summary });
};

const handlePatch = async (req, res) => {
  const action = getAction(req);

  if (action !== 'review') {
    return sendJson(res, 400, { error: 'Unsupported verification action' });
  }

  const auth = await requireOwnerOrAdmin(req);
  if (auth.error) return sendJson(res, auth.error.status, auth.error.body);

  const { adminClient, user, tenantRuntime } = auth;
  const body = req.body || {};
  const tenantScope = await resolveRequestTenantScope({ req, adminClient, tenantRuntime, payload: body });
  const userInScope = await assertUserInTenantScope({ adminClient, userId: user.id, tenantScope });
  if (!userInScope) {
    return sendJson(res, 403, { error: 'You do not have access to this workspace' });
  }
  const id = assertString(body.id, 'id');
  const status = assertString(body.status, 'status');

  if (!VERIFICATION_STATUSES.has(status)) {
    return sendJson(res, 400, { error: 'Invalid status' });
  }

  if (['rejected', 'suspended'].includes(status) && !String(body.rejectionReason || body.notes || '').trim()) {
    return sendJson(res, 400, { error: 'A reason is required for rejection or suspension' });
  }

  const { data: existing, error: loadError } = await applyTenantQueryScope(
    adminClient
    .from(VERIFICATION_REQUESTS_TABLE)
    .select('*')
    .eq('id', id)
    .single(),
    tenantScope
  );

  if (loadError) return sendJson(res, 404, { error: loadError.message });

  const { data, error } = await applyTenantQueryScope(
    adminClient
    .from(VERIFICATION_REQUESTS_TABLE)
    .update({
      status,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      rejection_reason: body.rejectionReason || null,
      notes: String(body.notes ?? '').trim() ? body.notes : existing.notes,
      expires_at: body.expiresAt ?? existing.expires_at,
    })
    .eq('id', id)
    .select('*')
    .single(),
    tenantScope
  );

  if (error) return sendJson(res, 500, { error: error.message });

  await addVerificationEvent(adminClient, {
    verificationRequestId: id,
    action: status,
    fromStatus: existing.status,
    toStatus: status,
    actorUserId: user.id,
    note: body.rejectionReason || body.notes || null,
  });

  const summary = await refreshEntityVerificationSummary(adminClient, data.entity_type, data.entity_id);
  const [signedRequest] = decorateVerificationRows(await withSignedFileUrls(adminClient, [data]));
  const canonicalThread = await ensureVerificationCaseThread(adminClient, {
    entityType: data.entity_type,
    entityId: data.entity_id,
    ownerUserId: data.owner_user_id,
    tenantScope,
  });
  const verificationThreadKey = String(canonicalThread?.threadKey || data.thread_key || '').trim() || buildVerificationThreadKey({
    entityType: data.entity_type,
    entityId: data.entity_id,
  });
  const reviewReason = String(body.rejectionReason || body.notes || '').trim();
  const approvalMessage = buildVerificationStatusMessage({
    verificationType: data.verification_type,
    status,
    reason: reviewReason,
  });

  const shouldSendCompletionOnly =
    status === 'approved' &&
    existing.status !== 'approved' &&
    summary?.complete;

  if (!shouldSendCompletionOnly) {
    await adminClient
      .from(SHARED_MESSAGES_TABLE)
      .insert(stampTenantPayload({
        ...(canonicalThread?.threadId || data.thread_id ? { thread_id: canonicalThread?.threadId || data.thread_id } : {}),
        thread_key: verificationThreadKey,
        family: 'verification',
        thread_type: 'verification',
        entity_type: data.entity_type,
        entity_id: data.entity_id,
        message_type: status === 'approved' ? 'approval_event' : status === 'rejected' ? 'rejection_event' : 'system_event',
        subject: 'Verification review',
        body: approvalMessage,
        sender_user_id: user.id,
        sender_role: 'admin',
        recipient_user_id: data.owner_user_id,
        recipient_role: data.entity_type === 'vehicle' ? 'owner' : 'customer',
        metadata: {
          type: 'verification_card',
          reviewTitle: 'Verification review',
          verificationRequestId: data.id,
          verificationType: data.verification_type,
          documentType: data.verification_type,
          verificationStatus: status,
          status,
          reviewReason: reviewReason || null,
          imageUrl: signedRequest.file_url || null,
          fileUrl: signedRequest.file_url || null,
          fileName: signedRequest.file_name || null,
          href: buildVerificationReviewPath({
            role: 'customer',
            entityType: data.entity_type,
            entityId: data.entity_id,
            requestId: data.id,
            documentType: data.verification_type,
          }),
          adminHref: buildVerificationReviewPath({
            role: 'admin',
            entityType: data.entity_type,
            entityId: data.entity_id,
            requestId: data.id,
            documentType: data.verification_type,
          }),
          source: 'verification_review_status',
        },
        status: 'sent',
      }, tenantScope));
  }

  if (shouldSendCompletionOnly) {
    await adminClient
      .from(SHARED_MESSAGES_TABLE)
      .insert(stampTenantPayload({
        ...(canonicalThread?.threadId || data.thread_id ? { thread_id: canonicalThread?.threadId || data.thread_id } : {}),
        thread_key: verificationThreadKey,
        family: 'verification',
        thread_type: 'verification',
        entity_type: data.entity_type,
        entity_id: data.entity_id,
        message_type: 'system_event',
        subject: 'Verification review',
        body: buildVerificationCompletionMessage(data.entity_type),
        sender_user_id: user.id,
        sender_role: 'admin',
        recipient_user_id: data.owner_user_id,
        recipient_role: data.entity_type === 'vehicle' ? 'owner' : 'customer',
        metadata: {
          type: 'system_event',
          reviewTitle: 'Verification review',
          event: 'verification_completed',
          verificationStatus: summary.status || 'approved',
          status: summary.status || 'approved',
          verificationRequestId: data.id,
          verificationType: data.verification_type,
          documentType: data.verification_type,
          href: buildVerificationReviewPath({
            role: 'customer',
            entityType: data.entity_type,
            entityId: data.entity_id,
          }),
          adminHref: buildVerificationReviewPath({
            role: 'admin',
            entityType: data.entity_type,
            entityId: data.entity_id,
          }),
          source: 'verification_review_complete',
        },
        status: 'sent',
      }, tenantScope));
  }
  return sendJson(res, 200, { request: signedRequest, summary });
};

const handleDelete = async (req, res) => {
  const action = getAction(req);

  if (action !== 'delete') {
    return sendJson(res, 400, { error: 'Unsupported verification action' });
  }

  const auth = await authenticateRequest(req);
  if (auth.error) return sendJson(res, auth.error.status, auth.error.body);

  const { adminClient, user, tenantRuntime } = auth;
  const tenantScope = await resolveRequestTenantScope({ req, adminClient, tenantRuntime });
  const userInScope = await assertUserInTenantScope({ adminClient, userId: user.id, tenantScope });
  if (!userInScope) {
    return sendJson(res, 403, { error: 'You do not have access to this workspace' });
  }
  const id = assertString(req.query?.id, 'id');

  const { data: existing, error: loadError } = await applyTenantQueryScope(
    adminClient
    .from(VERIFICATION_REQUESTS_TABLE)
    .select('*')
    .eq('id', id)
    .single(),
    tenantScope
  );

  if (loadError || !existing) {
    return sendJson(res, 404, { error: loadError?.message || 'Verification request not found' });
  }

  const actorRole = await getActorRole(adminClient, user);
  const isAdminActor = actorRole === 'admin';
  const isOwner = String(existing.owner_user_id || '') === String(user.id || '');

  if (!isAdminActor && !isOwner) {
    return sendJson(res, 403, { error: 'You are not allowed to remove this verification document' });
  }

  if (
    String(existing.status || '').toLowerCase() === 'approved' &&
    !isAdminActor &&
    String(existing.entity_type || '').toLowerCase() !== 'user'
  ) {
    return sendJson(res, 400, { error: 'Approved verification documents cannot be removed here' });
  }

  if (
    String(existing.status || '').toLowerCase() === 'approved' &&
    String(existing.entity_type || '').toLowerCase() === 'user'
  ) {
    const archivedNotes = buildArchivedVerificationNotes(existing.notes, user.id, existing.status);
    const { data: archivedRow, error: archiveError } = await applyTenantQueryScope(
      adminClient
      .from(VERIFICATION_REQUESTS_TABLE)
      .update({
        status: existing.status,
        notes: JSON.stringify(archivedNotes),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single(),
      tenantScope
    );

    if (archiveError) {
      return sendJson(res, 500, { error: archiveError.message || 'Unable to archive verification document' });
    }

    await addVerificationEvent(adminClient, {
      verificationRequestId: id,
      action: 'archived',
      fromStatus: existing.status,
      toStatus: 'archived',
      actorUserId: user.id,
      note: isAdminActor
        ? 'Admin archived an approved verification document from the active profile.'
        : 'User removed an approved verification document from the active profile.',
    });

    const summary = await refreshEntityVerificationSummary(adminClient, existing.entity_type, existing.entity_id);
    const [signedArchivedRequest] = decorateVerificationRows(await withSignedFileUrls(adminClient, [archivedRow]));

    return sendJson(res, 200, {
      success: true,
      archivedId: id,
      removedId: id,
      archivedRequest: signedArchivedRequest,
      summary,
    });
  }

  const existingEntityType = String(existing.entity_type || '').trim().toLowerCase();
  const existingVerificationType = String(existing.verification_type || '').trim().toLowerCase();
  const vehicleAliasSet =
    existingEntityType === 'vehicle' && REPLACEABLE_VEHICLE_VERIFICATION_TYPES.has(existingVerificationType)
      ? await resolveVehicleVerificationAliases(adminClient, {
          entityId: existing.entity_id,
          ownerUserId: existing.owner_user_id,
        })
      : new Set();

  const rowsToDelete =
    existingEntityType === 'vehicle' && REPLACEABLE_VEHICLE_VERIFICATION_TYPES.has(existingVerificationType)
      ? (() => {
          const matchingRows = [];
          const pushRow = (row) => {
            if (!row || matchingRows.some((item) => String(item.id) === String(row.id))) return;
            matchingRows.push(row);
          };

          pushRow(existing);

          return matchingRows;
        })()
      : [existing];

  if (existingEntityType === 'vehicle' && REPLACEABLE_VEHICLE_VERIFICATION_TYPES.has(existingVerificationType)) {
    const { data: siblingRows, error: siblingRowsError } = await applyTenantQueryScope(
      adminClient
      .from(VERIFICATION_REQUESTS_TABLE)
      .select('*')
      .eq('entity_type', 'vehicle')
      .eq('owner_user_id', existing.owner_user_id)
      .eq('verification_type', existing.verification_type),
      tenantScope
    );

    if (siblingRowsError) {
      return sendJson(res, 500, { error: siblingRowsError.message || 'Unable to remove duplicate verification documents' });
    }

    (siblingRows || []).forEach((row) => {
      const rowEntityId = normalizeIdentifier(row?.entity_id);
      if (vehicleAliasSet.size ? vehicleAliasSet.has(rowEntityId) : rowEntityId === normalizeIdentifier(existing.entity_id)) {
        if (!isArchivedVerificationRow(row)) {
          rowsToDelete.push(row);
        }
      }
    });
  }

  const dedupedRowsToDelete = rowsToDelete.filter((row, index, collection) => (
    collection.findIndex((candidate) => String(candidate?.id || '') === String(row?.id || '')) === index
  ));

  for (const row of dedupedRowsToDelete) {
    await removeVerificationArtifacts(adminClient, row, tenantScope);

    const { error: deleteError } = await applyTenantQueryScope(
      adminClient
      .from(VERIFICATION_REQUESTS_TABLE)
      .delete()
      .eq('id', row.id),
      tenantScope
    );

    if (deleteError) {
      const { error: softDeleteError } = await applyTenantQueryScope(
        adminClient
        .from(VERIFICATION_REQUESTS_TABLE)
        .update({
          notes: JSON.stringify(buildRemovedVerificationNotes(row.notes, user.id)),
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id),
        tenantScope
      );

      if (softDeleteError) {
        return sendJson(res, 500, {
          error: softDeleteError.message || deleteError.message || 'Unable to remove verification document',
        });
      }
    }
  }

  const summary = await refreshEntityVerificationSummary(adminClient, existing.entity_type, existing.entity_id);
  return sendJson(res, 200, {
    success: true,
    removedId: id,
    removedIds: dedupedRowsToDelete.map((row) => row.id),
    summary,
  });
};

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') return handleGet(req, res);
    if (req.method === 'POST') return handlePost(req, res);
    if (req.method === 'PATCH') return handlePatch(req, res);
    if (req.method === 'DELETE') return handleDelete(req, res);
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || 'Verification request failed' });
  }
}
