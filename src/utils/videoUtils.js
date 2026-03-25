/**
 * Video Utilities for Mobile Compatibility and Format Handling
 * Enhanced with robust error handling and network validation
 */

// Supported video formats and their MIME types
export const VIDEO_FORMATS = {
  webm: 'video/webm',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska'
};

// Mobile browser detection with enhanced safety
export const isMobileDevice = () => {
  if (typeof navigator === 'undefined') return false;
  try {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  } catch (error) {
    console.warn('Error detecting mobile device:', error);
    return false;
  }
};

// iOS Safari detection
export const isIOSSafari = () => {
  if (typeof navigator === 'undefined') return false;
  try {
    const ua = navigator.userAgent;
    return /iPad|iPhone|iPod/.test(ua) && /Safari/.test(ua) && !/Chrome/.test(ua);
  } catch (error) {
    console.warn('Error detecting iOS Safari:', error);
    return false;
  }
};

// Android Chrome detection
export const isAndroidChrome = () => {
  if (typeof navigator === 'undefined') return false;
  try {
    const ua = navigator.userAgent;
    return /Android/.test(ua) && /Chrome/.test(ua);
  } catch (error) {
    console.warn('Error detecting Android Chrome:', error);
    return false;
  }
};

/**
 * Validate video URL accessibility
 * @param {string} url - Video URL to validate
 * @returns {Promise<boolean>} - True if URL is accessible
 */
export const validateVideoUrl = async (url) => {
  if (!url || typeof url !== 'string') {
    console.warn('Invalid video URL provided:', url);
    return false;
  }

  try {
    // Check if URL is properly formatted
    new URL(url);
    
    // Try to fetch the video with HEAD request to check accessibility
    const response = await fetch(url, {
      method: 'HEAD',
      mode: 'cors',
      cache: 'no-cache'
    });
    
    return response.ok;
  } catch (error) {
    console.warn('Video URL validation failed:', url, error);
    return false;
  }
};

/**
 * Check network connectivity
 * @returns {Promise<boolean>} - True if network is available
 */
export const checkNetworkConnectivity = async () => {
  if (typeof navigator === 'undefined') return true;
  
  try {
    // Check navigator.onLine first
    if (!navigator.onLine) {
      return false;
    }
    
    // Try to fetch a small resource to verify actual connectivity
    const response = await fetch('/favicon.ico', {
      method: 'HEAD',
      cache: 'no-cache',
      timeout: 5000
    });
    
    return response.ok;
  } catch (error) {
    console.warn('Network connectivity check failed:', error);
    return false;
  }
};

/**
 * Check if browser supports a specific video format with enhanced validation
 * @param {string} format - Video format (webm, mp4, mov, etc.)
 * @returns {boolean} - True if format is supported
 */
export const canPlayFormat = (format) => {
  if (typeof document === 'undefined') return false;
  
  try {
    const video = document.createElement('video');
    const mimeType = VIDEO_FORMATS[format.toLowerCase()];
    
    if (!mimeType) {
      console.warn('Unknown video format:', format);
      return false;
    }
    
    const support = video.canPlayType(mimeType);
    const isSupported = support === 'probably' || support === 'maybe';
    
    console.log(`Format ${format} support:`, support, isSupported);
    return isSupported;
  } catch (error) {
    console.warn('Error checking video format support:', error);
    return false;
  }
};

/**
 * Get the best supported video format for current browser
 * @returns {string} - Best supported format
 */
export const getBestSupportedFormat = () => {
  try {
    // iOS Safari prefers MP4
    if (isIOSSafari()) {
      return canPlayFormat('mp4') ? 'mp4' : 'mov';
    }
    
    // Android Chrome supports WebM well
    if (isAndroidChrome()) {
      return canPlayFormat('webm') ? 'webm' : 'mp4';
    }
    
    // Desktop browsers - prefer WebM for quality, fallback to MP4
    if (canPlayFormat('webm')) return 'webm';
    if (canPlayFormat('mp4')) return 'mp4';
    if (canPlayFormat('mov')) return 'mov';
    
    return 'mp4'; // Universal fallback
  } catch (error) {
    console.warn('Error determining best video format:', error);
    return 'mp4';
  }
};

/**
 * Get all supported formats in order of preference
 * @returns {Array} - Array of supported formats
 */
