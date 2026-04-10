import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Boxes,
  Calendar,
  Car,
  Check,
  CheckCheck,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  DollarSign,
  ExternalLink,
  Filter,
  Fuel,
  Info,
  MapPin,
  RefreshCw,
  Search,
  ShieldAlert,
  Wrench,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import AdminModuleHero from '../../components/admin/AdminModuleHero';
import alertService from '../../services/AlertService';
import fuelService from '../../services/FuelService';
import inventoryAlertsService from '../../services/AlertsService';
import { TABLE_NAMES } from '../../config/tableNames';
import { shortenUrl } from '../../services/UrlShortenerService';
import { buildTourTrackingUrl } from '../../services/tourTrackingService';
import i18n from '../../i18n';

const RETURN_DUE_SOON_HOURS = 48;
const TOUR_BOOKING_MARKER = '[tour_booking]';

const MODULE_META = {
  tours: {
    label: 'Tours & Booking',
    labelFr: 'Tours & réservations',
    icon: Calendar,
    iconClass: 'bg-violet-100 text-violet-700',
    borderClass: 'border-violet-100',
    tintClass: 'bg-violet-50/60',
    route: '/admin/tours',
  },
  rental: {
    label: 'Rental Management',
    labelFr: 'Gestion des locations',
    icon: DollarSign,
    iconClass: 'bg-blue-100 text-blue-700',
    borderClass: 'border-blue-100',
    tintClass: 'bg-blue-50/60',
    route: '/admin/rentals',
  },
  fleet: {
    label: 'Fleet Management',
    labelFr: 'Gestion de flotte',
    icon: Car,
    iconClass: 'bg-sky-100 text-sky-700',
    borderClass: 'border-sky-100',
    tintClass: 'bg-sky-50/60',
    route: '/admin/fleet',
  },
  maintenance: {
    label: 'Maintenance',
    labelFr: 'Maintenance',
    icon: Wrench,
    iconClass: 'bg-amber-100 text-amber-700',
    borderClass: 'border-amber-100',
    tintClass: 'bg-amber-50/60',
    route: '/admin/maintenance',
  },
  fuel: {
    label: 'Fuel Logs',
    labelFr: 'Journal carburant',
    icon: Fuel,
    iconClass: 'bg-orange-100 text-orange-700',
    borderClass: 'border-orange-100',
    tintClass: 'bg-orange-50/60',
    route: '/admin/fuel',
  },
  inventory: {
    label: 'Inventory',
    labelFr: 'Inventaire',
    icon: Boxes,
    iconClass: 'bg-emerald-100 text-emerald-700',
    borderClass: 'border-emerald-100',
    tintClass: 'bg-emerald-50/60',
    route: '/admin/inventory',
  },
  price_approval: {
    label: 'Pricing Management',
    labelFr: 'Gestion tarifaire',
    icon: DollarSign,
    iconClass: 'bg-fuchsia-100 text-fuchsia-700',
    borderClass: 'border-fuchsia-100',
    tintClass: 'bg-fuchsia-50/60',
    route: '/admin/rentals',
  },
};

const PRIORITY_META = {
  high: {
    label: 'Critical',
    labelFr: 'Critique',
    chip: 'bg-red-50 text-red-700 border border-red-200',
    dot: 'bg-red-500',
  },
  medium: {
    label: 'Warning',
    labelFr: 'Alerte',
    chip: 'bg-amber-50 text-amber-700 border border-amber-200',
    dot: 'bg-amber-500',
  },
  low: {
    label: 'Info',
    labelFr: 'Info',
    chip: 'bg-sky-50 text-sky-700 border border-sky-200',
    dot: 'bg-sky-500',
  },
};

const extractTourBookingMeta = (value) => {
  const text = typeof value === 'string' ? value : '';
  const markerIndex = text.indexOf(TOUR_BOOKING_MARKER);
  if (markerIndex === -1) return null;
  try {
    return JSON.parse(text.slice(markerIndex + TOUR_BOOKING_MARKER.length).trim());
  } catch {
    return null;
  }
};

const formatAmount = (amount) => `${Number(amount || 0).toLocaleString()} MAD`;

const scheduleBackgroundTask = (callback) => {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    return window.requestIdleCallback(callback, { timeout: 700 });
  }

  return window.setTimeout(callback, 0);
};

const cancelBackgroundTask = (taskId) => {
  if (typeof window !== 'undefined' && 'cancelIdleCallback' in window && typeof taskId === 'number') {
    window.cancelIdleCallback(taskId);
    return;
  }

  clearTimeout(taskId);
};

const localToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const isFrenchLocale = () => i18n.resolvedLanguage === 'fr';
const tr = (en, fr) => (isFrenchLocale() ? fr : en);

const formatRelativeTime = (value) => {
  if (!value) return tr('Just now', "À l'instant");
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return tr('Just now', "À l'instant");
  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  if (diffMinutes <= 0) return tr('Just now', "À l'instant");
  if (diffMinutes < 60) return isFrenchLocale() ? `il y a ${diffMinutes} min` : `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return isFrenchLocale() ? `il y a ${diffHours} h` : `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return isFrenchLocale() ? `il y a ${diffDays} j` : `${diffDays}d ago`;
};

const getTourEndTimestamp = (tour) => {
  const start = new Date((tour?.status === 'active' && tour?.startedAt) || tour?.scheduledStartAt || '');
  if (Number.isNaN(start.getTime())) return Number.NaN;
  return start.getTime() + Number(tour?.durationHours || 1) * 60 * 60 * 1000;
};

