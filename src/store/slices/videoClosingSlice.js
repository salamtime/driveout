import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import videoCaptureService from '../../services/videoCaptureService';
import rentalClosingService from '../../services/rentalClosingService';

// Async thunk for closing rental with video
export const closeRentalWithVideo = createAsyncThunk(
  'videoClosing/closeRentalWithVideo',
  async ({ rentalId, videoId }, { rejectWithValue }) => {
    try {
      // Validate permissions
      const permissionCheck = await rentalClosingService.checkClosingPermissions(rentalId);
      if (!permissionCheck.canClose) {
        throw new Error(permissionCheck.reason);
      }
      
      // Validate video
      const video = await videoCaptureService.getVideo(videoId);
      if (!video || video.validation_status !== 'valid') {
        throw new Error('Valid video is required to close rental');
      }
      
      // Close rental
      const result = await rentalClosingService.closeRental(rentalId, videoId);
      
      return result;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

// Async thunk for admin override
export const adminOverrideClose = createAsyncThunk(
  'videoClosing/adminOverrideClose',
  async ({ rentalId, reason, pin }, { rejectWithValue }) => {
    try {
      const result = await rentalClosingService.adminOverrideClose(rentalId, reason, pin);
      return result;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

// Async thunk for initiating capture session
export const initiateCaptureSession = createAsyncThunk(
  'videoClosing/initiateCaptureSession',
  async (rentalId, { rejectWithValue }) => {
    try {
      const session = await videoCaptureService.initiateCaptureSession(rentalId);
      return { rentalId, session };
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

// Async thunk for uploading video
export const uploadClosingVideo = createAsyncThunk(
  'videoClosing/uploadClosingVideo',
  async ({ sessionToken, videoFile, metadata }, { rejectWithValue }) => {
    try {
      const result = await videoCaptureService.uploadVideo(sessionToken, videoFile, metadata);
      return result;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

// Async thunk for getting closing requirements
export const getClosingRequirements = createAsyncThunk(
  'videoClosing/getClosingRequirements',
  async (rentalId, { rejectWithValue }) => {
    try {
      const requirements = await rentalClosingService.getClosingRequirements(rentalId);
      return { rentalId, requirements };
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

// Async thunk for getting audit trail
export const getAuditTrail = createAsyncThunk(
  'videoClosing/getAuditTrail',
  async (rentalId, { rejectWithValue }) => {
    try {
      const auditTrail = await rentalClosingService.getAuditTrail(rentalId);
      return { rentalId, auditTrail };
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const initialState = {
  // Active closing processes
  activeClosings: {},
  
  // Capture sessions
  captureSessions: {},
  
  // Uploaded videos
  closingVideos: {},
  
  // Closing requirements
  closingRequirements: {},
  
  // Audit trails
  auditTrails: {},
  
  // UI state
  loading: false,
  error: null,
  
  // Current operation
  currentOperation: null
};

const videoClosingSlice = createSlice({
  name: 'videoClosing',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    
    setCurrentOperation: (state, action) => {
      state.currentOperation = action.payload;
    },
    
    clearCurrentOperation: (state) => {
      state.currentOperation = null;
    },
    
    updateClosingProgress: (state, action) => {
      const { rentalId, progress } = action.payload;
      if (state.activeClosings[rentalId]) {
        state.activeClosings[rentalId] = {
          ...state.activeClosings[rentalId],
          ...progress
        };
      }
    },
    
    clearClosingData: (state, action) => {
      const rentalId = action.payload;
      delete state.activeClosings[rentalId];
      delete state.captureSessions[rentalId];
      delete state.closingVideos[rentalId];
      delete state.closingRequirements[rentalId];
    }
  },
  
  extraReducers: (builder) => {
    builder
      // Close rental with video
      .addCase(closeRentalWithVideo.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.currentOperation = 'closing';
      })
      .addCase(closeRentalWithVideo.fulfilled, (state, action) => {
        state.loading = false;
        state.currentOperation = null;
        const rentalId = action.meta.arg.rentalId;
        
        // Clear closing data for this rental
        delete state.activeClosings[rentalId];
        delete state.captureSessions[rentalId];
        delete state.closingRequirements[rentalId];
      })
      .addCase(closeRentalWithVideo.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        state.currentOperation = null;
      })
      
      // Admin override
      .addCase(adminOverrideClose.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.currentOperation = 'override';
      })
      .addCase(adminOverrideClose.fulfilled, (state, action) => {
        state.loading = false;
        state.currentOperation = null;
        const rentalId = action.meta.arg.rentalId;
        
        // Clear closing data for this rental
        delete state.activeClosings[rentalId];
        delete state.captureSessions[rentalId];
        delete state.closingRequirements[rentalId];
      })
      .addCase(adminOverrideClose.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        state.currentOperation = null;
      })
      
      // Initiate capture session
      .addCase(initiateCaptureSession.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(initiateCaptureSession.fulfilled, (state, action) => {
        state.loading = false;
        const { rentalId, session } = action.payload;
        state.captureSessions[rentalId] = session;
      })
      .addCase(initiateCaptureSession.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      
      // Upload video
      .addCase(uploadClosingVideo.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.currentOperation = 'uploading';
      })
      .addCase(uploadClosingVideo.fulfilled, (state, action) => {
        state.loading = false;
        state.currentOperation = null;
        const rentalId = action.meta.arg.metadata.rentalId;
        state.closingVideos[rentalId] = action.payload;
      })
      .addCase(uploadClosingVideo.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        state.currentOperation = null;
      })
      
      // Get closing requirements
      .addCase(getClosingRequirements.fulfilled, (state, action) => {
        const { rentalId, requirements } = action.payload;
        state.closingRequirements[rentalId] = requirements;
      })
      
      // Get audit trail
      .addCase(getAuditTrail.fulfilled, (state, action) => {
        const { rentalId, auditTrail } = action.payload;
        state.auditTrails[rentalId] = auditTrail;
      });
  }
});

// Selectors
export const selectVideoClosingLoading = (state) => state.videoClosing.loading;
export const selectVideoClosingError = (state) => state.videoClosing.error;
export const selectCurrentOperation = (state) => state.videoClosing.currentOperation;

export const selectCaptureSession = (state, rentalId) => 
  state.videoClosing.captureSessions[rentalId];

export const selectClosingVideo = (state, rentalId) => 
  state.videoClosing.closingVideos[rentalId];

export const selectClosingRequirements = (state, rentalId) => 
  state.videoClosing.closingRequirements[rentalId];

export const selectAuditTrail = (state, rentalId) => 
  state.videoClosing.auditTrails[rentalId];

export const selectActiveClosing = (state, rentalId) => 
  state.videoClosing.activeClosings[rentalId];

export const {
  clearError,
  setCurrentOperation,
  clearCurrentOperation,
  updateClosingProgress,
  clearClosingData
} = videoClosingSlice.actions;

export default videoClosingSlice.reducer;