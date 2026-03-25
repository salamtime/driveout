import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { formatMaintenanceReference } from '../utils/maintenanceReference';

const getRentalKilometerPackage = (rental) => {
  const pkg = rental?.package;
  if (!pkg) return null;

  const hasLinkedPackage = Boolean(rental?.package_id || pkg?.id);
  const hasKmConfig =
    pkg.included_kilometers !== null && pkg.included_kilometers !== undefined ||
    pkg.extra_km_rate !== null && pkg.extra_km_rate !== undefined;

  return hasLinkedPackage && hasKmConfig ? pkg : null;
};

const ReceiptTemplate = ({ rental, logoUrl, stampUrl }) => {
  if (!rental) return <div className="p-10 text-center">No rental data available.</div>;

  const [basePrices, setBasePrices] = useState([]);
  const [loadingPrices, setLoadingPrices] = useState(true);
  
  // Fetch base prices from database
  useEffect(() => {
    const loadBasePrices = async () => {
      try {
        const { data, error } = await supabase
          .from('app_4c3a7a6153_base_prices')
          .select('*')
          .eq('is_active', true);
        
        if (error) {
          console.error('❌ Error loading base prices:', error);
        } else {
          setBasePrices(data || []);
        }
      } catch (error) {
        console.error('❌ Exception loading base prices:', error);
      } finally {
        setLoadingPrices(false);
      }
    };

    loadBasePrices();
  }, []);

  // Data Fetching logic
  const vehicleName = rental.vehicle?.name || rental.vehicle_details?.name || "N/A";
  const plateNumber = rental.vehicle?.plate_number || rental.vehicle_details?.plate_number || "N/A";
  const vehicleModelId = rental.vehicle?.vehicle_model?.id || rental.vehicle?.vehicle_model_id;
  
  // Check if rental has a package
  const kilometerPackage = getRentalKilometerPackage(rental);
  const hasPackage = !!kilometerPackage;

  // Enhanced package breakdown calculation
  const packageBreakdown = React.useMemo(() => {
    if (!hasPackage || !rental) return null;
    
    const pkg = kilometerPackage;
    if (!pkg) return null;
    
    const isHourly = rental.rental_type === 'hourly';
    const isDaily = rental.rental_type === 'daily';
    
    const duration = rental.quantity_hours || rental.quantity_days || 1;
    const ratePerUnit = parseFloat(pkg.fixed_amount) || rental.unit_price || 0;
    const packageTotal = ratePerUnit * duration;
    const includedKm = pkg.included_kilometers ? parseFloat(pkg.included_kilometers) : null;
    const extraRate = parseFloat(pkg.extra_km_rate) || 0;
    const totalIncludedKm = includedKm ? includedKm * duration : null;
    
    return {
      name: pkg.name || 'Kilometer Package',
      ratePerUnit,
      duration,
      packageTotal,
      includedKm,
      totalIncludedKm,
      extraRate,
      isHourly,
      isDaily,
      description: pkg.description
    };
  }, [rental, hasPackage, kilometerPackage]);

  // Enhanced tier pricing breakdown calculation (only shown when no package)
  const tierPricingBreakdown = React.useMemo(() => {
    if (hasPackage || !rental) return null;
    
    // Determine if hourly or daily
    const isHourly = rental.rental_type === 'hourly';
    const isDaily = rental.rental_type === 'daily';
    
    if (!isHourly && !isDaily) return null;
    
    const duration = rental.quantity_hours || rental.quantity_days || 1;
    const tierRate = rental.unit_price || 0;
    
    const getStandardRate = () => {
      let standardRate = 0;
      let priceSource = 'fallback';
      
      if (vehicleModelId && basePrices.length > 0) {
        const basePrice = basePrices.find(price => price.vehicle_model_id === vehicleModelId);
        if (basePrice) {
          if (isHourly && basePrice.hourly_price > 0) {
            standardRate = parseFloat(basePrice.hourly_price);
            priceSource = 'database';
          } else if (isDaily && basePrice.daily_price > 0) {
            standardRate = parseFloat(basePrice.daily_price);
            priceSource = 'database';
          }
        }
      }
      
      if (standardRate === 0) {
        if (isHourly && rental.vehicle?.hourly_rate) {
          standardRate = parseFloat(rental.vehicle.hourly_rate);
          priceSource = 'vehicle_rate';
        } else if (isDaily && rental.vehicle?.daily_rate) {
          standardRate = parseFloat(rental.vehicle.daily_rate);
          priceSource = 'vehicle_rate';
        }
      }
      
      if (standardRate === 0) {
        const vehicleNameUpper = vehicleName.toUpperCase();
        if (vehicleNameUpper.includes('SEGWAY') || vehicleNameUpper.includes('AT6')) {
          standardRate = isHourly ? 600 : 1300;
        } else if (vehicleNameUpper.includes('AT5')) {
          standardRate = isHourly ? 400 : 900;
        } else if (vehicleNameUpper.includes('AT10')) {
          standardRate = isHourly ? 1000 : 1800;
        } else {
          standardRate = isHourly ? 400 : 800;
        }
        priceSource = 'fallback';
      }
      
      return { rate: standardRate, source: priceSource };
    };
    
    const { rate: standardRate, source: priceSource } = getStandardRate();
    
    if (standardRate <= 0 || tierRate <= 0) return null;
    
    const standardTotal = duration * standardRate;
    const tierTotal = duration * tierRate;
    const savings = Math.max(0, standardTotal - tierTotal);
    const savingsPercentage = standardTotal > 0 ? ((savings / standardTotal) * 100).toFixed(1) : 0;
    const isDiscounted = savings > 0;
    
    const getTierDescription = () => {
      if (isHourly) {
        if (duration === 1) return "1-hour standard rate";
        if (duration === 2) return "2-hour special rate";
        if (duration === 3) return "3-hour package deal";
        if (duration >= 4 && duration <= 6) return "4-6 hour bundle";
        if (duration >= 24) return "Daily package (24h)";
        return `${duration}-hour package`;
      } else {
        if (duration === 1) return "1-day standard rate";
        if (duration === 2) return "2-day special rate";
        if (duration === 3) return "3-day package deal";
        if (duration >= 7) return "Weekly package";
        return `${duration}-day package`;
      }
    };
    
    return {
      vehicleName: vehicleName,
      duration: duration,
      standardRate: standardRate,
      tierRate: tierRate,
      standardTotal: standardTotal,
      tierTotal: tierTotal,
      savings: savings,
      savingsPercentage: savingsPercentage,
      isDiscounted: isDiscounted,
      tierDescription: getTierDescription(),
      isSamePrice: savings === 0,
      source: priceSource,
      isHourly: isHourly,
      isDaily: isDaily
    };
  }, [rental, vehicleName, vehicleModelId, basePrices, hasPackage]);

  const effectiveFuelCharge = rental.fuel_charge_enabled === false ? 0 : (rental.fuel_charge || 0);

  // Calculate total amount - FIXED: base price must be rate × duration, not just unit_price
  const calculateTotal = (overageAmount = 0) => {
    const pkg = kilometerPackage;
    const ratePerUnit = pkg ? (parseFloat(pkg.fixed_amount) || rental.unit_price || 0) : (rental.unit_price || 0);
    const duration = rental.rental_type === 'hourly'
      ? (rental.quantity_hours ?? rental.quantity_days ?? 1)
      : (rental.quantity_days ?? 1);
    const basePrice = ratePerUnit * duration;
    const overage = pkg ? (rental.overage_charge || overageAmount || 0) : 0;
    const extensions = rental.extensions?.reduce((sum, ext) => 
      ext.status === 'approved' ? sum + (ext.extension_price || 0) : sum, 0) || 0;
    const fuel = effectiveFuelCharge; // applies to both hourly and daily
    const linkedVehicleReport = rental.vehicleReport || rental.vehicle_report || null;
    const maintenanceCharge = linkedVehicleReport?.customer_chargeable
      ? Number(linkedVehicleReport.customer_charge_amount || linkedVehicleReport.maintenance_cost_total || linkedVehicleReport?.maintenance?.cost || 0)
      : 0;
    return basePrice + overage + extensions + fuel + maintenanceCharge;
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'decimal',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  // Calculate overage details - Single source of truth
  const calculateOverageDetails = () => {
    if (!rental) return { hasOverage: false, extraKm: 0, overageCharge: 0, includedKm: 0, rate: 0, totalKm: 0 };
    
    const pkg = kilometerPackage;
    if (!pkg) {
      return { hasOverage: false, extraKm: 0, overageCharge: 0, includedKm: 0, rate: 0, totalKm: 0 };
    }

    const includedKm = rental.included_kilometers_applied ||
                       pkg.included_kilometers ||
                       0;
    const rate = rental.extra_km_rate_applied ||
                 pkg.extra_km_rate ||
                 0;
    
    const totalKm = rental.total_kilometers_driven || 
                    (rental.ending_odometer && rental.start_odometer ? 
                     rental.ending_odometer - rental.start_odometer : 0);
    
    const extraKm = Math.max(0, totalKm - includedKm);
    const overageCharge = extraKm * rate;
    
    return {
      hasOverage: overageCharge > 0,
      extraKm,
      overageCharge,
      includedKm,
      rate,
      totalKm
    };
  };

  const overageDetails = calculateOverageDetails();
  const totalAmount = calculateTotal(overageDetails.overageCharge);

  const isPaid = rental.payment_status === 'paid';
  const hasOverage = hasPackage && (rental.overage_charge > 0 || overageDetails.hasOverage);
  const hasFuelCharge = effectiveFuelCharge > 0;
  const damageDeposit = parseFloat(rental?.damage_deposit || 0);
  const linkedVehicleReport = rental.vehicleReport || rental.vehicle_report || null;
  const linkedMaintenance = linkedVehicleReport?.maintenance || null;
  const maintenanceChargeAmount = linkedVehicleReport?.customer_chargeable
    ? Number(linkedVehicleReport.customer_charge_amount || linkedVehicleReport.maintenance_cost_total || linkedMaintenance?.cost || 0)
    : 0;
  const maintenanceStayCharge = Number(linkedVehicleReport?.maintenance_daily_total || 0);
  const maintenanceStayDiscount = Number(linkedVehicleReport?.maintenance_daily_discount || 0);
  const maintenanceStayDays = Number(linkedVehicleReport?.maintenance_daily_days || 0);
  const maintenanceStayRate = Number(linkedVehicleReport?.maintenance_daily_rate || 0);
  const maintenanceSummaryItems = linkedMaintenance
    ? [...new Set([
        linkedMaintenance.maintenance_type || null,
        ...((Array.isArray(linkedMaintenance.parts_used) ? linkedMaintenance.parts_used : [])
          .map((part) => part.item_name || part.part_name)
          .filter(Boolean)
          .slice(0, 4))
      ].filter(Boolean))]
    : [];
  
  // Fuel data
  const startFuel = rental.start_fuel_level !== null ? rental.start_fuel_level : null;
  const endFuel = rental.end_fuel_level !== null ? rental.end_fuel_level : null;
  const fuelDeficit = (startFuel !== null && endFuel !== null) ? startFuel - endFuel : 0;
  const fuelPricePerLine = rental.vehicle?.vehicle_model?.fuel_price || 0;

  const safeFormatId = (id) => {
    if (!id) return 'N/A';
    if (typeof id === 'string') {
      return id.toUpperCase();
    }
    return String(id);
  };

  // Package Display Component (shown when package exists)
  const PackageDisplay = ({ breakdown }) => {
    if (!breakdown) return null;

    const unit = breakdown.isHourly ? 'hour' : 'day';
    const unitPlural = breakdown.isHourly ? 'hours' : 'days';

    return (
      <div style={{
        marginTop: '24px',
        marginBottom: '24px',
        padding: '20px',
        background: 'linear-gradient(135deg, #9F7AEA 0%, #6B46C1 100%)',
        borderRadius: '16px',
        boxShadow: '0 10px 30px rgba(159, 122, 234, 0.2)'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '20px',
          paddingBottom: '16px',
          borderBottom: '2px solid rgba(255, 255, 255, 0.2)'
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <svg style={{ width: '24px', height: '24px', color: 'white' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <h4 style={{
              fontSize: '18px',
              fontWeight: 'bold',
              color: 'white',
              margin: 0
            }}>
              Selected Package
            </h4>
            <p style={{
              fontSize: '14px',
              color: 'rgba(255, 255, 255, 0.9)',
              margin: '4px 0 0 0'
            }}>
              {breakdown.name}
            </p>
          </div>
          <div style={{
            padding: '6px 12px',
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            borderRadius: '20px',
            fontSize: '12px',
            color: 'white'
          }}>
            📦 Package Applied
          </div>
        </div>
        
        {/* Package Rate Card */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '20px'
        }}>
          {/* Rate Card */}
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '12px',
            textAlign: 'center'
          }}>
            <div style={{
              fontSize: '12px',
              color: '#6B46C1',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '8px'
            }}>
              Package Rate
            </div>
            <div style={{
              fontSize: '32px',
              fontWeight: 'bold',
              color: '#6B46C1',
              marginBottom: '4px'
            }}>
              {formatCurrency(breakdown.ratePerUnit)}
            </div>
            <div style={{
              fontSize: '14px',
              color: '#718096'
            }}>
              MAD per {unit}
            </div>
          </div>
          
          {/* Package Features Card - ENHANCED to show both per-unit and total */}
          <div style={{
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            padding: '20px',
            borderRadius: '12px',
            backdropFilter: 'blur(10px)'
          }}>
            <div style={{
              fontSize: '12px',
              color: 'rgba(255, 255, 255, 0.8)',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '12px'
            }}>
              Package Features
            </div>
            
            {/* Included KM - Show both per-unit and total */}
            {breakdown.includedKm && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '4px'
                }}>
                  <span style={{ fontSize: '13px', color: 'white' }}>Included per {unit}:</span>
                  <span style={{ fontSize: '18px', fontWeight: 'bold', color: 'white' }}>
                    {breakdown.includedKm} km
                  </span>
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingTop: '8px',
                  borderTop: '1px solid rgba(255,255,255,0.2)'
                }}>
                  <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.9)' }}>
                    Total included for {breakdown.duration} {breakdown.duration > 1 ? unitPlural : unit}:
                  </span>
                  <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#FFD700' }}>
                    {breakdown.totalIncludedKm} km
                  </span>
                </div>
                <div style={{
                  fontSize: '11px',
                  color: 'rgba(255,255,255,0.7)',
                  marginTop: '4px',
                  textAlign: 'right'
                }}>
                  {breakdown.includedKm} km × {breakdown.duration} = {breakdown.totalIncludedKm} km
                </div>
              </div>
            )}
            
            {/* Extra KM Rate */}
            {breakdown.extraRate > 0 && (
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: '12px',
                borderTop: '1px solid rgba(255,255,255,0.2)'
              }}>
                <span style={{ fontSize: '13px', color: 'white' }}>Extra KM Rate:</span>
                <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#FFD700' }}>
                  {formatCurrency(breakdown.extraRate)} MAD/km
                </span>
              </div>
            )}
          </div>
        </div>
        
        {/* Package Total Display */}
        <div style={{
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          padding: '16px',
          borderRadius: '12px',
          backdropFilter: 'blur(10px)'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: 'white'
          }}>
            <div>
              <div style={{ fontSize: '14px', opacity: 0.9 }}>Package Total</div>
              <div style={{ fontSize: '12px', opacity: 0.7, marginTop: '2px' }}>
                {breakdown.duration} {breakdown.duration > 1 ? unitPlural : unit}
              </div>
            </div>
            <div style={{
              fontSize: '28px',
              fontWeight: 'bold',
              color: 'white'
            }}>
              {formatCurrency(breakdown.packageTotal)} MAD
            </div>
          </div>
          <div style={{
            marginTop: '12px',
            fontSize: '12px',
            color: 'rgba(255,255,255,0.8)',
            textAlign: 'center',
            borderTop: '1px solid rgba(255,255,255,0.2)',
            paddingTop: '12px'
          }}>
            <div>{breakdown.ratePerUnit} MAD × {breakdown.duration} {breakdown.duration > 1 ? unitPlural : unit} = {formatCurrency(breakdown.packageTotal)} MAD</div>
            {breakdown.includedKm && (
              <div style={{ marginTop: '4px', color: '#FFD700' }}>
                ✓ Total included kilometers: {breakdown.totalIncludedKm} km ({breakdown.includedKm} km × {breakdown.duration})
              </div>
            )}
            {breakdown.extraRate > 0 && (
              <div style={{ marginTop: '2px', color: '#FFD700' }}>
                Extra kilometers: {formatCurrency(breakdown.extraRate)} MAD/km
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Enhanced Tier Pricing Display Component (only shown when no package)
  const TierPricingDisplay = ({ breakdown }) => {
    if (!breakdown) return null;

    const unit = breakdown.isHourly ? 'hour' : 'day';
    const unitPlural = breakdown.isHourly ? 'hours' : 'days';

    return (
      <div style={{
        marginTop: '24px',
        marginBottom: '24px',
        padding: '20px',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        borderRadius: '16px',
        boxShadow: '0 10px 30px rgba(102, 126, 234, 0.2)'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '20px',
          paddingBottom: '16px',
          borderBottom: '2px solid rgba(255, 255, 255, 0.2)'
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <svg style={{ width: '24px', height: '24px', color: 'white' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <h4 style={{
              fontSize: '18px',
              fontWeight: 'bold',
              color: 'white',
              margin: 0
            }}>
              {breakdown.isDaily ? 'Daily Rate Breakdown' : 'Special Tier Pricing'}
            </h4>
            <p style={{
              fontSize: '14px',
              color: 'rgba(255, 255, 255, 0.9)',
              margin: '4px 0 0 0'
            }}>
              {breakdown.tierDescription}
            </p>
          </div>
          <div style={{
            padding: '6px 12px',
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            borderRadius: '20px',
            fontSize: '12px',
            color: 'white'
          }}>
            {breakdown.source === 'database' ? '📊 Database' : 
             breakdown.source === 'vehicle_rate' ? '🚗 Vehicle Rate' : '⚡ Standard Rate'}
          </div>
        </div>
        
        {/* Rate Comparison Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '20px'
        }}>
          {/* Your Rate Card */}
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '12px',
            textAlign: 'center'
          }}>
            <div style={{
              fontSize: '12px',
              color: '#667eea',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '8px'
            }}>
              Your Special Rate
            </div>
            <div style={{
              fontSize: '32px',
              fontWeight: 'bold',
              color: '#4c51bf',
              marginBottom: '4px'
            }}>
              {formatCurrency(breakdown.tierRate)}
            </div>
            <div style={{
              fontSize: '14px',
              color: '#718096'
            }}>
              MAD per {unit}
            </div>
          </div>
          
          {/* Standard Rate Card */}
          <div style={{
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            padding: '20px',
            borderRadius: '12px',
            textAlign: 'center',
            backdropFilter: 'blur(10px)'
          }}>
            <div style={{
              fontSize: '12px',
              color: 'rgba(255, 255, 255, 0.8)',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '8px'
            }}>
              Standard Rate
            </div>
            <div style={{
              fontSize: '28px',
              fontWeight: 'bold',
              color: 'white',
              textDecoration: 'line-through',
              textDecorationColor: 'rgba(255, 255, 255, 0.5)',
              marginBottom: '4px'
            }}>
              {formatCurrency(breakdown.standardRate)}
            </div>
            <div style={{
              fontSize: '14px',
              color: 'rgba(255, 255, 255, 0.8)'
            }}>
              MAD per {unit}
            </div>
          </div>
        </div>
        
        {/* Savings Display */}
        {breakdown.isDiscounted && (
          <div style={{
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            padding: '16px',
            borderRadius: '12px',
            backdropFilter: 'blur(10px)'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              color: 'white'
            }}>
              <div>
                <div style={{ fontSize: '14px', opacity: 0.9 }}>Total Savings</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                  {formatCurrency(breakdown.savings)} MAD
                </div>
              </div>
              <div style={{
                fontSize: '32px',
                fontWeight: 'bold',
                color: '#48bb78'
              }}>
                {breakdown.savingsPercentage}% OFF
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (loadingPrices) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '200px'
      }}>
        <div style={{
          padding: '20px',
          backgroundColor: '#f7fafc',
          borderRadius: '8px',
          color: '#4a5568'
        }}>
          Loading pricing data...
        </div>
      </div>
    );
  }

  return (
    <div id="receipt-to-print" className="receipt-container page-container">
      <style>{`
        /* Base styles */
        .receipt-container {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
          color: #2d3748;
          background: white;
        }

        .page-container {
          background: white;
        }

        /* Critical fixes to prevent text overlap */
        .receipt-container * {
          box-sizing: border-box;
          max-width: 100%;
          word-wrap: break-word;
          overflow-wrap: break-word;
        }

        .receipt-container .header-section {
          display: flex !important;
          justify-content: space-between !important;
          align-items: center !important;
          flex-wrap: wrap !important;
          gap: 16px !important;
        }

        .receipt-container .header-section > div {
          min-width: 0;
          flex: 1 1 auto;
        }

        .receipt-container h1 {
          font-size: clamp(20px, 4vw, 28px) !important;
          line-height: 1.2 !important;
          white-space: normal !important;
          word-break: break-word !important;
        }

        .receipt-container p {
          white-space: normal !important;
          word-break: break-word !important;
          line-height: 1.4 !important;
        }

        /* Fix for the estimate warning */
        .receipt-container .header-section > div:last-child div[style*="marginTop"] {
          max-width: 100%;
          width: auto !important;
          display: inline-block !important;
        }

        /* Ensure text doesn't overflow containers */
        .receipt-container .info-grid > div {
          min-width: 0;
          overflow: hidden;
        }

        .receipt-container .info-grid > div > div:last-child {
          white-space: normal !important;
          word-break: break-word !important;
        }

        /* Mobile styles */
        @media screen and (max-width: 767px) {
          .receipt-container {
            padding: 16px;
          }
          .header-section {
            flex-direction: column !important;
            text-align: center !important;
            gap: 16px !important;
          }
          .info-grid {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }
          .flex-row {
            flex-direction: column !important;
            gap: 12px !important;
          }
          .payment-summary-grid {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
          }
          .table-responsive {
            overflow-x: auto;
          }
          .header-logo {
            height: 60px !important;
          }
          .stamp-img {
            height: 50px !important;
          }
        }

        /* Tablet styles */
        @media screen and (min-width: 768px) and (max-width: 1023px) {
          .receipt-container {
            padding: 24px;
          }
          .info-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
          .header-logo {
            height: 70px !important;
          }
        }

        /* Desktop styles */
        @media screen and (min-width: 1024px) {
          .receipt-container {
            max-width: 1000px;
            margin: 40px auto;
            padding: 32px;
            border-radius: 16px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
          }
        }

        /* Print styles */
        @media print {
          @page {
            size: A4;
            margin: 1.5cm;
          }
          .receipt-container {
            max-width: none;
            margin: 0;
            padding: 0;
            box-shadow: none;
          }
          .page-container {
            max-width: none;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            page-break-after: always;
          }
          .no-print {
            display: none !important;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }

        /* Utility classes */
        .info-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
        }
        
        .payment-summary-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 24px;
        }
        
        .flex-row {
          display: flex;
          flex-wrap: wrap;
          gap: 20px;
        }
        
        .badge {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
        }
        
        .badge-success {
          background-color: #c6f6d5;
          color: #22543d;
        }
        
        .badge-warning {
          background-color: #feebc8;
          color: #7b341e;
        }
        
        .badge-info {
          background-color: #bee3f8;
          color: #1e3a8a;
        }
        
        .header-logo {
          height: 80px;
          width: auto;
          object-fit: contain;
        }
        
        .stamp-img {
          height: 70px;
          width: auto;
          object-fit: contain;
        }
      `}</style>

      {/* Header Section */}
      <div className="header-section" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '32px',
        paddingBottom: '24px',
        borderBottom: '3px solid #667eea'
      }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <img
            src={logoUrl || "/assets/logo.jpg"}
            alt="Company Logo"
            className="header-logo"
            style={{ maxWidth: '220px', width: '100%', height: 'auto' }}
            onError={(e) => e.target.style.display = 'none'}
          />
        </div>
        <div style={{ textAlign: 'left', minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <h1 style={{
            fontSize: 'clamp(20px, 5vw, 28px)',
            fontWeight: 'bold',
            margin: '0 0 8px 0',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            whiteSpace: 'normal',
            wordBreak: 'break-word'
          }}>
            {rental.signature_url ? 'PAYMENT RECEIPT' : 'ESTIMATE RECEIPT'}
          </h1>
          <p style={{ fontSize: '13px', color: '#718096', margin: '2px 0', whiteSpace: 'normal', wordBreak: 'break-word' }}>SaharaX Rentals Morocco</p>
          <p style={{ fontSize: '13px', color: '#718096', margin: 0, whiteSpace: 'normal', wordBreak: 'break-word' }}>contact@saharax.co | +212 658 888 852</p>
          
          {!rental.signature_url && (
            <div style={{
              marginTop: '12px',
              padding: '8px 12px',
              backgroundColor: '#feebc8',
              borderRadius: '8px',
              display: 'inline-block',
              maxWidth: '100%'
            }}>
              <span style={{
                fontSize: '12px',
                color: '#7b341e',
                fontWeight: '600',
                whiteSpace: 'normal',
                wordBreak: 'break-word'
              }}>
                ⚠️ ESTIMATE ONLY - Contract not signed
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Customer & Receipt Info Grid */}
      <div className="info-grid" style={{ marginBottom: '24px' }}>
        <div style={{
          padding: '20px',
          background: 'linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%)',
          borderRadius: '12px',
          border: '1px solid #e2e8f0'
        }}>
          <div style={{
            fontSize: '11px',
            color: '#718096',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '12px'
          }}>
            Customer Information
          </div>
          <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '4px' }}>
            {rental.customer_name}
          </div>
          <div style={{ fontSize: '14px', color: '#4a5568' }}>
            {rental.customer_phone}
          </div>
        </div>
        
        <div style={{
          padding: '20px',
          background: 'linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%)',
          borderRadius: '12px',
          border: '1px solid #e2e8f0'
        }}>
          <div style={{
            fontSize: '11px',
            color: '#718096',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '12px'
          }}>
            Receipt Details
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ color: '#718096' }}>Receipt #:</span>
            <span style={{ fontWeight: '600' }}>#{safeFormatId(rental.rental_id || rental.id)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#718096' }}>Date:</span>
            <span style={{ fontWeight: '600' }}>
              {new Date().toLocaleDateString('en-GB', { 
                day: '2-digit', 
                month: 'short', 
                year: 'numeric' 
              })}
            </span>
          </div>
        </div>
      </div>

      {/* Vehicle Section */}
      <div style={{
        padding: '16px 20px',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        borderRadius: '12px',
        marginBottom: '24px',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        color: 'white'
      }}>
        <div>
          <div style={{ fontSize: '12px', opacity: 0.9, marginBottom: '4px' }}>Vehicle Rented</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{vehicleName}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '12px', opacity: 0.9, marginBottom: '4px' }}>Plate Number</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{plateNumber}</div>
        </div>
      </div>

      {/* Rental Period */}
      <div style={{
        padding: '20px',
        backgroundColor: '#f7fafc',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        marginBottom: '24px'
      }}>
        <div style={{
          fontSize: '12px',
          color: '#718096',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: '16px'
        }}>
          Rental Period
        </div>
        <div className="flex-row" style={{ display: 'flex', gap: '24px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#718096', fontSize: '12px', marginBottom: '4px' }}>Start Date & Time</div>
            <div style={{ fontSize: '15px', fontWeight: '600' }}>
              {rental.started_at || rental.rental_start_date ? 
                new Date(rental.started_at || rental.rental_start_date).toLocaleString('en-GB', { 
                  day: '2-digit', 
                  month: 'short', 
                  year: 'numeric',
                  hour: '2-digit', 
                  minute: '2-digit' 
                }) : 'N/A'}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#718096', fontSize: '12px', marginBottom: '4px' }}>End Date & Time</div>
            <div style={{ fontSize: '15px', fontWeight: '600' }}>
              {rental.actual_end_date || rental.rental_end_date ? 
                new Date(rental.actual_end_date || rental.rental_end_date).toLocaleString('en-GB', { 
                  day: '2-digit', 
                  month: 'short', 
                  year: 'numeric',
                  hour: '2-digit', 
                  minute: '2-digit' 
                }) : 'N/A'}
            </div>
          </div>
        </div>
      </div>

      {/* Distance & Fuel Section */}
      <div className="flex-row" style={{ display: 'flex', gap: '20px', marginBottom: '24px' }}>
        {/* Distance Information */}
        {rental.start_odometer && rental.ending_odometer && (
          <div style={{ flex: 1, minWidth: '250px' }}>
            <div style={{
              padding: '20px',
              backgroundColor: '#ebf8ff',
              borderRadius: '12px',
              border: '1px solid #90cdf4'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '16px'
              }}>
                <svg style={{ width: '20px', height: '20px', color: '#3182ce' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                <span style={{ fontSize: '14px', fontWeight: '600', color: '#2c5282' }}>
                  Distance Information
                </span>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#718096' }}>Start</div>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#2c5282' }}>
                    {rental.start_odometer} km
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#718096' }}>End</div>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#2c5282' }}>
                    {rental.ending_odometer} km
                  </div>
                </div>
              </div>
              
              <div style={{
                padding: '12px',
                backgroundColor: 'white',
                borderRadius: '8px',
                border: '1px solid #bee3f8'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '12px', color: '#4a5568' }}>Total Distance:</span>
                  <span style={{ fontSize: '14px', fontWeight: '600' }}>{overageDetails.totalKm.toFixed(2)} km</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '12px', color: '#4a5568' }}>Package Included:</span>
                  <span style={{ fontSize: '14px', fontWeight: '600' }}>{overageDetails.includedKm} km</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: '#4a5568' }}>Extra Kilometers:</span>
                  <span style={{ 
                    fontSize: '14px', 
                    fontWeight: '600',
                    color: overageDetails.extraKm > 0 ? '#e53e3e' : '#38a169'
                  }}>
                    {overageDetails.extraKm > 0 ? '+' : ''}{overageDetails.extraKm} km
                  </span>
                </div>
                
                {overageDetails.hasOverage && (
                  <div style={{
                    marginTop: '8px',
                    padding: '10px',
                    backgroundColor: '#fed7d7',
                    borderRadius: '6px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', fontWeight: '600', color: '#c53030' }}>Overage Charge:</span>
                      <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#c53030' }}>
                        {formatCurrency(overageDetails.overageCharge)} MAD
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#c53030', marginTop: '2px' }}>
                      {overageDetails.extraKm} km × {overageDetails.rate} MAD/km
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Fuel Information */}
        {startFuel !== null && endFuel !== null && (
          <div style={{ flex: 1, minWidth: '250px' }}>
            <div style={{
              padding: '20px',
              backgroundColor: hasFuelCharge ? '#fefcbf' : '#f0fff4',
              borderRadius: '12px',
              border: `1px solid ${hasFuelCharge ? '#fbd38d' : '#9ae6b4'}`
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '16px'
              }}>
                <svg style={{ width: '20px', height: '20px', color: '#d69e2e' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span style={{ fontSize: '14px', fontWeight: '600', color: '#b7791f' }}>
                  Fuel Information
                </span>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#718096' }}>Start Level</div>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#b7791f' }}>
                    {startFuel}/8 lines
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#718096' }}>End Level</div>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#b7791f' }}>
                    {endFuel}/8 lines
                  </div>
                </div>
              </div>
              
              {/* Fuel charge — shown for both hourly and daily when charge > 0 */}
              {hasFuelCharge ? (
                <div style={{
                  padding: '12px',
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  border: '1px solid #fbd38d'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', color: '#4a5568' }}>Fuel Deficit:</span>
                    <span style={{ fontSize: '14px', fontWeight: '600', color: '#d69e2e' }}>
                      {fuelDeficit} line{fuelDeficit !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', color: '#4a5568' }}>Price per line:</span>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#d69e2e' }}>
                      {fuelPricePerLine} MAD
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '12px', color: '#4a5568' }}>
                      Fuel Charge ({rental.rental_type}):
                    </span>
                    <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#d69e2e' }}>
                      +{formatCurrency(effectiveFuelCharge)} MAD
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#a0aec0', marginTop: '4px' }}>
                    {fuelDeficit} lines × {fuelPricePerLine} MAD = {formatCurrency(effectiveFuelCharge)} MAD
                  </div>
                </div>
              ) : (
                /* No charge — fuel included */
                <div style={{
                  marginTop: '8px',
                  padding: '10px 12px',
                  backgroundColor: '#f0fff4',
                  borderRadius: '8px',
                  border: '1px solid #9ae6b4',
                  textAlign: 'center',
                  color: '#22543d',
                  fontSize: '13px',
                  fontWeight: '600'
                }}>
                  ⛽ No fuel charge — fuel returned at same level or included in rate
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Display Package if exists, otherwise show Tier Pricing */}
      {hasPackage && packageBreakdown ? (
        <PackageDisplay breakdown={packageBreakdown} />
      ) : (
        tierPricingBreakdown && tierPricingBreakdown.isDiscounted && (
          <TierPricingDisplay breakdown={tierPricingBreakdown} />
        )
      )}

      {/* Charges Table */}
      <div className="table-responsive" style={{ marginBottom: '24px' }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '14px'
        }}>
          <thead>
            <tr style={{
              background: 'linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%)',
              borderBottom: '2px solid #667eea'
            }}>
              <th style={{ padding: '12px', textAlign: 'left' }}>DESCRIPTION</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>AMOUNT (MAD)</th>
            </tr>
          </thead>
          <tbody>
            {/* Base Rental */}
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '12px' }}>
                <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                  {hasPackage ? 'Package Rental Charge' : 'Base Rental Charge'}
                  {hasPackage && packageBreakdown && (
                    <span style={{
                      marginLeft: '8px',
                      padding: '2px 8px',
                      backgroundColor: '#9F7AEA',
                      color: 'white',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: '600'
                    }}>
                      PACKAGE
                    </span>
                  )}
                  {!hasPackage && tierPricingBreakdown?.isDiscounted && (
                    <span style={{
                      marginLeft: '8px',
                      padding: '2px 8px',
                      backgroundColor: '#c6f6d5',
                      color: '#22543d',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: '600'
                    }}>
                      {tierPricingBreakdown.savingsPercentage}% OFF
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '12px', color: '#718096' }}>
                  {rental.rental_type || 'Daily'} rental
                  {hasPackage && packageBreakdown && ` • ${packageBreakdown.name}`}
                  {!hasPackage && tierPricingBreakdown?.tierDescription && ` • ${tierPricingBreakdown.tierDescription}`}
                </div>
              </td>
              <td style={{ padding: '12px', textAlign: 'right' }}>
                <div style={{ fontWeight: '600' }}>
                  {formatCurrency(
                    (() => {
                      const pkg = rental.package;
                      const rate = pkg ? (parseFloat(pkg.fixed_amount) || rental.unit_price || 0) : (rental.unit_price || 0);
                      const dur = rental.rental_type === 'hourly'
                        ? (rental.quantity_hours ?? rental.quantity_days ?? 1)
                        : (rental.quantity_days ?? 1);
                      return rate * dur;
                    })()
                  )}
                </div>
                <div style={{ fontSize: '11px', color: '#718096' }}>
                  {formatCurrency(rental.unit_price || 0)} MAD × {rental.rental_type === 'hourly' ? (rental.quantity_hours ?? rental.quantity_days ?? 1) : (rental.quantity_days ?? 1)} {rental.rental_type === 'hourly' ? 'hour(s)' : 'day(s)'}
                </div>
                {!hasPackage && tierPricingBreakdown?.isDiscounted && (
                  <div style={{ fontSize: '11px', color: '#718096', textDecoration: 'line-through' }}>
                    {formatCurrency(tierPricingBreakdown.standardTotal)}
                  </div>
                )}
              </td>
            </tr>
            
            {/* Overage Charge */}
            {hasOverage && (
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '12px' }}>
                  <div style={{ fontWeight: '600', color: '#c53030' }}>Kilometer Overage</div>
                  <div style={{ fontSize: '12px', color: '#718096' }}>
                    {overageDetails.extraKm} km extra × {overageDetails.rate} MAD/km
                  </div>
                </td>
                <td style={{ padding: '12px', textAlign: 'right', color: '#c53030', fontWeight: '600' }}>
                  +{formatCurrency(rental.overage_charge || overageDetails.overageCharge)}
                </td>
              </tr>
            )}
            
            {/* Fuel Surcharge — shown for both hourly and daily when charge > 0 */}
            {hasFuelCharge && (
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '12px' }}>
                  <div style={{ fontWeight: '600', color: '#d69e2e' }}>
                    Fuel Surcharge
                    <span style={{
                      marginLeft: '8px',
                      padding: '2px 6px',
                      backgroundColor: '#fefcbf',
                      color: '#b7791f',
                      borderRadius: '10px',
                      fontSize: '10px',
                      fontWeight: '600',
                      textTransform: 'uppercase'
                    }}>
                      {rental.rental_type}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#718096' }}>
                    {fuelDeficit} line{fuelDeficit !== 1 ? 's' : ''} deficit × {fuelPricePerLine} MAD/line
                  </div>
                </td>
                <td style={{ padding: '12px', textAlign: 'right', color: '#d69e2e', fontWeight: '600' }}>
                  +{formatCurrency(effectiveFuelCharge)}
                </td>
              </tr>
            )}
            
            {/* Extensions */}
            {rental.extensions && rental.extensions.length > 0 && (
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '12px' }}>
                  <div style={{ fontWeight: '600', color: '#805ad5' }}>Extension Fees</div>
                  <div style={{ fontSize: '12px', color: '#718096' }}>
                    {rental.extensions.filter(ext => ext.status === 'approved').length} extension(s)
                  </div>
                </td>
                <td style={{ padding: '12px', textAlign: 'right', color: '#805ad5', fontWeight: '600' }}>
                  +{formatCurrency(rental.extensions.reduce((sum, ext) => 
                    ext.status === 'approved' ? sum + (ext.extension_price || 0) : sum, 0))}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Payment Summary */}
      <div style={{
        padding: '24px',
        background: 'linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%)',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        marginBottom: '24px'
      }}>
        <h3 style={{
          fontSize: '16px',
          fontWeight: '600',
          margin: '0 0 20px 0',
          color: '#4a5568'
        }}>
          Payment Summary
        </h3>
        
        <div className="payment-summary-grid">
          {/* Left Column - Charges */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ color: '#4a5568' }}>Base Rental ({rental.rental_type === 'hourly' ? (rental.quantity_hours ?? rental.quantity_days ?? 1) : (rental.quantity_days ?? 1)} {rental.rental_type === 'hourly' ? 'hrs' : 'days'}):</span>
              <span style={{ fontWeight: '600' }}>{formatCurrency(
                (() => {
                  const pkg = rental.package;
                  const rate = pkg ? (parseFloat(pkg.fixed_amount) || rental.unit_price || 0) : (rental.unit_price || 0);
                  const dur = rental.rental_type === 'hourly'
                    ? (rental.quantity_hours ?? rental.quantity_days ?? 1)
                    : (rental.quantity_days ?? 1);
                  return rate * dur;
                })()
              )} MAD</span>
            </div>
            
            {hasOverage && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', color: '#c53030' }}>
                <span>Overage Charge:</span>
                <span style={{ fontWeight: '600' }}>+{formatCurrency(rental.overage_charge || overageDetails.overageCharge)} MAD</span>
              </div>
            )}
            
            {hasFuelCharge && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', color: '#d69e2e' }}>
                <span>Fuel Surcharge ({rental.rental_type}):</span>
                <span style={{ fontWeight: '600' }}>+{formatCurrency(effectiveFuelCharge)} MAD</span>
              </div>
            )}
            
            {rental.extensions && rental.extensions.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', color: '#805ad5' }}>
                <span>Extensions:</span>
                <span style={{ fontWeight: '600' }}>+{formatCurrency(rental.extensions.reduce((sum, ext) => 
                  ext.status === 'approved' ? sum + (ext.extension_price || 0) : sum, 0))} MAD</span>
              </div>
            )}

            {linkedMaintenance && (
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px dashed #cbd5e0' }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#c53030', marginBottom: '10px' }}>
                  Damage / Maintenance Bill
                </div>
                <div style={{ marginBottom: '10px', color: '#4a5568', fontSize: '12px' }}>
                  <span style={{ fontWeight: '600' }}>Reference:</span>{' '}
                  {formatMaintenanceReference(linkedMaintenance.id)}
                </div>
                {maintenanceSummaryItems.length > 0 && (
                  <div style={{ marginBottom: '10px', color: '#4a5568', fontSize: '12px' }}>
                    <span style={{ fontWeight: '600' }}>Work performed:</span>{' '}
                    {maintenanceSummaryItems.join(' • ')}
                    {Array.isArray(linkedMaintenance.parts_used) && linkedMaintenance.parts_used.length > 4 ? ' • more items' : ''}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: '#4a5568' }}>
                  <span>Parts:</span>
                  <span style={{ fontWeight: '600' }}>{formatCurrency(linkedMaintenance.parts_cost_mad || 0)} MAD</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: '#4a5568' }}>
                  <span>Labor:</span>
                  <span style={{ fontWeight: '600' }}>{formatCurrency(linkedMaintenance.labor_rate_mad || 0)} MAD</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: '#4a5568' }}>
                  <span>External:</span>
                  <span style={{ fontWeight: '600' }}>{formatCurrency(linkedMaintenance.external_cost_mad || 0)} MAD</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#c53030' }}>
                  <span>Maintenance Total:</span>
                  <span style={{ fontWeight: '700' }}>{formatCurrency(linkedMaintenance.cost || 0)} MAD</span>
                </div>
                {maintenanceStayCharge > 0 && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', color: '#dd6b20' }}>
                      <span>Maintenance Stay ({maintenanceStayDays} day{maintenanceStayDays === 1 ? '' : 's'} × {formatCurrency(maintenanceStayRate)}):</span>
                      <span style={{ fontWeight: '600' }}>{formatCurrency(maintenanceStayCharge)} MAD</span>
                    </div>
                    {maintenanceStayDiscount > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', color: '#2f855a' }}>
                        <span>Employee Discount:</span>
                        <span style={{ fontWeight: '600' }}>-{formatCurrency(maintenanceStayDiscount)} MAD</span>
                      </div>
                    )}
                  </>
                )}
                {linkedVehicleReport?.customer_chargeable && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', color: '#2b6cb0' }}>
                    <span>Customer Charge:</span>
                    <span style={{ fontWeight: '700' }}>{formatCurrency(maintenanceChargeAmount)} MAD</span>
                  </div>
                )}
              </div>
            )}
            
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: '16px',
              paddingTop: '16px',
              borderTop: '2px solid #667eea',
              fontSize: '16px',
              fontWeight: 'bold'
            }}>
              <span>GRAND TOTAL:</span>
              <span style={{ color: '#38a169' }}>{formatCurrency(totalAmount)} MAD</span>
            </div>
          </div>
          
          {/* Right Column - Payments */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ color: '#4a5568' }}>Deposit Paid:</span>
              <span style={{ color: '#38a169', fontWeight: '600' }}>-{formatCurrency(rental.deposit_amount || 0)} MAD</span>
            </div>
            
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '16px',
              padding: '12px',
              backgroundColor: 'white',
              borderRadius: '8px',
              border: '1px solid #e2e8f0'
            }}>
              <span style={{ fontWeight: '600' }}>Balance Due:</span>
              <span style={{
                fontWeight: 'bold',
                fontSize: '18px',
                color: (totalAmount - (rental.deposit_amount || 0)) > 0 ? '#c53030' : '#38a169'
              }}>
                {formatCurrency(Math.max(0, totalAmount - (rental.deposit_amount || 0)))} MAD
              </span>
            </div>
            
            <div style={{
              padding: '12px',
              backgroundColor: '#ebf8ff',
              borderRadius: '8px',
              border: '1px solid #90cdf4'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: '#2c5282' }}>Damage Deposit:</span>
                <span style={{ fontWeight: 'bold', color: '#2c5282' }}>{formatCurrency(damageDeposit)} MAD</span>
              </div>
              
              {rental.deposit_returned_at && rental.deposit_return_amount && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#38a169' }}>
                  <span>Returned:</span>
                  <span>{formatCurrency(rental.deposit_return_amount)} MAD</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer with Status and Signature */}
      <div style={{
        marginTop: '32px',
        paddingTop: '24px',
        borderTop: '2px solid #e2e8f0'
      }}>
        {/* Payment Status Banner - FIXED: Calculate from actual numbers, not rental.payment_status */}
        {(() => {
          const depositPaid = parseFloat(rental.deposit_amount || 0);
          const balanceDue = Math.max(0, totalAmount - depositPaid);
          const isActuallyPaid = totalAmount > 0 && depositPaid >= totalAmount;
          const isPartial = depositPaid > 0 && depositPaid < totalAmount;
          
          return (
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '20px',
              background: isActuallyPaid ? 
                'linear-gradient(135deg, #c6f6d5 0%, #9ae6b4 100%)' : 
                isPartial ?
                'linear-gradient(135deg, #fefcbf 0%, #fbd38d 100%)' :
                'linear-gradient(135deg, #fed7d7 0%, #feb2b2 100%)',
              borderRadius: '12px',
              marginBottom: '24px'
            }}>
              <div>
                <div style={{
                  fontSize: '12px',
                  fontWeight: '600',
                  color: isActuallyPaid ? '#22543d' : isPartial ? '#7b341e' : '#c53030',
                  marginBottom: '4px'
                }}>
                  FINAL PAYMENT STATUS
                </div>
                <div style={{
                  fontSize: 'clamp(16px, 4vw, 20px)',
                  fontWeight: 'bold',
                  color: isActuallyPaid ? '#22543d' : isPartial ? '#7b341e' : '#c53030'
                }}>
                  {isActuallyPaid ? '✅ FULLY PAID & SETTLED' : isPartial ? '⚠️ PARTIAL PAYMENT - BALANCE DUE' : '❌ UNPAID'}
                </div>
                {isPartial && (
                  <div style={{ fontSize: '13px', color: '#7b341e', marginTop: '4px' }}>
                    {formatCurrency(depositPaid)} MAD paid of {formatCurrency(totalAmount)} MAD — Balance: {formatCurrency(balanceDue)} MAD
                  </div>
                )}
              </div>
              
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '12px', color: isActuallyPaid ? '#22543d' : isPartial ? '#7b341e' : '#c53030' }}>GRAND TOTAL</div>
                <div style={{
                  fontSize: 'clamp(20px, 5vw, 28px)',
                  fontWeight: 'bold',
                  color: isActuallyPaid ? '#22543d' : isPartial ? '#7b341e' : '#c53030'
                }}>
                  {formatCurrency(totalAmount)} MAD
                </div>
              </div>
            </div>
          );
        })()}

        {/* Signature and Stamp */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {stampUrl && <img src={stampUrl} alt="Official Stamp" className="stamp-img" />}
            <div>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#2d3748' }}>
                SaharaX Authorized Signature
              </div>
              <div style={{ fontSize: '12px', color: '#718096' }}>
                Official Payment Receipt • Valid for Accounting
              </div>
            </div>
          </div>
          
          <div style={{ textAlign: 'right' }}>
            <div style={{
              fontSize: '11px',
              color: '#a0aec0',
              fontFamily: 'monospace'
            }}>
              DOCUMENT ID: {safeFormatId(rental.rental_id || rental.id)}
            </div>
            <div style={{
              fontSize: '12px',
              color: '#718096',
              fontStyle: 'italic'
            }}>
              Thank you for choosing SaharaX Rentals
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReceiptTemplate;
