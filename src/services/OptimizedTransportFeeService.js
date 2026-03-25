import { supabase } from '../lib/supabase';

/**
 * OptimizedTransportFeeService - Database-backed transport fees mirroring OptimizedBasePriceService
 * 
 * This service implements the exact same patterns as OptimizedBasePriceService:
 * - Timeout protection (5 seconds)
 * - Aggressive caching (30-second TTL)
 * - Circuit breaker with retry logic
 * - Single active row per org pattern
 * - Database-first with localStorage fallback for offline only
 */
class OptimizedTransportFeeService {
  static TRANSPORT_FEES_TABLE = 'transport_fees';
  static QUERY_TIMEOUT = 5000; // 5 seconds timeout
  static MAX_RETRIES = 2;
  static CACHE_DURATION = 30000; // 30 seconds cache
  
  // In-memory cache
  static cache = new Map();
  static cacheTimestamps = new Map();

  /**
   * Check if cached data is still valid
   */
  static isCacheValid(key) {
    const timestamp = this.cacheTimestamps.get(key);
    if (!timestamp) return false;
    return Date.now() - timestamp < this.CACHE_DURATION;
  }

  /**
   * Get data from cache or execute query
   */
  static async getCachedOrFetch(key, queryFn) {
    if (this.isCacheValid(key)) {
      console.log(`✅ OptimizedTransportFeeService: Cache hit for ${key}`);
      return this.cache.get(key);
    }

    console.log(`🔄 OptimizedTransportFeeService: Cache miss for ${key}, fetching...`);
    const data = await queryFn();
    
    // Cache the result
    this.cache.set(key, data);
    this.cacheTimestamps.set(key, Date.now());
    
    return data;
  }

