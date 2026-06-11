import { authenticateRequest } from './_lib/auth.js';
import { APP_USERS_TABLE, createSupabaseClients } from './_lib/supabase.js';
import {
  applyTenantQueryScope,
  assertUserInTenantScope,
  resolveRequestTenantScope,
  stampTenantPayload,
} from './_lib/sharedTenantIsolation.js';
import { buildDefaultPermissionsForRole, normalizePermissionMap } from '../src/utils/permissionCatalog.js';

const REVIEWS_TABLE = 'app_rental_reviews';
const RENTAL_EXECUTION_RECORDS_TABLE = 'app_4c3a7a6153_rental_execution_records';
const RENTALS_TABLE = 'app_4c3a7a6153_rentals';
const BOOKING_REQUESTS_TABLE = 'app_booking_requests';
const MARKETPLACE_LISTINGS_TABLE = 'app_marketplace_listings';
const VEHICLE_PROFILES_TABLE = 'app_vehicle_public_profiles';

const json = (res, status, body) => res.status(status).json(body);

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

const normalizeText = (value) => String(value || '').trim();
const normalizeNullableText = (value) => {
  const normalized = normalizeText(value);
  return normalized || null;
};
const normalizeRole = (value) => normalizeText(value).toLowerCase();
const safeNumber = (value) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
};
const safeBoolean = (value) => value === true;

const loadActorAccessProfile = async ({ adminClient, userId }) => {
  const { data, error } = await adminClient
    .from(APP_USERS_TABLE)
    .select('id, role, permissions, primary_organization_id')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;

  const role = normalizeRole(data?.role);
  const mergedPermissions = {
    ...buildDefaultPermissionsForRole(role),
    ...normalizePermissionMap(data?.permissions),
  };

  return {
    id: data?.id || userId,
    role,
    permissions: mergedPermissions,
    primaryOrganizationId: data?.primary_organization_id || null,
  };
};

const canModerateReviews = ({ profile }) => {
  if (!profile) return false;
  if (['owner', 'admin'].includes(profile.role)) return true;

  return (
    safeBoolean(profile.permissions?.['Marketplace Review']) ||
    safeBoolean(profile.permissions?.['Customer Management']) ||
    safeBoolean(profile.permissions?.['User & Role Management'])
  );
};

const buildRolePairForUser = ({ userId, ownerUserId, customerUserId }) => {
  const normalizedUserId = normalizeText(userId);
  const normalizedOwnerUserId = normalizeText(ownerUserId);
  const normalizedCustomerUserId = normalizeText(customerUserId);

  if (normalizedUserId && normalizedUserId === normalizedOwnerUserId && normalizedCustomerUserId) {
    return {
      reviewerRole: 'owner',
      revieweeRole: 'customer',
      revieweeUserId: normalizedCustomerUserId,
    };
  }

  if (normalizedUserId && normalizedUserId === normalizedCustomerUserId && normalizedOwnerUserId) {
    return {
      reviewerRole: 'customer',
      revieweeRole: 'owner',
      revieweeUserId: normalizedOwnerUserId,
    };
  }

  return null;
};

