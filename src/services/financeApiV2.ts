import { supabase } from '../lib/supabase';
import VehicleDispositionService from './VehicleDispositionService';
import { fetchTourBookings } from './tourBookingService';

const TOUR_BOOKING_MARKER = '[tour_booking]';

export interface Vehicle {
  id: string;
  make: string;
  model: string;
  plate_number: string;
  is_active: boolean;
  org_id: string;
  display_name?: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  org_id: string;
}

export interface FinanceFiltersV2 {
  startDate: string;
  endDate: string;
  vehicleIds: string[];
  customerIds: string[];
  orgId: string;
}

export interface KPIData {
  totalRevenue: number;
  totalExpenses: number;
  maintenanceCosts: number;
  fuelCosts: number;
  inventoryCosts: number;
  otherCosts: number;
  taxes: number;
  grossProfit: number;
  damageRecoveryRevenue: number;
  partsMarginRevenue: number;
  revenueChange: number;
  expensesChange: number;
  taxesChange: number;
  profitChange: number;
  currency: string;
  period: string;
}

export interface TrendData {
  date: string;
  revenue: number;
  expenses: number;
  maintenanceCosts: number;
  fuelCosts: number;
  inventoryCosts: number;
  taxes: number;
  grossRevenue: number;
  netRevenue: number;
}

export interface VehicleProfitData {
  vehicleId: string;
  vehicleName: string;
  make: string;
  model: string;
  plateNumber: string;
  revenue: number;
  maintenanceCosts: number;
  fuelCosts: number;
  inventoryCosts: number;
  otherCosts: number;
  totalCosts: number;
  profit: number;
  profitMargin: number;
}

export interface ARAgingData {
  customerId: string;
  customerName: string;
  current: number;
  days30: number;
  days60: number;
  days90: number;
  over90: number;
  totalOutstanding: number;
}

export interface RentalPLRow {
  id: string;
  rentalId: string;
  customer: string;
  vehicleDisplay: string;
  plateNumber: string;
  vehicleModel: string;
  revenue: number;
  maintenanceCosts: number;
  fuelCosts: number;
  inventoryCosts: number;
  otherCosts: number;
  totalCosts: number;
  taxes: number;
  grossProfit: number;
  profitPercent: number;
  closedAt: string;
  vehicleId: string;
  customerId: string;
  status: string;
  payment_status: string;
}

export interface VehicleFinanceData {
  lifetimeRevenue: number;
  lifetimeMaintenanceCosts: number;
  lifetimeFuelCosts: number;
  lifetimeInventoryCosts: number;
  lifetimeOtherCosts: number;
  lifetimeTotalCosts: number;
  grossProfit: number;
  utilizationPercent: number;
  events: VehicleFinanceEvent[];
  trendData: { date: string; netMargin: number }[];
}

export interface VehicleFinanceEvent {
  date: string;
  eventType: string;
  source: string;
  revenue: number;
  maintenanceCost: number;
  fuelCost: number;
  inventoryCost: number;
  otherCost: number;
  tax: number;
  net: number;
}

export interface CustomerAnalysisRow {
  customerId: string;
  customerName: string;
  rentals: number;
  revenue: number;
  discounts: number;
  refunds: number;
  net: number;
  lastActivity: string;
}

export interface ExportData {
  filename: string;
  data: any[];
  headers: string[];
}

export interface CustomerAnalysisExportRow {
  Customer: string;
  Rentals: number;
  Revenue: number;
  Discounts: number;
  Refunds: number;
  Net: number;
  'Last Activity': string;
}

export interface FinanceBreakdownRow {
  id: string;
  title: string;
  subtitle?: string;
  amount: number;
  date?: string | null;
  sourceType?: string;
  status?: string;
  vehicleId?: string;
  rentalId?: string;
  maintenanceId?: string;
  href?: string;
  meta?: Record<string, any>;
}

export interface FinanceBreakdownData {
  type: string;
  title: string;
  total: number;
  period: string;
  rows: FinanceBreakdownRow[];
}

export const formatCurrency = (amount: number, currency: string = 'MAD'): string => {
  return (
    new Intl.NumberFormat('en-US', {
      style: 'decimal',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount) + ` ${currency}`
  );
};

export const formatPercentage = (value: number): string => `${value.toFixed(1)}%`;

export const handleApiError = (error: any, context: string = 'API call'): never => {
  console.error(`❌ ${context} failed:`, error);
  if (error.message?.includes('JWT')) {
    throw new Error('Authentication required. Please log in again.');
  }
  if (error.message?.includes('RLS')) {
    throw new Error('Access denied. Check your permissions.');
  }
  if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
    throw new Error('Database table not found. Please check your setup.');
  }
  throw new Error(error.message || 'An unexpected error occurred.');
};

type FinanceContext = {
  rentals: any[];
  tours: any[];
  vehicles: Vehicle[];
  vehicleMap: Map<string, any>;
  maintenanceFinance: any[];
  maintenanceByRentalId: Map<string, any>;
  fuelRefills: any[];
  fuelWithdrawals: any[];
  averageTankUnitCost: number;
};

class FinanceApiServiceV2 {
  private tableExistenceCache: Map<string, boolean> = new Map();
  private financeContextPromise: Promise<FinanceContext> | null = null;
  private financeContextLoadedAt = 0;

  private async checkTableExists(tableName: string): Promise<boolean> {
    if (this.tableExistenceCache.has(tableName)) {
      return this.tableExistenceCache.get(tableName)!;
    }

    try {
      const { error } = await supabase.from(tableName).select('*', { count: 'exact', head: true });
      const exists = !error;
      this.tableExistenceCache.set(tableName, exists);
      return exists;
    } catch (error) {
      this.tableExistenceCache.set(tableName, false);
      return false;
    }
  }

  private toNumber(value: any): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private normalizeDate(value: any): string | null {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().split('T')[0];
  }

  private parseLinkedRentalId(value: any): string | null {
    if (!value) return null;
    const match = String(value).match(/RNT-[A-Z0-9-]+/i);
    return match ? match[0].toUpperCase() : null;
  }

  private parseTourBookingMeta(rawNotes: any) {
    const notes = typeof rawNotes === 'string' ? rawNotes : '';
    const markerIndex = notes.indexOf(TOUR_BOOKING_MARKER);
    if (markerIndex === -1) return null;

    try {
      return JSON.parse(notes.slice(markerIndex + TOUR_BOOKING_MARKER.length).trim());
    } catch (error) {
      console.warn('Unable to parse tour booking metadata:', error);
      return null;
    }
  }

  private parseFinanceSnapshot(rawNotes: any) {
    const notes = typeof rawNotes === 'string' ? rawNotes : '';
    const marker = '[finance_snapshot]';
    const markerIndex = notes.indexOf(marker);
    if (markerIndex === -1) return null;

    try {
      return JSON.parse(notes.slice(markerIndex + marker.length).trim());
    } catch (error) {
      console.warn('Unable to parse finance snapshot from maintenance part notes:', error);
      return null;
    }
  }

  private isDateInRange(value: any, startDate: string, endDate: string): boolean {
    const normalized = this.normalizeDate(value);
    return Boolean(normalized && normalized >= startDate && normalized <= endDate);
  }

  private shiftDateRange(filters: FinanceFiltersV2): FinanceFiltersV2 {
    const start = new Date(filters.startDate);
    const end = new Date(filters.endDate);
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    const previousEnd = new Date(start);
    previousEnd.setDate(previousEnd.getDate() - 1);
    const previousStart = new Date(previousEnd);
    previousStart.setDate(previousStart.getDate() - (days - 1));

    return {
      ...filters,
      startDate: previousStart.toISOString().split('T')[0],
      endDate: previousEnd.toISOString().split('T')[0]
    };
  }

  private calculateChange(currentValue: number, previousValue: number): number {
    if (!previousValue) {
      return currentValue ? 100 : 0;
    }
    return Math.round(((currentValue - previousValue) / previousValue) * 1000) / 10;
  }

  private async safeLoadTable(tableName: string, columns: string = '*'): Promise<any[]> {
    const exists = await this.checkTableExists(tableName);
    if (!exists) return [];

    try {
      const { data, error } = await supabase.from(tableName).select(columns);
      if (error) {
        console.warn(`Unable to load ${tableName}:`, error.message);
        return [];
      }
      return data || [];
    } catch (error) {
      console.warn(`Unable to load ${tableName}:`, error);
      return [];
    }
  }

