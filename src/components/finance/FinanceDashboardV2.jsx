import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Calendar, Filter, Download, RefreshCw, TrendingUp, DollarSign, BarChart3, Users, FileText, RotateCcw, Receipt, ShieldAlert, Fuel, Wrench, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import FilterBarV2 from './FilterBarV2';
import KPICardsV2 from './KPICardsV2';
import OverviewChartsV2 from './OverviewChartsV2';
import RentalPLTableV2 from './RentalPLTableV2';
import TourPLTableV2 from './TourPLTableV2';
import FuelPLTabV2 from './FuelPLTabV2';
import MaintenancePLTabV2 from './MaintenancePLTabV2';
import VehicleFinanceTabV2 from './VehicleFinanceTabV2';
import CustomerAnalysisTabV2 from './CustomerAnalysisTabV2';
import ReportsTabV2 from './ReportsTabV2';
import FinanceBreakdownDrawer from './FinanceBreakdownDrawer';
import FinanceCalendarTab from './FinanceCalendarTab';
import FinanceLedgerTabV2 from './FinanceLedgerTabV2';
import FinanceAlertsTabV2 from './FinanceAlertsTabV2';
import ReceiveFundsTabV2 from './ReceiveFundsTabV2';
import FinanceExpensesTabV2 from './FinanceExpensesTabV2';
import { financeApiV2 } from '../../services/financeApiV2';
import appWarmupService from '../../services/AppWarmupService';
import i18n from '../../i18n';

const scheduleBackgroundTask = (callback) => {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    return window.requestIdleCallback(callback, { timeout: 700 });
  }

  return window.setTimeout(callback, 0);
};

const isFrenchLocale = () => i18n.resolvedLanguage === 'fr';
const tr = (en, fr) => (isFrenchLocale() ? fr : en);

