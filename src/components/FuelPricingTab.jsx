import React, { useMemo, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Save, Loader, AlertCircle, CheckCircle, Fuel, Search, Droplets } from 'lucide-react';

const FuelPricingTab = ({ vehicleModels, onRefresh }) => {
  const [fuelPricing, setFuelPricing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null); // track which row is saving
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');

  // Local edits per model: { [modelId]: { hourly: '', daily: '' } }
  const [edits, setEdits] = useState({});

  const fetchFuelPricing = async () => {
    try {
      const { data, error } = await supabase
        .from('fuel_pricing')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFuelPricing(data || []);

      // Initialise local edit state from DB values
      const initial = {};
      (data || []).forEach(fp => {
        initial[fp.model_id] = {
          hourly: fp.hourly_price_per_line ?? fp.price_per_line ?? 0,
          daily:  fp.daily_price_per_line  ?? fp.price_per_line ?? 0,
        };
      });
      setEdits(initial);
    } catch (err) {
      console.error('Error fetching fuel pricing:', err);
      setError('Failed to load fuel pricing');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFuelPricing();
  }, []);

  const handleChange = (modelId, type, value) => {
    setEdits(prev => ({
      ...prev,
      [modelId]: {
        ...prev[modelId],
        [type]: value,
      },
    }));
  };

  const handleSave = async (modelId) => {
    setSavingId(modelId);
    setError(null);
    setSuccess(null);

    const hourly = parseFloat(edits[modelId]?.hourly) || 0;
    const daily  = parseFloat(edits[modelId]?.daily)  || 0;

    try {
      const { error } = await supabase
        .from('fuel_pricing')
        .upsert(
          {
            model_id: modelId,
            // Keep legacy column in sync with daily for backwards compat
            price_per_line:         daily,
            hourly_price_per_line:  hourly,
            daily_price_per_line:   daily,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'model_id' }
        );

      if (error) throw error;

      setSuccess('✅ Fuel pricing saved!');
      setTimeout(() => setSuccess(null), 3000);
      fetchFuelPricing();
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Error saving fuel pricing:', err);
      setError(`Failed to save: ${err.message}`);
    } finally {
      setSavingId(null);
    }
  };

  const handleReset = async (modelId) => {
    setSavingId(modelId);
    try {
      const { error } = await supabase
        .from('fuel_pricing')
        .upsert(
          {
            model_id: modelId,
            price_per_line:        0,
            hourly_price_per_line: 0,
            daily_price_per_line:  0,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'model_id' }
        );

      if (error) throw error;

      setEdits(prev => ({ ...prev, [modelId]: { hourly: 0, daily: 0 } }));
      setSuccess('✅ Reset to 0');
      setTimeout(() => setSuccess(null), 2000);
      fetchFuelPricing();
      if (onRefresh) onRefresh();
    } catch (err) {
      setError(`Failed to reset: ${err.message}`);
    } finally {
      setSavingId(null);
    }
  };

  const visibleModels = useMemo(() => {
    return vehicleModels.filter((model) => {
      const matchesSearch = searchTerm === '' ||
        model.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        model.model?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesVehicle = selectedVehicleId === '' || model.id === selectedVehicleId;
      const modelPricing = fuelPricing.find((fp) => fp.model_id === model.id);
      const isConfigured = !!modelPricing;
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'configured' && isConfigured)
        || (statusFilter === 'not-configured' && !isConfigured);

      return matchesSearch && matchesVehicle && matchesStatus;
    });
  }, [fuelPricing, searchTerm, selectedVehicleId, statusFilter, vehicleModels]);

  const configuredCount = fuelPricing.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader className="w-6 h-6 animate-spin text-orange-500" />
        <span className="ml-2 text-gray-600">Loading fuel pricing...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Success / Error */}
      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
          <p className="text-green-800 font-medium">{success}</p>
        </div>
      )}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-800 font-medium">{error}</p>
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 p-6">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search by vehicle model..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-xl border border-gray-300 py-2.5 pl-10 pr-4 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              />
            </div>

            <select
              value={selectedVehicleId}
              onChange={(e) => setSelectedVehicleId(e.target.value)}
              className="rounded-xl border border-gray-300 px-4 py-2.5 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
            >
              <option value="">All Vehicle Models</option>
              {vehicleModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-gray-300 px-4 py-2.5 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
            >
              <option value="all">All Status</option>
              <option value="configured">Configured</option>
              <option value="not-configured">Not Configured</option>
            </select>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-orange-100 bg-orange-50 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-600">Configured models</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{configuredCount}</p>
              <p className="mt-1 text-sm text-slate-500">Vehicle models already have fuel rules saved.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Fuel included</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {visibleModels.filter((model) => {
                  const editsForModel = edits[model.id] || { hourly: 0, daily: 0 };
                  return (parseFloat(editsForModel.hourly) || 0) === 0 && (parseFloat(editsForModel.daily) || 0) === 0;
                }).length}
              </p>
              <p className="mt-1 text-sm text-slate-500">Models that currently treat fuel as included.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">How to use</p>
              <p className="mt-2 text-sm text-slate-600">
                Set the amount charged per missing fuel line for hourly and daily rentals. Keep it at zero when fuel is included.
              </p>
            </div>
          </div>
        </div>

        <div className="p-6">
          {visibleModels.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
              <p className="text-sm font-semibold text-slate-900">No fuel pricing rows found</p>
              <p className="mt-1 text-sm text-slate-500">Adjust the filters or add vehicle models first.</p>
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {visibleModels.map((model) => {
                const modelPricing = fuelPricing.find((fp) => fp.model_id === model.id);
                const isConfigured = !!modelPricing;
                const isSaving = savingId === model.id;
                const modelEdits = edits[model.id] || { hourly: 0, daily: 0 };
                const hourlyVal = parseFloat(modelEdits.hourly) || 0;
                const dailyVal = parseFloat(modelEdits.daily) || 0;

                return (
                  <div key={model.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-slate-900">{model.name}</h3>
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                            isConfigured
                              ? 'border-green-200 bg-green-50 text-green-700'
                              : 'border-slate-200 bg-white text-slate-600'
                          }`}>
                            {isConfigured ? 'Configured' : 'Draft'}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-slate-500">{model.model || 'Vehicle model'}</p>
                      </div>
                      <div className="rounded-xl border border-orange-100 bg-orange-50 px-3 py-2 text-right">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-600">Current rule</p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {hourlyVal === 0 && dailyVal === 0 ? 'Fuel included' : 'Fuel charge active'}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-2xl border border-blue-100 bg-white p-4">
                          <div className="flex items-center gap-2">
                            <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-400" />
                            <p className="text-sm font-semibold text-slate-900">Hourly price per line</p>
                          </div>
                          <div className="mt-3 flex items-center gap-2">
                            <input
                              type="number"
                              value={modelEdits.hourly}
                              onChange={(e) => handleChange(model.id, 'hourly', e.target.value)}
                              className="w-full rounded-xl border border-blue-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              min="0"
                              step="0.5"
                              placeholder="0.00"
                            />
                            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">MAD</span>
                          </div>
                          <p className="mt-3 text-sm text-slate-500">
                            {hourlyVal === 0
                              ? 'Leave at zero when hourly rentals include fuel.'
                              : `2 missing lines = ${(2 * hourlyVal).toFixed(0)} MAD`}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-emerald-100 bg-white p-4">
                          <div className="flex items-center gap-2">
                            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-400" />
                            <p className="text-sm font-semibold text-slate-900">Daily price per line</p>
                          </div>
                          <div className="mt-3 flex items-center gap-2">
                            <input
                              type="number"
                              value={modelEdits.daily}
                              onChange={(e) => handleChange(model.id, 'daily', e.target.value)}
                              className="w-full rounded-xl border border-emerald-200 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                              min="0"
                              step="0.5"
                              placeholder="0.00"
                            />
                            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">MAD</span>
                          </div>
                          <p className="mt-3 text-sm text-slate-500">
                            {dailyVal === 0
                              ? 'Leave at zero when daily rentals include fuel.'
                              : `3 missing lines = ${(3 * dailyVal).toFixed(0)} MAD`}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Preview</p>
                        <div className="mt-4 space-y-3">
                          <div className="rounded-xl bg-slate-50 px-3 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Hourly example</p>
                            <p className="mt-2 text-base font-bold text-slate-900">
                              {hourlyVal > 0 ? `${(2 * hourlyVal).toFixed(0)} MAD for 2 lines` : 'Fuel included'}
                            </p>
                          </div>
                          <div className="rounded-xl bg-slate-50 px-3 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Daily example</p>
                            <p className="mt-2 text-base font-bold text-slate-900">
                              {dailyVal > 0 ? `${(3 * dailyVal).toFixed(0)} MAD for 3 lines` : 'Fuel included'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
                        <Droplets className="h-3.5 w-3.5 text-orange-500" />
                        Fuel line pricing updates rental totals automatically.
                      </div>

                      <div className="flex items-center gap-3">
                        {isConfigured && (
                          <button
                            onClick={() => handleReset(model.id)}
                            disabled={isSaving}
                            className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                          >
                            Reset
                          </button>
                        )}
                        <button
                          onClick={() => handleSave(model.id)}
                          disabled={isSaving}
                          className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:opacity-50"
                        >
                          {isSaving ? (
                            <>
                              <Loader className="h-4 w-4 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <Save className="h-4 w-4" />
                              Save Fuel Pricing
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Empty state */}
      {vehicleModels.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <Fuel className="w-12 h-12 mx-auto text-gray-300 mb-3" />
          <p className="font-medium text-gray-600">No vehicle models found</p>
          <p className="text-sm text-gray-500 mt-1">Add vehicle models first to configure fuel pricing</p>
        </div>
      )}
    </div>
  );
};

export default FuelPricingTab;