const loadReviewContext = async ({ adminClient, tenantScope, rentalId, marketplaceRequestId = null }) => {
  let query = adminClient
    .from(RENTAL_EXECUTION_RECORDS_TABLE)
    .select(`
      id,
      organization_id,
      marketplace_request_id,
      rental_id,
      owner_user_id,
      customer_user_id,
      completed_at,
      execution_stage,
      rental:${RENTALS_TABLE}!app_4c3a7a6153_rental_execution_records_rental_id_fkey(
        id,
        rental_id,
        linked_display_id,
        rental_status,
        status,
        completed_at,
        rental_completed_at,
        customer_name,
        vehicle_id
      ),
      request:${BOOKING_REQUESTS_TABLE}!app_4c3a7a6153_rental_execution_records_marketplace_request_id_fkey(
        id,
        owner_id,
        customer_id,
        customer_name,
        listing_id,
        vehicle_public_profile_id
      )
    `)
    .eq('rental_id', rentalId)
    .limit(1);

  query = applyTenantQueryScope(query, tenantScope);

  if (marketplaceRequestId) {
    query = query.eq('marketplace_request_id', marketplaceRequestId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;

  if (!data) return null;

  const rental = data.rental || {};
  const request = data.request || {};
  const ownerUserId = normalizeText(request.owner_id || data.owner_user_id);
  const customerUserId = normalizeText(request.customer_id || data.customer_user_id);
  const completedAt = data.completed_at || rental.completed_at || rental.rental_completed_at || null;
  const rentalStatus = normalizeRole(rental.rental_status || rental.status);

  return {
    organizationId: data.organization_id || null,
    marketplaceRequestId: data.marketplace_request_id || request.id || null,
    rentalId: data.rental_id || rental.id || rentalId,
    ownerUserId: ownerUserId || null,
    customerUserId: customerUserId || null,
    listingId: request.listing_id || null,
    vehiclePublicProfileId: request.vehicle_public_profile_id || null,
    completedAt,
    isCompleted: Boolean(completedAt) || rentalStatus === 'completed',
    executionStage: normalizeRole(data.execution_stage),
    rentalLabel: normalizeText(rental.rental_id || rental.linked_display_id || rental.id),
    customerName: normalizeText(request.customer_name || rental.customer_name),
    raw: data,
  };
};

const loadExistingReview = async ({
  adminClient,
  tenantScope,
  rentalId,
  reviewerUserId,
  revieweeUserId,
}) => {
  let query = adminClient
    .from(REVIEWS_TABLE)
    .select('id, rental_id, reviewer_user_id, reviewee_user_id, rating, review_status, visibility, created_at')
    .eq('rental_id', rentalId)
    .eq('reviewer_user_id', reviewerUserId)
    .eq('reviewee_user_id', revieweeUserId)
    .limit(1);

  query = applyTenantQueryScope(query, tenantScope);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data || null;
};

const buildPendingReviewTask = async ({ adminClient, tenantScope, executionRow, currentUserId }) => {
  const ctx = await loadReviewContext({
    adminClient,
    tenantScope,
    rentalId: executionRow.rental_id,
    marketplaceRequestId: executionRow.marketplace_request_id || null,
  });

  if (!ctx?.isCompleted) return null;

  const pair = buildRolePairForUser({
    userId: currentUserId,
    ownerUserId: ctx.ownerUserId,
    customerUserId: ctx.customerUserId,
  });

  if (!pair) return null;

  const existing = await loadExistingReview({
    adminClient,
    tenantScope,
    rentalId: ctx.rentalId,
    reviewerUserId: currentUserId,
    revieweeUserId: pair.revieweeUserId,
  });

  if (existing) return null;

  return {
    rentalId: ctx.rentalId,
    marketplaceRequestId: ctx.marketplaceRequestId,
    listingId: ctx.listingId,
    vehiclePublicProfileId: ctx.vehiclePublicProfileId,
    reviewerRole: pair.reviewerRole,
    revieweeRole: pair.revieweeRole,
    revieweeUserId: pair.revieweeUserId,
    completedAt: ctx.completedAt,
    executionStage: ctx.executionStage,
    rentalLabel: ctx.rentalLabel,
    customerName: ctx.customerName || null,
  };
};

const handlePending = async ({ req, res, adminClient, user, tenantScope }) => {
  let query = adminClient
    .from(RENTAL_EXECUTION_RECORDS_TABLE)
    .select('organization_id, marketplace_request_id, rental_id, owner_user_id, customer_user_id, completed_at, execution_stage')
    .or(`owner_user_id.eq.${user.id},customer_user_id.eq.${user.id}`)
    .order('completed_at', { ascending: false, nullsFirst: false })
    .limit(100);

  query = applyTenantQueryScope(query, tenantScope);

  const { data, error } = await query;
  if (error) {
    return json(res, 500, { error: error.message || 'Failed to load pending reviews' });
  }

  const tasks = [];
  for (const row of data || []) {
    const task = await buildPendingReviewTask({
      adminClient,
      tenantScope,
      executionRow: row,
      currentUserId: user.id,
    });
    if (task) tasks.push(task);
  }

  return json(res, 200, {
    tasks,
    count: tasks.length,
  });
};

const handleOwnerSummary = async ({ req, res, adminClient, tenantScope }) => {
  const ownerUserId = normalizeText(req.query?.ownerUserId || req.query?.revieweeUserId);
  const listingId = normalizeNullableText(req.query?.listingId);
  const limit = Math.max(1, Math.min(20, Number(req.query?.limit || 5) || 5));

  if (!ownerUserId) {
    return json(res, 400, { error: 'ownerUserId is required' });
  }

  let query = adminClient
    .from(REVIEWS_TABLE)
    .select('id, rental_id, listing_id, reviewer_user_id, rating, comment, created_at, published_at, review_status, visibility')
    .eq('reviewee_user_id', ownerUserId)
    .eq('reviewee_role', 'owner')
    .eq('review_status', 'published')
    .eq('visibility', 'public')
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(200);

  query = applyTenantQueryScope(query, tenantScope);

  if (listingId) {
    query = query.eq('listing_id', listingId);
  }

  const { data, error } = await query;
  if (error) {
    return json(res, 500, { error: error.message || 'Failed to load owner review summary' });
  }

  const rows = data || [];
  const ratings = rows.map((row) => safeNumber(row.rating)).filter((value) => value !== null);
  const totalReviews = ratings.length;
  const averageRating = totalReviews
    ? Number((ratings.reduce((sum, rating) => sum + rating, 0) / totalReviews).toFixed(2))
    : 0;

  return json(res, 200, {
    ownerUserId,
    listingId,
    averageRating,
    totalReviews,
    recentReviews: rows.slice(0, limit),
  });
};

const loadReviewRows = async ({
  adminClient,
  tenantScope,
  filters = {},
  limit = 100,
  select = `
    id,
    organization_id,
    rental_id,
    marketplace_request_id,
    listing_id,
    reviewer_user_id,
    reviewee_user_id,
    reviewer_role,
    reviewee_role,
    rating,
    comment,
    visibility,
    review_status,
    moderation_reason,
    created_at,
    published_at,
    moderated_at
  `,
}) => {
  let query = adminClient
    .from(REVIEWS_TABLE)
    .select(select)
    .order('created_at', { ascending: false })
    .limit(limit);

  query = applyTenantQueryScope(query, tenantScope);

  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    query = query.eq(key, value);
  });

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

const countReviewRows = async ({
  adminClient,
  tenantScope,
  filters = {},
}) => {
  let query = adminClient
    .from(REVIEWS_TABLE)
    .select('id', { count: 'exact', head: true });

  query = applyTenantQueryScope(query, tenantScope);

  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    query = query.eq(key, value);
  });

  const { count, error } = await query;
  if (error) throw error;
  return Number(count || 0);
};

