/**
 * Fallback OCR Service - Manual Data Entry with Smart Suggestions
 * Used when Google Generative AI API is unavailable or invalid
 */

import { supabase } from '../../lib/supabase';
import unifiedCustomerService from '../UnifiedCustomerService';

class FallbackOcrService {
  constructor() {
    this.documentTypes = [
      'National ID Card',
      'Driver License', 
      'Passport',
      'Residence Permit',
      'Other Document'
    ];
    
    this.countries = [
      'Morocco',
      'France', 
      'Spain',
      'Algeria',
      'Tunisia',
      'Other'
    ];
  }

  /**
   * Process document with manual data entry interface
   */
  async processIdDocument(imageFile, customerId = null) {
    try {
      console.log('📝 Using fallback OCR - manual data entry mode');
      
      // Upload image first
      let imageUrl = null;
      if (customerId && imageFile) {
        imageUrl = await this.uploadImage(imageFile, customerId);
      }
      
      // Return structure for manual entry
      const result = {
        success: true,
        data: this.getEmptyDocumentData(),
        customerId: customerId,
        imageUrl: imageUrl,
        message: 'Please enter customer information manually. OCR service is currently unavailable.',
        fallbackMode: true,
        manualEntry: true,
        suggestions: this.getSmartSuggestions()
      };
      
      // If customerId provided, create placeholder entry
      if (customerId) {
        await unifiedCustomerService.processOCRData(result.data, customerId);
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ Fallback OCR error:', error);
      return {
        success: false,
        error: error.message || 'Failed to process document',
        data: null,
        fallbackMode: true
      };
    }
  }

  /**
   * Upload image to storage
   */
  async uploadImage(imageFile, customerId) {
    try {
      const timestamp = Date.now();
      const fileName = `idscan_fallback_${timestamp}.jpg`;
      const filePath = `${customerId}/${fileName}`;

      const { data, error } = await supabase.storage
        .from('id_scans')
        .upload(filePath, imageFile, {
          cacheControl: '3600',
          upsert: true
        });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('id_scans')
        .getPublicUrl(filePath);

      return urlData.publicUrl;
      
    } catch (error) {
      console.error('❌ Image upload error:', error);
      throw error;
    }
  }

  /**
   * Get empty document data structure
   */
  getEmptyDocumentData() {
    return {
      document_type: '',
      country: 'Morocco',
      full_name: '',
      document_number: '',
      nationality: 'Moroccan',
      date_of_birth: '',
      gender: '',
      expiry_date: '',
      issue_date: '',
      place_of_birth: '',
      confidence_estimate: 0.0,
      manual_entry: true
    };
  }

  /**
   * Get smart suggestions for manual entry
   */
  getSmartSuggestions() {
    return {
      documentTypes: this.documentTypes,
      countries: this.countries,
      tips: [
        'Enter dates in YYYY-MM-DD format',
        'Use full legal name as shown on document',
        'Document number should include all letters and numbers',
        'Check document expiry date carefully'
      ],
      commonFields: {
        nationality: 'Moroccan',
        country: 'Morocco',
        gender_options: ['Male', 'Female', 'Other']
      }
    };
  }

  /**
   * Validate manually entered data
   */
  validateManualData(data) {
    const errors = [];
    const warnings = [];

    // Required field validation
    if (!data.full_name || data.full_name.trim().length < 2) {
      errors.push('Full name is required and must be at least 2 characters');
    }

    if (!data.document_number || data.document_number.trim().length < 3) {
      errors.push('Document number is required and must be at least 3 characters');
    }

    // Date validation
    if (data.date_of_birth) {
      const dob = new Date(data.date_of_birth);
      const now = new Date();
      const age = now.getFullYear() - dob.getFullYear();
      
      if (isNaN(dob.getTime())) {
        errors.push('Invalid date of birth format. Use YYYY-MM-DD');
      } else if (age < 16 || age > 120) {
        warnings.push('Unusual age detected. Please verify date of birth');
      }
    }

    if (data.expiry_date) {
      const expiry = new Date(data.expiry_date);
      const now = new Date();
      
      if (isNaN(expiry.getTime())) {
        errors.push('Invalid expiry date format. Use YYYY-MM-DD');
      } else if (expiry < now) {
        warnings.push('Document appears to be expired');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      score: Math.max(0, 100 - (errors.length * 25) - (warnings.length * 10))
    };
  }

  /**
   * Process and save manually entered data
   */
  async saveManualData(data, customerId) {
    try {
      // Validate data first
      const validation = this.validateManualData(data);
      
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      // Clean and format data
      const cleanedData = {
        ...data,
        full_name: data.full_name.trim(),
        document_number: data.document_number.trim().toUpperCase(),
        nationality: data.nationality || 'Moroccan',
        country: data.country || 'Morocco',
        confidence_estimate: 1.0, // High confidence for manual entry
        manual_entry: true,
        validation_score: validation.score
      };

      // Save to database
      if (customerId) {
        await unifiedCustomerService.processOCRData(cleanedData, customerId);
      }

      return {
        success: true,
        data: cleanedData,
        validation,
        message: 'Manual data entry saved successfully'
      };

    } catch (error) {
      console.error('❌ Manual data save error:', error);
      return {
        success: false,
        error: error.message,
        data: null
      };
    }
  }
}

// Export singleton instance
export const fallbackOcrService = new FallbackOcrService();
export default fallbackOcrService;