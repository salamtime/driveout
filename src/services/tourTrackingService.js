import { adminApiRequest } from './adminApi';

export const TOUR_TRACKING_ACTION = 'tour_location_ping';
export const TOUR_TRACKING_START_ACTION = 'tour_tracking_started';
export const TOUR_TRACKING_STOP_ACTION = 'tour_tracking_stopped';

export const buildTourTrackingUrl = (groupId) => {
  if (typeof window === 'undefined') {
    return `/track/tour/${groupId}`;
  }
  return `${window.location.origin}/track/tour/${groupId}`;
};

const parseJsonResponse = async (response) => {
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message = typeof data === 'string' ? data : data?.error || data?.message || response.statusText;
    throw new Error(message || 'Request failed');
  }

  return data;
};

const requestTourTrackingApi = async (path, options = {}) => {
  try {
    return await adminApiRequest(path, options);
  } catch (error) {
    if (options.method && options.method !== 'GET') {
      const headers = options.body ? { 'Content-Type': 'application/json', ...(options.headers || {}) } : (options.headers || {});
      const response = await fetch(path, { ...options, headers });
      return parseJsonResponse(response);
    }
    const response = await fetch(path, options);
    return parseJsonResponse(response);
  }
};

export const logTourTrackingEvent = async ({
  groupId,
  user,
  description,
  actionType,
  metadata = {},
}) => {
  if (!groupId) return { success: false };

  return requestTourTrackingApi('/api/tour-tracking', {
    method: 'POST',
    body: JSON.stringify({
      groupId,
      description,
      actionType,
      userEmail: user?.email || '',
      metadata,
    }),
  });
};

export const logTourLocationPing = async ({
  groupId,
  user,
  position,
  metadata = {},
}) => {
  const coords = position?.coords;
  if (!groupId || !coords) {
    return { success: false };
  }

  return logTourTrackingEvent({
    groupId,
    user,
    actionType: TOUR_TRACKING_ACTION,
    description: 'Guide location updated',
    metadata: {
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy ?? null,
      speed: coords.speed ?? null,
      heading: coords.heading ?? null,
      altitude: coords.altitude ?? null,
      captured_at: new Date(position.timestamp || Date.now()).toISOString(),
      ...metadata,
    },
  });
};

export const fetchTourTrackingLogs = async (groupIds = []) => {
  const normalizedGroupIds = [...new Set(groupIds.filter(Boolean).map(String))];
  const query = normalizedGroupIds.length > 0
    ? `?groupIds=${encodeURIComponent(normalizedGroupIds.join(','))}`
    : '';
  const response = await requestTourTrackingApi(`/api/tour-tracking${query}`);
  return response?.logs || [];
};

export const fetchRecentTrackedTours = async () => {
  const response = await requestTourTrackingApi('/api/tour-tracking');
  return response?.activeTours || [];
};

export const groupTrackingLogsByTour = (logs = []) => {
  const grouped = new Map();

  logs.forEach((log) => {
    const metadata = log.metadata || {};
    const groupId = String(metadata.group_id || metadata.groupId || '');
    if (!groupId) return;

    const gpsLocation = log.gps_location && typeof log.gps_location === 'object' ? log.gps_location : {};
    const point = {
      id: log.id,
      groupId,
      latitude: Number(gpsLocation.latitude ?? metadata.latitude),
      longitude: Number(gpsLocation.longitude ?? metadata.longitude),
      accuracy: Number(gpsLocation.accuracy ?? metadata.accuracy ?? 0),
      speed: Number(metadata.speed || 0),
      heading: Number(metadata.heading || 0),
      capturedAt: metadata.captured_at || log.performed_at || log.created_at,
      guideName: metadata.guide_name || metadata.actor_name || '',
      packageName: metadata.package_name || '',
      quadCount: Number(metadata.quad_count || 0),
    };

    if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) return;

    if (!grouped.has(groupId)) {
      grouped.set(groupId, []);
    }

    grouped.get(groupId).push(point);
  });

  return grouped;
};
