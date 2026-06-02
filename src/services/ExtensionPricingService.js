import { supabase } from '../lib/supabase';
import {
  applyOrganizationScope,
  canReadFirstPartyLegacyNullOrgRows,
  isTenantOwnedSharedTable,
  matchTenantOwnedPayload,
  requireCurrentOrganizationId,
  scopeTenantOwnedQuery,
  shouldScopeSharedTenantData,
  verifyTenantOwnedRows,
} from './OrganizationService';

const RENTALS_TABLE = 'app_4c3a7a6153_rentals';
const VEHICLES_TABLE = 'saharax_0u4w4d_vehicles';
const BASE_PRICES_TABLE = 'app_4c3a7a6153_base_prices';
const PRICING_TIERS_TABLE = 'pricing_tiers';
const RENTAL_EXTENSIONS_TABLE = 'rental_extensions';

export class ExtensionPricingService {
  static formatActorName(actor) {
    return String(
      actor?.full_name ||
      actor?.fullName ||
      actor?.name ||
      actor?.display_name ||
      actor?.email ||
      ''
    ).trim();
  }

  static mergeActorMap(actorMap, rows = []) {
    rows.forEach((row) => {
      if (!row?.id) return;
      const name = this.formatActorName(row);
      if (name) actorMap.set(String(row.id), { ...row, full_name: name });
    });
  }

  static async safeLoadActorRows(tableName, ids = []) {
    if (!ids.length) return [];

    try {
      const { data, error } = await supabase
        .from(tableName)
        .select('id, full_name, email')
        .in('id', ids);

      if (error) {
        console.warn(`Unable to load ${tableName} actor names for rental extensions:`, error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.warn(`Unable to load ${tableName} actor names for rental extensions:`, error);
      return [];
    }
  }

  static async resolveCurrentSessionActorName(userId) {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data?.user || String(data.user.id) !== String(userId || '')) {
        return '';
      }
      return this.formatActorName({
        ...data.user.user_metadata,
        email: data.user.email || data.user.user_metadata?.email,
      });
    } catch {
      return '';
    }
  }

  static async hydrateExtensionActors(extensions = []) {
    const rows = Array.isArray(extensions) ? extensions : [];
    const actorIds = [...new Set(rows.flatMap((extension) => [
      extension?.requested_by,
      extension?.approved_by,
      extension?.rejected_by,
    ]).filter(Boolean).map(String))];

    if (!actorIds.length) return rows;

    const actorMap = new Map();
    this.mergeActorMap(actorMap, await this.safeLoadActorRows('users', actorIds));
    this.mergeActorMap(actorMap, await this.safeLoadActorRows('profiles', actorIds));

    return rows.map((extension) => {
      const requester = extension?.requester || actorMap.get(String(extension?.requested_by || '')) || null;
      const approver = extension?.approver || actorMap.get(String(extension?.approved_by || '')) || null;
      const rejecter = extension?.rejecter || actorMap.get(String(extension?.rejected_by || '')) || null;

      return {
        ...extension,
        requester,
        approver,
        rejecter,
        requested_by_name: extension?.requested_by_name || this.formatActorName(requester) || null,
        approved_by_name: extension?.approved_by_name || this.formatActorName(approver) || null,
        rejected_by_name: extension?.rejected_by_name || this.formatActorName(rejecter) || null,
      };
    });
  }

  static async scopeQuery(query, tableName, message) {
    return scopeTenantOwnedQuery(query, tableName, { message });
  }

  static async verifyRows(rows, tableName, message) {
    return verifyTenantOwnedRows(rows, tableName, { message });
  }

  static async assertRentalInActiveWorkspace(rentalId, message) {
    if (!shouldScopeSharedTenantData()) {
      return null;
    }

    return this.loadRentalWithVehicle(rentalId, message);
  }

