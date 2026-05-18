import {
  APP_USERS_TABLE,
  ORGANIZATIONS_TABLE,
  ORGANIZATION_MEMBERS_TABLE,
  PLATFORM_BUSINESS_ACCOUNTS_TABLE,
  PLATFORM_BUSINESS_SUBSCRIPTIONS_TABLE,
  PLATFORM_TENANTS_TABLE,
  PLATFORM_TENANT_PROVISIONING_JOBS_TABLE,
} from './_lib/supabase.js';
import {
  normalizeBillingStatus,
  normalizePlanType,
  normalizeSubscriptionStatus,
  resolveTenantTenancyMode,
  runPlatformTenantSelectWithModeFallback,
} from './_lib/tenantRegistry.js';
import { authenticateRequest } from './_lib/auth.js';
import { resolveRequestTenantScope, stampTenantPayload } from './_lib/sharedTenantIsolation.js';
import { getTenantPlanLimits } from '../src/config/tenantPlans.js';
import { DEFAULT_RENTAL_TIMING_SETTINGS, deriveEffectiveRentalStatus } from '../src/utils/rentalLifecycle.js';
import { buildDefaultPermissionsForRole, buildBusinessOwnerPermissionMap } from '../src/utils/permissionCatalog.js';
import { EMAIL_SENDERS, sendResendEmail } from './_lib/email.js';
import { insertRentalEvent } from './_lib/rentalEvents.js';
import { SHARED_MESSAGES_TABLE, SHARED_MESSAGE_THREADS_TABLE, buildThreadKey } from './_lib/messages.js';

const WALLET_TOPUPS_TABLE = 'wallet_topups';
const BASE_PROFILE_FIELDS = 'id, email, username, full_name, first_name, last_name, role, access_enabled, permissions, phone_number, address, date_of_birth, emergency_contact, emergency_phone, preferences, staff_id_documents, whatsapp_notifications, salary_amount, created_at, updated_at, primary_organization_id';
const BUSINESS_OWNER_PROFILE_FIELDS = `${BASE_PROFILE_FIELDS}, verification_status, approved_at, approved_by, rejection_reason, subscription_plan, subscription_status, trial_started_at, trial_ends_at, subscription_started_at, plan_type, billing_status, suspended_at, suspension_reason, plan_changed_at`;
const CORE_PROFILE_FIELDS = 'id, email, username, full_name, first_name, last_name, role, permissions, primary_organization_id';
const splitSelectFields = (fields) =>
  String(fields || '')
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean);

const isSchemaCompatibilityError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  const details = String(error?.details || '').toLowerCase();
  const code = String(error?.code || '').toUpperCase();

  return (
    code === '42703' ||
    code === 'PGRST204' ||
    message.includes('schema cache') ||
    message.includes('column') ||
    details.includes('schema cache')
  );
};

const isMissingTableError = (error) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || error?.details || '').toLowerCase();

  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('not found')
  );
};

const isMarketplaceRequestValidationMessage = (message) => {
  const normalized = String(message || '').trim().toLowerCase();
  if (!normalized) return false;

  return (
    normalized === 'booking reference missing' ||
    normalized === 'missing owner session' ||
    normalized === 'marketplace request not found' ||
    normalized.includes('wallet is not ready') ||
    normalized.includes('wallet is restricted') ||
    normalized.includes('wallet balance') ||
    normalized.includes('damage deposit') ||
    normalized.includes('booking hold expired') ||
    normalized.includes('request again to continue') ||
    normalized.includes('not ready for final approval yet')
  );
};

const UUID_LIKE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuidLike = (value) => UUID_LIKE_PATTERN.test(String(value || '').trim());

const getWalletStateRank = (row = {}) => {
  const normalizedState = String(row?.wallet_status || row?.verification_status || '').trim().toLowerCase();
  if (normalizedState === 'verified') return 3;
  if (normalizedState === 'pending') return 2;
  if (normalizedState === 'restricted') return 0;
  return 1;
};

const getWalletBalance = (row = {}) =>
  Math.max(0, Number(row?.current_balance ?? row?.balance ?? row?.wallet_balance ?? 0) || 0);

const pickPreferredWalletAccount = (rows = []) =>
  [...rows]
    .filter(Boolean)
    .sort((left, right) => {
      const stateDelta = getWalletStateRank(right) - getWalletStateRank(left);
      if (stateDelta !== 0) return stateDelta;

      const balanceDelta = getWalletBalance(right) - getWalletBalance(left);
      if (balanceDelta !== 0) return balanceDelta;

      const rightUpdatedAt = new Date(right?.updated_at || right?.created_at || 0).getTime();
      const leftUpdatedAt = new Date(left?.updated_at || left?.created_at || 0).getTime();
      return rightUpdatedAt - leftUpdatedAt;
    })[0] || null;

const ensureWalletAccountForUser = async (adminClient, userId) => {
  if (!userId) return null;

  const { data: existingWallet, error: walletError } = await adminClient
    .from('app_wallet_accounts')
    .select('*')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (walletError) throw walletError;
  if (existingWallet) return existingWallet;

  let payload = {
    owner_id: userId,
    owner_type: 'individual_owner',
    current_balance: 0,
    currency_code: 'MAD',
    wallet_status: 'pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data, error } = await adminClient
      .from('app_wallet_accounts')
      .insert([payload])
      .select('*')
      .maybeSingle();

    if (!error && data) return data;

    const message = String(error?.message || error?.details || '');
    const missingColumnMatch = message.match(/column "([^"]+)"/i) || message.match(/'([^']+)'\s+column/i);
    const missingColumn = missingColumnMatch?.[1] || null;

    if (missingColumn && Object.prototype.hasOwnProperty.call(payload, missingColumn)) {
      const { [missingColumn]: _removed, ...reducedPayload } = payload;
      payload = reducedPayload;
      continue;
    }

    if (error) throw error;
  }

  return null;
};

