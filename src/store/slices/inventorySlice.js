import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import InventoryService from '../../services/InventoryService';

// Async thunks for API calls
export const fetchItems = createAsyncThunk(
  'inventory/fetchItems',
  async (filters = {}) => {
    const response = await InventoryService.getItems(filters);
    return Array.isArray(response) ? response : [];
  }
);

export const createItem = createAsyncThunk(
  'inventory/createItem',
  async (itemData) => {
    const response = await InventoryService.createItem(itemData);
    return response;
  }
);

export const updateItem = createAsyncThunk(
  'inventory/updateItem',
  async ({ id, itemData }) => {
    const response = await InventoryService.updateItem(id, itemData);
    return response;
  }
);

export const deleteItem = createAsyncThunk(
  'inventory/deleteItem',
  async (id) => {
    await InventoryService.deleteItem(id);
    return id;
  }
);

export const fetchStockMovements = createAsyncThunk(
  'inventory/fetchStockMovements',
  async (filters = {}) => {
    const response = await InventoryService.getStockMovements(filters);
    return Array.isArray(response) ? response : [];
  }
);

export const createStockMovement = createAsyncThunk(
  'inventory/createStockMovement',
  async (movementData) => {
    const response = await InventoryService.createStockMovement(movementData);
    return response;
  }
);

export const fetchPurchases = createAsyncThunk(
  'inventory/fetchPurchases',
  async (filters = {}) => {
    const response = await InventoryService.getPurchases(filters);
    return Array.isArray(response) ? response : [];
  }
);

export const createPurchase = createAsyncThunk(
  'inventory/createPurchase',
  async (purchaseData) => {
    const response = await InventoryService.createPurchase(purchaseData);
    return response;
  }
);

export const updatePurchase = createAsyncThunk(
  'inventory/updatePurchase',
  async ({ id, purchaseData }) => {
    const response = await InventoryService.updatePurchase(id, purchaseData);
    return response;
  }
);

export const deletePurchase = createAsyncThunk(
  'inventory/deletePurchase',
  async (id) => {
    await InventoryService.deletePurchase(id);
    return id;
  }
);

export const fetchDashboardData = createAsyncThunk(
  'inventory/fetchDashboardData',
  async () => {
    const response = await InventoryService.getDashboardData();
    // Ensure response has proper array structure
    return {
      totalItems: response?.totalItems || 0,
      lowStockCount: response?.lowStockItems || 0,
      recentPurchases: Array.isArray(response?.recentPurchases) ? response.recentPurchases : [],
      recentMovements: Array.isArray(response?.recentMovements) ? response.recentMovements : [],
      ...response
    };
  }
);

export const fetchLowStockItems = createAsyncThunk(
  'inventory/fetchLowStockItems',
  async () => {
    const response = await InventoryService.getLowStockItems();
    return Array.isArray(response) ? response : [];
  }
);

export const fetchVehicles = createAsyncThunk(
  'inventory/fetchVehicles',
  async () => {
    const response = await InventoryService.getVehicles();
    return Array.isArray(response) ? response : [];
  }
);

export const fetchMaintenanceRecords = createAsyncThunk(
  'inventory/fetchMaintenanceRecords',
  async () => {
    const response = await InventoryService.getMaintenanceRecords();
    return Array.isArray(response) ? response : [];
  }
);

