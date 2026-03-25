import { supabase } from '../lib/supabase';

export class PricingService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 10 * 60 * 1000; // 10 minutes for pricing data
    this.retryAttempts = 3;
    this.retryDelay = 1000; // 1 second
  }

  // ============================================================================
  // CORE PRICING OPERATIONS - FIXED SCHEMA
  // ============================================================================

  async getBasePrices(page = 1, pageSize = 50, search = '') {
    const cacheKey = this.getCacheKey('getBasePrices', { page, pageSize, search });
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      console.log('💰 Fetching base prices with retry logic...');
      
      const result = await this.withRetry(async () => {
        const offset = (page - 1) * pageSize;
        
        let query = supabase
          .from('app_4c3a7a6153_base_prices')
          .select(`
            *,
            saharax_0u4w4d_vehicles!inner(id, name, model, vehicle_type)
          `, { count: 'exact' });

        if (search && search.trim()) {
          query = query.or(
            `vehicle_type.ilike.%${search}%,location.ilike.%${search}%`,
            { foreignTable: 'saharax_0u4w4d_vehicles' }
          );
        }

        query = query
          .order('created_at', { ascending: false })
          .range(offset, offset + pageSize - 1);

        return await query;
      });

      const { data: prices, error, count } = result;

      if (error) {
        console.error('❌ Error fetching base prices:', error);
        return { data: [], total: 0, pages: 0 };
      }

      const processedData = prices?.map(price => ({
        id: price.id,
        vehicle: price.saharax_0u4w4d_vehicles,
        vehicleType: price.saharax_0u4w4d_vehicles?.vehicle_type || 'Unknown',
        location: price.location || 'Default',
        basePrice: Number(price.base_price) || 0,
        currency: price.currency || 'MAD',
        effectiveDate: price.effective_date,
        isActive: price.is_active,
        createdAt: price.created_at
      })) || [];

      const result_data = {
        data: processedData,
        total: count || 0,
        pages: Math.ceil((count || 0) / pageSize)
      };

      this.setCache(cacheKey, result_data);
      console.log(`✅ Base prices loaded: ${processedData.length} records`);
      return result_data;

    } catch (error) {
      console.error('❌ Error in getBasePrices:', error);
      return { data: [], total: 0, pages: 0 };
    }
  }

  async createBasePrice(priceData) {
    try {
      console.log('➕ Creating base price...');
      
      const result = await this.withRetry(async () => {
        return await supabase
          .from('app_4c3a7a6153_base_prices')
          .insert([{
            vehicle_id: priceData.vehicleId,
            vehicle_type: priceData.vehicleType,
            location: priceData.location || 'Default',
            base_price: Number(priceData.basePrice),
            currency: priceData.currency || 'MAD',
            effective_date: priceData.effectiveDate || new Date().toISOString().split('T')[0],
            is_active: priceData.isActive !== false,
            created_at: new Date().toISOString()
          }])
          .select(`
            *,
            saharax_0u4w4d_vehicles!inner(id, name, model, vehicle_type)
          `)
          .single();
      });

      const { data: price, error } = result;

      if (error) {
        console.error('❌ Error creating base price:', error);
        throw error;
      }

      this.clearCache();
      console.log('✅ Base price created successfully');
      return price;

    } catch (error) {
      console.error('❌ Error in createBasePrice:', error);
      throw error;
    }
  }

  async updateBasePrice(id, updateData) {
    try {
      console.log('✏️ Updating base price:', id);
      
      const result = await this.withRetry(async () => {
        return await supabase
          .from('app_4c3a7a6153_base_prices')
          .update({
            base_price: Number(updateData.basePrice),
            location: updateData.location,
            currency: updateData.currency || 'MAD',
            effective_date: updateData.effectiveDate,
            is_active: updateData.isActive,
            updated_at: new Date().toISOString()
          })
          .eq('id', id)
          .select(`
            *,
            saharax_0u4w4d_vehicles!inner(id, name, model, vehicle_type)
          `)
          .single();
      });

      const { data: price, error } = result;

      if (error) {
        console.error('❌ Error updating base price:', error);
        throw error;
      }

      this.clearCache();
      console.log('✅ Base price updated successfully');
      return price;

    } catch (error) {
      console.error('❌ Error in updateBasePrice:', error);
      throw error;
    }
  }

  async deleteBasePrice(id) {
    try {
      console.log('🗑️ Deleting base price:', id);
      
      const result = await this.withRetry(async () => {
        return await supabase
          .from('app_4c3a7a6153_base_prices')
          .delete()
          .eq('id', id);
      });

      const { error } = result;

      if (error) {
        console.error('❌ Error deleting base price:', error);
        throw error;
      }

      this.clearCache();
      console.log('✅ Base price deleted successfully');
      return true;

    } catch (error) {
      console.error('❌ Error in deleteBasePrice:', error);
      throw error;
    }
  }

  // ============================================================================
  // TRANSPORT FEE OPERATIONS - FIXED SCHEMA
  // ============================================================================

  async getTransportFees(page = 1, pageSize = 50, search = '') {
    const cacheKey = this.getCacheKey('getTransportFees', { page, pageSize, search });
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      console.log('🚚 Fetching transport fees...');
      
      const result = await this.withRetry(async () => {
        const offset = (page - 1) * pageSize;
        
        let query = supabase
          .from('app_4c3a7a6153_transport_fees')
          .select('*', { count: 'exact' });

        if (search && search.trim()) {
          query = query.or(
            `from_location.ilike.%${search}%,to_location.ilike.%${search}%,vehicle_type.ilike.%${search}%`
          );
        }

        query = query
          .order('created_at', { ascending: false })
          .range(offset, offset + pageSize - 1);

        return await query;
      });

      const { data: fees, error, count } = result;

      if (error) {
        console.error('❌ Error fetching transport fees:', error);
        return { data: [], total: 0, pages: 0 };
      }

      const processedData = fees?.map(fee => ({
        id: fee.id,
        fromLocation: fee.from_location,
        toLocation: fee.to_location,
        vehicleType: fee.vehicle_type,
        feeAmount: Number(fee.fee_amount) || 0,
        currency: fee.currency || 'MAD',
        distanceKm: Number(fee.distance_km) || 0,
        isActive: fee.is_active,
        createdAt: fee.created_at
      })) || [];

      const result_data = {
        data: processedData,
        total: count || 0,
        pages: Math.ceil((count || 0) / pageSize)
      };

      this.setCache(cacheKey, result_data);
      console.log(`✅ Transport fees loaded: ${processedData.length} records`);
      return result_data;

    } catch (error) {
      console.error('❌ Error in getTransportFees:', error);
      return { data: [], total: 0, pages: 0 };
    }
  }

  // ============================================================================
  // DYNAMIC PRICING CALCULATIONS - FIXED SCHEMA
  // ============================================================================

  async calculateDynamicPrice(vehicleId, startDate, endDate, location = 'Default') {
    try {
      console.log('🧮 Calculating dynamic price...');
      
      // Get base price
      const basePrice = await this.getBasePriceForVehicle(vehicleId, location);
      if (!basePrice) {
        throw new Error('Base price not found for vehicle');
      }

      // Calculate rental duration
      const days = this.calculateDays(startDate, endDate);
      
      // Apply seasonal multiplier
      const seasonalMultiplier = this.getSeasonalMultiplier(startDate);
      
      // Apply duration discount
      const durationMultiplier = this.getDurationMultiplier(days);
      
      // Calculate final price
      const finalPrice = basePrice * days * seasonalMultiplier * durationMultiplier;

      const pricing = {
        basePrice,
        days,
        seasonalMultiplier,
        durationMultiplier,
        subtotal: basePrice * days,
        finalPrice: Math.round(finalPrice * 100) / 100,
        currency: 'MAD'
      };

      console.log('✅ Dynamic price calculated:', pricing);
      return pricing;

    } catch (error) {
      console.error('❌ Error calculating dynamic price:', error);
      throw error;
    }
  }

  async getBasePriceForVehicle(vehicleId, location = 'Default') {
    try {
      const result = await this.withRetry(async () => {
        return await supabase
          .from('app_4c3a7a6153_base_prices')
          .select('base_price')
          .eq('vehicle_id', vehicleId)
          .eq('location', location)
          .eq('is_active', true)
          .order('effective_date', { ascending: false })
          .limit(1)
          .single();
      });

      const { data: price, error } = result;

      if (error) {
        console.warn('⚠️ No base price found, using default');
        return 150; // Default price
      }

      return Number(price.base_price) || 150;
    } catch (error) {
      console.error('❌ Error getting base price:', error);
      return 150; // Default fallback
    }
  }

  // ============================================================================
  // VEHICLE TYPE PRICING - FIXED SCHEMA
  // ============================================================================

  async getVehicleTypePricing() {
    const cacheKey = 'getVehicleTypePricing';
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      console.log('🏷️ Fetching vehicle type pricing...');
      
      const result = await this.withRetry(async () => {
        return await supabase
          .from('saharax_0u4w4d_vehicles')
          .select('model, vehicle_type')
          .eq('status', 'available');
      });

      const { data: vehicles, error } = result;

      if (error) {
        console.error('❌ Error fetching vehicle types:', error);
        return [];
      }

      // Group by vehicle type and create pricing structure
      const typeGroups = {};
      vehicles?.forEach(vehicle => {
        const key = `${vehicle.vehicle_type}-${vehicle.model}`;
        if (!typeGroups[key]) {
          typeGroups[key] = {
            id: key,
            name: `${vehicle.vehicle_type} ${vehicle.model}`,
            vehicle_type: vehicle.vehicle_type,
            model: vehicle.model,
            basePrice: this.getDefaultPriceForType(vehicle.vehicle_type),
            currency: 'MAD'
          };
        }
      });

      const typePricing = Object.values(typeGroups);
      this.setCache(cacheKey, typePricing);
      
      console.log(`✅ Vehicle type pricing loaded: ${typePricing.length} types`);
      return typePricing;

    } catch (error) {
      console.error('❌ Error in getVehicleTypePricing:', error);
      return [];
    }
  }

  getDefaultPriceForType(vehicleType) {
    const defaultPrices = {
      'ATV': 150,
      'Quad': 180,
      'Buggy': 200,
      'Motorcycle': 120,
      'Scooter': 100
    };
    return defaultPrices[vehicleType] || 150;
  }

  // ============================================================================
  // PRICING UTILITIES
  // ============================================================================

  calculateDays(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(1, diffDays); // Minimum 1 day
  }

  getSeasonalMultiplier(date) {
    const month = new Date(date).getMonth() + 1;
    // High season: June-September
    if (month >= 6 && month <= 9) return 1.2;
    // Medium season: April-May, October-November
    if ((month >= 4 && month <= 5) || (month >= 10 && month <= 11)) return 1.1;
    // Low season: December-March
    return 1.0;
  }

  getDurationMultiplier(days) {
    if (days >= 30) return 0.8; // 20% discount for monthly
    if (days >= 7) return 0.9;  // 10% discount for weekly
    if (days >= 3) return 0.95; // 5% discount for 3+ days
    return 1.0; // No discount for short rentals
  }

  formatPrice(amount, currency = 'MAD') {
    return new Intl.NumberFormat('en-US', {
      style: 'decimal',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount) + ` ${currency}`;
  }

  // ============================================================================
  // RETRY LOGIC & CACHE MANAGEMENT
  // ============================================================================

  async withRetry(operation, attempts = this.retryAttempts) {
    for (let i = 0; i < attempts; i++) {
      try {
        return await operation();
      } catch (error) {
        if (i === attempts - 1) throw error;
        console.warn(`⚠️ Attempt ${i + 1} failed, retrying...`);
        await new Promise(resolve => setTimeout(resolve, this.retryDelay * (i + 1)));
      }
    }
  }

  getCacheKey(method, params) {
    return `${method}_${JSON.stringify(params)}`;
  }

  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    return null;
  }

  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  clearCache() {
    this.cache.clear();
    console.log('✅ Pricing service cache cleared');
  }
}

export const pricingService = new PricingService();
export default pricingService;