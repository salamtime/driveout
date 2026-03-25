import { supabase } from '../lib/supabase';

export class BookingService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  async getAvailableVehicles(startDate, endDate, vehicleType = null) {
    try {
      console.log('🚗 Fetching available vehicles for booking...');
      
      // Get all vehicles first
      let vehicleQuery = supabase
        .from('saharax_0u4w4d_vehicles')
        .select('id, name, model, plate_number, vehicle_type, year')
        .eq('status', 'available');

      if (vehicleType) {
        vehicleQuery = vehicleQuery.eq('vehicle_type', vehicleType);
      }

      const { data: vehicles, error: vehicleError } = await vehicleQuery;

      if (vehicleError) {
        console.error('❌ Error fetching vehicles:', vehicleError);
        return [];
      }

      // Get conflicting bookings
      const { data: conflictingBookings, error: bookingError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .select('vehicle_id')
        .or(`and(rental_start_date.lte.${endDate},rental_end_date.gte.${startDate})`)
        .in('status', ['confirmed', 'active']);

      if (bookingError) {
        console.warn('⚠️ Error checking conflicting bookings:', bookingError);
        // Continue with all vehicles if booking check fails
      }

      const conflictingVehicleIds = conflictingBookings?.map(b => b.vehicle_id) || [];
      
      const availableVehicles = vehicles
        .filter(vehicle => !conflictingVehicleIds.includes(vehicle.id))
        .map(vehicle => ({
          id: vehicle.id,
          name: vehicle.name,
          model: vehicle.model,
          vehicle_type: vehicle.vehicle_type,
          plate_number: vehicle.plate_number,
          year: vehicle.year
        }));

      console.log(`✅ Found ${availableVehicles.length} available vehicles`);
      return availableVehicles;

    } catch (error) {
      console.error('❌ Error in getAvailableVehicles:', error);
      return [];
    }
  }

  async createBooking(bookingData) {
    try {
      console.log('📝 Creating new booking...');
      
      // Validate required fields
      const requiredFields = ['customer_name', 'customer_email', 'vehicle_id', 'rental_start_date', 'rental_end_date'];
      for (const field of requiredFields) {
        if (!bookingData[field]) {
          throw new Error(`Missing required field: ${field}`);
        }
      }

      // Check vehicle availability
      const isAvailable = await this.checkVehicleAvailability(
        bookingData.vehicle_id,
        bookingData.rental_start_date,
        bookingData.rental_end_date
      );

      if (!isAvailable) {
        throw new Error('Vehicle is not available for the selected dates');
      }

      // Get vehicle details for pricing
      const { data: vehicle, error: vehicleError } = await supabase
        .from('saharax_0u4w4d_vehicles')
        .select('id, name, model, plate_number, vehicle_type, year')
        .eq('id', bookingData.vehicle_id)
        .single();

      if (vehicleError || !vehicle) {
        throw new Error('Vehicle not found');
      }

      // Calculate total amount if not provided
      if (!bookingData.total_amount) {
        const days = this.calculateDays(bookingData.rental_start_date, bookingData.rental_end_date);
        const dailyRate = bookingData.daily_rate || 150; // Default rate
        bookingData.total_amount = days * dailyRate;
      }

      // Create the booking
      const { data: booking, error: bookingError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .insert([{
          customer_name: bookingData.customer_name,
          customer_email: bookingData.customer_email,
          vehicle_id: bookingData.vehicle_id,
          rental_start_date: bookingData.rental_start_date,
          rental_end_date: bookingData.rental_end_date,
          total_amount: bookingData.total_amount,
          status: bookingData.status || 'confirmed',
          payment_status: bookingData.payment_status || 'pending',
          notes: bookingData.notes || '',
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (bookingError) {
        console.error('❌ Error creating booking:', bookingError);
        throw bookingError;
      }

      console.log('✅ Booking created successfully:', booking.id);
      return booking;

    } catch (error) {
      console.error('❌ Error in createBooking:', error);
      throw error;
    }
  }

  async checkVehicleAvailability(vehicleId, startDate, endDate) {
    try {
      const { data: conflictingBookings, error } = await supabase
        .from('app_4c3a7a6153_rentals')
        .select('id')
        .eq('vehicle_id', vehicleId)
        .or(`and(rental_start_date.lte.${endDate},rental_end_date.gte.${startDate})`)
        .in('status', ['confirmed', 'active']);

      if (error) {
        console.error('❌ Error checking availability:', error);
        return false;
      }

      return !conflictingBookings || conflictingBookings.length === 0;
    } catch (error) {
      console.error('❌ Error in checkVehicleAvailability:', error);
      return false;
    }
  }

  calculateDays(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(1, diffDays); // Minimum 1 day
  }

  async getBookingHistory(customerId, limit = 10) {
    try {
      const { data: bookings, error } = await supabase
        .from('app_4c3a7a6153_rentals')
        .select(`
          *,
          saharax_0u4w4d_vehicles!inner(
            id, name, model, vehicle_type, plate_number
          )
        `)
        .eq('customer_email', customerId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('❌ Error fetching booking history:', error);
        return [];
      }

      return bookings || [];
    } catch (error) {
      console.error('❌ Error in getBookingHistory:', error);
      return [];
    }
  }

  async updateBookingStatus(bookingId, status, paymentStatus = null) {
    try {
      const updateData = { status };
      if (paymentStatus) {
        updateData.payment_status = paymentStatus;
      }

      const { data: booking, error } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update(updateData)
        .eq('id', bookingId)
        .select()
        .single();

      if (error) {
        console.error('❌ Error updating booking status:', error);
        throw error;
      }

      console.log('✅ Booking status updated successfully');
      return booking;
    } catch (error) {
      console.error('❌ Error in updateBookingStatus:', error);
      throw error;
    }
  }

  async cancelBooking(bookingId, reason = '') {
    try {
      const { data: booking, error } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update({
          status: 'cancelled',
          notes: reason,
          cancelled_at: new Date().toISOString()
        })
        .eq('id', bookingId)
        .select()
        .single();

      if (error) {
        console.error('❌ Error cancelling booking:', error);
        throw error;
      }

      console.log('✅ Booking cancelled successfully');
      return booking;
    } catch (error) {
      console.error('❌ Error in cancelBooking:', error);
      throw error;
    }
  }

  // Clear cache
  clearCache() {
    this.cache.clear();
  }
}

export const bookingService = new BookingService();
export default bookingService;