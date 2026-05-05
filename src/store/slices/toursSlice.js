import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import ToursService from '../../services/ToursService';

// Async thunks for tour operations
export const fetchTours = createAsyncThunk(
  'tours/fetchTours',
  async (_, { rejectWithValue }) => {
    try {
      return await ToursService.getAllTours();
    } catch (error) {
      console.error(`❌ Exception fetching tours:`, error);
      return rejectWithValue(error.message);
    }
  }
);

export const createTour = createAsyncThunk(
  'tours/createTour',
  async (tourData, { rejectWithValue }) => {
    try {
      return await ToursService.createTour(tourData);
    } catch (error) {
      console.error(`❌ Exception creating tour:`, error);
      return rejectWithValue(error.message);
    }
  }
);

export const updateTour = createAsyncThunk(
  'tours/updateTour',
  async ({ id, updates }, { rejectWithValue }) => {
    try {
      return await ToursService.updateTour(id, updates);
    } catch (error) {
      console.error(`❌ Exception updating tour:`, error);
      return rejectWithValue(error.message);
    }
  }
);

export const deleteTour = createAsyncThunk(
  'tours/deleteTour',
  async (id, { rejectWithValue }) => {
    try {
      await ToursService.deleteTour(id);
      return id;
    } catch (error) {
      console.error(`❌ Exception deleting tour:`, error);
      return rejectWithValue(error.message);
    }
  }
);

const toursSlice = createSlice({
  name: 'tours',
  initialState: {
    tours: [],
    loading: false,
    error: null,
    selectedTour: null,
  },
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    setSelectedTour: (state, action) => {
      state.selectedTour = action.payload;
    },
    clearSelectedTour: (state) => {
      state.selectedTour = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch tours
      .addCase(fetchTours.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTours.fulfilled, (state, action) => {
        state.loading = false;
        state.tours = action.payload;
        state.error = null;
      })
      .addCase(fetchTours.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Create tour
      .addCase(createTour.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createTour.fulfilled, (state, action) => {
        state.loading = false;
        state.tours.unshift(action.payload);
        state.error = null;
      })
      .addCase(createTour.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Update tour
      .addCase(updateTour.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateTour.fulfilled, (state, action) => {
        state.loading = false;
        const index = state.tours.findIndex(tour => tour.id === action.payload.id);
        if (index !== -1) {
          state.tours[index] = action.payload;
        }
        if (state.selectedTour?.id === action.payload.id) {
          state.selectedTour = action.payload;
        }
        state.error = null;
      })
      .addCase(updateTour.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Delete tour
      .addCase(deleteTour.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(deleteTour.fulfilled, (state, action) => {
        state.loading = false;
        state.tours = state.tours.filter(tour => tour.id !== action.payload);
        if (state.selectedTour?.id === action.payload) {
          state.selectedTour = null;
        }
        state.error = null;
      })
      .addCase(deleteTour.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { clearError, setSelectedTour, clearSelectedTour } = toursSlice.actions;

// Selectors
export const selectAllTours = (state) => state.tours.tours;
export const selectToursLoading = (state) => state.tours.loading;
export const selectToursError = (state) => state.tours.error;
export const selectSelectedTour = (state) => state.tours.selectedTour;
export const selectTourById = (id) => (state) => 
  state.tours.tours.find(tour => tour.id === id);

export default toursSlice.reducer;
