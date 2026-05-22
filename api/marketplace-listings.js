import { APP_USERS_TABLE } from './_lib/supabase.js';
import { authenticateRequest } from './_lib/auth.js';
import { buildThreadKey, SHARED_MESSAGES_TABLE } from './_lib/messages.js';
import {
  applyTenantQueryScope,
  assertUserInTenantScope,
  resolveRequestTenantScope,
  stampTenantPayload,
} from './_lib/sharedTenantIsolation.js';

const VEHICLE_PROFILES_TABLE = 'app_vehicle_public_profiles';
const MARKETPLACE_LISTINGS_TABLE = 'app_marketplace_listings';
const MARKETPLACE_MESSAGES_TABLE = 'app_marketplace_messages';
const MARKETPLACE_MODERATION_HISTORY_TABLE = 'app_marketplace_moderation_history';
const setupErrorCodes = new Set(['42P01', '42501', '42703', '22P02', 'PGRST204', 'PGRST116']);
const optionalListingColumns = new Set([
  'admin_feedback',
  'moderation_status',
  'last_moderated_at',
  'last_moderated_by',
  'changes_requested_at',
  'resubmitted_at',
]);

const json = (res, status, body) => res.status(status).json(body);
const getQueryParam = (req, key) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    return url.searchParams.get(key);
  } catch {
    return null;
  }
};

const parseBody = (body) => {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return typeof body === 'object' ? body : {};
};

const normalizeSuggestions = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split('\n')
      .map((item) => item.replace(/^[\s*-]+/, '').trim())
      .filter(Boolean);
  }

  return [];
};

const safeNumber = (value) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
};

const normalizeStatus = (value, fallback = 'draft') => {
  const normalized = String(value || fallback).trim().toLowerCase();
  const aliases = {
    pending: 'pending_review',
    active: 'live',
    published: 'live',
    hidden: 'unpublished',
    inactive: 'unpublished',
  };

  return aliases[normalized] || normalized;
};

const isSetupError = (error) =>
  setupErrorCodes.has(String(error?.code || ''));

const getMissingSchemaColumn = (error) => {
  const message = String(error?.message || error?.details || '');
  const singleQuoteMatch = message.match(/'([^']+)'\s+column/i);
  if (singleQuoteMatch?.[1]) return singleQuoteMatch[1];
  const doubleQuoteMatch = message.match(/column "([^"]+)"/i);
  return doubleQuoteMatch?.[1] || null;
};

const applyListingUpdates = async (adminClient, listingId, listingUpdates) => {
  let compatibleUpdates = { ...listingUpdates };

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { error } = await adminClient
      .from(MARKETPLACE_LISTINGS_TABLE)
      .update(compatibleUpdates)
      .eq('id', listingId);

    if (!error) {
      return compatibleUpdates;
    }

    const missingColumn = getMissingSchemaColumn(error);
    if (missingColumn && optionalListingColumns.has(missingColumn) && Object.prototype.hasOwnProperty.call(compatibleUpdates, missingColumn)) {
      const { [missingColumn]: _removed, ...nextUpdates } = compatibleUpdates;
      compatibleUpdates = nextUpdates;
      continue;
    }

    throw error;
  }

  throw new Error('Unable to update marketplace listing with the current schema.');
};

const insertOptionalRecord = async (adminClient, table, payload) => {
  if (!payload) return;
  const { error } = await adminClient.from(table).insert(payload);
  if (error && !isSetupError(error)) {
    throw error;
  }
};