export const getSupportedFormats = () => {
  try {
    const formats = [];
    
    // Check all formats and add supported ones
    Object.keys(VIDEO_FORMATS).forEach(format => {
      if (canPlayFormat(format)) {
        formats.push(format);
      }
    });
    
    // Sort by preference (iOS prefers MP4, others prefer WebM)
    if (isIOSSafari()) {
      return formats.sort((a, b) => {
        if (a === 'mp4') return -1;
        if (b === 'mp4') return 1;
        return 0;
      });
    }
    
    return formats.sort((a, b) => {
      if (a === 'webm') return -1;
      if (b === 'webm') return 1;
      if (a === 'mp4') return -1;
      if (b === 'mp4') return 1;
      return 0;
    });
  } catch (error) {
    console.warn('Error getting supported formats:', error);
    return ['mp4']; // Safe fallback
  }
};

/**
 * Extract video format from URL with enhanced validation
 * @param {string} url - Video URL
 * @returns {string} - Video format
 */
export const getVideoFormat = (url) => {
  if (!url || typeof url !== 'string') {
    console.warn('Invalid URL provided to getVideoFormat:', url);
    return 'unknown';
  }
  
  try {
    // Handle URLs with query parameters and fragments
    const urlObj = new URL(url, window.location.origin);
    const pathname = urlObj.pathname;
    const extension = pathname.split('.').pop().toLowerCase();
    
    const format = Object.keys(VIDEO_FORMATS).includes(extension) ? extension : 'unknown';
    console.log(`Detected format for ${url}:`, format);
    return format;
  } catch (error) {
    console.warn('Error parsing video format from URL:', url, error);
    // Fallback to simple extension extraction
    try {
      const extension = url.split('.').pop().toLowerCase().split('?')[0];
      return Object.keys(VIDEO_FORMATS).includes(extension) ? extension : 'unknown';
    } catch (fallbackError) {
      console.warn('Fallback format extraction failed:', fallbackError);
      return 'unknown';
    }
  }
};

/**
 * Generate fallback video sources with enhanced error handling
 * @param {string} originalUrl - Original video URL
 * @returns {Promise<Array>} - Array of validated video sources
 */
export const generateVideoSources = async (originalUrl) => {
  if (!originalUrl || typeof originalUrl !== 'string') {
    console.warn('Invalid original URL provided:', originalUrl);
    return [];
  }
  
  try {
    const sources = [];
    const originalFormat = getVideoFormat(originalUrl);
    
    // Add original source first
    sources.push({
      src: originalUrl,
      type: VIDEO_FORMATS[originalFormat] || 'video/mp4',
      format: originalFormat,
      priority: 1
    });
    
    // Generate fallback URLs based on browser capabilities
    const supportedFormats = getSupportedFormats();
    const baseName = originalUrl.replace(/\.[^/.]+$/, '');
    
    supportedFormats.forEach((format, index) => {
      if (format !== originalFormat) {
        sources.push({
          src: `${baseName}.${format}`,
          type: VIDEO_FORMATS[format],
          format: format,
          priority: index + 2
        });
      }
    });
    
    // Validate sources (optional - can be expensive)
    console.log('Generated video sources:', sources);
    return sources;
  } catch (error) {
    console.warn('Error generating video sources:', error);
    return [{
      src: originalUrl,
      type: 'video/mp4',
      format: 'mp4',
      priority: 1
    }];
  }
};

/**
 * Enhanced network quality detection
 * @returns {string} - Connection quality (fast, slow, offline)
 */
export const getNetworkQuality = () => {
  if (typeof navigator === 'undefined') return 'fast';
  
  try {
    if (!navigator.onLine) return 'offline';
    
    if (navigator.connection) {
      const connection = navigator.connection;
      const effectiveType = connection.effectiveType;
      const downlink = connection.downlink;
      
      // Use downlink speed if available
      if (downlink !== undefined) {
        if (downlink >= 1.5) return 'fast';
        if (downlink >= 0.5) return 'medium';
        return 'slow';
      }
      
      // Fallback to effective type
      if (effectiveType === '4g') return 'fast';
      if (effectiveType === '3g') return 'medium';
      if (effectiveType === '2g' || effectiveType === 'slow-2g') return 'slow';
    }
    
    return 'fast'; // Default to fast if unknown
  } catch (error) {
    console.warn('Error checking network quality:', error);
    return 'fast';
  }
};

/**
 * Retry mechanism for failed operations
 * @param {Function} operation - Operation to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} delay - Delay between retries in ms
 * @returns {Promise} - Result of successful operation
 */
