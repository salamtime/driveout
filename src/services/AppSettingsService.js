import { supabase } from '../lib/supabase';

/**
 * AppSettingsService - Manage application-wide settings
 * NOW WITH ACTUAL DATABASE SUPPORT
 */
class AppSettingsService {
  static SETTINGS_TABLE = 'app_settings';
  static DEFAULT_SETTINGS_ID = 1;
  
  // localStorage key for caching
  static TRANSPORT_FEES_KEY = 'mgx_transport_fees_cache';

  /**
   * Get transport fees - DATABASE FIRST, then cache fallback
   */
  static async getTransportFees() {
    try {
      console.log('📡 [DATABASE] Loading transport fees from app_settings table...');
      
      // 1. FIRST TRY DATABASE
      const { data, error } = await supabase
        .from(this.SETTINGS_TABLE)
        .select('pickup_transport_fee, dropoff_transport_fee')
        .eq('id', this.DEFAULT_SETTINGS_ID)
        .single();

      if (error) {
        console.error('❌ Database query failed:', error.message);
        throw error; // Go to cache fallback
      }

      // Format the response
      const fees = {
        pickup_fee: Number(data.transport_pickup_fee) || 0,
        dropoff_fee: Number(data.transport_dropoff_fee) || 0
      };

      console.log('✅ [DATABASE] Loaded from app_settings table:', fees);
      
      // Update cache with database values
      this.updateCache(fees);
      
      return fees;

    } catch (dbError) {
      console.log('🔄 Database failed, using cache fallback...');
      return this.getFromCache();
    }
  }

