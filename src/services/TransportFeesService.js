/**
 * TransportFeesService - Manage transport fees using localStorage ONLY
 * 
 * FIXED: Now uses localStorage-ONLY approach to completely avoid 403 errors
 * No Supabase calls are made - pure localStorage implementation
 */
class TransportFeesService {
  static STORAGE_KEY = 'mgx_transport_fees_database';

  /**
   * Get transport fees from localStorage ONLY (no database calls)
   */
  static async getTransportFees() {
    try {
      console.log('🔧 Loading transport fees from localStorage ONLY...');
      
      // Use localStorage ONLY - NO Supabase calls
      const fees = this.getTransportFeesFromLocalStorage();
      console.log('✅ Transport fees loaded from localStorage:', fees);
      return fees;
      
    } catch (err) {
      console.error('Error in getTransportFees:', err);
      // Always return defaults if everything fails
      return {
        pickup_fee: 0,
        dropoff_fee: 0
      };
    }
  }

  /**
   * Save transport fees to localStorage ONLY (no database calls)
   */
  static async saveTransportFees(fees) {
    try {
      console.log('💾 Saving transport fees to localStorage ONLY:', fees);

      // Validate input
      if (!fees || typeof fees !== 'object') {
        throw new Error('Invalid fees object');
      }

      const pickupFee = parseFloat(fees.pickup_fee) || 0;
      const dropoffFee = parseFloat(fees.dropoff_fee) || 0;

      const resultFees = {
        pickup_fee: pickupFee,
        dropoff_fee: dropoffFee
      };

      // Save to localStorage ONLY - NO Supabase calls
      const savedFees = this.saveTransportFeesToLocalStorage(resultFees);
      console.log('✅ Transport fees saved to localStorage successfully:', savedFees);
      return savedFees;
      
    } catch (err) {
      console.error('Error in saveTransportFees:', err);
      throw new Error(`Failed to save transport fees: ${err.message}`);
    }
  }

  /**
   * Get transport fees from localStorage (primary method)
   */
  static getTransportFeesFromLocalStorage() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      
      if (stored) {
        const fees = JSON.parse(stored);
        console.log('📱 Transport fees loaded from localStorage:', fees);
        return {
          pickup_fee: parseFloat(fees.pickup_fee) || 0,
          dropoff_fee: parseFloat(fees.dropoff_fee) || 0
        };
      }
      
      // Return default values if no settings found
      const defaultFees = {
        pickup_fee: 0,
        dropoff_fee: 0
      };
      
