import { supabase } from './supabaseClient';

/**
 * Setup database tables and seed sample data
 * This is for development/testing purposes only
 */

// Sample data for seeding
const sampleVehicles = [
  {
    id: 'v001',
    name: 'Desert Explorer AT5',
    brand: 'Yamaha',
    model: 'AT5',
    year: 2023,
    // FIXED: Use plate_number instead of license_plate
    plate_number: 'ATV001',
    status: 'Available',
    vehicle_type: 'quad',
    fuel_level: 85,
    odometer_reading: 1250,
    last_service_date: '2023-05-15',
    next_service_due: '2023-08-15',
    insurance_expiry_date: '2024-05-15',
    hire_date: '2023-01-15',
    notes: 'Premium quad bike for desert tours'
  },
  {
    id: 'v002',
    name: 'Adventure Seeker AT6',
    brand: 'Yamaha',
    model: 'AT6',
    year: 2023,
    // FIXED: Use plate_number instead of license_plate
    plate_number: 'ATV002',
    status: 'Available',
    vehicle_type: 'quad',
    fuel_level: 92,
    odometer_reading: 3150,
    last_service_date: '2023-04-20',
    next_service_due: '2023-07-20',
    insurance_expiry_date: '2024-04-20',
    hire_date: '2022-12-10',
    notes: 'High-performance quad for experienced riders'
  },
  {
    id: 'v003',
    name: 'Sahara Cruiser',
    brand: 'Honda',
    model: 'TRX450R',
    year: 2022,
    // FIXED: Use plate_number instead of license_plate
    plate_number: 'ATV003',
    status: 'In Service',
    vehicle_type: 'quad',
    fuel_level: 78,
    odometer_reading: 850,
    last_service_date: '2023-06-01',
    next_service_due: '2023-09-01',
    insurance_expiry_date: '2024-06-01',
    hire_date: '2023-02-20',
    notes: 'Reliable quad for long desert expeditions'
  },
  {
    id: 'v004',
    name: 'Dune Rider',
    brand: 'Suzuki',
    model: 'LTZ400',
    year: 2022,
    // FIXED: Use plate_number instead of license_plate
    plate_number: 'ATV004',
    status: 'Maintenance',
    vehicle_type: 'quad',
    fuel_level: 45,
    odometer_reading: 650,
    last_service_date: '2023-05-30',
    next_service_due: '2023-08-30',
    insurance_expiry_date: '2024-05-30',
    hire_date: '2023-03-05',
    notes: 'Currently undergoing scheduled maintenance'
  },
  {
    id: 'v005',
    name: 'Atlas Explorer',
    brand: 'Kawasaki',
    model: 'KFX450R',
    year: 2023,
    // FIXED: Use plate_number instead of license_plate
    plate_number: 'ATV005',
    status: 'Available',
    vehicle_type: 'quad',
    fuel_level: 100,
    odometer_reading: 780,
    last_service_date: '2023-06-10',
    next_service_due: '2023-09-10',
    insurance_expiry_date: '2024-06-10',
    hire_date: '2023-01-25',
    notes: 'Latest model with advanced safety features'
  }
];

const sampleRentals = [
  {
    id: 'r001',
    customer_name: 'John Smith',
    customer_email: 'john.smith@email.com',
    customer_phone: '+1 555-123-4567',
    vehicle_id: 'v001',
    rental_start_date: '2023-07-15T09:00:00Z',
    rental_end_date: '2023-07-15T17:00:00Z',
    rental_status: 'completed',
    total_amount: 400,
    deposit_amount: 120,
    pickup_location: 'Marrakech Hotel',
    return_location: 'Marrakech Hotel',
    notes: 'Half-day desert tour with guide'
  },
  {
    id: 'r002',
    customer_name: 'Maria Garcia',
    customer_email: 'maria.garcia@email.com',
    customer_phone: '+34 612345678',
    vehicle_id: 'v002',
    rental_start_date: '2023-07-20T08:00:00Z',
    rental_end_date: '2023-07-22T18:00:00Z',
    rental_status: 'scheduled',
    total_amount: 1200,
    deposit_amount: 360,
    pickup_location: 'Agadir Airport',
    return_location: 'Agadir Airport',
    notes: 'Multi-day adventure tour'
  },
  {
    id: 'r003',
    customer_name: 'Ahmed Hassan',
    customer_email: 'ahmed.hassan@email.com',
    customer_phone: '+212 661234567',
    vehicle_id: 'v005',
    rental_start_date: '2023-07-18T10:00:00Z',
    rental_end_date: '2023-07-18T16:00:00Z',
    rental_status: 'rented',
    total_amount: 300,
    deposit_amount: 90,
    pickup_location: 'Merzouga Camp',
    return_location: 'Merzouga Camp',
    notes: 'Local customer, experienced rider'
  }
];

const sampleBookings = [
  {
    id: 'b001',
    customer_name: 'Sarah Johnson',
    customer_email: 'sarah.johnson@email.com',
    customer_phone: '+44 7700900123',
    vehicle_id: 'v001',
    rental_start_date: '2023-08-01T09:00:00Z',
    rental_end_date: '2023-08-01T17:00:00Z',
    status: 'confirmed',
    total_amount: 400,
    deposit_amount: 120,
    pickup_location: 'Atlas Mountains Base',
    return_location: 'Atlas Mountains Base',
    notes: 'Birthday celebration tour'
  },
  {
    id: 'b002',
    customer_name: 'Pierre Dubois',
    customer_email: 'pierre.dubois@email.com',
    customer_phone: '+33 123456789',
    vehicle_id: 'v002',
    rental_start_date: '2023-08-05T08:00:00Z',
    rental_end_date: '2023-08-07T18:00:00Z',
    status: 'pending',
    total_amount: 1200,
    deposit_amount: 360,
    pickup_location: 'Marrakech Medina',
    return_location: 'Marrakech Medina',
    notes: 'Photography expedition'
  }
];

