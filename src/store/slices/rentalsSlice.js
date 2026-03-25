import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { supabase } from '../../utils/supabaseClient';
import { TBL, COLUMNS } from '../../config/tables';

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
      console.log(`🔧 Fetching rentals from table: ${TBL.RENTALS}`);
      
      const { data, error } = await supabase
        .from(TBL.RENTALS)
        .select(`
          *,
          vehicle:saharax_0u4w4d_vehicles(
            id, 
            name, 
            model, 
            plate_number, 
            vehicle_type, 
            status,
            power_cc,
            capacity,
            color,
            image_url
          )
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error(`❌ Error fetching rentals from ${TBL.RENTALS}:`, error);
        throw error;
      }

      console.log(`✅ Successfully fetched ${data?.length || 0} rentals from ${TBL.RENTALS}`);
      return data || [];
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
      console.log(`🔧 Creating rental in table: ${TBL.RENTALS}`, rentalData);
      
      const { data, error } = await supabase
        .from(TBL.RENTALS)
        .insert([rentalData])
        .select(`
          *,
          vehicle:saharax_0u4w4d_vehicles(
            id, 
            name, 
            model, 
            plate_number, 
            vehicle_type, 
            status
          )
        `)
        .single();

      if (error) {
        console.error(`❌ Error creating rental in ${TBL.RENTALS}:`, error);
        throw error;
      }

      console.log(`✅ Successfully created rental in ${TBL.RENTALS}:`, data);
      return data;
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
      console.log(`🔧 Updating rental ${id} in table: ${TBL.RENTALS}`, updates);
      
      const { data, error } = await supabase
        .from(TBL.RENTALS)
        .update(updates)
        .eq('id', id)
        .select(`
          *,
          vehicle:saharax_0u4w4d_vehicles(
            id, 
            name, 
            model, 
            plate_number, 
            vehicle_type, 
            status
          )
        `)
        .single();

      if (error) {
        console.error(`❌ Error updating rental ${id} in ${TBL.RENTALS}:`, error);
        throw error;
      }

      console.log(`✅ Successfully updated rental ${id} in ${TBL.RENTALS}:`, data);
      return data;
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
      console.log(`🔧 Deleting rental ${id} from table: ${TBL.RENTALS}`);
      
      const { error } = await supabase
        .from(TBL.RENTALS)
        .delete()
        .eq('id', id);

      if (error) {
        console.error(`❌ Error deleting rental ${id} from ${TBL.RENTALS}:`, error);
        throw error;
      }

      console.log(`✅ Successfully deleted rental ${id} from ${TBL.RENTALS}`);
      return id;
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