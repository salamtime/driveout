import { supabase } from '../lib/supabase';
import {
  DEFAULT_FUEL_LINES,
  DEFAULT_VEHICLE_TANK_LITERS,
  getFuelStatus,
  linesToLiters,
  litersToLines,
  normalizeFuelState,
  roundTo,
} from '../utils/fuelMath';
import { resolveTankCapacityLiters } from '../utils/vehicleModelSpecs';
import sharedQueryCacheService from './SharedQueryCacheService';
import {
  applyOrganizationScope,
  isTenantOwnedSharedTable,
  matchTenantOwnedPayload,
  requireCurrentOrganizationId,
  scopeTenantOwnedQuery,
  shouldScopeSharedTenantData,
} from './OrganizationService';

const RENTALS_TABLE = 'app_4c3a7a6153_rentals';
const FUEL_OVERVIEW_CACHE_TTL_MS = 2 * 60 * 1000;
const VEHICLE_FUEL_STATES_CACHE_TTL_MS = 2 * 60 * 1000;
const DEFAULT_TRANSACTIONS_CACHE_TTL_MS = 2 * 60 * 1000;
const FUEL_SOURCE_FAILURE_COOLDOWN_MS = 60 * 1000;
const FUEL_HEALTH_REQUEST_TIMEOUT_MS = 8000;
const parseFuelNumber = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  const normalized = typeof value === 'string' ? value.replace(',', '.') : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};
const roundToHalfLiter = (value) => roundTo(Math.round(parseFuelNumber(value) * 2) / 2, 1);
const isSoldVehicleRecord = (vehicle = {}) => String(vehicle?.status || '').trim().toLowerCase() === 'sold';
const VEHICLE_FUEL_STATE_ORG_COLUMN_CACHE_KEY = 'fuel:vehicle-fuel-state:supports-organization-column';
const FUEL_REFILLS_ORG_COLUMN_CACHE_KEY = 'fuel:fuel-refills:supports-organization-column';
const isMissingFuelStateOrganizationColumnError = (error) =>
  ['42703', 'PGRST204'].includes(String(error?.code || '').toUpperCase()) &&
  `${error?.message || ''} ${error?.details || ''}`.toLowerCase().includes('organization_id');
const isMissingFuelRefillsOrganizationColumnError = (error) =>
  ['42703', 'PGRST204'].includes(String(error?.code || '').toUpperCase()) &&
  `${error?.message || ''} ${error?.details || ''}`.toLowerCase().includes('organization_id');
const stripOrganizationField = (payload = {}) => {
  if (!payload || typeof payload !== 'object') return payload;
  const { organization_id: _organizationId, ...rest } = payload;
  return rest;
};

class FuelTransactionService {
  constructor() {
    this.fuelTankTable = 'fuel_tank';
    this.fuelRefillsTable = 'fuel_refills';
    this.vehicleFuelRefillsTable = 'vehicle_fuel_refills';
    this.fuelWithdrawalsTable = 'fuel_withdrawals';
    this.vehicleFuelStateTable = 'vehicle_fuel_state';
    this.fuelOperationLogsTable = 'fuel_operation_logs';
    this.defaultTransactionsFeedView = 'fuel_transactions_default_feed';
    this.vehiclesTable = 'saharax_0u4w4d_vehicles';
    this.vehicleModelsTable = 'saharax_0u4w4d_vehicle_models';

    this.defaultTankSettings = {
      id: 'default',
      name: 'Main Tank',
      capacity: 500,
      initial_volume: 0,
      current_volume_liters: 0,
      low_threshold_liters: 150,
      location: 'Main Storage',
      fuel_type: 'gasoline',
      created_at: new Date().toISOString(),
    };

    this.tableAvailabilityCache = new Map();
    this.tableAvailabilityPromiseCache = new Map();
    this.transactionListCache = new Map();
    this.transactionListPromiseCache = new Map();
    this.fuelOverviewCache = new Map();
    this.fuelOverviewPromiseCache = new Map();
    this.vehicleFuelStatesCache = null;
    this.vehicleFuelStatesCacheTimestamp = 0;
    this.vehicleFuelStatesPromise = null;
    this.vehicleModelTankCapacitySupport = null;
    this.vehicleFuelStateOrganizationColumnSupport = null;
    this.fuelRefillsOrganizationColumnSupport = null;
    this.tableFailureCooldowns = new Map();
    this.clientChangeSubscribers = new Set();
    this.broadcastChannel = null;
    this.broadcastChannelListenerBound = false;
    this.clientInstanceId = `fuel-client-${Math.random().toString(36).slice(2, 10)}`;

    if (typeof window !== 'undefined') {
      const cachedSupport = window.sessionStorage.getItem('fuel:vehicle-models:tank-capacity-support');
      if (cachedSupport === 'true') {
        this.vehicleModelTankCapacitySupport = true;
      } else if (cachedSupport === 'false') {
        this.vehicleModelTankCapacitySupport = false;
      }

      const cachedVehicleFuelStateSupport = window.sessionStorage.getItem(VEHICLE_FUEL_STATE_ORG_COLUMN_CACHE_KEY);
      if (cachedVehicleFuelStateSupport === 'true') {
        this.vehicleFuelStateOrganizationColumnSupport = true;
      } else if (cachedVehicleFuelStateSupport === 'false') {
        this.vehicleFuelStateOrganizationColumnSupport = false;
      }

      const cachedFuelRefillsSupport = window.sessionStorage.getItem(FUEL_REFILLS_ORG_COLUMN_CACHE_KEY);
      if (cachedFuelRefillsSupport === 'true') {
        this.fuelRefillsOrganizationColumnSupport = true;
      } else if (cachedFuelRefillsSupport === 'false') {
        this.fuelRefillsOrganizationColumnSupport = false;
      }

      if (typeof window.BroadcastChannel === 'function') {
        this.broadcastChannel = new window.BroadcastChannel('driveout-fuel-sync');
        if (!this.broadcastChannelListenerBound) {
          this.broadcastChannel.onmessage = (event) => {
            const payload = event?.data || null;
            if (!payload || payload.originClientId === this.clientInstanceId) {
              return;
            }

            this.handleExternalFuelChange(payload);
          };
          this.broadcastChannelListenerBound = true;
        }
      }
    }
  }

