import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import VehicleService from '../../services/VehicleService';

// Async thunk for fetching vehicles
export const fetchVehicles = createAsyncThunk(
  'vehicles/fetchVehicles',
  async (_, { rejectWithValue }) => {
    try {
      return await VehicleService.getAllVehicles();
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

// Async thunk for adding a vehicle
export const addVehicle = createAsyncThunk(
  'vehicles/addVehicle',
  async (vehicleData, { rejectWithValue }) => {
    try {
      const result = await VehicleService.createVehicle(vehicleData);
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to create vehicle');
      }
      return result.vehicle;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

// Async thunk for updating a vehicle
export const updateVehicle = createAsyncThunk(
  'vehicles/updateVehicle',
  async ({ id, updates }, { rejectWithValue }) => {
    try {
      const result = await VehicleService.updateVehicle(id, updates);
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to update vehicle');
      }
      return result.vehicle;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

// Async thunk for deleting a vehicle
export const deleteVehicle = createAsyncThunk(
  'vehicles/deleteVehicle',
  async (id, { rejectWithValue }) => {
    try {
      const result = await VehicleService.deleteVehicle(id);
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to delete vehicle');
      }
      return id;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

// Function to check vehicle alerts
export const checkVehicleAlerts = (vehicleId) => {
  return (dispatch, getState) => {
    const { vehicles } = getState().vehicles;
    const vehicle = vehicles.find(v => v.id === vehicleId);
    
    if (!vehicle) return [];

    const alerts = [];
    const today = new Date();

    // Check maintenance alerts
    if (vehicle.next_oil_change_due) {
      const dueDate = new Date(vehicle.next_oil_change_due);
      const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysUntilDue <= 0) {
        alerts.push({
          id: `oil-overdue-${vehicle.id}`,
          type: 'maintenance',
          priority: 'high',
          title: 'Oil Change Overdue',
          message: `Oil change is ${Math.abs(daysUntilDue)} days overdue`,
          vehicleId: vehicle.id,
          vehicleName: vehicle.name
        });
      } else if (daysUntilDue <= 7) {
        alerts.push({
          id: `oil-due-${vehicle.id}`,
          type: 'maintenance',
          priority: 'medium',
          title: 'Oil Change Due Soon',
          message: `Oil change due in ${daysUntilDue} days`,
          vehicleId: vehicle.id,
          vehicleName: vehicle.name
        });
      }
    }

    // Check odometer-based oil change alerts
    if (vehicle.current_odometer && vehicle.next_oil_change_odometer) {
      const currentOdometer = parseFloat(vehicle.current_odometer);
      const nextOilChange = parseFloat(vehicle.next_oil_change_odometer);
      const kmUntilService = nextOilChange - currentOdometer;

      if (kmUntilService <= 0) {
        alerts.push({
          id: `oil-km-overdue-${vehicle.id}`,
          type: 'maintenance',
          priority: 'high',
          title: 'Oil Change Overdue (Odometer)',
          message: `Oil change is ${Math.abs(kmUntilService)}km overdue`,
          vehicleId: vehicle.id,
          vehicleName: vehicle.name
        });
      } else if (kmUntilService <= 100) {
        alerts.push({
          id: `oil-km-due-${vehicle.id}`,
          type: 'maintenance',
          priority: 'medium',
          title: 'Oil Change Due Soon (Odometer)',
          message: `Oil change due in ${kmUntilService}km`,
          vehicleId: vehicle.id,
          vehicleName: vehicle.name
        });
      }
    }

    // Check registration expiry
    if (vehicle.registration_expiry_date) {
      const expiryDate = new Date(vehicle.registration_expiry_date);
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysUntilExpiry <= 0) {
        alerts.push({
          id: `registration-expired-${vehicle.id}`,
          type: 'legal',
          priority: 'high',
          title: 'Registration Expired',
          message: `Registration expired ${Math.abs(daysUntilExpiry)} days ago`,
          vehicleId: vehicle.id,
          vehicleName: vehicle.name
        });
      } else if (daysUntilExpiry <= 30) {
        alerts.push({
          id: `registration-expiring-${vehicle.id}`,
          type: 'legal',
          priority: 'medium',
          title: 'Registration Expiring Soon',
          message: `Registration expires in ${daysUntilExpiry} days`,
          vehicleId: vehicle.id,
          vehicleName: vehicle.name
        });
      }
    }

    // Check insurance expiry
    if (vehicle.insurance_expiry_date) {
      const expiryDate = new Date(vehicle.insurance_expiry_date);
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysUntilExpiry <= 0) {
        alerts.push({
          id: `insurance-expired-${vehicle.id}`,
          type: 'legal',
          priority: 'high',
          title: 'Insurance Expired',
          message: `Insurance expired ${Math.abs(daysUntilExpiry)} days ago`,
          vehicleId: vehicle.id,
          vehicleName: vehicle.name
        });
      } else if (daysUntilExpiry <= 30) {
        alerts.push({
          id: `insurance-expiring-${vehicle.id}`,
          type: 'legal',
          priority: 'medium',
          title: 'Insurance Expiring Soon',
          message: `Insurance expires in ${daysUntilExpiry} days`,
          vehicleId: vehicle.id,
          vehicleName: vehicle.name
        });
      }
    }

    return alerts;
  };
};

const initialState = {
  vehicles: [],
  loading: false,
  error: null,
  alerts: []
};

const vehiclesSlice = createSlice({
  name: 'vehicles',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    setAlerts: (state, action) => {
      state.alerts = action.payload;
    },
    clearAlerts: (state) => {
      state.alerts = [];
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch vehicles
      .addCase(fetchVehicles.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchVehicles.fulfilled, (state, action) => {
        state.loading = false;
        state.vehicles = action.payload;
      })
      .addCase(fetchVehicles.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Add vehicle
      .addCase(addVehicle.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(addVehicle.fulfilled, (state, action) => {
        state.loading = false;
        state.vehicles.unshift(action.payload);
      })
      .addCase(addVehicle.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Update vehicle
      .addCase(updateVehicle.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateVehicle.fulfilled, (state, action) => {
        state.loading = false;
        const index = state.vehicles.findIndex(v => v.id === action.payload.id);
        if (index !== -1) {
          state.vehicles[index] = action.payload;
        }
      })
      .addCase(updateVehicle.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Delete vehicle
      .addCase(deleteVehicle.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(deleteVehicle.fulfilled, (state, action) => {
        state.loading = false;
        state.vehicles = state.vehicles.filter(v => v.id !== action.payload);
      })
      .addCase(deleteVehicle.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  }
});

export const { clearError, setAlerts, clearAlerts } = vehiclesSlice.actions;
export default vehiclesSlice.reducer;
