import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  exports: [],
  isExporting: false,
  progress: 0,
  error: null,
  lastExport: null,
  exportCount: 0
};

const projectExportSlice = createSlice({
  name: 'projectExport',
  initialState,
  reducers: {
    setExporting: (state, action) => {
      state.isExporting = action.payload;
    },
    setProgress: (state, action) => {
      state.progress = action.payload;
    },
    addExport: (state, action) => {
      state.exports.push(action.payload);
      state.exportCount += 1;
      state.lastExport = action.payload;
    },
    setError: (state, action) => {
      state.error = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
    resetProgress: (state) => {
      state.progress = 0;
      state.isExporting = false;
    }
  }
});

export const { 
  setExporting,
  setProgress,
  addExport,
  setError,
  clearError,
  resetProgress
} = projectExportSlice.actions;

export default projectExportSlice.reducer;