import { supabase } from '../utils/supabaseClient';
import videoCaptureService from './videoCaptureService';

/**
 * Service for handling rental closing operations with video validation
 */
class RentalClosingService {
  /**
   * Check if user has permission to close rentals
   */
  async checkClosingPermissions(rentalId) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return {
          canClose: false,
          userRole: null,
          requiredRoles: ['owner', 'admin'],
          reason: 'User not authenticated'
        };
      }

      const userRole = user.user_metadata?.role;
      const canClose = ['owner', 'admin'].includes(userRole);

      return {
        canClose,
        userRole,
        requiredRoles: ['owner', 'admin'],
        reason: canClose ? null : 'You don\'t have permission to close contracts. Ask an Admin or the Owner.'
      };
    } catch (error) {
      console.error('Error checking closing permissions:', error);
      return {
        canClose: false,
        userRole: null,
        requiredRoles: ['owner', 'admin'],
        reason: 'Permission check failed'
      };
    }
  }

  /**
   * Get closing requirements for a rental
   */
  async getClosingRequirements(rentalId) {
    try {
      // Get rental details
      const { data: rental, error: rentalError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .select('*')
        .eq('id', rentalId)
        .single();

      if (rentalError) throw rentalError;

      // Check if video exists
      const videos = await videoCaptureService.getVideosForRental(rentalId);
      const validVideo = videos.find(v => v.validation_status === 'valid');

      // Check payment status
      const paymentComplete = this.isPaymentComplete(rental);

      // Check timing (rental should be ended)
      const timingValid = this.isRentalEnded(rental);

      const blockers = [];
      if (!validVideo) blockers.push('Valid closing video required');
      if (!paymentComplete) blockers.push('Payment must be completed');
      if (!timingValid) blockers.push('Rental must be ended to close');

      return {
        videoRequired: true,
        videoPresent: !!validVideo,
        videoValid: !!validVideo,
        timingValid,
        paymentComplete,
        canProceed: blockers.length === 0,
        blockers,
        rental
      };
    } catch (error) {
      console.error('Error getting closing requirements:', error);
      throw error;
    }
  }

  /**
   * Check if payment is complete
   */
  isPaymentComplete(rental) {
    const tolerance = 0.01;
    const totalAmount = parseFloat(rental.total_amount || 0);
    const depositAmount = parseFloat(rental.deposit_amount || 0);
    const remainingAmount = Math.max(0, totalAmount - depositAmount);
    
    return remainingAmount <= tolerance || rental.payment_status === 'paid_in_full';
  }

  /**
   * Check if rental has ended
   */
  isRentalEnded(rental) {
    const now = new Date();
    const endDate = new Date(rental.rental_end_date);
    return now >= endDate;
  }

  /**
   * Close rental with video validation
   */
  async closeRental(rentalId, videoId) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Check permissions
      const permissionCheck = await this.checkClosingPermissions(rentalId);
      if (!permissionCheck.canClose) {
        throw new Error(permissionCheck.reason);
      }

      // Validate requirements
      const requirements = await this.getClosingRequirements(rentalId);
      if (!requirements.canProceed) {
        throw new Error(`Cannot close rental: ${requirements.blockers.join(', ')}`);
      }

      // Validate video
      const video = await videoCaptureService.getVideo(videoId);
      if (!video || video.validation_status !== 'valid') {
        throw new Error('Valid video is required to close rental');
      }

      // Update rental status
      const { data: updatedRental, error: updateError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update({
          rental_status: 'completed',
          updated_at: new Date().toISOString()
        })
        .eq('id', rentalId)
        .select()
        .single();

      if (updateError) throw updateError;

      // Log successful closing
      await videoCaptureService.logAuditEvent({
        rentalId,
        actionType: 'close_success',
        performedBy: user.id,
        userRole: user.user_metadata?.role || 'unknown',
        success: true,
        sessionData: { videoId, method: 'video_validated' }
      });

      return {
        rental: updatedRental,
        video,
        closedAt: new Date().toISOString(),
        closedBy: user.id
      };
    } catch (error) {
      console.error('Error closing rental:', error);
      
      // Log failure
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await videoCaptureService.logAuditEvent({
          rentalId,
          actionType: 'close_failed',
          performedBy: user.id,
          userRole: user.user_metadata?.role || 'unknown',
          success: false,
          failureReason: error.message
        });
      }
      
      throw error;
    }
  }

  /**
   * Admin override close (without video)
   */
  async adminOverrideClose(rentalId, reason, pin, totpCode) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const userRole = user.user_metadata?.role;
      if (!['owner', 'admin'].includes(userRole)) {
        throw new Error('Only Owner and Admin can use override');
      }

      // Validate PIN (simplified - in production, use proper hashing)
      const isValidPin = await this.validateAdminPin(user.id, pin);
      if (!isValidPin) {
        throw new Error('Invalid PIN');
      }

      // Log override attempt
      await videoCaptureService.logAuditEvent({
        rentalId,
        actionType: 'override_attempt',
        performedBy: user.id,
        userRole,
        success: false,
        overrideReason: reason
      });

      // Update rental with override flag
      const { data: updatedRental, error: updateError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update({
          rental_status: 'completed',
          updated_at: new Date().toISOString(),
          notes: `${updatedRental?.notes || ''}\n\n[ADMIN OVERRIDE] Closed without video by ${user.email}. Reason: ${reason}`
        })
        .eq('id', rentalId)
        .select()
        .single();

      if (updateError) throw updateError;

      // Log successful override
      await videoCaptureService.logAuditEvent({
        rentalId,
        actionType: 'override_success',
        performedBy: user.id,
        userRole,
        success: true,
        overrideReason: reason,
        overrideApprovedBy: user.id
      });

      return {
        rental: updatedRental,
        overrideUsed: true,
        overrideReason: reason,
        closedAt: new Date().toISOString(),
        closedBy: user.id
      };
    } catch (error) {
      console.error('Error in admin override:', error);
      
      // Log failure
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await videoCaptureService.logAuditEvent({
          rentalId,
          actionType: 'override_attempt',
          performedBy: user.id,
          userRole: user.user_metadata?.role || 'unknown',
          success: false,
          failureReason: error.message,
          overrideReason: reason
        });
      }
      
      throw error;
    }
  }

  /**
   * Validate admin PIN (simplified implementation)
   */
  async validateAdminPin(userId, pin) {
    try {
      // In a real implementation, this would check against hashed PINs
      // For demo purposes, we'll use a simple check
      const { data, error } = await supabase
        .from('admin_override_settings')
        .select('pin_hash')
        .eq('user_id', userId)
        .eq('is_enabled', true)
        .single();

      if (error || !data) {
        // If no PIN is set, create a default one (1234 for demo)
        const defaultPinHash = await this.hashPin('1234');
        await supabase
          .from('admin_override_settings')
          .upsert({
            user_id: userId,
            pin_hash: defaultPinHash,
            is_enabled: true
          });
        return pin === '1234';
      }

      const hashedPin = await this.hashPin(pin);
      return hashedPin === data.pin_hash;
    } catch (error) {
      console.error('Error validating admin PIN:', error);
      return false;
    }
  }

  /**
   * Hash PIN (simplified - use proper crypto in production)
   */
  async hashPin(pin) {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Get audit trail for rental
   */
  async getAuditTrail(rentalId) {
    try {
      const { data, error } = await supabase
        .from('rental_closing_audit')
        .select(`
          *,
          performed_by_user:auth.users!performed_by(email, raw_user_meta_data)
        `)
        .eq('rental_id', rentalId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting audit trail:', error);
      throw error;
    }
  }
}

export default new RentalClosingService();