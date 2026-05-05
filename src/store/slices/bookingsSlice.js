import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import RentalService from '../../services/RentalService';

// Async thunk for fetching bookings
export const fetchBookings = createAsyncThunk(
  'bookings/fetchBookings',
  async (_, { rejectWithValue }) => {
    try {
      console.log('🔄 Fetching bookings from database...');
      const bookingsWithVehicles = await RentalService.getAllRentalsDetailed();
      console.log('✅ Fetched bookings successfully:', bookingsWithVehicles?.length || 0);
      return bookingsWithVehicles || [];
    } catch (error) {
      console.error('❌ fetchBookings failed:', error);
      return rejectWithValue(error.message);
    }
  }
);

// CRITICAL FIX: Add missing fetchAllBookings alias
export const fetchAllBookings = fetchBookings;

// Async thunk for adding a booking
export const addBooking = createAsyncThunk(
  'bookings/addBooking',
  async (bookingData, { rejectWithValue }) => {
    try {
      console.log('➕ Adding new booking:', bookingData);
      const bookingWithVehicle = await RentalService.createRentalRecord(bookingData);
      console.log('✅ Booking added successfully:', bookingWithVehicle);
      return bookingWithVehicle;
    } catch (error) {
      console.error('❌ addBooking failed:', error);
      return rejectWithValue(error.message);
    }
  }
);

// CRITICAL FIX: Add missing createBooking alias
export const createBooking = addBooking;

// CRITICAL FIX: Add missing createRentalBooking export
export const createRentalBooking = createAsyncThunk(
  'bookings/createRentalBooking',
  async (bookingData, { rejectWithValue }) => {
    try {
      console.log('🚀 Creating rental booking:', bookingData);
      const bookingWithVehicle = await RentalService.createRentalRecord(bookingData);
      console.log('✅ Rental booking created successfully:', bookingWithVehicle);
      return bookingWithVehicle;
    } catch (error) {
      console.error('❌ createRentalBooking failed:', error);
      return rejectWithValue(error.message);
    }
  }
);

// CRITICAL FIX: Add missing checkBookingConflicts export
export const checkBookingConflicts = createAsyncThunk(
  'bookings/checkBookingConflicts',
  async ({ vehicleId, startDate, endDate, excludeBookingId }, { rejectWithValue }) => {
    try {
      console.log('🔍 Checking booking conflicts for vehicle:', vehicleId);
      const result = await RentalService.checkRentalConflicts({
        vehicleId,
        startDate,
        endDate,
        excludeBookingId,
      });
      const hasConflicts = result.hasConflicts;
      console.log(`✅ Conflict check completed. Conflicts found: ${hasConflicts}`);
      return result;
    } catch (error) {
      console.error('❌ checkBookingConflicts failed:', error);
      return rejectWithValue(error.message);
    }
  }
);

// CRITICAL FIX: Add missing startTour and finishTour exports
export const startTour = createAsyncThunk(
  'bookings/startTour',
  async (bookingId, { rejectWithValue }) => {
    try {
      console.log('🚀 Starting tour for booking:', bookingId);
      const bookingWithVehicle = await RentalService.updateRentalStatus(bookingId, 'active');
      console.log('✅ Tour started successfully:', bookingWithVehicle);
      return bookingWithVehicle;
    } catch (error) {
      console.error('❌ startTour failed:', error);
      return rejectWithValue(error.message);
    }
  }
);

export const finishTour = createAsyncThunk(
  'bookings/finishTour',
  async (bookingId, { rejectWithValue }) => {
    try {
      console.log('🏁 Finishing tour for booking:', bookingId);
      const bookingWithVehicle = await RentalService.updateRentalStatus(bookingId, 'completed');
      console.log('✅ Tour finished successfully:', bookingWithVehicle);
      return bookingWithVehicle;
    } catch (error) {
      console.error('❌ finishTour failed:', error);
      return rejectWithValue(error.message);
    }
  }
);

// Async thunk for updating a booking
export const updateBooking = createAsyncThunk(
  'bookings/updateBooking',
  async ({ id, updates }, { rejectWithValue }) => {
    try {
      console.log('✏️ Updating booking:', id, updates);
      const bookingWithVehicle = await RentalService.updateRentalRecord(id, updates);
      console.log('✅ Booking updated successfully:', bookingWithVehicle);
      return bookingWithVehicle;
    } catch (error) {
      console.error('❌ updateBooking failed:', error);
      return rejectWithValue(error.message);
    }
  }
);

// Add the missing updateBookingStatus export
export const updateBookingStatus = createAsyncThunk(
  'bookings/updateBookingStatus',
  async ({ id, status }, { rejectWithValue }) => {
    try {
      console.log('📝 Updating booking status:', id, status);
      const bookingWithVehicle = await RentalService.updateRentalStatus(id, status);
      console.log('✅ Booking status updated successfully:', bookingWithVehicle);
      return bookingWithVehicle;
    } catch (error) {
      console.error('❌ updateBookingStatus failed:', error);
      return rejectWithValue(error.message);
    }
  }
);

