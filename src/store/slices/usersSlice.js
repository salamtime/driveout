import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { assertCanCreateStaffUser, clearTenantRuntimeControlsCache } from '../../services/TenantLimitService';
import {
  addUser as addUserService,
  deleteUser as deleteUserService,
  getUsers as getUsersService,
  updateUserProfile as updateUserProfileService,
} from '../../services/UserService';

// Async thunks
export const fetchUsers = createAsyncThunk(
  'users/fetchUsers',
  async (_, { rejectWithValue }) => {
    try {
      console.log('👥 Fetching users from database...');
      const users = await getUsersService();
      return users || [];
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
      const normalizedRole = String(userData?.role || '').trim().toLowerCase();
      if (normalizedRole && normalizedRole !== 'customer') {
        await assertCanCreateStaffUser();
      }

      const { user } = await addUserService(
        userData.email,
        userData.password,
        userData.full_name,
        userData.role,
        { phone_number: userData.phone || null }
      );

      console.log('✅ User created successfully:', user);
      clearTenantRuntimeControlsCache();
      
      return {
        id: user.id,
        email: user.email,
        full_name: user.full_name || userData.full_name,
        role: user.role || userData.role,
        status: user.status || 'active',
        created_at: user.created_at,
        phone: user.phone || userData.phone || null
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

      const { user } = await updateUserProfileService(id, {
        email: updateData.email,
        name: updateData.full_name,
        role: updateData.role,
        phone_number: updateData.phone,
        password: updateData.password,
      });
      
      console.log('✅ User updated successfully');
      
      return {
        id,
        ...updateData,
        email: user?.email || updateData.email,
        full_name: user?.full_name || updateData.full_name,
        role: user?.role || updateData.role,
        phone: user?.phone || updateData.phone || null,
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
      await deleteUserService(userId);
      
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
        state.error = null;
      })
      .addCase(createUser.fulfilled, (state, action) => {
        state.users.push(action.payload);
        state.isCreating = false;
        state.totalCount = state.users.length;
      })
      .addCase(createUser.rejected, (state, action) => {
        state.isCreating = false;
        state.error = action.payload || action.error.message;
      })
      .addCase(updateUser.pending, (state) => {
        state.isUpdating = true;
        state.error = null;
      })
      .addCase(updateUser.fulfilled, (state, action) => {
        const index = state.users.findIndex(user => user.id === action.payload.id);
        if (index !== -1) {
          state.users[index] = { ...state.users[index], ...action.payload };
        }
        state.isUpdating = false;
      })
      .addCase(updateUser.rejected, (state, action) => {
        state.isUpdating = false;
        state.error = action.payload || action.error.message;
      })
      .addCase(deleteUser.pending, (state) => {
        state.isDeleting = true;
        state.error = null;
      })
      .addCase(deleteUser.fulfilled, (state, action) => {
        state.users = state.users.filter(user => user.id !== action.payload);
        state.isDeleting = false;
        state.totalCount = state.users.length;
      })
      .addCase(deleteUser.rejected, (state, action) => {
        state.isDeleting = false;
        state.error = action.payload || action.error.message;
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
