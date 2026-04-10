import React, { useState, useEffect, useMemo } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Wrench, Fuel, Package, MoreHorizontal, Car, BarChart3, ArrowUpRight, ArrowLeft, Activity, ExternalLink, ReceiptText, WalletCards } from 'lucide-react';
import { financeApiV2 } from '../../services/financeApiV2';
import i18n from '../../i18n';

/**
 * Enhanced Vehicle Finance Tab v2 with Data Context Indicators
 * 
 * Features:
 * - Vehicle selection dropdown with comprehensive debugging
 * - Lifetime financial metrics with OpEx breakdown
 * - Performance indicators and utilization stats
 * - Modern card-based layout with animations
 * - CRITICAL FIX: Proper vehicle data handling and display
 * - NEW: Data source indicators and lifetime scope clarification
 */
const VehicleFinanceTabV2 = ({ filters, vehicles = [], loading, refreshTrigger, onVehicleClick, initialVehicleId = '', initialDetailOpen = false }) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const [selectedVehicleIds, setSelectedVehicleIds] = useState([]);
  const [vehicleFinanceData, setVehicleFinanceData] = useState(null);
  const [vehicleProfitData, setVehicleProfitData] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState(null);
  const [detailPageOpen, setDetailPageOpen] = useState(false);
  const [openDetailAfterLoad, setOpenDetailAfterLoad] = useState(false);

  // CRITICAL DEBUG: Log vehicle prop data
  useEffect(() => {
    console.log('🚗 VEHICLE FINANCE TAB: Received vehicles prop:', {
      vehiclesType: typeof vehicles,
      vehiclesIsArray: Array.isArray(vehicles),
      vehiclesLength: vehicles?.length || 0,
      vehiclesData: vehicles,
      loading: loading,
      sampleVehicle: vehicles?.[0]
    });
  }, [vehicles, loading]);

  useEffect(() => {
    if (!initialVehicleId) return;
    if (!vehicles?.some((vehicle) => String(vehicle.id) === String(initialVehicleId))) return;

    setSelectedVehicleIds((current) => {
      if (current.length === 1 && String(current[0]) === String(initialVehicleId)) return current;
      return [initialVehicleId];
    });

    if (initialDetailOpen) {
      setDetailPageOpen(true);
      setOpenDetailAfterLoad(true);
    }
  }, [initialVehicleId, initialDetailOpen, vehicles?.length]);

  // Load vehicle finance data when selection changes
  useEffect(() => {
    if (selectedVehicleIds.length > 0) {
      loadVehicleFinanceData();
    }
  }, [selectedVehicleIds, filters, refreshTrigger, vehicles?.length]);

  useEffect(() => {
    if (!openDetailAfterLoad || dataLoading || !vehicleFinanceData || selectedVehicleIds.length === 0) return;
    setDetailPageOpen(true);
    setOpenDetailAfterLoad(false);
  }, [openDetailAfterLoad, dataLoading, vehicleFinanceData, selectedVehicleIds.length]);

  useEffect(() => {
    if (!detailPageOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [detailPageOpen]);

  const loadVehicleFinanceData = async () => {
    try {
      setDataLoading(true);
      setError(null);
      setVehicleFinanceData(null);
      
      console.log('💰 VEHICLE FINANCE: Loading data for vehicles:', selectedVehicleIds);
      
      const [financeData, profitData] = await Promise.all([
        financeApiV2.getVehicleFinanceData(selectedVehicleIds, filters),
        financeApiV2.getTopVehiclesByProfit(filters, Math.max(vehicles?.length || 0, 100), true)
      ]);
      
      setVehicleFinanceData(financeData);
      setVehicleProfitData(profitData);
      
      console.log('✅ Vehicle finance data loaded:', {
        financeData,
        profitDataCount: profitData.length
      });
      
    } catch (err) {
      console.error('❌ Vehicle finance data loading failed:', err);
      setError(err.message || tr('Failed to load vehicle finance data', 'Impossible de charger les données financières du véhicule'));
    } finally {
      setDataLoading(false);
    }
  };

  const handleVehicleSelection = (vehicleId) => {
    const normalizedVehicleId = String(vehicleId);
    const isAlreadySelected = selectedVehicleSet.has(normalizedVehicleId);

    console.log('🚗 Vehicle selection toggled:', { vehicleId, isAlreadySelected });
    setVehicleFinanceData(null);
    setSelectedVehicleIds([vehicleId]);
    setDetailPageOpen(true);
    setOpenDetailAfterLoad(true);
    
    if (!isAlreadySelected && onVehicleClick) {
      onVehicleClick(vehicleId);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'decimal',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
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

  const formatPercent = (value) => `${Number(value || 0).toFixed(1)}%`;

  const selectedVehicleSet = useMemo(() => new Set(selectedVehicleIds.map(String)), [selectedVehicleIds]);

  const vehicleCards = useMemo(() => {
    const profitMap = new Map((vehicleProfitData || []).map((row) => [String(row.vehicleId), row]));
    return (vehicles || []).map((vehicle) => {
      const row = profitMap.get(String(vehicle.id)) || {};
      const plateNumber = vehicle?.plate_number || vehicle?.plate || row.plateNumber || `Vehicle-${vehicle.id}`;
      const make = vehicle?.make || vehicle?.brand || vehicle?.name || row.make || 'SEGWAY';
      const model = vehicle?.model || row.model || 'AT6';
      const revenue = Number(row.revenue || 0);
      const profileAcquisition = Number(vehicle?.purchase_cost_mad || 0);
      const rowAcquisition = Number(row.acquisitionCosts || 0);
      const acquisitionCosts = profileAcquisition > 0 ? profileAcquisition : rowAcquisition;
      const acquisitionDelta = acquisitionCosts - rowAcquisition;
      const totalCosts = Math.max(0, Number(row.totalCosts || 0) + acquisitionDelta);
      const profit = Number(row.profit ?? (revenue - Number(row.totalCosts || 0))) - acquisitionDelta;
      return {
        ...row,
        vehicleId: String(vehicle.id),
        plateNumber,
        make,
        model,
        revenue,
        maintenanceCosts: Number(row.maintenanceCosts || 0),
        fuelCosts: Number(row.fuelCosts || 0),
        fuelConsumedLiters: Number(row.fuelConsumedLiters || 0),
        inventoryCosts: Number(row.inventoryCosts || 0),
        acquisitionCosts,
        otherCosts: Number(row.otherCosts || 0),
        totalCosts,
        profit,
        profitMargin: revenue > 0 ? Number(row.profitMargin || ((profit / revenue) * 100)) : 0,
        status: vehicle?.is_active === false ? tr('Inactive', 'Inactif') : tr('Active', 'Actif'),
        vehicleLabel: vehicle?.display_name || `${plateNumber} - ${make} ${model}`,
        profitTone: profit >= 0 ? 'positive' : 'negative'
      };
    }).sort((a, b) => String(a.plateNumber).localeCompare(String(b.plateNumber), undefined, { numeric: true }));
  }, [vehicleProfitData, vehicles, tr]);

  const selectedVehicleCard = useMemo(
    () => vehicleCards.find((row) => selectedVehicleSet.has(String(row.vehicleId))) || null,
    [vehicleCards, selectedVehicleSet]
  );
  const visibleVehicleCards = selectedVehicleCard ? [selectedVehicleCard] : vehicleCards;

  const selectedVehicle = useMemo(
    () => (vehicles || []).find((vehicle) => selectedVehicleSet.has(String(vehicle.id))) || null,
    [vehicles, selectedVehicleSet]
  );

  const detailVehicleId = selectedVehicle?.id || selectedVehicleCard?.vehicleId || null;
  const detailVehicleLabel = selectedVehicle?.display_name
    || [selectedVehicle?.make || selectedVehicle?.name || selectedVehicleCard?.make, selectedVehicle?.model || selectedVehicleCard?.model].filter(Boolean).join(' ')
    || selectedVehicleCard?.vehicleLabel
    || tr('Selected vehicle', 'Véhicule sélectionné');
  const detailVehiclePlate = selectedVehicle?.plate_number || selectedVehicle?.plate || selectedVehicleCard?.plateNumber || `Vehicle-${detailVehicleId || '—'}`;
  const profileAcquisitionCost = Number(selectedVehicle?.purchase_cost_mad || 0);
  const financeAcquisitionCost = Number(vehicleFinanceData?.lifetimeAcquisitionCosts || 0);
  const lifetimeAcquisitionCost = profileAcquisitionCost > 0 ? profileAcquisitionCost : financeAcquisitionCost;
  const acquisitionCorrection = vehicleFinanceData ? lifetimeAcquisitionCost - financeAcquisitionCost : 0;
  const displayLifetimeTotalCosts = vehicleFinanceData
    ? Math.max(0, Number(vehicleFinanceData.lifetimeTotalCosts || 0) + acquisitionCorrection)
    : 0;
  const displayGrossProfit = vehicleFinanceData
    ? Number(vehicleFinanceData.grossProfit || 0) - acquisitionCorrection
    : 0;
  const vehicleMarginPercent = vehicleFinanceData
    ? ((displayGrossProfit / Math.max(vehicleFinanceData.lifetimeRevenue, 1)) * 100)
    : 0;
  const vehicleRoiPercent = vehicleFinanceData
    ? ((displayGrossProfit / Math.max(displayLifetimeTotalCosts, 1)) * 100)
    : 0;
  const lifetimeFlowSummary = vehicleFinanceData ? [
    {
      key: 'revenue',
      label: tr('Revenue', 'Revenus'),
      amount: vehicleFinanceData.lifetimeRevenue,
      tone: 'emerald',
      icon: DollarSign
    },
    {
      key: 'costs',
      label: tr('Expenses', 'Dépenses'),
      amount: displayLifetimeTotalCosts,
      tone: 'rose',
      icon: BarChart3
    },
    {
      key: 'net',
      label: tr('Net', 'Net'),
      amount: displayGrossProfit,
      tone: displayGrossProfit >= 0 ? 'violet' : 'rose',
      icon: TrendingUp
    }
  ] : [];
  const timelineEvents = (vehicleFinanceData?.events || [])
    .map((event) => {
      if (String(event.eventType || '').toLowerCase() !== 'vehicle acquisition') return event;
      return {
        ...event,
        otherCost: lifetimeAcquisitionCost,
        net: -lifetimeAcquisitionCost
      };
    })
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  const trendPoints = vehicleFinanceData?.trendData || [];
  const trendMax = Math.max(1, ...trendPoints.map((point) => Math.abs(point.netMargin || 0)));

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="rounded-[2rem] border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
          <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
            <div className="text-5xl leading-none animate-pulse">⏳</div>
            <h3 className="text-xl font-semibold text-slate-900">{tr('Loading vehicle finance...', 'Chargement de la finance véhicule...')}</h3>
          </div>
        </div>
      </div>
    );
  }

  // CRITICAL: Handle case when no vehicles are available
  if (!vehicles || vehicles.length === 0) {
    return (
      <div className="space-y-6">
        <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6">
          <div className="flex items-center space-x-3">
            <div className="rounded-2xl bg-amber-100 p-3">
              <Car className="w-6 h-6 text-amber-700" />
            </div>
            <div>
              <h3 className="font-semibold text-amber-900">{tr('No vehicles available', 'Aucun véhicule disponible')}</h3>
              <p className="mt-1 text-sm text-amber-700">
                {tr('No vehicles were found in your fleet yet. Add vehicles first to unlock vehicle finance tracking.', "Aucun véhicule n'a encore été trouvé dans votre flotte. Ajoutez d'abord des véhicules pour activer le suivi financier véhicule.")}
              </p>
              <p className="mt-2 text-xs text-amber-600">
                {tr('Vehicle records are loaded from `saharax_0u4w4d_vehicles`.', 'Les enregistrements véhicules sont chargés depuis `saharax_0u4w4d_vehicles`.')}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (detailPageOpen && (!vehicleFinanceData || dataLoading || error)) {
    return (
      <div className="fixed inset-0 z-[90] overflow-y-auto bg-slate-50 px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1100px] space-y-6">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-[0_20px_55px_rgba(15,23,42,0.08)]">
            <button
              type="button"
              onClick={() => {
                setDetailPageOpen(false);
                setOpenDetailAfterLoad(false);
              }}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-violet-200 hover:text-violet-700"
            >
              <ArrowLeft className="h-4 w-4" />
              {tr('Back to vehicle finance', 'Retour à la finance véhicule')}
            </button>

            <div className="mt-12 rounded-[2rem] border border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center">
              {error ? (
                <div className="mx-auto max-w-md">
                  <BarChart3 className="mx-auto h-10 w-10 text-rose-600" />
                  <h3 className="mt-4 text-xl font-semibold text-slate-900">{tr('Could not open vehicle finance', 'Impossible d’ouvrir la finance véhicule')}</h3>
                  <p className="mt-2 text-sm text-rose-700">{error}</p>
                </div>
              ) : (
                <div className="mx-auto max-w-md">
                  <div className="text-5xl leading-none animate-pulse">⏳</div>
                  <h3 className="mt-4 text-xl font-semibold text-slate-900">{tr('Opening vehicle lifetime finance...', 'Ouverture de la finance véhicule à vie...')}</h3>
                  <p className="mt-2 text-sm text-slate-500">{detailVehiclePlate} • {tr('Loading lifetime revenue, costs, acquisition, and events.', 'Chargement des revenus, coûts, acquisition et événements à vie.')}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (detailPageOpen && vehicleFinanceData) {
    return (
      <div className="fixed inset-0 z-[90] overflow-y-auto bg-slate-50 px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1500px] space-y-6">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-[0_20px_55px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setDetailPageOpen(false)}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-violet-200 hover:text-violet-700"
                >
                  <ArrowLeft className="h-4 w-4" />
                  {tr('Back to vehicle finance', 'Retour à la finance véhicule')}
                </button>
                <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">
                  {tr('Lifetime P&L', 'P&L à vie')}
                </span>
              </div>

              <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-900">{detailVehiclePlate}</h2>
              <p className="mt-2 text-sm text-slate-600">
                {detailVehicleLabel} • {tr('Full vehicle finance workspace with lifetime trend, events, ROI, and operational cost history.', 'Espace complet de finance véhicule avec tendance à vie, événements, ROI et historique des coûts opérationnels.')}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[1.25rem] border border-emerald-100 bg-emerald-50/80 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">{tr('Revenue', 'Revenus')}</p>
                <p className="mt-2 text-lg font-bold text-emerald-700">{formatCompact(vehicleFinanceData.lifetimeRevenue)} MAD</p>
              </div>
              <div className="rounded-[1.25rem] border border-rose-100 bg-rose-50/80 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-700">{tr('Costs', 'Coûts')}</p>
                <p className="mt-2 text-lg font-bold text-rose-700">{formatCompact(displayLifetimeTotalCosts)} MAD</p>
              </div>
              <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">{tr('Profit', 'Profit')}</p>
                <p className={`mt-2 text-lg font-bold ${displayGrossProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{displayGrossProfit >= 0 ? '+' : ''}{formatCompact(displayGrossProfit)} MAD</p>
              </div>
              <div className="rounded-[1.25rem] border border-slate-200 bg-white px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">{tr('Performance', 'Performance')}</p>
                <div className="mt-2 flex items-center gap-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{tr('Margin', 'Marge')}</p>
                    <p className={`text-base font-bold ${vehicleMarginPercent >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{formatPercent(vehicleMarginPercent)}</p>
                  </div>
                  <div className="h-8 w-px bg-slate-200" />
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{tr('ROI', 'ROI')}</p>
                    <p className={`text-base font-bold ${vehicleRoiPercent >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{formatPercent(vehicleRoiPercent)}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-violet-100 p-3 text-violet-700">
                  <TrendingUp className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{tr('Lifetime flow summary', 'Résumé des flux à vie')}</h3>
                  <p className="text-sm text-slate-600">{tr('The real finance picture for this vehicle, without leaving the Vehicle Finance tab.', 'La vraie lecture financière de ce véhicule, sans quitter l’onglet Finance véhicule.')}</p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
                {lifetimeFlowSummary.map((item) => {
                  const Icon = item.icon;
                  const toneClasses = item.tone === 'emerald'
                    ? 'border-emerald-100 bg-emerald-50/80 text-emerald-700'
                    : item.tone === 'rose'
                      ? 'border-rose-100 bg-rose-50/80 text-rose-700'
                      : 'border-violet-100 bg-violet-50/80 text-violet-700';
                  return (
                    <div key={item.key} className={`rounded-[1.5rem] border p-4 ${toneClasses}`}>
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em]">{item.label}</p>
                        <div className="rounded-xl bg-white/80 p-2 shadow-sm">
                          <Icon className="h-4 w-4" />
                        </div>
                      </div>
                      <p className="mt-4 text-2xl font-bold">{item.amount >= 0 ? '' : '-'}{formatCompact(Math.abs(item.amount))} MAD</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-sky-100 p-3 text-sky-700">
                  <Activity className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{tr('Net trend by period', 'Tendance nette par période')}</h3>
                  <p className="text-sm text-slate-600">{tr('Recent trend points already computed by the finance engine for this vehicle.', 'Points de tendance récents déjà calculés par le moteur finance pour ce véhicule.')}</p>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {trendPoints.length > 0 ? trendPoints.map((point) => {
                  const positive = point.netMargin >= 0;
                  const width = `${Math.max(8, (Math.abs(point.netMargin || 0) / trendMax) * 100)}%`;
                  return (
                    <div key={point.date} className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-700">{new Date(point.date).toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { month: 'short', year: 'numeric' })}</p>
                        <span className={`text-sm font-bold ${positive ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {positive ? '+' : ''}{formatCompact(point.netMargin)} MAD
                        </span>
                      </div>
                      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
                        <div className={`h-full rounded-full ${positive ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width }} />
                      </div>
                    </div>
                  );
                }) : (
                  <div className="md:col-span-2 xl:col-span-3 rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
                    {tr('No trend points available yet for this vehicle.', 'Aucun point de tendance disponible pour ce véhicule pour le moment.')}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-amber-100 p-3 text-amber-700">
                  <ReceiptText className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{tr('Vehicle finance event timeline', 'Chronologie des événements financiers du véhicule')}</h3>
                  <p className="text-sm text-slate-600">{tr('Revenue, maintenance, fuel, inventory, and taxes that shaped this vehicle over time.', 'Revenus, maintenance, carburant, stock et taxes qui ont façonné ce véhicule dans le temps.')}</p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {timelineEvents.length > 0 ? timelineEvents.map((event, index) => {
                  const totalCosts = (event.maintenanceCost || 0) + (event.fuelCost || 0) + (event.inventoryCost || 0) + (event.otherCost || 0);
                  return (
                    <div key={`${event.source}-${event.date}-${index}`} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">{event.eventType}</span>
                            {event.href ? (
                              <button
                                type="button"
                                onClick={() => window.location.href = event.href}
                                className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700 transition hover:bg-violet-200 hover:text-violet-900"
                                title={tr('Open linked rental', 'Ouvrir la location liée')}
                              >
                                {event.source}
                                <ExternalLink className="h-3 w-3" />
                              </button>
                            ) : (
                              <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">{event.source}</span>
                            )}
                          </div>
                          <p className="mt-3 text-sm font-semibold text-slate-900">
                            {new Date(event.date).toLocaleDateString(isFrench ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                          <div className="rounded-xl bg-white px-3 py-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{tr('Revenue', 'Revenus')}</p>
                            <p className="mt-1 font-semibold text-emerald-700">{formatCompact(event.revenue || 0)} MAD</p>
                          </div>
                          <div className="rounded-xl bg-white px-3 py-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{tr('Costs', 'Coûts')}</p>
                            <p className="mt-1 font-semibold text-rose-700">{formatCompact(totalCosts)} MAD</p>
                          </div>
                          <div className="rounded-xl bg-white px-3 py-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{tr('Tax', 'Taxe')}</p>
                            <p className="mt-1 font-semibold text-amber-700">{formatCompact(event.tax || 0)} MAD</p>
                          </div>
                          <div className="rounded-xl bg-white px-3 py-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{tr('Net', 'Net')}</p>
                            <p className={`mt-1 font-semibold ${(event.net || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                              {(event.net || 0) >= 0 ? '+' : ''}{formatCompact(event.net || 0)} MAD
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
                    {tr('No finance events are available for this vehicle yet.', "Aucun événement financier n'est encore disponible pour ce véhicule.")}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
                  <WalletCards className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{tr('Performance ratios', 'Ratios de performance')}</h3>
                  <p className="text-sm text-slate-600">{tr('Quick lifetime ratios for operational decision-making.', 'Ratios à vie rapides pour la prise de décision opérationnelle.')}</p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{tr('Profit margin', 'Marge bénéficiaire')}</p>
                  <p className={`mt-2 text-2xl font-bold ${vehicleMarginPercent >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{formatPercent(vehicleMarginPercent)}</p>
                </div>
                <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{tr('Return on costs', 'Retour sur coûts')}</p>
                  <p className={`mt-2 text-2xl font-bold ${vehicleRoiPercent >= 0 ? 'text-sky-700' : 'text-rose-700'}`}>{formatPercent(vehicleRoiPercent)}</p>
                </div>
                <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{tr('Utilization', 'Utilisation')}</p>
                  <p className="mt-2 text-2xl font-bold text-violet-700">{formatPercent(vehicleFinanceData.utilizationPercent)}</p>
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-orange-100 p-3 text-orange-700">
                  <BarChart3 className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{tr('Lifetime cost mix', 'Mix des coûts à vie')}</h3>
                  <p className="text-sm text-slate-600">{tr('See which type of cost is driving this vehicle most.', 'Voyez quel type de coût pèse le plus sur ce véhicule.')}</p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {[
                  { key: 'maintenance', label: tr('Maintenance', 'Maintenance'), amount: vehicleFinanceData.lifetimeMaintenanceCosts, tone: 'orange', icon: Wrench },
                  { key: 'fuel', label: tr('Fuel', 'Carburant'), amount: vehicleFinanceData.lifetimeFuelCosts, tone: 'purple', icon: Fuel },
                  { key: 'inventory', label: tr('Inventory', 'Inventaire'), amount: vehicleFinanceData.lifetimeInventoryCosts, tone: 'blue', icon: Package },
                  { key: 'acquisition', label: tr('Acquisition', 'Acquisition'), amount: lifetimeAcquisitionCost, tone: 'slate', icon: Car },
                  { key: 'other', label: tr('Other', 'Autres'), amount: Math.max(0, vehicleFinanceData.lifetimeOtherCosts - financeAcquisitionCost), tone: 'slate', icon: MoreHorizontal }
                ].map((item) => {
                  const Icon = item.icon;
                  const amountPercent = (item.amount / Math.max(displayLifetimeTotalCosts, 1)) * 100;
                  const tone = item.tone === 'orange'
                    ? 'bg-orange-50 border-orange-100 text-orange-700'
                    : item.tone === 'purple'
                      ? 'bg-purple-50 border-purple-100 text-purple-700'
                      : item.tone === 'blue'
                        ? 'bg-blue-50 border-blue-100 text-blue-700'
                        : 'bg-slate-50 border-slate-200 text-slate-700';
                  return (
                    <div key={item.key} className={`rounded-[1.25rem] border px-4 py-4 ${tone}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="rounded-xl bg-white p-2 shadow-sm">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="font-semibold">{item.label}</p>
                            <p className="text-sm opacity-80">{formatPercent(amountPercent)} {tr('of total costs', 'des coûts totaux')}</p>
                          </div>
                        </div>
                        <p className="text-lg font-bold">{formatCompact(item.amount)} MAD</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-violet-100 p-3 text-violet-700">
                  <ExternalLink className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{tr('Operational links', 'Liens opérationnels')}</h3>
                  <p className="text-sm text-slate-600">{tr('Jump into related records from this full vehicle P&L page.', 'Accédez aux enregistrements liés depuis cette page P&L véhicule.')}</p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                <button
                  type="button"
                  onClick={() => window.location.href = `/admin/fleet/${detailVehicleId}`}
                  className="flex w-full items-center justify-between rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-violet-200 hover:bg-white"
                >
                  <div className="flex items-center gap-3">
                    <Car className="h-5 w-5 text-violet-700" />
                    <span className="font-semibold text-slate-900">{tr('Open vehicle profile', 'Ouvrir le profil véhicule')}</span>
                  </div>
                  <ExternalLink className="h-4 w-4 text-slate-400" />
                </button>
                <button
                  type="button"
                  onClick={() => window.location.href = '/admin/maintenance'}
                  className="flex w-full items-center justify-between rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-violet-200 hover:bg-white"
                >
                  <div className="flex items-center gap-3">
                    <Wrench className="h-5 w-5 text-violet-700" />
                    <span className="font-semibold text-slate-900">{tr('Open maintenance records', 'Ouvrir les dossiers maintenance')}</span>
                  </div>
                  <ExternalLink className="h-4 w-4 text-slate-400" />
                </button>
                <button
                  type="button"
                  onClick={() => window.location.href = '/admin/rentals'}
                  className="flex w-full items-center justify-between rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-violet-200 hover:bg-white"
                >
                  <div className="flex items-center gap-3">
                    <ReceiptText className="h-5 w-5 text-violet-700" />
                    <span className="font-semibold text-slate-900">{tr('Open rental history', 'Ouvrir l’historique des locations')}</span>
                  </div>
                  <ExternalLink className="h-4 w-4 text-slate-400" />
                </button>
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-[1.5rem] border border-violet-100/80 bg-white p-4 shadow-[0_16px_40px_rgba(76,29,149,0.08)]">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">{tr('Vehicle Finance', 'Finance véhicule')}</p>
            <h3 className="mt-1 text-xl font-bold tracking-tight text-slate-900">{tr('Vehicle lifetime finance', 'Finance véhicule à vie')}</h3>
          </div>

          <div className="rounded-full border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs font-medium text-slate-600">
            <span className="font-semibold text-slate-900">{tr('Lifetime performance per vehicle', 'Performance à vie par véhicule')}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 xl:grid-cols-2 2xl:grid-cols-3">
        {visibleVehicleCards.map((vehicle) => {
          const isSelected = selectedVehicleSet.has(String(vehicle.vehicleId));
          const profitPositive = vehicle.profit >= 0;
          return (
            <button
              key={vehicle.vehicleId}
              type="button"
              onClick={() => handleVehicleSelection(vehicle.vehicleId)}
              className={`rounded-[1.25rem] border px-4 py-3 text-left shadow-sm transition-all ${
                isSelected
                  ? 'border-slate-400 bg-slate-50 shadow-[0_16px_36px_rgba(15,23,42,0.08)]'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-[0_14px_32px_rgba(15,23,42,0.06)]'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className={`mt-0.5 rounded-xl p-2 ${isSelected ? 'bg-slate-200 text-slate-800' : 'bg-slate-100 text-slate-600'}`}>
                    <Car className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <p className="truncate text-base font-bold text-slate-900">{vehicle.plateNumber}</p>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{vehicle.status}</span>
                      {isSelected && (
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">{tr('Selected', 'Sélectionné')}</span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs font-medium text-slate-500">{vehicle.make} {vehicle.model}</p>
                  </div>
                </div>

                <div className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${profitPositive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                  {profitPositive ? '+' : ''}{vehicle.profitMargin.toFixed(1)}%
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 divide-x divide-slate-100 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="pr-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{tr('Revenue', 'Revenus')}</p>
                  <p className="mt-1 text-sm font-bold text-emerald-700">{formatCompact(vehicle.revenue)} MAD</p>
                </div>
                <div className="px-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{tr('Expenses', 'Dépenses')}</p>
                  <p className="mt-1 text-sm font-bold text-rose-700">{formatCompact(vehicle.totalCosts)} MAD</p>
                </div>
                <div className="pl-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{tr('Net', 'Net')}</p>
                  <p className={`mt-1 text-sm font-bold ${profitPositive ? 'text-emerald-700' : 'text-rose-700'}`}>{profitPositive ? '+' : ''}{formatCompact(vehicle.profit)} MAD</p>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <Wrench className="h-3.5 w-3.5" />
                  {tr('Maintenance', 'Maintenance')}: <span className="font-semibold text-slate-700">{formatCompact(vehicle.maintenanceCosts)} MAD</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <Fuel className="h-3.5 w-3.5" />
                  {tr('Fuel', 'Carburant')}: <span className="font-semibold text-slate-700">{formatCompact(vehicle.fuelCosts)} MAD</span>
                  {vehicle.fuelConsumedLiters > 0 && (
                    <span className="text-slate-400">({vehicle.fuelConsumedLiters.toFixed(2)}L)</span>
                  )}
                </span>
                {vehicle.acquisitionCosts > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Car className="h-3.5 w-3.5" />
                    {tr('Acquisition', 'Acquisition')}: <span className="font-semibold text-slate-700">{formatCompact(vehicle.acquisitionCosts)} MAD</span>
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Vehicle Finance Metrics */}
      {selectedVehicleIds.length > 0 && (
        <>
          {dataLoading ? (
            <div className="rounded-[2rem] border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
              <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                <div className="text-5xl leading-none animate-pulse">⏳</div>
                <h3 className="text-xl font-semibold text-slate-900">{tr('Loading selected vehicle details...', 'Chargement des détails du véhicule sélectionné...')}</h3>
              </div>
            </div>
          ) : error ? (
            <div className="rounded-[1.75rem] border border-rose-200 bg-rose-50 p-6">
              <div className="flex items-center space-x-3">
                <div className="rounded-2xl bg-rose-100 p-3">
                  <BarChart3 className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-red-900">{tr('Error Loading Vehicle Data', 'Erreur lors du chargement des données véhicule')}</h3>
                  <p className="text-sm text-red-700 mt-1">{error}</p>
                </div>
              </div>
            </div>
          ) : vehicleFinanceData ? (
            <div className="space-y-6">
              <div className="rounded-[2rem] border border-violet-100/80 bg-white p-5 shadow-[0_20px_55px_rgba(76,29,149,0.08)]">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">{tr('Selected Vehicle Detail', 'Détail du véhicule sélectionné')}</p>
                    <h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                      {(selectedVehicle?.plate_number || selectedVehicle?.plate || selectedVehicleCard?.plateNumber || `Vehicle-${selectedVehicle?.id || selectedVehicleCard?.vehicleId}`)}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {(selectedVehicle?.make || selectedVehicle?.name || selectedVehicleCard?.make || 'SEGWAY')} {(selectedVehicle?.model || selectedVehicleCard?.model || 'AT6')} • {tr('Lifetime performance breakdown', 'Détail de performance à vie')}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => setDetailPageOpen(true)}
                      className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(109,40,217,0.24)] transition hover:opacity-95"
                    >
                      <BarChart3 className="h-4 w-4" />
                      {tr('View Full P&L', 'Voir le P&L complet')}
                    </button>
                    <button
                      type="button"
                      onClick={() => window.location.href = `/admin/fleet/${selectedVehicle?.id || selectedVehicleCard?.vehicleId}`}
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-violet-200 hover:text-violet-700"
                    >
                      <Car className="h-4 w-4" />
                      {tr('Open Vehicle', 'Ouvrir véhicule')}
                    </button>
                    <button
                      type="button"
                      onClick={() => window.location.href = '/admin/maintenance'}
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-violet-200 hover:text-violet-700"
                    >
                      <Wrench className="h-4 w-4" />
                      {tr('Open Maintenance', 'Ouvrir maintenance')}
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-[1.5rem] border border-emerald-100 bg-emerald-50/80 p-5" title={tr('Total revenue generated by this vehicle since acquisition', "Total des revenus générés par ce véhicule depuis son acquisition")}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">{tr('Lifetime Revenue', 'Revenus à vie')}</p>
                      <p className="mt-2 text-3xl font-bold text-emerald-700">{formatCompact(vehicleFinanceData.lifetimeRevenue)}</p>
                      <p className="mt-1 text-xs text-emerald-700/80">{tr('MAD (real data from rentals)', 'MAD (données réelles des locations)')}</p>
                    </div>
                    <div className="rounded-2xl bg-white p-3 text-emerald-700">
                      <DollarSign className="w-7 h-7" />
                    </div>
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-rose-100 bg-rose-50/80 p-5" title={tr('Total operational costs for this vehicle since acquisition', "Coûts opérationnels totaux de ce véhicule depuis son acquisition")}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium uppercase tracking-wide text-rose-700">{tr('Lifetime Costs', 'Coûts à vie')}</p>
                      <p className="mt-2 text-3xl font-bold text-rose-700">{formatCompact(displayLifetimeTotalCosts)}</p>
                      <p className="mt-1 text-xs text-rose-700/80">{tr('MAD (live cost logs)', 'MAD (journaux de coûts en direct)')}</p>
                    </div>
                    <div className="rounded-2xl bg-white p-3 text-rose-700">
                      <BarChart3 className="w-7 h-7" />
                    </div>
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5" title={tr('Lifetime revenue minus all operational costs', 'Revenus à vie moins tous les coûts opérationnels')}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium uppercase tracking-wide text-slate-600">{tr('Gross Profit', 'Profit brut')}</p>
                      <p className={`mt-2 text-3xl font-bold ${displayGrossProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{formatCompact(displayGrossProfit)}</p>
                      <p className="mt-1 text-xs text-slate-500">{tr('MAD (calculated automatically)', 'MAD (calculé automatiquement)')}</p>
                    </div>
                    <div className="rounded-2xl bg-white p-3 text-slate-700">
                      <TrendingUp className="w-7 h-7" />
                    </div>
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5" title={tr('Margin and return on costs over the vehicle lifetime', 'Marge et retour sur coûts sur toute la durée de vie du véhicule')}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium uppercase tracking-wide text-slate-600">{tr('Performance', 'Performance')}</p>
                      <div className="mt-3 grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{tr('Margin', 'Marge')}</p>
                          <p className={`mt-1 text-xl font-bold ${vehicleMarginPercent >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{formatPercent(vehicleMarginPercent)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{tr('ROI', 'ROI')}</p>
                          <p className={`mt-1 text-xl font-bold ${vehicleRoiPercent >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{formatPercent(vehicleRoiPercent)}</p>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3 text-slate-700">
                      <Activity className="w-7 h-7" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center space-x-3 mb-5">
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <BarChart3 className="w-6 h-6 text-slate-700" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">{tr('Lifetime cost breakdown', 'Répartition des coûts à vie')}</h3>
                    <p className="text-sm text-slate-600">{tr('Main cost drivers for this vehicle.', 'Principaux coûts qui pèsent sur ce véhicule.')}</p>
                  </div>
                </div>
                
                <div className="space-y-3">
                  {[
                    { key: 'maintenance', label: tr('Maintenance', 'Maintenance'), amount: vehicleFinanceData.lifetimeMaintenanceCosts, icon: Wrench },
                    { key: 'fuel', label: tr('Fuel', 'Carburant'), amount: vehicleFinanceData.lifetimeFuelCosts, icon: Fuel, helper: vehicleFinanceData.lifetimeFuelConsumedLiters > 0 ? `${vehicleFinanceData.lifetimeFuelConsumedLiters.toFixed(2)}L ${tr('consumed lifetime', 'consommés à vie')}` : '' },
                    { key: 'inventory', label: tr('Parts / inventory', 'Pièces / stock'), amount: vehicleFinanceData.lifetimeInventoryCosts, icon: Package },
                    { key: 'acquisition', label: tr('Acquisition', 'Acquisition'), amount: lifetimeAcquisitionCost, icon: Car, helper: tr('Purchase cost from vehicle profile', 'Coût d’achat depuis le profil véhicule') },
                    { key: 'other', label: tr('Other', 'Autres'), amount: Math.max(0, vehicleFinanceData.lifetimeOtherCosts - financeAcquisitionCost), icon: MoreHorizontal }
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.key} className="rounded-[1.1rem] border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="rounded-xl bg-white p-2 text-slate-600">
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900">{item.label}</p>
                              {item.helper && <p className="mt-1 text-xs font-medium text-slate-500">{item.helper}</p>}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-rose-700">{formatCompact(item.amount)} MAD</p>
                            <p className="text-xs text-slate-500">
                              {((item.amount / Math.max(vehicleFinanceData.lifetimeRevenue, 1)) * 100).toFixed(1)}% {tr('of revenue', 'du revenu')}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-violet-100 p-3">
                      <WalletCards className="h-6 w-6 text-violet-700" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">{tr('Vehicle finance quick actions', 'Actions rapides finance véhicule')}</h3>
                    <p className="text-sm text-slate-600">{tr('Open the related operational areas from the selected vehicle finance context.', "Ouvrez les zones opérationnelles liées depuis le contexte finance du véhicule sélectionné.")}</p>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  <button
                    type="button"
                    onClick={() => window.location.href = `/admin/fleet/${selectedVehicle?.id || selectedVehicleCard?.vehicleId}`}
                    className="flex w-full items-center justify-between rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-violet-200 hover:bg-white"
                  >
                    <div className="flex items-center gap-3">
                      <Car className="h-5 w-5 text-violet-700" />
                      <div>
                        <p className="font-semibold text-slate-900">{tr('Open vehicle profile', 'Ouvrir le profil véhicule')}</p>
                        <p className="text-sm text-slate-500">{tr('See fleet profile and live vehicle state.', 'Voir le profil flotte et l’état véhicule en direct.')}</p>
                      </div>
                    </div>
                    <ExternalLink className="h-4 w-4 text-slate-400" />
                  </button>

                  <button
                    type="button"
                    onClick={() => window.location.href = '/admin/maintenance'}
                    className="flex w-full items-center justify-between rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-violet-200 hover:bg-white"
                  >
                    <div className="flex items-center gap-3">
                      <Wrench className="h-5 w-5 text-violet-700" />
                      <div>
                        <p className="font-semibold text-slate-900">{tr('Open maintenance records', 'Ouvrir les dossiers maintenance')}</p>
                        <p className="text-sm text-slate-500">{tr('Review costs and recovery linked to this vehicle.', 'Vérifier les coûts et récupérations liés à ce véhicule.')}</p>
                      </div>
                    </div>
                    <ExternalLink className="h-4 w-4 text-slate-400" />
                  </button>

                  <button
                    type="button"
                    onClick={() => window.location.href = '/admin/rentals'}
                    className="flex w-full items-center justify-between rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-violet-200 hover:bg-white"
                  >
                    <div className="flex items-center gap-3">
                      <ReceiptText className="h-5 w-5 text-violet-700" />
                      <div>
                        <p className="font-semibold text-slate-900">{tr('Open rental history', 'Ouvrir l’historique des locations')}</p>
                        <p className="text-sm text-slate-500">{tr('Cross-check revenue and contract history.', 'Croiser les revenus et l’historique des contrats.')}</p>
                      </div>
                    </div>
                    <ExternalLink className="h-4 w-4 text-slate-400" />
                  </button>
                </div>
              </div>
              </div>
            </div>
          ) : null}
        </>
      )}

      {vehicleProfitData.length > 0 && (
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center space-x-3 mb-6">
            <div className="rounded-2xl bg-emerald-100 p-3">
              <TrendingUp className="w-6 h-6 text-emerald-700" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{tr('Fleet profitability ranking', 'Classement de rentabilité flotte')}</h3>
              <p className="text-sm text-slate-600">{tr('Quick ranking across the whole fleet, while the cards above stay the main reading surface.', "Classement rapide sur l’ensemble de la flotte, tandis que les cartes ci-dessus restent la surface de lecture principale.")}</p>
            </div>
          </div>
          
          <div className="space-y-3">
            {vehicleProfitData.slice(0, 5).map((vehicle, index) => (
              <div key={vehicle.vehicleId} className="flex items-center justify-between rounded-[1.25rem] border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="flex items-center space-x-4">
                  <div className={`
                    w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white
                    ${index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : index === 2 ? 'bg-orange-500' : 'bg-blue-500'}
                  `}>
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900" title={tr('Vehicle plate number and model', 'Numéro de plaque et modèle du véhicule')}>
                      {vehicle.plateNumber} - {vehicle.make} {vehicle.model}
                    </p>
                    <p className="text-sm text-slate-600">
                      {tr('Revenue:', 'Revenus :')} {formatCurrency(vehicle.revenue)} MAD • {tr('Profit:', 'Profit :')} {formatCurrency(vehicle.profit)} MAD
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center space-x-2">
                    {vehicle.profitMargin >= 0 ? (
                      <ArrowUpRight className="w-4 h-4 text-green-600" />
                    ) : (
                      <ArrowDownRight className="w-4 h-4 text-red-600" />
                    )}
                    <span className={`font-bold ${vehicle.profitMargin >= 0 ? 'text-green-600' : 'text-red-600'}`} title={tr('Lifetime profit margin percentage', 'Pourcentage de marge bénéficiaire à vie')}>
                      {vehicle.profitMargin.toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{tr('Lifetime margin', 'Marge à vie')}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default VehicleFinanceTabV2;
