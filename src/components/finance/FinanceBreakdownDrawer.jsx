import React, { useEffect, useState } from 'react';
import { X, ExternalLink, Calendar, Receipt, Wrench, Fuel, Package, Car, AlertCircle } from 'lucide-react';
import { financeApiV2 } from '../../services/financeApiV2';
import i18n from '../../i18n';

const isFrenchLocale = () => i18n.resolvedLanguage === 'fr';
const tr = (en, fr) => (isFrenchLocale() ? fr : en);

const OUTGOING_SECTION_CONFIG = [
  {
    key: 'manual_expenses',
    title: () => tr('Manual expenses', 'Dépenses manuelles'),
    sourceTypes: ['expense', 'manual_expense', 'finance_expense', 'expense_manual']
  },
  {
    key: 'fuel_costs',
    title: () => tr('Fuel costs', 'Coûts carburant'),
    sourceTypes: ['fuel', 'tank_in', 'direct_fill', 'transfer']
  },
  {
    key: 'maintenance_costs',
    title: () => tr('Maintenance costs', 'Coûts maintenance'),
    sourceTypes: ['maintenance']
  },
  {
    key: 'inventory_costs',
    title: () => tr('Inventory costs', 'Coûts inventaire'),
    sourceTypes: ['inventory', 'parts_consumed']
  },
  {
    key: 'other_costs',
    title: () => tr('Other outgoing', 'Autres sorties'),
    sourceTypes: []
  }
];

const sourceIcons = {
  maintenance: Wrench,
  damage_recovery: Receipt,
  inventory: Package,
  parts_consumed: Package,
  parts_margin: Package,
  fuel: Fuel,
  tank_in: Fuel,
  direct_fill: Fuel,
  transfer: Fuel,
  sold: Car,
  disposed: AlertCircle,
  purchase: Car
};

const getOutgoingSectionKey = (row) => {
  const sourceType = String(row?.sourceType || '');
  const matched = OUTGOING_SECTION_CONFIG.find((section) => section.sourceTypes.includes(sourceType));
  return matched?.key || 'other_costs';
};

const buildOutgoingSections = (rows = []) => {
  const groups = OUTGOING_SECTION_CONFIG.map((section) => ({ ...section, rows: [] }));

  rows.forEach((row) => {
    const key = getOutgoingSectionKey(row);
    const target = groups.find((section) => section.key === key);
    if (target) target.rows.push(row);
  });

  return groups
    .map((section) => ({
      ...section,
      total: section.rows.reduce((sum, row) => sum + (Number(row?.amount) || 0), 0)
    }))
    .filter((section) => section.rows.length > 0);
};

