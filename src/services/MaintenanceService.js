import { supabase } from '../lib/supabase';
import MaintenancePartsService from './MaintenancePartsService';

const VEHICLE_REPORTS_TABLE = 'app_4c3a7a6153_vehicle_reports';

class MaintenanceService {
  constructor() {
    this.table = 'app_687f658e98_maintenance';
    this.partsTable = 'app_687f658e98_maintenance_parts';
    this.vehiclesTable = 'saharax_0u4w4d_vehicles';
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
    const { data, error } = await supabase
      .from(this.table)
      .select('vehicle_id', { count: 'exact' })
      .in('status', ['scheduled', 'in_progress']);

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
      let query = supabase
        .from(this.table)
        .select(`
          *,
          vehicle:${this.vehiclesTable}!app_687f658e98_maintenance_vehicle_id_fkey(*),
          parts:${this.partsTable}(*)
        `)
        .order('service_date', { ascending: false });

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

  async getMaintenanceById(recordId) {
    try {
      const { data, error } = await supabase
        .from(this.table)
        .select(`
          *,
          vehicle:${this.vehiclesTable}!app_687f658e98_maintenance_vehicle_id_fkey(*)
        `)
        .eq('id', recordId)
        .single();

      if (error) throw error;

      const parts = await MaintenancePartsService.getMaintenanceParts(recordId);
      return {
        ...data,
        parts,
        parts_used: parts
      };
    } catch (error) {
      console.error('❌ Error getting maintenance by id:', error);
      throw error;
    }
  }

  async createMaintenanceRecord(recordData) {
    try {
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

      const totalCost = payload.labor_rate_mad + payload.external_cost_mad + payload.tax_mad + partsResult.totalPartsCost;

      const { data: updatedMaintenance, error: updateError } = await supabase
        .from(this.table)
        .update({
          parts_cost_mad: partsResult.totalPartsCost,
          cost: totalCost,
          updated_at: new Date().toISOString()
        })
        .eq('id', maintenance.id)
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
          .eq('id', payload.vehicle_id);
      }

      await supabase
        .from(VEHICLE_REPORTS_TABLE)
        .update({
          maintenance_cost_total: totalCost,
          customer_charge_amount: totalCost,
          status: payload.status === 'completed' ? 'maintenance_completed' : 'maintenance_in_progress',
          updated_at: new Date().toISOString(),
        })
        .eq('maintenance_id', maintenance.id)
        .eq('customer_chargeable', true);

      await supabase
        .from(VEHICLE_REPORTS_TABLE)
        .update({
          maintenance_cost_total: totalCost,
          status: payload.status === 'completed' ? 'maintenance_completed' : 'maintenance_in_progress',
          updated_at: new Date().toISOString(),
        })
        .eq('maintenance_id', maintenance.id)
        .eq('customer_chargeable', false);

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
      const existingRecord = await this.getMaintenanceById(recordId);
      const hasExplicitPartsUpdate = Object.prototype.hasOwnProperty.call(updateData, 'parts_used');
      const normalizedPartsUsed = hasExplicitPartsUpdate
        ? this.normalizePartsUsedInput(updateData.parts_used)
        : (existingRecord.parts_used || []);
      const payload = this.buildMaintenancePayload({
        ...existingRecord,
        ...updateData,
        parts_used: normalizedPartsUsed
      });

      const previousStatus = existingRecord.status;
      const nextStatus = payload.status;
      const shouldRestoreInventory = previousStatus === 'completed';
      const shouldDeductInventory = nextStatus === 'completed';
      const actorName = updateData.created_by || updateData.technician_name || 'Maintenance';

      const partsChanges = hasExplicitPartsUpdate
        ? await MaintenancePartsService.updateMaintenanceParts(
            recordId,
            normalizedPartsUsed,
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
            totalPartsCost: this.calculateInventoryPartsCost(existingRecord.parts_used || [])
          };

      const totalCost = payload.labor_rate_mad + payload.external_cost_mad + payload.tax_mad + partsChanges.totalPartsCost;

      const { data: updatedMaintenance, error } = await supabase
        .from(this.table)
        .update({
          ...payload,
          parts_cost_mad: partsChanges.totalPartsCost,
          cost: totalCost,
          updated_at: new Date().toISOString()
        })
        .eq('id', recordId)
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
            .neq('id', recordId);

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
          .eq('id', payload.vehicle_id);
      }

      await supabase
        .from(VEHICLE_REPORTS_TABLE)
        .update({
          maintenance_cost_total: totalCost,
          customer_charge_amount: totalCost,
          status: nextStatus === 'completed' ? 'maintenance_completed' : 'maintenance_in_progress',
          updated_at: new Date().toISOString(),
        })
        .eq('maintenance_id', recordId)
        .eq('customer_chargeable', true);

      await supabase
        .from(VEHICLE_REPORTS_TABLE)
        .update({
          maintenance_cost_total: totalCost,
          status: nextStatus === 'completed' ? 'maintenance_completed' : 'maintenance_in_progress',
          updated_at: new Date().toISOString(),
        })
        .eq('maintenance_id', recordId)
        .eq('customer_chargeable', false);

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
      const existingRecord = await this.getMaintenanceById(recordId);
      const restoreInventory = existingRecord.status === 'completed';
      const deletePartsResult = await MaintenancePartsService.deleteMaintenanceParts(recordId, {
        restoreInventory,
        actorName: 'Maintenance'
      });

      const { error } = await supabase
        .from(this.table)
        .delete()
        .eq('id', recordId);

      if (error) throw error;

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
