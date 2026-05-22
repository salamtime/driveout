import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Area, AreaChart } from 'recharts';
import { TrendingUp, BarChart3, PieChart as PieChartIcon, Activity, ArrowDownRight, ArrowUpRight, CalendarDays, WalletCards, ChevronLeft, Receipt, Wrench, Fuel, Package, Car, AlertCircle } from 'lucide-react';
import { financeApiV2 } from '../../services/financeApiV2';
import i18n from '../../i18n';

const isFrenchLocale = () => i18n.resolvedLanguage === 'fr';
const tr = (en, fr) => (isFrenchLocale() ? fr : en);

let financePulseCache = {
  key: null,
  rows: [],
  periodKpis: {}
};

const getLocalDate = (value) => {
  const [year, month, day] = String(value || '').split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const formatDateKey = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDays = (date, amount) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

const buildPulseCacheKey = (filters, endDateKey) =>
  JSON.stringify({
    vehicleIds: [...(filters?.vehicleIds || [])].map(String).sort(),
    customerIds: [...(filters?.customerIds || [])].map(String).sort(),
    orgId: filters?.orgId || 'current',
    startDate: filters?.startDate || '',
    endDate: endDateKey
  });

const getPulseAnchorDate = (filters) => {
  const filterEnd = getLocalDate(filters?.endDate);
  const anchor = filterEnd || new Date();
  anchor.setHours(12, 0, 0, 0);
  return anchor;
};

const getActiveQuickRangeKey = (filters, anchorDate) => {
  const todayBase = new Date();
  todayBase.setHours(12, 0, 0, 0);
  const yesterdayBase = addDays(todayBase, -1);
  const weekStart = addDays(anchorDate, -6);

  if (filters?.startDate === formatDateKey(todayBase) && filters?.endDate === formatDateKey(todayBase)) {
    return 'today';
  }

  if (filters?.startDate === formatDateKey(yesterdayBase) && filters?.endDate === formatDateKey(yesterdayBase)) {
    return 'yesterday';
  }

  if (filters?.startDate === formatDateKey(weekStart) && filters?.endDate === formatDateKey(anchorDate)) {
    return 'last7';
  }

  if (filters?.startDate === formatDateKey(new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1)) && filters?.endDate === formatDateKey(anchorDate)) {
    return 'month';
  }

  if (filters?.startDate === formatDateKey(anchorDate) && filters?.endDate === formatDateKey(anchorDate)) {
    return 'day';
  }

  return 'custom';
};