  static async scopedMaybeSingle(query, tableName, message) {
    let scopedQuery = query;
    if (shouldScopeSharedTenantData() && isTenantOwnedSharedTable(tableName)) {
      const organizationId = await requireCurrentOrganizationId(message);
      scopedQuery = canReadFirstPartyLegacyNullOrgRows(tableName)
        ? scopedQuery.or(`organization_id.is.null,organization_id.eq.${organizationId}`)
        : applyOrganizationScope(scopedQuery, organizationId);
    }
    return scopedQuery.maybeSingle();
  }

  static async scopedSingle(query, tableName, message) {
    let scopedQuery = query;
    if (shouldScopeSharedTenantData() && isTenantOwnedSharedTable(tableName)) {
      const organizationId = await requireCurrentOrganizationId(message);
      scopedQuery = canReadFirstPartyLegacyNullOrgRows(tableName)
        ? scopedQuery.or(`organization_id.is.null,organization_id.eq.${organizationId}`)
        : applyOrganizationScope(scopedQuery, organizationId);
    }
    return scopedQuery.single();
  }

  static async loadRentalWithVehicle(rentalId) {
    let query = supabase
      .from(RENTALS_TABLE)
      .select(`
        *,
        organization_id,
        vehicle:${VEHICLES_TABLE}!app_4c3a7a6153_rentals_vehicle_id_fkey(
          *,
          vehicle_model:saharax_0u4w4d_vehicle_models!vehicle_model_id(*)
        )
      `)
      .eq('id', rentalId);

    const { data, error } = await this.scopedSingle(
      query,
      RENTALS_TABLE,
      'Workspace organization context is required to load rental extension details.'
    );
    if (error) throw error;

    await this.verifyRows(data, RENTALS_TABLE, 'Rental extension details returned data outside the active workspace.');
    await this.verifyRows(data?.vehicle || [], VEHICLES_TABLE, 'Rental extension vehicle returned data outside the active workspace.');

    return data;
  }