const buildSharedMarketplaceOwnerMessagePayload = ({ listing, userId, ownerMessagePayload, tenantScope = null }) => {
  if (!listing?.id || !listing?.owner_id || !userId || !ownerMessagePayload?.body) {
    return null;
  }

  const threadKey = buildThreadKey({
    family: 'marketplace',
    threadType: 'marketplace_moderation',
    entityType: 'listing',
    entityId: listing.id,
    recipientUserId: listing.owner_id,
    senderUserId: userId,
  });

  return stampTenantPayload({
    thread_key: threadKey,
    family: 'marketplace',
    thread_type: 'marketplace_moderation',
    entity_type: 'listing',
    entity_id: String(listing.id),
    message_type: String(ownerMessagePayload.message_type || 'note').trim().toLowerCase(),
    subject: String(listing.title || 'Marketplace listing review').trim() || 'Marketplace listing review',
    body: String(ownerMessagePayload.body || '').trim(),
    sender_user_id: userId,
    sender_role: 'admin',
    recipient_user_id: String(listing.owner_id),
    recipient_role: 'owner',
    metadata: {
      listingId: listing.id,
      vehiclePublicProfileId: listing.vehicle_public_profile_id || null,
      href: listing.vehicle_public_profile_id
        ? `/account/marketplace/vehicles/${encodeURIComponent(String(listing.vehicle_public_profile_id))}/profile?tab=listings`
        : '/account/marketplace',
      adminHref: `/admin/marketplace/${encodeURIComponent(String(listing.id))}`,
      source: 'marketplace_moderation',
      action: ownerMessagePayload?.metadata?.action || ownerMessagePayload?.message_type || 'message_owner',
    },
    status: 'sent',
  }, tenantScope);
};

const loadOptionalQuery = async (factory, fallbackValue) => {
  try {
    const result = await factory();
    if (result?.error) {
      if (isSetupError(result.error)) return fallbackValue;
      throw result.error;
    }
    return result?.data ?? fallbackValue;
  } catch (error) {
    if (isSetupError(error)) return fallbackValue;
    throw error;
  }
};

const loadOptionalCount = async (factory, fallbackValue = 0) => {
  try {
    const result = await factory();
    if (result?.error) {
      if (isSetupError(result.error)) return fallbackValue;
      throw result.error;
    }
    return result?.count ?? fallbackValue;
  } catch (error) {
    if (isSetupError(error)) return fallbackValue;
    throw error;
  }
};

const loadCanonicalAppUserProfile = async (adminClient, ownerReference) => {
  const normalizedOwnerReference = String(ownerReference || '').trim();
  if (!normalizedOwnerReference) return null;

  const directProfile = await loadOptionalQuery(
    () =>
      adminClient
        .from(APP_USERS_TABLE)
        .select('*')
        .eq('id', normalizedOwnerReference)
        .maybeSingle(),
    null
  );
  if (directProfile) return directProfile;

  const linkedProfiles = await loadOptionalQuery(
    () =>
      adminClient
        .from(APP_USERS_TABLE)
        .select('*')
        .eq('owner_id', normalizedOwnerReference)
        .limit(1),
    []
  );

  return Array.isArray(linkedProfiles) ? linkedProfiles[0] || null : null;
};

const loadAuthUserById = async (adminClient, userId) => {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return null;

  try {
    const response = await adminClient.auth.admin.getUserById(normalizedUserId);
    return response?.data?.user || null;
  } catch (error) {
    if (!isSetupError(error)) {
      return null;
    }
    return null;
  }
};

const resolveCanonicalOwnerUserId = async (adminClient, listing = {}, profile = null) => {
  const candidateIds = [
    String(listing?.owner_id || '').trim(),
    String(profile?.owner_id || '').trim(),
  ].filter(Boolean);

  for (const candidateId of candidateIds) {
    const authUser = await loadAuthUserById(adminClient, candidateId);
    if (authUser?.id) {
      return String(authUser.id).trim();
    }

    const appUserProfile = await loadCanonicalAppUserProfile(adminClient, candidateId);
    const fallbackOwnerId = String(appUserProfile?.owner_id || '').trim();
    if (!fallbackOwnerId) continue;

    const fallbackAuthUser = await loadAuthUserById(adminClient, fallbackOwnerId);
    if (fallbackAuthUser?.id) {
      return String(fallbackAuthUser.id).trim();
    }
  }

  return '';
};

const loadListingsSnapshot = async (adminClient) => {
  let query = adminClient
    .from(MARKETPLACE_LISTINGS_TABLE)
    .select('*');

  let response = await query.order('updated_at', { ascending: false });
  if (response.error && String(response.error.code || '') === '42703') {
    response = await query.order('created_at', { ascending: false });
  }

  return response;
};

