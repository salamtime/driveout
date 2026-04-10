import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, BarChart3 } from 'lucide-react';
import { financeApiV2 } from '../../services/financeApiV2';
import i18n from '../../i18n';

const KPICardsV2 = ({ filters, refreshTrigger, onOpenBreakdown, prefetchedKpiData = null, parentLoading = false }) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
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
    loadKPIData();
  }, [filters, refreshTrigger, prefetchedKpiData]);

  const loadKPIData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('📊 ENHANCED KPI CARDS: Loading with modern styling...');
      const data = await financeApiV2.getKPIData(filters);
      
      console.log('✅ Enhanced KPI data loaded:', {
        totalRevenue: data.totalRevenue,
        totalExpenses: data.totalExpenses,
        maintenanceCosts: data.maintenanceCosts,
        fuelCosts: data.fuelCosts,
        inventoryCosts: data.inventoryCosts,
        otherCosts: data.otherCosts,
        taxes: data.taxes,
        grossProfit: data.grossProfit,
        currency: data.currency
      });
      
      setKpiData(data);
      
    } catch (err) {
      console.error('❌ Enhanced KPI loading failed:', err);
      setError(err.message || tr('Failed to load KPI data', 'Impossible de charger les indicateurs finance'));
    } finally {
      setLoading(false);
    }
  };

  const formatCompact = (amount) => {
    if (amount >= 1000000) {
      return (amount / 1000000).toFixed(1) + 'M';
    }
    if (amount >= 1000) {
      return (amount / 1000).toFixed(0) + 'K';
    }
    return amount.toString();
  };

  const getTrendIcon = (change) => {
    if (change > 0) {
      return <TrendingUp className="w-4 h-4" />;
    }
    return <TrendingDown className="w-4 h-4" />;
  };

  const primaryCards = kpiData ? [
    {
      key: 'revenue',
      title: tr('Total Revenue', 'Revenus totaux'),
      value: kpiData.totalRevenue,
      helper: tr('Cash and recognized income in this period', 'Encaissements et revenus reconnus sur cette période'),
      change: kpiData.revenueChange,
      icon: DollarSign,
      iconClass: 'bg-emerald-50 text-emerald-700',
      valueClass: 'text-emerald-700',
      shellClass: 'border-slate-200 bg-white'
    },
    {
      key: 'expenses',
      title: tr('Total Expenses', 'Dépenses totales'),
      value: kpiData.totalExpenses,
      helper: tr('Operating costs recorded in this period', 'Coûts opérationnels enregistrés sur cette période'),
      change: kpiData.expensesChange,
      icon: BarChart3,
      iconClass: 'bg-rose-50 text-rose-700',
      valueClass: 'text-rose-700',
      shellClass: 'border-slate-200 bg-white'
    },
    {
      key: 'profit',
      title: tr('Net Profit', 'Profit net'),
      value: kpiData.grossProfit,
      helper: tr('Revenue left after expenses and taxes', 'Revenu restant après dépenses et taxes'),
      change: kpiData.profitChange,
      icon: TrendingUp,
      iconClass: kpiData.grossProfit >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700',
      valueClass: kpiData.grossProfit >= 0 ? 'text-emerald-700' : 'text-rose-700',
      shellClass: 'border-slate-200 bg-white'
    }
  ] : [];

  if (loading || parentLoading) {
    return (
      <div className="rounded-[2rem] border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
        <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
          <div className="text-5xl leading-none animate-pulse">⏳</div>
          <h3 className="text-xl font-semibold text-slate-900">{tr('Loading finance overview cards...', 'Chargement des cartes finance...')}</h3>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[1.75rem] border border-rose-200 bg-rose-50 p-6">
        <div className="flex items-center space-x-3">
          <div className="rounded-2xl bg-rose-100 p-3">
            <BarChart3 className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <h3 className="font-semibold text-red-900">{tr('Error Loading KPI Data', 'Erreur lors du chargement des indicateurs')}</h3>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!kpiData) {
    return null;
  }

  const getBreakdownCardProps = (type) => ({
    role: 'button',
    tabIndex: 0,
    onClick: () => onOpenBreakdown?.(type),
    onKeyDown: (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onOpenBreakdown?.(type);
      }
    }
  });

  const breakdownShortcuts = [
    { key: 'maintenance', label: tr('Maintenance', 'Maintenance') },
    { key: 'fuel', label: tr('Fuel', 'Carburant') },
    { key: 'damage_recovery', label: tr('Damage recovery', 'Récupération dommage') },
    { key: 'other_costs', label: tr('Other costs', 'Autres coûts') }
  ];

  return (
    <div className="space-y-4">
      {/* Primary KPI Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {primaryCards.map((card) => {
          const Icon = card.icon;
          const positiveTrend = card.change >= 0;
          return (
            <div key={card.key} className={`rounded-[1.5rem] border p-5 shadow-sm transition-all hover:shadow-[0_16px_36px_rgba(15,23,42,0.06)] ${card.shellClass}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{card.title}</p>
                  <p className={`mt-3 text-3xl font-bold ${card.valueClass}`}>{formatCompact(card.value)} MAD</p>
                  <p className="mt-2 max-w-[18rem] text-sm text-slate-500">{card.helper}</p>
                </div>
                <div className={`rounded-2xl p-3 ${card.iconClass}`}>
                  <Icon className="h-6 w-6" />
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${positiveTrend ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                  {getTrendIcon(card.change)}
                  {Math.abs(card.change)}%
                </div>
                <span className="text-xs font-medium text-slate-500">
                  {tr('vs last period', 'vs période précédente')}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-[1.25rem] border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Quick drilldowns', 'Détails rapides')}</p>
            <p className="mt-1 text-sm text-slate-500">{tr('Open the same breakdown drawers without crowding the overview.', 'Ouvrez les mêmes tiroirs de détail sans surcharger l’aperçu.')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {breakdownShortcuts.map((shortcut) => (
              <button
                key={shortcut.key}
                type="button"
                {...getBreakdownCardProps(shortcut.key)}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200"
              >
                {shortcut.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default KPICardsV2;
