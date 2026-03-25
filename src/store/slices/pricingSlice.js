import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import PricingService from '../../services/PricingService';

// Async thunks
export const fetchPricingRules = createAsyncThunk(
  'pricing/fetchRules',
  async (_, { rejectWithValue }) => {
    try {
      const result = await PricingService.getPricingRules();
      if (result.success) {
        return result.data;
      }
      return rejectWithValue(result.error);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const calculateRentalPricing = createAsyncThunk(
  'pricing/calculateRental',
  async (rentalParams, { rejectWithValue }) => {
    try {
      const result = await PricingService.calculateRentalPricing(rentalParams);
      if (result.success) {
        return result;
      }
      return rejectWithValue(result.error);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const savePricingRule = createAsyncThunk(
  'pricing/saveRule',
  async (ruleData, { rejectWithValue, dispatch }) => {
    try {
      const result = await PricingService.savePricingRule(ruleData);
      if (result.success) {
        dispatch(fetchPricingRules());
        return result.data;
      }
      return rejectWithValue(result.error);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const deletePricingRule = createAsyncThunk(
  'pricing/deleteRule',
  async (ruleId, { rejectWithValue, dispatch }) => {
    try {
      const result = await PricingService.deletePricingRule(ruleId);
      if (result.success) {
        dispatch(fetchPricingRules());
        return ruleId;
      }
      return rejectWithValue(result.error);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const pricingSlice = createSlice({
  name: 'pricing',
  initialState: {
    rules: [],
    currentCalculation: null,
    loading: false,
    error: null,
    calculationLoading: false,
    calculationError: null
  },
  reducers: {
    clearCalculation: (state) => {
      state.currentCalculation = null;
      state.calculationError = null;
    },
    clearError: (state) => {
      state.error = null;
      state.calculationError = null;
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch pricing rules
      .addCase(fetchPricingRules.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchPricingRules.fulfilled, (state, action) => {
        state.loading = false;
        state.rules = action.payload;
      })
      .addCase(fetchPricingRules.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      
      // Calculate rental pricing
      .addCase(calculateRentalPricing.pending, (state) => {
        state.calculationLoading = true;
        state.calculationError = null;
      })
      .addCase(calculateRentalPricing.fulfilled, (state, action) => {
        state.calculationLoading = false;
        state.currentCalculation = action.payload;
      })
      .addCase(calculateRentalPricing.rejected, (state, action) => {
        state.calculationLoading = false;
        state.calculationError = action.payload;
      })
      
      // Save pricing rule
      .addCase(savePricingRule.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(savePricingRule.fulfilled, (state) => {
        state.loading = false;
      })
      .addCase(savePricingRule.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      
      // Delete pricing rule
      .addCase(deletePricingRule.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(deletePricingRule.fulfilled, (state) => {
        state.loading = false;
      })
      .addCase(deletePricingRule.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  }
});

export const { clearCalculation, clearError } = pricingSlice.actions;

// Selectors
export const selectPricingRules = (state) => state.pricing.rules;
export const selectCurrentCalculation = (state) => state.pricing.currentCalculation;
export const selectPricingLoading = (state) => state.pricing.loading;
export const selectPricingError = (state) => state.pricing.error;
export const selectCalculationLoading = (state) => state.pricing.calculationLoading;
export const selectCalculationError = (state) => state.pricing.calculationError;

export default pricingSlice.reducer;