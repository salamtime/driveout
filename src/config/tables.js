// FIXED: Updated table configuration to use correct table names
export const TBL = {
  // Core tables
  VEHICLES: 'saharax_0u4w4d_vehicles',
  VEHICLE_MODELS: 'saharax_0u4w4d_vehicle_models',
  RENTALS: 'saharax_0u4w4d_rentals',
  CUSTOMERS: 'saharax_0u4w4d_customers',
  
  // Pricing tables - FIXED: Updated to use correct table names
  PRICING: 'saharax_0u4w4d_pricing_simple', // FIXED: Changed from pricing_rules to pricing_simple
  DAILY_TIERS: 'saharax_0u4w4d_daily_tiers',
  SEASONAL_PRICING: 'saharax_0u4w4d_seasonal_pricing',
  
  // Additional tables
  MAINTENANCE: 'saharax_0u4w4d_maintenance',
  PAYMENTS: 'saharax_0u4w4d_payments',
  INVOICES: 'saharax_0u4w4d_invoices',
  
  // System tables
  SETTINGS: 'saharax_0u4w4d_settings',
  AUDIT_LOG: 'saharax_0u4w4d_audit_log'
};

// Table relationships and foreign keys
export const RELATIONSHIPS = {
  VEHICLES: {
    vehicle_model_id: TBL.VEHICLE_MODELS,
  },
  RENTALS: {
    vehicle_id: TBL.VEHICLES,
    customer_id: TBL.CUSTOMERS,
  },
  PRICING: { // FIXED: Updated relationships
    vehicle_model_id: TBL.VEHICLE_MODELS,
  },
  DAILY_TIERS: {
    vehicle_model_id: TBL.VEHICLE_MODELS,
  },
  MAINTENANCE: {
    vehicle_id: TBL.VEHICLES,
  },
  PAYMENTS: {
    rental_id: TBL.RENTALS,
  },
  INVOICES: {
    rental_id: TBL.RENTALS,
    customer_id: TBL.CUSTOMERS,
  }
};

// Column definitions for validation
export const COLUMNS = {
  PRICING: { // FIXED: Updated column definitions
    id: 'UUID PRIMARY KEY',
    vehicle_model_id: 'UUID REFERENCES vehicle_models',
    rule_type: 'TEXT NOT NULL DEFAULT base_price',
    duration_type: 'TEXT NOT NULL DEFAULT daily',
    price: 'DECIMAL(10,2) NOT NULL',
    is_active: 'BOOLEAN DEFAULT true',
    created_at: 'TIMESTAMP WITH TIME ZONE DEFAULT NOW()',
    updated_at: 'TIMESTAMP WITH TIME ZONE DEFAULT NOW()'
  },
  DAILY_TIERS: {
    id: 'UUID PRIMARY KEY',
    vehicle_model_id: 'UUID REFERENCES vehicle_models',
    min_days: 'INTEGER NOT NULL',
    max_days: 'INTEGER',
    price_per_day: 'DECIMAL(10,2) NOT NULL',
    active: 'BOOLEAN DEFAULT true',
    created_at: 'TIMESTAMP WITH TIME ZONE DEFAULT NOW()',
    updated_at: 'TIMESTAMP WITH TIME ZONE DEFAULT NOW()'
  }
};

export default TBL;