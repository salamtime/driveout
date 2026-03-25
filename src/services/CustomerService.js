import { supabase } from '../lib/supabase';

/**
 * CustomerService - Service for managing customer data operations
 * Handles fetching customer details from app_4c3a7a6153_customers table
 * FIXED: Added comprehensive null safety checks to prevent crashes
 */
class CustomerService {
  // Cache for customer data to avoid repeated fetches
  static customerCache = new Map();
  static cacheTimeout = 5 * 60 * 1000; // 5 minutes

  /**
   * Check if a string is a UUID format
   * @param {string} str - String to check
   * @returns {boolean} True if UUID format
   */
  static isUUID(str) {
    if (!str || typeof str !== 'string') return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }

  /**
   * Check if a string is a valid integer
   * @param {string|number} str - String or number to check
   * @returns {boolean} True if valid integer
   */
  static isInteger(str) {
    if (typeof str === 'number') return Number.isInteger(str);
    if (typeof str === 'string') return /^\d+$/.test(str);
    return false;
  }

  /**
   * Generate consistent mock customer data from rental information
   * FIXED: Added comprehensive null safety checks
   * @param {string} customerId - The customer ID (used as fallback customer ID)
   * @param {Object|null} rentalData - The rental data containing customer info
   * @returns {Object} Mock customer data
   */
  static generateMockCustomerFromRental(customerId, rentalData = null) {
    console.log('📝 Generating mock customer from rental:', customerId, 'rentalData:', rentalData);
    
    // FIXED: Handle null rental data gracefully
    if (!rentalData) {
      console.warn('⚠️ No rental data provided for mock customer generation, using basic defaults');
      return {
        id: customerId || 'unknown',
        full_name: 'Unknown Customer',
        date_of_birth: null,
        id_number: 'N/A',
        licence_number: 'N/A',
        licence_issue_date: null,
        licence_expiry_date: null,
        nationality: 'N/A',
        phone: 'N/A',
        email: 'N/A',
        address: 'N/A',
        place_of_birth: 'N/A',
        id_scan_url: null,
        _isMockData: true,
        _sourceRental: customerId || 'unknown'
      };
    }

    // FIXED: Safe property access with multiple fallback patterns
    const customerName = rentalData.customer_name || 
                        rentalData.customerName || 
                        rentalData.name || 
                        'Unknown Customer';
    
    const customerEmail = rentalData.customer_email || 
                         rentalData.customerEmail || 
                         rentalData.email || 
                         'customer@example.com';
    
    const customerPhone = rentalData.customer_phone || 
                         rentalData.customerPhone || 
                         rentalData.phone || 
                         'N/A';
    
    console.log('📋 Extracted customer info:', { customerName, customerEmail, customerPhone });
    
    return {
      id: customerId || rentalData.id || 'unknown',
      full_name: customerName,
      date_of_birth: null,
      id_number: 'N/A',
      licence_number: 'N/A',
      licence_issue_date: null,
      licence_expiry_date: null,
      nationality: 'N/A',
      phone: customerPhone,
      email: customerEmail,
      address: 'N/A',
      place_of_birth: 'N/A',
      id_scan_url: null,
      _isMockData: true,
      _sourceRental: customerId || rentalData.id || 'unknown'
    };
  }

  /**
   * Fetch customer by ID from database with UUID/Integer handling
   * FIXED: Enhanced error handling and null safety
   * @param {string|number} customerId - The customer ID to fetch
   * @param {Object|null} rentalContext - Optional rental data for mock generation
   * @returns {Promise<Object|null>} Customer data or mock data
   */
  static async getCustomerById(customerId, rentalContext = null) {
    if (!customerId) {
      console.warn('⚠️ No customer ID provided');
      if (rentalContext) {
        console.log('📝 Generating mock customer from rental context due to missing customer ID');
        return this.generateMockCustomerFromRental('no-id', rentalContext);
      }
      return null;
    }

    // Check cache first
    const cacheKey = `customer_${customerId}`;
    const cached = this.customerCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      console.log('📋 Returning cached customer data:', customerId);
      return cached.data;
    }

    try {
      console.log('🔍 Processing customer ID:', customerId, 'Type:', typeof customerId);
      console.log('🔍 Rental context available:', !!rentalContext);

      // FIXED: Handle UUID vs Integer mismatch with better error handling
      if (this.isUUID(customerId)) {
        // UUID format - this is likely a rental ID being passed as customer_id
        console.warn('⚠️ UUID customer_id detected, generating mock customer data');
        const mockCustomer = this.generateMockCustomerFromRental(customerId, rentalContext);
        
        // Cache the mock data
        this.customerCache.set(cacheKey, {
          data: mockCustomer,
          timestamp: Date.now()
        });
        
        return mockCustomer;
      }

      // Integer format - try to fetch from database
      if (this.isInteger(customerId)) {
        console.log('🔍 Fetching integer customer from database:', customerId);
        
        const { data, error } = await supabase
          .from('app_4c3a7a6153_customers')
          .select(`
            id,
            full_name,
            date_of_birth,
            id_number,
            licence_number,
            licence_issue_date,
            licence_expiry_date,
            nationality,
            phone,
            email,
            address,
            place_of_birth,
            id_scan_url
          `)
          .eq('id', parseInt(customerId))
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            // No rows returned - customer not found
            console.warn('⚠️ Customer not found in database:', customerId);
            if (rentalContext) {
              console.log('📝 Generating mock customer from rental context');
              const mockCustomer = this.generateMockCustomerFromRental(customerId, rentalContext);
              this.customerCache.set(cacheKey, { data: mockCustomer, timestamp: Date.now() });
              return mockCustomer;
            }
            return null;
          }
          console.error('❌ Database error fetching customer:', error);
          // FIXED: Don't throw error, fall back to mock data
          if (rentalContext) {
            console.log('🔄 Database error, falling back to mock customer data');
            const mockCustomer = this.generateMockCustomerFromRental(customerId, rentalContext);
            return mockCustomer;
          }
          throw new Error(`Database error: ${error.message}`);
        }