const handleHistory = async ({ res, adminClient, user, tenantScope }) => {
  const [submitted, received] = await Promise.all([
    loadReviewRows({
      adminClient,
      tenantScope,
      filters: { reviewer_user_id: user.id },
      limit: 100,
    }),
    loadReviewRows({
      adminClient,
      tenantScope,
      filters: { reviewee_user_id: user.id },
      limit: 100,
    }),
  ]);

  return json(res, 200, {
    submitted,
    received,
  });
};

const handleSummary = async ({ res, adminClient, user, tenantScope, actorProfile }) => {
  let pendingCount = 0;

  let query = adminClient
    .from(RENTAL_EXECUTION_RECORDS_TABLE)
    .select('organization_id, marketplace_request_id, rental_id, owner_user_id, customer_user_id, completed_at, execution_stage')
    .or(`owner_user_id.eq.${user.id},customer_user_id.eq.${user.id}`)
    .order('completed_at', { ascending: false, nullsFirst: false })
    .limit(100);

  query = applyTenantQueryScope(query, tenantScope);

  const { data, error } = await query;
  if (error) {
    return json(res, 500, { error: error.message || 'Failed to load review summary' });
  }

  for (const row of data || []) {
    const task = await buildPendingReviewTask({
      adminClient,
      tenantScope,
      executionRow: row,
      currentUserId: user.id,
    });
    if (task) pendingCount += 1;
  }

  const [submittedCount, receivedCount, flaggedCount] = await Promise.all([
    countReviewRows({
      adminClient,
      tenantScope,
      filters: { reviewer_user_id: user.id },
    }),
    countReviewRows({
      adminClient,
      tenantScope,
      filters: { reviewee_user_id: user.id },
    }),
    canModerateReviews({ profile: actorProfile })
      ? countReviewRows({
          adminClient,
          tenantScope,
          filters: { review_status: 'flagged' },
        })
      : Promise.resolve(0),
  ]);

  return json(res, 200, {
    pendingCount,
    submittedCount,
    receivedCount,
    flaggedCount,
    canModerate: canModerateReviews({ profile: actorProfile }),
  });
};

