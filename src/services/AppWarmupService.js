import FuelTransactionService from './FuelTransactionService';
import MaintenanceTrackingService from './MaintenanceTrackingService';
import { financeApiV2 } from './financeApiV2';
import criticalModuleCacheService from './CriticalModuleCacheService';
import rentalSummaryService from './RentalSummaryService';
import sharedQueryCacheService from './SharedQueryCacheService';
import { supabase } from '../lib/supabase';
import { getHostContext } from '../utils/hostContext';

const WARM_RENTALS_SNAPSHOT_KEY = 'app:warm-rentals:default';
const WARM_RENTALS_TTL_MS = 60 * 1000;
const WARM_FINANCE_TTL_MS = 60 * 1000;
const WARM_MAINTENANCE_TTL_MS = 60 * 1000;
const WARMUP_TTL_MS = 45 * 1000;
const WARMUP_STARTED_AT_KEY = 'app:warmup:started-at';

const safeSessionStorage = {
  get(key) {
    if (typeof window === 'undefined') return null;
    try {
      return window.sessionStorage.getItem(key);
    } catch (_error) {
      return null;
    }
  },
  set(key, value) {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(key, value);
    } catch (_error) {
      // Ignore storage failures
    }
  },
  remove(key) {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.removeItem(key);
    } catch (_error) {
      // Ignore storage failures
    }
  },
};

class AppWarmupService {
  constructor() {
    this.lastWarmupAt = 0;
    this.activeWarmupPromise = null;
    this.intentPrefetchTimestamps = new Map();
  }

  getAllowedWarmModules() {
    const host = getHostContext();

    if (host.kind === 'tenant') {
      return [];
    }

    return ['fuel', 'rentals', 'finance', 'maintenance'];
  }

