import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Activity, Compass, ExternalLink, MapPinned, Navigation, RefreshCw, Route, Smartphone } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { fetchTourBookings } from '../../services/tourBookingService';
import { buildTourTrackingUrl, fetchRecentTrackedTours, fetchTourTrackingLogs, groupTrackingLogsByTour } from '../../services/tourTrackingService';
import AdminModuleHero from '../../components/admin/AdminModuleHero';
import i18n from '../../i18n';
import { TABLE_NAMES } from '../../config/tableNames';

const TOUR_BOOKING_MARKER = '[tour_booking]';
const TOUR_BOOKINGS_TABLE = TABLE_NAMES.TOUR_BOOKINGS;
const ACTIVITY_LOG_TABLE = TABLE_NAMES.ACTIVITY_LOG;
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';
const MAPBOX_STYLE = 'mapbox://styles/saharax/cmn2feqnl004t01sdfvvb1616';
const MAX_POINT_ACCURACY_METERS = 25;
const FALLBACK_POINT_ACCURACY_METERS = 60;
const MAX_BASE_JUMP_METERS = 35;
const MIN_HEADING_SPEED_MPS = 1.5;
const isFrenchLocale = () => i18n.resolvedLanguage === 'fr';
const tr = (en, fr) => (isFrenchLocale() ? fr : en);

let mapboxLoaderPromise = null;
let leafletLoaderPromise = null;

