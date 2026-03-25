/**
 * Rental Status Management Service
 * Handles rental status transitions, validation, and time-based operations
 */

import { logRentalStart, logRentalComplete, logRentalCancel } from './auditLogService';

// Rental status constants
export const RENTAL_STATUS = {
  SCHEDULED: 'scheduled',
  RENTED: 'rented',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded'
};

/**
 * Get the current time in Africa/Casablanca timezone
 * @returns {Date} Current time in Casablanca timezone
 */
export const getCasablancaTime = () => {
  return new Date(new Date().toLocaleString("en-US", {timeZone: "Africa/Casablanca"}));
};

/**
 * Format date for Africa/Casablanca timezone
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted date string
 */
export const formatCasablancaTime = (date) => {
  if (!date) return '';
  
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  return dateObj.toLocaleString('en-US', {
    timeZone: 'Africa/Casablanca',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

/**
 * Check if a rental can be started
 * @param {Object} rental - Rental object
 * @returns {Object} { canStart: boolean, reason?: string }
 */
export const canStartRental = (rental) => {
  if (!rental) {
    return { canStart: false, reason: 'Rental not found' };
  }

  if (rental.rental_status !== RENTAL_STATUS.SCHEDULED) {
    return { canStart: false, reason: `Rental is ${rental.rental_status}, not scheduled` };
  }

  // Check if rental is already started
  if (rental.rental_started_at) {
    return { canStart: false, reason: 'Rental has already been started' };
  }

  // Allow starting even before scheduled time (flexibility for staff)
  // But show warning if too early
  const now = getCasablancaTime();
  const scheduledStart = new Date(rental.rental_start_date);
  const timeDiff = scheduledStart.getTime() - now.getTime();
  const hoursEarly = timeDiff / (1000 * 60 * 60);

  if (hoursEarly > 24) {
    return { 
      canStart: false, 
      reason: `Rental is scheduled for ${formatCasablancaTime(scheduledStart)}. Too early to start.` 
    };
  }

  return { canStart: true };
};

/**
 * Start a rental
 * @param {Object} rental - Rental object
 * @param {string} userId - ID of user starting the rental
 * @returns {Promise<Object>} Updated rental data
 */
export const startRental = async (rental, userId) => {
  const { canStart, reason } = canStartRental(rental);
  
  if (!canStart) {
    throw new Error(reason);
  }

  const now = getCasablancaTime();
  const startedAt = now.toISOString();

  // Prepare updated rental data
  const updatedRental = {
    ...rental,
    rental_status: RENTAL_STATUS.RENTED,
    rental_started_at: startedAt,
    rental_started_by: userId,
    updated_at: startedAt
  };

  // Log the action
  await logRentalStart(rental.id, userId, {
    oldStatus: rental.rental_status,
    startedAt: startedAt
  });

  return updatedRental;
};

/**
 * Check if a rental can be activated (legacy function)
 * @param {Object} rental - Rental object
 * @returns {Object} { canActivate: boolean, reason?: string }
 */
export const canActivateRental = (rental) => {
  return canStartRental(rental);
};

/**
 * Check if a rental can be completed
 * @param {Object} rental - Rental object
 * @returns {Object} { canComplete: boolean, reason?: string }
 */
export const canCompleteRental = (rental) => {
  if (!rental) {
    return { canComplete: false, reason: 'Rental not found' };
  }

  if (rental.rental_status !== RENTAL_STATUS.RENTED) {
    return { canComplete: false, reason: `Rental is ${rental.rental_status}, not rented` };
  }

  // Check if rental has been started
  if (!rental.rental_started_at) {
    return { canComplete: false, reason: 'Rental has not been started yet' };
  }

  return { canComplete: true };
};

/**
 * Complete a rental
 * @param {Object} rental - Rental object
 * @param {string} userId - ID of user completing the rental
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Updated rental data
 */
export const completeRental = async (rental, userId, options = {}) => {
  const { canComplete, reason } = canCompleteRental(rental);
  
  if (!canComplete) {
    throw new Error(reason);
  }

  const now = getCasablancaTime();
  const completedAt = now.toISOString();

  // Prepare updated rental data
  const updatedRental = {
    ...rental,
    rental_status: RENTAL_STATUS.COMPLETED,
    rental_completed_at: completedAt,
    rental_completed_by: userId,
    updated_at: completedAt
  };

  // Log the action
  await logRentalComplete(rental.id, userId, {
    completedAt: completedAt,
    closingMediaCount: options.closingMediaCount || 0
  });

  return updatedRental;
};

/**
 * Check if a rental can be cancelled
 * @param {Object} rental - Rental object
 * @returns {Object} { canCancel: boolean, reason?: string }
 */
export const canCancelRental = (rental) => {
  if (!rental) {
    return { canCancel: false, reason: 'Rental not found' };
  }

  if ([RENTAL_STATUS.COMPLETED, RENTAL_STATUS.CANCELLED, RENTAL_STATUS.REFUNDED].includes(rental.rental_status)) {
    return { canCancel: false, reason: `Cannot cancel ${rental.rental_status} rental` };
  }

  return { canCancel: true };
};

/**
 * Cancel a rental
 * @param {Object} rental - Rental object
 * @param {string} userId - ID of user cancelling the rental
 * @param {string} reason - Reason for cancellation
 * @returns {Promise<Object>} Updated rental data
 */
export const cancelRental = async (rental, userId, reason) => {
  const { canCancel, reason: validationReason } = canCancelRental(rental);
  
  if (!canCancel) {
    throw new Error(validationReason);
  }

  const now = getCasablancaTime();
  const cancelledAt = now.toISOString();

  // Prepare updated rental data
  const updatedRental = {
    ...rental,
    rental_status: RENTAL_STATUS.CANCELLED,
    cancelled_at: cancelledAt,
    cancelled_by: userId,
    cancellation_reason: reason,
    updated_at: cancelledAt
  };

  // Log the action
  await logRentalCancel(rental.id, userId, reason, {
    oldStatus: rental.rental_status
  });

  return updatedRental;
};

/**
 * Get time until rental start
 * @param {Object} rental - Rental object
 * @returns {Object} { timeRemaining: string, isOverdue: boolean }
 */
export const getTimeUntilStart = (rental) => {
  if (!rental?.rental_start_date) {
    return { timeRemaining: 'No start date', isOverdue: false };
  }

  const now = getCasablancaTime();
  const startTime = new Date(rental.rental_start_date);
  const timeDiff = startTime.getTime() - now.getTime();

  if (timeDiff <= 0) {
    const overdue = Math.abs(timeDiff);
    const hours = Math.floor(overdue / (1000 * 60 * 60));
    const minutes = Math.floor((overdue % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return { timeRemaining: `${hours}h ${minutes}m overdue`, isOverdue: true };
    } else {
      return { timeRemaining: `${minutes}m overdue`, isOverdue: true };
    }
  }

  const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) {
    return { timeRemaining: `${days}d ${hours}h ${minutes}m`, isOverdue: false };
  } else if (hours > 0) {
    return { timeRemaining: `${hours}h ${minutes}m`, isOverdue: false };
  } else {
    return { timeRemaining: `${minutes}m`, isOverdue: false };
  }
};

/**
 * Get time until rental end
 * @param {Object} rental - Rental object
 * @returns {Object} { timeRemaining: string, isOverdue: boolean }
 */
export const getTimeUntilEnd = (rental) => {
  if (!rental?.rental_end_date) {
    return { timeRemaining: 'No end date', isOverdue: false };
  }

  const now = getCasablancaTime();
  const endTime = new Date(rental.rental_end_date);
  const timeDiff = endTime.getTime() - now.getTime();

  if (timeDiff <= 0) {
    const overdue = Math.abs(timeDiff);
    const hours = Math.floor(overdue / (1000 * 60 * 60));
    const minutes = Math.floor((overdue % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return { timeRemaining: `${hours}h ${minutes}m overdue`, isOverdue: true };
    } else {
      return { timeRemaining: `${minutes}m overdue`, isOverdue: true };
    }
  }

  const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) {
    return { timeRemaining: `${days}d ${hours}h ${minutes}m`, isOverdue: false };
  } else if (hours > 0) {
    return { timeRemaining: `${hours}h ${minutes}m`, isOverdue: false };
  } else {
    return { timeRemaining: `${minutes}m`, isOverdue: false };
  }
};

/**
 * Evaluate rental status based on current time and rental dates
 * Updated workflow: scheduled -> rented -> completed
 * @param {Object} rental - Rental object with start/end dates and current status
 * @param {boolean} autoActivate - Whether auto-activation is enabled
 * @returns {string} Updated rental status
 */
export const evaluateRentalStatus = (rental, autoActivate = true) => {
  // Don't override cancelled or refunded statuses
  if (rental.payment_status === 'refunded' || rental.rental_status === 'cancelled') {
    return rental.rental_status;
  }

  const now = getCasablancaTime();
  const startDate = new Date(rental.rental_start_date);
  const endDate = new Date(rental.rental_end_date);

  if (!startDate || !endDate) {
    console.warn('⚠️ Missing rental dates for status evaluation:', rental.id);
    return rental.rental_status || 'scheduled';
  }

  // Apply new status rules
  if (now >= endDate) {
    // Auto-complete when past end date
    return 'completed';
  } else if (now >= startDate && rental.rental_status === 'rented') {
    // Stay rented if already rented and within rental period
    return 'rented';
  } else if (now >= startDate && autoActivate && rental.rental_status === 'scheduled') {
    // Auto-activate if enabled and at/after start time
    return 'rented';
  } else if (now < startDate) {
    // Before start time - stay scheduled unless manually activated
    return rental.rental_status === 'rented' ? 'rented' : 'scheduled';
  }

  // Default fallback
  return rental.rental_status || 'scheduled';
};

/**
 * Batch evaluate and return rentals that need status updates
 * @param {Array} rentals - Array of rental objects
 * @param {boolean} autoActivate - Whether auto-activation is enabled
 * @returns {Array} Array of objects with {rental, newStatus} for rentals needing updates
 */
export const batchEvaluateRentalStatuses = (rentals, autoActivate = true) => {
  const updates = [];
  
  rentals.forEach(rental => {
    const newStatus = evaluateRentalStatus(rental, autoActivate);
    if (rental.rental_status !== newStatus) {
      updates.push({
        rental,
        newStatus,
        oldStatus: rental.rental_status
      });
    }
  });
  
  return updates;
};

/**
 * Sort rentals by status priority then by start time
 * @param {Array} rentals - Array of rental objects
 * @returns {Array} Sorted rentals array
 */
export const sortRentalsByStatusAndTime = (rentals) => {
  const getStatusPriority = (status) => {
    const priorities = {
      'scheduled': 1,
      'rented': 2,
      'completed': 3,
      'cancelled': 4,
      'refunded': 5
    };
    return priorities[status] || 999;
  };

  return [...rentals].sort((a, b) => {
    // First sort by status priority
    const statusPriorityA = getStatusPriority(a.rental_status);
    const statusPriorityB = getStatusPriority(b.rental_status);
    
    if (statusPriorityA !== statusPriorityB) {
      return statusPriorityA - statusPriorityB;
    }
    
    // Then sort by start time (earliest first)
    const startDateA = new Date(a.rental_start_date || 0);
    const startDateB = new Date(b.rental_start_date || 0);
    
    return startDateA - startDateB;
  });
};

/**
 * Get available actions for a rental based on its current status
 * @param {Object} rental - Rental object
 * @returns {Array} Array of available actions
 */
export const getAvailableActions = (rental) => {
  if (!rental) return [];

  const actions = [];

  // Start Rental action
  const { canStart } = canStartRental(rental);
  if (canStart) {
    actions.push({
      action: 'start',
      label: 'Start Rental',
      color: 'bg-green-500 hover:bg-green-600',
      icon: 'play',
      primary: true
    });
  }

  // Complete Rental action
  const { canComplete } = canCompleteRental(rental);
  if (canComplete) {
    actions.push({
      action: 'complete',
      label: 'Complete Now',
      color: 'bg-blue-500 hover:bg-blue-600',
      icon: 'check',
      primary: true
    });
  }

  // Cancel Rental action
  const { canCancel } = canCancelRental(rental);
  if (canCancel) {
    actions.push({
      action: 'cancel',
      label: 'Cancel',
      color: 'bg-red-500 hover:bg-red-600',
      icon: 'x',
      primary: false
    });
  }

  return actions;
};

/**
 * Get rental status badge configuration
 * @param {string} status - Rental status
 * @param {Object} rental - Rental object (for additional info)
 * @returns {Object} Badge configuration
 */
export const getStatusBadge = (status, rental = null) => {
  const badges = {
    [RENTAL_STATUS.SCHEDULED]: {
      color: 'bg-yellow-100 text-yellow-800',
      label: 'Scheduled'
    },
    [RENTAL_STATUS.RENTED]: {
      color: 'bg-green-100 text-green-800',
      label: 'Rented'
    },
    [RENTAL_STATUS.COMPLETED]: {
      color: 'bg-blue-100 text-blue-800',
      label: 'Completed'
    },
    [RENTAL_STATUS.CANCELLED]: {
      color: 'bg-red-100 text-red-800',
      label: 'Cancelled'
    },
    [RENTAL_STATUS.REFUNDED]: {
      color: 'bg-purple-100 text-purple-800',
      label: 'Refunded'
    }
  };

  const badge = badges[status] || { color: 'bg-gray-100 text-gray-800', label: status };

  // Add started time for rented rentals
  if (status === RENTAL_STATUS.RENTED && rental?.rental_started_at) {
    badge.subtitle = `Started: ${formatCasablancaTime(rental.rental_started_at)}`;
  }

  return badge;
};

/**
 * Get status badge configuration for UI
 * @param {string} status - Rental status
 * @returns {Object} Badge configuration with color and label
 */
export const getStatusBadgeConfig = (status) => {
  const configs = {
    'scheduled': {
      color: 'bg-blue-100 text-blue-800 border-blue-200',
      label: 'Scheduled'
    },
    'rented': {
      color: 'bg-green-100 text-green-800 border-green-200',
      label: 'Rented'
    },
    'completed': {
      color: 'bg-gray-100 text-gray-800 border-gray-200',
      label: 'Completed'
    },
    'cancelled': {
      color: 'bg-red-100 text-red-800 border-red-200',
      label: 'Cancelled'
    },
    'refunded': {
      color: 'bg-orange-100 text-orange-800 border-orange-200',
      label: 'Refunded'
    }
  };
  
  return configs[status] || {
    color: 'bg-gray-100 text-gray-800 border-gray-200',
    label: status || 'Unknown'
  };
};

/**
 * Log status change for audit trail
 * @param {Object} rental - Rental object
 * @param {string} oldStatus - Previous status
 * @param {string} newStatus - New status
 * @param {string} trigger - What triggered the change ('manual', 'auto', 'system')
 * @param {string} userId - User who made the change
 */
export const logStatusChange = (rental, oldStatus, newStatus, trigger, userId) => {
  console.log(`Rental ${rental.id} status changed: ${oldStatus} → ${newStatus} (${trigger}) by ${userId}`);
  
  // This could be enhanced to send to analytics or logging service
  const logEntry = {
    rentalId: rental.id,
    oldStatus,
    newStatus,
    trigger,
    userId,
    timestamp: getCasablancaTime().toISOString(),
    timezone: 'Africa/Casablanca'
  };

  // Store in local storage for debugging (remove in production)
  const logs = JSON.parse(localStorage.getItem('rentalStatusLogs') || '[]');
  logs.push(logEntry);
  localStorage.setItem('rentalStatusLogs', JSON.stringify(logs.slice(-100))); // Keep last 100 logs
};

export default {
  RENTAL_STATUS,
  getCasablancaTime,
  formatCasablancaTime,
  canStartRental,
  startRental,
  canActivateRental, // Legacy alias
  canCompleteRental,
  completeRental,
  canCancelRental,
  cancelRental,
  getTimeUntilStart,
  getTimeUntilEnd,
  evaluateRentalStatus,
  batchEvaluateRentalStatuses,
  sortRentalsByStatusAndTime,
  getAvailableActions,
  getStatusBadge,
  getStatusBadgeConfig,
  logStatusChange
};