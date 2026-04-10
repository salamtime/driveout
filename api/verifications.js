import { authenticateRequest, requireOwnerOrAdmin } from './_lib/auth.js';
import { VERIFICATION_DOCUMENTS_BUCKET, VERIFICATION_REQUESTS_TABLE } from './_lib/supabase.js';
import {
  addVerificationEvent,
  expireInsuranceVerifications,
  refreshEntityVerificationSummary,
  VERIFICATION_ENTITY_TYPES,
  VERIFICATION_STATUSES,
} from './_lib/verification.js';

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
    message.includes('verification_requests') ||
    message.includes('verification_events') ||
    message.includes('permission denied') ||
    message.includes('schema cache')
  );
};

const emptyVerificationResponse = (res, extra = {}) => sendJson(res, 200, {
  requests: [],
  setup_required: true,
  ...extra,
});

const handleGet = async (req, res) => {
  const action = getAction(req);

  if (action === 'list') {
    const auth = await requireOwnerOrAdmin(req);
    if (auth.error) return sendJson(res, auth.error.status, auth.error.body);

    const { adminClient } = auth;
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

    let query = adminClient
      .from(VERIFICATION_REQUESTS_TABLE)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Number(req.query.limit || 120));

    if (req.query.status && req.query.status !== 'all') query = query.eq('status', req.query.status);
    if (req.query.entityType && req.query.entityType !== 'all') query = query.eq('entity_type', req.query.entityType);
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

    return sendJson(res, 200, { requests: await withSignedFileUrls(adminClient, data || []) });
  }

  if (action === 'entity-summary') {
    const auth = await authenticateRequest(req);
    if (auth.error) return sendJson(res, auth.error.status, auth.error.body);

    const { adminClient, user } = auth;
    const entityType = assertString(req.query.entityType, 'entityType');
    const entityId = assertString(req.query.entityId, 'entityId');

    if (!VERIFICATION_ENTITY_TYPES.has(entityType)) {
      return sendJson(res, 400, { error: 'Invalid entityType' });
    }

    const rowsQuery = adminClient
      .from(VERIFICATION_REQUESTS_TABLE)
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false });

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

    const isOwnUserEntity = entityType === 'user' && entityId === user.id;
    const ownRows = (data || []).filter((row) => row.owner_user_id === user.id);
    const rows = isOwnUserEntity ? data || [] : ownRows;
    const summary = await refreshEntityVerificationSummary(adminClient, entityType, entityId);

    return sendJson(res, 200, { requests: await withSignedFileUrls(adminClient, rows), summary });
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

  const { adminClient, user } = auth;
  const body = req.body || {};
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
    .insert(insertPayload)
    .select('*')
    .single();

  if (error) return sendJson(res, 500, { error: error.message });

  await addVerificationEvent(adminClient, {
    verificationRequestId: data.id,
    action: 'submitted',
    toStatus: 'pending',
    actorUserId: user.id,
    note: body.notes || null,
  });

  const summary = await refreshEntityVerificationSummary(adminClient, entityType, entityId);
  const [signedRequest] = await withSignedFileUrls(adminClient, [data]);
  return sendJson(res, 201, { request: signedRequest, summary });
};

const handlePatch = async (req, res) => {
  const action = getAction(req);

  if (action !== 'review') {
    return sendJson(res, 400, { error: 'Unsupported verification action' });
  }

  const auth = await requireOwnerOrAdmin(req);
  if (auth.error) return sendJson(res, auth.error.status, auth.error.body);

  const { adminClient, user } = auth;
  const body = req.body || {};
  const id = assertString(body.id, 'id');
  const status = assertString(body.status, 'status');

  if (!VERIFICATION_STATUSES.has(status)) {
    return sendJson(res, 400, { error: 'Invalid status' });
  }

  if (['rejected', 'suspended'].includes(status) && !String(body.rejectionReason || body.notes || '').trim()) {
    return sendJson(res, 400, { error: 'A reason is required for rejection or suspension' });
  }

  const { data: existing, error: loadError } = await adminClient
    .from(VERIFICATION_REQUESTS_TABLE)
    .select('*')
    .eq('id', id)
    .single();

  if (loadError) return sendJson(res, 404, { error: loadError.message });

  const { data, error } = await adminClient
    .from(VERIFICATION_REQUESTS_TABLE)
    .update({
      status,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      rejection_reason: body.rejectionReason || null,
      notes: body.notes ?? existing.notes,
      expires_at: body.expiresAt ?? existing.expires_at,
    })
    .eq('id', id)
    .select('*')
    .single();

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
  const [signedRequest] = await withSignedFileUrls(adminClient, [data]);
  return sendJson(res, 200, { request: signedRequest, summary });
};

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') return handleGet(req, res);
    if (req.method === 'POST') return handlePost(req, res);
    if (req.method === 'PATCH') return handlePatch(req, res);
    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || 'Verification request failed' });
  }
}
