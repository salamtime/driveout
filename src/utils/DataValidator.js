/**
 * Comprehensive Data Validation and Sanitization Utilities
 * Provides validation rules, sanitization functions, and security checks
 */

import DOMPurify from 'isomorphic-dompurify';

class DataValidator {
  constructor() {
    // Common validation patterns
    this.patterns = {
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      phone: /^[\+]?[1-9][\d]{0,15}$/,
      plateNumber: /^[A-Z0-9\-\s]{2,15}$/i,
      vin: /^[A-HJ-NPR-Z0-9]{17}$/i,
      postalCode: /^[A-Z0-9\s\-]{3,10}$/i,
      currency: /^\d+(\.\d{1,2})?$/,
      url: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/,
      uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      alphanumeric: /^[a-zA-Z0-9\s]+$/,
      numeric: /^\d+$/,
      decimal: /^\d+(\.\d+)?$/
    };

    // Field length limits
    this.limits = {
      shortText: 50,
      mediumText: 255,
      longText: 1000,
      description: 2000,
      name: 100,
      email: 320,
      phone: 20,
      address: 500
    };

    // Validation rules for different entity types
    this.validationRules = {
      vehicle: {
        name: { required: true, type: 'string', maxLength: this.limits.name },
        model: { required: true, type: 'string', maxLength: this.limits.shortText },
        brand: { required: true, type: 'string', maxLength: this.limits.shortText },
        year: { required: true, type: 'number', min: 1900, max: new Date().getFullYear() + 2 },
        plate_number: { required: true, type: 'string', pattern: this.patterns.plateNumber },
        vin: { required: false, type: 'string', pattern: this.patterns.vin },
        vehicle_type: { required: true, type: 'enum', values: ['Car', 'SUV', 'Van', 'Truck', 'Motorcycle', 'Bus'] },
        status: { required: true, type: 'enum', values: ['Available', 'Rented', 'Maintenance', 'Out of Service'] },
        location: { required: true, type: 'string', maxLength: this.limits.mediumText },
        daily_rate: { required: true, type: 'number', min: 0, max: 10000 },
        hourly_rate: { required: false, type: 'number', min: 0, max: 1000 },
        mileage: { required: false, type: 'number', min: 0, max: 1000000 },
        fuel_type: { required: false, type: 'enum', values: ['Gasoline', 'Diesel', 'Electric', 'Hybrid'] },
        transmission: { required: false, type: 'enum', values: ['Manual', 'Automatic', 'CVT'] },
        seats: { required: false, type: 'number', min: 1, max: 50 },
        color: { required: false, type: 'string', maxLength: this.limits.shortText },
        description: { required: false, type: 'string', maxLength: this.limits.description }
      },
      customer: {
        name: { required: true, type: 'string', maxLength: this.limits.name },
        email: { required: true, type: 'string', pattern: this.patterns.email, maxLength: this.limits.email },
        phone: { required: true, type: 'string', pattern: this.patterns.phone, maxLength: this.limits.phone },
        address: { required: false, type: 'string', maxLength: this.limits.address },
        city: { required: false, type: 'string', maxLength: this.limits.shortText },
        state: { required: false, type: 'string', maxLength: this.limits.shortText },
        postal_code: { required: false, type: 'string', pattern: this.patterns.postalCode },
        country: { required: false, type: 'string', maxLength: this.limits.shortText },
        date_of_birth: { required: false, type: 'date', minAge: 18, maxAge: 120 },
        license_number: { required: false, type: 'string', maxLength: this.limits.shortText },
        license_expiry: { required: false, type: 'date', minDate: 'today' },
        emergency_contact: { required: false, type: 'string', maxLength: this.limits.name },
        emergency_phone: { required: false, type: 'string', pattern: this.patterns.phone }
      },
      booking: {
        customer_id: { required: true, type: 'uuid' },
        vehicle_id: { required: false, type: 'uuid' },
        tour_id: { required: false, type: 'uuid' },
        booking_date: { required: true, type: 'date', minDate: 'today' },
        start_time: { required: false, type: 'time' },
        end_time: { required: false, type: 'time' },
        duration: { required: false, type: 'number', min: 1, max: 720 }, // max 30 days in hours
        total_amount: { required: true, type: 'number', min: 0, max: 100000 },
        status: { required: true, type: 'enum', values: ['Pending', 'Confirmed', 'Cancelled', 'Completed', 'No Show'] },
        payment_status: { required: false, type: 'enum', values: ['Pending', 'Paid', 'Partial', 'Refunded', 'Failed'] },
        notes: { required: false, type: 'string', maxLength: this.limits.longText },
        pickup_location: { required: false, type: 'string', maxLength: this.limits.mediumText },
        dropoff_location: { required: false, type: 'string', maxLength: this.limits.mediumText }
      },
      rental: {
        customer_id: { required: true, type: 'uuid' },
        vehicle_id: { required: true, type: 'uuid' },
        start_date: { required: true, type: 'date', minDate: 'today' },
        end_date: { required: true, type: 'date', minDate: 'start_date' },
        start_time: { required: false, type: 'time' },
        end_time: { required: false, type: 'time' },
        total_amount: { required: true, type: 'number', min: 0, max: 100000 },
        deposit_amount: { required: false, type: 'number', min: 0, max: 50000 },
        status: { required: true, type: 'enum', values: ['Reserved', 'Active', 'Completed', 'Cancelled', 'Overdue'] },
        payment_status: { required: false, type: 'enum', values: ['Pending', 'Paid', 'Partial', 'Refunded', 'Failed'] },
        pickup_location: { required: true, type: 'string', maxLength: this.limits.mediumText },
        dropoff_location: { required: true, type: 'string', maxLength: this.limits.mediumText },
        start_mileage: { required: false, type: 'number', min: 0, max: 1000000 },
        end_mileage: { required: false, type: 'number', min: 0, max: 1000000 },
        fuel_level_start: { required: false, type: 'enum', values: ['Empty', '1/4', '1/2', '3/4', 'Full'] },
        fuel_level_end: { required: false, type: 'enum', values: ['Empty', '1/4', '1/2', '3/4', 'Full'] },
        damage_notes: { required: false, type: 'string', maxLength: this.limits.longText },
        additional_charges: { required: false, type: 'number', min: 0, max: 10000 },
        notes: { required: false, type: 'string', maxLength: this.limits.longText }
      },
      tour: {
        name: { required: true, type: 'string', maxLength: this.limits.name },
        description: { required: true, type: 'string', maxLength: this.limits.description },
        duration: { required: true, type: 'number', min: 1, max: 1440 }, // max 24 hours in minutes
        price: { required: true, type: 'number', min: 0, max: 10000 },
        max_participants: { required: true, type: 'number', min: 1, max: 100 },
        difficulty_level: { required: false, type: 'enum', values: ['Easy', 'Moderate', 'Difficult', 'Expert'] },
        category: { required: false, type: 'string', maxLength: this.limits.shortText },
        location: { required: true, type: 'string', maxLength: this.limits.mediumText },
        meeting_point: { required: true, type: 'string', maxLength: this.limits.mediumText },
        included_items: { required: false, type: 'string', maxLength: this.limits.longText },
        excluded_items: { required: false, type: 'string', maxLength: this.limits.longText },
        requirements: { required: false, type: 'string', maxLength: this.limits.longText },
        cancellation_policy: { required: false, type: 'string', maxLength: this.limits.longText },
        is_active: { required: false, type: 'boolean' },
        seasonal_availability: { required: false, type: 'string', maxLength: this.limits.mediumText }
      },
      pricing: {
        vehicle_model_id: { required: true, type: 'uuid' },
        hourly_mad: { required: true, type: 'number', min: 0, max: 1000 },
        daily_mad: { required: true, type: 'number', min: 0, max: 10000 },
        weekly_mad: { required: false, type: 'number', min: 0, max: 50000 },
        monthly_mad: { required: false, type: 'number', min: 0, max: 200000 },
        deposit_amount: { required: false, type: 'number', min: 0, max: 50000 },
        mileage_limit: { required: false, type: 'number', min: 0, max: 10000 },
        extra_mileage_rate: { required: false, type: 'number', min: 0, max: 100 },
        fuel_policy: { required: false, type: 'enum', values: ['Full to Full', 'Same to Same', 'Pre-Purchase'] },
        insurance_included: { required: false, type: 'boolean' },
        insurance_rate: { required: false, type: 'number', min: 0, max: 1000 },
        late_return_fee: { required: false, type: 'number', min: 0, max: 1000 },
        cleaning_fee: { required: false, type: 'number', min: 0, max: 500 },
        effective_date: { required: true, type: 'date' },
        expiry_date: { required: false, type: 'date', minDate: 'effective_date' }
      }
    };
  }

