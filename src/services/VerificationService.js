import { supabase } from '../lib/supabase';
import { adminApiRequest } from './adminApi';
import { VERIFICATION_BUCKET } from '../utils/verificationStatus';

const getSessionUser = async () => {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    throw new Error(error?.message || 'No active session');
  }
  return data.user;
};

const buildStoragePath = ({ userId, entityType, entityId, verificationType, file }) => {
  const timestamp = Date.now();
  const safeName = String(file.name || 'document')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120);

  return `${userId}/${entityType}/${entityId}/${verificationType}/${timestamp}-${safeName}`;
};

export const uploadVerificationDocument = async ({
  entityType,
  entityId,
  ownerUserId,
  verificationType,
  file,
  expiresAt = null,
  notes = '',
}) => {
  if (!file) throw new Error('Document file is required');

  const user = await getSessionUser();
  const effectiveOwnerUserId = ownerUserId || user.id;
  const filePath = buildStoragePath({
    userId: user.id,
    entityType,
    entityId,
    verificationType,
    file,
  });

  const { error: uploadError } = await supabase.storage
    .from(VERIFICATION_BUCKET)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'application/octet-stream',
    });

  if (uploadError) {
    throw uploadError;
  }

  return adminApiRequest('/api/verifications?action=create', {
    method: 'POST',
    body: JSON.stringify({
      entityType,
      entityId: String(entityId),
      ownerUserId: effectiveOwnerUserId,
      verificationType,
      fileUrl: filePath,
      filePath,
      fileName: file.name,
      fileMimeType: file.type,
      fileSize: file.size,
      expiresAt,
      notes,
    }),
  });
};

export const getVerificationRequests = (filters = {}) => {
  const params = new URLSearchParams({ action: 'list' });
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, value);
    }
  });
  return adminApiRequest(`/api/verifications?${params.toString()}`);
};

export const getEntityVerificationSummary = (entityType, entityId) => {
  const params = new URLSearchParams({
    action: 'entity-summary',
    entityType,
    entityId: String(entityId),
  });
  return adminApiRequest(`/api/verifications?${params.toString()}`);
};

export const updateVerificationStatus = ({ id, status, rejectionReason = '', notes = '', expiresAt = null }) =>
  adminApiRequest('/api/verifications?action=review', {
    method: 'PATCH',
    body: JSON.stringify({ id, status, rejectionReason, notes, expiresAt }),
  });

export default {
  uploadVerificationDocument,
  getVerificationRequests,
  getEntityVerificationSummary,
  updateVerificationStatus,
};
