/**
 * Enhanced Transactional Rental Service with CRITICAL CUSTOMER LINK ENFORCEMENT
 * AND PAYMENT STATUS TRACKING
 * 
 * CRITICAL FIX: Guarantees customer_id is properly saved during rental creation
 * NEW FEATURE: Payment Status tracking for financial management
 * BUG FIX: Added robust data sanitization to prevent db errors on empty time/date values.
 * BUG FIX: Stricter validation for excludeRentalId.
 * REGRESSION FIX: Added explicit sanitization for time fields to prevent "invalid input syntax for type time"
 * DATA-LOSS FIX V2: Rewrote sanitizer to explicitly prevent customer_id from numeric conversion.
 */

import { supabase } from '../lib/supabase';

class EnhancedTransactionalRentalService {
  constructor() {
    this.tableName = 'app_4c3a7a6153_rentals';
    this.vehiclesTableName = 'saharax_0u4w4d_vehicles';
    this.customersTableName = 'app_4c3a7a6153_customers';
  }

  /**
   * CRITICAL FIX: Enhanced UUID validation
   */
  _validateUuid(uuid) {
    if (!uuid || typeof uuid !== 'string') return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  validateRentalId(rentalId) {
    const isValid = this._validateUuid(rentalId);
    if (!isValid) {
      console.error('❌ INVALID RENTAL ID FORMAT:', rentalId);
    }
    return isValid;
  }

  /**
   * CRITICAL FIX: Validate customer ID format
   */
  validateCustomerId(customerId) {
    if (!customerId) return false;
    const isValidFormat = typeof customerId === 'string' && customerId.startsWith('cust_');
    if (!isValidFormat) {
      console.error('❌ INVALID CUSTOMER ID FORMAT:', customerId);
    }
    return isValidFormat;
  }

  /**
   * NEW: Validate payment status
   */
  validatePaymentStatus(paymentStatus) {
    const validStatuses = ['Pending', 'Paid in Full', 'Partially Paid', 'Refunded'];
    if (!paymentStatus) return 'Pending';
    if (!validStatuses.includes(paymentStatus)) {
      console.warn('⚠️ INVALID PAYMENT STATUS:', paymentStatus, '- defaulting to Pending');
      return 'Pending';
    }
    return paymentStatus;
  }

  /**
   * BUG FIX & DATA-LOSS FIX V2: Centralized, robust data sanitization.
   * This version explicitly separates customer_id from numeric conversion.
   */
  _sanitizeDataForDB(data) {
    console.log('🛡️ [Sanitizer V2] Starting data sanitization...');
    const numericFields = [
      'vehicle_id', 'total_amount', 'unit_price', 'transport_fee',
      'deposit_amount', 'damage_deposit', 'remaining_amount', 'quantity_days'
    ];
    const stringFieldsToPreserve = ['customer_email', 'customer_phone'];
    const sanitized = {};

    for (const key in data) {
      let value = data[key];
      // console.log(`🛡️ [Sanitizer V2] Processing key: "${key}", value: "${value}"`);

      // 1. Universal cleanup for empty/nullish values
      if (value === '' || value === undefined || value === 'null') {
        value = null;
        // console.log(`🛡️ [Sanitizer V2] Key "${key}" nulled due to empty value.`);
      }

      // 2. CRITICAL: Handle customer_id as a string, NEVER a number.
      if (key === 'customer_id') {
        if (this.validateCustomerId(value)) {
          sanitized[key] = value;
          console.log(`✅ [Sanitizer V2] Preserved string customer_id: "${value}"`);
        } else {
          sanitized[key] = null;
          console.warn(`⚠️ [Sanitizer V2] Invalid customer_id "${value}" was nulled.`);
        }
      } 
      // 3. Handle defined numeric fields
      else if (numericFields.includes(key)) {
        const numValue = Number(value);
        if (Number.isFinite(numValue)) {
          sanitized[key] = numValue;
          // console.log(`🔢 [Sanitizer V2] Converted key "${key}" to number: ${numValue}`);
        } else {
          sanitized[key] = null;
          if (value !== null) {
            console.warn(`⚠️ [Sanitizer V2] Invalid numeric value for "${key}": "${value}". Coerced to null.`);
          }
        }
      } 
      // 4. Preserve specific string fields
      else if (stringFieldsToPreserve.includes(key)) {
        if (value !== null) {
          sanitized[key] = String(value);
          // console.log(`🔤 [Sanitizer V2] Preserved string for key "${key}": "${value}"`);
        } else {
          sanitized[key] = null;
        }
      } 
      // 5. Handle all other fields
      else {
        sanitized[key] = value;
      }
    }

    // Keep the existing specific sanitizers for other field types (dates, times, etc.)
    const timeFields = ['rental_start_time', 'rental_end_time'];
    timeFields.forEach(field => {
      if (sanitized.hasOwnProperty(field) && sanitized[field] === '') {
        sanitized[field] = null;
      }
    });

    const dateFields = ['start_date', 'end_date', 'rental_start_date', 'rental_end_date', 'started_at', 'completed_at'];
    dateFields.forEach(field => {
      if (sanitized.hasOwnProperty(field) && sanitized[field]) {
        if (typeof sanitized[field] === 'string' && isNaN(new Date(sanitized[field]).getTime())) {
          sanitized[field] = null;
        }
      }
    });

    const paymentMap = {
      'partial': 'Partially Paid',
      'paid': 'Paid in Full',
      'pending': 'Pending',
      'refunded': 'Refunded',
      'unpaid': 'Pending'
    };
    if (sanitized.payment_status && paymentMap[sanitized.payment_status]) {
      sanitized.payment_status = paymentMap[sanitized.payment_status];
    } else if (!sanitized.payment_status) {
      sanitized.payment_status = 'Pending';
    }
    
    console.log('🧼 [Sanitizer V2] FINAL SANITIZED DATA:', JSON.stringify(sanitized, null, 2));
    return sanitized;
  }

  /**
   * CRITICAL FIX: Enhanced rental data sanitization with customer ID and payment status enforcement
   */
  sanitizeRentalData(rentalData) {
    console.log('🔍 SANITIZING RENTAL DATA with customer ID and payment status enforcement...');
    const sanitized = { ...rentalData };

    if (rentalData.customer_id) {
      if (!this.validateCustomerId(rentalData.customer_id)) {
        throw new Error(`Invalid customer ID format: ${rentalData.customer_id}. Must start with 'cust_'`);
      }
      console.log('✅ CUSTOMER ID VALIDATED:', sanitized.customer_id);
    } else {
      throw new Error('Customer ID is required for rental creation');
    }

    sanitized.payment_status = this.validatePaymentStatus(rentalData.payment_status);
    console.log('✅ PAYMENT STATUS VALIDATED:', sanitized.payment_status);

    if (sanitized.id && !this.validateRentalId(sanitized.id)) {
      console.error('❌ INVALID RENTAL ID - removing from sanitized data');
      delete sanitized.id;
    }

    if (sanitized.excludeRentalId && !this._validateUuid(sanitized.excludeRentalId)) {
        console.warn(`⚠️ Invalid excludeRentalId format: "${sanitized.excludeRentalId}". Removing.`);
        delete sanitized.excludeRentalId;
    }

    return sanitized;
  }

  /**
   * CRITICAL FIX: Enhanced vehicle availability check with proper UUID validation
   */
  async checkVehicleAvailability(vehicleId, startDate, endDate, excludeRentalId = null) {
    console.log('🔍 CHECKING VEHICLE AVAILABILITY with enhanced validation...');
    const sanitizedExcludeRentalId = this._validateUuid(excludeRentalId) ? excludeRentalId : null;
    if (excludeRentalId && !sanitizedExcludeRentalId) {
        console.warn(`⚠️ Invalid excludeRentalId format in availability check: "${excludeRentalId}". Ignoring.`);
    }
    console.log('📊 Parameters:', { vehicleId, startDate, endDate, excludeRentalId: sanitizedExcludeRentalId });

    try {
      let query = supabase
        .from(this.tableName)
        .select('id, start_date, end_date, rental_status')
        .eq('vehicle_id', vehicleId)
        .in('rental_status', ['active', 'confirmed', 'pending']);

      query = query.or(`and(start_date.lte.${endDate},end_date.gte.${startDate})`);

      if (sanitizedExcludeRentalId) {
        console.log('🔍 EXCLUDING RENTAL ID:', sanitizedExcludeRentalId);
        query = query.neq('id', sanitizedExcludeRentalId);
      }

      const { data: conflictingRentals, error } = await query;

      if (error) {
        throw new Error(`Availability check failed: ${error.message}`);
      }

      const isAvailable = !conflictingRentals || conflictingRentals.length === 0;
      console.log('📊 AVAILABILITY RESULT:', { isAvailable, conflictingRentals: conflictingRentals?.length || 0 });

      return { available: isAvailable, conflictingRentals: conflictingRentals || [] };

    } catch (error) {
      console.error('❌ AVAILABILITY CHECK FAILED:', error);
      throw error;
    }
  }

  async createRental(rentalData) {
    console.log('🆕 INITIATING TWO-STEP RENTAL CREATION...');
    try {
      const sanitizedData = this.sanitizeRentalData(rentalData);
      
      if (!sanitizedData.customer_id || !this.validateCustomerId(sanitizedData.customer_id)) {
        throw new Error('CRITICAL ERROR: Valid customer ID is required for rental creation');
      }

      const { data: existingCustomer, error: customerError } = await supabase
        .from(this.customersTableName)
        .select('id')
        .eq('id', sanitizedData.customer_id)
        .single();

      if (customerError || !existingCustomer) {
        throw new Error(`Customer ${sanitizedData.customer_id} does not exist. Cannot create rental.`);
      }

      // STEP 1 of 2: Null-safe update of customer details before rental creation.
      const customerUpdatePayload = {};
      const customerFieldsToUpdate = {
        customer_name: 'name',
        email: 'email',
        phone: 'phone',
        address: 'address'
      };

      Object.entries(customerFieldsToUpdate).forEach(([formKey, dbKey]) => {
        const value = sanitizedData[formKey];
        if (value !== null && value !== undefined && String(value).trim() !== '') {
          customerUpdatePayload[dbKey] = value;
        }
      });

      if (Object.keys(customerUpdatePayload).length > 0) {
        console.log('🔄 STEP 1/2: Updating customer...', customerUpdatePayload);
        const { error: customerUpdateError } = await supabase
          .from(this.customersTableName)
          .update(customerUpdatePayload)
          .eq('id', sanitizedData.customer_id);

        if (customerUpdateError) {
          console.error('❌ FAILED to update customer during two-step save:', customerUpdateError);
          throw new Error(`Failed to update customer: ${customerUpdateError.message}`);
        }
        console.log('✅ Customer updated successfully.');
      }

      // STEP 2 of 2: Create the rental record.
      console.log('🔄 STEP 2/2: Creating rental record...');
      const availability = await this.checkVehicleAvailability(
        sanitizedData.vehicle_id,
        sanitizedData.start_date,
        sanitizedData.end_date
      );

      if (!availability.available) {
        throw new Error('Vehicle is not available for the selected dates');
      }

      const rentalPayload = {
        ...sanitizedData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const finalSanitizedData = this._sanitizeDataForDB(rentalPayload);

      const { data: newRental, error: insertError } = await supabase
        .from(this.tableName)
        .insert([finalSanitizedData])
        .select()
        .single();

      if (insertError) {
        throw new Error(`Failed to create rental: ${insertError.message}`);
      }

      if (!newRental.customer_id) {
        throw new Error('CRITICAL ERROR: Customer ID was not saved to rental record!');
      }

      console.log('✅ RENTAL CREATED SUCCESSFULLY (TWO-STEP COMPLETE):', newRental.id);
      return { success: true, data: newRental, message: 'Rental created successfully' };

    } catch (error) {
      console.error('❌ RENTAL CREATION FAILED:', error);
      return { success: false, error: error.message, message: 'Failed to create rental' };
    }
  }

  /**
   * CRITICAL FIX: Enhanced rental update with customer ID and payment status preservation
   */
  async updateRental(rentalId, updateData) {
    console.log('🔄 UPDATING RENTAL with customer ID and payment status preservation...');
    console.log('📊 Parameters:', { rentalId, updateData });

    try {
      if (!this.validateRentalId(rentalId)) {
        throw new Error(`Invalid rental ID format: ${rentalId}`);
      }

      const { data: existingRental, error: fetchError } = await supabase
        .from(this.tableName)
        .select('*')
        .eq('id', rentalId)
        .single();

      if (fetchError || !existingRental) {
        throw new Error(`Rental not found: ${rentalId}`);
      }

      let finalUpdateData = { ...updateData };
      
      if (!finalUpdateData.customer_id && existingRental.customer_id) {
        finalUpdateData.customer_id = existingRental.customer_id;
      }

      if (finalUpdateData.payment_status) {
        finalUpdateData.payment_status = this.validatePaymentStatus(finalUpdateData.payment_status);
      } else if (existingRental.payment_status) {
        finalUpdateData.payment_status = existingRental.payment_status;
      }

      if (finalUpdateData.customer_id && !this.validateCustomerId(finalUpdateData.customer_id)) {
        throw new Error(`Invalid customer ID format in update: ${finalUpdateData.customer_id}`);
      }

      if (finalUpdateData.vehicle_id || finalUpdateData.start_date || finalUpdateData.end_date) {
        const vehicleId = finalUpdateData.vehicle_id || existingRental.vehicle_id;
        const startDate = finalUpdateData.start_date || existingRental.start_date;
        const endDate = finalUpdateData.end_date || existingRental.end_date;

        const availability = await this.checkVehicleAvailability(
          vehicleId,
          startDate,
          endDate,
          rentalId
        );

        if (!availability.available) {
          throw new Error('Vehicle is not available for the updated dates');
        }
      }

      const updatePayload = {
        ...finalUpdateData,
        updated_at: new Date().toISOString()
      };

      if (!updatePayload.customer_id) {
        throw new Error('CRITICAL ERROR: Customer ID must be preserved in rental update');
      }

      const finalSanitizedData = this._sanitizeDataForDB(updatePayload);

      const { data: updatedRental, error: updateError } = await supabase
        .from(this.tableName)
        .update(finalSanitizedData)
        .eq('id', rentalId)
        .select()
        .single();

      if (updateError) {
        console.error('❌ RENTAL UPDATE ERROR:', updateError);
        throw new Error(`Failed to update rental: ${updateError.message}`);
      }

      if (!updatedRental.customer_id) {
        throw new Error('CRITICAL ERROR: Customer ID was lost during rental update!');
      }

      console.log('✅ RENTAL UPDATED SUCCESSFULLY');
      return { success: true, data: updatedRental, message: 'Rental updated successfully' };

    } catch (error) {
      console.error('❌ RENTAL UPDATE FAILED:', error);
      return { success: false, error: error.message, message: 'Failed to update rental' };
    }
  }

  /**
   * Get rental by ID with enhanced validation
   */
  async getRentalById(rentalId) {
    console.log('🔍 FETCHING RENTAL BY ID:', rentalId);
    try {
      if (!this.validateRentalId(rentalId)) {
        throw new Error(`Invalid rental ID format: ${rentalId}`);
      }
      const { data: rental, error } = await supabase
        .from(this.tableName)
        .select('*')
        .eq('id', rentalId)
        .single();
      if (error) {
        throw new Error(`Failed to fetch rental: ${error.message}`);
      }
      return { success: true, data: rental };
    } catch (error) {
      console.error('❌ FETCH RENTAL FAILED:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete rental with validation
   */
  async deleteRental(rentalId) {
    console.log('🗑️ DELETING RENTAL:', rentalId);
    try {
      if (!this.validateRentalId(rentalId)) {
        throw new Error(`Invalid rental ID format: ${rentalId}`);
      }
      const { error } = await supabase
        .from(this.tableName)
        .delete()
        .eq('id', rentalId);
      if (error) {
        throw new Error(`Failed to delete rental: ${error.message}`);
      }
      return { success: true, message: 'Rental deleted successfully' };
    } catch (error) {
      console.error('❌ DELETE RENTAL FAILED:', error);
      return { success: false, error: error.message };
    }
  }
}

export default new EnhancedTransactionalRentalService();