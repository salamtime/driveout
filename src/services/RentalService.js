import { supabase } from '../lib/supabase';
import {
  applyOrganizationMatch,
  applyOrganizationScope,
  getCurrentOrganizationId,
  requireCurrentOrganizationId,
  shouldScopeSharedTenantData,
} from './OrganizationService';

const RENTAL_SELECT = `
  *,
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
  async applyReadScope(query) {
    const organizationId = await getCurrentOrganizationId();
    if (!shouldScopeSharedTenantData()) {
      return query;
    }

    return applyOrganizationScope(query, organizationId);
  }

  async getActiveRentalsCount() {
    const { count, error } = await this.applyReadScope(
      supabase
      .from('app_4c3a7a6153_rentals')
      .select('*', { count: 'exact', head: true })
      .eq('rental_status', 'active')
    );
    if (error) {
      console.error('❌ Supabase Error', { message: error.message, details: error.details, hint: error.hint, code: error.code });
      throw error;
    }
    return count || 0;
  }

  async getTotalRevenue() {
    const { data, error } = await this.applyReadScope(
      supabase
      .from('app_4c3a7a6153_rentals')
      .select('total_amount')
      .eq('payment_status', 'paid')
    );
    if (error) {
      console.error('❌ Supabase Error', { message: error.message, details: error.details, hint: error.hint, code: error.code });
      throw error;
    }
    return data ? data.reduce((acc, item) => acc + item.total_amount, 0) : 0;
  }

  async getRecentBookings(limit = 5) {
    const { data, error } = await this.applyReadScope(
      supabase
      .from("app_4c3a7a6153_rentals")
      .select("*, vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(*)")
      .order("created_at", { ascending: false })
      .limit(limit)
    );
    if (error) {
      console.error('❌ Error fetching recent bookings', { message: error.message, details: error.details, hint: error.hint, code: error.code });
      throw error;
    }
    return data || [];
  }

  async getRevenueTrend(days = 7) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    const { data, error } = await this.applyReadScope(
      supabase
      .from('app_4c3a7a6153_rentals')
      .select('created_at, total_amount')
      .eq('payment_status', 'paid')
      .gte('created_at', date.toISOString())
    );
    if (error) {
      console.error('❌ Supabase Error', { message: error.message, details: error.details, hint: error.hint, code: error.code });
      throw error;
    }
    return data || [];
  }

  async getAllRentals() {
    const { data, error } = await this.applyReadScope(
      supabase
      .from('app_4c3a7a6153_rentals')
      .select('vehicle_id')
    );
    if (error) {
      console.error('❌ Supabase Error', { message: error.message, details: error.details, hint: error.hint, code: error.code });
      throw error;
    }
    return data || [];
  }

  async getAllRentalsDetailed() {
    const { data, error } = await this.applyReadScope(
      supabase
        .from('app_4c3a7a6153_rentals')
        .select(RENTAL_SELECT)
        .order('created_at', { ascending: false })
    );
    if (error) {
      console.error('❌ Error fetching rentals', { message: error.message, details: error.details, hint: error.hint, code: error.code });
      throw error;
    }
    return data || [];
  }

  async getRentalById(id) {
    const { data, error } = await this.applyReadScope(
      supabase
        .from('app_4c3a7a6153_rentals')
        .select(RENTAL_SELECT)
        .eq('id', id)
        .maybeSingle()
    );
    if (error) {
      console.error('❌ Error fetching rental by id', { message: error.message, details: error.details, hint: error.hint, code: error.code });
      throw error;
    }
    return data || null;
  }

  async getLatestRentalByCustomerId(customerId) {
    if (!customerId) return null;
    const { data, error } = await this.applyReadScope(
      supabase
        .from('app_4c3a7a6153_rentals')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    );
    if (error) {
      console.error('❌ Error fetching latest customer rental', { message: error.message, details: error.details, hint: error.hint, code: error.code });
      throw error;
    }
    return data || null;
  }

  async createRentalRecord(rentalData) {
    const organizationId = await requireCurrentOrganizationId();
    const { data, error } = await supabase
      .from('app_4c3a7a6153_rentals')
      .insert([{
        ...applyOrganizationMatch({}, organizationId),
        ...rentalData,
        created_at: rentalData?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }])
      .select(RENTAL_SELECT)
      .single();
    if (error) {
      console.error('❌ Error creating rental', { message: error.message, details: error.details, hint: error.hint, code: error.code });
      throw error;
    }
    return data;
  }

  async updateRentalRecord(id, updates) {
    const organizationId = await requireCurrentOrganizationId();
    const { data, error } = await supabase
      .from('app_4c3a7a6153_rentals')
      .update({
        ...applyOrganizationMatch({}, organizationId),
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select(RENTAL_SELECT)
      .single();
    if (error) {
      console.error('❌ Error updating rental', { message: error.message, details: error.details, hint: error.hint, code: error.code });
      throw error;
    }
    return data;
  }

  async deleteRentalRecord(id) {
    const organizationId = await requireCurrentOrganizationId();
    const { error } = await supabase
      .from('app_4c3a7a6153_rentals')
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
    const { error: rentalError } = await supabase
      .from('app_4c3a7a6153_rentals')
      .update({
        ...applyOrganizationMatch({ rental_status: 'expired' }, organizationId),
        updated_at: new Date().toISOString(),
      })
      .eq('id', rentalId)
      .eq('organization_id', organizationId);

    if (rentalError) {
      console.error('❌ Error expiring rental', { message: rentalError.message, details: rentalError.details, hint: rentalError.hint, code: rentalError.code });
      throw rentalError;
    }

    if (vehicleId) {
      const { error: vehicleError } = await supabase
        .from('saharax_0u4w4d_vehicles')
        .update({
          ...applyOrganizationMatch({ status: 'available' }, organizationId),
          updated_at: new Date().toISOString(),
        })
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
    const organizationId = await requireCurrentOrganizationId();
    let query = applyOrganizationScope(
      supabase
        .from('app_4c3a7a6153_rentals')
        .select('id, rental_start_date, rental_end_date, rental_status')
        .eq('vehicle_id', vehicleId)
        .in('rental_status', ['scheduled', 'confirmed', 'active'])
        .or(`rental_start_date.lte.${endDate},rental_end_date.gte.${startDate}`),
      organizationId
    );

    if (excludeBookingId) {
      query = query.neq('id', excludeBookingId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('❌ Error checking rental conflicts', { message: error.message, details: error.details, hint: error.hint, code: error.code });
      throw error;
    }
    return {
      hasConflicts: Boolean(data?.length),
      conflicts: data || [],
    };
  }

  async getSchedulingConflictsForRange({ startDate, endDate }) {
    const organizationId = await requireCurrentOrganizationId();
    const { data, error } = await applyOrganizationScope(
      supabase
        .from('app_4c3a7a6153_rentals')
        .select('id, vehicle_id, rental_start_date, rental_end_date, rental_status')
        .in('rental_status', ['confirmed', 'scheduled', 'active'])
        .or(`and(rental_start_date.lte.${endDate},rental_end_date.gte.${startDate})`),
      organizationId
    );

    if (error) {
      console.error('❌ Error fetching scheduling conflicts', { message: error.message, details: error.details, hint: error.hint, code: error.code });
      throw error;
    }

    return data || [];
  }
}

const rentalService = new RentalService();
export default rentalService;
