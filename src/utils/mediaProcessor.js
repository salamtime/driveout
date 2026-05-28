/**
 * Media Processor Utility
 * Handles both image and video processing for vehicle condition documentation
 * - Image: HEIC to JPEG conversion, compression, EXIF orientation correction
 * - Video: iOS .MOV/HEVC to mp4 conversion
 */

let ffmpegInstance = null;
let isFFmpegLoaded = false;

const getSafeFileName = (file) =>
  String(file?.name || file?.fileName || file?.filename || '');

const getSafeFileType = (file) =>
  String(file?.type || file?.mimeType || '');

const inferTypeFromName = (name = '') => {
  const normalizedName = String(name || '').toLowerCase();
  if (/\.(jpe?g|png|gif|heic|heif|webp)$/.test(normalizedName)) return 'image/';
  if (/\.(mp4|mov|m4v|webm|avi)$/.test(normalizedName)) return 'video/';
  return '';
};

let ffmpegDepsPromise = null;

const loadFFmpegDeps = async () => {
  if (!ffmpegDepsPromise) {
    ffmpegDepsPromise = Promise.all([
      import('@ffmpeg/ffmpeg'),
      import('@ffmpeg/util'),
    ]).then(([ffmpegModule, utilModule]) => ({
      FFmpeg: ffmpegModule.FFmpeg,
      fetchFile: utilModule.fetchFile,
      toBlobURL: utilModule.toBlobURL,
    }));
  }

  return ffmpegDepsPromise;
};

// ==================== FFmpeg Setup ====================

/**
 * Initialize FFmpeg instance (lazy loading)
 */
const getFFmpeg = async () => {
  if (ffmpegInstance && isFFmpegLoaded) {
    return ffmpegInstance;
  }

  const { FFmpeg, toBlobURL } = await loadFFmpegDeps();

  if (!ffmpegInstance) {
    ffmpegInstance = new FFmpeg();
  }

  if (!isFFmpegLoaded) {
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    
    await ffmpegInstance.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    
    isFFmpegLoaded = true;
    console.log('✅ FFmpeg loaded successfully');
  }

  return ffmpegInstance;
};

// ==================== Video Processing ====================

/**
 * Detect if video needs conversion
 */
export const needsVideoConversion = async (file) => {
  const name = getSafeFileName(file).toLowerCase();
  const type = getSafeFileType(file).toLowerCase();

  if (name.endsWith('.mov')) {
    console.log('📹 iOS .MOV detected, conversion required');
    return true;
  }

  return new Promise((resolve) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    
    video.onloadedmetadata = () => {
      if (video.videoTracks && video.videoTracks.length > 0) {
        const track = video.videoTracks[0];
        const isHEVC = track.label?.toLowerCase().includes('hevc') || 
                       track.label?.toLowerCase().includes('h.265');
        URL.revokeObjectURL(url);
        resolve(isHEVC);
      } else {
        const isLikelyiOS = type === 'video/quicktime' || name.endsWith('.mov');
        URL.revokeObjectURL(url);
        resolve(isLikelyiOS);
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(true);
    };

    video.src = url;
  });
};

/**
 * Convert video to mp4 format
 */
export const convertToMp4 = async (file, onProgress = () => {}) => {
  try {
    console.log('🔄 Starting video conversion to mp4...');
    onProgress(0);

    const { fetchFile } = await loadFFmpegDeps();
    const ffmpeg = await getFFmpeg();
    
    ffmpeg.on('progress', ({ progress }) => {
      const percent = Math.round(progress * 100);
      onProgress(percent);
    });

    const inputName = 'input' + (getSafeFileName(file).match(/\.[^.]+$/) || ['.mov'])[0];
    const outputName = 'output.mp4';
    
    await ffmpeg.writeFile(inputName, await fetchFile(file));
    onProgress(10);

    await ffmpeg.exec([
      '-i', inputName,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      outputName
    ]);

    onProgress(90);

    const data = await ffmpeg.readFile(outputName);
    const blob = new Blob([data.buffer], { type: 'video/mp4' });

    await ffmpeg.deleteFile(inputName);
    await ffmpeg.deleteFile(outputName);

    onProgress(100);
    console.log('✅ Video conversion completed');
    
    return blob;
  } catch (error) {
    console.error('❌ Video conversion failed:', error);
    throw new Error(`Video conversion failed: ${error.message}`);
  }
};

