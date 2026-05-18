import { supabase } from '../lib/supabase';
import MaintenanceService from './MaintenanceService';

const APP_ID = '4c3a7a6153';
const RENTALS_TABLE = `app_${APP_ID}_rentals`;

class VehicleReportService {
  constructor() {
    this.table = `app_${APP_ID}_vehicle_reports`;
    this.chargeConfigKey = 'vehicle_report_charge_config_v1';
    this.tableAvailability = null;
  }

  canUseLocalStorage() {
    return typeof window !== 'undefined' && Boolean(window.localStorage);
  }

  getLocalChargeConfigs() {
    if (!this.canUseLocalStorage()) return {};

    try {
      const raw = window.localStorage.getItem(this.chargeConfigKey);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      console.error('Failed to read local vehicle report charge config:', error);
      return {};
    }
  }

  saveLocalChargeConfigs(configs) {
    if (!this.canUseLocalStorage()) return;

    try {
      window.localStorage.setItem(this.chargeConfigKey, JSON.stringify(configs || {}));
    } catch (error) {
      console.error('Failed to persist local vehicle report charge config:', error);
    }
  }

  getChargeConfig(reportId) {
    if (!reportId) return null;
    const configs = this.getLocalChargeConfigs();
    return configs[reportId] || null;
  }

  calculateStayCharge(config = {}) {
    const enabled = config.maintenance_daily_enabled !== false;
    if (!enabled) return 0;
    const days = Math.max(0, parseInt(config.maintenance_daily_days || 0, 10) || 0);
    const dailyRate = Math.max(0, Number(config.maintenance_daily_rate || 0));
    const discount = Math.max(0, Number(config.maintenance_daily_discount || 0));
    return Math.max(0, (days * dailyRate) - discount);
  }

  hasMeaningfulAmountChange(currentValue, nextValue) {
    return Math.abs(Number(currentValue || 0) - Number(nextValue || 0)) > 0.009;
  }

  normalizeMaintenanceLifecycleStatus(status) {
    const normalizedStatus = String(status || '').toLowerCase();
    if (!normalizedStatus) return null;
    if (normalizedStatus === 'completed' || normalizedStatus === 'maintenance_completed') {
      return 'maintenance_completed';
    }
    if (['scheduled', 'in_progress', 'maintenance_created', 'maintenance_in_progress'].includes(normalizedStatus)) {
      return 'maintenance_in_progress';
    }
    return normalizedStatus;
  }

  isRentalPricingLocked(rental = null) {
    const normalizedStatus = String(rental?.rental_status || rental?.status || '').toLowerCase();
    return ['completed', 'closed', 'returned'].includes(normalizedStatus) || Boolean(rental?.completed_at);
  }

