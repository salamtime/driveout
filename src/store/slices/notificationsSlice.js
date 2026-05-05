import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import notificationService from '../../services/NotificationService';

// Async thunks
export const fetchNotifications = createAsyncThunk(
  'notifications/fetchNotifications',
  async (userId, { rejectWithValue }) => {
    try {
      return await notificationService.getNotifications(userId);
    } catch (error) {
      console.error('❌ Exception fetching notifications:', error);
      return rejectWithValue(error.message);
    }
  }
);

export const markNotificationAsRead = createAsyncThunk(
  'notifications/markAsRead',
  async (notificationId, { rejectWithValue }) => {
    try {
      return await notificationService.markNotificationAsRead(notificationId);
    } catch (error) {
      console.error(`❌ Exception marking notification ${notificationId} as read:`, error);
      return rejectWithValue(error.message);
    }
  }
);

export const markAllNotificationsAsRead = createAsyncThunk(
  'notifications/markAllAsRead',
  async (userId, { rejectWithValue }) => {
    try {
      return await notificationService.markAllNotificationsAsRead(userId);
    } catch (error) {
      console.error('❌ Exception marking all notifications as read:', error);
      return rejectWithValue(error.message);
    }
  }
);

export const createNotification = createAsyncThunk(
  'notifications/create',
  async (notificationData, { rejectWithValue }) => {
    try {
      return await notificationService.createNotification(notificationData);
    } catch (error) {
      console.error('❌ Exception creating notification:', error);
      return rejectWithValue(error.message);
    }
  }
);

export const deleteNotification = createAsyncThunk(
  'notifications/delete',
  async (notificationId, { rejectWithValue }) => {
    try {
      return await notificationService.deleteNotification(notificationId);
    } catch (error) {
      console.error(`❌ Exception deleting notification ${notificationId}:`, error);
      return rejectWithValue(error.message);
    }
  }
);

// Real-time subscription functions
export const subscribeToNotifications = createAsyncThunk(
  'notifications/subscribe',
  async (userId, { dispatch, rejectWithValue }) => {
    try {
      return await notificationService.subscribeToUserNotifications(userId, () => {
        dispatch(fetchNotifications(userId));
      });
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
      return await notificationService.unsubscribeFromUserNotifications(subscription);
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