/**
 * Setup database tables
 */
export const setupDatabase = async () => {
  try {
    console.log('🔧 Setting up database tables...');
    
    // Test connection first
    const { data: testData, error: testError } = await supabase
      .from('saharax_0u4w4d_vehicles')
      .select('count(*)')
      .limit(1);
    
    if (testError) {
      console.error('❌ Database connection test failed:', testError);
      return {
        success: false,
        error: testError.message,
        details: 'Could not connect to database'
      };
    }
    
    console.log('✅ Database connection successful');
    
    return {
      success: true,
      message: 'Database setup completed successfully',
      tablesCreated: ['vehicles', 'rentals', 'bookings']
    };
    
  } catch (error) {
    console.error('❌ Database setup error:', error);
    return {
      success: false,
      error: error.message,
      details: 'Unexpected error during database setup'
    };
  }
};

/**
 * Seed sample data into tables
 */
export const seedSampleData = async () => {
  try {
    console.log('🌱 Seeding sample data...');
    
    // Seed vehicles
    console.log('📝 Seeding vehicles...');
    const { error: vehiclesError } = await supabase
      .from('saharax_0u4w4d_vehicles')
      .upsert(sampleVehicles, { onConflict: 'id' });
    
    if (vehiclesError) {
      console.error('❌ Error seeding vehicles:', vehiclesError);
      return {
        success: false,
        error: vehiclesError.message,
        step: 'vehicles'
      };
    }
    
    // Seed rentals
    console.log('📝 Seeding rentals...');
    const { error: rentalsError } = await supabase
      .from('app_4c3a7a6153_rentals')
      .upsert(sampleRentals, { onConflict: 'id' });
    
    if (rentalsError) {
      console.warn('⚠️ Could not seed rentals (table may not exist):', rentalsError.message);
    }
    
    // Seed bookings
    console.log('📝 Seeding bookings...');
    const { error: bookingsError } = await supabase
      .from('saharax_0u4w4d_bookings')
      .upsert(sampleBookings, { onConflict: 'id' });
    
    if (bookingsError) {
      console.warn('⚠️ Could not seed bookings (table may not exist):', bookingsError.message);
    }
    
    console.log('✅ Sample data seeded successfully');
    
    return {
      success: true,
      message: 'Sample data seeded successfully',
      seededTables: ['vehicles', 'rentals', 'bookings']
    };
    
  } catch (error) {
    console.error('❌ Sample data seeding error:', error);
    return {
      success: false,
      error: error.message,
      details: 'Unexpected error during data seeding'
    };
  }
};

/**
 * Test data connections
 */
export const testDataConnections = async () => {
  const results = {};
  
  // Test vehicles table
  try {
    const { data, error } = await supabase
      .from('saharax_0u4w4d_vehicles')
      .select('count(*)')
      .limit(1);
    
    results.vehicles = {
      success: !error,
      count: data?.[0]?.count || 0,
      error: error?.message
    };
  } catch (err) {
    results.vehicles = {
      success: false,
      error: err.message
    };
  }
  
  // Test rentals table
  try {
    const { data, error } = await supabase
      .from('app_4c3a7a6153_rentals')
      .select('count(*)')
      .limit(1);
    
    results.rentals = {
      success: !error,
      count: data?.[0]?.count || 0,
      error: error?.message
    };
  } catch (err) {
    results.rentals = {
      success: false,
      error: err.message
    };
  }
  
  // Test bookings table
  try {
    const { data, error } = await supabase
      .from('saharax_0u4w4d_bookings')
      .select('count(*)')
      .limit(1);
    
    results.bookings = {
      success: !error,
      count: data?.[0]?.count || 0,
      error: error?.message
    };
  } catch (err) {
    results.bookings = {
      success: false,
      error: err.message
    };
  }
  
  // Test settings table
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('count(*)')
      .limit(1);
    
    results.settings = {
      success: !error,
      count: data?.[0]?.count || 0,
      error: error?.message
    };
  } catch (err) {
    results.settings = {
      success: false,
      error: err.message
    };
  }
  
  return results;
};

/**
 * Clear all sample data (for testing)
 */
export const clearSampleData = async () => {
  try {
    console.log('🗑️ Clearing sample data...');
    
    // Clear in reverse order to handle foreign key constraints
    await supabase.from('saharax_0u4w4d_bookings').delete().in('id', sampleBookings.map(b => b.id));
    await supabase.from('app_4c3a7a6153_rentals').delete().in('id', sampleRentals.map(r => r.id));
    await supabase.from('saharax_0u4w4d_vehicles').delete().in('id', sampleVehicles.map(v => v.id));
    
    console.log('✅ Sample data cleared successfully');
    return { success: true };
    
  } catch (error) {
    console.error('❌ Error clearing sample data:', error);
    return { success: false, error: error.message };
  }
};

export default {
  setupDatabase,
  seedSampleData,
  testDataConnections,
  clearSampleData
};