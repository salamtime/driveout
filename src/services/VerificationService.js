import { supabase } from '../lib/supabase';
import { adminApiRequest } from './adminApi';
import { VERIFICATION_BUCKET } from '../utils/verificationStatus';
import { createTimedRequestCache } from '../utils/requestCache';
import { sanitizeStorageSegment } from '../utils/storageUpload';
import { getCurrentOrganizationId } from './OrganizationService';

const verificationRequestCache = createTimedRequestCache(45000);
const runWithTimeout = (promise, timeoutMs, errorMessage) => {
  let timeoutId = null;

  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timeoutId = globalThis.setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    }),
  ]).finally(() => {
    if (timeoutId !== null) {
      globalThis.clearTimeout(timeoutId);
    }
  });
};

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

  return {
    pathPrefix: `verifications/${entityType}/${entityId}/${verificationType}`,
    fileName: `${timestamp}-${safeName}`,
  };
};

const buildVerificationUploadPath = ({ userId, organizationId, pathPrefix, fileName }) => {
  const normalizedUserId = sanitizeStorageSegment(userId, 'anonymous-user');
  const normalizedPrefix = sanitizeStorageSegment(pathPrefix, 'verifications');
  const normalizedFileName = sanitizeStorageSegment(fileName, 'upload.bin');
  const tenantSegment = organizationId
    ? `tenant/${sanitizeStorageSegment(organizationId, 'unknown-org')}`
    : '';
  const scopedPrefix = tenantSegment
    ? `${tenantSegment}/${normalizedPrefix}`
    : normalizedPrefix;

  return `${normalizedUserId}/${scopedPrefix}/${normalizedFileName}`;
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
  const organizationId = await runWithTimeout(
    getCurrentOrganizationId(),
    2500,
    'Workspace context timed out.'
  ).catch((error) => {
    console.warn('Verification upload continuing without organization scope:', error?.message || error);
    return null;
  });
  const pathConfig = buildStoragePath({
    userId: user.id,
    entityType,
    entityId,
    verificationType,
    file,
  });
  const filePath = buildVerificationUploadPath({
    userId: user.id,
    organizationId,
    pathPrefix: pathConfig.pathPrefix,
    fileName: pathConfig.fileName,
  });

  const { error: uploadError } = await runWithTimeout(
    supabase.storage
      .from(VERIFICATION_BUCKET)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || 'application/octet-stream',
    }),
    15000,
    'Verification file upload timed out. Please try again.'
  );

  if (uploadError) {
    throw uploadError;
  }

  const result = await runWithTimeout(
    adminApiRequest('/api/verifications?action=create', {
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
        notes: typeof notes === 'string' ? notes : JSON.stringify(notes),
      }),
    }),
    8000,
    'Verification request timed out. Please try again.'
  );
  verificationRequestCache.invalidate(`entity-summary:${entityType}:${String(entityId)}`);
  return result;
};

export const updateProfileFromVerificationScan = async ({ currentProfile = {}, scanData = {} } = {}) => {
  const fullName = String(
    scanData.full_name ||
    scanData.fullName ||
    scanData.name ||
    currentProfile.full_name ||
    currentProfile.fullName ||
    ''
  ).trim();
  const dateOfBirth = String(
    scanData.date_of_birth ||
    scanData.dateOfBirth ||
    scanData.customer_dob ||
    currentProfile.date_of_birth ||
    ''
  ).trim();

  if (!fullName && !dateOfBirth) {
    return null;
  }

  const profilePatch = {};
  if (fullName) {
    profilePatch.full_name = fullName;
  }
  if (dateOfBirth) {
    profilePatch.date_of_birth = dateOfBirth;
  }

  return runWithTimeout(
    adminApiRequest('/api/me?resource=profile', {
      method: 'PATCH',
      body: JSON.stringify(profilePatch),
    }),
    12000,
    'Profile sync timed out. Your document was still submitted successfully.'
  );
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

export const getEntityVerificationSummary = (entityType, entityId, options = {}) =>
  verificationRequestCache.get(
    `entity-summary:${entityType}:${String(entityId)}`,
    () => {
      const params = new URLSearchParams({
        action: 'entity-summary',
        entityType,
        entityId: String(entityId),
      });
      return adminApiRequest(`/api/verifications?${params.toString()}`);
    },
    { ttl: 45000, forceRefresh: options.forceRefresh }
  );

export const getEntityVerificationFile = async (entityType, entityId, options = {}) => {
  const response = await getEntityVerificationSummary(entityType, entityId, options);
  return {
    summary: response?.summary || null,
    requests: Array.isArray(response?.requests) ? response.requests : [],
    historyRequests: Array.isArray(response?.historyRequests) ? response.historyRequests : [],
  };
};

export const updateVerificationStatus = async ({ id, status, rejectionReason = '', notes, expiresAt = null }) => {
  const result = await adminApiRequest('/api/verifications?action=review', {
    method: 'PATCH',
    body: JSON.stringify({ id, status, rejectionReason, notes, expiresAt }),
  });
  verificationRequestCache.clear();
  return result;
};

export const deleteVerificationRequest = async ({ id }) => {
  const result = await adminApiRequest(`/api/verifications?action=delete&id=${encodeURIComponent(String(id || ''))}`, {
    method: 'DELETE',
  });
  verificationRequestCache.clear();
  return result;
};

export default {
  uploadVerificationDocument,
  getVerificationRequests,
  getEntityVerificationSummary,
  getEntityVerificationFile,
  updateVerificationStatus,
  updateProfileFromVerificationScan,
  deleteVerificationRequest,
};