const inventorySlice = createSlice({
  name: 'inventory',
  initialState: {
    // Items
    items: [],
    
    // Stock Movements
    stockMovements: [],
    
    // Purchases
    purchases: [],
    
    // Dashboard Data
    dashboardData: {
      totalItems: 0,
      lowStockCount: 0,
      recentPurchases: [],
      recentMovements: []
    },
    
    // Low Stock Items
    lowStockItems: [],
    
    // Utility Data
    vehicles: [],
    maintenanceRecords: [],
    
    // UI State - FIXED: Use object structure for different loading states
    loading: {
      items: false,
      stockMovements: false,
      purchases: false,
      dashboard: false,
      lowStock: false,
      vehicles: false,
      maintenance: false
    },
    error: null,
    
    // Filters
    filters: {
      items: {},
      stockMovements: {},
      purchases: {}
    }
  },
  reducers: {
    setLoading: (state, action) => {
      const { type, value } = action.payload;
      if (type) {
        state.loading[type] = value;
      } else {
        // Fallback for backward compatibility
        state.loading.items = value;
      }
    },
    setError: (state, action) => {
      state.error = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
    setItemsFilter: (state, action) => {
      state.filters.items = action.payload;
    },
    setStockMovementsFilter: (state, action) => {
      state.filters.stockMovements = action.payload;
    },
    setPurchasesFilter: (state, action) => {
      state.filters.purchases = action.payload;
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch Items
      .addCase(fetchItems.pending, (state) => {
        state.loading.items = true;
        state.error = null;
      })
      .addCase(fetchItems.fulfilled, (state, action) => {
        state.loading.items = false;
        state.items = Array.isArray(action.payload) ? action.payload : [];
      })
      .addCase(fetchItems.rejected, (state, action) => {
        state.loading.items = false;
        state.error = action.error.message;
        state.items = []; // Ensure array fallback
      })
      
      // Create Item
      .addCase(createItem.pending, (state) => {
        state.loading.items = true;
        state.error = null;
      })
      .addCase(createItem.fulfilled, (state, action) => {
        state.loading.items = false;
        if (action.payload) {
          state.items.push(action.payload);
        }
      })
      .addCase(createItem.rejected, (state, action) => {
        state.loading.items = false;
        state.error = action.error.message;
      })
      
      // Update Item
      .addCase(updateItem.pending, (state) => {
        state.loading.items = true;
        state.error = null;
      })
      .addCase(updateItem.fulfilled, (state, action) => {
        state.loading.items = false;
        if (action.payload) {
          const index = state.items.findIndex(item => item.id === action.payload.id);
          if (index !== -1) {
            state.items[index] = action.payload;
          }
        }
      })
      .addCase(updateItem.rejected, (state, action) => {
        state.loading.items = false;
        state.error = action.error.message;
      })
      
      // Delete Item
      .addCase(deleteItem.pending, (state) => {
        state.loading.items = true;
        state.error = null;
      })
      .addCase(deleteItem.fulfilled, (state, action) => {
        state.loading.items = false;
        state.items = state.items.filter(item => item.id !== action.payload);
      })
      .addCase(deleteItem.rejected, (state, action) => {
        state.loading.items = false;
        state.error = action.error.message;
      })
      
      // Fetch Stock Movements
      .addCase(fetchStockMovements.pending, (state) => {
        state.loading.stockMovements = true;
        state.error = null;
      })
      .addCase(fetchStockMovements.fulfilled, (state, action) => {
        state.loading.stockMovements = false;
        state.stockMovements = Array.isArray(action.payload) ? action.payload : [];
      })
      .addCase(fetchStockMovements.rejected, (state, action) => {
        state.loading.stockMovements = false;
        state.error = action.error.message;
        state.stockMovements = []; // Ensure array fallback
      })
      
      // Create Stock Movement
      .addCase(createStockMovement.pending, (state) => {
        state.loading.stockMovements = true;
        state.error = null;
      })
      .addCase(createStockMovement.fulfilled, (state, action) => {
        state.loading.stockMovements = false;
        if (action.payload) {
          state.stockMovements.unshift(action.payload);
        }
      })
      .addCase(createStockMovement.rejected, (state, action) => {
        state.loading.stockMovements = false;
        state.error = action.error.message;
      })
      
      // Fetch Purchases
      .addCase(fetchPurchases.pending, (state) => {
        state.loading.purchases = true;
        state.error = null;
      })
      .addCase(fetchPurchases.fulfilled, (state, action) => {
        state.loading.purchases = false;
        state.purchases = Array.isArray(action.payload) ? action.payload : [];
      })
      .addCase(fetchPurchases.rejected, (state, action) => {
        state.loading.purchases = false;
        state.error = action.error.message;
        state.purchases = []; // Ensure array fallback
      })
      
      // Create Purchase
      .addCase(createPurchase.pending, (state) => {
        state.loading.purchases = true;
        state.error = null;
      })
      .addCase(createPurchase.fulfilled, (state, action) => {
        state.loading.purchases = false;
        if (action.payload) {
          state.purchases.unshift(action.payload);
        }
      })
      .addCase(createPurchase.rejected, (state, action) => {
        state.loading.purchases = false;
        state.error = action.error.message;
      })
      
      // Update Purchase
      .addCase(updatePurchase.pending, (state) => {
        state.loading.purchases = true;
        state.error = null;
      })
      .addCase(updatePurchase.fulfilled, (state, action) => {
        state.loading.purchases = false;
        if (action.payload) {
          const index = state.purchases.findIndex(purchase => purchase.id === action.payload.id);
          if (index !== -1) {
            state.purchases[index] = action.payload;
          }
        }
      })
      .addCase(updatePurchase.rejected, (state, action) => {
        state.loading.purchases = false;
        state.error = action.error.message;
      })
      
      // Delete Purchase
      .addCase(deletePurchase.pending, (state) => {
        state.loading.purchases = true;
        state.error = null;
      })
      .addCase(deletePurchase.fulfilled, (state, action) => {
        state.loading.purchases = false;
        state.purchases = state.purchases.filter(purchase => purchase.id !== action.payload);
      })
      .addCase(deletePurchase.rejected, (state, action) => {
        state.loading.purchases = false;
        state.error = action.error.message;
      })
      
      // Fetch Dashboard Data
      .addCase(fetchDashboardData.pending, (state) => {
        state.loading.dashboard = true;
        state.error = null;
      })
      .addCase(fetchDashboardData.fulfilled, (state, action) => {
        state.loading.dashboard = false;
        state.dashboardData = {
          totalItems: action.payload?.totalItems || 0,
          lowStockCount: action.payload?.lowStockItems || 0,
          recentPurchases: Array.isArray(action.payload?.recentPurchases) ? action.payload.recentPurchases : [],
          recentMovements: Array.isArray(action.payload?.recentMovements) ? action.payload.recentMovements : [],
          ...action.payload
        };
      })
      .addCase(fetchDashboardData.rejected, (state, action) => {
        state.loading.dashboard = false;
        state.error = action.error.message;
        // Ensure fallback data structure
        state.dashboardData = {
          totalItems: 0,
          lowStockCount: 0,
          recentPurchases: [],
          recentMovements: []
        };
      })
      
      // Fetch Low Stock Items
      .addCase(fetchLowStockItems.pending, (state) => {
        state.loading.lowStock = true;
        state.error = null;
      })
      .addCase(fetchLowStockItems.fulfilled, (state, action) => {
        state.loading.lowStock = false;
        state.lowStockItems = Array.isArray(action.payload) ? action.payload : [];
      })
      .addCase(fetchLowStockItems.rejected, (state, action) => {
        state.loading.lowStock = false;
        state.error = action.error.message;
        state.lowStockItems = []; // Ensure array fallback
      })
      
      // Fetch Vehicles
      .addCase(fetchVehicles.pending, (state) => {
        state.loading.vehicles = true;
        state.error = null;
      })
      .addCase(fetchVehicles.fulfilled, (state, action) => {
        state.loading.vehicles = false;
        state.vehicles = Array.isArray(action.payload) ? action.payload : [];
      })
      .addCase(fetchVehicles.rejected, (state, action) => {
        state.loading.vehicles = false;
        state.error = action.error.message;
        state.vehicles = []; // Ensure array fallback
      })
      
      // Fetch Maintenance Records
      .addCase(fetchMaintenanceRecords.pending, (state) => {
        state.loading.maintenance = true;
        state.error = null;
      })
      .addCase(fetchMaintenanceRecords.fulfilled, (state, action) => {
        state.loading.maintenance = false;
        state.maintenanceRecords = Array.isArray(action.payload) ? action.payload : [];
      })
      .addCase(fetchMaintenanceRecords.rejected, (state, action) => {
        state.loading.maintenance = false;
        state.error = action.error.message;
        state.maintenanceRecords = []; // Ensure array fallback
      });
  }
});

export const {
  setLoading,
  setError,
  clearError,
  setItemsFilter,
  setStockMovementsFilter,
  setPurchasesFilter
} = inventorySlice.actions;

export default inventorySlice.reducer;