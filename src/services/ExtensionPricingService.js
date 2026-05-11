import { supabase } from '../lib/supabase';

export class ExtensionPricingService {
  static async getLatestVoidableExtension(rentalId) {
    const { data, error } = await supabase
      .from('rental_extensions')
      .select('*')
      .eq('rental_id', rentalId)
      .in('status', ['approved', 'active', 'completed'])
      .order('approved_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data || null;
  }

  static async getApprovedExtensionSummary(rentalId) {
    const { data, error } = await supabase
      .from('rental_extensions')
      .select('id, extension_hours, extension_price, status, created_at, approved_at')
      .eq('rental_id', rentalId)
      .eq('status', 'approved')
      .order('approved_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) throw error;

    const approvedExtensions = data || [];

    return {
      extensionCount: approvedExtensions.length,
      totalExtendedHours: approvedExtensions.reduce(
        (sum, extension) => sum + (parseFloat(extension.extension_hours) || 0),
        0
      ),
      totalExtensionPrice: approvedExtensions.reduce(
        (sum, extension) => sum + (parseFloat(extension.extension_price) || 0),
        0
      ),
      currentExtensionId: approvedExtensions[0]?.id || null,
    };
  }
  
  /**
   * Get dynamic hourly rate for a rental
   * Uses same logic as RentalDetails.js calculateTierPricingBreakdown()
   */
  static async getDynamicHourlyRate(rental) {
    let hourlyRate = 0;
    
    // 1. Try to fetch from base_prices table (dynamic from DB)
    if (rental.vehicle?.vehicle_model?.id) {
      const { data: priceData, error } = await supabase
        .from('app_4c3a7a6153_base_prices')
        .select('hourly_price')
        .eq('vehicle_model_id', rental.vehicle.vehicle_model.id)
        .eq('is_active', true)
        .single();
      
      if (!error && priceData?.hourly_price) {
        hourlyRate = parseFloat(priceData.hourly_price);
      }
    }
    
    // 2. Fallback to vehicle model's hourly price
    if (hourlyRate === 0 && rental.vehicle?.vehicle_model?.hourly_price) {
      hourlyRate = parseFloat(rental.vehicle.vehicle_model.hourly_price);
    }

    // 3. Fallback to vehicle's hourly_rate (dynamic from vehicle record)
    if (hourlyRate === 0 && rental.vehicle?.hourly_rate) {
      hourlyRate = parseFloat(rental.vehicle.hourly_rate);
    }
    
    // 4. Ultimate fallback based on vehicle type
    if (hourlyRate === 0) {
      const vehicleName = String(rental.vehicle?.name || rental.vehicle?.vehicle_model?.model || '').toUpperCase();
      
      if (vehicleName.includes('AT6')) {
        hourlyRate = 599;
      } else if (vehicleName.includes('AT5')) {
        hourlyRate = 399;
      } else if (vehicleName.includes('AT10')) {
        hourlyRate = 999;
      } else {
        hourlyRate = 400; // Default
      }
    }
    
    return hourlyRate;
  }

  /**
   * Calculate extension price dynamically
   * ALWAYS uses getDynamicHourlyRate to get the per-hour rate from base_prices
   * 
   * NOTE: rental.unit_price stores the TIER TOTAL (e.g., 800 MAD for 2-4 hours),
   * NOT the per-hour rate. So we must always fetch the actual hourly rate.
   */
  static async calculateDynamicExtensionPrice(hours, rental) {
    // Always use getDynamicHourlyRate to get the actual per-hour rate
    // This fetches from base_prices table which has the correct hourly rate
    const hourlyRate = await this.getDynamicHourlyRate(rental);
    return hours * hourlyRate;
  }

  /**
   * Find matching daily tier for given number of days
   */
  static async findMatchingDailyTier(vehicleModelId, days) {
    const { data: tiers, error } = await supabase
      .from('pricing_tiers')
      .select('*')
      .eq('vehicle_model_id', vehicleModelId)
      .eq('is_active', true)
      .eq('duration_type', 'days')
      .not('min_days', 'is', null)
      .not('max_days', 'is', null);
    
    if (error || !tiers) return null;
    
    // Find tier where days falls within min_days and max_days
    return tiers.find(tier => {
      const minDays = parseInt(tier.min_days);
      const maxDays = parseInt(tier.max_days);
      return days >= minDays && days <= maxDays;
    });
  }

  /**
   * Calculate new end date based on current end date and extension hours
   */
  static calculateNewEndDate(currentEndDate, extensionHours) {
    const endDate = new Date(currentEndDate);
    endDate.setHours(endDate.getHours() + extensionHours);
    return endDate.toISOString();
  }

  /**
   * Calculate extension price - wrapper function for modal compatibility
   * Takes rentalId, extensionValue, and extensionType (hours/days)
   * Returns price calculation result object
   */
  static async calculateExtensionPrice(rentalId, extensionValue, extensionType = 'hours') {
    try {
      // 1. Get rental details including vehicle model
      const { data: rental, error: rentalError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .select(`
          *,
          vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(
            *,
            vehicle_model:saharax_0u4w4d_vehicle_models!vehicle_model_id(*)
          )
        `)
        .eq('id', rentalId)
        .single();
      
      if (rentalError) throw rentalError;
      
      const vehicleModelId = rental.vehicle?.vehicle_model?.id;
      if (!vehicleModelId) {
        throw new Error('Vehicle model not found for this rental');
      }
      
      // 2. Get tier enforcement settings
      const tierEnforcement = await this.getTierEnforcementSettings();
      
      let extensionPrice = 0;
      let priceSource = 'auto';
      let tierId = null;
      let tierApplied = false;
      let tierBreakdown = [];
      let hourlyRate = 0;
      let dailyRate = 0;
      let totalSavings = 0;
      
      // 3. Handle daily extensions differently
      if (extensionType === 'days') {
        const hours = extensionValue * 24;
        
        // For daily extensions, look for daily pricing tiers first
        if (tierEnforcement.enabled) {
          const dailyTier = await this.findMatchingDailyTier(vehicleModelId, extensionValue);
          
          if (dailyTier) {
            // Use daily tier pricing
            extensionPrice = dailyTier.daily_price_amount * extensionValue;
            priceSource = 'auto'; // FIXED: Changed from 'daily_tier' to 'auto'
            tierId = dailyTier.id;
            tierApplied = true;
            
            // Calculate potential savings vs hourly rate
            const baseDailyPrice = await this.getBaseDailyPrice(vehicleModelId);
            if (baseDailyPrice && dailyTier.daily_price_amount < baseDailyPrice) {
              totalSavings = (baseDailyPrice - dailyTier.daily_price_amount) * extensionValue;
            }
            
            tierBreakdown = [{
              units: extensionValue,
              unit_type: 'days',
              rate: dailyTier.daily_price_amount,
              discount: dailyTier.daily_discount_percentage || 0,
              subtotal: extensionPrice
            }];
            
            // Get daily rate for display
            dailyRate = dailyTier.daily_price_amount;
            
            return {
              extension_price: extensionPrice,
              totalPrice: extensionPrice,
              extension_hours: hours,
              extension_type: extensionType,
              extension_value: extensionValue,
              rental_id: rentalId,
              vehicle_name: rental.vehicle?.name || 'Unknown',
              price_source: 'auto', // FIXED: Always 'auto', tier info in tier_applied/tier_id
              tier_applied: tierApplied,
              tier_id: tierId,
              tierBreakdown: tierBreakdown,
              totalSavings: totalSavings,
              price_breakdown: `${extensionValue} day(s) × ${dailyRate} MAD/day = ${extensionPrice} MAD`,
              daily_rate: dailyRate,
              is_daily_tier: true,
              newEndDate: this.calculateNewEndDate(rental.rental_end_date, hours)
            };
          }
        }
        
        // If no daily tier found, get daily base price
        const baseDailyPrice = await this.getBaseDailyPrice(vehicleModelId);
        
        if (!baseDailyPrice) {
          throw new Error('Daily price not found for this vehicle model');
        }
        
        extensionPrice = baseDailyPrice * extensionValue;
        priceSource = 'auto'; // FIXED: Changed from 'daily_base' to 'auto'
        tierBreakdown = [{
          units: extensionValue,
          unit_type: 'days',
          rate: baseDailyPrice,
          discount: 0,
          subtotal: extensionPrice
        }];
        
        return {
          extension_price: extensionPrice,
          totalPrice: extensionPrice,
          extension_hours: hours,
          extension_type: extensionType,
          extension_value: extensionValue,
          rental_id: rentalId,
          vehicle_name: rental.vehicle?.name || 'Unknown',
          price_source: 'auto', // FIXED: Always 'auto', tier info in tier_applied/tier_id
          tier_applied: false,
          tierBreakdown: tierBreakdown,
          totalSavings: 0,
          price_breakdown: `${extensionValue} day(s) × ${baseDailyPrice} MAD/day = ${extensionPrice} MAD`,
          daily_rate: baseDailyPrice,
          is_daily_tier: false,
          newEndDate: this.calculateNewEndDate(rental.rental_end_date, hours)
        };
        
      } else {
        // Handle hourly extensions
        const hours = extensionValue;
        
        if (tierEnforcement.enabled) {
          const matchingTier = await this.findMatchingHourlyTier(vehicleModelId, hours);
          
          if (matchingTier) {
            // Use tier price
            extensionPrice = matchingTier.price_amount;
            priceSource = 'auto'; // FIXED: Changed from 'hourly_tier' to 'auto'
            tierId = matchingTier.id;
            tierApplied = true;
            
            // Calculate per-hour rate from tier
            const tierHourlyRate = matchingTier.price_amount / hours;
            
            // Calculate potential savings vs base hourly rate
            const baseHourlyRate = await this.getBaseHourlyPrice(vehicleModelId);
            if (baseHourlyRate && tierHourlyRate < baseHourlyRate) {
              totalSavings = (baseHourlyRate * hours) - extensionPrice;
            }
            
            tierBreakdown = [{
              units: hours,
              unit_type: 'hours',
              rate: tierHourlyRate,
              discount: matchingTier.discount_percentage || 0,
              subtotal: extensionPrice
            }];
            
            // Get hourly rate from tier
            hourlyRate = tierHourlyRate;
            
            return {
              extension_price: extensionPrice,
              totalPrice: extensionPrice,
              extension_hours: hours,
              hourly_rate: hourlyRate,
              extension_type: extensionType,
              extension_value: extensionValue,
              rental_id: rentalId,
              vehicle_name: rental.vehicle?.name || 'Unknown',
              price_source: 'auto', // FIXED: Always 'auto', tier info in tier_applied/tier_id
              tier_applied: tierApplied,
              tier_id: tierId,
              tierBreakdown: tierBreakdown,
              totalSavings: totalSavings,
              price_breakdown: `${extensionValue} hour(s) tier price = ${extensionPrice} MAD`,
              newEndDate: this.calculateNewEndDate(rental.rental_end_date, hours)
            };
          }
        }
        
        // If no tier found or tier enforcement disabled, use dynamic hourly rate
        hourlyRate = await this.getDynamicHourlyRate(rental);
        extensionPrice = await this.calculateDynamicExtensionPrice(hours, rental);
        
        tierBreakdown = [{
          units: hours,
          unit_type: 'hours',
          rate: hourlyRate,
          discount: 0,
          subtotal: extensionPrice
        }];
        
        return {
          extension_price: extensionPrice,
          totalPrice: extensionPrice,
          extension_hours: hours,
          hourly_rate: hourlyRate,
          extension_type: extensionType,
          extension_value: extensionValue,
          rental_id: rentalId,
          vehicle_name: rental.vehicle?.name || 'Unknown',
          price_source: 'auto', // FIXED: Changed from 'hourly_dynamic' to 'auto'
          tier_applied: false,
          tierBreakdown: tierBreakdown,
          totalSavings: 0,
          price_breakdown: `${extensionValue} hour(s) × ${hourlyRate} MAD/hour = ${extensionPrice} MAD`,
          newEndDate: this.calculateNewEndDate(rental.rental_end_date, hours)
        };
      }
      
    } catch (error) {
      console.error('❌ Error in calculateExtensionPrice:', error);
      throw error;
    }
  }

  /**
   * Get base daily price from base_prices table
   */
  static async getBaseDailyPrice(vehicleModelId) {
    try {
      const { data: basePrice, error } = await supabase
        .from('app_4c3a7a6153_base_prices')
        .select('daily_price')
        .eq('vehicle_model_id', vehicleModelId)
        .eq('is_active', true)
        .single();
      
      if (error || !basePrice?.daily_price) {
        return null;
      }
      
      return parseFloat(basePrice.daily_price);
    } catch {
      return null;
    }
  }

  /**
   * Get base hourly price from base_prices table
   */
  static async getBaseHourlyPrice(vehicleModelId) {
    try {
      const { data: basePrice, error } = await supabase
        .from('app_4c3a7a6153_base_prices')
        .select('hourly_price')
        .eq('vehicle_model_id', vehicleModelId)
        .eq('is_active', true)
        .single();
      
      if (error || !basePrice?.hourly_price) {
        return null;
      }
      
      return parseFloat(basePrice.hourly_price);
    } catch {
      return null;
    }
  }

  /**
   * Validate extension request and calculate price
   * Supports both tier-based pricing and dynamic hourly pricing
   */
  static async validateAndCalculateExtensionPrice(rentalId, hours, userId, autoApprove = false, overrideData = null) {
    try {
      
      // Only bypass validation for true client-side overrides such as manual/package pricing.
      if (overrideData?.bypassValidation && overrideData.extension_price > 0) {
        return await this.createExtensionFromOverride(rentalId, hours, userId, autoApprove, overrideData);
      }
      
      // 1. Get rental details including vehicle model
      const { data: rental, error: rentalError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .select(`
          *,
          vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(
            *,
            vehicle_model:saharax_0u4w4d_vehicle_models!vehicle_model_id(*)
          )
        `)
        .eq('id', rentalId)
        .single();
      
      if (rentalError) throw rentalError;
      
      const vehicleModelId = rental.vehicle?.vehicle_model?.id;
      if (!vehicleModelId) {
        throw new Error('Vehicle model not found for this rental');
      }
      
      // 2. Get tier enforcement settings
      const tierEnforcement = await this.getTierEnforcementSettings();
      
      // 3. If tier enforcement is disabled, use base price logic
      if (!tierEnforcement.enabled) {
        return await this.createExtensionWithBasePrice(rentalId, hours, userId, vehicleModelId, autoApprove, rental);
      }
      
      // 4. Check if this is a daily extension (multiple of 24 hours: 24, 48, 72, etc.)
      const isDailyExtension = hours >= 24 && hours % 24 === 0;
      const numberOfDays = hours / 24;
      
      if (isDailyExtension) {
        // Handle daily pricing - use daily tiers
        return await this.handleDailyExtension(rentalId, hours, userId, vehicleModelId, numberOfDays, autoApprove);
      }
      
      // 5. For hourly extensions: Find matching pricing tier
      const matchingTier = await this.findMatchingHourlyTier(vehicleModelId, hours);
      
      if (matchingTier) {
        
        // Use tier price
        return await this.createExtensionWithPrice(
          rentalId, 
          hours, 
          matchingTier.price_amount,
          userId,
          'hourly_tier',
          matchingTier.id,
          autoApprove,
          {
            extensionType: 'hours',
            extensionValue: hours,
            tierApplied: true
          }
        );
        
      } else {
        
        // No matching tier found - check available tiers to determine behavior
        const availableTiers = await this.getAvailableTiers(vehicleModelId);
        const validTiers = availableTiers.filter(t => t.min_hours != null && t.max_hours != null);
        
        // Find the minimum tier hours
        const minTierHours = validTiers.length > 0 
          ? Math.min(...validTiers.map(t => t.min_hours))
          : null;
        
        // If hours is less than the minimum tier, use hourly base rate
        // This allows 1-hour extensions even when tiers start at 2 hours
        if (minTierHours && hours < minTierHours) {
          return await this.createExtensionWithHourlyFallback(rentalId, hours, userId, vehicleModelId, autoApprove, rental);
        }
        
        // If tier enforcement is required and we're within tier range but no match
        if (tierEnforcement.requireTierForExtensions) {
          const tierList = validTiers.map(t => `${t.min_hours}-${t.max_hours}h (${t.price_amount} MAD)`).join(', ') || 'None';
          
          throw new Error(
            `❌ Extension not allowed. No pricing tier for ${hours} hours.\n\n` +
            `Available hourly tiers: ${tierList}\n\n` +
            `For daily rental (24h, 48h, 72h...), use a multiple of 24 hours.\n` +
            `Please choose a duration that matches available tiers or use daily increments.`
          );
          
        } else if (tierEnforcement.fallbackToHourly) {
          // Fallback to hourly rate
          return await this.createExtensionWithHourlyFallback(rentalId, hours, userId, vehicleModelId, autoApprove, rental);
          
        } else {
          // Neither require tier nor fallback - use base price logic
          return await this.createExtensionWithBasePrice(rentalId, hours, userId, vehicleModelId, autoApprove, rental);
        }
      }
      
    } catch (error) {
      console.error('❌ Extension validation error:', error);
      throw error;
    }
  }

  /**
   * Get tier enforcement settings from database
   */
  static async getTierEnforcementSettings() {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('tier_pricing_enabled, require_tier_for_extensions, fallback_to_hourly')
        .eq('id', 1)
        .limit(1);
      
      const row = Array.isArray(data) ? data[0] : null;

      if (error || !row) {
        return {
          enabled: true,
          requireTierForExtensions: true,
          fallbackToHourly: false
        };
      }
      
      return {
        enabled: row.tier_pricing_enabled ?? true,
        requireTierForExtensions: row.require_tier_for_extensions ?? true,
        fallbackToHourly: row.fallback_to_hourly ?? false
      };
    } catch {
      return {
        enabled: true,
        requireTierForExtensions: true,
        fallbackToHourly: false
      };
    }
  }

  /**
   * Find matching hourly tier for given hours
   */
  static async findMatchingHourlyTier(vehicleModelId, hours) {
    const { data: tiers, error } = await supabase
      .from('pricing_tiers')
      .select('*')
      .eq('vehicle_model_id', vehicleModelId)
      .eq('is_active', true)
      .eq('duration_type', 'hours')
      .not('min_hours', 'is', null)
      .not('max_hours', 'is', null);
    
    if (error || !tiers) return null;
    
    // Find tier where hours falls within min_hours and max_hours
    return tiers.find(tier => {
      const minHours = parseInt(tier.min_hours);
      const maxHours = parseInt(tier.max_hours);
      return hours >= minHours && hours <= maxHours;
    });
  }

  /**
   * Get all available tiers for a vehicle model
   */
  static async getAvailableTiers(vehicleModelId) {
    const { data: tiers, error } = await supabase
      .from('pricing_tiers')
      .select('*')
      .eq('vehicle_model_id', vehicleModelId)
      .eq('is_active', true);
    
    if (error) return [];
    return tiers || [];
  }

  /**
   * Handle daily extension pricing
   */
  static async handleDailyExtension(rentalId, hours, userId, vehicleModelId, numberOfDays, autoApprove) {
    // First try to find matching daily tier
    const dailyTier = await this.findMatchingDailyTier(vehicleModelId, numberOfDays);
    
    if (dailyTier) {
      // Use daily tier pricing
      const extensionPrice = dailyTier.daily_price_amount * numberOfDays;
      
      return await this.createExtensionWithPrice(
        rentalId,
        hours,
        extensionPrice,
        userId,
        'daily_tier',
        dailyTier.id,
        autoApprove,
        {
          extensionType: 'days',
          extensionValue: numberOfDays,
          tierApplied: true
        }
      );
    }
    
    // If no daily tier found, use base daily price
    const { data: basePrice, error } = await supabase
      .from('app_4c3a7a6153_base_prices')
      .select('daily_price')
      .eq('vehicle_model_id', vehicleModelId)
      .eq('is_active', true)
      .single();
    
    if (error || !basePrice?.daily_price) {
      throw new Error('Daily price not found for this vehicle model');
    }
    
    const extensionPrice = basePrice.daily_price * numberOfDays;
    
    return await this.createExtensionWithPrice(
      rentalId,
      hours,
      extensionPrice,
      userId,
      'daily_base',
      null,
      autoApprove,
      {
        extensionType: 'days',
        extensionValue: numberOfDays,
        tierApplied: false
      }
    );
  }

  /**
   * Create extension with base price logic (when tier enforcement is disabled)
   */
  static async createExtensionWithBasePrice(rentalId, hours, userId, vehicleModelId, autoApprove = false, rental = null) {
    // If rental object is provided, use dynamic pricing
    if (rental) {
      const extensionPrice = await this.calculateDynamicExtensionPrice(hours, rental);
      
      return await this.createExtensionWithPrice(
        rentalId, 
        hours, 
        extensionPrice,
        userId,
        'hourly_base',
        null,
        autoApprove,
        {
          extensionType: 'hours',
          extensionValue: hours,
          tierApplied: false
        }
      );
    }
    
    // Fallback: Get hourly price from base prices
    const { data: basePrice, error: basePriceError } = await supabase
      .from('app_4c3a7a6153_base_prices')
      .select('hourly_price')
      .eq('vehicle_model_id', vehicleModelId)
      .eq('is_active', true)
      .single();
    
    if (basePriceError || !basePrice?.hourly_price) {
      throw new Error('Cannot calculate extension price. Hourly rate not found.');
    }
    
    const hourlyPrice = basePrice.hourly_price;
    const extensionPrice = hourlyPrice * hours;
    
    return await this.createExtensionWithPrice(
      rentalId, 
      hours, 
      extensionPrice,
      userId,
      'hourly_base',
      null,
      autoApprove,
      {
        extensionType: 'hours',
        extensionValue: hours,
        tierApplied: false
      }
    );
  }

  /**
   * Create extension with hourly fallback (when no tier matches)
   */
  static async createExtensionWithHourlyFallback(rentalId, hours, userId, vehicleModelId, autoApprove = false, rental = null) {
    // If rental object is provided, use dynamic pricing
    if (rental) {
      const extensionPrice = await this.calculateDynamicExtensionPrice(hours, rental);
      
      return await this.createExtensionWithPrice(
        rentalId, 
        hours, 
        extensionPrice,
        userId,
        'hourly_base',
        null,
        autoApprove,
        {
          extensionType: 'hours',
          extensionValue: hours,
          tierApplied: false
        }
      );
    }
    
    // Fallback: Get hourly price from base prices
    const { data: basePrice, error: basePriceError } = await supabase
      .from('app_4c3a7a6153_base_prices')
      .select('hourly_price')
      .eq('vehicle_model_id', vehicleModelId)
      .eq('is_active', true)
      .single();
    
    if (basePriceError || !basePrice?.hourly_price) {
      throw new Error('Cannot calculate extension price. Hourly rate not found.');
    }
    
    const hourlyPrice = basePrice.hourly_price;
    const extensionPrice = hourlyPrice * hours;
    
    return await this.createExtensionWithPrice(
      rentalId, 
      hours, 
      extensionPrice,
      userId,
      'hourly_base',
      null,
      autoApprove,
      {
        extensionType: 'hours',
        extensionValue: hours,
        tierApplied: false
      }
    );
  }

  /**
   * Create extension record with calculated price
   */
  static async createExtensionFromOverride(rentalId, hours, userId, autoApprove, overrideData) {
    // Use the data exactly as provided by the modal (package pricing, manual, etc.)
    const extensionData = {
      ...overrideData,
      rental_id: rentalId,
      extension_hours: hours,
      requested_by: userId,
      requested_at: new Date().toISOString(),
      status: autoApprove ? 'approved' : 'pending',
    };

    if (autoApprove) {
      extensionData.approved_by = userId;
      extensionData.approved_at = new Date().toISOString();
    }

    // Remove fields that don't exist in DB schema
    delete extensionData.bypassValidation;
    delete extensionData.isPackage;
    delete extensionData.package_name_display;

    const { data: extension, error } = await supabase
      .from('rental_extensions')
      .insert(extensionData)
      .select()
      .single();

    if (error) throw error;

    if (autoApprove) {
      await this.applyExtensionToRental(rentalId, hours, overrideData.extension_price);
    }

    return {
      success: true,
      extension,
      price: overrideData.extension_price,
      priceSource: overrideData.price_source || 'override',
      hours,
      status: autoApprove ? 'approved' : 'pending'
    };
  }

  static async createExtensionWithPrice(
    rentalId,
    hours,
    price,
    userId,
    priceSource,
    tierId = null,
    autoApprove = false,
    options = {}
  ) {
    const extensionType = options.extensionType || (hours % 24 === 0 && hours >= 24 ? 'days' : 'hours');
    const extensionValue = options.extensionValue || (extensionType === 'days' ? hours / 24 : hours);
    const extensionData = {
      rental_id: rentalId,
      extension_hours: hours,
      extension_type: extensionType,
      extension_value: extensionValue,
      extension_price: price,
      price_source: priceSource,
      calculation_method: priceSource === 'manual' ? 'manual' : 'auto',
      tier_applied: options.tierApplied ?? Boolean(tierId),
      tier_id: tierId,
      status: autoApprove ? 'approved' : 'pending',
      requested_by: userId,
      requested_at: new Date().toISOString()
    };
    
    if (autoApprove) {
      extensionData.approved_by = userId;
      extensionData.approved_at = new Date().toISOString();
    }
    
    const { data: extension, error } = await supabase
      .from('rental_extensions')
      .insert(extensionData)
      .select()
      .single();
    
    if (error) throw error;
    
    // If auto-approved, also update the rental
    if (autoApprove) {
      await this.applyExtensionToRental(rentalId, hours, price);
    }
    
    return {
      success: true,
      extension,
      price,
      priceSource,
      hours,
      status: autoApprove ? 'approved' : 'pending'
    };
  }

  /**
   * Apply approved extension to rental
   */
  static async applyExtensionToRental(rentalId, hours, price) {
    // Get current rental
    const { data: rental, error: rentalError } = await supabase
      .from('app_4c3a7a6153_rentals')
      .select('*')
      .eq('id', rentalId)
      .single();
    
    if (rentalError) throw rentalError;
    
    // Calculate new end date
    const currentEndDate = new Date(rental.rental_end_date);
    const newEndDate = new Date(currentEndDate.getTime() + (hours * 60 * 60 * 1000));
    
    const newTotalAmount = (rental.total_amount || 0) + price;
    const newRemainingAmount = Math.max(0, newTotalAmount - (rental.deposit_amount || 0));

    let newQuantityHours = rental.quantity_hours || 0;
    let newQuantityDays = rental.quantity_days || 0;

    if (rental.rental_type === 'hourly') {
      newQuantityHours = (parseFloat(rental.quantity_hours) || 0) + hours;
      newQuantityDays = newQuantityHours;
    } else {
      const extensionDays = hours / 24;
      newQuantityDays = (parseFloat(rental.quantity_days) || 0) + extensionDays;
      newQuantityHours = newQuantityDays * 24;
    }

    const extensionSummary = await this.getApprovedExtensionSummary(rentalId);

    const updateData = {
      rental_end_date: newEndDate.toISOString(),
      actual_end_date: newEndDate.toISOString(),
      total_amount: newTotalAmount,
      remaining_amount: newRemainingAmount,
      payment_status: newRemainingAmount > 0 ? 'partial' : 'paid',
      quantity_hours: newQuantityHours,
      quantity_days: newQuantityDays,
      extension_count: extensionSummary.extensionCount,
      total_extended_hours: extensionSummary.totalExtendedHours,
      total_extension_price: extensionSummary.totalExtensionPrice,
      current_extension_id: extensionSummary.currentExtensionId,
      updated_at: new Date().toISOString()
    };
    
    const { error: updateError } = await supabase
      .from('app_4c3a7a6153_rentals')
      .update(updateData)
      .eq('id', rentalId);
    
    if (updateError) throw updateError;
    
    return true;
  }

  /**
   * Approve a pending extension
   */
  static async approveExtension(extensionId, approverId) {
    // Get extension details
    const { data: extension, error: extError } = await supabase
      .from('rental_extensions')
      .select('*')
      .eq('id', extensionId)
      .single();
    
    if (extError) throw extError;
    
    if (extension.status !== 'pending') {
      throw new Error('Extension is not pending approval');
    }
    
    // Update extension status
    const { error: updateError } = await supabase
      .from('rental_extensions')
      .update({
        status: 'approved',
        approved_by: approverId,
        approved_at: new Date().toISOString()
      })
      .eq('id', extensionId);
    
    if (updateError) throw updateError;
    
    // Apply extension to rental
    await this.applyExtensionToRental(
      extension.rental_id,
      extension.extension_hours,
      extension.extension_price
    );
    
    return { success: true, extension };
  }

  /**
   * Reject a pending extension
   */
  static async rejectExtension(extensionId, rejecterId, reason = null) {
    const { error } = await supabase
      .from('rental_extensions')
      .update({
        status: 'rejected',
        rejected_by: rejecterId,
        rejected_at: new Date().toISOString(),
        rejection_reason: reason
      })
      .eq('id', extensionId);
    
    if (error) throw error;
    
    return { success: true };
  }

  static async voidExtension(extensionId, voiderId, reason = null) {
    const { data: extension, error: extensionError } = await supabase
      .from('rental_extensions')
      .select('*')
      .eq('id', extensionId)
      .maybeSingle();

    if (extensionError) throw extensionError;
    if (!extension) {
      throw new Error('Extension not found');
    }

    if (!['approved', 'active', 'completed'].includes(String(extension.status || '').toLowerCase())) {
      throw new Error('Only approved extensions can be voided');
    }

    const payload = {
      status: 'voided',
      voided_by: voiderId || null,
      voided_at: new Date().toISOString(),
      void_reason: reason || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('rental_extensions')
      .update(payload)
      .eq('id', extensionId)
      .select('*')
      .single();

    if (error) throw error;

    return {
      success: true,
      extension: data || { ...extension, ...payload },
    };
  }

  /**
   * Get extension history for a rental
   */
  static async getExtensionHistory(rentalId) {
    const { data, error } = await supabase
      .from('rental_extensions')
      .select(`
        *,
        requester:requested_by(full_name, email),
        approver:approved_by(full_name, email)
      `)
      .eq('rental_id', rentalId)
      .order('requested_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  }

  /**
   * Get pending extensions for approval
   */
  static async getPendingExtensions() {
    const { data, error } = await supabase
      .from('rental_extensions')
      .select(`
        *,
        rental:rental_id(
          id,
          customer_name,
          vehicle:vehicle_id(name)
        ),
        requester:requested_by(full_name, email)
      `)
      .eq('status', 'pending')
      .order('requested_at', { ascending: true });
    
    if (error) throw error;
    return data || [];
  }

  /**
   * Get all extensions for a rental
   */
  static async getExtensionsByRental(rentalId) {
    try {
      const { data, error } = await supabase
        .from('rental_extensions')
        .select('*')
        .eq('rental_id', rentalId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      return { extensions: data || [] };
    } catch (error) {
      console.error('❌ Error fetching extensions:', error);
      return { extensions: [] };
    }
  }
}

export default ExtensionPricingService;