/**
 * Process video file
 */
export const processVideo = async (file, onProgress = () => {}) => {
  const needsConv = await needsVideoConversion(file);
  
  if (needsConv) {
    console.log('🔄 Video requires conversion, starting...');
    const convertedBlob = await convertToMp4(file, onProgress);
    return { blob: convertedBlob, converted: true };
  } else {
    console.log('✅ Video format is compatible, no conversion needed');
    onProgress(100);
    return { blob: file, converted: false };
  }
};

// Keep old export for backward compatibility
export const needsConversion = needsVideoConversion;

// ==================== Image Processing ====================

/**
 * Check if image needs conversion (HEIC/HEIF)
 */
export const needsImageConversion = (file) => {
  const name = getSafeFileName(file).toLowerCase();
  const type = getSafeFileType(file).toLowerCase();
  return name.endsWith('.heic') || name.endsWith('.heif') || 
         type === 'image/heic' || type === 'image/heif' ||
         type === 'image/heic-sequence' || type === 'image/heif-sequence' ||
         type.includes('heic') || type.includes('heif');
};

/**
 * Read EXIF orientation from image
 */
const getExifOrientation = async (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const view = new DataView(e.target.result);
      if (view.getUint16(0, false) !== 0xFFD8) {
        resolve(1); // Not a JPEG
        return;
      }
      
      let offset = 2;
      while (offset < view.byteLength) {
        if (view.getUint16(offset, false) === 0xFFE1) {
          const exifLength = view.getUint16(offset + 2, false);
          const exifData = new DataView(e.target.result, offset + 4, exifLength - 2);
          
          // Check for "Exif" marker
          if (exifData.getUint32(0, false) !== 0x45786966) {
            resolve(1);
            return;
          }
          
          // Find orientation tag
          const tiffOffset = 6;
          const littleEndian = exifData.getUint16(tiffOffset, false) === 0x4949;
          const ifdOffset = exifData.getUint32(tiffOffset + 4, littleEndian);
          const numEntries = exifData.getUint16(tiffOffset + ifdOffset, littleEndian);
          
          for (let i = 0; i < numEntries; i++) {
            const entryOffset = tiffOffset + ifdOffset + 2 + (i * 12);
            if (exifData.getUint16(entryOffset, littleEndian) === 0x0112) {
              resolve(exifData.getUint16(entryOffset + 8, littleEndian));
              return;
            }
          }
          resolve(1);
          return;
        }
        offset += 2 + view.getUint16(offset + 2, false);
      }
      resolve(1);
    };
    reader.onerror = () => resolve(1);
    reader.readAsArrayBuffer(file.slice(0, 65536)); // Read first 64KB for EXIF
  });
};

/**
 * Apply EXIF orientation correction to canvas
 */
const applyOrientation = (canvas, ctx, orientation, width, height) => {
  switch (orientation) {
    case 2: ctx.transform(-1, 0, 0, 1, width, 0); break;
    case 3: ctx.transform(-1, 0, 0, -1, width, height); break;
    case 4: ctx.transform(1, 0, 0, -1, 0, height); break;
    case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
    case 6: ctx.transform(0, 1, -1, 0, height, 0); break;
    case 7: ctx.transform(0, -1, -1, 0, height, width); break;
    case 8: ctx.transform(0, -1, 1, 0, 0, width); break;
    default: break;
  }
};