const toFiniteNumber = (value, fallback = null) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const toTimestamp = (value) => {
  const timestamp = new Date(value || '').getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

const haversineMeters = (from, to) => {
  if (!from || !to) return 0;

  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadius = 6371000;
  const latitudeDelta = toRadians((to.latitude || 0) - (from.latitude || 0));
  const longitudeDelta = toRadians((to.longitude || 0) - (from.longitude || 0));
  const startLatitude = toRadians(from.latitude || 0);
  const endLatitude = toRadians(to.latitude || 0);

  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const normalizeHeading = (value) => {
  const heading = toFiniteNumber(value);
  if (heading === null) return null;
  return ((heading % 360) + 360) % 360;
};

const blendHeading = (previousHeading, nextHeading, weight = 0.35) => {
  if (previousHeading === null) return nextHeading;
  if (nextHeading === null) return previousHeading;

  let delta = nextHeading - previousHeading;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;

  return normalizeHeading(previousHeading + delta * weight);
};

const buildStableTrackingPoints = (points = []) => {
  const sortedPoints = [...points].sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());
  const stablePoints = [];

  sortedPoints.forEach((point) => {
    const latitude = toFiniteNumber(point.latitude);
    const longitude = toFiniteNumber(point.longitude);
    if (latitude === null || longitude === null) return;

    const accuracy = Math.max(0, toFiniteNumber(point.accuracy, 999));
    const speed = Math.max(0, toFiniteNumber(point.speed, 0));
    const timestamp = toTimestamp(point.capturedAt);
    const previousPoint = stablePoints[stablePoints.length - 1] || null;

    if (accuracy > FALLBACK_POINT_ACCURACY_METERS) {
      return;
    }

    if (previousPoint) {
      const elapsedSeconds = Math.max(1, ((timestamp || 0) - (previousPoint._timestamp || 0)) / 1000);
      const distanceFromPrevious = haversineMeters(previousPoint, { latitude, longitude });
      const maxReasonableJump = Math.max(
        MAX_BASE_JUMP_METERS,
        speed > 0 ? speed * elapsedSeconds * 2 + 15 : elapsedSeconds * 12 + 15
      );

      if (distanceFromPrevious > maxReasonableJump && accuracy > previousPoint.accuracy) {
        return;
      }
    }

    const smoothingWeight = accuracy <= 8 ? 0.88 : accuracy <= 15 ? 0.72 : 0.52;
    const smoothedLatitude = previousPoint
      ? previousPoint.latitude * (1 - smoothingWeight) + latitude * smoothingWeight
      : latitude;
    const smoothedLongitude = previousPoint
      ? previousPoint.longitude * (1 - smoothingWeight) + longitude * smoothingWeight
      : longitude;

    const rawHeading = normalizeHeading(point.heading);
    const effectiveHeading = speed >= MIN_HEADING_SPEED_MPS
      ? blendHeading(previousPoint?.heading ?? null, rawHeading)
      : previousPoint?.heading ?? rawHeading;

    stablePoints.push({
      ...point,
      latitude: smoothedLatitude,
      longitude: smoothedLongitude,
      accuracy,
      speed,
      heading: effectiveHeading,
      _timestamp: timestamp,
    });
  });

  return stablePoints;
};

const buildAtvMarkerHtml = () => `
  <div style="position:relative;width:42px;height:52px;display:flex;align-items:flex-end;justify-content:center;">
    <div style="position:absolute;bottom:0;width:18px;height:18px;background:#dc2626;transform:rotate(45deg);border-radius:4px;box-shadow:0 10px 18px rgba(15,23,42,0.22);"></div>
    <div style="position:absolute;bottom:12px;width:42px;height:30px;display:flex;align-items:center;justify-content:center;">
      <div style="position:relative;width:36px;height:22px;">
        <div style="position:absolute;left:3px;right:3px;top:5px;height:11px;border-radius:8px;background:#ef4444;border:2px solid #ffffff;box-shadow:0 8px 16px rgba(15,23,42,0.2);"></div>
        <div style="position:absolute;left:9px;top:1px;width:18px;height:7px;border-radius:999px 999px 4px 4px;background:#b91c1c;border:2px solid #ffffff;border-bottom:none;"></div>
        <div style="position:absolute;left:1px;bottom:0;width:10px;height:10px;border-radius:999px;background:#111827;border:2px solid #ffffff;"></div>
        <div style="position:absolute;right:1px;bottom:0;width:10px;height:10px;border-radius:999px;background:#111827;border:2px solid #ffffff;"></div>
      </div>
    </div>
  </div>
`;

const createLeafletAtvIcon = (L) =>
  L.divIcon({
    className: 'tour-live-atv-marker',
    html: buildAtvMarkerHtml(),
    iconSize: [42, 52],
    iconAnchor: [21, 50],
  });

const extractMarkedJson = (value, marker) => {
  const text = typeof value === 'string' ? value : '';
  const markerIndex = text.indexOf(marker);
  if (markerIndex === -1) return null;

  try {
    return JSON.parse(text.slice(markerIndex + marker.length).trim());
  } catch {
    return null;
  }
};

const normalizeTourRows = (rows = []) => {
  const grouped = new Map();

  rows.forEach((row) => {
    const metadata = extractMarkedJson(row.notes, TOUR_BOOKING_MARKER);
    if (!metadata?.groupId) return;

    const groupId = metadata.groupId;
    if (!grouped.has(groupId)) {
      grouped.set(groupId, []);
    }

    grouped.get(groupId).push({ ...row, tourMeta: metadata });
  });

  return Array.from(grouped.entries()).map(([groupId, groupRows]) => {
    const sortedRows = [...groupRows].sort(
      (a, b) => new Date(a.rental_start_date || a.created_at).getTime() - new Date(b.rental_start_date || b.created_at).getTime()
    );
    const first = sortedRows[0];
    const meta = first.tourMeta || {};
    const assignedVehicles = sortedRows.map((row) => row.vehicle).filter(Boolean);
    const statuses = sortedRows.map((row) => String(row.rental_status || row.status || 'scheduled').toLowerCase());
    const status = statuses.includes('active')
      ? 'active'
      : statuses.every((value) => value === 'completed')
        ? 'completed'
        : statuses.every((value) => value === 'cancelled')
          ? 'cancelled'
          : 'scheduled';

    return {
      groupId,
      status,
      rowIds: sortedRows.map((row) => row.id),
      packageName: meta.packageName || tr('Tour package', 'Package tour'),
      customerName: first.customer_name || meta.customerName || 'Riders',
      guideName: meta.guideName || meta.startedByName || tr('Guide pending', 'Guide en attente'),
      guideId: meta.guideId || '',
      quadCount: Number(meta.quadCount || sortedRows.length || 1),
      ridersCount: Number(meta.ridersCount || sortedRows.length || 1),
      scheduledStartAt: meta.scheduledStartAt || first.rental_start_date || first.created_at,
      scheduledEndAt: meta.scheduledEndAt || sortedRows[sortedRows.length - 1]?.rental_end_date || first.updated_at,
      startedAt: meta.startedAt || '',
      trackingUrl: meta.trackingUrl || buildTourTrackingUrl(groupId),
      assignedVehicles,
    };
  });
};

const formatDateTime = (value) => {
  if (!value) return tr('Not started yet', 'Pas encore démarré');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return tr('Not available', 'Non disponible');
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatLastPing = (value) => {
  if (!value) return tr('No GPS ping yet', 'Aucun point GPS pour le moment');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return tr('No GPS ping yet', 'Aucun point GPS pour le moment');

  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60 * 1000) return tr('Updated just now', "Mis à jour à l'instant");
  if (diffMs < 60 * 60 * 1000) return `${Math.floor(diffMs / 60000)}m ago`;
  return `${Math.floor(diffMs / (60 * 60 * 1000))}h ago`;
};

const formatGuestSummary = (tour) => {
  const leadName = String(tour?.customerName || '').trim();
  const ridersCount = Number(tour?.ridersCount || 0);

  if (ridersCount > 1 && leadName) {
    return isFrenchLocale() ? `${leadName} + ${ridersCount - 1} de plus` : `${leadName} + ${ridersCount - 1} more`;
  }

  if (ridersCount > 1) {
    return isFrenchLocale() ? `${ridersCount} pilotes` : `${ridersCount} riders`;
  }

  return leadName || tr('Riders', 'Pilotes');
};

const loadMapbox = () => {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.mapboxgl) return Promise.resolve(window.mapboxgl);
  if (mapboxLoaderPromise) return mapboxLoaderPromise;

  mapboxLoaderPromise = new Promise((resolve, reject) => {
    const existingCss = document.querySelector('link[data-mapbox-gl]');
    if (!existingCss) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.20.0/mapbox-gl.css';
      link.dataset.mapboxGl = 'true';
      document.head.appendChild(link);
    }

    const script = document.createElement('script');
    script.src = 'https://api.mapbox.com/mapbox-gl-js/v3.20.0/mapbox-gl.js';
    script.async = true;
    script.onload = () => resolve(window.mapboxgl);
    script.onerror = () => reject(new Error('Unable to load Mapbox GL JS'));
    document.body.appendChild(script);
  });

  return mapboxLoaderPromise;
};

