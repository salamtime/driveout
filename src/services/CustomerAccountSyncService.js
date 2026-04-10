import { supabase } from '../lib/supabase';

const CUSTOMERS_TABLE = 'app_4c3a7a6153_customers';

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

  const now = new Date().toISOString();
  const displayName = String(profile?.fullName || getAuthDisplayName(authUser)).trim();
  const metadata = authUser.user_metadata || {};
  const avatarUrl = getAuthAvatarUrl(authUser);
  const authCustomerId = `cust_auth_${authUser.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)}`;

  const [authEmailLookupResult, contactEmailLookupResult, idLookupResult] = await Promise.all([
    supabase
      .from(CUSTOMERS_TABLE)
      .select('*')
      .ilike('email', authEmail || email)
      .limit(1),
    contactEmail && contactEmail !== authEmail
      ? supabase
          .from(CUSTOMERS_TABLE)
          .select('*')
          .ilike('email', contactEmail)
          .limit(1)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from(CUSTOMERS_TABLE)
      .select('*')
      .eq('id', authCustomerId)
      .maybeSingle(),
  ]);

  const { data: existingByAuthEmail, error: authEmailLookupError } = authEmailLookupResult;
  const { data: existingByContactEmail, error: contactEmailLookupError } = contactEmailLookupResult;
  const { data: existingByAuthId, error: idLookupError } = idLookupResult;

  if (authEmailLookupError) {
    throw authEmailLookupError;
  }

  if (contactEmailLookupError) {
    throw contactEmailLookupError;
  }

  if (idLookupError && idLookupError.code !== 'PGRST116') {
    throw idLookupError;
  }

  const existingCustomer = existingByAuthId || existingByAuthEmail?.[0] || existingByContactEmail?.[0] || null;
  const baseScanMetadata = existingCustomer?.scan_metadata && typeof existingCustomer.scan_metadata === 'object'
    ? existingCustomer.scan_metadata
    : {};

  const nextScanMetadata = {
    ...baseScanMetadata,
    auth_user_id: authUser.id,
    auth_email: authEmail || email,
    contact_email: contactEmail || email,
    auth_provider: 'google',
    account_source: baseScanMetadata.account_source || 'gmail_signup',
    account_type: 'customer',
    avatar_url: avatarUrl || baseScanMetadata.avatar_url || null,
    last_auth_sync_at: now,
  };

  if (existingCustomer) {
    const updatePayload = {
      email: contactEmail || existingCustomer.email || email,
      full_name: String(profile?.fullName || '').trim() || existingCustomer.full_name || displayName,
      phone: String(profile?.phone || metadata.phone || '').trim() || existingCustomer.phone || null,
      data_source: existingCustomer.data_source || 'gmail_signup',
      customer_type: existingCustomer.customer_type || 'primary',
      scan_metadata: nextScanMetadata,
      updated_at: now,
    };

    const { data, error } = await supabase
      .from(CUSTOMERS_TABLE)
      .update(updatePayload)
      .eq('id', existingCustomer.id)
      .select()
      .maybeSingle();

    if (error) {
      throw error;
    }

    return { synced: true, created: false, customer: data };
  }

  const insertPayload = {
    id: authCustomerId,
    full_name: displayName,
    email: contactEmail || email,
    phone: metadata.phone || null,
    data_source: 'gmail_signup',
    customer_type: 'primary',
    initial_scan_complete: false,
    scan_metadata: {
      ...nextScanMetadata,
      created_from_auth_at: now,
    },
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from(CUSTOMERS_TABLE)
    .insert([insertPayload])
    .select()
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      const { data: recoveredById, error: recoveryIdError } = await supabase
        .from(CUSTOMERS_TABLE)
        .select('*')
        .eq('id', authCustomerId)
        .maybeSingle();

      if (!recoveryIdError && recoveredById) {
        return syncCustomerAccountForAuthUser(authUser, profile);
      }

      const { data: recoveredByEmail, error: recoveryEmailError } = await supabase
        .from(CUSTOMERS_TABLE)
        .select('*')
        .ilike('email', authEmail || email)
        .limit(1);

      if (!recoveryEmailError && recoveredByEmail?.[0]) {
        return syncCustomerAccountForAuthUser(authUser, profile);
      }
    }

    throw error;
  }

  return { synced: true, created: true, customer: data };
};
