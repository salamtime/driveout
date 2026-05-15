import { supabase } from '../utils/supabaseClient';
import { TBL } from '../config/tables.js';
import { TABLE_NAMES } from '../config/tableNames.js';
import { applyOrganizationScope, getCurrentOrganizationId } from './OrganizationService';

/**
 * PaymentService provides methods for handling payment operations
 */
class PaymentService {
  async getBookingTableName(bookingType = 'rental') {
    const normalizedType = String(bookingType || 'rental').trim().toLowerCase();
    if (normalizedType === 'tour') {
      return TABLE_NAMES.TOUR_BOOKINGS;
    }
    return 'saharax_0u4w4d_rental_bookings';
  }

  async updateScopedBookingRecord(tableName, bookingId, payload, bookingType = 'rental') {
    let query = supabase
      .from(tableName)
      .update(payload)
      .eq('id', bookingId);

    if (String(bookingType || '').trim().toLowerCase() === 'tour') {
      const organizationId = await getCurrentOrganizationId();
      query = applyOrganizationScope(query, organizationId);
    }

    const { error } = await query;
    if (error) {
      throw new Error(error.message);
    }
  }

  async getCurrentUserEmail(fallbackEmail = '') {
    if (fallbackEmail) return fallbackEmail;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      throw new Error('User email is required for payment');
    }
    return user.email;
  }

  /**
   * Create a new payment record
   * @param {Object} paymentData - Payment information
   * @param {string} paymentData.user_email - User email
   * @param {string|null} paymentData.booking_id - ID of the associated booking (optional)
   * @param {number} paymentData.amount - Payment amount
   * @param {string} paymentData.currency - Currency code (e.g., 'USD')
   * @param {string} paymentData.payment_method - Payment method (e.g., 'card')
   * @param {string} paymentData.payment_method_id - ID from payment processor
   * @returns {Promise<Object>} - Created payment record
   */
  async createPayment(paymentData) {
    try {
      const userEmail = await this.getCurrentUserEmail(paymentData.user_email);

      // Set initial payment status to 'processing'
      const paymentRecord = {
        ...paymentData,
        user_email: userEmail,
        status: 'processing',
        created_at: new Date().toISOString()
      };

      // Insert payment record
      const { data, error } = await supabase
        .from(TBL.PAYMENTS)
        .insert(paymentRecord)
        .select()
        .single();

      if (error) {
        console.error('Payment creation failed:', error);
        throw new Error(`Failed to create payment: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error('Payment Service Error:', error);
      throw error;
    }
  }

  /**
   * Update payment status
   * @param {string} paymentId - Payment record ID
   * @param {string} status - New payment status ('succeeded', 'failed', 'refunded', etc.)
   * @returns {Promise<Object>} - Updated payment record
   */
  async updatePaymentStatus(paymentId, status) {
    try {
      const { data, error } = await supabase
        .from(TBL.PAYMENTS)
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', paymentId)
        .select()
        .single();

      if (error) {
        console.error('Payment status update failed:', error);
        throw new Error(`Failed to update payment status: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error('Payment Service Error:', error);
      throw error;
    }
  }

  /**
   * Get payment by ID
   * @param {string} paymentId - Payment record ID
   * @returns {Promise<Object>} - Payment record
   */
  async getPaymentById(paymentId) {
    try {
      const { data, error } = await supabase
        .from(TBL.PAYMENTS)
        .select('*')
        .eq('id', paymentId)
        .single();

      if (error) {
        console.error('Payment retrieval failed:', error);
        throw new Error(`Failed to retrieve payment: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error('Payment Service Error:', error);
      throw error;
    }
  }

  /**
   * Get payments for a specific booking
   * @param {string} bookingId - Booking ID
   * @returns {Promise<Array>} - List of payment records
   */
  async getPaymentsByBookingId(bookingId) {
    try {
      const { data, error } = await supabase
        .from(TBL.PAYMENTS)
        .select('*')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Payments retrieval failed:', error);
        throw new Error(`Failed to retrieve payments: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error('Payment Service Error:', error);
      throw error;
    }
  }

  /**
   * Get all payments for the current user
   * @returns {Promise<Array>} - List of payment records
   */
  async getUserPayments() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase
        .from(TBL.PAYMENTS)
        .select('*')
        .eq('user_email', user.email)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('User payments retrieval failed:', error);
        throw new Error(`Failed to retrieve user payments: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error('Payment Service Error:', error);
      throw error;
    }
  }

  /**
   * Process stripe payment with API backend
   * In a real implementation, this would call your backend API
   * @param {Object} paymentData - Payment information
   * @returns {Promise<Object>} - Payment processing result
   */
  async processStripePayment(paymentData) {
    try {
      // In a real app, this would be an API call to your backend
      // For the demo, we'll simulate a successful payment after a delay
      
      // First create a payment record
      const paymentRecord = await this.createPayment(paymentData);
      
      // Simulate payment processing delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Update payment status to succeeded
      const updatedPayment = await this.updatePaymentStatus(paymentRecord.id, 'succeeded');
      
      return {
        success: true,
        payment: updatedPayment
      };
    } catch (error) {
      console.error('Stripe payment processing error:', error);
      throw error;
    }
  }

  async processPayment({ paymentMethodId, bookingData }) {
    const paymentData = {
      user_email: await this.getCurrentUserEmail(bookingData?.user_email),
      amount: bookingData?.totalPrice,
      currency: bookingData?.currency || 'USD',
      payment_method: 'card',
      payment_method_id: paymentMethodId,
      booking_id: bookingData?.id || null,
    };

    const paymentRecord = await this.createPayment(paymentData);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const updatedPayment = await this.updatePaymentStatus(paymentRecord.id, 'succeeded');

    if (bookingData?.id) {
      const bookingType = bookingData?.type || 'rental';
      const tableName = await this.getBookingTableName(bookingType);
      await this.updateScopedBookingRecord(
        tableName,
        bookingData.id,
        {
          payment_status: 'paid',
          payment_id: paymentRecord.id,
          updated_at: new Date().toISOString(),
        },
        bookingType
      );
    }

    return updatedPayment;
  }

  /**
   * Link payment to a booking
   * @param {string} paymentId - Payment record ID
   * @param {string} bookingId - Booking ID
   * @returns {Promise<Object>} - Updated payment record
   */
  async linkPaymentToBooking(paymentId, bookingId) {
    try {
      const { data, error } = await supabase
        .from(TBL.PAYMENTS)
        .update({ 
          booking_id: bookingId,
          updated_at: new Date().toISOString() 
        })
        .eq('id', paymentId)
        .select()
        .single();

      if (error) {
        console.error('Payment link to booking failed:', error);
        throw new Error(`Failed to link payment to booking: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error('Payment Service Error:', error);
      throw error;
    }
  }

  async linkPaymentToBookingWithType(paymentId, bookingId, bookingType = 'rental') {
    const updatedPayment = await this.linkPaymentToBooking(paymentId, bookingId);

    if (updatedPayment?.status === 'succeeded') {
      await this.syncBookingPaymentStatus({
        bookingId,
        bookingType,
        paymentId,
        paymentStatus: 'paid',
      });
    }

    return updatedPayment;
  }

  async syncBookingPaymentStatus({ bookingId, bookingType = 'rental', paymentId = null, paymentStatus }) {
    const tableName = await this.getBookingTableName(bookingType);
    const updatePayload = {
      payment_status: paymentStatus,
      updated_at: new Date().toISOString(),
    };

    if (paymentId) {
      updatePayload.payment_id = paymentId;
    }

    await this.updateScopedBookingRecord(tableName, bookingId, updatePayload, bookingType);
  }
}

export default new PaymentService();