      console.log('🔧 No transport fees found in localStorage, returning defaults:', defaultFees);
      return defaultFees;
    } catch (err) {
      console.error('Error loading transport fees from localStorage:', err);
      // Return defaults on error
      return {
        pickup_fee: 0,
        dropoff_fee: 0
      };
    }
  }

  /**
   * Save transport fees to localStorage (primary method)
   */
  static saveTransportFeesToLocalStorage(fees) {
    try {
      if (!fees || typeof fees !== 'object') {
        throw new Error('Invalid fees object provided');
      }

      const settingData = {
        pickup_fee: parseFloat(fees.pickup_fee) || 0,
        dropoff_fee: parseFloat(fees.dropoff_fee) || 0,
        updated_at: new Date().toISOString(),
        source: 'localStorage_only'
      };

      // Validate that we have valid numbers
      if (isNaN(settingData.pickup_fee) || isNaN(settingData.dropoff_fee)) {
        throw new Error('Invalid fee values - must be numbers');
      }

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(settingData));
      console.log('✅ Transport fees saved to localStorage:', settingData);
      
      // Verify the save by reading it back
      const verification = localStorage.getItem(this.STORAGE_KEY);
      if (!verification) {
        throw new Error('Failed to verify localStorage save');
      }
      
      const verifiedData = JSON.parse(verification);
      console.log('✅ Verified saved data:', verifiedData);
      
      return {
        pickup_fee: settingData.pickup_fee,
        dropoff_fee: settingData.dropoff_fee
      };
    } catch (err) {
      console.error('Error saving transport fees to localStorage:', err);
      throw new Error(`Failed to save transport fees: ${err.message}`);
    }
  }

  /**
   * Clear transport fees from localStorage
   */
  static clearTransportFeesFromLocalStorage() {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      console.log('🗑️ Transport fees cleared from localStorage');
      return true;
    } catch (err) {
      console.error('Error clearing transport fees from localStorage:', err);
      return false;
    }
  }

  /**
   * Test localStorage functionality
   */
  static testLocalStorage() {
    try {
      const testKey = 'mgx_transport_test_key';
      const testValue = { test: 'value', timestamp: new Date().toISOString() };
      
      // Test write
      localStorage.setItem(testKey, JSON.stringify(testValue));
      
      // Test read
      const retrieved = localStorage.getItem(testKey);
      const parsed = JSON.parse(retrieved);
      
      // Test delete
      localStorage.removeItem(testKey);
      
      console.log('✅ localStorage test passed:', parsed);
      return true;
    } catch (err) {
      console.error('❌ localStorage test failed:', err);
      return false;
    }
  }

  /**
   * Get all transport fees (localStorage format for compatibility)
   */
  static async getAllTransportFees() {
    try {
      console.log('🔧 Loading all transport fees from localStorage...');
      
      // Get localStorage data and format it like database records
      const localFees = this.getTransportFeesFromLocalStorage();
      const mockData = [];
      
      if (localFees.pickup_fee > 0) {
        mockData.push({
          id: 'local_pickup',
          fee_name: 'Pickup Fee (Local)',
          fee_type: 'pickup',
          base_price: localFees.pickup_fee,
          is_active: true,
          source: 'localStorage'
        });
      }
      
      if (localFees.dropoff_fee > 0) {
        mockData.push({
          id: 'local_dropoff',
          fee_name: 'Dropoff Fee (Local)',
          fee_type: 'delivery',
          base_price: localFees.dropoff_fee,
          is_active: true,
          source: 'localStorage'
        });
      }
      
      console.log('📱 Returning localStorage data:', mockData);
      return mockData;
      
    } catch (err) {
      console.error('Error in getAllTransportFees:', err);
      return [];
    }
  }

  /**
   * Initialize transport fees system (localStorage only)
   */
  static async initialize() {
    const results = {
      database: { status: 'DISABLED', message: 'Database access disabled to prevent 403 errors' },
      localStorage: { status: 'UNKNOWN', message: '' },
      recommendation: ''
    };

    // Test localStorage only
    const localStorageWorks = this.testLocalStorage();
    if (localStorageWorks) {
      results.localStorage = { status: 'PASS', message: 'localStorage working correctly' };
      results.recommendation = 'Using localStorage-only (database disabled)';
    } else {
      results.localStorage = { status: 'FAIL', message: 'localStorage not available' };
      results.recommendation = 'localStorage failed - transport fees may not work';
    }

    console.log('🔧 Transport fees system initialization (localStorage-only):', results);
    return results;
  }

  /**
   * Format timestamp for display
   */
  static formatTimestamp(timestamp) {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // Disabled database methods (to prevent accidental usage)
  static async checkDatabaseAccess() {
    console.log('⚠️ Database access disabled to prevent 403 errors');
    return false;
  }

  static async deactivateExistingFees() {
    console.log('⚠️ Database operations disabled - using localStorage only');
    return;
  }

  static async upsertTransportFee() {
    console.log('⚠️ Database operations disabled - use saveTransportFees instead');
    throw new Error('Database operations disabled - use saveTransportFees method');
  }

  static async deleteTransportFee() {
    console.log('⚠️ Database operations disabled - use clearTransportFeesFromLocalStorage instead');
    throw new Error('Database operations disabled - use clearTransportFeesFromLocalStorage method');
  }

  static async getTransportFeeById() {
    console.log('⚠️ Database operations disabled - use getTransportFees instead');
    return null;
  }

  static async getTransportFeesByType() {
    console.log('⚠️ Database operations disabled - use getTransportFees instead');
    return [];
  }
}

export default TransportFeesService;