/**
 * Compress and resize image
 * @param {File|Blob} file - Input image
 * @param {Object} options - Compression options
 * @returns {Promise<Blob>} - Compressed JPEG blob
 */
export const compressImage = async (file, options = {}) => {
  const {
    maxWidth = 2048,
    maxHeight = 2048,
    maxSizeMB = 5,
    quality = 0.85,
    onProgress = () => {}
  } = options;

  return new Promise((resolve, reject) => {
    onProgress(10);
    
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    img.onload = async () => {
      try {
        onProgress(30);
        
        // Get EXIF orientation
        const orientation = await getExifOrientation(file);
        
        // Calculate new dimensions
        let { width, height } = img;
        const needsRotation = orientation >= 5 && orientation <= 8;
        
        if (needsRotation) {
          [width, height] = [height, width];
        }
        
        // Scale down if needed
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        
        onProgress(50);
        
        // Create canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (needsRotation) {
          canvas.width = height;
          canvas.height = width;
        } else {
          canvas.width = width;
          canvas.height = height;
        }
        
        // Apply orientation correction
        applyOrientation(canvas, ctx, orientation, width, height);
        
        // Draw image
        if (needsRotation) {
          ctx.drawImage(img, 0, 0, height, width);
        } else {
          ctx.drawImage(img, 0, 0, width, height);
        }
        
        onProgress(70);
        
        // Convert to blob with quality adjustment
        let currentQuality = quality;
        let blob;
        
        do {
          blob = await new Promise(res => {
            canvas.toBlob(res, 'image/jpeg', currentQuality);
          });
          
          if (blob.size > maxSizeMB * 1024 * 1024) {
            currentQuality -= 0.1;
          }
        } while (blob.size > maxSizeMB * 1024 * 1024 && currentQuality > 0.3);
        
        onProgress(100);
        URL.revokeObjectURL(url);
        
        console.log(`✅ Image compressed: ${(file.size / 1024 / 1024).toFixed(2)}MB → ${(blob.size / 1024 / 1024).toFixed(2)}MB`);
        resolve(blob);
        
      } catch (error) {
        URL.revokeObjectURL(url);
        reject(error);
      }
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    
    img.src = url;
  });
};

/**
 * Convert HEIC to JPEG using heic2any library
 */
export const convertHeicToJpeg = async (file, onProgress = () => {}, options = {}) => {
  const { silent = false } = options;
  try {
    onProgress(10);
    
    // Dynamic import of heic2any
    const heic2any = (await import('heic2any')).default;
    
    onProgress(30);
    
    const blob = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.9
    });
    
    onProgress(70);
    
    // Compress the converted image
    const compressed = await compressImage(blob, { onProgress: (p) => onProgress(70 + p * 0.3) });
    
    if (!silent) {
      console.log('✅ HEIC converted to JPEG');
    }
    return compressed;
    
  } catch (error) {
    if (!silent) {
      console.warn('⚠️ HEIC conversion failed:', error);
    }
    throw new Error(`HEIC conversion failed: ${error.message}`);
  }
};

const OCR_IMAGE_OPTIONS = {
  maxWidth: 1600,
  maxHeight: 1600,
  maxSizeMB: 1.6,
  quality: 0.82,
};

/**
 * Process ID/OCR images with a lighter profile than general media uploads.
 * It keeps enough text detail for OCR while reducing mobile CPU and upload cost.
 */
