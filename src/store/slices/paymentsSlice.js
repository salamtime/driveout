// src/store/slices/paymentsSlice.js
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { updateBookingStatus } from './bookingsSlice';
import PaymentService from '../../services/PaymentService';

// Create a payment
export const createPayment = createAsyncThunk(
  'payments/createPayment',
  async (paymentData, { rejectWithValue }) => {
    try {
      return await PaymentService.createPayment(paymentData);
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
      const updatedPayment = await PaymentService.processPayment({ paymentMethodId, bookingData });

      if (bookingData?.id) {
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
      const updatedPayment = await PaymentService.updatePaymentStatus(paymentId, status);

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
        await PaymentService.syncBookingPaymentStatus({
          bookingId: updatedPayment.booking_id,
          bookingType,
          paymentId,
          paymentStatus: bookingPaymentStatus,
        });

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
      return await PaymentService.getUserPayments();
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
      return await PaymentService.getPaymentsByBookingId(bookingId);
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
      const updatedPayment = await PaymentService.linkPaymentToBookingWithType(paymentId, bookingId, bookingType);

      // Update booking with payment information if payment was successful
      if (updatedPayment.status === 'succeeded') {
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
