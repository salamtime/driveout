import { supabase } from '../lib/supabase';
import { adminApiRequest } from './adminApi';
import { VERIFICATION_BUCKET } from '../utils/verificationStatus';
import { createTimedRequestCache } from '../utils/requestCache';
import { buildTenantScopedStoragePath } from '../utils/storageUpload';
import { getCurrentOrganizationId } from './OrganizationService';

const verificationRequestCache = createTimedRequestCache(45000);
const runWithTimeout = (promise, timeoutMs, errorMessage) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    }),
  ]);

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
    pathPrefix: `verifications/${userId}/${entityType}/${entityId}/${verificationType}`,
    fileName: `${timestamp}-${safeName}`,
  };
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
  const organizationId = await getCurrentOrganizationId();
  const pathConfig = buildStoragePath({
    userId: user.id,
    entityType,
    entityId,
    verificationType,
    file,
  });
  const filePath = buildTenantScopedStoragePath({
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
    30000,
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
    30000,
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

  return adminApiRequest('/api/me?resource=profile', {
    method: 'PATCH',
    body: JSON.stringify({
      username: currentProfile.username || '',
      first_name: currentProfile.first_name || '',
      last_name: currentProfile.last_name || '',
      full_name: fullName || currentProfile.full_name || currentProfile.fullName || '',
      phone: currentProfile.phone || currentProfile.phone_number || '',
      address: currentProfile.address || '',
      date_of_birth: dateOfBirth || currentProfile.date_of_birth || '',
      emergency_contact: currentProfile.emergency_contact || '',
      emergency_phone: currentProfile.emergency_phone || '',
      preferences: currentProfile.preferences || {},
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
