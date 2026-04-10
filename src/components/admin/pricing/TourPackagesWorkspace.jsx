import React, { useEffect, useMemo, useState } from 'react';
import { Package2, Plus, Route, Settings2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../../contexts/AuthContext';
import { canManageTourPackages as canManageTourPackagesPermission } from '../../../utils/permissionHelpers';
import {
  createTourPackage,
  deleteTourPackage,
  fetchTourPackages,
  updateTourPackage,
} from '../../../services/tourPackageService';
import {
  fetchTourPackageModelPrices,
  getTourPackageStartingPrice,
  getTourPriceForModelAndDuration,
  GLOBAL_TOUR_PRICING_KEY,
} from '../../../services/tourPackagePricingService';
import TourPackagePricingManager from './TourPackagePricingManager';
import VehicleModelPricingService from '../../../services/VehicleModelPricingService';

const TOUR_PACKAGE_RULES_MARKER = '[tour_package_rules]';

const defaultPackageRules = {
  routeType: 'mountain',
  requiresLicense: false,
  maxQuads: 5,
  bufferBeforeMinutes: 15,
  bufferAfterMinutes: 30,
  websiteVisible: false,
};

const initialPackageForm = {
  name: '',
  description: '',
  location: 'Main Base',
  duration: 1,
  default_rate_1h: 0,
  default_rate_2h: 0,
  vip_rate_1h: 0,
  vip_rate_2h: 0,
  is_active: true,
  routeType: 'mountain',
  requiresLicense: false,
  maxQuads: 5,
  bufferBeforeMinutes: 15,
  bufferAfterMinutes: 30,
  websiteVisible: false,
};

const PACKAGE_DURATION_OPTIONS = [1, 1.5, 2];
const PACKAGE_CAPACITY_OPTIONS = [1, 2, 3, 4, 5, 6];
const DEFAULT_CUSTOM_PACKAGE_DURATION = '3';
const DEFAULT_CUSTOM_PACKAGE_CAPACITY = '7';
const EDITOR_TABS = [
  { id: 'details', label: 'Details', icon: Package2 },
  { id: 'pricing', label: 'Pricing', icon: Route },
  { id: 'advanced', label: 'Advanced', icon: Settings2 },
];

const safeJsonParse = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const extractMarkedJson = (value, marker) => {
  const text = typeof value === 'string' ? value : '';
  const markerIndex = text.indexOf(marker);
  if (markerIndex === -1) return null;
  return safeJsonParse(text.slice(markerIndex + marker.length).trim());
};

const stripMarkedJson = (value, marker) => {
  const text = typeof value === 'string' ? value : '';
  const markerIndex = text.indexOf(marker);
  if (markerIndex === -1) return text.trim();
  return text.slice(0, markerIndex).trim();
};

const appendMarkedJson = (text, marker, payload) => {
  const cleanedText = stripMarkedJson(text, marker);
  const serialized = `${marker}${JSON.stringify(payload)}`;
  return cleanedText ? `${cleanedText}\n\n${serialized}` : serialized;
};

const formatDurationLabel = (value) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return '0h';
  if (numeric % 1 === 0) {
    return `${numeric.toFixed(0)} hour${numeric === 1 ? '' : 's'}`;
  }
  return `${numeric.toFixed(1)} hours`;
};

const normalizeFlexibleDuration = (value) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Number(numeric.toFixed(1));
};

const getVehicleModelCatalogName = (model) => {
  if (!model) return 'Unknown model';
  const name = String(model.name || '').trim();
  const variant = String(model.model || '').trim();
  if (name && variant && name.toLowerCase().includes(variant.toLowerCase())) {
    return name;
  }
  return [name, variant].filter(Boolean).join(' ').trim() || `Model ${model.id}`;
};

