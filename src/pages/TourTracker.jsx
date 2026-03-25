import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Compass, Loader2, MapPinned, Navigation, Smartphone, StopCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchTourBookings } from '../services/tourBookingService';
import {
  TOUR_TRACKING_START_ACTION,
  TOUR_TRACKING_STOP_ACTION,
  buildTourTrackingUrl,
  logTourLocationPing,
  logTourTrackingEvent,
} from '../services/tourTrackingService';

const TOUR_BOOKING_MARKER = '[tour_booking]';

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

const TourTracker = () => {
  const { groupId } = useParams();
  const { user, userProfile } = useAuth();
  const watchIdRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);
  const lastPositionRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [tour, setTour] = useState(null);
  const [permissionError, setPermissionError] = useState('');
  const [trackingActive, setTrackingActive] = useState(false);
  const [lastPosition, setLastPosition] = useState(null);
  const [lastSentAt, setLastSentAt] = useState('');
  const [pingCount, setPingCount] = useState(0);
  const [starting, setStarting] = useState(false);

  const userActor = useMemo(
    () => ({
      id: userProfile?.id || user?.id || null,
      email: userProfile?.email || user?.email || '',
      full_name: userProfile?.full_name || userProfile?.fullName || userProfile?.name || user?.email || 'Team Member',
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
    };
  }, []);

  const sendPositionPing = useCallback(async (position, { isHeartbeat = false } = {}) => {
    if (!position?.coords) return false;

    try {
      await logTourLocationPing({
        groupId,
        user: userActor,
        position,
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

      setLastSentAt(new Date().toISOString());
      setPingCount((prev) => prev + 1);
      setTrackingActive(true);
      return true;
    } catch (error) {
      console.error('Failed to send live tour location:', error);
      setPermissionError('Location was captured, but it could not be sent to the live map.');
      return false;
    }
  }, [groupId, tour, userActor]);

  useEffect(() => {
    if (!trackingActive) {
      if (heartbeatIntervalRef.current !== null) {
        window.clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      return undefined;
    }

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
  }, [sendPositionPing, trackingActive]);

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
          actionType: TOUR_TRACKING_STOP_ACTION,
          description: 'Guide stopped live location tracking',
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

    setTrackingActive(false);
  }, [groupId, trackingActive, tour, userActor]);

  const startTracking = useCallback(async () => {
    if (!navigator.geolocation) {
      setPermissionError('This phone or browser does not support live location tracking.');
      return;
    }

    setPermissionError('');
    setStarting(true);

    try {
      await logTourTrackingEvent({
        groupId,
        user: userActor,
        actionType: TOUR_TRACKING_START_ACTION,
        description: 'Guide started live location tracking',
        metadata: {
          package_name: tour?.packageName || '',
          guide_name: tour?.guideName || userActor.full_name,
          customer_name: tour?.customerName || '',
          quad_count: Number(tour?.quadCount || 0),
          riders_count: Number(tour?.ridersCount || 0),
          started_at: tour?.startedAt || new Date().toISOString(),
        },
      });
    } catch (error) {
      console.warn('Unable to write tracking start event:', error);
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        setLastPosition(position);
        await sendPositionPing(position);
        setStarting(false);
      },
      (error) => {
        setStarting(false);
        if (error.code === error.PERMISSION_DENIED) {
          setPermissionError('Location access was denied. Allow GPS on this phone to share the live tour route.');
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setPermissionError('The phone could not find a GPS position right now.');
        } else if (error.code === error.TIMEOUT) {
          setPermissionError('GPS took too long to respond. Try again in an open area.');
        } else {
          setPermissionError('Live location could not start on this device.');
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      }
    );
  }, [groupId, sendPositionPing, tour, userActor]);

  const formatCoordinate = (value) => (Number.isFinite(value) ? value.toFixed(6) : 'Waiting');

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-[28px] border border-white/10 bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-500 px-6 py-7 shadow-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-100">Guide Tracking</p>
          <h1 className="mt-2 text-3xl font-black">Share your live tour position</h1>
          <p className="mt-2 max-w-2xl text-sm text-blue-50">
            Keep this page open on the guide phone during the tour. The admin live map will update automatically while GPS is active.
          </p>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
            {loading ? (
              <div className="flex min-h-[320px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-300" />
              </div>
            ) : !tour ? (
              <div className="rounded-[24px] border border-dashed border-white/15 bg-white/5 px-6 py-12 text-center">
                <AlertTriangle className="mx-auto h-10 w-10 text-amber-300" />
                <h2 className="mt-4 text-2xl font-black">Tour not found</h2>
                <p className="mt-2 text-sm text-slate-300">The tracking link does not match a saved tour booking yet.</p>
                <Link
                  to="/admin/tours?tab=schedule"
                  className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-blue-50"
                >
                  <Compass className="h-4 w-4" />
                  Go to Tours
                </Link>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-200">Active Tour</p>
                    <h2 className="mt-2 text-3xl font-black">{tour.packageName}</h2>
                    <p className="mt-2 text-sm text-blue-50">{tour.customerName} • {tour.quadCount} quads • {tour.ridersCount} riders</p>
                    <p className="mt-1 text-sm text-blue-100">Guide: {tour.guideName || userActor.full_name}</p>
                  </div>
                  <div className={`rounded-2xl px-4 py-3 text-sm font-semibold ${trackingActive ? 'bg-emerald-400/20 text-emerald-100' : 'bg-white/10 text-white/80'}`}>
                    {trackingActive ? 'Tracking active' : 'Tracking not started'}
                  </div>
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200">Phone GPS</p>
                    <h3 className="mt-2 text-xl font-black">Allow location access</h3>
                    <p className="mt-2 text-sm text-slate-300">Tap start once the guide is ready to depart. Keep this page open while the tour is moving.</p>
                    <div className="mt-5 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={startTracking}
                        disabled={trackingActive || starting}
                        className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <MapPinned className="h-4 w-4" />
                        {starting ? 'Starting GPS...' : 'Start sharing'}
                      </button>
                      <button
                        type="button"
                        onClick={stopTracking}
                        disabled={!trackingActive}
                        className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <StopCircle className="h-4 w-4" />
                        Stop sharing
                      </button>
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-white/10 bg-white/5 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200">Live status</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl bg-white/5 px-4 py-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Last sent</p>
                        <p className="mt-2 text-lg font-black">{lastSentAt ? new Date(lastSentAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Waiting'}</p>
                      </div>
                      <div className="rounded-2xl bg-white/5 px-4 py-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">GPS pings</p>
                        <p className="mt-2 text-lg font-black">{pingCount}</p>
                        <p className="mt-1 text-xs text-slate-400">Counts GPS updates from this phone, even before the admin map refreshes.</p>
                      </div>
                    </div>
                  </div>
                </div>

                {permissionError ? (
                  <div className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-400/10 px-4 py-4 text-sm text-amber-100">
                    {permissionError}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-4 text-sm text-emerald-100">
                    The admin live map will update every few seconds while this phone is sharing location.
                  </div>
                )}
              </>
            )}
          </section>

          <aside className="space-y-5">
            <div className="rounded-[24px] border border-white/10 bg-white/5 p-5 backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200">Current coordinates</p>
              <div className="mt-4 space-y-3 text-sm text-slate-200">
                <div className="flex items-center justify-between gap-3">
                  <span>Latitude</span>
                  <span className="font-semibold">{formatCoordinate(lastPosition?.coords?.latitude)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Longitude</span>
                  <span className="font-semibold">{formatCoordinate(lastPosition?.coords?.longitude)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Accuracy</span>
                  <span className="font-semibold">{lastPosition?.coords?.accuracy ? `${Math.round(lastPosition.coords.accuracy)} m` : 'Waiting'}</span>
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-white/5 p-5 backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200">Next step</p>
              <h3 className="mt-3 text-xl font-black">Keep this page open during the tour</h3>
              <p className="mt-2 text-sm text-slate-300">
                When the tour finishes, you can stop sharing here and return to the tour schedule to complete the return step.
              </p>
              <Link
                to={`/admin/live-map?groupId=${encodeURIComponent(groupId)}`}
                className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-blue-50"
              >
                <Navigation className="h-4 w-4" />
                Open admin live map
              </Link>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-white/5 p-5 backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200">Tracker link</p>
              <p className="mt-3 break-all text-sm text-slate-300">{tour?.trackingUrl || buildTourTrackingUrl(groupId)}</p>
              <div className="mt-4 inline-flex items-center gap-2 text-sm text-emerald-200">
                <CheckCircle2 className="h-4 w-4" />
                Use this same link again if the guide changes phone or tab.
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default TourTracker;