  /**
   * Validate a single field value
   */
  validateField(value, rule, fieldName = 'field') {
    const errors = [];

    // Check required fields
    if (rule.required && (value === null || value === undefined || value === '')) {
      errors.push(`${fieldName} is required`);
      return errors;
    }

    // Skip validation for optional empty fields
    if (!rule.required && (value === null || value === undefined || value === '')) {
      return errors;
    }

    // Type validation
    switch (rule.type) {
      case 'string':
        if (typeof value !== 'string') {
          errors.push(`${fieldName} must be a string`);
        } else {
          // Length validation
          if (rule.minLength && value.length < rule.minLength) {
            errors.push(`${fieldName} must be at least ${rule.minLength} characters long`);
          }
          if (rule.maxLength && value.length > rule.maxLength) {
            errors.push(`${fieldName} must be no more than ${rule.maxLength} characters long`);
          }
          // Pattern validation
          if (rule.pattern && !rule.pattern.test(value)) {
            errors.push(`${fieldName} format is invalid`);
          }
        }
        break;

      case 'number':
        const numValue = Number(value);
        if (isNaN(numValue)) {
          errors.push(`${fieldName} must be a valid number`);
        } else {
          if (rule.min !== undefined && numValue < rule.min) {
            errors.push(`${fieldName} must be at least ${rule.min}`);
          }
          if (rule.max !== undefined && numValue > rule.max) {
            errors.push(`${fieldName} must be no more than ${rule.max}`);
          }
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean' && value !== 'true' && value !== 'false' && value !== 0 && value !== 1) {
          errors.push(`${fieldName} must be a boolean value`);
        }
        break;

      case 'date':
        const dateValue = new Date(value);
        if (isNaN(dateValue.getTime())) {
          errors.push(`${fieldName} must be a valid date`);
        } else {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          
          if (rule.minDate === 'today' && dateValue < today) {
            errors.push(`${fieldName} cannot be in the past`);
          }
          if (rule.maxDate === 'today' && dateValue > today) {
            errors.push(`${fieldName} cannot be in the future`);
          }
          if (rule.minAge) {
            const minDate = new Date();
            minDate.setFullYear(minDate.getFullYear() - rule.minAge);
            if (dateValue > minDate) {
              errors.push(`${fieldName} indicates age must be at least ${rule.minAge} years`);
            }
          }
          if (rule.maxAge) {
            const maxDate = new Date();
            maxDate.setFullYear(maxDate.getFullYear() - rule.maxAge);
            if (dateValue < maxDate) {
              errors.push(`${fieldName} indicates age cannot exceed ${rule.maxAge} years`);
            }
          }
        }
        break;

      case 'time':
        const timePattern = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timePattern.test(value)) {
          errors.push(`${fieldName} must be in HH:MM format`);
        }
        break;

      case 'enum':
        if (rule.values && !rule.values.includes(value)) {
          errors.push(`${fieldName} must be one of: ${rule.values.join(', ')}`);
        }
        break;

      case 'uuid':
        if (!this.patterns.uuid.test(value)) {
          errors.push(`${fieldName} must be a valid UUID`);
        }
        break;

      case 'email':
        if (!this.patterns.email.test(value)) {
          errors.push(`${fieldName} must be a valid email address`);
        }
        break;

      case 'url':
        if (!this.patterns.url.test(value)) {
          errors.push(`${fieldName} must be a valid URL`);
        }
        break;
    }

