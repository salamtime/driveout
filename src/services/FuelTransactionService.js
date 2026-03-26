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

const RENTALS_TABLE = 'app_4c3a7a6153_rentals';

class FuelTransactionService {
  constructor() {
    this.fuelTankTable = 'fuel_tank';
    this.fuelRefillsTable = 'fuel_refills';
    this.vehicleFuelRefillsTable = 'vehicle_fuel_refills';
    this.fuelWithdrawalsTable = 'fuel_withdrawals';
    this.vehicleFuelStateTable = 'vehicle_fuel_state';
    this.fuelOperationLogsTable = 'fuel_operation_logs';
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
        const { error } = await supabase.from(tableName).select('id').limit(1);
        const exists = !error;
        this.tableAvailabilityCache.set(tableName, exists);
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(storageKey, exists ? 'true' : 'false');
        }
        return exists;
      } catch (_error) {
        this.tableAvailabilityCache.set(tableName, false);
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(storageKey, 'false');
        }
        return false;
      } finally {
        this.tableAvailabilityPromiseCache.delete(tableName);
      }
    })();

    this.tableAvailabilityPromiseCache.set(tableName, probePromise);
    return probePromise;
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
        return 'Tank In';
      case 'vehicle_refill':
        return 'Direct Fill';
      case 'tank_out':
        return 'Tank Out';
      case 'withdrawal':
        return 'Transfer';
      case 'rental_opening_level':
        return 'Rental Opening Fuel';
      case 'rental_closing_level':
        return 'Rental Return Fuel';
      case 'manual_adjustment':
        return 'Manual Fuel Adjustment';
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
      allTablesExist: fuelTankExists && fuelRefillsExists && fuelWithdrawalsExists && vehiclesExists,
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

    const { data, error } = await supabase
      .from(this.fuelTankTable)
      .select('*')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

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

  async updateTankCurrentVolume(nextVolume) {
    if (!(await this.tableExists(this.fuelTankTable))) {
      return { success: false, error: 'Fuel tank table not available' };
    }

    const tank = await this.getFuelTankData();
    const tankRowId = tank?.id;
    if (!tankRowId) {
      return { success: false, error: 'Main tank row not found' };
    }

    const capacity = Number(tank.capacity || tank.capacity_liters || this.defaultTankSettings.capacity);
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

  async adjustTankCurrentVolume(deltaLiters) {
    const tank = await this.getFuelTankData();
    const current = Number(tank?.current_volume_liters || 0);
    return this.updateTankCurrentVolume(current + Number(deltaLiters || 0));
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
    const payload = {
      name: tankData.name || existingTank?.name || 'Main Tank',
      capacity_liters: Number(
        tankData.capacity_liters ??
        tankData.capacity ??
        existingTank?.capacity ??
        this.defaultTankSettings.capacity
      ) || this.defaultTankSettings.capacity,
      initial_volume: Number(tankData.initial_volume ?? existingTank?.initial_volume ?? 0) || 0,
      low_threshold_liters: Number(
        tankData.low_threshold_liters ??
        existingTank?.low_threshold_liters ??
        this.defaultTankSettings.low_threshold_liters
      ) || this.defaultTankSettings.low_threshold_liters,
      location: tankData.location || existingTank?.location || this.defaultTankSettings.location,
      fuel_type: tankData.fuel_type || existingTank?.fuel_type || this.defaultTankSettings.fuel_type,
      updated_at: new Date().toISOString(),
    };

    let data = null;
    let error = null;

    if (existingRow?.id) {
      const result = await supabase
        .from(this.fuelTankTable)
        .update(payload)
        .eq('id', existingRow.id)
        .select('*')
        .single();
      data = result.data;
      error = result.error;
    } else {
      const result = await supabase
        .from(this.fuelTankTable)
        .insert([{
          ...payload,
          created_at: new Date().toISOString(),
        }])
        .select('*')
        .single();
      data = result.data;
      error = result.error;
    }

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, tank: data };
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

  async getTankRefills() {
    if (!(await this.tableExists(this.fuelRefillsTable))) {
      return [];
    }

    const { data, error } = await supabase
      .from(this.fuelRefillsTable)
      .select('*')
      .is('vehicle_id', null)
      .order('refill_date', { ascending: false });

    if (error) {
      return [];
    }

    return (data || []).map((row) => ({
      ...row,
      transaction_type: 'tank_refill',
      source: row.source || 'tank_refill',
      receipt_media: this.normalizeReceiptMedia(row.receipt_media || row.invoice_image),
      performed_by_name: row.performed_by_name || row.refilled_by || row.filled_by || 'System',
      is_financial_expense: true,
    }));
  }

  async getVehicleRefills() {
    const results = [];

    if (await this.tableExists(this.vehicleFuelRefillsTable)) {
      const { data, error } = await supabase
        .from(this.vehicleFuelRefillsTable)
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
        .order('refill_date', { ascending: false });

      if (!error) {
        results.push(
          ...(data || []).map((row) => ({
            ...row,
            transaction_type: 'vehicle_refill',
            source: row.source || 'direct_station',
            receipt_media: this.normalizeReceiptMedia(row.receipt_media || row.invoice_image),
            performed_by_name: row.performed_by_name || row.refilled_by || row.filled_by || 'System',
            is_financial_expense: true,
          }))
        );
      }
    }

    // Legacy/live-db compatibility: many environments still store direct vehicle refills
    // in fuel_refills with vehicle_id populated instead of using vehicle_fuel_refills.
    if (await this.tableExists(this.fuelRefillsTable)) {
      const { data, error } = await supabase
        .from(this.fuelRefillsTable)
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
        .not('vehicle_id', 'is', null)
        .order('refill_date', { ascending: false });

      if (!error) {
        results.push(
          ...(data || []).map((row) => ({
            ...row,
            transaction_type: 'vehicle_refill',
            source: row.source || 'direct_station',
            receipt_media: this.normalizeReceiptMedia(row.receipt_media || row.invoice_image),
            performed_by_name: row.performed_by_name || row.refilled_by || row.filled_by || 'System',
            is_financial_expense: true,
          }))
        );
      }
    }

    const deduped = new Map();
    for (const row of results) {
      const key = String(row.id);
      if (!deduped.has(key)) {
        deduped.set(key, row);
      }
    }

    return Array.from(deduped.values()).sort(
      (a, b) => new Date(b.refill_date || b.transaction_date || b.created_at) - new Date(a.refill_date || a.transaction_date || a.created_at)
    );
  }

  async getAllWithdrawals() {
    if (!(await this.tableExists(this.fuelWithdrawalsTable))) {
      return [];
    }

    const { data, error } = await supabase
      .from(this.fuelWithdrawalsTable)
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
      .order('withdrawal_date', { ascending: false });

    if (error) {
      return [];
    }

    return (data || []).map((row) => ({
      ...row,
      transaction_type: row.transaction_type || 'withdrawal',
      source: row.source || 'tank_transfer',
      receipt_media: this.normalizeReceiptMedia(row.receipt_media || row.invoice_image),
      performed_by_name: row.performed_by_name || row.filled_by || 'System',
      is_financial_expense: false,
    }));
  }

  async getFuelOperationLogs() {
    if (!(await this.tableExists(this.fuelOperationLogsTable))) {
      return [];
    }

    const { data, error } = await supabase
      .from(this.fuelOperationLogsTable)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return [];
    }

    return data || [];
  }

  async logFuelOperation(logData = {}) {
    if (!(await this.tableExists(this.fuelOperationLogsTable))) {
      return { success: true, skipped: true };
    }

    const actor = this.buildActor(logData.actor || logData);
    const payload = {
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

    const { data, error } = await supabase
      .from(this.fuelOperationLogsTable)
      .insert([payload])
      .select('*')
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, log: data };
  }

  async getLatestRentalFuelSnapshots() {
    const rentalsTableExists = await this.tableExists(RENTALS_TABLE);
    if (!rentalsTableExists) {
      return new Map();
    }

    const { data, error } = await supabase
      .from(RENTALS_TABLE)
      .select('id, vehicle_id, start_fuel_level, end_fuel_level, updated_at, created_at, customer_name')
      .order('updated_at', { ascending: false })
      .limit(500);

    if (error) {
      return new Map();
    }

    const byVehicle = new Map();
    for (const rental of data || []) {
      if (!rental.vehicle_id || byVehicle.has(rental.vehicle_id)) {
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
      byVehicle.set(rental.vehicle_id, {
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

  async getDerivedVehicleFuelStateMap(rentalSnapshots = new Map()) {
    const [vehicleRefills, withdrawals] = await Promise.all([
      this.getVehicleRefills(),
      this.getAllWithdrawals(),
    ]);

    const derivedMap = new Map();
    const relevantTransactions = [...vehicleRefills, ...withdrawals];

    for (const transaction of relevantTransactions) {
      const vehicleId = transaction.vehicle_id;
      if (!vehicleId) {
        continue;
      }

      const rentalSnapshot = rentalSnapshots.get(vehicleId);
      const transactionTimestamp = this.getTransactionTimestamp(transaction);
      const baselineTimestamp = rentalSnapshot?.last_updated_at || null;

      if (
        baselineTimestamp &&
        transactionTimestamp &&
        new Date(transactionTimestamp).getTime() <= new Date(baselineTimestamp).getTime()
      ) {
        continue;
      }

      const currentDerived = derivedMap.get(vehicleId) || {
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

      derivedMap.set(vehicleId, {
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
    const [vehiclesResult, hasVehicleFuelStateTable, rentalSnapshots, vehicleModelsResult] = await Promise.all([
      supabase
        .from(this.vehiclesTable)
        .select('id, name, plate_number, model, vehicle_type, status, current_odometer, vehicle_model_id')
        .order('name'),
      this.tableExists(this.vehicleFuelStateTable),
      this.getLatestRentalFuelSnapshots(),
      supabase
        .from(this.vehicleModelsTable)
        .select('*'),
    ]);

    if (vehiclesResult.error) {
      return [];
    }

    let stateMap = new Map();
    const vehicleModelMap = new Map((vehicleModelsResult?.data || []).map((model) => [String(model.id), model]));
    if (hasVehicleFuelStateTable) {
      const { data } = await supabase
        .from(this.vehicleFuelStateTable)
        .select('*');
      stateMap = new Map((data || []).map((row) => [row.vehicle_id, row]));
    }

    const derivedStateMap = await this.getDerivedVehicleFuelStateMap(rentalSnapshots);

    return (vehiclesResult.data || []).map((vehicle) => {
      const storedState = stateMap.get(vehicle.id);
      const rentalState = rentalSnapshots.get(vehicle.id);
      const derivedState = derivedStateMap.get(vehicle.id);
      const rawState = storedState || derivedState || rentalState || {};
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

    const { data, error } = await supabase
      .from(this.vehicleFuelStateTable)
      .upsert(payload, { onConflict: 'vehicle_id' })
      .select('*')
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, state: data || payload };
  }

  async syncVehicleCurrentOdometer(vehicleId, odometerValue) {
    const normalizedValue = Number(odometerValue);
    if (!vehicleId || Number.isNaN(normalizedValue) || normalizedValue < 0) {
      return { success: true, skipped: true };
    }

    const { data, error } = await supabase
      .from(this.vehiclesTable)
      .update({ current_odometer: normalizedValue })
      .eq('id', vehicleId)
      .select('id, current_odometer')
      .maybeSingle();

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

  buildVehicleFuelUsageSummary(vehicleId, { vehicleRefills = [], withdrawals = [], logs = [] } = {}) {
    const scopedVehicleRefills = vehicleRefills.filter((refill) => String(refill.vehicle_id) === String(vehicleId));
    const scopedWithdrawals = withdrawals.filter((withdrawal) => String(withdrawal.vehicle_id) === String(vehicleId));
    const scopedLogs = logs
      .filter((log) => String(log.vehicle_id) === String(vehicleId))
      .sort((a, b) => new Date(a.created_at || a.transaction_date || 0) - new Date(b.created_at || b.transaction_date || 0));

    const averageUnitCost = this.calculateAverageFuelUnitCost(vehicleRefills);

    let totalFuelSuppliedLiters = 0;
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

    let totalFuelUsedLiters = 0;
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

    const rentalSnapshots = await this.getLatestRentalFuelSnapshots();
    const derivedStateMap = await this.getDerivedVehicleFuelStateMap(rentalSnapshots);
    const latestState = derivedStateMap.get(vehicleId) || rentalSnapshots.get(vehicleId) || {
      vehicle_id: vehicleId,
      current_fuel_liters: 0,
      current_fuel_lines: 0,
      last_source: 'history_rebuild',
      last_rental_id: null,
    };

    const syncResult = await this.syncVehicleFuelState({
      vehicleId,
      liters: latestState.current_fuel_liters,
      lines: latestState.current_fuel_lines,
      source: latestState.last_source || 'history_rebuild',
      rentalId: latestState.last_rental_id || null,
      tankCapacityLiters: latestState.tank_capacity_liters || null,
    });

    const summaryResult = await this.getVehicleFuelUsageSummary(vehicleId, { persist: true });

    return {
      success: true,
      state: syncResult.state || latestState,
      summary: summaryResult.summary || null,
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

  async getAllRefills() {
    const [tankRefills, vehicleRefills] = await Promise.all([
      this.getTankRefills(),
      this.getVehicleRefills(),
    ]);

    return [...tankRefills, ...vehicleRefills].sort(
      (a, b) => new Date(b.refill_date || b.transaction_date || b.created_at) - new Date(a.refill_date || a.transaction_date || a.created_at)
    );
  }

  mapTransactionRecord(transaction) {
    const vehicle = transaction.vehicle || transaction[this.vehiclesTable] || transaction.saharax_0u4w4d_vehicles || null;
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
    const linesBefore = transaction.fuel_lines_before ?? null;
    const linesAfter = transaction.fuel_lines_after ?? null;
    const litersBefore =
      transaction.liters_before ??
      (linesBefore !== null && linesBefore !== undefined ? linesToLiters(linesBefore) : null);
    const litersAfter =
      transaction.liters_after ??
      (linesAfter !== null && linesAfter !== undefined ? linesToLiters(linesAfter) : null);

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
      fuel_station: transaction.fuel_station || 'Main Tank',
      location: transaction.location || '',
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

    const [refills, withdrawals, operationLogs] = await Promise.all([
      this.getAllRefills(),
      this.getAllWithdrawals(),
      this.getFuelOperationLogs(),
    ]);

    const transactionMap = new Map();

    for (const refill of refills) {
      const mapped = this.mapTransactionRecord({
        ...refill,
        id: `refill-${refill.id}`,
      });
      transactionMap.set(mapped.id, mapped);
    }

    for (const withdrawal of withdrawals) {
      const mapped = this.mapTransactionRecord({
        ...withdrawal,
        id: `withdrawal-${withdrawal.id}`,
      });
      transactionMap.set(mapped.id, mapped);
    }

    for (const log of operationLogs) {
      const mapped = this.mapTransactionRecord({
        ...log,
        id: `log-${log.id}`,
      });
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

    return {
      success: true,
      transactions: paginatedTransactions,
      totalCount,
    };
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

    return 'Main Station';
  }

  async createTransaction(transactionData) {
    const actor = this.buildActor(transactionData.actor || transactionData);
    const receiptMedia = this.normalizeReceiptMedia(transactionData.receipt_media || transactionData.invoice_image);
    const transactionType = transactionData.transaction_type;
    const actionTimestamp = this.buildActionTimestamp(transactionData.transaction_date);
    const amount = Number(transactionData.amount || transactionData.liters) || 0;
    const unitPrice =
      transactionData.unit_price !== undefined && transactionData.unit_price !== null && transactionData.unit_price !== ''
        ? Number(transactionData.unit_price)
        : transactionData.cost && amount > 0
          ? Number(transactionData.cost) / amount
          : 0;
    const totalCost =
      transactionData.cost !== undefined && transactionData.cost !== null && transactionData.cost !== ''
        ? Number(transactionData.cost)
        : unitPrice > 0 && amount > 0
          ? roundTo(unitPrice * amount, 2)
          : 0;

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

      await this.logFuelOperation({
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
      });

      await this.adjustTankCurrentVolume(amount);

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
      const syncedState = await this.syncVehicleFuelState({
        vehicleId: transactionData.vehicle_id,
        liters: nextLiters,
        source: 'vehicle_refill',
        transactionId: data.id,
        tankCapacityLiters: currentState.tank_capacity_liters,
      });

      await this.logFuelOperation({
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
      });

      await this.syncVehicleCurrentOdometer(transactionData.vehicle_id, payload.odometer_reading);
      await this.getVehicleFuelUsageSummary(transactionData.vehicle_id, { persist: true });

      return { success: true, transaction: data };
    }

    if (transactionType === 'withdrawal' || transactionType === 'tank_out') {
      const mergedNotes = [transactionData.purpose, transactionData.notes]
        .filter(Boolean)
        .join(' • ') || null;
      const payload = {
        vehicle_id: transactionType === 'tank_out' ? null : transactionData.vehicle_id,
        liters_taken: amount,
        withdrawal_date: actionTimestamp,
        odometer_reading: transactionType === 'tank_out' ? null : (transactionData.odometer_reading ? parseInt(transactionData.odometer_reading, 10) : null),
        filled_by: actor.performed_by_name,
        notes: mergedNotes,
        transaction_type: transactionType,
      };

      const { data, error } = await supabase
        .from(this.fuelWithdrawalsTable)
        .insert([payload])
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

      if (error) {
        return { success: false, error: error.message };
      }

      if (transactionType === 'withdrawal') {
        await this.adjustTankCurrentVolume(-amount);

        const currentState = await this.getVehicleFuelState(transactionData.vehicle_id);
        const nextLiters = roundTo((currentState.current_fuel_liters || 0) + amount, 3);
        const syncedState = await this.syncVehicleFuelState({
          vehicleId: transactionData.vehicle_id,
          liters: nextLiters,
          source: 'withdrawal',
          transactionId: data.id,
          tankCapacityLiters: currentState.tank_capacity_liters,
        });

        await this.logFuelOperation({
          transaction_type: 'withdrawal',
          source: 'tank_transfer',
          vehicle_id: transactionData.vehicle_id,
          liters: amount,
          liters_before: currentState.current_fuel_liters,
          liters_after: syncedState.state?.current_fuel_liters ?? nextLiters,
          fuel_lines_before: currentState.current_fuel_lines,
          fuel_lines_after: syncedState.state?.current_fuel_lines,
          odometer_reading: payload.odometer_reading,
          actor,
          notes: payload.notes,
          is_financial_expense: false,
          created_at: actionTimestamp,
        });

        await this.syncVehicleCurrentOdometer(transactionData.vehicle_id, payload.odometer_reading);
        await this.getVehicleFuelUsageSummary(transactionData.vehicle_id, { persist: true });
      } else {
        await this.adjustTankCurrentVolume(-amount);

        await this.logFuelOperation({
          transaction_type: 'tank_out',
          source: 'tank_out',
          liters: amount,
          actor,
          notes: payload.notes,
          is_financial_expense: false,
          created_at: actionTimestamp,
        });
      }

      return { success: true, transaction: data };
    }

    return { success: false, error: 'Invalid transaction type' };
  }

  async updateTransaction(id, transactionData) {
    const receiptMedia = this.normalizeReceiptMedia(transactionData.receipt_media || transactionData.invoice_image);
    const actor = this.buildActor(transactionData.actor || transactionData);
    const transactionType = transactionData.transaction_type;
    const actionTimestamp = this.buildActionTimestamp(transactionData.transaction_date);
    const amount = Number(transactionData.amount || transactionData.liters) || 0;
    const unitPrice =
      transactionData.unit_price !== undefined && transactionData.unit_price !== null && transactionData.unit_price !== ''
        ? Number(transactionData.unit_price)
        : transactionData.cost && amount > 0
          ? Number(transactionData.cost) / amount
          : 0;
    const totalCost =
      transactionData.cost !== undefined && transactionData.cost !== null && transactionData.cost !== ''
        ? Number(transactionData.cost)
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

      await this.syncVehicleCurrentOdometer(transactionData.vehicle_id, payload.odometer_reading);
      await this.refreshVehicleFuelTracking(transactionData.vehicle_id);
      if (previousVehicleRefill?.vehicle_id && String(previousVehicleRefill.vehicle_id) !== String(transactionData.vehicle_id)) {
        await this.refreshVehicleFuelTracking(previousVehicleRefill.vehicle_id);
      }

      return { success: true, transaction: data };
    }

    if (transactionType === 'withdrawal' || transactionType === 'tank_out') {
      const { data: previousWithdrawal } = await supabase
        .from(this.fuelWithdrawalsTable)
        .select('id, liters_taken, vehicle_id')
        .eq('id', id)
        .maybeSingle();

      const mergedNotes = [transactionData.purpose, transactionData.notes]
        .filter(Boolean)
        .join(' • ') || null;
      const payload = {
        vehicle_id: transactionType === 'tank_out' ? null : transactionData.vehicle_id,
        liters_taken: amount,
        withdrawal_date: actionTimestamp,
        odometer_reading: transactionType === 'tank_out' ? null : (transactionData.odometer_reading ? parseInt(transactionData.odometer_reading, 10) : null),
        filled_by: actor.performed_by_name,
        notes: mergedNotes,
        transaction_type: transactionType,
      };

      const { data, error } = await supabase
        .from(this.fuelWithdrawalsTable)
        .update(payload)
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

      if (error) {
        return { success: false, error: error.message };
      }

      const previousAmount = Number(previousWithdrawal?.liters_taken || 0);
      await this.adjustTankCurrentVolume(-(amount - previousAmount));

      if (transactionType === 'withdrawal') {
        await this.syncVehicleCurrentOdometer(transactionData.vehicle_id, payload.odometer_reading);
        await this.refreshVehicleFuelTracking(transactionData.vehicle_id);
        if (previousWithdrawal?.vehicle_id && String(previousWithdrawal.vehicle_id) !== String(transactionData.vehicle_id)) {
          await this.refreshVehicleFuelTracking(previousWithdrawal.vehicle_id);
        }
      }

      return { success: true, transaction: data };
    }

    return { success: false, error: 'Invalid transaction type' };
  }

  async deleteTransaction(id, type) {
    const dbId = String(id).replace(/^(refill|withdrawal|log)-/, '');
    let tableName = null;
    let previousAmount = 0;
    let affectedVehicleId = null;

    if (type === 'tank_refill') {
      tableName = this.fuelRefillsTable;
      const { data } = await supabase
        .from(this.fuelRefillsTable)
        .select('id, liters_added')
        .eq('id', dbId)
        .maybeSingle();
      previousAmount = Number(data?.liters_added || 0);
    } else if (type === 'vehicle_refill') {
      tableName = this.vehicleFuelRefillsTable;
      if (await this.tableExists(this.vehicleFuelRefillsTable)) {
        const { data } = await supabase
          .from(this.vehicleFuelRefillsTable)
          .select('id, vehicle_id')
          .eq('id', dbId)
          .maybeSingle();
        affectedVehicleId = data?.vehicle_id || null;
      }

      if (!affectedVehicleId) {
        const { data } = await supabase
          .from(this.fuelRefillsTable)
          .select('id, vehicle_id')
          .eq('id', dbId)
          .maybeSingle();
        affectedVehicleId = data?.vehicle_id || null;
      }
    } else if (type === 'withdrawal' || type === 'tank_out') {
      tableName = this.fuelWithdrawalsTable;
      const { data } = await supabase
        .from(this.fuelWithdrawalsTable)
        .select('id, liters_taken, vehicle_id')
        .eq('id', dbId)
        .maybeSingle();
      previousAmount = Number(data?.liters_taken || 0);
      affectedVehicleId = data?.vehicle_id || null;
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

    if (type === 'tank_refill' && previousAmount > 0) {
      await this.adjustTankCurrentVolume(-previousAmount);
    }

    if ((type === 'withdrawal' || type === 'tank_out') && previousAmount > 0) {
      await this.adjustTankCurrentVolume(previousAmount);
    }

    if (affectedVehicleId && (type === 'vehicle_refill' || type === 'withdrawal' || type === 'rental_opening_level' || type === 'rental_closing_level' || type === 'manual_adjustment')) {
      await this.refreshVehicleFuelTracking(affectedVehicleId);
    }

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
    const states = await this.getVehicleFuelStates();
    return (
      states.find((state) => String(state.id) === String(vehicleId) || String(state.vehicle_id) === String(vehicleId)) || {
        vehicle_id: vehicleId,
        current_fuel_liters: 0,
        current_fuel_lines: 0,
        tank_capacity_liters: DEFAULT_VEHICLE_TANK_LITERS,
        max_fuel_lines: DEFAULT_FUEL_LINES,
      }
    );
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

    return {
      success: true,
      state: syncResult.state || normalized,
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
