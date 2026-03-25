// src/store/slices/appSlice.js
import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  selectedLanguage: 'en', // Default language
  menuOpen: false, // Mobile menu state
  loading: false, // Global loading state
  notification: null, // Global notification
  currentTheme: 'light', // Theme state
};

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    setLanguage: (state, action) => {
      state.selectedLanguage = action.payload;
      localStorage.setItem('saharax_language', action.payload);
    },
    toggleMenu: (state) => {
      state.menuOpen = !state.menuOpen;
    },
    closeMenu: (state) => {
      state.menuOpen = false;
    },
    setLoading: (state, action) => {
      state.loading = action.payload;
    },
    setNotification: (state, action) => {
      state.notification = action.payload;
    },
    clearNotification: (state) => {
      state.notification = null;
    },
    setTheme: (state, action) => {
      state.currentTheme = action.payload;
      localStorage.setItem('saharax_theme', action.payload);
    }
  }
});

export const {
  setLanguage,
  toggleMenu,
  closeMenu,
  setLoading,
  setNotification,
  clearNotification,
  setTheme
} = appSlice.actions;

export default appSlice.reducer;