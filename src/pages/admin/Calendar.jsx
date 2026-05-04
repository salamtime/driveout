import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Compass,
  ExternalLink,
  Fuel,
  ListChecks,
  Plus,
  Wrench,
  X,
} from 'lucide-react';
import AdminModuleHero from '../../components/admin/AdminModuleHero';
import { Button } from '../../components/ui/button';
import { supabase } from '../../lib/supabase';
import { TABLE_NAMES } from '../../config/tableNames';
import { getTasks } from '../../services/TaskService';
import i18n from '../../i18n';

const tr = (en, fr) => (i18n.resolvedLanguage === 'fr' ? fr : en);

const dateKey = (value) => {
  const date = value instanceof Date ? value : new Date(value || '');
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const startOfDay = (value) => {
  const date = value instanceof Date ? new Date(value) : new Date(value || Date.now());
  date.setHours(0, 0, 0, 0);
  return date;
};

const endOfDay = (value) => {
  const date = startOfDay(value);
  date.setHours(23, 59, 59, 999);
  return date;
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const formatTime = (value) => {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatDayLabel = (value) => new Date(value).toLocaleDateString([], {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

const formatShortDay = (value) => new Date(value).toLocaleDateString([], {
  weekday: 'short',
  day: 'numeric',
});

const getTimeScopeRange = (scope, selectedDay) => {
  const today = startOfDay(new Date());
  if (scope === 'tomorrow') {
    const tomorrow = addDays(today, 1);
    return { start: tomorrow, end: endOfDay(tomorrow) };
  }
  if (scope === 'next7') {
    return { start: today, end: endOfDay(addDays(today, 6)) };
  }
  if (scope === 'month') {
    const date = new Date(selectedDay || today);
    return {
      start: new Date(date.getFullYear(), date.getMonth(), 1),
      end: endOfDay(new Date(date.getFullYear(), date.getMonth() + 1, 0)),
    };
  }
  return { start: today, end: endOfDay(today) };
};

const overlaps = (a, b) => a.start < b.end && b.start < a.end;

const safeSelect = async (label, query, fallback = []) => {
  try {
    const { data, error } = await query;
    if (error) {
      console.warn(`${label} unavailable:`, error.message || error);
      return fallback;
    }
    return data || fallback;
  } catch (error) {
    console.warn(`${label} unavailable:`, error.message || error);
    return fallback;
  }
};

const safeSelectWithFallback = async ({
  label,
  primary,
  fallbackQuery,
  fallback = [],
  shouldFallback,
}) => {
  try {
    const { data, error } = await primary;
    if (!error) return data || fallback;

    const message = error.message || String(error || '');
    if (fallbackQuery && (!shouldFallback || shouldFallback(message, error))) {
      console.warn(`${label} primary query unavailable, retrying fallback:`, message);
      const { data: fallbackData, error: fallbackError } = await fallbackQuery();
      if (!fallbackError) return fallbackData || fallback;
      console.warn(`${label} fallback unavailable:`, fallbackError.message || fallbackError);
      return fallback;
    }

    console.warn(`${label} unavailable:`, message);
    return fallback;
  } catch (error) {
    console.warn(`${label} unavailable:`, error.message || error);
    return fallback;
  }
};

const eventTypes = {
  rental: {
    emoji: '📄',
    label: 'Rental',
    tone: 'border-blue-200 bg-blue-50 text-blue-800',
    dot: 'bg-blue-500',
  },
  tour: {
    emoji: '🏍️',
    label: 'Tour',
    tone: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800',
    dot: 'bg-fuchsia-500',
  },
  maintenance: {
    emoji: '🔧',
    label: 'Maintenance',
    tone: 'border-amber-200 bg-amber-50 text-amber-800',
    dot: 'bg-amber-500',
  },
  task: {
    emoji: '✅',
    label: 'Task',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    dot: 'bg-emerald-500',
  },
};

const EVENT_TYPE_DISPLAY_PRIORITY = {
  rental: 0,
  tour: 1,
  maintenance: 2,
  task: 3,
};

const EVENT_STATUS_DISPLAY_PRIORITY = {
  active: 0,
  in_progress: 1,
  scheduled: 2,
  pending: 3,
  open: 4,
  claimed: 5,
  done: 6,
  completed: 7,
  cancelled: 8,
};

const compareCalendarEvents = (a, b) => {
  const typeDelta = (EVENT_TYPE_DISPLAY_PRIORITY[a.type] ?? 99) - (EVENT_TYPE_DISPLAY_PRIORITY[b.type] ?? 99);
  if (typeDelta !== 0) return typeDelta;

  const statusDelta = (EVENT_STATUS_DISPLAY_PRIORITY[normalizeStatus(a.status)] ?? 50) - (EVENT_STATUS_DISPLAY_PRIORITY[normalizeStatus(b.status)] ?? 50);
  if (statusDelta !== 0) return statusDelta;

  return a.start - b.start;
};

const infoLabels = {
  urgent: { emoji: '⚠️', text: 'Urgent' },
  open: { emoji: '👐', text: 'Open' },
};

const getVehicleLabel = (vehicle) => {
  if (!vehicle) return '';
  return vehicle.plate_number || vehicle.name || vehicle.model || `Vehicle ${vehicle.id}`;
};

const parseTaskLabels = (task) => (Array.isArray(task.labels) ? task.labels : [])
  .filter(Boolean)
  .slice(0, 5);

const makeLabel = ({ emoji, text, href }) => ({ emoji, text, href });

const CalendarLabel = ({ label, small = false }) => {
  if (!label) return null;
  const content = (
    <>
      <span>{label.emoji}</span>
      <span>{label.text}</span>
    </>
  );
  const className = `inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/80 px-2 py-0.5 font-bold text-slate-700 ${small ? 'text-[10px]' : 'text-xs'}`;

  if (label.href) {
    return (
      <Link to={label.href} onClick={(event) => event.stopPropagation()} className={`${className} hover:border-violet-300 hover:text-violet-800`}>
        {content}
      </Link>
    );
  }
  return <span className={className}>{content}</span>;
};

const getTourMeta = (row) => {
  const raw = row.booking_payload || row.notes || '';
  const marker = '[tour_booking]';
  const source = typeof raw === 'string' && raw.includes(marker) ? raw.split(marker).pop() : raw;
  try {
    return typeof source === 'string' ? JSON.parse(source) : source || {};
  } catch {
    return {};
  }
};

const normalizeStatus = (value) => String(value || '').toLowerCase();

const buildRentalEvents = (rentals, vehicleMap) => rentals.map((rental) => {
  const start = new Date(rental.started_at || rental.rental_start_date || rental.created_at);
  const end = new Date(rental.completed_at || rental.actual_end_date || rental.rental_end_date || rental.updated_at || start);
  const vehicle = vehicleMap.get(String(rental.vehicle_id || ''));
  const plate = rental.vehicle_plate_number || getVehicleLabel(vehicle);

  return {
    id: `rental-${rental.id}`,
    type: 'rental',
    sourceId: rental.id,
    title: rental.rental_id || 'Rental',
    subtitle: `${plate || 'No vehicle'} • ${rental.customer_name || 'Customer'}`,
    status: rental.rental_status || rental.status || 'scheduled',
    start,
    end: end > start ? end : new Date(start.getTime() + 60 * 60 * 1000),
    vehicleId: rental.vehicle_id ? String(rental.vehicle_id) : '',
    assignee: rental.customer_name,
    href: `/admin/rentals/${rental.id}`,
    labels: [
      makeLabel({ emoji: '📄', text: rental.rental_id || 'Rental', href: `/admin/rentals/${rental.id}` }),
      plate ? makeLabel({ emoji: '🚗', text: plate, href: rental.vehicle_id ? `/admin/fleet/${rental.vehicle_id}` : undefined }) : null,
    ].filter(Boolean),
    raw: rental,
  };
});

const buildTourEvents = (tours, vehicleMap) => tours.map((tour) => {
  const meta = getTourMeta(tour);
  const start = new Date(tour.started_at || tour.scheduled_for || tour.scheduled_start_at || tour.created_at);
  const end = new Date(tour.completed_at || tour.scheduled_end_at || meta.scheduledEndAt || start);
  const vehicleIds = Array.isArray(meta.assignedVehicleIds)
    ? meta.assignedVehicleIds
    : [tour.vehicle_id].filter(Boolean);
  const firstVehicle = vehicleMap.get(String(vehicleIds[0] || ''));

  return {
    id: `tour-${tour.id}`,
    type: 'tour',
    sourceId: tour.id,
    title: tour.package_name || meta.packageName || tour.tour_id || meta.groupId || 'Tour',
    subtitle: `${tour.guide_name || meta.guideName || 'Guide'} • ${vehicleIds.length || tour.quad_count || 0} quads`,
    status: tour.rental_status || tour.booking_status || tour.status || 'scheduled',
    start,
    end: end > start ? end : new Date(start.getTime() + 60 * 60 * 1000),
    vehicleId: vehicleIds[0] ? String(vehicleIds[0]) : '',
    vehicleIds: vehicleIds.map(String),
    assignee: tour.guide_name || meta.guideName,
    href: '/admin/tours',
    labels: [
      makeLabel({ emoji: '🏍️', text: meta.groupId || tour.tour_id || 'Tour', href: '/admin/tours' }),
      firstVehicle ? makeLabel({ emoji: '🚗', text: getVehicleLabel(firstVehicle), href: `/admin/fleet/${firstVehicle.id}` }) : null,
      tour.guide_name || meta.guideName ? makeLabel({ emoji: '👤', text: tour.guide_name || meta.guideName }) : null,
    ].filter(Boolean),
    raw: tour,
  };
});

const buildMaintenanceEvents = (records, vehicleMap) => records.map((record) => {
  const start = new Date(record.service_date || record.scheduled_date || record.date || record.created_at);
  const vehicle = vehicleMap.get(String(record.vehicle_id || ''));
  const plate = record.vehicle_name || getVehicleLabel(vehicle);

  return {
    id: `maintenance-${record.id}`,
    type: 'maintenance',
    sourceId: record.id,
    title: record.maintenance_type || record.type || 'Maintenance',
    subtitle: plate || 'Vehicle',
    status: record.status || 'scheduled',
    start,
    end: new Date(start.getTime() + 2 * 60 * 60 * 1000),
    vehicleId: record.vehicle_id ? String(record.vehicle_id) : '',
    href: `/admin/maintenance?maintenanceId=${record.id}`,
    labels: [
      makeLabel({ emoji: '🔧', text: record.maintenance_type || 'Maintenance', href: `/admin/maintenance?maintenanceId=${record.id}` }),
      plate ? makeLabel({ emoji: '🚗', text: plate, href: record.vehicle_id ? `/admin/fleet/${record.vehicle_id}` : undefined }) : null,
    ].filter(Boolean),
    raw: record,
  };
});

const buildTaskEvents = (tasks) => tasks.map((task) => {
  const start = new Date(task.scheduled_at || task.created_at);
  const labels = parseTaskLabels(task).map((label) => ({
    emoji: label.emoji,
    text: label.text,
    href: label.href,
  }));
  const urgent = labels.some((label) => label.text?.toLowerCase?.().includes('urgent')) || task.priority === 'urgent';

  return {
    id: `task-${task.id}`,
    type: 'task',
    sourceId: task.id,
    title: task.title,
    subtitle: task.assigned_user_name || 'Open task',
    status: task.status === 'done' ? 'done' : 'open',
    priority: urgent ? 'urgent' : task.priority || 'normal',
    start,
    end: new Date(start.getTime() + 30 * 60 * 1000),
    href: `/admin/tasks?task=${task.id}`,
    labels: [
      ...labels,
      !task.assigned_user ? infoLabels.open : null,
      urgent ? infoLabels.urgent : null,
    ].filter(Boolean).slice(0, 5),
    raw: task,
  };
});

const attachConflicts = (events) => {
  const nextEvents = events.map((event) => ({ ...event, conflicts: [] }));

  for (let i = 0; i < nextEvents.length; i += 1) {
    for (let j = i + 1; j < nextEvents.length; j += 1) {
      const a = nextEvents[i];
      const b = nextEvents[j];
      const sharedVehicles = new Set([...(a.vehicleIds || [a.vehicleId]).filter(Boolean)]);
      const hasSharedVehicle = (b.vehicleIds || [b.vehicleId]).some((id) => sharedVehicles.has(String(id)));
      if (!hasSharedVehicle || !overlaps(a, b)) continue;

      const maintenanceConflict = a.type === 'maintenance' || b.type === 'maintenance';
      const rentalTourConflict = ['rental', 'tour'].includes(a.type) && ['rental', 'tour'].includes(b.type);
      if (maintenanceConflict || rentalTourConflict) {
        const message = maintenanceConflict
          ? tr('Maintenance overlaps with an active booking', 'Maintenance en conflit avec une réservation active')
          : tr('Vehicle double-booked', 'Véhicule double réservé');
        a.conflicts.push({ with: b.id, message });
        b.conflicts.push({ with: a.id, message });
      }
    }
  }

  return nextEvents;
};

const EventPill = ({ event, onClick, compact = false }) => {
  const config = eventTypes[event.type];
  return (
    <button
      type="button"
      onClick={(clickEvent) => {
        clickEvent.stopPropagation();
        onClick(event);
      }}
      className={`w-full rounded-xl border text-left transition hover:-translate-y-0.5 hover:shadow-sm ${compact ? 'px-2 py-1' : 'px-3 py-2'} ${config.tone} ${event.conflicts?.length ? 'ring-2 ring-red-300' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {compact ? (
            <p className="truncate text-[11px] font-semibold">{config.emoji} {event.title}</p>
          ) : (
            <p className="text-xs font-semibold text-current/75">{config.emoji} {config.label}</p>
          )}
          {!compact && <p className="truncate text-sm font-semibold">{event.title}</p>}
          {!compact && <p className="truncate text-xs font-semibold opacity-80">{event.subtitle}</p>}
        </div>
        {event.conflicts?.length > 0 && <AlertTriangle className={`${compact ? 'h-3 w-3' : 'h-4 w-4'} shrink-0 text-red-600`} />}
      </div>
      {!compact && (
        <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px] font-bold opacity-80">
          <span>{formatTime(event.start)}-{formatTime(event.end)}</span>
          <span>•</span>
          <span>{event.status}</span>
        </div>
      )}
    </button>
  );
};

const TaskSummaryPill = ({ tasks, onClick }) => {
  const urgentCount = tasks.filter((event) => event.priority === 'urgent' && event.status !== 'done').length;
  const label = urgentCount > 0
    ? tr(`${tasks.length} tasks (${urgentCount} urgent)`, `${tasks.length} tâches (${urgentCount} urgentes)`)
    : tr(`${tasks.length} tasks`, `${tasks.length} tâches`);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border px-2 py-1 text-left text-[11px] font-semibold transition hover:-translate-y-0.5 hover:shadow-sm ${
        urgentCount > 0
          ? 'border-red-200 bg-red-50 text-red-800'
          : 'border-emerald-200 bg-emerald-50 text-emerald-800'
      }`}
    >
      <span className="block truncate">{urgentCount > 0 ? '⚠️' : '✅'} {label}</span>
    </button>
  );
};

const LiveOperations = ({ live, onEventClick, onFocusToday }) => (
  <section className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-500">{tr('Live Operations', 'Opérations en direct')}</p>
        <h2 className="mt-1 text-xl font-semibold text-slate-950">{tr("What's happening now", 'En cours maintenant')}</h2>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" className="rounded-2xl"><Link to="/admin/rentals">{tr('Create rental', 'Créer location')}</Link></Button>
        <Button asChild variant="outline" className="rounded-2xl"><Link to="/admin/tasks">{tr('Create task', 'Créer tâche')}</Link></Button>
        <Button asChild variant="outline" className="rounded-2xl"><Link to="/admin/maintenance?action=create">{tr('Schedule maintenance', 'Planifier maintenance')}</Link></Button>
        <Button onClick={onFocusToday} className="rounded-2xl bg-violet-600 text-white hover:bg-violet-700">{tr('Focus Today', "Focus aujourd'hui")}</Button>
      </div>
    </div>

    <div className="mt-4 grid gap-2 md:grid-cols-5">
      {[
        { label: tr('Active rentals', 'Locations actives'), value: live.counts.rentals, tone: 'bg-blue-50 text-blue-800' },
        { label: tr('Active tours', 'Tours actifs'), value: live.counts.tours, tone: 'bg-fuchsia-50 text-fuchsia-800' },
        { label: tr('Maintenance', 'Maintenance'), value: live.counts.maintenance, tone: 'bg-amber-50 text-amber-800' },
        { label: tr('Pending tasks', 'Tâches ouvertes'), value: `${live.counts.tasks}${live.counts.urgent ? ` / ${live.counts.urgent} urgent` : ''}`, tone: 'bg-emerald-50 text-emerald-800' },
        { label: tr('Issues', 'Conflits'), value: live.counts.conflicts, tone: live.counts.conflicts ? 'bg-red-50 text-red-800' : 'bg-slate-50 text-slate-700' },
      ].map((item) => (
        <div key={item.label} className={`rounded-2xl p-3 ${item.tone}`}>
          <p className="text-[11px] font-semibold opacity-70">{item.label}</p>
          <p className="mt-1 text-xl font-semibold">{item.value}</p>
        </div>
      ))}
    </div>

    <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="rounded-3xl border border-slate-100 bg-slate-50/70 p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{tr('Next upcoming', 'Prochain événement')}</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {live.nextUpcoming.length === 0 ? (
            <p className="text-sm text-slate-400">{tr('No upcoming items today.', 'Aucun événement à venir aujourd’hui.')}</p>
          ) : live.nextUpcoming.slice(0, 4).map((event) => (
            <button key={event.id} type="button" onClick={() => onEventClick(event)} className="rounded-2xl bg-white px-3 py-2 text-left shadow-sm transition hover:bg-violet-50">
              <p className="truncate text-sm font-semibold text-slate-900">{eventTypes[event.type].emoji} {formatTime(event.start)} • {event.title}</p>
              <p className="truncate text-xs font-medium text-slate-500">{event.subtitle}</p>
            </button>
          ))}
        </div>
      </div>
      <div className={`rounded-3xl border p-3 ${live.urgentTasks.length ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-slate-50/70'}`}>
        <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${live.urgentTasks.length ? 'text-red-700' : 'text-slate-500'}`}>⚠️ {tr('Urgent tasks', 'Tâches urgentes')}</p>
        <div className="mt-2 space-y-2">
          {live.urgentTasks.length === 0 ? (
            <p className="text-sm text-slate-400">{tr('No urgent tasks for today.', 'Aucune tâche urgente aujourd’hui.')}</p>
          ) : live.urgentTasks.slice(0, 3).map((event) => (
            <button key={event.id} type="button" onClick={() => onEventClick(event)} className="block w-full rounded-2xl bg-white px-3 py-2 text-left shadow-sm transition hover:bg-red-100">
              <p className="truncate text-sm font-semibold text-red-800">{event.title}</p>
              <p className="truncate text-xs font-medium text-red-600">{event.subtitle}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  </section>
);

const CalendarPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);
  const [viewMode, setViewMode] = useState('month');
  const [timeScope, setTimeScope] = useState('month');
  const [currentMonth, setCurrentMonth] = useState(startOfDay(new Date()));
  const [selectedDay, setSelectedDay] = useState(dateKey(new Date()));
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [quickCreateDay, setQuickCreateDay] = useState(null);
  const [dayDrawerDate, setDayDrawerDate] = useState(null);
  const [filters, setFilters] = useState({
    type: 'all',
    status: 'all',
    priority: 'all',
    quick: '',
    statusSecondary: 'all',
  });

  const loadCalendarData = async () => {
    setLoading(true);
    const [vehicles, rentals, tours, maintenance, tasks] = await Promise.all([
      safeSelect('Vehicles', supabase
        .from(TABLE_NAMES.VEHICLES)
        .select('id,plate_number,name,model,status')
        .limit(500)),
      safeSelect('Rentals', supabase
        .from(TABLE_NAMES.RENTALS)
        .select('id,rental_id,customer_name,rental_status,status,rental_start_date,rental_end_date,started_at,completed_at,actual_end_date,vehicle_id,vehicle_plate_number,total_amount,created_at,updated_at')
        .order('rental_start_date', { ascending: false })
        .limit(500)),
      safeSelectWithFallback({
        label: 'Tours',
        primary: supabase
          .from(TABLE_NAMES.TOUR_BOOKINGS)
          .select('id,tour_id,customer_name,booking_date,status,total_amount,created_at,booking_payload,booking_status,scheduled_for,updated_at,rental_status,package_name,route_type,guide_name,scheduled_date,scheduled_time,scheduled_end_at,started_at,completed_at,cancelled_at,quad_count,total_amount_mad,notes,vehicle_id')
          .order('scheduled_for', { ascending: false })
          .limit(500),
        fallbackQuery: () => supabase
          .from(TABLE_NAMES.TOUR_BOOKINGS)
          .select('id,tour_id,customer_name,booking_date,status,total_amount,created_at,booking_payload,booking_status,scheduled_for,updated_at,rental_status,package_name,route_type,guide_name,scheduled_date,scheduled_time,scheduled_end_at,started_at,completed_at,cancelled_at,quad_count,total_amount_mad,notes')
          .order('scheduled_for', { ascending: false })
          .limit(500),
        shouldFallback: (message) => /vehicle_id/i.test(message) && /does not exist/i.test(message),
      }),
      safeSelectWithFallback({
        label: 'Maintenance',
        primary: supabase
          .from('app_687f658e98_maintenance')
          .select('id,vehicle_id,vehicle_name,type,maintenance_type,date,scheduled_date,service_date,status,cost,created_at,updated_at')
          .order('created_at', { ascending: false })
          .limit(500),
        fallbackQuery: () => supabase
          .from('app_687f658e98_maintenance')
          .select('id,vehicle_id,type,maintenance_type,date,scheduled_date,service_date,status,cost,created_at,updated_at')
          .order('created_at', { ascending: false })
          .limit(500),
        shouldFallback: (message) => /vehicle_name/i.test(message) && /does not exist/i.test(message),
      }),
      getTasks().catch((error) => {
        console.warn('Tasks unavailable:', error.message || error);
        return [];
      }),
    ]);

    const vehicleMap = new Map((vehicles || []).map((vehicle) => [String(vehicle.id), vehicle]));
    const unified = [
      ...buildRentalEvents(rentals, vehicleMap),
      ...buildTourEvents(tours, vehicleMap),
      ...buildMaintenanceEvents(maintenance, vehicleMap),
      ...buildTaskEvents(tasks),
    ].filter((event) => !Number.isNaN(event.start.getTime()));

    setEvents(attachConflicts(unified));
    setLoading(false);
  };

  useEffect(() => {
    loadCalendarData();
    const interval = window.setInterval(loadCalendarData, 30000);
    const channel = supabase
      .channel('operations-calendar-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE_NAMES.RENTALS }, loadCalendarData)
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE_NAMES.TOUR_BOOKINGS }, loadCalendarData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_687f658e98_maintenance' }, loadCalendarData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_4c3a7a6153_team_tasks' }, loadCalendarData)
      .subscribe();

    return () => {
      window.clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  const filteredEvents = useMemo(() => events.filter((event) => {
    if (filters.type !== 'all' && event.type !== filters.type) return false;
    if (filters.statusSecondary !== 'all' && normalizeStatus(event.status) !== filters.statusSecondary) return false;
    if (filters.priority === 'urgent' && event.priority !== 'urgent' && !event.conflicts?.length) return false;
    if (filters.quick === 'openTasks' && !(event.type === 'task' && event.status !== 'done')) return false;
    if (filters.quick === 'conflicts' && !event.conflicts?.length) return false;
    return true;
  }), [events, filters]);

  const scopedEvents = useMemo(() => {
    const { start, end } = getTimeScopeRange(timeScope, selectedDay);
    return filteredEvents.filter((event) => event.start <= end && event.end >= start);
  }, [filteredEvents, selectedDay, timeScope]);

  const allEventsByDay = useMemo(() => {
    const grouped = new Map();
    filteredEvents.forEach((event) => {
      const cursor = startOfDay(event.start);
      const last = startOfDay(event.end);
      while (cursor <= last) {
        const key = dateKey(cursor);
        grouped.set(key, [...(grouped.get(key) || []), event]);
        cursor.setDate(cursor.getDate() + 1);
      }
    });
    return grouped;
  }, [filteredEvents]);

  const todayKey = dateKey(new Date());
  const todayEvents = useMemo(() => filteredEvents
    .filter((event) => event.start <= endOfDay(new Date()) && event.end >= startOfDay(new Date()))
    .sort(compareCalendarEvents), [filteredEvents]);

  const live = useMemo(() => {
    const now = new Date();
    const active = todayEvents.filter((event) => event.start <= now && event.end >= now && event.status !== 'done');
    const urgentTasks = todayEvents.filter((event) => event.type === 'task' && event.priority === 'urgent' && event.status !== 'done');
    return {
      rentals: active.filter((event) => event.type === 'rental'),
      tours: active.filter((event) => event.type === 'tour'),
      maintenance: todayEvents.filter((event) => event.type === 'maintenance' && ['scheduled', 'in_progress', 'pending'].includes(normalizeStatus(event.status))),
      urgentTasks,
      nextUpcoming: todayEvents.filter((event) => event.start >= now && event.status !== 'done').slice(0, 6),
      counts: {
        rentals: active.filter((event) => event.type === 'rental').length,
        tours: active.filter((event) => event.type === 'tour').length,
        maintenance: todayEvents.filter((event) => event.type === 'maintenance' && ['scheduled', 'in_progress', 'pending'].includes(normalizeStatus(event.status))).length,
        tasks: todayEvents.filter((event) => event.type === 'task' && event.status !== 'done').length,
        urgent: urgentTasks.length,
        conflicts: todayEvents.filter((event) => event.conflicts?.length).length,
      },
    };
  }, [todayEvents]);

  const monthDays = useMemo(() => {
    const first = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const start = addDays(first, -first.getDay());
    return Array.from({ length: 42 }, (_, index) => addDays(start, index));
  }, [currentMonth]);

  const eventsByDay = useMemo(() => {
    const grouped = new Map();
    scopedEvents.forEach((event) => {
      const cursor = startOfDay(event.start);
      const last = startOfDay(event.end);
      while (cursor <= last) {
        const key = dateKey(cursor);
        grouped.set(key, [...(grouped.get(key) || []), event]);
        cursor.setDate(cursor.getDate() + 1);
      }
    });
    return grouped;
  }, [scopedEvents]);

  const selectedDayEvents = useMemo(() => (eventsByDay.get(selectedDay) || [])
    .sort(compareCalendarEvents), [eventsByDay, selectedDay]);

  const selectedDayStats = useMemo(() => ({
    rentals: selectedDayEvents.filter((event) => event.type === 'rental').length,
    tours: selectedDayEvents.filter((event) => event.type === 'tour').length,
    maintenance: selectedDayEvents.filter((event) => event.type === 'maintenance').length,
    tasks: selectedDayEvents.filter((event) => event.type === 'task').length,
    urgent: selectedDayEvents.filter((event) => event.priority === 'urgent').length,
    conflicts: selectedDayEvents.filter((event) => event.conflicts?.length).length,
  }), [selectedDayEvents]);

  const agendaEvents = useMemo(() => (
    timeScope === 'next7' ? scopedEvents : selectedDayEvents
  ).sort(compareCalendarEvents), [scopedEvents, selectedDayEvents, timeScope]);

  const updateFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));

  const weekPreviewDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(startOfDay(new Date()), index)), []);

  const setScope = (scope) => {
    setTimeScope(scope);
    const today = startOfDay(new Date());
    if (scope === 'today') {
      setSelectedDay(dateKey(today));
      setViewMode('day');
    } else if (scope === 'tomorrow') {
      setSelectedDay(dateKey(addDays(today, 1)));
      setViewMode('day');
    } else if (scope === 'next7') {
      setSelectedDay(dateKey(today));
      setViewMode('agenda');
    } else {
      setCurrentMonth(today);
      setSelectedDay(dateKey(today));
      setViewMode('month');
    }
  };

  const setPrimaryFilter = (type) => {
    setFilters((prev) => ({
      ...prev,
      type: ['rental', 'tour', 'maintenance', 'task'].includes(type) ? type : 'all',
      priority: type === 'urgent' ? (prev.priority === 'urgent' ? 'all' : 'urgent') : 'all',
      quick: type === 'all' || type === 'urgent' ? '' : prev.quick,
    }));
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminModuleHero
        icon={<CalendarDays className="h-8 w-8 text-white" />}
        eyebrow={tr('Operations Calendar', 'Calendrier opérations')}
        title={tr('Operations Command Calendar', 'Calendrier de commandement')}
        description={tr('Rentals, tours, maintenance, and team tasks in one linked operational view.', 'Locations, tours, maintenance et tâches dans une vue opérationnelle connectée.')}
        className="w-full"
      />

      <div className="space-y-5 p-4 lg:p-6">
        <LiveOperations
          live={live}
          onEventClick={setSelectedEvent}
          onFocusToday={() => {
            setSelectedDay(todayKey);
            setViewMode('day');
          }}
        />

        <section className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'today', label: tr('Today', 'Aujourd’hui') },
                { id: 'tomorrow', label: tr('Tomorrow', 'Demain') },
                { id: 'next7', label: tr('Next 7 Days', '7 prochains jours') },
                { id: 'month', label: tr('Month', 'Mois') },
              ].map((scope) => (
                <button
                  key={scope.id}
                  type="button"
                  onClick={() => setScope(scope.id)}
                  className={`relative rounded-full border px-4 py-2 text-sm font-semibold ${timeScope === scope.id ? 'border-violet-600 bg-violet-600 text-white' : scope.id === 'today' && live.counts.rentals + live.counts.tours + live.counts.maintenance + live.counts.tasks > 0 ? 'border-violet-300 bg-violet-50 text-violet-800 shadow-sm shadow-violet-100' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  {scope.label}
                  {scope.id === 'today' && live.counts.rentals + live.counts.tours + live.counts.maintenance + live.counts.tasks > 0 && (
                    <span className={`ml-2 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-black ${timeScope === 'today' ? 'bg-white text-violet-700' : 'bg-violet-600 text-white'}`}>
                      {live.counts.rentals + live.counts.tours + live.counts.maintenance + live.counts.tasks}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {viewMode === 'month' && (
              <div className="flex items-center gap-2">
                <Button variant="outline" className="rounded-2xl" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
                <div className="rounded-2xl bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-800">
                  {currentMonth.toLocaleDateString([], { month: 'long', year: 'numeric' })}
                </div>
                <Button variant="outline" className="rounded-2xl" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            )}
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {weekPreviewDays.map((day) => {
              const key = dateKey(day);
              const count = (allEventsByDay.get(key) || []).length;
              const isSelected = key === selectedDay;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setSelectedDay(key);
                    setViewMode('day');
                    setTimeScope(key === todayKey ? 'today' : key === dateKey(addDays(new Date(), 1)) ? 'tomorrow' : 'next7');
                  }}
                  className={`min-w-[5.5rem] rounded-2xl border px-3 py-2 text-left ${isSelected ? 'border-violet-500 bg-violet-50 text-violet-800' : 'border-slate-200 bg-slate-50 text-slate-600'}`}
                >
                  <p className="text-sm font-semibold">{formatShortDay(day)}</p>
                  <div className="mt-2 flex gap-1">
                    {Array.from({ length: Math.min(count, 5) }, (_, index) => <span key={index} className="h-1.5 w-1.5 rounded-full bg-violet-500" />)}
                    {count > 5 && <span className="text-[10px] font-semibold">+{count - 5}</span>}
                    {count === 0 && <span className="h-1.5 w-5 rounded-full bg-slate-200" />}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 rounded-3xl bg-slate-50 p-2">
            {[
              { id: 'all', label: tr('All', 'Tout') },
              { id: 'rental', label: tr('Rentals', 'Locations') },
              { id: 'tour', label: tr('Tours', 'Tours') },
              { id: 'task', label: tr('Tasks', 'Tâches') },
              { id: 'maintenance', label: tr('Maintenance', 'Maintenance') },
              { id: 'urgent', label: tr('Urgent', 'Urgent') },
            ].map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setPrimaryFilter(filter.id)}
                className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${(filter.id === 'urgent' ? filters.priority === 'urgent' : filters.type === filter.id || (filter.id === 'all' && filters.type === 'all' && filters.priority !== 'urgent')) ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600'}`}
              >
                {filter.id === 'urgent' ? '⚠️ ' : ''}{filter.label}
              </button>
            ))}
            <select value={filters.quick} onChange={(event) => updateFilter('quick', event.target.value)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600">
              <option value="">{tr('More filters', 'Plus de filtres')}</option>
              <option value="openTasks">{tr('Open tasks', 'Tâches ouvertes')}</option>
              <option value="conflicts">{tr('Conflicts', 'Conflits')}</option>
            </select>
            <select value={filters.statusSecondary} onChange={(event) => updateFilter('statusSecondary', event.target.value)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600">
              <option value="all">{tr('Any status', 'Tous statuts')}</option>
              <option value="scheduled">Scheduled</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="open">Open</option>
            </select>
          </div>
        </section>

        {loading && <div className="rounded-[2rem] border border-slate-200 bg-white p-8 text-center font-bold text-slate-500">{tr('Loading operations calendar...', 'Chargement du calendrier opérations...')}</div>}

        {!loading && viewMode === 'month' && (
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="overflow-x-auto rounded-[2rem] border border-slate-200 bg-white p-3 shadow-sm">
              <div className="grid min-w-[900px] grid-cols-7 gap-2 text-center text-xs font-semibold text-slate-400">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <div key={day} className="py-1">{day}</div>)}
              </div>
              <div className="grid min-w-[900px] grid-cols-7 gap-2">
                {monthDays.map((day) => {
                  const key = dateKey(day);
                  const dayEvents = (eventsByDay.get(key) || []).sort(compareCalendarEvents);
                  const primaryDayEvents = dayEvents.filter((event) => event.type !== 'task');
                  const taskDayEvents = dayEvents.filter((event) => event.type === 'task');
                  const visiblePrimaryEvents = primaryDayEvents.slice(0, taskDayEvents.length > 0 ? 3 : 4);
                  const hiddenPrimaryCount = Math.max(0, primaryDayEvents.length - visiblePrimaryEvents.length);
                  const conflictCount = dayEvents.filter((event) => event.conflicts?.length).length;
                  const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
                  const isSelected = key === selectedDay;
                  const isPast = day < startOfDay(new Date());
                  const isTomorrow = key === dateKey(addDays(new Date(), 1));
                  return (
                    <div
                      key={key}
                      onClick={() => {
                        setSelectedDay(key);
                      }}
                      className={`min-h-[6.75rem] rounded-2xl border p-2 text-left transition ${isSelected ? 'border-violet-400 ring-2 ring-violet-100' : 'border-slate-200'} ${key === todayKey ? 'bg-violet-50/80' : isTomorrow ? 'bg-sky-50/70' : isCurrentMonth ? 'bg-white' : 'bg-slate-50/70 text-slate-400'} ${isPast && key !== todayKey ? 'opacity-40' : ''} hover:border-violet-300`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-semibold ${key === todayKey ? 'rounded-full bg-violet-600 px-2 py-0.5 text-white' : ''}`}>{day.getDate()}</span>
                        <span className="text-xs font-medium text-slate-400">{dayEvents.length}</span>
                      </div>
                      {conflictCount > 0 && (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                          <AlertTriangle className="h-3 w-3" /> {conflictCount}
                        </span>
                      )}
                      <div className="mt-1 space-y-1">
                        {visiblePrimaryEvents.map((event) => (
                          <EventPill key={event.id} event={event} onClick={setSelectedEvent} compact />
                        ))}
                        {taskDayEvents.length > 0 && (
                          <TaskSummaryPill
                            tasks={taskDayEvents}
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedDay(key);
                              setDayDrawerDate(key);
                            }}
                          />
                        )}
                        {hiddenPrimaryCount > 0 && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedDay(key);
                              setDayDrawerDate(key);
                            }}
                            className="px-2 text-xs font-semibold text-violet-700 hover:text-violet-900"
                          >
                            +{hiddenPrimaryCount} more
                          </button>
                        )}
                        {dayEvents.length === 0 && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setQuickCreateDay(key);
                            }}
                            className="mt-4 text-xs font-semibold text-slate-400 hover:text-violet-700"
                          >
                            + {tr('Create', 'Créer')}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <aside className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-500">{tr('Day command panel', 'Panneau du jour')}</p>
              <h3 className="mt-1 text-xl font-semibold text-slate-950">{formatDayLabel(selectedDay)}</h3>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {[
                  ['Rentals', selectedDayStats.rentals],
                  ['Tours', selectedDayStats.tours],
                  ['Maintenance', selectedDayStats.maintenance],
                  ['Tasks', selectedDayStats.tasks],
                  ['Urgent', selectedDayStats.urgent],
                  ['Conflicts', selectedDayStats.conflicts],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
                    <p className="text-xl font-semibold text-slate-950">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-2">
                <Button onClick={() => setViewMode('day')} className="w-full rounded-2xl bg-violet-600 text-white hover:bg-violet-700">{tr('Open day view', 'Ouvrir la journée')}</Button>
                <Button variant="outline" onClick={() => setQuickCreateDay(selectedDay)} className="w-full rounded-2xl"><Plus className="mr-2 h-4 w-4" />{tr('Quick create', 'Création rapide')}</Button>
              </div>
            </aside>
          </section>
        )}

        {!loading && viewMode === 'day' && (
          <section className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-500">{tr('Focus Today', 'Focus journée')}</p>
                <h2 className="text-xl font-semibold text-slate-950">{formatDayLabel(selectedDay)}</h2>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setScope('month')}
                  className="rounded-2xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                >
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  {tr('Back to month', 'Retour au mois')}
                </Button>
                <input type="date" value={selectedDay} onChange={(event) => setSelectedDay(event.target.value)} className="rounded-2xl border border-slate-200 px-3 py-2 font-bold" />
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {selectedDayEvents.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-200 p-8 text-center text-slate-500">{tr('No operations scheduled for this day.', 'Aucune opération planifiée ce jour.')}</div>
              ) : selectedDayEvents.map((event) => (
                <div key={event.id} className="grid gap-3 rounded-3xl border border-slate-100 bg-slate-50/70 p-3 md:grid-cols-[110px_minmax(0,1fr)]">
                  <div className="rounded-2xl bg-white p-3 text-sm font-semibold text-slate-700">
                    <Clock3 className="mb-1 h-4 w-4 text-slate-400" />
                    {formatTime(event.start)}<br />{formatTime(event.end)}
                  </div>
                  <EventPill event={event} onClick={setSelectedEvent} />
                </div>
              ))}
            </div>
          </section>
        )}

        {!loading && viewMode === 'agenda' && (
          <section className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="sticky top-0 z-10 -mx-4 -mt-4 border-b border-slate-100 bg-white/95 p-4 backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-500">{timeScope === 'next7' ? tr('Next 7 Days', '7 prochains jours') : tr('Mobile agenda', 'Agenda mobile')}</p>
              <input type="date" value={selectedDay} onChange={(event) => setSelectedDay(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-2 font-bold" />
            </div>
            <div className="mt-4 space-y-3">
              {agendaEvents.map((event) => <EventPill key={event.id} event={event} onClick={setSelectedEvent} />)}
              {agendaEvents.length === 0 && <p className="rounded-3xl bg-slate-50 p-6 text-center font-bold text-slate-500">{tr('No agenda items.', 'Aucun élément.')}</p>}
            </div>
          </section>
        )}
      </div>

      {dayDrawerDate && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-950/40"
          onClick={() => setDayDrawerDate(null)}
        >
          <aside
            className="h-full w-full max-w-lg overflow-y-auto bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-500">{tr('Day events', 'Événements du jour')}</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-950">{formatDayLabel(dayDrawerDate)}</h2>
              </div>
              <Button variant="outline" onClick={() => setDayDrawerDate(null)} className="rounded-2xl"><X className="h-4 w-4" /></Button>
            </div>
            <div className="mt-5 space-y-3">
              {(eventsByDay.get(dayDrawerDate) || []).sort(compareCalendarEvents).map((event) => (
                <EventPill key={event.id} event={event} onClick={(row) => {
                  setSelectedEvent(row);
                  setDayDrawerDate(null);
                }} />
              ))}
            </div>
            <div className="mt-5 flex gap-2">
              <Button onClick={() => {
                setSelectedDay(dayDrawerDate);
                setViewMode('day');
                setDayDrawerDate(null);
              }} className="rounded-2xl bg-violet-600 text-white hover:bg-violet-700">
                {tr('Open day timeline', 'Ouvrir la journée')}
              </Button>
              <Button variant="outline" onClick={() => {
                setQuickCreateDay(dayDrawerDate);
                setDayDrawerDate(null);
              }} className="rounded-2xl">
                <Plus className="mr-2 h-4 w-4" />{tr('Quick create', 'Création rapide')}
              </Button>
            </div>
          </aside>
        </div>
      )}

      {selectedEvent && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-950/40"
          onClick={() => setSelectedEvent(null)}
        >
          <aside
            className="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-500">{eventTypes[selectedEvent.type].emoji} {eventTypes[selectedEvent.type].label}</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-950">{selectedEvent.title}</h2>
                <p className="text-sm font-semibold text-slate-500">{formatDayLabel(selectedEvent.start)} • {formatTime(selectedEvent.start)}-{formatTime(selectedEvent.end)}</p>
              </div>
              <Button variant="outline" onClick={() => setSelectedEvent(null)} className="rounded-2xl"><X className="h-4 w-4" /></Button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {selectedEvent.labels.map((label) => <CalendarLabel key={`${label.text}-${label.href || ''}`} label={label} />)}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{tr('Status', 'Statut')}</p>
                <p className="mt-1 text-lg font-semibold text-slate-950">{selectedEvent.status}</p>
              </div>
              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{tr('Owner / customer', 'Responsable / client')}</p>
                <p className="mt-1 text-lg font-semibold text-slate-950">{selectedEvent.assignee || selectedEvent.subtitle}</p>
              </div>
            </div>

            {selectedEvent.conflicts?.length > 0 && (
              <div className="mt-4 rounded-3xl border border-red-200 bg-red-50 p-4 text-red-800">
                <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" />{tr('Conflict summary', 'Résumé conflit')}</p>
                {selectedEvent.conflicts.map((conflict) => <p key={conflict.with} className="mt-1 text-sm font-semibold">{conflict.message}</p>)}
              </div>
            )}

            <div className="mt-5 rounded-3xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{tr('Summary', 'Résumé')}</p>
              <p className="mt-2 text-sm font-semibold text-slate-700">{selectedEvent.subtitle}</p>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild className="rounded-2xl bg-violet-600 text-white hover:bg-violet-700">
                <Link to={selectedEvent.href}><ExternalLink className="mr-2 h-4 w-4" />{tr('Open full record', 'Ouvrir fiche complète')}</Link>
              </Button>
              <Button variant="outline" onClick={() => setSelectedEvent(null)} className="rounded-2xl">{tr('Back to calendar', 'Retour calendrier')}</Button>
            </div>
          </aside>
        </div>
      )}

      {quickCreateDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-lg rounded-[2rem] bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-500">{tr('Quick create', 'Création rapide')}</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-950">{formatDayLabel(quickCreateDay)}</h2>
              </div>
              <Button variant="outline" onClick={() => setQuickCreateDay(null)} className="rounded-2xl"><X className="h-4 w-4" /></Button>
            </div>
            <div className="mt-5 grid gap-2">
              {[
                { icon: CalendarDays, label: tr('Create rental', 'Créer location'), href: '/admin/rentals' },
                { icon: Compass, label: tr('Add tour', 'Ajouter tour'), href: '/admin/tours' },
                { icon: Wrench, label: tr('Schedule maintenance', 'Planifier maintenance'), href: '/admin/maintenance?action=create' },
                { icon: ListChecks, label: tr('Create task', 'Créer tâche'), href: '/admin/tasks' },
                { icon: Fuel, label: tr('Add fuel note', 'Ajouter note carburant'), href: '/admin/fuel' },
              ].map((action) => {
                const Icon = action.icon;
                return (
                  <button key={action.label} type="button" onClick={() => navigate(action.href)} className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-left font-semibold text-slate-800 transition hover:border-violet-300 hover:bg-violet-50">
                    <Icon className="h-5 w-5 text-violet-600" />
                    {action.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarPage;
