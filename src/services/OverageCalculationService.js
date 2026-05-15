import { supabase } from '../lib/supabase';
import {
  scopeTenantOwnedQuery,
  verifyTenantOwnedRows,
} from './OrganizationService';

const RENTALS_TABLE = 'app_4c3a7a6153_rentals';
const VEHICLES_TABLE = 'saharax_0u4w4d_vehicles';
const PACKAGES_TABLE = 'app_4c3a7a6153_rental_km_packages';
const BASE_PRICES_TABLE = 'app_4c3a7a6153_base_prices';

export default class OverageCalculationService {
  static async scopeQuery(query, tableName, message) {
    return scopeTenantOwnedQuery(query, tableName, { message });
  }

  static async verifyRows(rows, tableName, message) {
    return verifyTenantOwnedRows(rows, tableName, { message });
  }

  /**
   * Automatically assign the appropriate kilometer package to a rental
   * @param {string} rentalId - The rental ID
   * @param {string} vehicleId - The vehicle ID
   * @returns {Promise<Object|null>} Updated rental data or null if no package found
   */
  static async assignPackageToRental(rentalId, vehicleId) {
    try {
      console.log('🔍 Assigning package to rental:', { rentalId, vehicleId });
      
      // Get vehicle details to find vehicle_model_id
      let vehicleQuery = supabase
        .from(VEHICLES_TABLE)
        .select('id, organization_id, vehicle_model_id, name')
        .eq('id', vehicleId);
      vehicleQuery = await this.scopeQuery(vehicleQuery, VEHICLES_TABLE, 'Workspace organization context is required to load overage vehicle details.');
      const { data: vehicle, error: vehicleError } = await vehicleQuery.single();
      
      if (vehicleError || !vehicle) {
        console.warn('⚠️ Vehicle not found or no model ID');
        return null;
      }
      await this.verifyRows(vehicle, VEHICLES_TABLE, 'Overage vehicle returned data outside the active workspace.');
      
      const vehicleModelId = vehicle.vehicle_model_id;
      
      // Find the most common/default package for this vehicle model
      let packageQuery = supabase
        .from(PACKAGES_TABLE)
        .select('*')
        .eq('vehicle_model_id', vehicleModelId)
        .eq('is_active', true)
        .order('included_kilometers', { ascending: true }); // Get smallest package first (most common)
      packageQuery = await this.scopeQuery(packageQuery, PACKAGES_TABLE, 'Workspace organization context is required to load rental packages.');
      const { data: packages, error: packageError } = await packageQuery;
      
      if (packageError || !packages || packages.length === 0) {
        console.warn('⚠️ No active packages found for vehicle model:', vehicleModelId);
        return null;
      }
      await this.verifyRows(packages, PACKAGES_TABLE, 'Rental packages returned data outside the active workspace.');
      
      // Use the first package (smallest included km, most common)
      const selectedPackage = packages[0];
      console.log('✅ Selected package:', selectedPackage);
      
      // Update rental with package info (DO NOT set unit_price here - will be set from base_prices table)
      let updateRentalQuery = supabase
        .from(RENTALS_TABLE)
        .update({
          package_id: selectedPackage.id,
          included_kilometers: selectedPackage.included_kilometers,
          extra_km_rate_applied: selectedPackage.extra_km_rate,
          // ✅ REMOVED: unit_price assignment - will be set from base_prices table
          updated_at: new Date().toISOString()
        })
        .eq('id', rentalId)
        .select('*');
      updateRentalQuery = await this.scopeQuery(updateRentalQuery, RENTALS_TABLE, 'Workspace organization context is required to assign rental packages.');
      const { data: updatedRental, error: updateError } = await updateRentalQuery.single();
      
      if (updateError) {
        console.error('❌ Failed to update rental with package:', updateError);
        throw updateError;
      }
      await this.verifyRows(updatedRental, RENTALS_TABLE, 'Updated rental returned data outside the active workspace.');
      
      console.log('✅ Package assigned successfully');
      return updatedRental;
      
    } catch (error) {
      console.error('❌ Error in assignPackageToRental:', error);
      throw error;
    }
  }

