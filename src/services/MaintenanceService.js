import { supabase } from '../lib/supabase';
import MaintenancePartsService from './MaintenancePartsService';
import {
  applyOrganizationMatch,
  applyOrganizationScope,
  requireCurrentOrganizationId,
} from './OrganizationService';

const VEHICLE_REPORTS_TABLE = 'app_4c3a7a6153_vehicle_reports';
const isMissingOrganizationColumnError = (error) => {
  const code = String(error?.code || '').trim().toUpperCase();
  const message = String(error?.message || error?.details || '').toLowerCase();
  return (
    code === '42703' ||
    message.includes('organization_id does not exist') ||
    message.includes("column 'organization_id'") ||
    message.includes('column app_4c3a7a6153_vehicle_reports.organization_id')
  );
};

class MaintenanceService {
  constructor() {
    this.table = 'app_687f658e98_maintenance';
    this.partsTable = 'app_687f658e98_maintenance_parts';
    this.vehiclesTable = 'saharax_0u4w4d_vehicles';
  }

  isAuthOrContextUnavailableError(error) {
    const message = String(error?.message || error?.details || '').trim().toLowerCase();
    const code = String(error?.code || '').trim().toUpperCase();
    return (
      error?.status === 401 ||
      code === '401' ||
      message.includes('invalid or expired session') ||
      message.includes('no active session') ||
      message.includes('workspace organization context is unavailable')
    );
  }

  async updateVehicleReportRows({ maintenanceId, customerChargeable, updates, organizationId }) {
    let attempt = await applyOrganizationScope(
      supabase
        .from(VEHICLE_REPORTS_TABLE)
        .update(updates)
        .eq('maintenance_id', maintenanceId)
        .eq('customer_chargeable', customerChargeable),
      organizationId
    );

    if (!attempt.error || !isMissingOrganizationColumnError(attempt.error)) {
      return attempt;
    }

    return supabase
      .from(VEHICLE_REPORTS_TABLE)
      .update(updates)
      .eq('maintenance_id', maintenanceId)
      .eq('customer_chargeable', customerChargeable);
  }

  calculateInventoryPartsCost(partsUsed = []) {
    return (Array.isArray(partsUsed) ? partsUsed : []).reduce((sum, part) => {
      const quantity = parseFloat(part.quantity || 0) || 0;
      const explicitLineTotal =
        parseFloat(part.total_sell_mad || part.line_sell_total_mad || 0) || 0;
      if (explicitLineTotal > 0) {
        return sum + explicitLineTotal;
      }

      const unitPrice =
        parseFloat(part.unit_price_mad || part.unit_sell_mad || part.unit_cost_mad || 0) || 0;
      return sum + (quantity * unitPrice);
    }, 0);
  }

  normalizePartsUsedInput(partsUsed) {
    if (Array.isArray(partsUsed)) return partsUsed;

    if (typeof partsUsed === 'string') {
      try {
        const parsed = JSON.parse(partsUsed);
        return Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        console.warn('Unable to parse maintenance parts JSON payload:', error);
        return [];
      }
    }

    return [];
  }

  normalizePartForComparison(part = {}) {
    const normalizeString = (value) => String(value || '').trim();
    const normalizeNumber = (value) => {
      const parsed = parseFloat(value || 0) || 0;
      return Number(parsed.toFixed(4));
    };
    const sourceType = part.source_type || (part.item_id ? 'inventory' : 'manual');

    if (sourceType === 'manual') {
      return {
        source_type: 'manual',
        part_name: normalizeString(part.part_name || part.item_name),
        part_number: normalizeString(part.part_number),
        quantity: normalizeNumber(part.quantity),
        unit_cost_mad: normalizeNumber(part.unit_cost_mad),
        unit_price_mad: normalizeNumber(part.unit_price_mad || part.unit_sell_mad || part.sell_price_mad),
        notes: normalizeString(part.notes)
      };
    }

    return {
      source_type: 'inventory',
      item_id: normalizeString(part.item_id),
      quantity: normalizeNumber(part.quantity),
      notes: normalizeString(part.notes)
    };
  }

