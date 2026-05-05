// src/store/slices/maintenanceSlice.js
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { addNotification } from './notificationsSlice';
import MaintenanceTrackingService from '../../services/MaintenanceTrackingService';

// Fetch all maintenance records with related data
export const fetchMaintenanceRecords = createAsyncThunk(
  'maintenance/fetchRecords',
  async (_, { rejectWithValue }) => {
    try {
      return await MaintenanceTrackingService.getAllMaintenanceRecords();
    } catch (error) {
      console.error('Error fetching maintenance records:', error);
      return rejectWithValue(error.message || 'Failed to fetch maintenance records');
    }
  }
);

// Fetch a single maintenance record by ID
export const fetchMaintenanceRecordById = createAsyncThunk(
  'maintenance/fetchRecordById',
  async (recordId, { rejectWithValue }) => {
    try {
      return await MaintenanceTrackingService.getMaintenanceById(recordId);
    } catch (error) {
      console.error('Error fetching maintenance record:', error);
      return rejectWithValue(error.message || 'Failed to fetch maintenance record');
    }
  }
);

// Create a new maintenance record
export const createMaintenanceRecord = createAsyncThunk(
  'maintenance/createRecord',
  async (recordData, { rejectWithValue, dispatch }) => {
    try {
      const completeRecord = await MaintenanceTrackingService.createMaintenanceRecord(recordData);
      
      // If this is a completed record, add alert about the completion
      if (recordData?.status === 'completed') {
        const vehicleName = completeRecord.vehicle?.name || 'Vehicle';
        
        dispatch(addNotification({
          type: 'info',
          message: `Maintenance completed: ${completeRecord.description} for ${vehicleName}`,
          details: `Maintenance record #${completeRecord.id} has been marked as completed`,
          link: `/admin/maintenance?id=${completeRecord.id}`
        }));
      }
      
      return completeRecord;
    } catch (error) {
      console.error('Error creating maintenance record:', error);
      return rejectWithValue(error.message || 'Failed to create maintenance record');
    }
  }
);

// Update an existing maintenance record
export const updateMaintenanceRecord = createAsyncThunk(
  'maintenance/updateRecord',
  async ({ recordId, updates }, { rejectWithValue, dispatch, getState }) => {
    try {
      const completeRecord = await MaintenanceTrackingService.updateMaintenanceRecord(recordId, updates);
      
      // If the status changed to 'completed', add an alert
      const previousRecord = getState().maintenance.records.find(r => r.id === recordId);
      if (previousRecord && previousRecord.status !== 'completed' && updates.status === 'completed') {
        const vehicleName = completeRecord.vehicle?.name || 'Vehicle';
        
        dispatch(addNotification({
          type: 'info',
          message: `Maintenance completed: ${completeRecord.description} for ${vehicleName}`,
          details: `Maintenance record #${completeRecord.id} has been marked as completed`,
          link: `/admin/maintenance?id=${completeRecord.id}`
        }));
      }

      return completeRecord;
    } catch (error) {
      console.error('Error updating maintenance record:', error);
      return rejectWithValue(error.message || 'Failed to update maintenance record');
    }
  }
);

// Delete a maintenance record
export const deleteMaintenanceRecord = createAsyncThunk(
  'maintenance/deleteRecord',
  async (recordId, { rejectWithValue }) => {
    try {
      await MaintenanceTrackingService.deleteMaintenanceRecord(recordId);
      return recordId;
    } catch (error) {
      console.error('Error deleting maintenance record:', error);
      return rejectWithValue(error.message || 'Failed to delete maintenance record');
    }
  }
);