  async getRentalPricingContext(rentalId) {
    if (!rentalId) return null;

    try {
      const { data, error } = await supabase
        .from(RENTALS_TABLE)
        .select('id, rental_status, completed_at')
        .eq('id', rentalId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data || null;
    } catch (error) {
      console.warn('Unable to load rental pricing context for vehicle report:', error);
      return null;
    }
  }

  buildRentalMaintenanceSnapshot(report = {}) {
    const maintenanceDailyEnabled = report.maintenance_daily_enabled !== false;
    const maintenanceDailyDays = Math.max(0, parseInt(report.maintenance_daily_days || 0, 10) || 0);
    const maintenanceDailyRate = Math.max(0, Number(report.maintenance_daily_rate || 0));
    const maintenanceDailyDiscount = Math.max(0, Number(report.maintenance_daily_discount || 0));
    const maintenanceDailyTotal = Math.max(
      0,
      Number(report.maintenance_daily_total || this.calculateStayCharge({
        maintenance_daily_enabled: maintenanceDailyEnabled,
        maintenance_daily_days: maintenanceDailyDays,
        maintenance_daily_rate: maintenanceDailyRate,
        maintenance_daily_discount: maintenanceDailyDiscount,
      }))
    );
    const maintenanceCostTotal = Math.max(0, Number(report.maintenance_cost_total || 0));
    const customerChargeTotal = Boolean(report.customer_chargeable)
      ? Math.max(0, Number(report.customer_charge_amount || (maintenanceCostTotal + maintenanceDailyTotal)))
      : 0;

    return {
      linked_maintenance_id: report.maintenance_id || null,
      linked_maintenance_status: report.status || null,
      linked_maintenance_cost_total: maintenanceCostTotal,
      linked_maintenance_customer_charge_total: customerChargeTotal,
      linked_maintenance_daily_enabled: maintenanceDailyEnabled,
      linked_maintenance_daily_days: maintenanceDailyDays,
      linked_maintenance_daily_rate: maintenanceDailyRate,
      linked_maintenance_daily_discount: maintenanceDailyDiscount,
      linked_maintenance_daily_total: maintenanceDailyTotal,
      linked_maintenance_synced_at: new Date().toISOString(),
    };
  }

  async syncRentalMaintenanceSnapshot(report = {}) {
    if (!report?.rental_id) {
      return { success: true, skipped: true };
    }

    const payload = this.buildRentalMaintenanceSnapshot(report);

    try {
      const { error } = await supabase
        .from(RENTALS_TABLE)
        .update(payload)
        .eq('id', report.rental_id);

      if (error) {
        throw error;
      }

      return { success: true };
    } catch (error) {
      console.warn('Unable to sync rental maintenance snapshot:', error);
      return { success: false, error: error.message };
    }
  }

  async saveChargeConfig(reportId, config = {}) {
    if (!reportId) {
      throw new Error('Vehicle report id is required');
    }

    const report = await this.getReportById(reportId);
    const sanitizedConfig = {
      maintenance_daily_enabled: config.maintenance_daily_enabled !== false,
      maintenance_daily_days: Math.max(0, parseInt(config.maintenance_daily_days || 0, 10) || 0),
      maintenance_daily_rate: Math.max(0, Number(config.maintenance_daily_rate || 0)),
      maintenance_daily_discount: Math.max(0, Number(config.maintenance_daily_discount || 0)),
      maintenance_daily_total: this.calculateStayCharge(config),
      updated_at: new Date().toISOString(),
    };

    const configs = this.getLocalChargeConfigs();
    configs[reportId] = sanitizedConfig;
    this.saveLocalChargeConfigs(configs);

    if (report?.customer_chargeable) {
      const repairTotal = Number(report.maintenance_cost_total || report.customer_charge_amount || 0);
      const totalCustomerCharge = repairTotal + sanitizedConfig.maintenance_daily_total;

      try {
        await this.updateReport(reportId, {
          maintenance_daily_enabled: sanitizedConfig.maintenance_daily_enabled,
          maintenance_daily_days: sanitizedConfig.maintenance_daily_days,
          maintenance_daily_rate: sanitizedConfig.maintenance_daily_rate,
          maintenance_daily_discount: sanitizedConfig.maintenance_daily_discount,
          maintenance_daily_total: sanitizedConfig.maintenance_daily_total,
          customer_charge_amount: totalCustomerCharge,
        });
      } catch (error) {
        console.warn('Unable to persist total customer charge to vehicle report row:', error);
      }
    } else {
      try {
        await this.updateReport(reportId, {
          maintenance_daily_enabled: sanitizedConfig.maintenance_daily_enabled,
          maintenance_daily_days: sanitizedConfig.maintenance_daily_days,
          maintenance_daily_rate: sanitizedConfig.maintenance_daily_rate,
          maintenance_daily_discount: sanitizedConfig.maintenance_daily_discount,
          maintenance_daily_total: sanitizedConfig.maintenance_daily_total,
        });
      } catch (error) {
        console.warn('Unable to persist maintenance stay charge config to vehicle report row:', error);
      }
    }

    const nextReport = await this.getReportById(reportId);
    await this.syncRentalMaintenanceSnapshot(nextReport);
    return nextReport;
  }

  async isTableAvailable() {
    if (this.tableAvailability !== null) {
      return this.tableAvailability;
    }

    try {
      const { error } = await supabase.from(this.table).select('id').limit(1);
      this.tableAvailability = !error;
      return this.tableAvailability;
    } catch (error) {
      this.tableAvailability = false;
      return false;
    }
  }

  ensureTableReady() {
    if (this.tableAvailability === false) {
      throw new Error('Vehicle reports table is not ready yet');
    }
  }

  normalizeReport(row, options = {}) {
    if (!row) return null;

    const chargeConfig = options.ignoreLocalChargeConfig ? {} : (this.getChargeConfig(row.id) || {});
    const maintenanceDailyDays = Math.max(0, parseInt(
      chargeConfig.maintenance_daily_days ?? row.maintenance_daily_days ?? 0,
      10
    ) || 0);
    const maintenanceDailyEnabled =
      chargeConfig.maintenance_daily_enabled !== undefined
        ? chargeConfig.maintenance_daily_enabled !== false
        : row.maintenance_daily_enabled !== undefined && row.maintenance_daily_enabled !== null
          ? row.maintenance_daily_enabled !== false
          : maintenanceDailyDays > 0;
    const maintenanceDailyRate = Math.max(0, Number(
      chargeConfig.maintenance_daily_rate ?? row.maintenance_daily_rate ?? 0
    ));
    const maintenanceDailyDiscount = Math.max(0, Number(
      chargeConfig.maintenance_daily_discount ?? row.maintenance_daily_discount ?? 0
    ));
    const maintenanceDailyTotal = this.calculateStayCharge({
      maintenance_daily_enabled: maintenanceDailyEnabled,
      maintenance_daily_days: maintenanceDailyDays,
      maintenance_daily_rate: maintenanceDailyRate,
      maintenance_daily_discount: maintenanceDailyDiscount,
    });
    const maintenanceRepairTotal = Number(row.maintenance_cost_total || 0);
    const baseCustomerCharge = Number(row.customer_charge_amount || 0);
    const combinedCustomerCharge = row.customer_chargeable
      ? Math.max(baseCustomerCharge, maintenanceRepairTotal) + maintenanceDailyTotal
      : 0;

    return {
      ...row,
      photos: Array.isArray(row.photos) ? row.photos : [],
      affected_areas: Array.isArray(row.affected_areas) ? row.affected_areas : [],
      maintenance_cost_total: maintenanceRepairTotal,
      maintenance_daily_enabled: maintenanceDailyEnabled,
      maintenance_daily_days: maintenanceDailyDays,
      maintenance_daily_rate: maintenanceDailyRate,
      maintenance_daily_discount: maintenanceDailyDiscount,
      maintenance_daily_total: maintenanceDailyTotal,
      customer_charge_amount: combinedCustomerCharge,
      customer_chargeable: Boolean(row.customer_chargeable),
      send_to_maintenance: row.send_to_maintenance !== false,
    };
  }

  async hydrateReportsWithLiveMaintenance(reports = []) {
    const normalizedReports = (reports || [])
      .map((row) => this.normalizeReport(row))
      .filter(Boolean);

    const maintenanceIds = [
      ...new Set(normalizedReports.map((report) => report?.maintenance_id).filter(Boolean).map(String)),
    ];

    if (maintenanceIds.length === 0) {
      return normalizedReports;
    }

    try {
      const { data, error } = await supabase
        .from(MaintenanceService.table)
        .select('id,status,cost')
        .in('id', maintenanceIds);

      if (error) {
        throw error;
      }

      const maintenanceById = new Map(
        (data || []).map((row) => [String(row.id), row])
      );

      return normalizedReports.map((report) => {
        const maintenance = maintenanceById.get(String(report?.maintenance_id || ''));
        if (!maintenance) {
          return report;
        }

        const nextStatus = this.normalizeMaintenanceLifecycleStatus(maintenance.status);
        const nextMaintenanceCost = Number(maintenance.cost || report.maintenance_cost_total || 0);
        const nextCustomerCharge = report.customer_chargeable
          ? nextMaintenanceCost
          : Number(report.customer_charge_amount || 0);

        return {
          ...report,
          maintenance,
          status: nextStatus || report.status,
          maintenance_cost_total: nextMaintenanceCost,
          ...(report.customer_chargeable ? { customer_charge_amount: nextCustomerCharge } : {}),
        };
      });
    } catch (error) {
      console.warn('Unable to hydrate vehicle reports with live maintenance state:', error);
      return normalizedReports;
    }
  }

  async getReportsForRental(rentalId) {
    const tableAvailable = await this.isTableAvailable();
    this.ensureTableReady();

    const { data, error } = await supabase
      .from(this.table)
      .select('*')
      .eq('rental_id', rentalId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return this.hydrateReportsWithLiveMaintenance(data || []);
  }

  async getReportsForVehicle(vehicleId) {
    const tableAvailable = await this.isTableAvailable();
    this.ensureTableReady();

    const { data, error } = await supabase
      .from(this.table)
      .select('*')
      .eq('vehicle_id', vehicleId)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return this.hydrateReportsWithLiveMaintenance(data || []);
  }

  async getLatestReportForRental(rentalId) {
    const reports = await this.getReportsForRental(rentalId);
    return reports[0] || null;
  }

  async getLatestReportsForRentals(rentalIds = []) {
    const ids = (rentalIds || []).filter(Boolean);
    if (ids.length === 0) return {};

    const tableAvailable = await this.isTableAvailable();
    const reportsByRental = {};

    this.ensureTableReady();

    const { data, error } = await supabase
      .from(this.table)
      .select('*')
      .in('rental_id', ids)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    const hydratedReports = await this.hydrateReportsWithLiveMaintenance(data || []);

    hydratedReports.forEach((normalized) => {
      if (!reportsByRental[normalized.rental_id]) {
        reportsByRental[normalized.rental_id] = normalized;
      }
    });

    return reportsByRental;
  }

  async getReportById(reportId) {
    const tableAvailable = await this.isTableAvailable();
    this.ensureTableReady();

    const { data, error } = await supabase
      .from(this.table)
      .select('*')
      .eq('id', reportId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const [normalized] = await this.hydrateReportsWithLiveMaintenance(data ? [data] : []);
    await this.syncRentalMaintenanceSnapshot(normalized);
    return normalized;
  }

  async getReportByMaintenanceId(maintenanceId) {
    const tableAvailable = await this.isTableAvailable();
    this.ensureTableReady();

    const { data, error } = await supabase
      .from(this.table)
      .select('*')
      .eq('maintenance_id', maintenanceId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const [normalized] = await this.hydrateReportsWithLiveMaintenance(data ? [data] : []);
    await this.syncRentalMaintenanceSnapshot(normalized);
    return normalized;
  }

  async getReportsByMaintenanceIds(maintenanceIds = []) {
    const ids = [...new Set((maintenanceIds || []).filter(Boolean).map(String))];
    if (ids.length === 0) return {};

    const tableAvailable = await this.isTableAvailable();
    const reportsByMaintenance = {};

    this.ensureTableReady();

    const { data, error } = await supabase
      .from(this.table)
      .select('*')
      .in('maintenance_id', ids)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    const hydratedReports = await this.hydrateReportsWithLiveMaintenance(data || []);

    hydratedReports.forEach((normalized) => {
      if (normalized?.maintenance_id && !reportsByMaintenance[normalized.maintenance_id]) {
        reportsByMaintenance[normalized.maintenance_id] = normalized;
      }
    });

    return reportsByMaintenance;
  }

  async createReport(reportData) {
    const basePayload = {
      rental_id: reportData.rental_id,
      vehicle_id: reportData.vehicle_id,
      report_type: reportData.report_type || 'damage',
      severity: reportData.severity || 'minor',
      description: reportData.description || '',
      affected_areas: Array.isArray(reportData.affected_areas) ? reportData.affected_areas : [],
      photos: Array.isArray(reportData.photos) ? reportData.photos : [],
      status: reportData.status || 'reported',
      customer_chargeable: Boolean(reportData.customer_chargeable),
      customer_charge_amount: Number(reportData.customer_charge_amount || 0),
      maintenance_id: reportData.maintenance_id || null,
      maintenance_cost_total: Number(reportData.maintenance_cost_total || 0),
      send_to_maintenance: reportData.send_to_maintenance !== false,
      created_by_user_id: reportData.created_by_user_id || null,
      created_by_name: reportData.created_by_name || 'Staff',
      created_at: reportData.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const tableAvailable = await this.isTableAvailable();
    this.ensureTableReady();

    const { data, error } = await supabase
      .from(this.table)
      .insert(basePayload)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return this.normalizeReport(data);
  }

  async updateReport(reportId, updateData) {
    const payload = {
      ...updateData,
      updated_at: new Date().toISOString(),
    };

    const tableAvailable = await this.isTableAvailable();
    this.ensureTableReady();

    const { data, error } = await supabase
      .from(this.table)
      .update(payload)
      .eq('id', reportId)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return this.normalizeReport(data);
  }

  async syncReportFromMaintenance(report, maintenance, options = {}) {
    if (!report || !maintenance) {
      return this.normalizeReport(report);
    }

    const persist = options?.persist !== false;
    const normalizedReport = this.normalizeReport(report);
    const nextMaintenanceCost = Number(maintenance.cost || 0);
    const nextStatus = maintenance.status === 'completed' ? 'maintenance_completed' : 'maintenance_in_progress';
    const nextCustomerCharge = normalizedReport.customer_chargeable
      ? nextMaintenanceCost
      : Number(normalizedReport.customer_charge_amount || 0);

    const syncedPayload = {
      maintenance_cost_total: nextMaintenanceCost,
      status: nextStatus,
    };

    if (normalizedReport.customer_chargeable) {
      syncedPayload.customer_charge_amount = nextCustomerCharge;
    }

    const hasStatusChange = String(normalizedReport.status || '') !== String(nextStatus || '');
    const hasMaintenanceCostChange = this.hasMeaningfulAmountChange(normalizedReport.maintenance_cost_total, nextMaintenanceCost);
    const hasCustomerChargeChange = normalizedReport.customer_chargeable
      ? this.hasMeaningfulAmountChange(normalizedReport.customer_charge_amount, nextCustomerCharge)
      : false;

    if (!persist || (!hasStatusChange && !hasMaintenanceCostChange && !hasCustomerChargeChange)) {
      return {
        ...normalizedReport,
        ...syncedPayload,
      };
    }

    const updatedReport = await this.updateReport(report.id, syncedPayload);
    await this.syncRentalMaintenanceSnapshot(updatedReport);
    return updatedReport;
  }

  async createMaintenanceFromReport({ report, rental, actorName }) {
    if (!report?.vehicle_id) {
      throw new Error('Vehicle report is missing vehicle_id');
    }

    const descriptionParts = [
      `Rental report: ${report.report_type}`,
      rental?.rental_id ? `Rental ${rental.rental_id}` : null,
      report.description || null,
      report.affected_areas?.length ? `Affected areas: ${report.affected_areas.join(', ')}` : null,
    ].filter(Boolean);

    const result = await MaintenanceService.createMaintenanceRecord({
      vehicle_id: report.vehicle_id,
      maintenance_type: report.report_type === 'mechanical_issue' ? 'Repair' : 'Body Repair',
      description: descriptionParts.join(' | '),
      status: 'scheduled',
      service_date: new Date().toISOString().split('T')[0],
      scheduled_date: new Date().toISOString().split('T')[0],
      technician_name: actorName || 'Rental Return',
      labor_rate_mad: 0,
      parts_cost_mad: 0,
      external_cost_mad: 0,
      tax_mad: 0,
      notes: `Auto-created from rental return inspection for ${rental?.customer_name || 'customer'}`,
      parts_used: [],
      created_by: actorName || 'Rental Return',
    });

    return result?.maintenance || null;
  }

  async hydrateReportWithMaintenance(report, options = {}) {
    if (!report?.maintenance_id) {
      return this.normalizeReport(report);
    }

    try {
      const rentalContext = options?.rental || await this.getRentalPricingContext(report.rental_id);
      const pricingLocked = this.isRentalPricingLocked(rentalContext);
      const normalizationOptions = pricingLocked ? { ignoreLocalChargeConfig: true } : {};
      let reportSource = report;

      if (pricingLocked && report?.id) {
        try {
          const { data, error } = await supabase
            .from(this.table)
            .select('*')
            .eq('id', report.id)
            .maybeSingle();

          if (error) {
            throw error;
          }

          if (data) {
            reportSource = data;
          }
        } catch (rawReportError) {
          console.warn('Unable to reload raw vehicle report for locked rental pricing:', rawReportError);
        }
      }

      const normalizedReport = this.normalizeReport(reportSource, normalizationOptions);
      const maintenance = await MaintenanceService.getMaintenanceById(report.maintenance_id, {
        pricingMode: pricingLocked ? 'snapshot' : 'live'
      });
      if (!maintenance) {
        return normalizedReport;
      }
      const syncedReport = await this.syncReportFromMaintenance(normalizedReport, maintenance, {
        persist: !pricingLocked,
      });
      return {
        ...this.normalizeReport(syncedReport, normalizationOptions),
        maintenance,
        maintenance_cost_total: Number(maintenance?.cost || normalizedReport?.maintenance_cost_total || 0),
      };
    } catch (error) {
      console.error('Failed to load linked maintenance for vehicle report:', error);
      return this.normalizeReport(report);
    }
  }
}

const vehicleReportService = new VehicleReportService();
export default vehicleReportService;