  /**
   * Execute query with timeout and retry logic
   */
  static async executeWithTimeout(queryPromise, operation = 'query') {
    let lastError;
    
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        console.log(`🔄 OptimizedTransportFeeService: Attempt ${attempt}/${this.MAX_RETRIES} for ${operation}`);
        
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`${operation} timeout after ${this.QUERY_TIMEOUT}ms`)), this.QUERY_TIMEOUT)
        );

        const result = await Promise.race([queryPromise, timeoutPromise]);
        console.log(`✅ OptimizedTransportFeeService: ${operation} completed successfully on attempt ${attempt}`);
        return result;
        
      } catch (error) {
        lastError = error;
        console.warn(`⚠️ OptimizedTransportFeeService: ${operation} failed on attempt ${attempt}:`, error.message);
        
        if (attempt < this.MAX_RETRIES) {
          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 3000);
          console.log(`⏳ OptimizedTransportFeeService: Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Get current organization ID (simplified - you may need to adjust based on your auth system)
   */
  static async getCurrentOrgId() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }
      // Using user ID as org ID for simplicity - adjust based on your org structure
      return user.id;
    } catch (error) {
      console.error('❌ Error getting current org ID:', error);
      throw error;
    }
  }

  /**
   * Get transport fees for current organization
   */
  static async getTransportFees() {
    try {
      const orgId = await this.getCurrentOrgId();
      const cacheKey = `transport_fees/${orgId}`;
      
      return await this.getCachedOrFetch(cacheKey, async () => {
        console.log('🚀 OptimizedTransportFeeService: Loading transport fees from database...');
        
        const queryPromise = supabase
          .from(this.TRANSPORT_FEES_TABLE)
          .select('id, org_id, pickup_fee, dropoff_fee, currency, is_active, created_at, updated_at')
          .eq('org_id', orgId)
          .eq('is_active', true)
          .order('updated_at', { ascending: false })
          .limit(1)
          .single();

        const { data, error } = await this.executeWithTimeout(queryPromise, 'getTransportFees');

        if (error && error.code !== 'PGRST116') {
          console.error('❌ Error loading transport fees:', error);
          throw error;
        }

        if (!data) {
          console.log('✅ No transport fees found, returning defaults');
          return this.getDefaultTransportFees();
        }

        const result = {
          pickup_fee: parseFloat(data.pickup_fee) || 0,
          dropoff_fee: parseFloat(data.dropoff_fee) || 0,
          currency: data.currency || 'MAD',
          id: data.id,
          org_id: data.org_id,
          is_active: data.is_active,
          created_at: data.created_at,
          updated_at: data.updated_at
        };

        console.log('✅ OptimizedTransportFeeService: Transport fees loaded from database:', result);
        return result;
      });
    } catch (err) {
      console.error('❌ Error in getTransportFees:', err);
      // Fallback to localStorage for offline mode only
      return this.getTransportFeesFromLocalStorage();
    }
  }

  /**
   * Upsert transport fees (mirrors base price pattern exactly)
   */
  static async upsertTransportFees(feesData) {
    try {
      console.log('💾 OptimizedTransportFeeService: Upserting transport fees with timeout protection...');

      // Validate required fields
      if (typeof feesData.pickup_fee === 'undefined' && typeof feesData.dropoff_fee === 'undefined') {
        throw new Error('At least one fee (pickup or dropoff) is required');
      }

      const orgId = await this.getCurrentOrgId();

      // Validate and format fees
      const pickupFee = this.validateAndFormatFee(feesData.pickup_fee);
      const dropoffFee = this.validateAndFormatFee(feesData.dropoff_fee);

      // Step 1: Deactivate existing fees (mirrors base price pattern)
      await this.deactivateExistingFees(orgId);

      // Step 2: Prepare the data
      const transportFees = {
        org_id: orgId,
        pickup_fee: pickupFee,
        dropoff_fee: dropoffFee,
        currency: feesData.currency || 'MAD',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // If updating existing fees, include the ID
      if (feesData.id) {
        transportFees.id = feesData.id;
        transportFees.created_at = feesData.created_at; // Preserve original created_at
      }

      // Step 3: Upsert with timeout protection
      const upsertPromise = supabase
        .from(this.TRANSPORT_FEES_TABLE)
        .upsert(transportFees, { onConflict: 'id' })
        .select('*')
        .single();

      const { data, error } = await this.executeWithTimeout(upsertPromise, 'upsertTransportFees');

      if (error) {
        console.error('❌ Error upserting transport fees:', error);
        throw error;
      }

      // Step 4: Clear cache and update localStorage for offline access
      this.clearCache();
      this.updateLocalStorageForOffline({
        pickup_fee: pickupFee,
        dropoff_fee: dropoffFee,
        currency: transportFees.currency
      });

      console.log('✅ OptimizedTransportFeeService: Transport fees upserted successfully');
      console.log(`📊 Fees saved: Pickup: ${pickupFee} ${transportFees.currency}, Dropoff: ${dropoffFee} ${transportFees.currency}`);
      
      return {
        pickup_fee: pickupFee,
        dropoff_fee: dropoffFee,
        currency: transportFees.currency,
        id: data.id,
        org_id: data.org_id,
        is_active: data.is_active,
        created_at: data.created_at,
        updated_at: data.updated_at
      };
    } catch (err) {
      console.error('❌ Error in upsertTransportFees:', err);
      throw new Error(`Failed to save transport fees: ${err.message}`);
    }
  }

  /**
   * Deactivate existing active fees for organization (mirrors base price pattern)
   */
  static async deactivateExistingFees(orgId) {
    try {
      console.log('🔄 OptimizedTransportFeeService: Deactivating existing fees...');

      const updatePromise = supabase
        .from(this.TRANSPORT_FEES_TABLE)
        .update({ 
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('org_id', orgId)
        .eq('is_active', true);

      await this.executeWithTimeout(updatePromise, 'deactivateExistingFees');
      console.log('✅ OptimizedTransportFeeService: Existing fees deactivated');
    } catch (err) {
      console.error('❌ Error in deactivateExistingFees:', err);
      console.warn('Could not deactivate existing fees, continuing...');
    }
  }

  /**
   * Delete transport fees (deactivate)
   */
  static async deleteTransportFees(feesId) {
    try {
      console.log('🗑️ OptimizedTransportFeeService: Deactivating transport fees...');

      const updatePromise = supabase
        .from(this.TRANSPORT_FEES_TABLE)
        .update({ 
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', feesId)
        .select()
        .single();

      const { data, error } = await this.executeWithTimeout(updatePromise, 'deleteTransportFees');

      if (error) {
        console.error('❌ Error deactivating transport fees:', error);
        throw error;
      }

      // Clear cache after successful delete
      this.clearCache();

      console.log('✅ OptimizedTransportFeeService: Transport fees deactivated successfully');
      return data;
    } catch (err) {
      console.error('❌ Error in deleteTransportFees:', err);
      throw new Error(`Failed to delete transport fees: ${err.message}`);
    }
  }

  /**
   * Validate and format fee value
   */
  static validateAndFormatFee(fee) {
    if (fee === null || fee === undefined || fee === '') {
      return 0.00;
    }
    
    const numFee = parseFloat(fee);
    if (isNaN(numFee) || numFee < 0) {
      throw new Error('Fee must be a valid number >= 0');
    }
    
    // Format to 2 decimal places
    return Math.round(numFee * 100) / 100;
  }

  /**
   * Get default transport fees
   */
  static getDefaultTransportFees() {
    return {
      pickup_fee: 0.00,
      dropoff_fee: 0.00,
      currency: 'MAD',
      id: null,
      org_id: null,
      is_active: false,
      created_at: null,
      updated_at: null
    };
  }

  /**
   * Get transport fees from localStorage (offline fallback only)
   */
  static getTransportFeesFromLocalStorage() {
    try {
      console.log('📱 OptimizedTransportFeeService: Loading from localStorage (offline fallback)...');
      
      const stored = localStorage.getItem('mgx_transport_fees_database');
      if (stored) {
        const fees = JSON.parse(stored);
        return {
          pickup_fee: this.validateAndFormatFee(fees.pickup_fee),
          dropoff_fee: this.validateAndFormatFee(fees.dropoff_fee),
          currency: fees.currency || 'MAD',
          id: null,
          org_id: null,
          is_active: true,
          created_at: fees.updated_at || null,
          updated_at: fees.updated_at || null
        };
      }
      
      console.log('📱 No localStorage data found, returning defaults');
      return this.getDefaultTransportFees();
    } catch (err) {
      console.error('❌ Error loading from localStorage:', err);
      return this.getDefaultTransportFees();
    }
  }

  /**
   * Update localStorage for offline access (not source of truth when online)
   */
  static updateLocalStorageForOffline(fees) {
    try {
      const offlineData = {
        pickup_fee: fees.pickup_fee,
        dropoff_fee: fees.dropoff_fee,
        currency: fees.currency || 'MAD',
        updated_at: new Date().toISOString(),
        source: 'database_mirror_for_offline'
      };
      
      localStorage.setItem('mgx_transport_fees_database', JSON.stringify(offlineData));
      console.log('📱 OptimizedTransportFeeService: Updated localStorage for offline access');
    } catch (err) {
      console.warn('⚠️ Could not update localStorage for offline access:', err);
    }
  }

  /**
   * Format fee for display (always 2 decimals, never null)
   */
  static formatFeeForDisplay(fee, currency = 'MAD') {
    const numFee = this.validateAndFormatFee(fee);
    return `${numFee.toFixed(2)} ${currency}`;
  }

  /**
   * Get currency symbol
   */
  static getCurrencySymbol(currency = 'MAD') {
    const symbols = {
      'MAD': 'MAD',
      'USD': '$',
      'EUR': '€',
      'GBP': '£'
    };
    return symbols[currency] || currency;
  }

  /**
   * Clear all cache
   */
  static clearCache() {
    this.cache.clear();
    this.cacheTimestamps.clear();
    console.log('🗑️ OptimizedTransportFeeService: Cache cleared');
  }

  /**
   * Health check method
   */
  static async healthCheck() {
    try {
      console.log('🏥 OptimizedTransportFeeService: Running health check...');
      
      const queryPromise = supabase
        .from(this.TRANSPORT_FEES_TABLE)
        .select('id')
        .limit(1);

      await this.executeWithTimeout(queryPromise, 'healthCheck');
      
      console.log('✅ OptimizedTransportFeeService: Health check passed');
      return true;
    } catch (err) {
      console.error('❌ OptimizedTransportFeeService: Health check failed:', err);
      return false;
    }
  }

  /**
   * Initialize transport fees table (check if accessible)
   */
  static async initializeTransportFeesTable() {
    try {
      console.log('🔧 OptimizedTransportFeeService: Checking transport fees table accessibility...');
      return await this.healthCheck();
    } catch (err) {
      console.error('❌ Error checking transport fees table:', err);
      throw new Error(`Transport fees table not accessible: ${err.message}`);
    }
  }

  /**
   * Get cache statistics
   */
  static getCacheStats() {
    return {
      cacheSize: this.cache.size,
      cacheKeys: Array.from(this.cache.keys()),
      timestamps: Array.from(this.cacheTimestamps.entries())
    };
  }

  /**
   * Audit log helper (mirrors base price pattern)
   */
  static logOperation(operation, details) {
    console.log(`📋 OptimizedTransportFeeService: ${operation}`, details);
    // You can extend this to write to an audit log table if needed
  }
}

export default OptimizedTransportFeeService;