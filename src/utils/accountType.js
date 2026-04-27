export const BUSINESS_ACCOUNT_TYPES = new Set([
  'operator',
  'business_owner',
  'business',
  'rental_business',
]);
export const PLATFORM_OWNER_EMAILS = new Set(['salamtime2016@gmail.com']);
export const PLATFORM_ADMIN_EMAILS = new Set(['oualidazzouni10@gmail.com']);
export const PRIVATE_OWNER_ACCOUNT_TYPES = new Set([
  'individual_owner',
  'private_owner',
  'list_my_vehicle',
]);

export const BUSINESS_OWNER_ACCOUNT_TYPES = new Set([
  'operator',
  'business_owner',
  'business',
  'rental_business',
]);

export const isBusinessAccountType = (accountType) =>
  BUSINESS_ACCOUNT_TYPES.has(String(accountType || '').trim().toLowerCase());

export const isBusinessOwnerAccountType = (accountType) =>
  BUSINESS_OWNER_ACCOUNT_TYPES.has(String(accountType || '').trim().toLowerCase());

export const isPrivateOwnerAccountType = (accountType) =>
  PRIVATE_OWNER_ACCOUNT_TYPES.has(String(accountType || '').trim().toLowerCase());

export const hasBusinessOwnerRequest = (metadata = {}) => {
  const accountType = metadata?.account_type || metadata?.accountType || '';
  if (isBusinessOwnerAccountType(accountType)) {
    return true;
  }

  const certificationStatus = String(
    metadata?.certification_request_status ||
    metadata?.certificationRequestStatus ||
    ''
  ).trim().toLowerCase();

  return ['pending', 'pending_verification', 'approved', 'rejected', 'needs_info', 'suspended'].includes(certificationStatus);
};

export const isApprovedBusinessOwnerAccount = (metadata = {}) => {
  if (!hasBusinessOwnerRequest(metadata)) {
    return false;
  }

  const verificationStatus = String(metadata?.verification_status || '').trim().toLowerCase();
  const certificationStatus = String(metadata?.certification_request_status || '').trim().toLowerCase();

  return verificationStatus === 'approved' || certificationStatus === 'approved';
};

export const getBusinessOwnerAccessState = (metadata = {}) => {
  if (!hasBusinessOwnerRequest(metadata)) {
    return null;
  }

  const verificationStatus = String(
    metadata?.verification_status ||
    metadata?.verificationStatus ||
    'pending'
  ).trim().toLowerCase();
  const subscriptionStatus = String(
    metadata?.subscription_status ||
    metadata?.subscriptionStatus ||
    ''
  ).trim().toLowerCase();

  if (verificationStatus === 'rejected') {
    return 'rejected';
  }

  if (verificationStatus === 'needs_info') {
    return 'needs_info';
  }

  if (verificationStatus !== 'approved') {
    return 'pending';
  }

  if (subscriptionStatus === 'suspended') {
    return 'suspended';
  }

  if (subscriptionStatus === 'expired') {
    return 'expired';
  }

  return 'approved';
};

export const getBusinessOwnerFreezeRedirect = (metadata = {}) => {
  const accessState = getBusinessOwnerAccessState(metadata);

  if (!accessState) {
    return null;
  }

  if (accessState === 'expired') {
    return '/choose-plan';
  }

  return '/pending-approval';
};

export const getAccountTypeLabel = (accountType, tr = (en) => en) => {
  const normalized = String(accountType || '').trim().toLowerCase();

  if (normalized === 'operator') {
    return tr('Rental business', 'Activite de location');
  }

  if (normalized === 'individual_owner' || normalized === 'private_owner') {
    return tr('Private owner', 'Proprietaire prive');
  }

  return tr('Customer', 'Client');
};

export const resolveManagedAccountType = (record = {}) => {
  const ownershipCount = Math.max(
    Number(record?.listingsCount || 0) || 0,
    Number(record?.vehiclesCount || 0) || 0,
    Number(record?.liveListingsCount || 0) || 0,
    Number(record?.owner_vehicle_count || 0) || 0
  );
  const normalizedAccountType = String(
    record?.account_type ||
    record?.accountType ||
    record?.scan_metadata?.account_type ||
    record?.scan_metadata?.accountType ||
    record?.business_account?.account_type ||
    record?.business_account?.accountType ||
    record?.customer_type ||
    ''
  )
    .trim()
    .toLowerCase();

  const normalizedSource = String(
    record?.data_source ||
    record?.scan_metadata?.account_source ||
    record?.scan_metadata?.accountSource ||
    ''
  )
    .trim()
    .toLowerCase();

  if (isBusinessOwnerAccountType(normalizedAccountType)) {
    return 'business_owner';
  }

  if (ownershipCount > 0) {
    return 'private_owner';
  }

  if (normalizedSource.includes('operator') || normalizedSource.includes('business')) {
    return 'business_owner';
  }

  if (normalizedSource.includes('owner') && ownershipCount > 0) {
    return 'private_owner';
  }

  return 'customer';
};

export const getManagedAccountTypeMeta = (accountType, tr = (en) => en) => {
  const normalized = String(accountType || '').trim().toLowerCase();

  if (normalized === 'business_owner') {
    return {
      key: 'business_owner',
      label: tr('Business owner', 'Propriétaire business'),
      badgeClass: 'bg-amber-100 text-amber-800',
    };
  }

  if (normalized === 'private_owner') {
    return {
      key: 'private_owner',
      label: tr('Private owner', 'Propriétaire privé'),
      badgeClass: 'bg-violet-100 text-violet-800',
    };
  }

  return {
    key: 'customer',
    label: tr('Customer', 'Client'),
    badgeClass: 'bg-sky-100 text-sky-800',
  };
};

export const isPlatformOwnerEmail = (email = '') =>
  PLATFORM_OWNER_EMAILS.has(String(email || '').trim().toLowerCase());

export const isPlatformAdminEmail = (email = '') =>
  PLATFORM_ADMIN_EMAILS.has(String(email || '').trim().toLowerCase());