  /**
   * Update rental with ending odometer and calculate overage with CORRECT pricing
   * Automatically assigns package if not already assigned
   * Uses rental type price (daily/weekly/monthly) from base_prices table, NOT package base price
   * @param {string} rentalId - The rental ID
   * @param {number} endOdometer - The ending odometer reading
   * @returns {Promise<Object>} Result with rental data and overage info
   */
  static async updateRentalWithOdometer(rentalId, endOdometer) {
    try {
      console.log('📊 Updating rental with odometer:', { rentalId, endOdometer });
      
      // STEP 1: Get the rental with vehicle and package info
      let rentalQuery = supabase
        .from(RENTALS_TABLE)
        .select(`
          *,
          organization_id,
          vehicle:${VEHICLES_TABLE}!app_4c3a7a6153_rentals_vehicle_id_fkey(
            id,
            organization_id,
            name,
            model,
            vehicle_model_id,
            plate_number,
            vehicle_type,
            current_odometer,
            status
          )
        `)
        .eq('id', rentalId);
      rentalQuery = await this.scopeQuery(rentalQuery, RENTALS_TABLE, 'Workspace organization context is required to load rental overage details.');
      const { data: rentalData, error: fetchError } = await rentalQuery.single();
      
      if (fetchError) {
        console.error('❌ Error fetching rental:', fetchError);
        throw new Error(`Failed to fetch rental: ${fetchError.message}`);
      }
      await this.verifyRows(rentalData, RENTALS_TABLE, 'Rental overage details returned data outside the active workspace.');
      await this.verifyRows(rentalData?.vehicle || [], VEHICLES_TABLE, 'Rental overage vehicle returned data outside the active workspace.');
      
      // STEP 2: Assign package if not already assigned
      if (!rentalData.package_id && rentalData.vehicle_id) {
        console.log('📦 No package assigned, assigning now...');
        await this.assignPackageToRental(rentalId, rentalData.vehicle_id);
        
        // Refetch rental data after package assignment
        let refetchQuery = supabase
          .from(RENTALS_TABLE)
          .select(`
            *,
            organization_id,
            vehicle:${VEHICLES_TABLE}!app_4c3a7a6153_rentals_vehicle_id_fkey(
              id,
              organization_id,
              name,
              model,
              vehicle_model_id,
              plate_number,
              vehicle_type,
              current_odometer,
              status
            )
          `)
          .eq('id', rentalId);
        refetchQuery = await this.scopeQuery(refetchQuery, RENTALS_TABLE, 'Workspace organization context is required to reload rental overage details.');
        const { data: updatedRentalData } = await refetchQuery.single();
        
        if (updatedRentalData) {
          await this.verifyRows(updatedRentalData, RENTALS_TABLE, 'Reloaded rental overage details returned data outside the active workspace.');
          await this.verifyRows(updatedRentalData?.vehicle || [], VEHICLES_TABLE, 'Reloaded rental overage vehicle returned data outside the active workspace.');
          Object.assign(rentalData, updatedRentalData);
        }
      }
      
      // STEP 3: Get CORRECT base price from base_prices table based on rental type
      const vehicleModelId = rentalData.vehicle?.vehicle_model_id;
      let rentalTypePrice = rentalData.total_amount || 0; // Fallback to existing total
      
      if (vehicleModelId && rentalData.rental_type) {
        console.log('💰 Fetching rental type price:', { 
          vehicleModelId, 
          rentalType: rentalData.rental_type 
        });
        
        const priceColumn = String(rentalData.rental_type || '').toLowerCase().includes('day')
          ? 'daily_price'
          : 'hourly_price';
        let priceQuery = supabase
          .from(BASE_PRICES_TABLE)
          .select(`organization_id, ${priceColumn}`)
          .eq('vehicle_model_id', vehicleModelId)
          .eq('is_active', true);
        priceQuery = await this.scopeQuery(priceQuery, BASE_PRICES_TABLE, 'Workspace organization context is required to load rental overage base prices.');
        const { data: basePriceData, error: priceError } = await priceQuery.maybeSingle();
        
        if (!priceError && basePriceData?.[priceColumn]) {
          await this.verifyRows(basePriceData, BASE_PRICES_TABLE, 'Rental overage base price returned data outside the active workspace.');
          rentalTypePrice = parseFloat(basePriceData[priceColumn]);
          console.log('✅ Found rental type price:', rentalTypePrice, 'MAD');
        } else {
          console.warn('⚠️ No base price found for rental type, using existing total_amount:', rentalTypePrice);
        }
      } else {
        console.warn('⚠️ Missing vehicle model ID or rental type, using existing total_amount:', rentalTypePrice);
      }
      
      // STEP 4: Calculate distance and overage
      const startOdometer = parseFloat(rentalData.start_odometer || 0);
      const totalDistance = parseFloat(endOdometer) - startOdometer;
      const includedKilometers = parseFloat(rentalData.included_kilometers || 0);
      
      let overageCharge = 0;
      let hasOverage = false;
      
      if (totalDistance > includedKilometers && includedKilometers > 0) {
        const extraKms = totalDistance - includedKilometers;
        const extraKmRate = parseFloat(rentalData.extra_km_rate_applied || 0);
        overageCharge = extraKms * extraKmRate;
        hasOverage = true;
        
        console.log('💰 Overage calculated:', {
          totalDistance: totalDistance.toFixed(2),
          includedKilometers,
          extraKms: extraKms.toFixed(2),
          extraKmRate,
          overageCharge: overageCharge.toFixed(2)
        });
      } else {
        console.log('✅ No overage - within included kilometers');
      }
      
      // STEP 5: Calculate CORRECT total = rental type price + overage
      const correctTotal = rentalTypePrice + overageCharge;
      
      console.log('📊 Final calculation:', {
        rentalTypePrice: rentalTypePrice.toFixed(2),
        overageCharge: overageCharge.toFixed(2),
        correctTotal: correctTotal.toFixed(2)
      });
      
      // STEP 6: Update rental with correct values
      let updateQuery = supabase
        .from(RENTALS_TABLE)
        .update({
          ending_odometer: endOdometer,
          total_kilometers_driven: totalDistance,
          overage_charge: overageCharge,
          has_kilometer_overage: hasOverage,
          unit_price: rentalTypePrice, // ✅ CORRECT: Rental type price (e.g., 1500 MAD daily), not package price (400 MAD)
          total_amount: correctTotal, // ✅ CORRECT: Rental type price + overage
          updated_at: new Date().toISOString()
        })
        .eq('id', rentalId)
        .select('*');
      updateQuery = await this.scopeQuery(updateQuery, RENTALS_TABLE, 'Workspace organization context is required to update rental overage.');
      const { data, error } = await updateQuery.single();
      
      if (error) {
        console.error('❌ Error updating rental:', error);
        throw new Error(`Failed to update rental: ${error.message}`);
      }
      await this.verifyRows(data, RENTALS_TABLE, 'Updated overage rental returned data outside the active workspace.');
      
      console.log('✅ Rental updated successfully with correct pricing');
      
      // STEP 7: Update vehicle's current odometer
      if (rentalData.vehicle_id) {
        let vehicleUpdateQuery = supabase
          .from(VEHICLES_TABLE)
          .update({
            current_odometer: endOdometer,
            updated_at: new Date().toISOString()
          })
          .eq('id', rentalData.vehicle_id);
        vehicleUpdateQuery = await this.scopeQuery(vehicleUpdateQuery, VEHICLES_TABLE, 'Workspace organization context is required to update vehicle odometer.');
        await vehicleUpdateQuery;
        
        console.log('✅ Vehicle odometer updated');
      }
      
      return {
        success: true,
        rental: data,
        totalDistance,
        overageCharge,
        hasOverage,
        rentalTypePrice,
        correctTotal
      };
      
    } catch (error) {
      console.error('❌ Error in updateRentalWithOdometer:', error);
      throw error;
    }
  }

