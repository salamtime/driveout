import TransactionalRentalService from './TransactionalRentalService';

export class ValidatedRentalService {
  /**
   * Additional validation layer for rental data
   * @param {Object} rentalData - The rental data to validate
   * @returns {Object} - Validation result with isValid flag and errors array
   */
  static validateRentalData(rentalData) {
    const errors = [];
    const warnings = [];

    // Required field validation
    if (!rentalData.vehicle_id) {
      errors.push('Vehicle selection is required');
    }

    if (!rentalData.customer_id) {
      errors.push('Customer information is required');
    }

    if (!rentalData.rental_date) {
      errors.push('Rental date is required');
    }

    // Date validation
    if (rentalData.rental_date) {
      const rentalDate = new Date(rentalData.rental_date);
      if (isNaN(rentalDate.getTime())) {
        errors.push('Rental date must be a valid date');
      } else {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (rentalDate < today) {
          warnings.push('Rental date is in the past');
        }
      }
    }

    if (rentalData.return_date) {
      const returnDate = new Date(rentalData.return_date);
      if (isNaN(returnDate.getTime())) {
        errors.push('Return date must be a valid date');
      } else if (rentalData.rental_date) {
        const rentalDate = new Date(rentalData.rental_date);
        if (returnDate <= rentalDate) {
          errors.push('Return date must be after rental date');
        }
      }
    }

    // Customer DOB validation (if provided)
    if (rentalData.customer_dob && rentalData.customer_dob !== '') {
      const dob = new Date(rentalData.customer_dob);
      if (isNaN(dob.getTime())) {
        errors.push('Customer date of birth must be a valid date');
      } else {
        const today = new Date();
        const age = today.getFullYear() - dob.getFullYear();
        if (age < 18) {
          errors.push('Customer must be at least 18 years old');
        }
        if (age > 120) {
          warnings.push('Please verify customer date of birth');
        }
      }
    }

    // Numeric field validation
    if (rentalData.total_cost !== null && rentalData.total_cost !== undefined && rentalData.total_cost !== '') {
      const cost = parseFloat(rentalData.total_cost);
      if (isNaN(cost) || cost < 0) {
        errors.push('Total cost must be a valid positive number');
      }
    }

    if (rentalData.deposit_amount !== null && rentalData.deposit_amount !== undefined && rentalData.deposit_amount !== '') {
      const deposit = parseFloat(rentalData.deposit_amount);
      if (isNaN(deposit) || deposit < 0) {
        errors.push('Deposit amount must be a valid positive number');
      }
    }

    // Status validation
    const validStatuses = ['pending', 'confirmed', 'active', 'completed', 'cancelled'];
    if (rentalData.status && !validStatuses.includes(rentalData.status.toLowerCase())) {
      errors.push(`Status must be one of: ${validStatuses.join(', ')}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Creates a rental with comprehensive validation
   * @param {Object} rentalData - The rental data
   * @returns {Object} - Created rental or validation errors
   */
  static async createValidatedRental(rentalData) {
    try {
      console.log('🔍 Validating rental data before creation:', rentalData);

      // Perform validation
      const validation = this.validateRentalData(rentalData);
      
      if (!validation.isValid) {
        console.error('❌ Rental validation failed:', validation.errors);
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      if (validation.warnings.length > 0) {
        console.warn('⚠️ Rental validation warnings:', validation.warnings);
      }

      // Create the rental using the transactional service
      const rental = await TransactionalRentalService.createRentalWithTransaction(rentalData);
      
      console.log('✅ Validated rental created successfully:', rental);
      return {
        success: true,
        rental,
        warnings: validation.warnings
      };

    } catch (error) {
      console.error('❌ Validated rental creation failed:', error);
      return {
        success: false,
        error: error.message,
        rental: null
      };
    }
  }

  /**
   * Updates a rental with comprehensive validation
   * @param {number} rentalId - The rental ID
   * @param {Object} updateData - The update data
   * @returns {Object} - Updated rental or validation errors
   */
  static async updateValidatedRental(rentalId, updateData) {
    try {
      console.log('🔍 Validating rental update data:', updateData);

      // Perform validation (excluding required field checks for updates)
      const validation = this.validateRentalData(updateData);
      
      // For updates, we only check field format validation, not required fields
      const formatErrors = validation.errors.filter(error => 
        !error.includes('is required') && 
        !error.includes('selection is required') &&
        !error.includes('information is required')
      );

      if (formatErrors.length > 0) {
        console.error('❌ Rental update validation failed:', formatErrors);
        throw new Error(`Validation failed: ${formatErrors.join(', ')}`);
      }

      if (validation.warnings.length > 0) {
        console.warn('⚠️ Rental update validation warnings:', validation.warnings);
      }

      // Update the rental using the transactional service
      const rental = await TransactionalRentalService.updateRentalWithTransaction(rentalId, updateData);
      
      console.log('✅ Validated rental updated successfully:', rental);
      return {
        success: true,
        rental,
        warnings: validation.warnings
      };

    } catch (error) {
      console.error('❌ Validated rental update failed:', error);
      return {
        success: false,
        error: error.message,
        rental: null
      };
    }
  }

  /**
   * Deletes a rental with validation
   * @param {number} rentalId - The rental ID
   * @returns {Object} - Deletion result
   */
  static async deleteValidatedRental(rentalId) {
    try {
      if (!rentalId) {
        throw new Error('Rental ID is required for deletion');
      }

      // Check if rental exists and can be deleted
      const existingRental = await TransactionalRentalService.getRentalById(rentalId);
      
      if (existingRental.status === 'active') {
        throw new Error('Cannot delete an active rental. Please complete or cancel it first.');
      }

      // Delete the rental
      const result = await TransactionalRentalService.deleteRentalWithTransaction(rentalId);
      
      console.log('✅ Validated rental deleted successfully');
      return {
        success: true,
        result
      };

    } catch (error) {
      console.error('❌ Validated rental deletion failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Gets rental by ID with error handling
   * @param {number} rentalId - The rental ID
   * @returns {Object} - Rental data or error
   */
  static async getValidatedRental(rentalId) {
    try {
      const rental = await TransactionalRentalService.getRentalById(rentalId);
      return {
        success: true,
        rental
      };
    } catch (error) {
      console.error('❌ Get validated rental failed:', error);
      return {
        success: false,
        error: error.message,
        rental: null
      };
    }
  }

  /**
   * Gets all rentals with error handling
   * @returns {Object} - Rentals array or error
   */
  static async getAllValidatedRentals() {
    try {
      const rentals = await TransactionalRentalService.getAllRentals();
      return {
        success: true,
        rentals
      };
    } catch (error) {
      console.error('❌ Get all validated rentals failed:', error);
      return {
        success: false,
        error: error.message,
        rentals: []
      };
    }
  }
}

export default ValidatedRentalService;