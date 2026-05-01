import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Fuel, 
  Plus, 
  Minus, 
  Droplets, 
  Gauge, 
  TrendingUp, 
  Car, 
  AlertTriangle,
  Calendar,
  DollarSign,
  MapPin,
  User,
  Eye,
  Trash2
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import FuelFiltersPanel from './fuel/FuelFiltersPanel';
import FuelTransactionsList from './fuel/FuelTransactionsList';
import AddFuelTransactionModal from './fuel/AddFuelTransactionModal';
import TransactionDetailsModal from './fuel/TransactionDetailsModal';
import FuelTransactionService from '../services/FuelTransactionService';
import appWarmupService from '../services/AppWarmupService';
import useFuelRealtimeSync from '../hooks/useFuelRealtimeSync';
import { roundTo } from '../utils/fuelMath';
import { formatLiters, roundFuelLitersForDisplay } from '../utils/formatters';
import { formatVehicleLabel, formatVehicleNameWithModel } from '../utils/vehicleLabels';
import { getFuelTransactionVisual } from '../utils/fuelVisuals';
import { useAuth } from '../contexts/AuthContext';
import AdminModuleHero from './admin/AdminModuleHero';
import { canAdjustFuelTankLevel } from '../utils/permissionHelpers';
import i18n from '../i18n';

const scheduleBackgroundTask = (callback) => {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    return window.requestIdleCallback(callback, { timeout: 700 });
  }

  return window.setTimeout(callback, 0);
};

const VEHICLE_BOARD_CACHE_KEY = 'fuel:vehicle-board:snapshot';
const VEHICLE_BOARD_CACHE_TTL_MS = 2 * 60 * 1000;
const TANK_HISTORY_PAGE_SIZE = 20;

const readCachedVehicleBoardSnapshot = () => {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.sessionStorage.getItem(VEHICLE_BOARD_CACHE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.data)) return [];
    if (Date.now() - Number(parsed.timestamp || 0) > VEHICLE_BOARD_CACHE_TTL_MS) return [];

    return parsed.data;
  } catch (_error) {
    return [];
  }
};

const writeCachedVehicleBoardSnapshot = (vehicleStates) => {
  if (
    typeof window === 'undefined' ||
    !Array.isArray(vehicleStates) ||
    vehicleStates.length === 0 ||
    shouldHydrateVehicleBoardWithFullStates(vehicleStates)
  ) {
    return;
  }

  try {
    window.sessionStorage.setItem(
      VEHICLE_BOARD_CACHE_KEY,
      JSON.stringify({
        timestamp: Date.now(),
        data: vehicleStates,
      })
    );
  } catch (_error) {
    // Ignore storage write issues
  }
};

const shouldHydrateVehicleBoardWithFullStates = (vehicleStates) => {
  if (!Array.isArray(vehicleStates) || vehicleStates.length === 0) return true;

  return !vehicleStates.some((vehicle) => {
    const hasMeaningfulLines = Number(vehicle?.current_fuel_lines || 0) > 0;
    const hasMeaningfulLiters = Number(vehicle?.current_fuel_liters || 0) > 0;
    const hasKnownSource =
      vehicle?.last_fuel_source &&
      String(vehicle.last_fuel_source).toLowerCase() !== 'unknown';
    const hasUpdateTimestamp = Boolean(vehicle?.last_fuel_update_at);

    return hasMeaningfulLines || hasMeaningfulLiters || hasKnownSource || hasUpdateTimestamp;
  });
};