const loadLeaflet = () => {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.L) return Promise.resolve(window.L);
  if (leafletLoaderPromise) return leafletLoaderPromise;

  leafletLoaderPromise = new Promise((resolve, reject) => {
    const existingCss = document.querySelector('link[data-leaflet]');
    if (!existingCss) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.dataset.leaflet = 'true';
      document.head.appendChild(link);
    }

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error('Unable to load Leaflet'));
    document.body.appendChild(script);
  });

  return leafletLoaderPromise;
};

const LiveMap = () => {
  const isFrench = isFrenchLocale();
  const location = useLocation();
  const { userProfile } = useAuth();
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const routeLayerRef = useRef(null);
  const mapEngineRef = useRef(null);
  const realtimeReloadTimerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTours, setActiveTours] = useState([]);
  const [trackingByGroup, setTrackingByGroup] = useState(new Map());
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const requestedGroupId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return String(params.get('groupId') || '').trim();
  }, [location.search]);

  const loadMapData = useCallback(async (silent = false) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const bookingRows = await fetchTourBookings();
      const bookingTours = normalizeTourRows(bookingRows)
        .filter((tour) => tour.status === 'active')
        .sort((a, b) => new Date(a.startedAt || a.scheduledStartAt).getTime() - new Date(b.startedAt || b.scheduledStartAt).getTime());
      const toursByGroup = new Map();

      bookingTours.forEach((tour) => {
        toursByGroup.set(tour.groupId, tour);
      });

      const trackedTours = await fetchRecentTrackedTours();
      const trackedGroupIds = new Set(trackedTours.map((tour) => String(tour.groupId || '')));
      trackedTours.forEach((tour) => {
        const existing = toursByGroup.get(tour.groupId);
        if (!existing) return;

        toursByGroup.set(tour.groupId, {
          ...existing,
          trackingUrl: existing.trackingUrl || tour.trackingUrl || buildTourTrackingUrl(tour.groupId),
          scheduledStartAt: existing.scheduledStartAt || tour.startedAt || tour.latestPingAt,
          scheduledEndAt: existing.scheduledEndAt || '',
          customerName: existing.customerName || tour.customerName || 'Riders',
          guideName: existing.guideName || tour.guideName || 'Guide',
          quadCount: existing.quadCount || tour.quadCount || 0,
          ridersCount: existing.ridersCount || tour.ridersCount || 0,
          startedAt: existing.startedAt || tour.startedAt || '',
          status: 'active',
        });
      });

      const tours = Array.from(toursByGroup.values())
        .filter((tour) => tour.status === 'active')
        .sort((a, b) => {
          const aTracked = trackedGroupIds.has(String(a.groupId)) ? 1 : 0;
          const bTracked = trackedGroupIds.has(String(b.groupId)) ? 1 : 0;
          if (aTracked !== bTracked) return bTracked - aTracked;
          return new Date(a.startedAt || a.scheduledStartAt).getTime() - new Date(b.startedAt || b.scheduledStartAt).getTime();
        });

      const trackingLogs = await fetchTourTrackingLogs(tours.map((tour) => tour.groupId));
      const groupedTracking = groupTrackingLogsByTour(trackingLogs);
      const trackedGroupIdsWithPoints = new Set(
        Array.from(groupedTracking.entries())
          .filter(([, points]) => Array.isArray(points) && points.length > 0)
          .map(([groupId]) => String(groupId))
      );
      const preferredTrackedTour = tours.find((tour) => trackedGroupIdsWithPoints.has(String(tour.groupId)));

      setActiveTours(tours);
      setTrackingByGroup(groupedTracking);
      setSelectedGroupId((prev) => {
        const requestedHasPoints = requestedGroupId && trackedGroupIdsWithPoints.has(String(requestedGroupId));
        if (requestedHasPoints && tours.some((tour) => String(tour.groupId) === String(requestedGroupId))) {
          return requestedGroupId;
        }
        const prevHasPoints = Array.isArray(groupedTracking.get(prev)) && groupedTracking.get(prev).length > 0;
        if (prev && tours.some((tour) => tour.groupId === prev) && prevHasPoints) {
          return prev;
        }
        if (preferredTrackedTour?.groupId) {
          return preferredTrackedTour.groupId;
        }
        return tours.some((tour) => tour.groupId === prev) ? prev : tours[0]?.groupId || '';
      });
    } catch (error) {
      console.error('Failed to load live tour map:', error);
      setActiveTours([]);
      setTrackingByGroup(new Map());
      setSelectedGroupId('');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [requestedGroupId]);

  useEffect(() => {
    loadMapData();
  }, [loadMapData]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      loadMapData(true);
    }, 4000);

    return () => window.clearInterval(interval);
  }, [loadMapData]);

  useEffect(() => {
    const queueReload = () => {
      if (realtimeReloadTimerRef.current) {
        clearTimeout(realtimeReloadTimerRef.current);
      }

      realtimeReloadTimerRef.current = setTimeout(() => {
        loadMapData(true);
      }, 250);
    };

    const bookingsChannel = supabase
      .channel('live-map-tour-bookings')
      .on('postgres_changes', { event: '*', schema: 'public', table: TOUR_BOOKINGS_TABLE }, queueReload)
      .subscribe();

    const trackingChannel = supabase
      .channel('live-map-tour-tracking')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: ACTIVITY_LOG_TABLE, filter: 'resource_type=eq.tour_tracking' },
        queueReload
      )
      .subscribe();

    return () => {
      if (realtimeReloadTimerRef.current) {
        clearTimeout(realtimeReloadTimerRef.current);
      }
      supabase.removeChannel(bookingsChannel);
      supabase.removeChannel(trackingChannel);
    };
  }, [loadMapData]);

  const selectedTour = useMemo(
    () => activeTours.find((tour) => tour.groupId === selectedGroupId) || activeTours[0] || null,
    [activeTours, selectedGroupId]
  );
  const isOwner = String(userProfile?.role || '').toLowerCase() === 'owner';

  const selectedPoints = useMemo(() => {
    if (!selectedTour) return [];
    return trackingByGroup.get(selectedTour.groupId) || [];
  }, [selectedTour, trackingByGroup]);

  const stableSelectedPoints = useMemo(() => buildStableTrackingPoints(selectedPoints), [selectedPoints]);
  const latestPoint = stableSelectedPoints[stableSelectedPoints.length - 1] || null;
  const recentPoints = useMemo(() => stableSelectedPoints.slice(-5).reverse(), [stableSelectedPoints]);

  useEffect(() => {
    let cancelled = false;

    const setupMap = async () => {
      if (!mapContainerRef.current || !latestPoint || !selectedTour) return;

      try {
        const useLeaflet = !MAPBOX_TOKEN;

        if (useLeaflet) {
          const L = await loadLeaflet();
          if (!L || cancelled) return;

          if (mapEngineRef.current !== 'leaflet' && mapRef.current?.remove) {
            mapRef.current.remove();
            mapRef.current = null;
            markerRef.current = null;
            routeLayerRef.current = null;
          }

          mapEngineRef.current = 'leaflet';

          if (!mapRef.current) {
            mapRef.current = L.map(mapContainerRef.current, {
              zoomControl: true,
              attributionControl: true,
            }).setView([latestPoint.latitude, latestPoint.longitude], 15);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
              maxZoom: 19,
              attribution: '&copy; OpenStreetMap contributors',
            }).addTo(mapRef.current);
          }

          if (routeLayerRef.current) {
            mapRef.current.removeLayer(routeLayerRef.current);
            routeLayerRef.current = null;
          }

          if (!markerRef.current) {
            markerRef.current = L.marker([latestPoint.latitude, latestPoint.longitude], {
              icon: createLeafletAtvIcon(L),
            }).addTo(mapRef.current);
          } else {
            markerRef.current.setLatLng([latestPoint.latitude, latestPoint.longitude]);
          }

          mapRef.current.setView(
            [latestPoint.latitude, latestPoint.longitude],
            Math.max(mapRef.current.getZoom(), 15),
          );

          setTimeout(() => {
            mapRef.current?.invalidateSize?.();
          }, 50);

          return;
        }

        const mapboxgl = await loadMapbox();
        if (!mapboxgl || cancelled) return;

        if (mapEngineRef.current !== 'mapbox' && mapRef.current?.remove) {
          mapRef.current.remove();
          mapRef.current = null;
          markerRef.current = null;
          routeLayerRef.current = null;
        }

        mapEngineRef.current = 'mapbox';
        mapboxgl.accessToken = MAPBOX_TOKEN;

        if (!mapRef.current) {
          mapRef.current = new mapboxgl.Map({
            container: mapContainerRef.current,
            style: MAPBOX_STYLE,
            center: [latestPoint.longitude, latestPoint.latitude],
            zoom: 15.5,
            pitch: 50,
            bearing: Number.isFinite(latestPoint.heading) ? latestPoint.heading : 0,
            attributionControl: false,
          });

          mapContainerRef.current.style.minHeight = '620px';
          mapContainerRef.current.style.height = '100%';
          mapContainerRef.current.style.width = '100%';

          mapRef.current.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');

          mapRef.current.on('load', () => {
            if (!mapRef.current.getSource('tour-trace')) {
              mapRef.current.addSource('tour-trace', {
                type: 'geojson',
                data: {
                  type: 'Feature',
                  properties: {},
                  geometry: {
                    type: 'LineString',
                    coordinates: [],
                  },
                },
                lineMetrics: true,
              });

              mapRef.current.addSource('tour-trace-completed', {
                type: 'geojson',
                data: {
                  type: 'Feature',
                  properties: {},
                  geometry: {
                    type: 'LineString',
                    coordinates: [],
                  },
                },
              });

              mapRef.current.addSource('tour-trace-remaining', {
                type: 'geojson',
                data: {
                  type: 'Feature',
                  properties: {},
                  geometry: {
                    type: 'LineString',
                    coordinates: [],
                  },
                },
              });

              mapRef.current.addLayer({
                id: 'tour-trace-glow',
                type: 'line',
                source: 'tour-trace',
                paint: {
                  'line-color': '#22d3ee',
                  'line-width': 12,
                  'line-opacity': 0.22,
                },
              });

              mapRef.current.addLayer({
                id: 'tour-trace-casing',
                type: 'line',
                source: 'tour-trace',
                paint: {
                  'line-color': '#1d4ed8',
                  'line-width': 8,
                  'line-opacity': 0.85,
                },
              });

              mapRef.current.addLayer({
                id: 'tour-trace-remaining-line',
                type: 'line',
                source: 'tour-trace-remaining',
                paint: {
                  'line-color': '#93c5fd',
                  'line-width': 4,
                  'line-opacity': 0.55,
                  'line-dasharray': [1.4, 1.2],
                },
              });

              mapRef.current.addLayer({
                id: 'tour-trace-completed-line',
                type: 'line',
                source: 'tour-trace-completed',
                paint: {
                  'line-color': '#22d3ee',
                  'line-width': 4.5,
                  'line-opacity': 0.98,
                },
              });
            }
          });
        }

        const markerElement = markerRef.current || document.createElement('div');
        markerRef.current = markerElement;
        markerElement.className = 'tour-live-marker';
        markerElement.innerHTML = buildAtvMarkerHtml();

        if (!markerElement.__markerInstance) {
          markerElement.__markerInstance = new mapboxgl.Marker({ element: markerElement, anchor: 'bottom' })
            .setLngLat([latestPoint.longitude, latestPoint.latitude])
            .addTo(mapRef.current);
        } else {
          markerElement.__markerInstance.setLngLat([latestPoint.longitude, latestPoint.latitude]);
        }

        const syncMapData = () => {
          if (!mapRef.current?.isStyleLoaded()) return;

          const coordinates = stableSelectedPoints
            .map((point) => [point.longitude, point.latitude])
            .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));

          const completedCoordinates = coordinates;
          const remainingCoordinates = coordinates.length > 0 ? [coordinates[coordinates.length - 1], coordinates[coordinates.length - 1]] : [];

          const source = mapRef.current.getSource('tour-trace');
          if (source) {
            source.setData({
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates,
              },
            });
          }

          const completedSource = mapRef.current.getSource('tour-trace-completed');
          if (completedSource) {
            completedSource.setData({
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: completedCoordinates,
              },
            });
          }

          const remainingSource = mapRef.current.getSource('tour-trace-remaining');
          if (remainingSource) {
            remainingSource.setData({
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: remainingCoordinates,
              },
            });
          }

          mapRef.current.easeTo({
            center: [latestPoint.longitude, latestPoint.latitude],
            duration: 900,
            zoom: Math.max(mapRef.current.getZoom(), 15),
            pitch: 58,
            bearing: Number.isFinite(latestPoint.heading) ? latestPoint.heading : mapRef.current.getBearing(),
          });

          setTimeout(() => {
            mapRef.current?.resize();
          }, 50);
          setTimeout(() => {
            mapRef.current?.resize();
          }, 250);
        };

        if (mapRef.current.isStyleLoaded()) {
          syncMapData();
        } else {
          mapRef.current.once('load', syncMapData);
        }
      } catch (error) {
        console.error('Failed to initialize live map:', error);
      }
    };

    setupMap();

    return () => {
      cancelled = true;
    };
  }, [latestPoint, selectedTour, stableSelectedPoints]);

  useEffect(() => {
    const handleResize = () => {
      mapRef.current?.resize?.();
      mapRef.current?.invalidateSize?.();
    };

    window.addEventListener('resize', handleResize);
    const timeout = window.setTimeout(() => {
      mapRef.current?.resize();
    }, 150);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.clearTimeout(timeout);
    };
  }, [selectedGroupId]);

  useEffect(() => () => {
    if (markerRef.current?.__markerInstance) {
      markerRef.current.__markerInstance.remove();
    }
    if (routeLayerRef.current?.remove) {
      routeLayerRef.current.remove();
    }
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
  }, []);

  return (
    <div className="min-h-full bg-slate-50">
      <AdminModuleHero
        icon={<Compass className="h-8 w-8 text-white" />}
        eyebrow={tr('Live Tour Map', 'Carte des tours en direct')}
        title={tr('Track active guides in real time', 'Suivez les guides actifs en temps réel')}
        description={tr('Follow live GPS pings from each guide and open the tracker directly when a tour is out.', 'Suivez les points GPS en direct de chaque guide et ouvrez directement le traceur lorsqu’un tour est en cours.')}
        actions={
          <>
            <Link
              to="/admin/tours?tab=schedule"
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all duration-200 hover:border-violet-200 hover:text-violet-700"
            >
              <Compass className="h-4 w-4" />
              {tr('Schedule', 'Planning')}
            </Link>
            <button
              type="button"
              onClick={() => loadMapData(true)}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all duration-200 hover:border-violet-200 hover:text-violet-700"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              {tr('Refresh', 'Actualiser')}
            </button>
          </>
        }
      />

      <div className="mt-5 grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        {/* Left panel — active tours list */}
        <section className="rounded-xl border-2 border-violet-200 bg-white shadow-sm">
          <div className="border-b border-violet-100 px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-400">{tr('Active Tours', 'Tours actifs')}</p>
              <h2 className="mt-1 text-lg font-black text-slate-900">{isFrench ? `${activeTours.length} en cours` : `${activeTours.length} out now`}</h2>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {tr('Live', 'En direct')}
            </span>
          </div>

          <div className="p-4">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="h-24 animate-pulse rounded-xl bg-slate-100" />
                ))}
              </div>
            ) : activeTours.length === 0 ? (
              <div className="rounded-xl border border-dashed border-violet-200 bg-violet-50/40 px-5 py-10 text-center">
                <MapPinned className="mx-auto h-9 w-9 text-violet-300" />
                <h3 className="mt-3 text-base font-bold text-slate-900">{tr('No tours live right now', 'Aucun tour en direct pour le moment')}</h3>
                <p className="mt-1.5 text-sm text-slate-500">{tr('Once a guide starts a tour and enables phone tracking, the live route will appear here.', 'Dès qu’un guide démarre un tour et active le suivi téléphone, l’itinéraire en direct apparaîtra ici.')}</p>
                <Link
                  to="/admin/tours?tab=schedule"
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700"
                >
                  <Compass className="h-4 w-4" />
                  {tr('Go to Tours', 'Aller aux tours')}
                </Link>
              </div>
            ) : (
              <div className="space-y-2.5">
                {activeTours.map((tour) => {
                  const points = trackingByGroup.get(tour.groupId) || [];
                  const latest = points[points.length - 1];
                  const isSelected = selectedTour?.groupId === tour.groupId;

                  return (
                    <button
                      key={tour.groupId}
                      type="button"
                      onClick={() => setSelectedGroupId(tour.groupId)}
                      className={`w-full rounded-xl border-2 p-4 text-left transition ${
                        isSelected
                          ? 'border-violet-400 bg-violet-50 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/30'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-base font-bold text-slate-900 truncate">{tour.packageName}</p>
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">{tr('Active', 'Actif')}</span>
                          </div>
                          <p className="mt-0.5 text-sm text-slate-600">{formatGuestSummary(tour)}</p>
                          <p className="text-xs text-slate-400">{tour.guideName} · {tour.quadCount} {tr('quads', 'quads')}</p>
                        </div>
                        <Navigation className={`h-4 w-4 shrink-0 mt-0.5 ${isSelected ? 'text-violet-600' : 'text-slate-400'}`} />
                      </div>

                      {/* KM pricing style data rows */}
                      <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">{tr('Started', 'Démarré')}</span>
                          <span className="font-semibold text-slate-900">{formatDateTime(tour.startedAt || tour.scheduledStartAt)}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">{tr('Last GPS', 'Dernier GPS')}</span>
                          <span className="font-semibold text-violet-700">{formatLastPing(latest?.capturedAt)}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Right panel — map + details */}
        <section className="rounded-xl border-2 border-violet-200 bg-white shadow-sm">
          {/* Section header */}
          <div className="border-b border-violet-100 px-5 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-400">{tr('Live Route', 'Itinéraire en direct')}</p>
              <h2 className="mt-1 text-lg font-bold text-slate-900">
                {selectedTour ? selectedTour.packageName : tr('Waiting for active tours', 'En attente de tours actifs')}
              </h2>
              {selectedTour && (
                <p className="text-xs text-slate-500">
                  {selectedTour.guideName} · {selectedTour.ridersCount || 1} {tr('riders', 'pilotes')} · {selectedTour.quadCount} {tr('quads', 'quads')}
                </p>
              )}
            </div>

            {selectedTour && (
              <div className="flex flex-wrap items-center gap-2">
                {isOwner && (
                  <a
                    href={selectedTour.trackingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:from-violet-700 hover:to-indigo-800"
                  >
                    <Smartphone className="h-4 w-4" />
                    {tr('Open tracker', 'Ouvrir le traceur')}
                  </a>
                )}
                {latestPoint && (
                  <a
                    href={`https://www.google.com/maps?q=${latestPoint.latitude},${latestPoint.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    <ExternalLink className="h-4 w-4" />
                    {tr('Open in Maps', 'Ouvrir dans Maps')}
                  </a>
                )}
              </div>
            )}
          </div>

          {!selectedTour ? (
            <div className="flex min-h-[480px] items-center justify-center rounded-b-xl bg-violet-50/30 p-8">
              <div className="max-w-md text-center">
                <Route className="mx-auto h-12 w-12 text-violet-300" />
                <h3 className="mt-4 text-xl font-bold text-slate-900">{tr('No live route yet', 'Pas encore d’itinéraire en direct')}</h3>
                <p className="mt-2 text-sm text-slate-500">
                  {tr('Once a tour is active and the guide enables phone tracking, the moving route and live vehicle marker appear here.', 'Quand un tour est actif et que le guide active le suivi téléphone, l’itinéraire mobile et le marqueur véhicule apparaissent ici.')}
                </p>
              </div>
            </div>
          ) : (
            <div className="p-5 space-y-4">
              {/* Map — clean, no overlays blocking it */}
              <div className="overflow-hidden rounded-xl border-2 border-violet-200 shadow-sm">
                {/* Map status bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-violet-100 bg-violet-50/60 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-violet-600" />
                    <span className="text-sm font-semibold text-violet-700">{tr('Live moving trace', 'Trace mobile en direct')}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      {selectedPoints.length} {tr('pings', 'points')}
                    </span>
                    <span className="rounded-lg bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-700">
                      {selectedTour.quadCount} {isFrench ? `quad${selectedTour.quadCount === 1 ? '' : 's'}` : `quad${selectedTour.quadCount === 1 ? '' : 's'}`}
                    </span>
                    <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      {formatLastPing(latestPoint?.capturedAt)}
                    </span>
                  </div>
                </div>

                {/* Map container — no overlays inside */}
                <div
                  ref={mapContainerRef}
                  className="h-[480px] w-full"
                  style={{ minHeight: '480px', width: '100%' }}
                />
              </div>

              {/* Info bar below the map — Guide / Guests / Vehicles / GPS */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border-2 border-violet-100 bg-white px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-400">{tr('Guide', 'Guide')}</p>
                  <p className="mt-1 text-sm font-bold text-slate-900 truncate">{selectedTour.guideName}</p>
                </div>
                <div className="rounded-xl border-2 border-violet-100 bg-white px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-400">{tr('Guests', 'Invités')}</p>
                  <p className="mt-1 text-sm font-bold text-slate-900 truncate">{formatGuestSummary(selectedTour)}</p>
                </div>
                <div className="rounded-xl border-2 border-violet-100 bg-white px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-400">{tr('Vehicles', 'Véhicules')}</p>
                  <p className="mt-1 text-sm font-bold text-slate-900 truncate">
                    {selectedTour.assignedVehicles.map((v) => v?.plate_number).filter(Boolean).join(', ') || tr('Pending', 'En attente')}
                  </p>
                </div>
                <div className="rounded-xl border-2 border-violet-100 bg-white px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-400">{tr('Position', 'Position')}</p>
                  <p className="mt-1 text-sm font-bold text-violet-700 truncate">
                    {latestPoint ? `${latestPoint.latitude.toFixed(4)}, ${latestPoint.longitude.toFixed(4)}` : tr('Waiting…', 'En attente…')}
                  </p>
                </div>
              </div>

              {/* Recent pings — KM pricing style data rows */}
              <div className="rounded-xl border-2 border-violet-200 bg-white">
                <div className="border-b border-violet-100 px-5 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-400">{tr('Recent GPS pings', 'Points GPS récents')}</p>
                </div>
                <div className="divide-y divide-slate-100">
                  {recentPoints.length === 0 ? (
                    <p className="px-5 py-4 text-sm text-slate-400">{tr('Waiting for route movement…', "En attente du mouvement de l'itinéraire…")}</p>
                  ) : (
                    recentPoints.map((point, index) => (
                      <div key={point.id || `${point.latitude}-${point.longitude}-${index}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                        <span className="font-semibold text-slate-900">{index === 0 ? tr('Latest ping', 'Dernier point') : (isFrench ? `Point −${index}` : `Ping −${index}`)}</span>
                        <span className="text-slate-500">{point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}</span>
                        <span className="text-xs font-medium text-violet-600 shrink-0">{formatLastPing(point.capturedAt)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default LiveMap;
