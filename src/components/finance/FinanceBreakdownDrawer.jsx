import React, { useEffect, useState } from 'react';
import { X, ExternalLink, Calendar, Receipt, Wrench, Fuel, Package, Car, AlertCircle } from 'lucide-react';
import { financeApiV2 } from '../../services/financeApiV2';

const sourceIcons = {
  maintenance: Wrench,
  damage_recovery: Receipt,
  inventory: Package,
  parts_margin: Package,
  tank_in: Fuel,
  direct_fill: Fuel,
  transfer: Fuel,
  sold: Car,
  disposed: AlertCircle,
  purchase: Car
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
        setError(err.message || 'Failed to load breakdown');
      } finally {
        setLoading(false);
      }
    };

    loadBreakdown();
  }, [isOpen, breakdownType, filters]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-end" onClick={onClose}>
      <div
        className="bg-white w-full max-w-2xl h-full overflow-y-auto shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between p-6 border-b border-gray-200 bg-gray-50">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{data?.title || 'Finance Breakdown'}</h2>
            <p className="text-sm text-gray-600 mt-1">{data?.period || `${filters.startDate} – ${filters.endDate}`}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {loading && (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((item) => (
                <div key={item} className="animate-pulse rounded-xl border border-gray-200 p-4">
                  <div className="h-4 w-40 bg-gray-200 rounded mb-3" />
                  <div className="h-3 w-56 bg-gray-100 rounded mb-2" />
                  <div className="h-3 w-24 bg-gray-100 rounded" />
                </div>
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
              {error}
            </div>
          )}

          {!loading && !error && data && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Total</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">
                    {financeApiV2.formatCompactDisplay(data.total)} MAD
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Rows</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">{data.rows.length}</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Period</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">{data.period}</p>
                </div>
              </div>

              {data.rows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-gray-600">
                  No items found for this period.
                </div>
              ) : (
                <div className="space-y-3">
                  {data.rows.map((row) => {
                    const Icon = sourceIcons[row.sourceType] || Receipt;
                    return (
                      <div key={row.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="p-2 rounded-lg bg-blue-50 text-blue-600 mt-0.5">
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-900 break-words">{row.title}</p>
                              {row.subtitle && (
                                <p className="text-sm text-gray-600 mt-1 break-words">{row.subtitle}</p>
                              )}
                              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-500">
                                {row.date && (
                                  <span className="inline-flex items-center gap-1">
                                    <Calendar className="h-3.5 w-3.5" />
                                    {row.date}
                                  </span>
                                )}
                                {row.status && (
                                  <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-600">
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
                            <p className="text-lg font-bold text-gray-900">
                              {financeApiV2.formatCompactDisplay(row.amount)} MAD
                            </p>
                            {row.href && (
                              <button
                                onClick={() => onOpenSource?.(row)}
                                className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
                              >
                                Open
                                <ExternalLink className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {row.meta && Object.keys(row.meta).length > 0 && (
                          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {Object.entries(row.meta)
                              .filter(([, value]) => value !== null && value !== undefined && value !== '' && value !== 0)
                              .slice(0, 4)
                              .map(([key, value]) => (
                                <div key={key} className="rounded-lg bg-gray-50 px-3 py-2">
                                  <p className="text-[11px] uppercase tracking-wide text-gray-500">
                                    {key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}
                                  </p>
                                  <p className="text-sm font-medium text-gray-900 break-words">{String(value)}</p>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
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
