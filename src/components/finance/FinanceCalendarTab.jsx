import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, DollarSign, Zap } from 'lucide-react';
import { financeApiV2 } from '../../services/financeApiV2';

const fmt = (n) =>
  new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0);

const fmtFull = (n) =>
  new Intl.NumberFormat('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

const VIEW_MODES = ['Day', 'Week', 'Month', 'Year'];

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
  if (isSelected) bg = 'bg-violet-600 text-white';
  else if (!isCurrentMonth) bg = 'bg-gray-50/50 text-gray-300';
  else if (hasActivity && profit >= 0) bg = 'bg-emerald-50 hover:bg-emerald-100';
  else if (hasActivity && profit < 0) bg = 'bg-rose-50 hover:bg-rose-100';
  else bg = 'bg-white hover:bg-violet-50';

  const borderClass = isToday ? 'border-2 border-violet-500' : 'border border-gray-100';

  return (
    <button
      onClick={() => onClick(dateStr)}
      className={`relative rounded-lg p-1.5 text-left transition-all ${bg} ${borderClass} min-h-[72px] w-full`}
    >
      <span className={`text-xs font-bold ${isSelected ? 'text-white' : isToday ? 'text-violet-700' : isCurrentMonth ? 'text-slate-800' : 'text-gray-300'}`}>
        {day}
      </span>
      {hasActivity && isCurrentMonth && (
        <div className="mt-1 space-y-0.5">
          {data.revenue > 0 && (
            <div className={`flex items-center gap-0.5 text-[10px] font-semibold ${isSelected ? 'text-emerald-200' : 'text-emerald-700'}`}>
              <TrendingUp className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate">{fmt(data.revenue)}</span>
            </div>
          )}
          {data.expenses > 0 && (
            <div className={`flex items-center gap-0.5 text-[10px] font-semibold ${isSelected ? 'text-rose-200' : 'text-rose-600'}`}>
              <TrendingDown className="w-2.5 h-2.5 shrink-0" />
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
    <div className="rounded-xl border border-violet-100 overflow-hidden">
      <div className="grid grid-cols-7">
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
      <div className="flex items-center justify-between bg-violet-50/60 px-3 py-1.5 text-xs border-t border-violet-100">
        <span className="text-violet-600 font-semibold">Week total</span>
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
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
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
            className={`rounded-xl border-2 p-4 text-left transition-all hover:shadow-md ${
              hasActivity
                ? profit >= 0 ? 'border-emerald-200 bg-emerald-50 hover:border-emerald-400' : 'border-rose-200 bg-rose-50 hover:border-rose-400'
                : 'border-violet-100 bg-white hover:border-violet-300'
            }`}
          >
            <p className="text-sm font-bold text-slate-800">{name}</p>
            {hasActivity ? (
              <div className="mt-2 space-y-1">
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
              <p className="mt-2 text-xs text-slate-400">No activity</p>
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

  const handleDaySelect = (dateStr) => setSelectedDate(dateStr);

  const handleMonthClick = (mi) => {
    setCurrentMonth(mi);
    setViewMode('Month');
  };

  const periodLabel = viewMode === 'Year'
    ? String(currentYear)
    : `${MONTH_NAMES[currentMonth]} ${currentYear}`;

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        {/* View mode switcher */}
        <div className="flex rounded-xl border border-violet-200 overflow-hidden bg-white shrink-0">
          {VIEW_MODES.map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-4 py-2 text-sm font-semibold transition-all ${
                viewMode === mode
                  ? 'bg-violet-600 text-white'
                  : 'text-slate-600 hover:bg-violet-50'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* Period navigation */}
        <div className="flex items-center gap-3 flex-1 justify-center sm:justify-start">
          <button
            onClick={() => navigate(-1)}
            className="rounded-lg border border-violet-200 p-2 text-violet-600 hover:bg-violet-50 transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-base font-bold text-slate-900 min-w-[160px] text-center">{periodLabel}</span>
          <button
            onClick={() => navigate(1)}
            className="rounded-lg border border-violet-200 p-2 text-violet-600 hover:bg-violet-50 transition-all"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setCurrentYear(today.getFullYear()); setCurrentMonth(today.getMonth()); setSelectedDate(todayStr); }}
            className="rounded-lg border border-violet-200 px-3 py-2 text-xs font-semibold text-violet-600 hover:bg-violet-50 transition-all"
          >
            Today
          </button>
        </div>

        {/* Month totals pill */}
        {viewMode !== 'Year' && (
          <div className="flex items-center gap-3 rounded-xl border border-violet-100 bg-violet-50/60 px-4 py-2 text-xs font-semibold">
            <span className="text-emerald-700">Rev {fmt(monthTotals.rev)}</span>
            <span className="text-rose-600">Exp {fmt(monthTotals.exp)}</span>
            <span className={monthTotals.profit >= 0 ? 'text-emerald-700' : 'text-rose-600'}>
              {monthTotals.profit >= 0 ? '+' : ''}{fmt(monthTotals.profit)} net
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 rounded-full border-4 border-violet-300 border-t-violet-600 animate-spin" />
        </div>
      ) : viewMode === 'Year' ? (
        <YearView year={currentYear} dataMap={dataMap} onMonthClick={handleMonthClick} />
      ) : (
        <div className="space-y-3">
          {/* Day-of-week header */}
          <div className="grid grid-cols-7 gap-1">
            {DAY_LABELS.map((d) => (
              <div key={d} className="text-center text-[11px] font-bold text-slate-400 uppercase tracking-wide py-1">
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
            <div className="space-y-2 mt-4">
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
      )}

      {/* Selected Day Detail */}
      {viewMode !== 'Year' && selectedDate && (
        <div className="rounded-xl border-2 border-violet-200 bg-white overflow-hidden">
          <div className="bg-gradient-to-r from-violet-600 to-purple-600 px-5 py-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </h3>
            {selectedDate === todayStr && (
              <span className="rounded-lg bg-white/20 px-2 py-0.5 text-xs font-semibold text-white">Today</span>
            )}
          </div>

          {selectedData ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-violet-100">
              {[
                { label: 'Revenue', value: selectedData.revenue, icon: TrendingUp, color: 'text-emerald-700', bg: 'bg-emerald-50' },
                { label: 'Expenses', value: selectedData.expenses, icon: TrendingDown, color: 'text-rose-600', bg: 'bg-rose-50' },
                { label: 'Net Revenue', value: selectedData.netRevenue ?? (selectedData.revenue - selectedData.expenses), icon: DollarSign, color: (selectedData.netRevenue ?? (selectedData.revenue - selectedData.expenses)) >= 0 ? 'text-emerald-700' : 'text-rose-600', bg: 'bg-white' },
                { label: 'Fuel Costs', value: selectedData.fuelCosts, icon: Zap, color: 'text-amber-600', bg: 'bg-amber-50' },
              ].map(({ label, value, icon: Icon, color, bg }) => (
                <div key={label} className={`${bg} px-4 py-3`}>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
                  <div className={`flex items-center gap-1 mt-1 ${color}`}>
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="text-base font-bold">{fmtFull(value)}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">MAD</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-20">
              <p className="text-sm text-slate-400">No financial activity recorded for this day.</p>
            </div>
          )}

          {selectedData && (
            <div className="px-5 py-3 bg-slate-50 border-t border-violet-100">
              <div className="grid grid-cols-3 gap-4 text-xs">
                <div>
                  <p className="text-slate-500 font-semibold">Maintenance</p>
                  <p className="font-bold text-slate-800 mt-0.5">{fmtFull(selectedData.maintenanceCosts)} MAD</p>
                </div>
                <div>
                  <p className="text-slate-500 font-semibold">Inventory</p>
                  <p className="font-bold text-slate-800 mt-0.5">{fmtFull(selectedData.inventoryCosts)} MAD</p>
                </div>
                <div>
                  <p className="text-slate-500 font-semibold">Taxes</p>
                  <p className="font-bold text-slate-800 mt-0.5">{fmtFull(selectedData.taxes)} MAD</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
