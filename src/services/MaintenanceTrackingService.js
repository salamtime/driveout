import { supabase } from '../lib/supabase';
import MaintenanceService from './MaintenanceService';
import { shouldHideVehicleFromOperationalViews } from '../utils/vehicleLifecycleVisibility';
import { scopeTenantOwnedQuery, getCurrentOrganizationId } from './OrganizationService';

class MaintenanceTrackingService {
  // Table references
  static MAINTENANCE_RECORDS_TABLE = 'app_687f658e98_maintenance';
  static MAINTENANCE_PARTS_TABLE = 'app_687f658e98_maintenance_parts';
  static VEHICLES_TABLE = 'saharax_0u4w4d_vehicles';
  static PRICING_CATALOG_TABLE = 'app_687f658e98_maintenance_parts';

  // System settings
  static SYSTEM_SETTINGS = {
    include_scheduled_in_monthly_cost: true // Default setting
  };

  // Maintenance types mapping
  static MAINTENANCE_TYPES = [
    'Oil Change',
    'Filter Replacement', 
    'Brake Service',
    'Tire Service',
    'Engine Service',
    'Transmission Service',
    'Electrical Service',
    'Body Work',
    'General Inspection',
    'Other'
  ];

  // Type mapping for display
  static TYPE_MAPPING = {
    'oil_change': 'Oil Change',
    'brake_service': 'Brake Service',
    'filter_replacement': 'Filter Replacement',
    'tire_service': 'Tire Service',
    'engine_service': 'Engine Service',
    'transmission_service': 'Transmission Service',
    'electrical_service': 'Electrical Service',
    'body_work': 'Body Work',
    'general_inspection': 'General Inspection',
    'other': 'Other'
  };

  static getCurrentMonthBoundaries() {
    const now = new Date();
    const casablancaTime = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Casablanca',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(now);

    const [year, month] = casablancaTime.split('-');
    
    const startOfMonth = new Date(`${year}-${month}-01T00:00:00`);
    
    const endOfMonth = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59, 999);
    
