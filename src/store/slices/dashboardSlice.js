import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

// Async thunks
export const fetchRevenueData = createAsyncThunk(
  'dashboard/fetchRevenueData',
  async () => {
    // Mock data for now - replace with actual Supabase query when tables are ready
    return [
      { month: 'Jan', revenue: 1000 },
      { month: 'Feb', revenue: 1500 },
      { month: 'Mar', revenue: 1200 },
      { month: 'Apr', revenue: 1800 },
      { month: 'May', revenue: 2000 },
      { month: 'Jun', revenue: 1700 },
    ];
  }
);

const initialState = {
  stats: {
    totalUsers: 0,
    activeUsers: 0,
    totalRevenue: 0,
    pendingOrders: 0
  },
  recentActivity: [],
  revenueData: [],
  loading: false,
  error: null,
  lastUpdated: null
};

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {
    setStats: (state, action) => {
      state.stats = { ...state.stats, ...action.payload };
    },
    setRecentActivity: (state, action) => {
      state.recentActivity = action.payload;
    },
    addActivity: (state, action) => {
      state.recentActivity.unshift(action.payload);
      if (state.recentActivity.length > 10) {
        state.recentActivity = state.recentActivity.slice(0, 10);
      }
    },
    setLoading: (state, action) => {
      state.loading = action.payload;
    },
    setError: (state, action) => {
      state.error = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
    setLastUpdated: (state) => {
      state.lastUpdated = new Date().toISOString();
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchRevenueData.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchRevenueData.fulfilled, (state, action) => {
        state.revenueData = action.payload;
        state.loading = false;
      })
      .addCase(fetchRevenueData.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      });
  }
});

export const {
  setStats,
  setRecentActivity,
  addActivity,
  setLoading,
  setError,
  clearError,
  setLastUpdated
} = dashboardSlice.actions;

export default dashboardSlice.reducer;