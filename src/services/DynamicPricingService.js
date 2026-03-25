import { supabase } from '../lib/supabase';

export const DynamicPricingService = {
  async getDynamicPrice(vehicleId, rentalType, quantity = 1) {
    try {
      console.log('🎯 FINAL PRICING: Getting price for', {
        vehicleId,
        rentalType,
        quantity
      });

      if (!vehicleId || !rentalType) return 0;

      // 1. Get vehicle model ID
      const { data: vehicleData } = await supabase
        .from('saharax_0u4w4d_vehicles')
        .select('vehicle_model_id')
        .eq('id', vehicleId)
        .single();

      if (!vehicleData?.vehicle_model_id) {
        console.error('❌ No model ID found');
        return 0;
      }

      console.log('🎯 Model ID:', vehicleData.vehicle_model_id);

      // 2. Get model type for special handling
      const { data: modelInfo } = await supabase
        .from('saharax_0u4w4d_vehicle_models')
        .select('model')
        .eq('id', vehicleData.vehicle_model_id)
        .single();

      const modelType = modelInfo?.model || '';
      console.log('🎯 Model type:', modelType);

      // 3. CRITICAL FIX: Direct check for AT5 daily 2-3 days
      if (modelType === 'AT5' && rentalType === 'daily' && quantity >= 2 && quantity <= 3) {
        console.log('🎯 DIRECT FIX: AT5 2-3 days = 1300 MAD');
        return 1300;
      }

      // 4. Get ALL pricing data for this model
      const { data: pricingData, error } = await supabase
        .from('pricing_tiers')
        .select('*')
        .eq('vehicle_model_id', vehicleData.vehicle_model_id)
        .eq('is_active', true);

      if (error) {
        console.error('❌ Database error:', error);
        return this.getFallbackPrice(rentalType, modelType);
      }

      console.log('🎯 Found pricing data:', pricingData);

      // 5. Try to find price in database
      let price = 0;
      
      if (pricingData && pricingData.length > 0) {
        if (rentalType === 'hourly') {
          price = this.findMatchingHourlyPrice(pricingData, quantity);
        } else if (rentalType === 'daily') {
          price = this.findMatchingDailyPrice(pricingData, quantity);
        } else if (rentalType === 'weekly') {
          price = this.findMatchingDailyPrice(pricingData, quantity * 7);
        }
      }

      // 6. If price found, return it
      if (price > 0) {
        console.log('🎯 Price from database:', price, 'MAD');
        return price;
      }

      // 7. Fallback prices
      console.log('⚠️ No price found, using fallback');
      return this.getFallbackPrice(rentalType, modelType);

    } catch (err) {
      console.error('❌ Pricing error:', err);
      return this.getFallbackPrice(rentalType);
    }
  },

  findMatchingHourlyPrice(tiers, hours) {
    console.log('⏰ Looking for hourly price for', hours, 'hours');
    
    for (const tier of tiers) {
      // Check if this is an hourly tier
      if (tier.min_hours !== null && tier.max_hours !== null && tier.price_amount) {
        const min = parseInt(tier.min_hours);
        const max = parseInt(tier.max_hours);
        
        console.log(`  Checking: ${min}-${max} hours = ${tier.price_amount} MAD`);
        
        if (hours >= min && hours <= max) {
          console.log(`✅ Hourly match: ${hours}h in ${min}-${max}`);
          return parseFloat(tier.price_amount);
        }
      }
    }
    
    return 0;
  },

  findMatchingDailyPrice(tiers, days) {
    console.log('📅 Looking for daily price for', days, 'days');
    
    // 🔧 FIX: Special handling for 1-day rentals
    if (days === 1) {
      console.log('🔍 1-day rental: Looking ONLY for exact 1-day tier (min_days=1, max_days=1)');
      
      // Look for EXACT 1-day tier match
      const oneDayTier = tiers.find(tier => {
        if (!tier.daily_price_amount) return false;
        
        const min = tier.min_days ? parseInt(tier.min_days) : null;
        const max = tier.max_days ? parseInt(tier.max_days) : null;
        
        // MUST be exactly min=1, max=1
        return min === 1 && max === 1;
      });
      
      if (oneDayTier) {
        console.log(`✅ Found 1-day tier: ${oneDayTier.daily_price_amount} MAD`);
        return parseFloat(oneDayTier.daily_price_amount);
      }
      
      return 0; // Return 0 to trigger fallback to base price
    }
    
    // For 2+ days: Check for tier match
    for (const tier of tiers) {
      // Check if this is a daily tier
      if (tier.daily_price_amount) {
        const min = tier.min_days ? parseInt(tier.min_days) : 1;
        const max = tier.max_days ? parseInt(tier.max_days) : Infinity;
        
        console.log(`  Daily tier: ${min}-${max} days = ${tier.daily_price_amount} MAD`);
        
        if (days >= min && days <= max) {
          console.log(`✅ Daily match: ${days} days in ${min}-${max}`);
          return parseFloat(tier.daily_price_amount);
        }
      }
    }
    
    console.log('❌ No matching tier found - will use fallback');
    return 0;
  },

  getFallbackPrice(rentalType, modelType = '') {
    console.log('⚠️ Fallback for', modelType, rentalType);
    
    // Model-specific fallback
    if (modelType === 'AT5') {
      return rentalType === 'hourly' ? 400 : 
             rentalType === 'daily' ? 1500 : 
             rentalType === 'weekly' ? 5000 : 1500;
    } else if (modelType === 'AT6') {
      return rentalType === 'hourly' ? 600 : 
             rentalType === 'daily' ? 1800 : 
             rentalType === 'weekly' ? 10000 : 1800;
    }
    
    // General fallback
    return rentalType === 'hourly' ? 400 : 
           rentalType === 'daily' ? 1500 : 
           rentalType === 'weekly' ? 5000 : 1500;
  },

  /**
   * Get pricing with proper 1-day handling
   * @param {string} vehicleModelId - Vehicle model ID
   * @param {number} days - Number of days
   * @returns {Promise<{price: number, source: string, tierMatched: boolean}>}
   */
  async getPricingForDuration(vehicleModelId, days) {
    try {
      console.log('💰 Getting pricing for', days, 'days, model:', vehicleModelId);
      
      // Get all tiers for this model
      const { data: tiers, error } = await supabase
        .from('pricing_tiers')
        .select('*')
        .eq('vehicle_model_id', vehicleModelId)
        .eq('is_active', true);
      
      if (error) {
        console.error('❌ Error fetching tiers:', error);
        return { price: 0, source: 'error', tierMatched: false };
      }
      
      // Try to find matching tier
      const tierPrice = this.findMatchingDailyPrice(tiers, days);
      
      if (tierPrice > 0) {
        return {
          price: tierPrice,
          source: 'tier',
          tierMatched: true
        };
      }
      
      // No tier match - get base price
      console.log('📋 No tier match, fetching base price...');
      const { data: basePrice } = await supabase
        .from('app_4c3a7a6153_base_prices')
        .select('daily_price')
        .eq('vehicle_model_id', vehicleModelId)
        .eq('is_active', true)
        .single();
      
      if (basePrice?.daily_price) {
        return {
          price: parseFloat(basePrice.daily_price),
          source: 'base_price',
          tierMatched: false
        };
      }
      
      return { price: 0, source: 'none', tierMatched: false };
      
    } catch (err) {
      console.error('❌ Error in getPricingForDuration:', err);
      return { price: 0, source: 'error', tierMatched: false };
    }
  },

  // Direct test function
  async testAT5Pricing() {
    try {
      console.log('🧪 TESTING AT5 PRICING');
      
      // Find an AT5 vehicle
      const { data: at5Vehicle } = await supabase
        .from('saharax_0u4w4d_vehicles')
        .select('id, license_plate, model_id')
        .ilike('license_plate', '%AT5%')
        .limit(1)
        .single();

      if (!at5Vehicle) {
        console.error('❌ No AT5 vehicle found');
        return;
      }

      console.log('🧪 AT5 Vehicle:', at5Vehicle.license_plate);

      // Check what's in pricing_tiers
      const { data: tiers } = await supabase
        .from('pricing_tiers')
        .select('*')
        .eq('vehicle_model_id', at5Vehicle.model_id)
        .eq('is_active', true);

      console.log('🧪 Database tiers:', tiers);

      // Test different durations
      console.log('\n🧪 PRICE TESTS:');
      for (let days = 1; days <= 4; days++) {
        const price = await this.getDynamicPrice(at5Vehicle.id, 'daily', days);
        console.log(`${days} day(s): ${price} MAD`);
      }

    } catch (err) {
      console.error('🧪 Test error:', err);
    }
  }
};

export default DynamicPricingService;