  normalizePartsForComparison(partsUsed = []) {
    return this.normalizePartsUsedInput(partsUsed)
      .map((part) => this.normalizePartForComparison(part))
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }

  havePartsChanged(nextPartsUsed = [], existingPartsUsed = []) {
    return JSON.stringify(this.normalizePartsForComparison(nextPartsUsed)) !== JSON.stringify(this.normalizePartsForComparison(existingPartsUsed));
  }

  buildMaintenancePayload(recordData) {
    const partsUsed = this.normalizePartsUsedInput(recordData.parts_used);
    const inventoryPartsCost = this.calculateInventoryPartsCost(partsUsed);
    const additionalPartsCost = parseFloat(recordData.parts_cost_mad || 0) || 0;
    const laborCost = parseFloat(recordData.labor_rate_mad || recordData.labor_cost_mad || 0) || 0;
    const externalCost = parseFloat(recordData.external_cost_mad || 0) || 0;
    const taxCost = parseFloat(recordData.tax_mad || 0) || 0;
    const totalPartsCost = inventoryPartsCost + additionalPartsCost;
    const totalCost = laborCost + externalCost + taxCost + totalPartsCost;

    return {
      vehicle_id: parseInt(recordData.vehicle_id, 10),
      maintenance_type: recordData.maintenance_type || 'Other',
      description: recordData.description || recordData.notes || '',
      service_date: recordData.service_date || recordData.scheduled_date || new Date().toISOString().split('T')[0],
      scheduled_date: recordData.scheduled_date || recordData.service_date || new Date().toISOString().split('T')[0],
      completed_date: recordData.status === 'completed'
        ? (recordData.completed_date || recordData.service_date || recordData.scheduled_date || new Date().toISOString())
        : null,
      next_service_date: recordData.next_service_date || null,
      status: recordData.status || 'scheduled',
      odometer_reading: recordData.odometer_reading ? parseInt(recordData.odometer_reading, 10) : null,
      labor_rate_mad: laborCost,
      parts_cost_mad: totalPartsCost,
      external_cost_mad: externalCost,
      tax_mad: taxCost,
      technician_name: recordData.technician_name || '',
      cost: totalCost,
      updated_at: new Date().toISOString()
    };
  }

  async getOpenMaintenanceCount() {
    const organizationId = await requireCurrentOrganizationId();
    const { data, error } = await applyOrganizationScope(
      supabase
        .from(this.table)
        .select('vehicle_id', { count: 'exact' })
        .in('status', ['scheduled', 'in_progress']),
      organizationId
    );

    if (error) {
      console.error('❌ Supabase Error', {
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code
      });
      throw error;
    }

    const uniqueVehicleIds = new Set((data || []).map((item) => item.vehicle_id));
    return uniqueVehicleIds.size;
  }

  async getAllMaintenanceRecords(filters = {}) {
    try {
      const organizationId = await requireCurrentOrganizationId();
      let query = applyOrganizationScope(
        supabase
          .from(this.table)
          .select(`
            *,
            vehicle:${this.vehiclesTable}!app_687f658e98_maintenance_vehicle_id_fkey(*),
            parts:${this.partsTable}(*)
          `)
          .order('service_date', { ascending: false }),
        organizationId
      );

      if (filters.vehicle_id) query = query.eq('vehicle_id', filters.vehicle_id);
      if (filters.status) query = query.eq('status', filters.status);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('❌ Supabase Error', {
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code
      });
      return [];
    }
  }

