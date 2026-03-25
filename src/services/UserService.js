import { supabase } from './supabaseClient';
import { adminApiRequest } from './adminApi';

/**
 * Fetches all users from Supabase Auth via a server-side admin endpoint.
 */
export const getUsers = async () => {
  const data = await adminApiRequest('/api/admin/users');
  return data.users || [];
};

/**
 * Adds a new user.
 */
export const addUser = async (email, password, name, role) => {
  console.log('=== addUser START ===');
  console.log('Email:', email);
  console.log('Name:', name);
  console.log('Role:', role);

  const data = await adminApiRequest('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: name,
        role,
      },
    }),
  });

  console.log('Create user response - data:', data);
  console.log('=== addUser END ===');

  return { user: data.user };
};

/**
 * Updates a user's metadata (name and role).
 */
export const updateUser = async (userId, name, role) => {
  console.log('=== updateUser START ===');
  console.log('User ID:', userId);
  console.log('Name:', name);
  console.log('Role:', role);

  const data = await adminApiRequest(`/api/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      user_metadata: {
        full_name: name,
        role,
      },
    }),
  });

  console.log('Update user response - data:', data);
  console.log('=== updateUser END ===');

  return { user: data.user };
};

/**
 * Updates a user's complete profile including email, name, role, and optionally password.
 * @param {string} userId - The user's UUID
 * @param {Object} updates - Object containing the fields to update
 * @param {string} updates.email - New email address
 * @param {string} updates.name - New full name
 * @param {string} updates.role - New role
 * @param {string} [updates.password] - New password (optional)
 */
export const updateUserProfile = async (userId, updates) => {
  console.log('=== updateUserProfile START ===');
  console.log('User ID:', userId);
  console.log('Updates:', { ...updates, password: updates.password ? '***' : undefined });

  const updatePayload = {
    email: updates.email,
    user_metadata: {
      full_name: updates.name,
      role: updates.role,
    },
  };

  if (updates.password && updates.password.trim() !== '') {
    updatePayload.password = updates.password;
  }

  const data = await adminApiRequest(`/api/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(updatePayload),
  });

  console.log('Update user profile response - data:', data);
  console.log('=== updateUserProfile END ===');

  return { user: data.user };
};

/**
 * Deletes a user.
 */
export const deleteUser = async (userId) => {
  await adminApiRequest(`/api/admin/users/${userId}`, {
    method: 'DELETE',
  });
};

/**
 * Sets the permissions for a user.
 */
export const setUserPermissions = async (userId, moduleIds) => {
  const { error: deleteError } = await supabase
    .from('user_permissions')
    .delete()
    .eq('user_id', userId);

  if (deleteError) {
    console.error('Error clearing old permissions:', deleteError);
    throw deleteError;
  }

  if (moduleIds.length > 0) {
    const permissionsToInsert = moduleIds.map((moduleId) => ({
      user_id: userId,
      module_id: moduleId,
      has_access: true,
    }));

    const { error: insertError } = await supabase
      .from('user_permissions')
      .insert(permissionsToInsert);

    if (insertError) {
      console.error('Error setting new permissions:', insertError);
      throw insertError;
    }
  }
};

export const updateUserPermission = async (userId, moduleName, hasAccess) => {
  const { data: currentData, error: fetchError } = await supabase
    .from('app_b30c02e74da644baad4668e3587d86b1_users')
    .select('permissions, email, full_name, role, phone_number, whatsapp_notifications')
    .eq('id', userId)
    .maybeSingle();

  if (fetchError) {
    console.error('Error loading current permissions:', fetchError);
    throw fetchError;
  }

  const updatedPermissions = {
    ...(currentData?.permissions || {}),
    [moduleName]: hasAccess,
  };

  const { error } = await supabase
    .from('app_b30c02e74da644baad4668e3587d86b1_users')
    .upsert({
      id: userId,
      email: currentData?.email || null,
      full_name: currentData?.full_name || null,
      role: currentData?.role || 'employee',
      phone_number: currentData?.phone_number || null,
      whatsapp_notifications: currentData?.whatsapp_notifications || false,
      access_enabled: true,
      permissions: updatedPermissions,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

  if (error) {
    console.error('Error updating permission:', error);
    throw error;
  }
};

/**
 * Fetches the effective permissions for a given user using the RPC function.
 * @param {string} userId - The UUID of the user.
 * @returns {Promise<Object>} - Object mapping module names to boolean permissions
 */
export const getUserPermissions = async (userId) => {
  if (!userId) {
    console.warn('No userId provided to getUserPermissions');
    return {};
  }

  try {
    console.log('=== UserService.getUserPermissions START ===');
    console.log('User ID:', userId);

    const { data, error } = await supabase.rpc('get_user_effective_permissions', {
      v_user_id: userId,
    });

    console.log('RPC response - data:', data);
    console.log('RPC response - error:', error);

    if (error) {
      console.error('Error fetching user permissions via RPC:', error);
      return {};
    }

    const permissionsMap = {};
    data?.forEach((item) => {
      permissionsMap[item.module_name] = item.is_allowed;
    });

    console.log('Permissions map:', permissionsMap);
    console.log('=== UserService.getUserPermissions END ===');

    return permissionsMap;
  } catch (error) {
    console.error('An unexpected error occurred in getUserPermissions:', error);
    return {};
  }
};
