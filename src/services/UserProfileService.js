import { supabase } from '../lib/supabase';

class UserProfileService {
  // Get user profile with role information
  async getUserProfile(userId) {
    try {
      console.log('📋 Fetching user profile for:', userId);
      
      const { data, error } = await supabase
        .from('users')
        .select(`
          *,
          profile_picture_url,
          phone,
          address,
          date_of_birth,
          emergency_contact,
          emergency_phone,
          created_at,
          updated_at
        `)
        .eq('id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return { data, error: null };
    } catch (error) {
      console.error('❌ Error fetching user profile:', error);
      return { data: null, error };
    }
  }

  // Update user profile information
  async updateUserProfile(userId, profileData) {
    try {
      console.log('✏️ Updating user profile for:', userId);
      
      const updateData = {
        ...profileData,
        updated_at: new Date().toISOString()
      };

      // Remove sensitive fields that shouldn't be updated here
      delete updateData.id;
      delete updateData.email;
      delete updateData.role;
      delete updateData.created_at;

      const { data, error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      console.log('✅ Profile updated successfully');
      return { data, error: null };
    } catch (error) {
      console.error('❌ Error updating user profile:', error);
      return { data: null, error };
    }
  }

  // Update user's Supabase auth metadata
  async updateAuthMetadata(updates) {
    try {
      console.log('🔐 Updating auth metadata');
      
      const { data, error } = await supabase.auth.updateUser(updates);
      
      if (error) {
        throw error;
      }

      console.log('✅ Auth metadata updated successfully');
      return { data, error: null };
    } catch (error) {
      console.error('❌ Error updating auth metadata:', error);
      return { data: null, error };
    }
  }

  // Change user password
  async changePassword(newPassword) {
    try {
      console.log('🔒 Changing user password');
      
      const { data, error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) {
        throw error;
      }

      // Keep the current session/auth state in sync after a successful password update.
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        console.warn('⚠️ Password updated but session refresh failed:', refreshError);
      }

      console.log('✅ Password changed successfully');
      return { data, error: null };
    } catch (error) {
      console.error('❌ Error changing password:', error);
      return { data: null, error };
    }
  }

  // Upload profile picture
  async uploadProfilePicture(userId, file) {
    try {
      console.log('📸 Uploading profile picture for:', userId);
      
      // Create unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}_${Date.now()}.${fileExt}`;
      const filePath = `profile-pictures/${fileName}`;

      // Upload file to Supabase storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('profile-pictures')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('profile-pictures')
        .getPublicUrl(filePath);

      // Update user profile with new picture URL
      const { data: updateData, error: updateError } = await supabase
        .from('users')
        .update({ 
          profile_picture_url: publicUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      console.log('✅ Profile picture uploaded successfully');
      return { data: { url: publicUrl, user: updateData }, error: null };
    } catch (error) {
      console.error('❌ Error uploading profile picture:', error);
      return { data: null, error };
    }
  }

  // Delete profile picture
  async deleteProfilePicture(userId, pictureUrl) {
    try {
      console.log('🗑️ Deleting profile picture for:', userId);
      
      // Extract file path from URL
      const urlParts = pictureUrl.split('/');
      const fileName = urlParts[urlParts.length - 1];
      const filePath = `profile-pictures/${fileName}`;

      // Delete from storage
      const { error: deleteError } = await supabase.storage
        .from('profile-pictures')
        .remove([filePath]);

      if (deleteError) {
        console.warn('⚠️ Error deleting file from storage:', deleteError);
      }

      // Update user profile to remove picture URL
      const { data, error } = await supabase
        .from('users')
        .update({ 
          profile_picture_url: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      console.log('✅ Profile picture deleted successfully');
      return { data, error: null };
    } catch (error) {
      console.error('❌ Error deleting profile picture:', error);
      return { data: null, error };
    }
  }

  // Get user activity log (if exists)
  async getUserActivityLog(userId, limit = 50) {
    try {
      console.log('📊 Fetching user activity log for:', userId);
      
      const { data, error } = await supabase
        .from('user_activity_log')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return { data: data || [], error: null };
    } catch (error) {
      console.error('❌ Error fetching user activity log:', error);
      return { data: [], error };
    }
  }

  // Update user preferences
  async updateUserPreferences(userId, preferences) {
    try {
      console.log('⚙️ Updating user preferences for:', userId);
      
      const { data, error } = await supabase
        .from('users')
        .update({ 
          preferences: preferences,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      console.log('✅ User preferences updated successfully');
      return { data, error: null };
    } catch (error) {
      console.error('❌ Error updating user preferences:', error);
      return { data: null, error };
    }
  }

  // Validate profile data
  validateProfileData(profileData) {
    const errors = {};

    if (profileData.first_name && profileData.first_name.trim().length < 2) {
      errors.first_name = 'First name must be at least 2 characters long';
    }

    if (profileData.last_name && profileData.last_name.trim().length < 2) {
      errors.last_name = 'Last name must be at least 2 characters long';
    }

    if (profileData.phone && !/^\+?[\d\s\-\(\)]+$/.test(profileData.phone)) {
      errors.phone = 'Please enter a valid phone number';
    }

    if (profileData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profileData.email)) {
      errors.email = 'Please enter a valid email address';
    }

    if (profileData.date_of_birth) {
      const birthDate = new Date(profileData.date_of_birth);
      const today = new Date();
      const age = today.getFullYear() - birthDate.getFullYear();
      
      if (age < 16 || age > 120) {
        errors.date_of_birth = 'Please enter a valid date of birth';
      }
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  }

  // Check if user can edit profile (role-based permissions)
  canEditProfile(userRole, targetUserId, currentUserId) {
    // Users can always edit their own profile
    if (targetUserId === currentUserId) {
      return true;
    }

    // Owners and admins can edit other profiles
    if (userRole === 'owner' || userRole === 'admin') {
      return true;
    }

    return false;
  }

  // Get allowed profile fields based on role
  getAllowedProfileFields(userRole) {
    const baseFields = [
      'first_name',
      'last_name',
      'phone',
      'address',
      'date_of_birth',
      'profile_picture_url'
    ];

    const extendedFields = [
      ...baseFields,
      'emergency_contact',
      'emergency_phone',
      'preferences'
    ];

    const adminFields = [
      ...extendedFields,
      'role',
      'status',
      'notes'
    ];

    switch (userRole) {
      case 'owner':
        return adminFields;
      case 'admin':
        return adminFields;
      case 'employee':
      case 'guide':
        return extendedFields;
      case 'customer':
      default:
        return baseFields;
    }
  }
}

export default new UserProfileService();