  async getMaintenanceById(recordId, options = {}) {
    try {
      const pricingMode = options?.pricingMode === 'live' ? 'live' : 'snapshot';
      const normalizedRecordId = String(recordId ?? '').trim();
      if (!normalizedRecordId || normalizedRecordId === 'undefined' || normalizedRecordId === 'null') {
        return null;
      }

      const organizationId = await requireCurrentOrganizationId();
      const { data, error } = await applyOrganizationScope(
        supabase
          .from(this.table)
          .select(`
            *,
            vehicle:${this.vehiclesTable}!app_687f658e98_maintenance_vehicle_id_fkey(*)
          `)
          .eq('id', normalizedRecordId)
          .maybeSingle(),
        organizationId
      );

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw error;
      }

      if (!data?.id) {
        return null;
      }

      const parts = await MaintenancePartsService.getMaintenanceParts(normalizedRecordId, { pricingMode });
      const partsCostMad = this.calculateInventoryPartsCost(parts);
      const laborCost = parseFloat(data.labor_rate_mad || data.labor_cost_mad || 0) || 0;
      const externalCost = parseFloat(data.external_cost_mad || 0) || 0;
      const taxCost = parseFloat(data.tax_mad || 0) || 0;
      const totalCost = laborCost + externalCost + taxCost + partsCostMad;

      return {
        ...data,
        parts_cost_mad: partsCostMad,
        cost: totalCost,
        parts,
        parts_used: parts
      };
    } catch (error) {
      if (error?.code === 'PGRST116') {
        return null;
      }
      if (this.isAuthOrContextUnavailableError(error)) {
        return null;
      }
      console.error('❌ Error getting maintenance by id:', error);
      throw error;
    }
  }

  async createMaintenanceRecord(recordData) {
    try {
      const organizationId = await requireCurrentOrganizationId();
      const normalizedPartsUsed = this.normalizePartsUsedInput(recordData.parts_used);
      const payload = this.buildMaintenancePayload({
        ...recordData,
        parts_used: normalizedPartsUsed
      });
      const actorName = recordData.created_by || recordData.technician_name || 'Maintenance';
      const shouldDeductInventory = payload.status === 'completed';

      const { data: maintenance, error } = await supabase
        .from(this.table)
        .insert({
          ...applyOrganizationMatch({}, organizationId),
          ...payload,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      const partsResult = await MaintenancePartsService.createMaintenanceParts(
        maintenance.id,
        normalizedPartsUsed,
        { deductInventory: shouldDeductInventory, actorName }
      );

      const totalCost = payload.cost;

      const { data: updatedMaintenance, error: updateError } = await supabase
        .from(this.table)
        .update({
          ...applyOrganizationMatch({}, organizationId),
          parts_cost_mad: payload.parts_cost_mad,
          cost: totalCost,
          updated_at: new Date().toISOString()
        })
        .eq('id', maintenance.id)
        .eq('organization_id', organizationId)
        .select()
        .single();

      if (updateError) throw updateError;

      if (payload.vehicle_id) {
        const nextVehicleStatus = payload.status === 'completed' ? 'available' : 'maintenance';
        await supabase
          .from(this.vehiclesTable)
          .update({
            status: nextVehicleStatus,
            updated_at: new Date().toISOString()
          })
          .eq('id', payload.vehicle_id)
          .eq('organization_id', organizationId);

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('driveout:vehicle-status-updated', {
            detail: {
              id: payload.vehicle_id,
              status: nextVehicleStatus,
              updated_at: new Date().toISOString(),
            },
          }));
        }
      }

      const customerChargeableReportResult = await this.updateVehicleReportRows({
        maintenanceId: maintenance.id,
        customerChargeable: true,
        updates: {
          maintenance_cost_total: totalCost,
          customer_charge_amount: totalCost,
          status: payload.status === 'completed' ? 'maintenance_completed' : 'maintenance_in_progress',
          updated_at: new Date().toISOString(),
        },
        organizationId,
      });
      if (customerChargeableReportResult.error) throw customerChargeableReportResult.error;

      const internalReportResult = await this.updateVehicleReportRows({
        maintenanceId: maintenance.id,
        customerChargeable: false,
        updates: {
          maintenance_cost_total: totalCost,
          status: payload.status === 'completed' ? 'maintenance_completed' : 'maintenance_in_progress',
          updated_at: new Date().toISOString(),
        },
        organizationId,
      });
      if (internalReportResult.error) throw internalReportResult.error;

      return {
        maintenance: updatedMaintenance,
        parts: partsResult.parts,
        inventoryUpdates: partsResult.inventoryUpdates
      };
    } catch (error) {
      console.error('❌ Error creating maintenance record:', error);
      throw error;
    }
  }

  async updateMaintenanceRecord(recordId, updateData) {
    try {
      const organizationId = await requireCurrentOrganizationId();
      const existingRecord = await this.getMaintenanceById(recordId);
      const hasExplicitPartsUpdate = Object.prototype.hasOwnProperty.call(updateData, 'parts_used');
      const inputPartsUsed = hasExplicitPartsUpdate
        ? this.normalizePartsUsedInput(updateData.parts_used)
        : (existingRecord.parts_used || []);

      const previousStatus = existingRecord.status;
      const shouldRestoreInventory = previousStatus === 'completed';
      const partsActuallyChanged = hasExplicitPartsUpdate
        ? this.havePartsChanged(inputPartsUsed, existingRecord.parts_used || [])
        : false;
      const effectivePartsUsed = partsActuallyChanged
        ? inputPartsUsed
        : (existingRecord.parts_used || []);
      const payload = this.buildMaintenancePayload({
        ...existingRecord,
        ...updateData,
        parts_used: effectivePartsUsed
      });
      const nextStatus = payload.status;
      const shouldDeductInventory = nextStatus === 'completed';
      const inventoryLifecycleChanged = shouldRestoreInventory !== shouldDeductInventory;
      const actorName = updateData.created_by || updateData.technician_name || 'Maintenance';
      const shouldMutateParts = hasExplicitPartsUpdate && (partsActuallyChanged || inventoryLifecycleChanged);

      const partsChanges = shouldMutateParts
        ? await MaintenancePartsService.updateMaintenanceParts(
            recordId,
            effectivePartsUsed,
            existingRecord.parts_used || [],
            {
              restoreInventory: shouldRestoreInventory,
              deductInventory: shouldDeductInventory,
              actorName
            }
          )
        : {
            added: [],
            updated: [],
            removed: [],
            inventoryUpdates: [],
            totalPartsCost: this.calculateInventoryPartsCost(effectivePartsUsed)
          };

      const totalCost = payload.cost;

      const { data: updatedMaintenance, error } = await supabase
        .from(this.table)
        .update({
          ...applyOrganizationMatch({}, organizationId),
          ...payload,
          parts_cost_mad: payload.parts_cost_mad,
          cost: totalCost,
          updated_at: new Date().toISOString()
        })
        .eq('id', recordId)
        .eq('organization_id', organizationId)
        .select()
        .single();

      if (error) throw error;

      if (payload.vehicle_id) {
        let nextVehicleStatus = 'maintenance';

        if (nextStatus === 'completed') {
          const { data: otherOpenRecords, error: openRecordsError } = await supabase
            .from(this.table)
            .select('id')
            .eq('vehicle_id', payload.vehicle_id)
            .in('status', ['scheduled', 'in_progress'])
            .neq('id', recordId)
            .eq('organization_id', organizationId);

          if (openRecordsError) throw openRecordsError;

          nextVehicleStatus = (otherOpenRecords || []).length > 0
            ? 'maintenance'
            : (existingRecord.vehicle?.status === 'out_of_service' ? 'out_of_service' : 'available');
        }

        await supabase
          .from(this.vehiclesTable)
          .update({
            status: nextVehicleStatus,
            updated_at: new Date().toISOString()
          })
          .eq('id', payload.vehicle_id)
          .eq('organization_id', organizationId);

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('driveout:vehicle-status-updated', {
            detail: {
              id: payload.vehicle_id,
              status: nextVehicleStatus,
              updated_at: new Date().toISOString(),
            },
          }));
        }
      }

      const customerChargeableReportResult = await this.updateVehicleReportRows({
        maintenanceId: recordId,
        customerChargeable: true,
        updates: {
          maintenance_cost_total: totalCost,
          customer_charge_amount: totalCost,
          status: nextStatus === 'completed' ? 'maintenance_completed' : 'maintenance_in_progress',
          updated_at: new Date().toISOString(),
        },
        organizationId,
      });
      if (customerChargeableReportResult.error) throw customerChargeableReportResult.error;

      const internalReportResult = await this.updateVehicleReportRows({
        maintenanceId: recordId,
        customerChargeable: false,
        updates: {
          maintenance_cost_total: totalCost,
          status: nextStatus === 'completed' ? 'maintenance_completed' : 'maintenance_in_progress',
          updated_at: new Date().toISOString(),
        },
        organizationId,
      });
      if (internalReportResult.error) throw internalReportResult.error;

      return {
        maintenance: updatedMaintenance,
        partsChanges
      };
    } catch (error) {
      console.error('❌ Error updating maintenance record:', error);
      throw error;
    }
  }

  async completeMaintenance(recordId, partsUsed = [], maintenanceOverrides = {}) {
    return this.updateMaintenanceRecord(recordId, {
      ...maintenanceOverrides,
      status: 'completed',
      completed_date: maintenanceOverrides.completed_date || new Date().toISOString(),
      parts_used: partsUsed
    });
  }

  async deleteMaintenanceRecord(recordId) {
    try {
      const organizationId = await requireCurrentOrganizationId();
      const existingRecord = await this.getMaintenanceById(recordId);
      if (!existingRecord) {
        return {
          success: true,
          restoredInventory: [],
          alreadyDeleted: true,
        };
      }
      const vehicleId = existingRecord?.vehicle_id || null;
      const restoreInventory = existingRecord?.status === 'completed';
      const deletePartsResult = await MaintenancePartsService.deleteMaintenanceParts(recordId, {
        restoreInventory,
        actorName: 'Maintenance'
      });

      const { error } = await supabase
        .from(this.table)
        .delete()
        .eq('id', recordId)
        .eq('organization_id', organizationId);

      if (error) throw error;

      if (vehicleId) {
        const { data: otherOpenRecords, error: openRecordsError } = await supabase
          .from(this.table)
          .select('id')
          .eq('vehicle_id', vehicleId)
          .in('status', ['scheduled', 'in_progress', 'pending'])
          .eq('organization_id', organizationId);

        if (openRecordsError) throw openRecordsError;

        const hasOtherOpenMaintenance = (otherOpenRecords || []).length > 0;
        const fallbackVehicleStatus = existingRecord?.vehicle?.status === 'out_of_service' ? 'out_of_service' : 'available';

        await supabase
          .from(this.vehiclesTable)
          .update({
            status: hasOtherOpenMaintenance ? 'maintenance' : fallbackVehicleStatus,
            updated_at: new Date().toISOString()
          })
          .eq('id', vehicleId)
          .eq('organization_id', organizationId);

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('driveout:vehicle-status-updated', {
            detail: {
              id: vehicleId,
              status: hasOtherOpenMaintenance ? 'maintenance' : fallbackVehicleStatus,
              updated_at: new Date().toISOString(),
            },
          }));
        }
      }

      return {
        success: true,
        restoredInventory: deletePartsResult.restoredItems
      };
    } catch (error) {
      console.error('❌ Error deleting maintenance record:', error);
      throw error;
    }
  }

  async getMaintenanceParts(maintenanceId) {
    return MaintenancePartsService.getMaintenanceParts(maintenanceId);
  }
}

const maintenanceService = new MaintenanceService();
export default maintenanceService;
