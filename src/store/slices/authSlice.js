import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { supabase } from '../../utils/supabaseClient';

// Helper to extract user roles from metadata
const extractUserRoles = (user) => {
  if (!user) return [];
  
  console.log('🔍 extractUserRoles - Extracting roles from user data:', JSON.stringify({
    email: user.email,
    user_metadata: user.user_metadata,
    app_metadata: user.app_metadata
  }, null, 2));
  
  // First check user_metadata for role
  if (user.user_metadata?.role) {
    console.log('✅ Found role in user_metadata:', user.user_metadata.role);
    return [user.user_metadata.role];
  }
  
  // Then check app_metadata for role
  if (user.app_metadata?.role) {
    console.log('✅ Found role in app_metadata:', user.app_metadata.role);
    return [user.app_metadata.role];
  }
  
  // Check for roles array in metadata (alternate format)
  if (user.user_metadata?.roles && Array.isArray(user.user_metadata.roles)) {
    console.log('✅ Found roles array in user_metadata:', user.user_metadata.roles);
    return user.user_metadata.roles;
  }
  
  if (user.app_metadata?.roles && Array.isArray(user.app_metadata.roles)) {
    console.log('✅ Found roles array in app_metadata:', user.app_metadata.roles);
    return user.app_metadata.roles;
  }
  
  // For demo owner user or email patterns
  if (user.email === 'owner_demo@saharax.com' || user.email?.includes('owner')) {
    console.log('✅ Using owner role based on email pattern');
    return ['owner'];
  }
  
  if (user.email?.includes('admin')) {
    console.log('✅ Using admin role based on email pattern');
    return ['admin'];
  }
  
  if (user.email?.includes('guide')) {
    console.log('✅ Using guide role based on email pattern');
    return ['guide'];
  }
  
  if (user.email?.includes('employee')) {
    console.log('✅ Using employee role based on email pattern');
    return ['employee'];
  }
  
  // Default role
  console.log('⚠️ No role found in metadata, using default "user" role');
  return ['user'];
};

// Async thunks
export const initializeAuth = createAsyncThunk(
  'auth/initializeAuth',
  async () => {
    console.log('🔄 initializeAuth thunk executing...');
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session?.user) {
      const userRoles = extractUserRoles(session.user);
      console.log('✅ Auth initialized with user:', session.user.email);
      console.log('✅ Extracted user roles:', userRoles);
      
      // Return both user and extracted roles
      return { 
        user: session.user,
        userRoles 
      };
    }
    
    console.log('⚠️ Auth initialized without user');
    return { user: null, userRoles: [] };
  }
);

export const login = createAsyncThunk(
  'auth/login',
  async ({ email, password }) => {
    console.log('🔄 Executing login thunk...');
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (error) {
      console.error('🚨 Login error:', error);
      throw error;
    }
    
    console.log('✅ Login success - user data:', data.user);
    console.log('✅ User metadata:', data.user?.user_metadata);
    console.log('✅ App metadata:', data.user?.app_metadata);
    
    return data.user;
  }
);

export const register = createAsyncThunk(
  'auth/register',
  async ({ email, password }) => {
    console.log('🔄 Executing register thunk...');
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    
    if (error) {
      console.error('🚨 Register error:', error);
      throw error;
    }
    
    console.log('✅ Register success - user data:', data.user);
    return data.user;
  }
);

export const updateProfile = createAsyncThunk(
  'auth/updateProfile',
  async (profileData) => {
    const { data, error } = await supabase.auth.updateUser(profileData);
    if (error) throw error;
    return data.user;
  }
);

const initialState = {
  user: null,
  userRoles: [],
  isAuthenticated: false,
  authChecked: false,
  loading: true,
  error: null,
  session: null
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser: (state, action) => {
      state.user = action.payload;
      state.isAuthenticated = !!action.payload;
    },
    setSession: (state, action) => {
      state.session = action.payload;
      state.isAuthenticated = !!action.payload;
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
    clearAuthError: (state) => {
      state.error = null;
    },
    logout: (state) => {
      state.user = null;
      state.userRoles = [];
      state.session = null;
      state.isAuthenticated = false;
      state.error = null;
      console.log('✅ User logged out - state cleared');
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(initializeAuth.fulfilled, (state, action) => {
        state.user = action.payload.user;
        state.userRoles = action.payload.userRoles;
        state.isAuthenticated = !!action.payload.user;
        state.authChecked = true;
        state.loading = false;
        console.log('✅ Auth state updated:', {
          user: !!state.user,
          userRoles: state.userRoles,
          isAuthenticated: state.isAuthenticated
        });
      })
      .addCase(login.fulfilled, (state, action) => {
        state.user = action.payload;
        state.userRoles = extractUserRoles(action.payload);
        state.isAuthenticated = true;
        state.authChecked = true;
        state.loading = false;
        state.error = null;
        console.log('✅ Login success - updated roles:', state.userRoles);
      })
      .addCase(register.fulfilled, (state, action) => {
        state.user = action.payload;
        state.userRoles = extractUserRoles(action.payload);
        state.isAuthenticated = true;
        state.authChecked = true;
        state.loading = false;
        state.error = null;
        console.log('✅ Register success - updated roles:', state.userRoles);
      })
      .addCase(updateProfile.fulfilled, (state, action) => {
        state.user = action.payload;
        state.loading = false;
      })
      .addMatcher(
        (action) => action.type.endsWith('/pending'),
        (state) => {
          state.loading = true;
          state.error = null;
        }
      )
      .addMatcher(
        (action) => action.type.endsWith('/rejected'),
        (state, action) => {
          state.loading = false;
          state.error = action.error.message;
        }
      );
  }
});

export const { 
  setUser, 
  setSession, 
  setLoading, 
  setError, 
  clearError, 
  clearAuthError,
  logout 
} = authSlice.actions;

export default authSlice.reducer;