const handleModerationQueue = async ({ req, res, adminClient, tenantScope, actorProfile }) => {
  if (!canModerateReviews({ profile: actorProfile })) {
    return json(res, 403, { error: 'You do not have permission to moderate reviews' });
  }

  const statusFilter = normalizeNullableText(req.query?.status || 'published');
  const rows = await loadReviewRows({
    adminClient,
    tenantScope,
    filters: statusFilter && statusFilter !== 'all' ? { review_status: statusFilter } : {},
    limit: 200,
  });

  return json(res, 200, {
    reviews: rows,
    count: rows.length,
  });
};

const handleModerate = async ({ res, adminClient, user, tenantScope, actorProfile, body }) => {
  if (!canModerateReviews({ profile: actorProfile })) {
    return json(res, 403, { error: 'You do not have permission to moderate reviews' });
  }

  const reviewId = normalizeText(body.reviewId || body.review_id);
  const reviewStatus = normalizeRole(body.reviewStatus || body.review_status);
  const moderationReason = normalizeNullableText(body.moderationReason || body.moderation_reason);
  const visibility = normalizeNullableText(body.visibility);

  if (!reviewId) {
    return json(res, 400, { error: 'reviewId is required' });
  }

  if (!['published', 'hidden', 'flagged', 'removed'].includes(reviewStatus)) {
    return json(res, 400, { error: 'reviewStatus must be one of published, hidden, flagged, removed' });
  }

  let updateQuery = adminClient
    .from(REVIEWS_TABLE)
    .update(stampTenantPayload({
      review_status: reviewStatus,
      moderated_at: new Date().toISOString(),
      moderated_by: user.id,
      moderation_reason: moderationReason,
      ...(visibility ? { visibility } : {}),
      ...(reviewStatus === 'published' ? { published_at: new Date().toISOString() } : {}),
    }, tenantScope))
    .eq('id', reviewId)
    .select('*')
    .single();

  updateQuery = applyTenantQueryScope(updateQuery, tenantScope);
  const { data, error } = await updateQuery;
  if (error) {
    return json(res, 500, { error: error.message || 'Failed to moderate review' });
  }

  return json(res, 200, { review: data });
};

