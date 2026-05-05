import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import RentalService from '../../services/RentalService';

// Helper function to get vehicle field value
const getVehicleField = (vehicle, field) => {
  if (!vehicle) return '';
  return vehicle[field] || '';
};

// Async thunks for rental operations
export const fetchRentals = createAsyncThunk(
  'rentals/fetchRentals',
  async (_, { rejectWithValue }) => {
    try {
      return await RentalService.getAllRentalsDetailed();
    } catch (error) {
      console.error(`❌ Exception fetching rentals:`, error);
      return rejectWithValue(error.message);
    }
  }
);

export const createRental = createAsyncThunk(
  'rentals/createRental',
  async (rentalData, { rejectWithValue }) => {
    try {
      return await RentalService.createRentalRecord(rentalData);
    } catch (error) {
      console.error(`❌ Exception creating rental:`, error);
      return rejectWithValue(error.message);
    }
  }
);

export const updateRental = createAsyncThunk(
  'rentals/updateRental',
  async ({ id, updates }, { rejectWithValue }) => {
    try {
      return await RentalService.updateRentalRecord(id, updates);
    } catch (error) {
      console.error(`❌ Exception updating rental:`, error);
      return rejectWithValue(error.message);
    }
  }
);

export const deleteRental = createAsyncThunk(
  'rentals/deleteRental',
  async (id, { rejectWithValue }) => {
    try {
      return await RentalService.deleteRentalRecord(id);
    } catch (error) {
      console.error(`❌ Exception deleting rental:`, error);
      return rejectWithValue(error.message);
    }
  }
);

const rentalsSlice = createSlice({
  name: 'rentals',
  initialState: {
    rentals: [],
    loading: false,
    error: null,
    selectedRental: null,
  },
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    setSelectedRental: (state, action) => {
      state.selectedRental = action.payload;
    },
    clearSelectedRental: (state) => {
      state.selectedRental = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch rentals
      .addCase(fetchRentals.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchRentals.fulfilled, (state, action) => {
        state.loading = false;
        state.rentals = action.payload;
        state.error = null;
      })
      .addCase(fetchRentals.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Create rental
      .addCase(createRental.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createRental.fulfilled, (state, action) => {
        state.loading = false;
        state.rentals.unshift(action.payload);
        state.error = null;
      })
      .addCase(createRental.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Update rental
      .addCase(updateRental.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateRental.fulfilled, (state, action) => {
        state.loading = false;
        const index = state.rentals.findIndex(r => r.id === action.payload.id);
        if (index !== -1) {
          state.rentals[index] = action.payload;
        }
        if (state.selectedRental?.id === action.payload.id) {
          state.selectedRental = action.payload;
        }
        state.error = null;
      })
      .addCase(updateRental.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Delete rental
      .addCase(deleteRental.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(deleteRental.fulfilled, (state, action) => {
        state.loading = false;
        state.rentals = state.rentals.filter(r => r.id !== action.payload);
        if (state.selectedRental?.id === action.payload) {
          state.selectedRental = null;
        }
        state.error = null;
      })
      .addCase(deleteRental.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { clearError, setSelectedRental, clearSelectedRental } = rentalsSlice.actions;

// Selectors
export const selectRentals = (state) => state.rentals.rentals;
export const selectRentalsLoading = (state) => state.rentals.loading;
export const selectRentalsError = (state) => state.rentals.error;
export const selectSelectedRental = (state) => state.rentals.selectedRental;
export const selectRentalById = (id) => (state) => 
  state.rentals.rentals.find(rental => rental.id === id);

// Additional selectors for dashboard stats
export const selectActiveRentals = (state) => 
  state.rentals.rentals.filter(rental => rental.rental_status === 'active');

export const selectRentalsByStatus = (state, status) =>
  state.rentals.rentals.filter(rental => rental.rental_status === status);

export const selectRentalsCount = (state) => state.rentals.rentals.length;

export const selectActiveRentalsCount = (state) => 
  state.rentals.rentals.filter(rental => rental.rental_status === 'active').length;

export default rentalsSlice.reducer;