const FinanceBreakdownDrawer = ({ isOpen, onClose, breakdownType, filters, onOpenSource }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!isOpen || !breakdownType) return;

    const loadBreakdown = async () => {
      try {
        setLoading(true);
        setError('');
        const result = await financeApiV2.getCostBreakdown(breakdownType, filters);
        setData(result);
      } catch (err) {
        console.error('Failed to load finance breakdown:', err);
        setError(err.message || tr('Failed to load breakdown', 'Impossible de charger le détail'));
      } finally {
        setLoading(false);
      }
    };

    loadBreakdown();
  }, [isOpen, breakdownType, filters]);

  if (!isOpen) return null;

  const shouldGroupOutgoing = ['outgoing', 'expenses'].includes(String(breakdownType || ''));
  const outgoingSections = shouldGroupOutgoing ? buildOutgoingSections(data?.rows || []) : [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="h-full w-full max-w-2xl overflow-y-auto border-l border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-6 py-5 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                {tr('Finance Breakdown', 'Détail finance')}
              </p>
              <h2 className="mt-2 truncate text-xl font-semibold text-slate-900">{data?.title || tr('Finance Breakdown', 'Détail finance')}</h2>
              <p className="mt-1 text-sm text-slate-500">{data?.period || `${filters.startDate} – ${filters.endDate}`}</p>
            </div>

            <div className="flex shrink-0 items-start gap-3">
              {data && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Total', 'Total')}</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">
                    {financeApiV2.formatCompactDisplay(data.total)} MAD
                  </p>
                </div>
              )}
              <button onClick={onClose} className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {loading && (
            <div className="rounded-[1.75rem] border border-slate-200 bg-white px-6 py-14 text-center shadow-sm">
              <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                <div className="text-5xl leading-none animate-pulse">⏳</div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {tr('Loading finance breakdown...', 'Chargement du détail finance...')}
                </h3>
              </div>
            </div>
          )}

          {!loading && error && (
            <div className="rounded-[1.5rem] border border-rose-200 bg-rose-50 p-4 text-rose-700">
              {error}
            </div>
          )}

          {!loading && !error && data && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-sm font-semibold text-slate-700">
                  {data.rows.length} {tr(data.rows.length === 1 ? 'entry' : 'entries', data.rows.length === 1 ? 'ligne' : 'lignes')}
                </p>
                <p className="text-sm text-slate-500">{data.period}</p>
              </div>

              {data.rows.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-slate-500">
                  {tr('No items found for this period.', 'Aucun élément trouvé pour cette période.')}
                </div>
              ) : (
                <div className="space-y-5">
                  {(shouldGroupOutgoing ? outgoingSections : [{ key: 'all', title: null, total: data.total, rows: data.rows }]).map((section) => (
                    <div key={section.key} className="space-y-3">
                      {section.title ? (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                              {tr('Section', 'Section')}
                            </p>
                            <h3 className="mt-1 text-base font-semibold text-slate-900">{section.title()}</h3>
                          </div>
                          <div className="text-right">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Total', 'Total')}</p>
                            <p className="mt-1 text-base font-bold text-slate-900">
                              {financeApiV2.formatCompactDisplay(section.total)} MAD
                            </p>
                          </div>
                        </div>
                      ) : null}

                      {section.rows.map((row) => {
                        const Icon = sourceIcons[row.sourceType] || Receipt;
                        const incoming = row.direction === 'incoming' || ['damage_recovery', 'parts_margin', 'sold'].includes(row.sourceType);
                        return (
                          <div key={row.id} className="rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex items-start gap-3 min-w-0">
                                <div className="mt-0.5 rounded-2xl bg-slate-50 p-2 text-slate-600">
                                  <Icon className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                  <p className="break-words font-semibold text-slate-900">{row.title}</p>
                                  {row.subtitle && (
                                    <p className="mt-1 break-words text-sm text-slate-500">{row.subtitle}</p>
                                  )}
                                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                                    {row.date && (
                                      <span className="inline-flex items-center gap-1">
                                        <Calendar className="h-3.5 w-3.5" />
                                        {row.date}
                                      </span>
                                    )}
                                    {row.status && (
                                      <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">
                                        {row.status}
                                      </span>
                                    )}
                                    {row.meta?.liters > 0 && (
                                      <span>{row.meta.liters}L</span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="text-right shrink-0">
                                <p className={`text-lg font-bold ${incoming ? 'text-emerald-700' : 'text-rose-700'}`}>
                                  {financeApiV2.formatCompactDisplay(row.amount)} MAD
                                </p>
                                {row.href && (
                                  <button
                                    onClick={() => onOpenSource?.(row)}
                                    className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-slate-700 hover:text-emerald-700"
                                  >
                                    {tr('Open', 'Ouvrir')}
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>

                            {row.meta && Object.keys(row.meta).length > 0 && (
                              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                {Object.entries(row.meta)
                                  .filter(([, value]) => value !== null && value !== undefined && value !== '' && value !== 0)
                                  .slice(0, 4)
                                  .map(([key, value]) => (
                                    <div key={key} className="rounded-xl bg-slate-50 px-3 py-2">
                                      <p className="text-[11px] uppercase tracking-wide text-slate-500">
                                        {key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}
                                      </p>
                                      <p className="break-words text-sm font-medium text-slate-900">{String(value)}</p>
                                    </div>
                                  ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default FinanceBreakdownDrawer;
