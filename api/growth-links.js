import crypto from 'node:crypto';
import { authenticateRequest } from './_lib/auth.js';
import { APP_USERS_TABLE, createSupabaseClients } from './_lib/supabase.js';
import {
  BOOST_LEDGER_EVENT_TYPES_PHASE2,
  BOOST_MAD_RATE,
  BOOST_MILESTONES,
  GROWTH_CLICK_DEDUPE_HOURS,
  GROWTH_SHARE_TYPES,
  GROWTH_SHORT_CODE_LENGTH,
  REWARDS_LEDGER_EVENT_TYPES,
  REWARDS_MAD_RATE,
  REWARDS_MILESTONES,
  getBoostTier,
  getNextIncompleteMilestone,
  getRewardsTier,
} from '../src/config/growthLoops.js';
import {
  LEADERBOARD_BADGES,
  LEADERBOARD_TYPES,
  getLeaderboardLabel,
  getPreviousWeekBounds,
  getWeekBounds,
  getWeeklyPrizeForRank,
} from '../src/config/growthLeaderboard.js';

const SHARE_LINKS_TABLE = 'share_links';
const LINK_EVENTS_TABLE = 'link_events';
const MISSION_PROGRESS_TABLE = 'mission_progress';
const CUSTOMER_REWARDS_LEDGER_TABLE = 'customer_rewards_ledger';
const OWNER_BOOST_LEDGER_TABLE = process.env.BOOST_LEDGER_TABLE || 'owner_boost_ledger';
const BOOST_REDEMPTIONS_TABLE = process.env.BOOST_REDEMPTIONS_TABLE || 'owner_listing_boost_redemptions';
const BOOKING_REQUESTS_TABLE = 'app_booking_requests';
const LEADERBOARD_ENTRIES_TABLE = 'leaderboard_entries';
const LEADERBOARD_DISTRIBUTIONS_TABLE = 'leaderboard_reward_distributions';
const MARKETPLACE_LISTINGS_TABLE = 'app_marketplace_listings';
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const setupErrorCodes = new Set(['42P01', '42501', '42703', '22P02', 'PGRST116', 'PGRST204']);

const json = (res, status, body) => res.status(status).json(body);

const parseBody = (body) => {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body || '{}');
    } catch {
      return {};
    }
  }
  return typeof body === 'object' ? body : {};
};

const safeNumber = (value) => {
  const next = Number(value || 0);
  return Number.isFinite(next) ? next : 0;
};

const isSetupError = (error) => setupErrorCodes.has(String(error?.code || ''));

const buildOrigin = (req) => {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').trim() || 'https';
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim();
  return host ? `${forwardedProto}://${host}` : 'https://www.saharax.co';
};

const buildVisitorHash = (req, fallback = '') => {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = forwarded || req.socket?.remoteAddress || '';
  const userAgent = String(req.headers['user-agent'] || '');
  return crypto.createHash('sha256').update(`${ip}|${userAgent}|${fallback}`).digest('hex');
};

const hashUserRef = (value) =>
  crypto.createHash('sha256').update(`user:${String(value || '')}`).digest('hex');

