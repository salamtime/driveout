import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Plus, RefreshCw, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { fetchTourPackages } from '../../../services/tourPackageService';
import VehicleModelPricingService from '../../../services/VehicleModelPricingService';
import {
  GLOBAL_TOUR_PRICING_KEY,
  TOUR_PRICING_DEFAULT_DURATIONS,
  buildTourPricingMatrix,
  deleteTourPackageModelPrice,
  deleteTourPackageModelPricesForModel,
  fetchTourPackageModelPrices,
  getTourPriceForModelAndDuration,
  upsertTourPackageModelPrice,
} from '../../../services/tourPackagePricingService';

const formatDurationLabel = (duration) => {
  const numeric = Number(duration || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return '0h';
  return `${numeric % 1 === 0 ? numeric.toFixed(0) : numeric.toFixed(1)}h`;
};

const modelLabel = (model) => {
  const name = String(model?.name || '').trim();
  const modelName = String(model?.model || '').trim();

  if (name && modelName && name.toLowerCase().includes(modelName.toLowerCase())) {
    return name;
  }

  return [name, modelName].filter(Boolean).join(' ').trim() || `Model ${model?.id || ''}`;
};

const createRowDrafts = (rows = [], packageId) => {
  const drafts = {};
  buildTourPricingMatrix(rows.filter((row) => String(row.package_id) === String(packageId))).forEach((row) => {
    drafts[String(row.vehicle_model_id)] = {
      vehicle_model_id: String(row.vehicle_model_id),
      prices: { ...row.prices },
    };
  });
  return drafts;
};

const TourPackagePricingManager = ({
  selectedPackageId: controlledPackageId = '',
  selectedPackage: controlledPackage = null,
  allowedDurations = [],
  embedded = false,
  showPackagePicker = true,
  onPricingRowsChange,
}) => {
  const [packages, setPackages] = useState([]);
  const [vehicleModels, setVehicleModels] = useState([]);
  const [pricingRows, setPricingRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [draftRows, setDraftRows] = useState({});
  const [customDuration, setCustomDuration] = useState('');
  const [extraDurations, setExtraDurations] = useState([]);
  const [savingRowId, setSavingRowId] = useState('');
  const [savingSelection, setSavingSelection] = useState(false);
  const [vehicleModelToAdd, setVehicleModelToAdd] = useState('');
  const touchedPricesRef = React.useRef(new Set());
  const effectivePackageId = String((embedded ? controlledPackageId || selectedPackageId || GLOBAL_TOUR_PRICING_KEY : controlledPackageId || selectedPackageId) || GLOBAL_TOUR_PRICING_KEY);
  const isGlobalDefaults = String(effectivePackageId) === GLOBAL_TOUR_PRICING_KEY;

  const loadData = async () => {
    setLoading(true);
    setError('');

    const [packageResult, modelResult, pricingResult] = await Promise.allSettled([
      showPackagePicker || !controlledPackage
        ? fetchTourPackages()
        : Promise.resolve({ data: controlledPackage ? [controlledPackage] : [], error: null }),
      VehicleModelPricingService.getActiveVehicleModels(),
      fetchTourPackageModelPrices(),
    ]);

    let nextError = '';

    if (packageResult.status === 'fulfilled') {
      const { data: packageData, error: packageError } = packageResult.value || {};
      if (packageError) {
        console.error('Failed to load packages for tour pricing:', packageError);
        nextError = packageError.message || 'Could not load packages.';
        setPackages([]);
      } else {
        const activePackages = Array.isArray(packageData) ? packageData.filter((pkg) => pkg.is_active !== false) : [];
        setPackages(activePackages);
        const firstPackageId = controlledPackageId || selectedPackageId || activePackages[0]?.id || '';
        if (!controlledPackageId && !embedded) {
          setSelectedPackageId(firstPackageId);
        }
      }
    } else {
      console.error('Failed to load packages for tour pricing:', packageResult.reason);
      nextError = packageResult.reason?.message || 'Could not load packages.';
      setPackages([]);
    }

    if (modelResult.status === 'fulfilled') {
      setVehicleModels(Array.isArray(modelResult.value) ? modelResult.value : []);
    } else {
      console.error('Failed to load vehicle models for tour pricing:', modelResult.reason);
      if (!nextError) {
        nextError = modelResult.reason?.message || 'Could not load vehicle models.';
      }
      setVehicleModels([]);
    }

    if (pricingResult.status === 'fulfilled') {
      const nextPricingRows = Array.isArray(pricingResult.value) ? pricingResult.value : [];
      setPricingRows(nextPricingRows);
      onPricingRowsChange?.(nextPricingRows);
    } else {
      console.error('Failed to load tour pricing rows:', pricingResult.reason);
      if (!nextError) {
        nextError = pricingResult.reason?.message || 'Could not load tour pricing.';
      }
      setPricingRows([]);
      onPricingRowsChange?.([]);
    }

    setError(nextError);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [controlledPackageId, showPackagePicker, embedded, onPricingRowsChange]);

  useEffect(() => {
    if (controlledPackageId || embedded) return;
    if (!selectedPackageId && packages[0]?.id) {
      setSelectedPackageId(packages[0].id);
    }
  }, [packages, selectedPackageId, controlledPackageId, embedded]);

  const dynamicDurations = useMemo(() => Array.from(
    new Set(
      pricingRows
        .filter((row) => String(row.package_id) === effectivePackageId)
        .map((row) => Number(row.duration_hours))
        .filter((value) => Number.isFinite(value) && value > 0)
    )
  ).sort((a, b) => a - b), [pricingRows, effectivePackageId]);

  const selectedPackage = useMemo(
    () => controlledPackage || packages.find((pkg) => String(pkg.id) === String(controlledPackageId || selectedPackageId)) || null,
    [controlledPackage, packages, effectivePackageId]
  );

  const durations = useMemo(() => {
    const externalDurations = Array.isArray(allowedDurations)
      ? allowedDurations
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value) && value > 0)
      : [];

    if (embedded && !isGlobalDefaults && externalDurations.length > 0) {
      return Array.from(new Set(externalDurations)).sort((a, b) => a - b);
    }

    return Array.from(new Set([...TOUR_PRICING_DEFAULT_DURATIONS, ...externalDurations, ...extraDurations])).sort((a, b) => a - b);
  }, [allowedDurations, embedded, extraDurations, isGlobalDefaults]);

  const getDefaultPrice = (modelId, duration) => {
    if (isGlobalDefaults) return 0;
    const price = getTourPriceForModelAndDuration({
      rows: pricingRows,
      packageId: GLOBAL_TOUR_PRICING_KEY,
      vehicleModelId: modelId,
      durationHours: duration,
    });
    return Number(price || 0);
  };

  const configuredModelIds = useMemo(
    () => Object.keys(draftRows || {}).filter((modelId) => vehicleModels.some((model) => String(model.id) === String(modelId))),
    [draftRows, vehicleModels]
  );

  const configuredModels = useMemo(
    () =>
      configuredModelIds
        .map((modelId) => vehicleModels.find((model) => String(model.id) === String(modelId)))
        .filter(Boolean),
    [configuredModelIds, vehicleModels]
  );

  const modelOptions = useMemo(
    () =>
      vehicleModels.map((model) => ({
        ...model,
        alreadyAdded: configuredModelIds.includes(String(model.id)),
      })),
    [vehicleModels, configuredModelIds]
  );

  useEffect(() => {
    setExtraDurations((current) => {
      const next = dynamicDurations.filter((value) => !TOUR_PRICING_DEFAULT_DURATIONS.includes(value));
      if (current.length === next.length && current.every((value, index) => value === next[index])) {
        return current;
      }
      return next;
    });
  }, [dynamicDurations]);

  const missingDurationLabels = useMemo(() => {
    return durations.filter((duration) => {
      return !configuredModels.some((model) => {
        const rowDraft = draftRows[String(model.id)] || { prices: {} };
        return Number(rowDraft.prices?.[String(Number(duration))] || 0) > 0;
      });
    });
  }, [durations, configuredModels, draftRows]);

  useEffect(() => {
    const persistedDrafts = createRowDrafts(pricingRows, effectivePackageId);
    const nextDrafts = { ...persistedDrafts };

    Object.entries(draftRows || {}).forEach(([modelId, draft]) => {
      if (!nextDrafts[modelId]) {
        nextDrafts[modelId] = draft;
        return;
      }

      // Preserve in-flight edits over persisted rows.
      nextDrafts[modelId] = {
        ...nextDrafts[modelId],
        prices: {
          ...(nextDrafts[modelId]?.prices || {}),
          ...(draft?.prices || {}),
        },
      };
    });

    if (!isGlobalDefaults) {
      Object.keys(nextDrafts).forEach((modelId) => {
        const rowDraft = nextDrafts[modelId] || { prices: {} };
        const nextPrices = { ...(rowDraft.prices || {}) };
        durations.forEach((duration) => {
          const durationKey = String(Number(duration));
          const touchKey = `${modelId}::${durationKey}`;
          const currentValue = nextPrices[durationKey];
          if ((currentValue === undefined || currentValue === '' || Number(currentValue) === 0) && !touchedPricesRef.current.has(touchKey)) {
            const defaultPrice = getDefaultPrice(modelId, duration);
            if (defaultPrice > 0) {
              nextPrices[durationKey] = defaultPrice;
            }
          }
        });
        nextDrafts[modelId] = {
          vehicle_model_id: rowDraft.vehicle_model_id || modelId,
          prices: nextPrices,
        };
      });
    }

    const currentKeys = Object.keys(draftRows || {});
    const nextKeys = Object.keys(nextDrafts);
    const shallowEqual =
      currentKeys.length === nextKeys.length &&
      nextKeys.every((key) => {
        const currentPrices = draftRows?.[key]?.prices || {};
        const nextPrices = nextDrafts?.[key]?.prices || {};
        const currentPriceKeys = Object.keys(currentPrices);
        const nextPriceKeys = Object.keys(nextPrices);
        if (currentPriceKeys.length !== nextPriceKeys.length) return false;
        return nextPriceKeys.every((priceKey) => currentPrices[priceKey] === nextPrices[priceKey]);
      });

    if (!shallowEqual) {
      setDraftRows(nextDrafts);
    }
  }, [pricingRows, effectivePackageId, durations, isGlobalDefaults, draftRows]);

  const packageRows = useMemo(
    () => pricingRows.filter((row) => String(row.package_id) === effectivePackageId),
    [pricingRows, effectivePackageId]
  );
  const packageDuration = Number(durations[0] || selectedPackage?.duration || 1);
  const packageDurationKey = String(Number(packageDuration));
  const packageDurationRows = useMemo(
    () => packageRows.filter((row) => Number(row.duration_hours) === Number(packageDuration)),
    [packageRows, packageDuration]
  );

  const handlePriceChange = (modelId, duration, value) => {
    const durationKey = String(Number(duration));
    touchedPricesRef.current.add(`${modelId}::${durationKey}`);
    setDraftRows((current) => ({
      ...current,
      [modelId]: {
        vehicle_model_id: modelId,
        prices: {
          ...(current[modelId]?.prices || {}),
          [durationKey]: value,
        },
      },
    }));
  };

  const handleAddDuration = () => {
    const value = Number(customDuration || 0);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error('Saisissez une durée de tour valide');
      return;
    }
    const normalized = Number(value.toFixed(1));
    setExtraDurations((current) => Array.from(new Set([...current, normalized])).sort((a, b) => a - b));
    setCustomDuration('');
  };

  const handleAddVehicleModel = () => {
    const modelId = String(vehicleModelToAdd || '');
    if (!modelId) {
      toast.error('Choisissez d’abord un modèle de véhicule');
      return;
    }

    setDraftRows((current) => {
      if (current[modelId]) {
        toast.error('Ce modèle de véhicule est déjà ajouté');
        return current;
      }
      const nextPrices = {};
      durations.forEach((duration) => {
        const durationKey = String(Number(duration));
        const defaultPrice = getDefaultPrice(modelId, duration);
        nextPrices[durationKey] = defaultPrice > 0 ? defaultPrice : '';
      });
      return {
        ...current,
        [modelId]: {
          vehicle_model_id: modelId,
          prices: nextPrices,
        },
      };
    });
    setVehicleModelToAdd('');
  };

  const toggleModelSelection = (modelId) => {
    const currentPrice = Number(draftRows?.[modelId]?.prices?.[packageDurationKey] || 0);
    if (currentPrice > 0) {
      handlePriceChange(modelId, packageDuration, '');
      return;
    }
    const defaultPrice = getDefaultPrice(modelId, packageDuration);
    if (!defaultPrice) {
      toast.error('Set a default price first');
      return;
    }
    handlePriceChange(modelId, packageDuration, defaultPrice);
  };

  const savePackageSelection = async () => {
    if (!effectivePackageId || isGlobalDefaults) return;
    setSavingSelection(true);
    try {
      const existingRowsByModel = new Map(
        packageDurationRows.map((row) => [String(row.vehicle_model_id), row])
      );
      const operations = [];
      vehicleModels.forEach((model) => {
        const modelId = String(model.id);
        const price = Number(draftRows?.[modelId]?.prices?.[packageDurationKey] || 0);
        const existing = existingRowsByModel.get(modelId);
        if (price > 0) {
          operations.push(
            upsertTourPackageModelPrice({
              id: existing?.id,
              package_id: effectivePackageId,
              vehicle_model_id: modelId,
              duration_hours: packageDuration,
              price_mad: price,
              is_active: true,
            })
          );
        } else if (existing?.id) {
          operations.push(deleteTourPackageModelPrice(existing.id));
        }
      });
      await Promise.all(operations);
      const refreshed = await fetchTourPackageModelPrices();
      setPricingRows(refreshed || []);
      onPricingRowsChange?.(refreshed || []);
      toast.success('Package pricing saved');
    } catch (saveError) {
      console.error('Failed to save package pricing selection:', saveError);
      toast.error(saveError.message || 'Could not save package pricing');
    } finally {
      setSavingSelection(false);
    }
  };

  const handleRemoveDuration = async (durationToRemove) => {
    const normalizedDuration = Number(durationToRemove);
    try {
      const matchingRows = packageRows.filter((row) => Number(row.duration_hours) === normalizedDuration);
      await Promise.all(matchingRows.map((row) => deleteTourPackageModelPrice(row.id)));

      setDraftRows((current) => {
        const next = { ...current };
        Object.keys(next).forEach((modelId) => {
          const prices = { ...(next[modelId]?.prices || {}) };
          delete prices[String(normalizedDuration)];
          next[modelId] = {
            ...next[modelId],
            prices,
          };
        });
        return next;
      });

      setExtraDurations((current) => current.filter((value) => Number(value) !== normalizedDuration));
      const refreshed = await fetchTourPackageModelPrices();
      setPricingRows(refreshed || []);
      onPricingRowsChange?.(refreshed || []);
      toast.success(`Removed ${formatDurationLabel(normalizedDuration)} pricing column`);
    } catch (removeError) {
      console.error('Failed to remove tour duration:', removeError);
      toast.error(removeError.message || 'Could not remove duration column');
    }
  };

  const handleSaveModelPricing = async (modelId) => {
    if (!effectivePackageId) {
      toast.error('Choose a package first');
      return;
    }

    const draft = draftRows[modelId];
    if (!draft) return;

    setSavingRowId(modelId);
    try {
      const existingRows = packageRows.filter((row) => String(row.vehicle_model_id) === String(modelId));
      const upserts = [];
      const deletes = [];

      durations.forEach((duration) => {
        const durationKey = String(Number(duration));
        const numericPrice = Number(draft.prices?.[durationKey] || 0);
        const existing = existingRows.find((row) => Number(row.duration_hours) === Number(duration));

        if (numericPrice > 0) {
          upserts.push(
            upsertTourPackageModelPrice({
              id: existing?.id,
              package_id: effectivePackageId,
              vehicle_model_id: modelId,
              duration_hours: duration,
              price_mad: numericPrice,
              is_active: true,
            })
          );
        } else if (existing?.id) {
          deletes.push(existing.id);
        }
      });

      await Promise.all(upserts);
      await Promise.all(
        deletes.map((id) =>
          deleteTourPackageModelPrice(id).catch((deleteError) => {
            throw deleteError;
          })
        )
      );

      let refreshed = await fetchTourPackageModelPrices();

      if (isGlobalDefaults) {
        const activePackages = Array.isArray(packages)
          ? packages.filter((pkg) => pkg?.is_active !== false && String(pkg.id))
          : [];
        const globalRows = (refreshed || [])
          .filter(
            (row) =>
              String(row.package_id) === GLOBAL_TOUR_PRICING_KEY &&
              String(row.vehicle_model_id) === String(modelId) &&
              Number(row.price_mad || 0) > 0
          )
          .map((row) => ({
            duration_hours: Number(row.duration_hours),
            price_mad: Number(row.price_mad || 0),
          }));

        const syncOps = [];
        activePackages.forEach((pkg) => {
          globalRows.forEach((globalRow) => {
            const existingPackageRow = (refreshed || []).find(
              (row) =>
                String(row.package_id) === String(pkg.id) &&
                String(row.vehicle_model_id) === String(modelId) &&
                Number(row.duration_hours) === Number(globalRow.duration_hours)
            );

            syncOps.push(
              upsertTourPackageModelPrice({
                id: existingPackageRow?.id,
                package_id: pkg.id,
                vehicle_model_id: modelId,
                duration_hours: globalRow.duration_hours,
                price_mad: globalRow.price_mad,
                is_active: true,
              })
            );
          });
        });

        if (syncOps.length > 0) {
          await Promise.all(syncOps);
          refreshed = await fetchTourPackageModelPrices();
        }
      }

      setPricingRows(refreshed || []);
      onPricingRowsChange?.(refreshed || []);
      toast.success(isGlobalDefaults ? 'Default pricing saved and synced' : 'Tour model pricing saved');
    } catch (saveError) {
      console.error('Failed to save tour model pricing:', saveError);
      toast.error(saveError.message || 'Could not save model pricing');
    } finally {
      setSavingRowId('');
    }
  };

  const handleRemoveModel = async (modelId) => {
    if (!effectivePackageId) return;
    try {
      await deleteTourPackageModelPricesForModel(effectivePackageId, modelId);
      setDraftRows((current) => {
        const next = { ...current };
        delete next[modelId];
        return next;
      });
      const refreshed = await fetchTourPackageModelPrices();
      setPricingRows(refreshed || []);
      onPricingRowsChange?.(refreshed || []);
      toast.success('Model pricing removed');
    } catch (removeError) {
      console.error('Failed to remove model pricing:', removeError);
      toast.error(removeError.message || 'Could not remove model pricing');
    }
  };

  if (loading) {
    return (
      <div className={`rounded-2xl border p-6 ${embedded ? 'border-slate-200 bg-slate-50/80 shadow-inner shadow-slate-200/70' : 'border-slate-200 bg-white shadow-sm'}`}>
        <div className="flex items-center gap-3 text-slate-600">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading tour pricing...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className={`overflow-hidden rounded-[1.5rem] border ${embedded ? 'border-slate-200 bg-slate-50/80 shadow-inner shadow-slate-200/70' : 'border-violet-200/70 bg-white shadow-sm'}`}>
        <div className={`${embedded ? 'px-0 py-0' : 'p-6'}`}>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            {!embedded && (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-violet-600/80">Shared Tour Pricing</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-900">Model pricing matrix</h2>
              </div>
            )}
          </div>
          {!embedded && (
            <button
              type="button"
              onClick={loadData}
              className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700 transition hover:bg-violet-100"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh Pricing
            </button>
          )}
        </div>

        {error && (
          <div className={`${embedded ? 'mb-5' : 'mt-5'} flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800`}>
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <div className="text-sm">
              <p className="font-semibold">Pricing data needs attention</p>
              <p className="mt-1">{error}</p>
              <p className="mt-2">Run the SQL in <code>src/migrations/create_tour_package_model_prices_table.sql</code> if needed.</p>
            </div>
          </div>
        )}
        </div>
        <div className={embedded ? 'space-y-5 p-0' : 'p-6'}>
          {!effectivePackageId ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
              Save the package first, then this pricing matrix will unlock for that package.
            </div>
          ) : (
            <>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className={`rounded-2xl border p-5 ${embedded ? 'border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.05)]' : 'border-violet-200/70 bg-gradient-to-r from-violet-50/90 to-indigo-50/80'}`}>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-violet-600/80">
              {embedded ? 'Timing Prices' : 'Package'}
            </p>
            {showPackagePicker ? (
              <select
                value={effectivePackageId}
                onChange={(event) => setSelectedPackageId(event.target.value)}
                className="mt-3 w-full rounded-xl border border-violet-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900"
              >
                {packages.map((pkg) => (
                  <option key={pkg.id} value={pkg.id}>
                    {pkg.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
                <p className="font-semibold text-slate-900">
                  {embedded ? 'Shared tour timing prices' : selectedPackage?.name || 'Current package'}
                </p>
                {embedded && (
                  <p className="mt-2 text-sm text-slate-500">Shared prices by quad model and duration.</p>
                )}
              </div>
            )}

            {selectedPackage && !embedded && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-slate-900">
                  <Route className="h-4 w-4 text-violet-600" />
                  <p className="font-black">{selectedPackage.name}</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">{selectedPackage.duration}h default</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 capitalize text-slate-700">{selectedPackage.routeType}</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">{selectedPackage.maxQuads} quads max</span>
                </div>
              </div>
            )}
          </div>

          <div className={`rounded-2xl border p-5 ${embedded ? 'border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.05)]' : 'border-violet-200/70 bg-gradient-to-r from-violet-50/90 to-indigo-50/80'}`}>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-violet-600/80">
              {embedded && !isGlobalDefaults ? 'Package Duration' : 'Durations'}
            </p>
            {embedded && !isGlobalDefaults ? (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                <span>{formatDurationLabel(durations[0] || selectedPackage?.duration || 1)}</span>
                <span className="rounded-full bg-violet-50 px-3 py-1 text-[11px] font-bold text-violet-600">
                  Locked by package
                </span>
              </div>
            ) : (
              <>
                <div className="mt-3 flex flex-wrap gap-2">
                  {durations.map((duration) => (
                    <div
                      key={duration}
                      className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-700"
                    >
                      {formatDurationLabel(duration)}
                      {extraDurations.includes(duration) ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveDuration(duration)}
                          className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-700 transition hover:bg-violet-200"
                        >
                          Remove
                        </button>
                      ) : (
                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-slate-500">
                          Default
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                {(!embedded || isGlobalDefaults) && (
                  <>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                      <input
                        type="number"
                        min="0.5"
                        step="0.5"
                        value={customDuration}
                        onChange={(event) => setCustomDuration(event.target.value)}
                        className="w-full rounded-xl border border-violet-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 sm:max-w-[180px]"
                        placeholder="Add duration"
                      />
                      <button
                        type="button"
                        onClick={handleAddDuration}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700 transition hover:bg-violet-100"
                      >
                        <Plus className="h-4 w-4" />
                        Add Duration
                      </button>
                    </div>
                    <p className="mt-3 text-xs text-slate-500">
                      Default timing columns are 1h, 1.5h, and 2h. Any other timing is added manually here.
                    </p>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {embedded && missingDurationLabels.length > 0 && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Pricing still needs to be completed</p>
            <p className="mt-1">
              Add shared prices for {missingDurationLabels.map((duration) => formatDurationLabel(duration)).join(', ')} so packages using those durations are ready for bookings.
            </p>
          </div>
        )}

        {!(embedded && !isGlobalDefaults) && (
          <div className={`rounded-2xl border p-5 ${embedded ? 'border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.05)]' : 'border-transparent bg-transparent p-0 shadow-none'}`}>
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-violet-600/80">Pricing Matrix</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-900">Price each model by duration</h3>
            </div>
            <div className="flex w-full flex-col gap-3 xl:w-auto xl:flex-row">
              <select
                value={vehicleModelToAdd}
                onChange={(event) => setVehicleModelToAdd(event.target.value)}
                className="w-full rounded-xl border border-violet-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 xl:min-w-[280px]"
              >
                <option value="">Add vehicle model</option>
                {modelOptions.map((model) => (
                  <option key={model.id} value={model.id} disabled={model.alreadyAdded}>
                    {modelLabel(model)}{model.alreadyAdded ? ' — added' : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAddVehicleModel}
                disabled={!vehicleModelToAdd}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
              >
                <Plus className="h-4 w-4" />
                Add vehicle model
              </button>
            </div>
            </div>
          </div>
        )}

          {!embedded && (
          <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-medium text-violet-700">
            Vehicle models are managed in Fleet Models. Add only the ones you want to price here.
          </div>
        )}

          <div className="mt-5 space-y-4">
          {(embedded && !isGlobalDefaults) ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-violet-600/80">Step 2</p>
                  <h3 className="mt-2 text-xl font-semibold text-slate-900">Select the quad models for this package</h3>
                  <p className="mt-1 text-sm text-slate-500">Prices are pulled from default pricing for {formatDurationLabel(packageDuration)}.</p>
                </div>
                <button
                  type="button"
                  onClick={savePackageSelection}
                  disabled={savingSelection}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                >
                  {savingSelection ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                  Save package pricing
                </button>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {vehicleModels.map((model) => {
                  const modelId = String(model.id);
                  const defaultPrice = getDefaultPrice(modelId, packageDuration);
                  const currentPrice = Number(draftRows?.[modelId]?.prices?.[packageDurationKey] || 0);
                  const isSelected = currentPrice > 0;
                  return (
                    <div
                      key={modelId}
                      className={`flex flex-col gap-3 rounded-2xl border px-4 py-4 text-left transition ${
                        isSelected
                          ? 'border-violet-300 bg-violet-50 shadow-[0_12px_30px_rgba(124,58,237,0.15)]'
                          : 'border-slate-200 bg-white hover:border-violet-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-sm font-semibold text-slate-900">{modelLabel(model)}</span>
                        <button
                          type="button"
                          onClick={() => toggleModelSelection(modelId)}
                          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
                            isSelected
                              ? 'bg-violet-600 text-white hover:bg-violet-700'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {isSelected ? 'Selected' : 'Tap to add'}
                        </button>
                      </div>
                      <div className="text-lg font-black text-slate-900">
                        {defaultPrice > 0 ? `${defaultPrice.toLocaleString('en-MA')} MAD` : 'Set default price'}
                      </div>
                      <div className="text-xs font-semibold text-slate-500">
                        Duration: {formatDurationLabel(packageDuration)}
                      </div>
                      {isSelected && (
                        <div className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Edit price (optional)</label>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={draftRows?.[modelId]?.prices?.[packageDurationKey] ?? ''}
                            onChange={(event) => handlePriceChange(modelId, packageDuration, event.target.value)}
                            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-base font-black text-slate-900 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            placeholder="MAD"
                          />
                          <p className="mt-2 text-[11px] font-medium text-slate-500">
                            Adjust here, then use <span className="font-semibold text-emerald-700">Save package pricing</span>.
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : configuredModels.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
              Add a vehicle model to start pricing this package timing matrix.
            </div>
          ) : (
            configuredModels.map((model) => {
              const rowKey = String(model.id);
              const rowDraft = draftRows[rowKey] || { vehicle_model_id: rowKey, prices: {} };
              return (
                <div key={rowKey} className={`rounded-2xl border p-5 ${embedded ? 'border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.05)]' : 'border-slate-200 bg-slate-50'}`}>
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                      <p className="text-lg font-black text-slate-900">{modelLabel(model)}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {embedded && !isGlobalDefaults ? 'Set the package price for this model.' : 'Fill the durations you want staff to sell.'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleSaveModelPricing(rowKey)}
                        disabled={savingRowId === rowKey}
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {savingRowId === rowKey ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                        Save Row
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveModel(rowKey)}
                        className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                      >
                        <Trash2 className="h-4 w-4" />
                        Remove
                      </button>
                    </div>
                  </div>

                  {embedded && !isGlobalDefaults ? (
                    <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(220px,1fr)_minmax(180px,220px)]">
                      <div className="rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm font-semibold text-slate-600">
                        Duration: {formatDurationLabel(durations[0] || selectedPackage?.duration || 1)}
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-4">
                        <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Package price
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={rowDraft.prices?.[String(Number(durations[0] || selectedPackage?.duration || 1))] ?? ''}
                          onChange={(event) => handlePriceChange(rowKey, durations[0] || selectedPackage?.duration || 1, event.target.value)}
                          className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-black text-slate-900 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          placeholder="MAD"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(220px,1.2fr)_repeat(3,minmax(140px,1fr))]">
                      {durations.map((duration) => {
                        const durationKey = String(Number(duration));
                        const defaultPrice = getDefaultPrice(rowKey, duration);
                        const currentPrice = Number(rowDraft.prices?.[durationKey] || 0);
                        const isAutoFilled = !isGlobalDefaults && defaultPrice > 0 && currentPrice === defaultPrice;
                        return (
                          <div key={`${rowKey}-${durationKey}`} className="rounded-xl border border-slate-200 bg-white p-4">
                            <div className="flex items-center justify-between gap-2">
                              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                {formatDurationLabel(duration)}
                              </label>
                              {isAutoFilled ? (
                                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                                  Auto
                                </span>
                              ) : null}
                            </div>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={rowDraft.prices?.[durationKey] ?? ''}
                              onChange={(event) => handlePriceChange(rowKey, duration, event.target.value)}
                              className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-black text-slate-900 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                              placeholder="MAD"
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
};

export default TourPackagePricingManager;
