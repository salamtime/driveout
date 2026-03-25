import { supabase } from '../lib/supabase.js';
import { geminiVisionOCR } from './ocr/optimizedGeminiVisionOcr.js';

/**
 * EnhancedUnifiedCustomerService - Complete customer management with ID scanning integration
 * 
 * FEATURES:
 * - OCR-based customer data extraction from ID scans
 * - Automatic customer creation/update with image storage
 * - Enhanced data validation and sanitization
 * - Comprehensive error handling and logging
 * - SHIELDING STRATEGY: Manual input always takes priority over OCR data
 * - CRITICAL FIX: Phone number and email mapping protection
 * - FORM AUTO-POPULATION FIX: Returns extractedData in correct format for form population
 */
class EnhancedUnifiedCustomerService {
  async uploadDocumentOnly(file, options = {}) {
    try {
      if (!file) {
        throw new Error('Image file is required');
      }

      const folder = String(options.folder || 'manual_id_uploads').replace(/[^a-zA-Z0-9/_-]/g, '_');
      const prefix = String(options.prefix || `doc_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeFileName = String(file.name || 'document.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `${folder}/${prefix}_${Date.now()}_${safeFileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('rental-documents')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      const { data: { publicUrl } } = supabase.storage
        .from('rental-documents')
        .getPublicUrl(storagePath);

      return {
        success: true,
        storagePath: uploadData.path,
        publicUrl,
        imageUrl: publicUrl,
        fileName: file.name,
      };
    } catch (error) {
      console.error('❌ uploadDocumentOnly failed:', error);
      return {
        success: false,
        error: error.message || 'Failed to save image',
      };
    }
  }

  /**
   * SHIELDING STRATEGY: Save customer with intelligent merge that protects manual input
   * Manual input is the "Master", OCR data is the "Assistant"
   */
  static async saveCustomer(customerData, scanResult = null, isSecondDriver = false) {
    // ABSOLUTE BLOCK FOR SECOND DRIVERS - FIRST LINE OF DEFENSE
    if (isSecondDriver === true) {
      console.log("🚫 [ABSOLUTE BLOCK] SECOND DRIVER detected in saveCustomer - NO DATABASE WRITE");
      return {
        success: true,
        message: "Blocked - second driver should not create customer record",
        blocked: true,
        isSecondDriver: true
      };
    }

    console.log('🆕 SHIELDING STRATEGY: Starting customer save with protected manual input:', {
      customerData,
      scanResult
    });
    
    try {
      // Step 1: Validate input data
      if (!customerData) {
        throw new Error('Customer data is required');
      }

      // Step 2: Extract and validate id_scan_url
      let idScanUrl = null;
      
      if (scanResult?.file_public_url) {
        idScanUrl = scanResult.file_public_url;
        console.log('✅ Using scanResult.file_public_url for id_scan_url:', idScanUrl);
      } else if (customerData.id_scan_url) {
        idScanUrl = customerData.id_scan_url;
        console.log('✅ Using customerData.id_scan_url:', idScanUrl);
      } else {
        console.log('⚠️ No id_scan_url provided, will be set to null');
      }

      // Step 3: Fetch existing customer data if updating
      let existingCustomer = null;
      if (customerData.id) {
        console.log('🔍 SHIELDING: Fetching existing customer data for merge:', customerData.id);
        const { data: existing, error: fetchError } = await supabase
          .from('app_4c3a7a6153_customers')
          .select('*')
          .eq('id', customerData.id)
          .maybeSingle();
        
        if (!fetchError && existing) {
          existingCustomer = existing;
          console.log('✅ SHIELDING: Found existing customer data:', existingCustomer);
        }
      }

      // Step 4: Sanitize customer data
      const sanitizedCustomerData = this.sanitizeCustomerData(customerData);
      console.log('🧹 SHIELDING: Sanitized customer data:', sanitizedCustomerData);

      // Step 5: SHIELDING STRATEGY - Build final customer data with intelligent merge
      // Priority: Manual Input > Existing Data > OCR Data
      const finalCustomerData = {
        // Start with existing data as base (if available)
        ...(existingCustomer || {}),
        
        // Layer OCR data on top (only fills empty fields)
        full_name: sanitizedCustomerData.customer_name || sanitizedCustomerData.full_name || existingCustomer?.full_name,
        date_of_birth: sanitizedCustomerData.customer_dob || sanitizedCustomerData.date_of_birth || existingCustomer?.date_of_birth || null,
        nationality: sanitizedCustomerData.customer_nationality || sanitizedCustomerData.nationality || existingCustomer?.nationality || null,
        licence_number: sanitizedCustomerData.customer_licence_number || sanitizedCustomerData.licence_number || existingCustomer?.licence_number || null,
        id_number: sanitizedCustomerData.customer_id_number || sanitizedCustomerData.id_number || existingCustomer?.id_number || null,
        place_of_birth: sanitizedCustomerData.customer_place_of_birth || sanitizedCustomerData.place_of_birth || existingCustomer?.place_of_birth || null,
        issue_date: sanitizedCustomerData.customer_issue_date || sanitizedCustomerData.issue_date || existingCustomer?.issue_date || null,
        
        // CRITICAL SHIELDING: Protect email and phone - only update if explicitly provided and not empty
        email: customerData.hasOwnProperty('customer_email') && sanitizedCustomerData.customer_email !== null
          ? sanitizedCustomerData.customer_email
          : (customerData.hasOwnProperty('email') && sanitizedCustomerData.email !== null
            ? sanitizedCustomerData.email
            : existingCustomer?.email),
        
        phone: customerData.hasOwnProperty('customer_phone') && sanitizedCustomerData.customer_phone !== null
          ? sanitizedCustomerData.customer_phone
          : (customerData.hasOwnProperty('phone') && sanitizedCustomerData.phone !== null
            ? sanitizedCustomerData.phone
            : existingCustomer?.phone),
        
        // Image URL
        id_scan_url: idScanUrl || existingCustomer?.id_scan_url,
        
        // Metadata
        created_at: existingCustomer?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      console.log('🎯 SHIELDING: Final customer data with protected manual input:', finalCustomerData);
      console.log('🖼️ SHIELDING: id_scan_url field value:', finalCustomerData.id_scan_url);
      console.log('📞 SHIELDING: phone field value:', finalCustomerData.phone);
      console.log('📧 SHIELDING: email field value:', finalCustomerData.email);

      // Step 6: Validate required fields
      if (!finalCustomerData.full_name) {
        throw new Error('Customer full name is required');
      }

      // Step 7: DUPLICATE PREVENTION & CUSTOMER LOOKUP - FIXED to handle multiple results
      if (finalCustomerData.full_name && finalCustomerData.licence_number) {
        console.log('🔍 DUPLICATE CHECK: Checking for customer with name and licence:', {
          name: finalCustomerData.full_name,
          licence: finalCustomerData.licence_number
        });
        
        // CRITICAL FIX: Use .limit(1) instead of .single() to handle multiple duplicates gracefully
        const { data: duplicateCustomers, error: lookupError } = await supabase
          .from('app_4c3a7a6153_customers')
          .select('*')
          .eq('full_name', finalCustomerData.full_name)
          .eq('licence_number', finalCustomerData.licence_number)
          .limit(1);

        if (lookupError) {
          console.error('❌ DUPLICATE CHECK: Error looking up customer:', lookupError);
          throw new Error(`Customer lookup failed: ${lookupError.message}`);
        }

        // Check if we found any duplicates
        const duplicateCustomer = duplicateCustomers && duplicateCustomers.length > 0 ? duplicateCustomers[0] : null;

        if (duplicateCustomer && duplicateCustomer.id !== customerData.id) {
          console.log('✅ DUPLICATE CHECK: Customer already exists. Updating existing profile:', duplicateCustomer.id);

          // Merge with existing customer, protecting manual input
          const updatePayload = {
            ...duplicateCustomer,
            ...finalCustomerData,
            id: duplicateCustomer.id, // Keep original ID
            updated_at: new Date().toISOString()
          };
          
          console.log('🛡️ SHIELDING: Merged update payload:', updatePayload);

          const { data: updatedCustomer, error: updateError } = await supabase
            .from('app_4c3a7a6153_customers')
            .update(updatePayload)
            .eq('id', duplicateCustomer.id)
            .select()
            .single();

          if (updateError) {
            console.error('❌ DUPLICATE CHECK: Failed to update existing customer record:', updateError);
            throw new Error(`Failed to update existing customer: ${updateError.message}`);
          }

          return {
            success: true,
            data: updatedCustomer,
            isExisting: true,
            message: 'Customer already exists. Rental will be added to their existing profile.'
          };
        }
      }

      // Step 8: Create or update customer
      const customerToUpsert = {
        id: customerData.id,
        ...finalCustomerData,
      };

      if (!customerToUpsert.id) {
        console.error('❌ CRITICAL ERROR: Attempting to upsert a customer without a valid ID.');
        throw new Error('Customer creation failed because no ID was provided.');
      }

      console.log('💾 SHIELDING: Upserting customer with protected data:', customerToUpsert);

      const { data: upsertedCustomerData, error: upsertError } = await supabase
        .from('app_4c3a7a6153_customers')
        .upsert(customerToUpsert)
        .select();

      if (upsertError) {
        if (upsertError.code === '23505') {
          // Unique constraint on a field other than id (e.g. licence_number, id_number).
          // Recover: find the conflicting row and update it instead.
          console.warn('⚠️ Upsert hit unique constraint — attempting conflict recovery.', upsertError);

          let conflictingRecord = null;

          // Try to find by licence_number first, then id_number, then full_name
          if (customerToUpsert.licence_number) {
            const { data } = await supabase
              .from('app_4c3a7a6153_customers')
              .select('*')
              .eq('licence_number', customerToUpsert.licence_number)
              .limit(1);
            conflictingRecord = data?.[0] ?? null;
          }

          if (!conflictingRecord && customerToUpsert.id_number) {
            const { data } = await supabase
              .from('app_4c3a7a6153_customers')
              .select('*')
              .eq('id_number', customerToUpsert.id_number)
              .limit(1);
            conflictingRecord = data?.[0] ?? null;
          }

          if (!conflictingRecord && customerToUpsert.full_name) {
            const { data } = await supabase
              .from('app_4c3a7a6153_customers')
              .select('*')
              .eq('full_name', customerToUpsert.full_name)
              .limit(1);
            conflictingRecord = data?.[0] ?? null;
          }

          if (conflictingRecord) {
            console.log('🔁 Conflict recovery: updating existing record', conflictingRecord.id);
            const { data: recovered, error: recoverError } = await supabase
              .from('app_4c3a7a6153_customers')
              .update({ ...customerToUpsert, id: conflictingRecord.id, updated_at: new Date().toISOString() })
              .eq('id', conflictingRecord.id)
              .select()
              .single();

            if (recoverError) {
              console.error('❌ Conflict recovery update failed:', recoverError);
              throw new Error(`Customer save failed: ${recoverError.message}`);
            }

            return {
              success: true,
              data: recovered,
              isExisting: true,
              message: 'Customer already exists. Rental will be added to their existing profile.'
            };
          }

          console.error('❌ Customer upsert failed due to unique constraint and recovery found no match.', upsertError);
          throw new Error('Failed to save customer data due to a conflict. A record with similar unique information may already exist.');
        }
        console.error('❌ Customer upsert failed:', upsertError);
        throw new Error(`Customer save failed: ${upsertError.message}`);
      }
      
      if (!upsertedCustomerData || upsertedCustomerData.length === 0) {
        console.error('❌ CRITICAL: Upsert operation returned no data.');
        throw new Error('Failed to save or retrieve customer data after operation.');
      }

      const customerResult = upsertedCustomerData[0];
      console.log('✅ SHIELDING: Customer created/updated successfully:', customerResult.id);

      // Step 9: FINAL VERIFICATION
      if (idScanUrl && !customerResult.id_scan_url) {
        console.error('❌ SHIELDING: CRITICAL ERROR - id_scan_url was not saved to database!');
        throw new Error('CRITICAL ERROR: id_scan_url was not saved to customer record in database!');
      }

      console.log('✅ SHIELDING: Customer save completed successfully with protected manual input');
      
      return {
        success: true,
        data: customerResult,
        message: 'Customer saved successfully with protected manual input'
      };

    } catch (error) {
      console.error('❌ SHIELDING: Customer save failed:', error);
      
      return {
        success: false,
        error: error.message,
        details: error
      };
    }
  }

  /**
   * FORM AUTO-POPULATION: Process Sequential Image Upload with Complete ID Scanning Workflow
   * This function returns extractedData in the correct format for form auto-population
   * DOES NOT OVERWRITE MANUAL INPUT - only provides data for the modal to merge intelligently
   */
  static async processSequentialImageUpload(imageFile, customerId, rentalId = null, scanType = 'document', isSecondDriver = false) {
    
    console.log("🔍 [DEBUG] processSequentialImageUpload CALL STACK:", new Error().stack);
    console.log("🔍 Called with parameters:", { 
      customerId, 
      rentalId, 
      scanType, 
      isSecondDriver,
      fileExists: !!imageFile,
      fileName: imageFile?.name 
    });
    
    // 🚨🚨🚨 NUCLEAR BLOCK FOR SECOND DRIVERS
    if (isSecondDriver === true) {
      console.log("🚨🚨🚨 [NUCLEAR BLOCK] processSequentialImageUpload called with isSecondDriver=true!");
      console.log("🚨 This should NOT happen for second drivers!");
      console.log("🚨 BLOCKING and returning error instead of processing");
      
      return {
        success: false,
        error: "SECOND DRIVER NUCLEAR BLOCK: processSequentialImageUpload should NOT be called for second drivers",
        message: "Critical error: Modal calling wrong method. Should call processSecondDriverID() instead.",
        isSecondDriver: true,
        blocked: true
      };
    }
    
    console.log(`🔍 [SERVICE DEBUG] processSequentialImageUpload called`);
    console.log(`🔍 isSecondDriver: ${isSecondDriver}`);
    console.log(`🔍 customerId: ${customerId}`);
    try {
      console.log('🔄 FORM AUTO-POPULATION: Processing sequential image upload for customer:', customerId);
      console.log('📁 Image file:', imageFile?.name);
      console.log('🆔 Rental ID:', rentalId);
      console.log('📋 Scan type:', scanType);
      
      // Step 1: Validate inputs
      if (!imageFile) {
        throw new Error('Image file is required');
      }
      
      if (!customerId) {
        throw new Error('Customer ID is required');
      }
      
      // Step 2: Generate unique file path with timestamp
      const timestamp = Date.now();
      const fileExtension = imageFile.name.split('.').pop() || 'jpg';
      const fileName = `idscan_${timestamp}.${fileExtension}`;
      const filePath = `${customerId}/${fileName}`;

      console.log('📤 FORM AUTO-POPULATION: Uploading image to storage bucket...');
      console.log('📁 File path:', filePath);

      // Step 3: Upload image to storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('id_scans')
        .upload(filePath, imageFile, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error('❌ FORM AUTO-POPULATION: Image upload failed:', uploadError);
        throw new Error(`Failed to upload image: ${uploadError.message}`);
      }

      console.log('✅ FORM AUTO-POPULATION: Image uploaded successfully:', uploadData.path);

      // Step 4: Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('id_scans')
        .getPublicUrl(filePath);

      console.log('🖼️ FORM AUTO-POPULATION: Generated public URL:', publicUrl);

      // Step 5: Process image with ACTUAL OCR
      console.log('🔍 FORM AUTO-POPULATION: Starting ACTUAL OCR processing...');
      
      let ocrResult;
      try {
        ocrResult = await geminiVisionOCR.processIdDocument(imageFile, customerId);
        console.log('✅ FORM AUTO-POPULATION: OCR processing completed:', ocrResult.success);
        console.log('📦 FORM AUTO-POPULATION: OCR extracted data:', JSON.stringify(ocrResult.data, null, 2));
      } catch (ocrError) {
        console.error('❌ FORM AUTO-POPULATION: OCR processing failed:', ocrError);
        ocrResult = {
          success: false,
          error: ocrError.message,
          data: {}
        };
      }

      // Step 6: Prepare data for form auto-population (WITHOUT saving to database yet)
      let shouldPopulateForm = false;
      let responseMessage = '';
      let extractedData = {}; // CRITICAL: This is what the form expects for auto-population

      if (ocrResult.success && ocrResult.data) {
        console.log('🔍 FORM AUTO-POPULATION: Processing OCR data for form population...');
        console.log('📦 FORM AUTO-POPULATION: OCR extracted data:', JSON.stringify(ocrResult.data, null, 2));
        
        // Map OCR data to form field names
        extractedData = {
          customer_name: ocrResult.data.full_name || '',
          customer_email: ocrResult.data.email || '',
          customer_phone: ocrResult.data.phone || '',
          customer_dob: ocrResult.data.date_of_birth || '',
          customer_nationality: ocrResult.data.nationality || '',
          customer_licence_number: ocrResult.data.licence_number || '',
          customer_id_number: ocrResult.data.id_number || '',
          customer_place_of_birth: ocrResult.data.place_of_birth || '',
          customer_issue_date: ocrResult.data.issue_date || '',
          document_number: ocrResult.data.licence_number || ocrResult.data.id_number || '',
          id_scan_url: publicUrl
        };

        console.log('🎯 FORM AUTO-POPULATION: Mapped extractedData for form:', JSON.stringify(extractedData, null, 2));
        
        // SECOND DRIVER CHECK: Skip customer saving for second drivers
        if (isSecondDriver) {
      console.log('👥 SECOND DRIVER MODE: Skipping customer save completely - NO database write');
      console.log('👥 SECOND DRIVER MODE: Returning OCR data only for form population');
      shouldPopulateForm = true;
      responseMessage = '✅ Second driver ID scanned successfully! Data extracted (not saved to customers table).';
      // CRITICAL: Do NOT call saveCustomer at all for second drivers
    } else {
          // Save customer data with OCR results and image URL (PRIMARY DRIVER ONLY)
          console.log('👤 PRIMARY DRIVER MODE: Proceeding with customer save to database');
          const customerDataWithScan = {
            id: customerId,
            ...ocrResult.data,
            id_scan_url: publicUrl,
          };

          const scanResult = {
            file_public_url: publicUrl,
            file_path: filePath,
            success: true
          };

          console.log('💾 FORM AUTO-POPULATION: Saving customer with OCR data and image URL...');
          const customerSaveResult = await this.saveCustomer(customerDataWithScan, scanResult);

          if (customerSaveResult.success) {
            shouldPopulateForm = true;
            responseMessage = customerSaveResult.isExisting 
              ? `✅ ${customerSaveResult.message}`
              : `✅ ID scan processed successfully! New customer created. Form populated with ${Object.keys(extractedData).filter(key => extractedData[key]).length} fields.`;
            console.log('✅ FORM AUTO-POPULATION: Customer save/update completed successfully.');
          } else {
            shouldPopulateForm = false;
            responseMessage = `❌ ID scan failed: ${customerSaveResult.error}`;
            console.error('❌ FORM AUTO-POPULATION: Customer save failed:', customerSaveResult.error);
          }
        }
      } else {
        // OCR failed, but still save the image URL to customer record if possible
        console.log('⚠️ FORM AUTO-POPULATION: OCR failed, attempting to save image URL only...');
        
        try {
          const { data: existingCustomer } = await supabase
            .from('app_4c3a7a6153_customers')
            .select('*')
            .eq('id', customerId)
            .single();

          if (existingCustomer) {
            const { error: updateError } = await supabase
              .from('app_4c3a7a6153_customers')
              .update({ 
                id_scan_url: publicUrl,
                updated_at: new Date().toISOString()
              })
              .eq('id', customerId);

            if (!updateError) {
              console.log('✅ FORM AUTO-POPULATION: Image URL saved to existing customer record');
            }
          }
        } catch (error) {
          console.log('⚠️ FORM AUTO-POPULATION: Could not update customer with image URL:', error.message);
        }

        shouldPopulateForm = false;
        responseMessage = 'Image uploaded but OCR processing failed. Please enter customer details manually.';
      }

      console.log('✅ FORM AUTO-POPULATION: Sequential image upload process completed');
      
      // CRITICAL: Return the correct format with extractedData for form auto-population
      const result = {
        success: true,
        publicUrl: publicUrl,
        filePath: filePath,
        ocrResult: ocrResult,
        shouldPopulateForm: shouldPopulateForm,
        extractedData: extractedData, // CRITICAL: This is what enables form auto-population
        message: responseMessage,
        // Additional fields for compatibility
        scanId: `scan_${timestamp}`,
        scanNumber: 1,
        updateResult: {
          success: true,
          shouldPopulateForm: shouldPopulateForm,
          shouldMarkComplete: true
        }
      };

      console.log('🎯 FORM AUTO-POPULATION: Final result with extractedData:', JSON.stringify(result, null, 2));
      return result;

    } catch (error) {
      console.error('❌ FORM AUTO-POPULATION: Sequential image upload failed:', error);
      return {
        success: false,
        error: error.message,
        shouldPopulateForm: false,
        extractedData: {}, // Empty object for failed cases
        message: 'Failed to process image upload'
      };
    }
  }

  /**
   * Enhanced customer data sanitization
   */
  static sanitizeCustomerData(customerData) {
    const sanitized = { ...customerData };

    console.log('🧹 Sanitizing customer data:', customerData);

    // Handle date fields
    const dateFields = ['date_of_birth', 'customer_dob', 'issue_date', 'customer_issue_date'];
    dateFields.forEach(field => {
      if (field in sanitized) {
        const originalValue = sanitized[field];
        if (!originalValue || (typeof originalValue === 'string' && originalValue.trim() === '')) {
          sanitized[field] = null;
        } else {
          // Try to format date
          try {
            const date = new Date(originalValue);
            if (!isNaN(date.getTime())) {
              sanitized[field] = date.toISOString().split('T')[0]; // YYYY-MM-DD format
            } else {
              sanitized[field] = null;
            }
          } catch (error) {
            sanitized[field] = null;
          }
        }
        console.log(`📅 Date field '${field}': '${originalValue}' -> '${sanitized[field]}'`);
      }
    });

    // Handle string fields that should be null when empty
    const stringFields = [
      'email', 'customer_email',
      'phone', 'customer_phone',
      'nationality', 'customer_nationality',
      'licence_number', 'customer_licence_number',
      'id_number', 'customer_id_number',
      'place_of_birth', 'customer_place_of_birth'
    ];
    
    stringFields.forEach(field => {
      if (field in sanitized && (!sanitized[field] || (typeof sanitized[field] === 'string' && sanitized[field].trim() === ''))) {
        const originalValue = sanitized[field];
        sanitized[field] = null;
        console.log(`📧 String field '${field}': '${originalValue}' -> null`);
      }
    });

    console.log('✅ Customer data sanitization completed:', sanitized);
    return sanitized;
  }

  /**
   * Get customer by ID
   */
  static async getCustomerById(customerId) {
    console.log('🔍 Fetching customer by ID:', customerId);
    
    try {
      const { data, error } = await supabase
        .from('app_4c3a7a6153_customers')
        .select('*')
        .eq('id', customerId)
        .single();
      
      if (error) {
        console.error('❌ Error fetching customer:', error);
        throw new Error(`Failed to fetch customer: ${error.message}`);
      }
      
      console.log('✅ Fetched customer:', data);
      return { success: true, data };
      
    } catch (error) {
      console.error('❌ Error in getCustomerById:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all customers with filtering
   */
  static async getAllCustomers(filters = {}) {
    console.log('📋 Fetching all customers with filters:', filters);
    
    try {
      let query = supabase
        .from('app_4c3a7a6153_customers')
        .select('*')
        .order('created_at', { ascending: false });
      
      // Apply filters
      if (filters.search) {
        query = query.or(`full_name.ilike.%${filters.search}%,phone.ilike.%${filters.search}%,email.ilike.%${filters.search}%`);
      }
      
      if (filters.nationality) {
        query = query.eq('nationality', filters.nationality);
      }
      
      const { data, error } = await query;
      
      if (error) {
        console.error('❌ Error fetching customers:', error);
        throw new Error(`Failed to fetch customers: ${error.message}`);
      }
      
      console.log('✅ Fetched customers:', data?.length || 0);
      return data || [];
      
    } catch (error) {
      console.error('❌ Error in getAllCustomers:', error);
      throw error;
    }
  }

  /**
   * Delete customer
   */
  static async deleteCustomer(customerId) {
    console.log('🗑️ Deleting customer:', customerId);
    
    try {
      const { error } = await supabase
        .from('app_4c3a7a6153_customers')
        .delete()
        .eq('id', customerId);
      
      if (error) {
        console.error('❌ Error deleting customer:', error);
        throw new Error(`Failed to delete customer: ${error.message}`);
      }
      
      console.log('✅ Customer deleted successfully');
      return { success: true, message: 'Customer deleted successfully' };
      
    } catch (error) {
      console.error('❌ Error in deleteCustomer:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Bulk delete customers by their IDs.
   */
  static async deleteCustomers(customerIds) {
    if (!customerIds || customerIds.length === 0) {
      return { success: true, message: 'No customers selected for deletion.' };
    }
    try {
      const { data, error } = await supabase
        .from('app_4c3a7a6153_customers')
        .delete()
        .in('id', customerIds);

      if (error) {
        console.error('Error during bulk customer deletion:', error);
        throw new Error(`Bulk deletion failed: ${error.message}`);
      }
      
      return { success: true, message: `${customerIds.length} customers deleted successfully.` };
    } catch (error) {
      console.error('Error in deleteCustomers:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Search customers by various criteria
   */
  static async searchCustomers(searchTerm) {
    console.log('🔍 Searching customers with term:', searchTerm);
    
    try {
      const { data, error } = await supabase
        .from('app_4c3a7a6153_customers')
        .select('*')
        .or(`full_name.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,licence_number.ilike.%${searchTerm}%,id_number.ilike.%${searchTerm}%`)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('❌ Error searching customers:', error);
        throw new Error(`Failed to search customers: ${error.message}`);
      }
      
      console.log('✅ Found customers:', data?.length || 0);
      return data || [];
      
    } catch (error) {
      console.error('❌ Error in searchCustomers:', error);
      throw error;
    }
  }

  /**
   * Get customer by licence number
   */
  static async getCustomerByLicenceNumber(licenceNumber) {
    console.log('🔍 Fetching customer by licence number:', licenceNumber);
    
    try {
      const { data, error } = await supabase
        .from('app_4c3a7a6153_customers')
        .select('*')
        .eq('licence_number', licenceNumber)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') {
          // No rows returned
          return null;
        }
        console.error('❌ Error fetching customer by licence:', error);
        throw new Error(`Failed to fetch customer by licence: ${error.message}`);
      }
      
      console.log('✅ Found customer by licence:', data);
      return data;
      
    } catch (error) {
      console.error('❌ Error in getCustomerByLicenceNumber:', error);
      throw error;
    }
  }

  /**
   * Get customer by ID number
   */
  static async getCustomerByIdNumber(idNumber) {
    console.log('🔍 Fetching customer by ID number:', idNumber);
    
    try {
      const { data, error } = await supabase
        .from('app_4c3a7a6153_customers')
        .select('*')
        .eq('id_number', idNumber)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') {
          // No rows returned
          return null;
        }
        console.error('❌ Error fetching customer by ID number:', error);
        throw new Error(`Failed to fetch customer by ID number: ${error.message}`);
      }
      
      console.log('✅ Found customer by ID number:', data);
      return data;
      
    } catch (error) {
      console.error('❌ Error in getCustomerByIdNumber:', error);
      throw error;
    }
  }

  /**
   * CRITICAL DEBUG: Get specific customer for debugging
   */
  static async debugCustomerRecord(customerId) {
    console.log('🔍 DEBUG: Fetching customer record for debugging:', customerId);
    
    try {
      const { data, error } = await supabase
        .from('app_4c3a7a6153_customers')
        .select('*')
        .eq('id', customerId)
        .single();
      
      if (error) {
        console.error('❌ DEBUG: Error fetching customer:', error);
        return { success: false, error: error.message };
      }
      
      console.log('🔍 DEBUG: Customer record details:');
      console.log('  - ID:', data.id);
      console.log('  - Full Name:', data.full_name);
      console.log('  - Phone:', data.phone);
      console.log('  - Email:', data.email);
      console.log('  - ID Number:', data.id_number);
      console.log('  - License Number:', data.licence_number);
      console.log('  - ID Scan URL:', data.id_scan_url);
      console.log('  - Created:', data.created_at);
      console.log('  - Updated:', data.updated_at);
      console.log('🔍 DEBUG: Complete record:', JSON.stringify(data, null, 2));
      
      return { success: true, data };
      
    } catch (error) {
      console.error('❌ DEBUG: Error in debugCustomerRecord:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Run diagnostics on customer service
   */
  static async runDiagnostics() {
    console.log('🔧 Running customer service diagnostics...');
    
    const diagnostics = {
      timestamp: new Date().toISOString(),
      tests: {}
    };
    
    try {
      // Test 1: Database Connection
      console.log('🔧 Testing customer database connection...');
      const { data: connectionTest, error: connectionError } = await supabase
        .from('app_4c3a7a6153_customers')
        .select('count', { count: 'exact', head: true });
      
      if (connectionError) {
        diagnostics.tests.databaseConnection = {
          status: 'FAIL',
          error: connectionError.message
        };
      } else {
        diagnostics.tests.databaseConnection = {
          status: 'PASS',
          message: 'Customer database connection successful'
        };
      }
      
      // Test 2: Table Access
      console.log('🔧 Testing customer table access...');
      const { data: tableTest, error: tableError } = await supabase
        .from('app_4c3a7a6153_customers')
        .select('id')
        .limit(1);
      
      if (tableError) {
        diagnostics.tests.tableAccess = {
          status: 'FAIL',
          error: tableError.message
        };
      } else {
        diagnostics.tests.tableAccess = {
          status: 'PASS',
          message: 'Customer table access successful'
        };
      }
      
      // Test 3: Count customers
      console.log('🔧 Counting customers...');
      const { count, error: countError } = await supabase
        .from('app_4c3a7a6153_customers')
        .select('*', { count: 'exact', head: true });
      
      if (countError) {
        diagnostics.tests.customerCount = {
          status: 'FAIL',
          error: countError.message
        };
      } else {
        diagnostics.tests.customerCount = {
          status: 'PASS',
          message: `Found ${count} customers in database`
        };
      }

      // Test 4: Test id_scan_url field presence
      console.log('🔧 Testing id_scan_url field presence...');
      try {
        const { data: sampleCustomer, error: sampleError } = await supabase
          .from('app_4c3a7a6153_customers')
          .select('id, id_scan_url, phone')
          .limit(1)
          .single();
        
        if (sampleError && sampleError.code !== 'PGRST116') {
          diagnostics.tests.idScanUrlField = {
            status: 'FAIL',
            error: sampleError.message
          };
        } else {
          diagnostics.tests.idScanUrlField = {
            status: 'PASS',
            message: 'id_scan_url and phone fields accessible in customer table',
            sampleData: sampleCustomer
          };
        }
      } catch (error) {
        diagnostics.tests.idScanUrlField = {
          status: 'FAIL',
          error: error.message
        };
      }

      // Test 5: Test processSequentialImageUpload function availability
      console.log('🔧 Testing processSequentialImageUpload function availability...');
      try {
        const functionExists = typeof this.processSequentialImageUpload === 'function';
        
        diagnostics.tests.processSequentialImageUploadFunction = {
          status: functionExists ? 'PASS' : 'FAIL',
          message: functionExists ? 'processSequentialImageUpload function is available with form auto-population support' : 'processSequentialImageUpload function is missing',
          functionExists: functionExists
        };
      } catch (error) {
        diagnostics.tests.processSequentialImageUploadFunction = {
          status: 'FAIL',
          error: error.message
        };
      }
      
      console.log('✅ Customer service diagnostics completed:', diagnostics);
      return diagnostics;
      
    } catch (error) {
      console.error('❌ Customer service diagnostics failed:', error);
      diagnostics.tests.generalError = {
        status: 'FAIL',
        error: error.message
      };
      return diagnostics;
    }
  }

  /**
   * Check if a customer has any rental history.
   */
  static async checkCustomerRentalHistory(customerId) {
    if (!customerId) {
      return { success: false, error: 'Customer ID is required.', hasHistory: false };
    }
    try {
      const { count, error } = await supabase
        .from('app_4c3a7a6153_rentals')
        .select('*', { count: 'exact', head: true })
        .eq('customer_id', customerId);

      if (error) {
        console.error('Error checking rental history:', error);
        throw new Error(`Failed to check rental history: ${error.message}`);
      }
      
      return { success: true, hasHistory: count > 0 };
    } catch (error) {
      console.error('Error in checkCustomerRentalHistory:', error);
      return { success: false, error: error.message, hasHistory: false };
    }
  }

  /**
   * Fetch rental history for a specific customer.
   */
  static async getCustomerRentalHistory(customerId) {
    try {
      // 1. Fetch rentals with a 'soft' join
      const { data, error } = await supabase
        .from(`app_4c3a7a6153_rentals`)
        .select(`
          *,
          vehicle:saharax_0u4w4d_vehicles(name, plate_number)
        `)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // 2. Data Normalization (The Safety Net)
      const safeData = data.map(rental => {
        return {
          ...rental,
          // If vehicle join fails, use the text already saved in the rental row
          display_name: rental.vehicle?.name || rental.vehicle_plate_number || `Vehicle #${rental.vehicle_id}`,
          // Map the correct money column (total_amount) to a standard property
          display_amount: rental.total_amount || rental.subtotal_mad || 0,
          // Ensure status is readable
          display_status: rental.rental_status || rental.status || 'pending'
        };
      });

      return { success: true, data: safeData };
    } catch (err) {
      console.error('Rental History Error:', err);
      return { success: false, error: err.message };
    }
  }


  /**
   * 🆕 SEPARATE PIPELINE: Process second driver ID (NO customer creation)
   * This is the public API method that modals should call
   */
  // Primary driver/customer OCR processing (saves to customers table)

  async processCustomerID(file) {
    console.log('👥 [PRIMARY DRIVER API] processCustomerID called');
    console.log('👥 File:', file?.name, 'Size:', file?.size);
    
    try {
      // Generate a unique scan ID for tracking
      const scanId = `sd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      console.log('👥 Generated scan ID:', scanId);
      
      // Call the core OCR pipeline
      const result = await this.processCustomerOCR(file, scanId);
      
      console.log('✅ [PRIMARY DRIVER API] Pipeline completed successfully');
      return result;
      
    } catch (error) {
      console.error('❌ [PRIMARY DRIVER API] Error:', error);
      return {
        success: false,
        error: error.message || 'Primary customer OCR processing failed',
        details: error
      };
    }
  }

  async processCustomerOCR(file, scanId = null) {
    console.log('👥 [PRIMARY DRIVER OCR] Starting COMPLETELY SEPARATE OCR pipeline');
    console.log('👥 This pipeline will NEVER create customer records');
    console.log('👥 File:', file?.name, 'Scan ID:', scanId);
    
    try {
      // Step 1: Upload to SEPARATE storage folder
      const storagePath = `customers_ocr/${scanId || Date.now()}_${file.name}`;
      console.log('👥 [UPLOAD] Uploading to separate folder:', storagePath);
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('rental-documents')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error('❌ [UPLOAD] Failed:', uploadError);
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      console.log('✅ [UPLOAD] File uploaded successfully:', uploadData.path);

      // Step 2: Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('rental-documents')
        .getPublicUrl(storagePath);

      console.log('👥 [OCR] Public URL:', publicUrl);

      // Step 3: Call Gemini API directly for OCR
      console.log('👥 [OCR] Calling Gemini API...');
      
      // Use existing geminiVisionOCR module
      // Call Gemini Vision API directly with public URL
      const prompt = `Extract all text and information from this ID document. Return a JSON object with these fields:
{
  "fullName": "full name",
  "dateOfBirth": "date of birth (YYYY-MM-DD)",
  "idNumber": "ID/license number",
  "address": "full address",
  "expiryDate": "expiry date (YYYY-MM-DD)",
  "issueDate": "issue date (YYYY-MM-DD)",
  "nationality": "nationality",
  "gender": "gender",
  "rawText": "all extracted text"
}`;

      // Convert image file to Base64 for Gemini API
      console.log('👥 [OCR] Converting image to Base64...');
      const base64Image = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          // Remove data URL prefix (e.g., "data:image/jpeg;base64,")
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      console.log('👥 [OCR] Base64 conversion complete, length:', base64Image.length);

      let ocrData = {};
      let ocrUnavailable = false;
      let ocrErrorMessage = null;

      try {
        // Call Gemini API directly with Base64 image data
        const geminiResponse = await fetch('/api/gemini-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'generateContent',
            model: 'gemini-2.5-flash',
            contents: [
              {
                role: 'user',
                parts: [
                  { text: prompt },
                  {
                    inlineData: {
                      mimeType: file.type,
                      data: base64Image  // Base64 string, NOT URL
                    }
                  }
                ]
              }
            ],
            generationConfig: {
              maxOutputTokens: 8192,
              temperature: 0.1
            }
          })
        });

        if (!geminiResponse.ok) {
          const errorText = await geminiResponse.text();
          throw new Error(`Gemini API error: ${geminiResponse.status} - ${errorText}`);
        }

        const geminiResult = await geminiResponse.json();
        console.log('👥 [OCR] Gemini API response:', geminiResult);

        // Extract the text from Gemini response
        const ocrText = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text || '';
        console.log('👥 [OCR] Extracted text:', ocrText);

        try {
          // Try to extract JSON from markdown code blocks
          const jsonMatch = ocrText.match(/```json\s*([\s\S]*?)\s*```/) || ocrText.match(/```\s*([\s\S]*?)\s*```/);
          if (jsonMatch) {
            ocrData = JSON.parse(jsonMatch[1]);
          } else {
            ocrData = JSON.parse(ocrText);
          }
        } catch (parseError) {
          console.warn('👥 [OCR] Failed to parse JSON, using raw text:', parseError);
          ocrData = { rawText: ocrText };
        }

        console.log('✅ [OCR] Gemini response processed');
        console.log('👥 [OCR] Extracted data:', ocrData);
      } catch (ocrError) {
        ocrUnavailable = true;
        ocrErrorMessage = ocrError.message || 'OCR unavailable';
        console.warn('⚠️ [SECOND DRIVER OCR] OCR unavailable, continuing with uploaded image only:', ocrErrorMessage);
      }


      // Step 4: Return data (NO database operations)
      const result = {
        success: true,
        data: ocrData,
        extractedData: ocrData,
        imageUrl: publicUrl,
        storagePath: storagePath,
        scanId: scanId,
        ocrUnavailable,
        ocrError: ocrErrorMessage,
        message: 'Primary customer OCR completed - NO customer record created'
      };

      console.log('✅ [PRIMARY DRIVER OCR] Pipeline completed successfully');
      console.log('👥 Result:', result);
      
      return result;

    } catch (error) {
      console.error('❌ [PRIMARY DRIVER OCR] Error:', error);
      return {
        success: false,
        error: error.message || 'Primary customer OCR processing failed',
        details: error
      };
    }
  }
  async processSecondDriverID(file) {
    console.log('👥 [SECOND DRIVER API] processSecondDriverID called');
    console.log('👥 File:', file?.name, 'Size:', file?.size);
    
    try {
      // Generate a unique scan ID for tracking
      const scanId = `sd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      console.log('👥 Generated scan ID:', scanId);
      
      // Call the core OCR pipeline
      const result = await this.processSecondDriverOCR(file, scanId);
      
      console.log('✅ [SECOND DRIVER API] Pipeline completed successfully');
      return result;
      
    } catch (error) {
      console.error('❌ [SECOND DRIVER API] Error:', error);
      return {
        success: false,
        error: error.message || 'Second driver OCR processing failed',
        details: error
      };
    }
  }

  /**
   * 🆕 SEPARATE PIPELINE: Core OCR processing for second drivers
   * This method NEVER touches the customers table
   */
  async processSecondDriverOCR(file, scanId = null) {
    console.log('👥 [SECOND DRIVER OCR] Starting COMPLETELY SEPARATE OCR pipeline');
    console.log('👥 This pipeline will NEVER create customer records');
    console.log('👥 File:', file?.name, 'Scan ID:', scanId);
    
    try {
      // Step 1: Upload to SEPARATE storage folder
      const storagePath = `second_drivers_ocr/${scanId || Date.now()}_${file.name}`;
      console.log('👥 [UPLOAD] Uploading to separate folder:', storagePath);
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('rental-documents')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error('❌ [UPLOAD] Failed:', uploadError);
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      console.log('✅ [UPLOAD] File uploaded successfully:', uploadData.path);

      // Step 2: Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('rental-documents')
        .getPublicUrl(storagePath);

      console.log('👥 [OCR] Public URL:', publicUrl);

      // Step 3: Call Gemini API directly for OCR
      console.log('👥 [OCR] Calling Gemini API...');
      
      // Use existing geminiVisionOCR module
      // Call Gemini Vision API directly with public URL
      const prompt = `Extract all text and information from this ID document. Return a JSON object with these fields:
{
  "fullName": "full name",
  "dateOfBirth": "date of birth (YYYY-MM-DD)",
  "idNumber": "ID/license number",
  "address": "full address",
  "expiryDate": "expiry date (YYYY-MM-DD)",
  "issueDate": "issue date (YYYY-MM-DD)",
  "nationality": "nationality",
  "gender": "gender",
  "rawText": "all extracted text"
}`;

      // Convert image file to Base64 for Gemini API
      console.log('👥 [OCR] Converting image to Base64...');
      const base64Image = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          // Remove data URL prefix (e.g., "data:image/jpeg;base64,")
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      console.log('👥 [OCR] Base64 conversion complete, length:', base64Image.length);

      // Call Gemini API directly with Base64 image data
      const geminiResponse = await fetch('/api/gemini-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generateContent',
          model: 'gemini-2.5-flash',
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType: file.type,
                    data: base64Image  // Base64 string, NOT URL
                  }
                }
              ]
            }
          ],
          generationConfig: {
            maxOutputTokens: 8192,
            temperature: 0.1
          }
        })
      });

      if (!geminiResponse.ok) {
        const errorText = await geminiResponse.text();
        throw new Error(`Gemini API error: ${geminiResponse.status} - ${errorText}`);
      }

      const geminiResult = await geminiResponse.json();
      console.log('👥 [OCR] Gemini API response:', geminiResult);

      // Extract the text from Gemini response
      const ocrText = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text || '';
      console.log('👥 [OCR] Extracted text:', ocrText);

      // Parse JSON from the response
      let ocrData = {};
      try {
        // Try to extract JSON from markdown code blocks
        const jsonMatch = ocrText.match(/```json\s*([\s\S]*?)\s*```/) || ocrText.match(/```\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          ocrData = JSON.parse(jsonMatch[1]);
        } else {
          ocrData = JSON.parse(ocrText);
        }
      } catch (parseError) {
        console.warn('👥 [OCR] Failed to parse JSON, using raw text:', parseError);
        ocrData = { rawText: ocrText };
      }
      console.log('✅ [OCR] Gemini response processed');
      console.log('👥 [OCR] Extracted data:', ocrData);


      // Step 4: Return data (NO database operations)
      const result = {
        success: true,
        data: ocrData,
        extractedData: ocrData,
        imageUrl: publicUrl,
        publicUrl,
        storagePath: storagePath,
        scanId: scanId,
        ocrUnavailable,
        ocrError: ocrErrorMessage,
        message: ocrUnavailable
          ? 'Second driver image uploaded successfully. OCR unavailable, continue manually.'
          : 'Second driver OCR completed - NO customer record created'
      };

      console.log('✅ [SECOND DRIVER OCR] Pipeline completed successfully');
      console.log('👥 Result:', result);
      
      return result;

    } catch (error) {
      console.error('❌ [SECOND DRIVER OCR] Error:', error);
      return {
        success: false,
        error: error.message || 'Second driver OCR processing failed',
        details: error
      };
    }
  }

}



  /**
   * 🎯 SECOND DRIVER OCR PIPELINE - COMPLETELY SEPARATE FROM CUSTOMERS
   * This method ONLY does OCR, NEVER creates customers
   * Used exclusively for second drivers
   */
  // Export singleton instance (not the class)
const enhancedUnifiedCustomerServiceInstance = new EnhancedUnifiedCustomerService();
export default enhancedUnifiedCustomerServiceInstance;

export const {
  saveCustomer,
  processSequentialImageUpload,
  getCustomerById,
  getAllCustomers,
  deleteCustomer,
  deleteCustomers,
  searchCustomers,
  getCustomerByLicenceNumber,
  getCustomerByIdNumber,
  debugCustomerRecord,
  runDiagnostics,
  checkCustomerRentalHistory,
  getCustomerRentalHistory,
} = EnhancedUnifiedCustomerService;
