/**
 * OCR Services Index - Optimized Performance Entry Point with Fallback Support
 * Exports both optimized and legacy OCR services for backward compatibility
 */

// Optimized OCR services (recommended)
export { 
  runOptimizedOCR,
  runBatchOptimizedOCR,
  validateImageForOptimalOCR,
  getOptimizedOCRStats,
  clearOptimizedOCRCache
} from './optimizedRunOcr';

export { 
  optimizedGeminiVisionOCR
} from './optimizedGeminiVisionOcr';

export { 
  ocrPerformanceMonitor 
} from './performanceMonitor';

export { 
  OCRConfig,
  ocrMigrationWrapper
} from './migrationGuide';

// Image preprocessing (optimized)
export {
  optimizedImageCompression,
  batchOptimizeImages,
  quickImageAssessment,
  smartPreprocessImage
} from '../utils/ocr/optimizedPreprocessImage';

// Fallback service
export {
  fallbackOcrService
} from './fallbackOcrService';

// Legacy compatibility exports (with fallback support)
export { 
  runOCR as legacyRunOCR,
  processOCRResult,
  validateOCRData,
  extractMRZLines,
  getDocumentType,
  getConfidenceScore
} from './runOcr';

export { 
  geminiVisionOCR as legacyGeminiVisionOCR 
} from './geminiVisionOcr';

export {
  preprocessImage as legacyPreprocessImage,
  assessImageQuality as legacyAssessImageQuality
} from '../utils/ocr/preprocessImage';

// Default export for easy importing with fallback support
export default {
  // Primary optimized services
  runOCR: async (...args) => {
    const { runOptimizedOCR } = await import('./optimizedRunOcr');
    return runOptimizedOCR(...args);
  },
  runBatchOCR: async (...args) => {
    const { runBatchOptimizedOCR } = await import('./optimizedRunOcr');
    return runBatchOptimizedOCR(...args);
  },
  validateImage: async (...args) => {
    const { validateImageForOptimalOCR } = await import('./optimizedRunOcr');
    return validateImageForOptimalOCR(...args);
  },
  getStats: async (...args) => {
    const { getOptimizedOCRStats } = await import('./optimizedRunOcr');
    return getOptimizedOCRStats(...args);
  },
  clearCache: async (...args) => {
    const { clearOptimizedOCRCache } = await import('./optimizedRunOcr');
    return clearOptimizedOCRCache(...args);
  },
  
  // Configuration
  config: async () => {
    const { OCRConfig } = await import('./migrationGuide');
    return OCRConfig;
  },
  monitor: async () => {
    const { ocrPerformanceMonitor } = await import('./performanceMonitor');
    return ocrPerformanceMonitor;
  },
  
  // Image processing
  compressImage: async (...args) => {
    const { optimizedImageCompression } = await import('../utils/ocr/optimizedPreprocessImage');
    return optimizedImageCompression(...args);
  },
  assessImage: async (...args) => {
    const { quickImageAssessment } = await import('../utils/ocr/optimizedPreprocessImage');
    return quickImageAssessment(...args);
  },
  preprocessImage: async (...args) => {
    const { smartPreprocessImage } = await import('../utils/ocr/optimizedPreprocessImage');
    return smartPreprocessImage(...args);
  },
  
  // Fallback service
  fallback: async () => {
    const { fallbackOcrService } = await import('./fallbackOcrService');
    return fallbackOcrService;
  }
};