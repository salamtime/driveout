/**
 * Media Service for handling media operations
 * Includes delete functionality with proper permissions and audit logging
 */

import { supabaseClient } from '../lib/supabase';
import { logRentalAction } from './auditLogService';

/**
 * Delete media file from both Supabase Storage and database
 * @param {Object} params - Delete parameters
 * @param {string} params.mediaId - The media record ID
 * @param {string} params.rentalId - The rental ID
 * @param {string} params.userId - The user performing the deletion
 * @param {string} params.userRole - The user's role (for permissions)
 * @param {Object} params.mediaData - The media data to delete
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export const deleteMedia = async ({ mediaId, rentalId, userId, userRole, mediaData }) => {
  try {
    console.log('Attempting to delete media:', { mediaId, rentalId, userId, userRole });

    // Check permissions
    const canDelete = checkDeletePermissions(userId, userRole, mediaData);
    if (!canDelete.allowed) {
      return { success: false, error: canDelete.reason };
    }

    // Delete from Supabase Storage first
    if (mediaData.storage_path) {
      console.log('Deleting from storage:', mediaData.storage_path);
      
      const { error: storageError } = await supabaseClient.storage
        .from('rental-media')
        .remove([mediaData.storage_path]);

      if (storageError) {
        console.error('Storage deletion error:', storageError);
        // Continue with database deletion even if storage fails
        // The file might already be deleted or path might be incorrect
      }
    }

    // Delete from database
    const { error: dbError } = await supabaseClient
      .from('app_2f7bf469b0_rental_media')
      .delete()
      .eq('id', mediaId);

    if (dbError) {
      console.error('Database deletion error:', dbError);
      return { success: false, error: `Failed to delete media record: ${dbError.message}` };
    }

    // Log the deletion in audit trail
    await logMediaDeletion(rentalId, userId, mediaData);

    console.log('Media deleted successfully:', mediaId);
    return { success: true };

  } catch (error) {
    console.error('Error deleting media:', error);
    return { success: false, error: error.message || 'Failed to delete media' };
  }
};

/**
 * Check if user has permission to delete media
 * @param {string} userId - The user ID
 * @param {string} userRole - The user's role
 * @param {Object} mediaData - The media data
 * @returns {Object} Permission result
 */
const checkDeletePermissions = (userId, userRole, mediaData) => {
  // Admin and Owner can delete any media
  if (userRole === 'admin' || userRole === 'owner') {
    return { allowed: true };
  }

  // Users can delete their own uploaded media
  if (mediaData.uploaded_by === userId) {
    return { allowed: true };
  }

  // Staff can delete media from rentals they're managing
  if (userRole === 'staff') {
    // Additional check could be added here to verify if staff is assigned to this rental
    return { allowed: true };
  }

  return { 
    allowed: false, 
    reason: 'You do not have permission to delete this media file' 
  };
};

/**
 * Log media deletion in audit trail
 * @param {string} rentalId - The rental ID
 * @param {string} userId - The user who deleted the media
 * @param {Object} mediaData - The deleted media data
 */
const logMediaDeletion = async (rentalId, userId, mediaData) => {
  try {
    await logRentalAction({
      rentalId,
      action: `delete_${mediaData.phase}_media`,
      userId,
      oldData: {
        media_id: mediaData.id,
        media_type: mediaData.file_type,
        media_phase: mediaData.phase,
        media_filename: mediaData.original_filename,
        media_size: mediaData.file_size,
        storage_path: mediaData.storage_path
      },
      newData: null,
      reason: 'Media file deleted by user',
      metadata: {
        action_type: 'media_deletion',
        media_type: mediaData.file_type,
        phase: mediaData.phase,
        file_size_bytes: mediaData.file_size,
        deletion_method: 'user_initiated'
      }
    });
  } catch (error) {
    console.error('Error logging media deletion:', error);
    // Don't throw error to avoid blocking the deletion
  }
};

/**
 * Bulk delete multiple media files
 * @param {Object} params - Bulk delete parameters
 * @param {Array} params.mediaItems - Array of media items to delete
 * @param {string} params.rentalId - The rental ID
 * @param {string} params.userId - The user performing the deletion
 * @param {string} params.userRole - The user's role
 * @returns {Promise<{success: boolean, results: Array, errors: Array}>}
 */
export const bulkDeleteMedia = async ({ mediaItems, rentalId, userId, userRole }) => {
  const results = [];
  const errors = [];

  for (const mediaItem of mediaItems) {
    try {
      const result = await deleteMedia({
        mediaId: mediaItem.id,
        rentalId,
        userId,
        userRole,
        mediaData: mediaItem
      });

      if (result.success) {
        results.push({ mediaId: mediaItem.id, success: true });
      } else {
        errors.push({ mediaId: mediaItem.id, error: result.error });
      }
    } catch (error) {
      errors.push({ mediaId: mediaItem.id, error: error.message });
    }
  }

  return {
    success: errors.length === 0,
    results,
    errors
  };
};

/**
 * Get media file info for deletion confirmation
 * @param {string} mediaId - The media ID
 * @returns {Promise<Object>} Media info
 */
export const getMediaInfo = async (mediaId) => {
  try {
    const { data, error } = await supabaseClient
      .from('app_2f7bf469b0_rental_media')
      .select('*')
      .eq('id', mediaId)
      .single();

    if (error) {
      throw new Error(`Failed to fetch media info: ${error.message}`);
    }

    return { success: true, data };
  } catch (error) {
    console.error('Error fetching media info:', error);
    return { success: false, error: error.message };
  }
};

export default {
  deleteMedia,
  bulkDeleteMedia,
  getMediaInfo,
  checkDeletePermissions
};