const requireMarketplaceAdmin = async (auth) => {
  const { user, adminClient } = auth;
  const { data: profile } = await adminClient
    .from(APP_USERS_TABLE)
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  const role = normalizeStatus(profile?.role || user.user_metadata?.role || user.app_metadata?.role || 'customer', 'customer');

  if (!['owner', 'admin'].includes(role)) {
    return {
      error: { status: 403, body: { error: 'Marketplace admin access required' } },
    };
  }

  return { role };
};

const normalizeListingRow = (listing = {}, profile = {}, latestMessage = null) => {
  const title =
    listing.title ||
    [profile.brand_name, profile.model_name].filter(Boolean).join(' ') ||
    profile.short_description ||
    'Marketplace listing';
  const listingStatus = normalizeStatus(listing.listing_status || listing.status, 'draft');
  const ownerType = normalizeStatus(listing.owner_type || profile.owner_type, 'individual_owner');
  const marketplaceVisible = listingStatus === 'live' && profile.marketplace_visible !== false && profile.is_active !== false;

  return {
    id: String(listing.id),
    vehiclePublicProfileId: listing.vehicle_public_profile_id,
    ownerId: listing.owner_id,
    ownerType,
    listingStatus,
    reviewStatus: normalizeStatus(listing.review_status, 'not_submitted'),
    bookingMode: listing.booking_mode || 'request',
    marketplaceVisible,
    title,
    brandName: profile.brand_name || '',
    modelName: profile.model_name || '',
    cityName: profile.city_name || '',
    areaName: profile.area_name || '',
    ownerDisplayName: profile.owner_display_name || '',
    shortDescription: profile.short_description || '',
    coverImageUrl: profile.cover_image_url || '',
    latestOwnerMessage: latestMessage?.body || '',
    latestOwnerMessageAt: latestMessage?.created_at || null,
    latestOwnerMessageType: latestMessage?.message_type || 'message',
    price:
      safeNumber(listing.hourly_price_amount) ||
      safeNumber(listing.daily_price_amount) ||
      safeNumber(listing.weekly_price_amount),
    hourlyPriceAmount: safeNumber(listing.hourly_price_amount),
    dailyPriceAmount: safeNumber(listing.daily_price_amount),
    weeklyPriceAmount: safeNumber(listing.weekly_price_amount),
    depositAmount: safeNumber(listing.deposit_amount || profile.deposit_amount),
    currencyCode: listing.currency_code || 'MAD',
    adminNotes: listing.admin_notes || '',
    adminFeedback: listing.admin_feedback || '',
    moderationStatus: normalizeStatus(listing.moderation_status, 'not_reviewed'),
    rejectionReason: listing.rejection_reason || '',
    submittedAt: listing.submitted_at || null,
    reviewedAt: listing.reviewed_at || null,
    publishedAt: listing.published_at || null,
    updatedAt: listing.updated_at || listing.created_at || null,
  };
};