const normalizePackage = (pkg) => {
  const rules = {
    ...defaultPackageRules,
    ...(extractMarkedJson(pkg.description, TOUR_PACKAGE_RULES_MARKER) || {}),
  };
  const cleanDescription = stripMarkedJson(pkg.description, TOUR_PACKAGE_RULES_MARKER);

  return {
    ...pkg,
    description: cleanDescription,
    routeType: String(pkg.routeType || pkg.route_type || rules.routeType),
    requiresLicense: Boolean(pkg.requiresLicense ?? pkg.requires_license ?? rules.requiresLicense),
    maxQuads: Number(pkg.maxQuads || pkg.max_quads || rules.maxQuads) || 5,
    bufferBeforeMinutes: Number(pkg.bufferBeforeMinutes || pkg.buffer_before_minutes || rules.bufferBeforeMinutes) || 15,
    bufferAfterMinutes: Number(pkg.bufferAfterMinutes || pkg.buffer_after_minutes || rules.bufferAfterMinutes) || 30,
    websiteVisible: Boolean(pkg.websiteVisible ?? pkg.website_visible ?? rules.websiteVisible),
  };
};

const buildPackagePayload = (formData) => {
  const rules = {
    routeType: formData.routeType,
    requiresLicense: formData.requiresLicense,
    maxQuads: Number(formData.maxQuads) || 5,
    bufferBeforeMinutes: Number(formData.bufferBeforeMinutes) || 15,
    bufferAfterMinutes: Number(formData.bufferAfterMinutes) || 30,
    websiteVisible: formData.websiteVisible,
  };

  return {
    name: formData.name.trim(),
    description: appendMarkedJson(formData.description || '', TOUR_PACKAGE_RULES_MARKER, rules),
    duration: Number(formData.duration) || 1,
    default_rate_1h: Number(formData.default_rate_1h) || 0,
    default_rate_2h: Number(formData.default_rate_2h) || 0,
    vip_rate_1h: Number(formData.vip_rate_1h) || 0,
    vip_rate_2h: Number(formData.vip_rate_2h) || 0,
    location: formData.location || 'Main Base',
    is_active: formData.is_active !== false,
    routeType: formData.routeType,
    requiresLicense: Boolean(formData.requiresLicense),
    maxQuads: Number(formData.maxQuads) || 5,
    bufferBeforeMinutes: Number(formData.bufferBeforeMinutes) || 15,
    bufferAfterMinutes: Number(formData.bufferAfterMinutes) || 30,
    websiteVisible: Boolean(formData.websiteVisible),
  };
};

const getLegacyPackagePricingBadge = (pkg) => {
  const fallbackPrice = Number(pkg?.default_rate_1h || pkg?.default_rate_2h || 0);
  return fallbackPrice > 0 ? `From ${fallbackPrice} MAD` : 'Set pricing';
};