  private async getFinanceContext(): Promise<FinanceContext> {
    const cacheAge = Date.now() - this.financeContextLoadedAt;
    if (this.financeContextPromise && cacheAge < 30_000) {
      return this.financeContextPromise;
    }

    this.financeContextPromise = (async () => {
      const [
        rawRentals,
        rawVehicles,
        maintenance,
        maintenanceParts,
        inventoryItems,
        fuelRefills,
        fuelWithdrawals,
        rawTourBookings
      ] = await Promise.all([
        this.safeLoadTable('app_4c3a7a6153_rentals'),
        this.safeLoadTable('saharax_0u4w4d_vehicles'),
        this.safeLoadTable('app_687f658e98_maintenance'),
        this.safeLoadTable('app_687f658e98_maintenance_parts'),
        this.safeLoadTable('saharax_0u4w4d_inventory_items'),
        this.safeLoadTable('fuel_refills'),
        this.safeLoadTable('fuel_withdrawals'),
        fetchTourBookings().catch(() => [])
      ]);

      const vehicles: Vehicle[] = rawVehicles.map((vehicle: any, index: number) => {
        const plateNumber =
          vehicle.plate_number ||
          vehicle.plate ||
          vehicle.license_plate ||
          vehicle.registration_number ||
          vehicle.vehicle_number ||
          `PLATE-${index + 1}`;
        const make = vehicle.make || vehicle.brand || 'SEGWAY';
        const model = vehicle.model || vehicle.type || 'AT6';

        return {
          ...vehicle,
          id: String(vehicle.id),
          make,
          model,
          plate_number: plateNumber,
          display_name: `${plateNumber} - ${make} ${model}`,
          is_active: vehicle.is_active !== false,
          org_id: vehicle.org_id || 'default'
        };
      });

      const vehicleMap = new Map<string, any>(vehicles.map((vehicle) => [String(vehicle.id), vehicle]));
      const inventoryItemMap = new Map<string, any>(inventoryItems.map((item: any) => [String(item.id), item]));
      const maintenancePartsByMaintenanceId = new Map<string, any[]>();

      maintenanceParts.forEach((part: any) => {
        const key = String(part.maintenance_id || '');
        if (!key) return;
        if (!maintenancePartsByMaintenanceId.has(key)) {
          maintenancePartsByMaintenanceId.set(key, []);
        }
        maintenancePartsByMaintenanceId.get(key)!.push(part);
      });

      const maintenanceFinance = maintenance.map((record: any) => {
        const parts = maintenancePartsByMaintenanceId.get(String(record.id)) || [];
        const partsCostFromLines = parts.reduce((sum, part) => {
          return sum + (this.toNumber(part.unit_cost_mad) * this.toNumber(part.quantity || 1));
        }, 0);
        const partsSellTotal = parts.reduce((sum, part) => {
          const financeSnapshot = this.parseFinanceSnapshot(part.notes);
          const inventoryItem = inventoryItemMap.get(String(part.item_id || ''));
          const unitPrice =
            this.toNumber(financeSnapshot?.unit_price_mad) ||
            this.toNumber(inventoryItem?.price_mad) ||
            this.toNumber(part.unit_cost_mad);
          return sum + (unitPrice * this.toNumber(part.quantity || 1));
        }, 0);

        const inventoryCost = Math.max(this.toNumber(record.parts_cost_mad), partsCostFromLines);
        const tax = this.toNumber(record.tax_mad);
        const totalCost =
          this.toNumber(record.cost) ||
          (inventoryCost +
            this.toNumber(record.labor_rate_mad) +
            this.toNumber(record.external_cost_mad) +
            tax);
        const maintenanceCost = Math.max(0, totalCost - inventoryCost - tax);
        const partsMargin = Math.max(0, partsSellTotal - inventoryCost);
        const linkedRentalId = this.parseLinkedRentalId(record.description);

        return {
          id: String(record.id),
          vehicleId: String(record.vehicle_id || ''),
          date:
            this.normalizeDate(record.service_date) ||
            this.normalizeDate(record.completed_date) ||
            this.normalizeDate(record.created_at),
          linkedRentalId,
          maintenanceCost,
          inventoryCost,
          tax,
          totalCost,
          partsMargin,
          billedRevenue: linkedRentalId ? totalCost + partsMargin : 0,
          description: record.description || '',
          status: record.status || 'scheduled'
        };
      });

      const maintenanceByRentalId = new Map<string, any>();
      maintenanceFinance.forEach((record) => {
        if (!record.linkedRentalId) return;
        const existing = maintenanceByRentalId.get(record.linkedRentalId) || {
          revenue: 0,
          maintenanceCost: 0,
          inventoryCost: 0,
          tax: 0,
          partsMargin: 0
        };
        existing.revenue += record.billedRevenue;
        existing.maintenanceCost += record.maintenanceCost;
        existing.inventoryCost += record.inventoryCost;
        existing.tax += record.tax;
        existing.partsMargin += record.partsMargin;
        maintenanceByRentalId.set(record.linkedRentalId, existing);
      });

      const averageTankUnitCost = (() => {
        const values = fuelRefills
          .filter((row: any) => !row.vehicle_id)
          .map((row: any) => {
            const liters = this.toNumber(row.liters_added);
            if (!liters) return 0;
            return (
              this.toNumber(row.total_cost) / liters ||
              this.toNumber(row.unit_price || row.cost_per_liter)
            );
          })
          .filter((value: number) => value > 0);

        if (!values.length) return 0;
        return values.reduce((sum: number, value: number) => sum + value, 0) / values.length;
      })();

      const rentals = rawRentals
        .filter((rental: any) => !this.parseTourBookingMeta(rental.notes))
        .map((rental: any) => {
        const rentalId = String(rental.rental_id || rental.linked_display_id || rental.id);
        const customerName =
          rental.customer_name ||
          rental.name ||
          rental.client_name ||
          rental.user_name ||
          'Unknown Customer';
        const customerId = String(
          rental.customer_id ||
          rental.customer_email ||
          customerName ||
          rental.id
        );
        const linkedMaintenance = maintenanceByRentalId.get(rentalId) || {
          revenue: 0,
          maintenanceCost: 0,
          inventoryCost: 0,
          tax: 0,
          partsMargin: 0
        };

        return {
          raw: rental,
          id: String(rental.id),
          rentalId,
          customerName,
          customerId,
          vehicleId: String(rental.vehicle_id || ''),
          status: rental.rental_status || rental.status || 'scheduled',
          paymentStatus: rental.payment_status || 'unpaid',
          revenue: this.toNumber(rental.total_amount),
          remainingAmount: this.toNumber(rental.remaining_amount),
          refundAmount: rental.payment_status === 'refunded' ? this.toNumber(rental.total_amount) : 0,
          linkedMaintenanceRevenue: linkedMaintenance.revenue,
          linkedMaintenanceCosts: linkedMaintenance.maintenanceCost,
          linkedInventoryCosts: linkedMaintenance.inventoryCost,
          linkedMaintenanceTaxes: linkedMaintenance.tax,
          linkedPartsMargin: linkedMaintenance.partsMargin,
          startAt: rental.rental_start_date || rental.created_at,
          endAt:
            rental.actual_end_date ||
            rental.rental_end_date ||
            rental.completed_at ||
            rental.updated_at ||
            rental.created_at,
          closedAt:
            rental.completed_at ||
            rental.rental_completed_at ||
            rental.actual_end_date ||
            rental.rental_end_date ||
            rental.created_at
        };
      });

      const tours = (Array.isArray(rawTourBookings) ? rawTourBookings : [])
        .map((row: any) => {
          const meta = this.parseTourBookingMeta(row.notes);
          if (!meta?.groupId) return null;

          const customerName =
            row.customer_name ||
            meta.customerName ||
            meta.primaryDrivers?.[0]?.fullName ||
            meta.packageName ||
            'Tour Guest';
          const customerId = String(
            meta.primaryDrivers?.[0]?.whatsapp ||
            row.phone ||
            row.customer_email ||
            customerName
          );

          return {
            raw: row,
            id: String(row.id),
            rentalId: String(meta.groupId),
            groupId: String(meta.groupId),
            customerName,
            customerId,
            vehicleId: String(row.vehicle_id || ''),
            status: row.rental_status || 'scheduled',
            paymentStatus: row.payment_status || 'unpaid',
            revenue: this.toNumber(row.total_amount),
            remainingAmount: this.toNumber(row.remaining_amount),
            refundAmount: row.payment_status === 'refunded' ? this.toNumber(row.total_amount) : 0,
            startAt: meta.scheduledStartAt || row.rental_start_date || row.created_at,
            endAt: meta.scheduledEndAt || row.rental_end_date || row.updated_at || row.created_at,
            closedAt:
              meta.completedAt ||
              meta.scheduledEndAt ||
              row.updated_at ||
              row.created_at,
            guideName: meta.guideName || '',
            packageName: meta.packageName || 'Tour package',
            routeType: meta.routeType || 'tour'
          };
        })
        .filter(Boolean);

      this.financeContextLoadedAt = Date.now();

      return {
        rentals,
        tours,
        vehicles,
        vehicleMap,
        maintenanceFinance,
        maintenanceByRentalId,
        fuelRefills,
        fuelWithdrawals,
        averageTankUnitCost
      };
    })();

    return this.financeContextPromise;
  }

