import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Compass, MapPinned, Navigation, RefreshCw, Route, Smartphone } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchTourBookings } from '../../services/tourBookingService';
import { buildTourTrackingUrl, fetchRecentTrackedTours } from '../../services/tourTrackingService';

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

const normalizeTours = (rows = []) => {
  const grouped = new Map();

  rows.forEach((row) => {
    const metadata = extractMarkedJson(row.notes, TOUR_BOOKING_MARKER);
    if (!metadata?.groupId) return;

    if (!grouped.has(metadata.groupId)) {
      grouped.set(metadata.groupId, []);
    }

    grouped.get(metadata.groupId).push({ ...row, tourMeta: metadata });
  });

  return Array.from(grouped.entries()).map(([groupId, groupRows]) => {
    const sortedRows = [...groupRows].sort(
      (a, b) => new Date(a.rental_start_date || a.created_at).getTime() - new Date(b.rental_start_date || b.created_at).getTime()
    );
    const first = sortedRows[0];
    const meta = first.tourMeta || {};
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
      packageName: meta.packageName || 'Tour package',
      guideId: String(meta.guideId || ''),
      guideName: meta.guideName || meta.startedByName || 'Guide',
      customerName: first.customer_name || meta.customerName || 'Guest',
      quadCount: Number(meta.quadCount || sortedRows.length || 1),
      ridersCount: Number(meta.ridersCount || sortedRows.length || 1),
      startedAt: meta.startedAt || '',
      scheduledStartAt: meta.scheduledStartAt || first.rental_start_date || first.created_at,
      trackingUrl: meta.trackingUrl || buildTourTrackingUrl(groupId),
    };
  });
};

const GuideDashboard = () => {
  const { user, userProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [myTours, setMyTours] = useState([]);
  const [trackedGroups, setTrackedGroups] = useState(new Set());

  const loadGuideTours = async (silent = false) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const rows = await fetchTourBookings();
      const normalizedTours = normalizeTours(rows);
      const recentTrackedTours = await fetchRecentTrackedTours();
      const trackedSet = new Set(recentTrackedTours.map((tour) => String(tour.groupId)));
      const currentUserId = String(userProfile?.id || user?.id || '');

      const activeAssignedTours = normalizedTours
        .filter((tour) => tour.status === 'active')
        .filter((tour) => String(tour.guideId || '') === currentUserId)
        .sort((a, b) => new Date(a.startedAt || a.scheduledStartAt).getTime() - new Date(b.startedAt || b.scheduledStartAt).getTime());

      setTrackedGroups(trackedSet);
      setMyTours(activeAssignedTours);
    } catch (error) {
      console.error('Failed to load guide dashboard tours:', error);
      setMyTours([]);
      setTrackedGroups(new Set());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadGuideTours();
  }, [user?.id, userProfile?.id]);

  const activeTrackedCount = useMemo(
    () => myTours.filter((tour) => trackedGroups.has(String(tour.groupId))).length,
    [myTours, trackedGroups]
  );

  return (
    <div className="min-h-full bg-slate-50 p-6">
      <div className="rounded-[28px] border border-blue-100 bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-500 px-6 py-7 text-white shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-100">Guide Dashboard</p>
        <h1 className="mt-2 text-3xl font-black">Live tour control</h1>
        <p className="mt-2 max-w-3xl text-sm text-blue-50">
          If you closed the live location approval before, you can always come back here and tap again while the tour is active.
        </p>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Active Tours</p>
          <p className="mt-3 text-3xl font-black text-slate-900">{myTours.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Tracking Live</p>
          <p className="mt-3 text-3xl font-black text-emerald-700">{activeTrackedCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Refresh</p>
              <p className="mt-3 text-sm text-slate-500">Reload current tour tracking status.</p>
            </div>
            <button
              type="button"
              onClick={() => loadGuideTours(true)}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">My Active Tours</p>
            <h2 className="mt-2 text-2xl font-black text-slate-900">Enable or retry live location</h2>
            <p className="mt-2 text-sm text-slate-500">
              If permission was dismissed before, tap the same button again. The app will ask for location again from your phone.
            </p>
          </div>
          <Link
            to="/admin/live-map"
            className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-100"
          >
            <Navigation className="h-4 w-4" />
            Open Live Map
          </Link>
        </div>

        {loading ? (
          <div className="mt-6 space-y-3">
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : myTours.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center">
            <Route className="mx-auto h-10 w-10 text-slate-300" />
            <h3 className="mt-4 text-lg font-bold text-slate-900">No active guide tours right now</h3>
            <p className="mt-2 text-sm text-slate-500">As soon as a tour assigned to your account is started, it will appear here for live location approval.</p>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            {myTours.map((tour) => {
              const isTrackingLive = trackedGroups.has(String(tour.groupId));

              return (
                <article key={tour.groupId} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-xl font-black text-slate-900">{tour.packageName}</h3>
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">Active Tour</span>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${isTrackingLive ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                      {isTrackingLive ? 'Tracking Live' : 'Tracking Pending'}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-slate-600">{tour.customerName} • {tour.quadCount} quads • {tour.ridersCount} riders</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Started {new Date(tour.startedAt || tour.scheduledStartAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                  </p>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <a
                      href={tour.trackingUrl}
                      className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
                    >
                      <MapPinned className="h-4 w-4" />
                      {isTrackingLive ? 'Open Live Location' : 'Enable Live Location'}
                    </a>
                    <a
                      href={tour.trackingUrl}
                      className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      <Smartphone className="h-4 w-4" />
                      Try Again
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default GuideDashboard;
