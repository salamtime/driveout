import { configureStore } from '@reduxjs/toolkit';
import authSlice from './slices/authSlice';
import usersSlice from './slices/usersSlice';
import dashboardSlice from './slices/dashboardSlice';
import projectExportSlice from './slices/projectExportSlice';
import vehiclesSlice from './slices/vehiclesSlice';
import rentalsSlice from './slices/rentalsSlice';
import uiSlice from './slices/uiSlice';
import notificationsSlice from './slices/notificationsSlice';
import toursSlice from './slices/toursSlice';
import bookingsSlice from './slices/bookingsSlice';
import maintenanceSlice from './slices/maintenanceSlice';
import activityLogSlice from './slices/activityLogSlice';
import paymentsSlice from './slices/paymentsSlice';
import inventorySlice from './slices/inventorySlice';
import alertsSlice from './slices/alertsSlice';
import financeSlice from './slices/financeSlice';
import pricingSlice from './slices/pricingSlice';
import videoClosingSlice from './slices/videoClosingSlice';
import settingsSlice from './slices/settingsSlice'; // Added missing settings slice

export const store = configureStore({
  reducer: {
    auth: authSlice,
    users: usersSlice,
    dashboard: dashboardSlice,
    projectExport: projectExportSlice,
    vehicles: vehiclesSlice,
    rentals: rentalsSlice,
    ui: uiSlice,
    notifications: notificationsSlice,
    tours: toursSlice,
    bookings: bookingsSlice,
    maintenance: maintenanceSlice,
    activityLog: activityLogSlice,
    payments: paymentsSlice,
    inventory: inventorySlice,
    alerts: alertsSlice,
    finance: financeSlice,
    pricing: pricingSlice,
    videoClosing: videoClosingSlice,
    settings: settingsSlice, // Added missing settings slice
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE']
      }
    })
});

export default store;