    return {
      start: startOfMonth.toISOString(),
      end: endOfMonth.toISOString(),
      monthName: new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-US', { 
        month: 'long', 
        year: 'numeric' 
      })
    };
  }

  static getCurrentCasablancaTime() {
    return new Date().toLocaleString('en-CA', {
      timeZone: 'Africa/Casablanca',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  }

  static safeCostToNumber(cost) {
    if (cost === null || cost === undefined || cost === '') {
      return 0;
    }
    
    const numericCost = parseFloat(cost);
    if (isNaN(numericCost)) {
      console.warn(`Invalid cost value encountered: ${cost}, treating as 0`);
      return 0;
    }
    
    return numericCost;
  }

  static safeDateParse(dateString) {
    if (!dateString) return null;
    
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        console.warn(`Invalid date encountered: ${dateString}`);
        return null;
      }
      return date;
    } catch (error) {
      console.warn(`Error parsing date: ${dateString}`, error);
      return null;
    }
  }

  static async filterScopedMaintenanceRecords(records = []) {
    const safeRecords = Array.isArray(records) ? records.filter(Boolean) : [];
    if (safeRecords.length === 0) {
      return [];
    }

    try {
      const organizationId = String(await getCurrentOrganizationId() || '').trim();
      if (!organizationId) {
        return safeRecords;
      }

      return safeRecords.filter((record) => String(record?.organization_id || '').trim() === organizationId);
    } catch (error) {
      console.warn('Unable to verify maintenance organization scope, keeping fetched records as-is:', error);
      return safeRecords;
    }
  }

  static async createMaintenanceRecord(recordData) {
    try {
      console.log('💾 Creating maintenance record via enhanced service:', recordData);
      const result = await MaintenanceService.createMaintenanceRecord(recordData);
      console.log('✅ Maintenance record created with parts tracking:', result.maintenance);
      return result.maintenance;
    } catch (err) {
      console.error({
        message: err?.message,
        details: err?.details,
        hint: err?.hint,
        code: err?.code
      });
      throw new Error(`Failed to create maintenance record: ${err.message}`);
    }
  }

  static async updateMaintenanceRecord(recordId, updateData) {
    try {
      console.log('💾 Updating maintenance record via enhanced service:', recordId, updateData);
      const result = await MaintenanceService.updateMaintenanceRecord(recordId, updateData);
      console.log('✅ Maintenance record updated with parts tracking:', result.maintenance);
      return result.maintenance;
    } catch (err) {
      console.error({
        message: err?.message,
        details: err?.details,
        hint: err?.hint,
        code: err?.code
      });
      throw new Error(`Failed to update maintenance record: ${err.message}`);
    }
  }

  static async deleteMaintenanceRecord(recordId) {
    try {
      console.log('🗑️ Deleting maintenance record via enhanced service:', recordId);
      const result = await MaintenanceService.deleteMaintenanceRecord(recordId);
      console.log('✅ Maintenance record deleted with inventory restoration');
      return true;
    } catch (err) {
      console.error({
        message: err?.message,
        details: err?.details,
        hint: err?.hint,
        code: err?.code
      });
      throw new Error(`Failed to delete maintenance record: ${err.message}`);
    }
  }

  static async getMaintenanceById(recordId) {
    try {
      const result = await MaintenanceService.getMaintenanceById(recordId);
      return result;
    } catch (err) {
      console.error({
        message: err?.message,
        details: err?.details,
        hint: err?.hint,
        code: err?.code
      });
      throw new Error(`Failed to get maintenance record: ${err.message}`);
    }
  }

  static async getAllMaintenanceRecords(filters = {}) {
    try {
      const result = await MaintenanceService.getAllMaintenanceRecords(filters);
      return result;
    } catch (err) {
      console.error({
        message: err?.message,
        details: err?.details,
        hint: err?.hint,
        code: err?.code
      });
      return [];
    }
  }

  static async getVehiclesInMaintenance() {
    try {
      let maintenanceQuery = supabase
        .from(this.MAINTENANCE_RECORDS_TABLE)
        .select('id, organization_id, vehicle_id, status, maintenance_type, service_date, description, labor_rate_mad, parts_cost_mad, tax_mad, cost, created_at, updated_at')
        .in('status', ['scheduled', 'in_progress']);
      maintenanceQuery = await scopeTenantOwnedQuery(maintenanceQuery, this.MAINTENANCE_RECORDS_TABLE, {
        message: 'Workspace organization context is required to load maintenance records.',
      });

      const { data: maintenanceRecords, error: maintenanceError } = await maintenanceQuery;

      if (maintenanceError) {
        console.error({
            message: maintenanceError?.message,
            details: maintenanceError?.details,
            hint: maintenanceError?.hint,
            code: maintenanceError?.code
        });
        return [];
      }

      const safeMaintenanceRecords = await this.filterScopedMaintenanceRecords(maintenanceRecords || []);
      const vehicleIds = Array.from(
        new Set(
          safeMaintenanceRecords
            .map((record) => record?.vehicle_id)
            .filter(Boolean)
        )
      );

      if (vehicleIds.length === 0) {
        return [];
      }

      let vehiclesQuery = supabase
        .from(this.VEHICLES_TABLE)
        .select('id, name, model, plate_number, vehicle_type, status')
        .in('id', vehicleIds);
      vehiclesQuery = await scopeTenantOwnedQuery(vehiclesQuery, this.VEHICLES_TABLE, {
        message: 'Workspace organization context is required to load maintenance vehicles.',
      });

      const { data: vehiclesData, error: filteredVehiclesError } = await vehiclesQuery;

      if (filteredVehiclesError) {
        console.error({
            message: filteredVehiclesError?.message,
            details: filteredVehiclesError?.details,
            hint: filteredVehiclesError?.hint,
            code: filteredVehiclesError?.code
        });
        return [];
      }

      const safeVehicles = vehiclesData || [];

      const vehiclesInMaintenance = [];
      const vehicleMap = new Map(safeVehicles.map(v => [v.id, v]));
      
      const maintenanceByVehicle = new Map();
      safeMaintenanceRecords.forEach(record => {
        if (!maintenanceByVehicle.has(record.vehicle_id)) {
          maintenanceByVehicle.set(record.vehicle_id, []);
        }
        maintenanceByVehicle.get(record.vehicle_id).push(record);
      });

      maintenanceByVehicle.forEach((records, vehicleId) => {
        const vehicle = vehicleMap.get(vehicleId);
        if (vehicle) {
          const sortedRecords = [...(records || [])].sort((a, b) => {
            const aUpdated = new Date(a?.updated_at || a?.created_at || a?.service_date || 0).getTime();
            const bUpdated = new Date(b?.updated_at || b?.created_at || b?.service_date || 0).getTime();
            if (bUpdated !== aUpdated) return bUpdated - aUpdated;

            const aService = new Date(a?.service_date || 0).getTime();
            const bService = new Date(b?.service_date || 0).getTime();
            return bService - aService;
          });
          vehiclesInMaintenance.push({
            vehicle,
            maintenance_records: sortedRecords
          });
        }
      });

      return vehiclesInMaintenance;
    } catch (err) {
      console.error({
        message: err?.message,
        details: err?.details,
        hint: err?.hint,
        code: err?.code
      });
      return [];
    }
  }

  static async getUpcomingMaintenance() {
    try {
      let maintenanceQuery = supabase
        .from(this.MAINTENANCE_RECORDS_TABLE)
        .select('*')
        .eq('status', 'scheduled')
        .order('service_date', { ascending: true });
      maintenanceQuery = await scopeTenantOwnedQuery(maintenanceQuery, this.MAINTENANCE_RECORDS_TABLE, {
        message: 'Workspace organization context is required to load maintenance records.',
      });

      const { data: maintenanceRecords, error } = await maintenanceQuery;

      if (error) {
        console.error({
            message: error?.message,
            details: error?.details,
            hint: error?.hint,
            code: error?.code
        });
        return [];
      }

      let vehiclesQuery = supabase
        .from(this.VEHICLES_TABLE)
        .select('id, name, plate_number');
      vehiclesQuery = await scopeTenantOwnedQuery(vehiclesQuery, this.VEHICLES_TABLE, {
        message: 'Workspace organization context is required to load maintenance vehicles.',
      });

      const { data: vehicles } = await vehiclesQuery;

      const safeMaintenanceRecords = await this.filterScopedMaintenanceRecords(maintenanceRecords || []);
      const safeVehicles = vehicles || [];
      const vehicleMap = new Map(safeVehicles.map(v => [v.id, v]));

      const now = new Date();
      const casablancaNow = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Casablanca' }));
      const sevenDaysFromNow = new Date(casablancaNow.getTime() + (7 * 24 * 60 * 60 * 1000));

      const processedRecords = safeMaintenanceRecords.map(record => {
        const vehicle = vehicleMap.get(record.vehicle_id) || { name: 'Unknown', plate_number: 'N/A' };
        const serviceDate = this.safeDateParse(record.service_date);
        
        if (!serviceDate) {
          return {
            ...record,
            vehicle,
            isOverdue: false,
            isDueSoon: false,
            priority: 'low',
            scheduled_date: record.service_date,
            maintenance_type: this.TYPE_MAPPING[record.maintenance_type] || record.maintenance_type || 'Unknown Type'
          };
        }

        const isOverdue = serviceDate < casablancaNow;
        const isDueSoon = !isOverdue && serviceDate >= casablancaNow && serviceDate <= sevenDaysFromNow;
        
        return {
          ...record,
          vehicle,
          isOverdue,
          isDueSoon,
          priority: isOverdue ? 'high' : isDueSoon ? 'medium' : 'low',
          scheduled_date: record.service_date,
          maintenance_type: this.TYPE_MAPPING[record.maintenance_type] || record.maintenance_type || 'Unknown Type'
        };
      });

      const sortedRecords = processedRecords.sort((a, b) => {
        if (a.isOverdue && !b.isOverdue) return -1;
        if (!a.isOverdue && b.isOverdue) return 1;
        
        if (a.isOverdue && b.isOverdue) {
          return new Date(a.service_date) - new Date(b.service_date);
        }
        
        if (a.isDueSoon && b.isDueSoon) {
          return new Date(a.service_date) - new Date(b.service_date);
        }
        
        return new Date(a.service_date) - new Date(b.service_date);
      });

      return sortedRecords;
    } catch (err) {
      console.error({
        message: err?.message,
        details: err?.details,
        hint: err?.hint,
        code: err?.code
      });
      return [];
    }
  }

  static async getMaintenanceHistory(options = {}) {
    try {
      let query = supabase
        .from(this.MAINTENANCE_RECORDS_TABLE)
        .select('*')
        .order('service_date', { ascending: false });

      if (options.limit) {
        query = query.limit(options.limit);
      }

      query = await scopeTenantOwnedQuery(query, this.MAINTENANCE_RECORDS_TABLE, {
        message: 'Workspace organization context is required to load maintenance history.',
      });

      const { data: maintenanceRecords, error } = await query;

      if (error) {
        console.error({
            message: error?.message,
            details: error?.details,
            hint: error?.hint,
            code: error?.code
        });
        return [];
      }

      let vehiclesQuery = supabase
        .from(this.VEHICLES_TABLE)
        .select('id, name, plate_number');
      vehiclesQuery = await scopeTenantOwnedQuery(vehiclesQuery, this.VEHICLES_TABLE, {
        message: 'Workspace organization context is required to load maintenance vehicles.',
      });

      const { data: vehicles } = await vehiclesQuery;

      const safeMaintenanceRecords = await this.filterScopedMaintenanceRecords(maintenanceRecords || []);
      const safeVehicles = vehicles || [];
      const vehicleMap = new Map(safeVehicles.map(v => [v.id, v]));

      const historyWithVehicles = safeMaintenanceRecords.map(record => ({
        ...record,
        vehicle: vehicleMap.get(record.vehicle_id) || { name: 'Unknown', plate_number: 'N/A' },
        scheduled_date: record.service_date,
        total_cost_mad: this.safeCostToNumber(record.cost),
        maintenance_type: this.TYPE_MAPPING[record.maintenance_type] || record.maintenance_type || 'Unknown Type'
      }));

      return historyWithVehicles;
    } catch (err) {
      console.error({
        message: err?.message,
        details: err?.details,
        hint: err?.hint,
        code: err?.code
      });
      return [];
    }
  }

  static async getMaintenancePricingCatalog() {
    try {
      console.log('💰 Loading maintenance pricing catalog from:', this.PRICING_CATALOG_TABLE);
      
      let query = supabase
        .from(this.PRICING_CATALOG_TABLE)
        .select('*')
        .order('part_name');
      query = await scopeTenantOwnedQuery(query, this.PRICING_CATALOG_TABLE, {
        message: 'Workspace organization context is required to load maintenance pricing.',
      });

      const { data, error } = await query;

      if (error) {
        console.error({
            message: error?.message,
            details: error?.details,
            hint: error?.hint,
            code: error?.code
        });
        return [];
      }

      const safeCatalog = data || [];
      console.log('✅ Maintenance pricing catalog loaded:', safeCatalog.length, 'items');
      return safeCatalog;
    } catch (err) {
      console.error({
        message: err?.message,
        details: err?.details,
        hint: err?.hint,
        code: err?.code
      });
      return [];
    }
  }

  static async getAllVehicles() {
    try {
      console.log('🚗 Loading vehicles from:', this.VEHICLES_TABLE);
      
      let query = supabase
        .from(this.VEHICLES_TABLE)
        .select('id, name, model, plate_number, vehicle_type, status, current_odometer, next_oil_change_odometer, registration_number, organization_id, sold_date, sale_price_mad, sold_buyer_name, sale_notes, sale_proof_url, sale_proof_name, engine_hours, vehicle_model_id')
        .order('name');
      query = await scopeTenantOwnedQuery(query, this.VEHICLES_TABLE, {
        message: 'Workspace organization context is required to load vehicles.',
      });

      const { data, error } = await query;

      if (error) {
        console.error({
            message: error?.message,
            details: error?.details,
            hint: error?.hint,
            code: error?.code
        });
        return [];
      }

      const visibleVehicles = (data || []).filter(
        (vehicle) => !shouldHideVehicleFromOperationalViews(vehicle)
      );
      console.log('✅ Vehicles loaded:', visibleVehicles.length);
      return visibleVehicles;
    } catch (err) {
      console.error({
        message: err?.message,
        details: err?.details,
        hint: err?.hint,
        code: err?.code
      });
      return [];
    }
  }

  static async getMaintenanceStatistics() {
    try {
      const monthBoundaries = this.getCurrentMonthBoundaries();

      let recordsQuery = supabase
        .from(this.MAINTENANCE_RECORDS_TABLE)
        .select('id, organization_id, vehicle_id, status, service_date, cost, maintenance_type');
      recordsQuery = await scopeTenantOwnedQuery(recordsQuery, this.MAINTENANCE_RECORDS_TABLE, {
        message: 'Workspace organization context is required to load maintenance statistics.',
      });

      const { data: allRecords, error: allRecordsError } = await recordsQuery;

      if (allRecordsError) {
        console.error({
            message: allRecordsError?.message,
            details: allRecordsError?.details,
            hint: allRecordsError?.hint,
            code: allRecordsError?.code
        });
        throw allRecordsError;
      }

      const safeAllRecords = await this.filterScopedMaintenanceRecords(allRecords || []);
      const includeScheduled = this.SYSTEM_SETTINGS.include_scheduled_in_monthly_cost;
      const validStatusesForCost = includeScheduled 
        ? ['scheduled', 'in_progress', 'completed']
        : ['in_progress', 'completed'];

      const monthlyRecords = safeAllRecords.filter(record => {
        const recordDate = this.safeDateParse(record.service_date);
        if (!recordDate) return false;

        const recordDateStr = recordDate.toISOString();
        const inCurrentMonth = recordDateStr >= monthBoundaries.start && recordDateStr <= monthBoundaries.end;
        
        const validStatus = validStatusesForCost.includes(record.status);
        
        const notExcluded = !['canceled', 'deleted'].includes(record.status);
        
        return inCurrentMonth && validStatus && notExcluded;
      });

      const totalCostThisMonth = monthlyRecords.reduce((sum, record) => {
        return sum + this.safeCostToNumber(record.cost);
      }, 0);

      const openRecords = safeAllRecords.filter(record => 
        ['scheduled', 'in_progress'].includes(record.status)
      );
      
      const uniqueVehiclesInMaintenance = new Set(
        openRecords.map(record => record.vehicle_id)
      ).size;

      const casablancaNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Casablanca' }));
      const sevenDaysFromNow = new Date(casablancaNow.getTime() + (7 * 24 * 60 * 60 * 1000));

      const scheduledRecords = safeAllRecords.filter(record => record.status === 'scheduled');
      
      let overdueCount = 0;
      let dueSoonCount = 0;

      scheduledRecords.forEach(record => {
        const serviceDate = this.safeDateParse(record.service_date);
        if (serviceDate) {
          if (serviceDate < casablancaNow) {
            overdueCount++;
          } else if (serviceDate >= casablancaNow && serviceDate <= sevenDaysFromNow) {
            dueSoonCount++;
          }
        }
      });

      const completedRecords = safeAllRecords.filter(record => record.status === 'completed');
      const totalCompletedCost = completedRecords.reduce((sum, record) => {
        return sum + this.safeCostToNumber(record.cost);
      }, 0);
      
      const avgCostPerMaintenance = completedRecords.length > 0 
        ? totalCompletedCost / completedRecords.length 
        : 0;

      const maintenanceByType = {};
      safeAllRecords.forEach(record => {
        const type = this.TYPE_MAPPING[record.maintenance_type] || record.maintenance_type || 'Other';
        maintenanceByType[type] = (maintenanceByType[type] || 0) + 1;
      });

      const statistics = {
        totalRecords: safeAllRecords.length,
        openRecords: openRecords.length,
        completedThisMonth: monthlyRecords.filter(r => r.status === 'completed').length,
        totalCostThisMonth: totalCostThisMonth,
        avgCostPerMaintenance: avgCostPerMaintenance,
        maintenanceByType: maintenanceByType,
        vehiclesInMaintenance: uniqueVehiclesInMaintenance,
        overdueCount: overdueCount,
        dueSoonCount: dueSoonCount,
        monthName: monthBoundaries.monthName,
        includeScheduledInCost: includeScheduled
      };

      return statistics;
    } catch (err) {
      console.error({
        message: err?.message,
        details: err?.details,
        hint: err?.hint,
        code: err?.code
      });
      return {
        totalRecords: 0,
        openRecords: 0,
        completedThisMonth: 0,
        totalCostThisMonth: 0,
        avgCostPerMaintenance: 0,
        maintenanceByType: {},
        vehiclesInMaintenance: 0,
        overdueCount: 0,
        dueSoonCount: 0,
        monthName: 'Unknown',
        includeScheduledInCost: true
      };
    }
  }

  static formatCurrency(amount) {
    const safeAmount = this.safeCostToNumber(amount);
    return `MAD ${safeAmount.toFixed(2)}`;
  }

  static formatDate(dateString) {
    if (!dateString) return 'N/A';
    
    const date = this.safeDateParse(dateString);
    if (!date) return 'N/A';
    
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'Africa/Casablanca'
    });
  }

  static getStatusColor(status) {
    switch (status) {
      case 'scheduled': return 'bg-yellow-100 text-yellow-800';
      case 'in_progress': return 'bg-blue-100 text-blue-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'canceled': return 'bg-red-100 text-red-800';
      case 'deleted': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  static getPriorityColor(priority) {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  }

  static updateSystemSetting(key, value) {
    if (key === 'include_scheduled_in_monthly_cost') {
      this.SYSTEM_SETTINGS.include_scheduled_in_monthly_cost = Boolean(value);
      console.log('⚙️ System setting updated:', key, '=', value);
    }
  }

  static getSystemSetting(key) {
    return this.SYSTEM_SETTINGS[key];
  }
}

export default MaintenanceTrackingService;