const loadLatestWalletAccountByOwnerId = async (adminClient, ownerId) => {
  const normalizedOwnerId = String(ownerId || '').trim();
  if (!normalizedOwnerId || !isUuidLike(normalizedOwnerId)) return null;

  const { data, error } = await adminClient
    .from('app_wallet_accounts')
    .select('*')
    .eq('owner_id', normalizedOwnerId)
    .order('updated_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false, nullsFirst: false })
    .limit(8);

  if (error) throw error;
  return pickPreferredWalletAccount(Array.isArray(data) ? data : []);
};

const buildProfileFromAuthUser = (user, profile = null) => {
  const hasProfileField = (field) => Boolean(profile) && Object.prototype.hasOwnProperty.call(profile, field);
  const fromProfile = (field, fallback = null) => (hasProfileField(field) ? profile[field] : fallback);

  const resolvePermissionsMap = (value) => {
    if (!value) return {};
    if (Array.isArray(value)) {
      return value.reduce((acc, permission) => {
        if (!permission?.module_name) return acc;
        acc[permission.module_name] = permission.has_access === true;
        return acc;
      }, {});
    }
    if (typeof value === 'object') {
      return value;
    }
    return {};
  };

  const baseRole = fromProfile('role', user?.user_metadata?.role || user?.app_metadata?.role || 'customer');
  const resolvedPermissions = resolvePermissionsMap(fromProfile('permissions', user?.user_metadata?.permissions || null));
  const resolvedRole = baseRole;

  return {
    ...(profile || {}),
    id: fromProfile('id', user?.id || null),
    email: fromProfile('email', user?.email || null),
    username: fromProfile('username', user?.user_metadata?.username || null),
    full_name: fromProfile('full_name', user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || null),
    first_name: fromProfile('first_name', user?.user_metadata?.first_name || null),
    last_name: fromProfile('last_name', user?.user_metadata?.last_name || null),
    role: resolvedRole,
    permissions: resolvedPermissions,
    phone_number: fromProfile('phone_number', user?.user_metadata?.phone || null),
    address: fromProfile('address', user?.user_metadata?.address || null),
    date_of_birth: fromProfile('date_of_birth', user?.user_metadata?.date_of_birth || null),
    emergency_contact: fromProfile('emergency_contact', user?.user_metadata?.emergency_contact || null),
    emergency_phone: fromProfile('emergency_phone', user?.user_metadata?.emergency_phone || null),
    preferences: fromProfile('preferences', user?.user_metadata?.preferences || {}),
    staff_id_documents: fromProfile('staff_id_documents', user?.user_metadata?.staff_id_documents || []),
    verification_status: fromProfile('verification_status', user?.user_metadata?.verification_status || null),
    approved_at: fromProfile('approved_at', user?.user_metadata?.approved_at || null),
    approved_by: fromProfile('approved_by', user?.user_metadata?.approved_by || null),
    rejection_reason: fromProfile('rejection_reason', user?.user_metadata?.rejection_reason || null),
    subscription_plan: fromProfile('subscription_plan', user?.user_metadata?.subscription_plan || null),
    subscription_status: fromProfile('subscription_status', user?.user_metadata?.subscription_status || null),
    plan_type: fromProfile('plan_type', user?.user_metadata?.plan_type || 'starter'),
    billing_status: fromProfile('billing_status', user?.user_metadata?.billing_status || 'none'),
    trial_started_at: fromProfile('trial_started_at', user?.user_metadata?.trial_started_at || null),
    trial_ends_at: fromProfile('trial_ends_at', user?.user_metadata?.trial_ends_at || null),
    subscription_started_at: fromProfile('subscription_started_at', user?.user_metadata?.subscription_started_at || null),
    suspended_at: fromProfile('suspended_at', user?.user_metadata?.suspended_at || null),
    suspension_reason: fromProfile('suspension_reason', user?.user_metadata?.suspension_reason || null),
    plan_changed_at: fromProfile('plan_changed_at', user?.user_metadata?.plan_changed_at || null),
    primary_organization_id: fromProfile('primary_organization_id', null),
    organization_id: fromProfile('organization_id', fromProfile('primary_organization_id', null)),
    organization_name: fromProfile('organization_name', null),
    organization_role: fromProfile('organization_role', null),
    organization_status: fromProfile('organization_status', null),
    is_platform_organization: Boolean(fromProfile('is_platform_organization', false)),
  };
};

const resolvePermissionsMap = (value) => {
  if (!value) return {};
  if (Array.isArray(value)) {
    return value.reduce((acc, permission) => {
      if (!permission?.module_name) return acc;
      acc[permission.module_name] = permission.has_access === true;
      return acc;
    }, {});
  }
  if (typeof value === 'object') {
    return value;
  }
  return {};
};

const shouldSeedStaffProfile = (role) => {
  const normalizedRole = String(role || '').trim().toLowerCase();
  return ['owner', 'admin', 'employee', 'guide', 'business_owner'].includes(normalizedRole);
};

const hasMeaningfulPermissions = (permissionsMap = {}) => {
  if (!permissionsMap || typeof permissionsMap !== 'object' || Array.isArray(permissionsMap)) {
    return false;
  }
  return Object.keys(permissionsMap).length > 0;
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const MARKETPLACE_COMMISSION_RATE = 0.15;
const MARKETPLACE_APPROVAL_HOLD_MINUTES = 15;
const MARKETPLACE_CHAT_GRACE_MINUTES = 12 * 60;
const MARKETPLACE_FINAL_APPROVAL_DB_STATUS = 'accepted';
const normalizeComparableText = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const buildCustomerNameCandidates = (fullName, email) => {
  const normalizedFullName = String(fullName || '').trim();
  const localPart = String(email || '').split('@')[0]?.trim() || '';
  const firstName = normalizedFullName.split(/\s+/).filter(Boolean)[0] || '';
  const alphaPrefix = localPart.match(/[a-zA-Z]+/)?.[0] || '';
  return [...new Set([normalizedFullName, firstName, localPart, alphaPrefix].filter(Boolean))];
};

const isLikelyCustomerNameMatch = (rowCustomerName, nameCandidates) => {
  const normalizedRowName = normalizeComparableText(rowCustomerName);
  if (!normalizedRowName) return false;

  return nameCandidates.some((candidate) => {
    const normalizedCandidate = normalizeComparableText(candidate);
    if (!normalizedCandidate) return false;
    return (
      normalizedCandidate === normalizedRowName ||
      normalizedCandidate.includes(normalizedRowName) ||
      normalizedRowName.includes(normalizedCandidate)
    );
  });
};

const MARKETPLACE_LISTINGS_TABLE = 'app_marketplace_listings';
const BOOKING_REQUESTS_TABLE = 'app_booking_requests';
const VEHICLE_PROFILES_TABLE = 'app_vehicle_public_profiles';
const TOUR_BOOKINGS_TABLE = 'app_687f658e98_tour_bookings';
const TOUR_BOOKING_MARKER = '[tour_booking]';
const TOUR_ACTIVITY_LOG_TABLE = 'app_687f658e98_activity_log';
const MAINTENANCE_RECORDS_TABLE = 'app_687f658e98_maintenance';
const MAINTENANCE_PARTS_TABLE = 'app_687f658e98_maintenance_parts';
const SETTINGS_TABLE = 'saharax_0u4w4d_settings';

const extractMarkedJson = (text, marker) => {
  const source = String(text || '');
  const index = source.indexOf(marker);
  if (index === -1) return null;

  const payload = source.slice(index + marker.length).trim();
  if (!payload) return null;

  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
};

const normalizeTimestampValue = (value, fallback = null) => {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
};

const normalizeEffectiveRentalStatus = (row = {}, timingSettings = DEFAULT_RENTAL_TIMING_SETTINGS) =>
  String(deriveEffectiveRentalStatus(row, timingSettings) || row?.rental_status || row?.status || 'scheduled').toLowerCase();

const loadRentalTimingSettings = async (adminClient) => {
  try {
    const { data, error } = await adminClient
      .from(SETTINGS_TABLE)
      .select('id, rental_grace_period_minutes, rental_soft_lock_minutes, rentalGracePeriodMinutes, rentalSoftLockMinutes')
      .eq('id', 1)
      .maybeSingle();

    if (error || !data) return DEFAULT_RENTAL_TIMING_SETTINGS;

    const graceMinutes = Number(
      data.rentalGracePeriodMinutes ??
      data.rental_grace_period_minutes ??
      DEFAULT_RENTAL_TIMING_SETTINGS.graceMinutes
    );
    const softLockMinutes = Number(
      data.rentalSoftLockMinutes ??
      data.rental_soft_lock_minutes ??
      DEFAULT_RENTAL_TIMING_SETTINGS.softLockMinutes
    );

    return {
      graceMinutes: Number.isFinite(graceMinutes) ? graceMinutes : DEFAULT_RENTAL_TIMING_SETTINGS.graceMinutes,
      softLockMinutes: Number.isFinite(softLockMinutes) ? softLockMinutes : DEFAULT_RENTAL_TIMING_SETTINGS.softLockMinutes,
    };
  } catch (_error) {
    return DEFAULT_RENTAL_TIMING_SETTINGS;
  }
};

const normalizeDateValue = (value, fallback = null) => {
  const iso = normalizeTimestampValue(value, null);
  return iso ? iso.slice(0, 10) : fallback;
};

const normalizeTourBookingRow = (row = {}) => {
  const payload = row.booking_payload && typeof row.booking_payload === 'object'
    ? row.booking_payload
    : {};

  return {
    ...payload,
    ...row,
    id: row.id || payload.id || null,
    customer_name: payload.customer_name ?? row.customer_name ?? '',
    customer_email: payload.customer_email ?? row.customer_email ?? '',
    customer_phone: payload.phone ?? row.customer_phone ?? row.phone ?? '',
    rental_status: payload.rental_status ?? row.rental_status ?? row.status ?? 'scheduled',
    payment_status: payload.payment_status ?? row.payment_status ?? 'unpaid',
    total_amount: payload.total_amount ?? row.total_amount_mad ?? row.total_amount ?? 0,
    remaining_amount: payload.remaining_amount ?? row.total_amount_mad ?? row.remaining_amount ?? 0,
    package_id: payload.package_id ?? row.package_id ?? null,
    package_name: payload.package_name ?? row.package_name ?? null,
    guide_name: payload.guide_name ?? row.guide_name ?? null,
    guide_id: payload.guide_id ?? row.guide_id ?? null,
    booked_by_user_id: payload.booked_by_user_id ?? row.booked_by_user_id ?? null,
    booked_by_name: payload.booked_by_name ?? row.booked_by_name ?? null,
    vehicle_id: payload.vehicle_id ?? row.vehicle_id ?? null,
    notes: payload.notes ?? row.notes ?? '',
    created_at: row.created_at || payload.created_at || null,
    updated_at: row.updated_at || payload.updated_at || null,
  };
};

const inferTourGroupStatus = (rows = []) => {
  const statuses = rows.map((row) => String(row?.rental_status || row?.status || 'scheduled').toLowerCase());
  if (statuses.includes('active')) return 'active';
  if (statuses.every((value) => value === 'completed')) return 'completed';
  if (statuses.every((value) => value === 'cancelled')) return 'cancelled';
  if (statuses.every((value) => value === 'no_show')) return 'no_show';
  if (statuses.every((value) => value === 'expired')) return 'expired';
  return statuses[0] || 'scheduled';
};

const groupCustomerTourRows = (rows = []) =>
  Array.from(
    rows.reduce((groups, rawRow) => {
      const row = normalizeTourBookingRow(rawRow);
      const meta = extractMarkedJson(row.notes, TOUR_BOOKING_MARKER) || {};
      const groupId = String(
        meta.groupId ||
        row.group_id ||
        row.tour_group_id ||
        row.groupId ||
        row.id
      );

      if (!groups.has(groupId)) {
        groups.set(groupId, []);
      }

      groups.get(groupId).push({ ...row, tourMeta: meta });
      return groups;
    }, new Map()).entries()
  )
    .map(([groupId, tourRows]) => {
      const sortedRows = [...tourRows].sort(
        (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
      );
      const first = sortedRows[0] || {};
      const meta = first.tourMeta || {};
      const scheduledFor = normalizeTimestampValue(
        meta.scheduledStartAt || first.scheduled_for || first.rental_start_date,
        first.created_at || null
      );
      const scheduledEndAt = normalizeTimestampValue(
        meta.scheduledEndAt || first.scheduled_end_at || first.rental_end_date,
        null
      );
      const totalAmount = sortedRows.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
      const remainingAmount = sortedRows.reduce((sum, item) => sum + Number(item.remaining_amount || 0), 0);
      const paidAmount = Math.max(0, totalAmount - remainingAmount);

      return {
        id: groupId,
        groupId,
        status: inferTourGroupStatus(sortedRows),
        packageName: meta.packageName || first.package_name || 'Tour package',
        operatorName:
          meta.operatorName ||
          meta.tenantName ||
          meta.organizationName ||
          meta.companyName ||
          first.operator_name ||
          first.tenant_name ||
          first.organization_name ||
          first.company_name ||
          'Certified operator',
        packageId: meta.packageId || first.package_id || null,
        routeType: meta.routeType || first.route_type || '',
        location: meta.packageLocation || first.location || '',
        scheduledFor,
        scheduledEndAt,
        scheduledDate: normalizeDateValue(meta.scheduledStartAt || first.scheduled_date || first.rental_start_date, null),
        scheduledTime: first.scheduled_time || (scheduledFor ? scheduledFor.slice(11, 16) : null),
        durationHours: Number(meta.durationHours || 0) || 0,
        quadCount: Number(meta.quadCount || sortedRows.length || 1) || 1,
        ridersCount: Number(meta.ridersCount || sortedRows.length || 1) || 1,
        customerName: first.customer_name || meta.customerName || 'Guest',
        customerEmail: first.customer_email || meta.customerEmail || '',
        customerPhone: first.customer_phone || meta.customerPhone || '',
        guideName: meta.guideName || first.guide_name || '',
        guideId: meta.guideId || first.guide_id || '',
        bookedByUserId: meta.bookedByUserId || first.booked_by_user_id || '',
        bookedByName: meta.bookedByName || first.booked_by_name || '',
        requiresLicense: Boolean(meta.requiresLicense),
        shareContract: Boolean(meta.shareContract ?? first.share_contract),
        receiptIssued: Boolean(meta.receiptIssued ?? first.receipt_issued),
        receiptIssuedAt: normalizeTimestampValue(meta.receiptIssuedAt || first.receipt_issued_at, null),
        trackingUrl: String(meta.trackingUrl || meta.tracking_url || '').trim(),
        startedAt: normalizeTimestampValue(meta.startedAt || first.started_at, null),
        completedAt: normalizeTimestampValue(meta.completedAt || first.completed_at, null),
        cancelledAt: normalizeTimestampValue(meta.cancelledAt || first.cancelled_at, null),
        totalAmountMad: totalAmount,
        remainingAmountMad: remainingAmount,
        paidAmountMad: paidAmount,
        paymentStatus: remainingAmount > 0 ? 'pending' : 'paid',
        assignmentMode: meta.assignmentMode || first.assignment_mode || 'assign_on_arrival',
        selectedModelMix: Array.isArray(meta.selectedModelMix) ? meta.selectedModelMix : [],
        rows: sortedRows,
        createdAt: first.created_at || null,
        updatedAt: sortedRows[sortedRows.length - 1]?.updated_at || first.updated_at || first.created_at || null,
        metadata: meta,
      };
    })
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());

const loadCustomerBookingIdentity = async (adminClient, user) => {
  const userId = String(user?.id || '').trim();
  const email = normalizeEmail(user?.email);
  const authCustomerId = userId ? `cust_auth_${userId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)}` : '';

  if (!userId && !email) {
    return null;
  }

  const [customerByIdResult, customerByEmailResult] = await Promise.all([
    authCustomerId
      ? adminClient
          .from('app_4c3a7a6153_customers')
          .select('id, full_name, email, phone, licence_number, id_number, id_scan_url, initial_scan_complete, scan_metadata')
          .eq('id', authCustomerId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    email
      ? adminClient
          .from('app_4c3a7a6153_customers')
          .select('id, full_name, email, phone, licence_number, id_number, id_scan_url, initial_scan_complete, scan_metadata')
          .ilike('email', email)
          .limit(1)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (customerByIdResult.error) {
    throw customerByIdResult.error;
  }

  if (customerByEmailResult.error) {
    throw customerByEmailResult.error;
  }

  const customerRow = customerByIdResult.data || customerByEmailResult.data?.[0] || null;
  if (!customerRow) {
    return null;
  }

  return {
    id: customerRow.id,
    full_name: String(customerRow.full_name || '').trim(),
    email: String(customerRow.email || email || '').trim(),
    phone: String(customerRow.phone || '').trim(),
    licence_number: String(customerRow.licence_number || '').trim(),
    id_number: String(customerRow.id_number || '').trim(),
    id_scan_url: String(customerRow.id_scan_url || '').trim(),
    initial_scan_complete: Boolean(customerRow.initial_scan_complete),
    scan_metadata: customerRow.scan_metadata && typeof customerRow.scan_metadata === 'object'
      ? customerRow.scan_metadata
      : {},
  };
};

const loadCustomerMarketplaceRequests = async (adminClient, user) => {
  const userId = String(user?.id || '').trim();
  const email = normalizeEmail(user?.email);

  if (!userId && !email) {
    return [];
  }

  const queries = [];
  if (userId) {
    queries.push(
      adminClient
        .from(BOOKING_REQUESTS_TABLE)
        .select('*')
        .eq('customer_id', userId)
        .order('created_at', { ascending: false })
    );
    queries.push(
      adminClient
        .from(BOOKING_REQUESTS_TABLE)
        .select('*')
        .eq('customer_ext_id', userId)
        .order('created_at', { ascending: false })
    );
  }

  if (email) {
    queries.push(
      adminClient
        .from(BOOKING_REQUESTS_TABLE)
        .select('*')
        .ilike('customer_email', email)
        .order('created_at', { ascending: false })
    );
  }

  const results = await Promise.all(queries);
  const requestMap = new Map();

  for (const result of results) {
    if (result.error) {
      throw result.error;
    }

    for (const row of result.data || []) {
      requestMap.set(String(row.id), row);
    }
  }

  const requestRows = Array.from(requestMap.values()).sort(
    (a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime()
  );

  if (!requestRows.length) {
    return [];
  }

  const now = new Date();
  const expiredRows = requestRows.filter((requestRow) => isMarketplaceApprovalHoldExpired(requestRow, now));
  if (expiredRows.length) {
    const nowIso = now.toISOString();
    const expiredResults = await Promise.allSettled(
      expiredRows.map((requestRow) => expireMarketplaceApprovalHold(adminClient, requestRow, nowIso))
    );

    expiredResults.forEach((result, index) => {
      if (result.status !== 'fulfilled') return;
      requestMap.set(String(expiredRows[index].id), result.value);
    });
  }

  const normalizedRequestRows = Array.from(requestMap.values()).sort(
    (a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime()
  );

  const listingIds = [...new Set(normalizedRequestRows.map((row) => row?.listing_id).filter(Boolean))];
  const { data: listings, error: listingError } = await adminClient
    .from(MARKETPLACE_LISTINGS_TABLE)
    .select('*')
    .in('id', listingIds);

  if (listingError) {
    throw listingError;
  }

  const listingsById = new Map((listings || []).map((row) => [String(row.id), row]));
  const profileIds = [...new Set((listings || []).map((row) => row?.vehicle_public_profile_id).filter(Boolean))];

  let profilesById = new Map();
  if (profileIds.length > 0) {
    const { data: profiles, error: profileError } = await adminClient
      .from(VEHICLE_PROFILES_TABLE)
      .select('*')
      .in('id', profileIds);

    if (profileError) {
      throw profileError;
    }

    profilesById = new Map((profiles || []).map((row) => [String(row.id), row]));
  }

  return normalizedRequestRows.map((request) => {
    const listing = listingsById.get(String(request.listing_id)) || null;
    const profile = listing ? profilesById.get(String(listing.vehicle_public_profile_id)) || null : null;

    return {
      ...request,
      listing,
      profile,
    };
  });
};

const loadCustomerMarketplaceRequestDetail = async (adminClient, user, requestId) => {
  const requests = await loadCustomerMarketplaceRequests(adminClient, user);
  return requests.find((request) => String(request?.id || '') === String(requestId || '')) || null;
};

const loadCustomerMarketplaceRequestRecovery = async (adminClient, user, requestId) => {
  const request = await loadCustomerMarketplaceRequestDetail(adminClient, user, requestId);
  if (!request) return null;

  const listingId = String(request?.listing_id || request?.listing?.id || '').trim();
  const vehiclePublicProfileId = String(
    request?.vehicle_public_profile_id ||
    request?.listing?.vehicle_public_profile_id ||
    ''
  ).trim();

  return {
    requestId: String(request?.id || '').trim(),
    listingId: listingId || null,
    vehicleId: listingId || vehiclePublicProfileId || null,
    startTime: request?.requested_start_at || null,
    endTime: request?.requested_end_at || null,
    rentalType: request?.rental_type || null,
    duration: request?.duration || null,
  };
};

const calculateMarketplaceCommission = (estimatedAmount = 0) => {
  const normalizedAmount = Math.max(0, Number(estimatedAmount || 0));
  return Math.max(0, Math.round(normalizedAmount * MARKETPLACE_COMMISSION_RATE));
};

const getMarketplaceApprovalHoldExpiry = (counterOffer = {}, fallbackAcceptedAt = null) => {
  const safeCounterOffer = counterOffer && typeof counterOffer === 'object' ? counterOffer : {};
  const explicitExpiry = safeCounterOffer.hold_expires_at || safeCounterOffer.approval_hold_expires_at || null;
  if (explicitExpiry) return explicitExpiry;

  const startedAt = safeCounterOffer.hold_started_at || fallbackAcceptedAt || null;
  if (!startedAt) return null;

  const startedAtMs = new Date(startedAt).getTime();
  if (!startedAtMs) return null;

  return new Date(startedAtMs + MARKETPLACE_APPROVAL_HOLD_MINUTES * 60 * 1000).toISOString();
};

const getMarketplaceChatGraceExpiry = (counterOffer = {}, fallbackApprovedAt = null) => {
  const safeCounterOffer = counterOffer && typeof counterOffer === 'object' ? counterOffer : {};
  const explicitExpiry = safeCounterOffer.chat_grace_expires_at || safeCounterOffer.chatGraceExpiresAt || null;
  if (explicitExpiry) return explicitExpiry;

  const startedAt = safeCounterOffer.chat_grace_started_at || safeCounterOffer.chat_unlocked_at || fallbackApprovedAt || null;
  if (!startedAt) return null;

  const startedAtMs = new Date(startedAt).getTime();
  if (!startedAtMs) return null;

  return new Date(startedAtMs + MARKETPLACE_CHAT_GRACE_MINUTES * 60 * 1000).toISOString();
};

const isMarketplaceRequestApprovedRecord = (requestRow = {}) => {
  const normalizedStatus = String(requestRow?.request_status || '').trim().toLowerCase();
  const counterOffer = requestRow?.counter_offer && typeof requestRow.counter_offer === 'object'
    ? requestRow.counter_offer
    : {};

  if (normalizedStatus === 'approved') return true;
  if (requestRow?.approved_at) return true;
  if (counterOffer?.chat_unlocked_at) return true;
  if (String(counterOffer?.platform_fee_status || '').trim().toLowerCase() === 'reserved') return true;

  const depositStatus = String(counterOffer?.damage_deposit_status || '').trim().toLowerCase();
  if (['held', 'not_required', 'released', 'seized'].includes(depositStatus)) return true;

  return false;
};

const isMarketplaceApprovalHoldExpired = (requestRow = {}, now = new Date()) => {
  const normalizedStatus = String(requestRow?.request_status || '').trim().toLowerCase();
  if (!['accepted', 'pre_approved'].includes(normalizedStatus)) return false;

  const counterOffer = requestRow?.counter_offer && typeof requestRow.counter_offer === 'object' ? requestRow.counter_offer : {};
  const holdExpiresAt = getMarketplaceApprovalHoldExpiry(counterOffer, requestRow?.accepted_at || null);
  if (!holdExpiresAt) return false;

  const holdExpiresAtMs = new Date(holdExpiresAt).getTime();
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!holdExpiresAtMs || !nowMs) return false;

  return holdExpiresAtMs <= nowMs;
};

const isSharedMessagesSchemaUnavailable = (error) => {
  const code = String(error?.code || '').trim().toUpperCase();
  const message = String(error?.message || error?.details || '').toLowerCase();
  return (
    code === '42P01' ||
    code === '42501' ||
    code === 'PGRST205' ||
    message.includes('shared_messages') ||
    message.includes('permission denied') ||
    message.includes('schema cache')
  );
};

const buildOrganizationStampScope = (organizationId = null) => ({
  isShared: Boolean(organizationId),
  organizationId: organizationId || null,
});

const loadUserOrganizationId = async (adminClient, userId) => {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return null;

  const { data: profile } = await adminClient
    .from(APP_USERS_TABLE)
    .select('primary_organization_id')
    .eq('id', normalizedUserId)
    .maybeSingle();

  const profileOrganizationId = String(profile?.primary_organization_id || '').trim();
  if (profileOrganizationId) {
    return profileOrganizationId;
  }

  const { data: membership } = await adminClient
    .from(ORGANIZATION_MEMBERS_TABLE)
    .select('organization_id')
    .eq('user_id', normalizedUserId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  return String(membership?.organization_id || '').trim() || null;
};

const insertMarketplaceSharedMessage = async (adminClient, payload = {}, tenantScope = null) => {
  const { error } = await adminClient
    .from(SHARED_MESSAGES_TABLE)
    .insert(stampTenantPayload(payload, tenantScope));

  if (error) {
    if (isSharedMessagesSchemaUnavailable(error)) return false;
    throw error;
  }

  return true;
};

const upsertMarketplaceThreadState = async (adminClient, payload = {}, tenantScope = null) => {
  const threadKey = String(payload.thread_key || '').trim();
  if (!threadKey) return false;

  const { error } = await adminClient
    .from(SHARED_MESSAGE_THREADS_TABLE)
    .upsert({
      ...stampTenantPayload(payload, tenantScope),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'thread_key',
    });

  if (error) {
    if (isMissingTableError(error) || isSchemaCompatibilityError(error)) return false;
    throw error;
  }

  return true;
};

const seedMarketplaceApprovalMessages = async ({
  adminClient,
  requestRow,
  listingRow,
  ownerUserId,
  ownerName = '',
  ownerEmail = '',
  approvedAt,
  commissionAmount = 0,
  depositAmount = 0,
  tenantScope = null,
}) => {
  const requestId = String(requestRow?.id || '').trim();
  const customerUserId = String(requestRow?.customer_id || '').trim();
  if (!requestId || !customerUserId || !ownerUserId) return;

  const listingTitle = String(
    listingRow?.title ||
    [listingRow?.brand_name, listingRow?.model_name].filter(Boolean).join(' ') ||
    requestRow?.listing_title ||
    'Marketplace request'
  ).trim() || 'Marketplace request';
  const requestReference = String(requestRow?.request_reference || '').trim();
  const normalizedOwnerName = String(ownerName || '').trim() || 'Vehicle owner';
  const normalizedOwnerEmail = String(ownerEmail || '').trim();
  const customerName = String(requestRow?.customer_name || '').trim();
  const customerEmail = String(requestRow?.customer_email || '').trim();
  const estimatedAmount = Math.max(
    0,
    Number(
      requestRow?.counter_offer?.price_amount ??
      requestRow?.quoted_amount ??
      0
    ) || 0
  );
  const currencyCode = String(requestRow?.currency_code || listingRow?.currency_code || 'MAD').trim() || 'MAD';
  const chatGraceExpiresAt = getMarketplaceChatGraceExpiry(
    requestRow?.counter_offer && typeof requestRow.counter_offer === 'object' ? requestRow.counter_offer : {},
    approvedAt
  );
  const commonMetadata = {
    requestId,
    requestReference,
    requestStatus: 'approved',
    status: 'approved',
    replyEnabled: true,
    readOnlyReason: '',
    event: 'approved',
    chatUnlockedAt: approvedAt,
    ownerUserId,
    ownerName: normalizedOwnerName,
    ownerEmail: normalizedOwnerEmail || undefined,
    customerUserId,
    customerName: customerName || undefined,
    customerEmail: customerEmail || undefined,
    priceAmount: estimatedAmount,
    estimatedAmount,
    currencyCode,
    platformFeeAmount: commissionAmount,
    damageDepositAmount: depositAmount,
    chatGraceExpiresAt,
  };

  const threadDefinitions = [
    {
      threadType: 'marketplace_owner_request',
      roleContext: 'owner',
      href: `/account/vehicles?requestId=${encodeURIComponent(requestId)}#requests`,
    },
    {
      threadType: 'marketplace_customer_request',
      roleContext: 'customer',
      href: `/account/rentals/requests/${encodeURIComponent(requestId)}`,
    },
  ];

  for (const threadDefinition of threadDefinitions) {
    const threadKey = buildThreadKey({
      family: 'marketplace',
      threadType: threadDefinition.threadType,
      entityType: 'marketplace_request',
      entityId: requestId,
      recipientUserId: customerUserId,
      senderUserId: ownerUserId,
    });

    await upsertMarketplaceThreadState(adminClient, {
      thread_key: threadKey,
      family: 'marketplace',
      thread_type: threadDefinition.threadType,
      entity_type: 'marketplace_request',
      entity_id: requestId,
      context_type: 'request',
      context_id: requestId,
      sender_user_id: ownerUserId,
      recipient_user_id: customerUserId,
      sender_role: 'owner',
      recipient_role: 'customer',
      priority: 'important',
      waiting_on: 'customer',
      resolved_at: null,
      workflow_status: 'active',
      visibility_scope: 'public',
      metadata: {
        ...commonMetadata,
        roleContext: threadDefinition.roleContext,
        href: threadDefinition.href,
      },
    }, tenantScope);

    await insertMarketplaceSharedMessage(adminClient, {
      thread_key: threadKey,
      family: 'marketplace',
      thread_type: threadDefinition.threadType,
      entity_type: 'marketplace_request',
      entity_id: requestId,
      message_type: 'system_event',
      subject: listingTitle,
      body: 'Owner approved the booking',
      sender_user_id: ownerUserId,
      sender_role: 'owner',
      recipient_user_id: customerUserId,
      recipient_role: 'customer',
      metadata: {
        ...commonMetadata,
        roleContext: threadDefinition.roleContext,
        href: threadDefinition.href,
      },
      status: 'sent',
    }, tenantScope);

    await insertMarketplaceSharedMessage(adminClient, {
      thread_key: threadKey,
      family: 'marketplace',
      thread_type: threadDefinition.threadType,
      entity_type: 'marketplace_request',
      entity_id: requestId,
      message_type: 'note',
      subject: listingTitle,
      body: 'Welcome. If you need anything before pickup, message me here.',
      sender_user_id: ownerUserId,
      sender_role: 'owner',
      recipient_user_id: customerUserId,
      recipient_role: 'customer',
      metadata: {
        ...commonMetadata,
        roleContext: threadDefinition.roleContext,
        href: threadDefinition.href,
        autoWelcome: true,
      },
      status: 'sent',
    }, tenantScope);
  }
};

const expireMarketplaceApprovalHold = async (adminClient, requestRow, nowIso = new Date().toISOString()) => {
  const existingCounterOffer = requestRow?.counter_offer && typeof requestRow.counter_offer === 'object'
    ? requestRow.counter_offer
    : {};
  const holdExpiresAt = getMarketplaceApprovalHoldExpiry(existingCounterOffer, requestRow?.accepted_at || null);

  const { error } = await adminClient
    .from(BOOKING_REQUESTS_TABLE)
    .update({
      request_status: 'expired',
      closed_at: nowIso,
      updated_at: nowIso,
      counter_offer: {
        ...existingCounterOffer,
        hold_expires_at: holdExpiresAt,
        hold_expired_at: nowIso,
      },
    })
    .eq('id', requestRow.id);

  if (error) throw error;

  return {
    ...requestRow,
    request_status: 'expired',
    closed_at: nowIso,
    updated_at: nowIso,
    counter_offer: {
      ...existingCounterOffer,
      hold_expires_at: holdExpiresAt,
      hold_expired_at: nowIso,
    },
  };
};

const insertWalletTransactionWithCompatibility = async (adminClient, payload) => {
  let nextPayload = { ...payload };

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { error } = await adminClient.from('app_wallet_transactions').insert([nextPayload]);
    if (!error) return null;

    const message = String(error?.message || error?.details || '');
    const missingColumnMatch = message.match(/column "([^"]+)"/i) || message.match(/'([^']+)'\s+column/i);
    const missingColumn = missingColumnMatch?.[1] || null;

    if (missingColumn && Object.prototype.hasOwnProperty.call(nextPayload, missingColumn)) {
      const { [missingColumn]: _removed, ...reducedPayload } = nextPayload;
      nextPayload = reducedPayload;
      continue;
    }

    return error;
  }

  return null;
};

const approveOwnerMarketplaceRequest = async (adminClient, user, requestId, ownerMessage = '') => {
  const ownerUserId = String(user?.id || '').trim();
  const normalizedRequestId = String(requestId || '').trim();

  if (!ownerUserId) {
    throw new Error('Missing owner session');
  }
  if (!normalizedRequestId) {
    throw new Error('Booking reference missing');
  }

  const ownerOrganizationId = await loadUserOrganizationId(adminClient, ownerUserId);
  const tenantScope = buildOrganizationStampScope(ownerOrganizationId);

  const { data: requestRow, error: requestError } = await adminClient
    .from(BOOKING_REQUESTS_TABLE)
    .select('*')
    .eq('id', normalizedRequestId)
    .eq('owner_id', ownerUserId)
    .maybeSingle();

  if (requestError) throw requestError;
  if (!requestRow) {
    throw new Error('Marketplace request not found');
  }

  const normalizedStatus = String(requestRow?.request_status || '').trim().toLowerCase();
  if (isMarketplaceRequestApprovedRecord(requestRow)) {
    return { ok: true, alreadyApproved: true, requestId: normalizedRequestId };
  }
  if (!['pending', 'countered', 'accepted', 'pre_approved'].includes(normalizedStatus)) {
    throw new Error('This request is not ready for approval');
  }
  if (isMarketplaceApprovalHoldExpired(requestRow)) {
    await expireMarketplaceApprovalHold(adminClient, requestRow);
    throw new Error('This booking hold expired. Ask the renter to submit a new request.');
  }

  const { data: listingRow, error: listingError } = await adminClient
    .from(MARKETPLACE_LISTINGS_TABLE)
    .select('*')
    .eq('id', requestRow.listing_id)
    .maybeSingle();

  if (listingError) throw listingError;

  const duration = Math.max(1, Number(requestRow?.duration || 1));
  const rentalType = String(requestRow?.rental_type || 'hourly').trim().toLowerCase();
  const existingCounterOffer = requestRow?.counter_offer && typeof requestRow.counter_offer === 'object'
    ? requestRow.counter_offer
    : {};
  const counterPrice = Number(existingCounterOffer?.price_amount || 0);
  const hourlyPrice = Number(listingRow?.hourly_price_amount || 0);
  const dailyPrice = Number(listingRow?.daily_price_amount || 0);
  const estimatedAmount = counterPrice > 0
    ? counterPrice
    : rentalType === 'daily'
      ? dailyPrice * duration
      : hourlyPrice * duration;
  const commissionAmount = Math.max(
    0,
    Number(existingCounterOffer?.platform_fee_amount || 0) || calculateMarketplaceCommission(estimatedAmount)
  );
  const depositAmount = Math.max(
    0,
    Number(existingCounterOffer?.damage_deposit_amount || 0) ||
      Number(requestRow?.damage_deposit || requestRow?.deposit_amount || listingRow?.deposit_amount || 0)
  );

  const ownerWalletRow = await loadLatestWalletAccountByOwnerId(adminClient, ownerUserId);
  const customerWalletOwnerIdCandidates = [...new Set(
    [
      requestRow?.customer_id,
      requestRow?.customer_ext_id,
    ]
      .map((value) => String(value || '').trim())
      .filter((value) => value && isUuidLike(value))
  )];
  const customerWalletRows = (
    await Promise.all(
      customerWalletOwnerIdCandidates.map((ownerId) => loadLatestWalletAccountByOwnerId(adminClient, ownerId))
    )
  ).filter(Boolean);
  const customerWalletRow = pickPreferredWalletAccount(customerWalletRows);
  const customerWalletOwnerId = String(
    customerWalletRow?.owner_id || customerWalletOwnerIdCandidates[0] || ''
  ).trim();

  const ownerWalletId = String(ownerWalletRow?.id || ownerWalletRow?.wallet_id || '').trim();
  const customerWalletId = String(customerWalletRow?.id || customerWalletRow?.wallet_id || '').trim();
  const ownerWalletBalance = getWalletBalance(ownerWalletRow);
  const customerWalletBalance = getWalletBalance(customerWalletRow);
  const ownerWalletState = String(ownerWalletRow?.wallet_status || ownerWalletRow?.verification_status || '').trim().toLowerCase();
  const customerWalletState = String(customerWalletRow?.wallet_status || customerWalletRow?.verification_status || '').trim().toLowerCase();

  if (!ownerWalletRow || !ownerWalletId) {
    throw new Error('Your wallet is not ready yet. Open Wallet first.');
  }
  if (ownerWalletState === 'restricted') {
    throw new Error('Your wallet is restricted. Resolve the wallet issue before approving this request.');
  }
  if (ownerWalletBalance < commissionAmount) {
    throw new Error(`Insufficient wallet balance. ${commissionAmount} MAD is required to approve this request.`);
  }
  if (depositAmount > 0) {
    if (!customerWalletRow || !customerWalletId) {
      throw new Error(`The customer wallet is not ready. ${depositAmount} MAD is required to cover the damage deposit.`);
    }
    if (customerWalletState === 'restricted') {
      throw new Error('The customer wallet is restricted and cannot cover the damage deposit right now.');
    }
    if (customerWalletBalance < depositAmount) {
      throw new Error(`The customer needs ${depositAmount} MAD in wallet balance to cover the damage deposit.`);
    }
  }

  const approvedAt = new Date().toISOString();
  const chatGraceExpiresAt = getMarketplaceChatGraceExpiry(existingCounterOffer, approvedAt);
  const ownerWalletBalanceAfter = Math.max(0, ownerWalletBalance - commissionAmount);
  const customerWalletBalanceAfter = Math.max(0, customerWalletBalance - depositAmount);
  const normalizedOwnerMessage = String(ownerMessage || '').trim() || 'Approved by owner.';

  const { error: ownerWalletUpdateError } = await adminClient
    .from('app_wallet_accounts')
    .update({
      current_balance: ownerWalletBalanceAfter,
      updated_at: approvedAt,
    })
    .eq('id', ownerWalletId);

  if (ownerWalletUpdateError) throw ownerWalletUpdateError;

  if (depositAmount > 0) {
    const { error: customerWalletUpdateError } = await adminClient
      .from('app_wallet_accounts')
      .update({
        current_balance: customerWalletBalanceAfter,
        updated_at: approvedAt,
      })
      .eq('id', customerWalletId);

    if (customerWalletUpdateError) throw customerWalletUpdateError;
  }

  const ownerTransactionError = await insertWalletTransactionWithCompatibility(adminClient, {
    wallet_account_id: ownerWalletId,
    wallet_id: ownerWalletId,
    owner_id: ownerUserId,
    amount: commissionAmount,
    status: 'approved',
    transaction_status: 'approved',
    type: 'marketplace_commission',
    transaction_type: 'marketplace_commission',
    description: `Marketplace commission reserved for request ${normalizedRequestId}`,
    notes: 'Owner approval reserved the platform fee.',
    created_at: approvedAt,
    updated_at: approvedAt,
  });

  if (ownerTransactionError) {
    throw ownerTransactionError;
  }

  if (depositAmount > 0) {
    const customerTransactionError = await insertWalletTransactionWithCompatibility(adminClient, {
      wallet_account_id: customerWalletId,
      wallet_id: customerWalletId,
      owner_id: customerWalletOwnerId,
      amount: depositAmount,
      status: 'approved',
      transaction_status: 'approved',
      type: 'damage_deposit_hold',
      transaction_type: 'damage_deposit_hold',
      description: `Damage deposit hold for request ${normalizedRequestId}`,
      notes: 'Owner approval placed the renter damage deposit on hold.',
      created_at: approvedAt,
      updated_at: approvedAt,
    });

    if (customerTransactionError) {
      throw customerTransactionError;
    }
  }

  const { error: approveError } = await adminClient
    .from(BOOKING_REQUESTS_TABLE)
    .update({
      request_status: MARKETPLACE_FINAL_APPROVAL_DB_STATUS,
      owner_response: normalizedOwnerMessage,
      approved_at: approvedAt,
      accepted_at: requestRow?.accepted_at || approvedAt,
      updated_at: approvedAt,
      closed_at: null,
      counter_offer: {
        ...existingCounterOffer,
        funds_model: 'owner_fee_customer_deposit',
        platform_fee_amount: commissionAmount,
        platform_fee_status: 'reserved',
        owner_fee_reserved_at: approvedAt,
        owner_wallet_balance_after: ownerWalletBalanceAfter,
        damage_deposit_amount: depositAmount,
        damage_deposit_status: depositAmount > 0 ? 'held' : 'not_required',
        customer_deposit_held_at: depositAmount > 0 ? approvedAt : null,
        customer_wallet_balance_after: depositAmount > 0 ? customerWalletBalanceAfter : customerWalletBalance,
        chat_unlocked_at: approvedAt,
        chat_grace_started_at: approvedAt,
        chat_grace_expires_at: chatGraceExpiresAt,
      },
    })
    .eq('id', normalizedRequestId);

  if (approveError) throw approveError;

  await seedMarketplaceApprovalMessages({
    adminClient,
    requestRow: {
      ...requestRow,
      approved_at: approvedAt,
      request_status: MARKETPLACE_FINAL_APPROVAL_DB_STATUS,
      counter_offer: {
        ...existingCounterOffer,
        platform_fee_status: 'reserved',
        damage_deposit_status: depositAmount > 0 ? 'held' : 'not_required',
        chat_unlocked_at: approvedAt,
        chat_grace_started_at: approvedAt,
        chat_grace_expires_at: chatGraceExpiresAt,
      },
    },
    listingRow,
    ownerUserId,
    ownerName:
      user?.user_metadata?.full_name ||
      user?.user_metadata?.name ||
      user?.email ||
      '',
    ownerEmail: user?.email || '',
    approvedAt,
    commissionAmount,
    depositAmount,
    tenantScope,
  });

  await insertRentalEvent(adminClient, {
    rentalId: normalizedRequestId,
    eventType: 'approved',
    actor: 'owner',
    metadata: {
      ownerId: ownerUserId,
      customerId: customerWalletOwnerId || null,
      commissionAmount,
      ownerWalletBalanceAfter,
      damageDepositAmount: depositAmount,
      customerWalletBalanceAfter: depositAmount > 0 ? customerWalletBalanceAfter : customerWalletBalance,
      approvedAt,
      chatUnlockedAt: approvedAt,
      chatGraceExpiresAt,
    },
  });

  return {
    ok: true,
    requestId: normalizedRequestId,
    approvedAt,
    commissionAmount,
    damageDepositAmount: depositAmount,
    ownerWalletBalance: ownerWalletBalanceAfter,
    customerWalletBalance: depositAmount > 0 ? customerWalletBalanceAfter : customerWalletBalance,
    chatUnlockedAt: approvedAt,
    chatGraceExpiresAt,
  };
};

const confirmCustomerMarketplaceRequest = async (adminClient, user, requestId) => {
  const userId = String(user?.id || '').trim();
  const email = normalizeEmail(user?.email);
  const normalizedRequestId = String(requestId || '').trim();
  const customerRequestFilters = [
    userId ? `customer_id.eq.${userId}` : '',
    userId ? `customer_ext_id.eq.${userId}` : '',
    email ? `customer_email.ilike.${email}` : '',
  ].filter(Boolean);

  if (!userId && !email) {
    throw new Error('Missing customer session');
  }
  if (!normalizedRequestId) {
    throw new Error('Booking reference missing');
  }

  const { data: requestRow, error: requestError } = await adminClient
    .from(BOOKING_REQUESTS_TABLE)
    .select('*')
    .eq('id', normalizedRequestId)
    .or(customerRequestFilters.join(','))
    .maybeSingle();

  if (requestError) throw requestError;
  if (!requestRow) {
    throw new Error('Marketplace request not found');
  }

  if (isMarketplaceRequestApprovedRecord(requestRow)) {
    return {
      ok: true,
      alreadyApproved: true,
      requestId: normalizedRequestId,
      approvedAt: requestRow?.approved_at || null,
    };
  }

  const normalizedStatus = String(requestRow?.request_status || '').trim().toLowerCase();
  if (!['accepted', 'pre_approved'].includes(normalizedStatus)) {
    throw new Error('This request is not ready for final approval yet');
  }

  if (isMarketplaceApprovalHoldExpired(requestRow)) {
    await expireMarketplaceApprovalHold(adminClient, requestRow);
    throw new Error('This booking hold expired. Request again to continue.');
  }

  if (requestRow?.approved_at) {
    return { ok: true, alreadyApproved: true };
  }

  const { data: listingRow, error: listingError } = await adminClient
    .from(MARKETPLACE_LISTINGS_TABLE)
    .select('*')
    .eq('id', requestRow.listing_id)
    .maybeSingle();

  if (listingError) throw listingError;

  const duration = Math.max(1, Number(requestRow?.duration || 1));
  const rentalType = String(requestRow?.rental_type || 'hourly').trim().toLowerCase();
  const counterOffer = requestRow?.counter_offer && typeof requestRow.counter_offer === 'object' ? requestRow.counter_offer : {};
  const counterPrice = Number(counterOffer?.price_amount || 0);
  const hourlyPrice = Number(listingRow?.hourly_price_amount || 0);
  const dailyPrice = Number(listingRow?.daily_price_amount || 0);
  const estimatedAmount = counterPrice > 0
    ? counterPrice
    : rentalType === 'daily'
      ? dailyPrice * duration
      : hourlyPrice * duration;
  const commissionAmount = calculateMarketplaceCommission(estimatedAmount);

  const { data: walletRow, error: walletError } = await adminClient
    .from('app_wallet_accounts')
    .select('*')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (walletError) throw walletError;

  const walletId = String(walletRow?.id || walletRow?.wallet_id || '').trim();
  const walletBalance = Math.max(0, Number(walletRow?.current_balance ?? walletRow?.balance ?? walletRow?.wallet_balance ?? 0));

  if (!walletId || !walletRow) {
    throw new Error('Your wallet is not ready yet. Open Wallet first.');
  }

  if (walletBalance < commissionAmount) {
    throw new Error(`Insufficient wallet balance. ${commissionAmount} MAD is required to confirm this request.`);
  }

  const nextBalance = Math.max(0, walletBalance - commissionAmount);
  const walletUpdatePayload = {
    current_balance: nextBalance,
    updated_at: new Date().toISOString(),
  };

  const { error: walletUpdateError } = await adminClient
    .from('app_wallet_accounts')
    .update(walletUpdatePayload)
    .eq('id', walletId);

  if (walletUpdateError) throw walletUpdateError;

  const transactionError = await insertWalletTransactionWithCompatibility(adminClient, {
    wallet_account_id: walletId,
    wallet_id: walletId,
    owner_id: userId,
    amount: commissionAmount,
    status: 'approved',
    transaction_status: 'approved',
    type: 'marketplace_commission',
    transaction_type: 'marketplace_commission',
    description: `Marketplace commission reserved for request ${requestId}`,
    notes: 'Final approval unlocked marketplace chat.',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (transactionError) {
    throw transactionError;
  }

  const approvedAt = new Date().toISOString();
  const { error: approveError } = await adminClient
    .from(BOOKING_REQUESTS_TABLE)
    .update({
      request_status: MARKETPLACE_FINAL_APPROVAL_DB_STATUS,
      approved_at: approvedAt,
      accepted_at: requestRow?.accepted_at || approvedAt,
      updated_at: approvedAt,
    })
    .eq('id', requestId);

  if (approveError) throw approveError;

  await insertRentalEvent(adminClient, {
    rentalId: requestId,
    eventType: 'confirmed',
    actor: 'renter',
    metadata: {
      customerId: userId,
      commissionAmount,
      walletBalanceAfter: nextBalance,
      approvedAt,
    },
  });

  return {
    ok: true,
    requestId,
    commissionAmount,
    walletBalance: nextBalance,
    approvedAt,
  };
};

const remindMarketplaceOwner = async (adminClient, user, requestId) => {
  const userId = String(user?.id || '').trim();
  const email = normalizeEmail(user?.email);
  const customerRequestFilters = [
    userId ? `customer_id.eq.${userId}` : '',
    userId ? `customer_ext_id.eq.${userId}` : '',
    email ? `customer_email.ilike.${email}` : '',
  ].filter(Boolean);

  if (!userId && !email) {
    throw new Error('Missing customer session');
  }

  const { data: requestRow, error: requestError } = await adminClient
    .from(BOOKING_REQUESTS_TABLE)
    .select('*')
    .eq('id', requestId)
    .or(customerRequestFilters.join(','))
    .maybeSingle();

  if (requestError) throw requestError;
  if (!requestRow) {
    throw new Error('Marketplace request not found');
  }

  const normalizedStatus = String(requestRow?.request_status || '').trim().toLowerCase();
  if (normalizedStatus !== 'pending') {
    throw new Error('Reminders are only available while waiting for the owner reply');
  }

  const existingCounterOffer = requestRow?.counter_offer && typeof requestRow.counter_offer === 'object'
    ? requestRow.counter_offer
    : {};

  if (existingCounterOffer?.customer_reminder_sent_at) {
    return {
      ok: true,
      alreadySent: true,
      reminderSentAt: existingCounterOffer.customer_reminder_sent_at,
    };
  }

  const listingId = String(requestRow?.listing_id || '').trim();
  if (!listingId) {
    throw new Error('This request is missing listing information');
  }

  const { data: listingRow, error: listingError } = await adminClient
    .from(MARKETPLACE_LISTINGS_TABLE)
    .select('*')
    .eq('id', listingId)
    .maybeSingle();

  if (listingError) throw listingError;
  if (!listingRow) {
    throw new Error('Marketplace listing not found');
  }

  const ownerId = String(requestRow?.owner_id || listingRow?.owner_id || '').trim();
  if (!ownerId) {
    throw new Error('This request is missing owner information');
  }

  const { data: ownerRow, error: ownerError } = await adminClient
    .from(APP_USERS_TABLE)
    .select('id, email, full_name, username')
    .eq('id', ownerId)
    .maybeSingle();

  if (ownerError) throw ownerError;

  const ownerEmail = normalizeEmail(ownerRow?.email);
  if (!ownerEmail) {
    throw new Error('The owner does not have an email configured');
  }

  const requestedStartAt = normalizeTimestampValue(requestRow?.requested_start_at, null);
  const requestedEndAt = normalizeTimestampValue(requestRow?.requested_end_at, null);
  const duration = Math.max(1, Number(requestRow?.duration || 1));
  const rentalType = String(requestRow?.rental_type || 'hourly').trim().toLowerCase();
  const reminderSentAt = new Date().toISOString();
  const customerName = String(
    requestRow?.customer_name ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email ||
    'A customer'
  ).trim();
  const listingTitle = String(
    listingRow?.title ||
    requestRow?.listing_title ||
    'Marketplace vehicle'
  ).trim();

  const reminderHtml = `
    <div style="font-size:15px;line-height:24px;color:#475569;">
      <p style="margin:0 0 12px 0;">Hello ${ownerRow?.full_name || ownerRow?.username || 'Owner'},</p>
      <p style="margin:0 0 12px 0;"><strong>${customerName}</strong> sent a gentle reminder for their pending marketplace request.</p>
      <div style="margin:0 0 18px 0;border:1px solid #ede9fe;border-radius:22px;padding:18px;background:linear-gradient(180deg,#ffffff 0%,#faf5ff 100%);">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#8b5cf6;">Request summary</div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:16px;">
          <tr><td style="padding:0 0 12px 0;font-size:13px;color:#64748b;">Vehicle</td><td style="padding:0 0 12px 18px;font-size:14px;color:#0f172a;font-weight:700;text-align:right;">${listingTitle}</td></tr>
          <tr><td style="padding:0 0 12px 0;font-size:13px;color:#64748b;">Start</td><td style="padding:0 0 12px 18px;font-size:14px;color:#0f172a;font-weight:700;text-align:right;">${requestedStartAt || 'Pending'}</td></tr>
          <tr><td style="padding:0 0 12px 0;font-size:13px;color:#64748b;">End</td><td style="padding:0 0 12px 18px;font-size:14px;color:#0f172a;font-weight:700;text-align:right;">${requestedEndAt || 'Pending'}</td></tr>
          <tr><td style="padding:0;font-size:13px;color:#64748b;">Duration</td><td style="padding:0 0 0 18px;font-size:14px;color:#0f172a;font-weight:700;text-align:right;">${duration} ${rentalType === 'daily' ? 'day(s)' : 'hour(s)'}</td></tr>
        </table>
      </div>
      <p style="margin:0;">Please review the request when you can.</p>
    </div>
  `;

  await sendResendEmail({
    from: EMAIL_SENDERS.bookings,
    to: ownerEmail,
    subject: `Marketplace request reminder • ${listingTitle}`,
    html: reminderHtml,
    replyTo: requestRow?.customer_email || email || undefined,
  });

  const { error: updateError } = await adminClient
    .from(BOOKING_REQUESTS_TABLE)
    .update({
      counter_offer: {
        ...existingCounterOffer,
        customer_reminder_sent_at: reminderSentAt,
        customer_reminder_sent_by: userId || email,
      },
      updated_at: reminderSentAt,
    })
    .eq('id', requestId);

  if (updateError) throw updateError;

  return {
    ok: true,
    requestId,
    reminderSentAt,
  };
};

const RENTAL_SELECT = `
  *,
  vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(
    *,
    vehicle_model:saharax_0u4w4d_vehicle_models!vehicle_model_id(*)
  ),
  extensions:rental_extensions!rental_extensions_rental_id_fkey(*),
  package:app_4c3a7a6153_rental_km_packages!package_id(*)
`;

const loadCustomerRentals = async (adminClient, user, timingSettings = DEFAULT_RENTAL_TIMING_SETTINGS) => {
  const userId = String(user?.id || '').trim();
  const email = normalizeEmail(user?.email);
  const identity = await loadCustomerBookingIdentity(adminClient, user);
  const customerIdCandidates = [...new Set([
    String(identity?.id || '').trim(),
    userId ? `cust_auth_${userId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)}` : '',
  ].filter(Boolean))];
  const nameCandidates = buildCustomerNameCandidates(
    String(identity?.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name || '').trim(),
    email
  );

  const queries = [];

  customerIdCandidates.forEach((customerId) => {
    queries.push(
      adminClient
        .from('app_4c3a7a6153_rentals')
        .select(RENTAL_SELECT)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
    );
  });

  if (email) {
    queries.push(
      adminClient
        .from('app_4c3a7a6153_rentals')
        .select(RENTAL_SELECT)
        .ilike('customer_email', email)
        .order('created_at', { ascending: false })
    );
  }

  if (nameCandidates.length) {
    queries.push(
      adminClient
        .from('app_4c3a7a6153_rentals')
        .select(RENTAL_SELECT)
        .eq('booking_source', 'website')
        .eq('inventory_source', 'certified_fleet')
        .is('customer_id', null)
        .is('customer_email', null)
        .order('created_at', { ascending: false })
        .limit(40)
    );
  }

  const results = await Promise.allSettled(queries);
  const merged = new Map();

  results.forEach((result) => {
    if (result.status !== 'fulfilled') return;
    const { data, error } = result.value;
    if (error || !Array.isArray(data)) return;
    data.forEach((row) => merged.set(String(row.id), row));
  });

  return Array.from(merged.values())
    .filter((row) => {
      const rowCustomerId = String(row?.customer_id || '').trim();
      const rowCustomerEmail = normalizeEmail(row?.customer_email);
      if (customerIdCandidates.includes(rowCustomerId)) return true;
      if (email && rowCustomerEmail && rowCustomerEmail === email) return true;
      if (!rowCustomerId && !rowCustomerEmail && isLikelyCustomerNameMatch(row?.customer_name, nameCandidates)) return true;
      return false;
    })
    .map((row) => {
      const effectiveStatus = normalizeEffectiveRentalStatus(row, timingSettings);
      return {
        ...row,
        rental_status: effectiveStatus,
        status: effectiveStatus,
      };
    })
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
};

const loadCustomerRentalDetail = async (adminClient, user, rentalLookupId, timingSettings = DEFAULT_RENTAL_TIMING_SETTINGS) => {
  const rentals = await loadCustomerRentals(adminClient, user, timingSettings);
  const target = rentals.find((row) => String(row?.id || '') === String(rentalLookupId) || String(row?.rental_id || '') === String(rentalLookupId));
  if (!target) {
    return null;
  }

  const { data: reportRows, error: reportError } = await adminClient
    .from('app_4c3a7a6153_vehicle_reports')
    .select('*')
    .eq('rental_id', target.id)
    .order('created_at', { ascending: false })
    .limit(1);

  if (reportError) {
    throw reportError;
  }

  const latestReport = reportRows?.[0] || null;
  let maintenance = null;

  if (latestReport?.maintenance_id) {
    const { data: maintenanceRow, error: maintenanceError } = await adminClient
      .from(MAINTENANCE_RECORDS_TABLE)
      .select('*')
      .eq('id', latestReport.maintenance_id)
      .maybeSingle();

    if (maintenanceError) {
      throw maintenanceError;
    }

    if (maintenanceRow) {
      const { data: maintenanceParts, error: maintenancePartsError } = await adminClient
        .from(MAINTENANCE_PARTS_TABLE)
        .select('*')
        .eq('maintenance_id', maintenanceRow.id)
        .order('created_at', { ascending: true });

      if (maintenancePartsError) {
        throw maintenancePartsError;
      }

      maintenance = {
        ...maintenanceRow,
        parts: Array.isArray(maintenanceParts) ? maintenanceParts : [],
        parts_used: Array.isArray(maintenanceParts) ? maintenanceParts : [],
      };
    }
  }

  let requestCounterOffer = null;
  let ownerExecution = null;

  if (target?.marketplace_request_id) {
    const { data: requestRow, error: requestError } = await adminClient
      .from(BOOKING_REQUESTS_TABLE)
      .select('id, counter_offer')
      .eq('id', target.marketplace_request_id)
      .maybeSingle();

    if (requestError) {
      throw requestError;
    }

    requestCounterOffer = requestRow?.counter_offer && typeof requestRow.counter_offer === 'object'
      ? requestRow.counter_offer
      : null;
    ownerExecution = requestCounterOffer?.owner_execution && typeof requestCounterOffer.owner_execution === 'object'
      ? requestCounterOffer.owner_execution
      : null;
  }

  return {
    ...target,
    vehicleReport: latestReport,
    vehicle_report: latestReport,
    linkedMaintenance: maintenance,
    linked_maintenance: maintenance,
    marketplaceRequestCounterOffer: requestCounterOffer,
    marketplace_request_counter_offer: requestCounterOffer,
    ownerExecution,
    owner_execution: ownerExecution,
  };
};

const loadCustomerTours = async (adminClient, user) => {
  const userId = String(user?.id || '').trim();
  const email = normalizeEmail(user?.email);
  const identity = await loadCustomerBookingIdentity(adminClient, user);
  const nameCandidates = buildCustomerNameCandidates(
    String(identity?.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name || '').trim(),
    email
  );

  const queries = [];

  if (userId) {
    queries.push(
      adminClient
        .from(TOUR_BOOKINGS_TABLE)
        .select('*')
        .eq('booked_by_user_id', userId)
        .order('created_at', { ascending: false })
    );
  }

  if (email) {
    queries.push(
      adminClient
        .from(TOUR_BOOKINGS_TABLE)
        .select('*')
        .ilike('customer_email', email)
        .order('created_at', { ascending: false })
    );
  }

  if (nameCandidates.length) {
    queries.push(
      adminClient
        .from(TOUR_BOOKINGS_TABLE)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(80)
    );
  }

  const results = await Promise.allSettled(queries);
  const merged = new Map();

  results.forEach((result) => {
    if (result.status !== 'fulfilled') return;
    const { data, error } = result.value;
    if (error || !Array.isArray(data)) return;
    data.forEach((row) => merged.set(String(row.id), row));
  });

  const filteredRows = Array.from(merged.values()).filter((rawRow) => {
    const row = normalizeTourBookingRow(rawRow);
    const rowBookedByUserId = String(row?.booked_by_user_id || '').trim();
    const rowCustomerEmail = normalizeEmail(row?.customer_email);

    if (userId && rowBookedByUserId && rowBookedByUserId === userId) return true;
    if (email && rowCustomerEmail && rowCustomerEmail === email) return true;
    if (!rowBookedByUserId && !rowCustomerEmail && isLikelyCustomerNameMatch(row?.customer_name, nameCandidates)) {
      return true;
    }

    return false;
  });

  return groupCustomerTourRows(filteredRows);
};

const loadCustomerTourDetail = async (adminClient, user, tourLookupId) => {
  const tours = await loadCustomerTours(adminClient, user);
  const target = tours.find((tour) => String(tour?.groupId || '') === String(tourLookupId) || String(tour?.id || '') === String(tourLookupId)) || null;
  if (!target?.groupId) {
    return target;
  }

  const { data: activityLogs, error: activityError } = await adminClient
    .from(TOUR_ACTIVITY_LOG_TABLE)
    .select('*')
    .filter('details->>groupId', 'eq', target.groupId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (activityError) {
    throw activityError;
  }

  return {
    ...target,
    activityLogs: Array.isArray(activityLogs) ? activityLogs : [],
  };
};

const loadCustomerAccountSnapshot = async (adminClient, user) => {
  const userId = String(user?.id || '').trim();
  const email = normalizeEmail(user?.email);
  const authCustomerId = userId ? `cust_auth_${userId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)}` : '';

  const fallbackProfile = {
    fullName: user?.user_metadata?.full_name || user?.email || 'Customer',
    email,
    phone: user?.user_metadata?.phone || '',
    city: user?.user_metadata?.city || 'Tangier',
    country: user?.user_metadata?.country || 'Morocco',
    preferredLanguage: user?.user_metadata?.default_language || 'en',
    accountType: user?.user_metadata?.account_type || 'customer',
    profilePictureUrl: null,
  };

  if (!userId) {
    return {
      profile: fallbackProfile,
      wallet: {
        id: null,
        balance: 0,
        currencyCode: 'MAD',
        verificationState: 'not_active',
        approvedTopups: 0,
        pendingTopups: 0,
      },
      walletTransactions: [],
      loyalty: {
        points: 0,
        tier: 'Standard',
        totalSpend: 0,
        completedBookings: 0,
        activeBookings: 0,
      },
      active: [],
      recent: [],
      upcoming: [],
    };
  }

  const rentalTimingSettings = await loadRentalTimingSettings(adminClient);

  const [walletResult, customerByEmailResult, customerByIdResult, rentalsResult] = await Promise.allSettled([
    adminClient
      .from('app_wallet_accounts')
      .select('*')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    email
      ? adminClient
          .from('app_4c3a7a6153_customers')
          .select('id,email,phone,full_name,city,country,scan_metadata')
          .ilike('email', email)
          .limit(1)
      : Promise.resolve({ data: [], error: null }),
    authCustomerId
      ? adminClient
          .from('app_4c3a7a6153_customers')
          .select('id,email,phone,full_name,city,country,scan_metadata')
          .eq('id', authCustomerId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    loadCustomerRentals(adminClient, user, rentalTimingSettings),
  ]);

  const customerRow =
    customerByIdResult.status === 'fulfilled' && !customerByIdResult.value.error && customerByIdResult.value.data
      ? customerByIdResult.value.data
      : customerByEmailResult.status === 'fulfilled' && !customerByEmailResult.value.error
        ? customerByEmailResult.value.data?.[0] || null
        : null;
  const walletOwnerIdCandidates = [...new Set([userId, String(customerRow?.id || '').trim()].filter(Boolean))];
  const toWalletBalance = (row) => Math.max(0, Number(row?.current_balance ?? row?.balance ?? row?.wallet_balance ?? 0) || 0);
  let walletRow =
    walletResult.status === 'fulfilled' && !walletResult.value.error
      ? walletResult.value.data
      : null;

  if (walletOwnerIdCandidates.length > 1) {
    const alternateWalletOwnerId = walletOwnerIdCandidates.find((candidate) => candidate !== userId) || '';
    if (alternateWalletOwnerId) {
      const { data: alternateWalletRow, error: alternateWalletError } = await adminClient
        .from('app_wallet_accounts')
        .select('*')
        .eq('owner_id', alternateWalletOwnerId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!alternateWalletError && alternateWalletRow) {
        if (!walletRow || toWalletBalance(alternateWalletRow) >= toWalletBalance(walletRow)) {
          walletRow = alternateWalletRow;
        }
      }
    }
  }

  if (!walletRow) {
    const preferredWalletOwnerId = String(customerRow?.id || userId).trim();
    walletRow = await ensureWalletAccountForUser(adminClient, preferredWalletOwnerId).catch(() => null);
  }

  const walletId = String(walletRow?.id || walletRow?.wallet_id || '').trim();
  const rentals =
    rentalsResult.status === 'fulfilled' && Array.isArray(rentalsResult.value)
      ? rentalsResult.value
      : [];

  const walletTransactionsResult = walletId
    ? await adminClient
        .from('app_wallet_transactions')
        .select('*')
        .eq('wallet_account_id', walletId)
        .order('created_at', { ascending: false })
        .limit(12)
    : { data: [], error: null };
  const walletTopupsResult = await adminClient
    .from(WALLET_TOPUPS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(12);

  if (walletTransactionsResult.error) {
    throw walletTransactionsResult.error;
  }
  if (walletTopupsResult.error && !isMissingTableError(walletTopupsResult.error)) {
    throw walletTopupsResult.error;
  }

  const normalizeStatus = (row) => normalizeEffectiveRentalStatus(row);
  const normalizeDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const buildVehicleLabel = (vehicle = {}) => {
    const modelName = [vehicle?.name, vehicle?.model].filter(Boolean).join(' ').trim();
    const plate = vehicle?.plate_number || 'No plate';
    return [plate, modelName || 'Vehicle'].filter(Boolean).join(' • ');
  };
  const buildVehicleImageUrl = (vehicle = {}) =>
    vehicle?.vehicle_model?.image_url ||
    vehicle?.image_url ||
    '';
  const normalizeRentalRecord = (row = {}) => {
    const vehicle = row.vehicle || {};
    const linkedPackage = row.package || null;
    const startDate = normalizeDate(row.rental_start_date || row.started_at || row.created_at);
    const endDate = normalizeDate(row.actual_end_date || row.rental_end_date || row.completed_at || row.created_at);
    const total = Math.max(0, toNumber(row.total_amount || row.pending_total_request || row.unit_price));
    const outstanding = Math.max(0, toNumber(row.remaining_amount));
    const depositAmount = Math.max(0, toNumber(row.damage_deposit || row.deposit_amount));
    const inferredPaid = total > 0 ? Math.max(0, total - outstanding) : 0;
    const paid = Math.max(0, toNumber(row.paid_amount || row.amount_paid || inferredPaid || row.deposit_amount));
    const status = normalizeStatus(row);
    const category = String(vehicle.vehicle_type || 'ATV');
    const modelName = [vehicle.name, vehicle.model].filter(Boolean).join(' ').trim() || 'Vehicle';

    return {
      id: String(row.id),
      rentalId: row.rental_id || `RNT-${row.id}`,
      status,
      total,
      paid,
      startDate,
      endDate,
      category,
      modelName,
      vehicleLabel: buildVehicleLabel(vehicle),
      vehicleImageUrl: buildVehicleImageUrl(vehicle),
      city: row.pickup_city || vehicle.city || 'Tangier',
      paymentStatus: String(row.payment_status || 'unpaid'),
      packageName: row.selected_package_name || linkedPackage?.name || linkedPackage?.title || '',
    };
  };
  const getLoyaltyTier = (points = 0) => {
    if (points >= 3000) return 'VIP';
    if (points >= 1500) return 'Gold';
    if (points >= 700) return 'Silver';
    return 'Standard';
  };

  const normalizedRows = rentals.map((row) => normalizeRentalRecord(row));
  const completed = normalizedRows.filter((row) => ['completed', 'closed'].includes(row.status));
  const active = normalizedRows.filter((row) => ['active', 'ready_to_finish'].includes(row.status));
  const upcoming = normalizedRows.filter((row) => {
    const status = String(row?.status || '').toLowerCase();
    if (!['scheduled', 'confirmed'].includes(status)) return false;
    if (!(row.startDate instanceof Date) || Number.isNaN(row.startDate.getTime())) return true;
    return row.startDate.getTime() >= Date.now();
  });
  const totalSpend = Math.round(completed.reduce((sum, row) => sum + Math.max(row.paid, row.total), 0));
  const points = Math.round(completed.length * 100 + totalSpend / 20);

  const walletTransactions = Array.isArray(walletTransactionsResult.data) ? walletTransactionsResult.data : [];
  const walletTopups = Array.isArray(walletTopupsResult.data) ? walletTopupsResult.data : [];
  const approvedTopups = walletTopups.length
    ? walletTopups
        .filter((row) => String(row?.status || '').toLowerCase() === 'approved')
        .reduce((sum, row) => sum + toNumber(row?.amount), 0)
    : walletTransactions
        .filter((row) => String(row?.status || row?.transaction_status || '').toLowerCase() === 'approved')
        .filter((row) => String(row?.type || row?.transaction_type || '').toLowerCase().includes('topup'))
        .reduce((sum, row) => sum + toNumber(row?.amount), 0);
  const pendingTopups = walletTopups.length
    ? walletTopups
        .filter((row) => ['pending', 'submitted', 'review'].includes(String(row?.status || '').toLowerCase()))
        .reduce((sum, row) => sum + toNumber(row?.amount), 0)
    : walletTransactions
        .filter((row) => ['pending', 'submitted', 'review'].includes(String(row?.status || row?.transaction_status || '').toLowerCase()))
        .filter((row) => String(row?.type || row?.transaction_type || '').toLowerCase().includes('topup'))
        .reduce((sum, row) => sum + toNumber(row?.amount), 0);
  const pendingOrRejectedTopups = walletTopups
    .filter((row) => ['pending', 'submitted', 'review', 'rejected'].includes(String(row?.status || '').toLowerCase()))
    .map((row) => ({
      id: `topup-${String(row?.id || Math.random())}`,
      type: 'wallet_topup',
      amount: toNumber(row?.amount),
      status: String(row?.status || 'pending'),
      createdAt: row?.created_at || row?.updated_at || null,
      note:
        row?.review_note ||
        row?.note ||
        (String(row?.status || '').toLowerCase() === 'rejected'
          ? 'This bank transfer proof needs a new receipt.'
          : 'Submitted for manual bank transfer review.'),
    }));
  const combinedWalletTransactions = [...pendingOrRejectedTopups, ...walletTransactions]
    .sort((left, right) => new Date(right?.createdAt || right?.created_at || 0).getTime() - new Date(left?.createdAt || left?.created_at || 0).getTime())
    .slice(0, 12);

  return {
    profile: {
      fullName: customerRow?.full_name || fallbackProfile.fullName,
      email: customerRow?.email || fallbackProfile.email,
      phone: customerRow?.phone || fallbackProfile.phone,
      city: user?.user_metadata?.city || customerRow?.city || fallbackProfile.city,
      country: user?.user_metadata?.country || customerRow?.country || fallbackProfile.country,
      preferredLanguage: user?.user_metadata?.default_language || fallbackProfile.preferredLanguage,
      accountType: user?.user_metadata?.account_type || fallbackProfile.accountType,
      profilePictureUrl: fallbackProfile.profilePictureUrl,
    },
    wallet: {
      id: walletId || null,
      balance: Math.max(0, toNumber(walletRow?.current_balance ?? walletRow?.balance ?? walletRow?.wallet_balance)),
      currencyCode: String(walletRow?.currency_code || 'MAD'),
      verificationState: String(walletRow?.verification_status || walletRow?.wallet_status || 'not_active'),
      approvedTopups: Math.round(approvedTopups),
      pendingTopups: Math.round(pendingTopups),
    },
    walletTransactions: combinedWalletTransactions.map((row) => ({
      id: String(row?.id || row?.transaction_id || Math.random()),
      type: String(row?.type || row?.transaction_type || 'activity').replace(/_/g, ' '),
      amount: toNumber(row?.amount),
      status: String(row?.status || row?.transaction_status || 'pending'),
      createdAt: row?.createdAt || row?.created_at || row?.updated_at || null,
      note: row?.note || row?.description || row?.notes || row?.reason || '',
    })),
    loyalty: {
      points,
      tier: getLoyaltyTier(points),
      totalSpend,
      completedBookings: completed.length,
      activeBookings: active.length,
    },
    active: active.slice(0, 4),
    recent: normalizedRows.slice(0, 6),
    upcoming: upcoming.slice(0, 4),
  };
};

const loadOrganizationContext = async (adminClient, userId, profile, tenantScope = null) => {
  const tenantScopedOrganizationId = String(tenantScope?.organizationId || '').trim();

  if (tenantScope?.isShared && tenantScopedOrganizationId) {
    const [organizationResult, membershipResult] = await Promise.all([
      adminClient
        .from(ORGANIZATIONS_TABLE)
        .select('id, name, organization_status, is_platform_organization')
        .eq('id', tenantScopedOrganizationId)
        .maybeSingle(),
      adminClient
        .from(ORGANIZATION_MEMBERS_TABLE)
        .select('member_role, membership_status')
        .eq('organization_id', tenantScopedOrganizationId)
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

    if (!organizationResult.error && organizationResult.data) {
      return {
        organization_id: organizationResult.data.id,
        organization_name: organizationResult.data.name,
        organization_role: membershipResult.data?.member_role || null,
        organization_status:
          organizationResult.data.organization_status ||
          membershipResult.data?.membership_status ||
          null,
        is_platform_organization: Boolean(organizationResult.data.is_platform_organization),
      };
    }
  }

  const primaryOrganizationId = profile?.primary_organization_id || null;

  if (primaryOrganizationId) {
    const [organizationResult, membershipResult] = await Promise.all([
      adminClient
        .from(ORGANIZATIONS_TABLE)
        .select('id, name, organization_status, is_platform_organization')
        .eq('id', primaryOrganizationId)
        .maybeSingle(),
      adminClient
        .from(ORGANIZATION_MEMBERS_TABLE)
        .select('member_role, membership_status')
        .eq('organization_id', primaryOrganizationId)
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

    if (!organizationResult.error && organizationResult.data) {
      return {
        organization_id: organizationResult.data.id,
        organization_name: organizationResult.data.name,
        organization_role: membershipResult.data?.member_role || null,
        organization_status: organizationResult.data.organization_status || membershipResult.data?.membership_status || null,
        is_platform_organization: Boolean(organizationResult.data.is_platform_organization),
      };
    }
  }

  const membershipFallbackResult = await adminClient
    .from(ORGANIZATION_MEMBERS_TABLE)
    .select('organization_id, member_role, membership_status, organization:app_organizations(id, name, organization_status, is_platform_organization)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipFallbackResult.error || !membershipFallbackResult.data?.organization_id) {
    return null;
  }

  const organization = membershipFallbackResult.data.organization || null;
  return {
    organization_id: membershipFallbackResult.data.organization_id,
    organization_name: organization?.name || null,
    organization_role: membershipFallbackResult.data.member_role || null,
    organization_status: organization?.organization_status || membershipFallbackResult.data.membership_status || null,
    is_platform_organization: Boolean(organization?.is_platform_organization),
  };
};

const isTenantRecordReadyForCurrentMode = (tenantRecord = {}) => {
  if (!tenantRecord?.id) return false;

  const tenantStatus = String(tenantRecord?.tenant_status || '').trim().toLowerCase();
  if (tenantStatus !== 'active') {
    return false;
  }

  const tenancyMode = resolveTenantTenancyMode(tenantRecord);
  const metadata = tenantRecord?.metadata && typeof tenantRecord.metadata === 'object'
    ? tenantRecord.metadata
    : {};

  if (tenancyMode === 'shared') {
    return Boolean(
      String(
        metadata.organization_id ||
        metadata.shared_organization_id ||
        ''
      ).trim()
    );
  }

  return Boolean(
    tenantRecord?.tenant_project_ref &&
    tenantRecord?.tenant_app_url &&
    tenantRecord?.tenant_api_url &&
    tenantRecord?.tenant_anon_key
  );
};

const loadProfileWithCompatibility = async (adminClient, userId) => {
  const fallbackCoreFields = splitSelectFields(CORE_PROFILE_FIELDS);
  let fields = splitSelectFields(BUSINESS_OWNER_PROFILE_FIELDS);

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const result = await adminClient
      .from(APP_USERS_TABLE)
      .select(fields.join(', '))
      .eq('id', userId)
      .maybeSingle();

    if (!result.error) {
      return result;
    }

    if (!isSchemaCompatibilityError(result.error)) {
      return result;
    }

    const missingColumn = getMissingColumnName(result.error);
    if (missingColumn && fields.includes(missingColumn)) {
      fields = fields.filter((field) => field !== missingColumn);
      continue;
    }

    if (fields.join(',') !== fallbackCoreFields.join(',')) {
      fields = fallbackCoreFields;
      continue;
    }

    return result;
  }

  return {
    data: null,
    error: new Error('Profile select compatibility fallback exhausted'),
  };
};

const upsertProfileWithCompatibility = async (adminClient, profilePayload = {}) => {
  let compatiblePayload = { ...profilePayload };

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = await adminClient
      .from(APP_USERS_TABLE)
      .upsert(compatiblePayload, { onConflict: 'id' })
      .select(BASE_PROFILE_FIELDS)
      .maybeSingle();

    if (!result.error) {
      return {
        data: result.data || null,
        error: null,
        appliedPayload: compatiblePayload,
      };
    }

    if (!isSchemaCompatibilityError(result.error)) {
      return {
        data: null,
        error: result.error,
        appliedPayload: compatiblePayload,
      };
    }

    const missingColumn = getMissingColumnName(result.error);
    if (!missingColumn || !Object.prototype.hasOwnProperty.call(compatiblePayload, missingColumn)) {
      return {
        data: null,
        error: result.error,
        appliedPayload: compatiblePayload,
      };
    }

    const { [missingColumn]: _removed, ...reducedPayload } = compatiblePayload;
    compatiblePayload = reducedPayload;
  }

  return {
    data: null,
    error: new Error('Profile upsert compatibility fallback exhausted'),
    appliedPayload: compatiblePayload,
  };
};

const ensureStaffProfileWithDefaults = async (adminClient, user, profile = null) => {
  const resolvedRole = String(
    profile?.role ||
    user?.user_metadata?.role ||
    user?.app_metadata?.role ||
    'customer'
  ).trim().toLowerCase();

  if (!shouldSeedStaffProfile(resolvedRole)) {
    return profile;
  }

  const profilePermissions = resolvePermissionsMap(profile?.permissions || null);
  const metadataPermissions = resolvePermissionsMap(
    user?.user_metadata?.permissions || user?.app_metadata?.permissions || null
  );

  const existingPermissions =
    hasMeaningfulPermissions(profilePermissions)
      ? profilePermissions
      : hasMeaningfulPermissions(metadataPermissions)
        ? metadataPermissions
        : resolvedRole === 'business_owner'
          ? buildBusinessOwnerPermissionMap()
          : buildDefaultPermissionsForRole(resolvedRole);

  const shouldRepairProfile = !profile || !profile.id || !hasMeaningfulPermissions(profilePermissions);
  if (!shouldRepairProfile) {
    return profile;
  }

  const upsertPayload = {
    id: user.id,
    email: profile?.email || user?.email || null,
    full_name:
      profile?.full_name ||
      user?.user_metadata?.full_name ||
      user?.user_metadata?.name ||
      user?.email ||
      null,
    role: resolvedRole,
    access_enabled: profile?.access_enabled ?? true,
    permissions: existingPermissions,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await upsertProfileWithCompatibility(adminClient, upsertPayload);
  if (error) {
    console.warn('Failed to auto-repair staff app profile during /api/me/profile:', {
      userId: user?.id,
      message: error?.message,
      code: error?.code,
    });
    return profile;
  }

  return data || {
    ...(profile || {}),
    ...upsertPayload,
  };
};

const getMissingColumnName = (error) => {
  const message = String(error?.message || error?.details || '');
  const missingColumnMatch = message.match(/column "([^"]+)"/i) || message.match(/'([^']+)'\s+column/i);
  return missingColumnMatch?.[1] || null;
};

const updateProfileWithCompatibility = async (adminClient, userId, profileUpdate = {}) => {
  let compatiblePayload = { ...profileUpdate };

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = await adminClient
      .from(APP_USERS_TABLE)
      .update(compatiblePayload)
      .eq('id', userId)
      .select(BASE_PROFILE_FIELDS)
      .maybeSingle();

    if (!result.error) {
      return {
        data: result.data || null,
        error: null,
        appliedPayload: compatiblePayload,
      };
    }

    if (!isSchemaCompatibilityError(result.error)) {
      return {
        data: null,
        error: result.error,
        appliedPayload: compatiblePayload,
      };
    }

    const missingColumn = getMissingColumnName(result.error);
    if (!missingColumn || !Object.prototype.hasOwnProperty.call(compatiblePayload, missingColumn)) {
      return {
        data: null,
        error: result.error,
        appliedPayload: compatiblePayload,
      };
    }

    const { [missingColumn]: _removed, ...reducedPayload } = compatiblePayload;
    compatiblePayload = reducedPayload;
  }

  return {
    data: null,
    error: new Error('Profile update compatibility fallback exhausted'),
    appliedPayload: compatiblePayload,
  };
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const requestUrl = (() => {
    try {
      return new URL(req.url, 'http://localhost');
    } catch {
      return null;
    }
  })();
  const pathResource = requestUrl?.pathname?.split('/').filter(Boolean).pop() || '';
  const resource = String(req.query?.resource || pathResource || '').trim().toLowerCase();

  const auth = await authenticateRequest(req);

  if (auth.error) {
    res.status(auth.error.status).json(auth.error.body);
    return;
  }

  const { user, adminClient, tenantRuntime } = auth;

  try {
    if (req.method === 'GET' && resource === 'profile') {
      const { data, error } = await loadProfileWithCompatibility(adminClient, user.id);

      if (error) {
        throw error;
      }

      const repairedProfile = await ensureStaffProfileWithDefaults(adminClient, user, data || null);
      const tenantScope = await resolveRequestTenantScope({
        req,
        adminClient,
        tenantRuntime: tenantRuntime || null,
      });
      const organizationContext = await loadOrganizationContext(
        adminClient,
        user.id,
        repairedProfile || null,
        tenantScope
      );
      res.status(200).json({
        profile: buildProfileFromAuthUser(user, {
          ...(repairedProfile || {}),
          ...(organizationContext || {}),
        }),
      });
      return;
    }

    if (req.method === 'GET' && resource === 'account-snapshot') {
      const snapshot = await loadCustomerAccountSnapshot(adminClient, user);
      res.status(200).json(snapshot);
      return;
    }

    if (req.method === 'GET' && resource === 'booking-identity') {
      const identity = await loadCustomerBookingIdentity(adminClient, user);
      res.status(200).json({ identity });
      return;
    }

    if (req.method === 'GET' && resource === 'marketplace-requests') {
      const requests = await loadCustomerMarketplaceRequests(adminClient, user);
      res.status(200).json({ requests });
      return;
    }

    if (req.method === 'GET' && resource === 'marketplace-request-detail') {
      const requestId = String(req.query?.requestId || '').trim();
      if (!requestId) {
        res.status(400).json({ error: 'Missing requestId' });
        return;
      }

      const request = await loadCustomerMarketplaceRequestDetail(adminClient, user, requestId);
      if (!request) {
        res.status(404).json({ error: 'Marketplace request not found' });
        return;
      }

      res.status(200).json({ request });
      return;
    }

    if (req.method === 'GET' && resource === 'marketplace-request-recovery') {
      const requestId = String(req.query?.requestId || '').trim();
      if (!requestId) {
        res.status(400).json({ error: 'Missing requestId' });
        return;
      }

      const recovery = await loadCustomerMarketplaceRequestRecovery(adminClient, user, requestId);
      if (!recovery?.vehicleId) {
        res.status(404).json({ error: 'Marketplace request not found' });
        return;
      }

      res.status(200).json({ recovery });
      return;
    }

    if (req.method === 'POST' && resource === 'marketplace-request-confirmation') {
      const requestId = String(req.body?.requestId || '').trim();
      if (!requestId) {
        res.status(400).json({ error: 'Booking reference missing' });
        return;
      }

      try {
        const result = await confirmCustomerMarketplaceRequest(adminClient, user, requestId);
        res.status(200).json(result);
      } catch (error) {
        const message = String(error?.message || '').trim() || 'Failed to confirm booking';
        if (message === 'Marketplace request not found') {
          res.status(404).json({ error: message });
          return;
        }
        if (isMarketplaceRequestValidationMessage(message)) {
          res.status(400).json({ error: message });
          return;
        }
        throw error;
      }
      return;
    }

    if (req.method === 'POST' && resource === 'owner-marketplace-request-approval') {
      const requestId = String(req.body?.requestId || '').trim();
      const ownerMessage = String(req.body?.message || '').trim();
      if (!requestId) {
        res.status(400).json({ error: 'Booking reference missing' });
        return;
      }

      try {
        const result = await approveOwnerMarketplaceRequest(adminClient, user, requestId, ownerMessage);
        res.status(200).json(result);
      } catch (error) {
        const message = String(error?.message || '').trim() || 'Failed to approve booking';
        if (message === 'Marketplace request not found') {
          res.status(404).json({ error: message });
          return;
        }
        if (isMarketplaceRequestValidationMessage(message)) {
          res.status(400).json({ error: message });
          return;
        }
        throw error;
      }
      return;
    }

    if (req.method === 'POST' && resource === 'marketplace-request-reminder') {
      const requestId = String(req.body?.requestId || '').trim();
      if (!requestId) {
        res.status(400).json({ error: 'Missing requestId' });
        return;
      }

      const result = await remindMarketplaceOwner(adminClient, user, requestId);
      res.status(200).json(result);
      return;
    }

    if (req.method === 'GET' && resource === 'rentals') {
      const rentalTimingSettings = await loadRentalTimingSettings(adminClient);
      const rentals = await loadCustomerRentals(adminClient, user, rentalTimingSettings);
      res.status(200).json({ rentals });
      return;
    }

    if (req.method === 'GET' && resource === 'rental-detail') {
      const rentalLookupId = String(req.query?.rentalId || req.query?.id || '').trim();
      if (!rentalLookupId) {
        res.status(400).json({ error: 'Missing rentalId' });
        return;
      }

      const rentalTimingSettings = await loadRentalTimingSettings(adminClient);
      const rental = await loadCustomerRentalDetail(adminClient, user, rentalLookupId, rentalTimingSettings);
      if (!rental) {
        res.status(404).json({ error: 'Rental not found' });
        return;
      }

      res.status(200).json({ rental });
      return;
    }

    if (req.method === 'GET' && resource === 'tours') {
      const tours = await loadCustomerTours(adminClient, user);
      res.status(200).json({ tours });
      return;
    }

    if (req.method === 'GET' && resource === 'tour-detail') {
      const tourLookupId = String(req.query?.tourId || req.query?.id || '').trim();
      if (!tourLookupId) {
        res.status(400).json({ error: 'Missing tourId' });
        return;
      }

      const tour = await loadCustomerTourDetail(adminClient, user, tourLookupId);
      if (!tour) {
        res.status(404).json({ error: 'Tour not found' });
        return;
      }

      res.status(200).json({ tour });
      return;
    }

    if (req.method === 'PATCH' && resource === 'profile') {
      const payload = req.body && typeof req.body === 'object' ? req.body : {};
      const hasOwn = (key) => Object.prototype.hasOwnProperty.call(payload, key);
      const payloadKeys = Object.keys(payload);
      const isPreferencesOnlyUpdate =
        payloadKeys.length > 0 &&
        payloadKeys.every((key) => key === 'preferences');
      const nowIso = new Date().toISOString();

      if (isPreferencesOnlyUpdate) {
        const preferences = payload.preferences && typeof payload.preferences === 'object' && !Array.isArray(payload.preferences)
          ? payload.preferences
          : {};
        const {
          data: updatedProfile,
          error: updateError,
        } = await updateProfileWithCompatibility(adminClient, user.id, {
          preferences,
          updated_at: nowIso,
        });

        if (updateError) {
          throw updateError;
        }

        res.status(200).json({
          profile: buildProfileFromAuthUser(
            {
              ...user,
              user_metadata: {
                ...(user.user_metadata || {}),
                preferences,
              },
            },
            updatedProfile || {
              id: user.id,
              email: user.email,
              preferences,
            }
          ),
        });
        return;
      }

      const explicitUsername = hasOwn('username')
        ? String(payload.username || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9._-]+/g, '')
        : null;
      const explicitFirstName = hasOwn('first_name') ? String(payload.first_name || '').trim() : null;
      const explicitLastName = hasOwn('last_name') ? String(payload.last_name || '').trim() : null;
      const explicitFullName = hasOwn('full_name') || hasOwn('name')
        ? String(payload.full_name || payload.name || '').trim()
        : null;
      const normalizedFullName = explicitFullName !== null
        ? explicitFullName || null
        : [explicitFirstName, explicitLastName]
            .filter((value) => value !== null && value !== '')
            .join(' ')
            .trim() || null;

      const profileUpdate = { updated_at: nowIso };
      if (hasOwn('username')) profileUpdate.username = explicitUsername;
      if (hasOwn('first_name')) profileUpdate.first_name = explicitFirstName;
      if (hasOwn('last_name')) profileUpdate.last_name = explicitLastName;
      if (hasOwn('full_name') || hasOwn('name') || hasOwn('first_name') || hasOwn('last_name')) {
        profileUpdate.full_name = normalizedFullName || null;
      }
      if (hasOwn('phone')) profileUpdate.phone_number = payload.phone || null;
      if (hasOwn('address')) profileUpdate.address = payload.address || null;
      if (hasOwn('date_of_birth')) profileUpdate.date_of_birth = payload.date_of_birth || null;
      if (hasOwn('emergency_contact')) profileUpdate.emergency_contact = payload.emergency_contact || null;
      if (hasOwn('emergency_phone')) profileUpdate.emergency_phone = payload.emergency_phone || null;
      if (hasOwn('preferences')) profileUpdate.preferences = payload.preferences || {};

      const metadataPatch = {
        ...(user.user_metadata || {}),
      };
      if (hasOwn('username')) metadataPatch.username = explicitUsername;
      if (hasOwn('first_name')) metadataPatch.first_name = explicitFirstName;
      if (hasOwn('last_name')) metadataPatch.last_name = explicitLastName;
      if (hasOwn('full_name') || hasOwn('name') || hasOwn('first_name') || hasOwn('last_name')) {
        metadataPatch.full_name = normalizedFullName || null;
        metadataPatch.name = normalizedFullName || null;
      }
      if (hasOwn('phone')) metadataPatch.phone = payload.phone || null;
      if (hasOwn('address')) metadataPatch.address = payload.address || null;
      if (hasOwn('date_of_birth')) metadataPatch.date_of_birth = payload.date_of_birth || null;
      if (hasOwn('emergency_contact')) metadataPatch.emergency_contact = payload.emergency_contact || null;
      if (hasOwn('emergency_phone')) metadataPatch.emergency_phone = payload.emergency_phone || null;
      if (hasOwn('preferences')) metadataPatch.preferences = payload.preferences || {};

      const {
        data: updatedProfile,
        error: updateError,
        appliedPayload,
      } = await updateProfileWithCompatibility(adminClient, user.id, profileUpdate);

      if (updateError) {
        throw updateError;
      }

      const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...metadataPatch,
          phone: appliedPayload.phone_number ?? metadataPatch.phone ?? null,
          address: appliedPayload.address ?? metadataPatch.address ?? null,
          date_of_birth: appliedPayload.date_of_birth ?? metadataPatch.date_of_birth ?? null,
          emergency_contact: appliedPayload.emergency_contact ?? metadataPatch.emergency_contact ?? null,
          emergency_phone: appliedPayload.emergency_phone ?? metadataPatch.emergency_phone ?? null,
          preferences: appliedPayload.preferences ?? metadataPatch.preferences ?? {},
        },
      });

      if (authUpdateError) {
        console.warn('Profile metadata update failed after app profile save:', authUpdateError);
      }

      const persistedProfile = updatedProfile || (await loadProfileWithCompatibility(adminClient, user.id)).data || null;
      const organizationContext = await loadOrganizationContext(adminClient, user.id, persistedProfile || null);
      const nextUser = {
        ...user,
        user_metadata: {
          ...metadataPatch,
          phone: appliedPayload.phone_number ?? metadataPatch.phone ?? null,
          address: appliedPayload.address ?? metadataPatch.address ?? null,
          date_of_birth: appliedPayload.date_of_birth ?? metadataPatch.date_of_birth ?? null,
          emergency_contact: appliedPayload.emergency_contact ?? metadataPatch.emergency_contact ?? null,
          emergency_phone: appliedPayload.emergency_phone ?? metadataPatch.emergency_phone ?? null,
          preferences: appliedPayload.preferences ?? metadataPatch.preferences ?? {},
        },
      };

      res.status(200).json({
        profile: buildProfileFromAuthUser(nextUser, {
          ...(persistedProfile || {}),
          ...(organizationContext || {}),
        }),
      });
      return;
    }

    if (req.method === 'PATCH' && resource === 'subscription') {
      const requestedPlan = String(req.body?.subscription_plan || '').trim().toLowerCase();
      const requestedPlanMap = {
        free: { subscriptionPlan: 'free', planType: 'free' },
        starter: { subscriptionPlan: 'starter', planType: 'starter' },
        growth: { subscriptionPlan: 'growth', planType: 'growth' },
        pro: { subscriptionPlan: 'pro', planType: 'pro' },
        saas: { subscriptionPlan: 'starter', planType: 'starter' },
        saas_web: { subscriptionPlan: 'growth', planType: 'growth' },
      };
      const complianceRequirements = ['company_ice_number', 'company_legal_form', 'company_registration_city'];
      const resolvedPlan = requestedPlanMap[requestedPlan] || null;

      if (!resolvedPlan) {
        res.status(400).json({ error: 'Invalid subscription plan' });
        return;
      }

      const accountType = String(user.user_metadata?.account_type || user.app_metadata?.account_type || '').trim().toLowerCase();
      if (!['business_owner', 'operator', 'business', 'rental_business'].includes(accountType)) {
        res.status(403).json({ error: 'Business owner access required' });
        return;
      }

      const nowIso = new Date().toISOString();
      const existingSubscriptionStatus = normalizeSubscriptionStatus(
        user.user_metadata?.subscription_status ||
        user.app_metadata?.subscription_status ||
        'trial'
      );
      const nextSubscriptionStatus = existingSubscriptionStatus === 'active' ? 'active' : 'trial';
      const nextBillingStatus = existingSubscriptionStatus === 'active'
        ? normalizeBillingStatus(user.user_metadata?.billing_status || user.app_metadata?.billing_status || 'active')
        : 'none';
      const { subscriptionPlan, planType } = resolvedPlan;
      const nextUserMetadata = {
        ...(user.user_metadata || {}),
        subscription_plan: subscriptionPlan,
        subscription_status: nextSubscriptionStatus,
        plan_type: planType,
        billing_status: nextBillingStatus,
        subscription_started_at: existingSubscriptionStatus === 'active'
          ? (user.user_metadata?.subscription_started_at || user.app_metadata?.subscription_started_at || nowIso)
          : (user.user_metadata?.subscription_started_at || user.app_metadata?.subscription_started_at || null),
        activation_pending_compliance: true,
        upgrade_requirements: complianceRequirements,
        selected_plan_at: nowIso,
      };

      const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(user.id, {
        user_metadata: nextUserMetadata,
      });

      if (authUpdateError) {
        throw authUpdateError;
      }

      let profile = null;
      const { data, error } = await adminClient
        .from(APP_USERS_TABLE)
        .update({
          subscription_plan: subscriptionPlan,
          subscription_status: nextSubscriptionStatus,
          plan_type: planType,
          billing_status: nextBillingStatus,
          plan_changed_at: nowIso,
          subscription_started_at: existingSubscriptionStatus === 'active' ? nowIso : null,
          updated_at: nowIso,
        })
        .eq('id', user.id)
        .select('id, subscription_plan, subscription_status, plan_type, billing_status, subscription_started_at, trial_started_at, trial_ends_at, plan_changed_at')
        .single();

      if (error) {
        if (!isSchemaCompatibilityError(error)) {
          throw error;
        }
      } else {
        profile = data || null;
      }

      const { data: businessAccount } = await adminClient
        .from(PLATFORM_BUSINESS_ACCOUNTS_TABLE)
        .select('id')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      if (businessAccount?.id) {
        const subscriptionStatus = normalizeSubscriptionStatus(nextSubscriptionStatus);
        const billingStatus = normalizeBillingStatus(nextBillingStatus);

        await adminClient
          .from(PLATFORM_BUSINESS_SUBSCRIPTIONS_TABLE)
          .upsert(
            {
              business_account_id: businessAccount.id,
              plan_type: normalizePlanType(planType),
              subscription_status: subscriptionStatus,
              billing_status: billingStatus,
              subscription_started_at: subscriptionStatus === 'active' ? nowIso : null,
              plan_limits: getTenantPlanLimits(planType),
              metadata: {
                source: 'self_plan_selection',
                subscription_plan: subscriptionPlan,
                activation_pending_compliance: true,
                upgrade_requirements: complianceRequirements,
                selected_plan_at: nowIso,
              },
            },
            { onConflict: 'business_account_id' }
          );

        const { data: tenantRecord } = await runPlatformTenantSelectWithModeFallback((selectClause) =>
          adminClient
            .from(PLATFORM_TENANTS_TABLE)
            .select(selectClause)
            .eq('business_account_id', businessAccount.id)
            .maybeSingle()
        );

        if (tenantRecord?.id) {
          await adminClient
            .from(PLATFORM_TENANTS_TABLE)
            .update({
              metadata: {
                ...((tenantRecord.metadata && typeof tenantRecord.metadata === 'object')
                  ? tenantRecord.metadata
                  : {}),
                latest_subscription_plan: requestedPlan,
                latest_plan_type: planType,
                activation_source: 'self_plan_selection',
                activation_pending_compliance: true,
                upgrade_requirements: complianceRequirements,
                selected_plan_at: nowIso,
              },
            })
            .eq('id', tenantRecord.id);
        }

        const { data: existingProvisioningJob } = await adminClient
          .from(PLATFORM_TENANT_PROVISIONING_JOBS_TABLE)
          .select('id, job_status')
          .eq('business_account_id', businessAccount.id)
          .eq('job_type', 'create_tenant')
          .in('job_status', ['queued', 'running'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const tenantAlreadyProvisioned = isTenantRecordReadyForCurrentMode(tenantRecord);

        if (!existingProvisioningJob?.id && !tenantAlreadyProvisioned) {
          await adminClient
            .from(PLATFORM_TENANT_PROVISIONING_JOBS_TABLE)
            .insert({
              business_account_id: businessAccount.id,
              tenant_id: tenantRecord?.id || null,
              job_type: 'create_tenant',
              job_status: 'queued',
              payload: {
                source: 'self_plan_selection',
                subscription_plan: subscriptionPlan,
                plan_type: planType,
              },
              result: {},
            });
        }
      }

      const nextUser = {
        ...user,
        user_metadata: nextUserMetadata,
      };

      res.status(200).json({ profile: buildProfileFromAuthUser(nextUser, profile) });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
    return;
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load profile' });
  }
}