    return errors;
  }

  /**
   * Validate an entire entity object
   */
  validateEntity(entityType, data) {
    const rules = this.validationRules[entityType];
    if (!rules) {
      throw new Error(`Unknown entity type: ${entityType}`);
    }

    const errors = {};
    let hasErrors = false;

    // Validate each field according to rules
    Object.keys(rules).forEach(fieldName => {
      const rule = rules[fieldName];
      const value = data[fieldName];
      const fieldErrors = this.validateField(value, rule, fieldName);
      
      if (fieldErrors.length > 0) {
        errors[fieldName] = fieldErrors;
        hasErrors = true;
      }
    });

    // Cross-field validations
    const crossFieldErrors = this.validateCrossFields(entityType, data);
    if (crossFieldErrors.length > 0) {
      errors._crossField = crossFieldErrors;
      hasErrors = true;
    }

    return {
      isValid: !hasErrors,
      errors: hasErrors ? errors : null,
      sanitizedData: this.sanitizeEntity(entityType, data)
    };
  }

  /**
   * Cross-field validations
   */
  validateCrossFields(entityType, data) {
    const errors = [];

    switch (entityType) {
      case 'rental':
        // End date must be after start date
        if (data.start_date && data.end_date) {
          const startDate = new Date(data.start_date);
          const endDate = new Date(data.end_date);
          if (endDate <= startDate) {
            errors.push('End date must be after start date');
          }
        }
        
        // End mileage must be greater than start mileage
        if (data.start_mileage && data.end_mileage) {
          if (Number(data.end_mileage) < Number(data.start_mileage)) {
            errors.push('End mileage must be greater than or equal to start mileage');
          }
        }
        break;

      case 'booking':
        // End time must be after start time
        if (data.start_time && data.end_time) {
          const startTime = this.parseTime(data.start_time);
          const endTime = this.parseTime(data.end_time);
          if (endTime <= startTime) {
            errors.push('End time must be after start time');
          }
        }
        
        // Must have either vehicle_id or tour_id
        if (!data.vehicle_id && !data.tour_id) {
          errors.push('Either vehicle or tour must be specified');
        }
        break;

      case 'pricing':
        // Expiry date must be after effective date
        if (data.effective_date && data.expiry_date) {
          const effectiveDate = new Date(data.effective_date);
          const expiryDate = new Date(data.expiry_date);
          if (expiryDate <= effectiveDate) {
            errors.push('Expiry date must be after effective date');
          }
        }
        break;

      case 'customer':
        // License expiry must be in the future if provided
        if (data.license_expiry) {
          const expiryDate = new Date(data.license_expiry);
          const today = new Date();
          if (expiryDate <= today) {
            errors.push('License expiry date must be in the future');
          }
        }
        break;
    }

    return errors;
  }

  /**
   * Sanitize entity data
   */
  sanitizeEntity(entityType, data) {
    const sanitized = {};
    const rules = this.validationRules[entityType];

    Object.keys(data).forEach(key => {
      let value = data[key];
      
      if (value === null || value === undefined) {
        sanitized[key] = value;
        return;
      }

      const rule = rules[key];
      if (!rule) {
        // Unknown field, sanitize as string
        sanitized[key] = this.sanitizeString(String(value));
        return;
      }

      switch (rule.type) {
        case 'string':
          sanitized[key] = this.sanitizeString(String(value));
          break;
        case 'number':
          sanitized[key] = Number(value);
          break;
        case 'boolean':
          sanitized[key] = Boolean(value);
          break;
        case 'date':
          sanitized[key] = new Date(value).toISOString().split('T')[0];
          break;
        case 'time':
          sanitized[key] = this.sanitizeTime(String(value));
          break;
        default:
          sanitized[key] = this.sanitizeString(String(value));
      }
    });

    return sanitized;
  }

  /**
   * Sanitize string input
   */
  sanitizeString(input) {
    if (typeof input !== 'string') return input;
    
    // Remove HTML tags and dangerous content
    let sanitized = DOMPurify.sanitize(input, { ALLOWED_TAGS: [] });
    
    // Trim whitespace
    sanitized = sanitized.trim();
    
    // Remove null bytes and control characters
    sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
    
    // Normalize whitespace
    sanitized = sanitized.replace(/\s+/g, ' ');
    
    return sanitized;
  }

  /**
   * Sanitize time input
   */
  sanitizeTime(input) {
    const timeMatch = input.match(/(\d{1,2}):(\d{2})/);
    if (!timeMatch) return input;
    
    const hours = Math.min(23, Math.max(0, parseInt(timeMatch[1])));
    const minutes = Math.min(59, Math.max(0, parseInt(timeMatch[2])));
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  /**
   * Parse time string to minutes
   */
  parseTime(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Validate and sanitize bulk data
   */
  validateBulkData(entityType, dataArray) {
    const results = {
      valid: [],
      invalid: [],
      summary: {
        total: dataArray.length,
        validCount: 0,
        invalidCount: 0,
        errorSummary: {}
      }
    };

    dataArray.forEach((item, index) => {
      const validation = this.validateEntity(entityType, item);
      
      if (validation.isValid) {
        results.valid.push({
          index,
          data: validation.sanitizedData
        });
        results.summary.validCount++;
      } else {
        results.invalid.push({
          index,
          data: item,
          errors: validation.errors
        });
        results.summary.invalidCount++;
        
        // Collect error statistics
        Object.keys(validation.errors).forEach(field => {
          if (!results.summary.errorSummary[field]) {
            results.summary.errorSummary[field] = 0;
          }
          results.summary.errorSummary[field]++;
        });
      }
    });

    return results;
  }

  /**
   * Security validation for sensitive operations
   */
  validateSecurityContext(operation, data, userContext = {}) {
    const securityErrors = [];

    // Check for SQL injection patterns
    const sqlInjectionPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/i,
      /(--|\/\*|\*\/|;)/,
      /(\b(OR|AND)\s+\d+\s*=\s*\d+)/i
    ];

    const checkForSQLInjection = (value) => {
      if (typeof value === 'string') {
        return sqlInjectionPatterns.some(pattern => pattern.test(value));
      }
      return false;
    };

    // Recursively check all string values
    const checkObject = (obj, path = '') => {
      Object.keys(obj).forEach(key => {
        const value = obj[key];
        const currentPath = path ? `${path}.${key}` : key;
        
        if (typeof value === 'string' && checkForSQLInjection(value)) {
          securityErrors.push(`Potential SQL injection detected in ${currentPath}`);
        } else if (typeof value === 'object' && value !== null) {
          checkObject(value, currentPath);
        }
      });
    };

    checkObject(data);

    // Check for XSS patterns
    const xssPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi
    ];

    const checkForXSS = (value) => {
      if (typeof value === 'string') {
        return xssPatterns.some(pattern => pattern.test(value));
      }
      return false;
    };

    Object.values(data).forEach(value => {
      if (checkForXSS(value)) {
        securityErrors.push('Potential XSS content detected');
      }
    });

    // Operation-specific security checks
    switch (operation) {
      case 'delete':
        if (!userContext.canDelete) {
          securityErrors.push('User does not have delete permissions');
        }
        break;
      case 'update':
        if (!userContext.canUpdate) {
          securityErrors.push('User does not have update permissions');
        }
        break;
      case 'create':
        if (!userContext.canCreate) {
          securityErrors.push('User does not have create permissions');
        }
        break;
    }

    return {
      isSecure: securityErrors.length === 0,
      securityErrors
    };
  }

  /**
   * Generate validation schema for frontend forms
   */
  generateFormSchema(entityType) {
    const rules = this.validationRules[entityType];
    if (!rules) {
      throw new Error(`Unknown entity type: ${entityType}`);
    }

    const schema = {};
    
    Object.keys(rules).forEach(fieldName => {
      const rule = rules[fieldName];
      schema[fieldName] = {
        required: rule.required || false,
        type: rule.type,
        validation: {}
      };

      // Add validation rules
      if (rule.minLength) schema[fieldName].validation.minLength = rule.minLength;
      if (rule.maxLength) schema[fieldName].validation.maxLength = rule.maxLength;
      if (rule.min !== undefined) schema[fieldName].validation.min = rule.min;
      if (rule.max !== undefined) schema[fieldName].validation.max = rule.max;
      if (rule.pattern) schema[fieldName].validation.pattern = rule.pattern.source;
      if (rule.values) schema[fieldName].validation.enum = rule.values;
    });

    return schema;
  }

  /**
   * Get validation summary for an entity type
   */
  getValidationSummary(entityType) {
    const rules = this.validationRules[entityType];
    if (!rules) {
      throw new Error(`Unknown entity type: ${entityType}`);
    }

    const summary = {
      entityType,
      totalFields: Object.keys(rules).length,
      requiredFields: Object.keys(rules).filter(key => rules[key].required).length,
      optionalFields: Object.keys(rules).filter(key => !rules[key].required).length,
      fieldTypes: {},
      validationRules: {}
    };

    Object.keys(rules).forEach(fieldName => {
      const rule = rules[fieldName];
      
      // Count field types
      summary.fieldTypes[rule.type] = (summary.fieldTypes[rule.type] || 0) + 1;
      
      // Collect validation rules
      if (rule.pattern) {
        summary.validationRules.pattern = (summary.validationRules.pattern || 0) + 1;
      }
      if (rule.minLength || rule.maxLength) {
        summary.validationRules.length = (summary.validationRules.length || 0) + 1;
      }
      if (rule.min !== undefined || rule.max !== undefined) {
        summary.validationRules.range = (summary.validationRules.range || 0) + 1;
      }
      if (rule.values) {
        summary.validationRules.enum = (summary.validationRules.enum || 0) + 1;
      }
    });

    return summary;
  }
}

// Create singleton instance
const dataValidator = new DataValidator();

export default dataValidator;

// Export utility functions
export const {
  validateField,
  validateEntity,
  validateBulkData,
  sanitizeEntity,
  sanitizeString,
  validateSecurityContext,
  generateFormSchema,
  getValidationSummary
} = dataValidator;

// Export validation patterns for direct use
export const ValidationPatterns = dataValidator.patterns;
export const ValidationLimits = dataValidator.limits;