const toDateInputValue = (date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const fromDateInputValue = (value) => {
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const startOfWeek = (date) => {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(12, 0, 0, 0);
  return copy;
};

const endOfWeek = (date) => {
  const copy = startOfWeek(date);
  copy.setDate(copy.getDate() + 6);
  copy.setHours(12, 0, 0, 0);
  return copy;
};

const startOfMonth = (date) => {
  const copy = new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0);
  return copy;
};

const normalizeDateRange = (start, end) => {
  if (!start) return null;

  const normalizedStart = new Date(start);
  normalizedStart.setHours(12, 0, 0, 0);

  if (!end) {
    return { start: normalizedStart, end: null };
  }

  const normalizedEnd = new Date(end);
  normalizedEnd.setHours(12, 0, 0, 0);

  return normalizedStart <= normalizedEnd
    ? { start: normalizedStart, end: normalizedEnd }
    : { start: normalizedEnd, end: normalizedStart };
};

const isSameCalendarDay = (left, right) => {
  if (!(left instanceof Date) || !(right instanceof Date)) return false;
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
};

const isDateWithinInclusiveRange = (date, start, end) => {
  if (!(date instanceof Date) || !(start instanceof Date) || !(end instanceof Date)) return false;
  const current = new Date(date);
  current.setHours(12, 0, 0, 0);
  const rangeStart = new Date(start);
  rangeStart.setHours(12, 0, 0, 0);
  const rangeEnd = new Date(end);
  rangeEnd.setHours(12, 0, 0, 0);
  return current >= rangeStart && current <= rangeEnd;
};

/**
 * Enhanced Finance Dashboard v2 with Modern UI and Data Context Indicators
 * 
 * Features:
 * - Modern gradient header with improved spacing
 * - Color-coded navigation tabs with icons
 * - Smooth animations and transitions
 * - CRITICAL FIX: Proper vehicle prop passing to VehicleFinanceTabV2
 * - Real-time data integration with saharax_0u4w4d_vehicles
 * - Mobile-responsive design with enhanced visual hierarchy
 * - NEW: Data context indicators and scope clarifications
 */
const FinanceDashboardV2 = () => {
  const isFrench = isFrenchLocale();
  const warmFinanceSnapshot = appWarmupService.getWarmFinanceSnapshot();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'overview';
  const focusVehicleId = searchParams.get('vehicleId') || '';
  const focusVehicleDetail = searchParams.get('detail') === '1';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [filters, setFilters] = useState({
    startDate: warmFinanceSnapshot?.filters?.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: warmFinanceSnapshot?.filters?.endDate || new Date().toISOString().split('T')[0],
    vehicleIds: warmFinanceSnapshot?.filters?.vehicleIds || [],
    customerIds: warmFinanceSnapshot?.filters?.customerIds || [],
    orgId: warmFinanceSnapshot?.filters?.orgId || 'current'
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  // CRITICAL FIX: Enhanced data states with proper initialization
  const [kpiData, setKpiData] = useState(warmFinanceSnapshot?.kpiData || null);
  const [trendData, setTrendData] = useState(warmFinanceSnapshot?.trendData || []);
  const [pulseRows, setPulseRows] = useState(warmFinanceSnapshot?.pulseRows || []);
  const [vehicles, setVehicles] = useState(warmFinanceSnapshot?.vehicles || []); // CRITICAL: Ensure this is always an array
  const [customers, setCustomers] = useState(warmFinanceSnapshot?.customers || []);
  const [loading, setLoading] = useState(!warmFinanceSnapshot?.kpiData);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(Boolean(warmFinanceSnapshot));
  const [trendLoading, setTrendLoading] = useState(!(warmFinanceSnapshot?.trendData?.length > 0));
  const [directoryLoading, setDirectoryLoading] = useState(
    !((warmFinanceSnapshot?.vehicles?.length || 0) > 0 || (warmFinanceSnapshot?.customers?.length || 0) > 0)
  );
  const [error, setError] = useState(null);
  const [breakdownType, setBreakdownType] = useState(null);
  const [receiveFundsComposerRequest, setReceiveFundsComposerRequest] = useState(0);
  const [expenseComposerRequest, setExpenseComposerRequest] = useState(0);
  const [editComposerRequest, setEditComposerRequest] = useState(null);
  const [showDateFocusPanel, setShowDateFocusPanel] = useState(false);
  const [overviewPulseDetailOpen, setOverviewPulseDetailOpen] = useState(false);
  const [bouncingWeekDayKey, setBouncingWeekDayKey] = useState(null);
  const [bouncingDateFocusLauncher, setBouncingDateFocusLauncher] = useState(false);
  const [customDateRange, setCustomDateRange] = useState(null);
  const quickDayBounceTimeoutRef = useRef(null);
  const dateFocusLauncherBounceTimeoutRef = useRef(null);
  const lastQuickDateTapRef = useRef({ key: null, timestamp: 0 });

  const endDateObject = fromDateInputValue(filters.endDate);
  const weekStart = startOfWeek(endDateObject);
  const weekEnd = endOfWeek(endDateObject);
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + index);
    return day;
  });

  useEffect(() => {
    return () => {
      if (quickDayBounceTimeoutRef.current) {
        window.clearTimeout(quickDayBounceTimeoutRef.current);
      }
      if (dateFocusLauncherBounceTimeoutRef.current) {
        window.clearTimeout(dateFocusLauncherBounceTimeoutRef.current);
      }
    };
  }, []);

  const triggerQuickDayBounce = (key) => {
    setBouncingWeekDayKey(key);
    if (quickDayBounceTimeoutRef.current) {
      window.clearTimeout(quickDayBounceTimeoutRef.current);
    }
    quickDayBounceTimeoutRef.current = window.setTimeout(() => {
      setBouncingWeekDayKey((current) => (current === key ? null : current));
    }, 340);
  };

  const triggerDateFocusLauncherBounce = () => {
    setBouncingDateFocusLauncher(true);
    if (dateFocusLauncherBounceTimeoutRef.current) {
      window.clearTimeout(dateFocusLauncherBounceTimeoutRef.current);
    }
    dateFocusLauncherBounceTimeoutRef.current = window.setTimeout(() => {
      setBouncingDateFocusLauncher(false);
    }, 340);
  };

  // Tab configuration with enhanced styling and data scope descriptions
  const tabs = [
    { 
      id: 'overview', 
      label: tr('Overview', "Vue d'ensemble"), 
      icon: BarChart3, 
      color: 'from-blue-500 to-blue-600',
      description: '',
      dataScope: ''
    },
    { 
      id: 'rental-pl', 
      label: tr('Rental P&L', 'P&L locations'), 
      icon: DollarSign, 
      color: 'from-green-500 to-green-600',
      description: tr('Detailed rental profitability analysis', 'Analyse détaillée de rentabilité des locations'),
      dataScope: tr('Data shown reflects profit and loss details for rentals within the selected period.', 'Les données affichées reflètent les détails de profit et perte des locations sur la période sélectionnée.')
    },
    {
      id: 'tour-pl',
      label: tr('Tours P&L', 'P&L tours'),
      icon: DollarSign,
      color: 'from-emerald-500 to-teal-600',
      description: tr('Detailed tour profitability analysis', 'Analyse détaillée de rentabilité des tours'),
      dataScope: tr('Data shown reflects profit and loss details for tours within the selected period.', 'Les données affichées reflètent les détails de profit et perte des tours sur la période sélectionnée.')
    },
    {
      id: 'fuel-pl',
      label: tr('Fuel P&L', 'P&L carburant'),
      icon: Fuel,
      color: 'from-rose-500 to-orange-500',
      description: tr('Fuel in, fuel out, and where fuel is consumed most', 'Carburant entrant, sortant et où il est le plus consommé'),
      dataScope: tr('Data shown uses rental and tour fuel snapshots within the selected period.', 'Les données affichées utilisent les snapshots carburant des locations et tours sur la période sélectionnée.')
    },
    {
      id: 'maintenance-pl',
      label: tr('Maintenance P&L', 'P&L maintenance'),
      icon: Wrench,
      color: 'from-slate-500 to-slate-700',
      description: tr('Maintenance recovery, repair costs, and parts consumed', 'Récupération maintenance, coûts réparation et pièces consommées'),
      dataScope: tr('Parts consumed are shown inside maintenance cost to avoid double counting inventory.', 'Les pièces consommées sont affichées dans le coût maintenance pour éviter le double comptage inventaire.')
    },
    { 
      id: 'vehicle-finance', 
      label: tr('Vehicle Finance', 'Finance véhicule'), 
      icon: TrendingUp, 
      color: 'from-purple-500 to-purple-600',
      description: tr('Vehicle performance and lifetime value', 'Performance véhicule et valeur à vie'),
      dataScope: tr("Data shown reflects each vehicle's total lifetime financial performance.", 'Les données affichées reflètent la performance financière totale à vie de chaque véhicule.')
    },
    { 
      id: 'customer-analysis', 
      label: tr('Customer Analysis', 'Analyse client'), 
      icon: Users, 
      color: 'from-indigo-500 to-indigo-600',
      description: tr('Customer behavior and revenue analysis', 'Analyse du comportement client et des revenus'),
      dataScope: tr('Data shown includes all transactions linked to the selected customer(s).', 'Les données affichées incluent toutes les transactions liées aux clients sélectionnés.')
    },
    {
      id: 'calendar',
      label: tr('Calendar', 'Calendrier'),
      icon: Calendar,
      color: 'from-violet-500 to-purple-600',
      description: tr('Activity calendar — daily, weekly, monthly & yearly view', "Calendrier d'activité — vue journalière, hebdomadaire, mensuelle et annuelle"),
      dataScope: tr('Shows revenue and expenses per day. Click any day to see a breakdown.', 'Affiche les revenus et dépenses par jour. Cliquez sur un jour pour voir le détail.')
    },
    {
      id: 'receive-funds',
      label: tr('Receive Funds', 'Fonds reçus'),
      icon: DollarSign,
      color: 'from-violet-500 to-fuchsia-600',
      description: tr('Log actual cash and wire transfer collections with audit history', "Enregistrer les encaissements réels en espèces et virement avec l'historique d'audit"),
      dataScope: tr('Shows what the system expected versus what the team actually recorded as received.', "Affiche ce que le système attendait versus ce que l’équipe a réellement enregistré comme reçu.")
    },
    {
      id: 'expenses',
      label: tr('Expenses', 'Dépenses'),
      icon: Receipt,
      color: 'from-rose-500 to-orange-500',
      description: tr('Review purchase expenses and receipt proofs', "Revoir les dépenses d'achat et les preuves de reçu"),
      dataScope: tr('Shows purchase expenses recorded by the team for the selected period.', "Affiche les dépenses d'achat enregistrées par l'équipe sur la période sélectionnée.")
    },
    {
      id: 'ledger',
      label: tr('Ledger', 'Journal'),
      icon: Receipt,
      color: 'from-emerald-500 to-teal-600',
      description: tr('One unified financial timeline across all modules', 'Une timeline financière unifiée sur tous les modules'),
      dataScope: tr('Shows finance rows from rentals, tours, maintenance, fuel, inventory, purchases, sales, and taxes.', 'Affiche les lignes finance issues des locations, tours, maintenance, carburant, inventaire, achats, ventes et taxes.')
    },
    {
      id: 'alerts',
      label: tr('Controls', 'Contrôles'),
      icon: ShieldAlert,
      color: 'from-rose-500 to-orange-500',
      description: tr('Operating alerts for unpaid money, missing security, and unhealthy vehicles', 'Alertes opérationnelles pour argent impayé, garantie manquante et véhicules non sains'),
      dataScope: tr('Shows the items the team should act on next, based on current finance and rental state.', 'Affiche les éléments sur lesquels l’équipe doit agir ensuite selon l’état finance et location.')
    },
    {
      id: 'reports',
      label: tr('Reports', 'Rapports'),
      icon: FileText,
      color: 'from-gray-500 to-gray-600',
      description: tr('Export and reporting tools', "Outils d'export et de reporting"),
      dataScope: tr('Data shown includes export options for all available financial records.', "Les données affichées incluent les options d'export pour tous les enregistrements financiers disponibles.")
    }
  ];

  // Load initial data
  useEffect(() => {
    loadDashboardData();
  }, [filters]);

  const loadDashboardData = async () => {
    try {
      if (!hasLoadedOnce && !kpiData) {
        setLoading(true);
      }
      setError(null);

      const overviewSummary = await financeApiV2.getOverviewSummaryData(filters);
      setKpiData(overviewSummary.kpiData);
      setTrendData(Array.isArray(overviewSummary.trendData) ? overviewSummary.trendData : []);
      setPulseRows(Array.isArray(overviewSummary.pulseRows) ? overviewSummary.pulseRows : []);
      setHasLoadedOnce(true);
      setLoading(false);
      setTrendLoading(false);

      scheduleBackgroundTask(async () => {
        setDirectoryLoading(true);
        try {
          const [vehiclesResult, customersResult] = await Promise.allSettled([
            financeApiV2.getVehicles(filters.orgId),
            financeApiV2.getCustomers(filters.orgId)
          ]);

          if (vehiclesResult.status === 'fulfilled') {
            const vehicleData = Array.isArray(vehiclesResult.value) ? vehiclesResult.value : [];
            setVehicles(vehicleData);
          } else {
            setVehicles([]);
          }

          if (customersResult.status === 'fulfilled') {
            const customerData = Array.isArray(customersResult.value) ? customersResult.value : [];
            setCustomers(customerData);
          } else {
            setCustomers([]);
          }

          appWarmupService.setWarmFinanceSnapshot({
            filters,
            kpiData: overviewSummary.kpiData,
            trendData: Array.isArray(overviewSummary.trendData) ? overviewSummary.trendData : [],
            pulseRows: Array.isArray(overviewSummary.pulseRows) ? overviewSummary.pulseRows : [],
            vehicles: vehiclesResult.status === 'fulfilled' && Array.isArray(vehiclesResult.value) ? vehiclesResult.value : [],
            customers: customersResult.status === 'fulfilled' && Array.isArray(customersResult.value) ? customersResult.value : [],
          });
        } catch (backgroundError) {
          console.error('❌ Finance background hydration failed:', backgroundError);
        } finally {
          setTrendLoading(false);
          setDirectoryLoading(false);
        }
      });
      
    } catch (err) {
      setError(err.message || tr('Failed to load dashboard data', 'Échec du chargement du tableau financier'));
      setKpiData(null);
      setTrendData([]);
      setPulseRows([]);
      setVehicles([]);
      setCustomers([]);
      
    } finally {
      setLoading(false);
    }
  };

  const handleFiltersChange = (newFilters) => {
    setCustomDateRange(null);
    setFilters(newFilters);
  };

  const applyQuickRange = (mode, payloadDate = new Date()) => {
    const todayBase = new Date();
    todayBase.setHours(12, 0, 0, 0);
    const base = mode === 'today' ? new Date(todayBase) : new Date(payloadDate);
    base.setHours(12, 0, 0, 0);

    let start = new Date(base);
    let end = new Date(base);

    if (mode === 'today') {
      start = new Date(todayBase);
      end = new Date(todayBase);
    } else if (mode === 'yesterday') {
      start = new Date(todayBase);
      start.setDate(start.getDate() - 1);
      end = new Date(start);
    } else if (mode === 'week') {
      start = startOfWeek(base);
      end = endOfWeek(base);
    } else if (mode === 'last7') {
      end = new Date(base);
      start = new Date(base);
      start.setDate(start.getDate() - 6);
    } else if (mode === 'month') {
      start = startOfMonth(base);
      end = new Date(base);
    } else if (mode === 'day') {
      start = new Date(base);
      end = new Date(base);
    }

    setCustomDateRange(null);
    setFilters((prev) => ({
      ...prev,
      startDate: toDateInputValue(start),
      endDate: toDateInputValue(end)
    }));
  };

  const shiftWeek = (direction) => {
    const nextEnd = new Date(endDateObject);
    nextEnd.setDate(nextEnd.getDate() + direction * 7);
    if (customDateRange?.start && !customDateRange?.end) {
      setFilters((prev) => ({
        ...prev,
        endDate: toDateInputValue(nextEnd)
      }));
      return;
    }
    applyQuickRange('week', nextEnd);
  };

  const clearCustomDateRange = () => {
    lastQuickDateTapRef.current = { key: null, timestamp: 0 };
    setCustomDateRange(null);
    applyQuickRange('day', endDateObject);
  };

  const handleQuickDayPress = (day) => {
    const targetDate = day instanceof Date ? new Date(day) : new Date(day);
    if (Number.isNaN(targetDate.getTime())) return;

    const nextKey = toDateInputValue(targetDate);
    triggerQuickDayBounce(nextKey);
    const now = Date.now();
    const lastTap = lastQuickDateTapRef.current;
    const isDoubleTap = lastTap.key === nextKey && now - lastTap.timestamp <= 350;

    if (customDateRange?.start) {
      if (!customDateRange.end) {
        const normalizedRange = normalizeDateRange(customDateRange.start, targetDate);
        setCustomDateRange(normalizedRange);
        setFilters((prev) => ({
          ...prev,
          startDate: toDateInputValue(normalizedRange.start),
          endDate: toDateInputValue(normalizedRange.end)
        }));
        lastQuickDateTapRef.current = { key: nextKey, timestamp: now };
        return;
      }

      setCustomDateRange(null);
      applyQuickRange('day', targetDate);
      lastQuickDateTapRef.current = { key: nextKey, timestamp: now };
      return;
    }

    if (isDoubleTap) {
      const normalizedStart = new Date(targetDate);
      normalizedStart.setHours(12, 0, 0, 0);
      setCustomDateRange({ start: normalizedStart, end: null });
      lastQuickDateTapRef.current = { key: nextKey, timestamp: now };
      return;
    }

    applyQuickRange('day', targetDate);
    lastQuickDateTapRef.current = { key: nextKey, timestamp: now };
  };

  const activeQuickRangeLabel = (() => {
    const todayBase = new Date();
    todayBase.setHours(12, 0, 0, 0);
    const yesterdayBase = new Date(todayBase);
    yesterdayBase.setDate(yesterdayBase.getDate() - 1);
    if (customDateRange?.start && customDateRange?.end) {
      return `${tr('Custom Range', 'Plage personnalisée')} • ${customDateRange.start.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })} - ${customDateRange.end.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })}`;
    }
    if (customDateRange?.start) {
      return `${tr('Custom Range Start', 'Début plage personnalisée')} • ${customDateRange.start.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })}`;
    }
    if (filters.startDate === toDateInputValue(todayBase) && filters.endDate === toDateInputValue(todayBase)) {
      return `${tr('Today', "Aujourd'hui")} • ${todayBase.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })}`;
    }
    if (filters.startDate === toDateInputValue(yesterdayBase) && filters.endDate === toDateInputValue(yesterdayBase)) {
      return `${tr('Yesterday', 'Hier')} • ${yesterdayBase.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })}`;
    }
    if (filters.startDate === filters.endDate) {
      return `${tr('Selected Date', 'Date sélectionnée')} • ${endDateObject.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })}`;
    }
    if (filters.startDate === toDateInputValue(weekStart) && filters.endDate === toDateInputValue(weekEnd)) {
      return `${tr('Week focus', 'Focus semaine')} • ${weekStart.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })}`;
    }
    if (filters.startDate === toDateInputValue(startOfMonth(endDateObject))) {
      return `${tr('Month focus', 'Focus mois')} • ${endDateObject.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'long', year: 'numeric' })}`;
    }
    const last7Start = new Date(endDateObject);
    last7Start.setDate(last7Start.getDate() - 6);
    if (filters.startDate === toDateInputValue(last7Start)) {
      return `${tr('Last 7 Days', '7 derniers jours')} • ${last7Start.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })} - ${endDateObject.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })}`;
    }
    return tr('Custom range', 'Période personnalisée');
  })();

  const activeQuickRangeKey = useMemo(() => {
    const todayBase = new Date();
    todayBase.setHours(12, 0, 0, 0);
    const yesterdayBase = new Date(todayBase);
    yesterdayBase.setDate(yesterdayBase.getDate() - 1);
    const last7Start = new Date(endDateObject);
    last7Start.setDate(last7Start.getDate() - 6);

    if (filters.startDate === toDateInputValue(todayBase) && filters.endDate === toDateInputValue(todayBase)) {
      return 'today';
    }
    if (filters.startDate === toDateInputValue(yesterdayBase) && filters.endDate === toDateInputValue(yesterdayBase)) {
      return 'yesterday';
    }
    if (filters.startDate === toDateInputValue(weekStart) && filters.endDate === toDateInputValue(weekEnd)) {
      return 'week';
    }
    if (filters.startDate === toDateInputValue(last7Start) && filters.endDate === toDateInputValue(endDateObject)) {
      return 'last7';
    }
    if (filters.startDate === toDateInputValue(startOfMonth(endDateObject)) && filters.endDate === toDateInputValue(endDateObject)) {
      return 'month';
    }
    if (customDateRange?.start) {
      return 'custom';
    }
    return null;
  }, [customDateRange, endDateObject, filters.endDate, filters.startDate, weekEnd, weekStart]);

  const selectedKpiPeriodLabel = useMemo(() => {
    const start = fromDateInputValue(filters.startDate);
    const end = fromDateInputValue(filters.endDate);
    const locale = isFrench ? 'fr-FR' : 'en-US';

    if (filters.startDate === filters.endDate) {
      return end.toLocaleDateString(locale, {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });
    }

    if (
      filters.startDate === toDateInputValue(startOfMonth(endDateObject)) &&
      filters.endDate === toDateInputValue(endDateObject)
    ) {
      return endDateObject.toLocaleDateString(locale, {
        month: 'long',
        year: 'numeric'
      });
    }

    return `${start.toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric'
    })} - ${end.toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric'
    })}`;
  }, [endDateObject, filters.endDate, filters.startDate, isFrench]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      appWarmupService.invalidateModule('finance', { rewarm: false });
      // Trigger refresh across all components
      setLastRefresh(new Date());
      await loadDashboardData();
      
      // Add a small delay for visual feedback
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error('❌ Refresh failed:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleExport = async () => {
    try {
      // Export based on active tab
      let exportData;
      switch (activeTab) {
        case 'rental-pl':
          exportData = await financeApiV2.exportPeriodPL(filters);
          break;
        case 'tour-pl':
          exportData = await financeApiV2.exportTourPL(filters);
          break;
        case 'vehicle-finance':
          exportData = await financeApiV2.exportVehicleProfitability(filters);
          break;
        case 'customer-analysis':
          exportData = await financeApiV2.exportCustomerAnalysis(filters);
          break;
        default:
          // Export overview data
          const kpiData = await financeApiV2.getKPIData(filters);
          const csvContent = [
            'Metric,Amount (MAD),Change (%)',
            `Total Revenue,${kpiData.totalRevenue},${kpiData.revenueChange}`,
            `Total Expenses,${kpiData.totalExpenses},${kpiData.expensesChange}`,
            `Taxes,${kpiData.taxes},${kpiData.taxesChange}`,
            `Gross Profit,${kpiData.grossProfit},${kpiData.profitChange}`
          ].join('\n');
          
          const blob = new Blob([csvContent], { type: 'text/csv' });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `finance_overview_${new Date().toISOString().split('T')[0]}.csv`;
          a.click();
          window.URL.revokeObjectURL(url);
          return;
      }

      if (exportData) {
        const csvHeaders = exportData.headers.join(',');
        const csvRows = (exportData.data || []).map((row) =>
          exportData.headers.map((header) => {
            const value = row[header];
            const normalized = value === null || value === undefined ? '' : String(value);
            return /[",\n]/.test(normalized) ? `"${normalized.replace(/"/g, '""')}"` : normalized;
          }).join(',')
        );
        const csvContent = [csvHeaders, ...csvRows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = exportData.filename || `finance_export_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('❌ Export failed:', error);
    }
  };

  const handleResetFilters = () => {
    setFilters({
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      vehicleIds: [],
      customerIds: [],
      orgId: 'current'
    });
  };

  const handleOpenBreakdown = (type) => {
    setBreakdownType(type);
  };

  const handleCloseBreakdown = () => {
    setBreakdownType(null);
  };

  const handleOpenBreakdownSource = (row) => {
    if (!row?.href) return;
    window.location.href = row.href;
  };

  const activeTabConfig = tabs.find(tab => tab.id === activeTab);
  const showActiveTabMeta = false;
  const formatPreviewDate = (value) => {
    if (!value) return '';
    return fromDateInputValue(value).toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', {
      month: 'short',
      day: 'numeric'
    });
  };
  const collapsedDateFocusLabel = customDateRange?.start
    ? customDateRange.end
      ? `${customDateRange.start.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })} → ${customDateRange.end.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })}`
      : `${tr('Start', 'Début')} • ${customDateRange.start.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })}`
    : activeQuickRangeLabel;
  const collapsedDateFocusMeta = customDateRange?.start
    ? customDateRange.end
      ? tr('Custom range active', 'Plage personnalisée active')
      : tr('Choose the end date', 'Choisissez la date de fin')
    : filters.startDate === filters.endDate
      ? formatPreviewDate(filters.startDate)
      : `${formatPreviewDate(filters.startDate)} → ${formatPreviewDate(filters.endDate)}`;

  const renderTabContent = () => {
    const tabProps = { 
      filters, 
      refreshTrigger: lastRefresh.getTime(),
      className: "animate-fadeIn"
    };

    switch (activeTab) {
      case 'overview':
        return (
          <div className="space-y-6 animate-slideInUp">
            {!overviewPulseDetailOpen && (
              <KPICardsV2
                {...tabProps}
                prefetchedKpiData={kpiData}
                parentLoading={loading && !hasLoadedOnce}
                onOpenBreakdown={handleOpenBreakdown}
                periodLabel={selectedKpiPeriodLabel}
              />
            )}
            <OverviewChartsV2
              {...tabProps}
              prefetchedTrendData={trendData}
              prefetchedKpiData={kpiData}
              prefetchedPulseRows={pulseRows}
              parentLoading={(loading && !hasLoadedOnce) || trendLoading}
              onPulseDetailChange={setOverviewPulseDetailOpen}
              onOpenBreakdown={handleOpenBreakdown}
            />
          </div>
        );
      case 'rental-pl':
        return (
          <div className="animate-slideInUp">
            <RentalPLTableV2 {...tabProps} />
          </div>
        );
      case 'tour-pl':
        return (
          <div className="animate-slideInUp">
            <TourPLTableV2 {...tabProps} />
          </div>
        );
      case 'fuel-pl':
        return (
          <div className="animate-slideInUp">
            <FuelPLTabV2 {...tabProps} />
          </div>
        );
      case 'maintenance-pl':
        return (
          <div className="animate-slideInUp">
            <MaintenancePLTabV2 {...tabProps} />
          </div>
        );
      case 'vehicle-finance':
        return (
          <div className="animate-slideInUp">
            <VehicleFinanceTabV2 
              {...tabProps}
              vehicles={vehicles}
              loading={directoryLoading}
              initialVehicleId={focusVehicleId}
              initialDetailOpen={focusVehicleDetail}
            />
          </div>
        );
      case 'customer-analysis':
        return (
          <div className="animate-slideInUp">
            <CustomerAnalysisTabV2 {...tabProps} customers={customers} loading={directoryLoading} />
          </div>
        );
      case 'calendar':
        return (
          <div className="animate-slideInUp">
            <FinanceCalendarTab filters={filters} refreshTrigger={lastRefresh.getTime()} />
          </div>
        );
      case 'receive-funds':
        return (
          <div className="animate-slideInUp">
            <ReceiveFundsTabV2
              filters={filters}
              refreshTrigger={lastRefresh.getTime()}
              openComposerRequest={receiveFundsComposerRequest}
              openExpenseComposerRequest={expenseComposerRequest}
              openEditComposerRequest={editComposerRequest}
            />
          </div>
        );
      case 'expenses':
        return (
          <div className="animate-slideInUp">
            <FinanceExpensesTabV2
              filters={filters}
              refreshTrigger={lastRefresh.getTime()}
              onAddExpense={() => {
                setActiveTab('receive-funds');
                setExpenseComposerRequest(Date.now());
              }}
              onEditExpense={(entry) => {
                setActiveTab('receive-funds');
                setEditComposerRequest({ requestId: Date.now(), entry });
              }}
            />
          </div>
        );
      case 'ledger':
        return (
          <div className="animate-slideInUp">
            <FinanceLedgerTabV2 filters={filters} refreshTrigger={lastRefresh.getTime()} />
          </div>
        );
      case 'reports':
        return (
          <div className="animate-slideInUp">
            <ReportsTabV2 {...tabProps} />
          </div>
        );
      case 'alerts':
        return (
          <div className="animate-slideInUp">
            <FinanceAlertsTabV2 filters={filters} refreshTrigger={lastRefresh.getTime()} />
          </div>
        );
      default:
        return null;
    }
  };

  const renderDateFocusControls = () => (
    <div className={`mt-3 rounded-[20px] border p-3 shadow-sm transition-all ${
      showDateFocusPanel
        ? 'border-violet-200 bg-gradient-to-br from-violet-100 via-[#f5f0ff] to-indigo-100 shadow-[0_18px_42px_rgba(79,70,229,0.14)]'
        : 'border-violet-100 bg-slate-50/70'
    }`}>
      <button
        type="button"
        onClick={() => {
          triggerDateFocusLauncherBounce();
          setShowDateFocusPanel((value) => !value);
        }}
        className={`group w-full rounded-[1.25rem] border px-4 py-3 text-left transition-all ${bouncingDateFocusLauncher ? 'quick-date-tap-bounce' : ''} ${
          showDateFocusPanel
            ? 'border-violet-300 bg-white shadow-[0_16px_36px_rgba(79,70,229,0.14)]'
            : 'border-violet-200 bg-white shadow-[0_12px_28px_rgba(15,23,42,0.06)] hover:border-violet-300 hover:shadow-[0_16px_34px_rgba(79,70,229,0.10)]'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
            <Calendar className="h-5 w-5" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold tracking-[0.02em] text-slate-950">{tr('Fast Date Focus', 'Focus date rapide')}</p>
              <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
                {collapsedDateFocusLabel}
              </span>
            </div>
            <p className="mt-1 truncate text-xs font-medium text-slate-500">{collapsedDateFocusMeta}</p>
          </div>

          <div className={`flex h-10 w-10 items-center justify-center rounded-2xl border border-violet-200 bg-violet-50 text-violet-700 shadow-[0_10px_24px_rgba(124,58,237,0.14)] transition-all duration-150 ease-out ${showDateFocusPanel ? 'rotate-180' : 'group-hover:scale-[1.03] group-hover:bg-violet-600 group-hover:text-white group-hover:shadow-[0_14px_32px_rgba(124,58,237,0.22)]'}`}>
            <ChevronDown className="h-4 w-4" />
          </div>
        </div>
      </button>

      <div className={`${showDateFocusPanel ? 'mt-3 block' : 'hidden'}`}>
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'today', label: tr('Today', "Aujourd'hui") },
            { key: 'yesterday', label: tr('Yesterday', 'Hier') },
            { key: 'last7', label: tr('Last 7 Days', '7 derniers jours') },
            { key: 'month', label: tr('This Month', 'Ce mois') }
          ].map((chip) => {
            const isActive = activeQuickRangeKey === chip.key;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => applyQuickRange(chip.key, new Date())}
                className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                  isActive
                    ? 'border-violet-300 bg-gradient-to-r from-violet-600 to-indigo-700 text-white shadow-[0_10px_22px_rgba(79,70,229,0.20)]'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:bg-white hover:text-violet-700'
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        {customDateRange?.start ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700">
              <span>
                {customDateRange.end
                  ? `${tr('Custom range', 'Plage personnalisée')} • ${customDateRange.start.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })} - ${customDateRange.end.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })}`
                  : `${tr('Custom range start', 'Début plage personnalisée')} • ${customDateRange.start.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })}`}
              </span>
              <span className="text-violet-300">•</span>
              <button
                type="button"
                onClick={clearCustomDateRange}
                className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-violet-700 transition hover:bg-violet-100"
              >
                {tr('Clear', 'Effacer')}
              </button>
            </div>
            {!customDateRange.end ? (
              <p className="text-[11px] font-medium text-slate-500">
                {tr('Tap another date to complete the range.', 'Touchez une autre date pour terminer la plage.')}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-3 rounded-[18px] border border-slate-200 bg-white p-2.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => shiftWeek(-1)}
              className="inline-flex items-center gap-1 rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 shadow-[0_10px_24px_rgba(124,58,237,0.12)] transition duration-150 ease-out hover:-translate-x-0.5 hover:bg-violet-600 hover:text-white hover:shadow-[0_14px_32px_rgba(124,58,237,0.22)]"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              {tr('Prev Week', 'Semaine préc.')}
            </button>
            <p className="text-xs font-semibold text-slate-900 sm:text-sm">
              {weekStart.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })} - {weekEnd.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })}
            </p>
            <button
              type="button"
              onClick={() => shiftWeek(1)}
              className="inline-flex items-center gap-1 rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 shadow-[0_10px_24px_rgba(124,58,237,0.12)] transition duration-150 ease-out hover:translate-x-0.5 hover:bg-violet-600 hover:text-white hover:shadow-[0_14px_32px_rgba(124,58,237,0.22)]"
            >
              {tr('Next Week', 'Semaine suiv.')}
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="-mx-1 overflow-x-auto pb-1">
            <div className="flex min-w-max gap-2 px-1 xl:grid xl:min-w-0 xl:grid-cols-7">
              {weekDays.map((day) => {
                const dayValue = toDateInputValue(day);
                const isActiveDay = filters.startDate === dayValue && filters.endDate === dayValue;
                const isCustomStart = Boolean(customDateRange?.start) && isSameCalendarDay(customDateRange.start, day);
                const isCustomEnd = Boolean(customDateRange?.end) && isSameCalendarDay(customDateRange.end, day);
                const isCustomBoundary = isCustomStart || isCustomEnd;
                const isInsideCustomRange = Boolean(customDateRange?.start && customDateRange?.end) && isDateWithinInclusiveRange(day, customDateRange.start, customDateRange.end);
                const isRangePreview = Boolean(customDateRange?.start && !customDateRange?.end) && isCustomStart;
                return (
                  <button
                    key={dayValue}
                    type="button"
                    onClick={() => handleQuickDayPress(day)}
                    className={`min-w-[76px] rounded-[1rem] border px-2.5 py-2 text-left transition active:scale-[0.985] xl:min-w-0 ${bouncingWeekDayKey === dayValue ? 'quick-date-tap-bounce' : ''} ${
                      isCustomBoundary
                        ? 'border-violet-400 bg-gradient-to-br from-violet-600 to-indigo-700 text-white shadow-[0_14px_30px_rgba(79,70,229,0.28)]'
                        : isInsideCustomRange
                          ? 'border-violet-200 bg-violet-50/90 shadow-[0_10px_24px_rgba(76,29,149,0.08)]'
                          : isActiveDay || isRangePreview
                            ? 'border-violet-300 bg-gradient-to-br from-violet-50 via-white to-indigo-50 shadow-[0_12px_28px_rgba(76,29,149,0.10)]'
                        : 'border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/40'
                    }`}
                  >
                    <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                      isCustomBoundary
                        ? 'text-white/85'
                        : isInsideCustomRange || isActiveDay || isRangePreview
                          ? 'text-violet-600'
                          : 'text-slate-500'
                    }`}>
                      {day.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { weekday: 'short' })}
                    </p>
                    <p className={`mt-0.5 text-base font-bold ${isCustomBoundary ? 'text-white' : 'text-slate-900'}`}>{day.getDate()}</p>
                    <p className={`text-xs ${isCustomBoundary ? 'text-white/80' : 'text-slate-500'}`}>
                      {day.toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'short' })}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-3">
          <FilterBarV2
            filters={filters}
            vehicles={vehicles}
            customers={customers}
            onFiltersChange={handleFiltersChange}
            loading={loading}
            className="rounded-2xl border border-white bg-white/90 shadow-sm"
          />
        </div>
      </div>
    </div>
  );

  return (
    <>
    <div className="space-y-6 px-4 py-6 sm:space-y-8 sm:px-6 lg:px-8">
      <section className="space-y-4">
        <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-[1.35rem] border border-violet-100 bg-violet-50/70 p-3 shadow-[0_12px_30px_rgba(79,70,229,0.08)]">
                <BarChart3 className="h-6 w-6 text-violet-700" />
              </div>
              <h1 className="text-[2rem] font-bold tracking-[-0.03em] text-slate-950 sm:text-[2.5rem]">
                {tr('Finance', 'Finance')}
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => {
                  setActiveTab('receive-funds');
                }}
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_18px_36px_rgba(16,185,129,0.22)] transition-all hover:scale-[1.01]"
              >
                <DollarSign className="h-4 w-4" />
                {tr('Record Funds', 'Enregistrer des fonds')}
              </button>

              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-violet-200 hover:text-violet-700 disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                {tr('Refresh', 'Actualiser')}
              </button>

              <button
                onClick={handleExport}
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_18px_36px_rgba(79,70,229,0.25)] transition-all hover:scale-[1.01]"
              >
                <Download className="h-4 w-4" />
                {tr('Export', 'Exporter')}
              </button>

              <button
                onClick={handleResetFilters}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-600 transition-all hover:border-slate-300 hover:bg-white"
              >
                <RotateCcw className="h-4 w-4" />
                {tr('Reset', 'Réinitialiser')}
              </button>

              <button
                onClick={() => setActiveTab('reports')}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-violet-200 hover:text-violet-700"
              >
                <FileText className="h-4 w-4" />
                {tr('Reports', 'Rapports')}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section id="finance-tabs" className="space-y-4">
        <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-5">
          <nav className="flex space-x-2 overflow-x-auto pb-1" aria-label="Tabs">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    group relative flex items-center rounded-2xl px-4 py-3 text-sm font-semibold transition-all duration-200 whitespace-nowrap
                    ${isActive
                      ? 'bg-gradient-to-r from-violet-600 to-indigo-700 text-white shadow-[0_16px_36px_rgba(79,70,229,0.24)]'
                      : 'border border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                    }
                  `}
                  title={tab.description}
                >
                  <Icon className={`mr-2 h-5 w-5 transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-105'}`} />
                  <span>{tab.label}</span>
                  
                  {/* Active tab indicator */}
                  {isActive && (
                    <div className="absolute inset-0 rounded-2xl bg-white/10 animate-pulse" />
                  )}
                </button>
              );
            })}
          </nav>

          {renderDateFocusControls()}
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-2xl bg-violet-50 p-2.5">
              {React.createElement(activeTabConfig?.icon || BarChart3, {
                className: "h-5 w-5 text-violet-700"
              })}
            </div>
            <h2 className="text-lg font-semibold text-slate-900">
              {activeTabConfig?.label}
            </h2>
          </div>

          <div className="min-h-[520px]">
            {renderTabContent()}
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-6">
        <div className="flex flex-col gap-2 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span>{tr('Last updated:', 'Dernière mise à jour :')} {lastRefresh.toLocaleTimeString(isFrench ? 'fr-FR' : 'en-US')}</span>
            <span className="hidden sm:inline">•</span>
            <span className="hidden sm:inline">{tr('Currency: MAD', 'Devise : MAD')}</span>
          </div>
          <div className="flex items-center gap-4">
            <span>{tr('Vehicles:', 'Véhicules :')} {vehicles.length}</span>
            <span>•</span>
            <span>{tr('Customers:', 'Clients :')} {customers.length}</span>
          </div>
        </div>
      </section>

      {/* Custom Styles for Animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes slideInUp {
          from { 
            opacity: 0; 
            transform: translateY(20px); 
          }
          to { 
            opacity: 1; 
            transform: translateY(0); 
          }
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
        
        .animate-slideInUp {
          animation: slideInUp 0.4s ease-out;
        }
      `}</style>
    </div>
    <FinanceBreakdownDrawer
      isOpen={Boolean(breakdownType)}
      onClose={handleCloseBreakdown}
      breakdownType={breakdownType}
      filters={filters}
      onOpenSource={handleOpenBreakdownSource}
    />
    </>
  );
};

export default FinanceDashboardV2;