// Async thunk for deleting a booking
export const deleteBooking = createAsyncThunk(
  'bookings/deleteBooking',
  async (bookingId, { rejectWithValue }) => {
    try {
      console.log('🗑️ Deleting booking:', bookingId);
      await RentalService.deleteRentalRecord(bookingId);
      console.log('✅ Booking deleted successfully:', bookingId);
      return bookingId;
    } catch (error) {
      console.error('❌ deleteBooking failed:', error);
      return rejectWithValue(error.message);
    }
  }
);

const initialState = {
  items: [],
  loading: false,
  error: null,
  lastUpdated: null,
  conflictCheck: {
    loading: false,
    hasConflicts: false,
    conflicts: []
  }
};

const bookingsSlice = createSlice({
  name: 'bookings',
  initialState,
  reducers: {
    // Synchronous actions
    clearBookings: (state) => {
      state.items = [];
      state.error = null;
    },
    clearBookingsError: (state) => {
      state.error = null;
    },
    clearConflictCheck: (state) => {
      state.conflictCheck = {
        loading: false,
        hasConflicts: false,
        conflicts: []
      };
    },
    // Real-time update actions
    addBookingRealtime: (state, action) => {
      const newBooking = action.payload;
      const existingIndex = state.items.findIndex(item => item.id === newBooking.id);
      
      if (existingIndex === -1) {
        state.items.unshift(newBooking);
      }
    },
    updateBookingRealtime: (state, action) => {
      const updatedBooking = action.payload;
      const index = state.items.findIndex(item => item.id === updatedBooking.id);
      
      if (index !== -1) {
        state.items[index] = { ...state.items[index], ...updatedBooking };
      }
    },
    removeBookingRealtime: (state, action) => {
      const bookingId = action.payload;
      state.items = state.items.filter(item => item.id !== bookingId);
    }
  },
  extraReducers: (builder) => {
    builder
      // fetchBookings
      .addCase(fetchBookings.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchBookings.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload;
        state.lastUpdated = new Date().toISOString();
        state.error = null;
      })
      .addCase(fetchBookings.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Failed to fetch bookings';
      })
      
      // addBooking
      .addCase(addBooking.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(addBooking.fulfilled, (state, action) => {
        state.loading = false;
        state.items.unshift(action.payload);
        state.error = null;
      })
      .addCase(addBooking.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Failed to add booking';
      })

      // CRITICAL FIX: Add createRentalBooking reducer cases
      .addCase(createRentalBooking.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createRentalBooking.fulfilled, (state, action) => {
        state.loading = false;
        state.items.unshift(action.payload);
        state.error = null;
      })
      .addCase(createRentalBooking.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Failed to create rental booking';
      })

      // CRITICAL FIX: Add checkBookingConflicts reducer cases
      .addCase(checkBookingConflicts.pending, (state) => {
        state.conflictCheck.loading = true;
      })
      .addCase(checkBookingConflicts.fulfilled, (state, action) => {
        state.conflictCheck.loading = false;
        state.conflictCheck.hasConflicts = action.payload.hasConflicts;
        state.conflictCheck.conflicts = action.payload.conflicts;
      })
      .addCase(checkBookingConflicts.rejected, (state, action) => {
        state.conflictCheck.loading = false;
        state.conflictCheck.hasConflicts = false;
        state.conflictCheck.conflicts = [];
      })

      // CRITICAL FIX: Add startTour reducer cases
      .addCase(startTour.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(startTour.fulfilled, (state, action) => {
        state.loading = false;
        const index = state.items.findIndex(item => item.id === action.payload.id);
        if (index !== -1) {
          state.items[index] = action.payload;
        }
        state.error = null;
      })
      .addCase(startTour.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Failed to start tour';
      })

      // CRITICAL FIX: Add finishTour reducer cases
      .addCase(finishTour.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(finishTour.fulfilled, (state, action) => {
        state.loading = false;
        const index = state.items.findIndex(item => item.id === action.payload.id);
        if (index !== -1) {
          state.items[index] = action.payload;
        }
        state.error = null;
      })
      .addCase(finishTour.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Failed to finish tour';
      })
      
      // updateBooking
      .addCase(updateBooking.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateBooking.fulfilled, (state, action) => {
        state.loading = false;
        const index = state.items.findIndex(item => item.id === action.payload.id);
        if (index !== -1) {
          state.items[index] = action.payload;
        }
        state.error = null;
      })
      .addCase(updateBooking.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Failed to update booking';
      })

      // updateBookingStatus
      .addCase(updateBookingStatus.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateBookingStatus.fulfilled, (state, action) => {
        state.loading = false;
        const index = state.items.findIndex(item => item.id === action.payload.id);
        if (index !== -1) {
          state.items[index] = action.payload;
        }
        state.error = null;
      })
      .addCase(updateBookingStatus.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Failed to update booking status';
      })
      
      // deleteBooking
      .addCase(deleteBooking.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(deleteBooking.fulfilled, (state, action) => {
        state.loading = false;
        state.items = state.items.filter(item => item.id !== action.payload);
        state.error = null;
      })
      .addCase(deleteBooking.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Failed to delete booking';
      });
  }
});

// Export actions
export const {
  clearBookings,
  clearBookingsError,
  clearConflictCheck,
  addBookingRealtime,
  updateBookingRealtime,
  removeBookingRealtime
} = bookingsSlice.actions;

// Export reducer
export default bookingsSlice.reducer;
