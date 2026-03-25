import { supabase } from './supabase';

export const testDatabaseConnection = async () => {
  try {
    console.log('🔍 Testing database connection...');
    
    // Test connection by trying to access the vehicles table
    const { data, error } = await supabase
      .from('saharax_0u4w4d_vehicles')
      .select('count(*)')
      .limit(1);
    
    if (error) {
      console.error('❌ Database connection test failed:', error);
      return {
        success: false,
        error: error.message,
        details: error
      };
    }
    
    console.log('✅ Database connection successful');
    return {
      success: true,
      message: 'Database connection established successfully',
      data
    };
  } catch (err) {
    console.error('❌ Database connection test exception:', err);
    return {
      success: false,
      error: err.message,
      details: err
    };
  }
};

export const testTableAccess = async () => {
  const tables = [
    'saharax_0u4w4d_vehicles',
    'saharax_0u4w4d_bookings', 
    'app_4c3a7a6153_rentals',
    'users',
    'settings',
    'notifications'
  ];
  
  const results = {};
  
  for (const table of tables) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('count(*)')
        .limit(1);
        
      results[table] = {
        accessible: !error,
        error: error?.message,
        count: data?.[0]?.count || 0
      };
    } catch (err) {
      results[table] = {
        accessible: false,
        error: err.message,
        count: 0
      };
    }
  }
  
  return results;
};