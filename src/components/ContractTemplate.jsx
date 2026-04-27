import React, { useState, useEffect } from "react";
import { supabase } from '../lib/supabase';
import { calculateSimpleRentalPricing } from '../utils/simpleRentalPricing';
import i18n from '../i18n';

const getRentalDurationUnits = (rental) =>
  rental?.rental_type === 'hourly'
    ? (rental?.quantity_hours ?? rental?.quantity_days ?? 1)
    : (rental?.quantity_days ?? 1);

const isFlatHourlyTierRental = (rental, hasPackage = false) => {
  const duration = Number(getRentalDurationUnits(rental));
  return !hasPackage && rental?.rental_type === 'hourly' && duration === 1.5;
};

const getEffectiveRentalBaseTotal = (rental, hasPackage = false, packageRate = null) => {
  const duration = Number(getRentalDurationUnits(rental));
  const fallbackRate = Number(rental?.unit_price || 0) || 0;
  const rate = packageRate ?? fallbackRate;
  if (isFlatHourlyTierRental(rental, hasPackage)) {
    return rate;
  }
  return rate * duration;
};

const normalizeContractPackageCandidate = (pkg = {}) => ({
  ...pkg,
  includedKilometers: Number(pkg?.includedKilometers ?? pkg?.included_kilometers ?? 0) || 0,
  extraKmRate: Number(pkg?.extraKmRate ?? pkg?.extra_km_rate ?? 0) || 0,
});

const formatContractDurationFlow = (minutes, billedHours, tr) => {
  const safeMinutes = Number(minutes || 0);
  const safeBilledHours = Number(billedHours || 0);
  if (safeMinutes <= 0) return tr('Rental duration recorded in the schedule below.', 'La durée de location est indiquée dans le planning ci-dessous.');
  if (safeMinutes === 30) return tr('30 minutes used', '30 minutes utilisées');
  if (safeMinutes < 60) return tr(`${safeMinutes} minutes used`, `${safeMinutes} minutes utilisées`);
  const hours = (safeMinutes / 60).toFixed(safeMinutes % 60 === 0 ? 0 : 1);
  return tr(
    `${hours} hours used • ${safeBilledHours} billed hour${safeBilledHours === 1 ? '' : 's'}`,
    `${String(hours).replace('.', ',')} heures utilisées • ${safeBilledHours} heure${safeBilledHours > 1 ? 's' : ''} facturée${safeBilledHours > 1 ? 's' : ''}`
  );
};

