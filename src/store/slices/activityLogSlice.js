import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { supabase } from '../../utils/supabaseClient';

const TABLES = {
  ACTIVITY_LOG: 'saharax_0u4w4d_activity_log'
};

// Async thunks
export const fetchActivityLogs = createAsyncThunk(
  'activityLog/fetchActivityLogs',
  async (_, { rejectWithValue }) => {
    try {
      console.log('🔄 Fetching activity logs...');
      
      const { data, error } = await supabase
        .from(TABLES.ACTIVITY_LOG)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (error) {
        console.error('❌ Activity logs fetch error:', error);
        throw error;
      }
      
      console.log('✅ Activity logs fetched successfully:', data?.length || 0, 'logs');
      return data || [];
    } catch (error) {
      console.error('❌ Activity logs fetch failed:', error);
      return rejectWithValue(error.message);
    }
  }
);

export const createActivityLog = createAsyncThunk(
  'activityLog/createActivityLog',
  async (logData, { rejectWithValue }) => {
    try {
      console.log('🔄 Creating activity log:', logData);
      
      const { data, error } = await supabase
        .from(TABLES.ACTIVITY_LOG)
        .insert([{
          ...logData,
          created_at: new Date().toISOString()
        }])
        .select();
      
      if (error) {
        console.error('❌ Activity log create error:', error);
        throw error;
      }
      
      console.log('✅ Activity log created successfully:', data[0]);
      return data[0];
    } catch (error) {
      console.error('❌ Activity log create failed:', error);
      return rejectWithValue(error.message);
    }
  }
);

// Realtime subscription
export const subscribeToActivityLogs = createAsyncThunk(
  'activityLog/subscribeToActivityLogs',
  async (_, { dispatch }) => {
    try {
      console.log('🔄 Setting up activity logs realtime subscription...');
      
      const subscription = supabase
        .channel('activity_log_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: TABLES.ACTIVITY_LOG
          },
          (payload) => {
            console.log('🔄 Activity log realtime event:', payload);
            
            switch (payload.eventType) {
              case 'INSERT':
                dispatch(activityLogSlice.actions.addActivityLog(payload.new));
                break;
              case 'UPDATE':
                dispatch(activityLogSlice.actions.updateActivityLog(payload.new));
                break;
              case 'DELETE':
                dispatch(activityLogSlice.actions.removeActivityLog(payload.old.id));
                break;
              default:
                console.log('Unknown event type:', payload.eventType);
            }
          }
        )
        .subscribe((status) => {
          console.log('🔄 Activity log subscription status:', status);
        });
      
      console.log('✅ Activity logs realtime subscription setup complete');
      return subscription;
    } catch (error) {
      console.error('❌ Activity logs subscription setup failed:', error);
      throw error;
    }
  }
);

// Slice
const activityLogSlice = createSlice({
  name: 'activityLog',
  initialState: {
    logs: [],
    loading: false,
    error: null,
    subscription: null
  },
  reducers: {
    addActivityLog: (state, action) => {
      state.logs.unshift(action.payload);
      // Keep only the latest 100 logs
      if (state.logs.length > 100) {
        state.logs = state.logs.slice(0, 100);
      }
    },
    updateActivityLog: (state, action) => {
      const index = state.logs.findIndex(log => log.id === action.payload.id);
      if (index !== -1) {
        state.logs[index] = action.payload;
      }
    },
    removeActivityLog: (state, action) => {
      state.logs = state.logs.filter(log => log.id !== action.payload);
    },
    clearActivityLogs: (state) => {
      state.logs = [];
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch activity logs
      .addCase(fetchActivityLogs.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchActivityLogs.fulfilled, (state, action) => {
        state.loading = false;
        state.logs = action.payload;
      })
      .addCase(fetchActivityLogs.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Create activity log
      .addCase(createActivityLog.pending, (state) => {
        state.error = null;
      })
      .addCase(createActivityLog.fulfilled, (state, action) => {
        // Log will be added via realtime subscription
      })
      .addCase(createActivityLog.rejected, (state, action) => {
        state.error = action.payload;
      })
      // Subscribe to activity logs
      .addCase(subscribeToActivityLogs.fulfilled, (state, action) => {
        state.subscription = action.payload;
      });
  }
});

// Selectors
export const selectActivityLogs = (state) => state.activityLog.logs;
export const selectActivityLogsLoading = (state) => state.activityLog.loading;
export const selectActivityLogsError = (state) => state.activityLog.error;

export default activityLogSlice.reducer;