const buildListingDetail = (listing = {}, profile = {}) => ({
  id: String(listing.id),
  vehiclePublicProfileId: listing.vehicle_public_profile_id || null,
  ownerId: listing.owner_id || null,
  ownerType: normalizeStatus(listing.owner_type || profile.owner_type, 'individual_owner'),
  listingStatus: normalizeStatus(listing.listing_status || listing.status, 'draft'),
  reviewStatus: normalizeStatus(listing.review_status, 'not_submitted'),
  bookingMode: listing.booking_mode || 'request',
  title: listing.title || [profile.brand_name, profile.model_name].filter(Boolean).join(' ') || 'Marketplace listing',
  adminNotes: listing.admin_notes || '',
  adminFeedback: listing.admin_feedback || '',
  moderationStatus: normalizeStatus(listing.moderation_status, 'not_reviewed'),
  rejectionReason: listing.rejection_reason || '',
  submittedAt: listing.submitted_at || null,
  reviewedAt: listing.reviewed_at || null,
  publishedAt: listing.published_at || null,
  unpublishedAt: listing.unpublished_at || null,
  changesRequestedAt: listing.changes_requested_at || null,
  resubmittedAt: listing.resubmitted_at || null,
  lastModeratedAt: listing.last_moderated_at || listing.reviewed_at || null,
  lastModeratedBy: listing.last_moderated_by || listing.reviewed_by || null,
  currencyCode: listing.currency_code || 'MAD',
  hourlyPriceAmount: safeNumber(listing.hourly_price_amount),
  dailyPriceAmount: safeNumber(listing.daily_price_amount),
  weeklyPriceAmount: safeNumber(listing.weekly_price_amount),
  depositAmount: safeNumber(listing.deposit_amount || profile.deposit_amount),
  includedKm: listing.included_km ?? profile.mileage_limit_km ?? null,
  extraKmRate: safeNumber(listing.extra_km_rate || profile.extra_km_rate),
  ownerDisplayName: profile.owner_display_name || '',
  brandName: profile.brand_name || '',
  modelName: profile.model_name || '',
  categoryCode: profile.category_code || 'atv',
  year: profile.year || null,
  plateNumber: profile.plate_number || '',
  cityName: profile.city_name || '',
  countryName: profile.country_name || '',
  areaName: profile.area_name || '',
  shortDescription: profile.short_description || '',
  fullDescription: profile.full_description || '',
  seats: profile.seats || null,
  engineCc: profile.engine_cc || null,
  transmission: profile.transmission || '',
  fuelPolicy: profile.fuel_policy || '',
  availability: profile.availability || {},
  specs: profile.specs || {},
  media: Array.isArray(profile.media) ? profile.media : [],
  coverImageUrl: profile.cover_image_url || '',
  marketplaceVisible: profile.marketplace_visible !== false,
  isActive: profile.is_active !== false,
  createdAt: listing.created_at || profile.created_at || null,
  updatedAt: listing.updated_at || profile.updated_at || profile.created_at || null,
});

const getListingDetail = async (adminClient, listingId, tenantScope = null) => {
  let listingQuery = adminClient
    .from(MARKETPLACE_LISTINGS_TABLE)
    .select('*')
    .eq('id', listingId);

  listingQuery = applyTenantQueryScope(listingQuery, tenantScope);

  const { data: listing, error: listingError } = await listingQuery.single();

  if (listingError) throw listingError;

  let profile = {};
  if (listing?.vehicle_public_profile_id) {
    const { data: profileRow, error: profileError } = await adminClient
      .from(VEHICLE_PROFILES_TABLE)
      .select('*')
      .eq('id', listing.vehicle_public_profile_id)
      .single();

    if (profileError) throw profileError;
    profile = profileRow || {};
  }

  const resolvedOwnerUserId = await resolveCanonicalOwnerUserId(adminClient, listing, profile);
  const ownerReferenceId = resolvedOwnerUserId || String(listing?.owner_id || '').trim();

  let ownerProfile = null;
  let ownerAuthUser = null;
  let totalListings = 0;
  let liveListings = 0;
  let moderationHistory = [];
  let messages = [];

  if (ownerReferenceId) {
    ownerProfile = await loadCanonicalAppUserProfile(adminClient, ownerReferenceId);

    totalListings = await loadOptionalCount(
      () => {
        let query = adminClient
          .from(MARKETPLACE_LISTINGS_TABLE)
          .select('id', { count: 'exact', head: true })
          .eq('owner_id', ownerReferenceId);
        query = applyTenantQueryScope(query, tenantScope);
        return query;
      },
      0
    );

    liveListings = await loadOptionalCount(
      () => {
        let query = adminClient
          .from(MARKETPLACE_LISTINGS_TABLE)
          .select('id', { count: 'exact', head: true })
          .eq('owner_id', ownerReferenceId)
          .eq('listing_status', 'live');
        query = applyTenantQueryScope(query, tenantScope);
        return query;
      },
      0
    );

    moderationHistory = await loadOptionalQuery(
      () =>
        adminClient
          .from(MARKETPLACE_MODERATION_HISTORY_TABLE)
          .select('*')
          .eq('listing_id', listing.id)
          .order('created_at', { ascending: false }),
      []
    );

    messages = await loadOptionalQuery(
      () =>
        adminClient
          .from(MARKETPLACE_MESSAGES_TABLE)
          .select('*')
          .eq('listing_id', listing.id)
          .order('created_at', { ascending: false }),
      []
    );

    ownerAuthUser = await loadAuthUserById(adminClient, ownerReferenceId);
  }

  return {
    ...buildListingDetail(listing, profile),
    owner: {
      id: ownerReferenceId || null,
      email: ownerProfile?.email || ownerAuthUser?.email || '',
      phone: ownerProfile?.phone_number || ownerAuthUser?.phone || ownerAuthUser?.user_metadata?.phone || '',
      fullName:
        ownerProfile?.full_name ||
        ownerAuthUser?.user_metadata?.full_name ||
        ownerAuthUser?.user_metadata?.name ||
        profile.owner_display_name ||
        '',
      accountType:
        ownerAuthUser?.user_metadata?.account_type ||
        profile.owner_type ||
        listing.owner_type ||
        'individual_owner',
      companyName:
        ownerAuthUser?.user_metadata?.company_name ||
        profile.owner_display_name ||
        '',
      joinDate: ownerProfile?.created_at || ownerAuthUser?.created_at || null,
      totalListings,
      liveListings,
    },
    moderationHistory: moderationHistory.map((entry) => ({
      id: entry.id,
      actionType: entry.action_type || 'message_sent',
      statusBefore: normalizeStatus(entry.status_before, ''),
      statusAfter: normalizeStatus(entry.status_after, ''),
      reason: entry.reason || '',
      feedback: entry.feedback || '',
      suggestions: Array.isArray(entry.suggestions) ? entry.suggestions : [],
      createdAt: entry.created_at || null,
      adminId: entry.admin_id || null,
      sendToOwner: entry.send_to_owner !== false,
    })),
    messages: messages.map((message) => ({
      id: message.id,
      senderId: message.sender_id || null,
      senderType: message.sender_type || 'admin',
      messageType: message.message_type || 'message',
      body: message.body || '',
      createdAt: message.created_at || null,
      isInternal: Boolean(message.is_internal),
      metadata: message.metadata || {},
    })),
  };
};

