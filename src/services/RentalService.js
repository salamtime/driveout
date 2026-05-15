import { supabase } from '../lib/supabase';
import {
  matchTenantOwnedPayload,
  requireCurrentOrganizationId,
  scopeTenantOwnedQuery,
  verifyTenantOwnedRows,
} from './OrganizationService';

const RENTALS_TABLE = 'app_4c3a7a6153_rentals';
const VEHICLES_TABLE = 'saharax_0u4w4d_vehicles';

const RENTAL_SELECT = `
  *,
  organization_id,
  vehicle:saharax_0u4w4d_vehicles(
    id,
    name,
    model,
    plate_number,
    vehicle_type,
    status,
    power_cc,
    capacity,
    color,
    image_url
  )
`;

class RentalService {
  async applyReadScope(query, tableName, message) {
    return scopeTenantOwnedQuery(query, tableName, { message });
  }

  async verifyScopedRows(rows, tableName, message) {
    return verifyTenantOwnedRows(rows, tableName, { message });
  }

  async getActiveRentalsCount() {
    const query = await this.applyReadScope(
      supabase
      .from(RENTALS_TABLE)
      .select('*', { count: 'exact', head: true })
      .eq('rental_status', 'active'),
      RENTALS_TABLE,
      'Workspace organization context is required to count active rentals.'
    );
    const { count, error } = await query;
    if (error) {
      console.error('❌ Supabase Error', { message: error.message, details: error.details, hint: error.hint, code: error.code });
      throw error;
    }
    return count || 0;
  }

  async getTotalRevenue() {
    const query = await this.applyReadScope(
      supabase
      .from(RENTALS_TABLE)
      .select('organization_id, total_amount')
      .eq('payment_status', 'paid'),
      RENTALS_TABLE,
      'Workspace organization context is required to load rental revenue.'
    );
    const { data, error } = await query;
    if (error) {
      console.error('❌ Supabase Error', { message: error.message, details: error.details, hint: error.hint, code: error.code });
      throw error;
    }
    const scopedData = await this.verifyScopedRows(
      data || [],
      RENTALS_TABLE,
      'Rental revenue returned rows outside the active workspace.'
    );
    return scopedData.length ? scopedData.reduce((acc, item) => acc + item.total_amount, 0) : 0;
  }

  async getRecentBookings(limit = 5) {
    const query = await this.applyReadScope(
      supabase
      .from(RENTALS_TABLE)
      .select("*, vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(*)")
      .order("created_at", { ascending: false })
      .limit(limit),
      RENTALS_TABLE,
      'Workspace organization context is required to load recent bookings.'
    );
    const { data, error } = await query;
    if (error) {
      console.error('❌ Error fetching recent bookings', { message: error.message, details: error.details, hint: error.hint, code: error.code });
      throw error;
    }
    return await this.verifyScopedRows(
      data || [],
      RENTALS_TABLE,
      'Recent bookings returned rows outside the active workspace.'
    );
  }

