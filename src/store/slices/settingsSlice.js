import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import settingsService from '../../services/settingsService';

// Async thunks
export const fetchSettings = createAsyncThunk(
  'settings/fetchSettings',
  async (_, { rejectWithValue }) => {
    try {
      console.log('🔧 DEBUG: Fetching settings via Redux slice');
      const settings = await settingsService.getSettings();
      console.log('✅ Successfully fetched settings via Redux slice:', settings);
      return settings;
    } catch (error) {
      console.error('❌ Error fetching settings via Redux slice:', error);
      return rejectWithValue(error.message);
    }
  }
);

export const updateSettings = createAsyncThunk(
  'settings/updateSettings',
  async (settingsData, { rejectWithValue }) => {
    try {
      console.log('🔧 DEBUG: Updating settings via Redux slice:', settingsData);
      const updatedSettings = await settingsService.updateSettings(settingsData);
      console.log('✅ Successfully updated settings via Redux slice:', updatedSettings);
      return updatedSettings;
    } catch (error) {
      console.error('❌ Error updating settings via Redux slice:', error);
      return rejectWithValue(error.message);
    }
  }
);

export const initializeSettings = createAsyncThunk(
  'settings/initializeSettings',
  async (_, { rejectWithValue }) => {
    try {
      console.log('🔧 DEBUG: Initializing settings via Redux slice');
      const settings = await settingsService.initializeSettings();
      console.log('✅ Successfully initialized settings via Redux slice:', settings);
      return settings;
    } catch (error) {
      console.error('❌ Error initializing settings via Redux slice:', error);
      return rejectWithValue(error.message);
    }
  }
);

const settingsSlice = createSlice({
  name: 'settings',
  initialState: {
    data: null,
    loading: false,
    error: null,
    initialized: false,
  },
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    resetSettings: (state) => {
      state.data = null;
      state.loading = false;
      state.error = null;
      state.initialized = false;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch settings
      .addCase(fetchSettings.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSettings.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload;
        state.error = null;
        state.initialized = true;
      })
      .addCase(fetchSettings.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        // Use default settings on error
        state.data = settingsService.getDefaultSettings();
        state.initialized = true;
      })
      // Update settings
      .addCase(updateSettings.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateSettings.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload;
        state.error = null;
      })
      .addCase(updateSettings.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Initialize settings
      .addCase(initializeSettings.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(initializeSettings.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload;
        state.error = null;
        state.initialized = true;
      })
      .addCase(initializeSettings.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        // Use default settings on error
        state.data = settingsService.getDefaultSettings();
        state.initialized = true;
      });
  },
});

export const { clearError, resetSettings } = settingsSlice.actions;

// Selectors
export const selectSettings = (state) => state.settings?.data;
export const selectSettingsLoading = (state) => state.settings?.loading || false;
export const selectSettingsError = (state) => state.settings?.error;
export const selectSettingsInitialized = (state) => state.settings?.initialized || false;

// Specific setting selectors
export const selectCompanyInfo = (state) => {
  const settings = state.settings?.data;
  return settings ? {
    name: settings.companyName,
    email: settings.companyEmail,
    phone: settings.companyPhone,
    address: settings.companyAddress,
    website: settings.companyWebsite,
  } : null;
};

export const selectBusinessSettings = (state) => {
  const settings = state.settings?.data;
  return settings ? {
    currency: settings.currency,
    timezone: settings.timezone,
    language: settings.language,
  } : null;
};

export const selectRentalSettings = (state) => {
  const settings = state.settings?.data;
  return settings ? {
    defaultDuration: settings.defaultRentalDuration,
    minDuration: settings.minRentalDuration,
    maxDuration: settings.maxRentalDuration,
    depositPercentage: settings.depositPercentage,
  } : null;
};

export const selectPricingSettings = (state) => {
  const settings = state.settings?.data;
  return settings ? {
    baseHourlyRate: settings.baseHourlyRate,
    dailyRate: settings.dailyRate,
    weeklyRate: settings.weeklyRate,
  } : null;
};

export const selectOperationalSettings = (state) => {
  const settings = state.settings?.data;
  return settings ? {
    operatingHours: settings.operatingHours,
    operatingDays: settings.operatingDays,
  } : null;
};

export const selectFeatureFlags = (state) => {
  const settings = state.settings?.data;
  return settings ? {
    maintenanceMode: settings.maintenanceMode,
    onlineBooking: settings.onlineBooking,
    realTimeTracking: settings.realTimeTracking,
  } : null;
};

export default settingsSlice.reducer;