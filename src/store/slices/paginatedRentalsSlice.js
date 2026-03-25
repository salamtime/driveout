import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import PaginatedRentalService from '../../services/PaginatedRentalService';

// Async thunks for paginated rental operations
export const fetchRentalsPaginated = createAsyncThunk(
  'paginatedRentals/fetchRentalsPaginated',
  async (params, { rejectWithValue }) => {
    try {
      const result = await PaginatedRentalService.getRentalsPaginated(params);
      return result;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const fetchActiveRentalsPaginated = createAsyncThunk(
  'paginatedRentals/fetchActiveRentalsPaginated',
  async (params, { rejectWithValue }) => {
    try {
      const result = await PaginatedRentalService.getActiveRentalsPaginated(params);
      return result;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const fetchRentalsByCustomerPaginated = createAsyncThunk(
  'paginatedRentals/fetchRentalsByCustomerPaginated',
  async ({ customerId, params }, { rejectWithValue }) => {
    try {
      const result = await PaginatedRentalService.getRentalsByCustomerPaginated(customerId, params);
      return result;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const fetchRentalsByVehiclePaginated = createAsyncThunk(
  'paginatedRentals/fetchRentalsByVehiclePaginated',
  async ({ vehicleId, params }, { rejectWithValue }) => {
    try {
      const result = await PaginatedRentalService.getRentalsByVehiclePaginated(vehicleId, params);
      return result;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const fetchRentalsByDateRangePaginated = createAsyncThunk(
  'paginatedRentals/fetchRentalsByDateRangePaginated',
  async ({ startDate, endDate, params }, { rejectWithValue }) => {
    try {
      const result = await PaginatedRentalService.getRentalsByDateRangePaginated(startDate, endDate, params);
      return result;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const searchRentalsPaginated = createAsyncThunk(
  'paginatedRentals/searchRentalsPaginated',
  async ({ searchTerm, params }, { rejectWithValue }) => {
    try {
      const result = await PaginatedRentalService.searchRentalsPaginated(searchTerm, params);
      return result;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const initialState = {
  // Main rentals list
  rentals: [],
  pagination: {
    totalItems: 0,
    totalPages: 0,
    currentPage: 1,
    itemsPerPage: 15,
    hasNextPage: false,
    hasPreviousPage: false,
    startIndex: 0,
    endIndex: 0
  },
  
  // Active rentals list
  activeRentals: [],
  activePagination: {
    totalItems: 0,
    totalPages: 0,
    currentPage: 1,
    itemsPerPage: 15,
    hasNextPage: false,
    hasPreviousPage: false,
    startIndex: 0,
    endIndex: 0
  },
  
  // Customer rentals
  customerRentals: [],
  customerPagination: {
    totalItems: 0,
    totalPages: 0,
    currentPage: 1,
    itemsPerPage: 15,
    hasNextPage: false,
    hasPreviousPage: false,
    startIndex: 0,
    endIndex: 0
  },
  
  // Vehicle rentals
  vehicleRentals: [],
  vehiclePagination: {
    totalItems: 0,
    totalPages: 0,
    currentPage: 1,
    itemsPerPage: 15,
    hasNextPage: false,
    hasPreviousPage: false,
    startIndex: 0,
    endIndex: 0
  },
  
  // Date range rentals
  dateRangeRentals: [],
  dateRangePagination: {
    totalItems: 0,
    totalPages: 0,
    currentPage: 1,
    itemsPerPage: 15,
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
    itemsPerPage: 15,
    hasNextPage: false,
    hasPreviousPage: false,
    startIndex: 0,
    endIndex: 0
  },
  
  // UI state
  loading: {
    rentals: false,
    active: false,
    customer: false,
    vehicle: false,
    dateRange: false,
    search: false
  },
  error: {
    rentals: null,
    active: null,
    customer: null,
    vehicle: null,
    dateRange: null,
    search: null
  },
  
  // Filters and sorting
  filters: {
    status: '',
    customerId: '',
    vehicleId: '',
    startDate: '',
    endDate: '',
    sortBy: 'created_at',
    sortOrder: 'desc'
  },
  
  // Current operation type
  currentOperation: 'rentals' // 'rentals', 'active', 'customer', 'vehicle', 'dateRange', 'search'
};

const paginatedRentalsSlice = createSlice({
  name: 'paginatedRentals',
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
    
    // Clear customer results
    clearCustomerResults: (state) => {
      state.customerRentals = [];
      state.customerPagination = initialState.customerPagination;
      state.error.customer = null;
    },
    
    // Clear vehicle results
    clearVehicleResults: (state) => {
      state.vehicleRentals = [];
      state.vehiclePagination = initialState.vehiclePagination;
      state.error.vehicle = null;
    },
    
    // Clear date range results
    clearDateRangeResults: (state) => {
      state.dateRangeRentals = [];
      state.dateRangePagination = initialState.dateRangePagination;
      state.error.dateRange = null;
    },
    
    // Clear all data
    clearAllData: (state) => {
      state.rentals = [];
      state.activeRentals = [];
      state.customerRentals = [];
      state.vehicleRentals = [];
      state.dateRangeRentals = [];
      state.searchResults = [];
      state.pagination = initialState.pagination;
      state.activePagination = initialState.activePagination;
      state.customerPagination = initialState.customerPagination;
      state.vehiclePagination = initialState.vehiclePagination;
      state.dateRangePagination = initialState.dateRangePagination;
      state.searchPagination = initialState.searchPagination;
      state.error = initialState.error;
    },
    
    // Invalidate cache
    invalidateCache: (state) => {
      PaginatedRentalService.invalidateCache();
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch rentals paginated
      .addCase(fetchRentalsPaginated.pending, (state) => {
        state.loading.rentals = true;
        state.error.rentals = null;
      })
      .addCase(fetchRentalsPaginated.fulfilled, (state, action) => {
        state.loading.rentals = false;
        if (action.payload.success) {
          state.rentals = action.payload.data;
          state.pagination = action.payload.pagination;
          state.currentOperation = 'rentals';
        } else {
          state.error.rentals = action.payload.error;
        }
      })
      .addCase(fetchRentalsPaginated.rejected, (state, action) => {
        state.loading.rentals = false;
        state.error.rentals = action.payload;
      })
      
      // Fetch active rentals paginated
      .addCase(fetchActiveRentalsPaginated.pending, (state) => {
        state.loading.active = true;
        state.error.active = null;
      })
      .addCase(fetchActiveRentalsPaginated.fulfilled, (state, action) => {
        state.loading.active = false;
        if (action.payload.success) {
          state.activeRentals = action.payload.data;
          state.activePagination = action.payload.pagination;
          state.currentOperation = 'active';
        } else {
          state.error.active = action.payload.error;
        }
      })
      .addCase(fetchActiveRentalsPaginated.rejected, (state, action) => {
        state.loading.active = false;
        state.error.active = action.payload;
      })
      
      // Fetch rentals by customer paginated
      .addCase(fetchRentalsByCustomerPaginated.pending, (state) => {
        state.loading.customer = true;
        state.error.customer = null;
      })
      .addCase(fetchRentalsByCustomerPaginated.fulfilled, (state, action) => {
        state.loading.customer = false;
        if (action.payload.success) {
          state.customerRentals = action.payload.data;
          state.customerPagination = action.payload.pagination;
          state.currentOperation = 'customer';
        } else {
          state.error.customer = action.payload.error;
        }
      })
      .addCase(fetchRentalsByCustomerPaginated.rejected, (state, action) => {
        state.loading.customer = false;
        state.error.customer = action.payload;
      })
      
      // Fetch rentals by vehicle paginated
      .addCase(fetchRentalsByVehiclePaginated.pending, (state) => {
        state.loading.vehicle = true;
        state.error.vehicle = null;
      })
      .addCase(fetchRentalsByVehiclePaginated.fulfilled, (state, action) => {
        state.loading.vehicle = false;
        if (action.payload.success) {
          state.vehicleRentals = action.payload.data;
          state.vehiclePagination = action.payload.pagination;
          state.currentOperation = 'vehicle';
        } else {
          state.error.vehicle = action.payload.error;
        }
      })
      .addCase(fetchRentalsByVehiclePaginated.rejected, (state, action) => {
        state.loading.vehicle = false;
        state.error.vehicle = action.payload;
      })
      
      // Fetch rentals by date range paginated
      .addCase(fetchRentalsByDateRangePaginated.pending, (state) => {
        state.loading.dateRange = true;
        state.error.dateRange = null;
      })
      .addCase(fetchRentalsByDateRangePaginated.fulfilled, (state, action) => {
        state.loading.dateRange = false;
        if (action.payload.success) {
          state.dateRangeRentals = action.payload.data;
          state.dateRangePagination = action.payload.pagination;
          state.currentOperation = 'dateRange';
        } else {
          state.error.dateRange = action.payload.error;
        }
      })
      .addCase(fetchRentalsByDateRangePaginated.rejected, (state, action) => {
        state.loading.dateRange = false;
        state.error.dateRange = action.payload;
      })
      
      // Search rentals paginated
      .addCase(searchRentalsPaginated.pending, (state) => {
        state.loading.search = true;
        state.error.search = null;
      })
      .addCase(searchRentalsPaginated.fulfilled, (state, action) => {
        state.loading.search = false;
        if (action.payload.success) {
          state.searchResults = action.payload.data;
          state.searchPagination = action.payload.pagination;
          state.currentOperation = 'search';
        } else {
          state.error.search = action.payload.error;
        }
      })
      .addCase(searchRentalsPaginated.rejected, (state, action) => {
        state.loading.search = false;
        state.error.search = action.payload;
      });
  }
});

// Selectors
export const selectCurrentRentals = (state) => {
  const { currentOperation } = state.paginatedRentals;
  switch (currentOperation) {
    case 'active':
      return state.paginatedRentals.activeRentals;
    case 'customer':
      return state.paginatedRentals.customerRentals;
    case 'vehicle':
      return state.paginatedRentals.vehicleRentals;
    case 'dateRange':
      return state.paginatedRentals.dateRangeRentals;
    case 'search':
      return state.paginatedRentals.searchResults;
    default:
      return state.paginatedRentals.rentals;
  }
};

export const selectCurrentPagination = (state) => {
  const { currentOperation } = state.paginatedRentals;
  switch (currentOperation) {
    case 'active':
      return state.paginatedRentals.activePagination;
    case 'customer':
      return state.paginatedRentals.customerPagination;
    case 'vehicle':
      return state.paginatedRentals.vehiclePagination;
    case 'dateRange':
      return state.paginatedRentals.dateRangePagination;
    case 'search':
      return state.paginatedRentals.searchPagination;
    default:
      return state.paginatedRentals.pagination;
  }
};

export const selectCurrentLoading = (state) => {
  const { currentOperation } = state.paginatedRentals;
  switch (currentOperation) {
    case 'active':
      return state.paginatedRentals.loading.active;
    case 'customer':
      return state.paginatedRentals.loading.customer;
    case 'vehicle':
      return state.paginatedRentals.loading.vehicle;
    case 'dateRange':
      return state.paginatedRentals.loading.dateRange;
    case 'search':
      return state.paginatedRentals.loading.search;
    default:
      return state.paginatedRentals.loading.rentals;
  }
};

export const selectCurrentError = (state) => {
  const { currentOperation } = state.paginatedRentals;
  switch (currentOperation) {
    case 'active':
      return state.paginatedRentals.error.active;
    case 'customer':
      return state.paginatedRentals.error.customer;
    case 'vehicle':
      return state.paginatedRentals.error.vehicle;
    case 'dateRange':
      return state.paginatedRentals.error.dateRange;
    case 'search':
      return state.paginatedRentals.error.search;
    default:
      return state.paginatedRentals.error.rentals;
  }
};

export const {
  updateFilters,
  resetFilters,
  setCurrentOperation,
  clearSearchResults,
  clearCustomerResults,
  clearVehicleResults,
  clearDateRangeResults,
  clearAllData,
  invalidateCache
} = paginatedRentalsSlice.actions;

export default paginatedRentalsSlice.reducer;