const getDatesBetween = (start, end) => {
  const dates = [];
  const cursor = new Date(start);
  cursor.setHours(12, 0, 0, 0);
  const rangeEnd = new Date(end);
  rangeEnd.setHours(12, 0, 0, 0);

  while (cursor <= rangeEnd) {
    dates.push(formatDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
};

const sourceIcons = {
  rental: Receipt,
  tour: Receipt,
  maintenance: Wrench,
  damage_recovery: Receipt,
  inventory: Package,
  tank_in: Fuel,
  direct_fill: Fuel,
  transfer: Fuel,
  sold: Car,
  disposed: AlertCircle,
  purchase: Car,
  tax: Receipt,
  fuel: Fuel
};

const pulseBreakdownShortcuts = [
  { key: 'maintenance', label: tr('Maintenance', 'Maintenance') },
  { key: 'fuel', label: tr('Fuel', 'Carburant') },
  { key: 'damage_recovery', label: tr('Damage recovery', 'Récupération dommage') },
  { key: 'other_costs', label: tr('Other costs', 'Autres coûts') }
];

const metricCardButtonClass = 'rounded-[20px] border p-3 text-left transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-slate-200';
const overviewExpenseSourceTypes = new Set([
  'fuel',
  'tank_in',
  'direct_fill',
  'transfer',
  'finance_expense',
  'expense',
  'manual_expense',
  'expense_manual',
]);

const toFiniteAmount = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isOverviewExpenseLedgerRow = (row) => (
  row?.direction === 'outgoing' && overviewExpenseSourceTypes.has(String(row?.sourceType || ''))
);

/**
 * Enhanced Overview Charts v2 with Modern Animated Charts
 * 
 * Features:
 * - Animated Revenue vs Expenses line chart
 * - Cost Breakdown pie chart with tooltips
 * - Top 5 Vehicles by Profitability horizontal bar chart
 * - Smooth animations and modern styling
 * - Interactive tooltips and legends
 * - Responsive design with gradient colors
 */
const OverviewChartsV2 = ({ filters, refreshTrigger, prefetchedTrendData = null, prefetchedKpiData = null, prefetchedPulseRows = null, parentLoading = false, onPulseDetailChange = null, onOpenBreakdown = null }) => {
  const navigate = useNavigate();
  const pulseAnchorToday = useMemo(() => {
    return getPulseAnchorDate(filters);
  }, [filters?.endDate]);
  const pulseCacheKey = useMemo(
    () => buildPulseCacheKey(filters, formatDateKey(pulseAnchorToday)),
    [filters?.vehicleIds, filters?.customerIds, filters?.orgId, filters?.startDate, pulseAnchorToday]
  );
  const [trendData, setTrendData] = useState(prefetchedTrendData || []);
  const [pulseLedgerRows, setPulseLedgerRows] = useState(() => (
    Array.isArray(prefetchedPulseRows) && prefetchedPulseRows.length > 0
      ? prefetchedPulseRows
      : financePulseCache.key === pulseCacheKey
        ? financePulseCache.rows
        : []
  ));
  const [pulsePeriodKpis, setPulsePeriodKpis] = useState(() => (
    financePulseCache.key === pulseCacheKey
      ? financePulseCache.periodKpis || {}
      : {}
  ));
  const [pulseLoading, setPulseLoading] = useState(
    Array.isArray(prefetchedPulseRows) && prefetchedPulseRows.length > 0
      ? false
      : financePulseCache.key !== pulseCacheKey
  );
  const [vehicleProfitData, setVehicleProfitData] = useState([]);
  const [kpiData, setKpiData] = useState(prefetchedKpiData);
  const [loading, setLoading] = useState(!prefetchedTrendData && !prefetchedKpiData);
  const [error, setError] = useState(null);
  const [detailPage, setDetailPage] = useState(null);
  const [detailPageLoading, setDetailPageLoading] = useState(false);
  const [detailPageError, setDetailPageError] = useState('');
  const [detailPageCurrentPage, setDetailPageCurrentPage] = useState(1);
  const [detailRowsPerPage, setDetailRowsPerPage] = useState(8);

  useEffect(() => {
    if (typeof onPulseDetailChange === 'function') {
      onPulseDetailChange(Boolean(detailPage));
    }
  }, [detailPage, onPulseDetailChange]);

  useEffect(() => {
    if (prefetchedTrendData || prefetchedKpiData) {
      if (prefetchedTrendData) {
        setTrendData(prefetchedTrendData);
      }
      if (prefetchedKpiData) {
        setKpiData(prefetchedKpiData);
      }
      loadChartData(true);
      return;
    }
    loadChartData();
  }, [filters, refreshTrigger, prefetchedTrendData, prefetchedKpiData]);

  useEffect(() => {
    if (Array.isArray(prefetchedPulseRows) && prefetchedPulseRows.length > 0) {
      setPulseLedgerRows(prefetchedPulseRows);
      setPulseLoading(false);
      const cachedPeriodKpis = financePulseCache.key === pulseCacheKey ? financePulseCache.periodKpis || {} : {};
      financePulseCache = {
        key: pulseCacheKey,
        rows: prefetchedPulseRows,
        periodKpis: cachedPeriodKpis
      };
      setPulsePeriodKpis(cachedPeriodKpis);
      if (!cachedPeriodKpis.today || !cachedPeriodKpis.week || !cachedPeriodKpis.month) {
        loadPulseTrendData();
      }
      return;
    }
    loadPulseTrendData();
  }, [filters?.vehicleIds, filters?.customerIds, filters?.orgId, filters?.startDate, refreshTrigger, prefetchedPulseRows, pulseCacheKey]);

  const loadChartData = async (reusePrefetched = false) => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('📈 ENHANCED CHARTS: Loading data with animations...');
      
      const requests = [
        reusePrefetched && prefetchedTrendData ? Promise.resolve(prefetchedTrendData) : financeApiV2.getTrendData(filters),
        financeApiV2.getTopVehiclesByProfit(filters, 5),
        reusePrefetched && prefetchedKpiData ? Promise.resolve(prefetchedKpiData) : financeApiV2.getKPIData(filters)
      ];
      const [trends, vehicles, kpis] = await Promise.all(requests);
      
      setTrendData(trends);
      setVehicleProfitData(vehicles);
      setKpiData(kpis);
      
      console.log('✅ Enhanced chart data loaded:', {
        trendPoints: trends.length,
        topVehicles: vehicles.length,
        kpiMetrics: Object.keys(kpis).length
      });
      
    } catch (err) {
      console.error('❌ Enhanced chart loading failed:', err);
      setError(err.message || 'Failed to load chart data');
    } finally {
      setLoading(false);
    }
  };

  const loadPulseTrendData = async () => {
    try {
      setPulseLoading(true);
      const currentDate = getPulseAnchorDate(filters);
      const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1, 12, 0, 0, 0);
      const selectedStart = getLocalDate(filters?.startDate);
      const selectedEnd = getLocalDate(filters?.endDate);
      const pulseActiveRangeKey = getActiveQuickRangeKey(filters, currentDate);
      const effectiveStart =
        selectedStart && selectedStart < monthStart
          ? selectedStart
          : monthStart;
      const todayStart = pulseActiveRangeKey === 'custom' && selectedStart && selectedEnd
        ? formatDateKey(selectedStart)
        : formatDateKey(currentDate);
      const todayEnd = pulseActiveRangeKey === 'custom' && selectedStart && selectedEnd
        ? formatDateKey(selectedEnd)
        : formatDateKey(currentDate);
      const weekStart = addDays(currentDate, -6);

      const pulseFilters = {
        ...filters,
        startDate: formatDateKey(effectiveStart),
        endDate: formatDateKey(currentDate),
      };
      const getPulseKpi = (range) => financeApiV2.getKPIData({
        ...filters,
        ...range,
      }).catch(() => null);

      const [ledger, todayKpi, weekKpi, monthKpi] = await Promise.all([
        financeApiV2.getUnifiedLedger(pulseFilters),
        getPulseKpi({ startDate: todayStart, endDate: todayEnd }),
        getPulseKpi({ startDate: formatDateKey(weekStart), endDate: formatDateKey(currentDate) }),
        getPulseKpi({ startDate: formatDateKey(monthStart), endDate: formatDateKey(currentDate) }),
      ]);
      const rows = Array.isArray(ledger?.rows) ? ledger.rows : [];
      const periodKpis = {
        today: todayKpi,
        week: weekKpi,
        month: monthKpi,
      };
      setPulseLedgerRows(rows);
      setPulsePeriodKpis(periodKpis);
      financePulseCache = {
        key: buildPulseCacheKey(filters, formatDateKey(currentDate)),
        rows,
        periodKpis
      };
    } catch (err) {
      console.error('❌ Finance pulse trend loading failed:', err);
    } finally {
      setPulseLoading(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'decimal',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatCompact = (value) => {
    if (value >= 1000000) {
      return (value / 1000000).toFixed(1) + 'M';
    }
    if (value >= 1000) {
      return (value / 1000).toFixed(0) + 'K';
    }
    return value.toString();
  };

  const formatPeriodLabel = (date, mode) => {
    if (!date) return tr('No data', 'Aucune donnée');
    if (mode === 'today') {
      return date.toLocaleDateString(isFrenchLocale() ? 'fr-FR' : 'en-US', {
        weekday: 'short',
        day: 'numeric',
        month: 'short'
      });
    }

    if (mode === 'week') {
      const start = addDays(date, -6);
      return `${start.toLocaleDateString(isFrenchLocale() ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })} - ${date.toLocaleDateString(isFrenchLocale() ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })}`;
    }

    return date.toLocaleDateString(isFrenchLocale() ? 'fr-FR' : 'en-US', {
      month: 'long',
      year: 'numeric'
    });
  };

  const formatRangeLabel = (start, end) => {
    if (!start || !end) return tr('Custom range', 'Période personnalisée');
    return `${start.toLocaleDateString(isFrenchLocale() ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })} - ${end.toLocaleDateString(isFrenchLocale() ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })}`;
  };

  const formatPulseCardTitle = (date, mode, activeRangeKey) => {
    if (mode === 'today') {
      if (activeRangeKey === 'today') return tr('Today', "Aujourd'hui");
      if (activeRangeKey === 'yesterday') return tr('Yesterday', 'Hier');
      return date.toLocaleDateString(isFrenchLocale() ? 'fr-FR' : 'en-US', {
        month: 'short',
        day: 'numeric'
      });
    }

    if (mode === 'week') {
      if (activeRangeKey === 'last7') return tr('Last 7 Days', '7 derniers jours');
      return `${tr('Week of', 'Semaine du')} ${date.toLocaleDateString(isFrenchLocale() ? 'fr-FR' : 'en-US', {
        month: 'short',
        day: 'numeric'
      })}`;
    }

    if (activeRangeKey === 'month') return tr('This Month', 'Ce mois-ci');
    return date.toLocaleDateString(isFrenchLocale() ? 'fr-FR' : 'en-US', {
      month: 'long',
      year: 'numeric'
    });
  };

  const buildPeriodSummary = (rows, title, label) => {
    const incoming = rows.reduce((sum, row) => sum + (row.revenue || 0), 0);
    const outgoing = rows.reduce((sum, row) => sum + (row.expenses || 0), 0);
    const taxes = rows.reduce((sum, row) => sum + (row.taxes || 0), 0);
    const maintenance = rows.reduce((sum, row) => sum + (row.maintenanceCosts || 0), 0);
    const fuel = rows.reduce((sum, row) => sum + (row.fuelCosts || 0), 0);
    const inventory = rows.reduce((sum, row) => sum + (row.inventoryCosts || 0), 0);
    const net = incoming - outgoing - taxes;

    return {
      title,
      label,
      incoming,
      outgoing,
      taxes,
      net,
      maintenance,
      fuel,
      inventory,
      daysCovered: rows.length
    };
  };

  const pulseAnchorDate = useMemo(() => {
    return getPulseAnchorDate(filters);
  }, [filters?.endDate, refreshTrigger]);
  const activeRangeKey = useMemo(() => {
    return getActiveQuickRangeKey(filters, pulseAnchorDate);
  }, [filters, pulseAnchorDate]);

  const buildLedgerSummary = useMemo(() => (rows, title, label) => {
    const incoming = rows
      .filter((row) => row.direction === 'incoming')
      .reduce((sum, row) => sum + (row.amount || 0), 0);
    const outgoing = rows
      .filter((row) => isOverviewExpenseLedgerRow(row))
      .reduce((sum, row) => sum + (row.amount || 0), 0);
    const taxes = rows
      .filter((row) => row.direction === 'tax')
      .reduce((sum, row) => sum + (row.amount || 0), 0);
    const maintenance = rows
      .filter((row) => row.sourceType === 'maintenance')
      .reduce((sum, row) => sum + (row.amount || 0), 0);
    const fuel = rows
      .filter((row) => ['fuel', 'tank_in', 'direct_fill', 'transfer'].includes(row.sourceType))
      .reduce((sum, row) => sum + (row.amount || 0), 0);
    const inventory = rows
      .filter((row) => row.sourceType === 'inventory')
      .reduce((sum, row) => sum + (row.amount || 0), 0);
    const uniqueDays = new Set(rows.map((row) => row.date).filter(Boolean));

    return {
      title,
      label,
      incoming,
      outgoing,
      taxes,
      net: incoming - outgoing - taxes,
      maintenance,
      fuel,
      inventory,
      daysCovered: uniqueDays.size
    };
  }, []);

  const periodSummaries = useMemo(() => {
    const todayKey = formatDateKey(pulseAnchorDate);
    const weekStart = addDays(pulseAnchorDate, -6);
    const month = pulseAnchorDate.getMonth();
    const year = pulseAnchorDate.getFullYear();
    const selectedStartDate = getLocalDate(filters?.startDate);
    const selectedEndDate = getLocalDate(filters?.endDate);
    const hasCustomSelectedRange = activeRangeKey === 'custom' && selectedStartDate && selectedEndDate;
    const selectedRangeDates = hasCustomSelectedRange ? new Set(getDatesBetween(selectedStartDate, selectedEndDate)) : null;

    const todayRows = hasCustomSelectedRange
      ? pulseLedgerRows.filter((row) => selectedRangeDates.has(row.date))
      : pulseLedgerRows.filter((row) => row.date === todayKey);
    const weekRows = pulseLedgerRows.filter((row) => {
      const date = getLocalDate(row.date);
      return date && date >= weekStart && date <= pulseAnchorDate;
    });
    const monthRows = pulseLedgerRows.filter((row) => {
      const date = getLocalDate(row.date);
      return date && date.getMonth() === month && date.getFullYear() === year;
    });

    const applyOverviewKpiTotals = (summary, overviewKpi, daysCovered = summary.daysCovered) => {
      if (!overviewKpi) return summary;

      const incoming = Math.round(toFiniteAmount(overviewKpi.totalCollected));
      const outgoing = Math.round(toFiniteAmount(overviewKpi.totalExpenses));
      const taxes = Math.round(toFiniteAmount(overviewKpi.taxes));
      const net = Number.isFinite(Number(overviewKpi.netCash))
        ? Math.round(Number(overviewKpi.netCash))
        : incoming - outgoing - taxes;

      return {
        ...summary,
        incoming,
        outgoing,
        taxes,
        net,
        maintenance: Math.round(toFiniteAmount(overviewKpi.maintenanceCosts)),
        fuel: Math.round(toFiniteAmount(overviewKpi.fuelCosts)),
        inventory: Math.round(toFiniteAmount(overviewKpi.inventoryCosts)),
        daysCovered,
      };
    };

    const todaySummary = buildLedgerSummary(
        todayRows,
        hasCustomSelectedRange ? tr('Selected Range', 'Plage sélectionnée') : formatPulseCardTitle(pulseAnchorDate, 'today', activeRangeKey),
        hasCustomSelectedRange ? formatRangeLabel(selectedStartDate, selectedEndDate) : formatPeriodLabel(pulseAnchorDate, 'today')
    );
    const weekSummary = buildLedgerSummary(weekRows, formatPulseCardTitle(pulseAnchorDate, 'week', activeRangeKey), formatPeriodLabel(pulseAnchorDate, 'week'));
    const monthSummary = buildLedgerSummary(monthRows, formatPulseCardTitle(pulseAnchorDate, 'month', activeRangeKey), formatPeriodLabel(pulseAnchorDate, 'month'));
    const monthStart = new Date(pulseAnchorDate.getFullYear(), pulseAnchorDate.getMonth(), 1);
    const todayKpi = pulsePeriodKpis.today || (['today', 'yesterday', 'day', 'custom'].includes(activeRangeKey) ? kpiData : null);
    const weekKpi = pulsePeriodKpis.week || (activeRangeKey === 'last7' ? kpiData : null);
    const monthKpi = pulsePeriodKpis.month || (activeRangeKey === 'month' ? kpiData : null);

    return [
      applyOverviewKpiTotals(
        todaySummary,
        todayKpi,
        hasCustomSelectedRange ? selectedRangeDates.size : 1
      ),
      applyOverviewKpiTotals(weekSummary, weekKpi, 7),
      applyOverviewKpiTotals(monthSummary, monthKpi, getDatesBetween(monthStart, pulseAnchorDate).length)
    ];
  }, [pulseLedgerRows, pulseAnchorDate, buildLedgerSummary, activeRangeKey, filters?.startDate, filters?.endDate, kpiData, pulsePeriodKpis]);

  const strongestPeriod = useMemo(() => {
    if (periodSummaries.length === 0) return null;
    return [...periodSummaries].sort((a, b) => b.net - a.net)[0];
  }, [periodSummaries]);

  const buildDetailMeta = (periodType) => {
    const anchorKey = formatDateKey(pulseAnchorDate);
    if (periodType === 'today') {
      const selectedStartDate = getLocalDate(filters?.startDate);
      const selectedEndDate = getLocalDate(filters?.endDate);
      const hasCustomSelectedRange = activeRangeKey === 'custom' && selectedStartDate && selectedEndDate;
      return {
        periodType,
        title: `${hasCustomSelectedRange ? tr('Selected Range', 'Plage sélectionnée') : formatPulseCardTitle(pulseAnchorDate, 'today', activeRangeKey)} ${tr('Finance Detail', 'Détail finance')}`,
        rangeLabel: hasCustomSelectedRange ? formatRangeLabel(selectedStartDate, selectedEndDate) : formatPeriodLabel(pulseAnchorDate, 'today'),
        dates: hasCustomSelectedRange ? getDatesBetween(selectedStartDate, selectedEndDate) : [anchorKey]
      };
    }

    if (periodType === 'week') {
      const dates = Array.from({ length: 7 }, (_, index) => formatDateKey(addDays(pulseAnchorDate, -6 + index)));
      return {
        periodType,
        title: `${formatPulseCardTitle(pulseAnchorDate, 'week', activeRangeKey)} ${tr('Finance Detail', 'Détail finance')}`,
        rangeLabel: formatPeriodLabel(pulseAnchorDate, 'week'),
        dates
      };
    }

    const monthStart = new Date(pulseAnchorDate.getFullYear(), pulseAnchorDate.getMonth(), 1);
    const monthDates = [];
    for (let cursor = new Date(monthStart); cursor <= pulseAnchorDate; cursor = addDays(cursor, 1)) {
      monthDates.push(formatDateKey(cursor));
    }
    return {
      periodType,
      title: `${formatPulseCardTitle(pulseAnchorDate, 'month', activeRangeKey)} ${tr('Finance Detail', 'Détail finance')}`,
      rangeLabel: formatPeriodLabel(pulseAnchorDate, 'month'),
      dates: monthDates
    };
  };

  const handleOpenDetailPage = async (periodType) => {
    const meta = buildDetailMeta(periodType);
    const detailFilters = {
      ...filters,
      startDate: meta.dates[0],
      endDate: meta.dates[meta.dates.length - 1],
    };
    setDetailPageCurrentPage(1);
    setDetailPageLoading(true);
    setDetailPageError('');
    setDetailPage({
      ...meta,
      collectedTotal: 0,
      incomingTotal: 0,
      outgoingTotal: 0,
      taxesTotal: 0,
      netTotal: 0,
      rows: [],
      sourceTotals: {}
    });

    try {
      const [breakdowns, detailKpi] = await Promise.all([
        Promise.all(meta.dates.map((date) => financeApiV2.getDayBreakdown(date, filters))),
        financeApiV2.getKPIData(detailFilters),
      ]);
      const rows = breakdowns
        .flatMap((breakdown) => (breakdown.rows || []).map((row) => ({ ...row, date: row.date || breakdown.date })))
        .sort((a, b) => {
          const dateDelta = new Date(`${b.date || '1970-01-01'}T00:00:00`).getTime() - new Date(`${a.date || '1970-01-01'}T00:00:00`).getTime();
          if (dateDelta !== 0) return dateDelta;
          return (b.amount || 0) - (a.amount || 0);
        });

      const sourceTotals = rows.reduce((acc, row) => {
        const key = row.sourceType || 'other';
        acc[key] = (acc[key] || 0) + (row.amount || 0);
        return acc;
      }, {});

      setDetailPage({
        ...meta,
        collectedTotal: detailKpi?.totalCollected || 0,
        incomingTotal: detailKpi?.totalRevenue ?? breakdowns.reduce((sum, breakdown) => sum + (breakdown.incomingTotal || 0), 0),
        outgoingTotal: detailKpi?.totalExpenses ?? breakdowns.reduce((sum, breakdown) => sum + (breakdown.outgoingTotal || 0), 0),
        taxesTotal: detailKpi?.taxes ?? breakdowns.reduce((sum, breakdown) => sum + (breakdown.taxesTotal || 0), 0),
        netTotal: detailKpi?.netCash ?? breakdowns.reduce((sum, breakdown) => sum + (breakdown.netTotal || 0), 0),
        rows,
        sourceTotals
      });
    } catch (err) {
      console.error('Failed to open overview finance detail:', err);
      setDetailPageError(err.message || tr('Failed to load finance detail', 'Impossible de charger le détail finance'));
    } finally {
      setDetailPageLoading(false);
    }
  };

  const handleOpenSourceRow = (row) => {
    if (!row?.href) return;

    navigate(row.href, {
      state: {
        financeOverviewReturn: true,
        financeOverviewLabel: detailPage?.rangeLabel || '',
      },
    });
  };

  useEffect(() => {
    if (!detailPage?.periodType) return;
    handleOpenDetailPage(detailPage.periodType);
  }, [filters.startDate, filters.endDate, refreshTrigger]);

  // Custom tooltip component
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-4 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-semibold text-gray-900 mb-2">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {formatCurrency(entry.value)} MAD
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // Pie chart colors
  const pieColors = ['#10B981', '#EF4444', '#F59E0B', '#3B82F6', '#8B5CF6'];

  // Cost breakdown data for pie chart
  const costBreakdownData = kpiData ? [
    { name: tr('Maintenance', 'Maintenance'), value: kpiData.maintenanceCosts || 0, color: '#F59E0B' },
    { name: tr('Fuel', 'Carburant'), value: kpiData.fuelCosts || 0, color: '#8B5CF6' },
    { name: tr('Inventory', 'Inventaire'), value: kpiData.inventoryCosts || 0, color: '#3B82F6' },
    { name: tr('Other', 'Autres'), value: kpiData.otherCosts || 0, color: '#6B7280' }
  ].filter((entry) => entry.value > 0) : [];

  if (loading || parentLoading) {
    return (
      <div className="space-y-6">
        <div className="rounded-[28px] border border-slate-200 bg-white px-6 py-14 text-center shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
            <div className="text-5xl leading-none animate-pulse">⏳</div>
            <h3 className="text-xl font-semibold text-slate-900">
              {tr('Loading finance overview...', "Chargement de l'aperçu finance...")}
            </h3>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-red-100 rounded-lg">
            <BarChart3 className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <h3 className="font-semibold text-red-900">Error Loading Charts</h3>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (detailPage) {
    const fmtFull = formatCurrency;
    const detailPageRows = detailPage.rows || [];
    const detailPageTotalPages = Math.max(1, Math.ceil(detailPageRows.length / detailRowsPerPage));
    const paginatedDetailRows = detailPageRows.slice(
      (detailPageCurrentPage - 1) * detailRowsPerPage,
      detailPageCurrentPage * detailRowsPerPage
    );
    const sourceCards = [
      { key: 'rental', label: tr('Rentals', 'Locations') },
      { key: 'tour', label: tr('Tours', 'Tours') },
      { key: 'maintenance', label: tr('Maintenance income', 'Revenu maintenance') },
      { key: 'damage_recovery', label: tr('Damage recovery', 'Récupération dommage') }
    ].filter((entry) => (detailPage.sourceTotals?.[entry.key] || 0) > 0);

    return (
      <div className="space-y-6 pb-28 sm:pb-8">
        <div className="rounded-[2rem] border border-violet-100/80 bg-gradient-to-br from-[#f5f3ff] via-[#fbfaff] to-[#eef2ff] p-4 shadow-[0_20px_55px_rgba(76,29,149,0.08)]">
          <div className="rounded-[1.7rem] border border-white/80 bg-white p-5 shadow-[0_16px_34px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">{detailPage.title}</p>
              <h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{detailPage.rangeLabel}</h3>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                {tr('Full finance detail view opened directly from the overview pulse cards.', 'Vue détaillée complète de la finance ouverte directement depuis les cartes de pouls financier.')}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setDetailPage(null);
                setDetailPageCurrentPage(1);
              }}
              className="hidden sm:inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(91,33,182,0.28)] transition hover:translate-y-[-1px] hover:shadow-[0_18px_32px_rgba(91,33,182,0.32)]"
            >
              <ChevronLeft className="h-4 w-4" />
              {tr('Back to Overview', "Retour à l'aperçu")}
            </button>
          </div>
          </div>
        </div>

        {detailPageLoading ? (
          <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 px-6 py-16 text-center shadow-sm">
            <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
              <div className="text-5xl leading-none animate-pulse">⏳</div>
              <h3 className="text-xl font-semibold text-slate-900">{tr('Loading full finance detail...', 'Chargement du détail finance complet...')}</h3>
            </div>
          </div>
        ) : detailPageError ? (
          <div className="rounded-[1.75rem] border border-rose-200 bg-rose-50 p-6 text-rose-700">
            {detailPageError}
          </div>
        ) : (
          <div className="mt-5 space-y-5 rounded-[1.75rem] border border-violet-100/80 bg-gradient-to-br from-[#f5f3ff] via-[#fbfaff] to-[#eef2ff] p-4 shadow-[0_18px_42px_rgba(76,29,149,0.08)] sm:p-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <button
                type="button"
                onClick={() => onOpenBreakdown?.('collected')}
                className="rounded-[1.5rem] border border-emerald-100 bg-emerald-50/80 p-4 text-left transition hover:border-emerald-200 hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">{tr('Collected', 'Collecté')}</p>
                <p className="mt-2 text-2xl font-bold text-emerald-700">{fmtFull(detailPage.collectedTotal || 0)} MAD</p>
              </button>
              <button
                type="button"
                onClick={() => onOpenBreakdown?.('outgoing')}
                className="rounded-[1.5rem] border border-rose-100 bg-rose-50/80 p-4 text-left transition hover:border-rose-200 hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-200"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-700">{tr('Outgoing', 'Sorties')}</p>
                <p className="mt-2 text-2xl font-bold text-rose-700">{fmtFull(detailPage.outgoingTotal)} MAD</p>
              </button>
              <button
                type="button"
                onClick={() => onOpenBreakdown?.('taxes')}
                className="rounded-[1.5rem] border border-amber-100 bg-amber-50/80 p-4 text-left transition hover:border-amber-200 hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-200"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">{tr('Taxes', 'Taxes')}</p>
                <p className="mt-2 text-2xl font-bold text-amber-700">{fmtFull(detailPage.taxesTotal)} MAD</p>
              </button>
              <button
                type="button"
                onClick={() => onOpenBreakdown?.('net')}
                className="rounded-[1.5rem] border border-violet-100 bg-gradient-to-r from-violet-50 via-white to-indigo-50 p-4 text-left transition hover:border-violet-200 focus:outline-none focus:ring-2 focus:ring-violet-200"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-600">{tr('Net', 'Net')}</p>
                <p className={`mt-2 text-2xl font-bold ${detailPage.netTotal >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {detailPage.netTotal >= 0 ? '+' : ''}{fmtFull(detailPage.netTotal)} MAD
                </p>
              </button>
            </div>

            <div className="rounded-[1.5rem] border border-white/90 bg-white p-5 shadow-[0_16px_34px_rgba(15,23,42,0.06)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">{tr('Source Breakdown', 'Répartition des sources')}</p>
                  <h4 className="mt-2 text-lg font-semibold text-slate-900">{tr('What made up this period', 'Ce qui compose cette période')}</h4>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {detailPage.rows.length} {tr(detailPage.rows.length === 1 ? 'row' : 'rows', detailPage.rows.length === 1 ? 'ligne' : 'lignes')}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                {sourceCards.map((entry) => (
                  <div key={entry.key} className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{entry.label}</p>
                    <p className="mt-2 font-bold text-slate-900">{fmtFull(detailPage.sourceTotals[entry.key])} MAD</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-white/90 bg-white p-5 shadow-[0_16px_34px_rgba(15,23,42,0.06)]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">{tr('Transaction Detail', 'Détail des transactions')}</p>
                  <h4 className="mt-2 text-lg font-semibold text-slate-900">{tr('All rows in this period', 'Toutes les lignes de cette période')}</h4>
                </div>
                {detailPageRows.length > 0 && (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                      {tr('Show', 'Afficher')}
                    </span>
                    {[8, 25, 50].map((limit) => {
                      const isActiveLimit = detailRowsPerPage === limit;
                      return (
                        <button
                          key={limit}
                          type="button"
                          onClick={() => {
                            setDetailRowsPerPage(limit);
                            setDetailPageCurrentPage(1);
                          }}
                          className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                            isActiveLimit
                              ? 'border-violet-300 bg-violet-600 text-white shadow-[0_10px_22px_rgba(79,70,229,0.20)]'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:text-violet-700'
                          }`}
                        >
                          {limit}
                        </button>
                      );
                    })}
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                      {tr('Page', 'Page')} {detailPageCurrentPage} / {detailPageTotalPages}
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-5 space-y-3">
                {detailPageRows.length === 0 ? (
                  <div className="rounded-[1.25rem] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    {tr('No rows found for this period.', 'Aucune ligne trouvée pour cette période.')}
                  </div>
                ) : (
                  paginatedDetailRows.map((row) => {
                    const Icon = sourceIcons[row.sourceType] || Receipt;
                    const isClickable = Boolean(row.href);
                    return (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => {
                          if (isClickable) {
                            handleOpenSourceRow(row);
                          }
                        }}
                        className={`w-full rounded-[1.5rem] border px-4 py-4 text-left transition duration-200 ease-out ${
                          isClickable
                            ? 'border-violet-200/90 bg-white shadow-[0_12px_28px_rgba(79,70,229,0.08),0_24px_52px_rgba(15,23,42,0.05)] hover:-translate-y-0.5 hover:scale-[1.01] hover:border-violet-300 hover:shadow-[0_18px_38px_rgba(79,70,229,0.12),0_28px_60px_rgba(15,23,42,0.08)] active:translate-y-0 active:scale-[0.985]'
                            : 'border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.05)]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex min-w-0 items-start gap-3">
                            <div className={`mt-0.5 rounded-2xl p-2 ${row.direction === 'incoming' ? 'bg-emerald-100 text-emerald-700' : row.direction === 'tax' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900">{row.title}</p>
                              {row.subtitle && <p className="mt-1 text-sm text-slate-500">{row.subtitle}</p>}
                              <div className="mt-2 flex flex-wrap gap-2">
                                {row.date && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500">{row.date}</span>}
                                {row.sourceType && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500">{row.sourceType}</span>}
                                {row.meta?.status && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500">{row.meta.status}</span>}
                              </div>
                            </div>
                          </div>

                          <div className="text-right">
                            <div className={`inline-flex items-center gap-1 text-lg font-bold ${row.direction === 'incoming' ? 'text-emerald-700' : row.direction === 'tax' ? 'text-amber-700' : 'text-rose-700'}`}>
                              {row.direction === 'incoming' ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                              <span>{row.direction === 'incoming' ? '+' : '-'}{formatCompact(row.amount)} MAD</span>
                            </div>
                            {row.href ? (
                              <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-violet-600">
                                {tr('Open', 'Ouvrir')}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {detailPageRows.length > detailRowsPerPage && (
                <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-slate-500">
                    {tr('Showing', 'Affichage')} {(detailPageCurrentPage - 1) * detailRowsPerPage + 1}-{Math.min(detailPageCurrentPage * detailRowsPerPage, detailPageRows.length)} {tr('of', 'sur')} {detailPageRows.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDetailPageCurrentPage((page) => Math.max(1, page - 1))}
                      disabled={detailPageCurrentPage === 1}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {tr('Previous', 'Précédent')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailPageCurrentPage((page) => Math.min(detailPageTotalPages, page + 1))}
                      disabled={detailPageCurrentPage === detailPageTotalPages}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {tr('Next', 'Suivant')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 px-4 sm:hidden">
          <div className="mx-auto max-w-md">
            <div className="pointer-events-auto rounded-[26px] border border-violet-200 bg-white/88 px-4 py-3 shadow-[0_-12px_30px_rgba(15,23,42,0.12)] backdrop-blur-xl">
              <button
                type="button"
                onClick={() => {
                  setDetailPage(null);
                  setDetailPageCurrentPage(1);
                }}
                className="flex w-full items-center justify-between gap-3 rounded-[20px] bg-gradient-to-r from-violet-600 to-indigo-700 px-5 py-3 text-base font-semibold text-white shadow-[0_16px_32px_rgba(79,70,229,0.26)] transition active:scale-[0.99]"
              >
                <span className="inline-flex items-center gap-2">
                  <ChevronLeft className="h-5 w-5" />
                  {tr('Back to Overview', "Retour à l'aperçu")}
                </span>
                <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.16em] shadow-[0_10px_24px_rgba(15,23,42,0.14)] backdrop-blur-md">
                  {tr('Overview', 'Aperçu')}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-[1.35rem] border border-violet-100 bg-violet-50/70 p-3 shadow-[0_12px_30px_rgba(79,70,229,0.08)]">
              <WalletCards className="h-6 w-6 text-violet-700" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">
                {tr('Finance Pulse', 'Pouls financier')}
              </p>
              <h3 className="mt-2 text-2xl font-bold text-slate-900">
                {tr('Period comparisons and drilldowns', 'Comparaisons de périodes et accès rapides')}
              </h3>
              <p className="mt-2 max-w-3xl text-sm text-slate-500">
                {tr(
                  'Compare the selected window against nearby periods, then jump straight into the full finance breakdown.',
                  'Comparez la fenêtre sélectionnée avec les périodes proches, puis ouvrez directement le détail complet de la finance.'
                )}
              </p>
            </div>
          </div>

          {strongestPeriod && (
            <div className={`rounded-[24px] border px-4 py-4 shadow-sm xl:max-w-sm ${strongestPeriod.net >= 0 ? 'border-emerald-200 bg-emerald-50/70 text-emerald-700' : 'border-rose-200 bg-rose-50/70 text-rose-700'}`}>
              <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                {tr('Strongest period', 'Période la plus forte')}
              </p>
              <p className="mt-2 text-lg font-semibold">
                {strongestPeriod.title}
              </p>
              <p className="mt-1 text-sm font-medium opacity-80">
                {strongestPeriod.label}
              </p>
              <p className="mt-3 text-xl font-bold">
                {strongestPeriod.net >= 0 ? '+' : ''}{formatCurrency(strongestPeriod.net)} MAD
              </p>
            </div>
          )}
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-3">
          {periodSummaries.map((summary, index) => {
            const periodType = index === 0 ? 'today' : index === 1 ? 'week' : 'month';
            const netPositive = summary.net >= 0;

            return (
              <div
                key={summary.title}
                className="rounded-[24px] border border-slate-200 bg-slate-50/75 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
                      <CalendarDays className="h-4 w-4 text-violet-700" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                        {summary.title}
                      </p>
                      <h4 className="mt-1 text-lg font-semibold text-slate-900">
                        {summary.label}
                      </h4>
                    </div>
                  </div>

                  <span className={`inline-flex shrink-0 items-center rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] ${netPositive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                    {netPositive ? '+' : ''}{formatCompact(summary.net)} MAD
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => onOpenBreakdown?.('collected')}
                    className={`${metricCardButtonClass} border-emerald-100 bg-white hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-emerald-50/60`}
                  >
                    <div className="flex min-h-[24px] items-start justify-between gap-3 text-emerald-700">
                      <span className="pr-1 text-left text-[11px] font-semibold uppercase tracking-[0.14em] leading-tight">
                        {tr('Collected', 'Collecté')}
                      </span>
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50">
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                    <p className="mt-2 text-left text-lg font-bold text-emerald-700">
                      {pulseLoading && pulseLedgerRows.length === 0 ? '...' : `${formatCompact(summary.incoming)} MAD`}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenBreakdown?.('outgoing')}
                    className={`${metricCardButtonClass} border-rose-100 bg-white hover:-translate-y-0.5 hover:border-rose-200 hover:bg-rose-50/60`}
                  >
                    <div className="flex min-h-[24px] items-start justify-between gap-3 text-rose-700">
                      <span className="pr-1 text-left text-[11px] font-semibold uppercase tracking-[0.14em] leading-tight">
                        {tr('Outgoing', 'Sorties')}
                      </span>
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-50">
                        <ArrowDownRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                    <p className="mt-2 text-left text-lg font-bold text-rose-700">
                      {pulseLoading && pulseLedgerRows.length === 0 ? '...' : `${formatCompact(summary.outgoing)} MAD`}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenBreakdown?.('net')}
                    className={`${metricCardButtonClass} border-slate-200 bg-white hover:-translate-y-0.5 hover:border-violet-200 hover:bg-violet-50/45`}
                  >
                    <div className={`flex min-h-[24px] items-start justify-between gap-3 ${netPositive ? 'text-emerald-700' : 'text-rose-700'}`}>
                      <span className="pr-1 text-left text-[11px] font-semibold uppercase tracking-[0.14em] leading-tight">
                        {tr('Net', 'Net')}
                      </span>
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-50">
                        <Activity className="h-3.5 w-3.5" />
                      </span>
                    </div>
                    <p className={`mt-2 text-left text-lg font-bold ${netPositive ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {pulseLoading && pulseLedgerRows.length === 0 ? '...' : `${netPositive ? '+' : ''}${formatCompact(summary.net)} MAD`}
                    </p>
                  </button>
                </div>

                <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 shadow-sm">
                    {pulseLoading && pulseLedgerRows.length === 0 ? '...' : `${summary.daysCovered} ${tr('day(s)', 'jour(s)')}`}
                  </span>

                  <button
                    type="button"
                    onClick={() => handleOpenDetailPage(periodType)}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-200"
                  >
                    {tr('Open full breakdown', 'Ouvrir le détail complet')}
                    <ArrowUpRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50/85 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-500">
                {tr('Quick drilldowns', 'Détails rapides')}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {tr(
                  'Jump into the finance buckets that matter most without leaving the overview.',
                  "Accédez directement aux postes finance les plus utiles sans quitter l'aperçu."
                )}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {pulseBreakdownShortcuts.map((shortcut) => (
                <button
                  key={shortcut.key}
                  type="button"
                  onClick={() => onOpenBreakdown?.(shortcut.key)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-200"
                >
                  {shortcut.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Revenue vs Expenses Trend Chart */}
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] transition-shadow duration-200 hover:shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
        <div className="flex items-center space-x-3 mb-6">
          <div className="rounded-2xl bg-violet-50 p-3">
            <TrendingUp className="w-6 h-6 text-violet-700" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{tr('Revenue vs expenses trend', 'Tendance revenus vs dépenses')}</h3>
            <p className="text-sm text-slate-600">{tr('Daily financial performance across the selected period.', 'Performance financière quotidienne sur la période sélectionnée.')}</p>
          </div>
        </div>
        
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis 
                dataKey="date" 
                stroke="#6B7280"
                fontSize={12}
                tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              />
              <YAxis 
                stroke="#6B7280"
                fontSize={12}
                tickFormatter={formatCompact}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#10B981"
                strokeWidth={3}
                fill="url(#revenueGradient)"
                name="Revenue"
                animationDuration={1500}
              />
              <Area
                type="monotone"
                dataKey="expenses"
                stroke="#EF4444"
                strokeWidth={3}
                fill="url(#expenseGradient)"
                name="Expenses"
                animationDuration={1500}
                animationDelay={300}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cost Breakdown Pie Chart */}
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] transition-shadow duration-200 hover:shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
          <div className="flex items-center space-x-3 mb-6">
            <div className="rounded-2xl bg-orange-50 p-3">
              <PieChartIcon className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{tr('Cost breakdown', 'Répartition des coûts')}</h3>
              <p className="text-sm text-slate-600">{tr('Real operational expense mix from recorded finance data.', 'Répartition réelle des dépenses opérationnelles à partir des données financières enregistrées.')}</p>
            </div>
          </div>
          
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={costBreakdownData}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  innerRadius={40}
                  paddingAngle={5}
                  dataKey="value"
                  animationDuration={1500}
                >
                  {costBreakdownData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value) => [formatCurrency(value) + ' MAD', 'Amount']}
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #E5E7EB',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }}
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={36}
                  formatter={(value, entry) => (
                    <span style={{ color: entry.color, fontWeight: '500' }}>
                      {value}
                    </span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top 5 Vehicles by Profitability */}
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] transition-shadow duration-200 hover:shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
          <div className="flex items-center space-x-3 mb-6">
            <div className="rounded-2xl bg-violet-50 p-3">
              <BarChart3 className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{tr('Top 5 vehicles by profitability', 'Top 5 véhicules par rentabilité')}</h3>
              <p className="text-sm text-slate-600">{tr('Most profitable vehicles in the selected period.', 'Véhicules les plus rentables sur la période sélectionnée.')}</p>
            </div>
          </div>
          
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={vehicleProfitData}
                layout="horizontal"
                margin={{ top: 20, right: 30, left: 40, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis 
                  type="number" 
                  stroke="#6B7280"
                  fontSize={12}
                  tickFormatter={formatCompact}
                />
                <YAxis 
                  type="category" 
                  dataKey="plateNumber" 
                  stroke="#6B7280"
                  fontSize={12}
                  width={60}
                />
                <Tooltip 
                  formatter={(value, name) => [formatCurrency(value) + ' MAD', name]}
                  labelFormatter={(label) => `Vehicle: ${label}`}
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #E5E7EB',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }}
                />
                <Bar 
                  dataKey="profit" 
                  name="Profit"
                  radius={[0, 4, 4, 0]}
                  animationDuration={1500}
                  animationDelay={(dataIndex) => dataIndex * 200}
                >
                  {vehicleProfitData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={`hsl(${120 + index * 30}, 70%, 50%)`}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

    </div>
  );
};

export default OverviewChartsV2;