const getSnapshot = async (adminClient, tenantScope = null) => {
  let listingsQuery = adminClient
    .from(MARKETPLACE_LISTINGS_TABLE)
    .select('*');

  listingsQuery = applyTenantQueryScope(listingsQuery, tenantScope);

  let response = await listingsQuery.order('updated_at', { ascending: false });
  if (response.error && String(response.error.code || '') === '42703') {
    response = await listingsQuery.order('created_at', { ascending: false });
  }

  const { data: listings, error: listingError } = response;

  if (listingError) throw listingError;

  const profileIds = [...new Set((listings || []).map((row) => row.vehicle_public_profile_id).filter(Boolean))];
  const listingIds = [...new Set((listings || []).map((row) => row.id).filter(Boolean))];
  let profilesById = new Map();
  let latestMessagesByListingId = new Map();

  if (profileIds.length > 0) {
    const profiles = await loadOptionalQuery(
      () =>
        adminClient
          .from(VEHICLE_PROFILES_TABLE)
          .select('*')
          .in('id', profileIds),
      []
    );

    profilesById = new Map((profiles || []).map((row) => [String(row.id), row]));
  }

  if (listingIds.length > 0) {
    const messages = await loadOptionalQuery(
      () =>
        adminClient
          .from(MARKETPLACE_MESSAGES_TABLE)
          .select('*')
          .in('listing_id', listingIds)
          .order('created_at', { ascending: false }),
      []
    );

    for (const row of messages || []) {
      const key = String(row?.listing_id || '');
      if (key && !latestMessagesByListingId.has(key)) {
        latestMessagesByListingId.set(key, row);
      }
    }
  }

  const rows = (listings || []).map((listing) =>
    normalizeListingRow(
      listing,
      profilesById.get(String(listing.vehicle_public_profile_id)) || {},
      latestMessagesByListingId.get(String(listing.id)) || null
    )
  );
  const groupedByStatus = rows.reduce((acc, row) => {
    acc[row.listingStatus] = (acc[row.listingStatus] || 0) + 1;
    return acc;
  }, {});
  const groupedByOwnerType = rows.reduce((acc, row) => {
    acc[row.ownerType] = (acc[row.ownerType] || 0) + 1;
    return acc;
  }, {});

  return {
    totalListings: rows.length,
    activeListings: rows.filter((row) => row.marketplaceVisible).length,
    pendingReviewListings: (groupedByStatus.pending_review || 0) + (groupedByStatus.pending || 0),
    draftListings: groupedByStatus.draft || 0,
    operatorListings: groupedByOwnerType.operator || 0,
    ownerListings: (groupedByOwnerType.individual_owner || 0) + (groupedByOwnerType.owner || 0),
    reviewQueue: rows.filter((row) => ['pending_review', 'pending', 'draft', 'rejected', 'approved'].includes(row.listingStatus)),
    liveRows: rows.filter((row) => row.marketplaceVisible),
    rows,
  };
};