  /**
   * Save transport fees - SAVE TO DATABASE FIRST
   */
  static async saveTransportFees(fees) {
    try {
      console.log('💾 [DATABASE] Saving to app_settings table:', fees);

      // Validate
      if (!fees || typeof fees !== 'object') {
        throw new Error('Invalid fees object');
      }

      const pickupFee = Number(fees.pickup_fee) || 0;
      const dropoffFee = Number(fees.dropoff_fee) || 0;

      if (pickupFee < 0 || dropoffFee < 0) {
        throw new Error('Fees cannot be negative');
      }

      // SAVE TO DATABASE
      const { data, error } = await supabase
        .from(this.SETTINGS_TABLE)
        .upsert({
          id: this.DEFAULT_SETTINGS_ID,
          transport_pickup_fee: pickupFee,
          transport_dropoff_fee: dropoffFee,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error('❌ Database save error:', error);
        throw new Error(`Database save failed: ${error.message}`);
      }

      // Format response
      const savedFees = {
        pickup_fee: Number(data.transport_pickup_fee) || 0,
        dropoff_fee: Number(data.transport_dropoff_fee) || 0
      };

      console.log('✅ [DATABASE] Saved to app_settings table:', savedFees);
      
      // Also update cache
      this.updateCache(savedFees);
      
      return savedFees;

    } catch (error) {
      console.error('❌ Error in saveTransportFees:', error);
      
      // Fallback: Save to cache only
      console.log('🔄 Falling back to cache-only save');
      return this.saveToCache(fees);
    }
  }

  /**
   * Update localStorage cache
   */
  static updateCache(fees) {
    try {
      const cacheData = {
        ...fees,
        cached_at: new Date().toISOString(),
        source: 'database'
      };
      
      localStorage.setItem(this.TRANSPORT_FEES_KEY, JSON.stringify(cacheData));
      console.log('✅ Cache updated');
      return true;
    } catch (err) {
      console.error('Cache update failed:', err);
      return false;
    }
  }

  /**
   * Get from cache (fallback)
   */
  static getFromCache() {
    try {
      const stored = localStorage.getItem(this.TRANSPORT_FEES_KEY);
      
      if (stored) {
        const cached = JSON.parse(stored);
        console.log('📱 Loaded from cache:', cached);
        return {
          pickup_fee: Number(cached.pickup_fee) || 0,
          dropoff_fee: Number(cached.dropoff_fee) || 0
        };
      }
      
      console.log('🔧 No cache found, returning defaults');
      return { pickup_fee: 0, dropoff_fee: 0 };
      
    } catch (err) {
      console.error('Cache read error:', err);
      return { pickup_fee: 0, dropoff_fee: 0 };
    }
  }

  /**
   * Save to cache only (fallback)
   */
  static saveToCache(fees) {
    try {
      const cacheData = {
        pickup_fee: Number(fees.pickup_fee) || 0,
        dropoff_fee: Number(fees.dropoff_fee) || 0,
        cached_at: new Date().toISOString(),
        source: 'cache_only'
      };
      
      localStorage.setItem(this.TRANSPORT_FEES_KEY, JSON.stringify(cacheData));
      console.log('✅ Saved to cache (fallback):', cacheData);
      
      return {
        pickup_fee: cacheData.pickup_fee,
        dropoff_fee: cacheData.dropoff_fee
      };
    } catch (err) {
      console.error('Cache save error:', err);
      throw new Error('Failed to save fees');
    }
  }

  /**
   * Test database connection
   */
  static async testConnection() {
    try {
      console.log('🧪 Testing database connection to app_settings...');
      
      const { data, error } = await supabase
        .from(this.SETTINGS_TABLE)
        .select('id, transport_pickup_fee, transport_dropoff_fee')
        .eq('id', this.DEFAULT_SETTINGS_ID)
        .maybeSingle(); // Use maybeSingle to avoid throwing if no rows

      if (error) {
        return {
          success: false,
          message: `Database error: ${error.message}`,
          error: error
        };
      }

      return {
        success: true,
        message: '✅ Database connection successful',
        data: data || { message: 'No data found, table may be empty' }
      };
    } catch (error) {
      return {
        success: false,
        message: `Connection test failed: ${error.message}`
      };
    }
  }

  /**
   * Reset to defaults
   */
  static async resetToDefaults() {
    try {
      console.log('🔄 Resetting transport fees to defaults...');
      
      const { error } = await supabase
        .from(this.SETTINGS_TABLE)
        .update({
          transport_pickup_fee: 0,
          transport_dropoff_fee: 0,
          updated_at: new Date().toISOString()
        })
        .eq('id', this.DEFAULT_SETTINGS_ID);

      if (error) throw error;
      
      // Clear cache
      localStorage.removeItem(this.TRANSPORT_FEES_KEY);
      
      console.log('✅ Reset to defaults complete');
      return { success: true, message: 'Reset to defaults successful' };
    } catch (error) {
      console.error('Reset failed:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Quick test function
   */
  static async quickTest() {
    console.log('=== QUICK DATABASE TEST ===');
    
    // Test 1: Connection
    const connection = await this.testConnection();
    console.log('Connection test:', connection);
    
    if (!connection.success) {
      return { success: false, message: 'Database connection failed' };
    }
    
    // Test 2: Save some test data
    const testFees = {
      pickup_fee: 99,
      dropoff_fee: 149
    };
    
    console.log('Test 2: Saving test fees:', testFees);
    
    try {
      const saved = await this.saveTransportFees(testFees);
      console.log('Save result:', saved);
      
      // Test 3: Load it back
      const loaded = await this.getTransportFees();
      console.log('Load result:', loaded);
      
      const match = saved.pickup_fee === loaded.pickup_fee && 
                   saved.dropoff_fee === loaded.dropoff_fee;
      
      return {
        success: match,
        message: match ? '✅ All tests passed!' : '❌ Tests failed - data mismatch',
        saved: saved,
        loaded: loaded,
        match: match
      };
    } catch (error) {
      return {
        success: false,
        message: `Test failed: ${error.message}`,
        error: error
      };
    }
  }

  /**
   * Get deposit settings - DATABASE FIRST, then defaults
   */
  static async getDepositSettings() {
    try {
      console.log('📡 [DATABASE] Loading deposit settings from app_settings table...');
      
      const { data, error } = await supabase
        .from(this.SETTINGS_TABLE)
        .select('deposit_low_risk_multiplier, deposit_medium_risk_multiplier, deposit_high_risk_multiplier')
        .eq('id', this.DEFAULT_SETTINGS_ID)
        .single();

      if (error) {
        console.warn('⚠️ Database query failed, using defaults:', error.message);
        return this.getDefaultDepositSettings();
      }

      const settings = {
        low_risk: Number(data.deposit_low_risk_multiplier) || 1,
        medium_risk: Number(data.deposit_medium_risk_multiplier) || 2,
        high_risk: Number(data.deposit_high_risk_multiplier) || 3
      };

      console.log('✅ [DATABASE] Loaded deposit settings:', settings);
      return settings;

    } catch (dbError) {
      console.log('🔄 Database failed, using default deposit settings...');
      return this.getDefaultDepositSettings();
    }
  }

  /**
   * Get default deposit settings
   */
  static getDefaultDepositSettings() {
    return {
      low_risk: 1,    // 1x rental price
      medium_risk: 2, // 2x rental price
      high_risk: 3    // 3x rental price
    };
  }

  /**
   * Calculate damage deposit based on rental price and risk level
   */
  static async calculateDamageDeposit(rentalPrice, riskLevel = 'medium') {
    try {
      const settings = await this.getDepositSettings();
      const multiplier = settings[`${riskLevel}_risk`] || settings.medium_risk;
      const deposit = Math.round(rentalPrice * multiplier);
      
      console.log(`💰 Calculated deposit: ${deposit} MAD (${rentalPrice} × ${multiplier})`);
      return deposit;
    } catch (error) {
      console.error('❌ Error calculating deposit:', error);
      // Fallback: 2x rental price
      return Math.round(rentalPrice * 2);
    }
  }

  /**
   * Save deposit settings
   */
  static async saveDepositSettings(settings) {
    try {
      console.log('💾 [DATABASE] Saving deposit settings:', settings);

      const { data, error } = await supabase
        .from(this.SETTINGS_TABLE)
        .upsert({
          id: this.DEFAULT_SETTINGS_ID,
          deposit_low_risk_multiplier: Number(settings.low_risk) || 1,
          deposit_medium_risk_multiplier: Number(settings.medium_risk) || 2,
          deposit_high_risk_multiplier: Number(settings.high_risk) || 3,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      console.log('✅ [DATABASE] Deposit settings saved');
      return {
        low_risk: Number(data.deposit_low_risk_multiplier),
        medium_risk: Number(data.deposit_medium_risk_multiplier),
        high_risk: Number(data.deposit_high_risk_multiplier)
      };

    } catch (error) {
      console.error('❌ Error saving deposit settings:', error);
      throw error;
    }
  }
}

export default AppSettingsService;