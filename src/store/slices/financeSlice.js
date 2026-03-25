import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { supabase } from '../../utils/supabaseClient';

// Async thunks
export const fetchFinanceRecords = createAsyncThunk(
  'finance/fetchRecords',
  async ({ startDate, endDate, type, category } = {}, { rejectWithValue }) => {
    try {
      console.log('💰 Fetching finance records...');
      
      let query = supabase
        .from('finance_records')
        .select('*')
        .order('transaction_date', { ascending: false });

      // Add filters if provided
      if (startDate) {
        query = query.gte('transaction_date', startDate);
      }
      
      if (endDate) {
        query = query.lte('transaction_date', endDate);
      }
      
      if (type && type !== 'all') {
        query = query.eq('transaction_type', type);
      }
      
      if (category && category !== 'all') {
        query = query.eq('category', category);
      }

      const { data, error } = await query;

      if (error) {
        console.error('❌ Finance records fetch error:', error);
        throw error;
      }

      console.log('✅ Finance records fetched successfully:', data?.length || 0, 'records');
      return data || [];
    } catch (error) {
      console.error('❌ Finance records fetch failed:', error);
      return rejectWithValue(error.message);
    }
  }
);

export const createFinanceRecord = createAsyncThunk(
  'finance/createRecord',
  async (recordData, { rejectWithValue }) => {
    try {
      console.log('💰 Creating finance record:', recordData);
      
      const { data, error } = await supabase
        .from('finance_records')
        .insert([{
          ...recordData,
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) {
        console.error('❌ Finance record create error:', error);
        throw error;
      }

      console.log('✅ Finance record created successfully:', data);
      return data;
    } catch (error) {
      console.error('❌ Finance record create failed:', error);
      return rejectWithValue(error.message);
    }
  }
);

export const updateFinanceRecord = createAsyncThunk(
  'finance/updateRecord',
  async ({ id, ...updateData }, { rejectWithValue }) => {
    try {
      console.log('📝 Updating finance record:', id, updateData);
      
      const { data, error } = await supabase
        .from('finance_records')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('❌ Finance record update error:', error);
        throw error;
      }

      console.log('✅ Finance record updated successfully:', data);
      return data;
    } catch (error) {
      console.error('❌ Finance record update failed:', error);
      return rejectWithValue(error.message);
    }
  }
);

export const deleteFinanceRecord = createAsyncThunk(
  'finance/deleteRecord',
  async (recordId, { rejectWithValue }) => {
    try {
      console.log('🗑️ Deleting finance record:', recordId);
      
      const { error } = await supabase
        .from('finance_records')
        .delete()
        .eq('id', recordId);

      if (error) {
        console.error('❌ Finance record delete error:', error);
        throw error;
      }

      console.log('✅ Finance record deleted successfully');
      return recordId;
    } catch (error) {
      console.error('❌ Finance record delete failed:', error);
      return rejectWithValue(error.message);
    }
  }
);

const initialState = {
  records: [],
  selectedRecord: null,
  loading: false,
  error: null,
  filters: {
    type: 'all',
    category: 'all',
    startDate: null,
    endDate: null
  },
  stats: {
    totalIncome: 0,
    totalExpenses: 0,
    netProfit: 0,
    monthlyIncome: 0,
    monthlyExpenses: 0
  }
};

const financeSlice = createSlice({
  name: 'finance',
  initialState,
  reducers: {
    setSelectedRecord: (state, action) => {
      state.selectedRecord = action.payload;
    },
    setFilters: (state, action) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    clearError: (state) => {
      state.error = null;
    },
    setError: (state, action) => {
      state.error = action.payload;
    },
    updateStats: (state) => {
      const records = state.records;
      const currentMonth = new Date().toISOString().substring(0, 7);
      
      state.stats = {
        totalIncome: records
          .filter(r => r.transaction_type === 'income')
          .reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0),
        totalExpenses: records
          .filter(r => r.transaction_type === 'expense')
          .reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0),
        monthlyIncome: records
          .filter(r => r.transaction_type === 'income' && r.transaction_date.startsWith(currentMonth))
          .reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0),
        monthlyExpenses: records
          .filter(r => r.transaction_type === 'expense' && r.transaction_date.startsWith(currentMonth))
          .reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0)
      };
      
      state.stats.netProfit = state.stats.totalIncome - state.stats.totalExpenses;
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch Records
      .addCase(fetchFinanceRecords.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchFinanceRecords.fulfilled, (state, action) => {
        state.loading = false;
        state.records = action.payload;
        financeSlice.caseReducers.updateStats(state);
      })
      .addCase(fetchFinanceRecords.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      
      // Create Record
      .addCase(createFinanceRecord.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createFinanceRecord.fulfilled, (state, action) => {
        state.loading = false;
        state.records.unshift(action.payload);
        financeSlice.caseReducers.updateStats(state);
      })
      .addCase(createFinanceRecord.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      
      // Update Record
      .addCase(updateFinanceRecord.fulfilled, (state, action) => {
        const index = state.records.findIndex(record => record.id === action.payload.id);
        if (index !== -1) {
          state.records[index] = action.payload;
          financeSlice.caseReducers.updateStats(state);
        }
      })
      
      // Delete Record
      .addCase(deleteFinanceRecord.fulfilled, (state, action) => {
        state.records = state.records.filter(record => record.id !== action.payload);
        financeSlice.caseReducers.updateStats(state);
      });
  }
});

// Selectors
export const selectFinanceRecords = (state) => state.finance.records;
export const selectFinanceLoading = (state) => state.finance.loading;
export const selectFinanceError = (state) => state.finance.error;
export const selectFinanceFilters = (state) => state.finance.filters;
export const selectFinanceStats = (state) => state.finance.stats;
export const selectSelectedFinanceRecord = (state) => state.finance.selectedRecord;

export const selectFilteredFinanceRecords = (state) => {
  const { records, filters } = state.finance;
  
  return records.filter(record => {
    const typeMatch = filters.type === 'all' || record.transaction_type === filters.type;
    const categoryMatch = filters.category === 'all' || record.category === filters.category;
    
    let dateMatch = true;
    if (filters.startDate) {
      dateMatch = dateMatch && new Date(record.transaction_date) >= new Date(filters.startDate);
    }
    if (filters.endDate) {
      dateMatch = dateMatch && new Date(record.transaction_date) <= new Date(filters.endDate);
    }
    
    return typeMatch && categoryMatch && dateMatch;
  });
};

export const {
  setSelectedRecord,
  setFilters,
  clearError,
  setError,
  updateStats
} = financeSlice.actions;

export default financeSlice.reducer;