import BookingService from './BookingService';
import dataValidator from '../utils/DataValidator';
import performanceMonitor from '../utils/PerformanceMonitor';

/**
 * Booking Service with comprehensive data validation and sanitization
 */
class ValidatedBookingService {
  
  /**
   * Create booking with validation
   */
  static async createBooking(bookingData) {
    const startTime = performance.now();
    
    try {
      // Validate and sanitize input data
      const validation = dataValidator.validateEntity('booking', bookingData);
      
      if (!validation.isValid) {
        const error = new Error('Booking validation failed');
        error.validationErrors = validation.errors;
        throw error;
      }

      // Security validation
      const securityCheck = dataValidator.validateSecurityContext('create', validation.sanitizedData);
      if (!securityCheck.isSecure) {
        const error = new Error('Security validation failed');
        error.securityErrors = securityCheck.securityErrors;
        throw error;
      }

      // Additional business logic validation
      await this.validateBookingBusinessRules(validation.sanitizedData);

      // Create booking with sanitized data
      const result = await BookingService.createBooking(validation.sanitizedData);
      
      const duration = performance.now() - startTime;
      performanceMonitor.recordQuery({
        service: 'bookings',
        method: 'createBooking',
        duration,
        success: true,
        recordCount: 1
      });

      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      
      performanceMonitor.recordQuery({
        service: 'bookings',
        method: 'createBooking',
        duration,
        success: false,
        error: error.message
      });

      performanceMonitor.recordError({
        type: 'validation',
        message: error.message,
        context: { bookingData, validationErrors: error.validationErrors },
        severity: error.validationErrors ? 'warning' : 'error'
      });

      throw error;
    }
  }

  /**
   * Update booking with validation
   */
  static async updateBooking(bookingId, bookingData) {
    const startTime = performance.now();
    
    try {
      // Validate booking ID
      const idValidation = dataValidator.validateField(bookingId, { required: true, type: 'uuid' }, 'bookingId');
      if (idValidation.length > 0) {
        const error = new Error('Invalid booking ID');
        error.validationErrors = { bookingId: idValidation };
        throw error;
      }

      // Validate and sanitize update data
      const validation = dataValidator.validateEntity('booking', bookingData);
      
      if (!validation.isValid) {
        const error = new Error('Booking validation failed');
        error.validationErrors = validation.errors;
        throw error;
      }

      // Security validation
      const securityCheck = dataValidator.validateSecurityContext('update', validation.sanitizedData);
      if (!securityCheck.isSecure) {
        const error = new Error('Security validation failed');
        error.securityErrors = securityCheck.securityErrors;
        throw error;
      }

      // Additional business logic validation
      await this.validateBookingBusinessRules(validation.sanitizedData);

      // Update booking with sanitized data
      const result = await BookingService.updateBooking(bookingId, validation.sanitizedData);
      
      const duration = performance.now() - startTime;
      performanceMonitor.recordQuery({
        service: 'bookings',
        method: 'updateBooking',
        duration,
        success: true,
        recordCount: 1
      });

      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      
      performanceMonitor.recordQuery({
        service: 'bookings',
        method: 'updateBooking',
        duration,
        success: false,
        error: error.message
      });

      performanceMonitor.recordError({
        type: 'validation',
        message: error.message,
        context: { bookingId, bookingData, validationErrors: error.validationErrors },
        severity: error.validationErrors ? 'warning' : 'error'
      });

      throw error;
    }
  }

