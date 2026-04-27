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
 * Fetches the lightweight staff directory that message-enabled staff can access.
 */
export const getStaffDirectory = async () => {
  const data = await adminApiRequest('/api/admin-users?scope=staff-directory');
  return data.users || [];
};

/**
 * Adds a new user.
 */
export const addUser = async (email, password, name, role, appProfile = {}) => {
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
      app_profile: {
        full_name: name,
        role,
        ...appProfile,
      },
    }),
  });

  console.log('Create user response - data:', data);
  console.log('=== addUser END ===');

  return { user: data.user };
};

/**
 * Promotes an existing auth/customer account into the staff user system.
 * This intentionally reuses the existing email/auth user and refuses to create
 * a duplicate account if the customer has not signed up yet.
 */
export const promoteExistingUserToStaff = async (email, name, role = 'employee', appProfile = {}) => {
  const normalizedRole = String(role || 'employee').toLowerCase();

  const data = await adminApiRequest('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email,
      promote_existing: true,
      user_metadata: {
        full_name: name || email,
        role: normalizedRole,
        account_type: 'staff',
      },
      app_profile: {
        full_name: name || email,
        role: normalizedRole,
        access_enabled: true,
        ...appProfile,
      },
    }),
  });

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
    app_profile: {
      full_name: updates.name,
      role: updates.role,
      phone_number: updates.phone_number,
      whatsapp_notifications: updates.whatsapp_notifications,
      salary_amount: updates.salary_amount,
      permissions: updates.permissions,
      staff_id_documents: Array.isArray(updates.staff_id_documents) ? updates.staff_id_documents : undefined,
    },
  };

  if (Array.isArray(updates.staff_id_documents)) {
    updatePayload.user_metadata.staff_id_documents = updates.staff_id_documents;
  }

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
  const currentPermissions = await getUserPermissions(userId);
  const updatedPermissions = {
    ...(currentPermissions || {}),
    [moduleName]: hasAccess,
  };

  await adminApiRequest(`/api/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      app_profile: {
        permissions: updatedPermissions,
      },
    }),
  });
};

export const approveBusinessOwner = async (userId) => {
  const data = await adminApiRequest(`/api/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      action: 'approve_business_owner',
    }),
  });

  return data;
};

export const rejectBusinessOwner = async (userId, reason) => {
  const data = await adminApiRequest(`/api/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      action: 'reject_business_owner',
      reason,
    }),
  });

  return data;
};

export const requestBusinessOwnerInfo = async (userId) => {
  const data = await adminApiRequest(`/api/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      action: 'request_business_owner_info',
    }),
  });

  return data;
};

export const suspendBusinessOwner = async (userId, reason = '') => {
  const data = await adminApiRequest(`/api/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      action: 'suspend_business_owner',
      reason,
    }),
  });

  return data;
};

export const reactivateBusinessOwner = async (userId) => {
  const data = await adminApiRequest(`/api/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      action: 'reactivate_business_owner',
    }),
  });

  return data;
};

export const extendBusinessOwnerTrial = async (userId) => {
  const data = await adminApiRequest(`/api/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      action: 'extend_business_owner_trial',
    }),
  });

  return data;
};

export const activateBusinessOwnerSubscription = async (userId) => {
  const data = await adminApiRequest(`/api/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      action: 'activate_business_owner_subscription',
    }),
  });

  return data;
};

export const changeBusinessOwnerPlan = async (userId, planType) => {
  const data = await adminApiRequest(`/api/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      action: 'change_business_owner_plan',
      plan_type: planType,
    }),
  });

  return data;
};

export const selectBusinessOwnerPlan = async (subscriptionPlan) => {
  const data = await adminApiRequest('/api/me?resource=subscription', {
    method: 'PATCH',
    body: JSON.stringify({
      subscription_plan: subscriptionPlan,
    }),
  });

  return data;
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
    const { data, error } = await supabase.rpc('get_user_effective_permissions', {
      v_user_id: userId,
    });

    if (error) {
      console.error('Error fetching user permissions via RPC:', error);
      return {};
    }

    const permissionsMap = {};
    data?.forEach((item) => {
      permissionsMap[item.module_name] = item.is_allowed;
    });

    return permissionsMap;
  } catch (error) {
    console.error('An unexpected error occurred in getUserPermissions:', error);
    return {};
  }
};
