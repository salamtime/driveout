import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, DollarSign, Zap, X, ExternalLink, Receipt, Wrench, Fuel, Package, Car, AlertCircle } from 'lucide-react';
import { financeApiV2 } from '../../services/financeApiV2';
import i18n from '../../i18n';

const isFrenchLocale = () => i18n.resolvedLanguage === 'fr';
const tr = (en, fr) => (isFrenchLocale() ? fr : en);

const fmt = (n) =>
  new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0);

const fmtFull = (n) =>
  new Intl.NumberFormat('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

const VIEW_MODES = ['Day', 'Week', 'Month', 'Year'];
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

/** Returns an array of { date: 'YYYY-MM-DD', ... } covering [start, end] padded to full weeks */
function buildMonthGrid(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  // Start on Sunday (or Monday if you prefer; using Sunday here)
  const startPad = firstDay.getDay(); // 0=Sun
  const endPad = 6 - lastDay.getDay();
  const cells = [];
  for (let i = -startPad; i <= lastDay.getDate() - 1 + endPad; i++) {
    const d = new Date(year, month, 1 + i);
    cells.push(d.toISOString().split('T')[0]);
  }
  return cells;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function DayCell({ dateStr, data, isCurrentMonth, isToday, isSelected, onClick }) {
  const day = Number(dateStr.split('-')[2]);
  const hasActivity = data && (data.revenue > 0 || data.expenses > 0);
  const profit = data ? data.revenue - data.expenses : 0;

  let bg = '';
  if (isSelected) bg = 'border-violet-600 bg-gradient-to-br from-violet-600 to-indigo-700 text-white shadow-[0_18px_38px_rgba(79,70,229,0.24)]';
  else if (!isCurrentMonth) bg = 'border-slate-100 bg-slate-50/70 text-slate-300';
  else if (hasActivity && profit >= 0) bg = 'border-emerald-100 bg-emerald-50/80 hover:border-emerald-200 hover:bg-emerald-50';
  else if (hasActivity && profit < 0) bg = 'border-rose-100 bg-rose-50/80 hover:border-rose-200 hover:bg-rose-50';
  else bg = 'border-slate-100 bg-white hover:border-violet-200 hover:bg-violet-50/50';

  const borderClass = isToday && !isSelected ? 'ring-2 ring-violet-300 ring-offset-1' : '';

  return (
    <button
      onClick={() => onClick(dateStr)}
      className={`relative min-h-[88px] w-full rounded-[1.15rem] border p-2.5 text-left transition-all ${bg} ${borderClass}`}
    >
      <span className={`text-xs font-bold ${isSelected ? 'text-white' : isToday ? 'text-violet-700' : isCurrentMonth ? 'text-slate-800' : 'text-slate-300'}`}>
        {day}
      </span>
      {hasActivity && isCurrentMonth && (
        <div className="mt-2 space-y-1">
          {data.revenue > 0 && (
            <div className={`flex items-center gap-1 text-[10px] font-semibold ${isSelected ? 'text-emerald-100' : 'text-emerald-700'}`}>
              <TrendingUp className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{fmt(data.revenue)}</span>
            </div>
          )}
          {data.expenses > 0 && (
            <div className={`flex items-center gap-1 text-[10px] font-semibold ${isSelected ? 'text-rose-100' : 'text-rose-600'}`}>
              <TrendingDown className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{fmt(data.expenses)}</span>
            </div>
          )}
        </div>
      )}
    </button>
  );
}

function WeekRow({ weekDates, dataMap, currentMonth, todayStr, selectedDate, onSelect }) {
  const weekRevenue = weekDates.reduce((s, d) => s + (dataMap[d]?.revenue || 0), 0);
  const weekExpenses = weekDates.reduce((s, d) => s + (dataMap[d]?.expenses || 0), 0);
  const weekProfit = weekRevenue - weekExpenses;
  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-violet-100/80 bg-white shadow-[0_16px_32px_rgba(76,29,149,0.06)]">
      <div className="grid grid-cols-7 gap-1 bg-violet-50/40 p-1">
        {weekDates.map((dateStr) => {
          const d = new Date(dateStr + 'T00:00:00');
          const inMonth = d.getMonth() === currentMonth;
          return (
            <DayCell
              key={dateStr}
              dateStr={dateStr}
              data={dataMap[dateStr]}
              isCurrentMonth={inMonth}
              isToday={dateStr === todayStr}
              isSelected={selectedDate === dateStr}
              onClick={onSelect}
            />
          );
        })}
      </div>
      <div className="flex items-center justify-between border-t border-violet-100 bg-gradient-to-r from-white via-slate-50 to-violet-50/60 px-4 py-2 text-xs">
        <span className="font-semibold uppercase tracking-[0.18em] text-violet-600">Week total</span>
        <div className="flex gap-3">
          <span className="text-emerald-700 font-bold">{fmt(weekRevenue)} rev</span>
          <span className="text-rose-600 font-bold">{fmt(weekExpenses)} exp</span>
          <span className={`font-bold ${weekProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
            {weekProfit >= 0 ? '+' : ''}{fmt(weekProfit)} net
          </span>
        </div>
      </div>
    </div>
  );
}

function YearView({ year, dataMap, onMonthClick }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
      {MONTH_NAMES.map((name, mi) => {
        let rev = 0, exp = 0;
        const daysInMonth = new Date(year, mi + 1, 0).getDate();
        for (let d = 1; d <= daysInMonth; d++) {
          const key = `${year}-${String(mi + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          rev += dataMap[key]?.revenue || 0;
          exp += dataMap[key]?.expenses || 0;
        }
        const profit = rev - exp;
        const hasActivity = rev > 0 || exp > 0;
        return (
          <button
            key={mi}
            onClick={() => onMonthClick(mi)}
            className={`rounded-[1.5rem] border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_36px_rgba(76,29,149,0.10)] ${
              hasActivity
                ? profit >= 0 ? 'border-emerald-100 bg-emerald-50/70 hover:border-emerald-300' : 'border-rose-100 bg-rose-50/70 hover:border-rose-300'
                : 'border-violet-100 bg-white hover:border-violet-300'
            }`}
          >
            <p className="text-sm font-bold tracking-tight text-slate-800">{name}</p>
            {hasActivity ? (
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center gap-1 text-xs text-emerald-700 font-semibold">
                  <TrendingUp className="w-3 h-3" /> {fmt(rev)}
                </div>
                <div className="flex items-center gap-1 text-xs text-rose-600 font-semibold">
                  <TrendingDown className="w-3 h-3" /> {fmt(exp)}
                </div>
                <div className={`text-xs font-bold ${profit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                  {profit >= 0 ? '+' : ''}{fmt(profit)}
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-400">No activity</p>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function FinanceCalendarTab({ filters, refreshTrigger }) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const [viewMode, setViewMode] = useState('Month');
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [trendData, setTrendData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dayBreakdown, setDayBreakdown] = useState(null);
  const [dayBreakdownLoading, setDayBreakdownLoading] = useState(false);
  const [dayBreakdownError, setDayBreakdownError] = useState('');
  const [isDayDrawerOpen, setIsDayDrawerOpen] = useState(false);
  const [detailPage, setDetailPage] = useState(null);
  const [detailPageLoading, setDetailPageLoading] = useState(false);
  const [detailPageError, setDetailPageError] = useState('');

  // Widen fetch range to cover the entire displayed year when in Year view
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const startDate = viewMode === 'Year'
          ? `${currentYear}-01-01`
          : `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
        const endDate = viewMode === 'Year'
          ? `${currentYear}-12-31`
          : new Date(currentYear, currentMonth + 1, 0).toISOString().split('T')[0];
        const data = await financeApiV2.getTrendData({
          ...filters,
          startDate,
          endDate,
        });
        setTrendData(Array.isArray(data) ? data : []);
      } catch {
        setTrendData([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [currentYear, currentMonth, viewMode, refreshTrigger]);

  const dataMap = useMemo(() => {
    const m = {};
    trendData.forEach((entry) => { if (entry.date) m[entry.date] = entry; });
    return m;
  }, [trendData]);

  const selectedData = dataMap[selectedDate];

  // Month grid cells
  const gridCells = useMemo(() => buildMonthGrid(currentYear, currentMonth), [currentYear, currentMonth]);
  const weeks = useMemo(() => {
    const rows = [];
    for (let i = 0; i < gridCells.length; i += 7) rows.push(gridCells.slice(i, i + 7));
    return rows;
  }, [gridCells]);

  const summarizePeriod = (dates) => {
    const totals = dates.reduce((acc, date) => {
      const entry = dataMap[date];
      if (!entry) return acc;
      acc.incoming += entry.revenue || 0;
      acc.outgoing += entry.expenses || 0;
      acc.maintenance += entry.maintenanceCosts || 0;
      acc.fuel += entry.fuelCosts || 0;
      acc.inventory += entry.inventoryCosts || 0;
      acc.taxes += entry.taxes || 0;
      return acc;
    }, {
      incoming: 0,
      outgoing: 0,
      maintenance: 0,
      fuel: 0,
      inventory: 0,
      taxes: 0
    });

    const activeDays = dates
      .map((date) => {
        const entry = dataMap[date];
        if (!entry) return null;
        return {
          date,
          incoming: entry.revenue || 0,
          outgoing: entry.expenses || 0,
          net: (entry.revenue || 0) - (entry.expenses || 0) - (entry.taxes || 0)
        };
      })
      .filter(Boolean)
      .filter((entry) => entry.incoming > 0 || entry.outgoing > 0 || entry.net !== 0)
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
      .slice(0, 5);

    return {
      ...totals,
      net: totals.incoming - totals.outgoing - totals.taxes,
      activeDays
    };
  };

  const selectedWeekDates = useMemo(
    () => weeks.find((week) => week.includes(selectedDate)) || weeks[0] || [],
    [weeks, selectedDate]
  );

  const weekSummary = useMemo(
    () => summarizePeriod(selectedWeekDates),
    [selectedWeekDates, dataMap]
  );

  const visibleMonthDates = useMemo(
    () => gridCells.filter((dateStr) => new Date(dateStr + 'T00:00:00').getMonth() === currentMonth),
    [gridCells, currentMonth]
  );

  const monthSummary = useMemo(
    () => summarizePeriod(visibleMonthDates),
    [visibleMonthDates, dataMap]
  );

  // Month totals
  const monthTotals = useMemo(() => {
    let rev = 0, exp = 0;
    gridCells.forEach((d) => {
      if (dataMap[d]) { rev += dataMap[d].revenue || 0; exp += dataMap[d].expenses || 0; }
    });
    return { rev, exp, profit: rev - exp };
  }, [gridCells, dataMap]);

  const navigate = (dir) => {
    if (viewMode === 'Year') {
      setCurrentYear((y) => y + dir);
    } else {
      let m = currentMonth + dir;
      let y = currentYear;
      if (m < 0) { m = 11; y--; }
      if (m > 11) { m = 0; y++; }
      setCurrentMonth(m);
      setCurrentYear(y);
    }
  };

  const loadDayBreakdown = async (dateStr) => {
    setDayBreakdownLoading(true);
    setDayBreakdownError('');
    setIsDayDrawerOpen(true);
    try {
      const breakdown = await financeApiV2.getDayBreakdown(dateStr, filters);
      setDayBreakdown(breakdown);
    } catch (error) {
      console.error('Failed to load day breakdown:', error);
      setDayBreakdownError(error.message || 'Failed to load day breakdown');
      setDayBreakdown(null);
    } finally {
      setDayBreakdownLoading(false);
    }
  };

  const handleDaySelect = (dateStr) => {
    setSelectedDate(dateStr);
    loadDayBreakdown(dateStr);
  };

  const handleMonthClick = (mi) => {
    setCurrentMonth(mi);
    setViewMode('Month');
  };

  const handleOpenSource = (row) => {
    if (!row?.href) return;
    window.location.href = row.href;
  };

  const buildDetailMeta = (periodType) => {
    if (periodType === 'day') {
      return {
        periodType,
        title: tr('Daily Finance Detail', 'Détail finance journalier'),
        rangeLabel: new Date(selectedDate + 'T00:00:00').toLocaleDateString(isFrenchLocale() ? 'fr-FR' : 'en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        dates: [selectedDate]
      };
    }

    if (periodType === 'week') {
      return {
        periodType,
        title: tr('Weekly Finance Detail', 'Détail finance hebdomadaire'),
        rangeLabel: `${new Date(selectedWeekDates[0] + 'T00:00:00').toLocaleDateString(isFrenchLocale() ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' })} - ${new Date(selectedWeekDates[selectedWeekDates.length - 1] + 'T00:00:00').toLocaleDateString(isFrenchLocale() ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
        dates: selectedWeekDates
      };
    }

    return {
      periodType,
      title: tr('Monthly Finance Detail', 'Détail finance mensuel'),
      rangeLabel: `${MONTH_NAMES[currentMonth]} ${currentYear}`,
      dates: visibleMonthDates
    };
  };

  const handleOpenDetailPage = async (periodType) => {
    const meta = buildDetailMeta(periodType);
    setDetailPageLoading(true);
    setDetailPageError('');
    setIsDayDrawerOpen(false);
    setDetailPage({
      ...meta,
      incomingTotal: 0,
      outgoingTotal: 0,
      taxesTotal: 0,
      netTotal: 0,
      rows: [],
      sourceTotals: {}
    });

    try {
      const breakdowns = await Promise.all(meta.dates.map((date) => financeApiV2.getDayBreakdown(date, filters)));
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
        incomingTotal: breakdowns.reduce((sum, breakdown) => sum + (breakdown.incomingTotal || 0), 0),
        outgoingTotal: breakdowns.reduce((sum, breakdown) => sum + (breakdown.outgoingTotal || 0), 0),
        taxesTotal: breakdowns.reduce((sum, breakdown) => sum + (breakdown.taxesTotal || 0), 0),
        netTotal: breakdowns.reduce((sum, breakdown) => sum + (breakdown.netTotal || 0), 0),
        rows,
        sourceTotals
      });
    } catch (error) {
      console.error('Failed to open finance detail page:', error);
      setDetailPageError(error.message || tr('Failed to load finance detail page', 'Impossible de charger la page de détail finance'));
    } finally {
      setDetailPageLoading(false);
    }
  };

  const periodLabel = viewMode === 'Year'
    ? String(currentYear)
    : `${MONTH_NAMES[currentMonth]} ${currentYear}`;

  if (detailPage) {
    const sourceCards = [
      { key: 'rental', label: tr('Rentals', 'Locations') },
      { key: 'tour', label: tr('Tours', 'Tours') },
      { key: 'maintenance', label: tr('Maintenance', 'Maintenance') },
      { key: 'fuel', label: tr('Fuel', 'Carburant') },
      { key: 'inventory', label: tr('Inventory', 'Inventaire') },
      { key: 'damage_recovery', label: tr('Damage Recovery', 'Récupération dommage') },
      { key: 'purchase', label: tr('Purchases', 'Achats') },
      { key: 'tax', label: tr('Taxes', 'Taxes') }
    ].filter((entry) => (detailPage.sourceTotals?.[entry.key] || 0) > 0);

    return (
      <div className="space-y-6">
        <div className="rounded-[2rem] border border-violet-100/80 bg-white p-5 shadow-[0_20px_55px_rgba(76,29,149,0.08)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">{detailPage.title}</p>
              <h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{detailPage.rangeLabel}</h3>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                {tr('Full finance detail view for this selected period. The drawer remains the quick overview, while this page shows the complete row-level picture.', 'Vue détaillée complète de la finance pour cette période sélectionnée. Le drawer reste le résumé rapide, tandis que cette page montre l’ensemble complet des lignes.')}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setDetailPage(null)}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-violet-200 hover:text-violet-700"
            >
              <ChevronLeft className="h-4 w-4" />
              {tr('Back to Calendar', 'Retour au calendrier')}
            </button>
          </div>
        </div>

        {detailPageLoading ? (
          <div className="rounded-[2rem] border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
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
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="rounded-[1.5rem] border border-emerald-100 bg-emerald-50/80 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">{tr('Incoming', 'Entrées')}</p>
                <p className="mt-2 text-2xl font-bold text-emerald-700">{fmtFull(detailPage.incomingTotal)} MAD</p>
              </div>
              <div className="rounded-[1.5rem] border border-rose-100 bg-rose-50/80 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-700">{tr('Outgoing', 'Sorties')}</p>
                <p className="mt-2 text-2xl font-bold text-rose-700">{fmtFull(detailPage.outgoingTotal)} MAD</p>
              </div>
              <div className="rounded-[1.5rem] border border-amber-100 bg-amber-50/80 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">{tr('Taxes', 'Taxes')}</p>
                <p className="mt-2 text-2xl font-bold text-amber-700">{fmtFull(detailPage.taxesTotal)} MAD</p>
              </div>
              <div className="rounded-[1.5rem] border border-violet-100 bg-gradient-to-r from-violet-50 via-white to-indigo-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-600">{tr('Net', 'Net')}</p>
                <p className={`mt-2 text-2xl font-bold ${detailPage.netTotal >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {detailPage.netTotal >= 0 ? '+' : ''}{fmtFull(detailPage.netTotal)} MAD
                </p>
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
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

            <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">{tr('Transaction Detail', 'Détail des transactions')}</p>
                  <h4 className="mt-2 text-lg font-semibold text-slate-900">{tr('All rows in this period', 'Toutes les lignes de cette période')}</h4>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {detailPage.rows.length === 0 ? (
                  <div className="rounded-[1.25rem] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    {tr('No rows found for this period.', 'Aucune ligne trouvée pour cette période.')}
                  </div>
                ) : (
                  detailPage.rows.map((row) => {
                    const Icon = sourceIcons[row.sourceType] || Receipt;
                    return (
                      <div key={row.id} className="rounded-[1.25rem] border border-slate-200 bg-white px-4 py-4 shadow-sm">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex min-w-0 items-start gap-3">
                            <div className={`mt-0.5 rounded-2xl p-2 ${row.direction === 'incoming' ? 'bg-emerald-100 text-emerald-700' : row.direction === 'tax' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900">{row.title}</p>
                              {row.subtitle && <p className="mt-1 text-sm text-slate-500">{row.subtitle}</p>}
                              <div className="mt-2 flex flex-wrap gap-2">
                                {row.date && (
                                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500">
                                    {row.date}
                                  </span>
                                )}
                                {row.sourceType && (
                                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500">
                                    {row.sourceType}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="text-right">
                            <p className={`text-lg font-bold ${row.direction === 'incoming' ? 'text-emerald-700' : row.direction === 'tax' ? 'text-amber-700' : 'text-rose-700'}`}>
                              {row.direction === 'incoming' ? '+' : '-'}{fmtFull(row.amount)} MAD
                            </p>
                            {row.href && (
                              <button
                                type="button"
                                onClick={() => handleOpenSource(row)}
                                className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-violet-600 hover:text-violet-700"
                              >
                                {tr('Open', 'Ouvrir')}
                                <ExternalLink className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[2rem] border border-violet-100/80 bg-white p-5 shadow-[0_20px_55px_rgba(76,29,149,0.08)]">
        <div className="flex flex-col gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">{tr('Finance Calendar', 'Calendrier finance')}</p>
            <h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{tr('Daily financial visibility', 'Visibilité financière quotidienne')}</h3>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              {tr('Track incoming and outgoing activity by day, then move across week, month, and year views inside the same calendar workspace.', "Suivez les entrées et sorties par jour, puis naviguez entre les vues semaine, mois et année dans le même espace calendrier.")}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-[1.4rem] border border-emerald-100 bg-emerald-50/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">{tr('Incoming', 'Entrées')}</p>
              <p className="mt-2 text-2xl font-bold text-emerald-700">{fmt(monthTotals.rev)} MAD</p>
              <p className="mt-1 text-xs text-emerald-700/80">{tr('Revenue for the visible period', 'Revenu sur la période visible')}</p>
            </div>
            <div className="rounded-[1.4rem] border border-rose-100 bg-rose-50/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-700">{tr('Outgoing', 'Sorties')}</p>
              <p className="mt-2 text-2xl font-bold text-rose-700">{fmt(monthTotals.exp)} MAD</p>
              <p className="mt-1 text-xs text-rose-700/80">{tr('Expenses for the visible period', 'Dépenses sur la période visible')}</p>
            </div>
            <div className="rounded-[1.4rem] border border-violet-100 bg-gradient-to-r from-violet-50 via-white to-indigo-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-600">{tr('Net', 'Net')}</p>
              <p className={`mt-2 text-2xl font-bold ${monthTotals.profit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {monthTotals.profit >= 0 ? '+' : ''}{fmt(monthTotals.profit)} MAD
              </p>
              <p className="mt-1 text-xs text-slate-500">{tr('Balance after incoming and outgoing', 'Solde après entrées et sorties')}</p>
            </div>
          </div>

          {/* Header bar */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        {/* View mode switcher */}
        <div className="flex rounded-2xl border border-violet-100 bg-gradient-to-r from-white via-slate-50 to-violet-50/60 p-1 shadow-sm shrink-0">
          {VIEW_MODES.map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                viewMode === mode
                  ? 'bg-gradient-to-r from-violet-600 to-indigo-700 text-white shadow-[0_12px_26px_rgba(79,70,229,0.22)]'
                  : 'text-slate-600 hover:bg-white hover:text-slate-900'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* Period navigation */}
        <div className="flex items-center gap-3 justify-center xl:flex-1 xl:justify-start">
          <button
            onClick={() => navigate(-1)}
            className="rounded-2xl border border-violet-100 bg-white p-2.5 text-violet-600 shadow-sm transition-all hover:bg-violet-50"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="min-w-[180px] text-center text-base font-bold tracking-tight text-slate-900">{periodLabel}</span>
          <button
            onClick={() => navigate(1)}
            className="rounded-2xl border border-violet-100 bg-white p-2.5 text-violet-600 shadow-sm transition-all hover:bg-violet-50"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setCurrentYear(today.getFullYear()); setCurrentMonth(today.getMonth()); setSelectedDate(todayStr); }}
            className="rounded-2xl border border-violet-100 bg-white px-3.5 py-2 text-xs font-semibold text-violet-600 shadow-sm transition-all hover:bg-violet-50"
          >
            {tr('Today', "Aujourd'hui")}
          </button>
        </div>

        {/* Month totals pill */}
        {viewMode !== 'Year' && (
          <div className="flex items-center gap-3 rounded-2xl border border-violet-100 bg-gradient-to-r from-white via-slate-50 to-violet-50/60 px-4 py-2.5 text-xs font-semibold shadow-sm">
            <span className="text-emerald-700">Rev {fmt(monthTotals.rev)}</span>
            <span className="text-rose-600">Exp {fmt(monthTotals.exp)}</span>
            <span className={monthTotals.profit >= 0 ? 'text-emerald-700' : 'text-rose-600'}>
              {monthTotals.profit >= 0 ? '+' : ''}{fmt(monthTotals.profit)} net
            </span>
          </div>
        )}
      </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-[2rem] border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
          <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
            <div className="text-5xl leading-none animate-pulse">⏳</div>
            <h3 className="text-xl font-semibold text-slate-900">{tr('Loading finance calendar...', 'Chargement du calendrier finance...')}</h3>
          </div>
        </div>
      ) : viewMode === 'Year' ? (
        <div className="rounded-[2rem] border border-violet-100/80 bg-white p-5 shadow-[0_20px_55px_rgba(76,29,149,0.08)]">
          <YearView year={currentYear} dataMap={dataMap} onMonthClick={handleMonthClick} />
        </div>
      ) : (
        <div className="rounded-[2rem] border border-violet-100/80 bg-white p-4 shadow-[0_20px_55px_rgba(76,29,149,0.08)] sm:p-5">
        <div className="space-y-3">
          {/* Day-of-week header */}
          <div className="grid grid-cols-7 gap-1">
            {DAY_LABELS.map((d) => (
              <div key={d} className="py-2 text-center text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                {d}
              </div>
            ))}
          </div>

          {/* Weeks */}
          <div className="space-y-1">
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 gap-1">
                {week.map((dateStr) => {
                  const inMonth = new Date(dateStr + 'T00:00:00').getMonth() === currentMonth;
                  return (
                    <DayCell
                      key={dateStr}
                      dateStr={dateStr}
                      data={dataMap[dateStr]}
                      isCurrentMonth={inMonth}
                      isToday={dateStr === todayStr}
                      isSelected={selectedDate === dateStr}
                      onClick={handleDaySelect}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          {/* Week summary rows — visible in Week mode or if user wants them */}
          {viewMode === 'Week' && (
            <div className="mt-5 space-y-3">
              {weeks.map((week, wi) => (
                <WeekRow
                  key={wi}
                  weekDates={week}
                  dataMap={dataMap}
                  currentMonth={currentMonth}
                  todayStr={todayStr}
                  selectedDate={selectedDate}
                  onSelect={handleDaySelect}
                />
              ))}
            </div>
          )}
        </div>
        </div>
      )}

      {/* Selected Day Detail */}
      {viewMode !== 'Year' && selectedDate && (
        <div className="overflow-hidden rounded-[2rem] border border-violet-100/80 bg-white shadow-[0_20px_55px_rgba(76,29,149,0.08)]">
          <div className="flex items-center justify-between bg-gradient-to-r from-violet-600 to-indigo-700 px-5 py-4">
            <h3 className="text-sm font-bold tracking-wide text-white">
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </h3>
            {selectedDate === todayStr && (
              <span className="rounded-xl bg-white/15 px-3 py-1 text-xs font-semibold text-white">{tr('Today', "Aujourd'hui")}</span>
            )}
          </div>

          {selectedData ? (
            <div className="grid grid-cols-2 gap-px bg-violet-100 sm:grid-cols-4">
              {[
                { label: tr('Revenue', 'Revenu'), value: selectedData.revenue, icon: TrendingUp, color: 'text-emerald-700', bg: 'bg-emerald-50' },
                { label: tr('Expenses', 'Dépenses'), value: selectedData.expenses, icon: TrendingDown, color: 'text-rose-600', bg: 'bg-rose-50' },
                { label: tr('Net Revenue', 'Revenu net'), value: selectedData.netRevenue ?? (selectedData.revenue - selectedData.expenses), icon: DollarSign, color: (selectedData.netRevenue ?? (selectedData.revenue - selectedData.expenses)) >= 0 ? 'text-emerald-700' : 'text-rose-600', bg: 'bg-white' },
                { label: tr('Fuel Costs', 'Coûts carburant'), value: selectedData.fuelCosts, icon: Zap, color: 'text-amber-600', bg: 'bg-amber-50' },
              ].map(({ label, value, icon: Icon, color, bg }) => (
                <div key={label} className={`${bg} px-4 py-4`}>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
                  <div className={`flex items-center gap-1 mt-1 ${color}`}>
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="text-base font-bold">{fmtFull(value)}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">MAD</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-24 items-center justify-center">
              <p className="text-sm text-slate-400">{tr('No financial activity recorded for this day.', "Aucune activité financière enregistrée pour cette journée.")}</p>
            </div>
          )}

          {selectedData && (
            <div className="border-t border-violet-100 bg-gradient-to-r from-white via-slate-50 to-violet-50/50 px-5 py-4">
              <div className="mb-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => handleOpenDetailPage('day')}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-violet-600 shadow-sm transition hover:border-violet-200 hover:text-violet-700"
                >
                  {tr('View More Details', 'Voir plus de détails')}
                  <ExternalLink className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-4 text-xs">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <p className="font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Maintenance', 'Maintenance')}</p>
                  <p className="font-bold text-slate-800 mt-0.5">{fmtFull(selectedData.maintenanceCosts)} MAD</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <p className="font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Inventory', 'Inventaire')}</p>
                  <p className="font-bold text-slate-800 mt-0.5">{fmtFull(selectedData.inventoryCosts)} MAD</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <p className="font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Taxes', 'Taxes')}</p>
                  <p className="font-bold text-slate-800 mt-0.5">{fmtFull(selectedData.taxes)} MAD</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {viewMode === 'Week' && (
        <div className="rounded-[2rem] border border-violet-100/80 bg-white p-5 shadow-[0_20px_55px_rgba(76,29,149,0.08)]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">{tr('Week Breakdown', 'Détail semaine')}</p>
              <h3 className="mt-2 text-xl font-bold tracking-tight text-slate-900">
                {new Date(selectedWeekDates[0] + 'T00:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                {' - '}
                {new Date(selectedWeekDates[selectedWeekDates.length - 1] + 'T00:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
              </h3>
            </div>
            <div className={`rounded-2xl px-4 py-2 text-sm font-semibold ${weekSummary.net >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
              {tr('Net', 'Net')} {weekSummary.net >= 0 ? '+' : ''}{fmtFull(weekSummary.net)} MAD
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => handleOpenDetailPage('week')}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-violet-600 shadow-sm transition hover:border-violet-200 hover:text-violet-700"
            >
              {tr('View More Details', 'Voir plus de détails')}
              <ExternalLink className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="rounded-[1.4rem] border border-emerald-100 bg-emerald-50/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">{tr('Incoming', 'Entrées')}</p>
              <p className="mt-2 text-2xl font-bold text-emerald-700">{fmtFull(weekSummary.incoming)} MAD</p>
            </div>
            <div className="rounded-[1.4rem] border border-rose-100 bg-rose-50/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-700">{tr('Outgoing', 'Sorties')}</p>
              <p className="mt-2 text-2xl font-bold text-rose-700">{fmtFull(weekSummary.outgoing)} MAD</p>
            </div>
            <div className="rounded-[1.4rem] border border-amber-100 bg-amber-50/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">{tr('Taxes', 'Taxes')}</p>
              <p className="mt-2 text-2xl font-bold text-amber-700">{fmtFull(weekSummary.taxes)} MAD</p>
            </div>
            <div className="rounded-[1.4rem] border border-violet-100 bg-gradient-to-r from-violet-50 via-white to-indigo-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-600">{tr('Net', 'Net')}</p>
              <p className={`mt-2 text-2xl font-bold ${weekSummary.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {weekSummary.net >= 0 ? '+' : ''}{fmtFull(weekSummary.net)} MAD
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4">
              <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-slate-600">{tr('Cost Breakdown', 'Répartition des coûts')}</h4>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="rounded-2xl border border-white bg-white p-4 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Maintenance', 'Maintenance')}</p>
                  <p className="mt-2 text-lg font-bold text-slate-900">{fmtFull(weekSummary.maintenance)} MAD</p>
                </div>
                <div className="rounded-2xl border border-white bg-white p-4 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Fuel', 'Carburant')}</p>
                  <p className="mt-2 text-lg font-bold text-slate-900">{fmtFull(weekSummary.fuel)} MAD</p>
                </div>
                <div className="rounded-2xl border border-white bg-white p-4 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Inventory', 'Inventaire')}</p>
                  <p className="mt-2 text-lg font-bold text-slate-900">{fmtFull(weekSummary.inventory)} MAD</p>
                </div>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4">
              <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-slate-600">{tr('Top Days', 'Jours forts')}</h4>
              <div className="mt-4 space-y-3">
                {weekSummary.activeDays.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-400">
                    {tr('No active days in this week.', 'Aucun jour actif sur cette semaine.')}
                  </div>
                ) : (
                  weekSummary.activeDays.map((entry) => (
                    <div key={entry.date} className="rounded-2xl border border-white bg-white px-4 py-3 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">
                            {new Date(entry.date + 'T00:00:00').toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            +{fmt(entry.incoming)} / -{fmt(entry.outgoing)}
                          </p>
                        </div>
                        <div className={`text-sm font-bold ${entry.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {entry.net >= 0 ? '+' : ''}{fmt(entry.net)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {viewMode === 'Month' && (
        <div className="rounded-[2rem] border border-violet-100/80 bg-white p-5 shadow-[0_20px_55px_rgba(76,29,149,0.08)]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">{tr('Month Breakdown', 'Détail mois')}</p>
              <h3 className="mt-2 text-xl font-bold tracking-tight text-slate-900">{MONTH_NAMES[currentMonth]} {currentYear}</h3>
            </div>
            <div className={`rounded-2xl px-4 py-2 text-sm font-semibold ${monthSummary.net >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
              {tr('Net', 'Net')} {monthSummary.net >= 0 ? '+' : ''}{fmtFull(monthSummary.net)} MAD
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => handleOpenDetailPage('month')}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-violet-600 shadow-sm transition hover:border-violet-200 hover:text-violet-700"
            >
              {tr('View More Details', 'Voir plus de détails')}
              <ExternalLink className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="rounded-[1.4rem] border border-emerald-100 bg-emerald-50/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">{tr('Incoming', 'Entrées')}</p>
              <p className="mt-2 text-2xl font-bold text-emerald-700">{fmtFull(monthSummary.incoming)} MAD</p>
            </div>
            <div className="rounded-[1.4rem] border border-rose-100 bg-rose-50/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-700">{tr('Outgoing', 'Sorties')}</p>
              <p className="mt-2 text-2xl font-bold text-rose-700">{fmtFull(monthSummary.outgoing)} MAD</p>
            </div>
            <div className="rounded-[1.4rem] border border-amber-100 bg-amber-50/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">{tr('Taxes', 'Taxes')}</p>
              <p className="mt-2 text-2xl font-bold text-amber-700">{fmtFull(monthSummary.taxes)} MAD</p>
            </div>
            <div className="rounded-[1.4rem] border border-violet-100 bg-gradient-to-r from-violet-50 via-white to-indigo-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-600">{tr('Net', 'Net')}</p>
              <p className={`mt-2 text-2xl font-bold ${monthSummary.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {monthSummary.net >= 0 ? '+' : ''}{fmtFull(monthSummary.net)} MAD
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4">
              <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-slate-600">{tr('Category Breakdown', 'Répartition par catégorie')}</h4>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-2xl border border-white bg-white p-4 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Maintenance', 'Maintenance')}</p>
                  <p className="mt-2 text-lg font-bold text-slate-900">{fmtFull(monthSummary.maintenance)} MAD</p>
                </div>
                <div className="rounded-2xl border border-white bg-white p-4 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Fuel', 'Carburant')}</p>
                  <p className="mt-2 text-lg font-bold text-slate-900">{fmtFull(monthSummary.fuel)} MAD</p>
                </div>
                <div className="rounded-2xl border border-white bg-white p-4 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Inventory', 'Inventaire')}</p>
                  <p className="mt-2 text-lg font-bold text-slate-900">{fmtFull(monthSummary.inventory)} MAD</p>
                </div>
                <div className="rounded-2xl border border-white bg-white p-4 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Taxes', 'Taxes')}</p>
                  <p className="mt-2 text-lg font-bold text-slate-900">{fmtFull(monthSummary.taxes)} MAD</p>
                </div>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/70 p-4">
              <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-slate-600">{tr('Top Days', 'Jours forts')}</h4>
              <div className="mt-4 space-y-3">
                {monthSummary.activeDays.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-400">
                    {tr('No active days in this month.', 'Aucun jour actif sur ce mois.')}
                  </div>
                ) : (
                  monthSummary.activeDays.map((entry) => (
                    <div key={entry.date} className="rounded-2xl border border-white bg-white px-4 py-3 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">
                            {new Date(entry.date + 'T00:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            +{fmt(entry.incoming)} / -{fmt(entry.outgoing)}
                          </p>
                        </div>
                        <div className={`text-sm font-bold ${entry.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {entry.net >= 0 ? '+' : ''}{fmt(entry.net)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {isDayDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-sm" onClick={() => setIsDayDrawerOpen(false)}>
          <div
            className="h-full w-full max-w-2xl overflow-y-auto border-l border-violet-100 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.18)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 border-b border-violet-100 bg-white/95 px-5 py-5 backdrop-blur">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">{tr('Day Breakdown', 'Détail jour')}</p>
                  <h3 className="mt-2 text-xl font-bold tracking-tight text-slate-900">
                    {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">{tr('See what made up this day across incoming, outgoing, and taxes.', 'Voyez ce qui compose cette journée entre entrées, sorties et taxes.')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenDetailPage('day')}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-violet-600 shadow-sm transition hover:border-violet-200 hover:text-violet-700"
                  >
                    {tr('View More Details', 'Voir plus de détails')}
                    <ExternalLink className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsDayDrawerOpen(false)}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-slate-100"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-6 p-5">
              {dayBreakdownLoading && (
                <div className="rounded-[1.75rem] border border-slate-200 bg-white px-6 py-14 text-center shadow-sm">
                  <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                    <div className="text-5xl leading-none animate-pulse">⏳</div>
                    <h3 className="text-lg font-semibold text-slate-900">{tr('Loading day breakdown...', 'Chargement du détail du jour...')}</h3>
                  </div>
                </div>
              )}

              {!dayBreakdownLoading && dayBreakdownError && (
                <div className="rounded-[1.5rem] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
                  {dayBreakdownError}
                </div>
              )}

              {!dayBreakdownLoading && !dayBreakdownError && dayBreakdown && (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                    <div className="rounded-[1.4rem] border border-emerald-100 bg-emerald-50/70 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">{tr('Incoming', 'Entrées')}</p>
                      <p className="mt-2 text-2xl font-bold text-emerald-700">{fmtFull(dayBreakdown.incomingTotal)} MAD</p>
                    </div>
                    <div className="rounded-[1.4rem] border border-rose-100 bg-rose-50/70 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-700">{tr('Outgoing', 'Sorties')}</p>
                      <p className="mt-2 text-2xl font-bold text-rose-700">{fmtFull(dayBreakdown.outgoingTotal)} MAD</p>
                    </div>
                    <div className="rounded-[1.4rem] border border-amber-100 bg-amber-50/70 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">{tr('Taxes', 'Taxes')}</p>
                      <p className="mt-2 text-2xl font-bold text-amber-700">{fmtFull(dayBreakdown.taxesTotal)} MAD</p>
                    </div>
                    <div className="rounded-[1.4rem] border border-violet-100 bg-gradient-to-r from-violet-50 via-white to-indigo-50 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-600">{tr('Net', 'Net')}</p>
                      <p className={`mt-2 text-2xl font-bold ${dayBreakdown.netTotal >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {dayBreakdown.netTotal >= 0 ? '+' : ''}{fmtFull(dayBreakdown.netTotal)} MAD
                      </p>
                    </div>
                  </div>

                  {[
                    { key: 'incoming', title: tr('Incoming', 'Entrées'), rows: dayBreakdown.rows.filter((row) => row.direction === 'incoming'), sectionClass: 'border-emerald-100 bg-emerald-50/40', iconClass: 'bg-emerald-100 text-emerald-700' },
                    { key: 'outgoing', title: tr('Outgoing', 'Sorties'), rows: dayBreakdown.rows.filter((row) => row.direction === 'outgoing'), sectionClass: 'border-rose-100 bg-rose-50/40', iconClass: 'bg-rose-100 text-rose-700' },
                    { key: 'tax', title: tr('Taxes', 'Taxes'), rows: dayBreakdown.rows.filter((row) => row.direction === 'tax'), sectionClass: 'border-amber-100 bg-amber-50/40', iconClass: 'bg-amber-100 text-amber-700' }
                  ].map((section) => (
                    <div key={section.key} className={`rounded-[1.75rem] border p-4 ${section.sectionClass}`}>
                      <div className="mb-4 flex items-center justify-between">
                        <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-slate-700">{section.title}</h4>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500">
                          {section.rows.length} {tr(section.rows.length === 1 ? 'row' : 'rows', section.rows.length === 1 ? 'ligne' : 'lignes')}
                        </span>
                      </div>

                      {section.rows.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-400">
                          {tr('No rows for this day in this section.', 'Aucune ligne pour cette journée dans cette section.')}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {section.rows.map((row) => {
                            const Icon = sourceIcons[row.sourceType] || Receipt;
                            return (
                              <div key={row.id} className="rounded-[1.25rem] border border-white bg-white px-4 py-4 shadow-sm">
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex min-w-0 items-start gap-3">
                                    <div className={`mt-0.5 rounded-2xl p-2 ${section.iconClass}`}>
                                      <Icon className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0">
                                      <p className="font-semibold text-slate-900">{row.title}</p>
                                      {row.subtitle && <p className="mt-1 text-sm text-slate-500">{row.subtitle}</p>}
                                      {row.meta && Object.keys(row.meta).length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-2">
                                          {Object.entries(row.meta)
                                            .filter(([, value]) => value !== null && value !== undefined && value !== '' && value !== 0)
                                            .slice(0, 3)
                                            .map(([key, value]) => (
                                              <span key={key} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500">
                                                {key}: {String(value)}
                                              </span>
                                            ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <p className={`text-lg font-bold ${section.key === 'incoming' ? 'text-emerald-700' : section.key === 'tax' ? 'text-amber-700' : 'text-rose-700'}`}>
                                      {section.key === 'incoming' ? '+' : '-'}{fmtFull(row.amount)} MAD
                                    </p>
                                    {row.href && (
                                      <button
                                        type="button"
                                        onClick={() => handleOpenSource(row)}
                                        className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-violet-600 hover:text-violet-700"
                                      >
                                        {tr('Open', 'Ouvrir')}
                                        <ExternalLink className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