  private getVehicleLabel(vehicle: any) {
    if (!vehicle) {
      return {
        plateNumber: 'N/A',
        vehicleModel: 'Unknown Model',
        vehicleDisplay: 'Unknown Vehicle'
      };
    }

    const plateNumber = vehicle.plate_number || 'N/A';
    const make = vehicle.make || 'SEGWAY';
    const model = vehicle.model || 'AT6';
    return {
      plateNumber,
      vehicleModel: `${make} ${model}`,
      vehicleDisplay: plateNumber
    };
  }

  private buildVehicleDisplay(vehicleId: string, context: FinanceContext) {
    const labels = this.getVehicleLabel(context.vehicleMap.get(String(vehicleId)));
    return `${labels.plateNumber} • ${labels.vehicleModel}`;
  }

  private rentalMatchesFilters(rental: any, filters: FinanceFiltersV2, lifetime = false) {
    if (!lifetime && !this.isDateInRange(rental.closedAt, filters.startDate, filters.endDate)) {
      return false;
    }
    if (filters.vehicleIds?.length > 0 && !filters.vehicleIds.map(String).includes(String(rental.vehicleId))) {
      return false;
    }
    if (filters.customerIds?.length > 0 && !filters.customerIds.map(String).includes(String(rental.customerId))) {
      return false;
    }
    return true;
  }

  private maintenanceMatchesFilters(record: any, filters: FinanceFiltersV2, lifetime = false) {
    if (!lifetime && !this.isDateInRange(record.date, filters.startDate, filters.endDate)) {
      return false;
    }
    if (filters.vehicleIds?.length > 0 && !filters.vehicleIds.map(String).includes(String(record.vehicleId))) {
      return false;
    }
    return true;
  }

  private getFuelCostForVehicleInRange(context: FinanceContext, vehicleId: string, startDate: any, endDate: any) {
    const normalizedStart = this.normalizeDate(startDate);
    const normalizedEnd = this.normalizeDate(endDate);
    if (!vehicleId || !normalizedStart || !normalizedEnd) return 0;

    const directRefillCost = context.fuelRefills.reduce((sum: number, row: any) => {
      if (String(row.vehicle_id || '') !== String(vehicleId)) return sum;
      if (!this.isDateInRange(row.refill_date || row.created_at, normalizedStart, normalizedEnd)) return sum;
      const liters = this.toNumber(row.liters_added);
      const amount =
        this.toNumber(row.total_cost) ||
        (this.toNumber(row.unit_price || row.cost_per_liter) * liters) ||
        (context.averageTankUnitCost * liters);
      return sum + amount;
    }, 0);

    const transferCost = context.fuelWithdrawals.reduce((sum: number, row: any) => {
      if (String(row.vehicle_id || '') !== String(vehicleId)) return sum;
      if (!this.isDateInRange(row.withdrawal_date || row.created_at, normalizedStart, normalizedEnd)) return sum;
      return sum + (this.toNumber(row.liters_taken) * context.averageTankUnitCost);
    }, 0);

    return Math.round(directRefillCost + transferCost);
  }

  private getCompanyFuelExpenseInRange(context: FinanceContext, filters: FinanceFiltersV2) {
    const tankRefillExpense = context.fuelRefills.reduce((sum: number, row: any) => {
      if (row.vehicle_id) return sum;
      if (!this.isDateInRange(row.refill_date || row.created_at, filters.startDate, filters.endDate)) {
        return sum;
      }
      const liters = this.toNumber(row.liters_added);
      return sum + (
        this.toNumber(row.total_cost) ||
        (this.toNumber(row.unit_price || row.cost_per_liter) * liters)
      );
    }, 0);

    if (tankRefillExpense > 0 && filters.vehicleIds.length === 0 && filters.customerIds.length === 0) {
      return Math.round(tankRefillExpense);
    }

    const relevantVehicleIds =
      filters.vehicleIds.length > 0
        ? filters.vehicleIds.map(String)
        : Array.from(
            new Set(
              context.rentals
                .filter((rental) => this.rentalMatchesFilters(rental, filters))
                .map((rental) => String(rental.vehicleId))
                .filter(Boolean)
            )
          );

    return Math.round(
      relevantVehicleIds.reduce((sum: number, vehicleId: string) => {
        return sum + this.getFuelCostForVehicleInRange(context, vehicleId, filters.startDate, filters.endDate);
      }, 0)
    );
  }

  async getMaintenanceCosts(vehicleId: string, startDate: string, endDate: string): Promise<number> {
    const context = await this.getFinanceContext();
    return Math.round(
      context.maintenanceFinance
        .filter((record) => String(record.vehicleId) === String(vehicleId))
        .filter((record) => this.isDateInRange(record.date, startDate, endDate))
        .reduce((sum: number, record) => sum + record.maintenanceCost, 0)
    );
  }

  async getFuelCosts(vehicleId: string, startDate: string, endDate: string): Promise<number> {
    const context = await this.getFinanceContext();
    return this.getFuelCostForVehicleInRange(context, String(vehicleId), startDate, endDate);
  }

  async getInventoryCosts(vehicleId: string, startDate: string, endDate: string): Promise<number> {
    const context = await this.getFinanceContext();
    return Math.round(
      context.maintenanceFinance
        .filter((record) => String(record.vehicleId) === String(vehicleId))
        .filter((record) => this.isDateInRange(record.date, startDate, endDate))
        .reduce((sum: number, record) => sum + record.inventoryCost, 0)
    );
  }

  async getVehicleCostsBreakdown(vehicleId: string, startDate: string, endDate: string) {
    const [maintenanceCosts, fuelCosts, inventoryCosts] = await Promise.all([
      this.getMaintenanceCosts(vehicleId, startDate, endDate),
      this.getFuelCosts(vehicleId, startDate, endDate),
      this.getInventoryCosts(vehicleId, startDate, endDate)
    ]);

    return {
      maintenanceCosts,
      fuelCosts,
      inventoryCosts,
      otherCosts: 0,
      totalCosts: maintenanceCosts + fuelCosts + inventoryCosts
    };
  }

  private async getRentalRows(filters: FinanceFiltersV2): Promise<RentalPLRow[]> {
    const context = await this.getFinanceContext();

    return context.rentals
      .filter((rental) => this.rentalMatchesFilters(rental, filters))
      .map((rental) => {
        const labels = this.getVehicleLabel(context.vehicleMap.get(String(rental.vehicleId)));
        const fuelCosts = this.getFuelCostForVehicleInRange(context, rental.vehicleId, rental.startAt, rental.endAt);
        const revenue = Math.round(rental.revenue + rental.linkedMaintenanceRevenue);
        const maintenanceCosts = Math.round(rental.linkedMaintenanceCosts);
        const inventoryCosts = Math.round(rental.linkedInventoryCosts);
        const taxes = Math.round(rental.linkedMaintenanceTaxes);
        const totalCosts = maintenanceCosts + fuelCosts + inventoryCosts;
        const grossProfit = revenue - totalCosts - taxes;

        return {
          id: rental.id,
          rentalId: rental.rentalId,
          customer: rental.customerName,
          vehicleDisplay: labels.vehicleDisplay,
          plateNumber: labels.plateNumber,
          vehicleModel: labels.vehicleModel,
          revenue,
          maintenanceCosts,
          fuelCosts,
          inventoryCosts,
          otherCosts: 0,
          totalCosts,
          taxes,
          grossProfit: Math.round(grossProfit),
          profitPercent: revenue > 0 ? Math.round((grossProfit / revenue) * 1000) / 10 : 0,
          closedAt: rental.closedAt,
          vehicleId: rental.vehicleId,
          customerId: rental.customerId,
          status: rental.status,
          payment_status: rental.paymentStatus
        };
      });
  }

