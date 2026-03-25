import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { supabase } from '../../lib/supabase';

const NOTIFICATIONS_TABLE = 'notifications'; // Updated to actual table name

// Async thunks
export const fetchNotifications = createAsyncThunk(
  'notifications/fetchNotifications',
  async (userId, { rejectWithValue }) => {
    try {
      console.log(`🔧 DEBUG: Fetching notifications for user ${userId} from table "${NOTIFICATIONS_TABLE}"`);
      
      const { data, error } = await supabase
        .from(NOTIFICATIONS_TABLE)
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error(`❌ Error fetching notifications from ${NOTIFICATIONS_TABLE}:`, error);
        throw error;
      }

      console.log(`✅ Successfully fetched ${data?.length || 0} notifications from ${NOTIFICATIONS_TABLE}`);
      return data || [];
    } catch (error) {
      console.error(`❌ Exception fetching notifications from ${NOTIFICATIONS_TABLE}:`, error);
      return rejectWithValue(error.message);
    }
  }
);

export const markNotificationAsRead = createAsyncThunk(
  'notifications/markAsRead',
  async (notificationId, { rejectWithValue }) => {
    try {
      console.log(`🔧 DEBUG: Marking notification ${notificationId} as read in table "${NOTIFICATIONS_TABLE}"`);
      
      const { data, error } = await supabase
        .from(NOTIFICATIONS_TABLE)
        .update({ 
          read: true,
          read_at: new Date().toISOString()
        })
        .eq('id', notificationId)
        .select()
        .single();

      if (error) {
        console.error(`❌ Error marking notification ${notificationId} as read in ${NOTIFICATIONS_TABLE}:`, error);
        throw error;
      }

      console.log(`✅ Successfully marked notification ${notificationId} as read in ${NOTIFICATIONS_TABLE}`);
      return data;
    } catch (error) {
      console.error(`❌ Exception marking notification ${notificationId} as read in ${NOTIFICATIONS_TABLE}:`, error);
      return rejectWithValue(error.message);
    }
  }
);

