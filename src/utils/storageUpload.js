import { supabase } from '../lib/supabase';

const DEFAULT_IMAGE_SETTINGS = {
  document: {
    maxWidth: 1400,
    maxHeight: 1400,
    quality: 0.6,
    format: 'image/webp',
    extension: 'webp',
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
    const filePath = pathPrefix ? `${pathPrefix}/${cleanName}` : cleanName;

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, uploadTarget, {
        cacheControl: '3600',
        upsert: false,
        contentType: optimizedUpload.contentType,
      });

    if (error) throw error;

    const {
      data: { publicUrl },
    } = supabase.storage.from(bucket).getPublicUrl(data.path);

    return {
      success: true,
      url: publicUrl,
      path: data.path,
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
