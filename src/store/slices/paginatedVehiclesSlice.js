import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import PaginatedVehicleService from '../../services/PaginatedVehicleService';

// Async thunks for paginated vehicle operations
export const fetchVehiclesPaginated = createAsyncThunk(
  'paginatedVehicles/fetchVehiclesPaginated',
  async (params, { rejectWithValue }) => {
    try {
      const result = await PaginatedVehicleService.getVehiclesPaginated(params);
      return result;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const fetchAvailableVehiclesPaginated = createAsyncThunk(
  'paginatedVehicles/fetchAvailableVehiclesPaginated',
  async (params, { rejectWithValue }) => {
    try {
      const result = await PaginatedVehicleService.getAvailableVehiclesPaginated(params);
      return result;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const searchVehiclesPaginated = createAsyncThunk(
  'paginatedVehicles/searchVehiclesPaginated',
  async ({ searchTerm, params }, { rejectWithValue }) => {
    try {
      const result = await PaginatedVehicleService.searchVehiclesPaginated(searchTerm, params);
      return result;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const initialState = {
  // Main vehicles list
  vehicles: [],
  pagination: {
    totalItems: 0,
    totalPages: 0,
    currentPage: 1,
    itemsPerPage: 12,
    hasNextPage: false,
    hasPreviousPage: false,
    startIndex: 0,
    endIndex: 0
  },
  
  // Available vehicles list
  availableVehicles: [],
  availablePagination: {
    totalItems: 0,
    totalPages: 0,
    currentPage: 1,
    itemsPerPage: 12,
    hasNextPage: false,
    hasPreviousPage: false,
    startIndex: 0,
    endIndex: 0
  },
  
  // Search results
  searchResults: [],
  searchPagination: {
    totalItems: 0,
    totalPages: 0,
    currentPage: 1,
    itemsPerPage: 12,
    hasNextPage: false,
    hasPreviousPage: false,
    startIndex: 0,
    endIndex: 0
  },
  
  // UI state
  loading: {
    vehicles: false,
    available: false,
    search: false
  },
  error: {
    vehicles: null,
    available: null,
    search: null
  },
  
  // Filters and sorting
  filters: {
    search: '',
    status: '',
    location: '',
    vehicleType: '',
    sortBy: 'created_at',
    sortOrder: 'desc'
  },
  
  // Current operation type
  currentOperation: 'vehicles' // 'vehicles', 'available', 'search'
};

const paginatedVehiclesSlice = createSlice({
  name: 'paginatedVehicles',
  initialState,
  reducers: {
    // Update filters
    updateFilters: (state, action) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    
    // Reset filters
    resetFilters: (state) => {
      state.filters = initialState.filters;
    },
    
    // Set current operation
    setCurrentOperation: (state, action) => {
      state.currentOperation = action.payload;
    },
    
    // Clear search results
    clearSearchResults: (state) => {
      state.searchResults = [];
      state.searchPagination = initialState.searchPagination;
      state.error.search = null;
    },
    
    // Clear all data
    clearAllData: (state) => {
      state.vehicles = [];
      state.availableVehicles = [];
      state.searchResults = [];
      state.pagination = initialState.pagination;
      state.availablePagination = initialState.availablePagination;
      state.searchPagination = initialState.searchPagination;
      state.error = initialState.error;
    },
    
    // Invalidate cache
    invalidateCache: (state) => {
      PaginatedVehicleService.invalidateCache();
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch vehicles paginated
      .addCase(fetchVehiclesPaginated.pending, (state) => {
        state.loading.vehicles = true;
        state.error.vehicles = null;
      })
      .addCase(fetchVehiclesPaginated.fulfilled, (state, action) => {
        state.loading.vehicles = false;
        if (action.payload.success) {
          state.vehicles = action.payload.data;
          state.pagination = action.payload.pagination;
          state.currentOperation = 'vehicles';
        } else {
          state.error.vehicles = action.payload.error;
        }
      })
      .addCase(fetchVehiclesPaginated.rejected, (state, action) => {
        state.loading.vehicles = false;
        state.error.vehicles = action.payload;
      })
      
      // Fetch available vehicles paginated
      .addCase(fetchAvailableVehiclesPaginated.pending, (state) => {
        state.loading.available = true;
        state.error.available = null;
      })
      .addCase(fetchAvailableVehiclesPaginated.fulfilled, (state, action) => {
        state.loading.available = false;
        if (action.payload.success) {
          state.availableVehicles = action.payload.data;
          state.availablePagination = action.payload.pagination;
          state.currentOperation = 'available';
        } else {
          state.error.available = action.payload.error;
        }
      })
      .addCase(fetchAvailableVehiclesPaginated.rejected, (state, action) => {
        state.loading.available = false;
        state.error.available = action.payload;
      })
      
      // Search vehicles paginated
      .addCase(searchVehiclesPaginated.pending, (state) => {
        state.loading.search = true;
        state.error.search = null;
      })
      .addCase(searchVehiclesPaginated.fulfilled, (state, action) => {
        state.loading.search = false;
        if (action.payload.success) {
          state.searchResults = action.payload.data;
          state.searchPagination = action.payload.pagination;
          state.currentOperation = 'search';
        } else {
          state.error.search = action.payload.error;
        }
      })
      .addCase(searchVehiclesPaginated.rejected, (state, action) => {
        state.loading.search = false;
        state.error.search = action.payload;
      });
  }
});

// Selectors
export const selectCurrentVehicles = (state) => {
  const { currentOperation } = state.paginatedVehicles;
  switch (currentOperation) {
    case 'available':
      return state.paginatedVehicles.availableVehicles;
    case 'search':
      return state.paginatedVehicles.searchResults;
    default:
      return state.paginatedVehicles.vehicles;
  }
};

export const selectCurrentPagination = (state) => {
  const { currentOperation } = state.paginatedVehicles;
  switch (currentOperation) {
    case 'available':
      return state.paginatedVehicles.availablePagination;
    case 'search':
      return state.paginatedVehicles.searchPagination;
    default:
      return state.paginatedVehicles.pagination;
  }
};

export const selectCurrentLoading = (state) => {
  const { currentOperation } = state.paginatedVehicles;
  switch (currentOperation) {
    case 'available':
      return state.paginatedVehicles.loading.available;
    case 'search':
      return state.paginatedVehicles.loading.search;
    default:
      return state.paginatedVehicles.loading.vehicles;
  }
};

export const selectCurrentError = (state) => {
  const { currentOperation } = state.paginatedVehicles;
  switch (currentOperation) {
    case 'available':
      return state.paginatedVehicles.error.available;
    case 'search':
      return state.paginatedVehicles.error.search;
    default:
      return state.paginatedVehicles.error.vehicles;
  }
};

export const {
  updateFilters,
  resetFilters,
  setCurrentOperation,
  clearSearchResults,
  clearAllData,
  invalidateCache
} = paginatedVehiclesSlice.actions;

export default paginatedVehiclesSlice.reducer;