export const retryOperation = async (operation, maxRetries = 3, delay = 1000) => {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempt ${attempt}/${maxRetries}`);
      const result = await operation();
      console.log(`Operation succeeded on attempt ${attempt}`);
      return result;
    } catch (error) {
      lastError = error;
      console.warn(`Attempt ${attempt} failed:`, error.message);
      
      if (attempt < maxRetries) {
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 1.5; // Exponential backoff
      }
    }
  }
  
  throw new Error(`Operation failed after ${maxRetries} attempts. Last error: ${lastError.message}`);
};

/**
 * Load video with enhanced error handling and retry logic
 * @param {string} videoUrl - Video URL to load
 * @param {HTMLVideoElement} videoElement - Video element to load into
 * @returns {Promise<void>}
 */
export const loadVideoWithRetry = async (videoUrl, videoElement) => {
  if (!videoUrl || !videoElement) {
    throw new Error('Invalid video URL or element provided');
  }
  
  // Check network connectivity first
  const isConnected = await checkNetworkConnectivity();
  if (!isConnected) {
    throw new Error('No network connection available');
  }
  
  // Validate video URL
  const isValidUrl = await validateVideoUrl(videoUrl);
  if (!isValidUrl) {
    console.warn('Video URL validation failed, proceeding anyway:', videoUrl);
  }
  
  return retryOperation(async () => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Video load timeout after 30 seconds'));
      }, 30000);
      
      const cleanup = () => {
        clearTimeout(timeout);
        videoElement.removeEventListener('loadedmetadata', onLoad);
        videoElement.removeEventListener('error', onError);
      };
      
      const onLoad = () => {
        cleanup();
        console.log('Video loaded successfully:', videoUrl);
        resolve();
      };
      
      const onError = (error) => {
        cleanup();
        console.error('Video load error:', error);
        reject(new Error(`Failed to load video: ${error.message || 'Unknown error'}`));
      };
      
      videoElement.addEventListener('loadedmetadata', onLoad);
      videoElement.addEventListener('error', onError);
      
      // Configure video element for mobile
      configureMobileVideo(videoElement);
      
      // Set the video source
      videoElement.src = videoUrl;
      videoElement.load();
    });
  }, 3, 2000);
};

/**
 * Format video duration from seconds to MM:SS
 * @param {number} seconds - Duration in seconds
 * @returns {string} - Formatted duration
 */
export const formatDuration = (seconds) => {
  if (!seconds || isNaN(seconds) || seconds < 0) return '--:--';
  
  try {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  } catch (error) {
    console.warn('Error formatting duration:', error);
    return '--:--';
  }
};

/**
 * Format file size in human readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} - Formatted file size
 */
export const formatFileSize = (bytes) => {
  if (!bytes || bytes === 0 || isNaN(bytes)) return 'Unknown size';
  
  try {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  } catch (error) {
    console.warn('Error formatting file size:', error);
    return 'Unknown size';
  }
};

/**
 * Create video thumbnail with enhanced error handling
 * @param {HTMLVideoElement} video - Video element
 * @param {number} time - Time position for thumbnail (seconds)
 * @returns {Promise<string>} - Base64 thumbnail data URL
 */
export const createVideoThumbnail = (video, time = 1) => {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('Document not available'));
      return;
    }
    
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }
      
      const timeout = setTimeout(() => {
        reject(new Error('Thumbnail generation timeout'));
      }, 10000);
      
      const cleanup = () => {
        clearTimeout(timeout);
        video.removeEventListener('loadeddata', onLoadedData);
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('error', onError);
      };
      
      const onLoadedData = () => {
        try {
          canvas.width = video.videoWidth || 320;
          canvas.height = video.videoHeight || 240;
          
          const seekTime = Math.min(time, video.duration * 0.1);
          video.currentTime = seekTime;
        } catch (error) {
          cleanup();
          reject(error);
        }
      };
      
      const onSeeked = () => {
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const thumbnail = canvas.toDataURL('image/jpeg', 0.8);
          
          cleanup();
          resolve(thumbnail);
        } catch (error) {
          cleanup();
          reject(error);
        }
      };
      
      const onError = (error) => {
        cleanup();
        reject(new Error(`Video error during thumbnail generation: ${error.message}`));
      };
      
      video.addEventListener('loadeddata', onLoadedData);
      video.addEventListener('seeked', onSeeked);
      video.addEventListener('error', onError);
      
      // If video is already loaded, trigger immediately
      if (video.readyState >= 2) {
        onLoadedData();
      }
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Check if video conversion is needed
 * @param {string} videoUrl - Video URL
 * @returns {boolean} - True if conversion is needed
 */
export const needsConversion = (videoUrl) => {
  if (!videoUrl) return false;
  
  try {
    const format = getVideoFormat(videoUrl);
    const bestFormat = getBestSupportedFormat();
    
    // If current format is not supported but best format is different
    return !canPlayFormat(format) && format !== bestFormat;
  } catch (error) {
    console.warn('Error checking conversion need:', error);
    return false;
  }
};

/**
 * Get video metadata with enhanced error handling
 * @param {string} videoUrl - Video URL
 * @returns {Promise<Object>} - Video metadata
 */
export const getVideoMetadata = (videoUrl) => {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('Document not available'));
      return;
    }
    
    try {
      const video = document.createElement('video');
      const timeout = setTimeout(() => {
        cleanup();
        resolve({
          duration: 0,
          width: 0,
          height: 0,
          format: getVideoFormat(videoUrl),
          canPlay: false,
          error: 'Metadata load timeout'
        });
      }, 10000);
      
      const cleanup = () => {
        clearTimeout(timeout);
        video.removeEventListener('loadedmetadata', onLoadedMetadata);
        video.removeEventListener('error', onError);
      };
      
      const onLoadedMetadata = () => {
        cleanup();
        resolve({
          duration: video.duration || 0,
          width: video.videoWidth || 0,
          height: video.videoHeight || 0,
          format: getVideoFormat(videoUrl),
          canPlay: canPlayFormat(getVideoFormat(videoUrl))
        });
      };
      
      const onError = (error) => {
        cleanup();
        console.warn('Error loading video metadata:', error);
        resolve({
          duration: 0,
          width: 0,
          height: 0,
          format: getVideoFormat(videoUrl),
          canPlay: false,
          error: error.message || 'Unknown error'
        });
      };
      
      video.addEventListener('loadedmetadata', onLoadedMetadata);
      video.addEventListener('error', onError);
      
      video.src = videoUrl;
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Mobile-specific video element configuration
 * @param {HTMLVideoElement} video - Video element to configure
 */
export const configureMobileVideo = (video) => {
  if (!video || !isMobileDevice()) return;
  
  try {
    // iOS Safari specific attributes
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    
    // Prevent automatic picture-in-picture on iOS
    if (video.disablePictureInPicture !== undefined) {
      video.disablePictureInPicture = true;
    }
    
    // Mobile optimization attributes
    video.preload = 'metadata'; // Don't preload full video on mobile
    video.controls = false; // Use custom controls for better mobile experience
    
    // Add CORS attributes for cross-origin videos
    video.crossOrigin = 'anonymous';
    
    console.log('Mobile video configuration applied');
  } catch (error) {
    console.warn('Error configuring mobile video:', error);
  }
};

/**
 * Handle fullscreen for mobile devices
 * @param {HTMLVideoElement} video - Video element
 * @returns {Promise<void>}
 */
export const enterMobileFullscreen = async (video) => {
  if (!video) return;
  
  try {
    if (video.requestFullscreen) {
      await video.requestFullscreen();
    } else if (video.webkitRequestFullscreen) {
      await video.webkitRequestFullscreen();
    } else if (video.mozRequestFullScreen) {
      await video.mozRequestFullScreen();
    } else if (video.msRequestFullscreen) {
      await video.msRequestFullscreen();
    } else {
      console.warn('Fullscreen not supported on this device');
    }
  } catch (error) {
    console.warn('Fullscreen request failed:', error);
  }
};

/**
 * Exit fullscreen
 * @returns {Promise<void>}
 */
export const exitMobileFullscreen = async () => {
  if (typeof document === 'undefined') return;
  
  try {
    if (document.exitFullscreen) {
      await document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      await document.webkitExitFullscreen();
    } else if (document.mozCancelFullScreen) {
      await document.mozCancelFullScreen();
    } else if (document.msExitFullscreen) {
      await document.msExitFullscreen();
    }
  } catch (error) {
    console.warn('Exit fullscreen failed:', error);
  }
};

export default {
  VIDEO_FORMATS,
  isMobileDevice,
  isIOSSafari,
  isAndroidChrome,
  validateVideoUrl,
  checkNetworkConnectivity,
  canPlayFormat,
  getBestSupportedFormat,
  getSupportedFormats,
  getVideoFormat,
  generateVideoSources,
  getNetworkQuality,
  retryOperation,
  loadVideoWithRetry,
  formatDuration,
  formatFileSize,
  createVideoThumbnail,
  needsConversion,
  getVideoMetadata,
  configureMobileVideo,
  enterMobileFullscreen,
  exitMobileFullscreen
};