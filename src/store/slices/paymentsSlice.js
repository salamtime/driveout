// src/store/slices/paymentsSlice.js
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { supabase } from '../../utils/supabaseClient';
import { updateBookingStatus } from './bookingsSlice';

// Create a payment
export const createPayment = createAsyncThunk(
  'payments/createPayment',
  async (paymentData, { rejectWithValue }) => {
    try {
      // Ensure we have a user email
      if (!paymentData.user_email) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          paymentData.user_email = user.email;
        } else {
          throw new Error('User email is required for payment');
        }
      }

      // Set initial payment status to 'processing'
      const paymentRecord = {
        ...paymentData,
        status: paymentData.status || 'processing', // Default to processing if status not specified
        created_at: new Date().toISOString()
      };

      // Insert payment record
      const { data, error } = await supabase
        .from('saharax_0u4w4d_payments')
        .insert(paymentRecord)
        .select()
        .single();

      if (error) throw new Error(error.message);

      return data;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

// Process payment and update booking
export const processPayment = createAsyncThunk(
  'payments/processPayment',
  async ({ paymentMethodId, bookingData }, { rejectWithValue, dispatch }) => {
    try {
      // Create initial payment record
      const paymentData = {
        user_email: bookingData.user_email,
        amount: bookingData.totalPrice,
        currency: 'USD',
        payment_method: 'card',
        payment_method_id: paymentMethodId,
        booking_id: bookingData.id || null,
      };

      // Create payment record
      const { data: payment, error } = await supabase
        .from('saharax_0u4w4d_payments')
        .insert(paymentData)
        .select()
        .single();

      if (error) throw new Error(error.message);

      // In a real implementation, you would process the payment through a server-side API
      // Here we'll simulate a successful payment after a brief delay
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Update payment status to succeeded
      const { data: updatedPayment, error: updateError } = await supabase
        .from('saharax_0u4w4d_payments')
        .update({ 
          status: 'succeeded',
          updated_at: new Date().toISOString()
        })
        .eq('id', payment.id)
        .select()
        .single();

      if (updateError) throw new Error(updateError.message);

      // If we have a booking ID, update the booking payment status
      if (bookingData.id) {
        // Determine booking type (rental or tour)
        const bookingType = bookingData.type || 'rental'; // Default to rental if not specified
        const tableName = bookingType === 'rental' ? 'saharax_0u4w4d_rental_bookings' : 'saharax_0u4w4d_tour_bookings';

        // Update booking with payment information
        const { error: bookingError } = await supabase
          .from(tableName)
          .update({ 
            payment_status: 'paid',
            payment_id: payment.id,
            updated_at: new Date().toISOString()
          })
          .eq('id', bookingData.id);

        if (bookingError) throw new Error(bookingError.message);

        // Also update booking status in the Redux store
        dispatch(updateBookingStatus({ 
          id: bookingData.id, 
          status: 'confirmed',
          paymentStatus: 'paid'
        }));
      }

      return updatedPayment;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

// Update payment status
export const updatePaymentStatus = createAsyncThunk(
  'payments/updatePaymentStatus',
  async ({ paymentId, status }, { rejectWithValue, dispatch, getState }) => {
    try {
      // Update payment status
      const { data: updatedPayment, error } = await supabase
        .from('saharax_0u4w4d_payments')
        .update({ 
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', paymentId)
        .select()
        .single();

      if (error) throw new Error(error.message);

      // If payment is associated with a booking, update booking status
      if (updatedPayment.booking_id) {
        // Get the booking to determine its type
        const bookings = getState().bookings.items;
        const booking = bookings.find(b => b.id === updatedPayment.booking_id);
        let bookingType = 'rental';
        
        if (booking) {
          bookingType = booking.type;
        }

        // Calculate booking payment status based on payment status
        let bookingPaymentStatus;
        switch (status) {
          case 'succeeded':
            bookingPaymentStatus = 'paid';
            break;
          case 'refunded':
            bookingPaymentStatus = 'refunded';
            break;
          case 'failed':
            bookingPaymentStatus = 'failed';
            break;
          default:
            bookingPaymentStatus = 'pending';
        }

        // Update the booking payment status
        const tableName = bookingType === 'rental' ? 'saharax_0u4w4d_rental_bookings' : 'saharax_0u4w4d_tour_bookings';
        await supabase
          .from(tableName)
          .update({ 
            payment_status: bookingPaymentStatus,
            updated_at: new Date().toISOString()
          })
          .eq('id', updatedPayment.booking_id);

        // Also update booking status in the Redux store if needed
        if (status === 'succeeded') {
          dispatch(updateBookingStatus({ 
            id: updatedPayment.booking_id, 
            status: 'confirmed',
            paymentStatus: 'paid'
          }));
        }
      }

      return updatedPayment;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

// Get user payments
export const fetchUserPayments = createAsyncThunk(
  'payments/fetchUserPayments',
  async (_, { rejectWithValue }) => {
    try {
      // Get the current authenticated user
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Fetch payments for the user
      const { data, error } = await supabase
        .from('saharax_0u4w4d_payments')
        .select(`
          *,
          saharax_0u4w4d_rental_bookings(*),
          saharax_0u4w4d_tour_bookings(*)
        `)
        .eq('user_email', user.email)
        .order('created_at', { ascending: false });

      if (error) throw new Error(error.message);

      return data || [];
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

// Get booking payments
export const fetchBookingPayments = createAsyncThunk(
  'payments/fetchBookingPayments',
  async (bookingId, { rejectWithValue }) => {
    try {
      const { data, error } = await supabase
        .from('saharax_0u4w4d_payments')
        .select('*')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: false });

      if (error) throw new Error(error.message);

      return data || [];
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

// Link payment to booking
export const linkPaymentToBooking = createAsyncThunk(
  'payments/linkPaymentToBooking',
  async ({ paymentId, bookingId, bookingType = 'rental' }, { rejectWithValue, dispatch }) => {
    try {
      // Update payment with booking ID
      const { data: updatedPayment, error } = await supabase
        .from('saharax_0u4w4d_payments')
        .update({ 
          booking_id: bookingId,
          updated_at: new Date().toISOString()
        })
        .eq('id', paymentId)
        .select()
        .single();

      if (error) throw new Error(error.message);

      // Update booking with payment information if payment was successful
      if (updatedPayment.status === 'succeeded') {
        const tableName = bookingType === 'rental' ? 'saharax_0u4w4d_rental_bookings' : 'saharax_0u4w4d_tour_bookings';
        
        await supabase
          .from(tableName)
          .update({ 
            payment_status: 'paid',
            payment_id: paymentId,
            updated_at: new Date().toISOString()
          })
          .eq('id', bookingId);

        // Update booking status in Redux store
        dispatch(updateBookingStatus({ 
          id: bookingId, 
          status: 'confirmed',
          paymentStatus: 'paid'
        }));
      }

      return updatedPayment;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

// Initial state
const initialState = {
  currentPayment: null,
  userPayments: [],
  bookingPayments: [],
  loading: false,
  error: null,
  successMessage: null
};

const paymentsSlice = createSlice({
  name: 'payments',
  initialState,
  reducers: {
    setCurrentPayment: (state, action) => {
      state.currentPayment = action.payload;
    },
    clearCurrentPayment: (state) => {
      state.currentPayment = null;
    },
    clearPaymentError: (state) => {
      state.error = null;
    },
    clearSuccessMessage: (state) => {
      state.successMessage = null;
    }
  },
  extraReducers: (builder) => {
    builder
      // Create Payment
      .addCase(createPayment.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createPayment.fulfilled, (state, action) => {
        state.loading = false;
        state.currentPayment = action.payload;
        state.userPayments = [action.payload, ...state.userPayments];
        state.successMessage = 'Payment record created';
      })
      .addCase(createPayment.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Process Payment
      .addCase(processPayment.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(processPayment.fulfilled, (state, action) => {
        state.loading = false;
        state.currentPayment = action.payload;
        
        // Update in userPayments if it exists
        const index = state.userPayments.findIndex(p => p.id === action.payload.id);
        if (index !== -1) {
          state.userPayments[index] = action.payload;
        } else {
          state.userPayments = [action.payload, ...state.userPayments];
        }
        
        state.successMessage = 'Payment processed successfully';
      })
      .addCase(processPayment.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Update Payment Status
      .addCase(updatePaymentStatus.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updatePaymentStatus.fulfilled, (state, action) => {
        state.loading = false;
        
        // Update in userPayments if it exists
        const index = state.userPayments.findIndex(p => p.id === action.payload.id);
        if (index !== -1) {
          state.userPayments[index] = action.payload;
        }
        
        // Update in bookingPayments if it exists
        const bookingIndex = state.bookingPayments.findIndex(p => p.id === action.payload.id);
        if (bookingIndex !== -1) {
          state.bookingPayments[bookingIndex] = action.payload;
        }
        
        // Update currentPayment if it matches
        if (state.currentPayment && state.currentPayment.id === action.payload.id) {
          state.currentPayment = action.payload;
        }
        
        state.successMessage = 'Payment status updated';
      })
      .addCase(updatePaymentStatus.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Fetch User Payments
      .addCase(fetchUserPayments.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchUserPayments.fulfilled, (state, action) => {
        state.loading = false;
        state.userPayments = action.payload;
      })
      .addCase(fetchUserPayments.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Fetch Booking Payments
      .addCase(fetchBookingPayments.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchBookingPayments.fulfilled, (state, action) => {
        state.loading = false;
        state.bookingPayments = action.payload;
      })
      .addCase(fetchBookingPayments.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Link Payment to Booking
      .addCase(linkPaymentToBooking.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(linkPaymentToBooking.fulfilled, (state, action) => {
        state.loading = false;
        
        // Update in userPayments if it exists
        const index = state.userPayments.findIndex(p => p.id === action.payload.id);
        if (index !== -1) {
          state.userPayments[index] = action.payload;
        }
        
        // Update currentPayment if it matches
        if (state.currentPayment && state.currentPayment.id === action.payload.id) {
          state.currentPayment = action.payload;
        }
        
        state.successMessage = 'Payment linked to booking';
      })
      .addCase(linkPaymentToBooking.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  }
});

export const { 
  setCurrentPayment, 
  clearCurrentPayment, 
  clearPaymentError, 
  clearSuccessMessage 
} = paymentsSlice.actions;

export default paymentsSlice.reducer;