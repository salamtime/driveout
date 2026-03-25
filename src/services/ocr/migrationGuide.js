/**
 * OCR Performance Migration Guide
 * Provides seamless migration from legacy OCR to optimized OCR services
 */

import { runOptimizedOCR, runBatchOptimizedOCR } from './optimizedRunOcr';
import { optimizedGeminiVisionOCR } from './optimizedGeminiVisionOcr';
import { ocrPerformanceMonitor } from './performanceMonitor';

/**
 * Migration wrapper that provides backward compatibility
 * while enabling performance optimizations
 */
class OCRMigrationWrapper {
  constructor() {
    this.useOptimizedVersion = true;
    this.fallbackToLegacy = true;
    this.performanceTracking = true;
  }

  /**
   * Enhanced runOCR with automatic optimization
   */
  async runOCR(imageFile, customerId = null, options = {}) {
    const sessionId = `ocr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    if (this.performanceTracking) {
      ocrPerformanceMonitor.startSession(sessionId, {
        fileSize: imageFile.size,
        fileName: imageFile.name,
        customerId: customerId,
        optimized: this.useOptimizedVersion
      });
    }

    try {
      let result;
      
      if (this.useOptimizedVersion) {
        // Use optimized version
        const startTime = performance.now();
        result = await runOptimizedOCR(imageFile, customerId, options);
        
        if (this.performanceTracking) {
          ocrPerformanceMonitor.logStep(sessionId, 'optimized_ocr_processing', 
            performance.now() - startTime, {
              fileSize: imageFile.size,
              success: result.success
            });
        }
      } else {
        // Fallback to legacy version
        const { runOCR: legacyRunOCR } = await import('./runOcr');
        result = await legacyRunOCR(imageFile, customerId);
      }

      if (this.performanceTracking) {
        ocrPerformanceMonitor.completeSession(sessionId, result);
      }

      return result;

    } catch (error) {
      console.error('OCR processing error:', error);
      
      // Fallback to legacy if optimized version fails
      if (this.useOptimizedVersion && this.fallbackToLegacy) {
        console.log('🔄 Falling back to legacy OCR...');
        try {
          const { runOCR: legacyRunOCR } = await import('./runOcr');
          const result = await legacyRunOCR(imageFile, customerId);
          
          if (this.performanceTracking) {
            ocrPerformanceMonitor.completeSession(sessionId, { 
              ...result, 
              fallback: true 
            });
          }
          
          return result;
        } catch (fallbackError) {
          console.error('Legacy OCR also failed:', fallbackError);
        }
      }

      if (this.performanceTracking) {
        ocrPerformanceMonitor.completeSession(sessionId, { 
          success: false, 
          error: error.message 
        });
      }

      return {
        success: false,
        error: error.message,
        data: null
      };
    }
  }

  /**
   * Batch processing with performance optimization
   */
  async runBatchOCR(imageFiles, customerId = null, progressCallback = null) {
    if (this.useOptimizedVersion) {
      return await runBatchOptimizedOCR(imageFiles, customerId, progressCallback);
    } else {
      // Legacy batch processing (sequential)
      const results = [];
      for (let i = 0; i < imageFiles.length; i++) {
        const result = await this.runOCR(imageFiles[i], customerId);
        results.push(result);
        
        if (progressCallback) {
          progressCallback({
            completed: i + 1,
            total: imageFiles.length,
            percentage: Math.round(((i + 1) / imageFiles.length) * 100)
          });
        }
      }
      return { success: true, results };
    }
  }

  /**
   * Configuration methods
   */
  enableOptimizations() {
    this.useOptimizedVersion = true;
    console.log('✅ OCR optimizations enabled');
  }

  disableOptimizations() {
    this.useOptimizedVersion = false;
    console.log('⚠️ OCR optimizations disabled - using legacy version');
  }

  enablePerformanceTracking() {
    this.performanceTracking = true;
    console.log('📊 Performance tracking enabled');
  }

  disablePerformanceTracking() {
    this.performanceTracking = false;
    console.log('📊 Performance tracking disabled');
  }

  /**
   * Performance utilities
   */
  getPerformanceReport() {
    return ocrPerformanceMonitor.generateOptimizationReport();
  }

  clearCache() {
    if (this.useOptimizedVersion) {
      optimizedGeminiVisionOCR.clearCache();
    }
  }

  getStats() {
    return ocrPerformanceMonitor.getPerformanceStats();
  }
}

// Create and export singleton
export const ocrMigrationWrapper = new OCRMigrationWrapper();

/**
 * Drop-in replacement for legacy runOCR function
 */
export const runOCR = (imageFile, customerId = null, options = {}) => {
  return ocrMigrationWrapper.runOCR(imageFile, customerId, options);
};

/**
 * Enhanced batch processing
 */
export const runBatchOCR = (imageFiles, customerId = null, progressCallback = null) => {
  return ocrMigrationWrapper.runBatchOCR(imageFiles, customerId, progressCallback);
};

/**
 * Performance and configuration utilities
 */
export const OCRConfig = {
  enableOptimizations: () => ocrMigrationWrapper.enableOptimizations(),
  disableOptimizations: () => ocrMigrationWrapper.disableOptimizations(),
  enablePerformanceTracking: () => ocrMigrationWrapper.enablePerformanceTracking(),
  disablePerformanceTracking: () => ocrMigrationWrapper.disablePerformanceTracking(),
  getPerformanceReport: () => ocrMigrationWrapper.getPerformanceReport(),
  clearCache: () => ocrMigrationWrapper.clearCache(),
  getStats: () => ocrMigrationWrapper.getStats()
};

export default {
  runOCR,
  runBatchOCR,
  OCRConfig,
  ocrMigrationWrapper
};