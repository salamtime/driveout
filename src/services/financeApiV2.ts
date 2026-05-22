import { supabase } from '../lib/supabase';
import { normalizePaymentStatus } from '../config/statusColors';
import VehicleDispositionService from './VehicleDispositionService';
import sharedQueryCacheService from './SharedQueryCacheService';
import { fetchTourBookings } from './tourBookingService';
import {
  getRentalCollectedAmountInWindow,
  getRentalCollectedEntries,
  getRentalCustomerPaidAmount,
} from '../utils/rentalFinancials';
import {
  clearOrganizationContextCache,
  scopeTenantOwnedQuery,
  shouldScopeSharedTenantData,
  requireCurrentOrganizationId,
  verifyTenantOwnedRows,
} from './OrganizationService';

const TOUR_BOOKING_MARKER = '[tour_booking]';
const VEHICLE_REPORTS_TABLE = 'app_4c3a7a6153_vehicle_reports';
const FINANCE_OVERVIEW_SUMMARY_CACHE_NAMESPACE = 'finance-overview-summary-v6';
const FINANCE_BUSINESS_DAY_START_HOUR = 10;
const FINANCE_BUSINESS_DAY_END_HOUR = 3;
const FINANCE_OPTIONAL_UNSCOPED_TABLE_OPTIONS = {
  skipTenantScope: true,
  skipTenantVerification: true,
} as const;
const FINANCE_RENTAL_COLUMNS = [
  'id',
  'organization_id',
  'rental_id',
  'linked_display_id',
  'customer_id',
  'customer_name',
  'customer_email',
  'vehicle_id',
  'rental_status',
  'status',
  'payment_status',
  'total_amount',
  'deposit_amount',
  'deposit_deduction_amount',
  'remaining_amount',
  'amount_due_override_reason',
  'amount_due_override_previous_amount',
  'rental_start_date',
  'rental_end_date',
  'actual_end_date',
  'completed_at',
  'rental_completed_at',
  'updated_at',
  'created_at',
  'notes',
  'overage_charge',
  'fuel_charge',
  'fuel_charge_enabled',
  'impound_total',
  'impound_discount',
  'late_fee_amount',
  'late_fee',
  'total_extension_price',
  'transport_fee',
  'pickup_fee_mad',
  'dropoff_fee_mad',
  'start_fuel_level',
  'end_fuel_level',
  'linked_maintenance_id',
  'linked_maintenance_customer_charge_total',
  'linked_maintenance_daily_discount',
  'linked_fuel_expense_total',
  'linked_fuel_consumed_liters',
  'linked_fuel_average_unit_cost',
].join(',');
const FINANCE_VEHICLE_COLUMNS = 'id,organization_id,name,model,plate_number,status,current_odometer,purchase_cost_mad,purchase_date,purchase_supplier,sold_date,sale_price_mad';
const FINANCE_MAINTENANCE_COLUMNS = 'id,organization_id,vehicle_id,service_date,completed_date,created_at,description,parts_cost_mad,labor_rate_mad,external_cost_mad,tax_mad,cost,status,rental_id';
const FINANCE_MAINTENANCE_PART_COLUMNS = 'maintenance_id,organization_id,unit_cost_mad,quantity,item_id,notes';
const FINANCE_FUEL_REFILL_COLUMNS = '*';
const FINANCE_FUEL_WITHDRAWAL_COLUMNS = 'id,vehicle_id,withdrawal_date,created_at,liters_taken,unit_price,total_cost';
const FINANCE_RENTAL_FUEL_SNAPSHOT_COLUMNS = 'rental_id,organization_id,linked_fuel_consumed_liters,linked_fuel_average_unit_cost,linked_fuel_expense_total,linked_fuel_synced_at';
const FINANCE_EXPENSE_COLUMNS = 'id,category,subcategory,description,amount,expense_date,status,created_by,invoice_url,reference_type,reference_id,notes,created_at,updated_at,organization_id,workspace_id,vehicle_id';

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
  totalCollected: number;
  totalOutstanding: number;
  netCash: number;
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
  collectedChange: number;
  outstandingChange: number;
  netCashChange: number;
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
  fuelConsumedLiters?: number;
  inventoryCosts: number;
  acquisitionCosts?: number;
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
  baseRevenue: number;
  transportRevenue: number;
  overageRevenue: number;
  extensionRevenue: number;
  fuelChargeRevenue: number;
  fuelSurplusRevenue: number;
  lateFeeRevenue: number;
  impoundRevenue: number;
  maintenanceRevenue: number;
  discountAmount: number;
  maintenanceReference: string | null;
  fuelVarianceLiters: number;
  partsConsumedCost?: number;
  maintenanceCosts: number;
  fuelCosts: number;
  inventoryCosts: number;
  otherCosts: number;
  totalCosts: number;
  taxes: number;
  grossProfit: number;
  profitPercent: number;
  closedAt: string;
  financeDate?: string;
  vehicleId: string;
  customerId: string;
  status: string;
  payment_status: string;
  remainingAmount: number;
}

export interface TourPLRow {
  id: string;
  tourId: string;
  customer: string;
  vehicleDisplay: string;
  plateNumber: string;
  vehicleModel: string;
  revenue: number;
  baseRevenue: number;
  fuelSurplusRevenue: number;
  fuelVarianceLiters: number;
  fuelConsumedLiters: number;
  fuelSurplusLiters: number;
  fuelUnitCost: number;
  fuelCosts: number;
  maintenanceCosts: number;
  otherCosts: number;
  totalCosts: number;
  grossProfit: number;
  profitPercent: number;
  closedAt: string;
  financeDate?: string;
  vehicleIds: string[];
  customerId: string;
  status: string;
  payment_status: string;
  remainingAmount: number;
  guideName: string;
  packageName: string;
  routeType: string;
  quadCount: number;
  fuelVehicleBreakdown?: Array<{
    vehicleId: string;
    vehicleDisplay: string;
    vehicleModel: string;
    startFuelLevel: number | null;
    endFuelLevel: number | null;
    consumedLiters: number;
    surplusLiters: number;
    fuelVarianceLiters: number;
    unitCost: number;
    fuelCost: number;
    fuelSurplusValue: number;
  }>;
}

export interface FuelPLData {
  fuelIn: number;
  fuelOut: number;
  netFuelImpact: number;
  consumedLiters: number;
  surplusLiters: number;
  sources: Array<{
    key: string;
    label: string;
    fuelIn: number;
    fuelOut: number;
    net: number;
    consumedLiters: number;
    surplusLiters: number;
    count: number;
  }>;
  topVehicles: Array<{
    vehicleId: string;
    plateNumber: string;
    vehicleModel: string;
    fuelIn: number;
    fuelOut: number;
    net: number;
    consumedLiters: number;
    surplusLiters: number;
  }>;
  rows: Array<{
    id: string;
    type: 'rental' | 'tour';
    label: string;
    vehicleDisplay: string;
    vehicleModel: string;
    fuelIn: number;
    fuelOut: number;
    net: number;
    consumedLiters: number;
    surplusLiters: number;
    date: string;
    href?: string;
  }>;
}

export interface MaintenancePLData {
  billedRecovery: number;
  maintenanceCost: number;
  partsConsumedCost: number;
  laborExternalCost: number;
  netRecovery: number;
  linkedCount: number;
  unrecoveredCount: number;
  rows: Array<{
    id: string;
    title: string;
    vehicleDisplay: string;
    billedRecovery: number;
    maintenanceCost: number;
    partsConsumedCost: number;
    laborExternalCost: number;
    netRecovery: number;
    date: string;
    status: string;
    linkedRentalId?: string;
    href: string;
  }>;
  topVehicles: Array<{
    vehicleId: string;
    vehicleDisplay: string;
    maintenanceCost: number;
    partsConsumedCost: number;
    billedRecovery: number;
    netRecovery: number;
    count: number;
  }>;
}

export interface VehicleFinanceData {
  lifetimeRevenue: number;
  lifetimeMaintenanceCosts: number;
  lifetimeFuelCosts: number;
  lifetimeFuelConsumedLiters: number;
  lifetimeInventoryCosts: number;
  lifetimeAcquisitionCosts: number;
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
  href?: string;
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

export interface CustomerFinanceTimelineEvent {
  key: string;
  label: string;
  timestamp: string;
  tone?: 'slate' | 'emerald' | 'amber' | 'rose' | 'violet';
  amount?: number;
  note?: string;
}

export interface CustomerRentalFinanceRow {
  id: string;
  rentalId: string;
  type: 'rental' | 'tour';
  customerId: string;
  customerName: string;
  vehicleDisplay: string;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  refundAmount: number;
  securityRequired: number;
  securityReceived: number;
  securityDocumentLabel: string | null;
  netCashPosition: number;
  startAt: string;
  endAt: string;
  closedAt: string;
  href: string;
  timeline: CustomerFinanceTimelineEvent[];
}

export interface CustomerFinanceProfile {
  customerId: string;
  customerName: string;
  rentalCount: number;
  totalRevenue: number;
  totalPaid: number;
  totalOutstanding: number;
  totalRefunds: number;
  securityRequired: number;
  securityReceived: number;
  securityStillDue: number;
  activeContracts: number;
  lastActivity: string;
  rentals: CustomerRentalFinanceRow[];
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
  direction?: 'incoming' | 'outgoing' | 'tax';
  date?: string | null;
  sourceType?: string;
  status?: string;
  vehicleId?: string;
  rentalId?: string;
  maintenanceId?: string;
  href?: string;
  meta?: Record<string, any>;
}

export interface FinanceLedgerData {
  rows: FinanceBreakdownRow[];
  incomingTotal: number;
  outgoingTotal: number;
  taxesTotal: number;
  netTotal: number;
}

export interface FinanceAlertRow {
  id: string;
  type: 'unpaid_contract' | 'security_due' | 'maintenance_recovery_pending' | 'negative_vehicle_roi' | 'high_vehicle_cost';
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  amount: number;
  secondaryAmount?: number;
  date?: string | null;
  href?: string;
  vehicleId?: string;
  rentalId?: string;
  customerId?: string;
  sourceLabel?: string;
}

export interface FinanceAlertsData {
  rows: FinanceAlertRow[];
  unpaidTotal: number;
  securityDueTotal: number;
  maintenanceRecoveryPendingTotal: number;
  negativeVehicleCount: number;
}

export interface FinancePaymentProofQueueRow {
  id: string;
  proofType: 'booking' | 'wallet';
  status: string;
  amount: number;
  customerName: string;
  customerUserId?: string;
  customerEmail?: string;
  ownerLabel: string;
  bookingReference: string | null;
  submittedAt: string | null;
  methodLabel: string;
  href?: string;
  proofUrl?: string;
  customerNote?: string;
  reviewNote?: string;
}

export interface FinanceWalletAccountRow {
  id: string;
  ownerLabel: string;
  ownerType: string;
  verificationState: string;
  balance: number;
  approvedTopups: number;
  pendingTopups: number;
  deductions: number;
  lastActivity: string | null;
}

export interface FinanceTrustData {
  totalWalletBalance: number;
  approvedTopupsTotal: number;
  pendingTopupsTotal: number;
  rejectedTopupsTotal: number;
  manualAdjustmentsTotal: number;
  walletLedgerExpectedTotal: number;
  walletReconciliationGap: number;
  verifiedWalletCount: number;
  pendingWalletCount: number;
  pendingBookingProofCount: number;
  approvedBookingProofCount: number;
  rejectedBookingProofCount: number;
  pendingWalletProofCount: number;
  walletAccounts: FinanceWalletAccountRow[];
  paymentProofQueue: FinancePaymentProofQueueRow[];
}

export interface FinanceBreakdownData {
  type: string;
  title: string;
  total: number;
  period: string;
  rows: FinanceBreakdownRow[];
}

export interface FinanceDayBreakdownData {
  date: string;
  title: string;
  incomingTotal: number;
  outgoingTotal: number;
  taxesTotal: number;
  netTotal: number;
  rows: FinanceBreakdownRow[];
}

export interface FinanceOverviewSummaryData {
  kpiData: KPIData;
  trendData: TrendData[];
  pulseRows: FinanceBreakdownRow[];
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
  vehicleReports: any[];
  reportByRentalId: Map<string, any>;
  maintenanceFinance: any[];
  maintenanceByRentalId: Map<string, any>;
  financeExpenses: any[];
  fuelRefills: any[];
  fuelWithdrawals: any[];
  tourVehicleSnapshots: any[];
  averageTankUnitCost: number;
};

class FinanceApiServiceV2 {
  private tableExistenceCache: Map<string, boolean> = new Map();
  private financeContextPromise: Promise<FinanceContext> | null = null;
  private financeContextLoadedAt = 0;
  private financeOverviewContextPromise: Promise<FinanceContext> | null = null;
  private financeOverviewContextLoadedAt = 0;

  invalidateCaches() {
    this.financeContextPromise = null;
    this.financeContextLoadedAt = 0;
    this.financeOverviewContextPromise = null;
    this.financeOverviewContextLoadedAt = 0;
    sharedQueryCacheService.invalidateNamespace(FINANCE_OVERVIEW_SUMMARY_CACHE_NAMESPACE);
  }

  private async ensureTenantWorkspaceReady(label: string) {
    if (!shouldScopeSharedTenantData()) {
      return;
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await requireCurrentOrganizationId(
          `Workspace organization context is required to load ${label}.`
        );
        return;
      } catch (error) {
        lastError = error as Error;
        clearOrganizationContextCache();

        if (attempt < 4) {
          await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
        }
      }
    }

