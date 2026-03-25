/**
 * OCR Service - Now using Google Gemini Vision API with MGX Schema
 * Completely replaces GPT-4o with Google Gemini Vision API
 */

import { geminiVisionOCR } from './geminiVisionOcr';

/**
 * Run OCR using Google Gemini Vision API with MGX Schema
 * @param {File} imageFile - Image file to process
 * @param {string} customerId - Optional customer ID
 * @returns {Promise<Object>} OCR result
 */
export const runOCR = async (imageFile, customerId = null) => {
  try {
    console.log('🚀 Starting Google Gemini Vision OCR processing...');
    
    if (!imageFile) {
      throw new Error('No image file provided');
    }

    // Validate file type
    if (!imageFile.type.startsWith('image/')) {
      throw new Error('Invalid file type. Please provide an image file.');
    }

    // Process with Google Gemini Vision
    const result = await geminiVisionOCR.processIdDocument(imageFile, customerId);
    
    if (!result.success) {
      throw new Error(result.error || 'OCR processing failed');
    }

    console.log('✅ Google Gemini Vision OCR completed successfully');
    
    return {
      success: true,
      data: result.data,
      message: result.message || 'Successfully extracted data from ID document'
    };

  } catch (error) {
    console.error('❌ OCR processing error:', error);
    return {
      success: false,
      error: error.message || 'Failed to process ID document',
      data: null
    };
  }
};

/**
 * Process OCR result and format for customer data (MGX Schema compatible)
 * @param {Object} ocrData - Raw OCR data from Google Gemini Vision
 * @returns {Object} Processed customer data
 */
export const processOCRResult = (ocrData) => {
  if (!ocrData) {
    return null;
  }

  // Map MGX schema to legacy format for backward compatibility
  const processedData = {
    // Legacy fields for backward compatibility
    full_name: ocrData.full_name || ocrData.raw_name || '',
    date_of_birth: ocrData.date_of_birth || '',
    place_of_birth: ocrData.place_of_birth || '',
    id_number: ocrData.document_number || '',
    licence_number: ocrData.document_type === 'driver_license' ? ocrData.document_number : (ocrData.licence_number || ''),
    licence_issue_date: ocrData.issue_date || '',
    licence_expiry_date: ocrData.expiry_date || '',
    nationality: ocrData.nationality || ocrData.country || 'Moroccan',
    id_scan_url: ocrData.id_scan_url || '',
    
    // New MGX fields
    document_type: ocrData.document_type || 'unknown',
    raw_name: ocrData.raw_name || '',
    given_name: ocrData.given_name || '',
    family_name: ocrData.family_name || '',
    gender: ocrData.gender || 'unknown',
    issuing_authority: ocrData.issuing_authority || '',
    mrz: ocrData.mrz || '',
    confidence_estimate: ocrData.confidence_estimate || 0.5
  };

  return processedData;
};

/**
 * Validate OCR extracted data (MGX Schema)
 * @param {Object} data - Extracted data to validate
 * @returns {Object} Validation result
 */
export const validateOCRData = (data) => {
  return geminiVisionOCR.validateExtractedData(data);
};

/**
 * Legacy compatibility functions - deprecated
 */
export const preprocessImage = () => {
  console.warn('⚠️ preprocessImage is deprecated - Google Gemini Vision handles preprocessing automatically');
  return Promise.resolve();
};

export const createWorker = () => {
  console.warn('⚠️ createWorker is deprecated - using Google Gemini Vision API instead');
  return Promise.resolve();
};

/**
 * Extract MRZ lines from OCR text
 * @param {string} ocrText - OCR text to analyze
 * @returns {string} Detected MRZ lines
 */
export const extractMRZLines = (ocrText) => {
  return geminiVisionOCR.detectMRZLines(ocrText);
};

/**
 * Get document type from MGX data
 * @param {Object} mgxData - MGX extraction result
 * @returns {string} Document type
 */
export const getDocumentType = (mgxData) => {
  return mgxData?.document_type || 'unknown';
};

/**
 * Get confidence score from MGX data
 * @param {Object} mgxData - MGX extraction result
 * @returns {number} Confidence score (0.0-1.0)
 */
export const getConfidenceScore = (mgxData) => {
  return mgxData?.confidence_estimate || 0.5;
};

export default {
  runOCR,
  processOCRResult,
  validateOCRData,
  extractMRZLines,
  getDocumentType,
  getConfidenceScore
};