import { supabase } from '../lib/supabase';
import { getCurrentOrganizationId } from '../services/OrganizationService';

const DEFAULT_IMAGE_SETTINGS = {
  document: {
    maxWidth: 1400,
    maxHeight: 1400,
    quality: 0.6,
    format: 'image/jpeg',
    extension: 'jpg',
  },
  photo: {
    maxWidth: 1600,
    maxHeight: 1600,
    quality: 0.65,
    format: 'image/webp',
    extension: 'webp',
  },
};

const NON_COMPRESSIBLE_IMAGE_TYPES = new Set([
  'image/gif',
  'image/svg+xml',
]);

const isBrowserFile = (value) =>
  typeof File !== 'undefined' && value instanceof File;

const isCompressibleImage = (file) =>
  Boolean(file?.type?.startsWith('image/')) &&
  !NON_COMPRESSIBLE_IMAGE_TYPES.has(file.type);

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read upload file'));
    reader.readAsDataURL(file);
  });

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image for compression'));
    img.src = src;
  });

const canvasToBlob = (canvas, type, quality) =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to generate compressed upload'));
        return;
      }
      resolve(blob);
    }, type, quality);
  });

const getResizedDimensions = (width, height, settings) => {
  const widthRatio = settings.maxWidth / width;
  const heightRatio = settings.maxHeight / height;
  const scale = Math.min(1, widthRatio, heightRatio);

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

const getOptimizationProfile = (bucket, pathPrefix, optimizationProfile) => {
  if (optimizationProfile && DEFAULT_IMAGE_SETTINGS[optimizationProfile]) {
    return optimizationProfile;
  }

  if (
    bucket === 'id_scans' ||
    String(pathPrefix || '').includes('damage-deposits') ||
    String(pathPrefix || '').includes('documents')
  ) {
    return 'document';
  }

  return 'photo';
};

const isAbortLikeUploadError = (error) => {
  const message = String(error?.message || error || '').toLowerCase();
  const name = String(error?.name || '').toLowerCase();

  return (
    name === 'aborterror' ||
    message.includes('aborterror') ||
    message.includes('signal is aborted') ||
    message.includes('signal has been aborted') ||
    message.includes('the operation was aborted') ||
    message.includes('body stream already read')
  );
};

const isRetryableUploadError = (error) => {
  const message = String(error?.message || error || '').toLowerCase();

  return (
    isAbortLikeUploadError(error) ||
    message.includes('networkerror') ||
    message.includes('failed to fetch') ||
    message.includes('load failed') ||
    message.includes('timeout') ||
    message.includes('network request failed')
  );
};

const isAlreadyExistsUploadError = (error) => {
  const message = String(error?.message || error || '').toLowerCase();
  return (
    message.includes('already exists') ||
    message.includes('duplicate') ||
    message.includes('resource already exists')
  );
};

export const sanitizeStorageSegment = (value, fallback = 'default') => {
  const normalized = String(value || '')
    .trim()
    .replace(/[^a-z0-9/_-]+/gi, '-')
    .replace(/\/+/g, '/')
    .replace(/-+/g, '-')
    .replace(/^\/|\/$/g, '');

  return normalized || fallback;
};

export const buildTenantStoragePrefix = (organizationId, pathPrefix = '') => {
  const tenantRoot = `tenant/${sanitizeStorageSegment(organizationId, 'unknown-org')}`;
  const normalizedPrefix = sanitizeStorageSegment(pathPrefix, '');
  return normalizedPrefix ? `${tenantRoot}/${normalizedPrefix}` : tenantRoot;
};

export const buildTenantScopedStoragePath = ({
  organizationId,
  pathPrefix = '',
  fileName = '',
}) => {
  const scopedPrefix = buildTenantStoragePrefix(organizationId, pathPrefix);
  const normalizedFileName = sanitizeStorageSegment(fileName, 'upload.bin');
  return normalizedFileName ? `${scopedPrefix}/${normalizedFileName}` : scopedPrefix;
};

export const buildStoragePathCandidates = (organizationId, pathPrefix = '') => {
  const scopedPrefix = buildTenantStoragePrefix(organizationId, pathPrefix);
  const normalizedLegacyPrefix = sanitizeStorageSegment(pathPrefix, '');
  return normalizedLegacyPrefix
    ? [scopedPrefix, normalizedLegacyPrefix]
    : [scopedPrefix];
};

export const optimizeFileForUpload = async (file, options = {}) => {
  if (!isBrowserFile(file) || !isCompressibleImage(file)) {
    return {
      file,
      contentType: file?.type || 'application/octet-stream',
      extension: file?.name?.split('.').pop()?.toLowerCase() || 'bin',
      optimized: false,
      originalSize: file?.size || 0,
      finalSize: file?.size || 0,
    };
  }

  const profile = getOptimizationProfile(
    options.bucket,
    options.pathPrefix,
    options.optimizationProfile
  );

  // Keep legal docs and scan inputs in their original form.
  // This avoids client-side canvas stalls on repeated uploads and preserves OCR quality.
  if (profile === 'document') {
    return {
      file,
      contentType: file?.type || 'application/octet-stream',
      extension: file?.name?.split('.').pop()?.toLowerCase() || 'bin',
      optimized: false,
      originalSize: file?.size || 0,
      finalSize: file?.size || 0,
    };
  }

  const settings = DEFAULT_IMAGE_SETTINGS[profile];

  try {
    const source = await readFileAsDataUrl(file);
    const image = await loadImage(source);
    const { width, height } = getResizedDimensions(
      image.naturalWidth || image.width,
      image.naturalHeight || image.height,
      settings
    );

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      throw new Error('Canvas compression is unavailable');
    }

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const blob = await canvasToBlob(canvas, settings.format, settings.quality);
    const originalBaseName =
      file.name?.replace(/\.[^.]+$/, '') || `upload-${Date.now()}`;
    const compressedFile = new File(
      [blob],
      `${originalBaseName}.${settings.extension}`,
      { type: settings.format }
    );

    return {
      file: compressedFile,
      contentType: settings.format,
      extension: settings.extension,
      optimized: true,
      originalSize: file.size,
      finalSize: compressedFile.size,
    };
  } catch (error) {
    console.warn('Falling back to original file upload:', error);
    return {
      file,
      contentType: file.type || 'application/octet-stream',
      extension: file.name?.split('.').pop()?.toLowerCase() || 'bin',
      optimized: false,
      originalSize: file.size || 0,
      finalSize: file.size || 0,
    };
  }
};

