import { supabase } from '../lib/supabase';

class RentalService {
  async getActiveRentalsCount() {
    const { count, error } = await supabase
      .from('app_4c3a7a6153_rentals')
      .select('*', { count: 'exact', head: true })
      .eq('rental_status', 'active');
    if (error) {
      console.error('❌ Supabase Error', { message: error.message, details: error.details, hint: error.hint, code: error.code });
      throw error;
    }
    return count || 0;
  }

  async getTotalRevenue() {
    const { data, error } = await supabase
      .from('app_4c3a7a6153_rentals')
      .select('total_amount')
      .eq('payment_status', 'paid');
    if (error) {
      console.error('❌ Supabase Error', { message: error.message, details: error.details, hint: error.hint, code: error.code });
      throw error;
    }
    return data ? data.reduce((acc, item) => acc + item.total_amount, 0) : 0;
  }

  async getRecentBookings(limit = 5) {
    const { data, error } = await supabase
      .from("app_4c3a7a6153_rentals")
      .select("*, vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(*)")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.error('❌ Error fetching recent bookings', { message: error.message, details: error.details, hint: error.hint, code: error.code });
      throw error;
    }
    return data || [];
  }

  async getRevenueTrend(days = 7) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    const { data, error } = await supabase
      .from('app_4c3a7a6153_rentals')
      .select('created_at, total_amount')
      .eq('payment_status', 'paid')
      .gte('created_at', date.toISOString());
    if (error) {
      console.error('❌ Supabase Error', { message: error.message, details: error.details, hint: error.hint, code: error.code });
      throw error;
    }
    return data || [];
  }

  async getAllRentals() {
    const { data, error } = await supabase
      .from('app_4c3a7a6153_rentals')
      .select('vehicle_id');
    if (error) {
      console.error('❌ Supabase Error', { message: error.message, details: error.details, hint: error.hint, code: error.code });
      throw error;
    }
    return data || [];
  }
}

const rentalService = new RentalService();
export default rentalService;