  /**
   * Delete booking with validation
   */
  static async deleteBooking(bookingId) {
    const startTime = performance.now();
    
    try {
      // Validate booking ID
      const idValidation = dataValidator.validateField(bookingId, { required: true, type: 'uuid' }, 'bookingId');
      if (idValidation.length > 0) {
        const error = new Error('Invalid booking ID');
        error.validationErrors = { bookingId: idValidation };
        throw error;
      }

      // Security validation
      const securityCheck = dataValidator.validateSecurityContext('delete', { bookingId });
      if (!securityCheck.isSecure) {
        const error = new Error('Security validation failed');
        error.securityErrors = securityCheck.securityErrors;
        throw error;
      }

      // Delete booking
      const result = await BookingService.deleteBooking(bookingId);
      
      const duration = performance.now() - startTime;
      performanceMonitor.recordQuery({
        service: 'bookings',
        method: 'deleteBooking',
        duration,
        success: true,
        recordCount: 1
      });

      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      
      performanceMonitor.recordQuery({
        service: 'bookings',
        method: 'deleteBooking',
        duration,
        success: false,
        error: error.message
      });

      performanceMonitor.recordError({
        type: 'validation',
        message: error.message,
        context: { bookingId, validationErrors: error.validationErrors },
        severity: error.validationErrors ? 'warning' : 'error'
      });

      throw error;
    }
  }

  /**
   * Validate booking business rules
   */
  static async validateBookingBusinessRules(bookingData) {
    const errors = [];

    // Check if booking date is not too far in the future (e.g., max 1 year)
    if (bookingData.booking_date) {
      const bookingDate = new Date(bookingData.booking_date);
      const maxFutureDate = new Date();
      maxFutureDate.setFullYear(maxFutureDate.getFullYear() + 1);
      
      if (bookingDate > maxFutureDate) {
        errors.push('Booking date cannot be more than 1 year in the future');
      }
    }

    // Validate total amount is reasonable
    if (bookingData.total_amount && bookingData.total_amount > 50000) {
      errors.push('Total amount seems unusually high, please verify');
    }

    // Check if vehicle is available (if vehicle_id provided)
    if (bookingData.vehicle_id && bookingData.booking_date) {
      try {
        const availability = await BookingService.checkAvailability(
          bookingData.vehicle_id,
          bookingData.booking_date,
          bookingData.booking_date
        );
        
        if (!availability.available) {
          errors.push('Vehicle is not available for the selected date');
        }
      } catch (error) {
        // Log but don't fail validation for availability check errors
        console.warn('Could not verify vehicle availability:', error.message);
      }
    }

    if (errors.length > 0) {
      const error = new Error('Business rule validation failed');
      error.businessRuleErrors = errors;
      throw error;
    }
  }

  /**
   * Validate bulk booking data
   */
  static validateBulkBookingData(bookingDataArray) {
    const startTime = performance.now();
    
    try {
      const validation = dataValidator.validateBulkData('booking', bookingDataArray);
      
      const duration = performance.now() - startTime;
      performanceMonitor.recordQuery({
        service: 'bookings',
        method: 'validateBulkBookingData',
        duration,
        success: true,
        recordCount: bookingDataArray.length
      });

      return validation;
    } catch (error) {
      const duration = performance.now() - startTime;
      
      performanceMonitor.recordQuery({
        service: 'bookings',
        method: 'validateBulkBookingData',
        duration,
        success: false,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Get booking form validation schema
   */
  static getBookingFormSchema() {
    return dataValidator.generateFormSchema('booking');
  }

  // Delegate read operations to original service
  static async getAllBookings(filters = {}) {
    return BookingService.getAllBookings(filters);
  }

  static async getBookingById(bookingId) {
    return BookingService.getBookingById(bookingId);
  }

  static async getBookingsByDateRange(startDate, endDate, filters = {}) {
    return BookingService.getBookingsByDateRange(startDate, endDate, filters);
  }

  static async getUpcomingBookings(limit = 10) {
    return BookingService.getUpcomingBookings(limit);
  }

  static async getBookingStatistics(dateRange = {}) {
    return BookingService.getBookingStatistics(dateRange);
  }

  static async checkAvailability(vehicleId, startDate, endDate) {
    return BookingService.checkAvailability(vehicleId, startDate, endDate);
  }
}

export default ValidatedBookingService;