const TourPackagesWorkspace = () => {
  const { userProfile } = useAuth();
  const canManagePackages = canManageTourPackagesPermission(userProfile);

  const [packages, setPackages] = useState([]);
  const [packagesLoading, setPackagesLoading] = useState(true);
  const [tourPricingRows, setTourPricingRows] = useState([]);
  const [vehicleModels, setVehicleModels] = useState([]);
  const [packageEditorOpen, setPackageEditorOpen] = useState(false);
  const [editingPackageId, setEditingPackageId] = useState(null);
  const [packageForm, setPackageForm] = useState(initialPackageForm);
  const [customPackageDuration, setCustomPackageDuration] = useState(DEFAULT_CUSTOM_PACKAGE_DURATION);
  const [customPackageCapacity, setCustomPackageCapacity] = useState(DEFAULT_CUSTOM_PACKAGE_CAPACITY);
  const [packageExtraDurations, setPackageExtraDurations] = useState([]);
  const [editorTab, setEditorTab] = useState('details');

  const loadPackages = async () => {
    setPackagesLoading(true);
    try {
      const [{ data, error }, pricingData] = await Promise.all([
        fetchTourPackages(),
        fetchTourPackageModelPrices().catch((pricingError) => {
          console.warn('Tour pricing matrix unavailable while loading packages:', pricingError);
          return [];
        }),
      ]);

      setTourPricingRows(Array.isArray(pricingData) ? pricingData : []);

      if (error) {
        console.error('Failed to load tour packages:', error);
        toast.error('Could not load tour packages');
        setPackages([]);
      } else {
        setPackages((data || []).map(normalizePackage));
      }
    } catch (loadError) {
      console.error('Failed to load package board:', loadError);
      toast.error('Could not load package board');
      setPackages([]);
      setTourPricingRows([]);
    } finally {
      setPackagesLoading(false);
    }
  };

  useEffect(() => {
    loadPackages();
  }, []);

  useEffect(() => {
    const loadVehicleModels = async () => {
      try {
        const data = await VehicleModelPricingService.getActiveVehicleModels();
        setVehicleModels(Array.isArray(data) ? data : []);
      } catch (error) {
        console.warn('Failed to load vehicle models for package readiness:', error);
        setVehicleModels([]);
      }
    };

    loadVehicleModels();
  }, []);

  const packageDurationChoices = useMemo(
    () => Array.from(new Set([...PACKAGE_DURATION_OPTIONS, ...packageExtraDurations])).sort((a, b) => a - b),
    [packageExtraDurations]
  );

  const selectedPackagePreview = useMemo(() => {
    if (!packageEditorOpen) return null;
    if (!editingPackageId) {
      return {
        id: 'draft',
        name: packageForm.name || 'New Package',
        is_active: packageForm.is_active,
        duration: packageForm.duration,
        routeType: packageForm.routeType,
        maxQuads: packageForm.maxQuads,
      };
    }

    return packages.find((pkg) => String(pkg.id) === String(editingPackageId)) || {
      id: editingPackageId,
      name: packageForm.name || 'Selected Package',
      is_active: packageForm.is_active,
      duration: packageForm.duration,
      routeType: packageForm.routeType,
      maxQuads: packageForm.maxQuads,
    };
  }, [packageEditorOpen, editingPackageId, packageForm, packages]);

  const getPackagePricingBadge = (pkg) => {
    const startingPrice = getTourPackageStartingPrice({
      rows: tourPricingRows,
      packageId: pkg?.id,
      durationHours: pkg?.duration,
    });

    if (startingPrice > 0) return `From ${startingPrice} MAD`;
    return getLegacyPackagePricingBadge(pkg);
  };

  const getPackageModelPriceHighlights = (pkg) => {
    if (!pkg) return [];

    return (vehicleModels || [])
      .map((model) => {
        const price = getTourPriceForModelAndDuration({
          rows: tourPricingRows,
          packageId: pkg?.id,
          vehicleModelId: model.id,
          durationHours: pkg?.duration,
        });

        if (!(price > 0)) return null;

        return {
          modelId: String(model.id),
          label: getVehicleModelCatalogName(model),
          price,
        };
      })
      .filter(Boolean)
      .sort((left, right) => left.price - right.price || left.label.localeCompare(right.label));
  };

  const getPackageReadiness = (pkg) => {
    const currentDuration = Number(pkg?.duration || 0);
    const relevantRows = tourPricingRows.filter(
      (row) =>
        (String(row.package_id) === String(pkg?.id || '') || String(row.package_id) === GLOBAL_TOUR_PRICING_KEY) &&
        Number(row.duration_hours) === currentDuration &&
        Number(row.price_mad || 0) > 0
    );

    if (vehicleModels.length === 0) {
      return {
        label: relevantRows.length > 0 ? 'Pricing Set' : 'Pricing Incomplete',
        tone: relevantRows.length > 0 ? 'ready' : 'incomplete',
        note: relevantRows.length > 0
          ? `Prices saved for ${formatDurationLabel(currentDuration)}.`
          : `Add prices for ${formatDurationLabel(currentDuration)}.`,
      };
    }

    const pricedModelIds = new Set(relevantRows.map((row) => String(row.vehicle_model_id)));
    const missingCount = vehicleModels.filter((model) => !pricedModelIds.has(String(model.id))).length;

    if (missingCount === 0) {
      return {
        label: 'Package Ready',
        tone: 'ready',
        note: `All active quad models are priced for ${formatDurationLabel(currentDuration)}.`,
      };
    }

    if (pricedModelIds.size === 0) {
      return {
        label: 'Pricing Incomplete',
        tone: 'incomplete',
        note: `No quad prices set yet for ${formatDurationLabel(currentDuration)}.`,
      };
    }

    return {
      label: 'Pricing Partial',
      tone: 'partial',
      note: `${missingCount} model${missingCount > 1 ? 's still need' : ' still needs'} a price for ${formatDurationLabel(currentDuration)}.`,
    };
  };

  const resetEditor = () => {
    setPackageEditorOpen(false);
    setEditingPackageId(null);
    setPackageForm(initialPackageForm);
    setCustomPackageDuration(DEFAULT_CUSTOM_PACKAGE_DURATION);
    setCustomPackageCapacity(DEFAULT_CUSTOM_PACKAGE_CAPACITY);
    setPackageExtraDurations([]);
    setEditorTab('details');
  };

  const handleOpenPackageEditor = (pkg = null) => {
    if (!canManagePackages) {
      toast.error('Only admin or owner can manage tour packages');
      return;
    }

    if (pkg) {
      const normalizedDuration = normalizeFlexibleDuration(pkg.duration) || 1;
      setPackageForm({
        ...initialPackageForm,
        ...pkg,
        duration: normalizedDuration,
      });
      setCustomPackageDuration(String(normalizedDuration || DEFAULT_CUSTOM_PACKAGE_DURATION));
      setCustomPackageCapacity(String(Number(pkg.maxQuads || 5)));
      setPackageExtraDurations(PACKAGE_DURATION_OPTIONS.includes(normalizedDuration) ? [] : [normalizedDuration]);
      setEditingPackageId(pkg.id);
    } else {
      setPackageForm(initialPackageForm);
      setCustomPackageDuration(DEFAULT_CUSTOM_PACKAGE_DURATION);
      setCustomPackageCapacity(DEFAULT_CUSTOM_PACKAGE_CAPACITY);
      setPackageExtraDurations([]);
      setEditingPackageId(null);
    }

    setEditorTab('details');
    setPackageEditorOpen(true);
  };

  const handleSavePackage = async () => {
    if (!canManagePackages) {
      toast.error('Only admin or owner can create or update tour packages');
      return;
    }
    if (!packageForm.name.trim()) {
      toast.error('Package name is required');
      return;
    }

    const payload = buildPackagePayload(packageForm);
    const result = editingPackageId
      ? await updateTourPackage(editingPackageId, payload)
      : await createTourPackage(payload);

    if (result.error) {
      console.error('Failed to save tour package:', result.error);
      toast.error(result.error.message || 'Could not save package');
      return;
    }

    const savedPackage = result?.data ? normalizePackage(result.data) : null;
    if (savedPackage) {
      setPackages((prev) => {
        const withoutCurrent = prev.filter((pkg) => String(pkg.id) !== String(savedPackage.id));
        return [savedPackage, ...withoutCurrent].sort((a, b) =>
          String(a.name || '').localeCompare(String(b.name || ''))
        );
      });
      setEditingPackageId(savedPackage.id);
      setPackageForm({
        ...initialPackageForm,
        ...savedPackage,
        duration: normalizeFlexibleDuration(savedPackage.duration) || 1,
      });
      setCustomPackageDuration(String(normalizeFlexibleDuration(savedPackage.duration) || DEFAULT_CUSTOM_PACKAGE_DURATION));
      setCustomPackageCapacity(String(Number(savedPackage.maxQuads || 5)));
      setPackageExtraDurations(
        PACKAGE_DURATION_OPTIONS.includes(normalizeFlexibleDuration(savedPackage.duration) || 1)
          ? []
          : [normalizeFlexibleDuration(savedPackage.duration) || 1]
      );
    }

    toast.success(editingPackageId ? 'Package updated' : 'Package created');
    setPackageEditorOpen(true);
    if (!editingPackageId) {
      setEditorTab('pricing');
    }
    await loadPackages();
  };

  const handleDeletePackage = async (pkgId) => {
    if (!canManagePackages) {
      toast.error('Only admin or owner can delete tour packages');
      return;
    }

    const { error } = await deleteTourPackage(pkgId);
    if (error) {
      console.error('Failed to delete package:', error);
      toast.error('Could not delete package');
      return;
    }

    toast.success('Package removed');
    if (String(editingPackageId) === String(pkgId)) {
      resetEditor();
    }
    await loadPackages();
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-violet-600/80">Packages</p>
              <h2 className="mt-2 text-[1.45rem] font-semibold text-slate-900">
                {canManagePackages ? 'Choose a package' : 'Tour packages'}
              </h2>
            </div>
            {canManagePackages && (
              <button
                type="button"
                onClick={() => handleOpenPackageEditor()}
                className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 to-indigo-50 px-4 py-3 text-sm font-medium text-violet-700 transition hover:from-violet-100 hover:to-indigo-100"
              >
                <Plus className="h-4 w-4" />
                Add Package
              </button>
            )}
          </div>

          <div className="mt-5 space-y-3">
            {packagesLoading ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-slate-500">Loading packages...</div>
            ) : packages.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-500">
                No package yet. Add your first city or mountain offer here.
              </div>
            ) : (
              packages.map((pkg) => {
                const readiness = getPackageReadiness(pkg);
                const modelPriceHighlights = getPackageModelPriceHighlights(pkg);
                const readinessClasses = readiness.tone === 'ready'
                  ? 'bg-emerald-100 text-emerald-700'
                  : readiness.tone === 'partial'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-rose-100 text-rose-700';

                return (
                  <article
                    key={pkg.id}
                    className={`rounded-2xl border p-4 shadow-sm transition ${
                      String(editingPackageId) === String(pkg.id)
                        ? 'border-violet-300 bg-violet-50/60'
                        : 'border-violet-200/60 bg-gradient-to-br from-white via-white to-violet-50/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-lg font-semibold text-slate-900">{pkg.name}</h3>
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${pkg.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                            {pkg.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                            {formatDurationLabel(pkg.duration)}
                          </span>
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold capitalize text-slate-700">
                            {pkg.routeType}
                          </span>
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                            {getPackagePricingBadge(pkg)}
                          </span>
                        </div>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${readinessClasses}`}>
                        {readiness.label}
                      </span>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3 text-sm text-slate-500">
                      <span>{pkg.maxQuads} quads</span>
                      <span className="truncate text-right">{readiness.note}</span>
                    </div>

                    {modelPriceHighlights.length > 0 ? (
                      <div className="mt-4 rounded-xl border border-violet-100 bg-white/80 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                          Vehicle pricing
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {modelPriceHighlights.map((item) => (
                            <span
                              key={`${pkg.id}-${item.modelId}`}
                              className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700"
                            >
                              {item.label} • {item.price.toLocaleString('en-MA')} MAD
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenPackageEditor(pkg)}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                      >
                        Open
                      </button>
                      {canManagePackages && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              handleOpenPackageEditor(pkg);
                              setEditorTab('details');
                            }}
                            className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-medium text-violet-700 transition hover:bg-violet-100"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePackage(pkg.id)}
                            className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 transition hover:bg-rose-100"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-violet-600/80">
                {canManagePackages ? (editingPackageId ? 'Selected Package' : 'New Package') : 'Read Only'}
              </p>
              <h2 className="mt-2 text-[1.65rem] font-semibold text-slate-900">
                {canManagePackages
                  ? (packageEditorOpen ? (packageForm.name || 'Package editor') : 'Open a package to edit')
                  : 'Packages are managed by admin or owner'}
              </h2>
            </div>
            {canManagePackages && packageEditorOpen && (
              <button
                type="button"
                onClick={resetEditor}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                Close
              </button>
            )}
          </div>

          {!canManagePackages ? (
            <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">
              You can use tour packages for booking, but only admin or owner can add, edit, or delete them.
            </div>
          ) : !packageEditorOpen ? (
            <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">
              Pick a package from the list or add a new one.
            </div>
          ) : (
            <div className="mt-6 space-y-5">
              <div className="rounded-2xl border border-violet-200/70 bg-gradient-to-r from-violet-50/90 to-indigo-50/80 p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${packageForm.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                        {packageForm.is_active ? 'Active' : 'Inactive'}
                      </span>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                        {formatDurationLabel(packageForm.duration)}
                      </span>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold capitalize text-slate-700">
                        {packageForm.routeType}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-slate-600">
                      Keep package details, pricing, and advanced settings separate so staff can work faster.
                    </p>
                    {selectedPackagePreview && getPackageModelPriceHighlights(selectedPackagePreview).length > 0 ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {getPackageModelPriceHighlights(selectedPackagePreview).map((item) => (
                          <span
                            key={`preview-${item.modelId}`}
                            className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-violet-700 ring-1 ring-violet-100"
                          >
                            {item.label} • {item.price.toLocaleString('en-MA')} MAD
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-violet-200 bg-white px-4 py-3">
                      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">Price from</p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">
                        {selectedPackagePreview ? getPackagePricingBadge(selectedPackagePreview) : 'Set pricing'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-violet-200 bg-white px-4 py-3">
                      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">Route</p>
                      <p className="mt-2 text-lg font-semibold capitalize text-slate-900">{packageForm.routeType}</p>
                    </div>
                    <div className="rounded-xl border border-violet-200 bg-white px-4 py-3">
                      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">Capacity</p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">{packageForm.maxQuads} quads</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2">
                <div className="grid gap-2 md:grid-cols-3">
                  {EDITOR_TABS.map((tab) => {
                    const Icon = tab.icon;
                    const active = editorTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setEditorTab(tab.id)}
                        className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                          active ? 'bg-violet-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {editorTab === 'details' && (
                <div className="space-y-5">
                  <div className="rounded-2xl border border-violet-200/70 bg-gradient-to-r from-violet-50/90 to-indigo-50/80 p-5">
                    <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-violet-600/80">Basics</p>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div className="rounded-xl border border-slate-200 bg-white p-5">
                        <label className="text-sm font-semibold text-slate-700">Package Name</label>
                        <input
                          type="text"
                          value={packageForm.name}
                          onChange={(event) => setPackageForm((prev) => ({ ...prev, name: event.target.value }))}
                          className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-4 text-base font-semibold text-slate-900"
                          placeholder="City Tour - 1 Hour"
                        />
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-5">
                        <label className="text-sm font-semibold text-slate-700">Location</label>
                        <input
                          type="text"
                          value={packageForm.location}
                          onChange={(event) => setPackageForm((prev) => ({ ...prev, location: event.target.value }))}
                          className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-4 text-base font-semibold text-slate-900"
                          placeholder="Main Base"
                        />
                      </div>
                    </div>
                    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
                      <label className="text-sm font-semibold text-slate-700">Description</label>
                      <textarea
                        value={packageForm.description}
                        onChange={(event) => setPackageForm((prev) => ({ ...prev, description: event.target.value }))}
                        rows={4}
                        className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-4 text-sm text-slate-900"
                        placeholder="Write the route, highlights, and what the guest should know."
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-violet-200/70 bg-gradient-to-r from-violet-50/90 to-indigo-50/80 p-5">
                    <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-violet-600/80">Route Setup</p>
                    <div className="mt-4 grid gap-4 xl:grid-cols-2">
                      <div className="rounded-xl border border-slate-200 bg-white p-5">
                        <label className="text-sm font-semibold text-slate-700">Duration</label>
                        <div className="mt-4 grid grid-cols-2 gap-3">
                          {packageDurationChoices.map((hours) => (
                            <button
                              key={hours}
                              type="button"
                              onClick={() => setPackageForm((prev) => ({ ...prev, duration: hours }))}
                              className={`rounded-xl px-4 py-4 text-sm font-medium transition ${
                                Number(packageForm.duration) === hours
                                  ? 'border border-blue-300 bg-blue-600 text-white shadow-sm'
                                  : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              {formatDurationLabel(hours)}
                            </button>
                          ))}
                        </div>
                        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Custom Duration</p>
                          <div className="mt-3 flex gap-3">
                            <input
                              type="number"
                              min="0.5"
                              step="0.5"
                              value={customPackageDuration}
                              onChange={(event) => setCustomPackageDuration(event.target.value)}
                              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const nextDuration = normalizeFlexibleDuration(customPackageDuration);
                                if (!nextDuration) {
                                  toast.error('Enter a valid duration');
                                  return;
                                }
                                setPackageExtraDurations((current) =>
                                  PACKAGE_DURATION_OPTIONS.includes(nextDuration)
                                    ? current
                                    : Array.from(new Set([...current, nextDuration])).sort((a, b) => a - b)
                                );
                                setPackageForm((prev) => ({ ...prev, duration: nextDuration }));
                              }}
                              className="rounded-xl border border-violet-200 bg-violet-50 px-5 py-3 text-sm font-semibold text-violet-700 transition hover:bg-violet-100"
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="rounded-xl border border-slate-200 bg-white p-5">
                          <label className="text-sm font-semibold text-slate-700">License Rule</label>
                          <div className="mt-4 grid grid-cols-2 gap-3">
                            <button
                              type="button"
                              onClick={() => setPackageForm((prev) => ({ ...prev, requiresLicense: false }))}
                              className={`rounded-xl px-4 py-4 text-sm font-semibold transition ${
                                !packageForm.requiresLicense
                                  ? 'border border-emerald-300 bg-emerald-500 text-white shadow-sm'
                                  : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              No License Needed
                            </button>
                            <button
                              type="button"
                              onClick={() => setPackageForm((prev) => ({ ...prev, requiresLicense: true }))}
                              className={`rounded-xl px-4 py-4 text-sm font-semibold transition ${
                                packageForm.requiresLicense
                                  ? 'border border-amber-300 bg-amber-500 text-white shadow-sm'
                                  : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              License Required
                            </button>
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white p-5">
                          <label className="text-sm font-semibold text-slate-700">Route Type</label>
                          <div className="mt-4 grid grid-cols-2 gap-3">
                            {['city', 'mountain', 'road', 'mixed'].map((routeType) => (
                              <button
                                key={routeType}
                                type="button"
                                onClick={() => setPackageForm((prev) => ({ ...prev, routeType }))}
                                className={`rounded-xl px-4 py-4 text-sm font-semibold capitalize transition ${
                                  packageForm.routeType === routeType
                                    ? 'border border-blue-300 bg-blue-600 text-white shadow-sm'
                                    : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                {routeType}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white p-5">
                          <label className="text-sm font-semibold text-slate-700">Maximum Quads</label>
                          <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-3">
                            {PACKAGE_CAPACITY_OPTIONS.map((count) => (
                              <button
                                key={count}
                                type="button"
                                onClick={() => setPackageForm((prev) => ({ ...prev, maxQuads: count }))}
                                className={`rounded-xl px-4 py-4 text-sm font-semibold transition ${
                                  Number(packageForm.maxQuads) === count
                                    ? 'border border-blue-300 bg-blue-600 text-white shadow-sm'
                                    : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                {count} Quad{count > 1 ? 's' : ''}
                              </button>
                            ))}
                          </div>
                          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Custom Capacity</p>
                            <div className="mt-3 flex gap-3">
                              <input
                                type="number"
                                min="1"
                                step="1"
                                value={customPackageCapacity}
                                onChange={(event) => setCustomPackageCapacity(event.target.value)}
                                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const nextCapacity = Math.max(1, Number(customPackageCapacity || 1));
                                  setPackageForm((prev) => ({ ...prev, maxQuads: nextCapacity }));
                                  setCustomPackageCapacity(String(nextCapacity));
                                }}
                                className="rounded-xl border border-violet-200 bg-violet-50 px-5 py-3 text-sm font-semibold text-violet-700 transition hover:bg-violet-100"
                              >
                                Apply
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {editorTab === 'pricing' && (
                <TourPackagePricingManager
                  embedded
                  showPackagePicker={false}
                  selectedPackageId={editingPackageId || GLOBAL_TOUR_PRICING_KEY}
                  selectedPackage={selectedPackagePreview}
                  allowedDurations={[packageForm.duration]}
                />
              )}

              {editorTab === 'advanced' && (
                <div className="grid gap-5 xl:grid-cols-2">
                  <div className="rounded-2xl border border-violet-200/70 bg-gradient-to-r from-violet-50/90 to-indigo-50/80 p-5">
                    <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-violet-600/80">Buffers</p>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div className="rounded-xl border border-slate-200 bg-white p-5">
                        <label className="text-sm font-semibold text-slate-700">Buffer Before</label>
                        <input
                          type="number"
                          min="0"
                          step="5"
                          value={packageForm.bufferBeforeMinutes}
                          onChange={(event) =>
                            setPackageForm((prev) => ({ ...prev, bufferBeforeMinutes: event.target.value }))
                          }
                          className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-4 text-base font-semibold text-slate-900"
                        />
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-5">
                        <label className="text-sm font-semibold text-slate-700">Buffer After</label>
                        <input
                          type="number"
                          min="0"
                          step="5"
                          value={packageForm.bufferAfterMinutes}
                          onChange={(event) =>
                            setPackageForm((prev) => ({ ...prev, bufferAfterMinutes: event.target.value }))
                          }
                          className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-4 text-base font-semibold text-slate-900"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-violet-200/70 bg-gradient-to-r from-violet-50/90 to-indigo-50/80 p-5">
                    <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-violet-600/80">Visibility</p>
                    <div className="mt-4 grid gap-4">
                      <div className="rounded-xl border border-slate-200 bg-white p-5">
                        <label className="text-sm font-semibold text-slate-700">Package status</label>
                        <div className="mt-4 grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => setPackageForm((prev) => ({ ...prev, is_active: true }))}
                            className={`rounded-xl px-4 py-4 text-sm font-semibold transition ${
                              packageForm.is_active
                                ? 'border border-emerald-300 bg-emerald-50 text-emerald-700'
                                : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            Active
                          </button>
                          <button
                            type="button"
                            onClick={() => setPackageForm((prev) => ({ ...prev, is_active: false }))}
                            className={`rounded-xl px-4 py-4 text-sm font-semibold transition ${
                              !packageForm.is_active
                                ? 'border border-slate-300 bg-slate-100 text-slate-700'
                                : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            Internal Only
                          </button>
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-5">
                        <label className="text-sm font-semibold text-slate-700">Website visibility</label>
                        <div className="mt-4 grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => setPackageForm((prev) => ({ ...prev, websiteVisible: true }))}
                            className={`rounded-xl px-4 py-4 text-sm font-semibold transition ${
                              packageForm.websiteVisible
                                ? 'border border-blue-300 bg-blue-50 text-blue-700'
                                : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            Website Visible
                          </button>
                          <button
                            type="button"
                            onClick={() => setPackageForm((prev) => ({ ...prev, websiteVisible: false }))}
                            className={`rounded-xl px-4 py-4 text-sm font-semibold transition ${
                              !packageForm.websiteVisible
                                ? 'border border-slate-300 bg-slate-100 text-slate-700'
                                : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            Internal Only
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="sticky bottom-4 z-10 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {editingPackageId ? 'Save updates to this package' : 'Create the package to continue using it in bookings'}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {editorTab === 'pricing'
                        ? 'Pricing rows save individually, but package details should still be saved here.'
                        : 'Details and advanced settings are saved together here.'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={resetEditor}
                      className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSavePackage}
                      className="rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:from-sky-600 hover:to-blue-700"
                    >
                      {editingPackageId ? 'Save Package' : 'Create Package'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default TourPackagesWorkspace;