export const processOcrImage = async (file, onProgress = () => {}, options = {}) => {
  const { silent = false } = options;
  try {
    const needsConv = needsImageConversion(file);

    if (needsConv) {
      if (!silent) {
        console.log('🔄 OCR HEIC image requires conversion...');
      }

      onProgress(10);
      const heic2any = (await import('heic2any')).default;
      onProgress(30);

      const jpegBlob = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: 0.86,
      });
      onProgress(60);

      const compressed = await compressImage(jpegBlob, {
        ...OCR_IMAGE_OPTIONS,
        onProgress: (progress) => onProgress(60 + progress * 0.4),
      });

      return { blob: compressed, converted: true, profile: 'ocr' };
    }

    if (!silent) {
      console.log('🔄 Processing OCR image (fast resize + compression)...');
    }

    const processedBlob = await compressImage(file, {
      ...OCR_IMAGE_OPTIONS,
      onProgress,
    });

    return { blob: processedBlob, converted: false, profile: 'ocr' };
  } catch (error) {
    if (!silent) {
      console.warn('⚠️ OCR image processing failed:', error);
    }
    throw error;
  }
};

/**
 * Process image file: convert HEIC if needed, compress, fix orientation
 * @param {File} file - Input image file
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<{blob: Blob, converted: boolean}>}
 */
export const processImage = async (file, onProgress = () => {}, options = {}) => {
  const { silent = false } = options;
  try {
    const needsConv = needsImageConversion(file);
    
    if (needsConv) {
      if (!silent) {
        console.log('🔄 HEIC image requires conversion...');
      }
      const convertedBlob = await convertHeicToJpeg(file, onProgress, { silent });
      return { blob: convertedBlob, converted: true };
    } else {
      if (!silent) {
        console.log('🔄 Processing image (compression + orientation)...');
      }
      const processedBlob = await compressImage(file, { onProgress });
      return { blob: processedBlob, converted: false };
    }
  } catch (error) {
    if (!silent) {
      console.warn('⚠️ Image processing failed:', error);
    }
    throw error;
  }
};

/**
 * Create thumbnail from image or video
 * @param {Blob} blob - Media blob
 * @param {string} type - 'image' or 'video'
 * @param {number} size - Thumbnail size (default 200px)
 * @returns {Promise<string>} - Data URL of thumbnail
 */
export const createThumbnail = async (blob, type, size = 200) => {
  return new Promise((resolve, reject) => {
    if (type === 'image') {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        const ratio = Math.min(size / img.width, size / img.height);
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;
        
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to create image thumbnail'));
      };
      
      img.src = url;
    } else {
      const video = document.createElement('video');
      const url = URL.createObjectURL(blob);
      
      video.onloadeddata = () => {
        video.currentTime = 0.5; // Seek to 0.5s for thumbnail
      };
      
      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        const ratio = Math.min(size / video.videoWidth, size / video.videoHeight);
        canvas.width = video.videoWidth * ratio;
        canvas.height = video.videoHeight * ratio;
        
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      
      video.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to create video thumbnail'));
      };
      
      video.src = url;
    }
  });
};

/**
 * Detect media type from file
 */
export const getMediaType = (file) => {
  const type = (getSafeFileType(file) || inferTypeFromName(getSafeFileName(file))).toLowerCase();
  const name = getSafeFileName(file).toLowerCase();
  
  if (type.startsWith('image/') || 
      name.endsWith('.jpg') || name.endsWith('.jpeg') || 
      name.endsWith('.png') || name.endsWith('.gif') ||
      name.endsWith('.heic') || name.endsWith('.heif') ||
      name.endsWith('.webp')) {
    return 'image';
  }
  
  if (type.startsWith('video/') || 
      name.endsWith('.mp4') || name.endsWith('.mov') ||
      name.endsWith('.m4v') || name.endsWith('.webm') ||
      name.endsWith('.avi')) {
    return 'video';
  }
  
  return 'unknown';
};

/**
 * Process any media file (image or video)
 */
export const processMedia = async (file, onProgress = () => {}) => {
  const mediaType = getMediaType(file);
  
  if (mediaType === 'image') {
    return { ...await processImage(file, onProgress), mediaType: 'image' };
  } else if (mediaType === 'video') {
    return { ...await processVideo(file, onProgress), mediaType: 'video' };
  } else {
    throw new Error(`Unsupported media type: ${getSafeFileType(file) || getSafeFileName(file) || 'unknown'}`);
  }
};