const generateCode = () =>
  Array.from({ length: GROWTH_SHORT_CODE_LENGTH }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');

const getMilestonesForType = (type) =>
  type === GROWTH_SHARE_TYPES.boost ? BOOST_MILESTONES : REWARDS_MILESTONES;

const getTierForType = (type, totals) =>
  type === GROWTH_SHARE_TYPES.boost
    ? getBoostTier(totals.total_clicks)
    : getRewardsTier(totals.total_clicks);

const getMadRate = (type) => (type === GROWTH_SHARE_TYPES.boost ? BOOST_MAD_RATE : REWARDS_MAD_RATE);

const getEventLabel = (type) =>
  type === GROWTH_SHARE_TYPES.boost ? 'Boost Credits' : 'Ride Credits';

const getLedgerTable = (type) =>
  type === GROWTH_SHARE_TYPES.boost ? OWNER_BOOST_LEDGER_TABLE : CUSTOMER_REWARDS_LEDGER_TABLE;

const loadProgress = async (adminClient, userId, type) => {
  const { data } = await adminClient
    .from(MISSION_PROGRESS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('type', type)
    .maybeSingle();

  return (
    data || {
      user_id: userId,
      type,
      total_clicks: 0,
      total_signups: 0,
      total_bookings: 0,
      milestones_completed: {},
    }
  );
};

const saveProgress = async (adminClient, progress) => {
  const payload = {
    user_id: progress.user_id,
    type: progress.type,
    total_clicks: safeNumber(progress.total_clicks),
    total_signups: safeNumber(progress.total_signups),
    total_bookings: safeNumber(progress.total_bookings),
    milestones_completed: progress.milestones_completed || {},
    updated_at: new Date().toISOString(),
  };

  const { error } = await adminClient
    .from(MISSION_PROGRESS_TABLE)
    .upsert(payload, { onConflict: 'user_id,type' });

  if (error) throw error;
};

const listRecentLedger = async (adminClient, userId, type) => {
  const userColumn = type === GROWTH_SHARE_TYPES.boost ? 'owner_id' : 'user_id';
  const { data, error } = await adminClient
    .from(getLedgerTable(type))
    .select('*')
    .eq(userColumn, userId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) throw error;
  return data || [];
};

const getWalletBalance = (entries = []) =>
  (entries || []).reduce((sum, entry) => sum + safeNumber(entry.amount), 0);

const toMilestoneView = (progress, type) => {
  const completedMap = progress?.milestones_completed || {};
  return getMilestonesForType(type).map((milestone) => ({
    ...milestone,
    completed: Boolean(completedMap[milestone.key]),
    completedAt: completedMap[milestone.key] || null,
  }));
};

const buildSnapshot = async (adminClient, userId, type, shareLink = null) => {
  const progress = await loadProgress(adminClient, userId, type);
  const ledger = await listRecentLedger(adminClient, userId, type);
  const milestones = toMilestoneView(progress, type);
  const nextMilestone = getNextIncompleteMilestone(milestones);
  const tier = getTierForType(type, progress);
  const balance = getWalletBalance(ledger);
  const madValue = balance * getMadRate(type);

  let resolvedShareLink = shareLink;
  if (!resolvedShareLink) {
    const { data } = await adminClient
      .from(SHARE_LINKS_TABLE)
      .select('*')
      .eq('user_id', userId)
      .eq('type', type)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    resolvedShareLink = data || null;
  }

  return {
    type,
    wallet: {
      balance,
      madValue,
      label: getEventLabel(type),
    },
    progress: {
      clicks: safeNumber(progress.total_clicks),
      signups: safeNumber(progress.total_signups),
      bookings: safeNumber(progress.total_bookings),
    },
    tier,
    milestones,
    nextMilestone,
    shareLink: resolvedShareLink
      ? {
          id: resolvedShareLink.id,
          shortCode: resolvedShareLink.short_code,
          destinationUrl: resolvedShareLink.destination_url,
          shortUrl: null,
        }
      : null,
    recentRewards: (ledger || []).slice(0, 5).map((entry) => ({
      id: entry.id,
      amount: safeNumber(entry.amount),
      note: entry.note || '',
      createdAt: entry.created_at || entry.createdAt || null,
    })),
  };
};

const awardLedgerEntry = async ({ adminClient, userId, type, amount, referenceId, note, metadata = {} }) => {
  const table = getLedgerTable(type);
  const payload =
    type === GROWTH_SHARE_TYPES.boost
      ? {
          owner_id: userId,
          mission_id: null,
          reward_id: null,
          entry_type: metadata.entryType || BOOST_LEDGER_EVENT_TYPES_PHASE2.milestoneEarned,
          amount,
          reference_id: referenceId,
          note,
          metadata,
        }
      : {
          user_id: userId,
          entry_type: metadata.entryType || REWARDS_LEDGER_EVENT_TYPES.milestoneEarned,
          amount,
          reference_id: referenceId,
          note,
          metadata,
        };

  const { data, error } = await adminClient.from(table).insert(payload).select('*').single();
  if (error) throw error;
  return data;
};

const refreshTotalsFromEvents = async (adminClient, userId, type) => {
  const { data: links, error: linksError } = await adminClient
    .from(SHARE_LINKS_TABLE)
    .select('id')
    .eq('user_id', userId)
    .eq('type', type);

  if (linksError) throw linksError;
  const linkIds = (links || []).map((item) => item.id).filter(Boolean);

  if (!linkIds.length) {
    return { total_clicks: 0, total_signups: 0, total_bookings: 0 };
  }

  const { data: events, error: eventsError } = await adminClient
    .from(LINK_EVENTS_TABLE)
    .select('event_type')
    .in('link_id', linkIds);

  if (eventsError) throw eventsError;

  return {
    total_clicks: (events || []).filter((event) => event.event_type === 'click').length,
    total_signups: (events || []).filter((event) => event.event_type === 'signup').length,
    total_bookings: (events || []).filter((event) => event.event_type === 'booking').length,
  };
};

const applyMilestones = async ({ adminClient, userId, type, progress }) => {
  const milestonesCompleted = { ...(progress.milestones_completed || {}) };
  const awarded = [];

  if (type === GROWTH_SHARE_TYPES.boost) {
    const firstClickReached = safeNumber(progress.total_clicks) >= 1;
    if (firstClickReached && !milestonesCompleted.boost_click_1) {
      milestonesCompleted.boost_click_1 = new Date().toISOString();
    }
  }

  for (const milestone of getMilestonesForType(type)) {
    if (milestonesCompleted[milestone.key]) continue;
    const totalForMetric =
      milestone.metric === 'signups'
        ? safeNumber(progress.total_signups)
        : milestone.metric === 'bookings'
          ? safeNumber(progress.total_bookings)
          : safeNumber(progress.total_clicks);

    if (totalForMetric < safeNumber(milestone.threshold)) continue;

    if (milestone.handledByEvent) {
      milestonesCompleted[milestone.key] = new Date().toISOString();
      continue;
    }

    const referenceId = `${type}:${milestone.key}`;
    const entry = await awardLedgerEntry({
      adminClient,
      userId,
      type,
      amount: safeNumber(milestone.credits),
      referenceId,
      note: `${milestone.label} unlocked`,
      metadata: {
        milestoneKey: milestone.key,
        entryType:
          type === GROWTH_SHARE_TYPES.boost
            ? BOOST_LEDGER_EVENT_TYPES_PHASE2.milestoneEarned
            : milestone.globalOnce
              ? REWARDS_LEDGER_EVENT_TYPES.signupBonus
              : REWARDS_LEDGER_EVENT_TYPES.milestoneEarned,
      },
    });
    milestonesCompleted[milestone.key] = new Date().toISOString();
    awarded.push({
      id: entry.id,
      amount: safeNumber(entry.amount),
      key: milestone.key,
      title: milestone.label,
      body: `${milestone.rewardLabel} added automatically`,
    });
  }

  const nextProgress = {
    ...progress,
    milestones_completed: milestonesCompleted,
  };
  await saveProgress(adminClient, nextProgress);
  return { progress: nextProgress, awarded };
};

const ensureShareLink = async ({ adminClient, userId, type, destinationUrl }) => {
  const { data: existing } = await adminClient
    .from(SHARE_LINKS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('type', type)
    .eq('destination_url', destinationUrl)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return existing;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const shortCode = generateCode();
    const { data, error } = await adminClient
      .from(SHARE_LINKS_TABLE)
      .insert({
        user_id: userId,
        type,
        destination_url: destinationUrl,
        short_code: shortCode,
      })
      .select('*')
      .single();
    if (!error && data) return data;
  }

  throw new Error('Unable to create share link');
};

const createClickRewardIfNeeded = async ({ adminClient, link, visitorHash }) => {
  if (link.type !== GROWTH_SHARE_TYPES.boost) return null;
  return awardLedgerEntry({
    adminClient,
    userId: link.user_id,
    type: GROWTH_SHARE_TYPES.boost,
    amount: 3,
    referenceId: `boost:click:${link.id}:${visitorHash}`,
    note: 'Qualified visit tracked',
    metadata: {
      entryType: BOOST_LEDGER_EVENT_TYPES_PHASE2.clickEarned,
      shortCode: link.short_code,
      linkId: link.id,
    },
  });
};

const getLinkByCode = async (adminClient, code) => {
  const { data, error } = await adminClient
    .from(SHARE_LINKS_TABLE)
    .select('*')
    .eq('short_code', code)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

const normalizeLegacyGrowthType = (req, body = {}) => {
  const explicitType = String(req.query?.type || body.type || '').trim().toLowerCase();
  if (Object.values(GROWTH_SHARE_TYPES).includes(explicitType)) {
    return explicitType;
  }

  const legacyResource = String(req.query?.resource || body.resource || '').trim().toLowerCase();
  if (legacyResource === 'boost') {
    return GROWTH_SHARE_TYPES.boost;
  }
  if (legacyResource === 'rewards') {
    return GROWTH_SHARE_TYPES.rewards;
  }

  return null;
};

const normalizeLeaderboardType = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return Object.values(LEADERBOARD_TYPES).includes(normalized) ? normalized : null;
};

const toIso = (value) => new Date(value).toISOString();

const summarizeTargetGap = ({ type, userEntry, previousEntry }) => {
  if (!userEntry || !previousEntry) return null;
  if (type === LEADERBOARD_TYPES.rewards) {
    const signupGap = Math.max(0, safeNumber(previousEntry.rawSignups) - safeNumber(userEntry.rawSignups));
    if (signupGap > 0) {
      return {
        label: `${signupGap} more signup${signupGap === 1 ? '' : 's'} to reach #${previousEntry.rank}`,
      };
    }
    const clickGap = Math.max(0, safeNumber(previousEntry.rawClicks) - safeNumber(userEntry.rawClicks) + 1);
    return {
      label: `${clickGap} more click${clickGap === 1 ? '' : 's'} to reach #${previousEntry.rank}`,
    };
  }

  const bookingGap = Math.max(0, safeNumber(previousEntry.rawBookings) - safeNumber(userEntry.rawBookings));
  if (bookingGap > 0) {
    return {
      label: `${bookingGap} more booking${bookingGap === 1 ? '' : 's'} to reach #${previousEntry.rank}`,
    };
  }

  const clickGap = Math.max(0, safeNumber(previousEntry.rawClicks) - safeNumber(userEntry.rawClicks) + 1);
  return {
    label: `${clickGap} more visit${clickGap === 1 ? '' : 's'} to reach #${previousEntry.rank}`,
  };
};

const upsertLeaderboardRows = async (adminClient, entries, weekStart, weekEnd, type) => {
  if (!entries.length) return [];
  const payload = entries.map((entry) => ({
    user_id: entry.userId,
    type,
    score: entry.score,
    secondary_score: entry.secondaryScore,
    week_start: toIso(weekStart),
    week_end: toIso(weekEnd),
    rank: entry.rank,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await adminClient.from(LEADERBOARD_ENTRIES_TABLE).upsert(payload, {
    onConflict: 'user_id,type,week_start',
  });
  if (error) throw error;
  return payload;
};

const loadUserLabels = async (adminClient, userIds = []) => {
  if (!userIds.length) return new Map();
  const { data, error } = await adminClient
    .from(APP_USERS_TABLE)
    .select('id, full_name, email')
    .in('id', userIds);
  if (error) throw error;
  return new Map(
    (data || []).map((row) => [
      String(row.id),
      {
        name: String(row.full_name || '').trim() || String(row.email || 'User').split('@')[0],
      },
    ])
  );
};

const computeWeeklyEntries = async (adminClient, type, bounds) => {
  const { data: shareLinks, error: shareLinksError } = await adminClient
    .from(SHARE_LINKS_TABLE)
    .select('id, user_id')
    .eq('type', type);
  if (shareLinksError) throw shareLinksError;

  const linkIds = (shareLinks || []).map((link) => link.id).filter(Boolean);
  if (!linkIds.length) return [];

  const userByLinkId = new Map((shareLinks || []).map((link) => [String(link.id), String(link.user_id)]));
  const { data: events, error: eventsError } = await adminClient
    .from(LINK_EVENTS_TABLE)
    .select('link_id, event_type')
    .in('link_id', linkIds)
    .gte('created_at', toIso(bounds.weekStart))
    .lt('created_at', toIso(bounds.weekEnd));
  if (eventsError) throw eventsError;

  const byUser = new Map();
  for (const event of events || []) {
    const userId = userByLinkId.get(String(event.link_id));
    if (!userId) continue;
    if (!byUser.has(userId)) {
      byUser.set(userId, { userId, rawClicks: 0, rawSignups: 0, rawBookings: 0 });
    }
    const current = byUser.get(userId);
    if (event.event_type === 'click') current.rawClicks += 1;
    if (event.event_type === 'signup') current.rawSignups += 1;
    if (event.event_type === 'booking') current.rawBookings += 1;
  }

  const ranked = [...byUser.values()]
    .map((entry) => {
      const score =
        type === LEADERBOARD_TYPES.rewards
          ? safeNumber(entry.rawSignups)
          : safeNumber(entry.rawBookings) > 0
            ? safeNumber(entry.rawBookings)
            : safeNumber(entry.rawClicks);
      const secondaryScore = safeNumber(entry.rawClicks);
      return {
        ...entry,
        score,
        secondaryScore,
      };
    })
    .filter((entry) => entry.score > 0 || entry.secondaryScore > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (right.secondaryScore !== left.secondaryScore) return right.secondaryScore - left.secondaryScore;
      return String(left.userId).localeCompare(String(right.userId));
    })
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));

  await upsertLeaderboardRows(adminClient, ranked, bounds.weekStart, bounds.weekEnd, type);
  return ranked;
};

const buildLeaderboardPayload = async (adminClient, type, bounds, authUserId = null) => {
  const ranked = await computeWeeklyEntries(adminClient, type, bounds);
  const userLabels = await loadUserLabels(adminClient, ranked.map((entry) => entry.userId));
  const decorated = ranked.map((entry) => ({
    ...entry,
    displayName: userLabels.get(entry.userId)?.name || 'User',
    badge: entry.rank === 1 ? LEADERBOARD_BADGES[type] : null,
  }));
  const top = decorated.slice(0, 5);
  const userEntry = authUserId ? decorated.find((entry) => entry.userId === authUserId) || null : null;
  const previousEntry = userEntry && userEntry.rank > 1 ? decorated[userEntry.rank - 2] : null;
  const nextTarget = summarizeTargetGap({ type, userEntry, previousEntry });

  return {
    type,
    label: getLeaderboardLabel(type),
    weekStart: toIso(bounds.weekStart),
    weekEnd: toIso(bounds.weekEnd),
    top,
    userRank: userEntry
      ? {
          rank: userEntry.rank,
          score: userEntry.score,
          secondaryScore: userEntry.secondaryScore,
          badge: userEntry.badge,
        }
      : null,
    nextTarget,
  };
};

const createRewardsPrize = async (adminClient, userId, weekStart, rank, prize) => {
  const rewardKey = `rewards:${weekStart.toISOString()}:${rank}`;
  const { data: existing } = await adminClient
    .from(LEADERBOARD_DISTRIBUTIONS_TABLE)
    .select('id')
    .eq('user_id', userId)
    .eq('type', LEADERBOARD_TYPES.rewards)
    .eq('week_start', toIso(weekStart))
    .eq('reward_key', rewardKey)
    .limit(1);
  if ((existing || []).length) return false;

  const { error: ledgerError } = await adminClient.from(CUSTOMER_REWARDS_LEDGER_TABLE).insert({
    user_id: userId,
    entry_type: REWARDS_LEDGER_EVENT_TYPES.milestoneEarned,
    amount: safeNumber(prize.credits),
    reference_id: rewardKey,
    note: prize.title,
    metadata: {
      leaderboard: true,
      weekStart: toIso(weekStart),
      rank,
    },
  });
  if (ledgerError) throw ledgerError;

  const { error: distributionError } = await adminClient.from(LEADERBOARD_DISTRIBUTIONS_TABLE).insert({
    user_id: userId,
    type: LEADERBOARD_TYPES.rewards,
    week_start: toIso(weekStart),
    rank,
    reward_key: rewardKey,
    metadata: prize,
  });
  if (distributionError) throw distributionError;
  return true;
};

const getPreferredListingId = async (adminClient, ownerId) => {
  const { data, error } = await adminClient
    .from(MARKETPLACE_LISTINGS_TABLE)
    .select('id, listing_status, updated_at')
    .eq('owner_id', ownerId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  const live = (data || []).find((row) => String(row.listing_status || '').toLowerCase() === 'live');
  return String((live || data?.[0] || {}).id || '');
};

const createBoostPrize = async (adminClient, userId, weekStart, rank, prize) => {
  const rewardKey = `boost:${weekStart.toISOString()}:${rank}:${prize.rewardId || prize.credits}`;
  const { data: existing } = await adminClient
    .from(LEADERBOARD_DISTRIBUTIONS_TABLE)
    .select('id')
    .eq('user_id', userId)
    .eq('type', LEADERBOARD_TYPES.boost)
    .eq('week_start', toIso(weekStart))
    .eq('reward_key', rewardKey)
    .limit(1);
  if ((existing || []).length) return false;

  if (prize.rewardId) {
    const listingId = await getPreferredListingId(adminClient, userId);
    if (listingId) {
      const { error: redemptionError } = await adminClient.from(BOOST_REDEMPTIONS_TABLE).insert({
        owner_id: userId,
        listing_id: listingId,
        reward_id: prize.rewardId,
        status: 'active',
        credits_spent: 0,
        metadata: {
          leaderboard: true,
          weekStart: toIso(weekStart),
          rank,
        },
      });
      if (redemptionError) throw redemptionError;
    }
  }

  if (prize.credits) {
    const { error: ledgerError } = await adminClient.from(OWNER_BOOST_LEDGER_TABLE).insert({
      owner_id: userId,
      mission_id: null,
      reward_id: null,
      entry_type: BOOST_LEDGER_EVENT_TYPES_PHASE2.milestoneEarned,
      amount: safeNumber(prize.credits),
      reference_id: rewardKey,
      note: prize.title,
      metadata: {
        leaderboard: true,
        weekStart: toIso(weekStart),
        rank,
      },
    });
    if (ledgerError) throw ledgerError;
  }

  const { error: distributionError } = await adminClient.from(LEADERBOARD_DISTRIBUTIONS_TABLE).insert({
    user_id: userId,
    type: LEADERBOARD_TYPES.boost,
    week_start: toIso(weekStart),
    rank,
    reward_key: rewardKey,
    metadata: prize,
  });
  if (distributionError) throw distributionError;
  return true;
};

const distributeWeeklyRewards = async (adminClient, type, bounds) => {
  const ranked = await computeWeeklyEntries(adminClient, type, bounds);
  const eligible = ranked.filter((entry) => entry.rank <= 10);
  const distributed = [];

  for (const entry of eligible) {
    const prize = getWeeklyPrizeForRank(type, entry.rank);
    if (!prize) continue;
    const applied =
      type === LEADERBOARD_TYPES.rewards
        ? await createRewardsPrize(adminClient, entry.userId, bounds.weekStart, entry.rank, prize)
        : await createBoostPrize(adminClient, entry.userId, bounds.weekStart, entry.rank, prize);
    if (applied) {
      distributed.push({
        userId: entry.userId,
        rank: entry.rank,
        prize,
      });
    }
  }

  return distributed;
};

const buildBoostSnapshotFromGrowth = async (req, adminClient, userId) => {
  const origin = buildOrigin(req);
  const snapshot = await buildSnapshot(adminClient, userId, GROWTH_SHARE_TYPES.boost);
  return {
    ...snapshot,
    shareLink: snapshot.shareLink
      ? {
          ...snapshot.shareLink,
          shortUrl: `${origin}/s/${snapshot.shareLink.shortCode}`,
        }
      : null,
  };
};

const handleLegacyBoostRequest = async (req, res, auth, body = {}) => {
  const { adminClient, user } = auth;
  const origin = buildOrigin(req);
  const action = String(body.action || '').trim().toLowerCase();

  if (req.method === 'GET') {
    const snapshot = await buildBoostSnapshotFromGrowth(req, adminClient, user.id);
    return json(res, 200, snapshot);
  }

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  if (action === 'claim_daily_visit') {
    return json(res, 200, await buildBoostSnapshotFromGrowth(req, adminClient, user.id));
  }

  if (action === 'create_share_link') {
    const listingId = String(body.listingId || '').trim();
    const destinationUrl = listingId
      ? `${origin}/marketplace/${listingId}`
      : String(body.destinationUrl || '').trim();

    if (!destinationUrl) {
      return json(res, 400, { error: 'listingId or destinationUrl is required' });
    }

    const link = await ensureShareLink({
      adminClient,
      userId: user.id,
      type: GROWTH_SHARE_TYPES.boost,
      destinationUrl,
    });
    const snapshot = await buildSnapshot(adminClient, user.id, GROWTH_SHARE_TYPES.boost, link);

    return json(res, 200, {
      ...snapshot,
      justShared: true,
      shareLink: {
        ...snapshot.shareLink,
        shortUrl: `${origin}/s/${link.short_code}`,
      },
    });
  }

  if (action === 'redeem_reward') {
    return json(res, 501, { error: 'Boost reward redemption is not available in Hobby-safe consolidated mode yet.' });
  }

  return json(res, 400, { error: 'Unsupported boost action' });
};

const trackClickAndResolve = async (req, res, code) => {
  const { adminClient } = createSupabaseClients();
  const link = await getLinkByCode(adminClient, code);

  if (!link) {
    return json(res, 404, { error: 'Link not found' });
  }

  const visitorHash = buildVisitorHash(req);
  const dedupeSince = new Date(Date.now() - GROWTH_CLICK_DEDUPE_HOURS * 60 * 60 * 1000).toISOString();
  const { data: recentEvents } = await adminClient
    .from(LINK_EVENTS_TABLE)
    .select('id')
    .eq('link_id', link.id)
    .eq('event_type', 'click')
    .eq('visitor_hash', visitorHash)
    .gte('created_at', dedupeSince)
    .limit(1);

  const shouldCount = !(recentEvents || []).length;
  let awarded = [];

  if (shouldCount) {
    const { error: insertError } = await adminClient.from(LINK_EVENTS_TABLE).insert({
      link_id: link.id,
      event_type: 'click',
      visitor_hash: visitorHash,
    });
    if (insertError) throw insertError;

    if (link.type === GROWTH_SHARE_TYPES.boost) {
      const clickReward = await createClickRewardIfNeeded({ adminClient, link, visitorHash });
      if (clickReward) {
        awarded.push({
          id: clickReward.id,
          amount: safeNumber(clickReward.amount),
          title: 'Visit tracked',
          body: '+3 Boost Credits added',
        });
      }
    }

    const totals = await refreshTotalsFromEvents(adminClient, link.user_id, link.type);
    const currentProgress = await loadProgress(adminClient, link.user_id, link.type);
    const { progress } = {
      progress: {
        ...currentProgress,
        ...totals,
      },
    };
    const milestoneResult = await applyMilestones({
      adminClient,
      userId: link.user_id,
      type: link.type,
      progress,
    });
    awarded = [...awarded, ...milestoneResult.awarded];
  }

  const responseUrl =
    link.type === GROWTH_SHARE_TYPES.rewards
      ? `${link.destination_url}${link.destination_url.includes('?') ? '&' : '?'}ref=${encodeURIComponent(link.short_code)}`
      : link.destination_url;

  return json(res, 200, {
    url: responseUrl,
    type: link.type,
    code: link.short_code,
    attributed: true,
    awarded,
  });
};

const trackSignup = async (res, body) => {
  const code = String(body.code || '').trim();
  const referredUserId = String(body.referredUserId || '').trim();
  if (!code || !referredUserId) {
    return json(res, 400, { error: 'Missing signup attribution data' });
  }

  const { adminClient } = createSupabaseClients();
  const link = await getLinkByCode(adminClient, code);
  if (!link || link.type !== GROWTH_SHARE_TYPES.rewards) {
    return json(res, 404, { error: 'Referral link not found' });
  }

  const visitorHash = hashUserRef(referredUserId);
  const { data: existing } = await adminClient
    .from(LINK_EVENTS_TABLE)
    .select('id')
    .eq('link_id', link.id)
    .eq('event_type', 'signup')
    .eq('visitor_hash', visitorHash)
    .limit(1);

  if (!(existing || []).length) {
    const { error } = await adminClient.from(LINK_EVENTS_TABLE).insert({
      link_id: link.id,
      event_type: 'signup',
      visitor_hash: visitorHash,
    });
    if (error) throw error;
  }

  const totals = await refreshTotalsFromEvents(adminClient, link.user_id, link.type);
  const currentProgress = await loadProgress(adminClient, link.user_id, link.type);
  const milestoneResult = await applyMilestones({
    adminClient,
    userId: link.user_id,
    type: link.type,
    progress: {
      ...currentProgress,
      ...totals,
    },
  });

  return json(res, 200, {
    ok: true,
    awarded: milestoneResult.awarded,
  });
};

const trackBooking = async (res, body) => {
  const code = String(body.code || '').trim();
  const bookingRequestId = String(body.bookingRequestId || '').trim();
  const listingId = String(body.listingId || '').trim();
  if (!code || !bookingRequestId) {
    return json(res, 400, { error: 'Missing booking attribution data' });
  }

  const { adminClient } = createSupabaseClients();
  const link = await getLinkByCode(adminClient, code);
  if (!link || link.type !== GROWTH_SHARE_TYPES.boost) {
    return json(res, 404, { error: 'Boost link not found' });
  }

  const { data: booking } = await adminClient
    .from(BOOKING_REQUESTS_TABLE)
    .select('id, listing_id')
    .eq('id', bookingRequestId)
    .maybeSingle();

  if (!booking?.id) {
    return json(res, 404, { error: 'Booking request not found' });
  }

  if (listingId && !String(link.destination_url || '').includes(`/${listingId}`)) {
    return json(res, 400, { error: 'Listing attribution mismatch' });
  }

  const visitorHash = hashUserRef(bookingRequestId);
  const { data: existing } = await adminClient
    .from(LINK_EVENTS_TABLE)
    .select('id')
    .eq('link_id', link.id)
    .eq('event_type', 'booking')
    .eq('visitor_hash', visitorHash)
    .limit(1);

  if (!(existing || []).length) {
    const { error } = await adminClient.from(LINK_EVENTS_TABLE).insert({
      link_id: link.id,
      event_type: 'booking',
      visitor_hash: visitorHash,
    });
    if (error) throw error;
  }

  const totals = await refreshTotalsFromEvents(adminClient, link.user_id, link.type);
  const currentProgress = await loadProgress(adminClient, link.user_id, link.type);
  const milestoneResult = await applyMilestones({
    adminClient,
    userId: link.user_id,
    type: link.type,
    progress: {
      ...currentProgress,
      ...totals,
    },
  });

  return json(res, 200, {
    ok: true,
    awarded: milestoneResult.awarded,
  });
};

export default async function handler(req, res) {
  try {
    const resource = String(req.query?.resource || '').trim().toLowerCase();
    const code = String(req.query?.code || '').trim();
    if (req.method === 'GET' && code) {
      return await trackClickAndResolve(req, res, code);
    }

    const body = req.method === 'POST' ? parseBody(req.body) : {};
    const normalizedType = normalizeLegacyGrowthType(req, body);

    if (resource === 'leaderboard') {
      const action = String(req.query?.action || body.action || '').trim().toLowerCase();

      if (action === 'distribute') {
        const { adminClient } = createSupabaseClients();
        const previousBounds = getPreviousWeekBounds();
        const rewards = await distributeWeeklyRewards(adminClient, LEADERBOARD_TYPES.rewards, previousBounds);
        const boost = await distributeWeeklyRewards(adminClient, LEADERBOARD_TYPES.boost, previousBounds);
        return json(res, 200, {
          ok: true,
          rewards,
          boost,
          weekStart: toIso(previousBounds.weekStart),
          weekEnd: toIso(previousBounds.weekEnd),
        });
      }

      const auth = await authenticateRequest(req);
      if (auth.error) {
        return json(res, auth.error.status, auth.error.body);
      }

      const leaderboardType = normalizeLeaderboardType(req.query?.type || body.type);
      if (!leaderboardType) {
        return json(res, 400, { error: 'Invalid leaderboard type' });
      }

      const currentBounds = getWeekBounds();
      const payload = await buildLeaderboardPayload(auth.adminClient, leaderboardType, currentBounds, auth.user.id);
      return json(res, 200, payload);
    }

    if (String(req.query?.resource || '').trim().toLowerCase() === 'boost') {
      const auth = await authenticateRequest(req);
      if (auth.error) {
        return json(res, auth.error.status, auth.error.body);
      }
      return await handleLegacyBoostRequest(req, res, auth, body);
    }

    if (req.method === 'GET') {
      const auth = await authenticateRequest(req);
      if (auth.error) {
        return json(res, auth.error.status, auth.error.body);
      }

      if (!normalizedType) {
        return json(res, 400, { error: 'Invalid growth type' });
      }

      const origin = buildOrigin(req);
      const snapshot = await buildSnapshot(auth.adminClient, auth.user.id, normalizedType);
      return json(res, 200, {
        ...snapshot,
        shareLink: snapshot.shareLink
          ? {
              ...snapshot.shareLink,
              shortUrl: `${origin}/s/${snapshot.shareLink.shortCode}`,
            }
          : null,
      });
    }

    if (req.method === 'POST') {
      const action = String(body.action || '').trim();

      if (action === 'track_signup') {
        return await trackSignup(res, body);
      }

      if (action === 'track_booking') {
        return await trackBooking(res, body);
      }

      const auth = await authenticateRequest(req);
      if (auth.error) {
        return json(res, auth.error.status, auth.error.body);
      }

      const { adminClient, user } = auth;
      const origin = buildOrigin(req);

      if (action === 'create_link') {
        const type = normalizedType;
        const destinationUrl = String(body.destinationUrl || '').trim();
        if (!Object.values(GROWTH_SHARE_TYPES).includes(type) || !destinationUrl) {
          return json(res, 400, { error: 'Invalid share payload' });
        }

        const link = await ensureShareLink({
          adminClient,
          userId: user.id,
          type,
          destinationUrl,
        });
        const snapshot = await buildSnapshot(adminClient, user.id, type, link);

        return json(res, 200, {
          ...snapshot,
          justShared: true,
          shareLink: {
            ...snapshot.shareLink,
            shortUrl: `${origin}/s/${link.short_code}`,
          },
        });
      }

      return json(res, 400, { error: 'Unsupported action' });
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    if (isSetupError(error)) {
      const isLeaderboardRequest = String(req.query?.resource || '').trim().toLowerCase() === 'leaderboard';
      return json(res, 500, {
        error: isLeaderboardRequest
          ? 'Growth Phase 3 database setup is missing. Apply src/migrations/create_growth_phase3.sql first.'
          : 'Growth Phase 2 database setup is missing. Apply src/migrations/create_growth_phase2.sql first.',
        code: error?.code || null,
      });
    }
    return json(res, Number(error?.status || 500), {
      error: error?.message || 'Growth link request failed',
    });
  }
}
