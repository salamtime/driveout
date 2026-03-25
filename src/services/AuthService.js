import { supabase } from '../lib/supabase';

// Define role permissions
const ROLE_PERMISSIONS = {
  owner: ['all'],
  admin: ['dashboard', 'users', 'vehicles', 'rentals', 'tours', 'finance', 'settings', 'pricing'],
  employee: ['dashboard', 'rentals', 'tours', 'vehicles'],
  guide: ['dashboard', 'tours'],
  customer: ['dashboard', 'rentals']
};

export class AuthService {
  static async signUp(email, password, userData = {}) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: userData.full_name || '',
            role: userData.role || 'customer',
            ...userData
          }
        }
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Sign up error:', error);
      throw error;
    }
  }

  static async signIn(email, password) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    }
  }

  static async signOut() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  }

  static async getCurrentUser() {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      return user;
    } catch (error) {
      console.error('Get current user error:', error);
      throw error;
    }
  }

  static async updateProfile(updates) {
    try {
      const { data, error } = await supabase.auth.updateUser({
        data: updates
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Update profile error:', error);
      throw error;
    }
  }

  static async resetPassword(email) {
    try {
      const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Reset password error:', error);
      throw error;
    }
  }

  static async updatePassword(newPassword) {
    try {
      const { data, error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Update password error:', error);
      throw error;
    }
  }

  // Role and permission management
  static getUserRole(user) {
    return user?.user_metadata?.role || user?.app_metadata?.role || 'customer';
  }

  static hasPermission(user, permission) {
    const role = this.getUserRole(user);
    const permissions = ROLE_PERMISSIONS[role] || [];
    return permissions.includes('all') || permissions.includes(permission);
  }

  static canAccessRoute(user, route) {
    const role = this.getUserRole(user);
    const routePermissions = {
      '/admin': ['owner', 'admin'],
      '/admin/dashboard': ['owner', 'admin'],
      '/admin/users': ['owner', 'admin'],
      '/admin/vehicles': ['owner', 'admin', 'employee'],
      '/admin/rentals': ['owner', 'admin', 'employee'],
      '/admin/tours': ['owner', 'admin', 'employee', 'guide'],
      '/admin/finance': ['owner', 'admin'],
      '/admin/settings': ['owner', 'admin'],
      '/admin/pricing': ['owner', 'admin'],
      '/employee': ['owner', 'admin', 'employee'],
      '/guide': ['owner', 'admin', 'guide']
    };

    const allowedRoles = routePermissions[route] || ['customer'];
    return allowedRoles.includes(role);
  }

  // Session management
  static onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange(callback);
  }

  static async getSession() {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;
      return session;
    } catch (error) {
      console.error('Get session error:', error);
      throw error;
    }
  }

  // User management (admin functions)
  static async getAllUsers() {
    try {
      // This would typically require admin privileges
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Get all users error:', error);
      throw error;
    }
  }

  static async updateUserRole(userId, newRole) {
    try {
      // This would typically require admin privileges
      const { data, error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Update user role error:', error);
      throw error;
    }
  }

  static async deleteUser(userId) {
    try {
      // This would typically require admin privileges
      const { data, error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId);

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Delete user error:', error);
      throw error;
    }
  }

  // Utility functions
  static isAuthenticated(user) {
    return !!user;
  }

  static isAdmin(user) {
    const role = this.getUserRole(user);
    return ['owner', 'admin'].includes(role);
  }

  static isEmployee(user) {
    const role = this.getUserRole(user);
    return ['owner', 'admin', 'employee'].includes(role);
  }

  static isGuide(user) {
    const role = this.getUserRole(user);
    return ['owner', 'admin', 'guide'].includes(role);
  }

  // Profile management
  static async createProfile(user, additionalData = {}) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name || '',
          role: user.user_metadata?.role || 'customer',
          created_at: new Date().toISOString(),
          ...additionalData
        });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Create profile error:', error);
      throw error;
    }
  }

  static async getProfile(userId) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Get profile error:', error);
      throw error;
    }
  }

  static async updateUserProfile(userId, updates) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId);

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Update user profile error:', error);
      throw error;
    }
  }

  // Permission checking utilities
  static checkPermission(user, requiredPermission) {
    if (!user) return false;
    return this.hasPermission(user, requiredPermission);
  }

  static getPermissions(user) {
    const role = this.getUserRole(user);
    return ROLE_PERMISSIONS[role] || [];
  }
}

export default AuthService;