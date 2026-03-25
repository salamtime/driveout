/**
 * Optimized Image Preprocessing for OCR
 * Provides fast image compression, quality assessment, and preprocessing
 */

/**
 * PERFORMANCE OPTIMIZED: Fast image compression with quality preservation
 */
export const optimizedImageCompression = async (imageFile, options = {}) => {
  const startTime = performance.now();
  
  const settings = {
    maxWidth: options.maxWidth || 1920,
    maxHeight: options.maxHeight || 1080,
    quality: options.quality || 0.85,
    format: options.format || 'image/jpeg'
  };

  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      try {
        // Calculate optimal dimensions
        const { width: originalWidth, height: originalHeight } = img;
        const aspectRatio = originalWidth / originalHeight;
        
        let targetWidth = originalWidth;
        let targetHeight = originalHeight;
        
        if (originalWidth > settings.maxWidth || originalHeight > settings.maxHeight) {
          if (aspectRatio > 1) {
            targetWidth = Math.min(originalWidth, settings.maxWidth);
            targetHeight = targetWidth / aspectRatio;
          } else {
            targetHeight = Math.min(originalHeight, settings.maxHeight);
            targetWidth = targetHeight * aspectRatio;
          }
        }
        
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        
        // High-quality scaling
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        
        canvas.toBlob((blob) => {
          const compressionTime = performance.now() - startTime;
          const compressionRatio = blob.size / imageFile.size;
          
          console.log(`🚀 Image compression: ${compressionTime.toFixed(2)}ms, ${((1 - compressionRatio) * 100).toFixed(1)}% reduction`);
          
          resolve(new File([blob], imageFile.name, { type: settings.format }));
        }, settings.format, settings.quality);
        
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(imageFile);
  });
};

/**
 * Batch optimize multiple images
 */
export const batchOptimizeImages = async (imageFiles, options = {}) => {
  const results = [];
  
  for (const file of imageFiles) {
    try {
      const optimized = await optimizedImageCompression(file, options);
      results.push({ success: true, file: optimized, originalSize: file.size, newSize: optimized.size });
    } catch (error) {
      results.push({ success: false, error: error.message, fileName: file.name });
    }
  }
  
  return results;
};

/**
 * Quick image quality assessment
 */
export const quickImageAssessment = async (imageFile) => {
  return new Promise((resolve) => {
    const img = new Image();
    
    img.onload = () => {
      const metrics = {
        width: img.width,
        height: img.height,
        fileSize: imageFile.size,
        aspectRatio: img.width / img.height,
        resolution: img.width * img.height
      };
      
      let score = 100;
      const recommendations = [];
      
      // Size checks
      if (imageFile.size > 5 * 1024 * 1024) {
        recommendations.push('Large file size - compression recommended');
        score -= 10;
      }
      
      // Resolution checks
      if (metrics.resolution < 300000) {
        recommendations.push('Low resolution - may affect OCR accuracy');
        score -= 20;
      }
      
      resolve({
        score: Math.max(0, score),
        metrics,
        recommendations,
        isOptimal: score >= 80
      });
    };
    
    img.onerror = () => {
      resolve({
        score: 0,
        error: 'Invalid image file',
        recommendations: ['Please provide a valid image file']
      });
    };
    
    img.src = URL.createObjectURL(imageFile);
  });
};

/**
 * Smart preprocessing with automatic optimization
 */
export const smartPreprocessImage = async (imageFile) => {
  try {
    // Assess image quality first
    const assessment = await quickImageAssessment(imageFile);
    
    if (assessment.score < 60 || imageFile.size > 3 * 1024 * 1024) {
      // Apply compression if needed
      console.log('🔄 Applying smart preprocessing...');
      return await optimizedImageCompression(imageFile);
    }
    
    // Return original if already optimal
    console.log('✅ Image already optimal, no preprocessing needed');
    return imageFile;
    
  } catch (error) {
    console.error('❌ Preprocessing error:', error);
    return imageFile; // Return original on error
  }
};

export default {
  optimizedImageCompression,
  batchOptimizeImages,
  quickImageAssessment,
  smartPreprocessImage
};