export const markAllNotificationsAsRead = createAsyncThunk(
  'notifications/markAllAsRead',
  async (userId, { rejectWithValue }) => {
    try {
      console.log(`🔧 DEBUG: Marking all notifications as read for user ${userId} in table "${NOTIFICATIONS_TABLE}"`);
      
      const { data, error } = await supabase
        .from(NOTIFICATIONS_TABLE)
        .update({ 
          read: true,
          read_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('read', false)
        .select();

      if (error) {
        console.error(`❌ Error marking all notifications as read in ${NOTIFICATIONS_TABLE}:`, error);
        throw error;
      }

      console.log(`✅ Successfully marked ${data?.length || 0} notifications as read in ${NOTIFICATIONS_TABLE}`);
      return data || [];
    } catch (error) {
      console.error(`❌ Exception marking all notifications as read in ${NOTIFICATIONS_TABLE}:`, error);
      return rejectWithValue(error.message);
    }
  }
);

export const createNotification = createAsyncThunk(
  'notifications/create',
  async (notificationData, { rejectWithValue }) => {
    try {
      console.log(`🔧 DEBUG: Creating notification in table "${NOTIFICATIONS_TABLE}":`, notificationData);
      
      const { data, error } = await supabase
        .from(NOTIFICATIONS_TABLE)
        .insert([{
          ...notificationData,
          created_at: new Date().toISOString(),
          read: false
        }])
        .select()
        .single();

      if (error) {
        console.error(`❌ Error creating notification in ${NOTIFICATIONS_TABLE}:`, error);
        throw error;
      }

      console.log(`✅ Successfully created notification in ${NOTIFICATIONS_TABLE}:`, data);
      return data;
    } catch (error) {
      console.error(`❌ Exception creating notification in ${NOTIFICATIONS_TABLE}:`, error);
      return rejectWithValue(error.message);
    }
  }
);

export const deleteNotification = createAsyncThunk(
  'notifications/delete',
  async (notificationId, { rejectWithValue }) => {
    try {
      console.log(`🔧 DEBUG: Deleting notification ${notificationId} from table "${NOTIFICATIONS_TABLE}"`);
      
      const { error } = await supabase
        .from(NOTIFICATIONS_TABLE)
        .delete()
        .eq('id', notificationId);

      if (error) {
        console.error(`❌ Error deleting notification ${notificationId} from ${NOTIFICATIONS_TABLE}:`, error);
        throw error;
      }

      console.log(`✅ Successfully deleted notification ${notificationId} from ${NOTIFICATIONS_TABLE}`);
      return notificationId;
    } catch (error) {
      console.error(`❌ Exception deleting notification ${notificationId} from ${NOTIFICATIONS_TABLE}:`, error);
      return rejectWithValue(error.message);
    }
  }
);

// Real-time subscription functions
export const subscribeToNotifications = createAsyncThunk(
  'notifications/subscribe',
  async (userId, { dispatch, rejectWithValue }) => {
    try {
      console.log(`🔧 DEBUG: Subscribing to notifications for user ${userId} on table "${NOTIFICATIONS_TABLE}"`);
      
      // Set up real-time subscription
      const subscription = supabase
        .channel(`notifications_${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: NOTIFICATIONS_TABLE,
            filter: `user_id=eq.${userId}`
          },
          (payload) => {
            console.log('🔔 Real-time notification update:', payload);
            // Refresh notifications when changes occur
            dispatch(fetchNotifications(userId));
          }
        )
        .subscribe();

      console.log(`✅ Successfully subscribed to notifications for user ${userId}`);
      return subscription;
    } catch (error) {
      console.error(`❌ Exception subscribing to notifications:`, error);
      return rejectWithValue(error.message);
    }
  }
);

export const unsubscribeFromNotifications = createAsyncThunk(
  'notifications/unsubscribe',
  async (subscription, { rejectWithValue }) => {
    try {
      console.log(`🔧 DEBUG: Unsubscribing from notifications`);
      
      if (subscription) {
        await supabase.removeChannel(subscription);
        console.log(`✅ Successfully unsubscribed from notifications`);
      }
      
      return true;
    } catch (error) {
      console.error(`❌ Exception unsubscribing from notifications:`, error);
      return rejectWithValue(error.message);
    }
  }
);

// Legacy alias for backward compatibility
export const addNotification = createNotification;

const notificationsSlice = createSlice({
  name: 'notifications',
  initialState: {
    items: [],
    loading: false,
    error: null,
    unreadCount: 0,
    subscription: null,
  },
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    updateUnreadCount: (state) => {
      state.unreadCount = state.items.filter(item => !item.read).length;
    },
    setSubscription: (state, action) => {
      state.subscription = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch notifications
      .addCase(fetchNotifications.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload;
        state.unreadCount = action.payload.filter(item => !item.read).length;
        state.error = null;
      })
      .addCase(fetchNotifications.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Mark as read
      .addCase(markNotificationAsRead.fulfilled, (state, action) => {
        const index = state.items.findIndex(item => item.id === action.payload.id);
        if (index !== -1) {
          state.items[index] = action.payload;
          state.unreadCount = state.items.filter(item => !item.read).length;
        }
      })
      // Mark all as read
      .addCase(markAllNotificationsAsRead.fulfilled, (state, action) => {
        action.payload.forEach(updatedItem => {
          const index = state.items.findIndex(item => item.id === updatedItem.id);
          if (index !== -1) {
            state.items[index] = updatedItem;
          }
        });
        state.unreadCount = state.items.filter(item => !item.read).length;
      })
      // Create notification
      .addCase(createNotification.fulfilled, (state, action) => {
        state.items.unshift(action.payload);
        if (!action.payload.read) {
          state.unreadCount += 1;
        }
      })
      // Delete notification
      .addCase(deleteNotification.fulfilled, (state, action) => {
        const deletedItem = state.items.find(item => item.id === action.payload);
        state.items = state.items.filter(item => item.id !== action.payload);
        if (deletedItem && !deletedItem.read) {
          state.unreadCount -= 1;
        }
      })
      // Subscribe to notifications
      .addCase(subscribeToNotifications.fulfilled, (state, action) => {
        state.subscription = action.payload;
      })
      // Unsubscribe from notifications
      .addCase(unsubscribeFromNotifications.fulfilled, (state) => {
        state.subscription = null;
      });
  },
});

export const { clearError, updateUnreadCount, setSubscription } = notificationsSlice.actions;
export default notificationsSlice.reducer;