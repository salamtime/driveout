/**
 * React Hook for Optimized OCR Processing
 * Provides easy integration with performance monitoring and progress tracking
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { runOptimizedOCR, runBatchOptimizedOCR, validateImageForOptimalOCR } from '../services/ocr/optimizedRunOcr';
import { ocrPerformanceMonitor } from '../services/ocr/performanceMonitor';

/**
 * Custom hook for optimized OCR processing with React integration
 */
export const useOptimizedOCR = (options = {}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [performanceStats, setPerformanceStats] = useState(null);
  
  const abortControllerRef = useRef(null);
  
  const {
    enablePerformanceTracking = true,
    autoValidateImages = true,
    onProgress = null,
    onComplete = null,
    onError = null
  } = options;

  /**
   * Process a single image with OCR
   */
  const processImage = useCallback(async (imageFile, customerId = null, processingOptions = {}) => {
    if (isProcessing) {
      console.warn('OCR processing already in progress');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setResult(null);
    setProgress({ stage: 'starting', percentage: 0 });

    try {
      // Abort controller for cancellation
      abortControllerRef.current = new AbortController();

      // Step 1: Validate image if enabled
      if (autoValidateImages) {
        setProgress({ stage: 'validating', percentage: 10 });
        const validation = await validateImageForOptimalOCR(imageFile);
        
        if (!validation.isValid) {
          throw new Error(validation.error || 'Invalid image file');
        }
        
        if (validation.score < 60) {
          console.warn('Low quality image detected:', validation.recommendations);
        }
      }

      // Step 2: Process with OCR
      setProgress({ stage: 'processing', percentage: 30 });
      
      const startTime = performance.now();
      const ocrResult = await runOptimizedOCR(imageFile, customerId, processingOptions);
      const processingTime = performance.now() - startTime;

      // Step 3: Complete
      setProgress({ stage: 'complete', percentage: 100 });
      
      const finalResult = {
        ...ocrResult,
        processingTime: processingTime.toFixed(2),
        timestamp: new Date().toISOString()
      };

      setResult(finalResult);
      
      if (enablePerformanceTracking) {
        const stats = ocrPerformanceMonitor.getPerformanceStats();
        setPerformanceStats(stats);
      }

      if (onComplete) {
        onComplete(finalResult);
      }

      return finalResult;

    } catch (err) {
      const errorMessage = err.message || 'OCR processing failed';
      setError(errorMessage);
      
      if (onError) {
        onError(err);
      }
      
      console.error('OCR processing error:', err);
      return { success: false, error: errorMessage };
      
    } finally {
      setIsProcessing(false);
      setProgress(null);
      abortControllerRef.current = null;
    }
  }, [isProcessing, autoValidateImages, enablePerformanceTracking, onComplete, onError]);

  /**
   * Process multiple images in batch
   */
  const processBatch = useCallback(async (imageFiles, customerId = null, batchOptions = {}) => {
    if (isProcessing) {
      console.warn('OCR processing already in progress');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setResult(null);
    setProgress({ stage: 'starting', percentage: 0, total: imageFiles.length });

    try {
      abortControllerRef.current = new AbortController();

      const progressCallback = (progressData) => {
        const updatedProgress = {
          stage: 'processing',
          percentage: progressData.percentage,
          completed: progressData.completed,
          total: progressData.total,
          currentFile: progressData.currentFile
        };
        
        setProgress(updatedProgress);
        
        if (onProgress) {
          onProgress(updatedProgress);
        }
      };

      const batchResult = await runBatchOptimizedOCR(imageFiles, customerId, progressCallback);
      
      setProgress({ stage: 'complete', percentage: 100 });
      setResult(batchResult);
      
      if (enablePerformanceTracking) {
        const stats = ocrPerformanceMonitor.getPerformanceStats();
        setPerformanceStats(stats);
      }

      if (onComplete) {
        onComplete(batchResult);
      }

      return batchResult;

    } catch (err) {
      const errorMessage = err.message || 'Batch OCR processing failed';
      setError(errorMessage);
      
      if (onError) {
        onError(err);
      }
      
      return { success: false, error: errorMessage };
      
    } finally {
      setIsProcessing(false);
      setProgress(null);
      abortControllerRef.current = null;
    }
  }, [isProcessing, onProgress, onComplete, onError, enablePerformanceTracking]);

  /**
   * Cancel ongoing processing
   */
  const cancelProcessing = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsProcessing(false);
      setProgress(null);
      setError('Processing cancelled by user');
    }
  }, []);

  /**
   * Reset hook state
   */
  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setProgress(null);
    setPerformanceStats(null);
  }, []);

  /**
   * Get current performance statistics
   */
  const getPerformanceReport = useCallback(() => {
    return ocrPerformanceMonitor.generateOptimizationReport();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    // State
    isProcessing,
    progress,
    result,
    error,
    performanceStats,
    
    // Actions
    processImage,
    processBatch,
    cancelProcessing,
    reset,
    getPerformanceReport,
    
    // Computed values
    canProcess: !isProcessing,
    hasResult: !!result,
    hasError: !!error,
    processingStage: progress?.stage || null,
    processingPercentage: progress?.percentage || 0
  };
};

/**
 * Hook for OCR performance monitoring only
 */
export const useOCRPerformance = () => {
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const refreshStats = useCallback(async () => {
    setIsLoading(true);
    try {
      const currentStats = ocrPerformanceMonitor.getPerformanceStats();
      setStats(currentStats);
    } catch (error) {
      console.error('Error fetching performance stats:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getDetailedReport = useCallback(() => {
    return ocrPerformanceMonitor.generateOptimizationReport();
  }, []);

  const clearPerformanceData = useCallback(() => {
    ocrPerformanceMonitor.cleanup(0); // Clear all sessions
    setStats(null);
  }, []);

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  return {
    stats,
    isLoading,
    refreshStats,
    getDetailedReport,
    clearPerformanceData
  };
};

/**
 * Hook for image validation before OCR
 */
export const useImageValidation = () => {
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);

  const validateImage = useCallback(async (imageFile) => {
    setIsValidating(true);
    try {
      const result = await validateImageForOptimalOCR(imageFile);
      setValidationResult(result);
      return result;
    } catch (error) {
      console.error('Image validation error:', error);
      const errorResult = {
        isValid: false,
        error: error.message,
        recommendations: ['Please provide a valid image file']
      };
      setValidationResult(errorResult);
      return errorResult;
    } finally {
      setIsValidating(false);
    }
  }, []);

  const reset = useCallback(() => {
    setValidationResult(null);
  }, []);

  return {
    isValidating,
    validationResult,
    validateImage,
    reset,
    isValid: validationResult?.isValid || false,
    score: validationResult?.score || 0,
    recommendations: validationResult?.recommendations || []
  };
};

export default useOptimizedOCR;