import React, { useEffect, useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, Wallet, BarChart3, Clock3 } from 'lucide-react';
import { financeApiV2 } from '../../services/financeApiV2';
import i18n from '../../i18n';

const tr = (en, fr) => (i18n.resolvedLanguage === 'fr' ? fr : en);

const formatCompact = (amount) => {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  if (safeAmount >= 1000000) {
    return `${(safeAmount / 1000000).toFixed(1)}M`;
  }
  if (safeAmount >= 1000) {
    return `${(safeAmount / 1000).toFixed(0)}K`;
  }
  return safeAmount.toString();
};

const toneMap = {
  violet: {
    iconTone: 'bg-violet-50',
    iconText: 'text-violet-700',
    badgeTone: 'border-violet-200 bg-violet-50 text-violet-700',
    valueTone: 'text-violet-700',
  },
  emerald: {
    iconTone: 'bg-emerald-50',
    iconText: 'text-emerald-700',
    badgeTone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    valueTone: 'text-emerald-700',
  },
  rose: {
    iconTone: 'bg-rose-50',
    iconText: 'text-rose-700',
    badgeTone: 'border-rose-200 bg-rose-50 text-rose-700',
    valueTone: 'text-rose-700',
  },
  amber: {
    iconTone: 'bg-amber-50',
    iconText: 'text-amber-700',
    badgeTone: 'border-amber-200 bg-amber-50 text-amber-700',
    valueTone: 'text-amber-700',
  },
  cyan: {
    iconTone: 'bg-cyan-50',
    iconText: 'text-cyan-700',
    badgeTone: 'border-cyan-200 bg-cyan-50 text-cyan-700',
    valueTone: 'text-cyan-700',
  },
  slate: {
    iconTone: 'bg-slate-50',
    iconText: 'text-slate-700',
    badgeTone: 'border-slate-200 bg-slate-50 text-slate-600',
    valueTone: 'text-slate-900',
  },
};

const StatCardSkeleton = () => (
  <div className="min-h-[168px] animate-pulse rounded-xl border border-violet-100 bg-white p-4 shadow-[0_18px_45px_rgba(76,29,149,0.08)]">
    <div className="flex items-start justify-between gap-3">
      <div className="h-12 w-12 rounded-xl bg-violet-100" />
      <div className="h-6 w-24 rounded-full bg-slate-100" />
    </div>
    <div className="mt-4 h-3 w-24 rounded bg-slate-100" />
    <div className="mt-3 h-10 w-32 rounded bg-slate-100" />
    <div className="mt-5 h-5 w-40 rounded bg-slate-100" />
  </div>
);

