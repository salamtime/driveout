import { adminApiRequest } from './adminApi';

const PLATFORM_ADMIN_SCOPE = '/api/admin-users?scope=platform-admins';

export const listPlatformAdmins = async () => {
  const data = await adminApiRequest(PLATFORM_ADMIN_SCOPE);
  return data.admins || [];
};

export const grantPlatformAdminAccess = async (payload) => {
  const data = await adminApiRequest(PLATFORM_ADMIN_SCOPE, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return data.admin;
};

export const updatePlatformAdminAccess = async (authUserId, payload) => {
  const data = await adminApiRequest(`${PLATFORM_ADMIN_SCOPE}&userId=${encodeURIComponent(authUserId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

  return data.admin;
};

export const disablePlatformAdminAccess = async (authUserId) => {
  const data = await adminApiRequest(`${PLATFORM_ADMIN_SCOPE}&userId=${encodeURIComponent(authUserId)}`, {
    method: 'DELETE',
  });

  return data.admin;
};