const updateListingStatus = async ({
  adminClient,
  tenantScope,
  userId,
  listingId,
  action,
  reason,
  feedback,
  suggestions,
  sendToOwner,
  messageBody,
}) => {
  let loadQuery = adminClient
    .from(MARKETPLACE_LISTINGS_TABLE)
    .select('*')
    .eq('id', listingId);

  loadQuery = applyTenantQueryScope(loadQuery, tenantScope);

  const { data: listing, error: loadError } = await loadQuery.single();

  if (loadError) throw loadError;

  const now = new Date().toISOString();
  const listingUpdates = {};
  const profileUpdates = {};
  const normalizedReason = String(reason || '').trim();
  const normalizedFeedback = String(feedback || '').trim();
  const normalizedMessageBody = String(messageBody || '').trim();
  const normalizedSuggestions = normalizeSuggestions(suggestions);
  const actionType = normalizeStatus(action, '');
  const previousStatus = normalizeStatus(listing.listing_status || 'draft', 'draft');
  const shouldSendToOwner = sendToOwner !== false;
  const resolvedOwnerUserId = await resolveCanonicalOwnerUserId(adminClient, listing);
  let historyPayload = null;
  let ownerMessagePayload = null;

  if (!resolvedOwnerUserId) {
    const error = new Error('Unable to resolve the canonical marketplace owner account for this listing.');
    error.status = 409;
    throw error;
  }

  if (String(listing.owner_id || '').trim() !== resolvedOwnerUserId) {
    listingUpdates.owner_id = resolvedOwnerUserId;
    listing.owner_id = resolvedOwnerUserId;
  }

  if (actionType === 'approve') {
    Object.assign(listingUpdates, {
      listing_status: 'approved',
      review_status: 'approved',
      moderation_status: 'approved',
      reviewed_at: now,
      reviewed_by: userId,
      last_moderated_at: now,
      last_moderated_by: userId,
      admin_feedback: normalizedFeedback || null,
      rejection_reason: null,
    });
    historyPayload = {
      listing_id: listing.id,
      vehicle_public_profile_id: listing.vehicle_public_profile_id,
      owner_id: resolvedOwnerUserId,
      admin_id: userId,
      action_type: 'approved',
      status_before: previousStatus,
      status_after: 'approved',
      feedback: normalizedFeedback || null,
      suggestions: normalizedSuggestions,
      send_to_owner: shouldSendToOwner,
    };
    if (shouldSendToOwner) {
      ownerMessagePayload = {
        listing_id: listing.id,
        owner_id: resolvedOwnerUserId,
        sender_id: userId,
        sender_type: 'admin',
        message_type: 'approval',
        body: normalizedFeedback || 'Your listing was approved. You can publish it when ready.',
        metadata: { action: 'approve' },
      };
    }
  } else if (actionType === 'request_changes') {
    Object.assign(listingUpdates, {
      listing_status: 'pending_review',
      review_status: 'pending',
      moderation_status: 'changes_requested',
      reviewed_at: now,
      reviewed_by: userId,
      last_moderated_at: now,
      last_moderated_by: userId,
      changes_requested_at: now,
      admin_feedback: normalizedFeedback || normalizedReason || null,
      rejection_reason: null,
    });
    historyPayload = {
      listing_id: listing.id,
      vehicle_public_profile_id: listing.vehicle_public_profile_id,
      owner_id: resolvedOwnerUserId,
      admin_id: userId,
      action_type: 'changes_requested',
      status_before: previousStatus,
      status_after: 'pending_review',
      reason: normalizedReason || null,
      feedback: normalizedFeedback || null,
      suggestions: normalizedSuggestions,
      send_to_owner: shouldSendToOwner,
    };
    if (shouldSendToOwner) {
      ownerMessagePayload = {
        listing_id: listing.id,
        owner_id: resolvedOwnerUserId,
        sender_id: userId,
        sender_type: 'admin',
        message_type: 'changes_requested',
        body:
          normalizedMessageBody ||
          normalizedFeedback ||
          normalizedReason ||
          'Changes were requested. Review this thread, update the listing, then send it again.',
        metadata: {
          action: 'request_changes',
          reason: normalizedReason || null,
          suggestions: normalizedSuggestions,
        },
      };
    }
  } else if (actionType === 'reject') {
    Object.assign(listingUpdates, {
      listing_status: 'rejected',
      review_status: 'rejected',
      moderation_status: 'rejected',
      reviewed_at: now,
      reviewed_by: userId,
      last_moderated_at: now,
      last_moderated_by: userId,
      admin_feedback: normalizedFeedback || normalizedReason || null,
      rejection_reason: normalizedReason || 'Rejected by admin',
    });
    Object.assign(profileUpdates, { marketplace_visible: false });
    historyPayload = {
      listing_id: listing.id,
      vehicle_public_profile_id: listing.vehicle_public_profile_id,
      owner_id: resolvedOwnerUserId,
      admin_id: userId,
      action_type: 'rejected',
      status_before: previousStatus,
      status_after: 'rejected',
      reason: normalizedReason || 'Rejected by admin',
      feedback: normalizedFeedback || null,
      suggestions: normalizedSuggestions,
      send_to_owner: shouldSendToOwner,
    };
    if (shouldSendToOwner) {
      ownerMessagePayload = {
        listing_id: listing.id,
        owner_id: resolvedOwnerUserId,
        sender_id: userId,
        sender_type: 'admin',
        message_type: 'rejection',
        body: normalizedMessageBody || normalizedFeedback || normalizedReason || 'Rejected by admin',
        metadata: {
          action: 'reject',
          reason: normalizedReason || 'Rejected by admin',
          suggestions: normalizedSuggestions,
        },
      };
    }
  } else if (actionType === 'publish') {
    Object.assign(listingUpdates, {
      listing_status: 'live',
      review_status: 'approved',
      moderation_status: 'approved',
      reviewed_at: listing.reviewed_at || now,
      reviewed_by: listing.reviewed_by || userId,
      last_moderated_at: now,
      last_moderated_by: userId,
      published_at: now,
      unpublished_at: null,
      rejection_reason: null,
    });
    Object.assign(profileUpdates, { marketplace_visible: true, is_active: true });
    historyPayload = {
      listing_id: listing.id,
      vehicle_public_profile_id: listing.vehicle_public_profile_id,
      owner_id: resolvedOwnerUserId,
      admin_id: userId,
      action_type: 'published',
      status_before: previousStatus,
      status_after: 'live',
      feedback: normalizedFeedback || null,
      suggestions: normalizedSuggestions,
      send_to_owner: shouldSendToOwner,
    };
    if (shouldSendToOwner) {
      ownerMessagePayload = {
        listing_id: listing.id,
        owner_id: resolvedOwnerUserId,
        sender_id: userId,
        sender_type: 'admin',
        message_type: 'publish_notice',
        body: normalizedFeedback || 'Your listing is now live on the marketplace.',
        metadata: { action: 'publish' },
      };
    }
  } else if (actionType === 'unpublish') {
    Object.assign(listingUpdates, {
      listing_status: 'unpublished',
      last_moderated_at: now,
      last_moderated_by: userId,
      unpublished_at: now,
    });
    Object.assign(profileUpdates, { marketplace_visible: false });
    historyPayload = {
      listing_id: listing.id,
      vehicle_public_profile_id: listing.vehicle_public_profile_id,
      owner_id: resolvedOwnerUserId,
      admin_id: userId,
      action_type: 'unpublished',
      status_before: previousStatus,
      status_after: 'unpublished',
      feedback: normalizedFeedback || null,
      suggestions: normalizedSuggestions,
      send_to_owner: shouldSendToOwner,
    };
  } else if (actionType === 'message_owner') {
    historyPayload = {
      listing_id: listing.id,
      vehicle_public_profile_id: listing.vehicle_public_profile_id,
      owner_id: resolvedOwnerUserId,
      admin_id: userId,
      action_type: 'message_sent',
      status_before: previousStatus,
      status_after: previousStatus,
      feedback: normalizedFeedback || normalizedMessageBody || null,
      suggestions: normalizedSuggestions,
      send_to_owner: shouldSendToOwner,
    };
    if (shouldSendToOwner && (normalizedMessageBody || normalizedFeedback)) {
      ownerMessagePayload = {
        listing_id: listing.id,
        owner_id: resolvedOwnerUserId,
        sender_id: userId,
        sender_type: 'admin',
        message_type: 'message',
        body: normalizedMessageBody || normalizedFeedback,
        metadata: {
          action: 'message_owner',
          suggestions: normalizedSuggestions,
        },
      };
    }
  } else {
    const error = new Error('Unsupported marketplace action');
    error.status = 400;
    throw error;
  }

  if (Object.keys(listingUpdates).length > 0) {
    await applyListingUpdates(adminClient, listingId, listingUpdates);
  }

  if (Object.keys(profileUpdates).length > 0) {
    const { error: profileError } = await adminClient
      .from(VEHICLE_PROFILES_TABLE)
      .update(profileUpdates)
      .eq('id', listing.vehicle_public_profile_id);

    if (profileError) throw profileError;
  }

  await insertOptionalRecord(adminClient, MARKETPLACE_MODERATION_HISTORY_TABLE, historyPayload);
  if (ownerMessagePayload) {
    await insertOptionalRecord(adminClient, MARKETPLACE_MESSAGES_TABLE, ownerMessagePayload);
    await insertOptionalRecord(
      adminClient,
      SHARED_MESSAGES_TABLE,
      buildSharedMarketplaceOwnerMessagePayload({
        listing,
        userId,
        ownerMessagePayload,
        tenantScope,
      })
    );
  }
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (!['GET', 'PATCH'].includes(req.method)) {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const auth = await authenticateRequest(req);
  if (auth.error) {
    return json(res, auth.error.status, auth.error.body);
  }

  const adminCheck = await requireMarketplaceAdmin(auth);
  if (adminCheck.error) {
    return json(res, adminCheck.error.status, adminCheck.error.body);
  }

  const { adminClient, user } = auth;
  const tenantScope = await resolveRequestTenantScope({ req, adminClient });

  try {
    const canAccessTenantScope = await assertUserInTenantScope({
      adminClient,
      userId: user.id,
      tenantScope,
    });

    if (tenantScope?.isShared && !canAccessTenantScope) {
      return json(res, 403, { error: 'Tenant scope access required' });
    }

    if (req.method === 'GET') {
      const listingId = String(getQueryParam(req, 'listingId') || '').trim();
      if (listingId) {
        const detail = await getListingDetail(adminClient, listingId, tenantScope);
        return json(res, 200, { success: true, detail });
      }
    }

    if (req.method === 'PATCH') {
      const body = parseBody(req.body);
      const listingId = String(body.listingId || '').trim();
      const action = normalizeStatus(body.action, '');

      if (!listingId) {
        return json(res, 400, { error: 'listingId is required' });
      }

      await updateListingStatus({
        adminClient,
        tenantScope,
        userId: user.id,
        listingId,
        action,
        reason: body.reason,
        feedback: body.feedback,
        suggestions: body.suggestions,
        sendToOwner: body.sendToOwner,
        messageBody: body.messageBody,
      });
    }

    const snapshot = await getSnapshot(adminClient, tenantScope);
    return json(res, 200, { success: true, snapshot });
  } catch (error) {
    console.error('Marketplace listings API failed:', {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
      status: error?.status,
    });
    if (isSetupError(error)) {
      return json(res, 200, {
        success: true,
        setupRequired: true,
        snapshot: {
          totalListings: 0,
          activeListings: 0,
          pendingReviewListings: 0,
          draftListings: 0,
          operatorListings: 0,
          ownerListings: 0,
          reviewQueue: [],
          liveRows: [],
          rows: [],
        },
      });
    }
    return json(res, error.status || 500, { error: error.message || 'Unable to load marketplace listings' });
  }
}
