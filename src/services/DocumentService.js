import { supabase } from '../lib/supabase';
import {
  buildStoragePathCandidates,
  buildTenantScopedStoragePath,
  sanitizeStorageSegment,
} from '../utils/storageUpload';
import { getCurrentOrganizationId } from './OrganizationService';

const BUCKET_NAME = 'vehicle-documents';
const DOCUMENT_LIST_TIMEOUT_MS = 7000;
const DOCUMENT_DELETE_TIMEOUT_MS = 12000;
const DOCUMENT_DELETE_RETRIES = 2;
const DOCUMENT_CACHE_TTL_MS = 15000;
const documentListCache = new Map();
const inflightDocumentLoads = new Map();

const listStoragePrefixWithTimeout = (prefix) =>
  Promise.race([
    supabase.storage
      .from(BUCKET_NAME)
      .list(prefix, {
        limit: 100,
        offset: 0,
      }),
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Document storage list timed out for ${prefix}`));
      }, DOCUMENT_LIST_TIMEOUT_MS);
    }),
  ]);

const runWithTimeout = (promise, timeoutMs, message) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(message));
      }, timeoutMs);
    }),
  ]);

const getDocumentCacheKey = (organizationId, vehicleId) =>
  `${String(organizationId || '').trim() || 'no-org'}::${String(vehicleId || '').trim()}`;

const readDocumentCache = (cacheKey) => {
  const cached = documentListCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > DOCUMENT_CACHE_TTL_MS) {
    documentListCache.delete(cacheKey);
    return null;
  }
  return cached.documents;
};

const writeDocumentCache = (cacheKey, documents) => {
  documentListCache.set(cacheKey, {
    timestamp: Date.now(),
    documents: Array.isArray(documents) ? documents : [],
  });
};

export const invalidateVehicleDocumentCache = (vehicleId, organizationId = '') => {
  const normalizedVehicleId = sanitizeStorageSegment(vehicleId, '');
  if (!normalizedVehicleId) return;

  const explicitKey = getDocumentCacheKey(organizationId, normalizedVehicleId);
  documentListCache.delete(explicitKey);
  inflightDocumentLoads.delete(explicitKey);

  for (const cacheKey of [...documentListCache.keys()]) {
    if (cacheKey.endsWith(`::${normalizedVehicleId}`)) {
      documentListCache.delete(cacheKey);
    }
  }

  for (const inflightKey of [...inflightDocumentLoads.keys()]) {
    if (inflightKey.endsWith(`::${normalizedVehicleId}`)) {
      inflightDocumentLoads.delete(inflightKey);
    }
  }
};

const splitStoragePath = (storagePath) => {
  const normalizedPath = String(storagePath || '').trim().replace(/^\/+|\/+$/g, '');
  const segments = normalizedPath.split('/').filter(Boolean);
  const fileName = segments.pop() || '';
  return {
    prefix: segments.join('/'),
    fileName,
  };
};

const doesDocumentExist = async (storagePath) => {
  const { prefix, fileName } = splitStoragePath(storagePath);
  if (!prefix || !fileName) {
    return false;
  }

  try {
    const result = await listStoragePrefixWithTimeout(prefix);
    if (result?.error) {
      throw result.error;
    }

    return Boolean((result?.data || []).some((item) => String(item?.name || '').trim() === fileName));
  } catch (error) {
    console.warn('⚠️ Unable to verify document existence after delete attempt:', {
      storagePath,
      message: error?.message || String(error),
    });
    return true;
  }
};

/**
 * Upload a document to Supabase storage (same pattern as imageUpload.js)
 */
export const uploadDocument = async (file, vehicleId) => {
  try {
    console.log('🔄 DocumentService: Starting document upload:', file.name);
    const organizationId = await getCurrentOrganizationId();
    
    // Validate file
    validateDocumentFile(file);
    
    // Generate unique filename (same pattern as imageUpload.js)
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const fileExtension = file.name.split('.').pop();
    const fileName = `${timestamp}_${randomString}.${fileExtension}`;
    const filePath = buildTenantScopedStoragePath({
      organizationId,
      pathPrefix: String(vehicleId),
      fileName,
    });
    
    console.log('📁 Uploading to path:', filePath);
    
    // Upload file directly to Supabase storage (same approach as imageUpload.js)
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type
      });

    if (error) {
      console.error('❌ Storage upload error:', error);
      throw new Error(`Upload failed: ${error.message}`);
    }

    console.log('✅ Document uploaded successfully:', data);

    // Get public URL for the uploaded document (same as imageUpload.js)
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    return {
      id: `doc_${timestamp}_${randomString}`,
      name: file.name,
      type: file.type,
      size: file.size,
      url: urlData.publicUrl,
      storagePath: filePath,
      uploadedAt: new Date().toISOString(),
      category: getCategoryFromType(file.type),
      vehicleId: vehicleId
    };
    
  } catch (error) {
    console.error('❌ Error in uploadDocument:', error);
    throw error;
  }
};

/**
 * Delete a document from storage (same pattern as imageUpload.js)
 */
export const deleteDocument = async (storagePath) => {
  console.log('🔄 DocumentService: Deleting document:', storagePath);
  const { prefix } = splitStoragePath(storagePath);
  const vehicleIdHint = prefix.split('/').filter(Boolean).pop() || '';
  let lastError = null;

  for (let attempt = 1; attempt <= DOCUMENT_DELETE_RETRIES; attempt += 1) {
    try {
      const { error } = await runWithTimeout(
        supabase.storage
          .from(BUCKET_NAME)
          .remove([storagePath]),
        DOCUMENT_DELETE_TIMEOUT_MS,
        `Document delete timed out for ${storagePath}`
      );

      if (error) {
        throw error;
      }

      invalidateVehicleDocumentCache(vehicleIdHint);
      console.log('✅ Document deleted successfully');
      return { success: true, attempt };
    } catch (error) {
      lastError = error;
      const stillExists = await doesDocumentExist(storagePath);
      if (!stillExists) {
        invalidateVehicleDocumentCache(vehicleIdHint);
        console.log('✅ Document delete confirmed after delayed response');
        return { success: true, verifiedAfterTimeout: true, attempt };
      }

      if (attempt < DOCUMENT_DELETE_RETRIES) {
        console.warn('⚠️ Document delete attempt failed, retrying:', {
          storagePath,
          attempt,
          message: error?.message || String(error),
        });
        await new Promise((resolve) => setTimeout(resolve, 700 * attempt));
      }
    }
  }

  console.error('❌ Error in deleteDocument:', lastError);
  throw lastError || new Error('Unable to delete document');
};

/**
 * Get documents for a vehicle (same pattern as imageUpload.js getVehicleImages)
 */
export const getVehicleDocuments = async (vehicleId, options = {}) => {
  console.log('🔄 DocumentService: Getting documents for vehicle:', vehicleId);
  const organizationId = String(await getCurrentOrganizationId().catch(() => '') || '').trim();
  const normalizedVehicleId = sanitizeStorageSegment(vehicleId, '');
  const cacheKey = getDocumentCacheKey(organizationId, normalizedVehicleId);
  if (options?.forceRefresh) {
    invalidateVehicleDocumentCache(normalizedVehicleId, organizationId);
  }

  const cachedDocuments = readDocumentCache(cacheKey);
  if (cachedDocuments && !options?.forceRefresh) {
    return cachedDocuments;
  }

  if (inflightDocumentLoads.has(cacheKey) && !options?.forceRefresh) {
    return inflightDocumentLoads.get(cacheKey);
  }

  const loadPromise = (async () => {
    try {
      const prefixCandidates = organizationId
        ? buildStoragePathCandidates(organizationId, normalizedVehicleId)
        : [
            normalizedVehicleId,
            normalizedVehicleId ? `tenant/unknown-org/${normalizedVehicleId}` : '',
          ].filter(Boolean);

      const prefixResults = await Promise.all(
        prefixCandidates.map(async (candidatePrefix) => {
          try {
            const result = await listStoragePrefixWithTimeout(candidatePrefix);
            return {
              prefix: candidatePrefix,
              data: Array.isArray(result?.data) ? result.data : [],
              error: result?.error || null,
            };
          } catch (error) {
            return {
              prefix: candidatePrefix,
              data: [],
              error,
            };
          }
        })
      );

      const prioritizedResult =
        prefixCandidates
          .map((prefix) => prefixResults.find((result) => result.prefix === prefix))
          .find((result) => Array.isArray(result?.data) && result.data.length > 0) ||
        prefixCandidates
          .map((prefix) => prefixResults.find((result) => result.prefix === prefix))
          .find((result) => !result?.error) ||
        null;

      if (!prioritizedResult) {
        if (!options?.suppressWarnings) {
          console.warn('⚠️ No vehicle documents loaded from storage:', {
            vehicleId: normalizedVehicleId,
            attemptedPrefixes: prefixCandidates,
            errors: prefixResults.map((result) => ({
              prefix: result.prefix,
              message: result.error?.message || String(result.error || ''),
            })),
          });
        }
        writeDocumentCache(cacheKey, []);
        return [];
      }

      if (prioritizedResult.error && prioritizedResult.data.length === 0) {
        if (!options?.suppressWarnings) {
          console.warn('⚠️ No vehicle documents loaded from storage:', {
            vehicleId: normalizedVehicleId,
            attemptedPrefixes: prefixCandidates,
            errors: prefixResults
              .filter((result) => result.error)
              .map((result) => ({
                prefix: result.prefix,
                message: result.error?.message || String(result.error),
              })),
          });
        }
        writeDocumentCache(cacheKey, []);
        return [];
      }

      const resolvedPrefix = prioritizedResult.prefix;
      const documents = [];

      for (const item of prioritizedResult.data) {
        if (item.name && !item.name.endsWith('/')) {
          const { data: urlData } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(`${resolvedPrefix}/${item.name}`);

          const fileType = getMimeTypeFromName(item.name);
          const categoryMeta = getCategoryFromStoredName(item.name, fileType);

          documents.push({
            id: item.id || `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: extractOriginalFilename(item.name),
            type: fileType,
            size: item.metadata?.size || 0,
            url: urlData.publicUrl,
            storagePath: `${resolvedPrefix}/${item.name}`,
            uploadedAt: item.created_at || item.updated_at,
            category: categoryMeta.category,
            categoryKey: categoryMeta.categoryKey,
            vehicleId,
          });
        }
      }

      console.log('✅ Vehicle documents retrieved:', documents.length, 'from', resolvedPrefix);
      writeDocumentCache(cacheKey, documents);
      return documents;
    } catch (error) {
      console.warn('⚠️ Error in getVehicleDocuments:', error);
      writeDocumentCache(cacheKey, []);
      return [];
    } finally {
      inflightDocumentLoads.delete(cacheKey);
    }
  })();

  inflightDocumentLoads.set(cacheKey, loadPromise);
  return loadPromise;
};