  static async getLatestVoidableExtension(rentalId) {
    let query = supabase
      .from(RENTAL_EXTENSIONS_TABLE)
      .select('*')
      .eq('rental_id', rentalId)
      .in('status', ['approved', 'active', 'completed'])
      .order('approved_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1);

    const { data, error } = await this.scopedMaybeSingle(
      query,
      RENTAL_EXTENSIONS_TABLE,
      'Workspace organization context is required to load rental extensions.'
    );

    if (error) throw error;
    await this.verifyRows(data || [], RENTAL_EXTENSIONS_TABLE, 'Rental extension returned data outside the active workspace.');
    return data || null;
  }

  static async getApprovedExtensionSummary(rentalId) {
    let query = supabase
      .from(RENTAL_EXTENSIONS_TABLE)
      .select('id, extension_hours, extension_price, status, created_at, approved_at')
      .eq('rental_id', rentalId)
      .eq('status', 'approved')
      .order('approved_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    query = await this.scopeQuery(query, RENTAL_EXTENSIONS_TABLE, 'Workspace organization context is required to load approved rental extensions.');
    const { data, error } = await query;
    if (error) throw error;
    await this.verifyRows(data || [], RENTAL_EXTENSIONS_TABLE, 'Approved rental extensions returned data outside the active workspace.');

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
      let query = supabase
        .from(BASE_PRICES_TABLE)
        .select('organization_id, hourly_price')
        .eq('vehicle_model_id', rental.vehicle.vehicle_model.id)
        .eq('is_active', true);

      const { data: priceData, error } = await this.scopedMaybeSingle(
        query,
        BASE_PRICES_TABLE,
        'Workspace organization context is required to load extension base prices.'
      );
      
      if (!error && priceData?.hourly_price) {
        await this.verifyRows(priceData, BASE_PRICES_TABLE, 'Extension base price returned data outside the active workspace.');
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
      if (shouldScopeSharedTenantData()) {
        throw new Error('Tenant hourly extension price is missing. Add an hourly base price before extending this rental.');
      }

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
    let query = supabase
      .from(PRICING_TIERS_TABLE)
      .select('*')
      .eq('vehicle_model_id', vehicleModelId)
      .eq('is_active', true)
      .eq('duration_type', 'days')
      .not('min_days', 'is', null)
      .not('max_days', 'is', null);

    query = await this.scopeQuery(query, PRICING_TIERS_TABLE, 'Workspace organization context is required to load daily pricing tiers.');
    const { data: tiers, error } = await query;
    
    if (error || !tiers) return null;
    await this.verifyRows(tiers, PRICING_TIERS_TABLE, 'Daily pricing tiers returned data outside the active workspace.');
    
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
      const rental = await this.loadRentalWithVehicle(rentalId);
      
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
      let query = supabase
        .from(BASE_PRICES_TABLE)
        .select('organization_id, daily_price')
        .eq('vehicle_model_id', vehicleModelId)
        .eq('is_active', true);
      const { data: basePrice, error } = await this.scopedMaybeSingle(
        query,
        BASE_PRICES_TABLE,
        'Workspace organization context is required to load daily base prices.'
      );
      
      if (error || !basePrice?.daily_price) {
        return null;
      }
      await this.verifyRows(basePrice, BASE_PRICES_TABLE, 'Daily base price returned data outside the active workspace.');
      
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
      let query = supabase
        .from(BASE_PRICES_TABLE)
        .select('organization_id, hourly_price')
        .eq('vehicle_model_id', vehicleModelId)
        .eq('is_active', true);
      const { data: basePrice, error } = await this.scopedMaybeSingle(
        query,
        BASE_PRICES_TABLE,
        'Workspace organization context is required to load hourly base prices.'
      );
      
      if (error || !basePrice?.hourly_price) {
        return null;
      }
      await this.verifyRows(basePrice, BASE_PRICES_TABLE, 'Hourly base price returned data outside the active workspace.');
      
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
      const rental = await this.loadRentalWithVehicle(rentalId);
      
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
    if (shouldScopeSharedTenantData()) {
      return {
        enabled: true,
        requireTierForExtensions: true,
        fallbackToHourly: false
      };
    }

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
    let query = supabase
      .from(PRICING_TIERS_TABLE)
      .select('*')
      .eq('vehicle_model_id', vehicleModelId)
      .eq('is_active', true)
      .eq('duration_type', 'hours')
      .not('min_hours', 'is', null)
      .not('max_hours', 'is', null);

    query = await this.scopeQuery(query, PRICING_TIERS_TABLE, 'Workspace organization context is required to load hourly pricing tiers.');
    const { data: tiers, error } = await query;
    
    if (error || !tiers) return null;
    await this.verifyRows(tiers, PRICING_TIERS_TABLE, 'Hourly pricing tiers returned data outside the active workspace.');
    
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
    let query = supabase
      .from(PRICING_TIERS_TABLE)
      .select('*')
      .eq('vehicle_model_id', vehicleModelId)
      .eq('is_active', true);

    query = await this.scopeQuery(query, PRICING_TIERS_TABLE, 'Workspace organization context is required to load available pricing tiers.');
    const { data: tiers, error } = await query;
    
    if (error) return [];
    await this.verifyRows(tiers || [], PRICING_TIERS_TABLE, 'Available pricing tiers returned data outside the active workspace.');
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
    let basePriceQuery = supabase
      .from(BASE_PRICES_TABLE)
      .select('organization_id, daily_price')
      .eq('vehicle_model_id', vehicleModelId)
      .eq('is_active', true);

    const { data: basePrice, error } = await this.scopedMaybeSingle(
      basePriceQuery,
      BASE_PRICES_TABLE,
      'Workspace organization context is required to load daily base prices.'
    );
    
    if (error || !basePrice?.daily_price) {
      throw new Error('Daily price not found for this vehicle model');
    }
    await this.verifyRows(basePrice, BASE_PRICES_TABLE, 'Daily base price returned data outside the active workspace.');
    
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
    let basePriceQuery = supabase
      .from(BASE_PRICES_TABLE)
      .select('organization_id, hourly_price')
      .eq('vehicle_model_id', vehicleModelId)
      .eq('is_active', true);

    const { data: basePrice, error: basePriceError } = await this.scopedMaybeSingle(
      basePriceQuery,
      BASE_PRICES_TABLE,
      'Workspace organization context is required to load hourly base prices.'
    );
    
    if (basePriceError || !basePrice?.hourly_price) {
      throw new Error('Cannot calculate extension price. Hourly rate not found.');
    }
    await this.verifyRows(basePrice, BASE_PRICES_TABLE, 'Hourly base price returned data outside the active workspace.');
    
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
    let basePriceQuery = supabase
      .from(BASE_PRICES_TABLE)
      .select('organization_id, hourly_price')
      .eq('vehicle_model_id', vehicleModelId)
      .eq('is_active', true);

    const { data: basePrice, error: basePriceError } = await this.scopedMaybeSingle(
      basePriceQuery,
      BASE_PRICES_TABLE,
      'Workspace organization context is required to load hourly base prices.'
    );
    
    if (basePriceError || !basePrice?.hourly_price) {
      throw new Error('Cannot calculate extension price. Hourly rate not found.');
    }
    await this.verifyRows(basePrice, BASE_PRICES_TABLE, 'Hourly base price returned data outside the active workspace.');
    
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
    const actorName = String(overrideData?.requested_by_name || await this.resolveCurrentSessionActorName(userId) || '').trim();
    // Use the data exactly as provided by the modal (package pricing, manual, etc.)
    const extensionData = {
      ...overrideData,
      rental_id: rentalId,
      extension_hours: hours,
      requested_by: userId,
      requested_by_name: actorName || null,
      requested_at: new Date().toISOString(),
      status: autoApprove ? 'approved' : 'pending',
    };

    if (autoApprove) {
      extensionData.approved_by = userId;
      extensionData.approved_by_name = String(overrideData?.approved_by_name || actorName || '').trim() || null;
      extensionData.approved_at = new Date().toISOString();
    }

    // Remove fields that don't exist in DB schema
    delete extensionData.bypassValidation;
    delete extensionData.isPackage;
    delete extensionData.package_name_display;

    const scopedExtensionData = await matchTenantOwnedPayload(
      extensionData,
      RENTAL_EXTENSIONS_TABLE,
      { message: 'Workspace organization context is required to create rental extensions.' }
    );

    const { data: extension, error } = await supabase
      .from(RENTAL_EXTENSIONS_TABLE)
      .insert(scopedExtensionData)
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
    const actorName = String(options.requestedByName || await this.resolveCurrentSessionActorName(userId) || '').trim();
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
      requested_by_name: actorName || null,
      requested_at: new Date().toISOString()
    };
    
    if (autoApprove) {
      extensionData.approved_by = userId;
      extensionData.approved_by_name = String(options.approvedByName || actorName || '').trim() || null;
      extensionData.approved_at = new Date().toISOString();
    }
    
    const scopedExtensionData = await matchTenantOwnedPayload(
      extensionData,
      RENTAL_EXTENSIONS_TABLE,
      { message: 'Workspace organization context is required to create rental extensions.' }
    );

    const { data: extension, error } = await supabase
      .from(RENTAL_EXTENSIONS_TABLE)
      .insert(scopedExtensionData)
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
    let rentalQuery = supabase
      .from(RENTALS_TABLE)
      .select('*')
      .eq('id', rentalId);
    const { data: rental, error: rentalError } = await this.scopedSingle(
      rentalQuery,
      RENTALS_TABLE,
      'Workspace organization context is required to apply rental extensions.'
    );
    
    if (rentalError) throw rentalError;
    await this.verifyRows(rental, RENTALS_TABLE, 'Rental extension apply returned data outside the active workspace.');
    
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
    
    let updateQuery = supabase
      .from(RENTALS_TABLE)
      .update(updateData)
      .eq('id', rentalId);
    updateQuery = await this.scopeQuery(updateQuery, RENTALS_TABLE, 'Workspace organization context is required to update rental extensions.');
    const { error: updateError } = await updateQuery;
    
    if (updateError) throw updateError;
    
    return true;
  }

  /**
   * Approve a pending extension
   */
  static async approveExtension(extensionId, approverId) {
    // Get extension details
    let extensionQuery = supabase
      .from('rental_extensions')
      .select('*')
      .eq('id', extensionId);

    const { data: extension, error: extError } = await this.scopedSingle(
      extensionQuery,
      RENTAL_EXTENSIONS_TABLE,
      'Workspace organization context is required to approve rental extensions.'
    );
    
    if (extError) throw extError;
    
    if (extension.status !== 'pending') {
      throw new Error('Extension is not pending approval');
    }

    await this.assertRentalInActiveWorkspace(
      extension.rental_id,
      'Workspace organization context is required to approve rental extensions.'
    );
    
    const approverName = await this.resolveCurrentSessionActorName(approverId);

    // Update extension status
    const { error: updateError } = await supabase
      .from('rental_extensions')
      .update({
        status: 'approved',
        approved_by: approverId,
        approved_by_name: approverName || null,
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
  static async rejectExtension(extensionId, rejecterId, reason = null, rejecterName = null) {
    const { data: extension, error: extensionError } = await supabase
      .from('rental_extensions')
      .select('rental_id')
      .eq('id', extensionId)
      .maybeSingle();

    if (extensionError) throw extensionError;
    if (!extension) {
      throw new Error('Extension not found');
    }

    await this.assertRentalInActiveWorkspace(
      extension.rental_id,
      'Workspace organization context is required to reject rental extensions.'
    );

    const rejectionNote = String(reason || '').trim();
    const updatePayload = {
      status: 'rejected',
      rejected_by: rejecterId || null,
      rejected_by_name: String(rejecterName || '').trim() || null,
      updated_at: new Date().toISOString()
    };

    if (rejectionNote) {
      updatePayload.notes = rejectionNote;
    }

    const { error } = await supabase
      .from('rental_extensions')
      .update(updatePayload)
      .eq('id', extensionId);
    
    if (error) throw error;
    
    return { success: true };
  }

  static async voidExtension(extensionId, voiderId, reason = null) {
    let extensionQuery = supabase
      .from('rental_extensions')
      .select('*')
      .eq('id', extensionId);

    const { data: extension, error: extensionError } = await this.scopedMaybeSingle(
      extensionQuery,
      RENTAL_EXTENSIONS_TABLE,
      'Workspace organization context is required to void rental extensions.'
    );

    if (extensionError) throw extensionError;
    if (!extension) {
      throw new Error('Extension not found');
    }

    if (!['approved', 'active', 'completed'].includes(String(extension.status || '').toLowerCase())) {
      throw new Error('Only approved extensions can be voided');
    }

    await this.assertRentalInActiveWorkspace(
      extension.rental_id,
      'Workspace organization context is required to void rental extensions.'
    );

    const payload = {
      status: 'voided',
      voided_by: voiderId || null,
      voided_at: new Date().toISOString(),
      void_reason: reason || null,
      updated_at: new Date().toISOString(),
    };

    let updateQuery = supabase
      .from('rental_extensions')
      .update(payload)
      .eq('id', extensionId)
      .select('*');

    const { data, error } = await this.scopedSingle(
      updateQuery,
      RENTAL_EXTENSIONS_TABLE,
      'Workspace organization context is required to void rental extensions.'
    );

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
      .select('*')
      .eq('rental_id', rentalId)
      .order('requested_at', { ascending: false });

    if (error) throw error;
    return this.hydrateExtensionActors(data || []);
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
