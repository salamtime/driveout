import { createSupabaseClients } from './_lib/supabase.js';

const ACTIVITY_LOG_TABLE = 'app_687f658e98_activity_log';
const RESOURCE_TYPE = 'tour_tracking';
const TOUR_TRACKING_ACTION = 'tour_location_ping';

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

const parseMaybeJson = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return {};
};

const normalizeLog = (row = {}) => ({
  id: String(row.id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
  action: String(row.action || row.actionType || 'tour_location_ping'),
  created_at: row.created_at || new Date().toISOString(),
  performed_at: row.created_at || new Date().toISOString(),
  metadata: (() => {
    const parsedDetails = parseMaybeJson(row.details);
    if (Object.keys(parsedDetails).length > 0) return parsedDetails;
    return parseMaybeJson(row.metadata);
  })(),
  gps_location:
    (() => {
      const parsedGps = parseMaybeJson(row.gps_location);
      if (Object.keys(parsedGps).length > 0) return parsedGps;
      const parsedDetails = parseMaybeJson(row.details);
      return parseMaybeJson(parsedDetails?.gps_location);
    })(),
  user_email: String(row.user_email || ''),
});

const buildActiveTours = (logs = []) => {
  const byGroup = new Map();

  logs.forEach((entry) => {
    const log = normalizeLog(entry);
    const metadata = log.metadata || {};
    const groupId = String(metadata.group_id || metadata.groupId || '');
    if (!groupId) return;

    if (!byGroup.has(groupId)) {
      byGroup.set(groupId, []);
    }
    byGroup.get(groupId).push(log);
  });

  return Array.from(byGroup.entries())
    .map(([groupId, entries]) => {
      const sorted = entries.sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      const latest = sorted[sorted.length - 1];
      const latestMeta = latest?.metadata || {};
      const latestGps = latest?.gps_location || latestMeta?.gps_location || {};
      const startEntry = sorted.find((entry) => entry.action === 'tour_tracking_started') || sorted[0];
      const stopped = latest?.action === 'tour_tracking_stopped';
      const latestCoordinates =
        Number.isFinite(Number(latestGps.latitude)) && Number.isFinite(Number(latestGps.longitude))
          ? {
              latitude: Number(latestGps.latitude),
              longitude: Number(latestGps.longitude),
              accuracy: Number(latestGps.accuracy || 0),
            }
          : null;
      const hasLiveCoordinates = sorted.some((entry) => {
        if (entry.action !== TOUR_TRACKING_ACTION) return false;
        const entryMeta = entry?.metadata || {};
        const entryGps = entry?.gps_location || entryMeta?.gps_location || {};
        return Number.isFinite(Number(entryGps.latitude)) && Number.isFinite(Number(entryGps.longitude));
      });

      return {
        groupId,
        packageName: latestMeta.package_name || latestMeta.packageName || 'Tour package',
        guideName: latestMeta.guide_name || latestMeta.guideName || latestMeta.actor_name || 'Guide',
        customerName: latestMeta.customer_name || latestMeta.customerName || 'Guest',
        quadCount: Number(latestMeta.quad_count || latestMeta.quadCount || 0),
        ridersCount: Number(latestMeta.riders_count || latestMeta.ridersCount || 0),
        startedAt: startEntry?.metadata?.started_at || latestMeta.started_at || startEntry?.created_at || '',
        latestPingAt: latest.created_at,
        latestCoordinates,
        trackingUrl: String(latestMeta.tracking_url || latestMeta.trackingUrl || ''),
        status: stopped ? 'stopped' : 'active',
        trackingReady: hasLiveCoordinates,
      };
    })
    .filter((tour) => tour.status === 'active' && tour.trackingReady)
    .sort((a, b) => new Date(b.latestPingAt).getTime() - new Date(a.latestPingAt).getTime());
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const { adminClient } = createSupabaseClients();

  if (req.method === 'GET') {
    try {
      const groupIds = String(req.query.groupIds || '')
        .split(',')
        .map((value) => String(value || '').trim())
        .filter(Boolean);

      const { data, error } = await adminClient
        .from(ACTIVITY_LOG_TABLE)
        .select('*')
        .eq('resource_type', RESOURCE_TYPE)
        .order('created_at', { ascending: false })
        .limit(5000);

      if (error) {
        return json(res, 500, { error: error.message, details: error.details, code: error.code });
      }

      const logs = (data || [])
        .map(normalizeLog)
        .filter((log) => {
          if (groupIds.length === 0) return true;
          const groupId = String(log.metadata?.group_id || log.metadata?.groupId || '');
          return groupIds.includes(groupId);
        })
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      return json(res, 200, {
        success: true,
        logs,
        activeTours: buildActiveTours(logs),
      });
    } catch (error) {
      return json(res, 500, { error: error?.message || 'Unknown error', details: error?.details || null, code: error?.code || null });
    }
  }

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  try {
    const body = parseBody(req.body);
    const groupId = String(body?.groupId || '').trim();
    if (!groupId) {
      return json(res, 400, { error: 'Group id is required' });
    }

    const metadata = typeof body?.metadata === 'object' && body?.metadata ? body.metadata : {};
    const latitude = Number(metadata.latitude);
    const longitude = Number(metadata.longitude);
    const accuracy = Number(metadata.accuracy ?? 0);

    const payload = {
      user_email: String(body?.userEmail || ''),
      action: String(body?.actionType || 'tour_location_ping'),
      resource_type: RESOURCE_TYPE,
      resource_id: null,
      details: {
        ...metadata,
        group_id: groupId,
        gps_location:
          Number.isFinite(latitude) && Number.isFinite(longitude)
            ? {
                latitude,
                longitude,
                accuracy: Number.isFinite(accuracy) ? accuracy : 0,
              }
            : {},
      },
      created_at: new Date().toISOString(),
    };

    const { data, error } = await adminClient
      .from(ACTIVITY_LOG_TABLE)
      .insert(payload)
      .select('*')
      .maybeSingle();

    if (error) {
      return json(res, 500, { error: error.message, details: error.details, code: error.code });
    }

    return json(res, 200, { success: true, log: normalizeLog(data) });
  } catch (error) {
    return json(res, 500, { error: error?.message || 'Unknown error', details: error?.details || null, code: error?.code || null });
  }
}
