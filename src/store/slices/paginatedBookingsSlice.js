import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import PaginatedBookingService from '../../services/PaginatedBookingService';

// Async thunks for paginated booking operations
export const fetchBookingsPaginated = createAsyncThunk(
  'paginatedBookings/fetchBookingsPaginated',
  async (params, { rejectWithValue }) => {
    try {
      const result = await PaginatedBookingService.getBookingsPaginated(params);
      return result;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const fetchUpcomingBookingsPaginated = createAsyncThunk(
  'paginatedBookings/fetchUpcomingBookingsPaginated',
  async (params, { rejectWithValue }) => {
    try {
      const result = await PaginatedBookingService.getUpcomingBookingsPaginated(params);
      return result;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const fetchBookingsByDateRangePaginated = createAsyncThunk(
  'paginatedBookings/fetchBookingsByDateRangePaginated',
  async ({ startDate, endDate, params }, { rejectWithValue }) => {
    try {
      const result = await PaginatedBookingService.getBookingsByDateRangePaginated(startDate, endDate, params);
      return result;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const searchBookingsPaginated = createAsyncThunk(
  'paginatedBookings/searchBookingsPaginated',
  async ({ searchTerm, params }, { rejectWithValue }) => {
    try {
      const result = await PaginatedBookingService.searchBookingsPaginated(searchTerm, params);
      return result;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const initialState = {
  // Main bookings list
  bookings: [],
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
  
  // Upcoming bookings list
  upcomingBookings: [],
  upcomingPagination: {
    totalItems: 0,
    totalPages: 0,
    currentPage: 1,
    itemsPerPage: 15,
    hasNextPage: false,
    hasPreviousPage: false,
    startIndex: 0,
    endIndex: 0
  },
  
  // Date range bookings
  dateRangeBookings: [],
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
    bookings: false,
    upcoming: false,
    dateRange: false,
    search: false
  },
  error: {
    bookings: null,
    upcoming: null,
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
  currentOperation: 'bookings' // 'bookings', 'upcoming', 'dateRange', 'search'
};

const paginatedBookingsSlice = createSlice({
  name: 'paginatedBookings',
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
    
    // Clear date range results
    clearDateRangeResults: (state) => {
      state.dateRangeBookings = [];
      state.dateRangePagination = initialState.dateRangePagination;
      state.error.dateRange = null;
    },
    
    // Clear all data
    clearAllData: (state) => {
      state.bookings = [];
      state.upcomingBookings = [];
      state.dateRangeBookings = [];
      state.searchResults = [];
      state.pagination = initialState.pagination;
      state.upcomingPagination = initialState.upcomingPagination;
      state.dateRangePagination = initialState.dateRangePagination;
      state.searchPagination = initialState.searchPagination;
      state.error = initialState.error;
    },
    
    // Invalidate cache
    invalidateCache: (state) => {
      PaginatedBookingService.invalidateCache();
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch bookings paginated
      .addCase(fetchBookingsPaginated.pending, (state) => {
        state.loading.bookings = true;
        state.error.bookings = null;
      })
      .addCase(fetchBookingsPaginated.fulfilled, (state, action) => {
        state.loading.bookings = false;
        if (action.payload.success) {
          state.bookings = action.payload.data;
          state.pagination = action.payload.pagination;
          state.currentOperation = 'bookings';
        } else {
          state.error.bookings = action.payload.error;
        }
      })
      .addCase(fetchBookingsPaginated.rejected, (state, action) => {
        state.loading.bookings = false;
        state.error.bookings = action.payload;
      })
      
      // Fetch upcoming bookings paginated
      .addCase(fetchUpcomingBookingsPaginated.pending, (state) => {
        state.loading.upcoming = true;
        state.error.upcoming = null;
      })
      .addCase(fetchUpcomingBookingsPaginated.fulfilled, (state, action) => {
        state.loading.upcoming = false;
        if (action.payload.success) {
          state.upcomingBookings = action.payload.data;
          state.upcomingPagination = action.payload.pagination;
          state.currentOperation = 'upcoming';
        } else {
          state.error.upcoming = action.payload.error;
        }
      })
      .addCase(fetchUpcomingBookingsPaginated.rejected, (state, action) => {
        state.loading.upcoming = false;
        state.error.upcoming = action.payload;
      })
      
      // Fetch bookings by date range paginated
      .addCase(fetchBookingsByDateRangePaginated.pending, (state) => {
        state.loading.dateRange = true;
        state.error.dateRange = null;
      })
      .addCase(fetchBookingsByDateRangePaginated.fulfilled, (state, action) => {
        state.loading.dateRange = false;
        if (action.payload.success) {
          state.dateRangeBookings = action.payload.data;
          state.dateRangePagination = action.payload.pagination;
          state.currentOperation = 'dateRange';
        } else {
          state.error.dateRange = action.payload.error;
        }
      })
      .addCase(fetchBookingsByDateRangePaginated.rejected, (state, action) => {
        state.loading.dateRange = false;
        state.error.dateRange = action.payload;
      })
      
      // Search bookings paginated
      .addCase(searchBookingsPaginated.pending, (state) => {
        state.loading.search = true;
        state.error.search = null;
      })
      .addCase(searchBookingsPaginated.fulfilled, (state, action) => {
        state.loading.search = false;
        if (action.payload.success) {
          state.searchResults = action.payload.data;
          state.searchPagination = action.payload.pagination;
          state.currentOperation = 'search';
        } else {
          state.error.search = action.payload.error;
        }
      })
      .addCase(searchBookingsPaginated.rejected, (state, action) => {
        state.loading.search = false;
        state.error.search = action.payload;
      });
  }
});

// Selectors
export const selectCurrentBookings = (state) => {
  const { currentOperation } = state.paginatedBookings;
  switch (currentOperation) {
    case 'upcoming':
      return state.paginatedBookings.upcomingBookings;
    case 'dateRange':
      return state.paginatedBookings.dateRangeBookings;
    case 'search':
      return state.paginatedBookings.searchResults;
    default:
      return state.paginatedBookings.bookings;
  }
};

export const selectCurrentPagination = (state) => {
  const { currentOperation } = state.paginatedBookings;
  switch (currentOperation) {
    case 'upcoming':
      return state.paginatedBookings.upcomingPagination;
    case 'dateRange':
      return state.paginatedBookings.dateRangePagination;
    case 'search':
      return state.paginatedBookings.searchPagination;
    default:
      return state.paginatedBookings.pagination;
  }
};

export const selectCurrentLoading = (state) => {
  const { currentOperation } = state.paginatedBookings;
  switch (currentOperation) {
    case 'upcoming':
      return state.paginatedBookings.loading.upcoming;
    case 'dateRange':
      return state.paginatedBookings.loading.dateRange;
    case 'search':
      return state.paginatedBookings.loading.search;
    default:
      return state.paginatedBookings.loading.bookings;
  }
};

export const selectCurrentError = (state) => {
  const { currentOperation } = state.paginatedBookings;
  switch (currentOperation) {
    case 'upcoming':
      return state.paginatedBookings.error.upcoming;
    case 'dateRange':
      return state.paginatedBookings.error.dateRange;
    case 'search':
      return state.paginatedBookings.error.search;
    default:
      return state.paginatedBookings.error.bookings;
  }
};

export const {
  updateFilters,
  resetFilters,
  setCurrentOperation,
  clearSearchResults,
  clearDateRangeResults,
  clearAllData,
  invalidateCache
} = paginatedBookingsSlice.actions;

export default paginatedBookingsSlice.reducer;