  getWarmRentalsSnapshot() {
    const sharedSnapshot = criticalModuleCacheService.get('rentals-default', WARM_RENTALS_TTL_MS);
    if (sharedSnapshot) {
      return sharedSnapshot;
    }

    const raw = safeSessionStorage.get(WARM_RENTALS_SNAPSHOT_KEY);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);
      if (!parsed?.warmedAt || Date.now() - parsed.warmedAt > WARM_RENTALS_TTL_MS) {
        return null;
      }
      return parsed;
    } catch (_error) {
      return null;
    }
  }

  setWarmRentalsSnapshot(snapshot) {
    if (!snapshot) return;

    criticalModuleCacheService.set('rentals-default', snapshot);

    safeSessionStorage.set(
      WARM_RENTALS_SNAPSHOT_KEY,
      JSON.stringify({
        ...snapshot,
        warmedAt: Date.now(),
      })
    );
  }

  clearWarmRentalsSnapshot() {
    criticalModuleCacheService.clear('rentals-default');
    safeSessionStorage.remove(WARM_RENTALS_SNAPSHOT_KEY);
  }

  markWarmupStarted() {
    safeSessionStorage.set(WARMUP_STARTED_AT_KEY, String(Date.now()));
  }

  isWarmupLikelyActive() {
    const raw = safeSessionStorage.get(WARMUP_STARTED_AT_KEY);
    const startedAt = Number(raw);
    return Number.isFinite(startedAt) && Date.now() - startedAt < WARMUP_TTL_MS;
  }

  async fetchWarmRentalsSnapshot() {
    const snapshot = await rentalSummaryService.getListSummary({
      statusFilter: 'all',
      paymentStatusFilter: 'all',
      page: 1,
      limit: 10,
    });

    this.setWarmRentalsSnapshot(snapshot);
    return snapshot;
  }

  async warmFuelManagement() {
    const [summaryResult] = await Promise.allSettled([
      FuelTransactionService.getFuelOverviewSummary({
        recentRefillsLimit: 8,
        recentWithdrawalsLimit: 8,
      }),
    ]);

    const summary = summaryResult.status === 'fulfilled' ? summaryResult.value : null;
    this.setWarmFuelSnapshot({
      overview: summary
        ? {
            tank: summary.tank,
            refills: summary.refills,
            withdrawals: summary.withdrawals,
          }
        : null,
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
  }

  async warmRentalManagement() {
    await this.fetchWarmRentalsSnapshot();
  }

  getWarmFinanceSnapshot() {
    return criticalModuleCacheService.get('finance-default', WARM_FINANCE_TTL_MS);
  }

  setWarmFinanceSnapshot(snapshot) {
    if (!snapshot) return;
    criticalModuleCacheService.set('finance-default', snapshot);
  }

  clearWarmFinanceSnapshot() {
    criticalModuleCacheService.clear('finance-default');
  }

  async warmFinanceManagement() {
    const filters = {
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      vehicleIds: [],
      customerIds: [],
      orgId: 'current',
    };

    const [kpiData, trendData, vehicles, customers] = await Promise.all([
      financeApiV2.getKPIData(filters),
      financeApiV2.getTrendData(filters),
      financeApiV2.getVehicles(filters.orgId),
      financeApiV2.getCustomers(filters.orgId),
    ]);

    this.setWarmFinanceSnapshot({
      filters,
      kpiData,
      trendData: Array.isArray(trendData) ? trendData : [],
      vehicles: Array.isArray(vehicles) ? vehicles : [],
      customers: Array.isArray(customers) ? customers : [],
    });
  }

  getWarmMaintenanceSnapshot() {
    return criticalModuleCacheService.get('maintenance-default', WARM_MAINTENANCE_TTL_MS);
  }

  setWarmMaintenanceSnapshot(snapshot) {
    if (!snapshot) return;
    criticalModuleCacheService.set('maintenance-default', snapshot);
  }

  clearWarmMaintenanceSnapshot() {
    criticalModuleCacheService.clear('maintenance-default');
  }

  async warmMaintenanceManagement() {
    const vehiclesData = await MaintenanceTrackingService.getVehiclesInMaintenance();
    const [upcomingResult, historyResult, statsResult] = await Promise.allSettled([
      MaintenanceTrackingService.getUpcomingMaintenance(),
      MaintenanceTrackingService.getMaintenanceHistory({ limit: 10 }),
      MaintenanceTrackingService.getMaintenanceStatistics(),
    ]);

    const snapshot = {
      vehiclesInMaintenance: Array.isArray(vehiclesData) ? vehiclesData : [],
      upcomingMaintenance: upcomingResult.status === 'fulfilled' && Array.isArray(upcomingResult.value) ? upcomingResult.value : [],
      maintenanceHistory: historyResult.status === 'fulfilled' && Array.isArray(historyResult.value) ? historyResult.value : [],
      statistics: statsResult.status === 'fulfilled' && statsResult.value ? statsResult.value : {},
    };

    this.setWarmMaintenanceSnapshot(snapshot);
  }

  getWarmFuelSnapshot() {
    return criticalModuleCacheService.get('fuel-default', WARM_RENTALS_TTL_MS);
  }

  setWarmFuelSnapshot(snapshot) {
    if (!snapshot) return;
    criticalModuleCacheService.set('fuel-default', snapshot);
  }

  clearWarmFuelSnapshot() {
    criticalModuleCacheService.clear('fuel-default');
  }

  rewarmModule(moduleName) {
    if (!this.getAllowedWarmModules().includes(moduleName)) {
      return Promise.resolve();
    }

    switch (moduleName) {
      case 'fuel':
        return this.warmFuelManagement();
      case 'rentals':
        return this.warmRentalManagement();
      case 'finance':
        return this.warmFinanceManagement();
      case 'maintenance':
        return this.warmMaintenanceManagement();
      default:
        return Promise.resolve();
    }
  }

  invalidateModule(moduleName, { rewarm = true } = {}) {
    switch (moduleName) {
      case 'fuel':
        this.clearWarmFuelSnapshot();
        sharedQueryCacheService.invalidateNamespace('fuel-overview-summary');
        FuelTransactionService.clearTransactionCaches();
        break;
      case 'rentals':
        this.clearWarmRentalsSnapshot();
        sharedQueryCacheService.invalidateNamespace('rentals-summary');
        break;
      case 'finance':
        this.clearWarmFinanceSnapshot();
        sharedQueryCacheService.invalidateNamespace('finance-overview-summary');
        break;
      case 'maintenance':
        this.clearWarmMaintenanceSnapshot();
        break;
      default:
        return;
    }

    if (rewarm) {
      void this.rewarmModule(moduleName).catch(() => {});
    }
  }

  prefetchModuleIntent(moduleName) {
    if (!moduleName) {
      return;
    }

    const supportedModules = new Set(this.getAllowedWarmModules());
    if (!supportedModules.has(moduleName)) {
      return;
    }

    const lastPrefetchAt = this.intentPrefetchTimestamps.get(moduleName) ?? 0;
    if (Date.now() - lastPrefetchAt < 10 * 1000) {
      return;
    }

    this.intentPrefetchTimestamps.set(moduleName, Date.now());
    void this.rewarmModule(moduleName).catch(() => {});
  }

  async warmCriticalModules() {
    if (this.activeWarmupPromise) {
      return this.activeWarmupPromise;
    }

    if (Date.now() - this.lastWarmupAt < WARMUP_TTL_MS) {
      return;
    }

    this.activeWarmupPromise = (async () => {
      try {
        const { data: { session } = {} } = await supabase.auth.getSession();
        if (!session?.access_token) {
          return;
        }

        const allowedModules = this.getAllowedWarmModules();
        if (allowedModules.length === 0) {
          this.lastWarmupAt = Date.now();
          return;
        }

        this.markWarmupStarted();
        await Promise.allSettled(
          allowedModules.map((moduleName) => this.rewarmModule(moduleName))
        );
        this.lastWarmupAt = Date.now();
      } finally {
        this.activeWarmupPromise = null;
      }
    })();

    return this.activeWarmupPromise;
  }
}

const appWarmupService = new AppWarmupService();
export default appWarmupService;
