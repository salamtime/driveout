import { supabase } from '../utils/supabaseClient';

class VehicleRefillService {
  /**
   * Get all vehicle refills with vehicle information
   */
  static async getAllVehicleRefills() {
    try {
      const { data, error } = await supabase
        .from('vehicle_fuel_refills')
        .select(`
          *,
          vehicle:saharax_0u4w4d_vehicles(
            id,
            name,
            model,
            plate_number,
            vehicle_type
          ),
          created_by_user:auth.users(email)
        `)
        .order('refill_date', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching vehicle refills:', error);
      throw error;
    }
  }

  /**
   * Get vehicle refills for a specific vehicle
   */
  static async getVehicleRefillsByVehicleId(vehicleId) {
    try {
      const { data, error } = await supabase
        .from('vehicle_fuel_refills')
        .select(`
          *,
          vehicle:saharax_0u4w4d_vehicles(
            id,
            name,
            model,
            plate_number
          )
        `)
        .eq('vehicle_id', vehicleId)
        .order('refill_date', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching vehicle refills by vehicle ID:', error);
      throw error;
    }
  }

  /**
   * Add a new vehicle refill
   */
  static async addVehicleRefill(refillData) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const refill = {
        ...refillData,
        created_by: user?.id,
        created_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('vehicle_fuel_refills')
        .insert([refill])
        .select(`
          *,
          vehicle:saharax_0u4w4d_vehicles(
            id,
            name,
            model,
            plate_number
          )
        `)
        .single();

      if (error) throw error;

      // Create corresponding finance expense record
      await this.createFinanceExpenseRecord(data);

      return data;
    } catch (error) {
      console.error('Error adding vehicle refill:', error);
      throw error;
    }
  }

  /**
   * Update a vehicle refill
   */
  static async updateVehicleRefill(refillId, refillData) {
    try {
      const { data, error } = await supabase
        .from('vehicle_fuel_refills')
        .update({
          ...refillData,
          updated_at: new Date().toISOString()
        })
        .eq('id', refillId)
        .select(`
          *,
          vehicle:saharax_0u4w4d_vehicles(
            id,
            name,
            model,
            plate_number
          )
        `)
        .single();

      if (error) throw error;

      // Update corresponding finance expense record
      await this.updateFinanceExpenseRecord(data);

      return data;
    } catch (error) {
      console.error('Error updating vehicle refill:', error);
      throw error;
    }
  }

  /**
   * Delete a vehicle refill
   */
  static async deleteVehicleRefill(refillId) {
    try {
      // First, delete the corresponding finance expense record
      await this.deleteFinanceExpenseRecord(refillId);

      const { error } = await supabase
        .from('vehicle_fuel_refills')
        .delete()
        .eq('id', refillId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error deleting vehicle refill:', error);
      throw error;
    }
  }

  /**
   * Get vehicle refill statistics
   */
  static async getVehicleRefillStats(startDate = null, endDate = null) {
    try {
      let query = supabase
        .from('vehicle_fuel_refills')
        .select('*');

      if (startDate) {
        query = query.gte('refill_date', startDate);
      }
      if (endDate) {
        query = query.lte('refill_date', endDate);
      }

      const { data, error } = await query;
      if (error) throw error;

      const stats = {
        totalRefills: data.length,
        totalLiters: data.reduce((sum, refill) => sum + (refill.liters || 0), 0),
        totalCost: data.reduce((sum, refill) => sum + (refill.total_cost || 0), 0),
        averagePricePerLiter: 0,
        refillsByVehicle: {},
        refillsByMonth: {}
      };

      if (stats.totalLiters > 0) {
        stats.averagePricePerLiter = stats.totalCost / stats.totalLiters;
      }

      // Group by vehicle
      data.forEach(refill => {
        const vehicleId = refill.vehicle_id;
        if (!stats.refillsByVehicle[vehicleId]) {
          stats.refillsByVehicle[vehicleId] = {
            count: 0,
            totalLiters: 0,
            totalCost: 0
          };
        }
        stats.refillsByVehicle[vehicleId].count++;
        stats.refillsByVehicle[vehicleId].totalLiters += refill.liters || 0;
        stats.refillsByVehicle[vehicleId].totalCost += refill.total_cost || 0;
      });

      // Group by month
      data.forEach(refill => {
        const month = new Date(refill.refill_date).toISOString().slice(0, 7); // YYYY-MM
        if (!stats.refillsByMonth[month]) {
          stats.refillsByMonth[month] = {
            count: 0,
            totalLiters: 0,
            totalCost: 0
          };
        }
        stats.refillsByMonth[month].count++;
        stats.refillsByMonth[month].totalLiters += refill.liters || 0;
        stats.refillsByMonth[month].totalCost += refill.total_cost || 0;
      });

      return stats;
    } catch (error) {
      console.error('Error getting vehicle refill stats:', error);
      throw error;
    }
  }

  /**
   * Create finance expense record for vehicle refill
   */
  static async createFinanceExpenseRecord(refillData) {
    try {
      // Check if finance_expenses table exists
      const { data: tables, error: tableError } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public')
        .eq('table_name', 'finance_expenses');

      if (tableError || !tables || tables.length === 0) {
        console.log('Finance expenses table not found, skipping finance integration');
        return;
      }

      const expenseData = {
        category: 'fuel',
        subcategory: 'vehicle_refill',
        description: `Fuel refill for ${refillData.vehicle?.name || 'vehicle'} - ${refillData.liters}L`,
        amount: refillData.total_cost,
        expense_date: refillData.refill_date,
        reference_id: refillData.id,
        reference_type: 'vehicle_fuel_refill',
        vehicle_id: refillData.vehicle_id,
        invoice_url: refillData.invoice_url,
        notes: refillData.notes,
        created_by: refillData.created_by
      };

      const { error } = await supabase
        .from('finance_expenses')
        .insert([expenseData]);

      if (error) {
        console.warn('Failed to create finance expense record:', error);
      }
    } catch (error) {
      console.warn('Error creating finance expense record:', error);
    }
  }

  /**
   * Update finance expense record for vehicle refill
   */
  static async updateFinanceExpenseRecord(refillData) {
    try {
      const { error } = await supabase
        .from('finance_expenses')
        .update({
          description: `Fuel refill for ${refillData.vehicle?.name || 'vehicle'} - ${refillData.liters}L`,
          amount: refillData.total_cost,
          expense_date: refillData.refill_date,
          vehicle_id: refillData.vehicle_id,
          invoice_url: refillData.invoice_url,
          notes: refillData.notes,
          updated_at: new Date().toISOString()
        })
        .eq('reference_id', refillData.id)
        .eq('reference_type', 'vehicle_fuel_refill');

      if (error) {
        console.warn('Failed to update finance expense record:', error);
      }
    } catch (error) {
      console.warn('Error updating finance expense record:', error);
    }
  }

  /**
   * Delete finance expense record for vehicle refill
   */
  static async deleteFinanceExpenseRecord(refillId) {
    try {
      const { error } = await supabase
        .from('finance_expenses')
        .delete()
        .eq('reference_id', refillId)
        .eq('reference_type', 'vehicle_fuel_refill');

      if (error) {
        console.warn('Failed to delete finance expense record:', error);
      }
    } catch (error) {
      console.warn('Error deleting finance expense record:', error);
    }
  }

  /**
   * Format currency for display
   */
  static formatCurrency(amount, currency = 'MAD') {
    return `${parseFloat(amount || 0).toFixed(2)} ${currency}`;
  }

  /**
   * Format date for display
   */
  static formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
}

export default VehicleRefillService;