// Check for scheduled maintenance based on odometer and date
export const checkScheduledMaintenance = createAsyncThunk(
  'maintenance/checkScheduled',
  async (_, { getState, dispatch }) => {
    try {
      const { vehicles } = getState().vehicles;
      const { records } = getState().maintenance;
      const alerts = [];
      
      // Current date for comparison
      const today = new Date();
      
      // Check each vehicle for upcoming maintenance
      vehicles.forEach(vehicle => {
        // Find latest maintenance for this vehicle
        const vehicleMaintenance = records
          .filter(record => record.vehicle_id === vehicle.id)
          .sort((a, b) => new Date(b.date) - new Date(a.date));
          
        const latestMaintenance = vehicleMaintenance[0];
        
        // If there's a next_service date and it's within 7 days
        if (latestMaintenance?.next_service) {
          const nextServiceDate = new Date(latestMaintenance.next_service);
          const daysDifference = Math.floor((nextServiceDate - today) / (1000 * 60 * 60 * 24));
          
          if (daysDifference <= 7 && daysDifference >= 0) {
            dispatch(addNotification({
              type: 'warning',
              message: `Scheduled maintenance due soon for ${vehicle.name}`,
              details: `Maintenance scheduled for ${nextServiceDate.toLocaleDateString()}, in ${daysDifference} days`,
              link: `/admin/maintenance`
            }));
          }
        }
        
        // Check odometer-based service intervals if configured
        if (vehicle.service_interval_km && vehicle.odometer_reading) {
          const kmSinceLastService = vehicle.odometer_reading - (latestMaintenance?.odometer_reading || 0);
          const kmToNextService = vehicle.service_interval_km - kmSinceLastService;
          
          if (kmToNextService <= 100 && kmToNextService > 0) {
            dispatch(addNotification({
              type: 'warning',
              message: `Service due soon for ${vehicle.name}`,
              details: `Only ${kmToNextService} km until next scheduled service`,
              link: `/admin/maintenance`
            }));
          }
        }
      });
      
      return alerts;
    } catch (error) {
      console.error('Error checking scheduled maintenance:', error);
      return [];
    }
  }
);

const initialState = {
  records: [],
  selectedRecord: null,
  loading: false,
  creating: false,
  updating: false,
  deleting: false,
  error: null,
  filteredRecords: [],
};

const maintenanceSlice = createSlice({
  name: 'maintenance',
  initialState,
  reducers: {
    setFilteredRecords: (state, action) => {
      state.filteredRecords = action.payload;
    },
    clearSelectedRecord: (state) => {
      state.selectedRecord = null;
    },
    // Reset states
    resetMaintenanceState: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      // Fetch all records
      .addCase(fetchMaintenanceRecords.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMaintenanceRecords.fulfilled, (state, action) => {
        state.loading = false;
        state.records = action.payload;
        state.filteredRecords = action.payload;
      })
      .addCase(fetchMaintenanceRecords.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      
      // Fetch single record
      .addCase(fetchMaintenanceRecordById.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMaintenanceRecordById.fulfilled, (state, action) => {
        state.loading = false;
        state.selectedRecord = action.payload;
      })
      .addCase(fetchMaintenanceRecordById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      
      // Create record
      .addCase(createMaintenanceRecord.pending, (state) => {
        state.creating = true;
        state.error = null;
      })
      .addCase(createMaintenanceRecord.fulfilled, (state, action) => {
        state.creating = false;
        state.records = [action.payload, ...state.records];
        state.filteredRecords = [action.payload, ...state.filteredRecords];
      })
      .addCase(createMaintenanceRecord.rejected, (state, action) => {
        state.creating = false;
        state.error = action.payload;
      })
      
      // Update record
      .addCase(updateMaintenanceRecord.pending, (state) => {
        state.updating = true;
        state.error = null;
      })
      .addCase(updateMaintenanceRecord.fulfilled, (state, action) => {
        state.updating = false;
        state.records = state.records.map(record => 
          record.id === action.payload.id ? action.payload : record
        );
        state.filteredRecords = state.filteredRecords.map(record => 
          record.id === action.payload.id ? action.payload : record
        );
        state.selectedRecord = action.payload;
      })
      .addCase(updateMaintenanceRecord.rejected, (state, action) => {
        state.updating = false;
        state.error = action.payload;
      })
      
      // Delete record
      .addCase(deleteMaintenanceRecord.pending, (state) => {
        state.deleting = true;
        state.error = null;
      })
      .addCase(deleteMaintenanceRecord.fulfilled, (state, action) => {
        state.deleting = false;
        state.records = state.records.filter(record => record.id !== action.payload);
        state.filteredRecords = state.filteredRecords.filter(record => record.id !== action.payload);
        if (state.selectedRecord && state.selectedRecord.id === action.payload) {
          state.selectedRecord = null;
        }
      })
      .addCase(deleteMaintenanceRecord.rejected, (state, action) => {
        state.deleting = false;
        state.error = action.payload;
      })
      
      // Check scheduled maintenance - just used for notifications, doesn't need to update state
      .addCase(checkScheduledMaintenance.fulfilled, (state, action) => {
        // No state changes needed, notifications are handled in the thunk
      });
  },
});

export const { setFilteredRecords, clearSelectedRecord, resetMaintenanceState } = maintenanceSlice.actions;
export default maintenanceSlice.reducer;