  notifyClientChange(payload = {}) {
    const normalizedPayload = {
      timestamp: Date.now(),
      ...payload,
      originClientId: payload.originClientId || this.clientInstanceId,
    };

    this.clientChangeSubscribers.forEach((callback) => {
      try {
        callback(normalizedPayload);
      } catch (error) {
        console.error('Error in fuel client change subscriber:', error);
      }
    });

    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(normalizedPayload);
      } catch (error) {
        console.warn('Unable to broadcast fuel change to sibling tabs:', error);
      }
    }
  }

  handleExternalFuelChange(payload = {}) {
    this.clearTransactionCaches();
    this.clientChangeSubscribers.forEach((callback) => {
      try {
        callback({
          ...payload,
          source: payload.source || 'broadcast',
          isExternal: true,
        });
      } catch (error) {
        console.error('Error handling external fuel change:', error);
      }
    });
  }

  invalidateFuelCaches(change = {}) {
    this.clearTransactionCaches();
    sharedQueryCacheService.invalidateNamespace('fuel-overview-summary');
    this.notifyClientChange(change);
  }

  runBackgroundFuelTasks(tasks = [], label = 'fuel follow-up') {
    const pendingTasks = tasks.filter(Boolean);
    if (pendingTasks.length === 0) {
      return;
    }

    Promise.allSettled(pendingTasks).then((results) => {
      const failures = results.filter((result) => result.status === 'rejected');
      if (failures.length > 0) {
        console.warn(`Non-blocking ${label} completed with failures:`, failures.map((failure) => failure.reason));
      }
    }).catch((error) => {
      console.warn(`Non-blocking ${label} failed unexpectedly:`, error);
    });
  }

  subscribeToClientChanges(callback) {
    if (typeof callback !== 'function') {
      return () => {};
    }

    this.clientChangeSubscribers.add(callback);

    return () => {
      this.clientChangeSubscribers.delete(callback);
    };
  }

  async scopeFuelQuery(query, tableName, message = null) {
    return scopeTenantOwnedQuery(query, tableName, {
      message: message || `Workspace organization context is required for ${tableName}.`,
    });
  }

  async resolveFuelScopeOrganizationId(tableName, message = null) {
    if (!shouldScopeSharedTenantData() || !isTenantOwnedSharedTable(tableName)) {
      return null;
    }

    return requireCurrentOrganizationId(
      message || `Workspace organization context is required for ${tableName}.`,
    );
  }

  applyResolvedFuelScope(query, organizationId) {
    return organizationId ? applyOrganizationScope(query, organizationId) : query;
  }

  async scopeFuelPayload(payload, tableName, message = null) {
    return matchTenantOwnedPayload(payload, tableName, {
      message: message || `Workspace organization context is required for ${tableName}.`,
    });
  }

  markVehicleFuelStateTableWithoutOrganizationColumn() {
    this.vehicleFuelStateOrganizationColumnSupport = false;
    try {
      if (typeof window === 'undefined') return;
      window.sessionStorage.setItem(VEHICLE_FUEL_STATE_ORG_COLUMN_CACHE_KEY, 'false');
    } catch (_error) {
      // Ignore storage access issues.
    }
  }

  markFuelRefillsTableWithoutOrganizationColumn() {
    this.fuelRefillsOrganizationColumnSupport = false;
    try {
      if (typeof window === 'undefined') return;
      window.sessionStorage.setItem(FUEL_REFILLS_ORG_COLUMN_CACHE_KEY, 'false');
    } catch (_error) {
      // Ignore storage access issues.
    }
  }

  async runFuelRefillsReadQuery(selectCandidates, configureQuery) {
    if (shouldScopeSharedTenantData() && this.fuelRefillsOrganizationColumnSupport === false) {
      return { data: [], error: null };
    }

    let data = null;
    let error = null;

    for (let index = 0; index < selectCandidates.length; index += 1) {
      let query = supabase.from(this.fuelRefillsTable).select(selectCandidates[index]);
      query = configureQuery(query);
      query = await this.scopeFuelQuery(query, this.fuelRefillsTable);
      const result = await query;
      data = result.data;
      error = result.error;

      if (isMissingFuelRefillsOrganizationColumnError(error)) {
        this.markFuelRefillsTableWithoutOrganizationColumn();
        console.warn('fuel_refills has no organization_id column; skipping legacy fuel_refills in tenant-scoped workspace.');
        return { data: [], error: null };
      }

      if (!error) {
        break;
      }

      if (!this.isRetryableSchemaError(error) || index === selectCandidates.length - 1) {
        break;
      }
    }

    return { data, error };
  }

  async runVehicleFuelStateReadQuery(buildQuery, message = null) {
    const runUnscoped = async () => buildQuery();

    if (this.vehicleFuelStateOrganizationColumnSupport === false) {
      return runUnscoped();
    }

    let query = buildQuery();
    query = await this.scopeFuelQuery(
      query,
      this.vehicleFuelStateTable,
      message || 'Workspace organization context is required to load vehicle fuel states.',
    );

    const result = await query;
    if (isMissingFuelStateOrganizationColumnError(result?.error)) {
      this.markVehicleFuelStateTableWithoutOrganizationColumn();
      console.warn('vehicle_fuel_state has no organization_id column; retrying read without organization filter.');
      return runUnscoped();
    }

    return result;
  }

  async runVehicleFuelStateWriteQuery(buildPayload, message = null) {
    const runUnscoped = async () => {
      const payload = stripOrganizationField(buildPayload());
      return supabase
        .from(this.vehicleFuelStateTable)
        .upsert(payload, { onConflict: 'vehicle_id' })
        .select('*')
        .maybeSingle();
    };

    if (this.vehicleFuelStateOrganizationColumnSupport === false) {
      return runUnscoped();
    }

    const scopedPayload = await this.scopeFuelPayload(
      buildPayload(),
      this.vehicleFuelStateTable,
      message || 'Workspace organization context is required to save vehicle fuel states.',
    );

    let query = supabase
      .from(this.vehicleFuelStateTable)
      .upsert(scopedPayload, { onConflict: 'vehicle_id' })
      .select('*');
    query = this.applyResolvedFuelScope(
      query,
      await this.resolveFuelScopeOrganizationId(
        this.vehicleFuelStateTable,
        message || 'Workspace organization context is required to save vehicle fuel states.',
      ),
    );

    const result = await query.maybeSingle();
    if (isMissingFuelStateOrganizationColumnError(result?.error)) {
      this.markVehicleFuelStateTableWithoutOrganizationColumn();
      console.warn('vehicle_fuel_state has no organization_id column; retrying write without organization field.');
      return runUnscoped();
    }

    return result;
  }

  async tableExists(tableName) {
    if (this.tableAvailabilityCache.has(tableName)) {
      return this.tableAvailabilityCache.get(tableName);
    }

    const storageKey = `fuel-table-exists:${tableName}`;
    if (typeof window !== 'undefined') {
      const cachedValue = window.sessionStorage.getItem(storageKey);
      if (cachedValue === 'true' || cachedValue === 'false') {
        const exists = cachedValue === 'true';
        this.tableAvailabilityCache.set(tableName, exists);
        return exists;
      }
    }

    if (this.tableAvailabilityPromiseCache.has(tableName)) {
      return this.tableAvailabilityPromiseCache.get(tableName);
    }

    const probePromise = (async () => {
      try {
        const { error } = await supabase.from(tableName).select('*').limit(1);
        if (error && (this.isRetryableSchemaError(error) || this.isTransientServiceError(error))) {
          this.tableAvailabilityCache.set(tableName, false);
          this.markTableFailureCooldown(tableName);
          if (typeof window !== 'undefined') {
            window.sessionStorage.setItem(storageKey, 'false');
          }
          return false;
        }
        const normalizedMessage = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
        const isMissingRelation =
          error?.code === '42P01' ||
          normalizedMessage.includes('does not exist') ||
          normalizedMessage.includes('relation') && normalizedMessage.includes('does not exist');
        const exists = !error || !isMissingRelation;
        this.tableAvailabilityCache.set(tableName, exists);
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(storageKey, exists ? 'true' : 'false');
        }
        return exists;
      } catch (_error) {
        return true;
      } finally {
        this.tableAvailabilityPromiseCache.delete(tableName);
      }
    })();

    this.tableAvailabilityPromiseCache.set(tableName, probePromise);
    return probePromise;
  }

  clearTableExistsCache(tableName) {
    this.tableAvailabilityCache.delete(tableName);
    this.tableAvailabilityPromiseCache.delete(tableName);
    this.tableFailureCooldowns.delete(tableName);

    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(`fuel-table-exists:${tableName}`);
    }
  }

  markTableUnavailable(tableName) {
    this.tableAvailabilityCache.set(tableName, false);
    this.tableAvailabilityPromiseCache.delete(tableName);
    this.tableFailureCooldowns.delete(tableName);

    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(`fuel-table-exists:${tableName}`, 'false');
    }
  }

  clearTransactionCaches() {
    this.transactionListCache.clear();
    this.transactionListPromiseCache.clear();
    this.fuelOverviewCache.clear();
    this.fuelOverviewPromiseCache.clear();
    this.vehicleFuelStatesCache = null;
    this.vehicleFuelStatesCacheTimestamp = 0;
    this.vehicleFuelStatesPromise = null;
  }

  resetFuelStateAvailability() {
    this.clearTableExistsCache(this.vehicleFuelStateTable);
    this.clearTableExistsCache(this.fuelOperationLogsTable);
    this.vehicleFuelStatesCache = null;
    this.vehicleFuelStatesCacheTimestamp = 0;
    this.vehicleFuelStatesPromise = null;
  }

  getCachedFuelOverview({
    recentRefillsLimit = 8,
    recentWithdrawalsLimit = 8,
    includeVehicleStates = true,
  } = {}) {
    const cacheKey = JSON.stringify({
      recentRefillsLimit,
      recentWithdrawalsLimit,
      includeVehicleStates,
    });
    const cachedEntry = this.fuelOverviewCache.get(cacheKey);
    if (cachedEntry && Date.now() - cachedEntry.timestamp < FUEL_OVERVIEW_CACHE_TTL_MS) {
      return cachedEntry.value;
    }
    return null;
  }

  getCachedVehicleFuelStates() {
    if (this.vehicleFuelStatesCache && Date.now() - this.vehicleFuelStatesCacheTimestamp < VEHICLE_FUEL_STATES_CACHE_TTL_MS) {
      return this.vehicleFuelStatesCache;
    }
    return null;
  }

  getCachedDefaultTransactions(limit = 20, offset = 0) {
    const cacheKey = JSON.stringify({
      limit,
      offset,
      search: '',
      vehicleId: '',
      transactionType: '',
      fuelType: '',
      startDate: '',
      endDate: '',
      fuelStation: '',
      location: '',
    });
    const cachedEntry = this.transactionListCache.get(cacheKey);
    if (cachedEntry && Date.now() - cachedEntry.timestamp < DEFAULT_TRANSACTIONS_CACHE_TTL_MS) {
      return cachedEntry.value;
    }
    return null;
  }

  isRetryableSchemaError(error) {
    const normalizedError = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
    return (
      normalizedError.includes('schema cache') ||
      normalizedError.includes('could not find the') ||
      normalizedError.includes('could not find a relationship') ||
      normalizedError.includes('relationship between') ||
      normalizedError.includes('column') ||
      normalizedError.includes('embed') ||
      normalizedError.includes('pgrst')
    );
  }

  isTransientServiceError(error) {
    const normalizedError = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
    return (
      normalizedError.includes('service unavailable') ||
      normalizedError.includes('failed to fetch') ||
      normalizedError.includes('fetch failed') ||
      normalizedError.includes('networkerror') ||
      normalizedError.includes('network error') ||
      normalizedError.includes('err_failed') ||
      normalizedError.includes('cors') ||
      normalizedError.includes('schema cache') ||
      normalizedError.includes('pgrst002') ||
      normalizedError.includes('503') ||
      normalizedError.includes('520') ||
      normalizedError.includes('500')
    );
  }

  isTableInFailureCooldown(tableName) {
    const cooldownUntil = this.tableFailureCooldowns.get(tableName) || 0;
    if (!cooldownUntil) {
      return false;
    }
    if (Date.now() >= cooldownUntil) {
      this.tableFailureCooldowns.delete(tableName);
      return false;
    }
    return true;
  }

  markTableFailureCooldown(tableName, durationMs = FUEL_SOURCE_FAILURE_COOLDOWN_MS) {
    this.tableFailureCooldowns.set(tableName, Date.now() + durationMs);
  }

  withTimeout(promise, fallbackValue, timeoutMs = FUEL_HEALTH_REQUEST_TIMEOUT_MS) {
    let timeoutId = null;

    const timeoutPromise = new Promise((resolve) => {
      timeoutId = setTimeout(() => resolve(fallbackValue), timeoutMs);
    });

    return Promise.race([
      Promise.resolve(promise).finally(() => {
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
      }),
      timeoutPromise,
    ]);
  }

  async refreshTableExists(tableName) {
    this.clearTableExistsCache(tableName);
    return this.tableExists(tableName);
  }

  getMockVehicles() {
    return [];
  }

  linesToLiters(lines, tankCapacityLiters = DEFAULT_VEHICLE_TANK_LITERS, maxLines = DEFAULT_FUEL_LINES) {
    return linesToLiters(lines, tankCapacityLiters, maxLines);
  }

  litersToLines(liters, tankCapacityLiters = DEFAULT_VEHICLE_TANK_LITERS, maxLines = DEFAULT_FUEL_LINES) {
    return litersToLines(liters, tankCapacityLiters, maxLines);
  }

  getTransactionTypeLabel(type) {
    switch (type) {
      case 'tank_refill':
        return 'Add to Tank';
      case 'vehicle_refill':
        return 'Direct Fill';
      case 'tank_out':
        return 'Remove from Tank';
      case 'withdrawal':
        return 'Tank Transfer';
      case 'staff_fuel_use':
        return 'Staff Fuel Use';
      case 'rental_opening_level':
        return 'Rental Opening Fuel';
      case 'rental_closing_level':
        return 'Rental Return Fuel';
      case 'manual_adjustment':
        return 'Manual Fuel Correction';
      case 'manual_tank_adjustment':
        return 'Manual Tank Correction';
      default:
        return type;
    }
  }

  isFinancialExpense(type) {
    return type === 'tank_refill' || type === 'vehicle_refill';
  }

  buildActor(actor = {}) {
    if (!actor) {
      return {
        performed_by_user_id: null,
        performed_by_name: 'System',
      };
    }

    return {
      performed_by_user_id: actor.id || actor.user_id || null,
      performed_by_name:
        actor.full_name ||
        actor.fullName ||
        actor.name ||
        actor.email ||
        actor.performed_by_name ||
        actor.filled_by ||
        'System',
    };
  }

  buildActionTimestamp(inputDate) {
    if (!inputDate) {
      return new Date().toISOString();
    }

    if (typeof inputDate === 'string' && inputDate.includes('T')) {
      return inputDate;
    }

    const now = new Date();
    const [year, month, day] = String(inputDate).split('-').map((value) => parseInt(value, 10));
    if (!year || !month || !day) {
      return now.toISOString();
    }

    const merged = new Date(
      year,
      month - 1,
      day,
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
      now.getMilliseconds(),
    );

    return merged.toISOString();
  }

  normalizeReceiptMedia(invoiceImage) {
    if (!invoiceImage) {
      return null;
    }

    if (typeof invoiceImage === 'string') {
      return {
        type: 'legacy_url',
        url: invoiceImage,
        name: 'receipt',
      };
    }

    if (invoiceImage.url || invoiceImage.data) {
      return {
        ...invoiceImage,
        uploaded_at: invoiceImage.uploaded_at || new Date().toISOString(),
      };
    }

    return invoiceImage;
  }

  async checkTablesExist() {
    const [
      fuelTankExists,
      fuelRefillsExists,
      vehicleFuelRefillsExists,
      fuelWithdrawalsExists,
      vehiclesExists,
      vehicleFuelStateExists,
      fuelOperationLogsExists,
    ] = await Promise.all([
      this.tableExists(this.fuelTankTable),
      this.tableExists(this.fuelRefillsTable),
      this.tableExists(this.vehicleFuelRefillsTable),
      this.tableExists(this.fuelWithdrawalsTable),
      this.tableExists(this.vehiclesTable),
      this.tableExists(this.vehicleFuelStateTable),
      this.tableExists(this.fuelOperationLogsTable),
    ]);

    return {
      fuelTankExists,
      fuelRefillsExists,
      vehicleFuelRefillsExists,
      fuelWithdrawalsExists,
      vehiclesExists,
      vehicleFuelStateExists,
      fuelOperationLogsExists,
      transactionsExists: fuelRefillsExists || vehicleFuelRefillsExists || fuelWithdrawalsExists,
      allTablesExist:
        fuelTankExists &&
        fuelWithdrawalsExists &&
        vehiclesExists &&
        (fuelRefillsExists || vehicleFuelRefillsExists),
    };
  }

  async getFuelTankData() {
    const tankExists = await this.tableExists(this.fuelTankTable);
    if (!tankExists) {
      const currentVolumeLiters = await this.calculateCurrentTankVolume(this.defaultTankSettings);
      return {
        ...this.defaultTankSettings,
        current_volume_liters: currentVolumeLiters,
      };
    }

    let tankQuery = supabase
      .from(this.fuelTankTable)
      .select('*')
      .order('created_at', { ascending: true })
      .limit(1);

    // Supabase builders are thenable; do not pass this query through an async
    // wrapper before maybeSingle(), or the query executes early and loses
    // terminal methods like maybeSingle().
    tankQuery = this.applyResolvedFuelScope(
      tankQuery,
      await this.resolveFuelScopeOrganizationId(
        this.fuelTankTable,
        'Workspace organization context is required to load fuel tank data.',
      ),
    );

    const { data, error } = await tankQuery.maybeSingle();

    if (error || !data) {
      const currentVolumeLiters = await this.calculateCurrentTankVolume(this.defaultTankSettings);
      return {
        ...this.defaultTankSettings,
        current_volume_liters: currentVolumeLiters,
      };
    }

    const capacity = Number(data.capacity_liters || data.capacity || this.defaultTankSettings.capacity);
    const persistedCurrentVolume =
      data.current_volume_liters !== null && data.current_volume_liters !== undefined
        ? Number(data.current_volume_liters)
        : null;
    const currentVolumeLiters =
      persistedCurrentVolume !== null && !Number.isNaN(persistedCurrentVolume)
        ? Math.max(0, roundTo(Math.min(capacity, persistedCurrentVolume), 2))
        : await this.calculateCurrentTankVolume(data);

    return {
      ...this.defaultTankSettings,
      ...data,
      name: data.name || 'Main Tank',
      capacity,
      initial_volume: Number(data.initial_volume || 0),
      current_volume_liters: currentVolumeLiters,
      low_threshold_liters: Number(data.low_threshold_liters || data.low_threshold || 150),
      fuel_type: data.fuel_type || 'gasoline',
    };
  }

  buildTankAvailabilityError({ requestedLiters, availableLiters } = {}) {
    const requested = roundToHalfLiter(Number(requestedLiters || 0));
    const available = roundToHalfLiter(Number(availableLiters || 0));
    return `Insufficient fuel in the main tank. Requested ${requested.toFixed(1)}L but only ${available.toFixed(1)}L is available right now.`;
  }

  async ensureSufficientTankVolume(requestedLiters, { availableLitersOverride = null } = {}) {
    const liveTank = await this.getFuelTankData();
    const availableLiters = availableLitersOverride !== null && availableLitersOverride !== undefined
      ? Number(availableLitersOverride || 0)
      : Number(liveTank?.current_volume_liters || 0);
    const safeAvailableLiters = roundToHalfLiter(Math.max(0, availableLiters));
    const safeRequestedLiters = roundToHalfLiter(Math.max(0, Number(requestedLiters || 0)));

    if (safeRequestedLiters > safeAvailableLiters) {
      return {
        success: false,
        error: this.buildTankAvailabilityError({
          requestedLiters: safeRequestedLiters,
          availableLiters: safeAvailableLiters,
        }),
        tank: liveTank,
        availableLiters: safeAvailableLiters,
        requestedLiters: safeRequestedLiters,
      };
    }

    return {
      success: true,
      tank: liveTank,
      availableLiters: safeAvailableLiters,
      requestedLiters: safeRequestedLiters,
    };
  }

  async updateTankCurrentVolume(nextVolume, { rejectNegative = false, tankSnapshot = null } = {}) {
    if (!(await this.tableExists(this.fuelTankTable))) {
      return { success: false, error: 'Fuel tank table not available' };
    }

    const tank = tankSnapshot?.id ? tankSnapshot : await this.getFuelTankData();
    const tankRowId = tank?.id;
    if (!tankRowId) {
      return { success: false, error: 'Main tank row not found' };
    }

    const capacity = Number(tank.capacity || tank.capacity_liters || this.defaultTankSettings.capacity);
    const requestedVolume = Number(nextVolume || 0);
    if (rejectNegative && requestedVolume < 0) {
      return {
        success: false,
        error: this.buildTankAvailabilityError({
          requestedLiters: Math.abs(requestedVolume),
          availableLiters: Number(tank?.current_volume_liters || 0),
        }),
      };
    }
    const safeVolume = Math.max(0, roundTo(Math.min(capacity, Number(nextVolume) || 0), 2));

    const { data, error } = await supabase
      .from(this.fuelTankTable)
      .update({
        current_volume_liters: safeVolume,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tankRowId)
      .select('*')
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, tank: data || { ...tank, current_volume_liters: safeVolume } };
  }

  async adjustTankCurrentVolume(deltaLiters, options = {}) {
    const tank = options.tankSnapshot?.id ? options.tankSnapshot : await this.getFuelTankData();
    const current = Number(tank?.current_volume_liters || 0);
    return this.updateTankCurrentVolume(current + Number(deltaLiters || 0), {
      ...options,
      tankSnapshot: tank,
    });
  }

  async adjustTankLevel({
    liters,
    reason,
    notes,
    actor,
  } = {}) {
    if (!(await this.tableExists(this.fuelTankTable))) {
      return { success: false, error: 'Fuel tank table not available' };
    }

    const tank = await this.getFuelTankData();
    const tankId = tank?.id || null;
    const currentVolume = Number(tank?.current_volume_liters ?? tank?.current_level ?? tank?.initial_volume ?? 0);
    const capacity = Number(tank?.capacity ?? tank?.capacity_liters ?? this.defaultTankSettings.capacity);
    const nextVolume = Math.max(0, roundTo(Math.min(capacity, Number(liters || 0)), 2));

    const updateResult = await this.updateTankCurrentVolume(nextVolume);
    if (!updateResult.success) {
      return updateResult;
    }

    const composedNotes = [reason, notes]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join(' • ');

    const logResult = await this.logFuelOperation({
      transaction_type: 'manual_tank_adjustment',
      source: 'manual_tank_adjustment',
      tank_id: tankId,
      liters: Math.abs(nextVolume - currentVolume),
      liters_before: currentVolume,
      liters_after: nextVolume,
      actor,
      notes: composedNotes || 'Manual tank level adjustment',
      is_financial_expense: false,
    });

    if (!logResult.success && !logResult.skipped) {
      return logResult;
    }

    this.invalidateFuelCaches({
      entity: 'fuel_tank',
      reason: 'manual_tank_adjustment',
      transactionType: 'manual_tank_adjustment',
    });

    return {
      success: true,
      tank: {
        ...(updateResult.tank || tank),
        current_volume_liters: nextVolume,
        capacity,
      },
    };
  }

  async updateTankSettings(tankData = {}) {
    if (!(await this.tableExists(this.fuelTankTable))) {
      return { success: false, error: 'Fuel tank table not available' };
    }

    const { data: existingRow, error: existingRowError } = await supabase
      .from(this.fuelTankTable)
      .select('*')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existingRowError) {
      return { success: false, error: existingRowError.message };
    }

    const existingTank = existingRow || await this.getFuelTankData();
    const resolvedCapacity = Number(
      tankData.capacity_liters ??
      tankData.capacity ??
      existingTank?.capacity ??
      this.defaultTankSettings.capacity
    ) || this.defaultTankSettings.capacity;
    const resolvedInitialVolume = Number(tankData.initial_volume ?? existingTank?.initial_volume ?? 0) || 0;
    const resolvedLowThreshold = Number(
      tankData.low_threshold_liters ??
      existingTank?.low_threshold_liters ??
      this.defaultTankSettings.low_threshold_liters
    ) || this.defaultTankSettings.low_threshold_liters;
    const resolvedLocation = tankData.location || existingTank?.location || this.defaultTankSettings.location;
    const resolvedFuelType = tankData.fuel_type || existingTank?.fuel_type || this.defaultTankSettings.fuel_type;
    const resolvedName = tankData.name || existingTank?.name || 'Main Tank';
    const updateTimestamp = new Date().toISOString();

    const hasExplicitCapacityUpdate =
      Object.prototype.hasOwnProperty.call(tankData, 'capacity_liters') ||
      Object.prototype.hasOwnProperty.call(tankData, 'capacity');
    const hasExplicitInitialVolumeUpdate = Object.prototype.hasOwnProperty.call(tankData, 'initial_volume');
    const hasExplicitLowThresholdUpdate = Object.prototype.hasOwnProperty.call(tankData, 'low_threshold_liters');
    const hasExplicitLocationUpdate = Object.prototype.hasOwnProperty.call(tankData, 'location');
    const hasExplicitFuelTypeUpdate = Object.prototype.hasOwnProperty.call(tankData, 'fuel_type');
    const hasExplicitNameUpdate = Object.prototype.hasOwnProperty.call(tankData, 'name');

    const basePayload = {
      ...(hasExplicitNameUpdate ? { name: resolvedName } : {}),
      ...(hasExplicitCapacityUpdate ? { capacity_liters: resolvedCapacity } : {}),
      ...(hasExplicitInitialVolumeUpdate ? { initial_volume: resolvedInitialVolume } : {}),
      ...(hasExplicitLowThresholdUpdate ? { low_threshold_liters: resolvedLowThreshold } : {}),
      ...(hasExplicitLocationUpdate ? { location: resolvedLocation } : {}),
      ...(hasExplicitFuelTypeUpdate ? { fuel_type: resolvedFuelType } : {}),
      updated_at: updateTimestamp,
    };

    const runTankWrite = async (writePayload) => {
      if (existingRow?.id) {
        return supabase
          .from(this.fuelTankTable)
          .update(writePayload)
          .eq('id', existingRow.id)
          .select('*')
          .single();
      }

      return supabase
        .from(this.fuelTankTable)
        .insert([{
          ...writePayload,
          created_at: new Date().toISOString(),
        }])
        .select('*')
        .single();
    };

    const minimalCapacityPayload = {
      ...(hasExplicitCapacityUpdate ? { capacity: resolvedCapacity } : {}),
      updated_at: updateTimestamp,
    };

    const legacyPayloads = [
      payload,
      {
        ...payload,
        ...(hasExplicitCapacityUpdate ? { capacity: resolvedCapacity } : {}),
      },
      {
        ...minimalCapacityPayload,
        ...(hasExplicitInitialVolumeUpdate ? { initial_volume: resolvedInitialVolume } : {}),
        ...(hasExplicitLocationUpdate ? { location: resolvedLocation } : {}),
      },
      {
        ...minimalCapacityPayload,
        current_level: existingTank?.current_level ?? existingTank?.current_volume_liters ?? existingTank?.initial_volume ?? 0,
        ...(hasExplicitLowThresholdUpdate ? { low_fuel_threshold: resolvedLowThreshold } : {}),
        ...(hasExplicitLocationUpdate ? { location: resolvedLocation } : {}),
      },
      minimalCapacityPayload,
    ].map((candidate) => {
      const next = { ...candidate };
      delete next.capacity_liters;
      delete next.low_threshold_liters;
      delete next.fuel_type;
      delete next.name;
      delete next.current_volume_liters;
      if (!hasExplicitInitialVolumeUpdate) delete next.initial_volume;
      if (!hasExplicitLocationUpdate) delete next.location;
      if (!hasExplicitLowThresholdUpdate) delete next.low_fuel_threshold;
      return next;
    });

    let data = null;
    let error = null;

    for (let index = 0; index < legacyPayloads.length; index += 1) {
      const result = await runTankWrite(index === 0 ? payload : legacyPayloads[index]);
      data = result.data;
      error = result.error;

      if (!error) {
        break;
      }

      const normalizedError = `${error.message || ''} ${error.details || ''}`.toLowerCase();
      const schemaCacheError =
        normalizedError.includes('schema cache') ||
        normalizedError.includes('could not find the') ||
        normalizedError.includes('column');

      if (!schemaCacheError || index === legacyPayloads.length - 1) {
        break;
      }
    }

    if (error) {
      return { success: false, error: error.message };
    }

    this.invalidateFuelCaches({
      entity: 'fuel_tank',
      reason: 'tank_settings_updated',
    });

    return { success: true, tank: data };
  }

  async runSelectWithFallbacks(tableName, selectCandidates, configureQuery) {
    let data = null;
    let error = null;

    for (let index = 0; index < selectCandidates.length; index += 1) {
      let query = supabase.from(tableName).select(selectCandidates[index]);
      query = configureQuery(query);
      query = await this.scopeFuelQuery(query, tableName);
      const result = await query;
      data = result.data;
      error = result.error;

      if (!error) {
        break;
      }

      if (!this.isRetryableSchemaError(error) || index === selectCandidates.length - 1) {
        break;
      }
    }

    return { data, error };
  }

  async calculateCurrentTankVolume(tankData) {
    const capacity = Number(
      tankData?.capacity_liters ??
      tankData?.capacity ??
      this.defaultTankSettings.capacity
    ) || this.defaultTankSettings.capacity;
    const initialVolume = Number(
      tankData?.initial_volume ??
        this.defaultTankSettings.initial_volume
    );

    const [tankRefills, withdrawals] = await Promise.all([
      this.getTankRefills(),
      this.getAllWithdrawals(),
    ]);

    const refillsTotal = tankRefills.reduce(
      (sum, refill) => sum + (Number(refill.liters_added || refill.liters || refill.amount) || 0),
      0
    );
    const withdrawalsTotal = withdrawals.reduce(
      (sum, withdrawal) => sum + (Number(withdrawal.liters_taken || withdrawal.amount) || 0),
      0
    );

    return Math.max(0, roundTo(Math.min(capacity, initialVolume + refillsTotal - withdrawalsTotal), 2));
  }

  async getVehicleLookup(vehicleIds = []) {
    const uniqueIds = Array.from(
      new Set(
        (vehicleIds || [])
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value))
      )
    );

    if (!uniqueIds.length) {
      return new Map();
    }

    let query = supabase
      .from(this.vehiclesTable)
      .select('id, name, plate_number, model, vehicle_type')
      .in('id', uniqueIds);
    query = await this.scopeFuelQuery(
      query,
      this.vehiclesTable,
      'Workspace organization context is required to load fuel vehicles.',
    );

    const { data, error } = await query;

    if (error) {
      return new Map();
    }

    return new Map((data || []).map((vehicle) => [Number(vehicle.id), vehicle]));
  }

  buildFeedVehicleFallback(row = {}) {
    if (!row?.vehicle_id) {
      return null;
    }

    return {
      id: row.vehicle_id,
      name: row.vehicle_name || null,
      plate_number: row.vehicle_plate || null,
      model: row.vehicle_model || null,
      vehicle_type: row.vehicle_type || null,
    };
  }

  async getFilteredDefaultFeedTransactions(transactionTypes = [], limit = 20) {
    const normalizedTypes = Array.from(
      new Set((transactionTypes || []).filter(Boolean).map((value) => String(value).trim().toLowerCase()))
    );

    if (normalizedTypes.length === 0) {
      return [];
    }

    const feedFetchLimit = Math.max(limit * 5, 25);
    const feed = await this.getDefaultTransactionsFeed({ limit: feedFetchLimit, offset: 0 });
    if (!feed?.success) {
      return [];
    }

    return (feed.transactions || [])
      .filter((transaction) => normalizedTypes.includes(String(transaction.transaction_type || '').trim().toLowerCase()))
      .slice(0, limit);
  }

  async getDefaultTransactionsFeed(options = {}) {
    const { limit = 20, offset = 0 } = options;

    if (this.isTableInFailureCooldown(this.defaultTransactionsFeedView)) {
      return null;
    }

    if (!(await this.tableExists(this.defaultTransactionsFeedView))) {
      return null;
    }

    const end = Math.max(offset, offset + limit - 1);
    let feedQuery = supabase
      .from(this.defaultTransactionsFeedView)
      .select(
        [
          'id',
          'transaction_date',
          'transaction_type',
          'fuel_type',
          'amount',
          'cost',
          'unit_price',
          'fuel_station',
          'location',
          'odometer_reading',
          'notes',
          'filled_by',
          'performed_by_name',
          'performed_by_user_id',
          'vehicle_id',
          'vehicle_name',
          'vehicle_plate',
          'vehicle_model',
          'vehicle_type',
          'created_at',
          'source',
          'is_financial_expense',
          'receipt_media',
          'invoice_image',
          'rental_id',
          'rental_reference',
          'fuel_lines_before',
          'fuel_lines_after',
          'liters_before',
          'liters_after',
        ].join(', '),
        { count: 'exact' }
      )
      .order('transaction_date', { ascending: false })
      .range(offset, end);
    feedQuery = await this.scopeFuelQuery(
      feedQuery,
      this.defaultTransactionsFeedView,
      'Workspace organization context is required to load fuel logs.',
    );

    const { data, error, count } = await feedQuery;

    if (error) {
      if (this.isRetryableSchemaError(error) || this.isTransientServiceError(error)) {
        this.markTableFailureCooldown(this.defaultTransactionsFeedView);
        console.warn('Default fuel transactions feed view unavailable; falling back to client merge:', error);
      } else {
        this.markTableUnavailable(this.defaultTransactionsFeedView);
      }
      return null;
    }

    const rows = data || [];
    const vehicleLookup = await this.getVehicleLookup(rows.map((row) => row.vehicle_id));
    const rentalRows = rows.filter(
      (row) =>
        (row.transaction_type === 'rental_opening_level' || row.transaction_type === 'rental_closing_level') &&
        row.rental_id
    );
    const rentalIds = rentalRows.map((row) => row.rental_id);
    const [rentalFuelLevelsMap, rentalReferenceLookup] = await Promise.all([
      this.getRentalFuelLevelsMap(rentalIds),
      this.getRentalReferenceLookup(rentalIds),
    ]);

    const rentalOpeningSnapshots = new Map();
    for (const row of [...rentalRows].sort(
      (a, b) => new Date(a.created_at || a.transaction_date || 0) - new Date(b.created_at || b.transaction_date || 0)
    )) {
      if (row.transaction_type !== 'rental_opening_level' || !row.rental_id) {
        continue;
      }

      const openingLiters =
        row.liters_after ??
        (row.fuel_lines_after !== null && row.fuel_lines_after !== undefined ? linesToLiters(row.fuel_lines_after) : null);

      if (openingLiters !== null && openingLiters !== undefined) {
        rentalOpeningSnapshots.set(String(row.rental_id), Number(openingLiters));
      }
    }

    const transactions = rows.map((row) => {
      const vehicle = vehicleLookup.get(Number(row.vehicle_id)) || this.buildFeedVehicleFallback(row);
      const rentalFuelLevels = row.rental_id ? rentalFuelLevelsMap.get(String(row.rental_id)) : null;
      const rentalOpeningLitersFromTable =
        rentalFuelLevels?.start_fuel_level !== null && rentalFuelLevels?.start_fuel_level !== undefined
          ? linesToLiters(rentalFuelLevels.start_fuel_level)
          : null;
      const isRentalOpening = row.transaction_type === 'rental_opening_level';
      const isRentalClosing = row.transaction_type === 'rental_closing_level';
      const overrideFuelLinesBefore =
        isRentalClosing && rentalFuelLevels?.start_fuel_level !== null && rentalFuelLevels?.start_fuel_level !== undefined
          ? rentalFuelLevels.start_fuel_level
          : row.fuel_lines_before;
      const overrideFuelLinesAfter =
        isRentalOpening && rentalFuelLevels?.start_fuel_level !== null && rentalFuelLevels?.start_fuel_level !== undefined
          ? rentalFuelLevels.start_fuel_level
          : isRentalClosing && rentalFuelLevels?.end_fuel_level !== null && rentalFuelLevels?.end_fuel_level !== undefined
            ? rentalFuelLevels.end_fuel_level
            : row.fuel_lines_after;
      const overrideLitersBefore =
        overrideFuelLinesBefore !== null && overrideFuelLinesBefore !== undefined
          ? linesToLiters(overrideFuelLinesBefore)
          : row.liters_before;
      const overrideLitersAfter =
        overrideFuelLinesAfter !== null && overrideFuelLinesAfter !== undefined
          ? linesToLiters(overrideFuelLinesAfter)
          : row.liters_after;
      const derivedAmount = this.deriveRentalFuelLogAmount(
        {
          ...row,
          fuel_lines_before: overrideFuelLinesBefore,
          fuel_lines_after: overrideFuelLinesAfter,
          liters_before: overrideLitersBefore,
          liters_after: overrideLitersAfter,
        },
        row.rental_id
          ? (rentalOpeningSnapshots.get(String(row.rental_id)) ?? rentalOpeningLitersFromTable)
          : null
      );

      return this.mapTransactionRecord({
        ...row,
        rental_reference: row.rental_reference || (row.rental_id ? rentalReferenceLookup.get(String(row.rental_id)) || null : null),
        fuel_lines_before: overrideFuelLinesBefore,
        fuel_lines_after: overrideFuelLinesAfter,
        liters_before: overrideLitersBefore,
        liters_after: overrideLitersAfter,
        amount: derivedAmount !== undefined ? derivedAmount : row.amount,
        vehicle,
        [this.vehiclesTable]: vehicle,
        saharax_0u4w4d_vehicles: vehicle,
      });
    });

    return {
      success: true,
      transactions,
      totalCount: Number(count ?? transactions.length ?? 0),
    };
  }

  async getRentalVehicleLookup(rentalIds = []) {
    const uniqueRentalIds = Array.from(
      new Set((rentalIds || []).filter(Boolean).map((value) => String(value)))
    );

    if (!uniqueRentalIds.length) {
      return new Map();
    }

    const rentalsTableExists = await this.tableExists(RENTALS_TABLE);
    if (!rentalsTableExists) {
      return new Map();
    }

    let rentalsQuery = supabase
      .from(RENTALS_TABLE)
      .select('id, vehicle_id')
      .in('id', uniqueRentalIds);
    rentalsQuery = await this.scopeFuelQuery(
      rentalsQuery,
      RENTALS_TABLE,
      'Workspace organization context is required to load rental vehicle mappings.',
    );

    const { data, error } = await rentalsQuery;

    if (error) {
      return new Map();
    }

    const vehicleLookup = await this.getVehicleLookup((data || []).map((row) => row.vehicle_id));
    return new Map(
      (data || [])
        .filter((row) => row?.id)
        .map((row) => [String(row.id), vehicleLookup.get(Number(row.vehicle_id)) || null])
    );
  }

  async getRentalReferenceLookup(rentalIds = []) {
    const uniqueRentalIds = Array.from(
      new Set((rentalIds || []).filter(Boolean).map((value) => String(value)))
    );

    if (!uniqueRentalIds.length) {
      return new Map();
    }

    const rentalsTableExists = await this.tableExists(RENTALS_TABLE);
    if (!rentalsTableExists) {
      return new Map();
    }

    const [byInternalId, byReference] = await Promise.all([
      this.scopeFuelQuery(
        supabase
        .from(RENTALS_TABLE)
        .select('id, rental_id')
        .in('id', uniqueRentalIds),
        RENTALS_TABLE,
        'Workspace organization context is required to load rental references.',
      ).then((query) => query),
      this.scopeFuelQuery(
        supabase
        .from(RENTALS_TABLE)
        .select('id, rental_id')
        .in('rental_id', uniqueRentalIds),
        RENTALS_TABLE,
        'Workspace organization context is required to load rental references.',
      ).then((query) => query),
    ]);

    const rows = [
      ...(byInternalId.data || []),
      ...(byReference.data || []),
    ];

    if (byInternalId.error && byReference.error) {
      return new Map();
    }

    const lookup = new Map();
    for (const row of rows) {
      if (!row?.rental_id) continue;
      if (row.id) {
        lookup.set(String(row.id), row.rental_id);
      }
      lookup.set(String(row.rental_id), row.rental_id);
    }

    return lookup;
  }

  async getVehicleModelsForFuelState() {
    if (this.vehicleModelTankCapacitySupport === false) {
      let fallbackQuery = supabase
        .from(this.vehicleModelsTable)
        .select('id, name, model');
      fallbackQuery = await this.scopeFuelQuery(
        fallbackQuery,
        this.vehicleModelsTable,
        'Workspace organization context is required to load vehicle models.',
      );
      const fallbackResult = await fallbackQuery;

      if (fallbackResult.error) {
        return [];
      }

      return (fallbackResult.data || []).map((model) => ({
        ...model,
        tank_capacity_liters: null,
      }));
    }

    let fullQuery = supabase
      .from(this.vehicleModelsTable)
      .select('id, name, model, tank_capacity_liters');
    fullQuery = await this.scopeFuelQuery(
      fullQuery,
      this.vehicleModelsTable,
      'Workspace organization context is required to load vehicle models.',
    );
    const fullResult = await fullQuery;

    if (!fullResult.error) {
      this.vehicleModelTankCapacitySupport = true;
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem('fuel:vehicle-models:tank-capacity-support', 'true');
      }
      return fullResult.data || [];
    }

    if (!this.isRetryableSchemaError(fullResult.error)) {
      return [];
    }

    this.vehicleModelTankCapacitySupport = false;
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('fuel:vehicle-models:tank-capacity-support', 'false');
    }

    let fallbackQuery = supabase
      .from(this.vehicleModelsTable)
      .select('id, name, model');
    fallbackQuery = await this.scopeFuelQuery(
      fallbackQuery,
      this.vehicleModelsTable,
      'Workspace organization context is required to load vehicle models.',
    );
    const fallbackResult = await fallbackQuery;

    if (fallbackResult.error) {
      return [];
    }

    return (fallbackResult.data || []).map((model) => ({
      ...model,
      tank_capacity_liters: null,
    }));
  }

  calculateCurrentVolume(tankData, refills = [], withdrawals = []) {
    const capacity = Number(
      tankData?.capacity_liters ??
      tankData?.capacity ??
      this.defaultTankSettings.capacity
    ) || this.defaultTankSettings.capacity;
    const persistedCurrentVolume = Number(tankData?.current_volume_liters);
    if (Number.isFinite(persistedCurrentVolume)) {
      return Math.max(0, roundTo(Math.min(capacity, persistedCurrentVolume), 2));
    }
    const hasHistory = Array.isArray(refills) && Array.isArray(withdrawals) && (refills.length > 0 || withdrawals.length > 0);
    const initialVolume = Number(
      hasHistory
        ? (tankData?.initial_volume ?? this.defaultTankSettings.initial_volume)
        : (tankData?.current_volume_liters ??
        tankData?.initial_volume ??
        this.defaultTankSettings.initial_volume
      )
    );
    const tankRefillsTotal = refills
      .filter((refill) => refill.transaction_type === 'tank_refill' || !refill.vehicle_id)
      .reduce((sum, refill) => sum + (Number(refill.liters_added || refill.liters || refill.amount) || 0), 0);
    const withdrawalsTotal = withdrawals.reduce(
      (sum, withdrawal) => sum + (Number(withdrawal.liters_taken || withdrawal.amount) || 0),
      0
    );

    return Math.max(0, roundTo(Math.min(capacity, initialVolume + tankRefillsTotal - withdrawalsTotal), 2));
  }

  async getTankRefills(options = {}) {
    const { limit } = options;
    const feedTransactions = await this.getFilteredDefaultFeedTransactions(['tank_refill'], limit || 20);
    if (feedTransactions.length > 0) {
      return feedTransactions.map((transaction) => ({
        ...transaction,
        transaction_date: transaction.transaction_date ?? transaction.created_at ?? null,
        liters_added: transaction.amount ?? transaction.liters_added ?? null,
        total_cost: transaction.cost ?? transaction.total_cost ?? null,
        unit_price: transaction.unit_price ?? null,
        invoice_image: transaction.invoice_image ?? null,
        refilled_by: transaction.performed_by_name ?? transaction.filled_by ?? 'System',
      }));
    }

    if (this.isTableInFailureCooldown(this.fuelRefillsTable)) {
      return [];
    }

    if (!(await this.tableExists(this.fuelRefillsTable))) {
      return [];
    }
    const configureQuery = (baseQuery) => {
      let nextQuery = baseQuery
        .is('vehicle_id', null)
        .order('refill_date', { ascending: false });
      if (limit) {
        nextQuery = nextQuery.limit(limit);
      }
      return nextQuery;
    };

    const { data, error } = await this.runFuelRefillsReadQuery(
      [
        'id, vehicle_id, liters_added, total_cost, refill_date, refilled_by, notes, created_at',
        'id, vehicle_id, liters_added, unit_price, total_cost, refill_date, refilled_by, invoice_photo_url, notes, created_at, invoice_image, fuel_station, fuel_type, location',
        'id, vehicle_id, liters_added, unit_price, total_cost, refill_date, refilled_by, invoice_photo_url, notes, created_at, invoice_image, fuel_station, fuel_type, location, invoice_url',
        'id, vehicle_id, liters_added, unit_price, total_cost, refill_date, refilled_by, invoice_photo_url, notes, created_at, invoice_image, fuel_station, fuel_type, location, invoice_url, cost_per_liter',
      ],
      configureQuery,
    );

    if (error) {
      if (this.isRetryableSchemaError(error) || this.isTransientServiceError(error)) {
        this.markTableFailureCooldown(this.fuelRefillsTable);
        console.warn('Fuel refill schema mismatch detected; returning empty tank refills:', error);
      } else {
        this.markTableUnavailable(this.fuelRefillsTable);
      }
      return [];
    }

    return (data || []).map((row) => ({
      ...row,
      liters_added: row.liters_added ?? null,
      total_cost: row.total_cost ?? null,
      unit_price: row.unit_price ?? row.cost_per_liter ?? null,
      fuel_station: row.fuel_station ?? null,
      transaction_date: row.refill_date ?? row.created_at ?? null,
      invoice_image: row.invoice_image ?? row.invoice_photo_url ?? row.invoice_url ?? null,
      performed_by_name: row.refilled_by || 'System',
      transaction_type: 'tank_refill',
      source: 'tank_refill',
      receipt_media: this.normalizeReceiptMedia(row.invoice_image || row.invoice_photo_url || row.invoice_url),
      is_financial_expense: true,
    }));
  }

  async getVehicleRefills(options = {}) {
    const { limit } = options;
    const results = [];

    const feedTransactions = await this.getFilteredDefaultFeedTransactions(['vehicle_refill'], limit || 20);
    if (feedTransactions.length > 0) {
      return feedTransactions.map((transaction) => ({
        ...transaction,
        liters_added: transaction.amount ?? transaction.liters_added ?? null,
        total_cost: transaction.cost ?? transaction.total_cost ?? null,
        unit_price: transaction.unit_price ?? null,
        transaction_date: transaction.transaction_date ?? transaction.created_at ?? null,
        fuel_station: transaction.fuel_station ?? null,
        fuel_type: transaction.fuel_type ?? 'gasoline',
        location: transaction.location ?? null,
        refilled_by: transaction.performed_by_name ?? transaction.filled_by ?? null,
        invoice_image: transaction.invoice_image ?? null,
        performed_by_name: transaction.performed_by_name ?? 'System',
        transaction_type: 'vehicle_refill',
        source: transaction.source || 'direct_station',
        receipt_media: transaction.receipt_media ?? this.normalizeReceiptMedia(transaction.invoice_image),
        is_financial_expense: true,
      }));
    }

    if (!this.isTableInFailureCooldown(this.vehicleFuelRefillsTable) && await this.tableExists(this.vehicleFuelRefillsTable)) {
      let query = supabase
        .from(this.vehicleFuelRefillsTable)
        .select('id, vehicle_id, refill_date, liters, price_per_liter, total_cost, odometer_km, invoice_url, notes, created_by, created_at, invoice_image')
        .order('refill_date', { ascending: false });
      if (limit) {
        query = query.limit(limit);
      }

      query = await this.scopeFuelQuery(
        query,
        this.vehicleFuelRefillsTable,
        'Workspace organization context is required to load vehicle fuel refills.',
      );

      const { data, error } = await query;
      if (error && (this.isRetryableSchemaError(error) || this.isTransientServiceError(error))) {
        this.markTableFailureCooldown(this.vehicleFuelRefillsTable);
      }
      if (!error) {
        results.push(
          ...(data || []).map((row) => ({
            ...row,
            liters_added: row.liters ?? null,
            total_cost: row.total_cost ?? null,
            unit_price: row.price_per_liter ?? null,
            transaction_date: row.refill_date ?? row.created_at ?? null,
            fuel_station: null,
            fuel_type: 'gasoline',
            location: null,
            refilled_by: null,
            transaction_type: 'vehicle_refill',
            source: 'direct_station',
            receipt_media: this.normalizeReceiptMedia(row.invoice_image || row.invoice_url),
            invoice_image: row.invoice_image ?? row.invoice_url ?? null,
            performed_by_name: row.created_by || 'System',
            is_financial_expense: true,
          }))
        );
      }
    }

    // Legacy/live-db compatibility: many environments still store direct vehicle refills
    // in fuel_refills with vehicle_id populated instead of using vehicle_fuel_refills.
    if (!this.isTableInFailureCooldown(this.fuelRefillsTable) && await this.tableExists(this.fuelRefillsTable)) {
      const configureQuery = (baseQuery) => {
        let nextQuery = baseQuery
          .not('vehicle_id', 'is', null)
          .order('refill_date', { ascending: false });
        if (limit) {
          nextQuery = nextQuery.limit(limit);
        }
        return nextQuery;
      };

      const { data, error } = await this.runFuelRefillsReadQuery(
        [
          'id, vehicle_id, liters_added, total_cost, refill_date, refilled_by, notes, created_at',
          'id, vehicle_id, liters_added, unit_price, total_cost, refill_date, refilled_by, invoice_photo_url, notes, created_at, invoice_image, fuel_station, fuel_type, location',
          'id, vehicle_id, liters_added, unit_price, total_cost, refill_date, refilled_by, invoice_photo_url, notes, created_at, invoice_image, fuel_station, fuel_type, location, invoice_url',
          'id, vehicle_id, liters_added, unit_price, total_cost, refill_date, refilled_by, invoice_photo_url, notes, created_at, invoice_image, fuel_station, fuel_type, location, invoice_url, cost_per_liter',
        ],
        configureQuery,
      );

      if (error) {
        if (this.isRetryableSchemaError(error) || this.isTransientServiceError(error)) {
          this.markTableFailureCooldown(this.fuelRefillsTable);
          console.warn('Vehicle refill schema mismatch detected; skipping legacy fuel_refills rows:', error);
        } else {
          this.markTableUnavailable(this.fuelRefillsTable);
        }
      } else {
        results.push(
          ...(data || []).map((row) => ({
            ...row,
            liters_added: row.liters_added ?? null,
            total_cost: row.total_cost ?? null,
            unit_price: row.unit_price ?? row.cost_per_liter ?? null,
            transaction_date: row.refill_date ?? row.created_at ?? null,
            transaction_type: 'vehicle_refill',
            source: 'direct_station',
            receipt_media: this.normalizeReceiptMedia(row.invoice_image || row.invoice_photo_url || row.invoice_url),
            invoice_image: row.invoice_image ?? row.invoice_photo_url ?? row.invoice_url ?? null,
            performed_by_name: row.refilled_by || 'System',
            is_financial_expense: true,
          }))
        );
      }
    }

    const vehicleLookup = await this.getVehicleLookup(results.map((row) => row.vehicle_id));
    const hydrated = results.map((row) => {
      const vehicle = vehicleLookup.get(Number(row.vehicle_id)) || null;
      return {
        ...row,
        vehicle,
        [this.vehiclesTable]: vehicle,
        saharax_0u4w4d_vehicles: vehicle,
      };
    });

    const deduped = new Map();
    for (const row of hydrated) {
      const key = String(row.id);
      if (!deduped.has(key)) {
        deduped.set(key, row);
      }
    }

    return Array.from(deduped.values()).sort(
      (a, b) => new Date(b.refill_date || b.transaction_date || b.created_at) - new Date(a.refill_date || a.transaction_date || a.created_at)
    );
  }

  async getAllWithdrawals(options = {}) {
    const { limit } = options;
    if (!(await this.tableExists(this.fuelWithdrawalsTable))) {
      return [];
    }
    let query = supabase
      .from(this.fuelWithdrawalsTable)
      .select('id, vehicle_id, liters_taken, unit_price, total_cost, withdrawal_date, filled_by, odometer_reading, notes, created_at, transaction_type, source, performed_by_user_id, performed_by_name, is_financial_expense');
    const configureQuery = (baseQuery) => {
      let nextQuery = baseQuery.order('withdrawal_date', { ascending: false });
      if (limit) {
        nextQuery = nextQuery.limit(limit);
      }
      return nextQuery;
    };

    const { data, error } = await this.runSelectWithFallbacks(
      this.fuelWithdrawalsTable,
      [
        'id, vehicle_id, liters_taken, unit_price, total_cost, withdrawal_date, filled_by, odometer_reading, notes, created_at, transaction_type, source, performed_by_user_id, performed_by_name, is_financial_expense',
        'id, vehicle_id, liters_taken, withdrawal_date, filled_by, odometer_reading, notes, created_at, transaction_type, source, performed_by_user_id, performed_by_name, is_financial_expense',
      ],
      configureQuery,
    );

    if (error) {
      return [];
    }

    const vehicleLookup = await this.getVehicleLookup((data || []).map((row) => row.vehicle_id));

    return (data || []).map((row) => {
      const vehicle = vehicleLookup.get(Number(row.vehicle_id)) || null;
      return ({
      ...row,
      vehicle,
      [this.vehiclesTable]: vehicle,
      saharax_0u4w4d_vehicles: vehicle,
      liters_taken: row.liters_taken ?? null,
      unit_price: row.unit_price ?? null,
      total_cost: row.total_cost ?? null,
      transaction_date: row.withdrawal_date ?? row.created_at ?? null,
      notes: row.notes || null,
      transaction_type: row.transaction_type || 'withdrawal',
      source: row.source || 'tank_transfer',
      receipt_media: null,
      performed_by_name: row.performed_by_name || row.filled_by || 'System',
      is_financial_expense: row.is_financial_expense ?? false,
    })});
  }

  async getFuelOperationLogs(options = {}) {
    const {
      limit,
      includeRentalVehicleLookup = true,
      includeRentalReferenceLookup = true,
    } = options;
    if (this.isTableInFailureCooldown(this.fuelOperationLogsTable)) {
      return [];
    }
    if (!(await this.tableExists(this.fuelOperationLogsTable))) {
      return [];
    }

    const configureQuery = (baseQuery) => {
      let query = baseQuery.order('created_at', { ascending: false });
      if (limit) {
        query = query.limit(limit);
      }
      return query;
    };

    const { data, error } = await this.runSelectWithFallbacks(
      this.fuelOperationLogsTable,
      [
        'id, transaction_type, source, vehicle_id, rental_id, liters, unit_price, total_cost, fuel_type, fuel_station, location, odometer_reading, notes, performed_by_name, is_financial_expense, created_at',
        'id, transaction_type, source, tank_id, vehicle_id, rental_id, liters, fuel_lines_before, fuel_lines_after, liters_before, liters_after, unit_price, total_cost, fuel_type, fuel_station, location, odometer_reading, notes, performed_by_name, is_financial_expense, created_at',
        'id, transaction_type, source, tank_id, vehicle_id, rental_id, liters, fuel_lines_before, fuel_lines_after, liters_before, liters_after, unit_price, total_cost, fuel_type, fuel_station, location, odometer_reading, notes, receipt_media, performed_by_user_id, performed_by_name, is_financial_expense, created_at',
      ],
      configureQuery,
    );

    if (error) {
      if (this.isRetryableSchemaError(error) || this.isTransientServiceError(error)) {
        this.markTableFailureCooldown(this.fuelOperationLogsTable);
        console.warn('Fuel operation logs temporarily unavailable; using fallback fuel UI data:', error);
      }
      return [];
    }

    const rows = data || [];
    const directVehicleLookup = await this.getVehicleLookup(rows.map((row) => row.vehicle_id));
    const rentalIds = rows.filter((row) => row.rental_id).map((row) => row.rental_id);
    const rentalVehicleIds = rows
      .filter((row) => !row.vehicle_id && row.rental_id)
      .map((row) => row.rental_id);
    const [rentalVehicleLookup, rentalReferenceLookup] = await Promise.all([
      includeRentalVehicleLookup
        ? this.getRentalVehicleLookup(rentalVehicleIds)
        : Promise.resolve(new Map()),
      includeRentalReferenceLookup
        ? this.getRentalReferenceLookup(rentalIds)
        : Promise.resolve(new Map()),
    ]);

    return rows.map((row) => {
      const rentalVehicle = row.rental_id ? rentalVehicleLookup.get(String(row.rental_id)) || null : null;
      const vehicle = directVehicleLookup.get(Number(row.vehicle_id)) || rentalVehicle || null;
      const vehicleId = row.vehicle_id || vehicle?.id || null;
      const rentalReference = includeRentalReferenceLookup
        ? (row.rental_reference || (row.rental_id ? rentalReferenceLookup.get(String(row.rental_id)) || null : null))
        : (row.rental_reference || null);
      return {
        ...row,
        vehicle_id: vehicleId,
        rental_reference: rentalReference,
        vehicle,
        [this.vehiclesTable]: vehicle,
        saharax_0u4w4d_vehicles: vehicle,
      };
    });
  }

  async logFuelOperation(logData = {}) {
    if (!(await this.tableExists(this.fuelOperationLogsTable))) {
      return { success: true, skipped: true };
    }
    if (this.isTableInFailureCooldown(this.fuelOperationLogsTable)) {
      return { success: true, skipped: true };
    }

    const actor = this.buildActor(logData.actor || logData);
    const basePayload = {
      transaction_type: logData.transaction_type,
      source: logData.source || logData.transaction_type,
      tank_id: logData.tank_id || null,
      vehicle_id: logData.vehicle_id || null,
      rental_id: logData.rental_id || null,
      liters: logData.liters ?? null,
      fuel_lines_before: logData.fuel_lines_before ?? null,
      fuel_lines_after: logData.fuel_lines_after ?? null,
      liters_before: logData.liters_before ?? null,
      liters_after: logData.liters_after ?? null,
      unit_price: logData.unit_price ?? null,
      total_cost: logData.total_cost ?? null,
      fuel_type: logData.fuel_type || 'gasoline',
      fuel_station: logData.fuel_station || null,
      location: logData.location || null,
      odometer_reading: logData.odometer_reading || null,
      notes: logData.notes || null,
      receipt_media: this.normalizeReceiptMedia(logData.receipt_media || logData.invoice_image),
      performed_by_user_id: actor.performed_by_user_id,
      performed_by_name: actor.performed_by_name,
      is_financial_expense:
        logData.is_financial_expense !== undefined
          ? logData.is_financial_expense
          : this.isFinancialExpense(logData.transaction_type),
      created_at: logData.created_at || new Date().toISOString(),
    };

    const payload = await this.scopeFuelPayload(
      basePayload,
      this.fuelOperationLogsTable,
      'Workspace organization context is required to save fuel logs.',
    );

    let query = supabase
      .from(this.fuelOperationLogsTable)
      .insert([payload])
      .select('*');
    query = this.applyResolvedFuelScope(
      query,
      await this.resolveFuelScopeOrganizationId(
        this.fuelOperationLogsTable,
        'Workspace organization context is required to save fuel logs.',
      ),
    );
    const { data, error } = await query.maybeSingle();

    if (error) {
      if (this.isRetryableSchemaError(error) || this.isTransientServiceError(error)) {
        this.markTableFailureCooldown(this.fuelOperationLogsTable);
        console.warn('Fuel operation log write skipped because the logs table is temporarily unavailable:', error);
        return { success: true, skipped: true };
      }
      return { success: false, error: error.message };
    }

    return { success: true, log: data };
  }

  async getLatestRentalFuelSnapshots() {
    const rentalsTableExists = await this.tableExists(RENTALS_TABLE);
    if (!rentalsTableExists) {
      return new Map();
    }

    let query = supabase
      .from(RENTALS_TABLE)
      .select('id, vehicle_id, start_fuel_level, end_fuel_level, updated_at, created_at, customer_name')
      .order('updated_at', { ascending: false })
      .limit(500);
    query = await this.scopeFuelQuery(
      query,
      RENTALS_TABLE,
      'Workspace organization context is required to load rental fuel snapshots.',
    );
    const { data, error } = await query;

    if (error) {
      return new Map();
    }

    const byVehicle = new Map();
    for (const rental of data || []) {
      const vehicleKey = rental.vehicle_id ? String(rental.vehicle_id) : '';
      if (!vehicleKey || byVehicle.has(vehicleKey)) {
        continue;
      }

      const latestLines =
        rental.end_fuel_level !== null && rental.end_fuel_level !== undefined
          ? rental.end_fuel_level
          : rental.start_fuel_level;

      if (latestLines === null || latestLines === undefined) {
        continue;
      }

      const normalized = normalizeFuelState({ lines: latestLines });
      byVehicle.set(vehicleKey, {
        vehicle_id: rental.vehicle_id,
        current_fuel_lines: normalized.lines,
        current_fuel_liters: normalized.liters,
        last_source: rental.end_fuel_level !== null && rental.end_fuel_level !== undefined
          ? 'rental_closing_level'
          : 'rental_opening_level',
        last_rental_id: rental.id,
        last_updated_at: rental.updated_at || rental.created_at,
      });
    }

    return byVehicle;
  }

  getTransactionTimestamp(transaction = {}) {
    return (
      transaction.last_updated_at ||
      transaction.updated_at ||
      transaction.withdrawal_date ||
      transaction.refill_date ||
      transaction.transaction_date ||
      transaction.created_at ||
      null
    );
  }

  isTransactionalVehicleFuelSource(source) {
    const normalizedSource = String(source || '').toLowerCase();
    return [
      'vehicle_refill',
      'direct_station',
      'withdrawal',
      'tank_transfer',
      'manual_adjustment',
    ].includes(normalizedSource);
  }

  pickBestVehicleFuelState(...candidates) {
    const validCandidates = candidates.filter(Boolean);
    if (!validCandidates.length) {
      return {};
    }

    const isRebuildFallback = (candidate = {}) => {
      const source = String(candidate.last_source || candidate.last_fuel_source || '').toLowerCase();
      return !source || source === 'unknown' || source === 'history_rebuild';
    };

    return validCandidates.reduce((best, candidate) => {
      if (!best) {
        return candidate;
      }

      const bestIsFallback = isRebuildFallback(best);
      const candidateIsFallback = isRebuildFallback(candidate);

      if (bestIsFallback && !candidateIsFallback) {
        return candidate;
      }

      if (!bestIsFallback && candidateIsFallback) {
        return best;
      }

      const bestTimestamp = this.getTransactionTimestamp(best);
      const candidateTimestamp = this.getTransactionTimestamp(candidate);

      if (candidateTimestamp && (!bestTimestamp || new Date(candidateTimestamp) > new Date(bestTimestamp))) {
        return candidate;
      }

      if (!bestTimestamp && !candidateTimestamp) {
        const bestScore =
          Number(best.current_fuel_liters || 0) +
          Number(best.current_fuel_lines || 0) +
          (best.last_source && best.last_source !== 'unknown' ? 1 : 0);
        const candidateScore =
          Number(candidate.current_fuel_liters || 0) +
          Number(candidate.current_fuel_lines || 0) +
          (candidate.last_source && candidate.last_source !== 'unknown' ? 1 : 0);

        if (candidateScore > bestScore) {
          return candidate;
        }
      }

      return best;
    }, null);
  }

  async getDerivedVehicleFuelStateMap(rentalSnapshots = new Map()) {
    const [vehicleRefills, withdrawals] = await Promise.all([
      this.getVehicleRefills(),
      this.getAllWithdrawals(),
    ]);

    const derivedMap = new Map();
    const relevantTransactions = [...vehicleRefills, ...withdrawals].sort(
      (a, b) => new Date(this.getTransactionTimestamp(a) || 0) - new Date(this.getTransactionTimestamp(b) || 0)
    );

    for (const transaction of relevantTransactions) {
      const vehicleId = transaction.vehicle_id;
      const vehicleKey = vehicleId ? String(vehicleId) : '';
      if (!vehicleKey) {
        continue;
      }

      const rentalSnapshot = rentalSnapshots.get(vehicleKey);
      const transactionTimestamp = this.getTransactionTimestamp(transaction);
      const baselineTimestamp = rentalSnapshot?.last_updated_at || null;

      if (
        baselineTimestamp &&
        transactionTimestamp &&
        new Date(transactionTimestamp).getTime() <= new Date(baselineTimestamp).getTime()
      ) {
        continue;
      }

      const currentDerived = derivedMap.get(vehicleKey) || {
        vehicle_id: vehicleId,
        current_fuel_liters: rentalSnapshot?.current_fuel_liters || 0,
        current_fuel_lines: rentalSnapshot?.current_fuel_lines || 0,
        last_source: rentalSnapshot?.last_source || 'unknown',
        last_updated_at: baselineTimestamp,
      };

      const litersDelta =
        transaction.transaction_type === 'withdrawal'
          ? Number(transaction.liters_taken || transaction.amount || 0)
          : Number(transaction.liters_added || transaction.liters || transaction.amount || 0);

      const nextLiters = roundTo((currentDerived.current_fuel_liters || 0) + litersDelta, 3);
      const normalized = normalizeFuelState({ liters: nextLiters });

      derivedMap.set(vehicleKey, {
        vehicle_id: vehicleId,
        current_fuel_liters: normalized.liters,
        current_fuel_lines: normalized.lines,
        last_source: transaction.source || transaction.transaction_type || currentDerived.last_source,
        last_updated_at: transactionTimestamp || currentDerived.last_updated_at,
      });
    }

    return derivedMap;
  }

  async getVehicleFuelStates() {
    const now = Date.now();
    if (this.vehicleFuelStatesCache && now - this.vehicleFuelStatesCacheTimestamp < 15000) {
      return this.vehicleFuelStatesCache;
    }

    if (this.vehicleFuelStatesPromise) {
      return this.vehicleFuelStatesPromise;
    }

    const requestPromise = (async () => {
    const [vehiclesResult, hasVehicleFuelStateTable, rentalSnapshots, vehicleModels] = await Promise.all([
      this.scopeFuelQuery(
        supabase
          .from(this.vehiclesTable)
          .select('id, name, plate_number, model, vehicle_type, status, current_odometer, vehicle_model_id')
          .order('name'),
        this.vehiclesTable,
        'Workspace organization context is required to load vehicle fuel states.',
      ).then((query) => query),
      this.tableExists(this.vehicleFuelStateTable),
      this.getLatestRentalFuelSnapshots(),
      this.getVehicleModelsForFuelState(),
    ]);

    if (vehiclesResult.error) {
      return [];
    }

    let stateMap = new Map();
    const vehicleModelMap = new Map((vehicleModels || []).map((model) => [String(model.id), model]));
    if (hasVehicleFuelStateTable) {
      const { data } = await this.runVehicleFuelStateReadQuery(
        () => supabase
          .from(this.vehicleFuelStateTable)
          .select('*'),
        'Workspace organization context is required to load vehicle fuel states.',
      );
      stateMap = new Map((data || []).map((row) => [String(row.vehicle_id), row]));
    }

    const states = (vehiclesResult.data || [])
      .filter((vehicle) => !isSoldVehicleRecord(vehicle))
      .map((vehicle) => {
      const vehicleKey = String(vehicle.id);
      const storedState = stateMap.get(vehicleKey);
      const rentalState = rentalSnapshots.get(vehicleKey);
      const rawState = this.pickBestVehicleFuelState(storedState, rentalState) || {};
      const vehicleModel = vehicleModelMap.get(String(vehicle.vehicle_model_id || ''));
      const resolvedTankCapacityLiters = resolveTankCapacityLiters(
        rawState.tank_capacity_liters,
        vehicleModel?.tank_capacity_liters,
        vehicleModel?.model,
        vehicleModel?.name,
        vehicle.model,
        vehicle.name,
        DEFAULT_VEHICLE_TANK_LITERS,
      );
      const normalized = normalizeFuelState({
        liters: rawState.current_fuel_liters,
        lines: rawState.current_fuel_lines,
        tankCapacityLiters: resolvedTankCapacityLiters,
      });
      const status = getFuelStatus(normalized.lines);

      return {
        ...vehicle,
        vehicle_model: vehicleModel || null,
        current_fuel_liters: normalized.liters,
        current_fuel_lines: normalized.lines,
        max_fuel_lines: rawState.max_fuel_lines || DEFAULT_FUEL_LINES,
        tank_capacity_liters: resolvedTankCapacityLiters,
        fuel_percentage: normalized.percentage,
        fuel_status: status.label,
        fuel_status_color: status.color,
        last_fuel_source: rawState.last_source || rentalState?.last_source || 'unknown',
        last_fuel_update_at: rawState.last_updated_at || rentalState?.last_updated_at || null,
      };
    });

    this.vehicleFuelStatesCache = states;
    this.vehicleFuelStatesCacheTimestamp = Date.now();
    return states;
    })();

    this.vehicleFuelStatesPromise = requestPromise;

    try {
      return await requestPromise;
    } finally {
      this.vehicleFuelStatesPromise = null;
    }
  }

  async getVehicleFuelStatesFast() {
    const now = Date.now();
    if (this.vehicleFuelStatesCache && now - this.vehicleFuelStatesCacheTimestamp < 15000) {
      return this.vehicleFuelStatesCache;
    }

    if (this.vehicleFuelStatesPromise) {
      return this.vehicleFuelStatesPromise;
    }

    const requestPromise = (async () => {
      const [vehiclesResult, hasVehicleFuelStateTable] = await Promise.all([
        this.scopeFuelQuery(
          supabase
            .from(this.vehiclesTable)
            .select('id, name, plate_number, model, vehicle_type, status, current_odometer, vehicle_model_id')
            .order('name'),
          this.vehiclesTable,
          'Workspace organization context is required to load vehicle fuel states.',
        ).then((query) => query),
        this.tableExists(this.vehicleFuelStateTable),
      ]);

      if (vehiclesResult.error) {
        return [];
      }

      let stateMap = new Map();
      if (hasVehicleFuelStateTable) {
        const { data, error } = await this.runVehicleFuelStateReadQuery(
          () => supabase
            .from(this.vehicleFuelStateTable)
            .select('vehicle_id, current_fuel_liters, current_fuel_lines, max_fuel_lines, tank_capacity_liters, last_source, last_updated_at'),
          'Workspace organization context is required to load vehicle fuel states.',
        );

        if (!error) {
          stateMap = new Map((data || []).map((row) => [String(row.vehicle_id), row]));
        }
      }

    const states = (vehiclesResult.data || [])
      .filter((vehicle) => !isSoldVehicleRecord(vehicle))
      .map((vehicle) => {
        const vehicleKey = String(vehicle.id);
        const rawState = stateMap.get(vehicleKey) || {};
        const resolvedTankCapacityLiters = resolveTankCapacityLiters(
          rawState.tank_capacity_liters,
          vehicle.model,
          vehicle.name,
          DEFAULT_VEHICLE_TANK_LITERS,
        );
        const normalized = normalizeFuelState({
          liters: rawState.current_fuel_liters,
          lines: rawState.current_fuel_lines,
          tankCapacityLiters: resolvedTankCapacityLiters,
        });
        const status = getFuelStatus(normalized.lines);

        return {
          ...vehicle,
          current_fuel_liters: normalized.liters,
          current_fuel_lines: normalized.lines,
          max_fuel_lines: rawState.max_fuel_lines || DEFAULT_FUEL_LINES,
          tank_capacity_liters: resolvedTankCapacityLiters,
          fuel_percentage: normalized.percentage,
          fuel_status: status.label,
          fuel_status_color: status.color,
          last_fuel_source: rawState.last_source || 'unknown',
          last_fuel_update_at: rawState.last_updated_at || null,
        };
      });

      this.vehicleFuelStatesCache = states;
      this.vehicleFuelStatesCacheTimestamp = Date.now();
      return states;
    })();

    this.vehicleFuelStatesPromise = requestPromise;

    try {
      return await requestPromise;
    } finally {
      this.vehicleFuelStatesPromise = null;
    }
  }

  async syncVehicleFuelState({
    vehicleId,
    liters,
    lines,
    source,
    transactionId = null,
    rentalId = null,
    tankCapacityLiters = null,
  }) {
    const currentVehicleState = vehicleId ? await this.getVehicleFuelState(vehicleId) : null;
    const normalized = normalizeFuelState({
      liters,
      lines,
      tankCapacityLiters:
        resolveTankCapacityLiters(
          tankCapacityLiters,
          currentVehicleState?.tank_capacity_liters,
          DEFAULT_VEHICLE_TANK_LITERS,
        ) || DEFAULT_VEHICLE_TANK_LITERS,
    });
    const hasTable = await this.tableExists(this.vehicleFuelStateTable);

    if (!hasTable) {
      return { success: true, skipped: true, state: normalized };
    }

    const payload = {
      vehicle_id: vehicleId,
      current_fuel_liters: normalized.liters,
      current_fuel_lines: normalized.lines,
      max_fuel_lines: normalized.maxLines,
      tank_capacity_liters: normalized.tankCapacityLiters,
      last_source: source,
      last_transaction_id: transactionId,
      last_rental_id: rentalId,
      last_updated_at: new Date().toISOString(),
    };

    const { data, error } = await this.runVehicleFuelStateWriteQuery(
      () => payload,
      'Workspace organization context is required to save vehicle fuel states.',
    );

    if (error) {
      return { success: false, error: error.message };
    }

    if (Array.isArray(this.vehicleFuelStatesCache)) {
      const normalizedState = {
        ...(data || payload),
        id: vehicleId,
        vehicle_id: vehicleId,
        current_fuel_liters: normalized.liters,
        current_fuel_lines: normalized.lines,
        max_fuel_lines: normalized.maxLines,
        tank_capacity_liters: normalized.tankCapacityLiters,
        last_fuel_source: payload.last_source,
        last_fuel_update_at: payload.last_updated_at,
      };

      let replaced = false;
      this.vehicleFuelStatesCache = this.vehicleFuelStatesCache.map((state) => {
        if (String(state.id) === String(vehicleId) || String(state.vehicle_id) === String(vehicleId)) {
          replaced = true;
          return {
            ...state,
            ...normalizedState,
          };
        }
        return state;
      });

      if (!replaced) {
        this.vehicleFuelStatesCache.push(normalizedState);
      }
      this.vehicleFuelStatesCacheTimestamp = Date.now();
    }

    return { success: true, state: data || payload };
  }

  async syncVehicleCurrentOdometer(vehicleId, odometerValue) {
    const normalizedValue = Number(odometerValue);
    if (!vehicleId || Number.isNaN(normalizedValue) || normalizedValue < 0) {
      return { success: true, skipped: true };
    }

    let query = supabase
      .from(this.vehiclesTable)
      .update({ current_odometer: normalizedValue })
      .eq('id', vehicleId)
      .select('id, current_odometer');
    query = this.applyResolvedFuelScope(
      query,
      await this.resolveFuelScopeOrganizationId(
        this.vehiclesTable,
        'Workspace organization context is required to update vehicle odometer.',
      ),
    );
    const { data, error } = await query.maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, vehicle: data || { id: vehicleId, current_odometer: normalizedValue } };
  }

  calculateAverageFuelUnitCost(refills = []) {
    const pricedRefills = refills.filter((refill) => Number(refill.liters_added || refill.liters || refill.amount || 0) > 0 && Number(refill.total_cost || refill.cost || 0) > 0);
    const totalLiters = pricedRefills.reduce((sum, refill) => sum + Number(refill.liters_added || refill.liters || refill.amount || 0), 0);
    const totalCost = pricedRefills.reduce((sum, refill) => sum + Number(refill.total_cost || refill.cost || 0), 0);
    return totalLiters > 0 ? roundTo(totalCost / totalLiters, 2) : 0;
  }

  async getCurrentTankAverageUnitCost() {
    const tankRefills = await this.getTankRefills();
    return this.calculateAverageFuelUnitCost(tankRefills);
  }

  async syncRentalFuelSnapshot(rentalId) {
    if (!rentalId) {
      return { success: true, skipped: true };
    }

    let rentalQuery = supabase
      .from(RENTALS_TABLE)
      .select('id, start_fuel_level, end_fuel_level')
      .eq('id', rentalId);
    rentalQuery = this.applyResolvedFuelScope(
      rentalQuery,
      await this.resolveFuelScopeOrganizationId(
        RENTALS_TABLE,
        'Workspace organization context is required to load rental fuel snapshots.',
      ),
    );
    const { data: rental, error } = await rentalQuery.maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }

    if (!rental) {
      return { success: true, skipped: true };
    }

    const startLines = rental.start_fuel_level;
    const endLines = rental.end_fuel_level;
    const startLiters = startLines !== null && startLines !== undefined ? linesToLiters(startLines) : null;
    const endLiters = endLines !== null && endLines !== undefined ? linesToLiters(endLines) : null;
    const consumedLiters =
      startLiters !== null && endLiters !== null
        ? roundTo(Math.max(0, startLiters - endLiters), 3)
        : 0;
    const averageUnitCost = await this.getCurrentTankAverageUnitCost();
    const expenseTotal = roundTo(consumedLiters * averageUnitCost, 2);

    const snapshotPayload = {
      linked_fuel_start_liters: startLiters,
      linked_fuel_end_liters: endLiters,
      linked_fuel_consumed_liters: consumedLiters,
      linked_fuel_average_unit_cost: averageUnitCost,
      linked_fuel_expense_total: expenseTotal,
      linked_fuel_synced_at: new Date().toISOString(),
    };

    let updateQuery = supabase
      .from(RENTALS_TABLE)
      .update(snapshotPayload)
      .eq('id', rentalId);
    updateQuery = await this.scopeFuelQuery(updateQuery, RENTALS_TABLE, 'Workspace organization context is required to save rental fuel snapshots.');
    const { error: updateError } = await updateQuery;

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    return { success: true, snapshot: snapshotPayload };
  }

  buildVehicleFuelUsageSummary(vehicleId, { vehicleRefills = [], withdrawals = [], logs = [] } = {}) {
    const scopedVehicleRefills = vehicleRefills.filter((refill) => String(refill.vehicle_id) === String(vehicleId));
    const scopedWithdrawals = withdrawals.filter((withdrawal) => String(withdrawal.vehicle_id) === String(vehicleId));
    const scopedLogs = logs
      .filter((log) => String(log.vehicle_id) === String(vehicleId))
      .sort((a, b) => new Date(a.created_at || a.transaction_date || 0) - new Date(b.created_at || b.transaction_date || 0));

    const averageUnitCost = this.calculateAverageFuelUnitCost(vehicleRefills);

    let totalFuelSuppliedLiters = 0;
    let totalFuelUsedLiters = 0;
    let trackedSupplyCostMad = 0;
    let lastFuelActivityAt = null;

    const rentalSnapshots = new Map();

    const touchLastActivity = (timestamp) => {
      if (timestamp && (!lastFuelActivityAt || new Date(timestamp) > new Date(lastFuelActivityAt))) {
        lastFuelActivityAt = timestamp;
      }
    };

    for (const refill of scopedVehicleRefills) {
      const liters = Number(refill.liters_added || refill.liters || refill.amount || 0);
      const totalCost = Number(refill.total_cost || refill.cost || 0);
      const timestamp = refill.refill_date || refill.transaction_date || refill.created_at || null;
      totalFuelSuppliedLiters += liters;
      trackedSupplyCostMad += totalCost > 0 ? totalCost : averageUnitCost > 0 ? liters * averageUnitCost : 0;
      touchLastActivity(timestamp);
    }

    for (const withdrawal of scopedWithdrawals) {
      const liters = Number(withdrawal.liters_taken || withdrawal.amount || 0);
      const timestamp = withdrawal.withdrawal_date || withdrawal.transaction_date || withdrawal.created_at || null;
      totalFuelSuppliedLiters += liters;
      trackedSupplyCostMad += averageUnitCost > 0 ? liters * averageUnitCost : 0;
      touchLastActivity(timestamp);
    }

    for (const log of scopedLogs) {
      const timestamp = log.created_at || log.transaction_date || null;
      touchLastActivity(timestamp);

      if (log.transaction_type === 'staff_fuel_use') {
        const litersUsed = Number(log.liters || 0);
        if (litersUsed > 0) {
          totalFuelUsedLiters += litersUsed;
        }
      }

      if ((log.transaction_type === 'rental_opening_level' || log.transaction_type === 'rental_closing_level') && log.rental_id) {
        const current = rentalSnapshots.get(String(log.rental_id)) || {};
        if (log.transaction_type === 'rental_opening_level') {
          current.openingLiters = Number(
            log.liters_after ??
            (log.fuel_lines_after !== null && log.fuel_lines_after !== undefined ? linesToLiters(log.fuel_lines_after) : 0)
          );
          current.openingAt = timestamp;
        } else {
          current.closingLiters = Number(
            log.liters_after ??
            (log.fuel_lines_after !== null && log.fuel_lines_after !== undefined ? linesToLiters(log.fuel_lines_after) : 0)
          );
          current.closingAt = timestamp;
        }
        rentalSnapshots.set(String(log.rental_id), current);
      }
    }

    for (const snapshot of rentalSnapshots.values()) {
      const opening = Number(snapshot.openingLiters || 0);
      const closing = Number(snapshot.closingLiters || 0);
      if (opening > 0 && closing >= 0 && opening > closing) {
        totalFuelUsedLiters += opening - closing;
      }
    }

    totalFuelSuppliedLiters = roundTo(totalFuelSuppliedLiters, 2);
    totalFuelUsedLiters = roundTo(totalFuelUsedLiters, 2);
    trackedSupplyCostMad = roundTo(trackedSupplyCostMad, 2);

    return {
      totalFuelSuppliedLiters,
      totalFuelUsedLiters,
      totalFuelCostMad: roundTo(totalFuelUsedLiters * averageUnitCost, 2),
      trackedSupplyCostMad,
      averageFuelCostPerLiterMad: averageUnitCost,
      lastFuelActivityAt,
      fuelEventCount: scopedLogs.length,
    };
  }

  async persistVehicleFuelUsageSummary(vehicleId, summary) {
    if (!vehicleId || !summary) {
      return { success: true, skipped: true };
    }

    try {
      const payload = {
        total_fuel_supplied_liters: summary.totalFuelSuppliedLiters,
        total_fuel_used_liters: summary.totalFuelUsedLiters,
        total_fuel_cost_mad: summary.totalFuelCostMad,
        average_fuel_cost_per_liter_mad: summary.averageFuelCostPerLiterMad,
        last_fuel_activity_at: summary.lastFuelActivityAt,
      };

      const { data, error } = await supabase
        .from(this.vehiclesTable)
        .update(payload)
        .eq('id', vehicleId)
        .select('id')
        .maybeSingle();

      if (error) {
        return { success: false, error: error.message, skipped: true };
      }

      return { success: true, vehicle: data };
    } catch (error) {
      return { success: false, error: error.message, skipped: true };
    }
  }

  async getVehicleFuelUsageSummary(vehicleId, { persist = false } = {}) {
    if (!vehicleId) {
      return {
        success: true,
        summary: {
          totalFuelSuppliedLiters: 0,
          totalFuelUsedLiters: 0,
          totalFuelCostMad: 0,
          trackedSupplyCostMad: 0,
          averageFuelCostPerLiterMad: 0,
          lastFuelActivityAt: null,
          fuelEventCount: 0,
        },
      };
    }

    const [vehicleRefills, withdrawals, logs] = await Promise.all([
      this.getVehicleRefills(),
      this.getAllWithdrawals(),
      this.getFuelOperationLogs(),
    ]);
    const summary = this.buildVehicleFuelUsageSummary(vehicleId, { vehicleRefills, withdrawals, logs });

    if (persist) {
      await this.persistVehicleFuelUsageSummary(vehicleId, summary);
    }

    return { success: true, summary };
  }

  async refreshVehicleFuelTracking(vehicleId) {
    if (!vehicleId) {
      return { success: true, skipped: true };
    }

    const vehicleKey = String(vehicleId);
    const rentalSnapshots = await this.getLatestRentalFuelSnapshots();
    const derivedStateMap = await this.getDerivedVehicleFuelStateMap(rentalSnapshots);
    let storedState = null;

    if (await this.tableExists(this.vehicleFuelStateTable)) {
      const { data } = await this.runVehicleFuelStateReadQuery(
        () => supabase
          .from(this.vehicleFuelStateTable)
          .select('vehicle_id, current_fuel_liters, current_fuel_lines, max_fuel_lines, tank_capacity_liters, last_source, last_transaction_id, last_rental_id, last_updated_at')
          .eq('vehicle_id', vehicleId)
          .maybeSingle(),
        'Workspace organization context is required to refresh vehicle fuel tracking.',
      );
      storedState = data || null;
    }

    const latestState =
      this.pickBestVehicleFuelState(
        derivedStateMap.get(vehicleKey) || derivedStateMap.get(vehicleId),
        storedState,
        rentalSnapshots.get(vehicleKey) || rentalSnapshots.get(vehicleId),
      ) ||
      {
        vehicle_id: vehicleId,
        current_fuel_liters: 0,
        current_fuel_lines: 0,
        last_source: 'history_rebuild',
        last_rental_id: null,
      };

    const storedTimestamp = storedState?.last_updated_at ? new Date(storedState.last_updated_at).getTime() : 0;
    const latestTimestamp = latestState?.last_updated_at ? new Date(latestState.last_updated_at).getTime() : 0;
    const shouldPreserveStoredTransactionalState =
      Boolean(storedState) &&
      this.isTransactionalVehicleFuelSource(storedState?.last_source) &&
      storedTimestamp > 0 &&
      (
        latestTimestamp <= 0 ||
        latestTimestamp <= storedTimestamp
      ) &&
      !this.isTransactionalVehicleFuelSource(latestState?.last_source);

    const effectiveLatestState = shouldPreserveStoredTransactionalState
      ? storedState
      : latestState;

    const syncResult = await this.syncVehicleFuelState({
      vehicleId,
      liters: effectiveLatestState.current_fuel_liters,
      lines: effectiveLatestState.current_fuel_lines,
      source: effectiveLatestState.last_source || 'history_rebuild',
      transactionId: effectiveLatestState.last_transaction_id || null,
      rentalId: effectiveLatestState.last_rental_id || null,
      tankCapacityLiters: effectiveLatestState.tank_capacity_liters || null,
    });

    const summaryResult = await this.getVehicleFuelUsageSummary(vehicleId, { persist: true });

    return {
      success: true,
      state: syncResult.state || effectiveLatestState,
      summary: summaryResult.summary || null,
    };
  }

  async getFuelSystemHealthReport() {
    const [
      vehicleFuelStateTableExists,
      fuelOperationLogsTableExists,
      liveVehicleStates,
      rentalSnapshots,
    ] = await Promise.all([
      this.withTimeout(this.tableExists(this.vehicleFuelStateTable), true),
      this.withTimeout(this.tableExists(this.fuelOperationLogsTable), true),
      this.withTimeout(this.getVehicleFuelStatesFast().catch(() => []), []),
      this.withTimeout(this.getLatestRentalFuelSnapshots().catch(() => new Map()), new Map()),
    ]);

    const mismatches = (liveVehicleStates || [])
      .map((vehicle) => {
        const vehicleKey = String(vehicle.id || vehicle.vehicle_id || '');
        const rentalSnapshot = rentalSnapshots.get(vehicleKey) || null;
        const liveLines = Number(vehicle?.current_fuel_lines || 0);
        const rentalLines =
          rentalSnapshot?.current_fuel_lines !== undefined && rentalSnapshot?.current_fuel_lines !== null
            ? Number(rentalSnapshot.current_fuel_lines)
            : null;
        const liveSource = String(vehicle?.last_fuel_source || 'unknown').toLowerCase();
        const liveSourceIsFallback = !liveSource || liveSource === 'unknown' || liveSource === 'history_rebuild';
        const lineDelta = rentalLines === null ? null : Math.abs(liveLines - rentalLines);
        const shouldFlag =
          (lineDelta !== null && lineDelta >= 2) ||
          Boolean(rentalSnapshot && liveSourceIsFallback);

        if (!shouldFlag) {
          return null;
        }

        return {
          vehicle_id: vehicle.id || vehicle.vehicle_id,
          vehicle_name: vehicle.name || vehicle.model || `Vehicle ${vehicle.id}`,
          plate_number: vehicle.plate_number || null,
          live_lines: liveLines,
          rental_lines: rentalLines,
          delta_lines: lineDelta,
          live_source: vehicle?.last_fuel_source || 'unknown',
          rental_source: rentalSnapshot?.last_source || null,
          live_updated_at: vehicle?.last_fuel_update_at || null,
          rental_updated_at: rentalSnapshot?.last_updated_at || null,
        };
      })
      .filter(Boolean)
      .sort((left, right) => {
        const rightDelta = Number(right?.delta_lines ?? -1);
        const leftDelta = Number(left?.delta_lines ?? -1);
        if (rightDelta !== leftDelta) {
          return rightDelta - leftDelta;
        }

        return new Date(right?.rental_updated_at || right?.live_updated_at || 0).getTime() -
          new Date(left?.rental_updated_at || left?.live_updated_at || 0).getTime();
      });

    const cooldownUntil = this.tableFailureCooldowns.get(this.fuelOperationLogsTable) || 0;
    const cooldownRemainingMs = Math.max(0, cooldownUntil - Date.now());

    return {
      success: true,
      generatedAt: new Date().toISOString(),
      tables: {
        vehicleFuelState: vehicleFuelStateTableExists,
        fuelOperationLogs: fuelOperationLogsTableExists,
      },
      cooldowns: {
        fuelOperationLogs: {
          active: cooldownRemainingMs > 0,
          remainingMs: cooldownRemainingMs,
        },
      },
      totals: {
        vehicleStates: Array.isArray(liveVehicleStates) ? liveVehicleStates.length : 0,
        mismatches: mismatches.length,
      },
      mismatches,
    };
  }

  async reconcileVehicleFuelStates({ vehicleIds = [] } = {}) {
    const normalizedRequestedIds = Array.isArray(vehicleIds)
      ? vehicleIds.filter(Boolean).map((vehicleId) => String(vehicleId))
      : [];

    const targetVehicleIds = normalizedRequestedIds.length > 0
      ? normalizedRequestedIds
      : Array.from(new Set([
          ...(await this.withTimeout(this.getVehicleFuelStatesFast().catch(() => []), [])).map((vehicle) => String(vehicle.id || vehicle.vehicle_id || '')),
          ...Array.from((await this.withTimeout(this.getLatestRentalFuelSnapshots().catch(() => new Map()), new Map())).values())
            .map((snapshot) => String(snapshot?.vehicle_id || '')),
        ].filter(Boolean)));

    if (targetVehicleIds.length === 0) {
      return { success: true, updated: [], failures: [], total: 0, skipped: true };
    }

    const updated = [];
    const failures = [];

    for (const vehicleId of targetVehicleIds) {
      try {
        const result = await this.refreshVehicleFuelTracking(vehicleId);
        if (result?.success) {
          updated.push(vehicleId);
        } else {
          failures.push({
            vehicleId,
            error: result?.error || 'Reconciliation failed',
          });
        }
      } catch (error) {
        failures.push({
          vehicleId,
          error: error?.message || 'Reconciliation failed',
        });
      }
    }

    this.invalidateFuelCaches({
      entity: 'vehicle_fuel_state',
      reason: 'manual_reconciliation',
      transactionType: 'manual_reconciliation',
    });

    return {
      success: failures.length === 0,
      updated,
      failures,
      total: targetVehicleIds.length,
    };
  }

  async getUnifiedFuelData() {
    const [tank, refills, withdrawals, vehicleStates] = await Promise.all([
      this.getFuelTankData(),
      this.getAllRefills(),
      this.getAllWithdrawals(),
      this.getVehicleFuelStates(),
    ]);

    return {
      tank,
      refills,
      withdrawals,
      vehicleStates,
    };
  }

  async getUnifiedFuelOverview({
    recentRefillsLimit = 8,
    recentWithdrawalsLimit = 8,
    includeVehicleStates = true,
  } = {}) {
    const cacheKey = JSON.stringify({
      recentRefillsLimit,
      recentWithdrawalsLimit,
      includeVehicleStates,
    });
    const cachedEntry = this.fuelOverviewCache.get(cacheKey);
    if (cachedEntry && Date.now() - cachedEntry.timestamp < 15000) {
      return cachedEntry.value;
    }

    if (this.fuelOverviewPromiseCache.has(cacheKey)) {
      return this.fuelOverviewPromiseCache.get(cacheKey);
    }

    const requestPromise = (async () => {
      const [tank, refills, withdrawals, vehicleStates] = await Promise.all([
      this.getFuelTankData(),
      this.getAllRefills({ limit: recentRefillsLimit }),
      this.getAllWithdrawals({ limit: recentWithdrawalsLimit }),
      includeVehicleStates ? this.getVehicleFuelStates() : Promise.resolve([]),
    ]);

      const response = {
      tank,
      refills,
      withdrawals,
      vehicleStates,
      };

      this.fuelOverviewCache.set(cacheKey, {
        timestamp: Date.now(),
        value: response,
      });

      return response;
    })();

    this.fuelOverviewPromiseCache.set(cacheKey, requestPromise);

    try {
      return await requestPromise;
    } finally {
      this.fuelOverviewPromiseCache.delete(cacheKey);
    }
  }

  async getFuelOverviewSummary({
    recentRefillsLimit = 8,
    recentWithdrawalsLimit = 8,
  } = {}) {
    return sharedQueryCacheService.fetchQuery(
      'fuel-overview-summary',
      { recentRefillsLimit, recentWithdrawalsLimit },
      async () => {
        const overview = await this.getUnifiedFuelOverview({
          recentRefillsLimit,
          recentWithdrawalsLimit,
          includeVehicleStates: true,
        });

        const recentTransactions = [
          ...(overview?.refills || []).map((transaction) =>
            this.mapTransactionRecord({
              ...transaction,
              id: transaction.id ? `refill-${transaction.id}` : transaction.id,
            })
          ),
          ...(overview?.withdrawals || []).map((transaction) =>
            this.mapTransactionRecord({
              ...transaction,
              id: transaction.id ? `withdrawal-${transaction.id}` : transaction.id,
            })
          ),
        ]
          .sort((a, b) => new Date(b.transaction_date || 0) - new Date(a.transaction_date || 0))
          .slice(0, Math.max(recentRefillsLimit + recentWithdrawalsLimit, 12));

        return {
          tank: overview?.tank || null,
          refills: overview?.refills || [],
          withdrawals: overview?.withdrawals || [],
          vehicleStates: overview?.vehicleStates || [],
          recentTransactions,
        };
      },
      {
        ttlMs: 45 * 1000,
        staleWhileRevalidate: true,
        maxStaleMs: 3 * 60 * 1000,
      }
    );
  }

  async getAllRefills(options = {}) {
    const [tankRefills, vehicleRefills] = await Promise.all([
      this.getTankRefills(options),
      this.getVehicleRefills(options),
    ]);

    return [...tankRefills, ...vehicleRefills].sort(
      (a, b) => new Date(b.refill_date || b.transaction_date || b.created_at) - new Date(a.refill_date || a.transaction_date || a.created_at)
    );
  }

  mapTransactionRecord(transaction) {
    const vehicle = transaction.vehicle || transaction[this.vehiclesTable] || transaction.saharax_0u4w4d_vehicles || null;
    const isRentalFuelSnapshot =
      transaction.transaction_type === 'rental_opening_level' ||
      transaction.transaction_type === 'rental_closing_level';
    const linesBefore = transaction.fuel_lines_before ?? null;
    const linesAfter = transaction.fuel_lines_after ?? null;
    const litersBefore =
      transaction.liters_before ??
      (linesBefore !== null && linesBefore !== undefined ? linesToLiters(linesBefore) : null);
    const litersAfter =
      transaction.liters_after ??
      (linesAfter !== null && linesAfter !== undefined ? linesToLiters(linesAfter) : null);
    const isManualAdjustment = transaction.transaction_type === 'manual_adjustment';
    const amount =
      isManualAdjustment && litersBefore !== null && litersAfter !== null
        ? roundTo(Number(litersAfter) - Number(litersBefore), 2)
        : (
          Number(transaction.amount) ||
          Number(transaction.liters) ||
          Number(transaction.liters_added) ||
          Number(transaction.liters_taken) ||
          0
        );
    const cost =
      Number(transaction.cost) ||
      Number(transaction.total_cost) ||
      0;

    return {
      ...transaction,
      amount,
      cost,
      unit_price:
        transaction.unit_price !== undefined && transaction.unit_price !== null
          ? Number(transaction.unit_price)
          : amount > 0 && cost > 0
            ? roundTo(cost / amount, 2)
            : 0,
      transaction_date:
      transaction.transaction_date ||
        transaction.refill_date ||
        transaction.withdrawal_date ||
        transaction.created_at,
      fuel_station: isRentalFuelSnapshot ? '' : (transaction.fuel_station || 'Main Tank'),
      location: isRentalFuelSnapshot ? '' : (transaction.location || ''),
      filled_by:
        transaction.filled_by ||
        transaction.refilled_by ||
        transaction.performed_by_name ||
        'System',
      created_by:
        transaction.performed_by_user_id ||
        transaction.created_by ||
        null,
      performed_by_name:
        transaction.performed_by_name ||
        transaction.refilled_by ||
        transaction.filled_by ||
        'System',
      receipt_media: this.normalizeReceiptMedia(transaction.receipt_media || transaction.invoice_image),
      invoice_image: this.normalizeReceiptMedia(transaction.receipt_media || transaction.invoice_image),
      saharax_0u4w4d_vehicles: vehicle,
      vehicle,
      fuel_lines_before: linesBefore,
      fuel_lines_after: linesAfter,
      liters_before: litersBefore,
      liters_after: litersAfter,
      is_financial_expense:
        transaction.is_financial_expense !== undefined
          ? transaction.is_financial_expense
          : this.isFinancialExpense(transaction.transaction_type),
      source: transaction.source || transaction.transaction_type,
    };
  }

  buildTransactionDedupKey(transaction = {}) {
    const timestamp = transaction.transaction_date || transaction.refill_date || transaction.withdrawal_date || transaction.created_at || '';
    const vehicleId = transaction.vehicle_id || 'tank';
    const amount =
      Number(transaction.amount) ||
      Number(transaction.liters) ||
      Number(transaction.liters_added) ||
      Number(transaction.liters_taken) ||
      0;
    const cost =
      Number(transaction.cost) ||
      Number(transaction.total_cost) ||
      0;

    return [
      transaction.transaction_type || 'unknown',
      String(vehicleId),
      String(timestamp),
      roundTo(amount, 3),
      roundTo(cost, 2),
      transaction.odometer_reading || '',
    ].join('|');
  }

  deriveRentalFuelLogAmount(log = {}, openingSnapshotLiters = null) {
    const linesBefore = log.fuel_lines_before ?? null;
    const linesAfter = log.fuel_lines_after ?? null;
    const litersBefore =
      log.liters_before ??
      (linesBefore !== null && linesBefore !== undefined ? linesToLiters(linesBefore) : null);
    const litersAfter =
      log.liters_after ??
      (linesAfter !== null && linesAfter !== undefined ? linesToLiters(linesAfter) : null);

    if (log.transaction_type === 'rental_opening_level') {
      return litersAfter ?? 0;
    }

    if (log.transaction_type === 'rental_closing_level') {
      return litersAfter ?? 0;
    }

    return undefined;
  }

  async getRentalFuelLevelsMap(rentalIds = []) {
    const uniqueIds = Array.from(new Set((rentalIds || []).filter(Boolean).map((value) => String(value))));

    if (!uniqueIds.length) {
      return new Map();
    }

    const rentalsTableExists = await this.tableExists(RENTALS_TABLE);
    if (!rentalsTableExists) {
      return new Map();
    }

    let query = supabase
      .from(RENTALS_TABLE)
      .select('id, vehicle_id, start_fuel_level, end_fuel_level')
      .in('id', uniqueIds);
    query = await this.scopeFuelQuery(
      query,
      RENTALS_TABLE,
      'Workspace organization context is required to load rental fuel levels.',
    );
    const { data, error } = await query;

    if (error) {
      return new Map();
    }

    return new Map((data || []).map((row) => [String(row.id), row]));
  }

  async getAllTransactions(options = {}) {
    const {
      limit = 50,
      offset = 0,
      search = '',
      vehicleId = '',
      transactionType = '',
      fuelType = '',
      startDate = '',
      endDate = '',
      fuelStation = '',
      location = '',
    } = options;

    const hasAdvancedFilters = Boolean(
      search ||
      vehicleId ||
      transactionType ||
      fuelType ||
      startDate ||
      endDate ||
      fuelStation ||
      location
    );
    const isFastDefaultPage =
      !hasAdvancedFilters &&
      Number(offset) === 0 &&
      Number(limit) <= 20;
    const cacheKey = JSON.stringify({
      limit,
      offset,
      search,
      vehicleId,
      transactionType,
      fuelType,
      startDate,
      endDate,
      fuelStation,
      location,
    });
    const cachedEntry = this.transactionListCache.get(cacheKey);
    if (cachedEntry && Date.now() - cachedEntry.timestamp < 15000) {
      return cachedEntry.value;
    }
    if (this.transactionListPromiseCache.has(cacheKey)) {
      return this.transactionListPromiseCache.get(cacheKey);
    }
    const promise = (async () => {
      if (!hasAdvancedFilters) {
        const defaultFeed = await this.getDefaultTransactionsFeed({ limit, offset });
        if (defaultFeed?.success) {
          this.transactionListCache.set(cacheKey, {
            timestamp: Date.now(),
            value: defaultFeed,
          });
          return defaultFeed;
        }
      }

      const fetchLimit = hasAdvancedFilters ? Math.max(offset + limit + 40, 120) : Math.max(offset + limit + 8, 36);
      const sourceFetchLimit = isFastDefaultPage ? Math.max(limit + 4, 16) : fetchLimit;
      const shouldUseFastLogPath = isFastDefaultPage;

      const [refills, withdrawals, operationLogs] = await Promise.all([
        this.getAllRefills({ limit: sourceFetchLimit }),
        this.getAllWithdrawals({ limit: sourceFetchLimit }),
        this.getFuelOperationLogs({
          limit: sourceFetchLimit,
          includeRentalVehicleLookup: !shouldUseFastLogPath,
          includeRentalReferenceLookup: true,
        }),
      ]);
      const shouldReconcileRentalSnapshots =
        !shouldUseFastLogPath &&
        operationLogs.some(
          (log) =>
            (log.transaction_type === 'rental_opening_level' || log.transaction_type === 'rental_closing_level') &&
            log.rental_id
        );
      const rentalFuelLevelsMap = shouldReconcileRentalSnapshots
        ? await this.getRentalFuelLevelsMap(
            operationLogs
              .filter((log) => (log.transaction_type === 'rental_opening_level' || log.transaction_type === 'rental_closing_level') && log.rental_id)
              .map((log) => log.rental_id)
          )
        : new Map();
      const rentalReferenceLookup =
        !shouldUseFastLogPath && operationLogs.some((log) => log.rental_id)
          ? await this.getRentalReferenceLookup(
              operationLogs
                .filter((log) => log.rental_id)
                .map((log) => log.rental_id)
            )
          : new Map();

      const rentalOpeningSnapshots = new Map();
      for (const log of [...operationLogs].sort(
        (a, b) => new Date(a.created_at || a.transaction_date || 0) - new Date(b.created_at || b.transaction_date || 0)
      )) {
        if (log.transaction_type !== 'rental_opening_level' || !log.rental_id) {
          continue;
        }

        const openingLiters =
          log.liters_after ??
          (log.fuel_lines_after !== null && log.fuel_lines_after !== undefined ? linesToLiters(log.fuel_lines_after) : null);

        if (openingLiters !== null && openingLiters !== undefined) {
          rentalOpeningSnapshots.set(String(log.rental_id), Number(openingLiters));
        }
      }

      const transactionMap = new Map();
      const baseTransactionKeys = new Set();

      for (const refill of refills) {
        const mapped = this.mapTransactionRecord({
          ...refill,
          id: `refill-${refill.id}`,
        });
        transactionMap.set(mapped.id, mapped);
        baseTransactionKeys.add(this.buildTransactionDedupKey(mapped));
      }

      for (const withdrawal of withdrawals) {
        const mapped = this.mapTransactionRecord({
          ...withdrawal,
          id: `withdrawal-${withdrawal.id}`,
        });
        transactionMap.set(mapped.id, mapped);
        baseTransactionKeys.add(this.buildTransactionDedupKey(mapped));
      }

      for (const log of operationLogs) {
        if (shouldUseFastLogPath) {
          const mapped = this.mapTransactionRecord({
            ...log,
            id: `log-${log.id}`,
          });
          const shouldSuppressAsDuplicate =
            ['tank_refill', 'vehicle_refill', 'withdrawal', 'tank_out'].includes(mapped.transaction_type) &&
            baseTransactionKeys.has(this.buildTransactionDedupKey(mapped));

          if (shouldSuppressAsDuplicate) {
            continue;
          }
          if (!transactionMap.has(mapped.id)) {
            transactionMap.set(mapped.id, mapped);
          }
          continue;
        }

        const rentalFuelLevels = log.rental_id ? rentalFuelLevelsMap.get(String(log.rental_id)) : null;
        const rentalOpeningLitersFromTable =
          rentalFuelLevels?.start_fuel_level !== null && rentalFuelLevels?.start_fuel_level !== undefined
            ? linesToLiters(rentalFuelLevels.start_fuel_level)
            : null;
        const isRentalOpening = log.transaction_type === 'rental_opening_level';
        const isRentalClosing = log.transaction_type === 'rental_closing_level';
        const overrideFuelLinesBefore =
          isRentalClosing && rentalFuelLevels?.start_fuel_level !== null && rentalFuelLevels?.start_fuel_level !== undefined
            ? rentalFuelLevels.start_fuel_level
            : log.fuel_lines_before;
        const overrideFuelLinesAfter =
          isRentalOpening && rentalFuelLevels?.start_fuel_level !== null && rentalFuelLevels?.start_fuel_level !== undefined
            ? rentalFuelLevels.start_fuel_level
            : isRentalClosing && rentalFuelLevels?.end_fuel_level !== null && rentalFuelLevels?.end_fuel_level !== undefined
              ? rentalFuelLevels.end_fuel_level
              : log.fuel_lines_after;
        const overrideLitersBefore =
          overrideFuelLinesBefore !== null && overrideFuelLinesBefore !== undefined
            ? linesToLiters(overrideFuelLinesBefore)
            : log.liters_before;
        const overrideLitersAfter =
          overrideFuelLinesAfter !== null && overrideFuelLinesAfter !== undefined
            ? linesToLiters(overrideFuelLinesAfter)
            : log.liters_after;
        const derivedAmount = this.deriveRentalFuelLogAmount(
          {
            ...log,
            fuel_lines_before: overrideFuelLinesBefore,
            fuel_lines_after: overrideFuelLinesAfter,
            liters_before: overrideLitersBefore,
            liters_after: overrideLitersAfter,
          },
          log.rental_id
            ? (rentalOpeningSnapshots.get(String(log.rental_id)) ?? rentalOpeningLitersFromTable)
            : null
        );
        const mapped = this.mapTransactionRecord({
          ...log,
          vehicle_id: log.vehicle_id || rentalFuelLevels?.vehicle_id || null,
          rental_reference: log.rental_reference || (log.rental_id ? rentalReferenceLookup.get(String(log.rental_id)) || null : null),
          fuel_lines_before: overrideFuelLinesBefore,
          fuel_lines_after: overrideFuelLinesAfter,
          liters_before: overrideLitersBefore,
          liters_after: overrideLitersAfter,
          id: `log-${log.id}`,
          amount: derivedAmount !== undefined ? derivedAmount : log.amount,
        });
        const shouldSuppressAsDuplicate =
          ['tank_refill', 'vehicle_refill', 'withdrawal', 'tank_out'].includes(mapped.transaction_type) &&
          baseTransactionKeys.has(this.buildTransactionDedupKey(mapped));

        if (shouldSuppressAsDuplicate) {
          continue;
        }
        if (!transactionMap.has(mapped.id)) {
          transactionMap.set(mapped.id, mapped);
        }
      }

      let allTransactions = Array.from(transactionMap.values()).sort(
        (a, b) => new Date(b.transaction_date) - new Date(a.transaction_date)
      );

      if (search) {
        const searchLower = search.toLowerCase();
        allTransactions = allTransactions.filter((transaction) =>
          [transaction.fuel_station, transaction.location, transaction.notes, transaction.performed_by_name, transaction.saharax_0u4w4d_vehicles?.name]
            .filter(Boolean)
            .some((value) => value.toLowerCase().includes(searchLower))
        );
      }

      if (vehicleId) {
        allTransactions = allTransactions.filter((transaction) => String(transaction.vehicle_id) === String(vehicleId));
      }

      if (transactionType) {
        allTransactions = allTransactions.filter((transaction) => transaction.transaction_type === transactionType);
      }

      if (fuelType) {
        allTransactions = allTransactions.filter((transaction) => transaction.fuel_type === fuelType);
      }

      if (startDate) {
        allTransactions = allTransactions.filter((transaction) => new Date(transaction.transaction_date) >= new Date(startDate));
      }

      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        allTransactions = allTransactions.filter((transaction) => new Date(transaction.transaction_date) <= endDateTime);
      }

      if (fuelStation) {
        allTransactions = allTransactions.filter((transaction) =>
          (transaction.fuel_station || '').toLowerCase().includes(fuelStation.toLowerCase())
        );
      }

      if (location) {
        allTransactions = allTransactions.filter((transaction) =>
          (transaction.location || '').toLowerCase().includes(location.toLowerCase())
        );
      }

      const totalCount = allTransactions.length;
      const paginatedTransactions = allTransactions.slice(offset, offset + limit);

      const response = {
        success: true,
        transactions: paginatedTransactions,
        totalCount,
      };
      this.transactionListCache.set(cacheKey, {
        timestamp: Date.now(),
        value: response,
      });
      return response;
    })();

    this.transactionListPromiseCache.set(cacheKey, promise);

    try {
      return await promise;
    } finally {
      this.transactionListPromiseCache.delete(cacheKey);
    }
  }

  prefetchDefaultTransactions() {
    return this.getAllTransactions({
      limit: 20,
      offset: 0,
    }).catch(() => null);
  }

  prewarmFuelWorkspace() {
    return Promise.allSettled([
      this.getFuelOverviewSummary({
        recentRefillsLimit: 8,
        recentWithdrawalsLimit: 8,
      }),
    ]);
  }

  async getAnalytics(filters = {}) {
    const result = await this.getAllTransactions({
      ...filters,
      limit: 10000,
      offset: 0,
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    const analytics = {
      totalTransactions: result.totalCount,
      totalRefills: 0,
      totalWithdrawals: 0,
      totalFuelAmount: 0,
      totalCost: 0,
      avgCostPerLiter: 0,
      fuelByType: {},
      fuelByVehicle: {},
      monthlyTrends: {},
      expenseTransactions: 0,
    };

    for (const transaction of result.transactions) {
      const monthKey = new Date(transaction.transaction_date).toISOString().slice(0, 7);
      const amount = Number(transaction.amount) || 0;
      const cost = Number(transaction.cost) || 0;
      const fuelType = transaction.fuel_type || 'gasoline';
      const vehicleKey = transaction.vehicle_id ? String(transaction.vehicle_id) : null;

      analytics.totalFuelAmount += amount;
      analytics.totalCost += cost;

      if (transaction.transaction_type === 'withdrawal') {
        analytics.totalWithdrawals += 1;
      } else {
        analytics.totalRefills += 1;
      }

      if (transaction.is_financial_expense) {
        analytics.expenseTransactions += 1;
      }

      if (!analytics.fuelByType[fuelType]) {
        analytics.fuelByType[fuelType] = { amount: 0, cost: 0, count: 0 };
      }
      analytics.fuelByType[fuelType].amount += amount;
      analytics.fuelByType[fuelType].cost += cost;
      analytics.fuelByType[fuelType].count += 1;

      if (vehicleKey) {
        if (!analytics.fuelByVehicle[vehicleKey]) {
          analytics.fuelByVehicle[vehicleKey] = { amount: 0, cost: 0, count: 0 };
        }
        analytics.fuelByVehicle[vehicleKey].amount += amount;
        analytics.fuelByVehicle[vehicleKey].cost += cost;
        analytics.fuelByVehicle[vehicleKey].count += 1;
      }

      if (!analytics.monthlyTrends[monthKey]) {
        analytics.monthlyTrends[monthKey] = { amount: 0, cost: 0, count: 0 };
      }
      analytics.monthlyTrends[monthKey].amount += amount;
      analytics.monthlyTrends[monthKey].cost += cost;
      analytics.monthlyTrends[monthKey].count += 1;
    }

    analytics.totalFuelAmount = roundTo(analytics.totalFuelAmount, 2);
    analytics.totalCost = roundTo(analytics.totalCost, 2);
    analytics.avgCostPerLiter =
      analytics.totalFuelAmount > 0 ? roundTo(analytics.totalCost / analytics.totalFuelAmount, 2) : 0;

    return { success: true, analytics };
  }

  async getFuelExpenseTransactions(filters = {}) {
    const result = await this.getAllTransactions({
      ...filters,
      limit: 10000,
      offset: 0,
    });

    if (!result.success) {
      return result;
    }

    return {
      success: true,
      transactions: result.transactions.filter((transaction) => transaction.is_financial_expense),
      totalCount: result.transactions.filter((transaction) => transaction.is_financial_expense).length,
    };
  }

  async getFuelExpenseSummary(filters = {}) {
    const result = await this.getFuelExpenseTransactions(filters);
    if (!result.success) {
      return result;
    }

    const summary = result.transactions.reduce(
      (acc, transaction) => {
        acc.totalCost += Number(transaction.cost) || 0;
        acc.totalLiters += Number(transaction.amount) || 0;
        acc.totalTransactions += 1;

        const vehicleId = transaction.vehicle_id ? String(transaction.vehicle_id) : 'tank';
        if (!acc.byVehicle[vehicleId]) {
          acc.byVehicle[vehicleId] = { totalCost: 0, totalLiters: 0, totalTransactions: 0 };
        }
        acc.byVehicle[vehicleId].totalCost += Number(transaction.cost) || 0;
        acc.byVehicle[vehicleId].totalLiters += Number(transaction.amount) || 0;
        acc.byVehicle[vehicleId].totalTransactions += 1;

        const vendor = transaction.fuel_station || 'Unknown';
        if (!acc.byVendor[vendor]) {
          acc.byVendor[vendor] = { totalCost: 0, totalTransactions: 0 };
        }
        acc.byVendor[vendor].totalCost += Number(transaction.cost) || 0;
        acc.byVendor[vendor].totalTransactions += 1;

        return acc;
      },
      {
        totalCost: 0,
        totalLiters: 0,
        totalTransactions: 0,
        byVehicle: {},
        byVendor: {},
      }
    );

    summary.totalCost = roundTo(summary.totalCost, 2);
    summary.totalLiters = roundTo(summary.totalLiters, 2);

    return { success: true, summary };
  }

  calculateCost(refill) {
    if (refill.total_cost && Number(refill.total_cost) > 0) {
      return Number(refill.total_cost);
    }

    const amount = Number(refill.liters_added || refill.liters || refill.amount) || 0;
    const unitPrice = Number(refill.unit_price || refill.price_per_liter) || 0;
    return amount > 0 && unitPrice > 0 ? roundTo(amount * unitPrice, 2) : 0;
  }

  assignFuelStation(refill) {
    if (refill.fuel_station) {
      return refill.fuel_station;
    }

    if (refill.transaction_type === 'vehicle_refill') {
      return 'Direct Fill';
    }

    if (refill.transaction_type === 'withdrawal') {
      return 'Main Tank';
    }

    if (refill.transaction_type === 'staff_fuel_use') {
      return 'Staff Fuel Use';
    }

    return 'Main Station';
  }

  async createTransaction(transactionData) {
    const actor = this.buildActor(transactionData.actor || transactionData);
    const receiptMedia = this.normalizeReceiptMedia(transactionData.receipt_media || transactionData.invoice_image);
    const transactionType = transactionData.transaction_type;
    const actionTimestamp = this.buildActionTimestamp(transactionData.transaction_date);
    let amount = parseFuelNumber(transactionData.amount || transactionData.liters);
    if (transactionType === 'vehicle_refill') {
      amount = roundToHalfLiter(amount);
    }
    const unitPrice =
      transactionData.unit_price !== undefined && transactionData.unit_price !== null && transactionData.unit_price !== ''
        ? parseFuelNumber(transactionData.unit_price)
        : transactionData.cost && amount > 0
          ? parseFuelNumber(transactionData.cost) / amount
          : 0;
    const totalCost =
      transactionData.cost !== undefined && transactionData.cost !== null && transactionData.cost !== ''
        ? parseFuelNumber(transactionData.cost)
        : unitPrice > 0 && amount > 0
          ? roundTo(unitPrice * amount, 2)
          : 0;
    const requestedFinalFuelLines =
      transactionData.fuel_lines_after !== undefined &&
      transactionData.fuel_lines_after !== null &&
      transactionData.fuel_lines_after !== ''
        ? parseFuelNumber(transactionData.fuel_lines_after)
        : null;

    if (transactionType === 'staff_fuel_use') {
      const vehicleId = transactionData.vehicle_id;
      if (!vehicleId) {
        return { success: false, error: 'Vehicle is required for staff fuel use.' };
      }

      const currentState = await this.getVehicleFuelState(vehicleId);
      const resolvedTankCapacity = resolveTankCapacityLiters(
        transactionData.tank_capacity_liters,
        currentState?.tank_capacity_liters,
        DEFAULT_VEHICLE_TANK_LITERS,
      );
      const requestedRemainingLines = Number(transactionData.fuel_lines_after);
      const normalizedRemainingState = normalizeFuelState({
        lines: requestedRemainingLines,
        tankCapacityLiters: resolvedTankCapacity,
      });
      const consumedLiters = roundTo(
        Math.max(0, Number(currentState?.current_fuel_liters || 0) - Number(normalizedRemainingState.liters || 0)),
        2
      );

      if (consumedLiters <= 0) {
        return { success: false, error: 'Select a lower remaining fuel level to record staff fuel use.' };
      }

      const syncResult = await this.syncVehicleFuelState({
        vehicleId,
        lines: normalizedRemainingState.lines,
        liters: normalizedRemainingState.liters,
        source: 'staff_fuel_use',
        tankCapacityLiters: resolvedTankCapacity,
      });

      if (!syncResult.success) {
        return syncResult;
      }

      const composedNotes = [transactionData.purpose, transactionData.notes]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .join(' • ');

      const logResult = await this.logFuelOperation({
        transaction_type: 'staff_fuel_use',
        source: 'staff_fuel_use',
        vehicle_id: vehicleId,
        liters: consumedLiters,
        liters_before: currentState.current_fuel_liters,
        liters_after: normalizedRemainingState.liters,
        fuel_lines_before: currentState.current_fuel_lines,
        fuel_lines_after: normalizedRemainingState.lines,
        odometer_reading: transactionData.odometer_reading ? parseInt(transactionData.odometer_reading, 10) : null,
        actor,
        notes: composedNotes || 'Staff fuel use',
        is_financial_expense: false,
        created_at: actionTimestamp,
      });

      this.invalidateFuelCaches({
        entity: 'fuel_transaction',
        reason: 'staff_fuel_use_created',
        transactionType,
        vehicleId,
      });

      this.runBackgroundFuelTasks([
        this.syncVehicleCurrentOdometer(vehicleId, transactionData.odometer_reading ? parseInt(transactionData.odometer_reading, 10) : null),
        this.getVehicleFuelUsageSummary(vehicleId, { persist: true }),
      ], 'staff fuel use follow-up');

      return {
        success: true,
        transaction: this.mapTransactionRecord({
          ...(logResult.log || {}),
          id: logResult.log?.id ? `log-${logResult.log.id}` : `staff-fuel-use-${Date.now()}`,
          transaction_type: 'staff_fuel_use',
          source: 'staff_fuel_use',
          vehicle_id: vehicleId,
          liters: consumedLiters,
          amount: consumedLiters,
          liters_before: currentState.current_fuel_liters,
          liters_after: normalizedRemainingState.liters,
          fuel_lines_before: currentState.current_fuel_lines,
          fuel_lines_after: normalizedRemainingState.lines,
          created_at: actionTimestamp,
          transaction_date: actionTimestamp,
          notes: composedNotes || 'Staff fuel use',
          performed_by_name: actor.performed_by_name,
          performed_by_user_id: actor.performed_by_user_id,
          odometer_reading: transactionData.odometer_reading ? parseInt(transactionData.odometer_reading, 10) : null,
          is_financial_expense: false,
        }),
      };
    }

    if (transactionType === 'tank_refill') {
      const payload = {
        liters_added: amount,
        total_cost: totalCost,
        unit_price: unitPrice,
        fuel_type: transactionData.fuel_type || 'gasoline',
        refill_date: actionTimestamp,
        fuel_station: transactionData.fuel_station || 'Main Station',
        location: transactionData.location || '',
        refilled_by: actor.performed_by_name,
        notes: transactionData.notes || null,
        invoice_image: receiptMedia,
      };

      const { data, error } = await supabase
        .from(this.fuelRefillsTable)
        .insert([payload])
        .select('*')
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      const providedTankSnapshot = transactionData.tank_snapshot || null;
      const tankAdjustmentResult = await this.adjustTankCurrentVolume(amount, {
        tankSnapshot: providedTankSnapshot,
      });

      if (!tankAdjustmentResult.success) {
        return tankAdjustmentResult;
      }

      this.runBackgroundFuelTasks([
        this.logFuelOperation({
        transaction_type: 'tank_refill',
        source: 'tank_refill',
        liters: amount,
        unit_price: unitPrice,
        total_cost: totalCost,
        fuel_type: payload.fuel_type,
        fuel_station: payload.fuel_station,
        location: payload.location,
        receipt_media: receiptMedia,
        actor,
        notes: payload.notes,
        is_financial_expense: true,
        created_at: actionTimestamp,
        }),
      ], 'tank refill log');

      this.invalidateFuelCaches({
        entity: 'fuel_transaction',
        reason: 'tank_refill_created',
        transactionType,
      });

      return {
        success: true,
        transaction: this.mapTransactionRecord({
          ...data,
          transaction_type: 'tank_refill',
          source: 'tank_refill',
          amount,
          cost: totalCost,
          unit_price: unitPrice,
          transaction_date: actionTimestamp,
          created_at: data?.created_at || actionTimestamp,
          performed_by_name: actor.performed_by_name,
        }),
        tank: tankAdjustmentResult.tank,
      };
    }

    if (transactionType === 'vehicle_refill') {
      const payload = {
        vehicle_id: transactionData.vehicle_id,
        liters_added: amount,
        total_cost: totalCost,
        unit_price: unitPrice,
        fuel_type: transactionData.fuel_type || 'gasoline',
        refill_date: actionTimestamp,
        fuel_station: transactionData.fuel_station || 'Direct Fill',
        location: transactionData.location || '',
        odometer_reading: transactionData.odometer_reading ? parseInt(transactionData.odometer_reading, 10) : null,
        refilled_by: actor.performed_by_name,
        notes: transactionData.notes || null,
        invoice_image: receiptMedia,
      };
      const legacyFuelRefillPayload = {
        vehicle_id: payload.vehicle_id,
        liters_added: payload.liters_added,
        total_cost: payload.total_cost,
        unit_price: payload.unit_price,
        fuel_type: payload.fuel_type,
        refill_date: payload.refill_date,
        fuel_station: payload.fuel_station,
        location: payload.location,
        refilled_by: payload.refilled_by,
        notes: payload.notes,
        invoice_image: payload.invoice_image,
      };

      let data = null;
      let error = null;

      if (await this.tableExists(this.vehicleFuelRefillsTable)) {
        const result = await supabase
          .from(this.vehicleFuelRefillsTable)
          .insert([payload])
          .select(`
            *,
            ${this.vehiclesTable} (
              id,
              name,
              plate_number,
              model,
              vehicle_type
            )
          `)
          .single();
        data = result.data;
        error = result.error;
      }

      if (error || !data) {
        const fallbackResult = await supabase
          .from(this.fuelRefillsTable)
          .insert([legacyFuelRefillPayload])
          .select(`
            *,
            ${this.vehiclesTable} (
              id,
              name,
              plate_number,
              model,
              vehicle_type
            )
          `)
          .single();
        data = fallbackResult.data;
        error = fallbackResult.error;
      }

      if (error) {
        return { success: false, error: error.message };
      }

      const currentState = await this.getVehicleFuelState(transactionData.vehicle_id);
      const nextLiters = roundTo((currentState.current_fuel_liters || 0) + amount, 3);
      const normalizedTargetState =
        requestedFinalFuelLines !== null && Number.isFinite(requestedFinalFuelLines)
          ? normalizeFuelState({
              lines: requestedFinalFuelLines,
              tankCapacityLiters: currentState.tank_capacity_liters,
            })
          : null;
      const syncedState = await this.syncVehicleFuelState({
        vehicleId: transactionData.vehicle_id,
        liters: normalizedTargetState?.liters ?? nextLiters,
        lines: normalizedTargetState?.lines ?? null,
        source: 'vehicle_refill',
        transactionId: data.id,
        tankCapacityLiters: currentState.tank_capacity_liters,
      });

      this.invalidateFuelCaches({
        entity: 'fuel_transaction',
        reason: 'vehicle_refill_created',
        transactionType,
        vehicleId: transactionData.vehicle_id,
      });

      Promise.allSettled([
        this.logFuelOperation({
          transaction_type: 'vehicle_refill',
          source: 'direct_station',
          vehicle_id: transactionData.vehicle_id,
          liters: amount,
          liters_before: currentState.current_fuel_liters,
          liters_after: syncedState.state?.current_fuel_liters ?? nextLiters,
          fuel_lines_before: currentState.current_fuel_lines,
          fuel_lines_after: syncedState.state?.current_fuel_lines,
          unit_price: unitPrice,
          total_cost: totalCost,
          fuel_type: payload.fuel_type,
          fuel_station: payload.fuel_station,
          location: payload.location,
          odometer_reading: payload.odometer_reading,
          receipt_media: receiptMedia,
          actor,
          notes: payload.notes,
          is_financial_expense: true,
          created_at: actionTimestamp,
        }),
        this.syncVehicleCurrentOdometer(transactionData.vehicle_id, payload.odometer_reading),
        this.getVehicleFuelUsageSummary(transactionData.vehicle_id, { persist: true }),
      ]).catch((backgroundError) => {
        console.warn('Non-blocking vehicle refill follow-up failed:', backgroundError);
      });

      return { success: true, transaction: data };
    }

    if (transactionType === 'withdrawal' || transactionType === 'tank_out') {
      const tankVolumeCheck = await this.ensureSufficientTankVolume(amount);
      if (!tankVolumeCheck.success) {
        return { success: false, error: tankVolumeCheck.error };
      }

      const tankAverageUnitCost = await this.getCurrentTankAverageUnitCost();
      const transferUnitPrice =
        transactionType === 'withdrawal'
          ? (unitPrice > 0 ? unitPrice : tankAverageUnitCost)
          : 0;
      const transferTotalCost =
        transactionType === 'withdrawal' && transferUnitPrice > 0 && amount > 0
          ? roundTo(transferUnitPrice * amount, 2)
          : 0;
      const mergedNotes = [transactionData.purpose, transactionData.notes]
        .filter(Boolean)
        .join(' • ') || null;
      const payload = {
        vehicle_id: transactionType === 'tank_out' ? null : transactionData.vehicle_id,
        liters_taken: amount,
        unit_price: transactionType === 'withdrawal' ? transferUnitPrice : null,
        total_cost: transactionType === 'withdrawal' ? transferTotalCost : null,
        withdrawal_date: actionTimestamp,
        odometer_reading: transactionType === 'tank_out' ? null : (transactionData.odometer_reading ? parseInt(transactionData.odometer_reading, 10) : null),
        filled_by: actor.performed_by_name,
        notes: mergedNotes,
        transaction_type: transactionType,
      };

      const legacyPayload = {
        vehicle_id: payload.vehicle_id,
        liters_taken: payload.liters_taken,
        withdrawal_date: payload.withdrawal_date,
        odometer_reading: payload.odometer_reading,
        filled_by: payload.filled_by,
        notes: payload.notes,
        transaction_type: payload.transaction_type,
      };

      let data = null;
      let error = null;

      const insertWithPayload = async (nextPayload) => supabase
        .from(this.fuelWithdrawalsTable)
        .insert([nextPayload])
        .select(`
          *,
          vehicle:${this.vehiclesTable} (
            id,
            name,
            plate_number,
            model,
            vehicle_type
          )
        `)
        .single();

      ({ data, error } = await insertWithPayload(payload));

      if (error && this.isRetryableSchemaError(error)) {
        ({ data, error } = await insertWithPayload(legacyPayload));
      }

      if (error) {
        return { success: false, error: error.message };
      }

      if (transactionType === 'withdrawal') {
        const tankAdjustmentResult = await this.adjustTankCurrentVolume(-amount, { rejectNegative: true });
        if (!tankAdjustmentResult.success) {
          await supabase.from(this.fuelWithdrawalsTable).delete().eq('id', data.id);
          return { success: false, error: tankAdjustmentResult.error };
        }

        const currentState = await this.getVehicleFuelState(transactionData.vehicle_id);
        const nextLiters = roundTo((currentState.current_fuel_liters || 0) + amount, 3);
        const normalizedTargetState =
          requestedFinalFuelLines !== null && Number.isFinite(requestedFinalFuelLines)
            ? normalizeFuelState({
                lines: requestedFinalFuelLines,
                tankCapacityLiters: currentState.tank_capacity_liters,
              })
            : null;
        const syncedState = await this.syncVehicleFuelState({
          vehicleId: transactionData.vehicle_id,
          liters: normalizedTargetState?.liters ?? nextLiters,
          lines: normalizedTargetState?.lines ?? null,
          source: 'withdrawal',
          transactionId: data.id,
          tankCapacityLiters: currentState.tank_capacity_liters,
        });

        this.runBackgroundFuelTasks([
          this.logFuelOperation({
            transaction_type: 'withdrawal',
            source: 'tank_transfer',
            vehicle_id: transactionData.vehicle_id,
            liters: amount,
            liters_before: currentState.current_fuel_liters,
            liters_after: syncedState.state?.current_fuel_liters ?? nextLiters,
            fuel_lines_before: currentState.current_fuel_lines,
            fuel_lines_after: syncedState.state?.current_fuel_lines,
            unit_price: transferUnitPrice,
            total_cost: transferTotalCost,
            odometer_reading: payload.odometer_reading,
            actor,
            notes: payload.notes,
            is_financial_expense: false,
            created_at: actionTimestamp,
          }),
          this.syncVehicleCurrentOdometer(transactionData.vehicle_id, payload.odometer_reading),
          this.getVehicleFuelUsageSummary(transactionData.vehicle_id, { persist: true }),
        ], 'withdrawal follow-up');
      } else {
        const tankAdjustmentResult = await this.adjustTankCurrentVolume(-amount, { rejectNegative: true });
        if (!tankAdjustmentResult.success) {
          await supabase.from(this.fuelWithdrawalsTable).delete().eq('id', data.id);
          return { success: false, error: tankAdjustmentResult.error };
        }
        this.runBackgroundFuelTasks([
          this.logFuelOperation({
            transaction_type: 'tank_out',
            source: 'tank_out',
            liters: amount,
            actor,
            notes: payload.notes,
            is_financial_expense: false,
            created_at: actionTimestamp,
          }),
        ], 'tank-out follow-up');
      }

      this.invalidateFuelCaches({
        entity: 'fuel_transaction',
        reason: transactionType === 'withdrawal' ? 'vehicle_withdrawal_created' : 'tank_out_created',
        transactionType,
        vehicleId: transactionType === 'withdrawal' ? transactionData.vehicle_id : null,
      });

      return { success: true, transaction: data };
    }

    return { success: false, error: 'Invalid transaction type' };
  }

  async updateTransaction(id, transactionData) {
    const receiptMedia = this.normalizeReceiptMedia(transactionData.receipt_media || transactionData.invoice_image);
    const actor = this.buildActor(transactionData.actor || transactionData);
    const transactionType = transactionData.transaction_type;
    const actionTimestamp = this.buildActionTimestamp(transactionData.transaction_date);
    let amount = parseFuelNumber(transactionData.amount || transactionData.liters);
    if (transactionType === 'vehicle_refill') {
      amount = roundToHalfLiter(amount);
    }
    const unitPrice =
      transactionData.unit_price !== undefined && transactionData.unit_price !== null && transactionData.unit_price !== ''
        ? parseFuelNumber(transactionData.unit_price)
        : transactionData.cost && amount > 0
          ? parseFuelNumber(transactionData.cost) / amount
          : 0;
    const totalCost =
      transactionData.cost !== undefined && transactionData.cost !== null && transactionData.cost !== ''
        ? parseFuelNumber(transactionData.cost)
        : unitPrice > 0 && amount > 0
          ? roundTo(unitPrice * amount, 2)
          : 0;

    if (transactionType === 'tank_refill') {
      const { data: previousTankRefill } = await supabase
        .from(this.fuelRefillsTable)
        .select('id, liters_added')
        .eq('id', id)
        .maybeSingle();

      const payload = {
        liters_added: amount,
        total_cost: totalCost,
        unit_price: unitPrice,
        fuel_type: transactionData.fuel_type || 'gasoline',
        refill_date: actionTimestamp,
        fuel_station: transactionData.fuel_station || 'Main Station',
        location: transactionData.location || '',
        refilled_by: actor.performed_by_name,
        notes: transactionData.notes || null,
        invoice_image: receiptMedia,
      };

      const { data, error } = await supabase
        .from(this.fuelRefillsTable)
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      const previousAmount = Number(previousTankRefill?.liters_added || 0);
      await this.adjustTankCurrentVolume(amount - previousAmount);
      this.invalidateFuelCaches({
        entity: 'fuel_transaction',
        reason: 'tank_refill_updated',
        transactionType,
      });

      return { success: true, transaction: data };
    }

    if (transactionType === 'vehicle_refill') {
      const payload = {
        vehicle_id: transactionData.vehicle_id,
        liters_added: amount,
        total_cost: totalCost,
        unit_price: unitPrice,
        fuel_type: transactionData.fuel_type || 'gasoline',
        refill_date: actionTimestamp,
        fuel_station: transactionData.fuel_station || 'Direct Fill',
        location: transactionData.location || '',
        odometer_reading: transactionData.odometer_reading ? parseInt(transactionData.odometer_reading, 10) : null,
        refilled_by: actor.performed_by_name,
        notes: transactionData.notes || null,
        invoice_image: receiptMedia,
      };
      const legacyFuelRefillPayload = {
        vehicle_id: payload.vehicle_id,
        liters_added: payload.liters_added,
        total_cost: payload.total_cost,
        unit_price: payload.unit_price,
        fuel_type: payload.fuel_type,
        refill_date: payload.refill_date,
        fuel_station: payload.fuel_station,
        location: payload.location,
        refilled_by: payload.refilled_by,
        notes: payload.notes,
        invoice_image: payload.invoice_image,
      };

      let data = null;
      let error = null;

      if (await this.tableExists(this.vehicleFuelRefillsTable)) {
        const result = await supabase
          .from(this.vehicleFuelRefillsTable)
          .update(payload)
          .eq('id', id)
          .select(`
            *,
            ${this.vehiclesTable} (
              id,
              name,
              plate_number,
              model,
              vehicle_type
            )
          `)
          .single();
        data = result.data;
        error = result.error;
      }

      if (error || !data) {
        const fallbackResult = await supabase
          .from(this.fuelRefillsTable)
          .update(legacyFuelRefillPayload)
          .eq('id', id)
          .select(`
            *,
            ${this.vehiclesTable} (
              id,
              name,
              plate_number,
              model,
              vehicle_type
            )
          `)
          .single();
        data = fallbackResult.data;
        error = fallbackResult.error;
      }

      if (error) {
        return { success: false, error: error.message };
      }

      this.invalidateFuelCaches({
        entity: 'fuel_transaction',
        reason: 'vehicle_refill_updated',
        transactionType,
        vehicleId: transactionData.vehicle_id,
      });
      this.runBackgroundFuelTasks([
        this.syncVehicleCurrentOdometer(transactionData.vehicle_id, payload.odometer_reading),
        this.refreshVehicleFuelTracking(transactionData.vehicle_id),
        previousVehicleRefill?.vehicle_id && String(previousVehicleRefill.vehicle_id) !== String(transactionData.vehicle_id)
          ? this.refreshVehicleFuelTracking(previousVehicleRefill.vehicle_id)
          : null,
      ], 'vehicle refill update follow-up');

      return { success: true, transaction: data };
    }

    if (transactionType === 'withdrawal' || transactionType === 'tank_out') {
      const { data: previousWithdrawal } = await supabase
        .from(this.fuelWithdrawalsTable)
        .select('id, liters_taken, vehicle_id, unit_price, total_cost, withdrawal_date, odometer_reading, filled_by, notes, transaction_type')
        .eq('id', id)
        .maybeSingle();

      const previousAmount = Number(previousWithdrawal?.liters_taken || 0);
      const liveTank = await this.getFuelTankData();
      const tankVolumeCheck = await this.ensureSufficientTankVolume(amount, {
        availableLitersOverride: Number(liveTank?.current_volume_liters || 0) + previousAmount,
      });
      if (!tankVolumeCheck.success) {
        return { success: false, error: tankVolumeCheck.error };
      }

      const tankAverageUnitCost = await this.getCurrentTankAverageUnitCost();
      const transferUnitPrice =
        transactionType === 'withdrawal'
          ? (unitPrice > 0 ? unitPrice : Number(previousWithdrawal?.unit_price || 0) || tankAverageUnitCost)
          : 0;
      const transferTotalCost =
        transactionType === 'withdrawal' && amount > 0
          ? roundTo((transferUnitPrice || 0) * amount, 2)
          : 0;

      const mergedNotes = [transactionData.purpose, transactionData.notes]
        .filter(Boolean)
        .join(' • ') || null;
      const payload = {
        vehicle_id: transactionType === 'tank_out' ? null : transactionData.vehicle_id,
        liters_taken: amount,
        unit_price: transactionType === 'withdrawal' ? transferUnitPrice : null,
        total_cost: transactionType === 'withdrawal' ? transferTotalCost : null,
        withdrawal_date: actionTimestamp,
        odometer_reading: transactionType === 'tank_out' ? null : (transactionData.odometer_reading ? parseInt(transactionData.odometer_reading, 10) : null),
        filled_by: actor.performed_by_name,
        notes: mergedNotes,
        transaction_type: transactionType,
      };

      const legacyPayload = {
        vehicle_id: payload.vehicle_id,
        liters_taken: payload.liters_taken,
        withdrawal_date: payload.withdrawal_date,
        odometer_reading: payload.odometer_reading,
        filled_by: payload.filled_by,
        notes: payload.notes,
        transaction_type: payload.transaction_type,
      };

      let data = null;
      let error = null;

      const updateWithPayload = async (nextPayload) => supabase
        .from(this.fuelWithdrawalsTable)
        .update(nextPayload)
        .eq('id', id)
        .select(`
          *,
          vehicle:${this.vehiclesTable} (
            id,
            name,
            plate_number,
            model,
            vehicle_type
          )
        `)
        .single();

      ({ data, error } = await updateWithPayload(payload));

      if (error && this.isRetryableSchemaError(error)) {
        ({ data, error } = await updateWithPayload(legacyPayload));
      }

      if (error) {
        return { success: false, error: error.message };
      }

      const tankAdjustmentResult = await this.adjustTankCurrentVolume(-(amount - previousAmount), { rejectNegative: true });
      if (!tankAdjustmentResult.success) {
        await updateWithPayload({
          vehicle_id: previousWithdrawal?.vehicle_id || null,
          liters_taken: previousAmount,
          unit_price: Number(previousWithdrawal?.unit_price || 0) || null,
          total_cost: Number(previousWithdrawal?.total_cost || 0) || null,
          withdrawal_date: previousWithdrawal?.withdrawal_date || null,
          odometer_reading: previousWithdrawal?.odometer_reading || null,
          filled_by: previousWithdrawal?.filled_by || null,
          notes: previousWithdrawal?.notes || null,
          transaction_type: previousWithdrawal?.transaction_type || transactionType,
        });
        return { success: false, error: tankAdjustmentResult.error };
      }

      this.invalidateFuelCaches({
        entity: 'fuel_transaction',
        reason: transactionType === 'withdrawal' ? 'vehicle_withdrawal_updated' : 'tank_out_updated',
        transactionType,
        vehicleId: transactionType === 'withdrawal' ? transactionData.vehicle_id : null,
      });

      if (transactionType === 'withdrawal') {
        this.runBackgroundFuelTasks([
          this.syncVehicleCurrentOdometer(transactionData.vehicle_id, payload.odometer_reading),
          this.refreshVehicleFuelTracking(transactionData.vehicle_id),
          previousWithdrawal?.vehicle_id && String(previousWithdrawal.vehicle_id) !== String(transactionData.vehicle_id)
            ? this.refreshVehicleFuelTracking(previousWithdrawal.vehicle_id)
            : null,
        ], 'withdrawal update follow-up');
      }

      return { success: true, transaction: data };
    }

    return { success: false, error: 'Invalid transaction type' };
  }

  async deleteTransaction(id, type) {
    const rawId = String(id);
    const idPrefixMatch = rawId.match(/^(refill|withdrawal|log)-/);
    const idPrefix = idPrefixMatch ? idPrefixMatch[1] : null;
    const dbId = rawId.replace(/^(refill|withdrawal|log)-/, '');
    let tableName = null;
    let previousAmount = 0;
    let affectedVehicleId = null;
    let pairedLogMatch = null;

    if (idPrefix === 'log') {
      const { data } = await supabase
        .from(this.fuelOperationLogsTable)
        .select('id, vehicle_id, transaction_type, source, liters, created_at')
        .eq('id', dbId)
        .maybeSingle();

      affectedVehicleId = data?.vehicle_id || null;

      if (data?.transaction_type === 'tank_refill') {
        const { data: refillRow } = await supabase
          .from(this.fuelRefillsTable)
          .select('id, liters_added, vehicle_id, refill_date')
          .eq('refill_date', data.created_at)
          .eq('liters_added', data.liters)
          .is('vehicle_id', null)
          .maybeSingle();

        if (refillRow?.id) {
          tableName = this.fuelRefillsTable;
          previousAmount = Number(refillRow.liters_added ?? 0);
          pairedLogMatch = {
            transaction_type: 'tank_refill',
            source: 'tank_refill',
            vehicle_id: null,
            liters: previousAmount,
            created_at: refillRow.refill_date || data.created_at,
          };
          // Delete underlying base row directly; skip separate log delete later.
          const baseDeleteId = refillRow.id;
          let { error } = await supabase
            .from(tableName)
            .delete()
            .eq('id', baseDeleteId);

          if (error) {
            return { success: false, error: error.message };
          }

          await supabase
            .from(this.fuelOperationLogsTable)
            .delete()
            .eq('id', dbId);

          if (previousAmount > 0) {
            await this.adjustTankCurrentVolume(-previousAmount);
          }

          this.invalidateFuelCaches({
            entity: 'fuel_transaction',
            reason: 'tank_refill_deleted',
            transactionType: 'tank_refill',
          });
          return { success: true };
        }
      } else if (data?.transaction_type === 'withdrawal' || data?.transaction_type === 'tank_out') {
        const withdrawalVehicleId = data?.vehicle_id || null;
        let withdrawalQuery = supabase
          .from(this.fuelWithdrawalsTable)
          .select('id, liters_taken, vehicle_id, withdrawal_date, transaction_type, source')
          .eq('withdrawal_date', data.created_at)
          .eq('liters_taken', data.liters);

        withdrawalQuery = withdrawalVehicleId
          ? withdrawalQuery.eq('vehicle_id', withdrawalVehicleId)
          : withdrawalQuery.is('vehicle_id', null);

        const { data: withdrawalRow } = await withdrawalQuery.maybeSingle();

        if (withdrawalRow?.id) {
          tableName = this.fuelWithdrawalsTable;
          previousAmount = Number(withdrawalRow.liters_taken ?? 0);
          affectedVehicleId = withdrawalRow.vehicle_id || null;

          let { error } = await supabase
            .from(tableName)
            .delete()
            .eq('id', withdrawalRow.id);

          if (error) {
            return { success: false, error: error.message };
          }

          await supabase
            .from(this.fuelOperationLogsTable)
            .delete()
            .eq('id', dbId);

          if (previousAmount > 0) {
            await this.adjustTankCurrentVolume(previousAmount);
          }

          if (affectedVehicleId) {
            await this.refreshVehicleFuelTracking(affectedVehicleId);
          }

          this.invalidateFuelCaches({
            entity: 'fuel_transaction',
            reason: withdrawalRow.transaction_type === 'withdrawal' ? 'vehicle_withdrawal_deleted' : 'tank_out_deleted',
            transactionType: withdrawalRow.transaction_type,
            vehicleId: affectedVehicleId,
          });
          return { success: true };
        }
      } else if (data?.transaction_type === 'vehicle_refill') {
        if (await this.tableExists(this.vehicleFuelRefillsTable)) {
          const { data: vehicleRefillRow } = await supabase
            .from(this.vehicleFuelRefillsTable)
            .select('id, vehicle_id, liters, refill_date')
            .eq('refill_date', data.created_at)
            .eq('liters', data.liters)
            .eq('vehicle_id', data.vehicle_id)
            .maybeSingle();

          if (vehicleRefillRow?.id) {
            let { error } = await supabase
              .from(this.vehicleFuelRefillsTable)
              .delete()
              .eq('id', vehicleRefillRow.id);

            if (error) {
              return { success: false, error: error.message };
            }

            await supabase
              .from(this.fuelOperationLogsTable)
              .delete()
              .eq('id', dbId);

            if (vehicleRefillRow.vehicle_id) {
              await this.refreshVehicleFuelTracking(vehicleRefillRow.vehicle_id);
            }

            this.invalidateFuelCaches({
              entity: 'fuel_transaction',
              reason: 'vehicle_refill_deleted',
              transactionType: 'vehicle_refill',
              vehicleId: vehicleRefillRow.vehicle_id,
            });
            return { success: true };
          }
        }
      }

      tableName = this.fuelOperationLogsTable;
    } else if (type === 'tank_refill') {
      tableName = this.fuelRefillsTable;
      const { data } = await supabase
        .from(this.fuelRefillsTable)
        .select('id, liters_added, vehicle_id, refill_date')
        .eq('id', dbId)
        .maybeSingle();
      previousAmount = Number(data?.liters_added ?? 0);
      pairedLogMatch = data
        ? {
            transaction_type: 'tank_refill',
            source: 'tank_refill',
            vehicle_id: data.vehicle_id || null,
            liters: previousAmount,
            created_at: data.refill_date || null,
          }
        : null;
    } else if (type === 'vehicle_refill') {
      tableName = this.vehicleFuelRefillsTable;
      if (await this.tableExists(this.vehicleFuelRefillsTable)) {
        const { data } = await supabase
          .from(this.vehicleFuelRefillsTable)
          .select('id, vehicle_id, liters, refill_date')
          .eq('id', dbId)
          .maybeSingle();
        if (data?.id) {
          affectedVehicleId = data?.vehicle_id || null;
          tableName = this.vehicleFuelRefillsTable;
          previousAmount = Number(data?.liters ?? 0);
          pairedLogMatch = {
            transaction_type: 'vehicle_refill',
            source: 'direct_station',
            vehicle_id: data.vehicle_id || null,
            liters: previousAmount,
            created_at: data.refill_date || null,
          };
        }
      }

      if (!affectedVehicleId) {
        const { data } = await supabase
          .from(this.fuelRefillsTable)
          .select('id, vehicle_id, liters_added, refill_date')
          .eq('id', dbId)
          .maybeSingle();
        if (data?.id) {
          affectedVehicleId = data?.vehicle_id || null;
          tableName = this.fuelRefillsTable;
          previousAmount = Number(data?.liters_added ?? 0);
          pairedLogMatch = {
            transaction_type: 'vehicle_refill',
            source: 'direct_station',
            vehicle_id: data.vehicle_id || null,
            liters: previousAmount,
            created_at: data.refill_date || null,
          };
        }
      }
    } else if (type === 'withdrawal' || type === 'tank_out') {
      tableName = this.fuelWithdrawalsTable;
      const { data } = await supabase
        .from(this.fuelWithdrawalsTable)
        .select('id, liters_taken, vehicle_id, withdrawal_date, transaction_type, source')
        .eq('id', dbId)
        .maybeSingle();
      previousAmount = Number(data?.liters_taken ?? 0);
      affectedVehicleId = data?.vehicle_id || null;
      pairedLogMatch = data
        ? {
            transaction_type: data.transaction_type || type,
            source: data.source || (type === 'tank_out' ? 'tank_out' : 'tank_transfer'),
            vehicle_id: data.vehicle_id || null,
            liters: previousAmount,
            created_at: data.withdrawal_date || null,
          }
        : null;
    } else if (type === 'rental_opening_level' || type === 'rental_closing_level' || type === 'manual_adjustment') {
      tableName = this.fuelOperationLogsTable;
      const { data } = await supabase
        .from(this.fuelOperationLogsTable)
        .select('id, vehicle_id')
        .eq('id', dbId)
        .maybeSingle();
      affectedVehicleId = data?.vehicle_id || null;
    }

    if (!tableName) {
      return { success: false, error: `Invalid transaction type: ${type}` };
    }

    let { error } = await supabase
      .from(tableName)
      .delete()
      .eq('id', dbId);

    if (type === 'vehicle_refill' && error) {
      const fallbackDelete = await supabase
        .from(this.fuelRefillsTable)
        .delete()
        .eq('id', dbId);
      error = fallbackDelete.error;
    }

    if (error) {
      return { success: false, error: error.message };
    }

    if (idPrefix !== 'log' && pairedLogMatch?.created_at) {
      let logDeleteQuery = supabase
        .from(this.fuelOperationLogsTable)
        .delete()
        .eq('transaction_type', pairedLogMatch.transaction_type)
        .eq('source', pairedLogMatch.source)
        .eq('created_at', pairedLogMatch.created_at)
        .eq('liters', pairedLogMatch.liters);

      if (pairedLogMatch.vehicle_id) {
        logDeleteQuery = logDeleteQuery.eq('vehicle_id', pairedLogMatch.vehicle_id);
      } else {
        logDeleteQuery = logDeleteQuery.is('vehicle_id', null);
      }

      await logDeleteQuery;
    }

    if (type === 'tank_refill' && previousAmount > 0) {
      await this.adjustTankCurrentVolume(-previousAmount);
    }

    if ((type === 'withdrawal' || type === 'tank_out') && previousAmount > 0) {
      await this.adjustTankCurrentVolume(previousAmount);
    }

    if (affectedVehicleId && (type === 'vehicle_refill' || type === 'withdrawal' || type === 'rental_opening_level' || type === 'rental_closing_level' || type === 'manual_adjustment')) {
      await this.refreshVehicleFuelTracking(affectedVehicleId);
    }

    this.invalidateFuelCaches({
      entity: 'fuel_transaction',
      reason: `${type}_deleted`,
      transactionType: type,
      vehicleId: affectedVehicleId,
    });

    return { success: true };
  }

  async exportToCSV(filters = {}) {
    const result = await this.getAllTransactions({
      ...filters,
      limit: 10000,
      offset: 0,
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    const headers = [
      'Date',
      'Type',
      'Source',
      'Vehicle',
      'Plate Number',
      'Amount (L)',
      'Fuel Lines Before',
      'Fuel Lines After',
      'Cost (MAD)',
      'Fuel Station',
      'Location',
      'Performed By',
      'Financial Expense',
      'Notes',
    ];

    const rows = result.transactions.map((transaction) => [
      new Date(transaction.transaction_date).toLocaleDateString('en-US', {
        timeZone: 'Africa/Casablanca',
      }),
      this.getTransactionTypeLabel(transaction.transaction_type),
      transaction.source || '',
      transaction.saharax_0u4w4d_vehicles?.name || '—',
      transaction.saharax_0u4w4d_vehicles?.plate_number || '—',
      transaction.amount || '',
      transaction.fuel_lines_before ?? '',
      transaction.fuel_lines_after ?? '',
      transaction.cost || '',
      transaction.fuel_station || '',
      transaction.location || '',
      transaction.performed_by_name || '',
      transaction.is_financial_expense ? 'Yes' : 'No',
      transaction.notes || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((field) => `"${field ?? ''}"`).join(',')),
    ].join('\n');

    return {
      success: true,
      csvContent,
      filename: `fuel_transactions_${new Date().toISOString().slice(0, 10)}.csv`,
    };
  }

  async getVehicleFuelState(vehicleId) {
    const cachedState = Array.isArray(this.vehicleFuelStatesCache)
      ? this.vehicleFuelStatesCache.find((state) => String(state.id) === String(vehicleId) || String(state.vehicle_id) === String(vehicleId))
      : null;

    if (cachedState) {
      return cachedState;
    }

    try {
      const { data: directState, error: directError } = await this.runVehicleFuelStateReadQuery(
        () => supabase
          .from(this.vehicleFuelStateTable)
          .select('vehicle_id, current_fuel_liters, current_fuel_lines, max_fuel_lines, tank_capacity_liters, last_source, last_updated_at')
          .eq('vehicle_id', vehicleId)
          .maybeSingle(),
        'Workspace organization context is required to load vehicle fuel state.',
      );

      if (!directError && directState) {
        const resolvedTankCapacityLiters =
          resolveTankCapacityLiters(
            directState.tank_capacity_liters,
            DEFAULT_VEHICLE_TANK_LITERS,
          ) || DEFAULT_VEHICLE_TANK_LITERS;
        const normalized = normalizeFuelState({
          liters: directState.current_fuel_liters,
          lines: directState.current_fuel_lines,
          tankCapacityLiters: resolvedTankCapacityLiters,
          maxLines: directState.max_fuel_lines || DEFAULT_FUEL_LINES,
        });

        return {
          ...directState,
          id: vehicleId,
          current_fuel_liters: normalized.liters,
          current_fuel_lines: normalized.lines,
          max_fuel_lines: normalized.maxLines,
          tank_capacity_liters: resolvedTankCapacityLiters,
          last_fuel_source: directState.last_source || 'unknown',
          last_fuel_update_at: directState.last_updated_at || null,
        };
      }
    } catch (directLookupError) {
      // Fall back to the broader loaders below when the direct row lookup is unavailable.
    }

    const states = await this.getVehicleFuelStates();
    const matchedState = states.find((state) => String(state.id) === String(vehicleId) || String(state.vehicle_id) === String(vehicleId));

    if (matchedState) {
      return matchedState;
    }

    return matchedState || {
      vehicle_id: vehicleId,
      current_fuel_liters: 0,
      current_fuel_lines: 0,
      tank_capacity_liters: DEFAULT_VEHICLE_TANK_LITERS,
      max_fuel_lines: DEFAULT_FUEL_LINES,
    };
  }

  async recordRentalFuelSnapshot({
    rentalId,
    vehicleId,
    fuelLevel,
    stage,
    actor,
    notes,
  }) {
    const currentState = await this.getVehicleFuelState(vehicleId);
    const normalized = normalizeFuelState({ lines: fuelLevel });

    const syncResult = await this.syncVehicleFuelState({
      vehicleId,
      lines: fuelLevel,
      source: stage,
      rentalId,
      tankCapacityLiters: currentState.tank_capacity_liters,
    });

    await this.logFuelOperation({
      transaction_type: stage,
      source: stage,
      vehicle_id: vehicleId,
      rental_id: rentalId,
      liters_before: currentState.current_fuel_liters,
      liters_after: normalized.liters,
      fuel_lines_before: currentState.current_fuel_lines,
      fuel_lines_after: normalized.lines,
      actor,
      notes,
      is_financial_expense: false,
    });

    await this.getVehicleFuelUsageSummary(vehicleId, { persist: true });
    await this.syncRentalFuelSnapshot(rentalId);
    this.invalidateFuelCaches({
      entity: 'rental_fuel_snapshot',
      reason: stage,
      transactionType: stage,
      vehicleId,
      rentalId,
    });

    return {
      success: true,
      state: syncResult.state || normalized,
    };
  }

  async adjustVehicleFuelLevel({
    vehicleId,
    fuelLines = null,
    fuelLiters = null,
    actor = null,
    reason = '',
    notes = '',
    tankCapacityLiters = null,
  }) {
    if (!vehicleId) {
      return { success: false, error: 'Vehicle is required' };
    }

    const [hasFuelStateTable, hasFuelLogTable] = await Promise.all([
      this.refreshTableExists(this.vehicleFuelStateTable),
      this.refreshTableExists(this.fuelOperationLogsTable),
    ]);

    if (!hasFuelStateTable) {
      return {
        success: false,
        error: 'Vehicle fuel state table is not available. Please finish the SQL setup and refresh the page.',
      };
    }

    const currentState = await this.getVehicleFuelState(vehicleId);
    const resolvedTankCapacity = resolveTankCapacityLiters(
      tankCapacityLiters,
      currentState?.tank_capacity_liters,
      DEFAULT_VEHICLE_TANK_LITERS,
    );
    const normalized = normalizeFuelState({
      lines: fuelLines,
      liters: fuelLiters,
      tankCapacityLiters: resolvedTankCapacity,
    });

    const syncResult = await this.syncVehicleFuelState({
      vehicleId,
      lines: normalized.lines,
      liters: normalized.liters,
      source: 'manual_adjustment',
      tankCapacityLiters: resolvedTankCapacity,
    });

    if (!syncResult.success) {
      return syncResult;
    }

    if (syncResult.skipped) {
      return {
        success: false,
        error: 'Vehicle fuel state was not written. Please refresh and try again.',
      };
    }

    const composedNotes = [reason, notes]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join(' • ');

    let logResult = { success: true, skipped: true, log: null };
    let warning = null;

    if (hasFuelLogTable) {
      logResult = await this.logFuelOperation({
        transaction_type: 'manual_adjustment',
        source: 'manual_adjustment',
        vehicle_id: vehicleId,
        liters_before: currentState.current_fuel_liters,
        liters_after: normalized.liters,
        fuel_lines_before: currentState.current_fuel_lines,
        fuel_lines_after: normalized.lines,
        actor,
        notes: composedNotes || 'Manual fuel adjustment',
        is_financial_expense: false,
      });

      if (!logResult.success) {
        warning = logResult.error || 'Fuel activity log could not be written.';
      } else if (logResult.skipped) {
        warning = 'Fuel activity log was skipped, but the fuel level was updated successfully.';
      }
    } else {
      warning = 'Fuel activity log table is unavailable, but the fuel level was updated successfully.';
    }

    this.invalidateFuelCaches({
      entity: 'vehicle_fuel_state',
      reason: 'manual_adjustment',
      transactionType: 'manual_adjustment',
      vehicleId,
    });
    this.runBackgroundFuelTasks([
      this.getVehicleFuelUsageSummary(vehicleId, { persist: true }),
    ], 'manual fuel adjustment follow-up');

    return {
      success: true,
      state: syncResult.state || normalized,
      log: logResult.log || null,
      warning,
    };
  }

  subscribeToChanges(callback) {
    const channels = [];
    const tables = [
      this.fuelRefillsTable,
      this.vehicleFuelRefillsTable,
      this.fuelWithdrawalsTable,
      this.vehicleFuelStateTable,
      this.fuelOperationLogsTable,
    ];

    tables.forEach((tableName) => {
      const channel = supabase
        .channel(`${tableName}_changes`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: tableName },
          callback
        )
        .subscribe();
      channels.push(channel);
    });

    return () => {
      channels.forEach((channel) => supabase.removeChannel(channel));
    };
  }
}

export default new FuelTransactionService();