    throw lastError || new Error(`Workspace organization context is required to load ${label}.`);
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
        }),
      ]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  private async loadOptionalContextSlice<T>(
    promise: Promise<T>,
    fallback: T,
    label: string,
    ms: number = 8000
  ): Promise<T> {
    try {
      return await this.withTimeout(promise, ms, label);
    } catch (error) {
      console.warn(`Finance context slice skipped: ${label}`, error);
      return fallback;
    }
  }

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
    if (typeof value === 'string') {
      const isoDayMatch = value.match(/^(\d{4}-\d{2}-\d{2})/);
      if (isoDayMatch) return isoDayMatch[1];
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().split('T')[0];
  }

  private getRentalCollectedWindowRange(filters: FinanceFiltersV2) {
    const start = new Date(`${filters.startDate}T00:00:00.000`);
    start.setHours(FINANCE_BUSINESS_DAY_START_HOUR, 0, 0, 0);

    const end = new Date(`${filters.endDate}T00:00:00.000`);
    end.setDate(end.getDate() + 1);
    end.setHours(FINANCE_BUSINESS_DAY_END_HOUR, 0, 0, 0);

    return {
      start: start.toISOString(),
      end: end.toISOString(),
    };
  }

  private getFuelLiters(row: any): number {
    return this.toNumber(row?.liters_added ?? row?.liters ?? row?.liters_taken);
  }

  private getFuelUnitPrice(row: any): number {
    return this.toNumber(row?.unit_price ?? row?.cost_per_liter ?? row?.price_per_liter);
  }

  private getFuelAmount(row: any, fallbackUnitCost: number = 0): number {
    const liters = this.getFuelLiters(row);
    return (
      this.toNumber(row?.total_cost) ||
      (this.getFuelUnitPrice(row) * liters) ||
      (fallbackUnitCost * liters)
    );
  }

  private calculateWeightedFuelUnitCost(rows: any[]): number {
    let totalLiters = 0;
    let totalCost = 0;

    rows.forEach((row) => {
      const liters = this.getFuelLiters(row);
      if (liters <= 0) return;

      const amount = this.getFuelAmount(row);
      if (amount <= 0) return;

      totalLiters += liters;
      totalCost += amount;
    });

    return totalLiters > 0 ? totalCost / totalLiters : 0;
  }

  private normalizeFuelRefillRows(rawFuelRefills: any[] = [], rawVehicleFuelRefills: any[] = []): any[] {
    const combined = [
      ...rawFuelRefills.map((row: any) => ({
        ...row,
        __finance_source: 'fuel_refills',
        liters: row.liters ?? row.liters_added ?? row.amount ?? 0,
        price_per_liter: row.price_per_liter ?? row.unit_price ?? row.cost_per_liter ?? 0,
        total_cost: row.total_cost ?? row.cost ?? 0,
        refill_date: row.refill_date ?? row.created_at ?? null,
      })),
      ...rawVehicleFuelRefills.map((row: any) => ({
        ...row,
        __finance_source: 'vehicle_fuel_refills',
        liters: row.liters ?? row.liters_added ?? row.amount ?? 0,
        price_per_liter: row.price_per_liter ?? row.unit_price ?? row.cost_per_liter ?? 0,
        total_cost: row.total_cost ?? row.cost ?? 0,
        refill_date: row.refill_date ?? row.created_at ?? null,
      })),
    ];

    const deduped = new Map<string, any>();
    combined.forEach((row) => {
      const key = `${row.__finance_source}:${String(row.id || '')}`;
      if (!deduped.has(key)) {
        deduped.set(key, row);
      }
    });

    return Array.from(deduped.values());
  }

  private getRecognizedIncomingAmount(raw: any, totalAmount: number): number {
    const paymentStatus = normalizePaymentStatus(raw?.payment_status, raw?.remaining_amount);
    const paidAmount = Math.max(0, this.toNumber(raw?.deposit_amount));

    if (!paymentStatus || ['unpaid', 'pending', 'scheduled', 'confirmed', 'active', 'completed', 'cancelled'].includes(paymentStatus)) {
      return 0;
    }

    if (paymentStatus === 'partial') {
      return paidAmount;
    }

    if (paymentStatus === 'paid') {
      return paidAmount > 0 ? paidAmount : Math.max(0, totalAmount);
    }

    return 0;
  }

  private getRecognizedIncomingDate(raw: any, fallbackDate: any): string | null {
    return (
      raw?.payment_date ||
      raw?.paid_at ||
      raw?.payment_received_at ||
      raw?.created_at ||
      fallbackDate ||
      raw?.updated_at ||
      null
    );
  }

  private toValidDate(value: any): Date | null {
    const parsed = value ? new Date(value) : null;
    return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null;
  }

  private getRentalOperationalWindowForCollected(rental: any) {
    const start =
      this.toValidDate(rental?.startAt) ||
      this.toValidDate(rental?.raw?.rental_start_date) ||
      this.toValidDate(rental?.raw?.created_at);
    const end =
      this.toValidDate(rental?.closedAt) ||
      this.toValidDate(rental?.endAt) ||
      this.toValidDate(rental?.raw?.updated_at) ||
      start;

    return { start, end };
  }

  private doesRentalIntersectCollectedWindow(rental: any, startDate: string, endDate: string) {
    const windowStart = this.toValidDate(startDate);
    const windowEnd = this.toValidDate(endDate);
    const { start, end } = this.getRentalOperationalWindowForCollected(rental);

    if (!windowStart || !windowEnd) return false;
    if (!start && !end) return false;

    const effectiveStart = start || end;
    const effectiveEnd = end || start;

    if (!effectiveStart || !effectiveEnd) return false;

    return effectiveStart < windowEnd && effectiveEnd >= windowStart;
  }

  private getRentalSecuritySnapshot(raw: any) {
    const required = Math.max(0, this.toNumber(raw?.damage_deposit));
    const recordedReceived = Math.max(0, this.toNumber(raw?.damage_deposit_received_amount));
    const source = String(raw?.damage_deposit_source || '').toLowerCase();
    const hasHeldDocument = Boolean(
      raw?.damage_deposit_document_name ||
      raw?.damage_deposit_document_url ||
      source === 'document'
    );
    const hasRecordedMethod = source === 'cash' || source === 'bank_transfer';
    const hasReceivedTimestamp = Boolean(raw?.damage_deposit_received_at);
    const inferredReceived = recordedReceived > 0
      ? recordedReceived
      : required > 0 && hasRecordedMethod && hasReceivedTimestamp
        ? required
        : 0;
    const isReturned = Boolean(raw?.deposit_returned_at);

    return {
      required,
      received: inferredReceived,
      stillDue: isReturned ? 0 : Math.max(0, required - inferredReceived),
      hasHeldDocument,
      isReturned,
      documentLabel: raw?.damage_deposit_document_name ||
        (source === 'document' ? 'Security document held' : null),
      source,
      hasRecordedMethod
    };
  }

  private parseLinkedRentalId(value: any): string | null {
    if (!value) return null;
    const match = String(value).match(/RNT-[A-Z0-9-]+/i);
    return match ? match[0].toUpperCase() : null;
  }

  private extractRentalLookupValue(value: any): string | null {
    if (!value) return null;
    const text = String(value).trim();
    if (!text) return null;

    const explicitReferenceMatch = text.match(/Rental reference:\s*([A-Z0-9-]{8,}|[a-f0-9-]{8,})/i);
    if (explicitReferenceMatch?.[1]) {
      return explicitReferenceMatch[1].trim();
    }

    const rentalReferenceMatch = text.match(/RNT-[A-Z0-9-]+/i);
    if (rentalReferenceMatch?.[0]) {
      return rentalReferenceMatch[0].toUpperCase();
    }

    const uuidMatch = text.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);
    if (uuidMatch?.[0]) {
      return uuidMatch[0];
    }

    return null;
  }

  private normalizeRentalReference(value: any): string {
    return String(value || '').trim().toUpperCase();
  }

  private summarizeMaintenanceDescription(rawDescription: any, publicRentalReference: string | null = null): string {
    const summary = String(rawDescription || '')
      .replace(/Vehicle report ID:\s*[^\n|]+/gi, '')
      .replace(/Rental reference:\s*[^\n|]+/gi, publicRentalReference ? `Rental ${publicRentalReference}` : '')
      .replace(/\n+/g, ' • ')
      .replace(/\s*\|\s*/g, ' • ')
      .replace(/\s{2,}/g, ' ')
      .replace(/ • /g, ' • ')
      .replace(/^•\s*/g, '')
      .replace(/\s*•\s*$/g, '')
      .trim();

    if (!summary && publicRentalReference) {
      return `Rental ${publicRentalReference}`;
    }

    return summary;
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

  private getTourBilledAmount(raw: any, meta: any): number {
    const selectedMixTotal = Array.isArray(meta?.selectedModelMix)
      ? meta.selectedModelMix.reduce((sum: number, item: any) => sum + this.toNumber(item?.lineTotal), 0)
      : 0;

    return Math.max(
      0,
      this.toNumber(raw?.total_amount_mad),
      this.toNumber(raw?.total_amount),
      this.toNumber(meta?.totalAmount),
      selectedMixTotal
    );
  }

  private getTourFuelTotalsFromSnapshots(snapshots: any[]) {
    const consumedLiters = snapshots.reduce((sum: number, snapshot: any) => sum + this.toNumber(snapshot.fuel_consumed_liters), 0);
    const surplusLiters = snapshots.reduce((sum: number, snapshot: any) => sum + this.toNumber(snapshot.fuel_surplus_liters), 0);
    const fuelCosts = snapshots.reduce((sum: number, snapshot: any) => sum + this.toNumber(snapshot.fuel_expense_total), 0);
    const fuelSurplusRevenue = snapshots.reduce((sum: number, snapshot: any) => sum + this.toNumber(snapshot.fuel_surplus_value), 0);
    const weightedUnitCostBase = snapshots.reduce((sum: number, snapshot: any) => {
      const liters = this.toNumber(snapshot.fuel_consumed_liters) + this.toNumber(snapshot.fuel_surplus_liters);
      return sum + (liters * this.toNumber(snapshot.fuel_unit_cost_snapshot));
    }, 0);
    const totalFuelMovement = consumedLiters + surplusLiters;

    return {
      fuelCosts,
      fuelSurplusRevenue,
      consumedLiters,
      surplusLiters,
      fuelVarianceLiters: surplusLiters - consumedLiters,
      fuelUnitCost: totalFuelMovement > 0 ? weightedUnitCostBase / totalFuelMovement : 0,
      hasFuelSignal: snapshots.length > 0
    };
  }

  private getTourFuelTotalsFromMetadata(tours: any[], averageTankUnitCost: number) {
    const entriesByVehicle = new Map<string, any>();

    tours.forEach((tour) => {
      const meta = tour.meta || {};
      const departureEntries = Array.isArray(meta.departureEntries) ? meta.departureEntries : [];
      const returnEntries = Array.isArray(meta.returnEntries) ? meta.returnEntries : [];

      departureEntries.forEach((entry: any) => {
        const vehicleId = String(entry?.vehicleId || '');
        if (!vehicleId) return;
        const current = entriesByVehicle.get(vehicleId) || {};
        entriesByVehicle.set(vehicleId, {
          ...current,
          startFuelLevel: entry?.startFuelLevel ?? entry?.sourceFuelLevel ?? current.startFuelLevel
        });
      });

      returnEntries.forEach((entry: any) => {
        const vehicleId = String(entry?.vehicleId || '');
        if (!vehicleId) return;
        const current = entriesByVehicle.get(vehicleId) || {};
        entriesByVehicle.set(vehicleId, {
          ...current,
          endFuelLevel: entry?.fuelLevel ?? entry?.endFuelLevel ?? current.endFuelLevel
        });
      });
    });

    let consumedLiters = 0;
    let surplusLiters = 0;

    entriesByVehicle.forEach((entry) => {
      if (entry.startFuelLevel === null || entry.startFuelLevel === undefined || entry.endFuelLevel === null || entry.endFuelLevel === undefined) {
        return;
      }

      const startFuelLevel = this.toNumber(entry.startFuelLevel);
      const endFuelLevel = this.toNumber(entry.endFuelLevel);
      const fuelDeltaLiters = ((startFuelLevel - endFuelLevel) / 8) * 23;

      if (fuelDeltaLiters > 0) {
        consumedLiters += fuelDeltaLiters;
      } else if (fuelDeltaLiters < 0) {
        surplusLiters += Math.abs(fuelDeltaLiters);
      }
    });

    return {
      fuelCosts: consumedLiters * averageTankUnitCost,
      fuelSurplusRevenue: surplusLiters * averageTankUnitCost,
      consumedLiters,
      surplusLiters,
      fuelVarianceLiters: surplusLiters - consumedLiters,
      fuelUnitCost: averageTankUnitCost,
      hasFuelSignal: entriesByVehicle.size > 0
    };
  }

  private tourFuelLinesToLiters(fuelLevel: any) {
    return ((this.toNumber(fuelLevel) / 8) * 23);
  }

  private buildTourFuelVehicleBreakdown(
    tours: any[],
    snapshots: any[],
    vehicleMap: Map<string, any>,
    averageTankUnitCost: number
  ) {
    const round = (value: number) => Math.round(value * 100) / 100;
    const buildVehicleLabel = (vehicleId: string, fallbackLabel = '') => {
      const labels = this.getVehicleLabel(vehicleMap.get(String(vehicleId || '')));
      return {
        vehicleDisplay: labels.plateNumber || fallbackLabel || labels.vehicleDisplay || 'Vehicle',
        vehicleModel: labels.vehicleModel || 'Tour vehicle'
      };
    };

    if ((snapshots || []).length > 0) {
      return snapshots.map((snapshot: any) => {
        const vehicleId = String(snapshot.vehicle_id || '');
        const unitCost = this.toNumber(snapshot.fuel_unit_cost_snapshot) || averageTankUnitCost || 0;
        const consumedLiters = this.toNumber(snapshot.fuel_consumed_liters);
        const surplusLiters = this.toNumber(snapshot.fuel_surplus_liters);
        const labels = buildVehicleLabel(vehicleId, snapshot.plate_number_snapshot);

        return {
          vehicleId,
          vehicleDisplay: snapshot.plate_number_snapshot || labels.vehicleDisplay,
          vehicleModel: snapshot.model_snapshot || labels.vehicleModel,
          startFuelLevel: snapshot.start_fuel_level === null || snapshot.start_fuel_level === undefined ? null : this.toNumber(snapshot.start_fuel_level),
          endFuelLevel: snapshot.end_fuel_level === null || snapshot.end_fuel_level === undefined ? null : this.toNumber(snapshot.end_fuel_level),
          consumedLiters: round(consumedLiters),
          surplusLiters: round(surplusLiters),
          fuelVarianceLiters: round(surplusLiters - consumedLiters),
          unitCost: round(unitCost),
          fuelCost: round(this.toNumber(snapshot.fuel_expense_total) || (consumedLiters * unitCost)),
          fuelSurplusValue: round(this.toNumber(snapshot.fuel_surplus_value) || (surplusLiters * unitCost))
        };
      });
    }

    const entriesByVehicle = new Map<string, any>();
    tours.forEach((tour) => {
      const meta = tour.meta || {};
      const departureEntries = Array.isArray(meta.departureEntries) ? meta.departureEntries : [];
      const returnEntries = Array.isArray(meta.returnEntries) ? meta.returnEntries : [];

      departureEntries.forEach((entry: any) => {
        const vehicleId = String(entry?.vehicleId || '');
        if (!vehicleId) return;
        const current = entriesByVehicle.get(vehicleId) || {};
        entriesByVehicle.set(vehicleId, {
          ...current,
          vehicleName: entry?.vehicleName || current.vehicleName,
          startFuelLevel: entry?.startFuelLevel ?? entry?.sourceFuelLevel ?? current.startFuelLevel
        });
      });

      returnEntries.forEach((entry: any) => {
        const vehicleId = String(entry?.vehicleId || '');
        if (!vehicleId) return;
        const current = entriesByVehicle.get(vehicleId) || {};
        entriesByVehicle.set(vehicleId, {
          ...current,
          vehicleName: entry?.vehicleName || current.vehicleName,
          endFuelLevel: entry?.fuelLevel ?? entry?.endFuelLevel ?? current.endFuelLevel
        });
      });
    });

    return Array.from(entriesByVehicle.entries()).map(([vehicleId, entry]) => {
      const startFuelLevel = entry.startFuelLevel === null || entry.startFuelLevel === undefined ? null : this.toNumber(entry.startFuelLevel);
      const endFuelLevel = entry.endFuelLevel === null || entry.endFuelLevel === undefined ? null : this.toNumber(entry.endFuelLevel);
      const startLiters = startFuelLevel === null ? null : this.tourFuelLinesToLiters(startFuelLevel);
      const endLiters = endFuelLevel === null ? null : this.tourFuelLinesToLiters(endFuelLevel);
      const consumedLiters = startLiters !== null && endLiters !== null ? Math.max(0, startLiters - endLiters) : 0;
      const surplusLiters = startLiters !== null && endLiters !== null ? Math.max(0, endLiters - startLiters) : 0;
      const labels = buildVehicleLabel(vehicleId, entry.vehicleName);

      return {
        vehicleId,
        vehicleDisplay: labels.vehicleDisplay,
        vehicleModel: labels.vehicleModel,
        startFuelLevel,
        endFuelLevel,
        consumedLiters: round(consumedLiters),
        surplusLiters: round(surplusLiters),
        fuelVarianceLiters: round(surplusLiters - consumedLiters),
        unitCost: round(averageTankUnitCost || 0),
        fuelCost: round(consumedLiters * (averageTankUnitCost || 0)),
        fuelSurplusValue: round(surplusLiters * (averageTankUnitCost || 0))
      };
    });
  }

  private getTourFuelTotals(tours: any[], snapshots: any[], averageTankUnitCost: number) {
    const snapshotFuelTotals = this.getTourFuelTotalsFromSnapshots(snapshots);

    if (!snapshotFuelTotals.hasFuelSignal) {
      return this.getTourFuelTotalsFromMetadata(tours, averageTankUnitCost);
    }

    if (snapshotFuelTotals.fuelUnitCost > 0) {
      return snapshotFuelTotals;
    }

    const repricedFuelCosts = snapshotFuelTotals.consumedLiters * averageTankUnitCost;
    const repricedFuelSurplusRevenue = snapshotFuelTotals.surplusLiters * averageTankUnitCost;

    return {
      ...snapshotFuelTotals,
      fuelCosts: snapshotFuelTotals.fuelCosts > 0 ? snapshotFuelTotals.fuelCosts : repricedFuelCosts,
      fuelSurplusRevenue: snapshotFuelTotals.fuelSurplusRevenue > 0 ? snapshotFuelTotals.fuelSurplusRevenue : repricedFuelSurplusRevenue,
      fuelUnitCost: averageTankUnitCost
    };
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

  private getBaseRentalBilledAmount(raw: any): number {
    return Math.max(
      0,
      this.toNumber(raw?.total_amount) +
        this.toNumber(raw?.overage_charge) +
        this.toNumber(raw?.fuel_charge_enabled === false ? 0 : raw?.fuel_charge) +
        this.toNumber(raw?.impound_total) +
        this.toNumber(raw?.late_fee_amount || raw?.late_fee) +
        this.toNumber(raw?.total_extension_price)
    );
  }

  private formatMaintenanceReference(value: any): string | null {
    if (!value) return null;
    const normalized = String(value).trim();
    if (!normalized) return null;
    if (/^MNT-/i.test(normalized)) return normalized.toUpperCase();
    const compact = normalized.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    return `MNT-${compact.slice(0, 8)}`;
  }

  private getRentalFuelUnitCost(raw: any): number {
    return Math.max(0, this.toNumber(raw?.linked_fuel_average_unit_cost));
  }

  private getRentalFuelSurplusRevenueAmount(raw: any): number {
    const startFuelLevel = raw?.start_fuel_level;
    const endFuelLevel = raw?.end_fuel_level;
    if (startFuelLevel === null || startFuelLevel === undefined || endFuelLevel === null || endFuelLevel === undefined) {
      return 0;
    }

    const unitCost = this.getRentalFuelUnitCost(raw);
    if (unitCost <= 0) return 0;

    const startLines = this.toNumber(startFuelLevel);
    const endLines = this.toNumber(endFuelLevel);
    if (endLines <= startLines) return 0;

    const extraLiters = ((endLines - startLines) / 8) * 23;
    return Math.max(0, Math.round(extraLiters * unitCost));
  }

  private getRentalRevenueBreakdown(raw: any, report: any, linkedMaintenance: any) {
    const baseRevenue = Math.max(0, this.toNumber(raw?.total_amount));
    const transportRevenue = Math.max(
      0,
      this.toNumber(raw?.transport_fee) ||
      this.toNumber(raw?.pickup_fee_mad) + this.toNumber(raw?.dropoff_fee_mad)
    );
    const overageRevenue = Math.max(0, this.toNumber(raw?.overage_charge));
    const extensionRevenue = Math.max(0, this.toNumber(raw?.total_extension_price));
    const fuelChargeRevenue = Math.max(
      0,
      this.toNumber(raw?.fuel_charge_enabled === false ? 0 : raw?.fuel_charge)
    );
    const lateFeeRevenue = Math.max(0, this.toNumber(raw?.late_fee_amount || raw?.late_fee));
    const impoundRevenue = Math.max(0, this.toNumber(raw?.impound_total));
    const maintenanceRevenue = this.getRentalMaintenanceRevenueAmount(raw, report, linkedMaintenance);
    const fuelSurplusRevenue = this.getRentalFuelSurplusRevenueAmount(raw);

    return {
      baseRevenue,
      transportRevenue,
      overageRevenue,
      extensionRevenue,
      fuelChargeRevenue,
      fuelSurplusRevenue,
      lateFeeRevenue,
      impoundRevenue,
      maintenanceRevenue,
      total:
        baseRevenue +
        transportRevenue +
        overageRevenue +
        extensionRevenue +
        fuelChargeRevenue +
        fuelSurplusRevenue +
        lateFeeRevenue +
        impoundRevenue +
        maintenanceRevenue
    };
  }

  private getReportCustomerChargeAmount(report: any): number {
    if (!report || report.customer_chargeable === false) return 0;

    const enabled = report.maintenance_daily_enabled !== false;
    const days = Math.max(0, parseInt(report.maintenance_daily_days || 0, 10) || 0);
    const rate = Math.max(0, Number(report.maintenance_daily_rate || 0));
    const discount = Math.max(0, Number(report.maintenance_daily_discount || 0));
    const savedTotal = Math.max(0, Number(report.maintenance_daily_total || 0));
    const stayCharge = enabled
      ? Math.max(0, savedTotal || ((days * rate) - discount))
      : 0;
    const repairCharge = Math.max(0, Number(report.maintenance_cost_total || 0));

    return Math.max(0, Number(report.customer_charge_amount || 0) || (repairCharge + stayCharge));
  }

  private getRentalMaintenanceRevenueAmount(raw: any, report: any, linkedMaintenance: any): number {
    if (report) {
      return this.getReportCustomerChargeAmount(report);
    }

    const snapshotCustomerCharge = Math.max(0, this.toNumber(raw?.linked_maintenance_customer_charge_total));
    if (snapshotCustomerCharge > 0) {
      return snapshotCustomerCharge;
    }

    return Math.max(0, this.toNumber(linkedMaintenance?.revenue));
  }

  private getRentalFuelExpenseAmount(raw: any): number {
    const snapshotExpense = Math.max(0, this.toNumber(raw?.linked_fuel_expense_total));
    if (snapshotExpense > 0) {
      return snapshotExpense;
    }

    const startFuelLevel = raw?.start_fuel_level;
    const endFuelLevel = raw?.end_fuel_level;
    if (startFuelLevel === null || startFuelLevel === undefined || endFuelLevel === null || endFuelLevel === undefined) {
      return 0;
    }

    const consumedLiters = Math.max(0, this.toNumber(raw?.linked_fuel_consumed_liters));
    const averageUnitCost = Math.max(0, this.toNumber(raw?.linked_fuel_average_unit_cost));
    return Math.round(consumedLiters * averageUnitCost);
  }

  private buildRentalPLRow(rental: any, context: FinanceContext): RentalPLRow {
    const labels = this.getVehicleLabel(context.vehicleMap.get(String(rental.vehicleId)));
    const fuelCosts = Math.round(
      rental.linkedFuelExpenseTotal > 0
        ? rental.linkedFuelExpenseTotal
        : this.getFuelCostForVehicleInRange(context, rental.vehicleId, rental.startAt, rental.endAt)
    );
    const revenueBreakdown = rental.revenueBreakdown || {
      baseRevenue: Math.max(0, this.toNumber(rental.revenue)),
      transportRevenue: 0,
      overageRevenue: 0,
      extensionRevenue: 0,
      fuelChargeRevenue: 0,
      fuelSurplusRevenue: 0,
      lateFeeRevenue: 0,
      impoundRevenue: 0,
      maintenanceRevenue: 0,
      total: Math.max(0, this.toNumber(rental.revenue))
    };
    const revenue = Math.round(Math.max(0, this.toNumber(rental.revenue)));
    const maintenanceCosts = Math.round(this.toNumber(rental.linkedMaintenanceCosts));
    const partsConsumedCost = Math.round(this.toNumber(rental.linkedPartsConsumedCosts));
    const inventoryCosts = Math.round(this.toNumber(rental.linkedInventoryCosts));
    const taxes = Math.round(this.toNumber(rental.linkedMaintenanceTaxes));
    const totalCosts = maintenanceCosts + fuelCosts + inventoryCosts;
    const grossProfit = revenue - totalCosts - taxes;

    const maintenanceReference = this.formatMaintenanceReference(
      rental.raw?.linked_maintenance_id || rental.raw?.maintenance_reference || null
    );
    const startFuelLevel = this.toNumber(rental.raw?.start_fuel_level);
    const endFuelLevel = this.toNumber(rental.raw?.end_fuel_level);
    const fuelVarianceLiters = Math.round((((endFuelLevel - startFuelLevel) / 8) * 23) * 100) / 100;
    const discountAmount = Math.round(
      Math.max(0, this.toNumber(rental.raw?.linked_maintenance_daily_discount)) +
      Math.max(0, this.toNumber(rental.raw?.impound_discount))
    );

    return {
      id: rental.id,
      rentalId: rental.rentalId,
      customer: rental.customerName,
      vehicleDisplay: labels.vehicleDisplay,
      plateNumber: labels.plateNumber,
      vehicleModel: labels.vehicleModel,
      revenue,
      baseRevenue: Math.round(this.toNumber(revenueBreakdown.baseRevenue)),
      transportRevenue: Math.round(this.toNumber(revenueBreakdown.transportRevenue)),
      overageRevenue: Math.round(this.toNumber(revenueBreakdown.overageRevenue)),
      extensionRevenue: Math.round(this.toNumber(revenueBreakdown.extensionRevenue)),
      fuelChargeRevenue: Math.round(this.toNumber(revenueBreakdown.fuelChargeRevenue)),
      fuelSurplusRevenue: Math.round(this.toNumber(revenueBreakdown.fuelSurplusRevenue)),
      lateFeeRevenue: Math.round(this.toNumber(revenueBreakdown.lateFeeRevenue)),
      impoundRevenue: Math.round(this.toNumber(revenueBreakdown.impoundRevenue)),
      maintenanceRevenue: Math.round(this.toNumber(revenueBreakdown.maintenanceRevenue)),
      discountAmount,
      maintenanceReference,
      fuelVarianceLiters,
      partsConsumedCost,
      maintenanceCosts,
      fuelCosts,
      inventoryCosts,
      otherCosts: 0,
      totalCosts,
      taxes,
      grossProfit: Math.round(grossProfit),
      profitPercent: revenue > 0 ? Math.round((grossProfit / revenue) * 1000) / 10 : 0,
      closedAt: rental.closedAt || rental.recognizedAt,
      financeDate: rental.financeDate || rental.closedAt || rental.startAt || rental.recognizedAt,
      vehicleId: rental.vehicleId,
      customerId: rental.customerId,
      status: rental.status,
      payment_status: rental.paymentStatus,
      remainingAmount: Math.round(rental.remainingAmount)
    };
  }

  private buildTourPLRowsFromContext(context: FinanceContext, filters: FinanceFiltersV2): TourPLRow[] {
    const grouped = new Map<string, any[]>();

    context.tours
      .filter((tour) => this.rentalMatchesFilters(tour, filters))
      .forEach((tour) => {
        const key = String(tour.groupId || tour.rentalId || tour.id);
        const current = grouped.get(key) || [];
        current.push(tour);
        grouped.set(key, current);
      });

    return Array.from(grouped.entries()).map(([groupId, tours]) => {
      const first = tours[0];
      const vehicleIds = Array.from(new Set(tours.flatMap((tour) => {
        const ids = Array.isArray(tour.vehicleIds) ? tour.vehicleIds : [];
        return [tour.vehicleId, ...ids].map((vehicleId) => String(vehicleId || '')).filter(Boolean);
      })));
      const vehicleLabels = vehicleIds.map((vehicleId) => this.getVehicleLabel(context.vehicleMap.get(vehicleId)));
      const plateNumbers = vehicleLabels.map((label) => label.plateNumber).filter(Boolean);
      const modelLabels = Array.from(new Set(vehicleLabels.map((label) => label.vehicleModel).filter(Boolean)));
      const tourSnapshots = context.tourVehicleSnapshots.filter((snapshot: any) => String(snapshot.tour_group_id || '') === String(groupId));
      const baseRevenue = Math.round(tours.reduce((sum, tour) => sum + this.toNumber(tour.revenue), 0));
      const fuelTotals = this.getTourFuelTotals(tours, tourSnapshots, context.averageTankUnitCost);
      const fuelVehicleBreakdown = this.buildTourFuelVehicleBreakdown(tours, tourSnapshots, context.vehicleMap, context.averageTankUnitCost);
      const fuelSurplusRevenue = Math.round(fuelTotals.fuelSurplusRevenue);
      const revenue = Math.round(baseRevenue + fuelSurplusRevenue);
      const fuelCosts = Math.round(
        fuelTotals.hasFuelSignal
          ? fuelTotals.fuelCosts
          : vehicleIds.reduce((sum, vehicleId) => {
              return sum + this.getFuelCostForVehicleInRange(context, vehicleId, first.startAt, first.endAt);
            }, 0)
      );
      const maintenanceCosts = 0;
      const otherCosts = 0;
      const totalCosts = fuelCosts + maintenanceCosts + otherCosts;
      const grossProfit = revenue - totalCosts;
      const closedAt = tours
        .map((tour) => tour.closedAt || tour.endAt || tour.financeDate || tour.startAt)
        .filter(Boolean)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || first.closedAt || first.endAt || first.startAt;
      const financeDate = tours
        .map((tour) => tour.financeDate || tour.startAt || tour.closedAt)
        .filter(Boolean)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || first.financeDate || first.startAt;

      return {
        id: groupId,
        tourId: groupId,
        customer: first.customerName,
        vehicleDisplay: plateNumbers.join(', ') || 'N/A',
        plateNumber: plateNumbers.join(', ') || 'N/A',
        vehicleModel: modelLabels.join(', ') || first.packageName || 'Tour package',
        revenue,
        baseRevenue,
        fuelSurplusRevenue,
        fuelVarianceLiters: Math.round(fuelTotals.fuelVarianceLiters * 100) / 100,
        fuelConsumedLiters: Math.round(fuelTotals.consumedLiters * 100) / 100,
        fuelSurplusLiters: Math.round(fuelTotals.surplusLiters * 100) / 100,
        fuelUnitCost: Math.round(fuelTotals.fuelUnitCost * 100) / 100,
        fuelCosts,
        maintenanceCosts,
        otherCosts,
        totalCosts,
        grossProfit: Math.round(grossProfit),
        profitPercent: revenue > 0 ? Math.round((grossProfit / revenue) * 1000) / 10 : 0,
        closedAt,
        financeDate,
        vehicleIds,
        customerId: first.customerId,
        status: first.status,
        payment_status: first.paymentStatus,
        remainingAmount: Math.round(tours.reduce((sum, tour) => sum + this.toNumber(tour.remainingAmount), 0)),
        guideName: first.guideName || '',
        packageName: first.packageName || 'Tour package',
        routeType: first.routeType || 'tour',
        quadCount: vehicleIds.length || tours.length,
        fuelVehicleBreakdown,
      };
    });
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

  private async safeLoadTable(
    tableName: string,
    columns: string = '*',
    maxRows: number = 5000,
    options: {
      skipTenantScope?: boolean;
      skipTenantVerification?: boolean;
    } = {}
  ): Promise<any[]> {
    if (this.tableExistenceCache.get(tableName) === false) return [];

    try {
      const {
        skipTenantScope = false,
        skipTenantVerification = false,
      } = options;
      if (!skipTenantScope) {
        await this.ensureTenantWorkspaceReady(tableName);
      }
      let query = supabase.from(tableName).select(columns).limit(maxRows);
      if (!skipTenantScope) {
        query = await scopeTenantOwnedQuery(query, tableName, {
          message: `Workspace organization context is required to load ${tableName}.`,
        });
      }

      const { data, error } = await query;
      if (error) {
        console.warn(`Unable to load ${tableName}:`, error.message);
        if (error.code === '42P01' || /does not exist/i.test(error.message || '')) {
          this.tableExistenceCache.set(tableName, false);
        } else if (columns !== '*' && /column|schema cache|could not find/i.test(error.message || '')) {
          let fallbackQuery = supabase.from(tableName).select('*').limit(maxRows);
          if (!skipTenantScope) {
            fallbackQuery = await scopeTenantOwnedQuery(fallbackQuery, tableName, {
              message: `Workspace organization context is required to load ${tableName}.`,
            });
          }
          const fallback = await fallbackQuery;
          if (!fallback.error) {
            this.tableExistenceCache.set(tableName, true);
            return fallback.data || [];
          }
        }
        return [];
      }
      this.tableExistenceCache.set(tableName, true);
      if (!skipTenantVerification) {
        await verifyTenantOwnedRows(data || [], tableName, {
          message: `${tableName} returned rows outside the active workspace.`,
        });
      }
      return data || [];
    } catch (error) {
      console.warn(`Unable to load ${tableName}:`, error);
      return [];
    }
  }

  private async loadRentalFuelSnapshots(limit = 250): Promise<any[]> {
    try {
      await this.ensureTenantWorkspaceReady('rental fuel snapshots');
      let query = supabase
        .from('app_4c3a7a6153_rentals')
        .select(FINANCE_RENTAL_FUEL_SNAPSHOT_COLUMNS)
        .gt('linked_fuel_consumed_liters', 0)
        .or('linked_fuel_expense_total.gt.0,linked_fuel_average_unit_cost.gt.0')
        .order('linked_fuel_synced_at', { ascending: false })
        .limit(limit);
      query = await scopeTenantOwnedQuery(query, 'app_4c3a7a6153_rentals', {
        message: 'Workspace organization context is required to load rental fuel snapshots.',
      });

      const { data, error } = await query;

      if (error) {
        console.warn('Unable to load rental fuel snapshots:', error.message);
        return [];
      }

      await verifyTenantOwnedRows(data || [], 'app_4c3a7a6153_rentals', {
        message: 'Rental fuel snapshots returned rows outside the active workspace.',
      });

      return data || [];
    } catch (error) {
      console.warn('Unable to load rental fuel snapshots:', error);
      return [];
    }
  }

  private buildFinanceContext(
    rawRentals: any[],
    rawVehicles: any[],
    rawVehicleReports: any[],
    maintenance: any[],
    maintenanceParts: any[],
    inventoryItems: any[],
    rawFinanceExpenses: any[],
    rawFuelRefills: any[],
    rawVehicleFuelRefills: any[],
    fuelWithdrawals: any[],
    rawRentalFuelSnapshots: any[],
    rawTourBookings: any[],
    rawTourVehicleSnapshots: any[] = []
  ): FinanceContext {
    const vehicles: Vehicle[] = rawVehicles.map((vehicle: any, index: number) => {
      const plateNumber =
        vehicle.plate_number ||
        vehicle.plate ||
        vehicle.license_plate ||
        vehicle.registration_number ||
        vehicle.vehicle_number ||
        `PLATE-${index + 1}`;
      const make = vehicle.make || vehicle.brand || vehicle.name || 'SEGWAY';
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
    const reportByRentalId = new Map<string, any>();
    const inventoryItemMap = new Map<string, any>(inventoryItems.map((item: any) => [String(item.id), item]));
    const maintenancePartsByMaintenanceId = new Map<string, any[]>();
    const rentalReferenceLookup = new Map<string, string>();
    const rentalRecordIdLookup = new Map<string, string>();

    rawRentals.forEach((rental: any) => {
      const publicReference = String(rental.rental_id || rental.linked_display_id || rental.id || '').trim();
      const recordId = String(rental.id || '').trim();

      [recordId, rental.rental_id, rental.linked_display_id]
        .filter(Boolean)
        .forEach((key: any) => {
          const normalizedKey = this.normalizeRentalReference(key);
          if (!normalizedKey) return;
          if (publicReference) {
            rentalReferenceLookup.set(normalizedKey, publicReference.toUpperCase());
          }
          if (recordId) {
            rentalRecordIdLookup.set(normalizedKey, recordId);
          }
        });
    });

    rawVehicleReports.forEach((report: any) => {
      const rentalKey = this.normalizeRentalReference(report.rental_id);
      if (!rentalKey) return;
      const existing = reportByRentalId.get(rentalKey);
      const existingTimestamp = existing ? new Date(existing.updated_at || existing.created_at || 0).getTime() : 0;
      const nextTimestamp = new Date(report.updated_at || report.created_at || 0).getTime();
      if (!existing || nextTimestamp >= existingTimestamp) {
        reportByRentalId.set(rentalKey, report);
      }
    });

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

      const partsCost = Math.max(this.toNumber(record.parts_cost_mad), partsCostFromLines);
      const tax = this.toNumber(record.tax_mad);
      const totalCost =
        this.toNumber(record.cost) ||
        (partsCost +
          this.toNumber(record.labor_rate_mad) +
          this.toNumber(record.external_cost_mad) +
          tax);
      const maintenanceCost = Math.max(0, totalCost);
      const partsConsumedCost = Math.max(0, partsCost);
      const inventoryCost = 0;
      const partsMargin = Math.max(0, partsSellTotal - partsCost);
      const rawLinkedRentalLookupValue =
        this.extractRentalLookupValue(record.rental_id) ||
        this.extractRentalLookupValue(record.description);
      const normalizedLinkedRentalLookupValue = rawLinkedRentalLookupValue
        ? this.normalizeRentalReference(rawLinkedRentalLookupValue)
        : '';
      const linkedRentalReference = normalizedLinkedRentalLookupValue
        ? rentalReferenceLookup.get(normalizedLinkedRentalLookupValue) ||
          this.parseLinkedRentalId(rawLinkedRentalLookupValue)
        : this.parseLinkedRentalId(record.rental_id || record.description);
      const linkedRentalRecordId = normalizedLinkedRentalLookupValue
        ? rentalRecordIdLookup.get(normalizedLinkedRentalLookupValue) || null
        : null;
      const linkedRentalId = linkedRentalReference ? this.normalizeRentalReference(linkedRentalReference) : null;
      const description = this.summarizeMaintenanceDescription(record.description, linkedRentalReference || null);

      return {
        id: String(record.id),
        vehicleId: String(record.vehicle_id || ''),
        date:
          this.normalizeDate(record.service_date) ||
          this.normalizeDate(record.completed_date) ||
          this.normalizeDate(record.created_at),
        linkedRentalId,
        maintenanceCost,
        partsConsumedCost,
        inventoryCost,
        tax,
        totalCost,
        partsMargin,
        billedRevenue: linkedRentalId ? totalCost + partsMargin : 0,
        description,
        status: record.status || 'scheduled',
        linkedRentalReference: linkedRentalReference || null,
        linkedRentalRecordId
      };
    });

    const maintenanceByRentalId = new Map<string, any>();
    maintenanceFinance.forEach((record) => {
      if (!record.linkedRentalId) return;
      const normalizedRentalId = this.normalizeRentalReference(record.linkedRentalId);
      const existing = maintenanceByRentalId.get(normalizedRentalId) || {
        revenue: 0,
        maintenanceCost: 0,
        partsConsumedCost: 0,
        inventoryCost: 0,
        tax: 0,
        partsMargin: 0
      };
      existing.revenue += record.billedRevenue;
      existing.maintenanceCost += record.maintenanceCost;
      existing.partsConsumedCost = (existing.partsConsumedCost || 0) + (record.partsConsumedCost || 0);
      existing.inventoryCost += record.inventoryCost;
      existing.tax += record.tax;
      existing.partsMargin += record.partsMargin;
      maintenanceByRentalId.set(normalizedRentalId, existing);
    });

    const fuelRefills = this.normalizeFuelRefillRows(rawFuelRefills, rawVehicleFuelRefills);

    const tankRefillRows = fuelRefills.filter((row: any) => !row.vehicle_id);
    const pricedTransferRows = (fuelWithdrawals || []).filter((row: any) => this.getFuelUnitPrice(row) > 0 || this.toNumber(row.total_cost) > 0);
    const pricedFuelRows = fuelRefills.filter((row: any) => this.getFuelUnitPrice(row) > 0 || this.toNumber(row.total_cost) > 0);
    const rentalFuelSnapshotRows = [...(rawRentalFuelSnapshots || []), ...(rawRentals || [])]
      .filter((row: any) => this.toNumber(row.linked_fuel_average_unit_cost) > 0 && this.toNumber(row.linked_fuel_consumed_liters) > 0)
      .map((row: any) => ({
        liters: row.linked_fuel_consumed_liters,
        unit_price: row.linked_fuel_average_unit_cost,
        total_cost: this.toNumber(row.linked_fuel_expense_total)
      }));
    const averageTankUnitCost =
      this.calculateWeightedFuelUnitCost(tankRefillRows) ||
      this.calculateWeightedFuelUnitCost(pricedTransferRows) ||
      this.calculateWeightedFuelUnitCost(pricedFuelRows) ||
      this.calculateWeightedFuelUnitCost(rentalFuelSnapshotRows);

    const rentals = rawRentals
      .filter((rental: any) => !this.parseTourBookingMeta(rental.notes))
      .map((rental: any) => {
        const rentalId = this.normalizeRentalReference(rental.rental_id || rental.linked_display_id || rental.id);
        const customerName =
          rental.customer_name ||
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
          partsConsumedCost: 0,
          inventoryCost: 0,
          tax: 0,
          partsMargin: 0
        };
        const linkedVehicleReport = reportByRentalId.get(rentalId) || null;
        const revenueBreakdown = this.getRentalRevenueBreakdown(
          rental,
          linkedVehicleReport,
          linkedMaintenance
        );
        const billedAmount = Math.max(0, Math.round(this.toNumber(revenueBreakdown.total)));
        const collectedAmount = Math.max(0, Math.round(this.toNumber(getRentalCustomerPaidAmount(rental))));
        const recognizedAt = this.getRecognizedIncomingDate(
          rental,
          rental.rental_start_date || rental.created_at
        );
        const hasStoredRemainingAmount =
          rental.remaining_amount !== null &&
          rental.remaining_amount !== undefined &&
          rental.remaining_amount !== '';
        const remainingAmount = Math.max(
          0,
          Math.round(
            hasStoredRemainingAmount
              ? this.toNumber(rental.remaining_amount)
              : Math.max(0, billedAmount - collectedAmount)
          )
        );

        return {
          raw: rental,
          id: String(rental.id),
          rentalId,
          customerName,
          customerId,
          vehicleId: String(rental.vehicle_id || ''),
          status: rental.rental_status || rental.status || 'scheduled',
          paymentStatus: normalizePaymentStatus(rental.payment_status, rental.remaining_amount),
          revenue: collectedAmount,
          billedRevenue: billedAmount,
          revenueBreakdown,
          recognizedAt,
          paidAmount: collectedAmount,
          remainingAmount,
          refundAmount: normalizePaymentStatus(rental.payment_status, rental.remaining_amount) === 'refunded' ? this.toNumber(rental.total_amount) : 0,
          linkedMaintenanceRevenue: revenueBreakdown.maintenanceRevenue,
          linkedMaintenanceCosts: linkedMaintenance.maintenanceCost,
          linkedPartsConsumedCosts: linkedMaintenance.partsConsumedCost || 0,
          linkedInventoryCosts: linkedMaintenance.inventoryCost,
          linkedFuelExpenseTotal: this.getRentalFuelExpenseAmount(rental),
          linkedMaintenanceTaxes: linkedMaintenance.tax,
          linkedPartsMargin: linkedMaintenance.partsMargin,
          startAt: rental.rental_start_date || rental.created_at,
          financeDate:
            rental.completed_at ||
            rental.rental_completed_at ||
            rental.actual_end_date ||
            rental.rental_end_date ||
            rental.rental_start_date ||
            rental.created_at ||
            recognizedAt,
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
        const billedAmount = this.getTourBilledAmount(row, meta);
        const recognizedAmount = this.getRecognizedIncomingAmount(row, billedAmount);

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
          meta,
          id: String(row.id),
          rentalId: String(meta.groupId),
          groupId: String(meta.groupId),
          customerName,
          customerId,
          vehicleId: String(row.vehicle_id || ''),
          vehicleIds: Array.from(new Set([
            row.vehicle_id,
            ...(Array.isArray(meta.assignedVehicleIds) ? meta.assignedVehicleIds : [])
          ].filter(Boolean).map((vehicleId: any) => String(vehicleId)))),
          status: row.rental_status || 'scheduled',
          paymentStatus: normalizePaymentStatus(row.payment_status, row.remaining_amount),
          revenue: recognizedAmount,
          billedAmount,
          recognizedAt: this.getRecognizedIncomingDate(row, meta.scheduledStartAt || row.created_at),
          paidAmount: Math.max(0, this.toNumber(row.deposit_amount)),
          remainingAmount: Math.max(
            0,
            row.remaining_amount !== null && row.remaining_amount !== undefined && row.remaining_amount !== ''
              ? this.toNumber(row.remaining_amount)
              : (billedAmount - recognizedAmount)
          ),
          refundAmount: normalizePaymentStatus(row.payment_status, row.remaining_amount) === 'refunded' ? this.toNumber(row.total_amount) : 0,
          startAt: meta.scheduledStartAt || row.rental_start_date || row.created_at,
          financeDate:
            meta.completedAt ||
            row.completed_at ||
            meta.scheduledStartAt ||
            row.rental_start_date ||
            row.created_at,
          endAt: meta.scheduledEndAt || row.rental_end_date || row.updated_at || row.created_at,
          closedAt:
            meta.completedAt ||
            row.completed_at ||
            meta.scheduledEndAt ||
            row.updated_at ||
            row.created_at,
          guideName: meta.guideName || '',
          packageName: meta.packageName || 'Tour package',
          routeType: meta.routeType || 'tour'
        };
      })
      .filter(Boolean);

    return {
      rentals,
      tours,
      vehicles,
      vehicleMap,
      vehicleReports: rawVehicleReports,
      reportByRentalId,
      maintenanceFinance,
      maintenanceByRentalId,
      financeExpenses: Array.isArray(rawFinanceExpenses) ? rawFinanceExpenses : [],
      fuelRefills,
      fuelWithdrawals,
      tourVehicleSnapshots: rawTourVehicleSnapshots,
      averageTankUnitCost
    };
  }

  private async getFinanceOverviewContext(): Promise<FinanceContext> {
    const cacheAge = Date.now() - this.financeOverviewContextLoadedAt;
    if (this.financeOverviewContextPromise && cacheAge < 30_000) {
      return this.financeOverviewContextPromise;
    }

    this.financeOverviewContextPromise = (async () => {
      try {
        const [
          rawRentals,
          rawVehicles,
          rawVehicleReports,
          maintenance,
          maintenanceParts,
          inventoryItems,
          financeExpenses,
          rawFuelRefills,
          fuelRefills,
          fuelWithdrawals,
          rawRentalFuelSnapshots,
          rawTourVehicleSnapshots,
          rawTourBookings
        ] = await Promise.all([
          this.loadOptionalContextSlice(
            this.safeLoadTable(
              'app_4c3a7a6153_rentals',
              FINANCE_RENTAL_COLUMNS,
              5000,
              { skipTenantVerification: true }
            ),
            [],
            'overview rentals'
          ),
          this.loadOptionalContextSlice(
            this.safeLoadTable(
              'saharax_0u4w4d_vehicles',
              FINANCE_VEHICLE_COLUMNS
            ),
            [],
            'overview vehicles'
          ),
          this.loadOptionalContextSlice(
            this.safeLoadTable(
              VEHICLE_REPORTS_TABLE,
              '*',
              5000,
              FINANCE_OPTIONAL_UNSCOPED_TABLE_OPTIONS
            ),
            [],
            'overview vehicle reports'
          ),
          this.loadOptionalContextSlice(
            this.safeLoadTable(
              'app_687f658e98_maintenance',
              FINANCE_MAINTENANCE_COLUMNS
            ),
            [],
            'overview maintenance'
          ),
          this.loadOptionalContextSlice(
            this.safeLoadTable(
              'app_687f658e98_maintenance_parts',
              FINANCE_MAINTENANCE_PART_COLUMNS
            ),
            [],
            'overview maintenance parts'
          ),
          this.loadOptionalContextSlice(
            this.safeLoadTable(
              'saharax_0u4w4d_inventory_items',
              'id,price_mad',
              5000,
              FINANCE_OPTIONAL_UNSCOPED_TABLE_OPTIONS
            ),
            [],
            'overview inventory items'
          ),
          this.loadOptionalContextSlice(
            this.safeLoadTable('finance_expenses', FINANCE_EXPENSE_COLUMNS),
            [],
            'overview finance expenses'
          ),
          this.loadOptionalContextSlice(
            Promise.resolve([]),
            [],
            'overview fuel refills'
          ),
          this.loadOptionalContextSlice(
            this.safeLoadTable('vehicle_fuel_refills', FINANCE_FUEL_REFILL_COLUMNS),
            [],
            'overview vehicle fuel refills'
          ),
          this.loadOptionalContextSlice(
            this.safeLoadTable('fuel_withdrawals', FINANCE_FUEL_WITHDRAWAL_COLUMNS),
            [],
            'overview fuel withdrawals'
          ),
          this.loadOptionalContextSlice(
            this.loadRentalFuelSnapshots(),
            [],
            'overview rental fuel snapshots'
          ),
          this.loadOptionalContextSlice(
            this.safeLoadTable(
              'tour_vehicle_snapshots',
              '*',
              5000,
              FINANCE_OPTIONAL_UNSCOPED_TABLE_OPTIONS
            ),
            [],
            'overview tour vehicle snapshots'
          ),
          this.loadOptionalContextSlice(fetchTourBookings().catch(() => []), [], 'overview tour bookings'),
        ]);

        this.financeOverviewContextLoadedAt = Date.now();
        return this.buildFinanceContext(
          rawRentals,
          rawVehicles,
          rawVehicleReports,
          maintenance,
          maintenanceParts,
          inventoryItems,
          financeExpenses,
          rawFuelRefills,
          fuelRefills,
          fuelWithdrawals,
          rawRentalFuelSnapshots,
          rawTourBookings,
          rawTourVehicleSnapshots
        );
      } catch (error) {
        this.financeOverviewContextPromise = null;
        this.financeOverviewContextLoadedAt = 0;
        throw error;
      }
    })();

    return this.financeOverviewContextPromise;
  }

  private async getFinanceContext(): Promise<FinanceContext> {
    const cacheAge = Date.now() - this.financeContextLoadedAt;
    if (this.financeContextPromise && cacheAge < 30_000) {
      return this.financeContextPromise;
    }

    this.financeContextPromise = (async () => {
      try {
        const [
          rawRentals,
          rawVehicles,
          rawVehicleReports,
          maintenance,
          maintenanceParts,
          inventoryItems,
          financeExpenses,
          rawFuelRefills,
          fuelRefills,
          fuelWithdrawals,
          rawRentalFuelSnapshots,
          rawTourVehicleSnapshots,
          rawTourBookings
        ] = await Promise.all([
          this.loadOptionalContextSlice(
            this.safeLoadTable(
              'app_4c3a7a6153_rentals',
              FINANCE_RENTAL_COLUMNS,
              5000,
              { skipTenantVerification: true }
            ),
            [],
            'rentals'
          ),
          this.loadOptionalContextSlice(this.safeLoadTable('saharax_0u4w4d_vehicles', FINANCE_VEHICLE_COLUMNS), [], 'vehicles'),
          this.loadOptionalContextSlice(
            this.safeLoadTable(
              VEHICLE_REPORTS_TABLE,
              '*',
              5000,
              FINANCE_OPTIONAL_UNSCOPED_TABLE_OPTIONS
            ),
            [],
            'vehicle reports'
          ),
          this.loadOptionalContextSlice(this.safeLoadTable('app_687f658e98_maintenance', FINANCE_MAINTENANCE_COLUMNS), [], 'maintenance'),
          this.loadOptionalContextSlice(this.safeLoadTable('app_687f658e98_maintenance_parts', FINANCE_MAINTENANCE_PART_COLUMNS), [], 'maintenance parts'),
          this.loadOptionalContextSlice(
            this.safeLoadTable(
              'saharax_0u4w4d_inventory_items',
              '*',
              5000,
              FINANCE_OPTIONAL_UNSCOPED_TABLE_OPTIONS
            ),
            [],
            'inventory items'
          ),
          this.loadOptionalContextSlice(this.safeLoadTable('finance_expenses', FINANCE_EXPENSE_COLUMNS), [], 'finance expenses'),
          this.loadOptionalContextSlice(Promise.resolve([]), [], 'fuel refills'),
          this.loadOptionalContextSlice(this.safeLoadTable('vehicle_fuel_refills', FINANCE_FUEL_REFILL_COLUMNS), [], 'vehicle fuel refills'),
          this.loadOptionalContextSlice(this.safeLoadTable('fuel_withdrawals', FINANCE_FUEL_WITHDRAWAL_COLUMNS), [], 'fuel withdrawals'),
          this.loadOptionalContextSlice(this.loadRentalFuelSnapshots(), [], 'rental fuel snapshots'),
          this.loadOptionalContextSlice(
            this.safeLoadTable(
              'tour_vehicle_snapshots',
              '*',
              5000,
              FINANCE_OPTIONAL_UNSCOPED_TABLE_OPTIONS
            ),
            [],
            'tour vehicle snapshots'
          ),
          this.loadOptionalContextSlice(fetchTourBookings().catch(() => []), [], 'tour bookings'),
        ]);
        this.financeContextLoadedAt = Date.now();

        return this.buildFinanceContext(
          rawRentals,
          rawVehicles,
          rawVehicleReports,
          maintenance,
          maintenanceParts,
          inventoryItems,
          financeExpenses,
          rawFuelRefills,
          fuelRefills,
          fuelWithdrawals,
          rawRentalFuelSnapshots,
          rawTourBookings,
          rawTourVehicleSnapshots
        );
      } catch (error) {
        this.financeContextPromise = null;
        this.financeContextLoadedAt = 0;
        throw error;
      }
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

  private buildExpenseSubtitle(expense: any, context: FinanceContext) {
    const parts = [];
    if (expense?.vehicle_id) {
      parts.push(this.buildVehicleDisplay(String(expense.vehicle_id), context));
    }
    const category = String(expense?.category || '').trim();
    const subcategory = String(expense?.subcategory || '').trim();
    const categoryLabel = [category, subcategory].filter(Boolean).join(' • ');
    if (categoryLabel) parts.push(categoryLabel);
    return parts.join(' • ');
  }

  private isOverviewExpenseRow(row: any): boolean {
    if (row?.direction !== 'outgoing') return false;

    const sourceType = String(row?.sourceType || '');
    return [
      'fuel',
      'tank_in',
      'direct_fill',
      'transfer',
      'finance_expense',
      'expense',
      'manual_expense',
      'expense_manual',
    ].includes(sourceType);
  }

  private sumOverviewExpenses(rows: any[] = []): number {
    return rows
      .filter((row) => this.isOverviewExpenseRow(row))
      .reduce((sum, row) => sum + this.toNumber(row.amount), 0);
  }

  private rentalMatchesFilters(rental: any, filters: FinanceFiltersV2, lifetime = false) {
    const financeDate = rental.financeDate || rental.startAt || rental.recognizedAt || rental.closedAt || rental.endAt;
    if (!lifetime && !this.isDateInRange(financeDate, filters.startDate, filters.endDate)) {
      return false;
    }
    if (filters.vehicleIds?.length > 0) {
      const selectedVehicleIds = filters.vehicleIds.map(String);
      const rowVehicleIds = Array.from(new Set([
        rental.vehicleId,
        ...(Array.isArray(rental.vehicleIds) ? rental.vehicleIds : [])
      ].map((vehicleId) => String(vehicleId || '')).filter(Boolean)));
      if (!rowVehicleIds.some((vehicleId) => selectedVehicleIds.includes(vehicleId))) {
        return false;
      }
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
      const amount = this.getFuelAmount(row, context.averageTankUnitCost);
      return sum + amount;
    }, 0);

    const transferCost = context.fuelWithdrawals.reduce((sum: number, row: any) => {
      if (String(row.vehicle_id || '') !== String(vehicleId)) return sum;
      if (!this.isDateInRange(row.withdrawal_date || row.created_at, normalizedStart, normalizedEnd)) return sum;
      return sum + this.getFuelAmount(row, context.averageTankUnitCost);
    }, 0);

    return Math.round(directRefillCost + transferCost);
  }

  private getFuelMovementForVehicle(context: FinanceContext, vehicleId: string, startDate?: any, endDate?: any) {
    const normalizedStart = startDate ? this.normalizeDate(startDate) : null;
    const normalizedEnd = endDate ? this.normalizeDate(endDate) : null;
    const inRange = (value: any) => {
      if (!normalizedStart || !normalizedEnd) return true;
      return this.isDateInRange(value, normalizedStart, normalizedEnd);
    };

    const direct = context.fuelRefills.reduce((sum: any, row: any) => {
      if (String(row.vehicle_id || '') !== String(vehicleId)) return sum;
      if (!inRange(row.refill_date || row.created_at)) return sum;
      const liters = this.getFuelLiters(row);
      const cost = this.getFuelAmount(row, context.averageTankUnitCost);
      return {
        liters: sum.liters + Math.max(0, liters),
        cost: sum.cost + Math.max(0, cost)
      };
    }, { liters: 0, cost: 0 });

    return context.fuelWithdrawals.reduce((sum: any, row: any) => {
      if (String(row.vehicle_id || '') !== String(vehicleId)) return sum;
      if (!inRange(row.withdrawal_date || row.created_at)) return sum;
      const liters = this.getFuelLiters(row);
      const cost = this.getFuelAmount(row, context.averageTankUnitCost);
      return {
        liters: sum.liters + Math.max(0, liters),
        cost: sum.cost + Math.max(0, cost)
      };
    }, direct);
  }

  private getRentalFuelSnapshotForVehicle(context: FinanceContext, vehicleId: string, rentals: any[] = []) {
    const relevantRentals = rentals.filter((rental) => String(rental.vehicleId || '') === String(vehicleId));
    return relevantRentals.reduce((sum: any, rental: any) => {
      const raw = rental.raw || {};
      const snapshotCost = Math.max(0, this.toNumber(rental.linkedFuelExpenseTotal || raw.linked_fuel_expense_total));
      const consumedLiters = Math.max(0, this.toNumber(raw.linked_fuel_consumed_liters));
      const fallbackCost = this.getFuelCostForVehicleInRange(context, vehicleId, rental.startAt, rental.endAt);
      return {
        cost: sum.cost + (snapshotCost > 0 ? snapshotCost : fallbackCost),
        consumedLiters: sum.consumedLiters + consumedLiters
      };
    }, { cost: 0, consumedLiters: 0 });
  }

  private getTourVehicleIds(tour: any): string[] {
    return Array.from(new Set([
      tour?.vehicleId,
      ...(Array.isArray(tour?.vehicleIds) ? tour.vehicleIds : [])
    ].map((vehicleId) => String(vehicleId || '')).filter(Boolean)));
  }

  private tourIncludesVehicle(tour: any, vehicleId: string): boolean {
    return this.getTourVehicleIds(tour).includes(String(vehicleId));
  }

  private getTourVehicleRevenueShare(tour: any, vehicleId: string): number {
    const vehicleIds = this.getTourVehicleIds(tour);
    if (!vehicleIds.includes(String(vehicleId))) return 0;
    return this.toNumber(tour.revenue) / Math.max(vehicleIds.length, 1);
  }

  private getTourFuelSnapshotForVehicle(context: FinanceContext, vehicleId: string, tours: any[] = []) {
    const groupIds = new Set(tours.map((tour) => String(tour.groupId || tour.rentalId || tour.id || '')).filter(Boolean));
    const snapshots = context.tourVehicleSnapshots.filter((snapshot: any) => {
      if (String(snapshot.vehicle_id || '') !== String(vehicleId)) return false;
      if (groupIds.size === 0) return true;
      return groupIds.has(String(snapshot.tour_group_id || ''));
    });

    if (snapshots.length > 0) {
      return snapshots.reduce((sum: any, snapshot: any) => {
        const unitCost = this.toNumber(snapshot.fuel_unit_cost_snapshot) || context.averageTankUnitCost || 0;
        const consumedLiters = Math.max(0, this.toNumber(snapshot.fuel_consumed_liters));
        const cost = Math.max(0, this.toNumber(snapshot.fuel_expense_total) || (consumedLiters * unitCost));
        return {
          cost: sum.cost + cost,
          consumedLiters: sum.consumedLiters + consumedLiters
        };
      }, { cost: 0, consumedLiters: 0 });
    }

    return tours
      .filter((tour) => this.tourIncludesVehicle(tour, vehicleId))
      .reduce((sum: any, tour: any) => {
        const breakdown = this.buildTourFuelVehicleBreakdown([tour], [], context.vehicleMap, context.averageTankUnitCost)
          .find((row: any) => String(row.vehicleId || '') === String(vehicleId));
        return {
          cost: sum.cost + Math.max(0, this.toNumber(breakdown?.fuelCost)),
          consumedLiters: sum.consumedLiters + Math.max(0, this.toNumber(breakdown?.consumedLiters))
        };
      }, { cost: 0, consumedLiters: 0 });
  }

  private getVehicleFuelLifetimeSnapshot(context: FinanceContext, vehicleId: string, rentals: any[] = [], tours: any[] = []) {
    const rentalFuel = this.getRentalFuelSnapshotForVehicle(context, vehicleId, rentals);
    const tourFuel = this.getTourFuelSnapshotForVehicle(context, vehicleId, tours);
    const movementFuel = this.getFuelMovementForVehicle(context, vehicleId);
    const snapshotCost = rentalFuel.cost + tourFuel.cost;
    const snapshotLiters = rentalFuel.consumedLiters + tourFuel.consumedLiters;

    return {
      cost: Math.round(snapshotCost > 0 ? snapshotCost : movementFuel.cost),
      consumedLiters: Math.round(((snapshotLiters > 0 ? snapshotLiters : movementFuel.liters) || 0) * 100) / 100
    };
  }

  private getCompanyFuelExpenseInRange(context: FinanceContext, filters: FinanceFiltersV2) {
    const tankRefillExpense = context.fuelRefills.reduce((sum: number, row: any) => {
      if (row.vehicle_id) return sum;
      if (!this.isDateInRange(row.refill_date || row.created_at, filters.startDate, filters.endDate)) {
        return sum;
      }
      return sum + this.getFuelAmount(row);
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

  private getRentalRowsFromContext(context: FinanceContext, filters: FinanceFiltersV2): RentalPLRow[] {
    return context.rentals
      .filter((rental) => this.rentalMatchesFilters(rental, filters))
      .map((rental) => this.buildRentalPLRow(rental, context));
  }

  private getPeriodMetricsFromContext(context: FinanceContext, filters: FinanceFiltersV2) {
    const rentalRows = this.getRentalRowsFromContext(context, filters);
    const tourRows = this.buildTourPLRowsFromContext(context, filters);
    const maintenanceRows = context.maintenanceFinance.filter((record) => this.maintenanceMatchesFilters(record, filters));
    const standaloneMaintenanceRows = maintenanceRows.filter((row: any) => !row.linkedRentalId);
    const ledger = this.getUnifiedLedgerFromContext(context, filters);
    const maintenanceCosts = ledger.rows
      .filter((row) => row.direction === 'outgoing' && row.sourceType === 'maintenance')
      .reduce((sum, row) => sum + this.toNumber(row.amount), 0);
    const inventoryCosts = ledger.rows
      .filter((row) => row.direction === 'outgoing' && row.sourceType === 'inventory')
      .reduce((sum, row) => sum + this.toNumber(row.amount), 0);
    const fuelCosts = ledger.rows
      .filter((row) => row.direction === 'outgoing' && ['fuel', 'tank_in', 'direct_fill', 'transfer'].includes(String(row.sourceType || '')))
      .reduce((sum, row) => sum + this.toNumber(row.amount), 0);
    const financeExpenseCosts = ledger.rows
      .filter((row) => row.direction === 'outgoing' && ['finance_expense', 'expense', 'manual_expense', 'expense_manual'].includes(String(row.sourceType || '')))
      .reduce((sum, row) => sum + this.toNumber(row.amount), 0);
    const damageRecoveryRevenue = ledger.rows
      .filter((row) => row.direction === 'incoming' && row.sourceType === 'damage_recovery')
      .reduce((sum, row) => sum + this.toNumber(row.amount), 0);
    const partsMarginRevenue = maintenanceRows.reduce((sum: number, row: any) => sum + row.partsMargin, 0);
    const collectedWindow = this.getRentalCollectedWindowRange(filters);
    const rentalCollected = context.rentals
      .filter((rental) => this.rentalMatchesFilters(rental, filters, true))
      .filter((rental) => this.doesRentalIntersectCollectedWindow(rental, collectedWindow.start, collectedWindow.end))
      .reduce((sum, rental) => {
        const windowCollected = getRentalCollectedAmountInWindow(
          rental.raw || {},
          collectedWindow.start,
          collectedWindow.end
        );
        return sum + this.toNumber(windowCollected);
      }, 0);
    const totalCollected = rentalCollected;
    const totalOutstanding = rentalRows.reduce((sum, row) => sum + this.toNumber(row.remainingAmount), 0)
      + tourRows.reduce((sum, row) => sum + this.toNumber(row.remainingAmount), 0);
    const totalExpenses = this.sumOverviewExpenses(ledger.rows);
    const netCash = totalCollected - totalExpenses - ledger.taxesTotal;

    return {
      totalRevenue: Math.round(ledger.incomingTotal),
      totalCollected: Math.round(totalCollected),
      totalOutstanding: Math.round(totalOutstanding),
      netCash: Math.round(netCash),
      totalExpenses: Math.round(totalExpenses),
      maintenanceCosts: Math.round(maintenanceCosts),
      fuelCosts: Math.round(fuelCosts),
      inventoryCosts: Math.round(inventoryCosts),
      otherCosts: Math.round(financeExpenseCosts),
      taxes: Math.round(ledger.taxesTotal),
      grossProfit: Math.round(ledger.netTotal),
      damageRecoveryRevenue: Math.round(damageRecoveryRevenue),
      partsMarginRevenue: Math.round(partsMarginRevenue)
    };
  }

  private getTrendDataFromContext(context: FinanceContext, filters: FinanceFiltersV2): TrendData[] {
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

    const rentalRows = this.getRentalRowsFromContext(context, filters);
    rentalRows.forEach((row) => {
      const date = this.normalizeDate(row.financeDate || row.closedAt);
      if (!date || !daily.has(date)) return;
      const entry = ensureDay(date);
      entry.revenue += row.revenue;
      entry.maintenanceCosts += row.maintenanceCosts;
      entry.fuelCosts += row.fuelCosts;
      entry.inventoryCosts += row.inventoryCosts;
      entry.taxes += row.taxes;
      entry.expenses += row.fuelCosts;
      entry.grossRevenue += row.revenue;
      entry.netRevenue += row.grossProfit;
    });

    this.buildTourPLRowsFromContext(context, filters)
      .forEach((tour) => {
        const date = this.normalizeDate(tour.financeDate || tour.closedAt);
        if (!date || !daily.has(date)) return;
        const entry = ensureDay(date);
        entry.revenue += tour.revenue;
        entry.fuelCosts += tour.fuelCosts;
        entry.expenses += tour.fuelCosts;
        entry.grossRevenue += tour.revenue;
        entry.netRevenue += tour.grossProfit;
      });

    context.maintenanceFinance
      .filter((record) => this.maintenanceMatchesFilters(record, filters))
      .filter((record) => !record.linkedRentalId)
      .forEach((record) => {
        const date = this.normalizeDate(record.date);
        if (!date || !daily.has(date)) return;
        const entry = ensureDay(date);
        entry.maintenanceCosts += record.maintenanceCost;
        entry.inventoryCosts += record.inventoryCost;
        entry.taxes += record.tax;
        entry.revenue += record.billedRevenue;
        entry.grossRevenue += record.billedRevenue;
        entry.netRevenue += record.billedRevenue - record.maintenanceCost - record.inventoryCost - record.tax;
      });

    context.financeExpenses
      .filter((expense: any) => String(expense?.status || 'active').toLowerCase() !== 'reversed')
      .filter((expense: any) => this.isDateInRange(expense.expense_date || expense.created_at, filters.startDate, filters.endDate))
      .filter((expense: any) => {
        if (filters.vehicleIds.length === 0) return true;
        return expense.vehicle_id && filters.vehicleIds.map(String).includes(String(expense.vehicle_id));
      })
      .forEach((expense: any) => {
        const date = this.normalizeDate(expense.expense_date || expense.created_at);
        if (!date || !daily.has(date)) return;
        const amount = Math.round(this.toNumber(expense.amount));
        if (amount <= 0) return;
        const entry = ensureDay(date);
        entry.expenses += amount;
        entry.netRevenue -= amount;
      });

    context.fuelRefills.forEach((row: any) => {
      const date = this.normalizeDate(row.refill_date || row.created_at);
      if (!date || !daily.has(date)) return;
      if (selectedVehicleIds.length > 0) {
        if (!row.vehicle_id || !selectedVehicleIds.includes(String(row.vehicle_id))) return;
      }
      const amount = this.getFuelAmount(row, context.averageTankUnitCost);
      if (amount <= 0) return;
      const entry = ensureDay(date);
      entry.expenses += amount;
      entry.fuelCosts += amount;
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

  private getUnifiedLedgerFromContext(context: FinanceContext, filters: FinanceFiltersV2): FinanceLedgerData {
    const rows: FinanceBreakdownRow[] = [];
    const rentalRows = this.getRentalRowsFromContext(context, filters);

    rentalRows.forEach((row) => {
      if (row.revenue > 0) {
        rows.push({
          id: `ledger-rental-revenue-${row.id}`,
          title: `Rental ${row.rentalId}`,
          subtitle: `${row.customer} • ${row.vehicleDisplay}`,
          amount: Math.round(row.revenue),
          direction: 'incoming',
          date: this.normalizeDate(row.financeDate || row.closedAt),
          sourceType: 'rental',
          rentalId: row.rentalId,
          vehicleId: row.vehicleId,
          href: `/admin/rentals/${row.id}`,
          meta: {
            paymentStatus: row.payment_status,
            status: row.status
          }
        });
      }

      if (row.maintenanceCosts > 0) {
        rows.push({
          id: `ledger-rental-maintenance-${row.id}`,
          title: `Maintenance cost • ${row.rentalId}`,
          subtitle: row.vehicleDisplay,
          amount: Math.round(row.maintenanceCosts),
          direction: 'outgoing',
          date: this.normalizeDate(row.financeDate || row.closedAt),
          sourceType: 'maintenance',
          rentalId: row.rentalId,
          vehicleId: row.vehicleId,
          href: `/admin/rentals/${row.id}`,
          meta: {
            partsConsumedCost: Math.round(row.partsConsumedCost || 0)
          }
        });
      }

      if (row.fuelCosts > 0) {
        rows.push({
          id: `ledger-rental-fuel-${row.id}`,
          title: `Fuel cost • ${row.rentalId}`,
          subtitle: row.vehicleDisplay,
          amount: Math.round(row.fuelCosts),
          direction: 'outgoing',
          date: this.normalizeDate(row.financeDate || row.closedAt),
          sourceType: 'fuel',
          rentalId: row.rentalId,
          vehicleId: row.vehicleId,
          href: `/admin/rentals/${row.id}`
        });
      }

      if (row.inventoryCosts > 0) {
        rows.push({
          id: `ledger-rental-inventory-${row.id}`,
          title: `Inventory cost • ${row.rentalId}`,
          subtitle: row.vehicleDisplay,
          amount: Math.round(row.inventoryCosts),
          direction: 'outgoing',
          date: this.normalizeDate(row.financeDate || row.closedAt),
          sourceType: 'inventory',
          rentalId: row.rentalId,
          vehicleId: row.vehicleId,
          href: `/admin/rentals/${row.id}`
        });
      }

      if (row.taxes > 0) {
        rows.push({
          id: `ledger-rental-tax-${row.id}`,
          title: `Taxes • ${row.rentalId}`,
          subtitle: row.vehicleDisplay,
          amount: Math.round(row.taxes),
          direction: 'tax',
          date: this.normalizeDate(row.financeDate || row.closedAt),
          sourceType: 'tax',
          rentalId: row.rentalId,
          vehicleId: row.vehicleId,
          href: `/admin/rentals/${row.id}`
        });
      }
    });

    context.tours
      .filter((tour) => this.rentalMatchesFilters(tour, filters))
      .forEach((tour) => {
        const amount = Math.round(this.toNumber(tour.revenue));
        if (amount <= 0) return;
        rows.push({
          id: `ledger-tour-${tour.id}`,
          title: tour.packageName || 'Tour booking',
          subtitle: `${tour.customerName}${tour.guideName ? ` • ${tour.guideName}` : ''}`,
          amount,
          direction: 'incoming',
          date: this.normalizeDate(tour.financeDate || tour.startAt || tour.closedAt || tour.endAt),
          sourceType: 'tour',
          rentalId: tour.rentalId,
          vehicleId: tour.vehicleId,
          href: '/admin/tours',
          meta: {
            routeType: tour.routeType || 'tour'
          }
        });
      });

    context.maintenanceFinance
      .filter((record) => this.maintenanceMatchesFilters(record, filters))
      .forEach((record) => {
        const date = this.normalizeDate(record.date);
        if (record.billedRevenue > 0) {
          rows.push({
            id: `ledger-damage-recovery-${record.id}`,
            title: record.description || 'Damage recovery',
            subtitle: this.buildVehicleDisplay(record.vehicleId, context),
            amount: Math.round(record.billedRevenue),
            direction: 'incoming',
            date,
            sourceType: 'damage_recovery',
            vehicleId: record.vehicleId,
            maintenanceId: record.id,
            href: record.linkedRentalId ? `/admin/rentals/${record.linkedRentalId}` : `/admin/maintenance?maintenanceId=${record.id}`
          });
        }

        if (record.maintenanceCost > 0) {
          rows.push({
            id: `ledger-maintenance-out-${record.id}`,
            title: record.description || 'Maintenance',
            subtitle: this.buildVehicleDisplay(record.vehicleId, context),
            amount: Math.round(record.maintenanceCost),
            direction: 'outgoing',
            date,
            sourceType: 'maintenance',
            vehicleId: record.vehicleId,
            maintenanceId: record.id,
            href: `/admin/maintenance?maintenanceId=${record.id}`,
            meta: {
              partsConsumedCost: Math.round(record.partsConsumedCost || 0)
            }
          });
        }

        if (record.inventoryCost > 0) {
          rows.push({
            id: `ledger-maintenance-inventory-${record.id}`,
            title: `Parts / inventory • ${record.description || 'Maintenance'}`,
            subtitle: this.buildVehicleDisplay(record.vehicleId, context),
            amount: Math.round(record.inventoryCost),
            direction: 'outgoing',
            date,
            sourceType: 'inventory',
            vehicleId: record.vehicleId,
            maintenanceId: record.id,
            href: `/admin/maintenance?maintenanceId=${record.id}`
          });
        }

        if (record.tax > 0) {
          rows.push({
            id: `ledger-maintenance-tax-${record.id}`,
            title: `Taxes • ${record.description || 'Maintenance'}`,
            subtitle: this.buildVehicleDisplay(record.vehicleId, context),
            amount: Math.round(record.tax),
            direction: 'tax',
            date,
            sourceType: 'tax',
            vehicleId: record.vehicleId,
            maintenanceId: record.id,
            href: `/admin/maintenance?maintenanceId=${record.id}`
          });
        }
      });

    context.financeExpenses
      .filter((expense: any) => String(expense?.status || 'active').toLowerCase() !== 'reversed')
      .filter((expense: any) => this.isDateInRange(expense.expense_date || expense.created_at, filters.startDate, filters.endDate))
      .filter((expense: any) => {
        if (filters.vehicleIds.length === 0) return true;
        return expense.vehicle_id && filters.vehicleIds.map(String).includes(String(expense.vehicle_id));
      })
      .forEach((expense: any) => {
        const amount = Math.round(this.toNumber(expense.amount));
        if (amount <= 0) return;
        rows.push({
          id: `ledger-finance-expense-${expense.id}`,
          title: expense.description || 'Manual expense',
          subtitle: this.buildExpenseSubtitle(expense, context),
          amount,
          direction: 'outgoing',
          date: this.normalizeDate(expense.expense_date || expense.created_at),
          sourceType: 'finance_expense',
          vehicleId: expense.vehicle_id ? String(expense.vehicle_id) : undefined,
          href: '/admin/finance',
          meta: {
            category: expense.category || '',
            subcategory: expense.subcategory || ''
          }
        });
      });

    context.fuelRefills
      .filter((row: any) => this.isDateInRange(row.refill_date || row.created_at, filters.startDate, filters.endDate))
      .filter((row: any) => {
        if (filters.vehicleIds.length === 0) return true;
        return row.vehicle_id && filters.vehicleIds.map(String).includes(String(row.vehicle_id));
      })
      .forEach((row: any) => {
        const liters = this.getFuelLiters(row);
        const amount = this.getFuelAmount(row, context.averageTankUnitCost);
        if (amount <= 0) return;
        const isTankIn = !row.vehicle_id;
        rows.push({
          id: `ledger-fuel-refill-${row.id || row.created_at}`,
          title: isTankIn ? 'Tank refill' : 'Direct vehicle fill',
          subtitle: isTankIn ? `${liters}L into main tank` : this.buildVehicleDisplay(String(row.vehicle_id), context),
          amount: Math.round(amount),
          direction: 'outgoing',
          date: this.normalizeDate(row.refill_date || row.created_at),
          sourceType: isTankIn ? 'tank_in' : 'direct_fill',
          vehicleId: row.vehicle_id ? String(row.vehicle_id) : undefined,
          href: '/admin/fuel',
          meta: { liters }
        });
      });

    const incomingTotal = rows.filter((row) => row.direction === 'incoming').reduce((sum, row) => sum + row.amount, 0);
    const outgoingTotal = this.sumOverviewExpenses(rows);
    const taxesTotal = rows.filter((row) => row.direction === 'tax').reduce((sum, row) => sum + row.amount, 0);

    rows.sort((a, b) => {
      const dateA = a.date || '';
      const dateB = b.date || '';
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      return (b.amount || 0) - (a.amount || 0);
    });

    return {
      rows,
      incomingTotal,
      outgoingTotal,
      taxesTotal,
      netTotal: incomingTotal - outgoingTotal - taxesTotal
    };
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
      .map((rental) => this.buildRentalPLRow(rental, context));
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

  async getTourPLData(
    filters: FinanceFiltersV2,
    page: number = 1,
    pageSize: number = 50,
    sortBy: string = 'closedAt',
    sortOrder: 'asc' | 'desc' = 'desc',
    searchTerm?: string
  ): Promise<{ data: TourPLRow[]; total: number; pages: number }> {
    try {
      const context = await this.getFinanceContext();
      let rows = this.buildTourPLRowsFromContext(context, filters);

      if (searchTerm?.trim()) {
        const query = searchTerm.trim().toLowerCase();
        rows = rows.filter((row) =>
          [
            row.tourId,
            row.customer,
            row.vehicleDisplay,
            row.vehicleModel,
            row.guideName,
            row.packageName,
            row.routeType
          ].some((value) => String(value || '').toLowerCase().includes(query))
        );
      }

      rows.sort((a: any, b: any) => {
        const aValue = a[sortBy as keyof TourPLRow];
        const bValue = b[sortBy as keyof TourPLRow];
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
      console.error('❌ Tour P&L load failed:', error);
      return { data: [], total: 0, pages: 0 };
    }
  }

  async getFuelPLData(filters: FinanceFiltersV2): Promise<FuelPLData> {
    try {
      const context = await this.getFinanceContext();
      const rentalRows = this.getRentalRowsFromContext(context, filters);
      const tourRows = this.buildTourPLRowsFromContext(context, filters);

      const rentalFuelOut = rentalRows.reduce((sum, row) => sum + Math.max(0, row.fuelCosts), 0);
      const rentalFuelIn = rentalRows.reduce((sum, row) => sum + Math.max(0, row.fuelSurplusRevenue), 0);
      const rentalConsumedLiters = rentalRows.reduce((sum, row) => sum + Math.max(0, row.fuelVarianceLiters), 0);

      const tourFuelOut = tourRows.reduce((sum, row) => sum + Math.max(0, row.fuelCosts), 0);
      const tourFuelIn = tourRows.reduce((sum, row) => sum + Math.max(0, row.fuelSurplusRevenue), 0);
      const tourConsumedLiters = tourRows.reduce((sum, row) => sum + Math.max(0, row.fuelConsumedLiters), 0);
      const tourSurplusLiters = tourRows.reduce((sum, row) => sum + Math.max(0, row.fuelSurplusLiters), 0);

      const rows: FuelPLData['rows'] = [
        ...rentalRows
          .filter((row) => row.fuelCosts > 0 || row.fuelSurplusRevenue > 0)
          .map((row) => ({
            id: `rental-${row.id}`,
            type: 'rental' as const,
            label: row.rentalId,
            vehicleDisplay: row.vehicleDisplay || row.plateNumber,
            vehicleModel: row.vehicleModel,
            fuelIn: Math.round(row.fuelSurplusRevenue),
            fuelOut: Math.round(row.fuelCosts),
            net: Math.round(row.fuelSurplusRevenue - row.fuelCosts),
            consumedLiters: Math.round(Math.max(0, row.fuelVarianceLiters) * 100) / 100,
            surplusLiters: 0,
            date: row.closedAt || row.financeDate || filters.endDate,
            href: `/admin/rentals/${row.id}`
          })),
        ...tourRows
          .filter((row) => row.fuelCosts > 0 || row.fuelSurplusRevenue > 0)
          .map((row) => ({
            id: `tour-${row.id}`,
            type: 'tour' as const,
            label: row.tourId,
            vehicleDisplay: row.vehicleDisplay,
            vehicleModel: row.vehicleModel,
            fuelIn: Math.round(row.fuelSurplusRevenue),
            fuelOut: Math.round(row.fuelCosts),
            net: Math.round(row.fuelSurplusRevenue - row.fuelCosts),
            consumedLiters: Math.round(Math.max(0, row.fuelConsumedLiters) * 100) / 100,
            surplusLiters: Math.round(Math.max(0, row.fuelSurplusLiters) * 100) / 100,
            date: row.closedAt || row.financeDate || filters.endDate
          }))
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      const vehicleMap = new Map<string, FuelPLData['topVehicles'][number]>();
      const upsertVehicle = (
        vehicleId: string,
        plateNumber: string,
        vehicleModel: string,
        fuelOut: number,
        fuelIn: number,
        consumedLiters: number,
        surplusLiters: number
      ) => {
        const key = String(vehicleId || plateNumber || 'unknown');
        const existing = vehicleMap.get(key) || {
          vehicleId: key,
          plateNumber: plateNumber || 'N/A',
          vehicleModel: vehicleModel || 'Vehicle',
          fuelIn: 0,
          fuelOut: 0,
          net: 0,
          consumedLiters: 0,
          surplusLiters: 0
        };
        existing.fuelIn += Math.max(0, fuelIn);
        existing.fuelOut += Math.max(0, fuelOut);
        existing.net = existing.fuelIn - existing.fuelOut;
        existing.consumedLiters += Math.max(0, consumedLiters);
        existing.surplusLiters += Math.max(0, surplusLiters);
        vehicleMap.set(key, existing);
      };

      rentalRows.forEach((row) => {
        if (row.fuelCosts <= 0 && row.fuelSurplusRevenue <= 0) return;
        upsertVehicle(
          row.vehicleId,
          row.plateNumber,
          row.vehicleModel,
          row.fuelCosts,
          row.fuelSurplusRevenue,
          row.fuelVarianceLiters,
          0
        );
      });

      tourRows.forEach((row) => {
        if (Array.isArray(row.fuelVehicleBreakdown) && row.fuelVehicleBreakdown.length > 0) {
          row.fuelVehicleBreakdown.forEach((vehicleFuel) => {
            if (vehicleFuel.fuelCost <= 0 && vehicleFuel.fuelSurplusValue <= 0) return;
            upsertVehicle(
              vehicleFuel.vehicleId,
              vehicleFuel.vehicleDisplay,
              vehicleFuel.vehicleModel,
              vehicleFuel.fuelCost,
              vehicleFuel.fuelSurplusValue,
              vehicleFuel.consumedLiters,
              vehicleFuel.surplusLiters
            );
          });
          return;
        }

        const splitBy = Math.max(row.vehicleIds.length || 1, 1);
        row.vehicleIds.forEach((vehicleId) => {
          const label = this.getVehicleLabel(context.vehicleMap.get(String(vehicleId)));
          upsertVehicle(
            vehicleId,
            label.plateNumber,
            label.vehicleModel,
            row.fuelCosts / splitBy,
            row.fuelSurplusRevenue / splitBy,
            row.fuelConsumedLiters / splitBy,
            row.fuelSurplusLiters / splitBy
          );
        });
      });

      const topVehicles = Array.from(vehicleMap.values())
        .map((row) => ({
          ...row,
          fuelIn: Math.round(row.fuelIn),
          fuelOut: Math.round(row.fuelOut),
          net: Math.round(row.net),
          consumedLiters: Math.round(row.consumedLiters * 100) / 100,
          surplusLiters: Math.round(row.surplusLiters * 100) / 100
        }))
        .sort((a, b) => b.fuelOut - a.fuelOut)
        .slice(0, 12);

      const fuelIn = rentalFuelIn + tourFuelIn;
      const fuelOut = rentalFuelOut + tourFuelOut;

      return {
        fuelIn: Math.round(fuelIn),
        fuelOut: Math.round(fuelOut),
        netFuelImpact: Math.round(fuelIn - fuelOut),
        consumedLiters: Math.round((rentalConsumedLiters + tourConsumedLiters) * 100) / 100,
        surplusLiters: Math.round(tourSurplusLiters * 100) / 100,
        sources: [
          {
            key: 'rentals',
            label: 'Rentals',
            fuelIn: Math.round(rentalFuelIn),
            fuelOut: Math.round(rentalFuelOut),
            net: Math.round(rentalFuelIn - rentalFuelOut),
            consumedLiters: Math.round(rentalConsumedLiters * 100) / 100,
            surplusLiters: 0,
            count: rentalRows.filter((row) => row.fuelCosts > 0 || row.fuelSurplusRevenue > 0).length
          },
          {
            key: 'tours',
            label: 'Tours',
            fuelIn: Math.round(tourFuelIn),
            fuelOut: Math.round(tourFuelOut),
            net: Math.round(tourFuelIn - tourFuelOut),
            consumedLiters: Math.round(tourConsumedLiters * 100) / 100,
            surplusLiters: Math.round(tourSurplusLiters * 100) / 100,
            count: tourRows.filter((row) => row.fuelCosts > 0 || row.fuelSurplusRevenue > 0).length
          }
        ],
        topVehicles,
        rows
      };
    } catch (error) {
      console.error('❌ Fuel P&L load failed:', error);
      return {
        fuelIn: 0,
        fuelOut: 0,
        netFuelImpact: 0,
        consumedLiters: 0,
        surplusLiters: 0,
        sources: [],
        topVehicles: [],
        rows: []
      };
    }
  }

  async getMaintenancePLData(filters: FinanceFiltersV2): Promise<MaintenancePLData> {
    try {
      const context = await this.getFinanceContext();
      const maintenanceRows = context.maintenanceFinance
        .filter((record) => this.maintenanceMatchesFilters(record, filters))
        .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

      const rows = maintenanceRows.map((record) => {
        const maintenanceCost = Math.round(record.maintenanceCost || 0);
        const partsConsumedCost = Math.round(record.partsConsumedCost || record.inventoryCost || 0);
        const billedRecovery = Math.round(record.billedRevenue || 0);
        const laborExternalCost = Math.max(0, maintenanceCost - partsConsumedCost);
        const linkedRentalRecordId = String(record.linkedRentalRecordId || '').trim();
        const linkedRentalReference = String(record.linkedRentalReference || '').trim();

        return {
          id: String(record.id),
          title: record.description || (linkedRentalReference ? `Rental ${linkedRentalReference}` : 'Maintenance'),
          vehicleDisplay: this.buildVehicleDisplay(record.vehicleId, context),
          billedRecovery,
          maintenanceCost,
          partsConsumedCost,
          laborExternalCost,
          netRecovery: billedRecovery - maintenanceCost,
          date: record.date,
          status: record.status,
          linkedRentalId: linkedRentalReference || record.linkedRentalId || undefined,
          href: linkedRentalRecordId ? `/admin/rentals/${linkedRentalRecordId}` : `/admin/maintenance?maintenanceId=${record.id}`
        };
      });

      const topVehicleMap = new Map<string, MaintenancePLData['topVehicles'][number]>();
      rows.forEach((row) => {
        const original = maintenanceRows.find((record) => String(record.id) === String(row.id));
        const vehicleId = String(original?.vehicleId || row.vehicleDisplay || 'unknown');
        const existing = topVehicleMap.get(vehicleId) || {
          vehicleId,
          vehicleDisplay: row.vehicleDisplay,
          maintenanceCost: 0,
          partsConsumedCost: 0,
          billedRecovery: 0,
          netRecovery: 0,
          count: 0
        };
        existing.maintenanceCost += row.maintenanceCost;
        existing.partsConsumedCost += row.partsConsumedCost;
        existing.billedRecovery += row.billedRecovery;
        existing.netRecovery += row.netRecovery;
        existing.count += 1;
        topVehicleMap.set(vehicleId, existing);
      });

      const billedRecovery = rows.reduce((sum, row) => sum + row.billedRecovery, 0);
      const maintenanceCost = rows.reduce((sum, row) => sum + row.maintenanceCost, 0);
      const partsConsumedCost = rows.reduce((sum, row) => sum + row.partsConsumedCost, 0);

      return {
        billedRecovery,
        maintenanceCost,
        partsConsumedCost,
        laborExternalCost: rows.reduce((sum, row) => sum + row.laborExternalCost, 0),
        netRecovery: billedRecovery - maintenanceCost,
        linkedCount: rows.filter((row) => row.linkedRentalId).length,
        unrecoveredCount: rows.filter((row) => row.billedRecovery <= 0).length,
        rows,
        topVehicles: Array.from(topVehicleMap.values())
          .sort((a, b) => b.maintenanceCost - a.maintenanceCost)
          .slice(0, 12)
      };
    } catch (error) {
      console.error('❌ Maintenance P&L load failed:', error);
      return {
        billedRecovery: 0,
        maintenanceCost: 0,
        partsConsumedCost: 0,
        laborExternalCost: 0,
        netRecovery: 0,
        linkedCount: 0,
        unrecoveredCount: 0,
        rows: [],
        topVehicles: []
      };
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
    await this.ensureTenantWorkspaceReady('vehicles');
    let query = supabase
      .from('saharax_0u4w4d_vehicles')
      .select('id, organization_id, name, model, plate_number, purchase_cost_mad, purchase_date, purchase_supplier')
      .order('name', { ascending: true });
    query = await scopeTenantOwnedQuery(query, 'saharax_0u4w4d_vehicles', {
      message: 'Workspace organization context is required to load vehicles.',
    });

    const { data, error } = await query;

    if (error) {
      console.error('financeApiV2.getVehicles error:', error);
      return [];
    }

    await verifyTenantOwnedRows(data || [], 'saharax_0u4w4d_vehicles', {
      message: 'Finance vehicle list returned rows outside the active workspace.',
    });

    return (data || []).map((vehicle: any) => ({
      id: String(vehicle.id),
      make: vehicle.name || '',
      model: vehicle.model || '',
      plate_number: vehicle.plate_number || '',
      purchase_cost_mad: this.toNumber(vehicle.purchase_cost_mad),
      purchase_date: vehicle.purchase_date || null,
      purchase_supplier: vehicle.purchase_supplier || '',
      is_active: true,
      org_id: 'current',
      display_name: [vehicle.name, vehicle.model, vehicle.plate_number].filter(Boolean).join(' - '),
    }));
  }

  async getCustomers(orgId: string = 'current'): Promise<Customer[]> {
    const requireScopedCustomers = shouldScopeSharedTenantData();
    if (requireScopedCustomers) {
      await this.ensureTenantWorkspaceReady('customers');
    }
    const scopedOrgId = requireScopedCustomers
      ? await requireCurrentOrganizationId('Workspace organization context is required to load customers.')
      : null;

    const [rentalsResult, toursResult] = await Promise.allSettled([
      scopeTenantOwnedQuery(
        supabase
        .from('app_4c3a7a6153_rentals')
        .select('customer_id, customer_name, customer_email, organization_id')
        .not('customer_id', 'is', null),
        'app_4c3a7a6153_rentals',
        { organizationId: scopedOrgId, message: 'Workspace organization context is required to load customers.' }
      ).then((query) => query),
      fetchTourBookings(),
    ]);

    const grouped = new Map<string, Customer>();
    const ingestRows = (rows: any[] = []) => {
      rows.forEach((row) => {
        const customerId =
          row?.customer_id
            ? String(row.customer_id)
            : `${String(row?.customer_name || '').trim().toLowerCase()}::${String(row?.customer_email || '').trim().toLowerCase()}`;
        if (!customerId || grouped.has(customerId)) {
          return;
        }

        grouped.set(customerId, {
          id: customerId,
          name: row?.customer_name || 'Unknown Customer',
          email: row?.customer_email || '',
          org_id: 'current',
        });
      });
    };

    if (rentalsResult.status === 'fulfilled' && !rentalsResult.value.error) {
      await verifyTenantOwnedRows(rentalsResult.value.data || [], 'app_4c3a7a6153_rentals', {
        organizationId: scopedOrgId,
        message: 'Finance customer rentals returned rows outside the active workspace.',
      });
      ingestRows(rentalsResult.value.data || []);
    }

    if (toursResult.status === 'fulfilled') {
      ingestRows(Array.isArray(toursResult.value) ? toursResult.value : []);
    }

    return Array.from(grouped.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  private getDispositionRecords(filters: FinanceFiltersV2, lifetime = false) {
    return VehicleDispositionService.listDispositions().filter((record) => {
      if (!lifetime && !this.isDateInRange(record.event_date || record.updated_at, filters.startDate, filters.endDate)) {
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
    return this.getPeriodMetricsFromContext(context, filters);
  }

  async getKPIData(filters: FinanceFiltersV2): Promise<KPIData> {
    const [current, previous] = await Promise.all([
      this.getPeriodMetrics(filters),
      this.getPeriodMetrics(this.shiftDateRange(filters))
    ]);

    return {
      ...current,
      revenueChange: this.calculateChange(current.totalRevenue, previous.totalRevenue),
      collectedChange: this.calculateChange(current.totalCollected, previous.totalCollected),
      outstandingChange: this.calculateChange(current.totalOutstanding, previous.totalOutstanding),
      netCashChange: this.calculateChange(current.netCash, previous.netCash),
      expensesChange: this.calculateChange(current.totalExpenses, previous.totalExpenses),
      taxesChange: this.calculateChange(current.taxes, previous.taxes),
      profitChange: this.calculateChange(current.grossProfit, previous.grossProfit),
      currency: 'MAD',
      period: `${filters.startDate} – ${filters.endDate}`
    };
  }

  async getOverviewSummaryData(filters: FinanceFiltersV2): Promise<FinanceOverviewSummaryData> {
    return sharedQueryCacheService.fetchQuery(
      FINANCE_OVERVIEW_SUMMARY_CACHE_NAMESPACE,
      filters,
      async () => {
        const context = await this.getFinanceOverviewContext();
        const previousFilters = this.shiftDateRange(filters);
        const current = this.getPeriodMetricsFromContext(context, filters);
        const previous = this.getPeriodMetricsFromContext(context, previousFilters);
        const anchorDate = new Date(`${filters.endDate}T12:00:00`);
        const monthStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1, 12, 0, 0, 0);
        const pulseRows = this.getUnifiedLedgerFromContext(context, {
          ...filters,
          startDate: monthStart.toISOString().split('T')[0],
          endDate: filters.endDate
        }).rows;

        return {
          kpiData: {
            ...current,
            revenueChange: this.calculateChange(current.totalRevenue, previous.totalRevenue),
            collectedChange: this.calculateChange(current.totalCollected, previous.totalCollected),
            outstandingChange: this.calculateChange(current.totalOutstanding, previous.totalOutstanding),
            netCashChange: this.calculateChange(current.netCash, previous.netCash),
            expensesChange: this.calculateChange(current.totalExpenses, previous.totalExpenses),
            taxesChange: this.calculateChange(current.taxes, previous.taxes),
            profitChange: this.calculateChange(current.grossProfit, previous.grossProfit),
            currency: 'MAD',
            period: `${filters.startDate} – ${filters.endDate}`
          },
          trendData: this.getTrendDataFromContext(context, filters),
          pulseRows
        };
      },
      {
        ttlMs: 45 * 1000,
        staleWhileRevalidate: false,
        maxStaleMs: 3 * 60 * 1000,
      }
    );
  }

  async getTrendData(filters: FinanceFiltersV2): Promise<TrendData[]> {
    const context = await this.getFinanceContext();
    return this.getTrendDataFromContext(context, filters);
  }

  async getDayBreakdown(anchorDate: string, filters: FinanceFiltersV2): Promise<FinanceDayBreakdownData> {
    const context = await this.getFinanceContext();
    const rows: FinanceBreakdownRow[] = [];
    const date = this.normalizeDate(anchorDate);

    if (!date) {
      return {
        date: anchorDate,
        title: 'Daily Breakdown',
        incomingTotal: 0,
        outgoingTotal: 0,
        taxesTotal: 0,
        netTotal: 0,
        rows: []
      };
    }

    const dayFilters = {
      ...filters,
      startDate: date,
      endDate: date
    };

    const rentalRows = await this.getRentalRows(dayFilters);
    rentalRows
      .filter((row) => this.normalizeDate(row.financeDate || row.closedAt) === date)
      .forEach((row) => {
        if (row.revenue > 0) {
          rows.push({
            id: `day-rental-revenue-${row.id}`,
            title: `Rental ${row.rentalId}`,
            subtitle: `${row.customer} • ${row.vehicleDisplay}`,
            amount: Math.round(row.revenue),
            direction: 'incoming',
            date,
            sourceType: 'rental',
            rentalId: row.rentalId,
            vehicleId: row.vehicleId,
            href: `/admin/rentals/${row.id}`,
            meta: {
              paymentStatus: row.payment_status,
              status: row.status
            }
          });
        }

        if (row.maintenanceCosts > 0) {
          rows.push({
            id: `day-rental-maintenance-${row.id}`,
            title: `Maintenance cost • ${row.rentalId}`,
            subtitle: row.vehicleDisplay,
            amount: Math.round(row.maintenanceCosts),
            direction: 'outgoing',
            date,
            sourceType: 'maintenance',
            rentalId: row.rentalId,
            vehicleId: row.vehicleId,
            href: `/admin/rentals/${row.id}`,
            meta: {
              partsConsumedCost: Math.round(row.partsConsumedCost || 0)
            }
          });
        }

        if (row.fuelCosts > 0) {
          rows.push({
            id: `day-rental-fuel-${row.id}`,
            title: `Fuel cost • ${row.rentalId}`,
            subtitle: row.vehicleDisplay,
            amount: Math.round(row.fuelCosts),
            direction: 'outgoing',
            date,
            sourceType: 'fuel',
            rentalId: row.rentalId,
            vehicleId: row.vehicleId,
            href: `/admin/rentals/${row.id}`
          });
        }

        if (row.inventoryCosts > 0) {
          rows.push({
            id: `day-rental-inventory-${row.id}`,
            title: `Inventory cost • ${row.rentalId}`,
            subtitle: row.vehicleDisplay,
            amount: Math.round(row.inventoryCosts),
            direction: 'outgoing',
            date,
            sourceType: 'inventory',
            rentalId: row.rentalId,
            vehicleId: row.vehicleId,
            href: `/admin/rentals/${row.id}`
          });
        }

        if (row.taxes > 0) {
          rows.push({
            id: `day-rental-tax-${row.id}`,
            title: `Taxes • ${row.rentalId}`,
            subtitle: row.vehicleDisplay,
            amount: Math.round(row.taxes),
            direction: 'tax',
            date,
            sourceType: 'tax',
            rentalId: row.rentalId,
            vehicleId: row.vehicleId,
            href: `/admin/rentals/${row.id}`
          });
        }
      });

    context.tours
      .filter((tour) => this.rentalMatchesFilters(tour, dayFilters))
      .filter((tour) => this.normalizeDate(tour.financeDate || tour.startAt || tour.closedAt || tour.endAt) === date)
      .forEach((tour) => {
        const amount = Math.round(this.toNumber(tour.revenue));
        if (amount <= 0) return;
        rows.push({
          id: `day-tour-${tour.id}`,
          title: tour.packageName || 'Tour booking',
          subtitle: `${tour.customerName}${tour.guideName ? ` • ${tour.guideName}` : ''}`,
          amount,
          direction: 'incoming',
          date,
          sourceType: 'tour',
          rentalId: tour.rentalId,
          vehicleId: tour.vehicleId,
          href: '/admin/tours',
          meta: {
            routeType: tour.routeType || 'tour'
          }
        });
      });

    context.maintenanceFinance
      .filter((record) => this.maintenanceMatchesFilters(record, dayFilters))
      .filter((record) => !record.linkedRentalId)
      .filter((record) => this.normalizeDate(record.date) === date)
      .forEach((record) => {
        if (record.billedRevenue > 0) {
          rows.push({
            id: `day-damage-recovery-${record.id}`,
            title: record.description || 'Damage recovery',
            subtitle: this.buildVehicleDisplay(record.vehicleId, context),
            amount: Math.round(record.billedRevenue),
            direction: 'incoming',
            date,
            sourceType: 'damage_recovery',
            vehicleId: record.vehicleId,
            maintenanceId: record.id,
            href: record.linkedRentalId ? `/admin/rentals/${record.linkedRentalId}` : `/admin/maintenance?maintenanceId=${record.id}`
          });
        }

        if (record.maintenanceCost > 0) {
          rows.push({
            id: `day-maintenance-out-${record.id}`,
            title: record.description || 'Maintenance',
            subtitle: this.buildVehicleDisplay(record.vehicleId, context),
            amount: Math.round(record.maintenanceCost),
            direction: 'outgoing',
            date,
            sourceType: 'maintenance',
            vehicleId: record.vehicleId,
            maintenanceId: record.id,
            href: `/admin/maintenance?maintenanceId=${record.id}`,
            meta: {
              partsConsumedCost: Math.round(record.partsConsumedCost || 0)
            }
          });
        }

        if (record.inventoryCost > 0) {
          rows.push({
            id: `day-maintenance-inventory-${record.id}`,
            title: `Parts / inventory • ${record.description || 'Maintenance'}`,
            subtitle: this.buildVehicleDisplay(record.vehicleId, context),
            amount: Math.round(record.inventoryCost),
            direction: 'outgoing',
            date,
            sourceType: 'inventory',
            vehicleId: record.vehicleId,
            maintenanceId: record.id,
            href: `/admin/maintenance?maintenanceId=${record.id}`
          });
        }

        if (record.tax > 0) {
          rows.push({
            id: `day-maintenance-tax-${record.id}`,
            title: `Taxes • ${record.description || 'Maintenance'}`,
            subtitle: this.buildVehicleDisplay(record.vehicleId, context),
            amount: Math.round(record.tax),
            direction: 'tax',
            date,
            sourceType: 'tax',
            vehicleId: record.vehicleId,
            maintenanceId: record.id,
            href: `/admin/maintenance?maintenanceId=${record.id}`
          });
        }
      });

    context.financeExpenses
      .filter((expense: any) => String(expense?.status || 'active').toLowerCase() !== 'reversed')
      .filter((expense: any) => this.isDateInRange(expense.expense_date || expense.created_at, date, date))
      .filter((expense: any) => {
        if (dayFilters.vehicleIds.length === 0) return true;
        return expense.vehicle_id && dayFilters.vehicleIds.map(String).includes(String(expense.vehicle_id));
      })
      .forEach((expense: any) => {
        const amount = Math.round(this.toNumber(expense.amount));
        if (amount <= 0) return;
        rows.push({
          id: `day-finance-expense-${expense.id}`,
          title: expense.description || 'Manual expense',
          subtitle: this.buildExpenseSubtitle(expense, context),
          amount,
          direction: 'outgoing',
          date,
          sourceType: 'finance_expense',
          vehicleId: expense.vehicle_id ? String(expense.vehicle_id) : undefined,
          href: '/admin/finance',
          meta: {
            category: expense.category || '',
            subcategory: expense.subcategory || ''
          }
        });
      });

    context.fuelRefills
      .filter((row: any) => this.isDateInRange(row.refill_date || row.created_at, date, date))
      .filter((row: any) => {
        if (dayFilters.vehicleIds.length === 0) return true;
        return row.vehicle_id && dayFilters.vehicleIds.map(String).includes(String(row.vehicle_id));
      })
      .forEach((row: any) => {
        const liters = this.getFuelLiters(row);
        const amount = this.getFuelAmount(row, context.averageTankUnitCost);
        if (amount <= 0) return;
        const isTankIn = !row.vehicle_id;
        rows.push({
          id: `day-fuel-refill-${row.id || row.created_at}`,
          title: isTankIn ? 'Tank refill' : 'Direct vehicle fill',
          subtitle: isTankIn ? `${liters}L into main tank` : this.buildVehicleDisplay(String(row.vehicle_id), context),
          amount: Math.round(amount),
          direction: 'outgoing',
          date,
          sourceType: isTankIn ? 'tank_in' : 'direct_fill',
          vehicleId: row.vehicle_id ? String(row.vehicle_id) : undefined,
          href: '/admin/fuel',
          meta: {
            liters
          }
        });
      });

    context.vehicles
      .filter((vehicle: any) => this.isDateInRange(vehicle.purchase_date, date, date))
      .filter((vehicle: any) => {
        if (dayFilters.vehicleIds.length === 0) return true;
        return dayFilters.vehicleIds.map(String).includes(String(vehicle.id));
      })
      .forEach((vehicle: any) => {
        const amount = Math.round(this.toNumber(vehicle.purchase_cost_mad));
        if (amount <= 0) return;
        rows.push({
          id: `day-purchase-${vehicle.id}`,
          title: 'Vehicle purchase',
          subtitle: this.buildVehicleDisplay(String(vehicle.id), context),
          amount,
          direction: 'outgoing',
          date,
          sourceType: 'purchase',
          vehicleId: String(vehicle.id),
          href: `/admin/fleet/${vehicle.id}`
        });
      });

    this.getDispositionRecords(dayFilters)
      .filter((record: any) => this.normalizeDate(record.event_date || record.updated_at) === date)
      .forEach((record: any) => {
        const amount = Math.round(this.toNumber(record.sale_price_mad));
        if (amount <= 0) return;
        rows.push({
          id: `day-disposition-${record.id}`,
          title: record.event_type === 'sold' ? 'Vehicle sale' : 'Vehicle disposal',
          subtitle: this.buildVehicleDisplay(String(record.vehicle_id), context),
          amount,
          direction: record.event_type === 'sold' ? 'incoming' : 'outgoing',
          date,
          sourceType: record.event_type,
          vehicleId: String(record.vehicle_id),
          href: `/admin/fleet/${record.vehicle_id}`
        });
      });

    rows.sort((a, b) => {
      const order = { incoming: 0, outgoing: 1, tax: 2 } as const;
      const directionDelta = (order[a.direction || 'incoming'] ?? 0) - (order[b.direction || 'incoming'] ?? 0);
      if (directionDelta !== 0) return directionDelta;
      return (b.amount || 0) - (a.amount || 0);
    });

    const incomingTotal = rows
      .filter((row) => row.direction === 'incoming')
      .reduce((sum, row) => sum + row.amount, 0);
    const outgoingTotal = rows
      .filter((row) => this.isOverviewExpenseRow(row))
      .reduce((sum, row) => sum + row.amount, 0);
    const taxesTotal = rows
      .filter((row) => row.direction === 'tax')
      .reduce((sum, row) => sum + row.amount, 0);

    return {
      date,
      title: 'Daily Breakdown',
      incomingTotal,
      outgoingTotal,
      taxesTotal,
      netTotal: incomingTotal - outgoingTotal - taxesTotal,
      rows
    };
  }

  async getTopVehiclesByProfit(filters: FinanceFiltersV2, limit: number = 5, lifetime = false): Promise<VehicleProfitData[]> {
    const context = await this.getFinanceContext();
    const rows = context.rentals
      .filter((rental) => this.rentalMatchesFilters(rental, filters, lifetime))
      .map((rental) => this.buildRentalPLRow(rental, context));
    const dispositionRecords = this.getDispositionRecords(filters, lifetime);
    const grouped = new Map<string, VehicleProfitData>();
    const ensureVehicleRow = (vehicleId: string, fallback?: any): VehicleProfitData => {
      const key = String(vehicleId || '');
      const existing = grouped.get(key);
      if (existing) return existing;

      const vehicle = context.vehicleMap.get(key);
      const labels = this.getVehicleLabel(vehicle);
      const vehicleModel = labels.vehicleModel || fallback?.vehicleModel || fallback?.model || 'SEGWAY AT6';
      const row: VehicleProfitData = {
        vehicleId: key,
        vehicleName: `${labels.plateNumber || fallback?.plateNumber || 'N/A'} - ${vehicleModel}`,
        make: vehicle?.name || vehicleModel.split(' ')[0] || 'SEGWAY',
        model: vehicle?.model || vehicleModel.split(' ').slice(1).join(' ') || 'AT6',
        plateNumber: labels.plateNumber || fallback?.plateNumber || 'N/A',
        revenue: 0,
        maintenanceCosts: 0,
        fuelCosts: 0,
        fuelConsumedLiters: 0,
        inventoryCosts: 0,
        acquisitionCosts: 0,
        otherCosts: 0,
        totalCosts: 0,
        profit: 0,
        profitMargin: 0
      };
      grouped.set(key, row);
      return row;
    };
    const refreshMargin = (row: VehicleProfitData) => {
      row.profitMargin = row.revenue > 0
        ? Math.round((row.profit / row.revenue) * 1000) / 10
        : 0;
    };

    rows.forEach((row) => {
      const existing = ensureVehicleRow(String(row.vehicleId), row);

      existing.revenue += row.revenue;
      existing.maintenanceCosts += row.maintenanceCosts;
      existing.fuelCosts += row.fuelCosts;
      existing.fuelConsumedLiters = (existing.fuelConsumedLiters || 0) + Math.max(0, -this.toNumber(row.fuelVarianceLiters));
      existing.inventoryCosts += row.inventoryCosts;
      existing.otherCosts += row.otherCosts;
      existing.totalCosts += row.totalCosts;
      existing.profit += row.grossProfit;
      refreshMargin(existing);
    });

    context.tours
      .filter((tour) => this.rentalMatchesFilters(tour, filters, lifetime))
      .forEach((tour) => {
        this.getTourVehicleIds(tour).forEach((vehicleId) => {
          const existing = ensureVehicleRow(vehicleId);
          const fuel = this.getTourFuelSnapshotForVehicle(context, vehicleId, [tour]);
          const revenueShare = this.getTourVehicleRevenueShare(tour, vehicleId);
          const fuelCost = Math.round(fuel.cost);

          existing.revenue += revenueShare;
          existing.fuelCosts += fuelCost;
          existing.fuelConsumedLiters = (existing.fuelConsumedLiters || 0) + fuel.consumedLiters;
          existing.totalCosts += fuelCost;
          existing.profit += revenueShare - fuelCost;
          refreshMargin(existing);
        });
      });

    dispositionRecords.forEach((record) => {
      const existing = ensureVehicleRow(String(record.vehicle_id));

      if (record.event_type === 'sold') {
        existing.revenue += this.toNumber(record.sale_price_mad);
        existing.profit += this.toNumber(record.sale_price_mad);
      } else {
        existing.otherCosts += this.toNumber(record.sale_price_mad);
        existing.totalCosts += this.toNumber(record.sale_price_mad);
        existing.profit -= this.toNumber(record.sale_price_mad);
      }
      refreshMargin(existing);
    });

    context.vehicles.forEach((vehicle: any) => {
      const existing = ensureVehicleRow(String(vehicle.id));
      const acquisitionCost = this.toNumber(vehicle.purchase_cost_mad);
      if (acquisitionCost <= 0) return;
      if (!lifetime && !this.isDateInRange(vehicle.purchase_date, filters.startDate, filters.endDate)) return;

      existing.acquisitionCosts = (existing.acquisitionCosts || 0) + acquisitionCost;
      existing.otherCosts += acquisitionCost;
      existing.totalCosts += acquisitionCost;
      existing.profit -= acquisitionCost;
      refreshMargin(existing);
    });

    context.vehicles.forEach((vehicle: any) => {
      ensureVehicleRow(String(vehicle.id));
    });

    return Array.from(grouped.values())
      .map((row) => ({
        ...row,
        revenue: Math.round(row.revenue),
        fuelCosts: Math.round(row.fuelCosts),
        fuelConsumedLiters: Math.round((row.fuelConsumedLiters || 0) * 100) / 100,
        acquisitionCosts: Math.round(row.acquisitionCosts || 0),
        otherCosts: Math.round(row.otherCosts),
        totalCosts: Math.round(row.totalCosts),
        profit: Math.round(row.profit)
      }))
      .sort((a, b) => String(a.plateNumber).localeCompare(String(b.plateNumber), undefined, { numeric: true }))
      .slice(0, limit);
  }

  async getVehicleFinanceData(vehicleIds: string[], filters: FinanceFiltersV2): Promise<VehicleFinanceData> {
    const context = await this.getFinanceContext();
    const selectedIds = vehicleIds.map(String);
    const dispositionRecords = VehicleDispositionService.listDispositions()
      .filter((record) => selectedIds.includes(String(record.vehicle_id)));
    const rentals = context.rentals.filter((rental) => selectedIds.includes(String(rental.vehicleId)));
    const tours = context.tours.filter((tour) => selectedIds.some((vehicleId) => this.tourIncludesVehicle(tour, vehicleId)));
    const maintenanceRows = context.maintenanceFinance.filter((row) => selectedIds.includes(String(row.vehicleId)));

    const rentalRevenue = rentals.reduce((sum, rental) => {
      return sum + rental.revenue + rental.linkedMaintenanceRevenue;
    }, 0);
    const tourRevenue = tours.reduce((sum, tour) => {
      return sum + selectedIds.reduce((vehicleSum, vehicleId) => vehicleSum + this.getTourVehicleRevenueShare(tour, vehicleId), 0);
    }, 0);
    const dispositionRevenue = dispositionRecords.reduce((sum, record) => {
      return sum + (record.event_type === 'sold' ? this.toNumber(record.sale_price_mad) : 0);
    }, 0);
    const lifetimeMaintenanceCosts = maintenanceRows.reduce((sum: number, row: any) => sum + row.maintenanceCost, 0);
    const lifetimeInventoryCosts = maintenanceRows.reduce((sum: number, row: any) => sum + row.inventoryCost, 0);
    const lifetimeFuelSnapshots = selectedIds.map((vehicleId) => this.getVehicleFuelLifetimeSnapshot(context, vehicleId, rentals, tours));
    const lifetimeFuelCosts = lifetimeFuelSnapshots.reduce((sum, row) => sum + row.cost, 0);
    const lifetimeFuelConsumedLiters = lifetimeFuelSnapshots.reduce((sum, row) => sum + row.consumedLiters, 0);
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
        const fuelCost = this.getRentalFuelSnapshotForVehicle(context, String(rental.vehicleId), [rental]).cost;
        return {
          date: rental.closedAt,
          eventType: 'Rental Revenue',
          source: rental.rentalId,
          href: `/admin/rentals/${rental.id}`,
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
      ...tours.map((tour) => {
        const tourRevenueShare = selectedIds.reduce((sum, vehicleId) => sum + this.getTourVehicleRevenueShare(tour, vehicleId), 0);
        const fuelCost = selectedIds.reduce((sum, vehicleId) => {
          if (!this.tourIncludesVehicle(tour, vehicleId)) return sum;
          return sum + this.getTourFuelSnapshotForVehicle(context, vehicleId, [tour]).cost;
        }, 0);
        return {
          date: tour.closedAt,
          eventType: 'Tour Booking',
          source: tour.groupId || tour.rentalId,
          revenue: Math.round(tourRevenueShare),
          maintenanceCost: 0,
          fuelCost: Math.round(fuelCost),
          inventoryCost: 0,
          otherCost: 0,
          tax: 0,
          net: Math.round(tourRevenueShare - fuelCost)
        };
      }),
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
      ...context.vehicles
        .filter((vehicle: any) => selectedIds.includes(String(vehicle.id)) && this.toNumber(vehicle.purchase_cost_mad) > 0)
        .map((vehicle: any) => ({
          date: vehicle.purchase_date || vehicle.created_at,
          eventType: 'Vehicle Acquisition',
          source: vehicle.plate_number || vehicle.name || String(vehicle.id),
          revenue: 0,
          maintenanceCost: 0,
          fuelCost: 0,
          inventoryCost: 0,
          otherCost: Math.round(this.toNumber(vehicle.purchase_cost_mad)),
          tax: 0,
          net: Math.round(-this.toNumber(vehicle.purchase_cost_mad))
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
      const fuelCost = this.getRentalFuelSnapshotForVehicle(context, String(rental.vehicleId), [rental]).cost;
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
      const tourRevenueShare = selectedIds.reduce((sum, vehicleId) => sum + this.getTourVehicleRevenueShare(tour, vehicleId), 0);
      const fuelCost = selectedIds.reduce((sum, vehicleId) => {
        if (!this.tourIncludesVehicle(tour, vehicleId)) return sum;
        return sum + this.getTourFuelSnapshotForVehicle(context, vehicleId, [tour]).cost;
      }, 0);
      trendMap.set(key, (trendMap.get(key) || 0) + tourRevenueShare - fuelCost);
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
      lifetimeFuelConsumedLiters: Math.round(lifetimeFuelConsumedLiters * 100) / 100,
      lifetimeInventoryCosts: Math.round(lifetimeInventoryCosts),
      lifetimeAcquisitionCosts: Math.round(purchaseCosts),
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

  async getCustomerFinanceProfile(customerId: string, filters: FinanceFiltersV2): Promise<CustomerFinanceProfile | null> {
    const context = await this.getFinanceContext();
    const normalizedCustomerId = String(customerId);

    const buildTimeline = (entry: any, type: 'rental' | 'tour'): CustomerFinanceTimelineEvent[] => {
      const raw = entry.raw || {};
      const paidAmount = Math.max(0, this.toNumber(raw.deposit_amount));
      const totalAmount = Math.max(0, this.toNumber(entry.revenue));
      const remainingAmount = Math.max(0, this.toNumber(entry.remainingAmount));
      const securitySnapshot = this.getRentalSecuritySnapshot(raw);
      const securityRequired = securitySnapshot.required;
      const securityReceived = securitySnapshot.received;
      const securityDocumentLabel = securitySnapshot.documentLabel || '';
      const timeline: CustomerFinanceTimelineEvent[] = [];

      if (raw.created_at) {
        timeline.push({
          key: 'created',
          label: type === 'tour' ? 'Booking created' : 'Contract created',
          timestamp: raw.created_at,
          tone: 'slate',
          note: `Status: ${entry.status || 'scheduled'}`
        });
      }

      if (entry.startAt) {
        timeline.push({
          key: 'start',
          label: type === 'tour' ? 'Scheduled tour start' : 'Scheduled rental start',
          timestamp: entry.startAt,
          tone: 'violet'
        });
      }

      if (paidAmount > 0) {
        timeline.push({
          key: 'payment',
          label: 'Rental payment received',
          timestamp: raw.updated_at || entry.closedAt || entry.endAt || entry.startAt,
          tone: 'emerald',
          amount: paidAmount,
          note: entry.paymentStatus
        });
      }

      if (securityRequired > 0) {
        timeline.push({
          key: 'security-required',
          label: 'Security required',
          timestamp: raw.created_at || entry.startAt,
          tone: 'amber',
          amount: securityRequired,
          note: securityReceived > 0 ? 'Partially or fully received' : 'Still pending'
        });
      }

      if (securityReceived > 0) {
        timeline.push({
          key: 'security-received',
          label: 'Security received',
          timestamp: raw.damage_deposit_received_at || raw.updated_at || entry.closedAt || entry.startAt,
          tone: 'emerald',
          amount: securityReceived,
          note: securityDocumentLabel || undefined
        });
      } else if (securityDocumentLabel) {
        timeline.push({
          key: 'security-document',
          label: 'Security document held',
          timestamp: raw.updated_at || raw.created_at || entry.startAt,
          tone: 'violet',
          note: securityDocumentLabel
        });
      }

      if (remainingAmount > 0) {
        timeline.push({
          key: 'balance',
          label: 'Balance still due',
          timestamp: raw.updated_at || entry.closedAt || entry.endAt || entry.startAt,
          tone: 'rose',
          amount: remainingAmount,
          note: entry.paymentStatus
        });
      }

      if (entry.refundAmount > 0) {
        timeline.push({
          key: 'refund',
          label: 'Refund recorded',
          timestamp: raw.updated_at || entry.closedAt || entry.endAt || entry.startAt,
          tone: 'amber',
          amount: entry.refundAmount
        });
      }

      if (raw.deposit_returned_at) {
        timeline.push({
          key: 'security-return',
          label: 'Security returned',
          timestamp: raw.deposit_returned_at,
          tone: 'emerald',
          amount: Math.max(0, this.toNumber(raw.deposit_return_amount))
        });
      }

      if (entry.closedAt) {
        timeline.push({
          key: 'closed',
          label: type === 'tour' ? 'Tour closed' : 'Rental closed',
          timestamp: entry.closedAt,
          tone: 'slate',
          note: entry.status
        });
      }

      return timeline
        .filter((item) => item.timestamp)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    };

    const rentals: CustomerRentalFinanceRow[] = [
      ...context.rentals
        .filter((entry) => String(entry.customerId) === normalizedCustomerId)
        .filter((entry) => this.rentalMatchesFilters(entry, filters))
        .map((entry) => {
          const raw = entry.raw || {};
          const paidAmount = Math.max(0, this.toNumber(entry.paidAmount));
          const totalAmount = Math.max(0, this.toNumber(entry.revenue));
          const remainingAmount = Math.max(0, this.toNumber(entry.remainingAmount));
          const securitySnapshot = this.getRentalSecuritySnapshot(raw);
          return {
            id: entry.id,
            rentalId: entry.rentalId,
            type: 'rental',
            customerId: normalizedCustomerId,
            customerName: entry.customerName,
            vehicleDisplay: this.buildVehicleDisplay(entry.vehicleId, context),
            status: entry.status,
            paymentStatus: entry.paymentStatus,
            totalAmount,
            paidAmount,
            remainingAmount,
            refundAmount: Math.max(0, this.toNumber(entry.refundAmount)),
            securityRequired: securitySnapshot.required,
            securityReceived: securitySnapshot.received,
            securityDocumentLabel: securitySnapshot.documentLabel,
            netCashPosition: paidAmount - Math.max(0, this.toNumber(entry.refundAmount)),
            startAt: entry.startAt,
            endAt: entry.endAt,
            closedAt: entry.closedAt,
            href: `/admin/rentals/${entry.id}`,
            timeline: buildTimeline(entry, 'rental')
          };
        }),
      ...context.tours
        .filter((entry) => String(entry.customerId) === normalizedCustomerId)
        .filter((entry) => this.rentalMatchesFilters(entry, filters))
        .map((entry) => {
          const raw = entry.raw || {};
          const paidAmount = Math.max(0, this.toNumber(raw.deposit_amount));
          const totalAmount = Math.max(0, this.toNumber(entry.revenue));
          const remainingAmount = Math.max(0, this.toNumber(entry.remainingAmount));
          return {
            id: entry.id,
            rentalId: entry.rentalId,
            type: 'tour',
            customerId: normalizedCustomerId,
            customerName: entry.customerName,
            vehicleDisplay: entry.packageName || 'Tour package',
            status: entry.status,
            paymentStatus: entry.paymentStatus,
            totalAmount,
            paidAmount,
            remainingAmount,
            refundAmount: Math.max(0, this.toNumber(entry.refundAmount)),
            securityRequired: 0,
            securityReceived: 0,
            securityDocumentLabel: null,
            netCashPosition: paidAmount - Math.max(0, this.toNumber(entry.refundAmount)),
            startAt: entry.startAt,
            endAt: entry.endAt,
            closedAt: entry.closedAt,
            href: '/admin/tours',
            timeline: buildTimeline(entry, 'tour')
          };
        })
    ].sort((a, b) => new Date(b.closedAt || b.endAt || b.startAt).getTime() - new Date(a.closedAt || a.endAt || a.startAt).getTime());

    if (!rentals.length) return null;

    const totalRevenue = rentals.reduce((sum, item) => sum + item.totalAmount, 0);
    const totalPaid = rentals.reduce((sum, item) => sum + item.paidAmount, 0);
    const totalOutstanding = rentals.reduce((sum, item) => sum + item.remainingAmount, 0);
    const totalRefunds = rentals.reduce((sum, item) => sum + item.refundAmount, 0);
    const securityRequired = rentals.reduce((sum, item) => sum + item.securityRequired, 0);
    const securityReceived = rentals.reduce((sum, item) => sum + item.securityReceived, 0);

    return {
      customerId: normalizedCustomerId,
      customerName: rentals[0].customerName,
      rentalCount: rentals.length,
      totalRevenue: Math.round(totalRevenue),
      totalPaid: Math.round(totalPaid),
      totalOutstanding: Math.round(totalOutstanding),
      totalRefunds: Math.round(totalRefunds),
      securityRequired: Math.round(securityRequired),
      securityReceived: Math.round(securityReceived),
      securityStillDue: Math.max(0, Math.round(securityRequired - securityReceived)),
      activeContracts: rentals.filter((item) => ['active', 'scheduled', 'ready_to_finish'].includes(String(item.status || '').toLowerCase())).length,
      lastActivity: rentals[0].closedAt || rentals[0].endAt || rentals[0].startAt,
      rentals
    };
  }

  async getFinanceAlerts(filters: FinanceFiltersV2): Promise<FinanceAlertsData> {
    const context = await this.getFinanceContext();
    const rows: FinanceAlertRow[] = [];

    const rentalRows = await this.getRentalRows(filters);
    rentalRows.forEach((row) => {
      const remainingAmount = Math.max(0, this.toNumber((row as any).raw?.remaining_amount ?? 0)) || Math.max(0, this.toNumber((row as any).remainingAmount ?? 0));
      const raw = context.rentals.find((entry) => String(entry.id) === String(row.id))?.raw || {};
      const securitySnapshot = this.getRentalSecuritySnapshot(raw);

      if (remainingAmount > 0) {
        rows.push({
          id: `unpaid-${row.id}`,
          type: 'unpaid_contract',
          severity: String(row.status || '').toLowerCase() === 'completed' ? 'high' : 'medium',
          title: `Rental ${row.rentalId} still has money due`,
          description: `${row.customer} • ${row.vehicleDisplay} • ${row.payment_status}`,
          amount: Math.round(remainingAmount),
          date: row.closedAt,
          href: `/admin/rentals/${row.id}`,
          rentalId: row.rentalId,
          vehicleId: row.vehicleId,
          customerId: row.customerId,
          sourceLabel: 'Rental'
        });
      }

      if (securitySnapshot.stillDue > 0 && !securitySnapshot.hasHeldDocument) {
        rows.push({
          id: `security-${row.id}`,
          type: 'security_due',
          severity: String(row.status || '').toLowerCase() === 'active' ? 'high' : 'medium',
          title: `Security is still pending for ${row.rentalId}`,
          description: `${row.customer} • ${row.vehicleDisplay}${securitySnapshot.hasRecordedMethod ? ` • ${securitySnapshot.source === 'bank_transfer' ? 'bank transfer' : 'cash'} recorded` : ''}`,
          amount: Math.round(securitySnapshot.stillDue),
          secondaryAmount: Math.round(securitySnapshot.required),
          date: row.closedAt,
          href: `/admin/rentals/${row.id}`,
          rentalId: row.rentalId,
          vehicleId: row.vehicleId,
          customerId: row.customerId,
          sourceLabel: 'Security'
        });
      }
    });

    context.maintenanceFinance
      .filter((record) => this.maintenanceMatchesFilters(record, filters))
      .filter((record) => record.billedRevenue > 0 && record.linkedRentalId)
      .forEach((record) => {
        const linkedRental = context.rentals.find((entry) => String(entry.rentalId) === String(record.linkedRentalId) || String(entry.id) === String(record.linkedRentalId));
        if (!linkedRental) return;
        if (Math.max(0, this.toNumber(linkedRental.remainingAmount)) <= 0) return;
        rows.push({
          id: `maintenance-recovery-${record.id}`,
          type: 'maintenance_recovery_pending',
          severity: 'medium',
          title: `Maintenance recovery still not collected`,
          description: `${linkedRental.customerName} • ${this.buildVehicleDisplay(linkedRental.vehicleId, context)} • Rental ${linkedRental.rentalId}`,
          amount: Math.round(record.billedRevenue),
          date: record.date,
          href: `/admin/rentals/${linkedRental.id}`,
          rentalId: linkedRental.rentalId,
          vehicleId: linkedRental.vehicleId,
          customerId: linkedRental.customerId,
          sourceLabel: 'Maintenance'
        });
      });

    const vehicleProfitData = await this.getTopVehiclesByProfit(filters, Math.max(context.vehicles.length, 10));
    vehicleProfitData.forEach((vehicle) => {
      if (vehicle.profit < 0) {
        rows.push({
          id: `negative-roi-${vehicle.vehicleId}`,
          type: 'negative_vehicle_roi',
          severity: 'high',
          title: `${vehicle.plateNumber} is operating at a loss`,
          description: `${vehicle.make} ${vehicle.model} • Net ${Math.round(vehicle.profitMargin)}%`,
          amount: Math.round(Math.abs(vehicle.profit)),
          secondaryAmount: Math.round(vehicle.revenue),
          href: '/admin/finance',
          vehicleId: vehicle.vehicleId,
          sourceLabel: 'Vehicle ROI'
        });
      } else if (vehicle.totalCosts > vehicle.revenue * 0.7 && vehicle.revenue > 0) {
        rows.push({
          id: `high-cost-${vehicle.vehicleId}`,
          type: 'high_vehicle_cost',
          severity: 'low',
          title: `${vehicle.plateNumber} has a high cost burden`,
          description: `${vehicle.make} ${vehicle.model} • Costs are ${Math.round((vehicle.totalCosts / vehicle.revenue) * 100)}% of revenue`,
          amount: Math.round(vehicle.totalCosts),
          secondaryAmount: Math.round(vehicle.revenue),
          href: '/admin/finance',
          vehicleId: vehicle.vehicleId,
          sourceLabel: 'Vehicle Cost'
        });
      }
    });

    rows.sort((a, b) => {
      const severityRank = { high: 3, medium: 2, low: 1 };
      const severityDelta = severityRank[b.severity] - severityRank[a.severity];
      if (severityDelta !== 0) return severityDelta;
      return new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
    });

    return {
      rows,
      unpaidTotal: rows.filter((row) => row.type === 'unpaid_contract').reduce((sum, row) => sum + row.amount, 0),
      securityDueTotal: rows.filter((row) => row.type === 'security_due').reduce((sum, row) => sum + row.amount, 0),
      maintenanceRecoveryPendingTotal: rows.filter((row) => row.type === 'maintenance_recovery_pending').reduce((sum, row) => sum + row.amount, 0),
      negativeVehicleCount: rows.filter((row) => row.type === 'negative_vehicle_roi').length
    };
  }

  async getFinanceTrustData(filters: FinanceFiltersV2): Promise<FinanceTrustData> {
    const context = await this.getFinanceContext();
    const [walletAccountsRaw, walletTransactionsRaw, paymentProofsRaw, walletTopupsRaw] = await Promise.all([
      this.safeLoadTable('app_wallet_accounts'),
      this.safeLoadTable('app_wallet_transactions'),
      this.safeLoadTable('app_payment_proofs'),
      this.safeLoadTable('wallet_topups')
    ]);

    const rentalCustomerMap = new Map<string, string>();
    const bookingReferenceMap = new Map<string, string>();
    [...context.rentals, ...context.tours].forEach((entry: any) => {
      const raw = entry.raw || {};
      const customerIds = [
        entry.customerId,
        raw.customer_id,
        raw.customer_ext_id,
        raw.customer_email
      ].filter(Boolean);
      customerIds.forEach((id) => rentalCustomerMap.set(String(id), entry.customerName));

      const bookingKeys = [
        entry.id,
        entry.rentalId,
        raw.id,
        raw.rental_id,
        raw.linked_display_id,
        raw.booking_id,
        raw.booking_ref_id
      ].filter(Boolean);
      bookingKeys.forEach((id) => bookingReferenceMap.set(String(id), entry.rentalId || String(id)));
    });

    const walletTopups = Array.isArray(walletTopupsRaw) ? walletTopupsRaw : [];
    const transactionsByWalletId = new Map<string, any[]>();
    (Array.isArray(walletTransactionsRaw) ? walletTransactionsRaw : []).forEach((row: any) => {
      const walletId = String(row.wallet_account_id || row.wallet_id || '');
      if (!walletId) return;
      const current = transactionsByWalletId.get(walletId) || [];
      current.push(row);
      transactionsByWalletId.set(walletId, current);
    });

    const topupsByUserId = new Map<string, any[]>();
    walletTopups.forEach((row: any) => {
      const userId = String(row.user_id || '');
      if (!userId) return;
      const current = topupsByUserId.get(userId) || [];
      current.push(row);
      topupsByUserId.set(userId, current);
    });

    const walletAccounts: FinanceWalletAccountRow[] = (Array.isArray(walletAccountsRaw) ? walletAccountsRaw : [])
      .map((row: any) => {
        const walletId = String(row.id || row.wallet_id || '');
        const transactions = transactionsByWalletId.get(walletId) || [];
        const topups = topupsByUserId.get(String(row.owner_id || row.user_id || '')) || [];
        const ownerType = String(row.owner_type || row.account_type || 'account');
        const ownerId = String(row.owner_id || row.user_id || row.operator_id || row.individual_owner_id || '');
        const ownerLabel = [
          row.owner_name,
          row.account_name,
          row.company_name,
          row.full_name,
          ownerId ? `${ownerType} • ${ownerId.slice(0, 8)}` : ownerType
        ].find(Boolean) as string;
        const verificationState = String(
          row.verification_state ||
          row.wallet_status ||
          row.status ||
          (row.verified ? 'verified' : 'pending')
        ).toLowerCase();
        const balance = Math.max(0, this.toNumber(row.current_balance ?? row.balance ?? row.wallet_balance));
        const approvedTopups = topups.length > 0
          ? topups
              .filter((tx: any) => String(tx.status || '').toLowerCase() === 'approved')
              .reduce((sum: number, tx: any) => sum + Math.max(0, this.toNumber(tx.amount)), 0)
          : transactions
              .filter((tx) => {
                const type = String(tx.transaction_type || tx.type || '').toLowerCase();
                const status = String(tx.status || tx.transaction_status || tx.approval_status || '').toLowerCase();
                return (type.includes('topup') || type.includes('top_up')) && (status === 'approved' || status === 'completed' || status === 'posted');
              })
              .reduce((sum, tx) => sum + Math.max(0, this.toNumber(tx.amount)), 0);
        const pendingTopups = topups.length > 0
          ? topups
              .filter((tx: any) => {
                const status = String(tx.status || '').toLowerCase();
                return status === 'pending' || status === 'submitted' || status === 'review';
              })
              .reduce((sum: number, tx: any) => sum + Math.max(0, this.toNumber(tx.amount)), 0)
          : transactions
              .filter((tx) => {
                const type = String(tx.transaction_type || tx.type || '').toLowerCase();
                const status = String(tx.status || tx.transaction_status || tx.approval_status || '').toLowerCase();
                return (type.includes('topup') || type.includes('top_up')) && (status === 'pending' || status === 'submitted' || status === 'review');
              })
              .reduce((sum, tx) => sum + Math.max(0, this.toNumber(tx.amount)), 0);
        const deductions = transactions
          .filter((tx) => {
            const type = String(tx.transaction_type || tx.type || '').toLowerCase();
            return type.includes('deduction') || type.includes('commission') || type.includes('adjustment');
          })
          .reduce((sum, tx) => sum + Math.max(0, this.toNumber(tx.amount)), 0);
        const lastActivity = transactions
          .map((tx) => tx.updated_at || tx.approved_at || tx.created_at || null)
          .filter(Boolean)
          .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || row.updated_at || row.created_at || null;

        return {
          id: walletId,
          ownerLabel,
          ownerType,
          verificationState,
          balance: Math.round(balance),
          approvedTopups: Math.round(approvedTopups),
          pendingTopups: Math.round(pendingTopups),
          deductions: Math.round(deductions),
          lastActivity
        };
      })
      .sort((a, b) => b.balance - a.balance);

    const bookingProofQueue: FinancePaymentProofQueueRow[] = (Array.isArray(paymentProofsRaw) ? paymentProofsRaw : [])
      .map((row: any) => {
        const status = String(row.proof_status || row.status || row.approval_status || 'pending').toLowerCase();
        const explicitType = String(row.proof_type || row.type || row.payment_type || row.category || '').toLowerCase();
        const proofType = explicitType.includes('wallet') || explicitType.includes('topup') || explicitType.includes('top_up')
          ? 'wallet'
          : 'booking';
        const bookingRef = row.booking_ref_id || row.booking_id || row.rental_id || row.booking_reference || null;
        const customerName = rentalCustomerMap.get(String(row.customer_id || row.customer_ext_id || row.booking_customer_id || '')) ||
          row.customer_name ||
          row.client_name ||
          'Unknown customer';
        const ownerLabel = row.operator_name || row.owner_name || row.reviewed_by_name || row.owner_type || 'Platform';
        const methodLabel = row.payment_method || row.method || row.source || explicitType || 'proof';

        return {
          id: String(row.id || `${proofType}-${bookingRef || row.created_at || Math.random()}`),
          proofType,
          status,
          amount: Math.round(Math.max(0, this.toNumber(row.amount || row.claimed_amount || row.expected_amount))),
          customerName,
          customerUserId: String(row.customer_user_id || row.user_id || row.customer_id || ''),
          customerEmail: String(row.customer_email || row.email || ''),
          ownerLabel,
          bookingReference: bookingRef ? bookingReferenceMap.get(String(bookingRef)) || String(bookingRef) : null,
          submittedAt: row.submitted_at || row.created_at || row.uploaded_at || null,
          methodLabel: String(methodLabel).replace(/_/g, ' '),
          href: bookingRef ? `/admin/rentals/${bookingRef}` : proofType === 'wallet' ? '/admin/user-management' : undefined,
          proofUrl: row.proof_url || row.file_url || row.receipt_url || row.attachment_url || row.document_url || '',
          customerNote: row.note || row.message || row.customer_note || '',
          reviewNote: row.review_note || row.rejection_reason || '',
        };
      })
    const walletProofQueue: FinancePaymentProofQueueRow[] = walletTopups
      .map((row: any) => ({
        id: String(row.id || `wallet-topup-${Math.random()}`),
        proofType: 'wallet' as const,
        status: String(row.status || 'pending').toLowerCase(),
        amount: Math.round(Math.max(0, this.toNumber(row.amount))),
        customerName: String(row.user_name || row.user_email || 'Unknown customer'),
        customerUserId: String(row.user_id || ''),
        customerEmail: String(row.user_email || ''),
        ownerLabel: row.reviewed_by || 'Customer wallet',
        bookingReference: null,
        submittedAt: row.created_at || row.updated_at || null,
        methodLabel: 'bank transfer',
        href: '/admin/finance?tab=alerts',
        proofUrl: row.proof_url || '',
        customerNote: row.note || '',
        reviewNote: row.review_note || '',
      }));
    const paymentProofQueue: FinancePaymentProofQueueRow[] = [...bookingProofQueue, ...walletProofQueue]
      .sort((a, b) => {
        const rank = (value: string) => {
          if (value === 'pending' || value === 'submitted' || value === 'review') return 3;
          if (value === 'approved' || value === 'completed') return 2;
          if (value === 'rejected') return 1;
          return 0;
        };
        const statusDelta = rank(b.status) - rank(a.status);
        if (statusDelta !== 0) return statusDelta;
        return new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime();
      });

    const approvedTopupsTotal = walletTopups.length > 0
      ? walletTopups
          .filter((row: any) => String(row.status || '').toLowerCase() === 'approved')
          .reduce((sum: number, row: any) => sum + Math.max(0, this.toNumber(row.amount)), 0)
      : walletAccounts.reduce((sum, row) => sum + row.approvedTopups, 0);
    const pendingTopupsTotal = walletTopups.length > 0
      ? walletTopups
          .filter((row: any) => {
            const status = String(row.status || '').toLowerCase();
            return status === 'pending' || status === 'submitted' || status === 'review';
          })
          .reduce((sum: number, row: any) => sum + Math.max(0, this.toNumber(row.amount)), 0)
      : walletAccounts.reduce((sum, row) => sum + row.pendingTopups, 0);
    const totalWalletBalance = walletAccounts.reduce((sum, row) => sum + row.balance, 0);
    const manualAdjustmentsTotal = (Array.isArray(walletTransactionsRaw) ? walletTransactionsRaw : [])
      .filter((tx: any) => String(tx.transaction_type || tx.type || '').toLowerCase().includes('adjustment'))
      .reduce((sum: number, tx: any) => sum + this.toNumber(tx.amount), 0);
    const rejectedTopupsTotal = walletTopups.length > 0
      ? walletTopups
          .filter((tx: any) => String(tx.status || '').toLowerCase() === 'rejected')
          .reduce((sum: number, tx: any) => sum + Math.max(0, this.toNumber(tx.amount)), 0)
      : (Array.isArray(walletTransactionsRaw) ? walletTransactionsRaw : [])
          .filter((tx: any) => {
            const type = String(tx.transaction_type || tx.type || '').toLowerCase();
            const status = String(tx.status || tx.transaction_status || tx.approval_status || '').toLowerCase();
            return (type.includes('topup') || type.includes('top_up')) && status === 'rejected';
          })
          .reduce((sum: number, tx: any) => sum + Math.max(0, this.toNumber(tx.amount)), 0);
    const deductionsTotal = walletAccounts.reduce((sum, row) => sum + row.deductions, 0);
    const walletLedgerExpectedTotal = Math.round(approvedTopupsTotal + manualAdjustmentsTotal - deductionsTotal);

    return {
      totalWalletBalance: Math.round(totalWalletBalance),
      approvedTopupsTotal: Math.round(approvedTopupsTotal),
      pendingTopupsTotal: Math.round(pendingTopupsTotal),
      rejectedTopupsTotal: Math.round(rejectedTopupsTotal),
      manualAdjustmentsTotal: Math.round(manualAdjustmentsTotal),
      walletLedgerExpectedTotal,
      walletReconciliationGap: Math.round(totalWalletBalance - walletLedgerExpectedTotal),
      verifiedWalletCount: walletAccounts.filter((row) => row.verificationState === 'verified').length,
      pendingWalletCount: walletAccounts.filter((row) => row.verificationState !== 'verified').length,
      pendingBookingProofCount: paymentProofQueue.filter((row) => row.proofType === 'booking' && (row.status === 'pending' || row.status === 'submitted' || row.status === 'review')).length,
      approvedBookingProofCount: paymentProofQueue.filter((row) => row.proofType === 'booking' && (row.status === 'approved' || row.status === 'completed')).length,
      rejectedBookingProofCount: paymentProofQueue.filter((row) => row.proofType === 'booking' && row.status === 'rejected').length,
      pendingWalletProofCount: paymentProofQueue.filter((row) => row.proofType === 'wallet' && (row.status === 'pending' || row.status === 'submitted' || row.status === 'review')).length,
      walletAccounts: walletAccounts.slice(0, 8),
      paymentProofQueue: paymentProofQueue.slice(0, 10)
    };
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

  async exportTourPL(filters: FinanceFiltersV2): Promise<ExportData> {
    const result = await this.getTourPLData(filters, 1, 5000, 'closedAt', 'desc');
    const headers = [
      'Tour ID',
      'Customer',
      'Guide',
      'Package',
      'Route',
      'Vehicles',
      'Model',
      'Revenue',
      'Base Revenue',
      'Fuel Surplus Revenue',
      'Fuel Costs',
      'Fuel Variance Liters',
      'Fuel Consumed Liters',
      'Fuel Surplus Liters',
      'Fuel Unit Cost',
      'Maintenance Costs',
      'Other Costs',
      'Total Costs',
      'Gross Profit',
      'Profit %',
      'Status',
      'Payment Status',
      'Closed At'
    ];

    return {
      filename: `finance_tour_pl_${filters.startDate}_${filters.endDate}.csv`,
      headers,
      data: result.data.map((row) => ({
        'Tour ID': row.tourId,
        Customer: row.customer,
        Guide: row.guideName,
        Package: row.packageName,
        Route: row.routeType,
        Vehicles: row.vehicleDisplay,
        Model: row.vehicleModel,
        Revenue: row.revenue,
        'Base Revenue': row.baseRevenue,
        'Fuel Surplus Revenue': row.fuelSurplusRevenue,
        'Fuel Costs': row.fuelCosts,
        'Fuel Variance Liters': row.fuelVarianceLiters,
        'Fuel Consumed Liters': row.fuelConsumedLiters,
        'Fuel Surplus Liters': row.fuelSurplusLiters,
        'Fuel Unit Cost': row.fuelUnitCost,
        'Maintenance Costs': row.maintenanceCosts,
        'Other Costs': row.otherCosts,
        'Total Costs': row.totalCosts,
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

  async getUnifiedLedger(filters: FinanceFiltersV2): Promise<FinanceLedgerData> {
    const context = await this.getFinanceContext();
    const rows: FinanceBreakdownRow[] = [];
    const rentalRows = await this.getRentalRows(filters);

    rentalRows.forEach((row) => {
      if (row.revenue > 0) {
        rows.push({
          id: `ledger-rental-revenue-${row.id}`,
          title: `Rental ${row.rentalId}`,
          subtitle: `${row.customer} • ${row.vehicleDisplay}`,
          amount: Math.round(row.revenue),
          direction: 'incoming',
          date: this.normalizeDate(row.closedAt),
          sourceType: 'rental',
          rentalId: row.rentalId,
          vehicleId: row.vehicleId,
          href: `/admin/rentals/${row.id}`,
          meta: {
            paymentStatus: row.payment_status,
            status: row.status
          }
        });
      }

      if (row.maintenanceCosts > 0) {
        rows.push({
          id: `ledger-rental-maintenance-${row.id}`,
          title: `Maintenance cost • ${row.rentalId}`,
          subtitle: row.vehicleDisplay,
          amount: Math.round(row.maintenanceCosts),
          direction: 'outgoing',
          date: this.normalizeDate(row.closedAt),
          sourceType: 'maintenance',
          rentalId: row.rentalId,
          vehicleId: row.vehicleId,
          href: `/admin/rentals/${row.id}`,
          meta: {
            partsConsumedCost: Math.round(row.partsConsumedCost || 0)
          }
        });
      }

      if (row.fuelCosts > 0) {
        rows.push({
          id: `ledger-rental-fuel-${row.id}`,
          title: `Fuel cost • ${row.rentalId}`,
          subtitle: row.vehicleDisplay,
          amount: Math.round(row.fuelCosts),
          direction: 'outgoing',
          date: this.normalizeDate(row.closedAt),
          sourceType: 'fuel',
          rentalId: row.rentalId,
          vehicleId: row.vehicleId,
          href: `/admin/rentals/${row.id}`
        });
      }

      if (row.inventoryCosts > 0) {
        rows.push({
          id: `ledger-rental-inventory-${row.id}`,
          title: `Inventory cost • ${row.rentalId}`,
          subtitle: row.vehicleDisplay,
          amount: Math.round(row.inventoryCosts),
          direction: 'outgoing',
          date: this.normalizeDate(row.closedAt),
          sourceType: 'inventory',
          rentalId: row.rentalId,
          vehicleId: row.vehicleId,
          href: `/admin/rentals/${row.id}`
        });
      }

      if (row.taxes > 0) {
        rows.push({
          id: `ledger-rental-tax-${row.id}`,
          title: `Taxes • ${row.rentalId}`,
          subtitle: row.vehicleDisplay,
          amount: Math.round(row.taxes),
          direction: 'tax',
          date: this.normalizeDate(row.closedAt),
          sourceType: 'tax',
          rentalId: row.rentalId,
          vehicleId: row.vehicleId,
          href: `/admin/rentals/${row.id}`
        });
      }
    });

    context.tours
      .filter((tour) => this.rentalMatchesFilters(tour, filters))
      .forEach((tour) => {
        const amount = Math.round(this.toNumber(tour.revenue));
        if (amount <= 0) return;
        rows.push({
          id: `ledger-tour-${tour.id}`,
          title: tour.packageName || 'Tour booking',
          subtitle: `${tour.customerName}${tour.guideName ? ` • ${tour.guideName}` : ''}`,
          amount,
          direction: 'incoming',
          date: this.normalizeDate(tour.closedAt || tour.endAt || tour.startAt),
          sourceType: 'tour',
          rentalId: tour.rentalId,
          vehicleId: tour.vehicleId,
          href: '/admin/tours',
          meta: {
            routeType: tour.routeType || 'tour'
          }
        });
      });

    context.maintenanceFinance
      .filter((record) => this.maintenanceMatchesFilters(record, filters))
      .filter((record) => !record.linkedRentalId)
      .forEach((record) => {
        const date = this.normalizeDate(record.date);
        if (record.billedRevenue > 0) {
          rows.push({
            id: `ledger-damage-recovery-${record.id}`,
            title: record.description || 'Damage recovery',
            subtitle: this.buildVehicleDisplay(record.vehicleId, context),
            amount: Math.round(record.billedRevenue),
            direction: 'incoming',
            date,
            sourceType: 'damage_recovery',
            vehicleId: record.vehicleId,
            maintenanceId: record.id,
            href: record.linkedRentalId ? `/admin/rentals/${record.linkedRentalId}` : `/admin/maintenance?maintenanceId=${record.id}`
          });
        }

        if (record.maintenanceCost > 0) {
          rows.push({
            id: `ledger-maintenance-out-${record.id}`,
            title: record.description || 'Maintenance',
            subtitle: this.buildVehicleDisplay(record.vehicleId, context),
            amount: Math.round(record.maintenanceCost),
            direction: 'outgoing',
            date,
            sourceType: 'maintenance',
            vehicleId: record.vehicleId,
            maintenanceId: record.id,
            href: `/admin/maintenance?maintenanceId=${record.id}`,
            meta: {
              partsConsumedCost: Math.round(record.partsConsumedCost || 0)
            }
          });
        }

        if (record.inventoryCost > 0) {
          rows.push({
            id: `ledger-maintenance-inventory-${record.id}`,
            title: `Parts / inventory • ${record.description || 'Maintenance'}`,
            subtitle: this.buildVehicleDisplay(record.vehicleId, context),
            amount: Math.round(record.inventoryCost),
            direction: 'outgoing',
            date,
            sourceType: 'inventory',
            vehicleId: record.vehicleId,
            maintenanceId: record.id,
            href: `/admin/maintenance?maintenanceId=${record.id}`
          });
        }

        if (record.tax > 0) {
          rows.push({
            id: `ledger-maintenance-tax-${record.id}`,
            title: `Taxes • ${record.description || 'Maintenance'}`,
            subtitle: this.buildVehicleDisplay(record.vehicleId, context),
            amount: Math.round(record.tax),
            direction: 'tax',
            date,
            sourceType: 'tax',
            vehicleId: record.vehicleId,
            maintenanceId: record.id,
            href: `/admin/maintenance?maintenanceId=${record.id}`
          });
        }
      });

    context.financeExpenses
      .filter((expense: any) => String(expense?.status || 'active').toLowerCase() !== 'reversed')
      .filter((expense: any) => this.isDateInRange(expense.expense_date || expense.created_at, filters.startDate, filters.endDate))
      .filter((expense: any) => {
        if (filters.vehicleIds.length === 0) return true;
        return expense.vehicle_id && filters.vehicleIds.map(String).includes(String(expense.vehicle_id));
      })
      .forEach((expense: any) => {
        const amount = Math.round(this.toNumber(expense.amount));
        if (amount <= 0) return;
        rows.push({
          id: `ledger-finance-expense-${expense.id}`,
          title: expense.description || 'Manual expense',
          subtitle: this.buildExpenseSubtitle(expense, context),
          amount,
          direction: 'outgoing',
          date: this.normalizeDate(expense.expense_date || expense.created_at),
          sourceType: 'finance_expense',
          vehicleId: expense.vehicle_id ? String(expense.vehicle_id) : undefined,
          href: '/admin/finance',
          meta: {
            category: expense.category || '',
            subcategory: expense.subcategory || ''
          }
        });
      });

    context.fuelRefills
      .filter((row: any) => this.isDateInRange(row.refill_date || row.created_at, filters.startDate, filters.endDate))
      .filter((row: any) => {
        if (filters.vehicleIds.length === 0) return true;
        return row.vehicle_id && filters.vehicleIds.map(String).includes(String(row.vehicle_id));
      })
      .forEach((row: any) => {
        const liters = this.getFuelLiters(row);
        const amount = this.getFuelAmount(row, context.averageTankUnitCost);
        if (amount <= 0) return;
        const isTankIn = !row.vehicle_id;
        rows.push({
          id: `ledger-fuel-refill-${row.id || row.created_at}`,
          title: isTankIn ? 'Tank refill' : 'Direct vehicle fill',
          subtitle: isTankIn ? `${liters}L into main tank` : this.buildVehicleDisplay(String(row.vehicle_id), context),
          amount: Math.round(amount),
          direction: 'outgoing',
          date: this.normalizeDate(row.refill_date || row.created_at),
          sourceType: isTankIn ? 'tank_in' : 'direct_fill',
          vehicleId: row.vehicle_id ? String(row.vehicle_id) : undefined,
          href: '/admin/fuel',
          meta: {
            liters
          }
        });
      });

    context.vehicles
      .filter((vehicle: any) => this.isDateInRange(vehicle.purchase_date, filters.startDate, filters.endDate))
      .filter((vehicle: any) => {
        if (filters.vehicleIds.length === 0) return true;
        return filters.vehicleIds.map(String).includes(String(vehicle.id));
      })
      .forEach((vehicle: any) => {
        const amount = Math.round(this.toNumber(vehicle.purchase_cost_mad));
        if (amount <= 0) return;
        rows.push({
          id: `ledger-purchase-${vehicle.id}`,
          title: 'Vehicle purchase',
          subtitle: this.buildVehicleDisplay(String(vehicle.id), context),
          amount,
          direction: 'outgoing',
          date: this.normalizeDate(vehicle.purchase_date),
          sourceType: 'purchase',
          vehicleId: String(vehicle.id),
          href: `/admin/fleet/${vehicle.id}`
        });
      });

    this.getDispositionRecords(filters).forEach((record: any) => {
      const amount = Math.round(this.toNumber(record.sale_price_mad));
      if (amount <= 0) return;
      rows.push({
        id: `ledger-disposition-${record.id}`,
        title: record.event_type === 'sold' ? 'Vehicle sale' : 'Vehicle disposal',
        subtitle: this.buildVehicleDisplay(String(record.vehicle_id), context),
        amount,
        direction: record.event_type === 'sold' ? 'incoming' : 'outgoing',
        date: this.normalizeDate(record.event_date || record.updated_at),
        sourceType: record.event_type,
        vehicleId: String(record.vehicle_id),
        href: `/admin/fleet/${record.vehicle_id}`
      });
    });

    rows.sort((a, b) => {
      const dateDelta = new Date(`${b.date || '1970-01-01'}T00:00:00`).getTime() - new Date(`${a.date || '1970-01-01'}T00:00:00`).getTime();
      if (dateDelta !== 0) return dateDelta;
      return (b.amount || 0) - (a.amount || 0);
    });

    const incomingTotal = rows.filter((row) => row.direction === 'incoming').reduce((sum, row) => sum + row.amount, 0);
    const outgoingTotal = this.sumOverviewExpenses(rows);
    const taxesTotal = rows.filter((row) => row.direction === 'tax').reduce((sum, row) => sum + row.amount, 0);

    return {
      rows,
      incomingTotal,
      outgoingTotal,
      taxesTotal,
      netTotal: incomingTotal - outgoingTotal - taxesTotal
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
    const buildCollectedRows = () => {
      const collectedWindow = this.getRentalCollectedWindowRange(filters);
      const windowStart = this.toValidDate(collectedWindow.start);
      const windowEnd = this.toValidDate(collectedWindow.end);
      return context.rentals
        .filter((rental) => this.rentalMatchesFilters(rental, filters, true))
        .filter((rental) => this.doesRentalIntersectCollectedWindow(rental, collectedWindow.start, collectedWindow.end))
        .map((rental) => {
          const raw = rental.raw || {};
          const entries = getRentalCollectedEntries(raw).filter((entry: any) => {
            if (!entry?.at || !windowStart || !windowEnd) return false;
            return entry.at >= windowStart && entry.at <= windowEnd;
          });
          const amount = entries.reduce((sum: number, entry: any) => sum + this.toNumber(entry.amount), 0);
          if (amount <= 0) return null;

          const customerPaid = entries
            .filter((entry: any) => entry?.type !== 'seized_security_deposit')
            .reduce((sum: number, entry: any) => sum + this.toNumber(entry.amount), 0);
          const securityApplied = Math.max(0, amount - customerPaid);
          const latestEntryAt = entries
            .map((entry: any) => entry?.at)
            .filter(Boolean)
            .sort((left: Date, right: Date) => right.getTime() - left.getTime())[0];

          return {
            id: `collected-rental-${rental.id}`,
            title: `Rental ${rental.rentalId}`,
            subtitle: `${rental.customerName} • ${rental.vehicleDisplay}`,
            amount: Math.round(this.toNumber(amount)),
            direction: 'incoming' as const,
            date: this.normalizeDate(latestEntryAt || rental.recognizedAt || rental.financeDate || rental.closedAt),
            sourceType: 'rental',
            rentalId: rental.rentalId,
            vehicleId: rental.vehicleId,
            href: `/admin/rentals/${rental.id}`,
            status: rental.paymentStatus,
            meta: {
              paymentStatus: rental.paymentStatus,
              status: rental.status,
              customerPaid: Math.round(customerPaid),
              securityApplied: Math.round(securityApplied),
            },
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => {
          const dateA = a.date || '';
          const dateB = b.date || '';
          if (dateA !== dateB) return dateB.localeCompare(dateA);
          return (b.amount || 0) - (a.amount || 0);
        });
    };

    if (type === 'collected') {
      const rows = buildCollectedRows();

      return {
        type,
        title: 'Collected',
        total: rows.reduce((sum, row) => sum + row.amount, 0),
        period,
        rows,
      };
    }

    if (['revenue', 'incoming', 'expenses', 'outgoing', 'profit', 'net', 'tax', 'taxes'].includes(type)) {
      const ledger = this.getUnifiedLedgerFromContext(context, filters);
      const normalizedRows = ledger.rows.map((row) => ({
        ...row,
        amount: Math.round(this.toNumber(row.amount)),
      }));

      if (type === 'revenue' || type === 'incoming') {
        const rows = normalizedRows.filter((row) => row.direction === 'incoming');
        return {
          type,
          title: type === 'incoming' ? 'Incoming' : 'Revenue',
          total: rows.reduce((sum, row) => sum + row.amount, 0),
          period,
          rows,
        };
      }

      if (type === 'expenses' || type === 'outgoing') {
        const rows = normalizedRows.filter((row) => this.isOverviewExpenseRow(row));
        return {
          type,
          title: type === 'outgoing' ? 'Outgoing' : 'Expenses',
          total: rows.reduce((sum, row) => sum + row.amount, 0),
          period,
          rows,
        };
      }

      if (type === 'tax' || type === 'taxes') {
        const rows = normalizedRows.filter((row) => row.direction === 'tax');
        return {
          type,
          title: 'Taxes',
          total: rows.reduce((sum, row) => sum + row.amount, 0),
          period,
          rows,
        };
      }

      if (type === 'net') {
        const metrics = this.getPeriodMetricsFromContext(context, filters);
        const rows = [
          ...buildCollectedRows(),
          ...normalizedRows.filter((row) => this.isOverviewExpenseRow(row)),
          ...normalizedRows.filter((row) => row.direction === 'tax'),
        ].sort((a: any, b: any) => {
          const dateA = a.date || '';
          const dateB = b.date || '';
          if (dateA !== dateB) return dateB.localeCompare(dateA);
          return (b.amount || 0) - (a.amount || 0);
        });

        return {
          type,
          title: 'Net Cash Breakdown',
          total: Math.round(metrics.netCash),
          period,
          rows,
        };
      }

      return {
        type,
        title: 'Net Profit Breakdown',
        total: Math.round(ledger.netTotal),
        period,
        rows: normalizedRows,
      };
    }

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
            partsConsumedCost: Math.round(record.partsConsumedCost || record.inventoryCost),
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
      const rentalRows = this.getRentalRowsFromContext(context, filters)
        .filter((row) => row.fuelCosts > 0)
        .map((row) => ({
          id: `fuel-rental-${row.id}`,
          title: `Rental fuel • ${row.rentalId}`,
          subtitle: `${row.customer} • ${row.vehicleDisplay}`,
          amount: Math.round(row.fuelCosts),
          date: this.normalizeDate(row.financeDate || row.closedAt),
          sourceType: 'fuel',
          vehicleId: row.vehicleId,
          rentalId: row.rentalId,
          href: `/admin/rentals/${row.id}`,
          meta: {
            fuelVarianceLiters: row.fuelVarianceLiters
          }
        }));

      const tourRows = this.buildTourPLRowsFromContext(context, filters)
        .filter((row) => row.fuelCosts > 0)
        .map((row) => ({
          id: `fuel-tour-${row.id}`,
          title: `Tour fuel • ${row.tourId}`,
          subtitle: `${row.customer} • ${row.vehicleDisplay}`,
          amount: Math.round(row.fuelCosts),
          date: this.normalizeDate(row.financeDate || row.closedAt),
          sourceType: 'fuel',
          vehicleId: row.vehicleIds?.[0],
          rentalId: row.tourId,
          href: '/admin/tours',
          meta: {
            liters: row.fuelConsumedLiters,
            unitPrice: row.fuelUnitCost,
            fuelVarianceLiters: row.fuelVarianceLiters
          }
        }));

      const rows = [...rentalRows, ...tourRows].sort(
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

    if (type === 'inventory' || type === 'parts_consumed' || type === 'parts_margin') {
      const maintenanceRows = context.maintenanceFinance.filter((record) => this.maintenanceMatchesFilters(record, filters));
      const rows = maintenanceRows
        .filter((record) => (type === 'parts_margin' ? record.partsMargin > 0 : (record.partsConsumedCost || record.inventoryCost) > 0))
        .map((record) => ({
          id: `${type}-${record.id}`,
          title: type === 'parts_margin'
            ? (record.description || 'Maintenance parts')
            : `Parts consumed • ${record.description || 'Maintenance'}`,
          subtitle: this.buildVehicleDisplay(record.vehicleId, context),
          amount: Math.round(type === 'parts_margin' ? record.partsMargin : (record.partsConsumedCost || record.inventoryCost)),
          date: record.date,
          sourceType: type === 'inventory' ? 'parts_consumed' : type,
          vehicleId: record.vehicleId,
          maintenanceId: record.id,
          rentalId: record.linkedRentalId || undefined,
          href: `/admin/maintenance?maintenanceId=${record.id}`,
          meta: {
            billedRevenue: Math.round(record.billedRevenue),
            maintenanceCost: Math.round(record.maintenanceCost),
            partsConsumedCost: Math.round(record.partsConsumedCost || record.inventoryCost),
            partsMargin: Math.round(record.partsMargin)
          }
        }))
        .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

      return {
        type,
        title: type === 'parts_margin' ? 'Parts Margin' : 'Parts Consumed',
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
export const getDayBreakdown = (anchorDate: string, filters: FinanceFiltersV2) =>
  financeApiV2.getDayBreakdown(anchorDate, filters);
export const getUnifiedLedger = (filters: FinanceFiltersV2) =>
  financeApiV2.getUnifiedLedger(filters);
export const getTopVehiclesByProfit = (filters: FinanceFiltersV2, limit?: number) =>
  financeApiV2.getTopVehiclesByProfit(filters, limit);
export const getVehicleFinanceData = (vehicleIds: string[], filters: FinanceFiltersV2) =>
  financeApiV2.getVehicleFinanceData(vehicleIds, filters);
export const getARAgingData = (filters: FinanceFiltersV2) => financeApiV2.getARAgingData(filters);
export const getCustomerAnalysisData = (filters: FinanceFiltersV2) => financeApiV2.getCustomerAnalysisData(filters);
export const exportCustomerAnalysis = (filters: FinanceFiltersV2) => financeApiV2.exportCustomerAnalysis(filters);
export const exportPeriodPL = (filters: FinanceFiltersV2) => financeApiV2.exportPeriodPL(filters);
export const getTourPLData = (
  filters: FinanceFiltersV2,
  page?: number,
  pageSize?: number,
  sortBy?: string,
  sortOrder?: 'asc' | 'desc',
  searchTerm?: string
) => financeApiV2.getTourPLData(filters, page, pageSize, sortBy, sortOrder, searchTerm);
export const exportTourPL = (filters: FinanceFiltersV2) => financeApiV2.exportTourPL(filters);
export const exportVehicleProfitability = (filters: FinanceFiltersV2) =>
  financeApiV2.exportVehicleProfitability(filters);
export const exportARAging = (filters: FinanceFiltersV2) => financeApiV2.exportARAging(filters);
export const getCostBreakdown = (type: string, filters: FinanceFiltersV2) =>
  financeApiV2.getCostBreakdown(type, filters);