const ContractTemplate = ({ rental, logoUrl, stampUrl, language = 'fr' }) => {
  const isFrench = language === 'fr';
  if (!rental) return <div className="p-10 text-center">{isFrench ? 'Aucune donnée de location disponible.' : 'No rental data available.'}</div>;
  const tr = (en, fr) => (isFrench ? fr : en);

  const [basePrices, setBasePrices] = useState([]);
  const [kilometerPackages, setKilometerPackages] = useState([]);
  const [loadingPrices, setLoadingPrices] = useState(true);
  const vehicleName = rental.vehicle?.name || rental.vehicle_details?.name || "N/A";
  const plateNumber = rental.vehicle?.plate_number || rental.vehicle_details?.plate_number || "N/A";
  const vehicleModelId = rental.vehicle?.vehicle_model?.id || rental.vehicle?.vehicle_model_id;

  // Fetch base prices from database
  useEffect(() => {
    const loadBasePrices = async () => {
      try {
        const [
          { data, error },
          { data: packageData, error: packageError },
        ] = await Promise.all([
          supabase
            .from('app_4c3a7a6153_base_prices')
            .select('*')
            .eq('is_active', true),
          vehicleModelId
            ? supabase
                .from('app_4c3a7a6153_rental_km_packages')
                .select('*')
                .eq('is_active', true)
                .eq('vehicle_model_id', vehicleModelId)
                .order('included_kilometers', { ascending: true })
            : Promise.resolve({ data: [], error: null }),
        ]);
        
        if (error) {
          console.error('❌ Error loading base prices:', error);
        } else {
          setBasePrices(data || []);
        }
        if (packageError) {
          console.error('❌ Error loading contract km packages:', packageError);
        } else {
          setKilometerPackages(packageData || []);
        }
      } catch (error) {
        console.error('❌ Exception loading base prices:', error);
      } finally {
        setLoadingPrices(false);
      }
    };

    loadBasePrices();
  }, [vehicleModelId]);

  // Data mapping logic
  const customerName = rental.customer_name || rental.linkedCustomerProfile?.full_name || rental.linkedCustomerProfile?.name || "N/A";
  const customerPhone =
    rental.customer_phone ||
    rental.phone ||
    rental.linkedCustomerProfile?.phone ||
    rental.linkedCustomerProfile?.customer_phone ||
    "N/A";
  const license = rental.customer_license_number || rental.customer_licence_number || "N/A";
  const startDate = rental.started_at || rental.start_date || rental.rental_start_date;
  const endDate = rental.actual_end_date || rental.end_date || rental.rental_end_date;
  
  // Check if rental has a package
  const hasPackage = !!(rental.package || rental.package_id);
  
  // Odometer values
  const startOdo = rental.start_odometer || "N/A";
  const endOdo = rental.ending_odometer || "N/A";
  
  // ✅ FIXED: Get fuel data correctly from rental or startFuelLevel/endFuelLevel props
  const startFuel = rental.start_fuel_level !== undefined && rental.start_fuel_level !== null 
    ? rental.start_fuel_level 
    : (rental.startFuelLevel !== undefined && rental.startFuelLevel !== null ? rental.startFuelLevel : "N/A");
  
  const endFuel = rental.end_fuel_level !== undefined && rental.end_fuel_level !== null 
    ? rental.end_fuel_level 
    : (rental.endFuelLevel !== undefined && rental.endFuelLevel !== null ? rental.endFuelLevel : "N/A");
  
  const fuelCharge = rental.fuel_charge || 0;
  const fuelPricePerLine = rental.vehicle?.vehicle_model?.fuel_price || 0;
  // Calculate fuel deficit if both values exist
  const fuelDeficit = (startFuel !== "N/A" && endFuel !== "N/A" && startFuel >= endFuel) 
    ? startFuel - endFuel 
    : 0;

  // Enhanced package breakdown calculation with total included km
  const packageBreakdown = React.useMemo(() => {
    if (!hasPackage || !rental) return null;
    
    const pkg = rental.package;
    if (!pkg) return null;
    
    const isHourly = rental.rental_type === 'hourly';
    const isDaily = rental.rental_type === 'daily';
    
    const duration = getRentalDurationUnits(rental);
    const ratePerUnit = parseFloat(pkg.fixed_amount) || rental.unit_price || 0;
    const packageTotal = getEffectiveRentalBaseTotal(rental, true, ratePerUnit);
    const includedKmPerUnit = pkg.included_kilometers ? parseFloat(pkg.included_kilometers) : null;
    const totalIncludedKm = includedKmPerUnit ? includedKmPerUnit * duration : null;
    const extraRate = parseFloat(pkg.extra_km_rate) || 0;
    
    return {
      name: pkg.name || (isFrench ? 'Forfait kilométrique' : 'Kilometer Package'),
      ratePerUnit,
      duration,
      packageTotal,
      includedKmPerUnit,
      totalIncludedKm,
      extraRate,
      isHourly,
      isDaily,
      description: pkg.description
    };
  }, [rental, hasPackage]);

  // Enhanced tier pricing breakdown calculation (only shown when no package)
  const tierPricingBreakdown = React.useMemo(() => {
    if (hasPackage || !rental) return null;
    
    // Determine if hourly or daily
    const isHourly = rental.rental_type === 'hourly';
    const isDaily = rental.rental_type === 'daily';
    
    if (!isHourly && !isDaily) return null;
    
    const duration = getRentalDurationUnits(rental);
    const tierRate = rental.unit_price || 0;
    const isFlatTier = isFlatHourlyTierRental(rental, hasPackage);
    
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
        if (isHourly && rental.vehicle?.vehicle_model?.hourly_price) {
          standardRate = parseFloat(rental.vehicle.vehicle_model.hourly_price);
          priceSource = 'vehicle_model';
        } else if (isDaily && rental.vehicle?.vehicle_model?.daily_price) {
          standardRate = parseFloat(rental.vehicle.vehicle_model.daily_price);
          priceSource = 'vehicle_model';
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
        if (vehicleNameUpper.includes('AT6')) {
          standardRate = isHourly ? 599 : 1999;
        } else if (vehicleNameUpper.includes('AT5')) {
          standardRate = isHourly ? 399 : 1499;
        } else if (vehicleNameUpper.includes('AT10')) {
          standardRate = isHourly ? 999 : 3499;
        } else {
          standardRate = isHourly ? 400 : 1500;
        }
        priceSource = 'fallback';
      }
      
      return { rate: standardRate, source: priceSource };
    };
    
    const { rate: standardRate, source: priceSource } = getStandardRate();
    
    if (standardRate <= 0 || tierRate <= 0) return null;
    
    const standardTotal = duration * standardRate;
    const tierTotal = isFlatTier ? tierRate : duration * tierRate;
    const savings = Math.max(0, standardTotal - tierTotal);
    const savingsPercentage = standardTotal > 0 ? ((savings / standardTotal) * 100).toFixed(1) : 0;
    const isDiscounted = savings > 0;
    
    const getTierDescription = () => {
      if (isHourly) {
        if (duration === 1) return tr("1-hour standard rate", "Tarif standard 1 heure");
        if (duration === 1.5) return tr("1.5-hour fixed tier", "Palier fixe 1,5 heure");
        if (duration === 2) return tr("2-hour special rate", "Tarif spécial 2 heures");
        if (duration === 3) return tr("3-hour package deal", "Offre package 3 heures");
        if (duration >= 4 && duration < 24) return isFrench ? `Pack ${duration} heures` : `${duration}-hour bundle`;
        if (duration >= 24) return tr("Daily package (24h)", "Package journalier (24h)");
        return isFrench ? `Pack ${duration} heures` : `${duration}-hour package`;
      } else {
        if (duration === 1) return tr("1-day standard rate", "Tarif standard 1 jour");
        if (duration === 2) return tr("2-day package deal", "Offre package 2 jours");
        if (duration === 3) return tr("3-day special offer", "Offre spéciale 3 jours");
        if (duration >= 4 && duration < 7) return isFrench ? `Pack prolongé ${duration} jours` : `${duration}-day extended package`;
        if (duration >= 7) return tr("Weekly+ package (7+ days)", "Package hebdomadaire+ (7+ jours)");
        return isFrench ? `Pack ${duration} jours` : `${duration}-day package`;
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

  const contractPackageCatalog = React.useMemo(() => {
    const catalog = (Array.isArray(kilometerPackages) ? kilometerPackages : []).map(normalizeContractPackageCandidate);
    const linked = rental?.package ? normalizeContractPackageCandidate(rental.package) : null;
    const all = linked ? [...catalog, linked] : catalog;

    return all
      .filter((pkg) => Number(pkg?.includedKilometers || 0) > 0)
      .filter((pkg, index, arr) => arr.findIndex((entry) => String(entry.id || entry.includedKilometers) === String(pkg.id || pkg.includedKilometers)) === index)
      .sort((left, right) => Number(left.includedKilometers || 0) - Number(right.includedKilometers || 0));
  }, [kilometerPackages, rental?.package]);

  const contractPricingFlow = React.useMemo(() => {
    const startTime = rental?.started_at || rental?.start_date || rental?.rental_start_date || null;
    const endTime = rental?.actual_end_date || rental?.end_date || rental?.rental_end_date || null;
    const totalKmUsed = rental?.total_kilometers_driven ||
      ((rental?.ending_odometer && rental?.start_odometer)
        ? Number(rental.ending_odometer) - Number(rental.start_odometer)
        : 0);

    const hourlyRate = rental?.rental_type === 'daily'
      ? ((Number(rental?.daily_rate || rental?.vehicle?.daily_rate || rental?.vehicle?.vehicle_model?.daily_price || 0) || 0) / 24)
      : (Number(rental?.hourly_rate || rental?.vehicle?.hourly_rate || rental?.vehicle?.vehicle_model?.hourly_price || rental?.unit_price || 0) || 0);

    return calculateSimpleRentalPricing({
      startTime,
      endTime,
      gracePeriodMinutes: 60,
      hourlyRate,
      totalKmUsed,
      packages: contractPackageCatalog,
    });
  }, [contractPackageCatalog, rental]);

  const contractDistanceUpgrade = React.useMemo(() => {
    if (!contractPricingFlow?.selectedPackage || contractPackageCatalog.length < 2) return null;
    const finalLimit = Number(contractPricingFlow.packageLimitKm || 0);
    const finalIndex = contractPackageCatalog.findIndex((pkg) => Number(pkg.includedKilometers || 0) === finalLimit);
    if (finalIndex <= 0) return null;

    const previousPackage = contractPackageCatalog[finalIndex - 1];
    const previousLimit = Number(previousPackage?.includedKilometers || 0);
    const kmUsed = Number(contractPricingFlow.kmUsed || 0);
    if (kmUsed <= previousLimit) return null;

    return {
      previousPackage,
      previousLimit,
      finalPackage: contractPricingFlow.selectedPackage,
      finalLimit,
      kmUsed,
    };
  }, [contractPackageCatalog, contractPricingFlow]);

  const formatContractDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch { return dateString; }
  };

  const getCorrectSignatureUrl = (url) => {
    if (!url) return null;
    if (url.startsWith("http")) return url;
    const supabaseProjectUrl = import.meta.env.VITE_SUPABASE_URL || supabase?.supabaseUrl;
    return supabaseProjectUrl
      ? `${supabaseProjectUrl}/storage/v1/object/public/signatures/${url}`
      : url;
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'decimal',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  // Package Display Component - Simplified for contract (financial details in receipt)
  const PackageDisplay = ({ breakdown }) => {
    if (!breakdown) return null;

    const unit = breakdown.isHourly ? 'hour' : 'day';
    const unitPlural = breakdown.isHourly ? 'hours' : 'days';
    const hasIncludedKm = breakdown.includedKmPerUnit && breakdown.totalIncludedKm;

    return (
      <div style={{
        marginBottom: '24px',
        padding: '16px',
        background: '#f3f0ff',
        borderRadius: '8px',
        border: '1px solid #d8b4fe'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '12px'
        }}>
          <div style={{
            width: '32px',
            height: '32px',
            backgroundColor: '#8b5cf6',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <svg style={{ width: '16px', height: '16px', color: 'white' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
          </div>
          <div>
            <h4 style={{ fontSize: '15px', fontWeight: '600', margin: 0, color: '#4c1d95' }}>{tr('Selected Package', 'Package sélectionné')}</h4>
            <p style={{ fontSize: '13px', margin: '2px 0 0 0', color: '#6d28d9' }}>{breakdown.name}</p>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '10px'
        }}>
          {hasIncludedKm && (
            <>
              <div style={{
                background: 'white',
                padding: '10px',
                borderRadius: '6px',
                textAlign: 'center',
                border: '1px solid #e9d5ff'
              }}>
                <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '2px' }}>{tr('Included per', 'Inclus par')} {unit}</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#4c1d95' }}>{breakdown.includedKmPerUnit} km</div>
              </div>
              
              <div style={{
                background: '#ede9fe',
                padding: '10px',
                borderRadius: '6px',
                textAlign: 'center',
                border: '1px solid #c4b5fd'
              }}>
                <div style={{ fontSize: '11px', color: '#5b21b6', marginBottom: '2px' }}>{tr('Total Included', 'Total inclus')}</div>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#4c1d95' }}>{breakdown.totalIncludedKm} km</div>
                <div style={{ fontSize: '10px', color: '#6d28d9', marginTop: '2px' }}>
                  {breakdown.includedKmPerUnit} km × {breakdown.duration} {breakdown.duration > 1 ? unitPlural : unit}
                </div>
              </div>
            </>
          )}
          
          {breakdown.extraRate > 0 && (
            <div style={{
              background: 'white',
              padding: '10px',
              borderRadius: '6px',
              textAlign: 'center',
              border: '1px solid #fed7aa'
            }}>
              <div style={{ fontSize: '11px', color: '#9a3412', marginBottom: '2px' }}>{tr('Extra KM Rate', 'Tarif KM extra')}</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#9a3412' }}>{formatCurrency(breakdown.extraRate)} MAD/km</div>
            </div>
          )}
        </div>

        {hasIncludedKm && (
          <div style={{
            marginTop: '12px',
            fontSize: '12px',
            color: '#4c1d95',
            textAlign: 'center',
            padding: '8px',
            background: '#faf5ff',
            borderRadius: '6px',
            border: '1px dashed #c4b5fd'
          }}>
            {isFrench ? `✓ Le package inclut ${breakdown.totalIncludedKm} km au total` : `✓ Package includes ${breakdown.totalIncludedKm} km total`}
          </div>
        )}
      </div>
    );
  };

  // Tier Pricing Display Component
  const TierPricingDisplay = ({ breakdown }) => {
    if (!breakdown || !breakdown.isDiscounted) return null;

    const unit = breakdown.isHourly ? 'hour' : 'day';

    return (
      <div style={{
        marginBottom: '24px',
        padding: '20px',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        borderRadius: '12px',
        color: 'white'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '16px',
          paddingBottom: '12px',
          borderBottom: '2px solid rgba(255, 255, 255, 0.2)'
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <svg style={{ width: '20px', height: '20px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h4 style={{ fontSize: '16px', fontWeight: 'bold', margin: 0 }}>{tr('Special Tier Pricing', 'Tarification spéciale par palier')}</h4>
            <p style={{ fontSize: '13px', opacity: 0.9, margin: '2px 0 0 0' }}>{breakdown.tierDescription}</p>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '12px',
          marginBottom: '16px'
        }}>
          <div style={{ background: 'rgba(255,255,255,0.1)', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', opacity: 0.8 }}>{tr('Your Rate', 'Votre tarif')}</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{formatCurrency(breakdown.tierRate)} MAD</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.1)', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', opacity: 0.8 }}>{tr('Standard Rate', 'Tarif standard')}</div>
            <div style={{ fontSize: '16px', textDecoration: 'line-through', opacity: 0.8 }}>{formatCurrency(breakdown.standardRate)} MAD</div>
          </div>
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.1)',
          padding: '12px',
          borderRadius: '8px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>{tr('You Save:', 'Vous économisez :')}</span>
          <span style={{ fontSize: '18px', fontWeight: 'bold' }}>
            {formatCurrency(breakdown.savings)} MAD ({breakdown.savingsPercentage}%)
          </span>
        </div>
      </div>
    );
  };

  const RentalFlowDisplay = () => {
    if (!hasPackage || !packageBreakdown) return null;

    const bookedPlanName = packageBreakdown.name;
    const finalPlanName = contractPricingFlow?.selectedPackage?.name || bookedPlanName;
    const kmUsed = Number(contractPricingFlow?.kmUsed || 0);
    const finalLimit = Number(contractPricingFlow?.packageLimitKm || packageBreakdown.totalIncludedKm || 0);
    const overflowKm = Number(contractPricingFlow?.packageOverflowKm || 0);

    return (
      <div style={{
        marginBottom: '24px',
        padding: '18px',
        background: '#f8fafc',
        borderRadius: '12px',
        border: '1px solid #cbd5e1'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '14px'
        }}>
          <div style={{
            width: '34px',
            height: '34px',
            background: 'linear-gradient(135deg, #0f766e 0%, #0ea5a4 100%)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <svg style={{ width: '16px', height: '16px', color: 'white' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17l3 3 3-3m0-10l-3-3-3 3m3-3v16" />
            </svg>
          </div>
          <div>
            <h4 style={{ fontSize: '15px', fontWeight: '700', margin: 0, color: '#0f172a' }}>
              {tr('Rental flow summary', 'Résumé du déroulement')}
            </h4>
            <p style={{ fontSize: '12px', margin: '3px 0 0 0', color: '#475569' }}>
              {tr('Operational summary only. Prices stay on the receipt.', 'Résumé opérationnel uniquement. Les prix restent sur le reçu.')}
            </p>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px'
        }}>
          <div style={{ background: 'white', borderRadius: '10px', padding: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              {tr('Time used', 'Temps utilisé')}
            </div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>
              {formatContractDurationFlow(contractPricingFlow?.durationMinutes, contractPricingFlow?.billedHours, tr)}
            </div>
          </div>

          <div style={{ background: 'white', borderRadius: '10px', padding: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              {tr('Plan chosen at booking', 'Plan choisi à la réservation')}
            </div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>
              {bookedPlanName}
            </div>
          </div>

          <div style={{ background: 'white', borderRadius: '10px', padding: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              {tr('Distance used', 'Distance utilisée')}
            </div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>
              {kmUsed} km
            </div>
          </div>

          <div style={{ background: 'white', borderRadius: '10px', padding: '12px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              {tr('Final distance plan', 'Plan distance final')}
            </div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>
              {finalPlanName}
            </div>
            <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
              {tr(`Included limit: ${finalLimit} km`, `Limite incluse : ${finalLimit} km`)}
            </div>
          </div>
        </div>

        {contractDistanceUpgrade ? (
          <div style={{
            marginTop: '12px',
            padding: '12px',
            background: '#ecfeff',
            border: '1px solid #a5f3fc',
            borderRadius: '10px'
          }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#155e75', marginBottom: '4px' }}>
              {tr('Automatic distance-plan update', 'Mise à jour automatique du plan distance')}
            </div>
            <div style={{ fontSize: '12px', color: '#155e75', lineHeight: 1.6 }}>
              {tr(
                `The trip finished above the ${contractDistanceUpgrade.previousLimit} km plan, so the rental moved to the next valid plan at ${contractDistanceUpgrade.finalLimit} km to match the real mileage.`,
                `Le trajet a dépassé le plan de ${contractDistanceUpgrade.previousLimit} km, donc la location est passée au plan valable suivant à ${contractDistanceUpgrade.finalLimit} km pour correspondre au kilométrage réel.`
              )}
            </div>
          </div>
        ) : null}

        {overflowKm > 0 ? (
          <div style={{
            marginTop: '12px',
            padding: '12px',
            background: '#fff7ed',
            border: '1px solid #fdba74',
            borderRadius: '10px',
            fontSize: '12px',
            color: '#9a3412',
            lineHeight: 1.6
          }}>
            {tr(
              `${overflowKm} km still sits above the current distance plan and may be handled separately on the financial receipt.`,
              `${overflowKm} km dépasse encore le plan distance actuel et pourra être traité séparément sur le reçu financier.`
            )}
          </div>
        ) : null}
      </div>
    );
  };

  // Fuel gauge visualization
  const renderFuelGauge = (fuelLevel) => {
    if (fuelLevel === "N/A") return null;
    
    return (
      <div style={{
        display: 'flex',
        gap: '2px',
        marginTop: '4px',
        flexWrap: 'wrap'
      }}>
        {[1,2,3,4,5,6,7,8].map(segment => (
          <div 
            key={segment}
            style={{
              width: 'clamp(12px, 4vw, 20px)',
              height: 'clamp(16px, 5vw, 24px)',
              backgroundColor: segment <= fuelLevel ? '#10b981' : '#d1d5db',
              borderRadius: '4px',
              transition: 'all 0.2s ease'
            }}
            title={`Line ${segment}`}
          />
        ))}
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
    <div id="rental-contract-to-print" className="contract-container">
      <style>{`
        /* Base styles */
        .contract-container {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
          color: #2d3748;
          background: white;
        }

        /* Critical fixes to prevent text overlap */
        .contract-container * {
          box-sizing: border-box;
          max-width: 100%;
          word-wrap: break-word;
          overflow-wrap: break-word;
        }

        .contract-container .header-section {
          display: flex !important;
          justify-content: space-between !important;
          align-items: center !important;
          flex-wrap: wrap !important;
          gap: 16px !important;
        }

        .contract-container .header-section > div {
          min-width: 0;
          flex: 1 1 auto;
        }

        .contract-container h1, 
        .contract-container h2 {
          font-size: clamp(20px, 4vw, 28px) !important;
          line-height: 1.2 !important;
          white-space: normal !important;
          word-break: break-word !important;
        }

        .contract-container p {
          white-space: normal !important;
          word-break: break-word !important;
          line-height: 1.4 !important;
        }

        /* Ensure text doesn't overflow containers */
        .contract-container .info-grid > div {
          min-width: 0;
          overflow: hidden;
        }

        .contract-container .info-grid > div > div:last-child {
          white-space: normal !important;
          word-break: break-word !important;
        }

        /* Mobile styles */
        @media screen and (max-width: 767px) {
          .contract-container {
            padding: 12px;
          }
          .header-section {
            flex-direction: column !important;
            text-align: center !important;
            gap: 12px !important;
          }
          .details-grid {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }
          .signature-grid {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
          }
          .terms-grid {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
          }
          .fuel-gauge-container {
            flex-direction: column !important;
            gap: 12px !important;
          }
          .header-logo {
            height: 50px !important;
            max-width: 120px !important;
          }
          .page-container {
            padding: 12px !important;
            box-shadow: none !important;
            border-radius: 8px !important;
          }
          /* Stack all flex rows on mobile */
          div[style*="display: flex"] {
            flex-wrap: wrap !important;
          }
          /* Make all grids single column on mobile */
          div[style*="grid-template-columns"] {
            grid-template-columns: 1fr !important;
          }
          /* Reduce font sizes on mobile */
          h1, h2 { font-size: 18px !important; }
          h3, h4 { font-size: 15px !important; }
          p, span, td, th { font-size: 12px !important; }
          /* Reduce padding on mobile */
          div[style*="padding: '20px'"],
          div[style*="padding: 20px"] {
            padding: 12px !important;
          }
        }

        /* Tablet styles */
        @media screen and (min-width: 768px) and (max-width: 1023px) {
          .contract-container {
            padding: 24px;
          }
          .page-container {
            padding: 24px !important;
          }
          .details-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 24px !important;
          }
          .header-logo {
            height: 70px !important;
          }
        }

        /* Desktop styles */
        @media screen and (min-width: 1024px) {
          .contract-container {
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
          .contract-container {
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
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }

        /* Shared container styles */
        .page-container {
          background: white;
          border-radius: 12px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
          transition: all 0.3s ease;
        }

        /* Grid layouts */
        .details-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 24px;
        }

        .signature-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 32px;
        }

        .terms-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 32px;
        }

        /* Typography */
        .section-title {
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #718096;
          margin-bottom: 12px;
          border-bottom: 2px solid #667eea;
          padding-bottom: 4px;
        }

        /* Cards */
        .info-card {
          background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%);
          border-radius: 10px;
          padding: 16px;
          border: 1px solid #e2e8f0;
        }

        /* Badges */
        .badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 600;
        }

        .badge-success {
          background: #c6f6d5;
          color: #22543d;
        }

        .badge-warning {
          background: #feebc8;
          color: #7b341e;
        }

        /* Fuel gauge */
        .fuel-gauge-container {
          display: flex;
          gap: 24px;
          flex-wrap: wrap;
        }

        .header-logo {
          height: 56px;
          width: auto;
          object-fit: contain;
        }
      `}</style>

      {/* PAGE 1: MAIN CONTRACT */}
      <div className="page-container" style={{ marginBottom: '30px', padding: '32px' }}>
        <div className="content-body">
          {/* Header - Matching ReceiptTemplate style */}
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
                alt="Logo" 
                className="header-logo"
                style={{ maxWidth: '220px', width: '100%', height: 'auto', objectFit: 'contain' }}
                onError={(e) => e.target.style.display = 'none'}
              />
            </div>
            <div style={{ textAlign: 'left', minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <h1 style={{
                fontSize: 'clamp(18px, 4vw, 24px)',
                fontWeight: 'bold',
                margin: '0 0 4px 0',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                whiteSpace: 'normal',
                wordBreak: 'break-word'
              }}>
                SaharaX Rentals
              </h1>
              <p style={{ fontSize: '11px', color: '#718096', margin: '2px 0', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                Ave. Mohammed El Yazidi 43 Sect. 12 Bur. 34-3 Riad Rabat
              </p>
              <p style={{ fontSize: '11px', color: '#718096', margin: 0, whiteSpace: 'normal', wordBreak: 'break-word' }}>
                contact@saharax.co | +212658888852
              </p>
            </div>
          </div>

          {/* Title */}
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <h2 style={{
              fontSize: 'clamp(20px, 5vw, 28px)',
              fontWeight: '800',
              letterSpacing: '2px',
              color: '#2d3748',
              margin: '0 0 8px 0'
            }}>
              {tr('RENTAL AGREEMENT', 'CONTRAT DE LOCATION')}
            </h2>
            <div style={{
              display: 'inline-block',
              padding: '6px 16px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              borderRadius: '20px'
            }}>
              <span style={{ color: 'white', fontSize: '12px', fontWeight: '600' }}>
                {tr('Agreement #:', 'Contrat n° :')} {rental.rental_id || rental.id?.substring(0, 8).toUpperCase()}
              </span>
            </div>
          </div>

          {(rental.is_impounded || rental.released_from_impound_at) && (
            <div style={{
              marginBottom: '20px',
              padding: '16px',
              background: 'linear-gradient(135deg, #fff7ed 0%, #fffbeb 100%)',
              border: '1px solid #fcd34d',
              borderRadius: '12px'
            }}>
              <div style={{
                fontSize: '11px',
                color: '#92400e',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '8px',
                fontWeight: 700
              }}>
                {rental.is_impounded ? tr('Impound Notice', 'Avis de fourrière') : tr('Impound History', 'Historique de fourrière')}
              </div>
              <p style={{ fontSize: '14px', fontWeight: 600, color: '#92400e', margin: '0 0 6px 0' }}>
                {rental.is_impounded
                  ? tr('This rental is currently marked as impounded. The rental timer continues during impound.', 'Cette location est actuellement marquée comme mise en fourrière. Le chronomètre de location continue pendant la fourrière.')
                  : tr('This rental was impounded during the booking. The impound history remains attached to this contract preview.', "Cette location a été mise en fourrière pendant la réservation. L'historique de fourrière reste attaché à cet aperçu du contrat.")}
              </p>
              {rental.impounded_at && (
                <p style={{ fontSize: '13px', color: '#7c2d12', margin: '0 0 4px 0' }}>
                  {tr('Impounded at:', 'Mis en fourrière le :')} {new Date(rental.impounded_at).toLocaleString()}
                </p>
              )}
              {rental.impound_reason && (
                <p style={{ fontSize: '13px', color: '#7c2d12', margin: '0 0 4px 0' }}>
                  {tr('Reason:', 'Raison :')} {rental.impound_reason}
                </p>
              )}
              {rental.impound_reference && (
                <p style={{ fontSize: '13px', color: '#7c2d12', margin: '0 0 4px 0' }}>
                  {tr('Reference:', 'Référence :')} {rental.impound_reference}
                </p>
              )}
              {rental.impound_note && (
                <p style={{ fontSize: '13px', color: '#7c2d12', margin: '0 0 4px 0' }}>
                  {tr('Note:', 'Note :')} {rental.impound_note}
                </p>
              )}
              {rental.released_from_impound_at && (
                <p style={{ fontSize: '13px', color: '#7c2d12', margin: 0 }}>
                  {tr('Released from impound:', 'Sortie de fourrière le :')} {new Date(rental.released_from_impound_at).toLocaleString()}
                </p>
              )}
            </div>
          )}

          {/* Renter & Vehicle Details - Enhanced Cards */}
          <div className="details-grid" style={{ marginBottom: '24px' }}>
            {/* Renter Details Card */}
            <div className="info-card">
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '16px'
              }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <svg style={{ width: '16px', height: '16px', color: 'white' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <h3 className="section-title" style={{ margin: 0, border: 'none' }}>{tr('RENTER DETAILS', 'DÉTAILS DU LOCATAIRE')}</h3>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#718096', marginBottom: '2px' }}>{tr('Full Name', 'Nom complet')}</div>
                  <div style={{ fontSize: '15px', fontWeight: '600', color: '#2d3748' }}>{customerName}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#718096', marginBottom: '2px' }}>{tr('Phone Number', 'Numéro de téléphone')}</div>
                  <div style={{ fontSize: '15px', fontWeight: '600', color: '#2d3748' }}>{customerPhone}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#718096', marginBottom: '2px' }}>{tr('License Number', 'Numéro de permis')}</div>
                  <div style={{ fontSize: '15px', fontWeight: '600', color: '#2d3748' }}>{license}</div>
                </div>
              </div>
            </div>

            {/* Vehicle & Period Card */}
            <div className="info-card">
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '16px'
              }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  background: 'linear-gradient(135deg, #38a169 0%, #2f855a 100%)',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <svg style={{ width: '16px', height: '16px', color: 'white' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                </div>
                <h3 className="section-title" style={{ margin: 0, border: 'none' }}>{tr('VEHICLE & PERIOD', 'VÉHICULE & PÉRIODE')}</h3>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: '#4a5568' }}>{tr('Vehicle:', 'Véhicule :')}</span>
                  <span style={{ fontSize: '15px', fontWeight: '600', color: '#2d3748' }}>{vehicleName}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: '#4a5568' }}>{tr('Plate Number:', 'Plaque :')}</span>
                  <span style={{ fontSize: '15px', fontWeight: '600', color: '#2d3748' }}>{plateNumber}</span>
                </div>
                <div style={{ marginTop: '8px', padding: '12px', background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '12px', color: '#4a5568', marginBottom: '8px' }}>{tr('Rental Period', 'Période de location')}</div>
                  <div style={{ fontSize: '13px' }}>
                    <div style={{ marginBottom: '6px' }}>
                      <span style={{ color: '#718096' }}>{tr('From: ', 'Du : ')}</span>
                      <span style={{ fontWeight: '600' }}>{formatContractDate(startDate)}</span>
                    </div>
                    <div>
                      <span style={{ color: '#718096' }}>{tr('To: ', 'Au : ')}</span>
                      <span style={{ fontWeight: '600' }}>{formatContractDate(endDate)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <RentalFlowDisplay />

          {/* ODOMETER SECTION - Enhanced */}
          <div style={{
            background: 'linear-gradient(135deg, #ebf8ff 0%, #bee3f8 100%)',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '24px',
            border: '1px solid #90cdf4'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '16px'
            }}>
              <svg style={{ width: '20px', height: '20px', color: '#2b6cb0' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              <h3 className="section-title" style={{ margin: 0, color: '#2b6cb0', borderColor: '#2b6cb0' }}>{tr('ODOMETER READINGS', 'RELEVÉS DU COMPTEUR')}</h3>
            </div>
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px'
            }}>
              <div style={{
                background: 'white',
                padding: '16px',
                borderRadius: '10px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '11px', color: '#718096', marginBottom: '4px' }}>{tr('START ODOMETER', 'COMPTEUR DÉPART')}</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#2b6cb0' }}>{startOdo} km</div>
              </div>
              <div style={{
                background: 'white',
                padding: '16px',
                borderRadius: '10px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '11px', color: '#718096', marginBottom: '4px' }}>{tr('RETURN ODOMETER', 'COMPTEUR RETOUR')}</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#2b6cb0' }}>{endOdo} km</div>
              </div>
            </div>
            
            {startOdo !== "N/A" && endOdo !== "N/A" && (
              <div style={{
                marginTop: '12px',
                padding: '12px',
                background: 'white',
                borderRadius: '8px',
                textAlign: 'center'
              }}>
                <span style={{ fontSize: '13px', color: '#4a5568' }}>{tr('Total Distance: ', 'Distance totale : ')}</span>
                <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#2b6cb0' }}>
                  {parseInt(endOdo) - parseInt(startOdo)} km
                </span>
              </div>
            )}
          </div>

          {/* FUEL LEVEL SECTION - Enhanced matching ReceiptTemplate */}
          {startFuel !== "N/A" && (
            <div style={{
              background: 'linear-gradient(135deg, #fefcbf 0%, #faf089 100%)',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '24px',
              border: '1px solid #fbd38d'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '16px'
              }}>
                <svg style={{ width: '20px', height: '20px', color: '#b7791f' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <h3 className="section-title" style={{ margin: 0, color: '#b7791f', borderColor: '#b7791f' }}>{tr('FUEL INFORMATION', 'INFORMATIONS CARBURANT')}</h3>
              </div>
              
              <div className="fuel-gauge-container">
                {/* Start Fuel */}
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <div style={{
                    background: 'white',
                    padding: '16px',
                    borderRadius: '10px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#2d3748' }}>{tr('Fuel at Departure', 'Carburant au départ')}</div>
                        <div style={{ fontSize: '11px', color: '#718096' }}>{tr('8-line system', 'Système à 8 lignes')}</div>
                      </div>
                      <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#b7791f' }}>{startFuel}/8</div>
                    </div>
                    <div style={{ fontSize: '12px', color: '#4a5568', marginBottom: '4px' }}>{tr('Fuel Level Visual:', 'Niveau de carburant visuel :')}</div>
                    {renderFuelGauge(startFuel)}
                  </div>
                </div>

                {/* End Fuel */}
                {endFuel !== "N/A" && (
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <div style={{
                      background: 'white',
                      padding: '16px',
                      borderRadius: '10px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: '600', color: '#2d3748' }}>{tr('Fuel at Return', 'Carburant au retour')}</div>
                          <div style={{ fontSize: '11px', color: '#718096' }}>{tr('8-line system', 'Système à 8 lignes')}</div>
                        </div>
                        <div style={{ 
                          fontSize: '24px', 
                          fontWeight: 'bold', 
                          color: endFuel < startFuel ? '#c53030' : '#38a169'
                        }}>
                          {endFuel}/8
                        </div>
                      </div>
                      <div style={{ fontSize: '12px', color: '#4a5568', marginBottom: '4px' }}>{tr('Fuel Level Visual:', 'Niveau de carburant visuel :')}</div>
                      {renderFuelGauge(endFuel)}
                    </div>
                  </div>
                )}
              </div>

              {/* Fuel Deficit Warning */}
              {endFuel !== "N/A" && endFuel < startFuel && (
                <div style={{
                  marginTop: '16px',
                  padding: '16px',
                  background: '#fff5f5',
                  borderRadius: '8px',
                  border: '1px solid #feb2b2'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <svg style={{ width: '20px', height: '20px', color: '#c53030' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.998-.833-2.732 0L4.346 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <span style={{ fontSize: '14px', fontWeight: '600', color: '#c53030' }}>{tr('Fuel Deficit Detected', 'Déficit de carburant détecté')}</span>
                  </div>
                  <p style={{ fontSize: '13px', color: '#c53030', marginBottom: '8px' }}>
                    {tr(`Vehicle returned with ${startFuel - endFuel} lines less fuel than at departure.`, `Le véhicule a été rendu avec ${startFuel - endFuel} lignes de moins qu’au départ.`)}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* SIGNATURE SECTION - Enhanced */}
        <div className="signature-grid" style={{
          borderTop: '2px solid #e2e8f0',
          paddingTop: '32px',
          marginTop: '32px'
        }}>
          {/* Renter Signature */}
          <div style={{ textAlign: 'center' }}>
            <div style={{
              display: 'inline-block',
              padding: '4px 12px',
              background: '#f7fafc',
              borderRadius: '20px',
              fontSize: '11px',
              fontWeight: '600',
              color: '#718096',
              marginBottom: '12px'
            }}>
              {tr('RENTER SIGNATURE', 'SIGNATURE DU LOCATAIRE')}
            </div>
            <div style={{
              height: '80px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderBottom: '2px solid #e2e8f0',
              marginBottom: '8px'
            }}>
              {getCorrectSignatureUrl(rental.signature_url) && (
                <img 
                  src={getCorrectSignatureUrl(rental.signature_url)} 
                  alt="Signature" 
                  style={{ maxHeight: '70px', maxWidth: '100%', objectFit: 'contain' }}
                />
              )}
            </div>
            <div style={{ fontSize: '11px', color: '#a0aec0' }}>
              {new Date().toLocaleDateString(isFrench ? 'fr-FR' : 'en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
              })}
            </div>
          </div>

          {/* Company Stamp */}
          <div style={{ textAlign: 'center' }}>
            <div style={{
              display: 'inline-block',
              padding: '4px 12px',
              background: '#f7fafc',
              borderRadius: '20px',
              fontSize: '11px',
              fontWeight: '600',
              color: '#718096',
              marginBottom: '12px'
            }}>
              {tr('COMPANY STAMP', 'CACHET DE L’ENTREPRISE')}
            </div>
            <div style={{
              height: '80px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {stampUrl && (
                <img 
                  src={stampUrl} 
                  alt="Stamp" 
                  style={{ maxHeight: '70px', maxWidth: '100%', objectFit: 'contain', opacity: 0.8 }}
                />
              )}
            </div>
            <div style={{
              fontSize: '13px',
              fontWeight: '600',
              color: '#2d3748',
              marginTop: '8px'
            }}>
              {tr('SaharaX Representative', 'Représentant SaharaX')}
            </div>
          </div>
        </div>

        {/* Page 1 Footer */}
        <div style={{
          marginTop: '24px',
          textAlign: 'center',
          fontSize: '10px',
          color: '#a0aec0',
          borderTop: '1px solid #e2e8f0',
          paddingTop: '16px'
        }}>
          <span style={{ fontWeight: '600' }}>SaharaX Rentals Morocco</span> • Page 1/2
        </div>
      </div>

      {/* PAGE 2: FULL TERMS AND CONDITIONS */}
      <div className="page-container" style={{ padding: '32px' }}>
        <div className="content-body">
          {/* Terms Header */}
          <div style={{
            textAlign: 'center',
            marginBottom: '24px',
            paddingBottom: '16px',
            borderBottom: '3px solid #667eea'
          }}>
            <h2 style={{
              fontSize: 'clamp(18px, 4vw, 22px)',
              fontWeight: '800',
              letterSpacing: '1px',
              color: '#2d3748',
              margin: '0 0 8px 0'
            }}>
              {tr('TERMS & CONDITIONS', 'TERMES & CONDITIONS')}
            </h2>
            <p style={{
              fontSize: '12px',
              color: '#718096'
            }}>
              الشروط والأحكام
            </p>
          </div>

          {/* Terms Grid - French & Arabic */}
          <div className="terms-grid">
            {/* French Terms */}
            <div style={{
              padding: '0 16px 0 0',
              borderRight: '2px solid #e2e8f0'
            }}>
              <div style={{
                display: 'inline-block',
                padding: '4px 16px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                borderRadius: '20px',
                color: 'white',
                fontSize: '12px',
                fontWeight: '600',
                marginBottom: '16px'
              }}>
                FRANÇAIS
              </div>
              
              <div style={{ fontSize: '9.5px', lineHeight: '1.5', color: '#4a5568' }}>
                <div style={{ marginBottom: '16px' }}>
                  <h4 style={{ fontSize: '11px', fontWeight: '700', margin: '0 0 6px 0', color: '#2d3748' }}>Art. 1 - Responsabilité</h4>
                  <p style={{ margin: '0 0 4px 0' }}>1.1. Le locataire assume l'entière responsabilité de la conduite sûre et légale du quad pendant toute la durée de la location.</p>
                  <p style={{ margin: '0 0 4px 0' }}>1.2. La société n'est pas responsable des accidents, blessures ou décès du locataire, des passagers ou de tiers, ni des dommages matériels résultant de l'utilisation du quad.</p>
                  <p style={{ margin: '0 0 4px 0' }}>1.3. Le locataire est seul responsable de toute amende, sanction ou conséquence légale résultant d'infractions routières.</p>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <h4 style={{ fontSize: '11px', fontWeight: '700', margin: '0 0 6px 0', color: '#2d3748' }}>Art. 2 - Utilisation du Quad</h4>
                  <p style={{ margin: '0 0 4px 0' }}>2.1. Le quad ne peut être conduit que par la ou les personnes mentionnées dans le contrat de location.</p>
                  <p style={{ margin: '0 0 4px 0' }}>2.2. Il est interdit d'utiliser le quad pour des courses, des sauts, dans des zones interdites, ou pour remorquer.</p>
                  <p style={{ margin: '0 0 4px 0' }}>2.3. Le locataire doit porter un équipement de sécurité approprié, y compris un casque.</p>
                  <p style={{ margin: '0 0 4px 0' }}>2.4. Il est strictement interdit de conduire sous l'influence de l'alcool ou de drogues.</p>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <h4 style={{ fontSize: '11px', fontWeight: '700', margin: '0 0 6px 0', color: '#2d3748' }}>Art. 3 - État du Véhicule et Dommages</h4>
                  <p style={{ margin: '0 0 4px 0' }}>3.1. Le locataire reconnaît l'état du quad tel qu'indiqué dans le schéma d'inspection.</p>
                  <p style={{ margin: '0 0 4px 0' }}>3.2. Toute nouvelle rayure ou dommage au retour sera facturé au coût de réparation ou de remplacement.</p>
                  <p style={{ margin: '0 0 4px 0' }}>3.3. Le locataire est responsable des dommages aux pneus, jantes ou accessoires.</p>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <h4 style={{ fontSize: '11px', fontWeight: '700', margin: '0 0 6px 0', color: '#2d3748' }}>Art. 4 - Carburant et Accessoires</h4>
                  <p style={{ margin: '0 0 4px 0' }}>4.1. Restitution avec le même niveau de carburant, sous peine de frais de ravitaillement.</p>
                  <p style={{ margin: '0 0 4px 0' }}>4.2. Les frais de carburant sont calculés sur la base d'un système de 8 lignes à {fuelPricePerLine} MAD par ligne déficitaire.</p>
                  <p style={{ margin: '0 0 4px 0' }}>4.3. Pénalité de 2000 MAD en cas de perte, vol ou détérioration des documents du véhicule.</p>
                </div>

                <div>
                  <h4 style={{ fontSize: '11px', fontWeight: '700', margin: '0 0 6px 0', color: '#2d3748' }}>Art. 5 - Durée et Retards</h4>
                  <p style={{ margin: '0 0 4px 0' }}>5.2. Les retards entraînent des frais de 100 MAD par heure.</p>
                  <p style={{ margin: '0 0 4px 0' }}>5.3. Après 12h00 le lendemain, facturation d'une journée complète (24h).</p>
                </div>
              </div>
            </div>

            {/* Arabic Terms */}
            <div style={{ padding: '0 0 0 16px' }} dir="rtl">
              <div style={{
                display: 'inline-block',
                padding: '4px 16px',
                background: 'linear-gradient(135deg, #38a169 0%, #2f855a 100%)',
                borderRadius: '20px',
                color: 'white',
                fontSize: '12px',
                fontWeight: '600',
                marginBottom: '16px'
              }}>
                العربية
              </div>
              
              <div style={{ fontSize: '9.5px', lineHeight: '1.5', color: '#4a5568', textAlign: 'right' }}>
                <div style={{ marginBottom: '16px' }}>
                  <h4 style={{ fontSize: '11px', fontWeight: '700', margin: '0 0 6px 0', color: '#2d3748' }}>المادة 1 - المسؤولية</h4>
                  <p style={{ margin: '0 0 4px 0' }}>1.1. يتحمل المستأجر المسؤولية الكاملة عن القيادة الآمنة والقانونية للدراجة الرباعية طوال فترة الإيجار.</p>
                  <p style={{ margin: '0 0 4px 0' }}>1.2. لا تتحمل الشركة أي مسؤولية عن أي حوادث أو إصابات أو وفاة للمستأجر أو الركاب أو الأطراف الثالثة.</p>
                  <p style={{ margin: '0 0 4px 0' }}>1.3. يكون المستأجر مسؤولاً عن أي غرامات أو مخالفات قانونية نتيجة مخالفات المرور أو الإهمال.</p>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <h4 style={{ fontSize: '11px', fontWeight: '700', margin: '0 0 6px 0', color: '#2d3748' }}>المادة 2 - استخدام الدراجة الرباعية</h4>
                  <p style={{ margin: '0 0 4px 0' }}>2.1. لا يجوز قيادة الدراجة إلا من قبل الأشخاص المذكورين في عقد الإيجار.</p>
                  <p style={{ margin: '0 0 4px 0' }}>2.2. يمنع استخدام الدراجة في السباقات أو القفزات أو المناطق الممنوعة أو الجر.</p>
                  <p style={{ margin: '0 0 4px 0' }}>2.3. يجب على المستأجر ارتداء معدات السلامة والخوذة في جميع الأوقات أثناء القيادة.</p>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <h4 style={{ fontSize: '11px', fontWeight: '700', margin: '0 0 6px 0', color: '#2d3748' }}>المادة 3 - حالة المركبة والأضرار</h4>
                  <p style={{ margin: '0 0 4px 0' }}>3.1. يقر المستأجر بحالة الدراجة كما هو موضح في مخطط فحص المركبة عند بداية الإيجار.</p>
                  <p style={{ margin: '0 0 4px 0' }}>3.2. أي خدوش أو أضرار جديدة عند الإرجاع سيتم تحميل المستأجر تكاليف إصلاحها.</p>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <h4 style={{ fontSize: '11px', fontWeight: '700', margin: '0 0 6px 0', color: '#2d3748' }}>المادة 4 - الوقود والإكسسوارات</h4>
                  <p style={{ margin: '0 0 4px 0' }}>4.1. يجب إعادة الدراجة بنفس مستوى الوقود كما كانت عند الاستلام.</p>
                  <p style={{ margin: '0 0 4px 0' }}>4.2. يتم حساب رسوم الوقود على أساس نظام من 8 خطوط بسعر {fuelPricePerLine} درهم مغربي لكل خط ناقص.</p>
                  <p style={{ margin: '0 0 4px 0' }}>4.3. غرامة 2000 درهم مغربي في حالة فقدان أو سرقة أو إتلاف أي من وثائق المركبة.</p>
                </div>

                <div>
                  <h4 style={{ fontSize: '11px', fontWeight: '700', margin: '0 0 6px 0', color: '#2d3748' }}>المادة 5 - مدة الايجار والرسوم الإضافية</h4>
                  <p style={{ margin: '0 0 4px 0' }}>5.2. يتم فرض رسوم تأخير قدرها 100 درهم مغربي لكل ساعة.</p>
                  <p style={{ margin: '0 0 4px 0' }}>5.3. بعد الساعة 12:00 ظهراً من اليوم التالي، يتم احتساب تكلفة يوم كامل.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Terms Footer Note */}
          <div style={{
            marginTop: '32px',
            padding: '16px',
            background: '#f7fafc',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            fontSize: '10px',
            color: '#4a5568',
            textAlign: 'center'
          }}>
            <p style={{ margin: 0 }}>
              {tr('By signing this agreement, the renter acknowledges having read, understood, and accepted all terms and conditions.', 'En signant cet accord, le locataire reconnaît avoir lu, compris et accepté tous les termes et conditions.')}
            </p>
          </div>
        </div>

        {/* Page 2 Footer */}
        <div style={{
          marginTop: '32px',
          textAlign: 'center',
          fontSize: '10px',
          color: '#a0aec0',
          borderTop: '1px solid #e2e8f0',
          paddingTop: '16px'
        }}>
          <span style={{ fontWeight: '600' }}>SaharaX Rentals Morocco</span> • Page 2/2
        </div>
      </div>
    </div>
  );
};

export default ContractTemplate;
