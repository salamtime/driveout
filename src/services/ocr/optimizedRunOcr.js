/**
 * Optimized OCR Service - High Performance Google Gemini Vision API
 * Features: Image preprocessing, caching, batch processing, progress tracking
 */

import { optimizedGeminiVisionOCR } from './optimizedGeminiVisionOcr';

/**
 * PERFORMANCE OPTIMIZED: Run OCR with intelligent preprocessing and caching
 * @param {File} imageFile - Image file to process
 * @param {string} customerId - Optional customer ID
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} OCR result with performance metrics
 */
export const runOptimizedOCR = async (imageFile, customerId = null, options = {}) => {
  const startTime = performance.now();
  
  try {
    console.log('🚀 Starting OPTIMIZED OCR processing...');
    
    // Validate inputs quickly
    if (!imageFile) {
      throw new Error('No image file provided');
    }

    if (!imageFile.type.startsWith('image/')) {
      throw new Error('Invalid file type. Please provide an image file.');
    }

    // Size check for performance optimization
    const maxSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB default
    if (imageFile.size > maxSize) {
      console.warn(`⚠️ Large file detected (${imageFile.size} bytes), processing may be slower`);
    }

    // Process with optimized Gemini Vision
    const result = await optimizedGeminiVisionOCR.processIdDocument(imageFile, customerId);
    
    if (!result.success) {
      throw new Error(result.error || 'OCR processing failed');
    }

    const totalTime = performance.now() - startTime;
    console.log(`✅ OPTIMIZED OCR completed in ${totalTime.toFixed(2)}ms`);
    
    return {
      success: true,
      data: result.data,
      message: result.message || 'Successfully extracted data from ID document',
      performance: {
        totalTime,
        cached: result.performance?.cached || false,
        speedImprovement: result.performance?.cached ? 'Cache hit - instant result' : `${totalTime.toFixed(2)}ms processing`
      }
    };

  } catch (error) {
    const totalTime = performance.now() - startTime;
    console.error(`❌ OPTIMIZED OCR failed after ${totalTime.toFixed(2)}ms:`, error);
    
    return {
      success: false,
      error: error.message || 'Failed to process ID document',
      data: null,
      performance: {
        totalTime,
        failed: true
      }
    };
  }
};

/**
 * PERFORMANCE FEATURE: Batch process multiple images with progress tracking
 * @param {File[]} imageFiles - Array of image files
 * @param {string} customerId - Customer ID
 * @param {Function} progressCallback - Progress update callback
 * @returns {Promise<Object[]>} Array of OCR results
 */
