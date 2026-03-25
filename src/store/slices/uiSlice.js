import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  menuOpen: false,
  sidebarOpen: false,
  theme: 'light',
  language: 'en',
  loading: false,
  notifications: [],
  modals: {
    login: false,
    register: false,
    booking: false
  }
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setMenuOpen: (state, action) => {
      state.menuOpen = action.payload;
    },
    toggleMenu: (state) => {
      state.menuOpen = !state.menuOpen;
    },
    setSidebarOpen: (state, action) => {
      state.sidebarOpen = action.payload;
    },
    toggleSidebar: (state) => {
      state.sidebarOpen = !state.sidebarOpen;
    },
    setTheme: (state, action) => {
      state.theme = action.payload;
    },
    setLanguage: (state, action) => {
      state.language = action.payload;
    },
    setLoading: (state, action) => {
      state.loading = action.payload;
    },
    addNotification: (state, action) => {
      state.notifications.push({
        id: Date.now(),
        ...action.payload
      });
    },
    removeNotification: (state, action) => {
      state.notifications = state.notifications.filter(
        notification => notification.id !== action.payload
      );
    },
    clearNotifications: (state) => {
      state.notifications = [];
    },
    openModal: (state, action) => {
      state.modals[action.payload] = true;
    },
    closeModal: (state, action) => {
      state.modals[action.payload] = false;
    },
    closeAllModals: (state) => {
      Object.keys(state.modals).forEach(modal => {
        state.modals[modal] = false;
      });
    }
  }
});

// Selectors
export const selectMenuOpen = (state) => state.ui.menuOpen;
export const selectSidebarOpen = (state) => state.ui.sidebarOpen;
export const selectTheme = (state) => state.ui.theme;
export const selectLanguage = (state) => state.ui.language;
export const selectUILoading = (state) => state.ui.loading;
export const selectNotifications = (state) => state.ui.notifications;
export const selectModals = (state) => state.ui.modals;
export const selectModalOpen = (modalName) => (state) => state.ui.modals[modalName];

export const {
  setMenuOpen,
  toggleMenu,
  setSidebarOpen,
  toggleSidebar,
  setTheme,
  setLanguage,
  setLoading,
  addNotification,
  removeNotification,
  clearNotifications,
  openModal,
  closeModal,
  closeAllModals
} = uiSlice.actions;

export default uiSlice.reducer;