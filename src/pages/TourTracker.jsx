import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { AlertTriangle, Compass, Loader2, MapPinned, Smartphone, StopCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchTourBookings } from '../services/tourBookingService';
import i18n from '../i18n';
import {
  TOUR_TRACKING_START_ACTION,
  TOUR_TRACKING_STOP_ACTION,
  TOUR_TRACKING_NOT_STARTED,
  TOUR_TRACKING_OWNER_CONFLICT,
  buildTourTrackingUrl,
  logTourLocationPing,
  logTourTrackingEvent,
} from '../services/tourTrackingService';

const TOUR_BOOKING_MARKER = '[tour_booking]';
const TRACKER_SESSION_STORAGE_PREFIX = 'tour_tracker_session:';
const HEARTBEAT_DUPLICATE_DISTANCE_METERS = 8;
const HEARTBEAT_FORCE_SEND_AFTER_MS = 45000;

const toRadians = (degrees) => (degrees * Math.PI) / 180;

const distanceBetweenCoordsMeters = (from, to) => {
  if (!from || !to) return Number.POSITIVE_INFINITY;

  const earthRadius = 6371000;
  const latitudeDelta = toRadians((to.latitude || 0) - (from.latitude || 0));
  const longitudeDelta = toRadians((to.longitude || 0) - (from.longitude || 0));
  const startLatitude = toRadians(from.latitude || 0);
  const endLatitude = toRadians(to.latitude || 0);

  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

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

const findTourByGroupId = (rows = [], groupId) => {
  const matches = rows
    .map((row) => {
      const metadata = extractMarkedJson(row.notes, TOUR_BOOKING_MARKER);
      if (!metadata?.groupId || String(metadata.groupId) !== String(groupId)) return null;
      return { ...row, tourMeta: metadata };
    })
    .filter(Boolean);

  if (matches.length === 0) return null;

  const sortedRows = [...matches].sort(
    (a, b) => new Date(a.rental_start_date || a.created_at).getTime() - new Date(b.rental_start_date || b.created_at).getTime()
  );
  const first = sortedRows[0];
  const meta = first.tourMeta || {};

  return {
    groupId,
    packageName: meta.packageName || 'Tour package',
    customerName: first.customer_name || meta.customerName || 'Guest',
    guideName: meta.guideName || meta.startedByName || 'Guide',
    guideId: meta.guideId || '',
    quadCount: Number(meta.quadCount || sortedRows.length || 1),
    ridersCount: Number(meta.ridersCount || sortedRows.length || 1),
    startedAt: meta.startedAt || '',
    scheduledStartAt: meta.scheduledStartAt || first.rental_start_date || first.created_at,
    status: String(first.rental_status || 'scheduled').toLowerCase(),
    trackingUrl: meta.trackingUrl || buildTourTrackingUrl(groupId),
  };
};

const getTrackerSessionStorageKey = (groupId) => `${TRACKER_SESSION_STORAGE_PREFIX}${groupId}`;

const getOrCreateTrackerSessionId = (groupId) => {
  if (!groupId || typeof window === 'undefined') return '';
  const storageKey = getTrackerSessionStorageKey(groupId);
  const existing = window.localStorage.getItem(storageKey);
  if (existing) return existing;
  const nextSessionId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `tracker_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(storageKey, nextSessionId);
  return nextSessionId;
};

const TourTracker = () => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const { groupId } = useParams();
  const location = useLocation();
  const { user, userProfile } = useAuth();
  const watchIdRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);
  const wakeLockRef = useRef(null);
  const lastPositionRef = useRef(null);
  const lastSentPingRef = useRef(null);
  const callbackNotificationAttemptedRef = useRef(false);
  const trackingStartLoggedRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [tour, setTour] = useState(null);
  const [permissionError, setPermissionError] = useState('');
  const [trackingActive, setTrackingActive] = useState(false);
  const [lastPosition, setLastPosition] = useState(null);
  const [lastSentAt, setLastSentAt] = useState('');
  const [pingCount, setPingCount] = useState(0);
  const [starting, setStarting] = useState(false);
  const [callbackPromptVisible, setCallbackPromptVisible] = useState(false);
  const [timeTick, setTimeTick] = useState(Date.now());

  const trackerParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const callbackPhone = useMemo(
    () => String(trackerParams.get('callbackPhone') || '').replace(/\D/g, ''),
    [trackerParams]
  );
  const adminLiveMapUrl = useMemo(() => {
    const raw = String(trackerParams.get('adminLiveMapUrl') || '').trim();
    if (raw) return raw;
    try {
      return `${new URL(buildTourTrackingUrl(groupId)).origin}/admin/live-map?groupId=${encodeURIComponent(groupId || '')}`;
    } catch {
      return `/admin/live-map?groupId=${encodeURIComponent(groupId || '')}`;
    }
  }, [groupId, trackerParams]);
  const trackerSessionId = useMemo(() => getOrCreateTrackerSessionId(groupId), [groupId]);

  const userActor = useMemo(
    () => ({
      id: userProfile?.id || user?.id || null,
      email: userProfile?.email || user?.email || '',
      full_name: userProfile?.full_name || userProfile?.fullName || userProfile?.name || user?.email || tr('Team Member', "Membre de l'équipe"),
    }),
    [user, userProfile]
  );

  const loadTour = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchTourBookings();
      const nextTour = findTourByGroupId(rows, groupId);
      setTour(nextTour);
    } catch (error) {
      console.error('Failed to load tracker tour:', error);
      setTour(null);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    loadTour();
  }, [loadTour]);

  useEffect(() => {
    lastPositionRef.current = lastPosition;
  }, [lastPosition]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (heartbeatIntervalRef.current !== null) {
        window.clearInterval(heartbeatIntervalRef.current);
      }
      wakeLockRef.current?.release?.().catch(() => {});
      wakeLockRef.current = null;
    };
  }, []);

  const requestWakeLock = useCallback(async () => {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator) || wakeLockRef.current) return;

    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen');
      wakeLockRef.current.addEventListener?.('release', () => {
        wakeLockRef.current = null;
      });
    } catch (error) {
      console.warn('Unable to keep the screen awake for live tracking:', error);
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (!wakeLockRef.current) return;
    try {
      await wakeLockRef.current.release();
    } catch (error) {
      console.warn('Unable to release wake lock:', error);
    } finally {
      wakeLockRef.current = null;
    }
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTimeTick(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  const sendPositionPing = useCallback(async (position, { isHeartbeat = false } = {}) => {
    if (!position?.coords) return false;

    const nextCoords = {
      latitude: Number(position.coords.latitude),
      longitude: Number(position.coords.longitude),
    };
    const nextTimestamp = new Date(position.timestamp || Date.now()).getTime();

    if (isHeartbeat && lastSentPingRef.current) {
      const distanceFromLastSent = distanceBetweenCoordsMeters(lastSentPingRef.current.coords, nextCoords);
      const elapsedSinceLastSent = nextTimestamp - lastSentPingRef.current.timestamp;
      if (
        Number.isFinite(distanceFromLastSent)
        && distanceFromLastSent < HEARTBEAT_DUPLICATE_DISTANCE_METERS
        && elapsedSinceLastSent < HEARTBEAT_FORCE_SEND_AFTER_MS
      ) {
        return false;
      }
    }

    try {
      await logTourLocationPing({
        groupId,
        user: userActor,
        position,
        sessionId: trackerSessionId,
        metadata: {
          package_name: tour?.packageName || '',
          guide_name: tour?.guideName || userActor.full_name,
          customer_name: tour?.customerName || '',
          quad_count: Number(tour?.quadCount || 0),
          riders_count: Number(tour?.ridersCount || 0),
          started_at: tour?.startedAt || new Date().toISOString(),
          heartbeat: isHeartbeat,
        },
      });

      lastSentPingRef.current = {
        coords: nextCoords,
        timestamp: nextTimestamp,
      };
      setLastSentAt(new Date().toISOString());
      setPingCount((prev) => prev + 1);
      setTrackingActive(true);
      if (!isHeartbeat) {
        setPermissionError('');
      }
      return true;
    } catch (error) {
      console.error('Failed to send live tour location:', error);
      if (error?.code === TOUR_TRACKING_OWNER_CONFLICT) {
        setPermissionError(tr(
          'Tracking is already active on another phone. Stop it there before starting here.',
          "Le suivi est déjà actif sur un autre téléphone. Arrêtez-le là-bas avant de démarrer ici."
        ));
        setTrackingActive(false);
        return false;
      }
      if (error?.code === TOUR_TRACKING_NOT_STARTED) {
        setPermissionError(tr(
          'Tap Start sharing location on this phone first.',
          'Appuyez d’abord sur Commencer le partage sur ce téléphone.'
        ));
        setTrackingActive(false);
        return false;
      }
      setPermissionError(tr('Location was captured, but it could not be sent to the live map.', "La position a été capturée, mais elle n'a pas pu être envoyée à la carte en direct."));
      return false;
    }
  }, [groupId, tour, trackerSessionId, tr, userActor]);

  const notifyCallbackPhone = useCallback(() => {
    if (!callbackPhone || callbackNotificationAttemptedRef.current) return false;

    callbackNotificationAttemptedRef.current = true;

    const message = [
      tr(
        `Live location is now active for ${tour?.packageName || 'this tour'}.`,
        `La position en direct est maintenant active pour ${tour?.packageName || 'ce tour'}.`
      ),
      tr(
        `Open admin live map: ${adminLiveMapUrl}`,
        `Ouvrez la carte admin en direct : ${adminLiveMapUrl}`
      ),
    ].join('\n');

    const popup = window.open(
      `https://wa.me/${callbackPhone}?text=${encodeURIComponent(message)}`,
      '_blank',
      'noopener,noreferrer'
    );

    if (!popup) {
      setCallbackPromptVisible(true);
      return false;
    }

    setCallbackPromptVisible(false);
    return true;
  }, [adminLiveMapUrl, callbackPhone, tour?.packageName, tr]);

  useEffect(() => {
    if (!trackingActive) {
      releaseWakeLock();
      if (heartbeatIntervalRef.current !== null) {
        window.clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      return undefined;
    }

    requestWakeLock();

    heartbeatIntervalRef.current = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      const lastKnownPosition = lastPositionRef.current;
      if (!lastKnownPosition?.coords) return;
      sendPositionPing(lastKnownPosition, { isHeartbeat: true }).catch(() => {});
    }, 10000);

    return () => {
      if (heartbeatIntervalRef.current !== null) {
        window.clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    };
  }, [releaseWakeLock, requestWakeLock, sendPositionPing, trackingActive]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && trackingActive) {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [requestWakeLock, trackingActive]);

  const stopTracking = useCallback(async () => {
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (heartbeatIntervalRef.current !== null) {
      window.clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    if (trackingActive) {
      try {
        await logTourTrackingEvent({
          groupId,
          user: userActor,
          sessionId: trackerSessionId,
          actionType: TOUR_TRACKING_STOP_ACTION,
          description: tr('Guide stopped live location tracking', 'Le guide a arrêté le suivi de position en direct'),
          metadata: {
            package_name: tour?.packageName || '',
            guide_name: tour?.guideName || userActor.full_name,
            quad_count: Number(tour?.quadCount || 0),
          },
        });
      } catch (error) {
        console.warn('Unable to log tour tracking stop event:', error);
      }
    }

    releaseWakeLock();
    setTrackingActive(false);
    trackingStartLoggedRef.current = false;
  }, [groupId, releaseWakeLock, trackerSessionId, trackingActive, tour, tr, userActor]);

  const startTracking = useCallback(async () => {
    if (!navigator.geolocation) {
      setPermissionError(tr("This phone or browser does not support live location tracking.", "Ce téléphone ou navigateur ne prend pas en charge le suivi de position en direct."));
      return;
    }

    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    setPermissionError('');
    setStarting(true);
    requestWakeLock();

    try {
      await logTourTrackingEvent({
        groupId,
        user: userActor,
        sessionId: trackerSessionId,
        actionType: TOUR_TRACKING_START_ACTION,
        description: tr('Guide started live location tracking', 'Le guide a démarré le suivi de position en direct'),
        metadata: {
          package_name: tour?.packageName || '',
          guide_name: tour?.guideName || userActor.full_name,
          customer_name: tour?.customerName || '',
          quad_count: Number(tour?.quadCount || 0),
          riders_count: Number(tour?.ridersCount || 0),
          started_at: tour?.startedAt || new Date().toISOString(),
        },
      });
      trackingStartLoggedRef.current = true;
    } catch (error) {
      setStarting(false);
      releaseWakeLock();
      if (error?.code === TOUR_TRACKING_OWNER_CONFLICT) {
        setPermissionError(tr(
          'Tracking is already active on another phone. Stop it there before starting here.',
          "Le suivi est déjà actif sur un autre téléphone. Arrêtez-le là-bas avant de démarrer ici."
        ));
        return;
      }
      console.error('Unable to claim tracking ownership:', error);
      setPermissionError(tr(
        'This phone could not become the active tracker right now.',
        "Ce téléphone n'a pas pu devenir la source active du suivi pour le moment."
      ));
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        setLastPosition(position);
        const sent = await sendPositionPing(position);
        if (sent) {
          notifyCallbackPhone();
        }
        setStarting(false);
      },
      (error) => {
        setStarting(false);
        releaseWakeLock();
        logTourTrackingEvent({
          groupId,
          user: userActor,
          sessionId: trackerSessionId,
          actionType: TOUR_TRACKING_STOP_ACTION,
          description: tr('Guide released live location tracking', 'Le guide a libéré le suivi de position en direct'),
          metadata: {
            package_name: tour?.packageName || '',
            guide_name: tour?.guideName || userActor.full_name,
          },
        }).catch(() => {});
        trackingStartLoggedRef.current = false;
        if (error.code === error.PERMISSION_DENIED) {
          setPermissionError(tr('Location access was denied. Allow GPS on this phone to share the live tour route.', "L'accès à la position a été refusé. Autorisez le GPS sur ce téléphone pour partager l'itinéraire en direct."));
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setPermissionError(tr("The phone could not find a GPS position right now.", "Le téléphone n'a pas pu trouver de position GPS pour le moment."));
        } else if (error.code === error.TIMEOUT) {
          setPermissionError(tr('GPS took too long to respond. Try again in an open area.', 'Le GPS a mis trop de temps à répondre. Réessayez dans une zone dégagée.'));
        } else {
          setPermissionError(tr("Live location could not start on this device.", "La localisation en direct n'a pas pu démarrer sur cet appareil."));
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
      }
    );
  }, [groupId, notifyCallbackPhone, releaseWakeLock, requestWakeLock, sendPositionPing, tour, trackerSessionId, tr, userActor]);

  const triggerHaptic = useCallback((pattern) => {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  }, []);

  const handleStartPress = useCallback(() => {
    triggerHaptic(20);
    startTracking();
  }, [startTracking, triggerHaptic]);

  const handleStopPress = useCallback(() => {
    triggerHaptic([40, 50, 40]);
    stopTracking();
  }, [stopTracking, triggerHaptic]);

  const secondsSinceLastUpdate = useMemo(() => {
    if (!lastSentAt) return null;
    const seconds = Math.max(0, Math.round((timeTick - new Date(lastSentAt).getTime()) / 1000));
    return seconds;
  }, [lastSentAt, timeTick]);

  const accuracyLabel = useMemo(() => {
    if (!lastPosition?.coords?.accuracy) {
      return tr('Waiting', 'En attente');
    }
    return `${Math.round(lastPosition.coords.accuracy)}m`;
  }, [lastPosition?.coords?.accuracy, tr]);

  return (
    <div className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.25),_transparent_45%),linear-gradient(180deg,_#020617_0%,_#0f172a_100%)] px-4 py-5 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-md flex-col justify-center">
        {loading ? (
          <div className="flex min-h-[50vh] items-center justify-center">
            <Loader2 className="h-10 w-10 animate-spin text-blue-300" />
          </div>
        ) : !tour ? (
          <div className="rounded-[28px] border border-white/10 bg-white/5 px-6 py-10 text-center shadow-2xl backdrop-blur">
            <AlertTriangle className="mx-auto h-10 w-10 text-amber-300" />
            <h2 className="mt-4 text-2xl font-black">{tr('Tour not found', 'Tour introuvable')}</h2>
            <Link
              to="/admin/tours?tab=schedule"
              className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-900"
            >
              <Compass className="h-4 w-4" />
              {tr('Go to Tours', 'Aller aux tours')}
            </Link>
          </div>
        ) : (
          <div className="rounded-[32px] border border-white/10 bg-white/5 px-5 py-6 shadow-2xl backdrop-blur">
            <div className="text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-blue-200">
                {tr('Guide Tracking', 'Suivi du guide')}
              </p>
              <h1 className="mt-3 text-3xl font-black leading-tight">
                {tour.packageName}
              </h1>
              <div
                className={`mx-auto mt-4 inline-flex rounded-full px-4 py-2 text-sm font-semibold ${
                  trackingActive
                    ? 'bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-400/30'
                    : 'bg-white/10 text-slate-200 ring-1 ring-white/10'
                }`}
              >
                {trackingActive ? tr('Tracking active', 'Suivi actif') : tr('Not sharing', 'Aucun partage')}
              </div>
            </div>

            {trackingActive ? (
              <div className="mt-6 rounded-[28px] border border-emerald-400/25 bg-emerald-500/12 px-5 py-5 text-center shadow-[0_0_0_1px_rgba(16,185,129,0.08)]">
                <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-emerald-400/15 px-4 py-2 text-sm font-bold text-emerald-200 ring-1 ring-emerald-300/30">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  {tr('Tracking active', 'Suivi actif')}
                </div>
                <p className="mt-3 text-3xl font-black text-white">
                  {tr('Location sharing is live', 'Le partage de position est en direct')}
                </p>
                <p className="mt-2 text-sm font-medium text-emerald-100/85">
                  {tr('Keep this page open while driving.', 'Gardez cette page ouverte pendant le trajet.')}
                </p>
              </div>
            ) : null}

            <div className="mt-8">
              <button
                type="button"
                onClick={trackingActive ? handleStopPress : handleStartPress}
                disabled={starting}
                className={`flex min-h-[92px] w-full items-center justify-center gap-3 rounded-[22px] px-6 py-6 text-center text-2xl font-black shadow-xl transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 ${
                  trackingActive
                    ? 'bg-gradient-to-r from-rose-500 to-red-600 text-white'
                    : 'bg-gradient-to-r from-emerald-500 to-green-600 text-white'
                }`}
              >
                {trackingActive ? <StopCircle className="h-7 w-7" /> : <MapPinned className="h-7 w-7" />}
                {starting
                  ? tr('Starting...', 'Démarrage...')
                  : trackingActive
                    ? tr('Stop sharing', 'Arrêter le partage')
                    : tr('Start sharing location', 'Commencer le partage de position')}
              </button>
            </div>

            <div className="mt-5 space-y-2 text-center text-sm text-white/55">
              <p>
                {tr('Last update:', 'Dernière mise à jour :')}{' '}
                <span className="font-semibold text-white/75">
                  {secondsSinceLastUpdate === null
                    ? tr('Waiting', 'En attente')
                    : tr(`${secondsSinceLastUpdate} sec ago`, `il y a ${secondsSinceLastUpdate} s`)}
                </span>
              </p>
              <p>
                {tr('Accuracy:', 'Précision :')}{' '}
                <span className="font-semibold text-white/75">{accuracyLabel}</span>
              </p>
            </div>

            {permissionError ? (
              <div className="mt-5 rounded-2xl border border-amber-300/25 bg-amber-400/10 px-4 py-3 text-center text-sm text-amber-100">
                {permissionError}
              </div>
            ) : null}

            {callbackPromptVisible && callbackPhone ? (
              <button
                type="button"
                onClick={notifyCallbackPhone}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-4 text-sm font-semibold text-white ring-1 ring-white/10"
              >
                <Smartphone className="h-4 w-4" />
                {tr('Notify admin on WhatsApp', "Notifier l'admin sur WhatsApp")}
              </button>
            ) : null}

            {!trackingActive && !starting ? (
              <div className="mt-5 rounded-2xl bg-white/5 px-4 py-3 text-center text-sm text-white/70">
                <p className="font-semibold">{tr('This phone starts sharing only after you tap Start now.', 'Ce téléphone commence à partager seulement après avoir appuyé sur Démarrer.')}</p>
                <button
                  type="button"
                  onClick={handleStartPress}
                  className="mt-3 inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900"
                >
                  {tr('Start now', 'Démarrer')}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};

export default TourTracker;
