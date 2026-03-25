import React from 'react';
import { DollarSign, Info } from 'lucide-react';

const PricingSettings = () => {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-blue-100 p-3">
          <DollarSign className="h-5 w-5 text-blue-700" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Pricing Management</h3>
          <p className="mt-1 text-sm text-slate-500">
            Pricing is no longer edited inside admin settings. Use the dedicated Pricing Management workspace in the sidebar.
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-5">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 text-blue-700" />
          <div className="space-y-3 text-sm text-blue-900">
            <p className="font-semibold">Single pricing workspace</p>
            <p>
              Keep all operational pricing in one place:
              {' '}
              Base Prices, Pricing Tiers, Extension Rules, Transport Fees, Kilometer Pricing, Damage Deposits, Fuel Pricing,
              and Tours &amp; Booking pricing.
            </p>
            <p>
              Tour pricing now supports per-package, per-model, and per-duration prices such as 1h, 1.5h, 2h, and 2.5h in the
              Pricing Management area.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PricingSettings;