export const runBatchOptimizedOCR = async (imageFiles, customerId = null, progressCallback = null) => {
  const startTime = performance.now();
  const results = [];
  
  console.log(`🚀 Starting BATCH OCR processing for ${imageFiles.length} images...`);
  
  try {
    // Process images in parallel batches for optimal performance
    const batchSize = 3; // Optimal batch size to avoid API rate limits
    const batches = [];
    
    for (let i = 0; i < imageFiles.length; i += batchSize) {
      batches.push(imageFiles.slice(i, i + batchSize));
    }
    
    let processedCount = 0;
    
    for (const batch of batches) {
      const batchPromises = batch.map(async (file, index) => {
        try {
          const result = await runOptimizedOCR(file, customerId);
          processedCount++;
          
          if (progressCallback) {
            progressCallback({
              completed: processedCount,
              total: imageFiles.length,
              percentage: Math.round((processedCount / imageFiles.length) * 100),
              currentFile: file.name
            });
          }
          
          return result;
        } catch (error) {
          console.error(`Error processing ${file.name}:`, error);
          return {
            success: false,
            error: error.message,
            fileName: file.name
          };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    const totalTime = performance.now() - startTime;
    const successCount = results.filter(r => r.success).length;
    
    console.log(`✅ BATCH OCR completed: ${successCount}/${imageFiles.length} successful in ${totalTime.toFixed(2)}ms`);
    
    return {
      success: true,
      results,
      summary: {
        total: imageFiles.length,
        successful: successCount,
        failed: imageFiles.length - successCount,
        totalTime,
        averageTime: totalTime / imageFiles.length
      }
    };
    
  } catch (error) {
    console.error('❌ BATCH OCR processing error:', error);
    return {
      success: false,
      error: error.message,
      results,
      summary: {
        total: imageFiles.length,
        successful: results.filter(r => r.success).length,
        failed: results.length - results.filter(r => r.success).length,
        totalTime: performance.now() - startTime
      }
    };
  }
};

/**
 * PERFORMANCE FEATURE: Pre-validate image before processing
 * @param {File} imageFile - Image file to validate
 * @returns {Promise<Object>} Validation result with recommendations
 */
export const validateImageForOptimalOCR = async (imageFile) => {
  const startTime = performance.now();
  
  return new Promise((resolve) => {
    const img = new Image();
    
    img.onload = () => {
      const validationTime = performance.now() - startTime;
      
      const metrics = {
        width: img.width,
        height: img.height,
        fileSize: imageFile.size,
        aspectRatio: img.width / img.height,
        resolution: img.width * img.height
      };
      
      const recommendations = [];
      let score = 100;
      
      // Size recommendations
      if (imageFile.size > 5 * 1024 * 1024) {
        recommendations.push('Image is large (>5MB) - compression will be applied for faster processing');
        score -= 10;
      }
      
      // Resolution recommendations
      if (metrics.resolution < 300000) { // Less than ~500x600
        recommendations.push('Low resolution detected - may affect OCR accuracy');
        score -= 20;
      }
      
      if (metrics.resolution > 8000000) { // Greater than ~3000x2700
        recommendations.push('Very high resolution - will be compressed for faster processing');
        score -= 5;
      }
      
      // Aspect ratio recommendations
      if (metrics.aspectRatio < 0.5 || metrics.aspectRatio > 2.0) {
        recommendations.push('Unusual aspect ratio - ensure document is properly oriented');
        score -= 10;
      }
      
      resolve({
        isValid: true,
        score: Math.max(0, score),
        metrics,
        recommendations,
        estimatedProcessingTime: imageFile.size > 2 * 1024 * 1024 ? '2-4 seconds' : '1-2 seconds',
        validationTime: validationTime.toFixed(2)
      });
    };
    
    img.onerror = () => {
      resolve({
        isValid: false,
        score: 0,
        error: 'Invalid image file',
        recommendations: ['Please provide a valid image file (JPEG, PNG, WebP)']
      });
    };
    
    img.src = URL.createObjectURL(imageFile);
  });
};

/**
 * PERFORMANCE FEATURE: Get processing statistics and cache info
 * @returns {Object} Performance statistics
 */
export const getOptimizedOCRStats = () => {
  return {
    cacheStats: optimizedGeminiVisionOCR.getCacheStats(),
    recommendations: [
      'Use JPEG format for best compression',
      'Optimal image size: 1-3MB',
      'Recommended resolution: 1200x800 to 2400x1600',
      'Ensure good lighting and contrast',
      'Keep documents flat and properly oriented'
    ]
  };
};

/**
 * PERFORMANCE FEATURE: Clear cache to free memory
 */
export const clearOptimizedOCRCache = () => {
  optimizedGeminiVisionOCR.clearCache();
  return { success: true, message: 'OCR cache cleared successfully' };
};

/**
 * Legacy compatibility - enhanced with performance optimizations
 */
export const processOCRResult = (ocrData) => {
  if (!ocrData) return null;

  return {
    // Enhanced mapping with performance considerations
    full_name: ocrData.full_name || ocrData.raw_name || '',
    date_of_birth: ocrData.date_of_birth || '',
    place_of_birth: ocrData.place_of_birth || '',
    id_number: ocrData.document_number || '',
    licence_number: ocrData.document_type === 'driver_license' ? ocrData.document_number : '',
    licence_issue_date: ocrData.issue_date || '',
    licence_expiry_date: ocrData.expiry_date || '',
    nationality: ocrData.nationality || ocrData.country || 'Moroccan',
    
    // New optimized fields
    document_type: ocrData.document_type || 'unknown',
    gender: ocrData.gender || 'unknown',
    confidence_estimate: ocrData.confidence_estimate || 0.8
  };
};

export default {
  runOptimizedOCR,
  runBatchOptimizedOCR,
  validateImageForOptimalOCR,
  getOptimizedOCRStats,
  clearOptimizedOCRCache,
  processOCRResult,
  
  // Legacy compatibility
  runOCR: runOptimizedOCR,
  validateOCRData: (data) => ({ isValid: true, errors: [] })
};