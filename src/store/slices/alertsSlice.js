import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { supabase } from '../../utils/supabaseClient';

// Initial state
const initialState = {
  alerts: [],
  isLoading: false,
  error: null,
  subscription: null,
};

// Async thunks for interacting with Supabase
export const fetchAlerts = createAsyncThunk(
  'alerts/fetchAlerts',
  async (_, { rejectWithValue }) => {
    try {
      const { data, error } = await supabase
        .from('app_3c652a5149_alerts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

export const markAlertAsRead = createAsyncThunk(
  'alerts/markAlertAsRead',
  async (alertId, { rejectWithValue }) => {
    try {
      const { data, error } = await supabase
        .from('app_3c652a5149_alerts')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', alertId)
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

export const markAllAlertsAsRead = createAsyncThunk(
  'alerts/markAllAlertsAsRead',
  async (_, { rejectWithValue }) => {
    try {
      const { data, error } = await supabase
        .from('app_3c652a5149_alerts')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('is_read', false)
        .select('*');

      if (error) throw error;
      return data;
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

export const createAlert = createAsyncThunk(
  'alerts/createAlert',
  async (alertData, { rejectWithValue }) => {
    try {
      const { data, error } = await supabase
        .from('app_3c652a5149_alerts')
        .insert([alertData])
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

// Thunk to setup real-time subscription
export const setupAlertsRealtimeSubscription = createAsyncThunk(
  'alerts/setupRealtimeSubscription',
  async (_, { dispatch }) => {
    const subscription = supabase
      .channel('alerts-channel')
      .on('postgres_changes', 
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'app_3c652a5149_alerts' 
        }, 
        (payload) => {
          // Update the redux store
          dispatch(alertAdded(payload.new));
          
          // Dispatch a custom event for components to listen to
          const event = new CustomEvent('supabase:alert-insert', { 
            detail: payload.new 
          });
          document.dispatchEvent(event);
        }
      )
      .on('postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'app_3c652a5149_alerts'
        },
        (payload) => {
          dispatch(alertUpdated(payload.new));
        }
      )
      .subscribe();

    return subscription;
  }
);

// Create the alerts slice
const alertsSlice = createSlice({
  name: 'alerts',
  initialState,
  reducers: {
    alertAdded: (state, action) => {
      state.alerts.unshift(action.payload);
    },
    alertUpdated: (state, action) => {
      const index = state.alerts.findIndex(alert => alert.id === action.payload.id);
      if (index !== -1) {
        state.alerts[index] = action.payload;
      }
    },
    setFilterOptions: (state, action) => {
      state.filterOptions = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      // Handle fetchAlerts
      .addCase(fetchAlerts.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchAlerts.fulfilled, (state, action) => {
        state.isLoading = false;
        state.alerts = action.payload;
      })
      .addCase(fetchAlerts.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })

      // Handle markAlertAsRead
      .addCase(markAlertAsRead.fulfilled, (state, action) => {
        const index = state.alerts.findIndex(alert => alert.id === action.payload.id);
        if (index !== -1) {
          state.alerts[index] = action.payload;
        }
      })

      // Handle markAllAlertsAsRead
      .addCase(markAllAlertsAsRead.fulfilled, (state, action) => {
        // Update each alert that was marked as read
        action.payload.forEach(updatedAlert => {
          const index = state.alerts.findIndex(alert => alert.id === updatedAlert.id);
          if (index !== -1) {
            state.alerts[index] = updatedAlert;
          }
        });
      })

      // Handle createAlert
      .addCase(createAlert.fulfilled, (state, action) => {
        state.alerts.unshift(action.payload);
      })
      
      // Handle setupAlertsRealtimeSubscription
      .addCase(setupAlertsRealtimeSubscription.fulfilled, (state, action) => {
        state.subscription = action.payload;
      });
  },
});

// Export actions
export const { alertAdded, alertUpdated, setFilterOptions } = alertsSlice.actions;

// Selectors
export const selectAllAlerts = (state) => state.alerts.alerts;
export const selectIsLoading = (state) => state.alerts.isLoading;
export const selectError = (state) => state.alerts.error;
export const selectUnreadAlertsCount = (state) => 
  state.alerts.alerts.filter(alert => !alert.is_read).length;

export default alertsSlice.reducer;