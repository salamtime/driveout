import { adminApiRequest } from './adminApi';

const STAFF_ROLES = new Set(['owner', 'admin', 'manager', 'employee', 'guide', 'mechanic', 'staff']);

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const getAuthDisplayName = (authUser) => {
  const metadata = authUser?.user_metadata || {};
  const appMetadata = authUser?.app_metadata || {};
  return (
    String(metadata.full_name || metadata.name || appMetadata.full_name || appMetadata.name || '').trim() ||
    normalizeEmail(authUser?.email) ||
    'Customer'
  );
};

const getAuthAvatarUrl = (authUser) => {
  const metadata = authUser?.user_metadata || {};
  return metadata.avatar_url || metadata.picture || metadata.photo_url || null;
};

export const shouldSyncCustomerAccount = (profile, authUser) => {
  const role = String(profile?.role || authUser?.user_metadata?.role || authUser?.app_metadata?.role || 'customer').toLowerCase();
  const accountType = String(
    profile?.accountType ||
    authUser?.user_metadata?.account_type ||
    authUser?.app_metadata?.account_type ||
    'customer'
  ).toLowerCase();

  return accountType === 'customer' && !STAFF_ROLES.has(role);
};

export const syncCustomerAccountForAuthUser = async (authUser, profile = {}) => {
  const authEmail = normalizeEmail(authUser?.email);
  const contactEmail = normalizeEmail(profile?.contactEmail || profile?.customerEmail || profile?.email || authEmail);
  const email = authEmail || contactEmail;

  if (!authUser?.id || !email || !shouldSyncCustomerAccount(profile, authUser)) {
    return { skipped: true };
  }

  return adminApiRequest('/api/me?resource=customer-account-sync', {
    method: 'POST',
    body: JSON.stringify({
      profile: {
        email,
        contactEmail,
        fullName: String(profile?.fullName || getAuthDisplayName(authUser)).trim(),
        phone: String(profile?.phone || authUser?.user_metadata?.phone || '').trim(),
        avatarUrl: getAuthAvatarUrl(authUser),
      },
    }),
  });
};
