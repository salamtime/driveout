import React, { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ExternalLink, Fuel, Gauge, ReceiptText, Route, TrendingDown } from 'lucide-react';
import { financeApiV2 } from '../../services/financeApiV2';

const FuelPLTabV2 = ({ filters, refreshTrigger }) => {
  const [fuelData, setFuelData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadFuelData = async () => {
      try {
        setLoading(true);
        const result = await financeApiV2.getFuelPLData(filters);
        if (mounted) {
          setFuelData(result);
        }
      } catch (error) {
        console.error('❌ Fuel P&L tab failed:', error);
        if (mounted) {
          setFuelData(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadFuelData();

    return () => {
      mounted = false;
    };
  }, [filters, refreshTrigger]);

  const formatCurrency = (amount) =>
    new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 0,
      minimumFractionDigits: 0
    }).format(Number(amount || 0));

  const formatLiters = (amount) =>
    `${new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0
    }).format(Number(amount || 0))}L`;

  const netPositive = (fuelData?.netFuelImpact || 0) >= 0;
  const sourceMax = Math.max(1, ...(fuelData?.sources || []).map((source) => Math.max(source.fuelOut, source.fuelIn)));

  if (loading) {
    return (
      <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-56 rounded bg-slate-100" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-28 rounded-[1.25rem] bg-slate-100" />
            ))}
          </div>
          <div className="h-52 rounded-[1.5rem] bg-slate-100" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Fuel P&L</p>
            <h3 className="mt-1 text-xl font-bold tracking-tight text-slate-900">Where fuel is going</h3>
            <p className="mt-1 text-sm text-slate-500">Rental and tour fuel impact from the same P&L sources used across Finance.</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
            <Fuel className="h-4 w-4" />
            {filters.startDate} → {filters.endDate}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-[1.5rem] border border-emerald-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Fuel In</p>
            <ArrowUpRight className="h-5 w-5 text-emerald-600" />
          </div>
          <p className="mt-3 text-3xl font-bold text-emerald-700">{formatCurrency(fuelData?.fuelIn)} MAD</p>
          <p className="mt-1 text-xs text-slate-500">Surplus fuel value returned into the fleet</p>
        </div>

        <div className="rounded-[1.5rem] border border-rose-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Fuel Out</p>
            <ArrowDownRight className="h-5 w-5 text-rose-600" />
          </div>
          <p className="mt-3 text-3xl font-bold text-rose-700">{formatCurrency(fuelData?.fuelOut)} MAD</p>
          <p className="mt-1 text-xs text-slate-500">{formatLiters(fuelData?.consumedLiters)} consumed</p>
        </div>

        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Net Impact</p>
            <TrendingDown className={`h-5 w-5 ${netPositive ? 'text-emerald-600' : 'text-rose-600'}`} />
          </div>
          <p className={`mt-3 text-3xl font-bold ${netPositive ? 'text-emerald-700' : 'text-rose-700'}`}>
            {netPositive ? '+' : ''}{formatCurrency(fuelData?.netFuelImpact)} MAD
          </p>
          <p className="mt-1 text-xs text-slate-500">Fuel in minus fuel out</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Source Split</p>
              <h4 className="mt-1 text-lg font-bold text-slate-900">Rentals vs Tours</h4>
            </div>
            <Gauge className="h-5 w-5 text-slate-400" />
          </div>

          <div className="mt-5 space-y-4">
            {(fuelData?.sources || []).map((source) => {
              const outWidth = `${Math.max(4, (source.fuelOut / sourceMax) * 100)}%`;
              const inWidth = `${source.fuelIn > 0 ? Math.max(4, (source.fuelIn / sourceMax) * 100) : 0}%`;
              const Icon = source.key === 'tours' ? Route : ReceiptText;

              return (
                <div key={source.key} className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl bg-white p-2 text-slate-600 shadow-sm">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{source.label}</p>
                        <p className="text-xs text-slate-500">{source.count} fuel-linked rows • {formatLiters(source.consumedLiters)} consumed</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-rose-700">{formatCurrency(source.fuelOut)} MAD out</p>
                      {source.fuelIn > 0 && <p className="text-xs font-semibold text-emerald-700">{formatCurrency(source.fuelIn)} MAD in</p>}
                    </div>
                  </div>
                  <div className="mt-4 space-y-1.5">
                    <div className="h-2 overflow-hidden rounded-full bg-rose-100">
                      <div className="h-full rounded-full bg-rose-500" style={{ width: outWidth }} />
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-emerald-100">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: inWidth }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Top Vehicles</p>
              <h4 className="mt-1 text-lg font-bold text-slate-900">Highest fuel cost</h4>
            </div>
            <Fuel className="h-5 w-5 text-slate-400" />
          </div>

          <div className="mt-4 divide-y divide-slate-100">
            {(fuelData?.topVehicles || []).length > 0 ? fuelData.topVehicles.map((vehicle) => (
              <div key={vehicle.vehicleId} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{vehicle.plateNumber}</p>
                  <p className="truncate text-xs text-slate-500">{vehicle.vehicleModel} • {formatLiters(vehicle.consumedLiters)} consumed</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-rose-700">{formatCurrency(vehicle.fuelOut)} MAD</p>
                  {vehicle.fuelIn > 0 && <p className="text-xs font-semibold text-emerald-700">+{formatCurrency(vehicle.fuelIn)} MAD in</p>}
                </div>
              </div>
            )) : (
              <div className="rounded-[1.25rem] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                No fuel-linked vehicle rows in this period.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Recent Fuel Impact</p>
            <h4 className="mt-1 text-lg font-bold text-slate-900">Fuel-linked bookings</h4>
          </div>
        </div>

        <div className="mt-4 divide-y divide-slate-100">
          {(fuelData?.rows || []).slice(0, 20).map((row) => (
            <div key={row.id} className="flex flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${row.type === 'tour' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                    {row.type === 'tour' ? 'Tour' : 'Rental'}
                  </span>
                  {row.href ? (
                    <button
                      type="button"
                      onClick={() => window.location.href = row.href}
                      className="inline-flex items-center gap-1 text-sm font-bold text-violet-700 hover:text-violet-900"
                    >
                      {row.label}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <span className="text-sm font-bold text-slate-900">{row.label}</span>
                  )}
                </div>
                <p className="mt-1 truncate text-xs text-slate-500">{row.vehicleDisplay} • {row.vehicleModel}</p>
              </div>
              <div className="grid grid-cols-3 gap-3 text-right text-sm md:min-w-[320px]">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">In</p>
                  <p className="font-bold text-emerald-700">{formatCurrency(row.fuelIn)} MAD</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Out</p>
                  <p className="font-bold text-rose-700">{formatCurrency(row.fuelOut)} MAD</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Liters</p>
                  <p className="font-bold text-slate-700">{formatLiters(row.consumedLiters || row.surplusLiters)}</p>
                </div>
              </div>
            </div>
          ))}

          {(fuelData?.rows || []).length === 0 && (
            <div className="rounded-[1.25rem] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              No rental or tour fuel impact found for this period.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FuelPLTabV2;
