/**
 * Generate thumbnail from video URL (works with both blob URLs and public URLs)
 * @param {string} videoUrl - URL of the video (blob URL or public URL)
 * @returns {Promise<Blob>} - Thumbnail image blob
 */
export const generateThumbnailFromBlob = async (videoUrl) => {
  return new Promise((resolve, reject) => {
    try {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }

      video.crossOrigin = 'anonymous';
      video.preload = 'metadata';
      
      video.onloadedmetadata = () => {
        try {
          // Set canvas dimensions
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 360;
          
          // Seek to 1 second or 10% of video duration
          video.currentTime = Math.min(1, video.duration * 0.1);
        } catch (error) {
          reject(error);
        }
      };

      video.onseeked = () => {
        try {
          // Draw video frame to canvas
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          // Convert canvas to blob
          canvas.toBlob((blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to generate thumbnail blob'));
            }
          }, 'image/jpeg', 0.8);
        } catch (error) {
          reject(error);
        }
      };

      video.onerror = (error) => {
        reject(new Error(`Video loading failed: ${error.message || 'Unknown error'}`));
      };

      // Set video source
      video.src = videoUrl;
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Upload thumbnail to Supabase storage
 * @param {Blob} thumbnailBlob - Thumbnail image blob
 * @param {string} path - Storage path for the thumbnail
 * @returns {Promise<string>} - Public URL of the uploaded thumbnail
 */
export const uploadThumbnail = async (thumbnailBlob, path) => {
  const { supabase } = await import('../lib/supabase');
  
  const { data, error } = await supabase.storage
    .from('rental-videos')
    .upload(path, thumbnailBlob, {
      contentType: 'image/jpeg',
      upsert: false
    });

  if (error) {
    throw new Error(`Thumbnail upload failed: ${error.message}`);
  }

  const { data: urlData } = supabase.storage
    .from('rental-videos')
    .getPublicUrl(path);

  return urlData.publicUrl;
};