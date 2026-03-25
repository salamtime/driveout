import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { supabase } from '../../utils/supabaseClient';

// Async thunks
export const fetchUsers = createAsyncThunk(
  'users/fetchUsers',
  async (_, { rejectWithValue }) => {
    try {
      console.log('👥 Fetching users from database...');
      
      // Try to fetch from custom users table first
      const { data: customUsers, error: customError } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (customUsers && customUsers.length > 0) {
        console.log('✅ Users fetched from custom table:', customUsers.length);
        return customUsers;
      }
      
      // Fallback to auth users if no custom users
      try {
        const { data: authData, error: authError } = await supabase.auth.admin.listUsers();
        
        if (authData?.users) {
          console.log('✅ Users fetched from auth:', authData.users.length);
          
          const transformedUsers = authData.users.map(user => ({
            id: user.id,
            email: user.email,
            full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Unknown User',
            role: user.user_metadata?.role || 'customer',
            status: user.email_confirmed_at ? 'active' : 'pending',
            created_at: user.created_at,
            updated_at: user.updated_at,
            phone: user.phone || null
          }));
          
          return transformedUsers;
        }
      } catch (authError) {
        console.warn('Auth users fetch failed:', authError);
      }
      
      // Return empty array if all fail
      return [];
    } catch (error) {
      console.error('❌ Users fetch failed:', error);
      return rejectWithValue(error.message);
    }
  }
);

export const createUser = createAsyncThunk(
  'users/createUser',
  async (userData, { rejectWithValue }) => {
    try {
      console.log('👤 Creating user:', userData);
      
      // Create user in auth first
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: userData.email,
        password: userData.password,
        email_confirm: true,
        user_metadata: {
          full_name: userData.full_name,
          role: userData.role
        }
      });
      
      if (authError) {
        console.error('❌ Auth user create error:', authError);
        throw authError;
      }
      
      // Also create in custom users table
      const { data: customUserData, error: customError } = await supabase
        .from('users')
        .insert([{
          auth_user_id: authData.user.id,
          email: userData.email,
          full_name: userData.full_name,
          role: userData.role,
          status: 'active',
          phone: userData.phone || null
        }])
        .select()
        .single();
      
      if (customError) {
        console.warn('Custom user create failed:', customError);
      }
      
      console.log('✅ User created successfully:', authData.user);
      
      return {
        id: authData.user.id,
        email: authData.user.email,
        full_name: userData.full_name,
        role: userData.role,
        status: 'active',
        created_at: authData.user.created_at,
        phone: userData.phone || null
      };
    } catch (error) {
      console.error('❌ User create failed:', error);
      return rejectWithValue(error.message);
    }
  }
);

export const updateUser = createAsyncThunk(
  'users/updateUser',
  async ({ id, ...updateData }, { rejectWithValue }) => {
    try {
      console.log('📝 Updating user:', id, updateData);
      
      // Update in auth
      const { data: authData, error: authError } = await supabase.auth.admin.updateUserById(id, {
        user_metadata: {
          full_name: updateData.full_name,
          role: updateData.role
        }
      });
      
      if (authError) {
        console.error('❌ Auth user update error:', authError);
        throw authError;
      }
      
      // Update in custom users table
      const { data: customUserData, error: customError } = await supabase
        .from('users')
        .update({
          ...updateData,
          updated_at: new Date().toISOString()
        })
        .eq('auth_user_id', id)
        .select()
        .single();
      
      if (customError) {
        console.warn('Custom user update failed:', customError);
      }
      
      console.log('✅ User updated successfully');
      
      return {
        id,
        ...updateData,
        updated_at: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ User update failed:', error);
      return rejectWithValue(error.message);
    }
  }
);

export const deleteUser = createAsyncThunk(
  'users/deleteUser',
  async (userId, { rejectWithValue }) => {
    try {
      console.log('🗑️ Deleting user:', userId);
      
      // Delete from auth
      const { error: authError } = await supabase.auth.admin.deleteUser(userId);
      
      if (authError) {
        console.error('❌ Auth user delete error:', authError);
        throw authError;
      }
      
      // Delete from custom users table
      const { error: customError } = await supabase
        .from('users')
        .delete()
        .eq('auth_user_id', userId);
      
      if (customError) {
        console.warn('Custom user delete failed:', customError);
      }
      
      console.log('✅ User deleted successfully');
      return userId;
    } catch (error) {
      console.error('❌ User delete failed:', error);
      return rejectWithValue(error.message);
    }
  }
);

const initialState = {
  users: [],
  selectedUser: null,
  loading: false,
  error: null,
  totalCount: 0,
  currentPage: 1,
  pageSize: 10,
  filterRole: 'all',
  isCreating: false,
  isUpdating: false,
  isDeleting: false
};

const usersSlice = createSlice({
  name: 'users',
  initialState,
  reducers: {
    setUsers: (state, action) => {
      state.users = action.payload;
    },
    addUser: (state, action) => {
      state.users.push(action.payload);
      state.totalCount += 1;
    },
    updateUser: (state, action) => {
      const index = state.users.findIndex(user => user.id === action.payload.id);
      if (index !== -1) {
        state.users[index] = { ...state.users[index], ...action.payload };
      }
    },
    deleteUser: (state, action) => {
      state.users = state.users.filter(user => user.id !== action.payload);
      state.totalCount -= 1;
    },
    setSelectedUser: (state, action) => {
      state.selectedUser = action.payload;
    },
    setLoading: (state, action) => {
      state.loading = action.payload;
    },
    setError: (state, action) => {
      state.error = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
    setFilterRole: (state, action) => {
      state.filterRole = action.payload;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUsers.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchUsers.fulfilled, (state, action) => {
        state.users = action.payload || [];
        state.loading = false;
      })
      .addCase(fetchUsers.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })
      .addCase(createUser.pending, (state) => {
        state.isCreating = true;
      })
      .addCase(createUser.fulfilled, (state, action) => {
        state.users.push(action.payload);
        state.isCreating = false;
      })
      .addCase(createUser.rejected, (state) => {
        state.isCreating = false;
      });
  }
});

// Selectors
export const selectUsers = (state) => state.users.users;
export const selectUsersLoading = (state) => state.users.loading;
export const selectUsersError = (state) => state.users.error;
export const selectFilterRole = (state) => state.users.filterRole;
export const selectIsCreating = (state) => state.users.isCreating;
export const selectIsUpdating = (state) => state.users.isUpdating;
export const selectIsDeleting = (state) => state.users.isDeleting;
export const selectFilteredUsers = (state) => {
  const { users, filterRole } = state.users;
  if (filterRole === 'all') return users;
  return users.filter(user => user.role === filterRole);
};

export const {
  setUsers,
  addUser,
  updateUser: updateUserAction,
  deleteUser: deleteUserAction,
  setSelectedUser,
  setLoading,
  setError,
  clearError,
  setFilterRole
} = usersSlice.actions;

export default usersSlice.reducer;