  async getRevenueTrend(days = 7) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    const query = await this.applyReadScope(
      supabase
      .from(RENTALS_TABLE)
      .select('organization_id, created_at, total_amount')
      .eq('payment_status', 'paid')
      .gte('created_at', date.toISOString()),
      RENTALS_TABLE,
      'Workspace organization context is required to load rental revenue trends.'
    );
    const { data, error } = await query;
    if (error) {
      console.error('❌ Supabase Error', { message: error.message, details: error.details, hint: error.hint, code: error.code });
      throw error;
    }
    return await this.verifyScopedRows(
      data || [],
      RENTALS_TABLE,
      'Rental revenue trends returned rows outside the active workspace.'
    );
  }

  async getAllRentals() {
    const query = await this.applyReadScope(
      supabase
      .from(RENTALS_TABLE)
      .select('organization_id, vehicle_id'),
      RENTALS_TABLE,
      'Workspace organization context is required to load rentals.'
    );
    const { data, error } = await query;
    if (error) {
      console.error('❌ Supabase Error', { message: error.message, details: error.details, hint: error.hint, code: error.code });
      throw error;
    }
    return await this.verifyScopedRows(
      data || [],
      RENTALS_TABLE,
      'Rentals returned rows outside the active workspace.'
    );
  }

  async getAllRentalsDetailed() {
    const query = await this.applyReadScope(
      supabase
        .from(RENTALS_TABLE)
        .select(RENTAL_SELECT)
        .order('created_at', { ascending: false }),
      RENTALS_TABLE,
      'Workspace organization context is required to load rental details.'
    );
    const { data, error } = await query;
    if (error) {
      console.error('❌ Error fetching rentals', { message: error.message, details: error.details, hint: error.hint, code: error.code });
      throw error;
    }
    return await this.verifyScopedRows(
      data || [],
      RENTALS_TABLE,
      'Rental details returned rows outside the active workspace.'
    );
  }

  async getRentalById(id) {
    const query = await this.applyReadScope(
      supabase
        .from(RENTALS_TABLE)
        .select(RENTAL_SELECT)
        .eq('id', id)
        .maybeSingle(),
      RENTALS_TABLE,
      'Workspace organization context is required to load rental details.'
    );
    const { data, error } = await query;
    if (error) {
      console.error('❌ Error fetching rental by id', { message: error.message, details: error.details, hint: error.hint, code: error.code });
      throw error;
    }
    const scoped = await this.verifyScopedRows(
      data || null,
      RENTALS_TABLE,
      'Rental details returned data outside the active workspace.'
    );
    return scoped || null;
  }

  async getLatestRentalByCustomerId(customerId) {
    if (!customerId) return null;
    const query = await this.applyReadScope(
      supabase
        .from(RENTALS_TABLE)
        .select('*, organization_id')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      RENTALS_TABLE,
      'Workspace organization context is required to load customer rentals.'
    );
    const { data, error } = await query;
    if (error) {
      console.error('❌ Error fetching latest customer rental', { message: error.message, details: error.details, hint: error.hint, code: error.code });
      throw error;
    }
    const scoped = await this.verifyScopedRows(
      data || null,
      RENTALS_TABLE,
      'Customer rental lookup returned data outside the active workspace.'
    );
    return scoped || null;
  }

  async createRentalRecord(rentalData) {
    const payload = await matchTenantOwnedPayload({
      ...rentalData,
      created_at: rentalData?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, RENTALS_TABLE, {
      message: 'Workspace organization context is required to create rentals.',
    });
    const { data, error } = await supabase
      .from(RENTALS_TABLE)
      .insert([payload])
      .select(RENTAL_SELECT)
      .single();
    if (error) {
      console.error('❌ Error creating rental', { message: error.message, details: error.details, hint: error.hint, code: error.code });
      throw error;
    }
    return await this.verifyScopedRows(
      data,
      RENTALS_TABLE,
      'Created rental returned data outside the active workspace.'
    );
  }

  async updateRentalRecord(id, updates) {
    const organizationId = await requireCurrentOrganizationId();
    const payload = await matchTenantOwnedPayload({
      ...updates,
      updated_at: new Date().toISOString(),
    }, RENTALS_TABLE, {
      organizationId,
      message: 'Workspace organization context is required to update rentals.',
    });
    const { data, error } = await supabase
      .from(RENTALS_TABLE)
      .update(payload)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select(RENTAL_SELECT)
      .single();
    if (error) {
      console.error('❌ Error updating rental', { message: error.message, details: error.details, hint: error.hint, code: error.code });
      throw error;
    }
    return await this.verifyScopedRows(
      data,
      RENTALS_TABLE,
      'Updated rental returned data outside the active workspace.'
    );
  }

  async deleteRentalRecord(id) {
    const organizationId = await requireCurrentOrganizationId();
    const { error } = await supabase
      .from(RENTALS_TABLE)
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);
    if (error) {
      console.error('❌ Error deleting rental', { message: error.message, details: error.details, hint: error.hint, code: error.code });
      throw error;
    }
    return id;
  }

  async updateRentalStatus(id, status) {
    return this.updateRentalRecord(id, { rental_status: status });
  }

  async updateRentalStartOdometer(id, startOdometer, endingOdometer = 0) {
    const newStart = Number(startOdometer);
    const endOdom = Number(endingOdometer || 0);
    const totalKm = endOdom > 0 ? Math.max(0, endOdom - newStart) : 0;
    return this.updateRentalRecord(id, {
      start_odometer: newStart,
      total_kilometers_driven: totalKm,
      total_distance: totalKm,
    });
  }

  async expireRentalAndReleaseVehicle(rentalId, vehicleId = null) {
    const organizationId = await requireCurrentOrganizationId();
    const rentalPayload = await matchTenantOwnedPayload(
      { rental_status: 'expired', updated_at: new Date().toISOString() },
      RENTALS_TABLE,
      {
        organizationId,
        message: 'Workspace organization context is required to expire rentals.',
      }
    );
    const { error: rentalError } = await supabase
      .from(RENTALS_TABLE)
      .update(rentalPayload)
      .eq('id', rentalId)
      .eq('organization_id', organizationId);

    if (rentalError) {
      console.error('❌ Error expiring rental', { message: rentalError.message, details: rentalError.details, hint: rentalError.hint, code: rentalError.code });
      throw rentalError;
    }

    if (vehicleId) {
      const vehiclePayload = await matchTenantOwnedPayload(
        { status: 'available', updated_at: new Date().toISOString() },
        VEHICLES_TABLE,
        {
          organizationId,
          message: 'Workspace organization context is required to release vehicles.',
        }
      );
      const { error: vehicleError } = await supabase
        .from(VEHICLES_TABLE)
        .update(vehiclePayload)
        .eq('id', vehicleId)
        .eq('organization_id', organizationId);

      if (vehicleError) {
        console.error('❌ Error releasing vehicle after rental expiry', { message: vehicleError.message, details: vehicleError.details, hint: vehicleError.hint, code: vehicleError.code });
        throw vehicleError;
      }
    }

    return true;
  }

  async checkRentalConflicts({ vehicleId, startDate, endDate, excludeBookingId = null }) {
    let query = await this.applyReadScope(
      supabase
        .from(RENTALS_TABLE)
        .select('organization_id, id, rental_start_date, rental_end_date, rental_status')
        .eq('vehicle_id', vehicleId)
        .in('rental_status', ['scheduled', 'confirmed', 'active'])
        .or(`rental_start_date.lte.${endDate},rental_end_date.gte.${startDate}`),
      RENTALS_TABLE,
      'Workspace organization context is required to check rental conflicts.'
    );

    if (excludeBookingId) {
      query = query.neq('id', excludeBookingId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('❌ Error checking rental conflicts', { message: error.message, details: error.details, hint: error.hint, code: error.code });
      throw error;
    }
    const scopedData = await this.verifyScopedRows(
      data || [],
      RENTALS_TABLE,
      'Rental conflicts returned rows outside the active workspace.'
    );
    return {
      hasConflicts: Boolean(scopedData.length),
      conflicts: scopedData,
    };
  }

  async getSchedulingConflictsForRange({ startDate, endDate }) {
    const query = await this.applyReadScope(
      supabase
        .from(RENTALS_TABLE)
        .select('organization_id, id, vehicle_id, rental_start_date, rental_end_date, rental_status')
        .in('rental_status', ['confirmed', 'scheduled', 'active'])
        .or(`and(rental_start_date.lte.${endDate},rental_end_date.gte.${startDate})`),
      RENTALS_TABLE,
      'Workspace organization context is required to load scheduling conflicts.'
    );
    const { data, error } = await query;

    if (error) {
      console.error('❌ Error fetching scheduling conflicts', { message: error.message, details: error.details, hint: error.hint, code: error.code });
      throw error;
    }

    return await this.verifyScopedRows(
      data || [],
      RENTALS_TABLE,
      'Scheduling conflicts returned rows outside the active workspace.'
    );
  }
}

const rentalService = new RentalService();
export default rentalService;