const FuelManagement = () => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const location = useLocation();
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const warmFuelSnapshot = appWarmupService.getWarmFuelSnapshot();
  const cachedOverviewSummary = warmFuelSnapshot?.overviewSummary || null;
  const cachedOverview = FuelTransactionService.getCachedFuelOverview({
    recentRefillsLimit: 8,
    recentWithdrawalsLimit: 8,
    includeVehicleStates: false,
  }) || warmFuelSnapshot?.overview;
  const cachedVehicleStatesRaw = FuelTransactionService.getCachedVehicleFuelStates() || cachedOverviewSummary?.vehicleStates || warmFuelSnapshot?.vehicleStates || readCachedVehicleBoardSnapshot();
  const cachedVehicleStates = shouldHydrateVehicleBoardWithFullStates(cachedVehicleStatesRaw)
    ? []
    : cachedVehicleStatesRaw;
  const cachedPrefetchedTransactionPage = FuelTransactionService.getCachedDefaultTransactions(20, 0) || warmFuelSnapshot?.prefetchedTransactions;
  const hasWarmVehicleBoard =
    Array.isArray(cachedVehicleStates) &&
    cachedVehicleStates.length > 0;
  const hasWarmFuelOverview =
    Boolean((cachedOverviewSummary?.tank || cachedOverview?.tank)) &&
    hasWarmVehicleBoard &&
    Boolean(cachedPrefetchedTransactionPage?.success);
  const cachedQuickOverviewTransactions = hasWarmFuelOverview ? (cachedPrefetchedTransactionPage?.transactions || []) : [];
  const cachedFallbackOverviewTransactions = (cachedOverview?.refills || [])
    .map((transaction) =>
      FuelTransactionService.mapTransactionRecord({
        ...transaction,
        id: transaction.id ? `refill-${transaction.id}` : transaction.id,
      })
    )
    .concat(
      (cachedOverview?.withdrawals || []).map((transaction) =>
        FuelTransactionService.mapTransactionRecord({
          ...transaction,
          id: transaction.id ? `withdrawal-${transaction.id}` : transaction.id,
        })
      )
    )
    .sort((a, b) => new Date(b.transaction_date || 0) - new Date(a.transaction_date || 0))
    .slice(0, 24);
  const hasWarmFuelShell = Boolean(cachedOverview?.tank);
  const [activeTab, setActiveTab] = useState('overview');
  const [fuelData, setFuelData] = useState({
    tank: hasWarmFuelShell ? (cachedOverviewSummary?.tank || cachedOverview?.tank || null) : null,
    refills: hasWarmFuelShell ? (cachedOverviewSummary?.refills || cachedOverview?.refills || []) : [],
    withdrawals: hasWarmFuelShell ? (cachedOverviewSummary?.withdrawals || cachedOverview?.withdrawals || []) : []
  });
  const [recentOverviewTransactions, setRecentOverviewTransactions] = useState(
    cachedQuickOverviewTransactions.length > 0 ? cachedQuickOverviewTransactions : cachedFallbackOverviewTransactions
  );
  const [prefetchedTransactionPage, setPrefetchedTransactionPage] = useState(cachedPrefetchedTransactionPage || null);
  const [historyHydrated, setHistoryHydrated] = useState(
    Boolean(cachedPrefetchedTransactionPage || cachedFallbackOverviewTransactions.length > 0)
  );
  const [vehicles, setVehicles] = useState([]);
  const [vehicleStates, setVehicleStates] = useState(hasWarmVehicleBoard ? cachedVehicleStates : []);
  const [loading, setLoading] = useState(!hasWarmFuelShell);
  const [vehicleBoardLoading, setVehicleBoardLoading] = useState(!hasWarmVehicleBoard);
  const [tablesExist, setTablesExist] = useState(true); // Default to true, will be checked

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showVehicleActionModal, setShowVehicleActionModal] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [editTransaction, setEditTransaction] = useState(null);
  const [transactionType, setTransactionType] = useState('refill');
  const [prefilledVehicleId, setPrefilledVehicleId] = useState('');
  const [selectedVehicleActionTarget, setSelectedVehicleActionTarget] = useState(null);
  const [isEditingTankCapacity, setIsEditingTankCapacity] = useState(false);
  const [isEditingTankLevel, setIsEditingTankLevel] = useState(false);
  const [tankCapacityInput, setTankCapacityInput] = useState('500');
  const [tankLevelInput, setTankLevelInput] = useState('0');
  const [tankAdjustReason, setTankAdjustReason] = useState('');
  const [tankAdjustNote, setTankAdjustNote] = useState('');
  const [isSavingTankLevel, setIsSavingTankLevel] = useState(false);
  const [showRecentRefills, setShowRecentRefills] = useState(false);
  const [showRecentWithdrawals, setShowRecentWithdrawals] = useState(false);
  const [deletingTankTransactionIds, setDeletingTankTransactionIds] = useState(new Set());
  const [confirmingTankDeleteId, setConfirmingTankDeleteId] = useState(null);
  const [tankHistoryTransactions, setTankHistoryTransactions] = useState([]);
  const [tankHistoryLoading, setTankHistoryLoading] = useState(false);
  const [tankHistoryPage, setTankHistoryPage] = useState(1);

  // Filter states for transactions tab
  const [filters, setFilters] = useState({
    search: '',
    vehicleId: '',
    transactionType: '',
    fuelType: '',
    startDate: '',
    endDate: '',
    fuelStation: '',
    location: ''
  });

  useEffect(() => {
    loadFuelData();
    loadVehicleBoard();
    const backgroundTask = scheduleBackgroundTask(() => {
      checkDatabaseSetup();
    });

    return () => {
      if (typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(backgroundTask);
      } else {
        clearTimeout(backgroundTask);
      }
    };
  }, []);

  useEffect(() => {
    const requestedTab = location.state?.activeTab;
    const requestedFilters = location.state?.fuelFilters;

    if (requestedTab) {
      setActiveTab(requestedTab);
    }

    if (requestedFilters) {
      setFilters((current) => ({
        ...current,
        ...requestedFilters,
      }));
    }
  }, [location.state]);

  useEffect(() => {
    if ((activeTab === 'transactions' || activeTab === 'fuel-tank') && !historyHydrated) {
      hydrateMergedFuelHistory();
    }
  }, [activeTab, historyHydrated]);

  useEffect(() => {
    if (activeTab === 'fuel-tank') {
      loadTankHistoryData();
    }
  }, [activeTab]);

  useEffect(() => {
    if (
      vehicles.length > 0 ||
      (activeTab === 'overview' && !showAddModal && !showVehicleActionModal && !showDetailsModal)
    ) {
      return;
    }

    loadVehicles();
  }, [activeTab, showAddModal, showDetailsModal, showVehicleActionModal, vehicles.length]);

  const checkDatabaseSetup = async () => {
    try {
      const tablesCheck = await FuelTransactionService.checkTablesExist();
      setTablesExist(tablesCheck.allTablesExist);
    } catch (error) {
      console.error('Error checking database setup:', error);
      setTablesExist(false);
    }
  };

  const loadVehicles = async () => {
    try {
      const { data, error } = await supabase
        .from('saharax_0u4w4d_vehicles')
        .select('id, name, plate_number, model, vehicle_type, current_odometer')
        .order('name');

      if (error) {
        console.error('❌ Error loading vehicles:', error);
        setVehicles([]);
        return;
      }

      setVehicles(data || []);
    } catch (error) {
      console.error('❌ Error loading vehicles:', error);
      setVehicles([]);
    }
  };

  const loadVehicleBoard = async () => {
    const seededFromCache = cachedOverviewSummary?.vehicleStates?.length > 0;
    if (cachedOverviewSummary?.vehicleStates?.length) {
      setVehicleStates(cachedOverviewSummary.vehicleStates);
      writeCachedVehicleBoardSnapshot(cachedOverviewSummary.vehicleStates);
    }

    setVehicleBoardLoading((current) => current && vehicleStates.length === 0 && !seededFromCache);
    try {
      FuelTransactionService.resetFuelStateAvailability();
      const initialVehicleStates = await FuelTransactionService.getVehicleFuelStatesFast().catch(() => []);
      const resolvedVehicleStates = shouldHydrateVehicleBoardWithFullStates(initialVehicleStates)
        ? await FuelTransactionService.getVehicleFuelStates().catch(() => initialVehicleStates || [])
        : (initialVehicleStates || []);

      setVehicleStates(resolvedVehicleStates || []);
      writeCachedVehicleBoardSnapshot(resolvedVehicleStates || []);
      appWarmupService.setWarmFuelSnapshot({
        ...warmFuelSnapshot,
        vehicleStates: resolvedVehicleStates || [],
        overviewSummary: cachedOverviewSummary
          ? {
              ...cachedOverviewSummary,
              vehicleStates: resolvedVehicleStates || [],
            }
          : cachedOverviewSummary,
      });
    } catch (error) {
      console.error('Error loading vehicle fuel board:', error);
      if (!vehicleStates.length) {
        setVehicleStates([]);
      }
    } finally {
      setVehicleBoardLoading(false);
    }
  };

  const loadFuelData = async () => {
    setLoading((current) => current && !fuelData?.tank);
    try {
      const summary = await FuelTransactionService.getFuelOverviewSummary({
          recentRefillsLimit: 8,
          recentWithdrawalsLimit: 8,
        });

      setFuelData({
        tank: summary?.tank || null,
        refills: summary?.refills || [],
        withdrawals: summary?.withdrawals || [],
      });
      setRecentOverviewTransactions(summary?.recentTransactions || []);
      setPrefetchedTransactionPage(
        summary?.recentTransactions?.length
          ? {
              success: true,
              transactions: summary.recentTransactions,
              totalCount: summary.recentTransactions.length,
            }
          : null
      );
      setHistoryHydrated(Boolean(summary?.recentTransactions?.length));
      setTankCapacityInput(String(summary?.tank?.capacity || 500));
      appWarmupService.setWarmFuelSnapshot({
        overview: {
          tank: summary?.tank || null,
          refills: summary?.refills || [],
          withdrawals: summary?.withdrawals || [],
        },
        vehicleStates: Array.isArray(summary?.vehicleStates) ? summary.vehicleStates : [],
        prefetchedTransactions: summary?.recentTransactions?.length
          ? {
              success: true,
              transactions: summary.recentTransactions,
              totalCount: summary.recentTransactions.length,
            }
          : null,
        overviewSummary: summary,
      });
      setLoading(false);
    } catch (error) {
      console.error('Error loading fuel data:', error);
      // Set default data on error
      if (!fuelData?.tank) {
        setFuelData({
          tank: {
            id: 'default',
            name: 'Main Tank',
            capacity: 500,
            initial_volume: 0,
            location: 'Main Depot',
            fuel_type: 'gasoline'
          },
          refills: [],
          withdrawals: []
        });
        setRecentOverviewTransactions([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const hydrateMergedFuelHistory = async () => {
    try {
      const recentTransactionsResult = await FuelTransactionService.getAllTransactions({
        limit: 24,
        offset: 0,
      });
      if (recentTransactionsResult.success) {
        setPrefetchedTransactionPage(recentTransactionsResult);
        setRecentOverviewTransactions(recentTransactionsResult.transactions || []);
      }
      setHistoryHydrated(true);
    } catch (error) {
      console.error('Error hydrating fuel history:', error);
    }
  };

  const loadTankHistoryData = async () => {
    setTankHistoryLoading(true);
    try {
      const [tankInResult, tankOutResult, manualTankResult] = await Promise.all([
        FuelTransactionService.getAllTransactions({ limit: 80, transactionType: 'tank_refill' }),
        FuelTransactionService.getAllTransactions({ limit: 80, transactionType: 'tank_out' }),
        FuelTransactionService.getAllTransactions({ limit: 40, transactionType: 'manual_tank_adjustment' }),
      ]);

      const mergedTankTransactions = [
        ...(tankInResult?.transactions || []),
        ...(tankOutResult?.transactions || []),
        ...(manualTankResult?.transactions || []),
      ];

      setTankHistoryTransactions(
        mergedTankTransactions
          .filter((transaction) =>
            ['tank_refill', 'tank_out', 'manual_tank_adjustment'].includes(transaction.transaction_type)
          )
          .sort((a, b) => new Date(b.transaction_date || 0) - new Date(a.transaction_date || 0))
      );
      setTankHistoryPage(1);
    } catch (error) {
      console.error('Error loading tank history:', error);
      setTankHistoryTransactions([]);
    } finally {
      setTankHistoryLoading(false);
    }
  };

  // Calculate current tank volume using unified logic
  const getCurrentVolume = () => {
    const liveVolume = Number(fuelData?.tank?.current_volume_liters);
    if (Number.isFinite(liveVolume)) {
      return Math.max(0, liveVolume);
    }

    return FuelTransactionService.calculateCurrentVolume(
      fuelData.tank,
      fuelData.refills,
      fuelData.withdrawals
    );
  };

  const getTankPercentage = () => {
    if (!fuelData.tank || !fuelData.tank.capacity) return 0;
    const currentVolume = getCurrentVolume();
    return Math.min((currentVolume / fuelData.tank.capacity) * 100, 100);
  };

  const getFormattedTankLiters = (amount) => formatLiters(roundTo(Number(amount) || 0, 2));

  const getTankColor = () => {
    const percentage = getTankPercentage();
    if (percentage <= 15) return 'text-red-600';
    if (percentage <= 30) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getProgressBarColor = () => {
    const percentage = getTankPercentage();
    if (percentage <= 15) return 'bg-red-500';
    if (percentage <= 30) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const refreshFuelWorkspace = useCallback(async () => {
    await Promise.allSettled([
      loadFuelData(),
      loadVehicleBoard(),
      activeTab === 'transactions' || activeTab === 'fuel-tank'
        ? hydrateMergedFuelHistory()
        : Promise.resolve(),
      activeTab === 'fuel-tank'
        ? loadTankHistoryData()
        : Promise.resolve(),
    ]);
  }, [activeTab]);

  useFuelRealtimeSync(() => {
    void refreshFuelWorkspace();
  }, {
    enabled: tablesExist !== false,
  });

  const renderTankManagementPanel = () => (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{tr('Fuel Tank', 'Reservoir carburant')}</p>
            <h3 className="mt-2 text-2xl font-semibold text-slate-950">{tr('Main Tank Status', 'Etat du reservoir principal')}</h3>
            <p className="mt-1 text-sm text-slate-600">{tr('Manage capacity and tank-only movements from one place.', 'Gerez la capacite et les mouvements du reservoir depuis un seul endroit.')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleAddTransaction('tank_refill')}
              className="rounded-2xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700"
              title={tr('Add fuel into the main tank', 'Ajouter du carburant dans le reservoir principal')}
            >
              ⛽ {tr('Tank In', 'Entree reservoir')}
            </button>
            <button
              onClick={() => handleAddTransaction('tank_out')}
              className="rounded-2xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-700"
              title={tr('Remove fuel from the main tank', 'Retirer du carburant du reservoir principal')}
            >
              🛢️ {tr('Tank Out', 'Sortie reservoir')}
            </button>
            {canEditTankLevel && (
              <button
                onClick={() => {
                  setTankLevelInput(String(roundTo(getCurrentVolume(), 2)));
                  setTankAdjustReason('');
                  setTankAdjustNote('');
                  setIsEditingTankLevel(true);
                }}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                title={tr('Owner/admin correction for the main tank level', 'Correction du niveau du reservoir par proprietaire/admin')}
              >
                {tr('Edit Tank Level', 'Modifier le niveau')}
              </button>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-600">{tr('Current Volume', 'Volume actuel')}</p>
                <p className={`mt-2 text-3xl font-bold ${getTankColor()}`}>
                  {getFormattedTankLiters(getCurrentVolume())}
                </p>
                <p className="mt-1 text-sm text-slate-500">{getTankPercentage().toFixed(1)}% {tr('full', 'rempli')}</p>
              </div>
              <div className="rounded-2xl bg-white px-4 py-3 text-right shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{tr('Capacity', 'Capacite')}</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{fuelData.tank?.capacity || 500}L</p>
              </div>
            </div>

            <div className="mt-5">
              <div className="h-5 overflow-hidden rounded-full bg-slate-200">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${getProgressBarColor()}`}
                  style={{ width: `${Math.min(getTankPercentage(), 100)}%` }}
                />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-2xl bg-white px-4 py-3">
                  <p className="text-slate-500">{tr('Available', 'Disponible')}</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{getFormattedTankLiters(getCurrentVolume())}</p>
                </div>
                <div className="rounded-2xl bg-white px-4 py-3">
                  <p className="text-slate-500">{tr('Remaining', 'Restant')}</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">
                    {getFormattedTankLiters(Math.max((fuelData.tank?.capacity || 500) - getCurrentVolume(), 0))}
                  </p>
                </div>
                <div className="rounded-2xl bg-white px-4 py-3">
                  <p className="text-slate-500">{tr('Fill Level', 'Niveau de remplissage')}</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{getTankPercentage().toFixed(1)}%</p>
                </div>
              </div>
            </div>

            {getTankPercentage() <= 15 && (
              <div className="mt-4 flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                <AlertTriangle className="h-4 w-4" />
                {tr('Low fuel alert. Tank refill recommended.', 'Alerte niveau bas. Reapprovisionnement recommande.')}
              </div>
            )}

            {isEditingTankLevel && (
              <div className="mt-4 rounded-2xl border border-violet-200 bg-white px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{tr('Adjust Tank Level', 'Ajuster le niveau du reservoir')}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {tr('Correction only. This creates a manual tank adjustment log and does not count as a finance expense.', "Correction uniquement. Cela cree un journal d'ajustement manuel et ne compte pas comme depense financiere.")}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3">
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">{tr('New tank level (L)', 'Nouveau niveau du reservoir (L)')}</span>
                    <div className="mt-2 flex items-center gap-3">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={tankLevelInput}
                        onChange={(e) => setTankLevelInput(e.target.value)}
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
                      />
                      <span className="text-sm font-semibold text-slate-500">L</span>
                    </div>
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">{tr('Reason', 'Raison')}</span>
                    <input
                      type="text"
                      value={tankAdjustReason}
                      onChange={(e) => setTankAdjustReason(e.target.value)}
                      placeholder={tr('Stock correction', 'Correction de stock')}
                      className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">{tr('Note', 'Note')}</span>
                    <textarea
                      value={tankAdjustNote}
                      onChange={(e) => setTankAdjustNote(e.target.value)}
                      placeholder={tr('Optional note', 'Note optionnelle')}
                      rows={2}
                      className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
                    />
                  </label>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={handleSaveTankLevel}
                      disabled={isSavingTankLevel}
                      className="rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSavingTankLevel ? tr('Saving...', 'Enregistrement...') : tr('Save Tank Level', 'Enregistrer le niveau')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingTankLevel(false);
                        setTankLevelInput(String(roundTo(getCurrentVolume(), 2)));
                        setTankAdjustReason('');
                        setTankAdjustNote('');
                      }}
                      className="rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                    >
                      {tr('Cancel', 'Annuler')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{tr('Tank Capacity', 'Capacite du reservoir')}</p>
                {!isEditingTankCapacity ? (
                  <p className="mt-2 text-2xl font-bold text-slate-900">{fuelData.tank?.capacity || 500}L</p>
                ) : null}
              </div>
              {!isEditingTankCapacity && (
                <button
                  type="button"
                  onClick={() => setIsEditingTankCapacity(true)}
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                >
                  {tr('Edit Capacity', 'Modifier la capacite')}
                </button>
              )}
            </div>

            {isEditingTankCapacity ? (
              <div className="mt-5 space-y-4">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Capacity (L)</span>
                  <div className="mt-2 flex items-center gap-3">
                    <input
                      type="number"
                      min="1"
                      value={tankCapacityInput}
                      onChange={(e) => setTankCapacityInput(e.target.value)}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    />
                    <span className="text-sm font-semibold text-slate-500">L</span>
                  </div>
                </label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleSaveTankCapacity}
                    className="rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTankCapacityInput(String(fuelData.tank?.capacity || 500));
                      setIsEditingTankCapacity(false);
                    }}
                    className="rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <p className="text-sm text-slate-600">Use Fuel Tank when the main reservoir capacity changes.</p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{tr('Tank Activity', 'Activité du réservoir')}</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-950">{tr('Fuel Tank Transaction History', 'Historique des transactions du réservoir')}</h3>
              <p className="mt-1 text-sm text-slate-600">
                {tr('This is the same source of truth as All Fuel Transactions, filtered to tank-only movements.', "C'est la même source de vérité que Toutes les transactions carburant, filtrée sur les mouvements du réservoir.")}
              </p>
            </div>
            <button
              type="button"
              onClick={loadTankHistoryData}
              className="rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
            >
              {tankHistoryLoading ? tr('Loading...', 'Chargement...') : tr('Refresh Tank History', "Actualiser l'historique")}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('transactions')}
              className="rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
            >
              {tr('Open Full History', "Ouvrir l'historique complet")}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">{tr('Date & Time', 'Date et heure')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">{tr('Type', 'Type')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">{tr('Amount', 'Quantité')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">{tr('Cost', 'Coût')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">{tr('By', 'Par')}</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">{tr('Actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {tankHistoryLoading ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-10 text-center text-sm text-slate-500">
                      {tr('Loading tank transactions...', 'Chargement des transactions du réservoir...')}
                    </td>
                  </tr>
                ) : getTankHistoryTransactions().length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-10 text-center text-sm text-slate-500">
                      {tr('No tank transactions recorded yet.', 'Aucune transaction de réservoir enregistrée pour le moment.')}
                    </td>
                  </tr>
	                ) : (
		                  getTankHistoryPagination().pageTransactions.map((transaction) => {
	                    const visual = getFuelTransactionVisual(transaction.transaction_type);
	                    const roundedAmount = roundFuelLitersForDisplay(transaction.amount || 0) || 0;
	                    const transactionCost =
	                      Number(transaction.cost || 0) > 0
	                        ? Number(transaction.cost || 0)
	                        : Number(transaction.unit_price || 0) > 0 && Number(transaction.amount || 0) > 0
	                          ? Number(transaction.unit_price || 0) * Number(transaction.amount || 0)
	                          : 0;
	                    const transactionUnitPrice =
	                      Number(transaction.unit_price || 0) > 0
	                        ? Number(transaction.unit_price || 0)
	                        : transactionCost > 0 && Number(transaction.amount || 0) > 0
	                          ? transactionCost / Number(transaction.amount || 0)
	                          : 0;
	                    return (
                      <tr
                        key={transaction.id}
                        className={`cursor-pointer hover:bg-slate-50 ${deletingTankTransactionIds.has(transaction.id) ? 'opacity-50' : ''}`}
                        onClick={() => handleViewDetails(transaction)}
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                          <div>
                            <p>{formatDate(transaction.transaction_date)}</p>
                            <p className="text-xs text-slate-500">{formatTime(transaction.transaction_date)}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                          <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${visual.badgeClass}`}>
                            <span className="mr-1">{visual.emoji}</span>
                            {FuelTransactionService.getTransactionTypeLabel(transaction.transaction_type)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                          {roundedAmount.toFixed(1)}L
                        </td>
	                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
	                          <p className="font-medium">{formatCurrency(transactionCost)}</p>
	                          {transactionUnitPrice > 0 && (
	                            <p className="text-xs text-slate-500">{formatCurrency(transactionUnitPrice)}/L</p>
	                          )}
	                          {transaction.is_financial_expense === false && (
	                            <p className="text-xs text-slate-500">{tr('Internal movement', 'Mouvement interne')}</p>
	                          )}
	                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                          {transaction.performed_by_name || transaction.filled_by || '—'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleViewDetails(transaction);
                              }}
                              className="rounded p-1 text-blue-600 hover:text-blue-900"
                              title={tr('View Details', 'Voir les détails')}
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            {canDeleteFuelTransaction(transaction) && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleDeleteTankTransaction(transaction);
                                }}
                                disabled={deletingTankTransactionIds.has(transaction.id)}
                                className="rounded p-1 text-red-500 hover:text-red-700"
                                title={tr('Delete Transaction (Owner Only)', 'Supprimer la transaction (propriétaire uniquement)')}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
	              </tbody>
	            </table>
	          </div>
	          {getTankHistoryTransactions().length > 0 && (
	            <div className="flex flex-col gap-3 border-t border-slate-200 px-6 py-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
	              <span>
	                {tr('Showing', 'Affichage')} {getTankHistoryPagination().pageStart} {tr('to', 'a')} {getTankHistoryPagination().pageEnd} {tr('of', 'sur')} {getTankHistoryPagination().total} {tr('tank transactions', 'transactions du reservoir')}
	              </span>
	              <div className="flex items-center gap-2">
	                <button
	                  type="button"
	                  onClick={() => setTankHistoryPage((page) => Math.max(1, page - 1))}
	                  disabled={getTankHistoryPagination().currentPage <= 1}
	                  className="rounded-2xl border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
	                >
	                  {tr('Previous', 'Precedent')}
	                </button>
	                <span className="rounded-2xl bg-violet-50 px-4 py-2 font-semibold text-violet-700">
	                  {getTankHistoryPagination().currentPage} / {getTankHistoryPagination().totalPages}
	                </span>
	                <button
	                  type="button"
	                  onClick={() => setTankHistoryPage((page) => Math.min(getTankHistoryPagination().totalPages, page + 1))}
	                  disabled={getTankHistoryPagination().currentPage >= getTankHistoryPagination().totalPages}
	                  className="rounded-2xl border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
	                >
	                  {tr('Next', 'Suivant')}
	                </button>
	              </div>
	            </div>
	          )}
	        </div>
	      </div>
	    </div>
  );

  // Get recent transactions using unified data
  const getRecentRefills = () => {
    return recentOverviewTransactions
      .filter((transaction) => transaction.transaction_type === 'tank_refill')
      .slice(0, 5);
  };

  const getRecentVehicleRefills = () => {
    return recentOverviewTransactions
      .filter((transaction) => transaction.transaction_type === 'vehicle_refill')
      .slice(0, 3);
  };

  const getRecentWithdrawals = () => {
    return recentOverviewTransactions
      .filter((transaction) => transaction.transaction_type === 'withdrawal' || transaction.transaction_type === 'tank_out')
      .slice(0, 5);
  };

	  const getTankHistoryTransactions = () => {
	    if (tankHistoryTransactions.length > 0) {
	      return tankHistoryTransactions;
	    }

	    return recentOverviewTransactions.filter((transaction) =>
	      ['tank_refill', 'tank_out', 'manual_tank_adjustment'].includes(transaction.transaction_type)
	    );
	  };

	  const getTankHistoryPagination = () => {
	    const allTransactions = getTankHistoryTransactions();
	    const total = allTransactions.length;
	    const totalPages = Math.max(1, Math.ceil(total / TANK_HISTORY_PAGE_SIZE));
	    const currentPage = Math.min(Math.max(1, tankHistoryPage), totalPages);
	    const startIndex = (currentPage - 1) * TANK_HISTORY_PAGE_SIZE;
	    const pageTransactions = allTransactions.slice(startIndex, startIndex + TANK_HISTORY_PAGE_SIZE);

	    return {
	      currentPage,
	      pageTransactions,
	      pageStart: total > 0 ? startIndex + 1 : 0,
	      pageEnd: Math.min(startIndex + TANK_HISTORY_PAGE_SIZE, total),
	      total,
	      totalPages,
	    };
	  };

  const canDeleteFuelTransaction = (transaction) => {
    if (!transaction) return false;
    return userProfile?.role === 'owner';
  };

  const performDeleteTankTransaction = async (transaction) => {
    try {
      setDeletingTankTransactionIds((prev) => {
        const next = new Set(prev);
        next.add(transaction.id);
        return next;
      });

      const result = await FuelTransactionService.deleteTransaction(
        transaction.id,
        transaction.transaction_type,
        userProfile?.id
      );

      if (result.success) {
        toast.success(isFrench ? 'Transaction supprimée avec succès' : 'Transaction deleted successfully');
        appWarmupService.invalidateModule('fuel');
        appWarmupService.invalidateModule('finance');
        await loadFuelData();
      } else {
        toast.error(isFrench ? `Échec de la suppression de la transaction : ${result.error}` : `Failed to delete transaction: ${result.error}`);
      }
    } catch (_error) {
      toast.error(isFrench ? 'Une erreur inattendue est survenue lors de la suppression de la transaction' : 'An unexpected error occurred while deleting the transaction');
    } finally {
      setDeletingTankTransactionIds((prev) => {
        const next = new Set(prev);
        next.delete(transaction.id);
        return next;
      });
    }
  };

  const handleDeleteTankTransaction = (transaction) => {
    if (confirmingTankDeleteId) {
      toast.dismiss(confirmingTankDeleteId);
    }

    const toastId = toast((t) => (
      <div className="flex min-w-[320px] items-start gap-3 rounded-xl bg-slate-900 px-4 py-3 text-white shadow-xl">
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">
            {isFrench ? 'Supprimer cette transaction ?' : 'Delete this transaction?'}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-200">
            {isFrench ? 'Cette action est irreversible.' : 'This action cannot be undone.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              toast.dismiss(t.id);
              setConfirmingTankDeleteId((current) => (current === t.id ? null : current));
            }}
            className="rounded-md border border-slate-400/70 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/10"
          >
            {isFrench ? 'Annuler' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={() => {
              toast.dismiss(t.id);
              setConfirmingTankDeleteId((current) => (current === t.id ? null : current));
              performDeleteTankTransaction(transaction);
            }}
            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700"
          >
            {isFrench ? 'Supprimer' : 'Delete'}
          </button>
        </div>
      </div>
    ), { duration: 6000 });

    setConfirmingTankDeleteId(toastId);
  };

  // Modal handlers
  const handleAddTransaction = (type = 'refill', transaction = null, vehicleId = '') => {
    setTransactionType(type === 'refill' ? 'tank_refill' : type);
    setEditTransaction(transaction);
    setPrefilledVehicleId(vehicleId || transaction?.vehicle_id || '');
    setShowAddModal(true);
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
    setShowDetailsModal(false);
    setShowVehicleActionModal(false);
    setSelectedTransaction(null);
    setEditTransaction(null);
    setPrefilledVehicleId('');
    setSelectedVehicleActionTarget(null);
  };

  const handleOpenVehicleActions = (vehicle) => {
    setSelectedVehicleActionTarget(vehicle);
    setShowVehicleActionModal(true);
  };

  const handleVehicleActionChoice = (type) => {
    const vehicleId = selectedVehicleActionTarget?.id || '';
    setShowVehicleActionModal(false);
    setSelectedVehicleActionTarget(null);
    handleAddTransaction(type, null, vehicleId);
  };

  const handleTransactionSuccess = (savedTransaction) => {
    appWarmupService.invalidateModule('fuel');
    appWarmupService.invalidateModule('finance');
    loadFuelData(); // Refresh data after successful transaction
    if (activeTab === 'fuel-tank') {
      loadTankHistoryData();
    }
    handleCloseModal();
  };

  const handleSaveTankCapacity = async () => {
    const capacity = Math.max(1, Number(tankCapacityInput || 0));
    if (!capacity) return;

    const result = await FuelTransactionService.updateTankSettings({
      capacity_liters: capacity,
    });

    if (!result.success) {
      console.error('Failed to update tank capacity:', result.error);
      toast.error(result.error || 'Failed to save tank capacity');
      return;
    }

    setFuelData((prev) => ({
      ...prev,
      tank: {
        ...(prev.tank || {}),
        ...(result.tank || {}),
        capacity: Number(result.tank?.capacity_liters || result.tank?.capacity || capacity),
      },
    }));
    setTankCapacityInput(String(capacity));
    setIsEditingTankCapacity(false);
    toast.success('Tank capacity updated');
    appWarmupService.invalidateModule('fuel');
  };

  const handleSaveTankLevel = async () => {
    const liters = Math.max(0, Number(tankLevelInput || 0));
    if (Number.isNaN(liters)) return;

    setIsSavingTankLevel(true);
    try {
      const result = await FuelTransactionService.adjustTankLevel({
        liters,
        reason: tankAdjustReason,
        notes: tankAdjustNote,
        actor: userProfile,
      });

      if (!result.success) {
        console.error('Failed to adjust tank level:', result.error);
        toast.error(result.error || 'Failed to adjust tank level');
        return;
      }

      setFuelData((prev) => ({
        ...prev,
        tank: {
          ...(prev.tank || {}),
          ...(result.tank || {}),
          current_volume_liters: Number(result.tank?.current_volume_liters ?? liters),
          capacity: Number(result.tank?.capacity || result.tank?.capacity_liters || prev.tank?.capacity || 500),
        },
      }));
      setTankLevelInput(String(roundTo(liters, 2)));
      setIsEditingTankLevel(false);
      setTankAdjustReason('');
      setTankAdjustNote('');
      toast.success('Tank level adjusted');
      appWarmupService.invalidateModule('fuel');
      appWarmupService.invalidateModule('finance');
      loadFuelData();
    } finally {
      setIsSavingTankLevel(false);
    }
  };

  const handleViewDetails = (transaction) => {
    setSelectedTransaction(transaction);
    setShowDetailsModal(true);
  };

  const handleFiltersChange = (newFilters) => {
    setFilters(newFilters);
  };

  const handleClearFilters = () => {
    setFilters({
      search: '',
      vehicleId: '',
      transactionType: '',
      fuelType: '',
      startDate: '',
      endDate: '',
      fuelStation: '',
      location: ''
    });
  };

  const openWithdrawalTransactions = () => {
    setActiveTab('transactions');
    setFilters((current) => ({
      ...current,
      transactionType: 'withdrawal',
    }));
  };

  const openRefillTransactions = () => {
    setActiveTab('transactions');
    setFilters((current) => ({
      ...current,
      transactionType: '',
    }));
  };

  // Determine modal type based on transaction
  const getModalType = (transaction) => {
    if (!transaction) return 'vehicle';
    
    // Check transaction_type field
    if (transaction.transaction_type === 'tank_refill') {
      return 'tank';
    } else if (transaction.transaction_type === 'vehicle_refill') {
      return 'vehicle';
    }
    
    // Fallback: check if vehicle_id exists
    return transaction.vehicle_id ? 'vehicle' : 'tank';
  };

  // Format currency
  const formatCurrency = (amount) => {
    if (!amount || isNaN(amount)) return '0.00 MAD';
    return `${parseFloat(amount).toFixed(2)} MAD`;
  };

  // Format date for Africa/Casablanca timezone
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      timeZone: 'Africa/Casablanca',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  const formatTime = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleTimeString('en-US', {
      timeZone: 'Africa/Casablanca',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  const isPrivilegedFuelViewer = ['owner', 'admin'].includes(userProfile?.role);
  const canEditTankLevel = canAdjustFuelTankLevel(userProfile);

  const safeRefills = getRecentRefills();
  const safeVehicleRefills = getRecentVehicleRefills();
  const safeWithdrawals = getRecentWithdrawals();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AdminModuleHero
          icon={<Fuel className="h-8 w-8 text-white" />}
          eyebrow={isFrench ? 'Gestion du carburant' : 'Fuel Management'}
          title={isFrench ? 'Gestion du carburant' : 'Fuel Management'}
          description={isFrench ? 'Surveillez les niveaux du réservoir, suivez les remplissages et gérez les retraits depuis un seul espace.' : 'Monitor tank levels, track refills, and manage fuel withdrawals from one workspace.'}
        />
        <div className="max-w-7xl mx-auto p-6">
          <div className="rounded-2xl border border-violet-100 bg-white p-8 shadow-[0_18px_45px_rgba(76,29,149,0.08)]">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="mb-4 text-4xl animate-spin">⏳</div>
              <p className="text-base font-medium text-slate-700">
                {tr('Loading fuel management...', 'Chargement de la gestion carburant...')}
              </p>
              <p className="mt-2 text-sm text-slate-500">
                {tr(
                  'Preparing the tank overview, vehicle fuel board, and fuel transactions.',
                  'Préparation de la vue du réservoir, du tableau carburant des véhicules et des transactions carburant.'
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminModuleHero
        icon={<Fuel className="h-8 w-8 text-white" />}
        eyebrow={isFrench ? 'Gestion du carburant' : 'Fuel Management'}
        title={isFrench ? 'Gestion du carburant' : 'Fuel Management'}
        description={isFrench ? 'Surveillez les niveaux du réservoir, suivez les remplissages et gérez les retraits depuis un seul espace.' : 'Monitor tank levels, track refills, and manage fuel withdrawals from one workspace.'}
      />

      <div className="border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="inline-flex flex-wrap gap-2 rounded-[24px] border border-slate-200 bg-slate-50 p-2 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
            <button
              onClick={() => setActiveTab('overview')}
              className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition-all ${
                activeTab === 'overview'
                  ? 'bg-white text-blue-700 shadow-[0_10px_24px_rgba(59,130,246,0.14)]'
                  : 'text-slate-600 hover:bg-white/80 hover:text-slate-900'
              }`}
            >
              {isFrench ? 'Vue d’ensemble' : 'Overview'}
            </button>
            <button
              onClick={() => setActiveTab('transactions')}
              className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition-all ${
                activeTab === 'transactions'
                  ? 'bg-white text-blue-700 shadow-[0_10px_24px_rgba(59,130,246,0.14)]'
                  : 'text-slate-600 hover:bg-white/80 hover:text-slate-900'
              }`}
            >
              {isFrench ? 'Toutes les transactions carburant' : 'All Fuel Transactions'}
            </button>
            <button
              onClick={() => setActiveTab('fuel-tank')}
              className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition-all ${
                activeTab === 'fuel-tank'
                  ? 'bg-white text-blue-700 shadow-[0_10px_24px_rgba(59,130,246,0.14)]'
                  : 'text-slate-600 hover:bg-white/80 hover:text-slate-900'
              }`}
            >
              {isFrench ? 'Réservoir' : 'Fuel Tank'}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto p-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Database Status Warning - Only show if tables don't exist */}
            {!tablesExist && isPrivilegedFuelViewer && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-600" />
                  <div>
                    <h4 className="font-medium text-yellow-800">{isFrench ? 'Configuration de base de données requise' : 'Database Setup Required'}</h4>
                    <p className="text-sm text-yellow-700">
                      {isFrench ? 'Les tables de gestion du carburant sont introuvables. Veuillez exécuter le schéma SQL pour configurer fuel_tank, fuel_refills et fuel_withdrawals.' : 'Fuel management tables not found. Please run the SQL schema to set up fuel_tank, fuel_refills, and fuel_withdrawals tables.'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Recent Activity Tables */}
            <div className="space-y-6">
              <div className="flex flex-wrap gap-3 rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
                <button
                  onClick={() => handleAddTransaction('tank_refill')}
                  className="rounded-2xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700"
                  title={tr('Add fuel into the main tank', 'Ajouter du carburant dans le réservoir principal')}
                >
                  {isFrench ? '⛽ Entrée réservoir' : '⛽ Tank In'}
                </button>
                <button
                  onClick={() => handleAddTransaction('vehicle_refill')}
                  className="rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
                  title={tr('Refill a vehicle directly without using the main tank', 'Remplir un véhicule directement sans utiliser le réservoir principal')}
                >
                  {isFrench ? '🚗 Remplissage direct' : '🚗 Direct Fill'}
                </button>
                <button
                  onClick={() => handleAddTransaction('withdrawal')}
                  className="rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                  title={tr('Transfer fuel from the main tank to a vehicle', 'Transférer le carburant du réservoir principal vers un véhicule')}
                >
                  {isFrench ? '🔄 Transfert' : '🔄 Transfer'}
                </button>
              </div>

              <div className="bg-white rounded-lg shadow-md border border-gray-200">
                <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{tr('Vehicle Fuel Board', 'Tableau carburant des véhicules')}</h3>
                    <p className="text-sm text-gray-500">{tr('Live 8-line view of all vehicle fuel levels', 'Vue en direct sur 8 lignes de tous les niveaux de carburant des véhicules')}</p>
                  </div>
                  <button
                    onClick={() => handleAddTransaction('withdrawal')}
                    className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                  >
                    {tr('Transfer Fuel', 'Transférer du carburant')} →
                  </button>
                </div>
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {vehicleBoardLoading ? (
                    Array.from({ length: 6 }).map((_, index) => (
                      <div
                        key={`vehicle-board-skeleton-${index}`}
                        className="rounded-lg border border-gray-200 bg-gray-50 p-4 animate-pulse"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-2">
                            <div className="h-6 w-24 rounded bg-gray-200" />
                            <div className="h-4 w-40 rounded bg-gray-200" />
                          </div>
                          <div className="h-6 w-16 rounded-full bg-gray-200" />
                        </div>
                        <div className="mt-3 flex items-end gap-1">
                          {Array.from({ length: 8 }).map((__, segment) => (
                            <div key={segment} className="h-7 w-4 rounded-sm bg-gray-200" />
                          ))}
                        </div>
                        <div className="mt-3 flex items-center justify-between text-sm">
                          <div className="h-4 w-20 rounded bg-gray-200" />
                          <div className="h-4 w-12 rounded bg-gray-200" />
                        </div>
                      </div>
                    ))
                  ) : vehicleStates.length === 0 ? (
                    <div className="col-span-full text-center py-8 text-gray-500">
                      {tr('No vehicle fuel state available yet', 'Aucun état carburant véhicule disponible pour le moment')}
                    </div>
                  ) : (
                    vehicleStates.map((vehicle) => (
                      <button
                        key={vehicle.id}
                        type="button"
                        onClick={() => handleOpenVehicleActions(vehicle)}
                        className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-left transition hover:border-blue-300 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-mono text-lg font-bold tracking-wide text-blue-900">
                              {vehicle.plate_number || tr('No Plate', 'Aucune plaque')}
                            </p>
                            <p className="mt-1 font-semibold text-gray-900">{formatVehicleNameWithModel(vehicle)}</p>
                          </div>
                          <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                            vehicle.fuel_status_color === 'green' ? 'bg-green-100 text-green-700' :
                            vehicle.fuel_status_color === 'blue' ? 'bg-blue-100 text-blue-700' :
                            vehicle.fuel_status_color === 'yellow' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {vehicle.fuel_status}
                          </span>
                        </div>

                        <div className="mt-3 flex items-end gap-1">
                          {Array.from({ length: 8 }, (_, index) => index + 1).map((segment) => (
                            <div
                              key={segment}
                              className={`h-7 w-4 rounded-sm ${
                                segment <= (vehicle.current_fuel_lines || 0) ? 'bg-green-500' : 'bg-gray-300'
                              }`}
                            />
                          ))}
                        </div>

                        <div className="mt-3 flex items-center justify-between text-sm">
                          <span className="font-medium text-gray-900">{vehicle.current_fuel_lines || 0}/8 {tr('lines', 'lignes')}</span>
                          <span className="text-gray-600">{roundTo(vehicle.current_fuel_liters || 0, 2)}L</span>
                        </div>

                        <p className="mt-2 text-xs text-gray-500">
                          {tr('Last source:', 'Dernière source :')} {vehicle.last_fuel_source || tr('unknown', 'inconnue')}
                        </p>
                        <p className="mt-3 text-xs font-medium text-blue-700">
                          {tr('Tap for vehicle fuel actions', 'Appuyez pour les actions carburant du véhicule')}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Recent Refills */}
              <div className="bg-white rounded-lg shadow-md border border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowRecentRefills((current) => !current)}
                  className="flex w-full items-center justify-between border-b border-gray-200 p-4 text-left transition hover:bg-gray-50"
                >
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      <Plus className="w-5 h-5 text-green-600" />
                      {isFrench ? 'Derniers remplissages' : 'Recent Refills'}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">{safeRefills.length + safeVehicleRefills.length} {isFrench ? 'entrées' : 'entries'}</p>
                  </div>
                  {showRecentRefills ? <Minus className="h-5 w-5 text-slate-400" /> : <Plus className="h-5 w-5 text-slate-400" />}
                </button>
                {showRecentRefills && (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{isFrench ? 'Litres' : 'Liters'}</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{isFrench ? 'Coût' : 'Cost'}</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{isFrench ? 'Véhicule' : 'Vehicle'}</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {safeRefills.slice(0, 3).map((refill) => {
                        const visual = getFuelTransactionVisual('tank_refill');
                        return (
                        <tr
                          key={`tank-${refill.id}`}
                          className="cursor-pointer hover:bg-gray-50"
                          onClick={() => handleViewDetails(refill)}
                        >
                          <td className="px-4 py-3 text-sm text-gray-900">
                            <div>
                              <p>{formatDate(refill.transaction_date)}</p>
                              <p className="text-xs text-gray-500">{formatTime(refill.transaction_date)}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${visual.badgeClass}`}>
                              <span className="mr-1">{visual.emoji}</span>
                              {visual.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">{refill.amount}L</td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            <div>
                              <p className="font-medium">{formatCurrency(refill.cost)}</p>
                              <p className="text-xs text-gray-500">{formatCurrency(refill.unit_price)}/L</p>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">—</td>
                        </tr>
                      )})}
                      
                      {safeVehicleRefills.slice(0, 2).map((refill) => {
                        const visual = getFuelTransactionVisual('vehicle_refill');
                        const vehicle = refill.vehicle || refill.saharax_0u4w4d_vehicles;
                        return (
                        <tr
                          key={`vehicle-${refill.id}`}
                          className="cursor-pointer bg-blue-50 hover:bg-blue-100"
                          onClick={() => handleViewDetails(refill)}
                        >
                          <td className="px-4 py-3 text-sm text-gray-900">
                            <div>
                              <p>{formatDate(refill.transaction_date)}</p>
                              <p className="text-xs text-gray-500">{formatTime(refill.transaction_date)}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${visual.badgeClass}`}>
                              <span className="mr-1">{visual.emoji}</span>
                              {visual.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">{refill.amount}L</td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            <div>
                              <p className="font-medium">{formatCurrency(refill.cost)}</p>
                              <p className="text-xs text-gray-500">{formatCurrency(refill.unit_price)}/L</p>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            <div>
                              <p className="font-medium text-blue-700">
                                {formatVehicleNameWithModel(vehicle)}
                              </p>
                              <p className="text-xs text-gray-500">
                                {vehicle?.plate_number}
                              </p>
                            </div>
                          </td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                  {loading && (
                    <div className="p-4 space-y-3">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <div key={`recent-refill-loading-${index}`} className="h-14 rounded-xl bg-gray-100 animate-pulse" />
                      ))}
                    </div>
                  )}
                  {!loading && safeRefills.length === 0 && safeVehicleRefills.length === 0 && (
                    <div className="text-center py-8">
                      <Fuel className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-500">{isFrench ? 'Aucun remplissage enregistré' : 'No refills recorded yet'}</p>
                    </div>
                  )}
                </div>
                )}
              </div>

              {/* Recent Withdrawals */}
              <div className="bg-white rounded-lg shadow-md border border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowRecentWithdrawals((current) => !current)}
                  className="flex w-full items-center justify-between border-b border-gray-200 p-4 text-left transition hover:bg-gray-50"
                >
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      <Car className="w-5 h-5 text-blue-600" />
                      {isFrench ? 'Derniers retraits' : 'Recent Withdrawals'}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">{safeWithdrawals.length} {isFrench ? 'entrées' : 'entries'}</p>
                  </div>
                  {showRecentWithdrawals ? <Minus className="h-5 w-5 text-slate-400" /> : <Plus className="h-5 w-5 text-slate-400" />}
                </button>
                {showRecentWithdrawals && (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{isFrench ? 'Véhicule' : 'Vehicle'}</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{isFrench ? 'Litres' : 'Liters'}</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{isFrench ? 'Compteur' : 'Odometer'}</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{isFrench ? 'Par' : 'By'}</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {safeWithdrawals.slice(0, 5).map((withdrawal) => {
                        const visual = getFuelTransactionVisual('withdrawal');
                        const vehicle = withdrawal.vehicle || withdrawal.saharax_0u4w4d_vehicles;
                        return (
                        <tr
                          key={withdrawal.id}
                          className="cursor-pointer hover:bg-gray-50"
                          onClick={() => handleViewDetails(withdrawal)}
                        >
                          <td className="px-4 py-3 text-sm text-gray-900">
                            <div>
                              <p>
                                <span className="mr-2">{visual.emoji}</span>
                                {formatDate(withdrawal.transaction_date)}
                              </p>
                              <p className="text-xs text-gray-500">{formatTime(withdrawal.transaction_date)}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            <div>
                              {vehicle?.id ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    navigate(`/admin/fleet/${vehicle.id}`);
                                  }}
                                  className="text-left transition hover:text-blue-700"
                                >
                                  <p className="font-medium underline decoration-blue-200 underline-offset-4">
                                    {formatVehicleNameWithModel(vehicle)}
                                    {vehicle?.plate_number && (
                                      <span className="ml-2 font-mono text-xs font-semibold tracking-wide text-blue-700">
                                        {vehicle.plate_number}
                                      </span>
                                    )}
                                  </p>
                                </button>
                              ) : (
                                <p className="font-medium">
                                  {withdrawal.transaction_type === 'tank_out'
                                    ? tr('Main Tank', 'Réservoir principal')
                                    : vehicle
                                      ? formatVehicleNameWithModel(vehicle)
                                      : (withdrawal.vehicle_id ? `Vehicle ${withdrawal.vehicle_id}` : tr('No vehicle', 'Aucun véhicule'))}
                                  {vehicle?.plate_number && (
                                    <span className="ml-2 font-mono text-xs font-semibold tracking-wide text-blue-700">
                                      {vehicle.plate_number}
                                    </span>
                                  )}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">{withdrawal.amount}L</td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {withdrawal.odometer_reading ? `${withdrawal.odometer_reading}km` : '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">{withdrawal.performed_by_name || withdrawal.filled_by || '—'}</td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                  {loading && (
                    <div className="p-4 space-y-3">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <div key={`recent-withdrawal-loading-${index}`} className="h-14 rounded-xl bg-gray-100 animate-pulse" />
                      ))}
                    </div>
                  )}
                  {!loading && safeWithdrawals.length === 0 && (
                    <div className="text-center py-8">
                      <Car className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-500">{isFrench ? 'Aucun retrait enregistré' : 'No withdrawals recorded yet'}</p>
                    </div>
                  )}
                </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'transactions' && (
          <div className="p-6 space-y-6">
            {/* Enhanced Transaction Management */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{isFrench ? 'Toutes les transactions carburant' : 'All Fuel Transactions'}</h2>
                <p className="text-gray-600">{isFrench ? 'Historique complet des transactions avec filtrage et gestion avancés' : 'Complete transaction history with advanced filtering and management'}</p>
              </div>
              
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => handleAddTransaction('tank_refill')}
                  className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-white transition-colors hover:bg-green-700"
                >
                  <Plus className="w-4 h-4" />
                  {isFrench ? '⛽ Entrée réservoir' : '⛽ Tank In'}
                </button>

                <button
                  onClick={() => handleAddTransaction('withdrawal')}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
                >
                  <Minus className="w-4 h-4" />
                  {isFrench ? '🔄 Transfert' : '🔄 Transfer'}
                </button>

                <button
                  onClick={() => handleAddTransaction('vehicle_refill')}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-white transition-colors hover:bg-indigo-700"
                >
                  <Fuel className="w-4 h-4" />
                  {isFrench ? '🚗 Remplissage direct' : '🚗 Direct Fill'}
                </button>
              </div>
            </div>

            {/* Database Status Warning - Only show if tables don't exist */}
            {!tablesExist && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-600" />
                  <div>
                    <h4 className="font-medium text-yellow-800">{tr('Database Setup Required', 'Configuration de base de données requise')}</h4>
                    <p className="text-sm text-yellow-700">
                      {tr('Fuel management tables not found. Please run the SQL schema to set up fuel_tank, fuel_refills, and fuel_withdrawals tables.', 'Les tables de gestion du carburant sont introuvables. Veuillez exécuter le schéma SQL pour configurer fuel_tank, fuel_refills et fuel_withdrawals.')}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Filters Panel */}
            <FuelFiltersPanel
              filters={filters}
              onFiltersChange={handleFiltersChange}
              onClearFilters={handleClearFilters}
              vehicles={vehicles}
            />

            {/* Transactions List */}
            <FuelTransactionsList
              filters={filters}
              vehicles={vehicles}
              onAddTransaction={handleAddTransaction}
              onViewDetails={handleViewDetails}
              onTransactionsMutated={() => {
                appWarmupService.invalidateModule('fuel');
                appWarmupService.invalidateModule('finance');
                loadFuelData();
              }}
              initialPageData={prefetchedTransactionPage}
            />
          </div>
        )}

        {activeTab === 'fuel-tank' && renderTankManagementPanel()}
      </div>

      {/* Enhanced Transaction Modals */}
      {showAddModal && (
        <AddFuelTransactionModal
          isOpen={showAddModal}
          onClose={handleCloseModal}
          editTransaction={editTransaction}
          vehicles={vehicles}
          vehicleStates={vehicleStates}
          tankSummary={{
            ...(fuelData.tank || {}),
            current_volume_liters: getCurrentVolume(),
            capacity: Number(fuelData?.tank?.capacity || fuelData?.tank?.capacity_liters || 500),
          }}
          transactionType={transactionType}
          initialVehicleId={prefilledVehicleId}
          onSave={handleTransactionSuccess}
        />
      )}

      {showDetailsModal && selectedTransaction && (
        <TransactionDetailsModal
          isOpen={showDetailsModal}
          onClose={handleCloseModal}
          transaction={selectedTransaction}
          modalType={getModalType(selectedTransaction)}
          onEdit={(transaction) => {
            setShowDetailsModal(false);
            handleAddTransaction(transaction.transaction_type, transaction);
          }}
        />
      )}

      {showVehicleActionModal && selectedVehicleActionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-sm rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.22)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{tr('Vehicle Fuel Action', 'Action carburant véhicule')}</p>
                <h3 className="mt-2 text-xl font-semibold text-slate-950">
                  {formatVehicleNameWithModel(selectedVehicleActionTarget)}
                </h3>
                <p className="mt-1 font-mono text-sm font-semibold tracking-wide text-blue-700">
                  {selectedVehicleActionTarget.plate_number || tr('No Plate', 'Aucune plaque')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowVehicleActionModal(false);
                  setSelectedVehicleActionTarget(null);
                }}
                className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label={tr('Close vehicle fuel actions', 'Fermer les actions carburant du véhicule')}
              >
                ×
              </button>
            </div>

            <div className="mt-6 grid gap-3">
              <button
                type="button"
                onClick={() => handleVehicleActionChoice('vehicle_refill')}
                className="rounded-2xl bg-indigo-600 px-4 py-4 text-left text-white transition-colors hover:bg-indigo-700"
              >
                <div className="text-base font-semibold">{isFrench ? '🚗 Remplissage direct' : '🚗 Direct Fill'}</div>
                <div className="mt-1 text-sm text-indigo-100">{tr('Refill this vehicle directly', 'Remplir ce véhicule directement')}</div>
              </button>
              <button
                type="button"
                onClick={() => handleVehicleActionChoice('withdrawal')}
                className="rounded-2xl bg-blue-600 px-4 py-4 text-left text-white transition-colors hover:bg-blue-700"
              >
                <div className="text-base font-semibold">{isFrench ? '🔄 Transfert' : '🔄 Transfer'}</div>
                <div className="mt-1 text-sm text-blue-100">{tr('Move fuel from main tank to this vehicle', 'Déplacer le carburant du réservoir principal vers ce véhicule')}</div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FuelManagement;