const extractOriginalFilename = (storedName) => {
  const withoutCategory = String(storedName || '').replace(/^[a-z-]+__/, '');

  if (/^\d{13}_/.test(withoutCategory)) {
    return withoutCategory.split('_').slice(1).join('_') || withoutCategory;
  }

  if (/^\d+_[a-z0-9]+_/i.test(withoutCategory)) {
    return withoutCategory.split('_').slice(2).join('_') || withoutCategory;
  }

  return withoutCategory;
};

/**
 * Get MIME type from file name
 */
const getMimeTypeFromName = (name) => {
  const extension = name.split('.').pop().toLowerCase();
  const mimeTypes = {
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'txt': 'text/plain',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp'
  };
  return mimeTypes[extension] || 'application/octet-stream';
};

const getCategoryFromStoredName = (storedName, mimeType) => {
  const categoryKey = String(storedName || '').split('__')[0];
  const categoryMap = {
    legal: 'Legal file',
    'purchase-invoice': 'Purchase invoice',
    registration: 'Registration',
    'annual-tax': 'Annual vehicle tax receipt',
    insurance: 'Insurance',
    maintenance: 'Maintenance',
    other: 'Other',
  };

  if (categoryMap[categoryKey]) {
    return {
      category: categoryMap[categoryKey],
      categoryKey,
    };
  }

  return {
    category: getCategoryFromType(mimeType),
    categoryKey: null,
  };
};

/**
 * Get category from file type
 */
const getCategoryFromType = (type) => {
  if (type.includes('pdf')) return 'PDF';
  if (type.includes('word')) return 'Document';
  if (type.includes('excel') || type.includes('sheet')) return 'Spreadsheet';
  if (type.includes('image')) return 'Image';
  return 'Other';
};

/**
 * Validate document file before upload
 */
const validateDocumentFile = (file) => {
  const maxSize = 10 * 1024 * 1024; // 10MB
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp'
  ];

  if (file.size > maxSize) {
    throw new Error(`Document ${file.name} is too large. Maximum size is 10MB.`);
  }

  if (!allowedTypes.includes(file.type)) {
    throw new Error(`Document type ${file.type} is not supported for ${file.name}.`);
  }

  return true;
};

// Export as default object to match the import pattern
const DocumentService = {
  uploadDocument,
  deleteDocument,
  getVehicleDocuments,
  validateFile: validateDocumentFile
};

export default DocumentService;
