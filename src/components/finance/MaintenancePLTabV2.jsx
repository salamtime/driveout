import React, { useEffect, useState } from 'react';
import { ExternalLink, Package, ReceiptText, TrendingUp, Wrench } from 'lucide-react';
import { financeApiV2 } from '../../services/financeApiV2';

const MaintenancePLTabV2 = ({ filters, refreshTrigger }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      try {
        setLoading(true);
        const result = await financeApiV2.getMaintenancePLData(filters);
        if (mounted) setData(result);
      } catch (error) {
        console.error('❌ Maintenance P&L tab failed:', error);
        if (mounted) setData(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadData();

    return () => {
      mounted = false;
    };
  }, [filters, refreshTrigger]);

  const formatCurrency = (amount) =>
    new Intl.NumberFormat('en-US', { maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(Number(amount || 0));

  if (loading) {
    return (
      <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 rounded bg-slate-100" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            {[1, 2, 3, 4].map((item) => <div key={item} className="h-28 rounded-[1.25rem] bg-slate-100" />)}
          </div>
          <div className="h-52 rounded-[1.5rem] bg-slate-100" />
        </div>
      </div>
    );
  }

  const netPositive = (data?.netRecovery || 0) >= 0;

  return (
    <div className="space-y-4">
      <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Maintenance P&L</p>
            <h3 className="mt-1 text-xl font-bold tracking-tight text-slate-900">Maintenance + parts recovery</h3>
            <p className="mt-1 text-sm text-slate-500">Parts consumed are shown inside maintenance so costs are not double-counted.</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
            <Wrench className="h-4 w-4" />
            {filters.startDate} → {filters.endDate}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="rounded-[1.5rem] border border-emerald-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Billed Recovery</p>
          <p className="mt-3 text-3xl font-bold text-emerald-700">{formatCurrency(data?.billedRecovery)} MAD</p>
        </div>
        <div className="rounded-[1.5rem] border border-rose-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Maintenance Cost</p>
          <p className="mt-3 text-3xl font-bold text-rose-700">{formatCurrency(data?.maintenanceCost)} MAD</p>
        </div>
        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Parts Consumed</p>
          <p className="mt-3 text-3xl font-bold text-slate-900">{formatCurrency(data?.partsConsumedCost)} MAD</p>
          <p className="mt-1 text-xs text-slate-500">Included in maintenance cost</p>
        </div>
        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Net Recovery</p>
          <p className={`mt-3 text-3xl font-bold ${netPositive ? 'text-emerald-700' : 'text-rose-700'}`}>
            {netPositive ? '+' : ''}{formatCurrency(data?.netRecovery)} MAD
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Recovery Health</p>
              <h4 className="mt-1 text-lg font-bold text-slate-900">Linked vs unrecovered</h4>
            </div>
            <ReceiptText className="h-5 w-5 text-slate-400" />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Linked Rentals</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{data?.linkedCount || 0}</p>
            </div>
            <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Unrecovered</p>
              <p className="mt-2 text-2xl font-bold text-rose-700">{data?.unrecoveredCount || 0}</p>
            </div>
            <div className="col-span-2 rounded-[1.25rem] border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Labor / External</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{formatCurrency(data?.laborExternalCost)} MAD</p>
              <p className="mt-1 text-xs text-slate-500">Maintenance cost minus parts consumed</p>
            </div>
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Top Vehicles</p>
              <h4 className="mt-1 text-lg font-bold text-slate-900">Highest maintenance cost</h4>
            </div>
            <Package className="h-5 w-5 text-slate-400" />
          </div>

          <div className="mt-4 divide-y divide-slate-100">
            {(data?.topVehicles || []).length > 0 ? data.topVehicles.map((vehicle) => (
              <div key={vehicle.vehicleId} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{vehicle.vehicleDisplay}</p>
                  <p className="truncate text-xs text-slate-500">{vehicle.count} jobs • {formatCurrency(vehicle.partsConsumedCost)} MAD parts</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-rose-700">{formatCurrency(vehicle.maintenanceCost)} MAD</p>
                  <p className={`text-xs font-semibold ${vehicle.netRecovery >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {vehicle.netRecovery >= 0 ? '+' : ''}{formatCurrency(vehicle.netRecovery)} MAD net
                  </p>
                </div>
              </div>
            )) : (
              <div className="rounded-[1.25rem] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                No maintenance rows in this period.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Recent Maintenance</p>
            <h4 className="mt-1 text-lg font-bold text-slate-900">Parts and recovery rows</h4>
          </div>
        </div>

        <div className="mt-4 divide-y divide-slate-100">
          {(data?.rows || []).slice(0, 20).map((row) => (
            <div key={row.id} className="flex flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">{row.title}</p>
                <p className="mt-1 truncate text-xs text-slate-500">{row.vehicleDisplay} • {row.status || 'maintenance'}</p>
              </div>
              <div className="grid grid-cols-4 gap-3 text-right text-sm md:min-w-[460px]">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Recovery</p>
                  <p className="font-bold text-emerald-700">{formatCurrency(row.billedRecovery)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Cost</p>
                  <p className="font-bold text-rose-700">{formatCurrency(row.maintenanceCost)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Parts</p>
                  <p className="font-bold text-slate-700">{formatCurrency(row.partsConsumedCost)}</p>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => { window.location.href = row.href; }}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-violet-200 hover:text-violet-700"
                  >
                    Open
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {(data?.rows || []).length === 0 && (
            <div className="rounded-[1.25rem] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              No maintenance rows found for this period.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MaintenancePLTabV2;
