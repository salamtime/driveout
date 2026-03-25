// Validation utilities for the Fuel Management System

export const validateTransactionForm = (formData) => {
  const errors = {};

  // Required fields validation
  if (!formData.vehicle_id) {
    errors.vehicle_id = 'Vehicle selection is required';
  }

  if (!formData.transaction_type) {
    errors.transaction_type = 'Transaction type is required';
  }

  if (!formData.amount || formData.amount <= 0) {
    errors.amount = 'Amount must be greater than 0';
  } else if (formData.amount < 0.01) {
    errors.amount = 'Amount must be at least 0.01 liters';
  }

  if (!formData.transaction_date) {
    errors.transaction_date = 'Date and time is required';
  }

  // Optional cost validation
  if (formData.cost && formData.cost < 0) {
    errors.cost = 'Cost cannot be negative';
  }

  // Odometer reading validation
  if (formData.odometer_reading && formData.odometer_reading < 0) {
    errors.odometer_reading = 'Odometer reading cannot be negative';
  }

  // Notes length validation
  if (formData.notes && formData.notes.length > 500) {
    errors.notes = 'Notes cannot exceed 500 characters';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

export const validateFileUpload = (file) => {
  const errors = [];
  const maxSize = 5 * 1024 * 1024; // 5MB
  const allowedTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'application/pdf'
  ];

  if (!file) {
    return { isValid: true, errors: [] };
  }

  if (file.size > maxSize) {
    errors.push('File size must be less than 5MB');
  }

  if (!allowedTypes.includes(file.type)) {
    errors.push('File must be an image (JPEG, PNG, GIF) or PDF');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

export const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return input.trim().replace(/[<>]/g, '');
};

export const validateDateRange = (startDate, endDate) => {
  const errors = {};

  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) {
      errors.dateRange = 'Start date cannot be after end date';
    }

    if (start > new Date()) {
      errors.startDate = 'Start date cannot be in the future';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

export const validateSearchQuery = (query) => {
  if (!query || typeof query !== 'string') {
    return { isValid: true, sanitized: '' };
  }

  const sanitized = query.trim().substring(0, 100); // Limit search query length
  
  return {
    isValid: sanitized.length >= 0,
    sanitized
  };
};