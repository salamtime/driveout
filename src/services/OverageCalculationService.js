import { supabase } from '../lib/supabase';

export default class OverageCalculationService {
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
      const { data: vehicle, error: vehicleError } = await supabase
        .from('saharax_0u4w4d_vehicles')
        .select('vehicle_model_id, name')
        .eq('id', vehicleId)
        .single();
      
      if (vehicleError || !vehicle) {
        console.warn('⚠️ Vehicle not found or no model ID');
        return null;
      }
      
      const vehicleModelId = vehicle.vehicle_model_id;
      
      // Find the most common/default package for this vehicle model
      const { data: packages, error: packageError } = await supabase
        .from('rental_packages')
        .select('*')
        .eq('vehicle_model_id', vehicleModelId)
        .eq('is_active', true)
        .order('included_kilometers', { ascending: true }); // Get smallest package first (most common)
      
      if (packageError || !packages || packages.length === 0) {
        console.warn('⚠️ No active packages found for vehicle model:', vehicleModelId);
        return null;
      }
      
      // Use the first package (smallest included km, most common)
      const selectedPackage = packages[0];
      console.log('✅ Selected package:', selectedPackage);
      
      // Update rental with package info (DO NOT set unit_price here - will be set from base_prices table)
      const { data: updatedRental, error: updateError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update({
          package_id: selectedPackage.id,
          included_kilometers: selectedPackage.included_kilometers,
          extra_km_rate_applied: selectedPackage.extra_km_rate,
          // ✅ REMOVED: unit_price assignment - will be set from base_prices table
          updated_at: new Date().toISOString()
        })
        .eq('id', rentalId)
        .select('*')
        .single();
      
      if (updateError) {
        console.error('❌ Failed to update rental with package:', updateError);
        throw updateError;
      }
      
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
      const { data: rentalData, error: fetchError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .select(`
          *,
          vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(
            id,
            name,
            model,
            vehicle_model_id,
            plate_number,
            vehicle_type,
            current_odometer,
            status
          )
        `)
        .eq('id', rentalId)
        .single();
      
      if (fetchError) {
        console.error('❌ Error fetching rental:', fetchError);
        throw new Error(`Failed to fetch rental: ${fetchError.message}`);
      }
      
      // STEP 2: Assign package if not already assigned
      if (!rentalData.package_id && rentalData.vehicle_id) {
        console.log('📦 No package assigned, assigning now...');
        await this.assignPackageToRental(rentalId, rentalData.vehicle_id);
        
        // Refetch rental data after package assignment
        const { data: updatedRentalData } = await supabase
          .from('app_4c3a7a6153_rentals')
          .select(`
            *,
            vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(
              id,
              name,
              model,
              vehicle_model_id,
              plate_number,
              vehicle_type,
              current_odometer,
              status
            )
          `)
          .eq('id', rentalId)
          .single();
        
        if (updatedRentalData) {
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
        
        const { data: basePriceData, error: priceError } = await supabase
          .from('app_8be2ccb1f0_base_prices')
          .select('base_price')
          .eq('vehicle_model_id', vehicleModelId)
          .eq('rental_type', rentalData.rental_type)
          .single();
        
        if (!priceError && basePriceData) {
          rentalTypePrice = parseFloat(basePriceData.base_price);
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
      const { data, error } = await supabase
        .from('app_4c3a7a6153_rentals')
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
        .select('*')
        .single();
      
      if (error) {
        console.error('❌ Error updating rental:', error);
        throw new Error(`Failed to update rental: ${error.message}`);
      }
      
      console.log('✅ Rental updated successfully with correct pricing');
      
      // STEP 7: Update vehicle's current odometer
      if (rentalData.vehicle_id) {
        await supabase
          .from('saharax_0u4w4d_vehicles')
          .update({
            current_odometer: endOdometer,
            updated_at: new Date().toISOString()
          })
          .eq('id', rentalData.vehicle_id);
        
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
      const { data: rental, error } = await supabase
        .from('app_4c3a7a6153_rentals')
        .select(`
          *,
          package:rental_packages(*),
          vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(
            id,
            name,
            model,
            vehicle_model_id,
            plate_number,
            vehicle_type,
            current_odometer,
            status
          )
        `)
        .eq('id', rentalId)
        .single();
      
      if (error) {
        console.error('❌ Error fetching rental:', error);
        throw new Error(`Failed to fetch rental: ${error.message}`);
      }
      
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
        
        const { data: basePriceData, error: priceError } = await supabase
          .from('app_8be2ccb1f0_base_prices')
          .select('base_price')
          .eq('vehicle_model_id', vehicleModelId)
          .eq('rental_type', rental.rental_type)
          .single();
        
        if (!priceError && basePriceData) {
          rentalTypePrice = parseFloat(basePriceData.base_price);
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
      const { data: updatedRental, error: updateError } = await supabase
        .from('app_4c3a7a6153_rentals')
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
        .select('*')
        .single();
      
      if (updateError) {
        console.error('❌ Error updating rental:', updateError);
        throw new Error(`Failed to update rental: ${updateError.message}`);
      }
      
      console.log('✅ Rental updated with overage');
      return updatedRental;
      
    } catch (error) {
      console.error('❌ Error in calculateAndApplyOverage:', error);
      throw error;
    }
  }
}