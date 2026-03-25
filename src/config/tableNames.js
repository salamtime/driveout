/**
 * Centralized table name constants for Supabase database
 * 
 * This file contains all table names used in the application.
 * Update these constants if table names change in the database.
 */

export const TABLE_NAMES = {
  // Core tables with app prefix
  BASE_PRICES: 'app_4c3a7a6153_base_prices',
  VEHICLE_MODELS: 'saharax_0u4w4d_vehicle_models',
  RENTALS: 'app_4c3a7a6153_rentals',
  USERS: 'app_b30c02e74da644baad4668e3587d86b1_users',
  
  // Rental package related tables
  RENTAL_PACKAGES: 'app_4c3a7a6153_rental_km_packages',
  RATE_TYPES: 'rate_types',
  PACKAGE_VEHICLE_TYPE_MAPPING: 'package_vehicle_type_mapping',
  TOUR_PACKAGES: 'app_687f658e98_tour_packages',
  TOUR_BOOKINGS: 'app_687f658e98_tour_bookings',
  TOUR_PACKAGE_MODEL_PRICES: 'app_687f658e98_tour_package_model_prices',
  
  // Vehicle related tables
  VEHICLES: 'saharax_0u4w4d_vehicles',
  
  // Legacy/deprecated table names (for reference only - do not use)
  // OLD_BASE_PRICES: 'app_8be2ccb1f0_base_prices',
  // OLD_VEHICLE_MODELS: 'app_8be2ccb1f0_vehicle_models',
};

// Helper function to get table name with error handling
export const getTableName = (key) => {
  if (!TABLE_NAMES[key]) {
    console.error(`Table name not found for key: ${key}`);
    throw new Error(`Invalid table name key: ${key}`);
  }
  return TABLE_NAMES[key];
};

export default TABLE_NAMES;
