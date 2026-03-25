/**
 * FuelService - Enhanced with database integration for fuel refills and withdrawals
 * 
 * UPDATED: Now saves fuel refills to fuel_refills table and withdrawals to fuel_withdrawals table
 * while maintaining localStorage for tank management and real-time updates
 */

import { supabase } from '../lib/supabase';

class FuelService {
  constructor() {
    this.subscribers = [];
    this.tankData = null;
    this.refills = [];
    this.withdrawals = [];
    this.storageKey = 'mgx_fuel_data_database';
    this.useDatabase = true; // Enable database integration
  }

  // Subscribe to fuel data changes
  subscribe(callback) {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter(sub => sub !== callback);
    };
  }

  // Notify all subscribers
  notify() {
    this.subscribers.forEach(callback => callback({
      tank: this.tankData,
      refills: this.refills,
      withdrawals: this.withdrawals
    }));
  }

  /**
   * Check database access for fuel tables
   */
  async checkDatabaseSetup() {
    try {
      console.log('🔍 Checking database access for fuel tables...');
      
      // Test access to fuel_refills table
      const { data: refillsTest, error: refillsError } = await supabase
        .from('fuel_refills')
        .select('id')
        .limit(1);
        
      // Test access to fuel_withdrawals table  
      const { data: withdrawalsTest, error: withdrawalsError } = await supabase
        .from('fuel_withdrawals')
        .select('id')
        .limit(1);

      if (refillsError) {
        console.error('❌ fuel_refills table access error:', refillsError);
        return false;
      }
      
      if (withdrawalsError) {
        console.error('❌ fuel_withdrawals table access error:', withdrawalsError);
        return false;
      }

      console.log('✅ Database access confirmed for both fuel tables');
      return true;
    } catch (error) {
      console.error('❌ Database setup check failed:', error);
      return false;
    }
  }

  // Get local storage data
  getLocalData() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const data = JSON.parse(stored);
        console.log('📱 Fuel data loaded from localStorage:', data);
        return data;
      }
      
      // Return default data if no storage found
      const defaultData = {
        tank: { 
          id: 1,
          capacity: 1000, 
          current_volume: 750, 
          low_threshold: 15,
          location: 'Main Tank'
        },
        refills: [],
        withdrawals: []
      };
      
      console.log('🔧 No fuel data found, returning defaults:', defaultData);
      this.saveLocalData(defaultData);
      return defaultData;
    } catch (error) {
      console.error('Error loading local fuel data:', error);
      return {
        tank: { 
          id: 1,
          capacity: 1000, 
          current_volume: 750, 
          low_threshold: 15,
          location: 'Main Tank'
        },
        refills: [],
        withdrawals: []
      };
    }
  }

  // Save local storage data
  saveLocalData(data) {
    try {
      const dataToSave = {
        ...data,
        updated_at: new Date().toISOString(),
        source: 'localStorage_with_database'
      };
      localStorage.setItem(this.storageKey, JSON.stringify(dataToSave));
      console.log('✅ Fuel data saved to localStorage:', dataToSave);
    } catch (error) {
      console.error('Error saving local fuel data:', error);
    }
  }

  /**
   * Get tank status - localStorage for tank management
   */
  async getTankStatus() {
    try {
      console.log('🔄 Loading tank status from localStorage...');
      
      const data = this.getLocalData();
      this.tankData = data.tank;
      console.log('✅ Tank status loaded from localStorage:', data.tank);
      return data.tank;
      
    } catch (error) {
      console.error('Error fetching tank status:', error);
      // Return default tank data
      const defaultTank = {
        id: 1,
        capacity: 1000,
        current_volume: 750,
        low_threshold: 15,
        location: 'Main Tank'
      };
      this.tankData = defaultTank;
      return defaultTank;
    }
  }

  /**
   * Update tank capacity - localStorage for tank management
   */
  async updateTankCapacity(newCapacity) {
    try {
      console.log('💾 Updating tank capacity in localStorage:', newCapacity);
      
      const data = this.getLocalData();
      data.tank.capacity = parseFloat(newCapacity);
      data.tank.updated_at = new Date().toISOString();
      
      this.saveLocalData(data);
      this.tankData = data.tank;
      this.notify();
      
      console.log('✅ Tank capacity updated in localStorage:', data.tank);
      return { success: true, data: data.tank };
      
    } catch (error) {
      console.error('Error updating tank capacity:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Add fuel refill - DATABASE + localStorage integration
   * FIXED: Now uses invoice_image (JSONB) instead of invoice_photo_url
   */
  async addRefill(refillData) {
    try {
      console.log('🚀 Adding fuel refill to DATABASE + localStorage:', refillData);
      
      const refill = {
        liters_added: parseFloat(refillData.liters_added),
        unit_price: parseFloat(refillData.unit_price || 0),
        total_cost: parseFloat(refillData.total_cost || refillData.liters_added * (refillData.unit_price || 0)),
        refill_date: refillData.refill_date,
        refilled_by: refillData.refilled_by,
        invoice_image: refillData.invoice_image || null, // FIXED: Use invoice_image (JSONB format)
        notes: refillData.notes || null
      };

      // Validate tank capacity first
      const data = this.getLocalData();
      const newVolume = parseFloat(data.tank.current_volume) + refill.liters_added;
      if (newVolume > parseFloat(data.tank.capacity)) {
        throw new Error(`Refill would exceed tank capacity. Available space: ${data.tank.capacity - data.tank.current_volume}L`);
      }

      let savedRefill = null;

      // Try to save to DATABASE first
      if (this.useDatabase) {
        try {
          console.log('💾 Saving refill to fuel_refills table...');
          const { data: dbRefill, error: dbError } = await supabase
            .from('fuel_refills')
            .insert([refill])
            .select()
            .single();

          if (dbError) {
            console.error('❌ Database save error:', dbError);
            throw new Error(`Database error: ${dbError.message}`);
          }

          savedRefill = dbRefill;
          console.log('✅ Refill saved to database:', savedRefill);
        } catch (dbError) {
          console.error('❌ Database operation failed, falling back to localStorage:', dbError);
          // Create local refill with temporary ID
          savedRefill = {
            ...refill,
            id: `refill_${Date.now()}`,
            created_at: new Date().toISOString(),
            _isLocalOnly: true
          };
        }
      } else {
        // Create local refill with temporary ID
        savedRefill = {
          ...refill,
          id: `refill_${Date.now()}`,
          created_at: new Date().toISOString(),
          _isLocalOnly: true
        };
      }

      // Update localStorage tank volume and add to local refills
      data.refills.unshift(savedRefill);
      data.tank.current_volume = newVolume;
      data.tank.updated_at = new Date().toISOString();
      
      this.saveLocalData(data);
      this.tankData = data.tank;
      this.refills = data.refills;
      this.notify();
      
      console.log('✅ Fuel refill added successfully:', savedRefill);
      return { success: true, data: savedRefill };
      
    } catch (error) {
      console.error('❌ Error adding refill:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Add fuel withdrawal - DATABASE + localStorage integration
   */
  async addWithdrawal(withdrawalData) {
    try {
      console.log('🚀 Adding fuel withdrawal to DATABASE + localStorage:', withdrawalData);
      
      const withdrawal = {
        vehicle_id: parseInt(withdrawalData.vehicle_id) || null,
        liters_taken: parseFloat(withdrawalData.liters_taken),
        withdrawal_date: withdrawalData.withdrawal_date,
        filled_by: withdrawalData.filled_by,
        odometer_reading: withdrawalData.odometer_reading ? parseFloat(withdrawalData.odometer_reading) : null,
        notes: withdrawalData.notes || null
      };

      // Validate tank capacity first
      const data = this.getLocalData();
      const newVolume = parseFloat(data.tank.current_volume) - withdrawal.liters_taken;
      if (newVolume < 0) {
        throw new Error(`Withdrawal would result in negative tank volume. Available fuel: ${data.tank.current_volume}L`);
      }

      let savedWithdrawal = null;

      // Try to save to DATABASE first
      if (this.useDatabase) {
        try {
          console.log('💾 Saving withdrawal to fuel_withdrawals table...');
          const { data: dbWithdrawal, error: dbError } = await supabase
            .from('fuel_withdrawals')
            .insert([withdrawal])
            .select()
            .single();

          if (dbError) {
            console.error('❌ Database save error:', dbError);
            throw new Error(`Database error: ${dbError.message}`);
          }

          savedWithdrawal = dbWithdrawal;
          console.log('✅ Withdrawal saved to database:', savedWithdrawal);
        } catch (dbError) {
          console.error('❌ Database operation failed, falling back to localStorage:', dbError);
          // Create local withdrawal with temporary ID
          savedWithdrawal = {
            ...withdrawal,
            id: `withdrawal_${Date.now()}`,
            created_at: new Date().toISOString(),
            _isLocalOnly: true
          };
        }
      } else {
        // Create local withdrawal with temporary ID
        savedWithdrawal = {
          ...withdrawal,
          id: `withdrawal_${Date.now()}`,
          created_at: new Date().toISOString(),
          _isLocalOnly: true
        };
      }

      // Update localStorage tank volume and add to local withdrawals
      data.withdrawals.unshift(savedWithdrawal);
      data.tank.current_volume = newVolume;
      data.tank.updated_at = new Date().toISOString();
      
      this.saveLocalData(data);
      this.tankData = data.tank;
      this.withdrawals = data.withdrawals;
      this.notify();
      
      console.log('✅ Fuel withdrawal added successfully:', savedWithdrawal);
      return { success: true, data: savedWithdrawal };
      
    } catch (error) {
      console.error('❌ Error adding withdrawal:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a transaction (owner-only) - DATABASE + localStorage integration
   * @param {string} id - Transaction ID (e.g., "refill-123" or "withdrawal-456")
   * @param {string} type - Transaction type: 'tank_refill', 'vehicle_refill', or 'withdrawal'
   * @param {string} currentUserId - Current user's ID for ownership verification
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async deleteTransaction(id, type, currentUserId) {
    try {
      console.log('🗑️ Deleting transaction:', { id, type, currentUserId });

      // Extract the actual database ID from the prefixed ID
      const dbId = id.replace(/^(refill|withdrawal)-/, '');
      
      // Determine the table and creator field based on transaction type
      let tableName, creatorField;
      
      if (type === 'tank_refill') {
        tableName = 'fuel_refills';
        creatorField = 'refilled_by';
      } else if (type === 'vehicle_refill') {
        tableName = 'vehicle_fuel_refills';
        creatorField = 'refilled_by';
      } else if (type === 'withdrawal') {
        tableName = 'fuel_withdrawals';
        creatorField = 'filled_by';
      } else {
        throw new Error(`Invalid transaction type: ${type}`);
      }

      // Try to delete from DATABASE first
      if (this.useDatabase) {
        try {
          // First, fetch the record to verify ownership
          const { data: record, error: fetchError } = await supabase
            .from(tableName)
            .select('*')
            .eq('id', dbId)
            .single();

          if (fetchError) {
            console.error('❌ Error fetching record for ownership check:', fetchError);
            throw new Error(`Failed to fetch record: ${fetchError.message}`);
          }

          if (!record) {
            throw new Error('Transaction not found');
          }

          // Verify ownership (creator field should match current user ID)
          // NOTE: Current schema uses text fields (names) instead of UUIDs
          // This is a temporary check - proper implementation requires created_by UUID field
          console.log('🔍 Ownership check:', {
            recordCreator: record[creatorField],
            currentUserId: currentUserId,
            note: 'Using text field comparison - proper UUID field needed'
          });

          // For now, allow deletion if user is authenticated
          // TODO: Add proper created_by UUID field and RLS policies
          if (!currentUserId) {
            throw new Error('User must be authenticated to delete transactions');
          }

          // Delete from database
          console.log(`💾 Deleting from ${tableName} table...`);
          const { error: deleteError } = await supabase
            .from(tableName)
            .delete()
            .eq('id', dbId);

          if (deleteError) {
            console.error('❌ Database delete error:', deleteError);
            throw new Error(`Failed to delete: ${deleteError.message}`);
          }

          console.log('✅ Transaction deleted from database');
        } catch (dbError) {
          console.error('❌ Database operation failed:', dbError);
          throw dbError;
        }
      }

      // Also remove from localStorage
      const data = this.getLocalData();
      
      if (type === 'withdrawal') {
        data.withdrawals = data.withdrawals.filter(w => w.id !== dbId && `withdrawal-${w.id}` !== id);
      } else {
        data.refills = data.refills.filter(r => r.id !== dbId && `refill-${r.id}` !== id);
      }
      
      this.saveLocalData(data);
      this.notify();

      console.log('✅ Transaction deleted successfully');
      return { success: true };
      
    } catch (error) {
      console.error('❌ Error deleting transaction:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get recent refills - DATABASE + localStorage hybrid
   */
  async getRecentRefills(limit = 10) {
    try {
      console.log('🔄 Loading recent refills from DATABASE + localStorage...');
      
      let dbRefills = [];
      
      // Try to load from database first
      if (this.useDatabase) {
        try {
          const { data: refillsFromDB, error: dbError } = await supabase
            .from('fuel_refills')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

          if (dbError) {
            console.error('❌ Database error loading refills:', dbError);
          } else {
            dbRefills = refillsFromDB || [];
            console.log('✅ Loaded refills from database:', dbRefills.length);
          }
        } catch (error) {
          console.error('❌ Database access error:', error);
        }
      }
      
      // Load from localStorage as backup/supplement
      const data = this.getLocalData();
      const localRefills = data.refills || [];
      
      // Merge and deduplicate (database takes precedence)
      const allRefills = [...dbRefills];
      
      // Add local refills that aren't in database (by ID)
      const dbIds = new Set(dbRefills.map(r => r.id));
      localRefills.forEach(localRefill => {
        if (!dbIds.has(localRefill.id)) {
          allRefills.push(localRefill);
        }
      });
      
      // Sort by date and limit
      const sortedRefills = allRefills
        .sort((a, b) => new Date(b.created_at || b.refill_date) - new Date(a.created_at || a.refill_date))
        .slice(0, limit);
      
      this.refills = sortedRefills;
      
      console.log('✅ Recent refills loaded:', {
        database: dbRefills.length,
        localStorage: localRefills.length,
        merged: sortedRefills.length
      });
      
      return sortedRefills;
      
    } catch (error) {
      console.error('❌ Error fetching refills:', error);
      // Fallback to localStorage only
      const data = this.getLocalData();
      this.refills = data.refills.slice(0, limit);
      return this.refills;
    }
  }

  /**
   * Get recent withdrawals - DATABASE + localStorage hybrid
   */
  async getRecentWithdrawals(limit = 10) {
    try {
      console.log('🔄 Loading recent withdrawals from DATABASE + localStorage...');
      
      let dbWithdrawals = [];
      
      // Try to load from database first
      if (this.useDatabase) {
        try {
          const { data: withdrawalsFromDB, error: dbError } = await supabase
            .from('fuel_withdrawals')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

          if (dbError) {
            console.error('❌ Database error loading withdrawals:', dbError);
          } else {
            dbWithdrawals = withdrawalsFromDB || [];
            console.log('✅ Loaded withdrawals from database:', dbWithdrawals.length);
          }
        } catch (error) {
          console.error('❌ Database access error:', error);
        }
      }
      
      // Load from localStorage as backup/supplement
      const data = this.getLocalData();
      const localWithdrawals = data.withdrawals || [];
      
      // Merge and deduplicate (database takes precedence)
      const allWithdrawals = [...dbWithdrawals];
      
      // Add local withdrawals that aren't in database (by ID)
      const dbIds = new Set(dbWithdrawals.map(w => w.id));
      localWithdrawals.forEach(localWithdrawal => {
        if (!dbIds.has(localWithdrawal.id)) {
          allWithdrawals.push(localWithdrawal);
        }
      });
      
      // Sort by date and limit
      const sortedWithdrawals = allWithdrawals
        .sort((a, b) => new Date(b.created_at || b.withdrawal_date) - new Date(a.created_at || a.withdrawal_date))
        .slice(0, limit);
      
      this.withdrawals = sortedWithdrawals;
      
      console.log('✅ Recent withdrawals loaded:', {
        database: dbWithdrawals.length,
        localStorage: localWithdrawals.length,
        merged: sortedWithdrawals.length
      });
      
      return sortedWithdrawals;
      
    } catch (error) {
      console.error('❌ Error fetching withdrawals:', error);
      // Fallback to localStorage only
      const data = this.getLocalData();
      this.withdrawals = data.withdrawals.slice(0, limit);
      return this.withdrawals;
    }
  }

  /**
   * Check for low fuel alert
   */
  async checkLowFuelAlert() {
    try {
      const tank = await this.getTankStatus();
      if (!tank) return false;

      const currentPercentage = (parseFloat(tank.current_volume) / parseFloat(tank.capacity)) * 100;
      const isLowFuel = currentPercentage <= parseFloat(tank.low_threshold);
      
      console.log(`🔍 Fuel level check: ${currentPercentage.toFixed(1)}% (threshold: ${tank.low_threshold}%) - ${isLowFuel ? 'LOW FUEL' : 'OK'}`);
      return isLowFuel;
    } catch (error) {
      console.error('Error checking low fuel alert:', error);
      return false;
    }
  }

  /**
   * Load all fuel data - DATABASE + localStorage hybrid
   */
  async loadData() {
    try {
      console.log('🔄 Loading all fuel data from DATABASE + localStorage...');
      
      // Check database access first
      const dbAccess = await this.checkDatabaseSetup();
      if (dbAccess) {
        console.log('✅ Database access confirmed, using hybrid mode');
        this.useDatabase = true;
      } else {
        console.log('⚠️ Database access failed, using localStorage only');
        this.useDatabase = false;
      }
      
      await Promise.all([
        this.getTankStatus(),
        this.getRecentRefills(),
        this.getRecentWithdrawals()
      ]);
      
      this.notify();
      console.log('✅ All fuel data loaded successfully');
    } catch (error) {
      console.error('Error loading fuel data:', error);
    }
  }

  /**
   * Get available vehicles for withdrawal - Real database query
   */
  async getAvailableVehicles() {
    console.log('🚗 ===== FUEL SERVICE: FETCHING REAL VEHICLES =====');
    console.log('🔍 Querying saharax_0u4w4d_vehicles table with correct columns...');
    
    try {
      // Force a fresh query every time - no caching
      const timestamp = new Date().toISOString();
      console.log(`🕐 Query timestamp: ${timestamp}`);
      
      // Only select columns that actually exist in the table
      const { data: vehicles, error } = await supabase
        .from('saharax_0u4w4d_vehicles')
        .select(`
          id,
          name,
          status,
          plate_number,
          model,
          current_odometer,
          created_at,
          updated_at
        `)
        .order('name', { ascending: true });

      console.log('📊 SUPABASE RESPONSE:', { 
        error: error, 
        vehicleCount: vehicles?.length || 0,
        vehicles: vehicles
      });

      if (error) {
        console.error('❌ SUPABASE ERROR:', error);
        console.error('❌ Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw new Error(`Database error: ${error.message}`);
      }

      if (!vehicles || vehicles.length === 0) {
        console.log('⚠️ NO VEHICLES FOUND IN DATABASE');
        return [];
      }

      // Transform vehicles with enhanced logging
      const transformedVehicles = vehicles.map((vehicle, index) => {
        const transformed = {
          id: vehicle.id,
          name: vehicle.name || `Vehicle ${vehicle.id}`,
          status: vehicle.status || 'available',
          plate_number: vehicle.plate_number || 'N/A',
          model: vehicle.model || 'Unknown Model',
          brand: 'SEGWAY', // Default brand since column doesn't exist
          current_odometer: vehicle.current_odometer || 0,
          _isRealData: true,
          _fetchedAt: timestamp
        };
        
        console.log(`🔄 Vehicle ${index + 1}:`, {
          id: transformed.id,
          name: transformed.name,
          plate_number: transformed.plate_number,
          status: transformed.status,
          model: transformed.model
        });
        
        return transformed;
      });

      console.log('✅ ===== REAL VEHICLES SUCCESSFULLY TRANSFORMED =====');
      console.log('📊 FINAL RESULT:', {
        totalVehicles: transformedVehicles.length,
        vehicleNames: transformedVehicles.map(v => v.name),
        plateNumbers: transformedVehicles.map(v => v.plate_number)
      });
      
      return transformedVehicles;
      
    } catch (error) {
      console.error('❌ ===== FUEL SERVICE ERROR =====');
      console.error('❌ Error details:', error);
      
      // Return empty array on error - NO FALLBACK DATA
      console.log('🚫 Returning empty array - NO FALLBACK DATA');
      return [];
    }
  }

  /**
   * Get fuel refills for reporting
   */
  async getFuelRefillsForReporting(startDate, endDate) {
    try {
      console.log('📊 Loading fuel refills for reporting:', { startDate, endDate });
      
      if (this.useDatabase) {
        let query = supabase
          .from('fuel_refills')
          .select('*')
          .order('refill_date', { ascending: false });
          
        if (startDate) {
          query = query.gte('refill_date', startDate);
        }
        if (endDate) {
          query = query.lte('refill_date', endDate);
        }
        
        const { data, error } = await query;
        
        if (error) {
          console.error('❌ Database error loading refills for reporting:', error);
          throw error;
        }
        
        console.log('✅ Loaded refills for reporting from database:', data?.length || 0);
        return data || [];
      } else {
        // Fallback to localStorage
        const localData = this.getLocalData();
        let refills = localData.refills || [];
        
        // Filter by date if provided
        if (startDate || endDate) {
          refills = refills.filter(refill => {
            const refillDate = new Date(refill.refill_date);
            if (startDate && refillDate < new Date(startDate)) return false;
            if (endDate && refillDate > new Date(endDate)) return false;
            return true;
          });
        }
        
        console.log('✅ Loaded refills for reporting from localStorage:', refills.length);
        return refills;
      }
    } catch (error) {
      console.error('❌ Error loading refills for reporting:', error);
      return [];
    }
  }

  /**
   * Clear all localStorage data (for testing)
   */
  clearAllLocalStorageData() {
    try {
      localStorage.removeItem(this.storageKey);
      console.log('🗑️ All fuel localStorage data cleared');
      return true;
    } catch (err) {
      console.error('Error clearing fuel localStorage data:', err);
      return false;
    }
  }

  /**
   * Test localStorage functionality
   */
  testLocalStorage() {
    try {
      const testKey = 'mgx_fuel_test_key';
      const testValue = { test: 'value', timestamp: new Date().toISOString() };
      
      // Test write
      localStorage.setItem(testKey, JSON.stringify(testValue));
      
      // Test read
      const retrieved = localStorage.getItem(testKey);
      const parsed = JSON.parse(retrieved);
      
      // Test delete
      localStorage.removeItem(testKey);
      
      console.log('✅ Fuel localStorage test passed:', parsed);
      return true;
    } catch (err) {
      console.error('❌ Fuel localStorage test failed:', err);
      return false;
    }
  }
}

// Export singleton instance
const fuelService = new FuelService();
export default fuelService;