import React, { useEffect, useMemo, useState } from 'react';
import { Search, Receipt, Wrench, Fuel, Package, Car, AlertCircle, ExternalLink, ArrowUpRight, ArrowDownRight, Filter } from 'lucide-react';
import { financeApiV2 } from '../../services/financeApiV2';
import i18n from '../../i18n';

const sourceIcons = {
  rental: Receipt,
  tour: Receipt,
  maintenance: Wrench,
  damage_recovery: Receipt,
  inventory: Package,
  parts_consumed: Package,
  tank_in: Fuel,
  direct_fill: Fuel,
  transfer: Fuel,
  sold: Car,
  disposed: AlertCircle,
  purchase: Car,
  tax: Receipt,
  fuel: Fuel
};

const FinanceLedgerTabV2 = ({ filters, refreshTrigger }) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ledger, setLedger] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');

  useEffect(() => {
    const loadLedger = async () => {
      try {
        setLoading(true);
        setError('');
        const data = await financeApiV2.getUnifiedLedger(filters);
        setLedger(data);
      } catch (err) {
        console.error('Failed to load finance ledger:', err);
        setError(err.message || tr('Failed to load finance ledger', 'Impossible de charger le journal finance'));
      } finally {
        setLoading(false);
      }
    };

    loadLedger();
  }, [filters, refreshTrigger]);

  const sourceOptions = useMemo(() => [
    { key: 'all', label: tr('All Sources', 'Toutes les sources') },
    { key: 'rental', label: tr('Rentals', 'Locations') },
    { key: 'tour', label: tr('Tours', 'Tours') },
    { key: 'maintenance', label: tr('Maintenance', 'Maintenance') },
    { key: 'parts_consumed', label: tr('Parts Consumed', 'Pièces consommées') },
    { key: 'fuel', label: tr('Fuel', 'Carburant') },
    { key: 'purchase', label: tr('Purchases', 'Achats') },
    { key: 'sold', label: tr('Sales', 'Ventes') },
    { key: 'tax', label: tr('Taxes', 'Taxes') }
  ], [isFrench]);

  const filteredRows = useMemo(() => {
    const rows = ledger?.rows || [];
    return rows
      .filter((row) => {
        const matchesSource = sourceFilter === 'all'
          || row.sourceType === sourceFilter
          || (sourceFilter === 'parts_consumed' && row.sourceType === 'maintenance' && Number(row.meta?.partsConsumedCost || 0) > 0);
        const haystack = `${row.title || ''} ${row.subtitle || ''} ${row.date || ''} ${row.sourceType || ''}`.toLowerCase();
        const matchesSearch = !searchTerm || haystack.includes(searchTerm.toLowerCase());
        return matchesSource && matchesSearch;
      })
      .map((row) => {
        if (sourceFilter !== 'parts_consumed') return row;
        const partsAmount = Number(row.meta?.partsConsumedCost || 0);
        return {
          ...row,
          title: row.title?.startsWith('Parts consumed') ? row.title : `Parts consumed • ${row.title || 'Maintenance'}`,
          amount: partsAmount,
          sourceType: 'parts_consumed'
        };
      });
  }, [ledger, sourceFilter, searchTerm]);

  const visibleTotals = useMemo(() => {
    const incoming = filteredRows.filter((row) => row.direction === 'incoming').reduce((sum, row) => sum + row.amount, 0);
    const outgoing = filteredRows.filter((row) => row.direction === 'outgoing').reduce((sum, row) => sum + row.amount, 0);
    const taxes = filteredRows.filter((row) => row.direction === 'tax').reduce((sum, row) => sum + row.amount, 0);
    return {
      incoming,
      outgoing,
      taxes,
      net: incoming - outgoing - taxes
    };
  }, [filteredRows]);

  const handleOpenSource = (row) => {
    if (!row?.href) return;
    window.location.href = row.href;
  };

  if (loading) {
    return (
      <div className="rounded-[2rem] border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
        <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
          <div className="text-5xl leading-none animate-pulse">⏳</div>
          <h3 className="text-xl font-semibold text-slate-900">{tr('Loading finance ledger...', 'Chargement du journal finance...')}</h3>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[1.75rem] border border-rose-200 bg-rose-50 p-6 text-rose-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[2rem] border border-violet-100/80 bg-white p-5 shadow-[0_20px_55px_rgba(76,29,149,0.08)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">{tr('Unified Finance Ledger', 'Journal finance unifié')}</p>
            <h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{tr('One master finance timeline', 'Une timeline finance maître')}</h3>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              {tr('Track every finance row from rentals, tours, maintenance, fuel, inventory, purchases, sales, and taxes in one timeline.', 'Suivez chaque ligne finance issue des locations, tours, maintenance, carburant, inventaire, achats, ventes et taxes dans une seule timeline.')}
            </p>
          </div>

          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Rows Visible', 'Lignes visibles')}</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{filteredRows.length}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-[1.5rem] border border-emerald-100 bg-emerald-50/80 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">{tr('Incoming', 'Entrées')}</p>
          <p className="mt-2 text-2xl font-bold text-emerald-700">{financeApiV2.formatCompactDisplay(visibleTotals.incoming)} MAD</p>
        </div>
        <div className="rounded-[1.5rem] border border-rose-100 bg-rose-50/80 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-700">{tr('Outgoing', 'Sorties')}</p>
          <p className="mt-2 text-2xl font-bold text-rose-700">{financeApiV2.formatCompactDisplay(visibleTotals.outgoing)} MAD</p>
        </div>
        <div className="rounded-[1.5rem] border border-amber-100 bg-amber-50/80 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">{tr('Taxes', 'Taxes')}</p>
          <p className="mt-2 text-2xl font-bold text-amber-700">{financeApiV2.formatCompactDisplay(visibleTotals.taxes)} MAD</p>
        </div>
        <div className="rounded-[1.5rem] border border-violet-100 bg-gradient-to-r from-violet-50 via-white to-indigo-50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-600">{tr('Net', 'Net')}</p>
          <p className={`mt-2 text-2xl font-bold ${visibleTotals.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
            {visibleTotals.net >= 0 ? '+' : ''}{financeApiV2.formatCompactDisplay(visibleTotals.net)} MAD
          </p>
        </div>
      </div>

      <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={tr('Search title, subtitle, date, or source...', 'Rechercher titre, sous-titre, date ou source...')}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-900 outline-none transition focus:border-violet-300 focus:bg-white"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">
              <Filter className="h-4 w-4" />
              {tr('Source', 'Source')}
            </div>
            {sourceOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setSourceFilter(option.key)}
                className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                  sourceFilter === option.key
                    ? 'bg-gradient-to-r from-violet-600 to-indigo-700 text-white shadow-[0_12px_26px_rgba(79,70,229,0.22)]'
                    : 'border border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:text-violet-700'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="space-y-3">
          {filteredRows.length === 0 ? (
            <div className="rounded-[1.25rem] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              {tr('No ledger rows found for the current filters.', 'Aucune ligne de journal trouvée pour les filtres actuels.')}
            </div>
          ) : (
            filteredRows.map((row) => {
              const Icon = sourceIcons[row.sourceType] || Receipt;
              const positive = row.direction === 'incoming';
              return (
                <div key={row.id} className="rounded-[1.25rem] border border-slate-200 bg-white px-4 py-4 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className={`mt-0.5 rounded-2xl p-2 ${positive ? 'bg-emerald-100 text-emerald-700' : row.direction === 'tax' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
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
                          {row.meta?.status && (
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500">
                              {row.meta.status}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className={`inline-flex items-center gap-1 text-lg font-bold ${positive ? 'text-emerald-700' : row.direction === 'tax' ? 'text-amber-700' : 'text-rose-700'}`}>
                        {positive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                        <span>{positive ? '+' : '-'}{financeApiV2.formatCompactDisplay(row.amount)} MAD</span>
                      </div>
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
    </div>
  );
};

export default FinanceLedgerTabV2;