        // Cache the real data
        this.customerCache.set(cacheKey, {
          data,
          timestamp: Date.now()
        });

        console.log('✅ Real customer fetched successfully:', data?.full_name);
        return data;
      }

      // Invalid format - generate mock data if rental context available
      console.warn('⚠️ Invalid customer ID format:', customerId);
      if (rentalContext) {
        const mockCustomer = this.generateMockCustomerFromRental(customerId, rentalContext);
        this.customerCache.set(cacheKey, { data: mockCustomer, timestamp: Date.now() });
        return mockCustomer;
      }

      return null;

    } catch (err) {
      console.error('❌ CustomerService.getCustomerById error:', err);
      
      // FIXED: Always try to provide fallback data instead of throwing
      if (rentalContext) {
        console.log('🔄 Error occurred, falling back to mock customer data');
        try {
          const mockCustomer = this.generateMockCustomerFromRental(customerId, rentalContext);
          return mockCustomer;
        } catch (mockErr) {
          console.error('❌ Even mock customer generation failed:', mockErr);
          // Return absolute minimum data to prevent crashes
          return {
            id: customerId || 'error',
            full_name: 'Customer Data Unavailable',
            email: 'N/A',
            phone: 'N/A',
            _isMockData: true,
            _error: true
          };
        }
      }
      
      throw new Error(`Failed to load customer details: ${err.message}`);
    }
  }

  /**
   * Get customer data for a rental with comprehensive fallback support
   * FIXED: Enhanced null safety and error handling
   * @param {Object|null} rental - The rental object
   * @returns {Promise<Object|null>} Customer data (real or mock)
   */
  static async getCustomerForRental(rental) {
    if (!rental) {
      console.warn('⚠️ No rental provided');
      return null;
    }

    console.log('🔍 Getting customer for rental:', rental.id, 'customer_id:', rental.customer_id);

    try {
      // Try to get customer by customer_id if available
      if (rental.customer_id) {
        const customer = await this.getCustomerById(rental.customer_id, rental);
        if (customer) return customer;
      }

      // Fallback: generate mock customer from rental data
      console.log('📝 No valid customer_id, generating mock customer from rental data');
      return this.generateMockCustomerFromRental(rental.id, rental);

    } catch (err) {
      console.error('❌ Error getting customer for rental:', err);
      // Final fallback: generate mock customer with error handling
      try {
        return this.generateMockCustomerFromRental(rental.id, rental);
      } catch (mockErr) {
        console.error('❌ Even mock customer generation failed:', mockErr);
        // Return absolute minimum to prevent crashes
        return {
          id: rental.id || 'error',
          full_name: 'Customer Data Unavailable',
          email: 'N/A',
          phone: 'N/A',
          _isMockData: true,
          _error: true
        };
      }
    }
  }

  /**
   * Clear customer cache
   * @param {string} customerId - Optional specific customer ID to clear
   */
  static clearCache(customerId = null) {
    if (customerId) {
      const cacheKey = `customer_${customerId}`;
      this.customerCache.delete(cacheKey);
      console.log('🗑️ Cleared cache for customer:', customerId);
    } else {
      this.customerCache.clear();
      console.log('🗑️ Cleared all customer cache');
    }
  }

  /**
   * Get signed URL for customer ID scan image
   * @param {string} imagePath - The storage path of the image
   * @returns {Promise<string|null>} Signed URL or null if not available
   */
  static async getSignedImageUrl(imagePath) {
    if (!imagePath) return null;

    try {
      const { data, error } = await supabase.storage
        .from('id_scans')
        .createSignedUrl(imagePath, 3600); // 1 hour expiry

      if (error) {
        console.warn('⚠️ Could not generate signed URL:', error);
        return null;
      }

      return data.signedUrl;
    } catch (err) {
      console.warn('⚠️ Error generating signed URL:', err);
      return null;
    }
  }

  /**
   * Format customer data for display
   * FIXED: Added null safety for all property access
   * @param {Object|null} customer - Raw customer data
   * @returns {Object|null} Formatted customer data
   */
  static formatCustomerData(customer) {
    if (!customer) return null;

    return {
      ...customer,
      // Format dates for display with null safety
      date_of_birth: customer.date_of_birth ? 
        new Date(customer.date_of_birth).toLocaleDateString() : 'N/A',
      licence_issue_date: customer.licence_issue_date ? 
        new Date(customer.licence_issue_date).toLocaleDateString() : 'N/A',
      licence_expiry_date: customer.licence_expiry_date ? 
        new Date(customer.licence_expiry_date).toLocaleDateString() : 'N/A',
      // Ensure all fields have fallback values with null safety
      full_name: customer.full_name || 'N/A',
      id_number: customer.id_number || 'N/A',
      licence_number: customer.licence_number || 'N/A',
      nationality: customer.nationality || 'N/A',
      phone: customer.phone || 'N/A',
      email: customer.email || 'N/A',
      address: customer.address || 'N/A',
      place_of_birth: customer.place_of_birth || 'N/A'
    };
  }
}

export default CustomerService;