  /**
   * Calculate and apply overage for an existing rental with package
   * @param {string} rentalId - The rental ID
   * @returns {Promise<Object|null>} Updated rental data or null
   */
  static async calculateAndApplyOverage(rentalId) {
    try {
      console.log('📊 Calculating and applying overage for rental:', rentalId);
      
      // Fetch rental with package data
      let rentalQuery = supabase
        .from(RENTALS_TABLE)
        .select(`
          *,
          organization_id,
          package:${PACKAGES_TABLE}!package_id(*),
          vehicle:${VEHICLES_TABLE}!app_4c3a7a6153_rentals_vehicle_id_fkey(
            id,
            organization_id,
            name,
            model,
            vehicle_model_id,
            plate_number,
            vehicle_type,
            current_odometer,
            status
          )
        `)
        .eq('id', rentalId);
      rentalQuery = await this.scopeQuery(rentalQuery, RENTALS_TABLE, 'Workspace organization context is required to load rental overage details.');
      const { data: rental, error } = await rentalQuery.single();
      
      if (error) {
        console.error('❌ Error fetching rental:', error);
        throw new Error(`Failed to fetch rental: ${error.message}`);
      }
      await this.verifyRows(rental, RENTALS_TABLE, 'Rental overage details returned data outside the active workspace.');
      await this.verifyRows(rental?.vehicle || [], VEHICLES_TABLE, 'Rental overage vehicle returned data outside the active workspace.');
      await this.verifyRows(rental?.package || [], PACKAGES_TABLE, 'Rental overage package returned data outside the active workspace.');
      
      if (!rental.package) {
        console.warn('⚠️ No package found for rental:', rentalId);
        return null;
      }
      
      // Get CORRECT base price from base_prices table based on rental type
      const vehicleModelId = rental.vehicle?.vehicle_model_id;
      let rentalTypePrice = rental.total_amount || 0;
      
      if (vehicleModelId && rental.rental_type) {
        console.log('💰 Fetching rental type price:', { 
          vehicleModelId, 
          rentalType: rental.rental_type 
        });
        
        const priceColumn = String(rental.rental_type || '').toLowerCase().includes('day')
          ? 'daily_price'
          : 'hourly_price';
        let priceQuery = supabase
          .from(BASE_PRICES_TABLE)
          .select(`organization_id, ${priceColumn}`)
          .eq('vehicle_model_id', vehicleModelId)
          .eq('is_active', true);
        priceQuery = await this.scopeQuery(priceQuery, BASE_PRICES_TABLE, 'Workspace organization context is required to load rental overage base prices.');
        const { data: basePriceData, error: priceError } = await priceQuery.maybeSingle();
        
        if (!priceError && basePriceData?.[priceColumn]) {
          await this.verifyRows(basePriceData, BASE_PRICES_TABLE, 'Rental overage base price returned data outside the active workspace.');
          rentalTypePrice = parseFloat(basePriceData[priceColumn]);
          console.log('✅ Found rental type price:', rentalTypePrice, 'MAD');
        } else {
          console.warn('⚠️ No base price found, using existing total_amount:', rentalTypePrice);
        }
      }
      
      const packageData = rental.package;
      const totalDistance = parseFloat(rental.total_kilometers_driven || 0);
      const includedKm = parseFloat(packageData.included_kilometers || 0);
      const extraRate = parseFloat(packageData.extra_km_rate || 0);
      
      let overageCharge = 0;
      let finalAmount = rentalTypePrice; // Use rental type price, not package base price
      
      // Calculate overage if distance exceeds included kilometers
      if (totalDistance > includedKm && includedKm > 0) {
        overageCharge = (totalDistance - includedKm) * extraRate;
        finalAmount = rentalTypePrice + overageCharge; // Rental type price + overage
      }
      
      console.log('💰 Overage calculation:', {
        totalDistance: totalDistance.toFixed(2),
        includedKm,
        extraRate,
        rentalTypePrice: rentalTypePrice.toFixed(2),
        overageCharge: overageCharge.toFixed(2),
        finalAmount: finalAmount.toFixed(2)
      });
      
      // Update rental with overage calculation
      let updateQuery = supabase
        .from(RENTALS_TABLE)
        .update({
          overage_charge: overageCharge,
          total_amount: finalAmount,
          has_kilometer_overage: overageCharge > 0,
          unit_price: rentalTypePrice, // ✅ CORRECT: Rental type price, not package base price
          extra_km_rate_applied: extraRate,
          included_kilometers: includedKm,
          updated_at: new Date().toISOString()
        })
        .eq('id', rentalId)
        .select('*');
      updateQuery = await this.scopeQuery(updateQuery, RENTALS_TABLE, 'Workspace organization context is required to update rental overage.');
      const { data: updatedRental, error: updateError } = await updateQuery.single();
      
      if (updateError) {
        console.error('❌ Error updating rental:', updateError);
        throw new Error(`Failed to update rental: ${updateError.message}`);
      }
      await this.verifyRows(updatedRental, RENTALS_TABLE, 'Updated overage rental returned data outside the active workspace.');
      
      console.log('✅ Rental updated with overage');
      return updatedRental;
      
    } catch (error) {
      console.error('❌ Error in calculateAndApplyOverage:', error);
      throw error;
    }
  }
}