export const uploadFile = async (file, options = {}) => {
  try {
    const {
      bucket = 'id_scans',
      pathPrefix = '',
      fileName = null,
      optimizationProfile = null,
    } = options;

    const optimizedUpload = await optimizeFileForUpload(file, {
      bucket,
      pathPrefix,
      optimizationProfile,
    });

    const uploadTarget = optimizedUpload.file;
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 10);
    const fileExt = optimizedUpload.extension;
    const cleanName = fileName || `${timestamp}_${randomId}.${fileExt}`;
    const organizationId = await getCurrentOrganizationId();
    const filePath = buildTenantScopedStoragePath({
      organizationId,
      pathPrefix,
      fileName: cleanName,
    });

    let uploadData = null;
    let uploadError = null;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const result = await supabase.storage
        .from(bucket)
        .upload(filePath, uploadTarget, {
          cacheControl: '3600',
          upsert: false,
          contentType: optimizedUpload.contentType,
        });

      uploadData = result.data || null;
      uploadError = result.error || null;

      if (!uploadError) {
        break;
      }

      // If the first upload likely succeeded but the client lost the response,
      // retrying the same path can come back as "already exists". Treat that as success.
      if (isAlreadyExistsUploadError(uploadError)) {
        uploadData = { path: filePath };
        uploadError = null;
        break;
      }

      if (!isRetryableUploadError(uploadError) || attempt === 3) {
        throw uploadError;
      }

      await new Promise((resolve) => setTimeout(resolve, 450 * attempt));
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(bucket).getPublicUrl(uploadData.path);

    return {
      success: true,
      url: publicUrl,
      path: uploadData.path,
      optimized: optimizedUpload.optimized,
      originalSize: optimizedUpload.originalSize,
      finalSize: optimizedUpload.finalSize,
      bytesSaved: Math.max(
        0,
        (optimizedUpload.originalSize || 0) - (optimizedUpload.finalSize || 0)
      ),
    };
  } catch (error) {
    console.error('Upload failed:', error);
    return { success: false, error: error.message };
  }
};

export const uploadCustomerDocument = async (file, customerId = null) => {
  const pathPrefix = customerId ? `customers/${customerId}` : 'customers';
  return uploadFile(file, {
    bucket: 'id_scans',
    pathPrefix,
    optimizationProfile: 'document',
  });
};
