/**
 * Generate thumbnail from video blob safely
 * @param {Blob} videoBlob - Video blob to generate thumbnail from
 * @returns {Promise<string>} - Data URL of the thumbnail
 */
async function generateThumbnail(videoBlob) {
  return new Promise((resolve, reject) => {
    try {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }

      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;

      video.onloadeddata = () => {
        try {
          video.currentTime = 0.1;
        } catch (error) {
          reject(error);
        }
      };

      video.onseeked = () => {
        try {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          canvas.toBlob((blob) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              URL.revokeObjectURL(video.src);
              resolve(reader.result);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          }, 'image/jpeg', 0.7);
        } catch (error) {
          URL.revokeObjectURL(video.src);
          reject(error);
        }
      };

      video.onerror = (e) => {
        URL.revokeObjectURL(video.src);
        reject(new Error('Failed to load video for thumbnail'));
      };

      video.src = URL.createObjectURL(videoBlob);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Generate thumbnail safely from video URL with proper error handling
 * @param {string} videoUrl - URL of the video (blob URL or public URL)
 * @param {string} thumbnailPath - Storage path for the thumbnail
 * @returns {Promise<string|null>} - Public URL of the uploaded thumbnail or null if failed
 */
export async function generateThumbnailSafe(videoUrl, thumbnailPath) {
  try {
    console.log('🖼️ Generating thumbnail for:', videoUrl);
    const { supabase } = await import('../lib/supabase');
    
    // Add a timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    // Create video element
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    
    // Wait for video to load metadata
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = reject;
      
      // Add timeout for metadata loading
      setTimeout(() => reject(new Error('Video metadata loading timeout')), 5000);
      
      video.src = videoUrl;
      video.load();
    });
    
    clearTimeout(timeoutId);
    
    // Seek to a specific time (1 second or 10% of duration)
    video.currentTime = Math.min(1, video.duration * 0.1);
    
    // Wait for video to be seeked
    await new Promise((resolve, reject) => {
      video.onseeked = resolve;
      video.onerror = reject;
      setTimeout(() => reject(new Error('Video seeking timeout')), 5000);
    });
    
    // Create canvas for thumbnail
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;
    
    // Draw video frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Convert to blob
    const blob = await new Promise(resolve => 
      canvas.toBlob(resolve, 'image/jpeg', 0.8)
    );
    
    // Upload thumbnail to storage
    const { error: uploadError } = await supabase.storage
      .from('rental-videos')
      .upload(thumbnailPath, blob, {
        contentType: 'image/jpeg',
        upsert: true
      });
    
    if (uploadError) {
      console.warn('⚠️ Thumbnail upload failed:', uploadError);
      return null;
    }
    
    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('rental-videos')
      .getPublicUrl(thumbnailPath);
    
    console.log('✅ Thumbnail generated:', publicUrl);
    return publicUrl;
    
  } catch (error) {
    console.warn('⚠️ Thumbnail generation failed (non-critical):', error.message);
    
    // Fallback: Upload a generic placeholder image
    try {
      const { supabase } = await import('../lib/supabase');
      
      // Create a simple colored placeholder
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(0, 0, 320, 240);
      ctx.fillStyle = 'white';
      ctx.font = '20px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('VIDEO', 160, 120);
      
      const blob = await new Promise(resolve => 
        canvas.toBlob(resolve, 'image/jpeg', 0.8)
      );
      
      const { error: uploadError } = await supabase.storage
        .from('rental-videos')
        .upload(thumbnailPath, blob, {
          contentType: 'image/jpeg',
          upsert: true
        });
      
      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage
          .from('rental-videos')
          .getPublicUrl(thumbnailPath);
        console.log('✅ Fallback thumbnail uploaded:', publicUrl);
        return publicUrl;
      }
    } catch (fallbackError) {
      console.warn('⚠️ Fallback thumbnail also failed:', fallbackError);
    }
    
    return null; // Return null if all thumbnail attempts fail
  }
}

export async function uploadWithRetry(
  supabase,
  bucketName,
  filePath,
  fileBlob,
  maxRetries = 3,
  onProgress,
  isProcessingThumbnail,
  setIsProcessingThumbnail
) {
  console.log(`📤 Upload attempt 1/${maxRetries}`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(filePath, fileBlob, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) throw error;

      const { data: publicUrlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(filePath);

      console.log('✅ Upload successful:', publicUrlData.publicUrl);

      // Generate thumbnail with debouncing
      if (!isProcessingThumbnail) {
        setIsProcessingThumbnail(true);
        console.log('🖼️ Generating thumbnail...');
        
        try {
          const thumbnail = await generateThumbnail(fileBlob);
          console.log('✅ Thumbnail generated:', thumbnail.substring(0, 100) + '...');
          setIsProcessingThumbnail(false);
          
          // Safe URL revocation after successful upload
          if (fileBlob.url) {
            URL.revokeObjectURL(fileBlob.url);
            console.log('🗑️ Blob URL revoked safely after upload');
          }
          
          return { url: publicUrlData.publicUrl, thumbnail };
        } catch (thumbError) {
          console.error('❌ Thumbnail generation failed:', thumbError);
          setIsProcessingThumbnail(false);
          
          // Still revoke URL even if thumbnail fails
          if (fileBlob.url) {
            URL.revokeObjectURL(fileBlob.url);
          }
          
          return { url: publicUrlData.publicUrl, thumbnail: null };
        }
      } else {
        console.log('⏭️ Skipping duplicate thumbnail generation');
        return { url: publicUrlData.publicUrl, thumbnail: null };
      }

    } catch (error) {
      console.error(`❌ Upload attempt ${attempt} failed:`, error.message);

      if (attempt === maxRetries) {
        throw new Error(`Upload failed after ${maxRetries} attempts: ${error.message}`);
      }

      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}