  async getRentalPLData(
    filters: FinanceFiltersV2,
    page: number = 1,
    pageSize: number = 50,
    sortBy: string = 'closedAt',
    sortOrder: 'asc' | 'desc' = 'desc',
    searchTerm?: string
  ): Promise<{ data: RentalPLRow[]; total: number; pages: number }> {
    try {
      let rows = await this.getRentalRows(filters);

      if (searchTerm?.trim()) {
        const query = searchTerm.trim().toLowerCase();
        rows = rows.filter((row) =>
          [row.rentalId, row.customer, row.plateNumber, row.vehicleModel, row.vehicleDisplay]
            .some((value) => String(value || '').toLowerCase().includes(query))
        );
      }

      rows.sort((a: any, b: any) => {
        const aValue = a[sortBy as keyof RentalPLRow];
        const bValue = b[sortBy as keyof RentalPLRow];
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
        }
        return sortOrder === 'asc'
          ? String(aValue || '').localeCompare(String(bValue || ''))
          : String(bValue || '').localeCompare(String(aValue || ''));
      });

      const total = rows.length;
      const pages = total > 0 ? Math.ceil(total / pageSize) : 0;
      const startIndex = (page - 1) * pageSize;
      return {
        data: rows.slice(startIndex, startIndex + pageSize),
        total,
        pages
      };
    } catch (error) {
      console.error('❌ Rental P&L load failed:', error);
      return { data: [], total: 0, pages: 0 };
    }
  }

  async getVehiclesEmergency(): Promise<Vehicle[]> {
    const context = await this.getFinanceContext();
    return context.vehicles;
  }

  async getRentalRevenue(filters: FinanceFiltersV2): Promise<number> {
    const context = await this.getFinanceContext();
    const rentalRows = await this.getRentalRows(filters);
    const tourRevenue = context.tours
      .filter((tour) => this.rentalMatchesFilters(tour, filters))
      .reduce((sum, tour) => sum + this.toNumber(tour.revenue), 0);
    return rentalRows.reduce((sum, row) => sum + row.revenue, 0) + tourRevenue;
  }

  async getVehicles(orgId: string = 'current'): Promise<Vehicle[]> {
    const context = await this.getFinanceContext();
    return context.vehicles;
  }

  async getCustomers(orgId: string = 'current'): Promise<Customer[]> {
    const context = await this.getFinanceContext();
    const grouped = new Map<string, Customer>();

    context.rentals.forEach((rental) => {
      if (!grouped.has(String(rental.customerId))) {
        grouped.set(String(rental.customerId), {
          id: String(rental.customerId),
          name: rental.customerName,
          email: rental.raw.customer_email || '',
          org_id: 'default'
        });
      }
    });

    context.tours.forEach((tour) => {
      if (!grouped.has(String(tour.customerId))) {
        grouped.set(String(tour.customerId), {
          id: String(tour.customerId),
          name: tour.customerName,
          email: tour.raw.customer_email || '',
          org_id: 'default'
        });
      }
    });

    return Array.from(grouped.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  private getDispositionRecords(filters: FinanceFiltersV2) {
    return VehicleDispositionService.listDispositions().filter((record) => {
      if (!this.isDateInRange(record.event_date || record.updated_at, filters.startDate, filters.endDate)) {
        return false;
      }
      if (filters.vehicleIds.length > 0 && !filters.vehicleIds.map(String).includes(String(record.vehicle_id))) {
        return false;
      }
      return true;
    });
  }

  private async getPeriodMetrics(filters: FinanceFiltersV2) {
    const context = await this.getFinanceContext();
    const rentalRows = await this.getRentalRows(filters);
    const tourRows = context.tours.filter((tour) => this.rentalMatchesFilters(tour, filters));
    const maintenanceRows = context.maintenanceFinance.filter((record) => this.maintenanceMatchesFilters(record, filters));
    const dispositionRecords = this.getDispositionRecords(filters);
    const totalRevenue = rentalRows.reduce((sum, row) => sum + row.revenue, 0)
      + tourRows.reduce((sum, row) => sum + this.toNumber(row.revenue), 0);
    const maintenanceCosts = maintenanceRows.reduce((sum: number, row: any) => sum + row.maintenanceCost, 0);
    const inventoryCosts = maintenanceRows.reduce((sum: number, row: any) => sum + row.inventoryCost, 0);
    const taxes = maintenanceRows.reduce((sum: number, row: any) => sum + row.tax, 0);
    const fuelCosts = this.getCompanyFuelExpenseInRange(context, filters);
    const purchaseCosts = context.vehicles.reduce((sum: number, vehicle: any) => {
      if (filters.vehicleIds.length > 0 && !filters.vehicleIds.map(String).includes(String(vehicle.id))) {
        return sum;
      }
      if (!this.isDateInRange(vehicle.purchase_date, filters.startDate, filters.endDate)) {
        return sum;
      }
      return sum + this.toNumber(vehicle.purchase_cost_mad);
    }, 0);
    const disposalLosses = dispositionRecords.reduce((sum: number, record: any) => {
      return sum + (record.event_type === 'disposed' ? this.toNumber(record.sale_price_mad) : 0);
    }, 0);
    const dispositionRevenue = dispositionRecords.reduce((sum: number, record: any) => {
      return sum + (record.event_type === 'sold' ? this.toNumber(record.sale_price_mad) : 0);
    }, 0);
    const damageRecoveryRevenue = maintenanceRows.reduce((sum: number, row: any) => sum + row.billedRevenue, 0);
    const partsMarginRevenue = maintenanceRows.reduce((sum: number, row: any) => sum + row.partsMargin, 0);
    const totalExpenses = maintenanceCosts + inventoryCosts + fuelCosts + purchaseCosts + disposalLosses;
    return {
      totalRevenue: Math.round(totalRevenue + dispositionRevenue),
      totalExpenses: Math.round(totalExpenses),
      maintenanceCosts: Math.round(maintenanceCosts),
      fuelCosts: Math.round(fuelCosts),
      inventoryCosts: Math.round(inventoryCosts),
      otherCosts: Math.round(purchaseCosts + disposalLosses),
      taxes: Math.round(taxes),
      grossProfit: Math.round(totalRevenue + dispositionRevenue - totalExpenses - taxes),
      damageRecoveryRevenue: Math.round(damageRecoveryRevenue),
      partsMarginRevenue: Math.round(partsMarginRevenue)
    };
  }

  async getKPIData(filters: FinanceFiltersV2): Promise<KPIData> {
    const [current, previous] = await Promise.all([
      this.getPeriodMetrics(filters),
      this.getPeriodMetrics(this.shiftDateRange(filters))
    ]);

    return {
      ...current,
      revenueChange: this.calculateChange(current.totalRevenue, previous.totalRevenue),
      expensesChange: this.calculateChange(current.totalExpenses, previous.totalExpenses),
      taxesChange: this.calculateChange(current.taxes, previous.taxes),
      profitChange: this.calculateChange(current.grossProfit, previous.grossProfit),
      currency: 'MAD',
      period: `${filters.startDate} – ${filters.endDate}`
    };
  }

  async getTrendData(filters: FinanceFiltersV2): Promise<TrendData[]> {
    const context = await this.getFinanceContext();
    const start = new Date(filters.startDate);
    const end = new Date(filters.endDate);
    const daily = new Map<string, TrendData>();
    const selectedVehicleIds = filters.vehicleIds?.map(String) || [];
    const ensureDay = (date: string) => {
      if (!daily.has(date)) {
        daily.set(date, {
          date,
          revenue: 0,
          expenses: 0,
          maintenanceCosts: 0,
          fuelCosts: 0,
          inventoryCosts: 0,
          taxes: 0,
          grossRevenue: 0,
          netRevenue: 0
        });
      }
      return daily.get(date)!;
    };

    for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
      ensureDay(cursor.toISOString().split('T')[0]);
    }

    const rentalRows = await this.getRentalRows(filters);
    rentalRows.forEach((row) => {
      const date = this.normalizeDate(row.closedAt);
      if (!date || !daily.has(date)) return;
      const entry = ensureDay(date);
      entry.revenue += row.revenue;
      entry.maintenanceCosts += row.maintenanceCosts;
      entry.fuelCosts += row.fuelCosts;
      entry.inventoryCosts += row.inventoryCosts;
      entry.taxes += row.taxes;
      entry.expenses += row.totalCosts;
      entry.grossRevenue += row.revenue;
      entry.netRevenue += row.grossProfit;
    });

    context.tours
      .filter((tour) => this.rentalMatchesFilters(tour, filters))
      .forEach((tour) => {
        const date = this.normalizeDate(tour.closedAt || tour.endAt || tour.startAt);
        if (!date || !daily.has(date)) return;
        const revenue = this.toNumber(tour.revenue);
        const entry = ensureDay(date);
        entry.revenue += revenue;
        entry.grossRevenue += revenue;
        entry.netRevenue += revenue;
      });

    context.maintenanceFinance
      .filter((record) => this.maintenanceMatchesFilters(record, filters))
      .forEach((record) => {
        const date = this.normalizeDate(record.date);
        if (!date || !daily.has(date)) return;
        const entry = ensureDay(date);
        entry.maintenanceCosts += record.maintenanceCost;
        entry.inventoryCosts += record.inventoryCost;
        entry.taxes += record.tax;
        entry.expenses += record.maintenanceCost + record.inventoryCost;
        entry.revenue += record.billedRevenue;
        entry.grossRevenue += record.billedRevenue;
        entry.netRevenue += record.billedRevenue - record.maintenanceCost - record.inventoryCost - record.tax;
      });

    context.fuelRefills.forEach((row: any) => {
      const date = this.normalizeDate(row.refill_date || row.created_at);
      if (!date || !daily.has(date)) return;

      if (selectedVehicleIds.length > 0 && !selectedVehicleIds.includes(String(row.vehicle_id || ''))) {
        return;
      }

      const liters = this.toNumber(row.liters_added);
      const amount =
        this.toNumber(row.total_cost) ||
        (this.toNumber(row.unit_price || row.cost_per_liter) * liters);

      if (amount <= 0) return;

      const entry = ensureDay(date);
      entry.fuelCosts += amount;
      entry.expenses += amount;
      entry.netRevenue -= amount;
    });

    context.vehicles.forEach((vehicle: any) => {
      const date = this.normalizeDate(vehicle.purchase_date);
      if (!date || !daily.has(date)) return;
      if (selectedVehicleIds.length > 0 && !selectedVehicleIds.includes(String(vehicle.id))) return;

      const amount = this.toNumber(vehicle.purchase_cost_mad);
      if (amount <= 0) return;

      const entry = ensureDay(date);
      entry.expenses += amount;
      entry.netRevenue -= amount;
    });

    this.getDispositionRecords(filters).forEach((record) => {
      const date = this.normalizeDate(record.event_date || record.updated_at);
      if (!date || !daily.has(date)) return;
      const amount = this.toNumber(record.sale_price_mad);
      const entry = ensureDay(date);

      if (record.event_type === 'sold') {
        entry.revenue += amount;
        entry.grossRevenue += amount;
        entry.netRevenue += amount;
      } else {
        entry.expenses += amount;
        entry.netRevenue -= amount;
      }
    });

    return Array.from(daily.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((entry) => ({
        ...entry,
        revenue: Math.round(entry.revenue),
        expenses: Math.round(entry.expenses),
        maintenanceCosts: Math.round(entry.maintenanceCosts),
        fuelCosts: Math.round(entry.fuelCosts),
        inventoryCosts: Math.round(entry.inventoryCosts),
        taxes: Math.round(entry.taxes),
        grossRevenue: Math.round(entry.grossRevenue),
        netRevenue: Math.round(entry.netRevenue)
      }));
  }

  async getTopVehiclesByProfit(filters: FinanceFiltersV2, limit: number = 5): Promise<VehicleProfitData[]> {
    const context = await this.getFinanceContext();
    const rows = await this.getRentalRows(filters);
    const dispositionRecords = this.getDispositionRecords(filters);
    const grouped = new Map<string, VehicleProfitData>();

    rows.forEach((row) => {
      const existing = grouped.get(String(row.vehicleId)) || {
        vehicleId: String(row.vehicleId),
        vehicleName: `${row.plateNumber} - ${row.vehicleModel}`,
        make: row.vehicleModel.split(' ')[0] || 'SEGWAY',
        model: row.vehicleModel.split(' ').slice(1).join(' ') || 'AT6',
        plateNumber: row.plateNumber,
        revenue: 0,
        maintenanceCosts: 0,
        fuelCosts: 0,
        inventoryCosts: 0,
        otherCosts: 0,
        totalCosts: 0,
        profit: 0,
        profitMargin: 0
      };

      existing.revenue += row.revenue;
      existing.maintenanceCosts += row.maintenanceCosts;
      existing.fuelCosts += row.fuelCosts;
      existing.inventoryCosts += row.inventoryCosts;
      existing.otherCosts += row.otherCosts;
      existing.totalCosts += row.totalCosts;
      existing.profit += row.grossProfit;
      existing.profitMargin = existing.revenue > 0
        ? Math.round((existing.profit / existing.revenue) * 1000) / 10
        : 0;

      grouped.set(String(row.vehicleId), existing);
    });

    context.tours
      .filter((tour) => this.rentalMatchesFilters(tour, filters))
      .filter((tour) => String(tour.vehicleId || ''))
      .forEach((tour) => {
        const labels = this.getVehicleLabel(context.vehicleMap.get(String(tour.vehicleId)));
        const existing = grouped.get(String(tour.vehicleId)) || {
          vehicleId: String(tour.vehicleId),
          vehicleName: `${labels.plateNumber} - ${labels.vehicleModel}`,
          make: labels.vehicleModel.split(' ')[0] || 'SEGWAY',
          model: labels.vehicleModel.split(' ').slice(1).join(' ') || 'AT6',
          plateNumber: labels.plateNumber,
          revenue: 0,
          maintenanceCosts: 0,
          fuelCosts: 0,
          inventoryCosts: 0,
          otherCosts: 0,
          totalCosts: 0,
          profit: 0,
          profitMargin: 0
        };

        existing.revenue += this.toNumber(tour.revenue);
        existing.profit += this.toNumber(tour.revenue);
        existing.profitMargin = existing.revenue > 0
          ? Math.round((existing.profit / existing.revenue) * 1000) / 10
          : 0;

        grouped.set(String(tour.vehicleId), existing);
      });

    dispositionRecords.forEach((record) => {
      const existing = grouped.get(String(record.vehicle_id));
      if (!existing) return;

      if (record.event_type === 'sold') {
        existing.revenue += this.toNumber(record.sale_price_mad);
        existing.profit += this.toNumber(record.sale_price_mad);
      } else {
        existing.otherCosts += this.toNumber(record.sale_price_mad);
        existing.totalCosts += this.toNumber(record.sale_price_mad);
        existing.profit -= this.toNumber(record.sale_price_mad);
      }
      existing.profitMargin = existing.revenue > 0
        ? Math.round((existing.profit / existing.revenue) * 1000) / 10
        : 0;
    });

    return Array.from(grouped.values())
      .sort((a, b) => b.profit - a.profit)
      .slice(0, limit);
  }

  async getVehicleFinanceData(vehicleIds: string[], filters: FinanceFiltersV2): Promise<VehicleFinanceData> {
    const context = await this.getFinanceContext();
    const selectedIds = vehicleIds.map(String);
    const dispositionRecords = VehicleDispositionService.listDispositions()
      .filter((record) => selectedIds.includes(String(record.vehicle_id)));
    const rentals = context.rentals.filter((rental) => selectedIds.includes(String(rental.vehicleId)));
    const tours = context.tours.filter((tour) => selectedIds.includes(String(tour.vehicleId)));
    const maintenanceRows = context.maintenanceFinance.filter((row) => selectedIds.includes(String(row.vehicleId)));

    const rentalRevenue = rentals.reduce((sum, rental) => {
      return sum + rental.revenue + rental.linkedMaintenanceRevenue;
    }, 0);
    const tourRevenue = tours.reduce((sum, tour) => sum + this.toNumber(tour.revenue), 0);
    const dispositionRevenue = dispositionRecords.reduce((sum, record) => {
      return sum + (record.event_type === 'sold' ? this.toNumber(record.sale_price_mad) : 0);
    }, 0);
    const lifetimeMaintenanceCosts = maintenanceRows.reduce((sum: number, row: any) => sum + row.maintenanceCost, 0);
    const lifetimeInventoryCosts = maintenanceRows.reduce((sum: number, row: any) => sum + row.inventoryCost, 0);
    const lifetimeFuelCosts = selectedIds.reduce((sum: number, vehicleId: string) => {
      const firstRentalDate = rentals
        .filter((rental) => String(rental.vehicleId) === vehicleId)
        .map((rental) => rental.startAt)
        .sort()[0] || '2000-01-01';
      return sum + this.getFuelCostForVehicleInRange(context, vehicleId, firstRentalDate, new Date().toISOString());
    }, 0);
    const purchaseCosts = context.vehicles.reduce((sum: number, vehicle: any) => {
      if (!selectedIds.includes(String(vehicle.id))) return sum;
      return sum + this.toNumber(vehicle.purchase_cost_mad);
    }, 0);
    const disposalLosses = dispositionRecords.reduce((sum, record) => {
      return sum + (record.event_type === 'disposed' ? this.toNumber(record.sale_price_mad) : 0);
    }, 0);
    const lifetimeRevenue = rentalRevenue + tourRevenue + dispositionRevenue;
    const lifetimeOtherCosts = purchaseCosts + disposalLosses;
    const lifetimeTotalCosts = lifetimeMaintenanceCosts + lifetimeInventoryCosts + lifetimeFuelCosts + lifetimeOtherCosts;
    const grossProfit = lifetimeRevenue - lifetimeTotalCosts;

    const events: VehicleFinanceEvent[] = [
      ...rentals.map((rental) => {
        const fuelCost = this.getFuelCostForVehicleInRange(context, rental.vehicleId, rental.startAt, rental.endAt);
        return {
          date: rental.closedAt,
          eventType: 'Rental Revenue',
          source: rental.rentalId,
          revenue: Math.round(rental.revenue + rental.linkedMaintenanceRevenue),
          maintenanceCost: Math.round(rental.linkedMaintenanceCosts),
          fuelCost: Math.round(fuelCost),
          inventoryCost: Math.round(rental.linkedInventoryCosts),
          otherCost: 0,
          tax: Math.round(rental.linkedMaintenanceTaxes),
          net: Math.round(
            rental.revenue +
            rental.linkedMaintenanceRevenue -
            rental.linkedMaintenanceCosts -
            rental.linkedInventoryCosts -
            fuelCost -
            rental.linkedMaintenanceTaxes
          )
        };
      }),
      ...tours.map((tour) => ({
        date: tour.closedAt,
        eventType: 'Tour Booking',
        source: tour.groupId || tour.rentalId,
        revenue: Math.round(this.toNumber(tour.revenue)),
        maintenanceCost: 0,
        fuelCost: 0,
        inventoryCost: 0,
        otherCost: 0,
        tax: 0,
        net: Math.round(this.toNumber(tour.revenue))
      })),
      ...maintenanceRows.map((row) => ({
        date: row.date,
        eventType: 'Maintenance',
        source: row.linkedRentalId || row.id,
        revenue: Math.round(row.billedRevenue),
        maintenanceCost: Math.round(row.maintenanceCost),
        fuelCost: 0,
        inventoryCost: Math.round(row.inventoryCost),
        otherCost: 0,
        tax: Math.round(row.tax),
        net: Math.round(row.billedRevenue - row.maintenanceCost - row.inventoryCost - row.tax)
      })),
      ...dispositionRecords.map((record) => ({
        date: record.event_date,
        eventType: record.event_type === 'sold' ? 'Vehicle Sale' : 'Vehicle Disposal',
        source: String(record.vehicle_id),
        revenue: record.event_type === 'sold' ? Math.round(this.toNumber(record.sale_price_mad)) : 0,
        maintenanceCost: 0,
        fuelCost: 0,
        inventoryCost: 0,
        otherCost: record.event_type === 'disposed' ? Math.round(this.toNumber(record.sale_price_mad)) : 0,
        tax: 0,
        net: record.event_type === 'sold'
          ? Math.round(this.toNumber(record.sale_price_mad))
          : Math.round(-this.toNumber(record.sale_price_mad))
      }))
    ]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 20);

    const trendMap = new Map<string, number>();
    rentals.forEach((rental) => {
      const key = (this.normalizeDate(rental.closedAt) || '').slice(0, 7);
      if (!key) return;
      const fuelCost = this.getFuelCostForVehicleInRange(context, rental.vehicleId, rental.startAt, rental.endAt);
      const net =
        rental.revenue +
        rental.linkedMaintenanceRevenue -
        rental.linkedMaintenanceCosts -
        rental.linkedInventoryCosts -
        fuelCost -
        rental.linkedMaintenanceTaxes;
      trendMap.set(key, (trendMap.get(key) || 0) + net);
    });

    tours.forEach((tour) => {
      const key = (this.normalizeDate(tour.closedAt) || '').slice(0, 7);
      if (!key) return;
      trendMap.set(key, (trendMap.get(key) || 0) + this.toNumber(tour.revenue));
    });

    const rentalDays = new Set<string>();
    rentals.forEach((rental) => {
      const startDate = this.normalizeDate(rental.startAt);
      const endDate = this.normalizeDate(rental.endAt) || startDate;
      if (!startDate || !endDate) return;
      for (let cursor = new Date(startDate); cursor <= new Date(endDate); cursor.setDate(cursor.getDate() + 1)) {
        rentalDays.add(cursor.toISOString().split('T')[0]);
      }
    });
    tours.forEach((tour) => {
      const startDate = this.normalizeDate(tour.startAt);
      const endDate = this.normalizeDate(tour.endAt) || startDate;
      if (!startDate || !endDate) return;
      for (let cursor = new Date(startDate); cursor <= new Date(endDate); cursor.setDate(cursor.getDate() + 1)) {
        rentalDays.add(cursor.toISOString().split('T')[0]);
      }
    });
    const firstRentalTime = rentals
      .map((rental) => new Date(rental.startAt).getTime())
      .concat(tours.map((tour) => new Date(tour.startAt).getTime()))
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b)[0];
    const daysSinceFirstRental = firstRentalTime
      ? Math.max(1, Math.round((Date.now() - firstRentalTime) / (1000 * 60 * 60 * 24)))
      : 1;
    const utilizationPercent = Math.min(100, Math.round((rentalDays.size / daysSinceFirstRental) * 100));

    return {
      lifetimeRevenue: Math.round(lifetimeRevenue),
      lifetimeMaintenanceCosts: Math.round(lifetimeMaintenanceCosts),
      lifetimeFuelCosts: Math.round(lifetimeFuelCosts),
      lifetimeInventoryCosts: Math.round(lifetimeInventoryCosts),
      lifetimeOtherCosts: Math.round(lifetimeOtherCosts),
      lifetimeTotalCosts: Math.round(lifetimeTotalCosts),
      grossProfit: Math.round(grossProfit),
      utilizationPercent,
      events,
      trendData: Array.from(trendMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-12)
        .map(([date, netMargin]) => ({ date, netMargin: Math.round(netMargin) }))
    };
  }

  async getARAgingData(filters: FinanceFiltersV2): Promise<ARAgingData[]> {
    const context = await this.getFinanceContext();
    const now = new Date();
    const grouped = new Map<string, ARAgingData>();

    [...context.rentals, ...context.tours]
      .filter((rental) => this.rentalMatchesFilters(rental, filters))
      .filter((rental) => this.toNumber(rental.remainingAmount) > 0)
      .forEach((rental) => {
        const dueDate = new Date(rental.endAt || rental.closedAt || rental.startAt || now);
        const daysOutstanding = Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
        const existing = grouped.get(String(rental.customerId)) || {
          customerId: String(rental.customerId),
          customerName: rental.customerName,
          current: 0,
          days30: 0,
          days60: 0,
          days90: 0,
          over90: 0,
          totalOutstanding: 0
        };

        const amount = this.toNumber(rental.remainingAmount);
        if (daysOutstanding < 30) existing.current += amount;
        else if (daysOutstanding < 60) existing.days30 += amount;
        else if (daysOutstanding < 90) existing.days60 += amount;
        else if (daysOutstanding < 120) existing.days90 += amount;
        else existing.over90 += amount;
        existing.totalOutstanding += amount;
        grouped.set(String(rental.customerId), existing);
      });

    return Array.from(grouped.values()).sort((a, b) => b.totalOutstanding - a.totalOutstanding);
  }

  async getCustomerAnalysisData(filters: FinanceFiltersV2): Promise<CustomerAnalysisRow[]> {
    const context = await this.getFinanceContext();
    const grouped = new Map<string, CustomerAnalysisRow>();

    [...context.rentals, ...context.tours]
      .filter((rental) => this.rentalMatchesFilters(rental, filters))
      .forEach((rental) => {
        const existing = grouped.get(String(rental.customerId)) || {
          customerId: String(rental.customerId),
          customerName: rental.customerName,
          rentals: 0,
          revenue: 0,
          discounts: 0,
          refunds: 0,
          net: 0,
          lastActivity: rental.closedAt
        };

        existing.rentals += 1;
        existing.revenue += rental.revenue + rental.linkedMaintenanceRevenue;
        existing.refunds += rental.refundAmount;
        existing.net = existing.revenue - existing.discounts - existing.refunds;
        if (new Date(rental.closedAt).getTime() > new Date(existing.lastActivity).getTime()) {
          existing.lastActivity = rental.closedAt;
        }

        grouped.set(String(rental.customerId), existing);
      });

    return Array.from(grouped.values()).sort((a, b) => b.revenue - a.revenue);
  }

  async exportCustomerAnalysis(filters: FinanceFiltersV2): Promise<ExportData> {
    const rows = await this.getCustomerAnalysisData(filters);
    const headers = ['Customer', 'Rentals', 'Revenue', 'Discounts', 'Refunds', 'Net', 'Last Activity'];

    return {
      filename: `customer_analysis_${filters.startDate}_${filters.endDate}.csv`,
      headers,
      data: rows.map((row): CustomerAnalysisExportRow => ({
        Customer: row.customerName,
        Rentals: row.rentals,
        Revenue: row.revenue,
        Discounts: row.discounts,
        Refunds: row.refunds,
        Net: row.net,
        'Last Activity': row.lastActivity
      }))
    };
  }

  async exportPeriodPL(filters: FinanceFiltersV2): Promise<ExportData> {
    const result = await this.getRentalPLData(filters, 1, 5000, 'closedAt', 'desc');
    const headers = [
      'Rental ID',
      'Customer',
      'Vehicle',
      'Model',
      'Revenue',
      'Maintenance Costs',
      'Fuel Costs',
      'Inventory Costs',
      'Other Costs',
      'Total Costs',
      'Taxes',
      'Gross Profit',
      'Profit %',
      'Status',
      'Payment Status',
      'Closed At'
    ];

    return {
      filename: `finance_period_pl_${filters.startDate}_${filters.endDate}.csv`,
      headers,
      data: result.data.map((row) => ({
        'Rental ID': row.rentalId,
        Customer: row.customer,
        Vehicle: row.plateNumber,
        Model: row.vehicleModel,
        Revenue: row.revenue,
        'Maintenance Costs': row.maintenanceCosts,
        'Fuel Costs': row.fuelCosts,
        'Inventory Costs': row.inventoryCosts,
        'Other Costs': row.otherCosts,
        'Total Costs': row.totalCosts,
        Taxes: row.taxes,
        'Gross Profit': row.grossProfit,
        'Profit %': row.profitPercent,
        Status: row.status,
        'Payment Status': row.payment_status,
        'Closed At': row.closedAt
      }))
    };
  }

  async exportVehicleProfitability(filters: FinanceFiltersV2): Promise<ExportData> {
    const context = await this.getFinanceContext();
    const rows = await this.getTopVehiclesByProfit(filters, context.vehicles.length || 100);
    const headers = [
      'Plate Number',
      'Make',
      'Model',
      'Revenue',
      'Maintenance Costs',
      'Fuel Costs',
      'Inventory Costs',
      'Other Costs',
      'Total Costs',
      'Profit',
      'Profit Margin %'
    ];

    return {
      filename: `vehicle_profitability_${filters.startDate}_${filters.endDate}.csv`,
      headers,
      data: rows.map((row) => ({
        'Plate Number': row.plateNumber,
        Make: row.make,
        Model: row.model,
        Revenue: row.revenue,
        'Maintenance Costs': row.maintenanceCosts,
        'Fuel Costs': row.fuelCosts,
        'Inventory Costs': row.inventoryCosts,
        'Other Costs': row.otherCosts,
        'Total Costs': row.totalCosts,
        Profit: row.profit,
        'Profit Margin %': row.profitMargin
      }))
    };
  }

  async exportARAging(filters: FinanceFiltersV2): Promise<ExportData> {
    const rows = await this.getARAgingData(filters);
    const headers = [
      'Customer',
      'Current',
      '30 Days',
      '60 Days',
      '90 Days',
      'Over 90 Days',
      'Total Outstanding'
    ];

    return {
      filename: `ar_aging_${filters.startDate}_${filters.endDate}.csv`,
      headers,
      data: rows.map((row) => ({
        Customer: row.customerName,
        Current: row.current,
        '30 Days': row.days30,
        '60 Days': row.days60,
        '90 Days': row.days90,
        'Over 90 Days': row.over90,
        'Total Outstanding': row.totalOutstanding
      }))
    };
  }

  formatCurrencyDisplay(amount: number, currency: string = 'MAD'): string {
    return formatCurrency(amount, currency);
  }

  formatCompactDisplay(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      notation: 'compact',
      maximumFractionDigits: 1
    }).format(amount);
  }

  generateShareableLink(filters: FinanceFiltersV2): string {
    return `${window.location.origin}/admin/finance`;
  }

  async getCostBreakdown(type: string, filters: FinanceFiltersV2): Promise<FinanceBreakdownData> {
    const context = await this.getFinanceContext();
    const period = `${filters.startDate} – ${filters.endDate}`;

    if (type === 'maintenance') {
      const rows = context.maintenanceFinance
        .filter((record) => this.maintenanceMatchesFilters(record, filters))
        .map((record) => ({
          id: `maintenance-${record.id}`,
          title: record.description || 'Maintenance record',
          subtitle: this.buildVehicleDisplay(record.vehicleId, context),
          amount: Math.round(record.maintenanceCost),
          date: record.date,
          sourceType: 'maintenance',
          status: record.status,
          vehicleId: record.vehicleId,
          maintenanceId: record.id,
          href: `/admin/maintenance?maintenanceId=${record.id}`,
          meta: {
            inventoryCost: Math.round(record.inventoryCost),
            tax: Math.round(record.tax),
            billedRevenue: Math.round(record.billedRevenue)
          }
        }))
        .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

      return {
        type,
        title: 'Maintenance Costs',
        total: rows.reduce((sum, row) => sum + row.amount, 0),
        period,
        rows
      };
    }

    if (type === 'fuel') {
      const directRows = context.fuelRefills
        .filter((row: any) => this.isDateInRange(row.refill_date || row.created_at, filters.startDate, filters.endDate))
        .filter((row: any) => {
          if (filters.vehicleIds.length === 0) return true;
          return row.vehicle_id && filters.vehicleIds.map(String).includes(String(row.vehicle_id));
        })
        .map((row: any) => {
          const liters = this.toNumber(row.liters_added);
          const amount =
            this.toNumber(row.total_cost) ||
            (this.toNumber(row.unit_price || row.cost_per_liter) * liters) ||
            (context.averageTankUnitCost * liters);
          const isTankIn = !row.vehicle_id;
          return {
            id: `fuel-refill-${row.id || row.created_at}`,
            title: isTankIn ? 'Tank In' : 'Direct Fill',
            subtitle: isTankIn
              ? `${liters}L into main tank`
              : this.buildVehicleDisplay(String(row.vehicle_id), context),
            amount: Math.round(amount),
            date: this.normalizeDate(row.refill_date || row.created_at),
            sourceType: isTankIn ? 'tank_in' : 'direct_fill',
            vehicleId: row.vehicle_id ? String(row.vehicle_id) : undefined,
            href: '/admin/fuel',
            meta: {
              liters,
              unitPrice: this.toNumber(row.unit_price || row.cost_per_liter)
            }
          };
        });

      const transferRows = context.fuelWithdrawals
        .filter((row: any) => this.isDateInRange(row.withdrawal_date || row.created_at, filters.startDate, filters.endDate))
        .filter((row: any) => {
          if (filters.vehicleIds.length === 0) return true;
          return row.vehicle_id && filters.vehicleIds.map(String).includes(String(row.vehicle_id));
        })
        .map((row: any) => {
          const liters = this.toNumber(row.liters_taken);
          return {
            id: `fuel-transfer-${row.id || row.created_at}`,
            title: 'Transfer',
            subtitle: this.buildVehicleDisplay(String(row.vehicle_id), context),
            amount: Math.round(liters * context.averageTankUnitCost),
            date: this.normalizeDate(row.withdrawal_date || row.created_at),
            sourceType: 'transfer',
            vehicleId: String(row.vehicle_id || ''),
            href: '/admin/fuel',
            meta: {
              liters,
              unitPrice: context.averageTankUnitCost
            }
          };
        });

      const rows = [...directRows, ...transferRows].sort(
        (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
      );

      return {
        type,
        title: 'Fuel Costs',
        total: rows.reduce((sum, row) => sum + row.amount, 0),
        period,
        rows
      };
    }

    if (type === 'inventory' || type === 'parts_margin') {
      const maintenanceRows = context.maintenanceFinance.filter((record) => this.maintenanceMatchesFilters(record, filters));
      const rows = maintenanceRows
        .filter((record) => (type === 'inventory' ? record.inventoryCost > 0 : record.partsMargin > 0))
        .map((record) => ({
          id: `${type}-${record.id}`,
          title: record.description || 'Maintenance parts',
          subtitle: this.buildVehicleDisplay(record.vehicleId, context),
          amount: Math.round(type === 'inventory' ? record.inventoryCost : record.partsMargin),
          date: record.date,
          sourceType: type,
          vehicleId: record.vehicleId,
          maintenanceId: record.id,
          rentalId: record.linkedRentalId || undefined,
          href: `/admin/maintenance?maintenanceId=${record.id}`,
          meta: {
            billedRevenue: Math.round(record.billedRevenue),
            maintenanceCost: Math.round(record.maintenanceCost),
            inventoryCost: Math.round(record.inventoryCost),
            partsMargin: Math.round(record.partsMargin)
          }
        }))
        .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

      return {
        type,
        title: type === 'inventory' ? 'Inventory Costs' : 'Parts Margin',
        total: rows.reduce((sum, row) => sum + row.amount, 0),
        period,
        rows
      };
    }

    if (type === 'damage_recovery') {
      const rows = context.maintenanceFinance
        .filter((record) => this.maintenanceMatchesFilters(record, filters))
        .filter((record) => record.billedRevenue > 0)
        .map((record) => ({
          id: `damage-${record.id}`,
          title: record.description || 'Damage recovery',
          subtitle: this.buildVehicleDisplay(record.vehicleId, context),
          amount: Math.round(record.billedRevenue),
          date: record.date,
          sourceType: 'damage_recovery',
          vehicleId: record.vehicleId,
          maintenanceId: record.id,
          rentalId: record.linkedRentalId || undefined,
          href: record.linkedRentalId
            ? `/admin/rentals/${record.linkedRentalId}`
            : `/admin/maintenance?maintenanceId=${record.id}`,
          meta: {
            maintenanceCost: Math.round(record.maintenanceCost),
            inventoryCost: Math.round(record.inventoryCost),
            tax: Math.round(record.tax),
            partsMargin: Math.round(record.partsMargin)
          }
        }))
        .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

      return {
        type,
        title: 'Damage Recovery',
        total: rows.reduce((sum, row) => sum + row.amount, 0),
        period,
        rows
      };
    }

    const dispositionRows = this.getDispositionRecords(filters).map((record: any) => ({
      id: `other-${record.id}`,
      title: record.event_type === 'sold' ? 'Vehicle Sale' : 'Vehicle Disposal',
      subtitle: this.buildVehicleDisplay(String(record.vehicle_id), context),
      amount: Math.round(this.toNumber(record.sale_price_mad)),
      date: this.normalizeDate(record.event_date || record.updated_at),
      sourceType: record.event_type,
      vehicleId: String(record.vehicle_id),
      href: `/admin/fleet/${record.vehicle_id}`,
      meta: {
        buyerName: record.buyer_name || '',
        notes: record.notes || ''
      }
    }));

    const purchaseRows = context.vehicles
      .filter((vehicle: any) => this.isDateInRange(vehicle.purchase_date, filters.startDate, filters.endDate))
      .filter((vehicle: any) => {
        if (filters.vehicleIds.length === 0) return true;
        return filters.vehicleIds.map(String).includes(String(vehicle.id));
      })
      .map((vehicle: any) => ({
        id: `purchase-${vehicle.id}`,
        title: 'Vehicle Purchase',
        subtitle: this.buildVehicleDisplay(String(vehicle.id), context),
        amount: Math.round(this.toNumber(vehicle.purchase_cost_mad)),
        date: this.normalizeDate(vehicle.purchase_date),
        sourceType: 'purchase',
        vehicleId: String(vehicle.id),
        href: `/admin/fleet/${vehicle.id}`,
        meta: {}
      }));

    const rows = [...purchaseRows, ...dispositionRows].sort(
      (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
    );

    return {
      type,
      title: 'Other Costs',
      total: rows.reduce((sum, row) => sum + row.amount, 0),
      period,
      rows
    };
  }

  formatCurrency = formatCurrency;
  formatPercentage = formatPercentage;
}

export const financeApiV2 = new FinanceApiServiceV2();
export default financeApiV2;

export const getRentalPLData = (
  filters: FinanceFiltersV2,
  page?: number,
  pageSize?: number,
  sortBy?: string,
  sortOrder?: 'asc' | 'desc',
  searchTerm?: string
) => financeApiV2.getRentalPLData(filters, page, pageSize, sortBy, sortOrder, searchTerm);
export const getRentalRevenue = (filters: FinanceFiltersV2) => financeApiV2.getRentalRevenue(filters);
export const getVehicles = (orgId?: string) => financeApiV2.getVehicles(orgId);
export const getCustomers = (orgId?: string) => financeApiV2.getCustomers(orgId);
export const getKPIData = (filters: FinanceFiltersV2) => financeApiV2.getKPIData(filters);
export const getTrendData = (filters: FinanceFiltersV2) => financeApiV2.getTrendData(filters);
export const getTopVehiclesByProfit = (filters: FinanceFiltersV2, limit?: number) =>
  financeApiV2.getTopVehiclesByProfit(filters, limit);
export const getVehicleFinanceData = (vehicleIds: string[], filters: FinanceFiltersV2) =>
  financeApiV2.getVehicleFinanceData(vehicleIds, filters);
export const getARAgingData = (filters: FinanceFiltersV2) => financeApiV2.getARAgingData(filters);
export const getCustomerAnalysisData = (filters: FinanceFiltersV2) => financeApiV2.getCustomerAnalysisData(filters);
export const exportCustomerAnalysis = (filters: FinanceFiltersV2) => financeApiV2.exportCustomerAnalysis(filters);
export const exportPeriodPL = (filters: FinanceFiltersV2) => financeApiV2.exportPeriodPL(filters);
export const exportVehicleProfitability = (filters: FinanceFiltersV2) =>
  financeApiV2.exportVehicleProfitability(filters);
export const exportARAging = (filters: FinanceFiltersV2) => financeApiV2.exportARAging(filters);
export const getCostBreakdown = (type: string, filters: FinanceFiltersV2) =>
  financeApiV2.getCostBreakdown(type, filters);