const isTourExpired = (tour) => {
  if (String(tour?.status || '').toLowerCase() !== 'active') return false;
  const endTimestamp = getTourEndTimestamp(tour);
  if (Number.isNaN(endTimestamp)) return false;
  return Date.now() > endTimestamp;
};

const getAlertRoute = (alert) => {
  if (alert.data?.rentalId) return `/admin/rentals/${alert.data.rentalId}`;
  if (alert.data?.maintenanceId) return `/admin/maintenance/${alert.data.maintenanceId}`;
  if (alert.data?.vehicleId) return `/admin/fleet/${alert.data.vehicleId}`;
  return MODULE_META[alert.source]?.route || '/admin/alerts';
};

const Alerts = () => {
  const isFrench = isFrenchLocale();
  const navigate = useNavigate();
  const { session, user } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    priority: 'all',
    module: 'all',
    status: 'open',
  });
  const [collapsedModules, setCollapsedModules] = useState({});
  const [historyOpen, setHistoryOpen] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const alertsRefreshTimeoutRef = useRef(null);

  const loadFleetAlerts = useCallback(async () => {
    try {
      return alertService.getAllAlerts().map((alert) => ({
        id: alert.id,
        title: alert.title || tr('Fleet alert', 'Alerte flotte'),
        message: alert.message || tr('Vehicle requires attention.', 'Le vehicule demande une attention.'),
        type: alert.isExpired || alert.isOverdue ? 'error' : alert.priority === 'medium' ? 'warning' : 'info',
        priority: alert.priority || 'low',
        category: 'fleet',
        source: 'fleet',
        createdAt: alert.createdAt || new Date().toISOString(),
        data: {
          vehicleId: alert.vehicleId,
          vehicleName: alert.vehicleName,
          plateNumber: alert.plateNumber,
          type: alert.type,
        },
      }));
    } catch (loadError) {
      console.error('Fleet alerts load failed:', loadError);
      return [];
    }
  }, []);

  const loadFuelAlerts = useCallback(async () => {
    try {
      const fuelAlerts = [];
      const { error: tankCheckError } = await supabase.from('fuel_tank').select('id').limit(1);
      if (tankCheckError?.code === '42P01') {
        return [];
      }

      const tank = await fuelService.getTankStatus();
      if (!tank) return [];

      const currentPercentage = (parseFloat(tank.current_volume || 0) / Math.max(parseFloat(tank.capacity || 1), 1)) * 100;
      const lowThreshold = parseFloat(tank.low_threshold || 15);

      if (currentPercentage <= lowThreshold) {
        fuelAlerts.push({
          id: `fuel-low-${tank.id}`,
          title: currentPercentage <= 5 ? tr('Fuel critically low', 'Carburant critique') : tr('Fuel running low', 'Carburant faible'),
          message: isFrench
            ? `${Number(currentPercentage).toFixed(1)}% restants dans le reservoir principal (${tank.current_volume}L restants).`
            : `${Number(currentPercentage).toFixed(1)}% remaining in the main tank (${tank.current_volume}L left).`,
          type: currentPercentage <= 5 ? 'error' : 'warning',
          priority: currentPercentage <= 5 ? 'high' : 'medium',
          category: 'fuel',
          source: 'fuel',
          createdAt: new Date().toISOString(),
          data: {
            tankId: tank.id,
            currentVolume: tank.current_volume,
            capacity: tank.capacity,
            percentage: currentPercentage,
          },
        });
      }

      return fuelAlerts;
    } catch (loadError) {
      console.error('Fuel alerts load failed:', loadError);
      return [];
    }
  }, []);

  const loadMaintenanceAlerts = useCallback(async () => {
    try {
      const { data, error: maintenanceError } = await supabase
        .from('app_687f658e98_maintenance')
        .select('id, vehicle_id, vehicle_name, type, maintenance_type, date, scheduled_date, status')
        .in('status', ['scheduled', 'pending', 'in_progress'])
        .order('date', { ascending: true });

      if (maintenanceError) throw maintenanceError;

      const today = new Date();
      return (data || []).flatMap((maintenance) => {
        const scheduledDate = new Date(maintenance.date || maintenance.scheduled_date);
        const daysUntilDue = Math.ceil((scheduledDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (daysUntilDue > 7) {
          return [];
        }

        const overdue = daysUntilDue < 0;
        return [{
          id: `maintenance-${maintenance.id}`,
          title: overdue
            ? tr('Maintenance overdue', 'Maintenance en retard')
            : daysUntilDue <= 1
              ? tr('Maintenance due now', 'Maintenance a faire maintenant')
              : tr('Maintenance due soon', 'Maintenance bientot due'),
          message: isFrench
            ? `${maintenance.vehicle_name || 'Vehicule'} ${maintenance.type || maintenance.maintenance_type || 'service'} ${
                overdue
                  ? `en retard de ${Math.abs(daysUntilDue)} jour${Math.abs(daysUntilDue) === 1 ? '' : 's'}`
                  : `prevue dans ${daysUntilDue} jour${daysUntilDue === 1 ? '' : 's'}`
              }.`
            : `${maintenance.vehicle_name || 'Vehicle'} ${maintenance.type || maintenance.maintenance_type || 'service'} ${
                overdue ? `overdue by ${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) === 1 ? '' : 's'}` : `due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}`
              }.`,
          type: overdue ? 'error' : daysUntilDue <= 1 ? 'warning' : 'info',
          priority: overdue ? 'high' : daysUntilDue <= 1 ? 'medium' : 'low',
          category: 'maintenance',
          source: 'maintenance',
          createdAt: new Date().toISOString(),
          data: {
            maintenanceId: maintenance.id,
            vehicleId: maintenance.vehicle_id,
            vehicleName: maintenance.vehicle_name,
            scheduledDate: maintenance.date || maintenance.scheduled_date,
          },
        }];
      });
    } catch (loadError) {
      console.error('Maintenance alerts load failed:', loadError);
      return [];
    }
  }, []);

  const loadRentalAlerts = useCallback(async () => {
    try {
      const now = new Date();
      const dueSoonWindow = new Date(now.getTime() + RETURN_DUE_SOON_HOURS * 60 * 60 * 1000);

      const { data, error: rentalsError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .select(`
          id,
          customer_name,
          customer_phone,
          rental_end_date,
          rental_status,
          total_amount,
          remaining_amount,
          rental_completed_at,
          vehicle_id,
          vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(id, name, model, plate_number)
        `)
        .is('rental_completed_at', null)
        .neq('rental_status', 'cancelled')
        .neq('rental_status', 'completed')
        .order('rental_end_date', { ascending: true });

      if (rentalsError) throw rentalsError;

      return (data || []).flatMap((rental) => {
        const dueDate = new Date(rental.rental_end_date);
        const isOverdue = now > dueDate;
        const isDueSoon = !isOverdue && dueDate <= dueSoonWindow;
        if (!isOverdue && !isDueSoon) return [];

        const hoursUntilDue = Math.abs(dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);
        const amountDue = Math.max(0, Number(rental.remaining_amount || 0));
        const vehicleName = rental.vehicle?.model || rental.vehicle?.name || tr('Vehicle', 'Vehicule');
        const plateNumber = rental.vehicle?.plate_number || tr('N/A', 'N/D');

        return [{
          id: `rental-${rental.id}-${isOverdue ? 'overdue' : 'due'}`,
          title: isOverdue ? tr('Rental overdue', 'Location en retard') : tr('Rental ending soon', 'Location bientot terminee'),
          message: isFrench
            ? `${rental.customer_name} · ${vehicleName} (${plateNumber}) ${isOverdue ? `en retard de ${Math.max(1, Math.ceil(hoursUntilDue))}h` : `se termine dans ${Math.max(1, Math.ceil(hoursUntilDue))}h`}.`
            : `${rental.customer_name} · ${vehicleName} (${plateNumber}) ${isOverdue ? `overdue by ${Math.max(1, Math.ceil(hoursUntilDue))}h` : `ends in ${Math.max(1, Math.ceil(hoursUntilDue))}h`}.`,
          type: isOverdue ? 'error' : 'warning',
          priority: isOverdue ? 'high' : 'medium',
          category: 'rental',
          source: 'rental',
          createdAt: rental.rental_end_date,
          data: {
            rentalId: rental.id,
            vehicleId: rental.vehicle_id,
            dueDate: rental.rental_end_date,
            amountDue,
            customerPhone: rental.customer_phone,
          },
        }];
      });
    } catch (loadError) {
      console.error('Rental alerts load failed:', loadError);
      return [];
    }
  }, []);

  const loadPriceApprovalAlerts = useCallback(async () => {
    try {
      const { data, error: approvalError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .select(`
          id,
          customer_name,
          pending_total_request,
          total_amount,
          price_override_reason,
          created_at,
          vehicle_id,
          vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(id, name, model, plate_number)
        `)
        .eq('approval_status', 'pending')
        .order('created_at', { ascending: false });

      if (approvalError) throw approvalError;

      return (data || []).map((rental) => ({
        id: `approval-${rental.id}`,
        title: tr('Price approval required', 'Validation tarifaire requise'),
        message: isFrench
          ? `${rental.customer_name} a demande ${formatAmount(rental.pending_total_request)} pour ${rental.vehicle?.model || rental.vehicle?.name || 'vehicule'}.`
          : `${rental.customer_name} requested ${formatAmount(rental.pending_total_request)} for ${rental.vehicle?.model || rental.vehicle?.name || 'vehicle'}.`,
        type: 'warning',
        priority: 'high',
        category: 'rental',
        source: 'price_approval',
        createdAt: rental.created_at || new Date().toISOString(),
        data: {
          rentalId: rental.id,
          vehicleId: rental.vehicle_id,
          manualPrice: rental.pending_total_request,
          autoPrice: rental.total_amount,
          reason: rental.price_override_reason,
        },
      }));
    } catch (loadError) {
      console.error('Price approval alerts load failed:', loadError);
      return [];
    }
  }, []);

  const loadInventoryAlerts = useCallback(async () => {
    try {
      const inventoryData = await inventoryAlertsService.getInventoryAlerts();
      const inventoryAlerts = [
        ...(inventoryData.outOfStock || []),
        ...(inventoryData.lowStock || []),
        ...(inventoryData.overstock || []),
        ...(inventoryData.inactive || []),
        ...(inventoryData.highValue || []),
      ];

      return inventoryAlerts.map((alert) => ({
        id: `inventory-${alert.id}`,
        title:
          alert.type === 'out_of_stock'
            ? tr('Out of stock', 'Rupture de stock')
            : alert.type === 'low_stock'
              ? tr('Low stock', 'Stock faible')
              : alert.type === 'overstock'
                ? tr('Overstock', 'Surstock')
                : alert.type === 'inactive'
                  ? tr('Inactive inventory', 'Inventaire inactif')
                  : tr('High value inventory', 'Inventaire de grande valeur'),
        message: `${alert.itemName}${alert.sku ? ` · ${alert.sku}` : ''} — ${alert.message}`,
        type: alert.priority === 'critical' ? 'error' : alert.priority === 'warning' ? 'warning' : 'info',
        priority: alert.priority === 'critical' ? 'high' : alert.priority === 'warning' ? 'medium' : 'low',
        category: 'inventory',
        source: 'inventory',
        createdAt: alert.createdAt || new Date().toISOString(),
        data: {
          itemId: alert.itemId,
          itemName: alert.itemName,
          type: alert.type,
        },
      }));
    } catch (loadError) {
      console.error('Inventory alerts load failed:', loadError);
      return [];
    }
  }, []);

  const loadTourAlerts = useCallback(async () => {
    if (!session?.access_token) {
      return [];
    }

    try {
      const response = await fetch('/api/tour-bookings', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const payload = response.ok ? await response.json() : null;
      const rows = Array.isArray(payload?.rows) ? payload.rows : [];

      const groupedTours = new Map();
      rows.forEach((row) => {
        const meta = extractTourBookingMeta(row.notes) || {};
        const groupId =
          meta.groupId ||
          row.group_id ||
          row.package_id ||
          row.scheduled_for ||
          row.rental_start_date ||
          row.id;
        if (!groupId) return;
        const current = groupedTours.get(groupId) || [];
        current.push({ ...row, alertMeta: meta });
        groupedTours.set(groupId, current);
      });

      const groupedArray = Array.from(groupedTours.entries()).map(([groupId, rowsForGroup]) => {
        const sortedRows = [...rowsForGroup].sort(
          (a, b) =>
            new Date(a.rental_start_date || a.scheduled_for || a.created_at).getTime() -
            new Date(b.rental_start_date || b.scheduled_for || b.created_at).getTime()
        );
        const first = sortedRows[0];
        const meta = first.alertMeta || {};
        const statuses = sortedRows.map((row) =>
          String(row.rental_status || row.status || row.booking_payload?.rental_status || 'scheduled').toLowerCase()
        );
        const status = statuses.includes('active')
          ? 'active'
          : statuses.every((value) => value === 'completed')
            ? 'completed'
            : statuses.every((value) => value === 'cancelled')
              ? 'cancelled'
              : 'scheduled';

        return {
          groupId,
          packageName: meta.packageName || first.package_name || tr('Tour package', 'Forfait tour'),
          customerName: first.customer_name || meta.customerName || tr('Guest', 'Invite'),
          guideName: meta.guideName || first.guide_name || tr('Unassigned', 'Non assigne'),
          guideId: meta.guideId || first.guide_id || '',
          durationHours: Number(meta.durationHours || first.duration_hours || 1),
          scheduledStartAt: meta.scheduledStartAt || first.scheduled_for || first.rental_start_date,
          startedAt: meta.startedAt || first.started_at || '',
          trackingUrl: buildTourTrackingUrl(groupId),
          status,
        };
      });

      const guideIds = [...new Set(groupedArray.map((tour) => String(tour.guideId || '')).filter(Boolean))];
      let guidePhoneMap = new Map();
      if (guideIds.length > 0) {
        const { data: guideRows } = await supabase
          .from(TABLE_NAMES.USERS)
          .select('id, phone_number')
          .in('id', guideIds);
        guidePhoneMap = new Map((guideRows || []).map((guide) => [String(guide.id), guide.phone_number || '']));
      }

      const today = localToday();
      return groupedArray.flatMap((tour) => {
        const guidePhone = guidePhoneMap.get(String(tour.guideId || '')) || '';
        const expired = isTourExpired(tour);
        const scheduledToday = String(tour.scheduledStartAt || '').startsWith(today);
        const startsAt = new Date(tour.scheduledStartAt || '');
        const startsSoon = tour.status === 'scheduled' && Number.isFinite(startsAt.getTime()) && startsAt.getTime() - Date.now() <= 60 * 60 * 1000;

        if (!expired && !scheduledToday && !startsSoon) {
          return [];
        }

        return [{
          id: `tour-${tour.groupId}-${expired ? 'expired' : tour.status}`,
          title: expired
            ? tr('Expired tour', 'Tour expire')
            : startsSoon
              ? tr('Tour starting soon', 'Tour bientot demarre')
              : tr('Tour scheduled today', 'Tour prevu aujourd hui'),
          message: `${tour.packageName} · ${tour.customerName} · ${tour.guideName}`,
          type: expired ? 'error' : 'warning',
          priority: expired ? 'high' : 'medium',
          category: 'tours',
          source: 'tours',
          createdAt: tour.scheduledStartAt || new Date().toISOString(),
          data: {
            groupId: tour.groupId,
            guideId: tour.guideId,
            guidePhone,
            trackingUrl: tour.trackingUrl,
          },
        }];
      });
    } catch (loadError) {
      console.error('Tour alerts load failed:', loadError);
      return [];
    }
  }, [session?.access_token]);

  const mergeAlerts = useCallback((incomingAlerts) => {
    const normalized = incomingAlerts
      .map((alert) => ({
        ...alert,
        read: Boolean(alert.read),
        acknowledged: Boolean(alert.acknowledged),
        resolved: Boolean(alert.resolved),
      }))
      .sort((a, b) => {
        const priorityWeight = { high: 3, medium: 2, low: 1 };
        const priorityDiff = (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0);
        if (priorityDiff !== 0) return priorityDiff;
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });

    setAlerts((prev) =>
      normalized.map((alert) => {
        const previous = prev.find((item) => item.id === alert.id);
        return previous
          ? {
              ...alert,
              read: previous.read,
              acknowledged: previous.acknowledged,
              resolved: previous.resolved,
              resolvedAt: previous.resolvedAt,
            }
          : alert;
      })
    );
  }, []);

  const loadAllAlerts = useCallback(async () => {
    try {
      if (!hasLoadedOnce) {
        setLoading(true);
      }
      setError(null);

      const [fleetResult, fuelResult, maintenanceResult, rentalResult, priceApprovalResult] = await Promise.allSettled([
        loadFleetAlerts(),
        loadFuelAlerts(),
        loadMaintenanceAlerts(),
        loadRentalAlerts(),
        loadPriceApprovalAlerts(),
      ]);

      const fleetAlerts = fleetResult.status === 'fulfilled' ? fleetResult.value : [];
      const fuelAlerts = fuelResult.status === 'fulfilled' ? fuelResult.value : [];
      const maintenanceAlerts = maintenanceResult.status === 'fulfilled' ? maintenanceResult.value : [];
      const rentalAlerts = rentalResult.status === 'fulfilled' ? rentalResult.value : [];
      const priceApprovalAlerts = priceApprovalResult.status === 'fulfilled' ? priceApprovalResult.value : [];

      mergeAlerts([
        ...fleetAlerts,
        ...fuelAlerts,
        ...maintenanceAlerts,
        ...rentalAlerts,
        ...priceApprovalAlerts,
      ]);
      setHasLoadedOnce(true);
      setLoading(false);

      const backgroundTaskId = scheduleBackgroundTask(async () => {
        try {
          const [inventoryResult, tourResult] = await Promise.allSettled([
            loadInventoryAlerts(),
            loadTourAlerts(),
          ]);
          const inventoryAlerts = inventoryResult.status === 'fulfilled' ? inventoryResult.value : [];
          const tourAlerts = tourResult.status === 'fulfilled' ? tourResult.value : [];

          mergeAlerts([
            ...fleetAlerts,
            ...fuelAlerts,
            ...maintenanceAlerts,
            ...rentalAlerts,
            ...priceApprovalAlerts,
            ...inventoryAlerts,
            ...tourAlerts,
          ]);
        } catch (backgroundError) {
          console.error('Background alerts load failed:', backgroundError);
        }
      });

      return () => cancelBackgroundTask(backgroundTaskId);
    } catch (loadError) {
      console.error('Alerts load failed:', loadError);
      setError(loadError.message || 'Failed to load alerts');
    } finally {
      setLoading(false);
    }
  }, [
    hasLoadedOnce,
    loadFleetAlerts,
    loadFuelAlerts,
    loadInventoryAlerts,
    loadMaintenanceAlerts,
    loadPriceApprovalAlerts,
    loadRentalAlerts,
    loadTourAlerts,
    mergeAlerts,
  ]);

  const scheduleAlertsRefresh = useCallback(() => {
    if (alertsRefreshTimeoutRef.current) {
      window.clearTimeout(alertsRefreshTimeoutRef.current);
    }

    alertsRefreshTimeoutRef.current = window.setTimeout(() => {
      loadAllAlerts();
      alertsRefreshTimeoutRef.current = null;
    }, 250);
  }, [loadAllAlerts]);

  useEffect(() => {
    let cleanupTask;
    loadAllAlerts().then((cleanup) => {
      cleanupTask = cleanup;
    });

    const unsubscribeAlerts = alertService.subscribe(() => scheduleAlertsRefresh());
    const unsubscribeFuel = fuelService.subscribe(() => scheduleAlertsRefresh());

    return () => {
      if (typeof cleanupTask === 'function') {
        cleanupTask();
      }
      if (alertsRefreshTimeoutRef.current) {
        window.clearTimeout(alertsRefreshTimeoutRef.current);
      }
      unsubscribeAlerts();
      unsubscribeFuel();
    };
  }, [loadAllAlerts, scheduleAlertsRefresh]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAllAlerts();
    setRefreshing(false);
  };

  const handleAcknowledgeAlert = (alertId) => {
    setAlerts((prev) =>
      prev.map((alert) =>
        alert.id === alertId
          ? { ...alert, read: true, acknowledged: true }
          : alert
      )
    );
  };

  const handleResolveAlert = (alertId) => {
    setAlerts((prev) =>
      prev.map((alert) =>
        alert.id === alertId
          ? { ...alert, read: true, acknowledged: true, resolved: true, resolvedAt: new Date().toISOString() }
          : alert
      )
    );
  };

  const openAlert = async (alert) => {
    navigate(getAlertRoute(alert));
  };

  const sendGuideLocateMessage = async (alert) => {
    const cleanPhone = String(alert?.data?.guidePhone || '').replace(/\D/g, '');
    if (!cleanPhone) return;

    try {
      const trackingUrl = alert?.data?.trackingUrl || buildTourTrackingUrl(alert.data?.groupId);
      const shortTrackingUrl = await shortenUrl(trackingUrl, null, 'tour_tracking');
      const message = `Open and share location now: ${shortTrackingUrl}`;
      const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    } catch (whatsAppError) {
      console.error('Guide WhatsApp open failed:', whatsAppError);
    }
  };

  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      const matchesPriority = filters.priority === 'all' || alert.priority === filters.priority;
      const matchesModule = filters.module === 'all' || alert.source === filters.module;
      const matchesStatus =
        filters.status === 'all' ||
        (filters.status === 'open' && !alert.resolved) ||
        (filters.status === 'unread' && !alert.read && !alert.resolved) ||
        (filters.status === 'acknowledged' && alert.acknowledged && !alert.resolved) ||
        (filters.status === 'resolved' && alert.resolved);
      const haystack = `${alert.title} ${alert.message} ${alert.source} ${alert.category}`.toLowerCase();
      const matchesSearch = !searchTerm.trim() || haystack.includes(searchTerm.toLowerCase());
      return matchesPriority && matchesModule && matchesStatus && matchesSearch;
    });
  }, [alerts, filters, searchTerm]);

  const openAlerts = useMemo(
    () => filteredAlerts.filter((alert) => !alert.resolved),
    [filteredAlerts]
  );

  const criticalAlerts = useMemo(
    () => openAlerts.filter((alert) => alert.priority === 'high').slice(0, 6),
    [openAlerts]
  );

  const groupedAlerts = useMemo(() => {
    return openAlerts.reduce((acc, alert) => {
      const key = alert.source || 'other';
      if (!acc[key]) acc[key] = [];
      acc[key].push(alert);
      return acc;
    }, {});
  }, [openAlerts]);

  const resolvedAlerts = useMemo(
    () => filteredAlerts.filter((alert) => alert.resolved),
    [filteredAlerts]
  );

  const stats = useMemo(() => {
    const resolvedToday = alerts.filter((alert) => alert.resolved && String(alert.resolvedAt || '').startsWith(localToday())).length;
    const assignedToMe = alerts.filter((alert) => String(alert.data?.guideId || '') === String(user?.id || '')).length;
    const fleetIssues = alerts.filter((alert) => ['fleet', 'fuel', 'maintenance'].includes(alert.source) && !alert.resolved).length;
    const tourIssues = alerts.filter((alert) => alert.source === 'tours' && !alert.resolved).length;
    return {
      critical: alerts.filter((alert) => alert.priority === 'high' && !alert.resolved).length,
      unread: alerts.filter((alert) => !alert.read && !alert.resolved).length,
      assignedToMe,
      resolvedToday,
      fleetIssues,
      tourIssues,
    };
  }, [alerts, user?.id]);

  const toggleModule = (moduleKey) => {
    setCollapsedModules((prev) => ({
      ...prev,
      [moduleKey]: !prev[moduleKey],
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminModuleHero
          icon={<Bell className="h-8 w-8 text-white" />}
          eyebrow={tr('Alerts', 'Alertes')}
          title={tr('Alerts', 'Alertes')}
          description=""
          className="w-full"
        />
        <div className="p-4 sm:p-6">
          <div className="rounded-[2rem] border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
            <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
              <div className="text-5xl leading-none animate-pulse">⏳</div>
              <h2 className="text-xl font-semibold text-slate-900">
                {tr('Loading alerts...', 'Chargement des alertes...')}
              </h2>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminModuleHero
        icon={<Bell className="h-8 w-8 text-white" />}
        eyebrow={tr('Alerts', 'Alertes')}
        title={tr('Alerts', 'Alertes')}
        description=""
        className="w-full"
        actions={
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-white backdrop-blur-sm transition-all hover:bg-white/20 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {tr('Refresh', 'Actualiser')}
          </button>
        }
      />

      <div className="p-4 sm:p-6">
      {error ? (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          <div className="flex items-center gap-2 font-semibold">
            <ShieldAlert className="h-5 w-5" />
            {tr('Error loading alerts', 'Erreur de chargement des alertes')}
          </div>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      ) : null}

      <section className="mt-6">
        <div className="mb-4">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-violet-500">{tr('Operational inbox', 'Boîte opérationnelle')}</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-900">{tr('Critical and live issues from every module', 'Problèmes critiques et en direct de tous les modules')}</h2>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-6">
          {[
            { label: tr('Critical', 'Critique'), value: stats.critical, icon: AlertTriangle, iconClass: 'bg-red-50 text-red-600', chipClass: 'text-red-600' },
            { label: tr('Unread', 'Non lues'), value: stats.unread, icon: Bell, iconClass: 'bg-violet-50 text-violet-600', chipClass: 'text-violet-600' },
            { label: tr('Assigned to me', 'Assignées à moi'), value: stats.assignedToMe, icon: CheckCheck, iconClass: 'bg-sky-50 text-sky-600', chipClass: 'text-sky-600' },
            { label: tr('Resolved today', "Résolues aujourd'hui"), value: stats.resolvedToday, icon: CheckCircle, iconClass: 'bg-emerald-50 text-emerald-600', chipClass: 'text-emerald-600' },
            { label: tr('Fleet issues', 'Problèmes flotte'), value: stats.fleetIssues, icon: Car, iconClass: 'bg-amber-50 text-amber-600', chipClass: 'text-amber-600' },
            { label: tr('Tour issues', 'Problèmes tours'), value: stats.tourIssues, icon: Calendar, iconClass: 'bg-fuchsia-50 text-fuchsia-600', chipClass: 'text-fuchsia-600' },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-xl border border-violet-100 bg-white px-4 py-4 shadow-[0_18px_45px_rgba(76,29,149,0.08)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-500">{item.label}</p>
                    <p className="mt-2 text-3xl font-bold text-slate-900">{item.value}</p>
                  </div>
                  <div className={`rounded-2xl p-3 ${item.iconClass}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-violet-100 bg-white p-4 shadow-[0_18px_45px_rgba(76,29,149,0.08)] sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-violet-500">{tr('Smart filters', 'Filtres intelligents')}</p>
            <h3 className="mt-1 text-xl font-bold text-slate-900">{tr("Find the right alert fast", "Trouvez la bonne alerte rapidement")}</h3>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-[260px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={tr('Search alerts, vehicles, guests, items...', 'Rechercher alertes, véhicules, clients, articles...')}
                className="w-full rounded-2xl border border-violet-100 bg-slate-50/70 py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-violet-300 focus:bg-white focus:ring-2 focus:ring-violet-500/20"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <select
                value={filters.priority}
                onChange={(e) => setFilters((prev) => ({ ...prev, priority: e.target.value }))}
                className="rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-500/20"
              >
                <option value="all">{tr('All severities', 'Toutes les priorités')}</option>
                <option value="high">{tr('Critical', 'Critique')}</option>
                <option value="medium">{tr('Warning', 'Alerte')}</option>
                <option value="low">{tr('Info', 'Info')}</option>
              </select>
              <select
                value={filters.module}
                onChange={(e) => setFilters((prev) => ({ ...prev, module: e.target.value }))}
                className="rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-500/20"
              >
                <option value="all">{tr('All modules', 'Tous les modules')}</option>
                {Object.entries(MODULE_META).map(([key, meta]) => (
                  <option key={key} value={key}>{isFrench ? (meta.labelFr || meta.label) : meta.label}</option>
                ))}
              </select>
              <select
                value={filters.status}
                onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
                className="rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-500/20"
              >
                <option value="open">{tr('Open only', 'Ouvertes seulement')}</option>
                <option value="unread">{tr('Unread', 'Non lues')}</option>
                <option value="acknowledged">{tr('Acknowledged', 'Accusées')}</option>
                <option value="resolved">{tr('Resolved', 'Résolues')}</option>
                <option value="all">{tr('Everything', 'Toutes')}</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6">
        <div className="mb-4">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-violet-500">{tr('Critical now', 'Critique maintenant')}</p>
          <h3 className="mt-1 text-2xl font-bold text-slate-900">{tr('Handle the highest-priority issues first', 'Traitez d’abord les problèmes les plus prioritaires')}</h3>
        </div>
        {criticalAlerts.length === 0 ? (
          <div className="rounded-xl border border-violet-100 bg-white p-8 text-center shadow-[0_18px_45px_rgba(76,29,149,0.08)]">
            <CheckCircle className="mx-auto h-12 w-12 text-emerald-500" />
            <h4 className="mt-4 text-lg font-semibold text-slate-900">{tr('No critical alerts right now', "Aucune alerte critique pour l'instant")}</h4>
            <p className="mt-1 text-sm text-slate-500">{tr('Warnings and informational alerts are still available in the grouped feed below.', 'Les alertes d’avertissement et d’information restent disponibles dans le flux groupé ci-dessous.')}</p>
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
            {criticalAlerts.map((alert) => {
              const moduleMeta = MODULE_META[alert.source] || MODULE_META.rental;
              const ModuleIcon = moduleMeta.icon;
              return (
                <article key={alert.id} className="rounded-xl border border-red-100 bg-white p-5 shadow-[0_18px_45px_rgba(220,38,38,0.08)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className={`rounded-2xl p-3 ${moduleMeta.iconClass}`}>
                        <ModuleIcon className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${PRIORITY_META[alert.priority]?.chip || PRIORITY_META.low.chip}`}>
                            {isFrench ? (PRIORITY_META[alert.priority]?.labelFr || PRIORITY_META[alert.priority]?.label || 'Info') : (PRIORITY_META[alert.priority]?.label || 'Info')}
                          </span>
                          <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">{isFrench ? (moduleMeta.labelFr || moduleMeta.label) : moduleMeta.label}</span>
                        </div>
                        <h4 className="mt-3 text-lg font-bold text-slate-900">{alert.title}</h4>
                        <p className="mt-2 text-sm leading-6 text-slate-600">{alert.message}</p>
                      </div>
                    </div>
                    <span className="text-xs font-medium text-slate-400">{formatRelativeTime(alert.createdAt)}</span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openAlert(alert)}
                      className="inline-flex items-center gap-2 rounded-2xl border border-violet-100 bg-white px-3 py-2 text-sm font-semibold text-violet-700 transition hover:bg-violet-50"
                    >
                      {tr('Open', 'Ouvrir')}
                      <ExternalLink className="h-4 w-4" />
                    </button>
                    {alert.source === 'tours' && alert.data?.guidePhone ? (
                      <button
                        type="button"
                        onClick={() => sendGuideLocateMessage(alert)}
                        className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
                      >
                        <MapPin className="h-4 w-4" />
                        {tr('Locate Guide', 'Localiser le guide')}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => handleAcknowledgeAlert(alert.id)}
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <Check className="h-4 w-4" />
                      {tr('Acknowledge', 'Accuser')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResolveAlert(alert.id)}
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <CheckCheck className="h-4 w-4" />
                      {tr('Resolve', 'Résoudre')}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-6">
        <div className="mb-4">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-violet-500">{tr('Grouped by module', 'Groupées par module')}</p>
          <h3 className="mt-1 text-2xl font-bold text-slate-900">{tr('Work through alerts where they happen', 'Traitez les alertes là où elles apparaissent')}</h3>
        </div>
        <div className="space-y-4">
          {Object.entries(MODULE_META).map(([moduleKey, moduleMeta]) => {
            const moduleAlerts = groupedAlerts[moduleKey] || [];
            if (moduleAlerts.length === 0) return null;
            const ModuleIcon = moduleMeta.icon;
            const isCollapsed = collapsedModules[moduleKey] === true;
            return (
              <section key={moduleKey} className={`overflow-hidden rounded-xl border ${moduleMeta.borderClass} bg-white shadow-[0_18px_45px_rgba(76,29,149,0.08)]`}>
                <button
                  type="button"
                  onClick={() => toggleModule(moduleKey)}
                  className={`flex w-full items-center justify-between gap-4 px-4 py-4 text-left sm:px-5 ${moduleMeta.tintClass}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`rounded-2xl p-3 ${moduleMeta.iconClass}`}>
                      <ModuleIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-lg font-bold text-slate-900">{isFrench ? (moduleMeta.labelFr || moduleMeta.label) : moduleMeta.label}</p>
                      <p className="text-sm text-slate-500">{isFrench ? `${moduleAlerts.length} alerte${moduleAlerts.length === 1 ? '' : 's'} ouverte${moduleAlerts.length === 1 ? '' : 's'}` : `${moduleAlerts.length} open alert${moduleAlerts.length === 1 ? '' : 's'}`}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        navigate(moduleMeta.route);
                      }}
                      className="hidden rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:inline-flex"
                    >
                      {tr('Open module', 'Ouvrir le module')}
                    </button>
                    {isCollapsed ? <ChevronRight className="h-5 w-5 text-slate-500" /> : <ChevronDown className="h-5 w-5 text-slate-500" />}
                  </div>
                </button>

                {!isCollapsed ? (
                  <div className="space-y-3 px-4 py-4 sm:px-5">
                    {moduleAlerts.map((alert) => {
                      const priorityMeta = PRIORITY_META[alert.priority] || PRIORITY_META.low;
                      return (
                        <article key={alert.id} className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-violet-200 hover:shadow-sm">
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`inline-flex h-2.5 w-2.5 rounded-full ${priorityMeta.dot}`} />
                                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${priorityMeta.chip}`}>
                                  {isFrench ? (priorityMeta.labelFr || priorityMeta.label) : priorityMeta.label}
                                </span>
                                {!alert.read ? (
                                  <span className="inline-flex items-center rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 border border-violet-200">
                                    {tr('Unread', 'Non lue')}
                                  </span>
                                ) : null}
                                {alert.acknowledged && !alert.resolved ? (
                                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 border border-slate-200">
                                    {tr('Acknowledged', 'Accusée')}
                                  </span>
                                ) : null}
                              </div>
                              <h4 className="mt-3 text-lg font-bold text-slate-900">{alert.title}</h4>
                              <p className="mt-2 text-sm leading-6 text-slate-600">{alert.message}</p>
                            </div>

                            <div className="shrink-0 text-sm text-slate-400">{formatRelativeTime(alert.createdAt)}</div>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => openAlert(alert)}
                              className="inline-flex items-center gap-2 rounded-2xl border border-violet-100 bg-white px-3 py-2 text-sm font-semibold text-violet-700 transition hover:bg-violet-50"
                            >
                              {tr('Open', 'Ouvrir')}
                              <ExternalLink className="h-4 w-4" />
                            </button>
                            {alert.source === 'tours' && alert.data?.guidePhone ? (
                              <button
                                type="button"
                                onClick={() => sendGuideLocateMessage(alert)}
                                className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
                              >
                                <MapPin className="h-4 w-4" />
                                {tr('Locate Guide', 'Localiser le guide')}
                              </button>
                            ) : null}
                            {!alert.acknowledged ? (
                              <button
                                type="button"
                                onClick={() => handleAcknowledgeAlert(alert.id)}
                                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                              >
                                <Check className="h-4 w-4" />
                                {tr('Acknowledge', 'Accuser')}
                              </button>
                            ) : null}
                            {!alert.resolved ? (
                              <button
                                type="button"
                                onClick={() => handleResolveAlert(alert.id)}
                                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                              >
                                <CheckCheck className="h-4 w-4" />
                                {tr('Resolve', 'Résoudre')}
                              </button>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-xl border border-violet-100 bg-white shadow-[0_18px_45px_rgba(76,29,149,0.08)]">
        <button
          type="button"
          onClick={() => setHistoryOpen((prev) => !prev)}
          className="flex w-full items-center justify-between gap-4 bg-slate-50/80 px-4 py-4 text-left sm:px-5"
        >
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-violet-500">{tr('History', 'Historique')}</p>
            <h3 className="mt-1 text-2xl font-bold text-slate-900">{tr('Resolved alerts', 'Alertes résolues')}</h3>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
              {resolvedAlerts.length}
            </span>
            {historyOpen ? <ChevronDown className="h-5 w-5 text-slate-500" /> : <ChevronRight className="h-5 w-5 text-slate-500" />}
          </div>
        </button>
        {historyOpen ? (
          <div className="space-y-3 px-4 py-4 sm:px-5">
            {resolvedAlerts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center text-sm text-slate-500">
                {tr('No resolved alerts yet.', "Aucune alerte résolue pour l'instant.")}
              </div>
            ) : (
              resolvedAlerts.map((alert) => {
                const moduleMeta = MODULE_META[alert.source] || MODULE_META.rental;
                const ModuleIcon = moduleMeta.icon;
                return (
                  <article key={alert.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="flex items-start gap-3">
                      <div className={`rounded-2xl p-3 ${moduleMeta.iconClass}`}>
                        <ModuleIcon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                            {tr('Resolved', 'Résolue')}
                          </span>
                          <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">{isFrench ? (moduleMeta.labelFr || moduleMeta.label) : moduleMeta.label}</span>
                        </div>
                        <h4 className="mt-2 text-base font-bold text-slate-900">{alert.title}</h4>
                        <p className="mt-1 text-sm text-slate-600">{alert.message}</p>
                      </div>
                      <div className="text-sm text-slate-400">{formatRelativeTime(alert.resolvedAt || alert.createdAt)}</div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        ) : null}
      </section>
      </div>
    </div>
  );
};

export default Alerts;
