/**
 * Audit logging service for tracking rental actions
 */

import { supabase } from '../lib/supabase';

const getAuthHeaders = async () => {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('No active session');
  }

  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.access_token}`,
  };
};

// Get user agent and device information
const getDeviceInfo = () => {
  const userAgent = navigator.userAgent;
  const platform = navigator.platform;
  const language = navigator.language;
  
  return {
    userAgent,
    platform,
    language,
    screenResolution: `${screen.width}x${screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  };
};

// Get geolocation if available
const getLocation = () => {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
      },
      () => resolve(null),
      { timeout: 5000, enableHighAccuracy: false }
    );
  });
};

/**
 * Log a rental action to the audit trail
 * @param {Object} params - Audit log parameters
 * @param {string} params.rentalId - The rental ID
 * @param {string} params.action - The action performed (e.g., 'start_rental', 'complete_rental')
 * @param {string} params.userId - The user who performed the action
 * @param {Object} params.oldData - Previous rental data (optional)
 * @param {Object} params.newData - New rental data (optional)
 * @param {string} params.reason - Reason for the action (optional)
 * @param {Object} params.metadata - Additional metadata (optional)
 */
export const logRentalAction = async ({
  rentalId,
  action,
  userId,
  oldData = null,
  newData = null,
  reason = null,
  metadata = {}
}) => {
  try {
    const deviceInfo = getDeviceInfo();
    const location = await getLocation();
    const timestamp = new Date().toISOString();
    
    // Create audit log entry
    const auditEntry = {
      rental_id: rentalId,
      action,
      performed_by: userId,
      performed_at: timestamp,
      old_data: oldData,
      new_data: newData,
      reason,
      device_info: deviceInfo,
      gps_location: location,
      metadata: {
        ...metadata,
        timestamp_utc: timestamp,
        timestamp_local: new Date().toLocaleString('en-US', { 
          timeZone: 'Africa/Casablanca',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
      }
    };

    const headers = await getAuthHeaders();

    // Send to backend API
    const response = await fetch('/api/rentals/audit-log', {
      method: 'POST',
      headers,
      body: JSON.stringify(auditEntry)
    });

    if (!response.ok) {
      throw new Error(`Audit log failed: ${response.statusText}`);
    }

    const result = await response.json();
    console.log('Audit log created:', result);
    
    return result;
    
  } catch (error) {
    console.error('Error creating audit log:', error);
    // Don't throw error to avoid blocking the main action
    return null;
  }
};

/**
 * Log rental start action
 * @param {string} rentalId - The rental ID
 * @param {string} userId - The user who started the rental
 * @param {Object} rentalData - The rental data before and after start
 */
export const logRentalStart = async (rentalId, userId, rentalData) => {
  return logRentalAction({
    rentalId,
    action: 'start_rental',
    userId,
    oldData: { 
      rental_status: rentalData.oldStatus,
      rental_started_at: null 
    },
    newData: { 
      rental_status: 'active',
      rental_started_at: rentalData.startedAt,
      rental_started_by: userId
    },
    metadata: {
      action_type: 'status_change',
      previous_status: rentalData.oldStatus,
      new_status: 'active',
      timezone: 'Africa/Casablanca'
    }
  });
};

/**
 * Log rental completion action
 * @param {string} rentalId - The rental ID
 * @param {string} userId - The user who completed the rental
 * @param {Object} rentalData - The rental data before and after completion
 */
export const logRentalComplete = async (rentalId, userId, rentalData) => {
  return logRentalAction({
    rentalId,
    action: 'complete_rental',
    userId,
    oldData: { 
      rental_status: 'active',
      rental_completed_at: null 
    },
    newData: { 
      rental_status: 'completed',
      rental_completed_at: rentalData.completedAt,
      rental_completed_by: userId
    },
    metadata: {
      action_type: 'status_change',
      previous_status: 'active',
      new_status: 'completed',
      timezone: 'Africa/Casablanca',
      closing_media_count: rentalData.closingMediaCount || 0
    }
  });
};

/**
 * Log media capture action
 * @param {string} rentalId - The rental ID
 * @param {string} userId - The user who captured the media
 * @param {Object} mediaData - The media data
 */
export const logMediaCapture = async (rentalId, userId, mediaData) => {
  return logRentalAction({
    rentalId,
    action: `capture_${mediaData.phase}_media`,
    userId,
    newData: {
      media_type: mediaData.type,
      media_phase: mediaData.phase,
      media_filename: mediaData.filename,
      media_size: mediaData.size
    },
    metadata: {
      action_type: 'media_capture',
      media_type: mediaData.type,
      phase: mediaData.phase,
      from_gallery: mediaData.fromGallery || false,
      duration: mediaData.duration || null,
      file_size_bytes: mediaData.size
    }
  });
};

/**
 * Log media deletion action
 * @param {string} rentalId - The rental ID
 * @param {string} userId - The user who deleted the media
 * @param {Object} mediaData - The deleted media data
 */
export const logMediaDeletion = async (rentalId, userId, mediaData) => {
  return logRentalAction({
    rentalId,
    action: `delete_${mediaData.phase}_media`,
    userId,
    oldData: {
      media_id: mediaData.id,
      media_type: mediaData.file_type,
      media_phase: mediaData.phase,
      media_filename: mediaData.original_filename,
      media_size: mediaData.file_size,
      storage_path: mediaData.storage_path,
      public_url: mediaData.public_url
    },
    newData: null,
    reason: 'Media file deleted by user',
    metadata: {
      action_type: 'media_deletion',
      media_type: mediaData.file_type,
      phase: mediaData.phase,
      file_size_bytes: mediaData.file_size,
      deletion_method: 'user_initiated',
      original_filename: mediaData.original_filename
    }
  });
};

/**
 * Log rental cancellation action
 * @param {string} rentalId - The rental ID
 * @param {string} userId - The user who cancelled the rental
 * @param {string} reason - Reason for cancellation
 * @param {Object} rentalData - The rental data
 */
export const logRentalCancel = async (rentalId, userId, reason, rentalData) => {
  return logRentalAction({
    rentalId,
    action: 'cancel_rental',
    userId,
    oldData: { 
      rental_status: rentalData.oldStatus 
    },
    newData: { 
      rental_status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: userId
    },
    reason,
    metadata: {
      action_type: 'status_change',
      previous_status: rentalData.oldStatus,
      new_status: 'cancelled',
      cancellation_reason: reason
    }
  });
};

/**
 * Get audit logs for a rental
 * @param {string} rentalId - The rental ID
 * @returns {Promise<Array>} Array of audit log entries
 */
export const getRentalAuditLogs = async (rentalId) => {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`/api/rentals/${rentalId}/audit-logs`, {
      headers
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch audit logs: ${response.statusText}`);
    }

    return await response.json();
    
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return [];
  }
};

/**
 * Format audit log entry for display
 * @param {Object} logEntry - The audit log entry
 * @returns {Object} Formatted log entry
 */
export const formatAuditLogEntry = (logEntry) => {
  const actionLabels = {
    'start_rental': 'Started Rental',
    'complete_rental': 'Completed Rental',
    'cancel_rental': 'Cancelled Rental',
    'capture_out_media': 'Captured Opening Media',
    'capture_in_media': 'Captured Closing Media',
    'delete_out_media': 'Deleted Opening Media',
    'delete_in_media': 'Deleted Closing Media'
  };

  return {
    ...logEntry,
    actionLabel: actionLabels[logEntry.action] || logEntry.action,
    formattedTimestamp: new Date(logEntry.performed_at).toLocaleString('en-US', {
      timeZone: 'Africa/Casablanca',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }),
    deviceSummary: logEntry.device_info ? 
      `${logEntry.device_info.platform} - ${logEntry.device_info.userAgent.split(' ')[0]}` : 
      'Unknown Device'
  };
};

export default {
  logRentalAction,
  logRentalStart,
  logRentalComplete,
  logMediaCapture,
  logMediaDeletion,
  logRentalCancel,
  getRentalAuditLogs,
  formatAuditLogEntry
};