const KPICardsV2 = ({
  filters,
  refreshTrigger,
  onOpenBreakdown,
  prefetchedKpiData = null,
  parentLoading = false,
  periodLabel = '',
}) => {
  const [kpiData, setKpiData] = useState(prefetchedKpiData);
  const [loading, setLoading] = useState(!prefetchedKpiData);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (prefetchedKpiData) {
      setKpiData(prefetchedKpiData);
      setLoading(false);
      setError(null);
      return;
    }

    const loadKPIData = async () => {
      try {
        setLoading(true);
        setError(null);

        const data = await financeApiV2.getKPIData(filters);
        setKpiData(data);
      } catch (err) {
        console.error('❌ Enhanced KPI loading failed:', err);
        setError(err.message || tr('Failed to load KPI data', 'Impossible de charger les indicateurs finance'));
      } finally {
        setLoading(false);
      }
    };

    void loadKPIData();
  }, [filters, prefetchedKpiData, refreshTrigger]);

  const collectedValue = Number.isFinite(kpiData?.totalCollected) ? kpiData.totalCollected : 0;
  const expensesValue = Number.isFinite(kpiData?.totalExpenses) ? kpiData.totalExpenses : 0;
  const outstandingValue = Number.isFinite(kpiData?.totalOutstanding) ? kpiData.totalOutstanding : 0;
  const netCashValue = Number.isFinite(kpiData?.netCash)
    ? kpiData.netCash
    : collectedValue - expensesValue;

  const cards = useMemo(() => ([
    {
      key: 'collected',
      eyebrow: tr('Collected', 'Collecté'),
      label: tr('Revenue confirmed inside the selected period.', 'Revenu confirmé sur la période sélectionnée.'),
      value: collectedValue,
      change: Number.isFinite(kpiData?.collectedChange) ? kpiData.collectedChange : 0,
      icon: Wallet,
      tone: 'emerald',
      breakdownType: 'collected',
    },
    {
      key: 'expenses',
      eyebrow: tr('Expenses', 'Dépenses'),
      label: tr('Manual expenses and other outgoing finance activity.', 'Dépenses manuelles et autres sorties finance.'),
      value: expensesValue,
      change: Number.isFinite(kpiData?.expensesChange) ? kpiData.expensesChange : 0,
      icon: BarChart3,
      tone: 'rose',
      breakdownType: 'expenses',
    },
    {
      key: 'outstanding',
      eyebrow: tr('Outstanding', 'Restant dû'),
      label: tr('Open balances still waiting to be collected.', 'Soldes ouverts en attente d’encaissement.'),
      value: outstandingValue,
      change: Number.isFinite(kpiData?.outstandingChange) ? kpiData.outstandingChange : 0,
      icon: Clock3,
      tone: 'amber',
      breakdownType: null,
    },
    {
      key: 'netCash',
      eyebrow: tr('Net Cash', 'Trésorerie nette'),
      label: tr('Collected minus finance expenses for the same window.', 'Collecté moins dépenses finance sur la même fenêtre.'),
      value: netCashValue,
      change: Number.isFinite(kpiData?.netCashChange) ? kpiData.netCashChange : 0,
      icon: TrendingUp,
      tone: netCashValue >= 0 ? 'cyan' : 'rose',
      breakdownType: 'net',
    },
  ]), [
    collectedValue,
    expensesValue,
    kpiData?.collectedChange,
    kpiData?.expensesChange,
    kpiData?.netCashChange,
    kpiData?.outstandingChange,
    netCashValue,
    outstandingValue,
  ]);

  if (loading || parentLoading) {
    return (
      <section className="space-y-3 sm:space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">
            {tr('Overview Snapshot', "Vue d'ensemble instantanée")}
          </p>
          <h3 className="mt-2 text-2xl font-bold text-slate-900">
            {tr('Finance totals at a glance', "Totaux finance d'un coup d'œil")}
          </h3>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <StatCardSkeleton key={index} />
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <div className="rounded-[1.75rem] border border-rose-200 bg-rose-50 p-6">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-rose-100 p-3">
            <BarChart3 className="h-6 w-6 text-rose-600" />
          </div>
          <div>
            <h3 className="font-semibold text-rose-900">
              {tr('Error Loading KPI Data', 'Erreur lors du chargement des indicateurs')}
            </h3>
            <p className="mt-1 text-sm text-rose-700">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!kpiData) {
    return null;
  }

  return (
    <section className="space-y-3 sm:space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">
            {tr('Overview Snapshot', "Vue d'ensemble instantanée")}
          </p>
          <h3 className="mt-2 text-2xl font-bold text-slate-900">
            {tr('Finance totals at a glance', "Totaux finance d'un coup d'œil")}
          </h3>
        </div>
        <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-700 shadow-sm">
          {periodLabel || tr('Selected period', 'Période sélectionnée')}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          const tones = toneMap[card.tone] || toneMap.violet;
          const trendPositive = card.change >= 0;
          const isClickable = typeof onOpenBreakdown === 'function' && Boolean(card.breakdownType);

          return (
            <button
              key={card.key}
              type="button"
              onClick={() => {
                if (isClickable) {
                  onOpenBreakdown(card.breakdownType);
                }
              }}
              className={`
                group min-h-[168px] rounded-xl border border-violet-100 bg-white p-4 text-left shadow-[0_18px_45px_rgba(76,29,149,0.08)] transition-all
                ${isClickable
                  ? 'cursor-pointer hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-[0_20px_50px_rgba(76,29,149,0.12)] focus:outline-none focus:ring-2 focus:ring-violet-200'
                  : 'cursor-default'
                }
              `}
              aria-label={isClickable ? `${card.eyebrow} ${tr('details', 'détails')}` : card.eyebrow}
            >
              <div className="flex items-start justify-between gap-3">
                <div className={`rounded-xl p-2.5 ${tones.iconTone}`}>
                  <Icon className={`h-5 w-5 ${tones.iconText}`} />
                </div>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${trendPositive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                  {trendPositive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  {Math.abs(card.change)}%
                </span>
              </div>

              <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                {card.eyebrow}
              </p>
              <p className={`mt-1.5 text-2xl font-bold sm:text-3xl ${tones.valueTone}`}>
                {formatCompact(card.value)} MAD
              </p>
              <p className="mt-4 text-sm leading-6 text-slate-600">
                {card.label}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default KPICardsV2;