const handleCreate = async ({ req, res, adminClient, user, tenantScope, body }) => {
  const rentalId = normalizeText(body.rentalId || body.rental_id);
  const marketplaceRequestId = normalizeNullableText(body.marketplaceRequestId || body.marketplace_request_id);
  const rating = safeNumber(body.rating);
  const comment = normalizeNullableText(body.comment);
  const categoryRatings = body.categoryRatings && typeof body.categoryRatings === 'object' && !Array.isArray(body.categoryRatings)
    ? body.categoryRatings
    : {};
  const visibility = normalizeRole(body.visibility || 'public');

  if (!rentalId) {
    return json(res, 400, { error: 'rentalId is required' });
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return json(res, 400, { error: 'rating must be an integer between 1 and 5' });
  }

  const ctx = await loadReviewContext({
    adminClient,
    tenantScope,
    rentalId,
    marketplaceRequestId,
  });

  if (!ctx) {
    return json(res, 404, { error: 'Completed rental review context not found' });
  }

  if (!ctx.isCompleted) {
    return json(res, 400, { error: 'Rental must be completed before leaving a review' });
  }

  const pair = buildRolePairForUser({
    userId: user.id,
    ownerUserId: ctx.ownerUserId,
    customerUserId: ctx.customerUserId,
  });

  if (!pair) {
    return json(res, 403, { error: 'You are not eligible to review this rental' });
  }

  const existing = await loadExistingReview({
    adminClient,
    tenantScope,
    rentalId: ctx.rentalId,
    reviewerUserId: user.id,
    revieweeUserId: pair.revieweeUserId,
  });

  if (existing) {
    return json(res, 409, { error: 'A review from this side already exists for this rental', review: existing });
  }

  const requestedVisibility = visibility === 'private_internal' ? 'private_internal' : 'public';
  const effectiveVisibility = pair.revieweeRole === 'customer' ? 'private_internal' : requestedVisibility;

  const payload = stampTenantPayload({
    rental_id: ctx.rentalId,
    marketplace_request_id: ctx.marketplaceRequestId,
    listing_id: ctx.listingId,
    vehicle_public_profile_id: ctx.vehiclePublicProfileId,
    reviewer_user_id: user.id,
    reviewee_user_id: pair.revieweeUserId,
    reviewer_role: pair.reviewerRole,
    reviewee_role: pair.revieweeRole,
    rating,
    category_ratings: categoryRatings,
    comment,
    visibility: effectiveVisibility,
    review_status: 'published',
    submitted_at: new Date().toISOString(),
    published_at: new Date().toISOString(),
  }, tenantScope);

  const { data, error } = await adminClient
    .from(REVIEWS_TABLE)
    .insert([payload])
    .select('*')
    .single();

  if (error) {
    return json(res, 500, { error: error.message || 'Failed to create review' });
  }

  return json(res, 201, { review: data });
};

export default async function handler(req, res) {
  try {
    const requestPayload = req.method === 'GET' ? (req.query || {}) : parseBody(req.body);
    const action = normalizeRole(req.query?.action || requestPayload?.action || '');

    if (req.method === 'GET' && action === 'owner-summary') {
      const { adminClient } = createSupabaseClients();
      const tenantScope = await resolveRequestTenantScope({
        req,
        adminClient,
        payload: requestPayload,
      });

      return await handleOwnerSummary({ req, res, adminClient, tenantScope });
    }

    const auth = await authenticateRequest(req);
    if (auth.error) {
      return json(res, auth.error.status, auth.error.body);
    }

    const { user, adminClient, tenantRuntime } = auth;
    const actorProfile = await loadActorAccessProfile({ adminClient, userId: user.id });
    const tenantScope = await resolveRequestTenantScope({
      req,
      adminClient,
      tenantRuntime,
      payload: requestPayload,
    });
    const userInScope = await assertUserInTenantScope({
      adminClient,
      userId: user.id,
      tenantScope,
    });

    if (!userInScope) {
      return json(res, 403, { error: 'Access denied for this tenant scope' });
    }

    if (req.method === 'GET' && action === 'pending') {
      return await handlePending({ req, res, adminClient, user, tenantScope });
    }

    if (req.method === 'GET' && action === 'history') {
      return await handleHistory({ res, adminClient, user, tenantScope });
    }

    if (req.method === 'GET' && action === 'summary') {
      return await handleSummary({ res, adminClient, user, tenantScope, actorProfile });
    }

    if (req.method === 'GET' && action === 'owner-summary') {
      return await handleOwnerSummary({ req, res, adminClient, tenantScope });
    }

    if (req.method === 'GET' && action === 'moderation-queue') {
      return await handleModerationQueue({ req, res, adminClient, tenantScope, actorProfile });
    }

    if (req.method === 'POST' && action === 'create') {
      return await handleCreate({ req, res, adminClient, user, tenantScope, body: requestPayload });
    }

    if (req.method === 'POST' && action === 'moderate') {
      return await handleModerate({ res, adminClient, user, tenantScope, actorProfile, body: requestPayload });
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Unexpected reviews API error' });
  }
}
