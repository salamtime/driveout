import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { formatMaintenanceReference } from '../utils/maintenanceReference';
import { calculateSimpleRentalPricing, isPackagePricingEnabled } from '../utils/simpleRentalPricing';
import { buildRentalBookedPackageSnapshot } from '../utils/rentalPackageSnapshot';
import i18n from '../i18n';
import { fetchSystemSettings } from '../services/systemSettingsApi';
import { formatDailyReturnPolicyTime, isDailyRentalType, normalizeDailyReturnPolicy } from '../utils/dailyReturnPolicy';

const DEFAULT_BOOKING_GRACE_MINUTES = 120;

const normalizeBookingGraceMinutes = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_BOOKING_GRACE_MINUTES;
  return Math.min(120, Math.max(0, Math.round(parsed)));
};

const formatGracePeriodLabel = (minutes, tr) => {
  if (minutes === 60) return tr('1 hour', '1 heure');
  if (minutes > 0 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return tr(`${hours} hours`, `${hours} heures`);
  }
  return tr(`${minutes} minutes`, `${minutes} minutes`);
};

const BANK_TRANSFER_IMAGE_URL = '/images/bank-transfer-qr.png';

const RECEIPT_BANKING_DETAILS = {
  rib: '007640000537500000122321',
};

const getRentalKilometerPackage = (rental) => {
  const embeddedIncludedKm = Number(
    rental?.included_kilometers_applied ??
    rental?.package_total_included_km ??
    rental?.selected_package_total_included_km ??
    0
  ) || 0;
  const embeddedExtraKmRate = Number(
    rental?.extra_km_rate_applied ??
    rental?.package_extra_rate ??
    rental?.selected_package_extra_rate ??
    0
  ) || 0;
  const hasEmbeddedDistanceRule = embeddedIncludedKm > 0 && embeddedExtraKmRate > 0;

  if (!isPackagePricingEnabled(rental) && !hasEmbeddedDistanceRule) return null;
  const fallbackPackage = hasEmbeddedDistanceRule
    ? {
        id: rental?.package_id || rental?.selected_package_id || 'listing-distance-rule',
        name: rental?.package_name || rental?.selected_package_name || 'Listing distance rule',
        package_name: rental?.package_name || rental?.selected_package_name || 'Listing distance rule',
        extra_km_rate: embeddedExtraKmRate,
        total_included_kilometers_snapshot: embeddedIncludedKm,
      }
    : null;
  const pkg = buildRentalBookedPackageSnapshot(rental, rental?.package || fallbackPackage);
  if (!pkg) return null;

  const hasLinkedPackage = Boolean(
    rental?.package_id ||
    rental?.selected_package_id ||
    rental?.package?.id ||
    rental?.package_name ||
    rental?.selected_package_name ||
    pkg?.id
  );
  const hasKmConfig =
    pkg.included_kilometers !== null && pkg.included_kilometers !== undefined ||
    pkg.extra_km_rate !== null && pkg.extra_km_rate !== undefined ||
    pkg.total_included_kilometers_snapshot !== null && pkg.total_included_kilometers_snapshot !== undefined;

  return hasLinkedPackage && hasKmConfig ? pkg : null;
};

const getRentalDurationUnits = (rental) =>
  rental?.rental_type === 'hourly'
    ? (rental?.quantity_hours ?? rental?.quantity_days ?? 1)
    : (rental?.quantity_days ?? 1);

const getPackageTotalIncludedKilometers = (rental, pkg = null) => {
  const resolvedPackage = pkg || getRentalKilometerPackage(rental);
  if (!resolvedPackage) return 0;

  const appliedIncludedKm = Number.parseFloat(
    resolvedPackage?.total_included_kilometers_snapshot ??
    rental?.included_kilometers_applied ??
    rental?.package_total_included_km ??
    rental?.selected_package_total_included_km ??
    0
  ) || 0;
  if (appliedIncludedKm > 0) return appliedIncludedKm;

  const includedPerUnit = Number.parseFloat(resolvedPackage?.included_kilometers || 0) || 0;
  if (!includedPerUnit) return 0;

  return includedPerUnit * Number(getRentalDurationUnits(rental) || 1);
};

const getDisplayRentalDurationUnits = (rental) => {
  if (rental?.rental_type !== 'hourly') {
    return Number(getRentalDurationUnits(rental));
  }

  const startValue = rental?.started_at || rental?.start_date || rental?.rental_start_date;
  const endValue = rental?.actual_end_date || rental?.end_date || rental?.rental_end_date;

  if (startValue && endValue) {
    const start = new Date(startValue);
    const end = new Date(endValue);
    const diffMs = end.getTime() - start.getTime();

    if (Number.isFinite(diffMs) && diffMs > 0) {
      const rawHours = diffMs / (1000 * 60 * 60);
      const roundedHalfHours = Math.round(rawHours * 2) / 2;
      if (roundedHalfHours > 0) {
        return roundedHalfHours;
      }
    }
  }

  return Number(getRentalDurationUnits(rental));
};

const getCompletedHourlyElapsedMinutes = (rental) => {
  if (rental?.rental_type !== 'hourly') return null;
  const isCompletedRental =
    String(rental?.rental_status || '').toLowerCase() === 'completed' ||
    Boolean(rental?.completed_at);
  if (!isCompletedRental) return null;

  const startValue = rental?.started_at || rental?.start_date || rental?.rental_start_date;
  const endValue = rental?.actual_end_date || rental?.end_date || rental?.rental_end_date;
  const start = new Date(startValue || '');
  const end = new Date(endValue || '');
  const diffMs = end.getTime() - start.getTime();

  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || !Number.isFinite(diffMs) || diffMs <= 0) {
    return null;
  }

  return Math.max(1, Math.round(diffMs / 60000));
};

const formatExactHourlyDurationSummary = (minutes, tr) => {
  const safeMinutes = Math.max(0, Math.round(Number(minutes || 0) || 0));
  if (safeMinutes <= 0) return tr('0 min', '0 min');
  if (safeMinutes < 60) return tr(`${safeMinutes} min`, `${safeMinutes} min`);

  const hours = Math.floor(safeMinutes / 60);
  const remainingMinutes = safeMinutes % 60;

  if (remainingMinutes <= 0) {
    return tr(`${hours} hr${hours > 1 ? 's' : ''}`, `${hours} h`);
  }

  return tr(`${hours}h ${remainingMinutes}m`, `${hours} h ${remainingMinutes} min`);
};

const formatReceiptScheduleDateTime = (value, isFrench, tr) => {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return tr('Not scheduled', 'Non planifié');
  return date.toLocaleString(isFrench ? 'fr-FR' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatRentalDurationSummary = (rental, tr) => {
  const duration = getDisplayRentalDurationUnits(rental);
  if (rental?.rental_type === 'hourly') {
    const completedElapsedMinutes = getCompletedHourlyElapsedMinutes(rental);
    if (completedElapsedMinutes) {
      return formatExactHourlyDurationSummary(completedElapsedMinutes, tr);
    }
    if (duration === 0.5) return tr('30 min', '30 min');
    if (duration === 1) return tr('1 hr', '1 h');
    if (duration === 1.5) return tr('1.5 hrs', '1,5 h');
    return tr(`${duration} hrs`, `${duration} h`);
  }

  if (duration === 1) return tr('1 day', '1 jour');
  return tr(`${duration} days`, `${duration} jours`);
};

const isFlatHourlyTierRental = (rental, hasPackage = false) => {
  const duration = Number(getDisplayRentalDurationUnits(rental));
  return !hasPackage && rental?.rental_type === 'hourly' && duration === 1.5;
};

const getAmountDueResolutionMeta = (rental = {}) => {
  const rawReason =
    typeof rental?.amount_due_override_reason === 'string'
      ? rental.amount_due_override_reason.trim()
      : '';
  if (!rawReason || !rawReason.startsWith('{')) return null;

  try {
    const parsed = JSON.parse(rawReason);
    const paymentReceivedNow = Math.max(0, Number(parsed?.paymentReceivedNow || 0) || 0);
    const companyDiscount = Math.max(0, Number(parsed?.companyDiscount || 0) || 0);
    const note = String(parsed?.note || '').trim();
    const customerFacingNote = String(parsed?.customerFacingNote || '').trim();
    const transportFeeAmount = Math.max(0, Number(parsed?.transportFeeAmount || 0) || 0);
    const transportFeeNote = String(parsed?.transportFeeNote || '').trim();
    const transportFeeReceiptUrl = parsed?.transportFeeReceiptUrl || null;
    const transportFeeReceiptName = String(parsed?.transportFeeReceiptName || '').trim();
    const previousAmount = Math.max(0, Number(rental?.amount_due_override_previous_amount || 0) || 0);
    const newAmount = Math.max(0, Number(rental?.remaining_amount || 0) || 0);
    const expectedNewAmount = Math.max(0, previousAmount - paymentReceivedNow - companyDiscount);

    if (paymentReceivedNow <= 0 && companyDiscount <= 0 && transportFeeAmount <= 0 && !transportFeeNote && !transportFeeReceiptUrl && !transportFeeReceiptName && !note && !customerFacingNote && previousAmount <= 0 && newAmount <= 0) {
      return null;
    }

    if (transportFeeAmount <= 0 && previousAmount > 0 && Math.abs(expectedNewAmount - newAmount) > 1) {
      return null;
    }

    const hasResolutionFields =
      paymentReceivedNow > 0 ||
      companyDiscount > 0 ||
      note.length > 0 ||
      customerFacingNote.length > 0 ||
      previousAmount > 0;

    return {
      hasResolutionFields,
      paymentReceivedNow,
      companyDiscount,
      transportFeeAmount,
      transportFeeNote,
      transportFeeReceiptUrl,
      transportFeeReceiptName,
      note,
      customerFacingNote,
      previousAmount,
      newAmount,
    };
  } catch {
    return null;
  }
};

const getPriceOverrideMeta = (rental = {}) => {
  const rawReason =
    typeof rental?.price_override_reason === 'string'
      ? rental.price_override_reason.trim()
      : '';
  if (!rawReason || !rawReason.startsWith('{')) return null;

  try {
    const parsed = JSON.parse(rawReason);
    const previousPrice = Math.max(0, Number(parsed?.previousPrice || 0) || 0);
    const newPrice = Math.max(0, Number(parsed?.newPrice || rental?.total_amount || 0) || 0);
    const note = String(parsed?.note || '').trim();

    if (previousPrice <= 0 && newPrice <= 0 && !note) {
      return null;
    }

    return {
      previousPrice,
      newPrice,
      note,
      editedByName: String(parsed?.editedByName || '').trim(),
      editedAt: parsed?.editedAt || null,
    };
  } catch {
    return null;
  }
};

const translateMaintenanceSummaryItem = (value, tr) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return value;

  const dictionary = {
    'body repair': tr('Body Repair', 'Réparation carrosserie'),
    'oil change': tr('Oil Change', 'Vidange'),
    'brake service': tr('Brake Service', 'Service de freinage'),
    'tire service': tr('Tire Service', 'Service pneus'),
    'filter replacement': tr('Filter Replacement', 'Remplacement de filtre'),
    'engine service': tr('Engine Service', 'Service moteur'),
    'transmission service': tr('Transmission Service', 'Service transmission'),
    'electrical service': tr('Electrical Service', 'Service électrique'),
    'general inspection': tr('General Inspection', 'Inspection générale'),
    'repair': tr('Repair', 'Réparation'),
    'other': tr('Other', 'Autre'),
  };

  return dictionary[normalized] || value;
};

const getEffectiveRentalBaseTotal = (rental, hasPackage = false, packageRate = null) => {
  const duration = getRentalDurationUnits(rental);
  const fallbackRate = Number(rental?.unit_price || 0) || 0;
  const rate = packageRate ?? fallbackRate;
  return isFlatHourlyTierRental(rental, hasPackage) ? rate : rate * duration;
};

const normalizeReceiptPackageCandidate = (pkg = {}) => ({
  ...pkg,
  includedKilometers: Number(
    pkg?.includedKilometers ??
    pkg?.included_kilometers ??
    pkg?.includedKm ??
    0
  ) || 0,
  extraKmRate: Number(
    pkg?.extraKmRate ??
    pkg?.extra_km_rate ??
    0
  ) || 0,
});

const isUnlimitedReceiptPackage = (pkg = {}) => {
  const kind = String(pkg?.kind ?? pkg?.package_type ?? pkg?.type ?? '').toLowerCase();
  const name = String(
    pkg?.name ??
    pkg?.package_name ??
    pkg?.display_name ??
    pkg?.displayName ??
    ''
  ).toLowerCase();

  return (
    kind.includes('unlimited') ||
    name.includes('unlimited') ||
    name.includes('illimité')
  );
};

const formatReceiptDurationLabel = (minutes, billedHours, tr) => {
  const safeMinutes = Number(minutes || 0);
  const safeBilledHours = Number(billedHours || 0);
  if (safeMinutes <= 0) return tr('Not available', 'Non disponible');
  if (safeMinutes === 30) return tr('30 minutes used', '30 minutes utilisées');
  if (safeMinutes < 60) return tr(`${safeMinutes} minutes used`, `${safeMinutes} minutes utilisées`);
  const hours = (safeMinutes / 60).toFixed(safeMinutes % 60 === 0 ? 0 : 1);
  if (safeBilledHours > 0) {
    return tr(`${hours} hours used • ${safeBilledHours} billed`, `${String(hours).replace('.', ',')} heures utilisées • ${safeBilledHours} facturée${safeBilledHours > 1 ? 's' : ''}`);
  }
  return tr(`${hours} hours used`, `${String(hours).replace('.', ',')} heures utilisées`);
};

const formatReceiptKilometers = (value) => {
  const numeric = Number(value || 0);
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: Number.isInteger(numeric) ? 0 : 1,
    maximumFractionDigits: Number.isInteger(numeric) ? 0 : 1,
  }).format(numeric);
};

const resolveReceiptStandardRate = ({
  rental,
  vehicleModelId,
  basePrices,
  vehicleName,
  isHourly,
  isDaily,
}) => {
  let standardRate = 0;
  let priceSource = 'fallback';

  if (vehicleModelId && Array.isArray(basePrices) && basePrices.length > 0) {
    const basePrice = basePrices.find((price) => price.vehicle_model_id === vehicleModelId);
    if (basePrice) {
      if (isHourly && Number(basePrice.hourly_price) > 0) {
        standardRate = parseFloat(basePrice.hourly_price);
        priceSource = 'database';
      } else if (isDaily && Number(basePrice.daily_price) > 0) {
        standardRate = parseFloat(basePrice.daily_price);
        priceSource = 'database';
      }
    }
  }

  if (standardRate === 0) {
    if (isHourly && rental?.vehicle?.vehicle_model?.hourly_price) {
      standardRate = parseFloat(rental.vehicle.vehicle_model.hourly_price);
      priceSource = 'vehicle_model';
    } else if (isDaily && rental?.vehicle?.vehicle_model?.daily_price) {
      standardRate = parseFloat(rental.vehicle.vehicle_model.daily_price);
      priceSource = 'vehicle_model';
    }
  }

  if (standardRate === 0) {
    if (isHourly && rental?.vehicle?.hourly_rate) {
      standardRate = parseFloat(rental.vehicle.hourly_rate);
      priceSource = 'vehicle_rate';
    } else if (isDaily && rental?.vehicle?.daily_rate) {
      standardRate = parseFloat(rental.vehicle.daily_rate);
      priceSource = 'vehicle_rate';
    }
  }

  if (standardRate === 0) {
    const vehicleNameUpper = String(vehicleName || '').toUpperCase();
    if (vehicleNameUpper.includes('AT6')) {
      standardRate = isHourly ? 599 : 1999;
    } else if (vehicleNameUpper.includes('AT5')) {
      standardRate = isHourly ? 399 : 1499;
    } else if (vehicleNameUpper.includes('AT10')) {
      standardRate = isHourly ? 999 : 3499;
    } else {
      standardRate = isHourly ? 400 : 1500;
    }
  }

  return { rate: standardRate, source: priceSource };
};

const ReceiptTemplate = ({ rental, logoUrl, stampUrl, bookingGraceMinutes = DEFAULT_BOOKING_GRACE_MINUTES, language = 'fr', amountDueResolutionMetaOverride = null }) => {
  const isFrench = language === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  if (!rental) return <div className="p-10 text-center">{tr('No rental data available.', 'Aucune donnée de location disponible.')}</div>;
  const normalizedReceiptLogoUrl = String(logoUrl || '').trim().toLowerCase();
  const normalizedReceiptBrand = String(rental?.document_brand || rental?.company_name || rental?.company_legal_name || '').trim().toLowerCase();
  const isDriveOutMarketplaceReceipt = Boolean(
    rental?.is_driveout_marketplace_document ||
    rental?.source_type === 'driveout_marketplace' ||
    rental?.source_context === 'driveout_marketplace_request' ||
    rental?.marketplace_request_id ||
    rental?.marketplace_request_reference ||
    normalizedReceiptBrand.includes('driveout') ||
    normalizedReceiptLogoUrl.includes('driveout')
  );
  const receiptBrandName = isDriveOutMarketplaceReceipt ? 'DriveOut' : (rental?.company_name || 'SaharaX Rentals');
  const receiptBrandLegalName = isDriveOutMarketplaceReceipt ? 'DriveOut Marketplace' : (rental?.company_legal_name || 'SaharaX Rentals Morocco');
  const receiptBrandContact = isDriveOutMarketplaceReceipt ? 'www.driveout.io' : (rental?.company_contact || 'contact@saharax.co | +212 658 888 852');
  const resolvedReceiptLogoUrl = isDriveOutMarketplaceReceipt
    ? (normalizedReceiptLogoUrl && !normalizedReceiptLogoUrl.includes('saharax') && !normalizedReceiptLogoUrl.includes('logo.jpg')
        ? logoUrl
        : '/assets/driveout-mark.svg')
    : (logoUrl || '/assets/logo.jpg');
  const getReceiptSignatureUrl = (url) => {
    if (!url) return null;
    if (String(url).startsWith('http')) return url;
    const supabaseProjectUrl = import.meta.env.VITE_SUPABASE_URL || supabase?.supabaseUrl;
    return supabaseProjectUrl
      ? `${supabaseProjectUrl}/storage/v1/object/public/signatures/${url}`
      : url;
  };

  const [basePrices, setBasePrices] = useState([]);
  const [kilometerPackages, setKilometerPackages] = useState([]);
  const [loadingPrices, setLoadingPrices] = useState(() => !isDriveOutMarketplaceReceipt);
  const [isMobileLayout, setIsMobileLayout] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 640 : false
  );
  const [dailyReturnPolicy, setDailyReturnPolicy] = useState(() => normalizeDailyReturnPolicy());
  const vehicleName = (
    rental.vehicle?.name ||
    rental.vehicle?.model ||
    rental.vehicle?.vehicle_model?.model ||
    rental.vehicle?.vehicle_model?.name ||
    rental.vehicle_details?.name ||
    rental.vehicle_details?.model ||
    rental.vehicle_name_snapshot ||
    rental.vehicle_model_snapshot ||
    rental.selected_vehicle_name_snapshot ||
    rental.selected_vehicle_model_snapshot ||
    rental.vehicle_label_snapshot ||
    'N/A'
  );
  const plateNumber = (
    rental.vehicle?.plate_number ||
    rental.vehicle_details?.plate_number ||
    rental.vehicle_plate_number ||
    rental.selected_vehicle_plate_snapshot ||
    rental.plate_number_snapshot ||
    'N/A'
  );
  const vehicleModelId = rental.vehicle?.vehicle_model?.id || rental.vehicle?.vehicle_model_id;
  const isFinalPaymentReceipt =
    String(rental?.payment_status || '').toLowerCase() === 'paid' &&
    String(rental?.rental_status || '').toLowerCase() === 'completed' &&
    !rental?.impound_is_estimate;
  const receiptTitle = isFinalPaymentReceipt ? tr('PAYMENT RECEIPT', 'REÇU DE PAIEMENT') : tr('ESTIMATE RECEIPT', 'REÇU ESTIMATIF');
  const receiptSubtitle = isFinalPaymentReceipt
    ? tr('Official Payment Receipt • Valid for Accounting', 'Reçu de paiement officiel • Valable pour la comptabilité')
    : tr('Estimated Charges Preview • Subject to Final Release', 'Aperçu des frais estimés • Sous réserve de la libération finale');
  const shouldShowDailyReturnPolicy = isDailyRentalType(rental?.rental_type);
  const dailyReturnTimeLabel = formatDailyReturnPolicyTime(dailyReturnPolicy, isFrench ? 'fr-MA' : 'en-US');
  const dailyReturnPolicyHeadline = tr(
    `Back before ${dailyReturnTimeLabel} the next day`,
    `Retour avant ${dailyReturnTimeLabel} le lendemain`
  );
  const dailyReturnPolicyBody = tr(
    `Late return: ${dailyReturnPolicy.dailyLateReturnHourlyPenaltyMad} MAD per extra hour. After ${dailyReturnPolicy.dailyLateReturnFullDayThresholdHours} hours, a full extra day is charged.`,
    `Retour tardif : ${dailyReturnPolicy.dailyLateReturnHourlyPenaltyMad} MAD par heure supplémentaire. Après ${dailyReturnPolicy.dailyLateReturnFullDayThresholdHours} heures, une journée complète est facturée.`
  );
  
  // Fetch base prices from database
  useEffect(() => {
    if (isDriveOutMarketplaceReceipt) {
      setBasePrices([]);
      setKilometerPackages([]);
      setLoadingPrices(false);
      return undefined;
    }

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
          console.error('❌ Error loading rental km packages:', packageError);
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
  }, [isDriveOutMarketplaceReceipt, vehicleModelId]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleResize = () => {
      setIsMobileLayout(window.innerWidth <= 640);
    };

    handleResize();
    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadDailyReturnPolicy = async () => {
      try {
        const data = await fetchSystemSettings();
        if (!cancelled && data) {
          setDailyReturnPolicy(normalizeDailyReturnPolicy(data));
        }
      } catch {
        if (!cancelled) {
          setDailyReturnPolicy(normalizeDailyReturnPolicy());
        }
      }
    };

    loadDailyReturnPolicy();
    return () => {
      cancelled = true;
    };
  }, []);

  // Data Fetching logic
  // Check if rental has a package
  const kilometerPackage = getRentalKilometerPackage(rental);
  const hasPackage = !!kilometerPackage;
  const receiptPackageUpgradeSummary = rental?.package_upgrade_summary || null;
  const embeddedAmountDueResolutionMeta = rental?.amount_due_resolution_meta || null;
  const amountDueResolutionMeta = amountDueResolutionMetaOverride || embeddedAmountDueResolutionMeta || getAmountDueResolutionMeta(rental);

  // Enhanced package breakdown calculation
  const packageBreakdown = React.useMemo(() => {
    if (!hasPackage || !rental) return null;
    
    const pkg = kilometerPackage;
    if (!pkg) return null;
    
    const isHourly = rental.rental_type === 'hourly';
    const isDaily = rental.rental_type === 'daily';
    
    const duration = getRentalDurationUnits(rental);
    const ratePerUnit = parseFloat(pkg.fixed_amount) || rental.unit_price || 0;
    const packageTotal = rental?.use_package_pricing ? ratePerUnit : ratePerUnit * duration;
    const includedKm = pkg.included_kilometers ? parseFloat(pkg.included_kilometers) : null;
    const extraRate = parseFloat(pkg.extra_km_rate) || 0;
    const totalIncludedKm = includedKm
      ? getPackageTotalIncludedKilometers(rental, pkg)
      : null;
    
    return {
      name: pkg.name || (isFrench ? 'Forfait kilométrique' : 'Kilometer Package'),
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

  const receiptPackageCatalog = React.useMemo(() => {
    const catalog = (Array.isArray(kilometerPackages) ? kilometerPackages : []).map(normalizeReceiptPackageCandidate);
    const linked = kilometerPackage ? normalizeReceiptPackageCandidate(kilometerPackage) : null;
    const all = linked
      ? [...catalog, linked]
      : catalog;

    return all
      .filter((pkg) => Number(pkg?.includedKilometers || 0) > 0)
      .filter((pkg, index, arr) => arr.findIndex((entry) => String(entry.id || entry.includedKilometers) === String(pkg.id || pkg.includedKilometers)) === index)
      .sort((left, right) => Number(left.includedKilometers || 0) - Number(right.includedKilometers || 0));
  }, [kilometerPackage, kilometerPackages]);

  const resolveReceiptDistanceKm = React.useCallback((source) => {
    const directDistance = Number(
      source?.total_kilometers_driven ??
      source?.total_distance
    );
    if (Number.isFinite(directDistance) && directDistance > 0) {
      return directDistance;
    }

    const startOdometer = Number(source?.start_odometer);
    const endOdometer = Number(source?.ending_odometer);
    if (Number.isFinite(startOdometer) && Number.isFinite(endOdometer) && endOdometer >= startOdometer) {
      return endOdometer - startOdometer;
    }

    return 0;
  }, []);

  const receiptSimplePricing = React.useMemo(() => {
    const startTime = rental?.started_at || rental?.start_date || rental?.rental_start_date || null;
    const endTime = rental?.actual_end_date || rental?.end_date || rental?.rental_end_date || null;
    const totalKmUsed = resolveReceiptDistanceKm(rental);

    const hourlyRate = rental?.rental_type === 'daily'
      ? ((Number(rental?.daily_rate || rental?.vehicle?.daily_rate || rental?.vehicle?.vehicle_model?.daily_price || 0) || 0) / 24)
      : (Number(rental?.hourly_rate || rental?.vehicle?.hourly_rate || rental?.vehicle?.vehicle_model?.hourly_price || rental?.unit_price || 0) || 0);

    return calculateSimpleRentalPricing({
      startTime,
      endTime,
      gracePeriodMinutes: normalizeBookingGraceMinutes(
        bookingGraceMinutes ?? rental?.booking_grace_period_minutes ?? rental?.rentalGracePeriodMinutes
      ),
      hourlyRate,
      totalKmUsed,
      packages: kilometerPackage ? [kilometerPackage] : receiptPackageCatalog,
    });
  }, [bookingGraceMinutes, kilometerPackage, receiptPackageCatalog, rental, resolveReceiptDistanceKm]);

  const receiptDistanceUpgrade = React.useMemo(() => {
    if (receiptPackageUpgradeSummary?.upgraded) {
      return receiptPackageUpgradeSummary;
    }
    if (kilometerPackage) return null;
    if (!receiptSimplePricing?.selectedPackage || receiptPackageCatalog.length < 2) return null;

    const finalLimit = Number(receiptSimplePricing.packageLimitKm || 0);
    const finalIndex = receiptPackageCatalog.findIndex((pkg) => Number(pkg.includedKilometers || 0) === finalLimit);
    if (finalIndex <= 0) return null;

    const previousPackage = receiptPackageCatalog[finalIndex - 1];
    const previousLimit = Number(previousPackage?.includedKilometers || 0);
    const kmUsed = Number(receiptSimplePricing.kmUsed || 0);
    if (kmUsed <= previousLimit) return null;

    return {
      previousPackage,
      previousLimit,
      originalPackageName: previousPackage?.name || previousPackage?.package_name,
      originalPackageLimitKm: previousLimit,
      finalPackage: receiptSimplePricing.selectedPackage,
      finalLimit,
      appliedPackageName: receiptSimplePricing.selectedPackage?.name || receiptSimplePricing.selectedPackage?.package_name,
      appliedPackageLimitKm: finalLimit,
      kmUsed,
      totalDistanceKm: kmUsed,
    };
  }, [kilometerPackage, receiptPackageCatalog, receiptPackageUpgradeSummary, receiptSimplePricing]);

  // Enhanced tier pricing breakdown calculation (only shown when no package)
  const tierPricingBreakdown = React.useMemo(() => {
    if (hasPackage || !rental) return null;
    
    // Determine if hourly or daily
    const isHourly = rental.rental_type === 'hourly';
    const isDaily = rental.rental_type === 'daily';
    
    if (!isHourly && !isDaily) return null;
    
    const duration = getDisplayRentalDurationUnits(rental);
    const tierRate = Number(rental.unit_price || 0) || 0;
    const isFlatTier = isFlatHourlyTierRental(rental, hasPackage);
    
    const { rate: standardRate, source: priceSource } = resolveReceiptStandardRate({
      rental,
      vehicleModelId,
      basePrices,
      vehicleName,
      isHourly,
      isDaily,
    });
    
    if (standardRate <= 0 || tierRate <= 0) return null;
    
    const standardTotal = isFlatTier ? standardRate : duration * standardRate;
    const tierTotal = isFlatTier ? tierRate : duration * tierRate;
    const savings = Math.max(0, standardTotal - tierTotal);
    const savingsPercentage = standardTotal > 0 ? ((savings / standardTotal) * 100).toFixed(1) : 0;
    const isDiscounted = savings > 0;
    
    const getTierDescription = () => {
      if (isHourly) {
        if (duration === 1) return tr("1-hour standard rate", "Tarif standard 1 heure");
        if (duration === 1.5) return tr("1.5-hour special rate", "Tarif spécial 1,5 heure");
        if (duration === 2) return tr("2-hour special rate", "Tarif spécial 2 heures");
        if (duration === 3) return tr("3-hour package deal", "Offre package 3 heures");
        if (duration >= 4 && duration < 24) return isFrench ? `Pack ${duration} heures` : `${duration}-hour bundle`;
        if (duration >= 24) return tr("Daily package", "Package journalier");
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
      isDaily: isDaily,
      isFlatTier,
      hasMatchedTier: priceSource === 'database'
    };
  }, [rental, vehicleName, vehicleModelId, basePrices, hasPackage]);

  const hasRecordedReturnFuel = (
    rental?.end_fuel_level !== null &&
    rental?.end_fuel_level !== undefined
  ) || String(rental?.rental_status || '').toLowerCase() === 'completed';
  const effectiveFuelCharge = rental.fuel_charge_enabled === false || !hasRecordedReturnFuel
    ? 0
    : (rental.fuel_charge || 0);
  const correctedPaidAmount = rental.fuel_charge_enabled === false
    ? (parseFloat(rental.deposit_amount || 0) || 0)
    : Math.max(
        0,
        (parseFloat(rental.deposit_amount || 0) || 0) - ((parseFloat(rental.fuel_charge || 0) || 0) - effectiveFuelCharge)
      );
  const transportFeeAmount = Math.max(0, Number(amountDueResolutionMeta?.transportFeeAmount || 0) || 0);
  const transportFeeNote = String(amountDueResolutionMeta?.transportFeeNote || '').trim();

  const getReceiptBasePrice = () => {
    const pkg = kilometerPackage;
    if (pkg && rental?.use_package_pricing) {
      const ratePerUnit = Number(parseFloat(pkg.fixed_amount) || rental?.unit_price || 0) || 0;
      const duration = getRentalDurationUnits(rental);
      return Math.max(
        0,
        Number(
          isFlatHourlyTierRental(rental, hasPackage)
            ? ratePerUnit
            : ratePerUnit * duration
        ) || 0
      );
    }

    const ratePerUnit = pkg ? (parseFloat(pkg.fixed_amount) || rental.unit_price || 0) : (rental.unit_price || 0);
    const duration = getRentalDurationUnits(rental);
    return isFlatHourlyTierRental(rental, hasPackage) ? ratePerUnit : ratePerUnit * duration;
  };

  // Calculate total amount - prefer the stored contract total, but avoid double-counting overage
  // when the saved total already includes the package overage line.
  const calculateTotal = (overageAmount = 0) => {
    const storedTotalAmount = Math.max(0, Number(rental?.total_amount || 0) || 0);
    const pkg = kilometerPackage;
    const basePrice = Math.max(0, Number(getReceiptBasePrice() || 0) || 0);
    const overage = pkg ? Math.max(0, Number(overageAmount || 0) || 0) : 0;
    const extensions = rental.extensions?.reduce((sum, ext) => 
      ext.status === 'approved' ? sum + (ext.extension_price || 0) : sum, 0) || 0;
    const fuel = effectiveFuelCharge; // applies to both hourly and daily
    const linkedVehicleReport = rental.vehicleReport || rental.vehicle_report || null;
    const maintenanceCharge = linkedVehicleReport?.customer_chargeable
      ? Number(linkedVehicleReport.customer_charge_amount || linkedVehicleReport.maintenance_cost_total || linkedVehicleReport?.maintenance?.cost || 0)
      : 0;
    const impoundCharge = Number(rental.impound_total || 0);
    const transportFee = transportFeeAmount;

    if (storedTotalAmount > 0) {
      const recalculatedContractSubtotal = Math.max(0, basePrice + extensions);
      const recalculatedGrossTotal = recalculatedContractSubtotal + overage + fuel + maintenanceCharge + impoundCharge + transportFee;
      const subtotalWithSurchargesExceptOverage = recalculatedContractSubtotal + fuel + maintenanceCharge + impoundCharge + transportFee;
      const rawOverageForWaiver = Math.max(0, Number(rental?.mileage_overage_raw_amount || rental?.mileage_overage_amount || 0) || 0);

      if (
        String(rental?.mileage_overage_settlement || rental?.owner_execution?.mileageOverageSettlement || '').toLowerCase() === 'waived' &&
        rawOverageForWaiver > 0 &&
        Math.abs(storedTotalAmount - (subtotalWithSurchargesExceptOverage + rawOverageForWaiver)) < 0.01
      ) {
        return subtotalWithSurchargesExceptOverage;
      }

      if (Math.abs(storedTotalAmount - recalculatedGrossTotal) < 0.01) {
        return storedTotalAmount;
      }

      if (Math.abs(storedTotalAmount - subtotalWithSurchargesExceptOverage) < 0.01) {
        return storedTotalAmount + overage;
      }

      if (Math.abs(storedTotalAmount - recalculatedContractSubtotal) < 0.01) {
        return storedTotalAmount + overage + fuel + maintenanceCharge + impoundCharge + transportFee;
      }

      return storedTotalAmount;
    }

    return basePrice + overage + extensions + fuel + maintenanceCharge + impoundCharge + transportFee;
  };

  const approvedExtensionTotal = rental.extensions?.reduce(
    (sum, ext) => (ext.status === 'approved' ? sum + (ext.extension_price || 0) : sum),
    0
  ) || 0;

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

    const totalKm = resolveReceiptDistanceKm(rental);
    const pkg = kilometerPackage;
    if (!pkg) {
      return { hasOverage: false, extraKm: 0, overageCharge: 0, includedKm: 0, rate: 0, totalKm };
    }

    const includedKm = rental.included_kilometers_applied ||
                       getPackageTotalIncludedKilometers(rental, pkg) ||
                       0;
    const rate = rental.extra_km_rate_applied ||
                 pkg.extra_km_rate ||
                 0;
    
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
  const mileageOverageSettlement = String(
    rental?.mileage_overage_settlement ||
    rental?.owner_execution?.mileageOverageSettlement ||
    ''
  ).toLowerCase();
  const mileageOverageSettlementLabels = {
    deduct_deposit: tr('Deducted from deposit', 'Déduit de la caution'),
    paid_separately: tr('Paid separately', 'Payé séparément'),
    waived: tr('Waived', 'Annulé'),
    unpaid: tr('Unpaid', 'Impayé'),
  };
  const mileageOverageSettlementLabel = mileageOverageSettlementLabels[mileageOverageSettlement] || '';
  const rawMileageOverageCharge = Math.max(
    0,
    Number(
      rental?.mileage_overage_raw_amount ??
      rental?.mileage_overage_amount ??
      overageDetails.overageCharge ??
      0
    ) || 0
  );
  const effectiveOverageCharge = mileageOverageSettlement === 'waived'
    ? 0
    : Math.max(
        0,
        Number(
          rental?.mileage_overage_billable_amount ??
          overageDetails.overageCharge ??
          0
        ) || 0
      );
  const mileageOverageWaivedAmount = mileageOverageSettlement === 'waived'
    ? Math.max(0, Number(rental?.mileage_overage_waived_amount ?? rawMileageOverageCharge) || 0)
    : 0;
  const mileageOveragePaidSeparatelyAmount = mileageOverageSettlement === 'paid_separately'
    ? Math.max(0, Number(rental?.mileage_overage_settled_amount ?? effectiveOverageCharge) || 0)
    : 0;
  const recalculatedTotalAmount = calculateTotal(effectiveOverageCharge);
  const priceOverrideMeta = getPriceOverrideMeta(rental);
  const hasMeaningfulManualPriceOverride = Boolean(
    priceOverrideMeta &&
    priceOverrideMeta.previousPrice > 0 &&
    priceOverrideMeta.newPrice > 0 &&
    Math.abs(priceOverrideMeta.previousPrice - priceOverrideMeta.newPrice) > 0.009
  );
  const totalAmount = hasMeaningfulManualPriceOverride
    ? Math.max(0, Number(priceOverrideMeta?.newPrice || rental?.total_amount || 0) || 0)
    : recalculatedTotalAmount;

  const hasOverage = hasPackage && effectiveOverageCharge > 0;
  const hasFuelCharge = effectiveFuelCharge > 0;
  const damageDeposit = parseFloat(rental?.damage_deposit || 0);
  const receiptDamageDeposit = Math.max(0, damageDeposit);
  const receivedDamageDeposit = Math.max(0, parseFloat(rental?.damage_deposit_received_amount || 0));
  const remainingDamageDepositToCollect = Math.max(0, receiptDamageDeposit - receivedDamageDeposit);
  const linkedVehicleReport = rental.vehicleReport || rental.vehicle_report || null;
  const linkedMaintenance = linkedVehicleReport?.maintenance || null;
  const maintenanceChargeAmount = linkedVehicleReport?.customer_chargeable
    ? Number(linkedVehicleReport.customer_charge_amount || linkedVehicleReport.maintenance_cost_total || linkedMaintenance?.cost || 0)
    : 0;
  const maintenanceStayCharge = Number(linkedVehicleReport?.maintenance_daily_total || 0);
  const maintenanceStayDiscount = Number(linkedVehicleReport?.maintenance_daily_discount || 0);
  const maintenanceStayDays = Number(linkedVehicleReport?.maintenance_daily_days || 0);
  const maintenanceStayRate = Number(linkedVehicleReport?.maintenance_daily_rate || 0);
  const impoundChargeDays = Number(rental?.impound_charge_days || 0);
  const impoundChargeHours = Number(rental?.impound_charge_hours || 0);
  const impoundRate = Number(rental?.impound_rate || rental?.unit_price || 0);
  const impoundManualCharge = Number(rental?.impound_manual_charge || 0);
  const impoundDiscount = Number(rental?.impound_discount || 0);
  const impoundChargeTotal = Number(rental?.impound_total || 0);
  const impoundBaseCharge = Math.max(0, impoundChargeTotal - impoundManualCharge);
  const releasedImpoundDiscount = Boolean(rental?.released_from_impound_at && !rental?.is_impounded && impoundDiscount > 0);
  const impoundIsEstimate = Boolean(rental?.impound_is_estimate);
  const resolvedImpoundDailyFeePerDay =
    !impoundIsEstimate && rental?.released_from_impound_at
      ? Number(rental?.impound_estimated_rate || 0)
      : 0;
  const resolvedImpoundDailyFeeTotal =
    !impoundIsEstimate && rental?.released_from_impound_at
      ? Number(rental?.impound_estimated_extra_amount || 0)
      : 0;
  const resolvedImpoundOneTimeFee =
    !impoundIsEstimate && rental?.released_from_impound_at
      ? Math.max(0, impoundManualCharge - resolvedImpoundDailyFeeTotal)
      : impoundManualCharge;
  const estimatedImpoundReleaseAt = rental?.impound_estimated_release_at;
  const impoundEstimateNote = rental?.impound_estimate_note || '';
  const impoundEstimatePricingLabel = rental?.impound_estimate_pricing_label || '';
  const impoundExtraDailyChargeWaived = Boolean(rental?.impound_extra_daily_charge_waived);
  const liveImpoundDays = Number(rental?.impound_live_charge_days ?? impoundChargeDays ?? 0);
  const liveImpoundHours = Number(rental?.impound_live_charge_hours ?? impoundChargeHours ?? 0);
  const liveImpoundTotal = impoundExtraDailyChargeWaived
    ? 0
    : Number(rental?.impound_live_total ?? impoundChargeTotal ?? 0);
  const estimatedImpoundTotalDays = Number(rental?.impound_estimated_days_total ?? impoundChargeDays ?? 0);
  const estimatedImpoundTotal = impoundExtraDailyChargeWaived
    ? 0
    : Number(rental?.impound_estimated_total ?? impoundChargeTotal ?? 0);
  const estimatedWeekendExtraDays = impoundExtraDailyChargeWaived
    ? 0
    : Number(rental?.impound_estimated_extra_days ?? Math.max(0, estimatedImpoundTotalDays - liveImpoundDays));
  const estimatedDailyRate = Number(rental?.impound_estimated_rate ?? impoundRate ?? 0);
  const estimatedWeekendExtraAmount = impoundExtraDailyChargeWaived
    ? 0
    : Number(
        rental?.impound_estimated_extra_amount ?? (
          rental?.rental_type === 'daily'
            ? estimatedWeekendExtraDays * estimatedDailyRate
            : Math.max(0, estimatedImpoundTotal - liveImpoundTotal)
        )
      );
  const estimatedTotalByMonday = liveImpoundTotal + estimatedWeekendExtraAmount;
  const displayedImpoundTotal = impoundIsEstimate ? estimatedTotalByMonday : impoundChargeTotal;
  const grossDisplayedTotalAmount = impoundIsEstimate
    ? Math.max(0, totalAmount - impoundChargeTotal + estimatedTotalByMonday)
    : totalAmount;
  const savedDepositDeductionAmount = Math.max(0, Number(rental?.deposit_deduction_amount || 0));
  const mileageOverageDepositDeductionAmount = mileageOverageSettlement === 'deduct_deposit'
    ? Math.max(0, Number(rental?.mileage_overage_deposit_deduction_amount ?? effectiveOverageCharge) || 0)
    : 0;
  const autoDepositSeizedAmount = Math.min(
    savedDepositDeductionAmount + mileageOverageDepositDeductionAmount,
    receiptDamageDeposit || savedDepositDeductionAmount + mileageOverageDepositDeductionAmount
  );
  const explicitAmountDueDiscountAmount = Math.max(0, Number(amountDueResolutionMeta?.companyDiscount || 0) || 0);
  const inferredAmountDueDiscountAmount =
    amountDueResolutionMeta &&
    explicitAmountDueDiscountAmount <= 0 &&
    Math.max(0, Number(rental?.remaining_amount || 0) || 0) <= 0 &&
    correctedPaidAmount > 0 &&
    grossDisplayedTotalAmount - correctedPaidAmount > 0.009
      ? Math.max(0, grossDisplayedTotalAmount - correctedPaidAmount)
      : 0;
  const amountDueDiscountAmount = Math.max(explicitAmountDueDiscountAmount, inferredAmountDueDiscountAmount);
  const effectiveAmountDueResolutionMeta = amountDueResolutionMeta
    && amountDueResolutionMeta.hasResolutionFields
    ? {
        ...amountDueResolutionMeta,
        companyDiscount: amountDueDiscountAmount,
        previousAmount: Math.max(0, Number(amountDueResolutionMeta.previousAmount || 0) || 0) + inferredAmountDueDiscountAmount,
      }
    : null;
  const displayedTotalAmount = Math.max(0, grossDisplayedTotalAmount - amountDueDiscountAmount);
  const displayedRentalOnlyAmount = Math.max(
    0,
    displayedTotalAmount -
      effectiveFuelCharge -
      maintenanceChargeAmount -
      displayedImpoundTotal -
      transportFeeAmount
  );
  const displayedAdditionalChargesAmount = Math.max(
    0,
    effectiveFuelCharge +
      maintenanceChargeAmount +
      displayedImpoundTotal +
      transportFeeAmount
  );
  const rawBalanceDue = Math.max(0, displayedTotalAmount - correctedPaidAmount - mileageOveragePaidSeparatelyAmount);
  const remainingBalanceAfterDepositSeizure = Math.max(0, rawBalanceDue - autoDepositSeizedAmount);
  const remainingRefundableSecurityDeposit = Math.max(0, receivedDamageDeposit - autoDepositSeizedAmount);
  const heldSecurityDepositAmount = receivedDamageDeposit > 0 ? receivedDamageDeposit : receiptDamageDeposit;
  const shouldPreviewSecurityDepositReview =
    !rental.deposit_returned_at &&
    autoDepositSeizedAmount <= 0 &&
    heldSecurityDepositAmount > 0 &&
    rawBalanceDue > 0;
  const securityDepositPreviewDeduction = shouldPreviewSecurityDepositReview
    ? Math.min(rawBalanceDue, heldSecurityDepositAmount)
    : 0;
  const securityDepositPreviewRemainingBalance = shouldPreviewSecurityDepositReview
    ? Math.max(0, rawBalanceDue - securityDepositPreviewDeduction)
    : 0;
  const securityDepositPreviewReturnAmount = shouldPreviewSecurityDepositReview
    ? Math.max(0, heldSecurityDepositAmount - securityDepositPreviewDeduction)
    : 0;
  const displayedReceiptBalanceDue = shouldPreviewSecurityDepositReview
    ? securityDepositPreviewRemainingBalance
    : remainingBalanceAfterDepositSeizure;
  const displayedCustomerPaidAmount = Math.max(
    0,
    displayedTotalAmount - remainingBalanceAfterDepositSeizure - autoDepositSeizedAmount
  );
  const normalizedPaymentStatus = remainingBalanceAfterDepositSeizure <= 0
    ? 'paid'
    : displayedCustomerPaidAmount > 0
      ? 'partial'
      : 'pending';
  const weekendEstimateMessage = impoundIsEstimate
    ? (
        impoundExtraDailyChargeWaived
          ? 'No extra daily charge approved. Extra impound rental charge has been waived for this estimate.'
          : `Weekend estimate assumes the vehicle remains held until Monday before release can happen. This adds ${estimatedWeekendExtraDays} more rental day${estimatedWeekendExtraDays === 1 ? '' : 's'} beyond the live charge already running.`
      )
    : '';
  const linkedMaintenanceParts = linkedMaintenance
    ? (
        Array.isArray(linkedMaintenance.parts_used) && linkedMaintenance.parts_used.length > 0
          ? linkedMaintenance.parts_used
          : (
              Array.isArray(linkedMaintenance.parts) && linkedMaintenance.parts.length > 0
                ? linkedMaintenance.parts
                : []
            )
      )
    : [];
  const maintenanceSummaryItems = linkedMaintenance
    ? [...new Set([
        linkedMaintenance.maintenance_type || null,
        ...(linkedMaintenanceParts
          .map((part) => (
            part?.item_name ||
            part?.part_name ||
            part?.inventory_item?.name ||
            part?.name ||
            null
          ))
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
  const normalizedBookingGraceMinutes = normalizeBookingGraceMinutes(
    bookingGraceMinutes ?? rental?.booking_grace_period_minutes ?? rental?.rentalGracePeriodMinutes
  );
  const bookingGraceLabel = formatGracePeriodLabel(normalizedBookingGraceMinutes, tr);
  const depositAmount = parseFloat(rental?.deposit_amount || 0) || 0;
  const rentalStatus = String(rental?.rental_status || '').toLowerCase();
  const showBookingPolicy = !isFinalPaymentReceipt
    && depositAmount > 0
    && (rentalStatus === 'scheduled' || !rental?.contract_signed || !rental?.signature_url);
  const showBankTransferSection = !isFinalPaymentReceipt || remainingBalanceAfterDepositSeizure > 0;
  const packageUsedLabel = hasPackage
    ? (receiptDistanceUpgrade?.appliedPackageName || receiptSimplePricing?.selectedPackage?.name || packageBreakdown?.name || tr('Kilometer package', 'Forfait kilométrique'))
    : (tierPricingBreakdown?.tierDescription || tr('Standard rental price', 'Tarif standard de location'));
  const usageDistanceKm = Number(receiptSimplePricing?.kmUsed || overageDetails.totalKm || 0);
  const packageOriginalLimitKm = Number(
    receiptDistanceUpgrade?.originalPackageLimitKm ||
    receiptDistanceUpgrade?.previousLimit ||
    0
  );
  const packageOriginalPrice = Number(receiptDistanceUpgrade?.originalPackagePrice || 0);
  const packageAppliedPrice = Number(
    receiptDistanceUpgrade?.appliedPackagePrice ||
    receiptSimplePricing?.totalPrice ||
    packageBreakdown?.packageTotal ||
    0
  );
  const packageExtraKmRate = Number(
    receiptDistanceUpgrade?.finalPackage?.extraKmRate ??
    receiptDistanceUpgrade?.finalPackage?.extra_km_rate ??
    receiptSimplePricing?.selectedPackage?.extraKmRate ??
    receiptSimplePricing?.selectedPackage?.extra_km_rate ??
    kilometerPackage?.extra_km_rate ??
    packageBreakdown?.extraRate ??
    overageDetails.rate ??
    0
  );
  const packageExtraKmWithoutUpgrade = Math.max(0, usageDistanceKm - packageOriginalLimitKm);
  const packageExtraKmCostWithoutUpgrade = packageExtraKmWithoutUpgrade * packageExtraKmRate;
  const packageCostWithoutUpgrade = packageOriginalPrice + packageExtraKmCostWithoutUpgrade;
  const smartUpgradeSavings = Math.max(0, packageCostWithoutUpgrade - packageAppliedPrice);
  const standardPricingContext = resolveReceiptStandardRate({
    rental,
    vehicleModelId,
    basePrices,
    vehicleName,
    isHourly: rental?.rental_type === 'hourly',
    isDaily: rental?.rental_type === 'daily',
  });
  const packageVsBaseStandardTotal = Math.max(
    0,
    getEffectiveRentalBaseTotal(
      rental,
      false,
      Number(standardPricingContext.rate || 0) || 0,
    ),
  );
  const packageVsBaseSavings = hasPackage && packageAppliedPrice > 0 && packageVsBaseStandardTotal > 0
    ? Math.max(0, packageVsBaseStandardTotal - packageAppliedPrice)
    : 0;
  const smartPricingMode = hasMeaningfulManualPriceOverride
    ? 'manual'
    : hasPackage
      ? (receiptDistanceUpgrade ? 'upgrade' : 'package')
      : (tierPricingBreakdown?.isDiscounted ? 'tier' : 'standard');
  const packageUpgradeTarget =
    receiptDistanceUpgrade?.finalPackage ||
    receiptSimplePricing?.selectedPackage ||
    kilometerPackage ||
    null;
  const verifiedPackageUpgradeSavings = (
    hasPackage &&
    smartPricingMode === 'upgrade' &&
    !isUnlimitedReceiptPackage(packageUpgradeTarget) &&
    packageOriginalLimitKm > 0 &&
    Number(receiptDistanceUpgrade?.appliedPackageLimitKm || receiptDistanceUpgrade?.finalLimit || 0) > packageOriginalLimitKm &&
    packageOriginalPrice > 0 &&
    packageAppliedPrice > 0 &&
    packageCostWithoutUpgrade > packageAppliedPrice
  )
    ? smartUpgradeSavings
    : 0;
  const verifiedTierSavings = !hasPackage
    ? Math.max(0, Number(tierPricingBreakdown?.savings || 0))
    : 0;
  const effectiveSavingsAmount = hasPackage
    ? Math.max(packageVsBaseSavings, verifiedPackageUpgradeSavings)
    : verifiedTierSavings;
  const effectiveSavingsKind = hasPackage && packageVsBaseSavings > 0
    ? 'package_base'
    : verifiedPackageUpgradeSavings > 0
      ? 'package_upgrade'
      : verifiedTierSavings > 0
        ? 'tier'
        : 'none';
  const savingsLabel = (
    effectiveSavingsKind === 'package_base' || effectiveSavingsKind === 'package_upgrade'
      ? tr('Package savings', 'Économies du forfait')
      : tr('Savings', 'Économies')
  );
  const pricingSummaryStatus = String(normalizedPaymentStatus || rental?.payment_status || '').toLowerCase();
  const paymentStatusLabel = pricingSummaryStatus === 'paid'
    ? tr('Paid', 'Payé')
    : pricingSummaryStatus === 'partial'
      ? tr('Partially paid', 'Partiellement payé')
      : pricingSummaryStatus === 'refunded'
        ? tr('Refunded', 'Remboursé')
        : tr('Unpaid', 'Impayé');
  const pricingStatusTone = pricingSummaryStatus === 'paid'
    ? { bg: '#dcfce7', fg: '#166534' }
    : pricingSummaryStatus === 'partial'
      ? { bg: '#fef3c7', fg: '#92400e' }
      : { bg: '#fee2e2', fg: '#b91c1c' };

  const PricingStoryDisplay = () => {
    const packageDurationUnitLabel = packageBreakdown?.isDaily
      ? tr('day', 'jour')
      : tr('hour', 'heure');
    const packageDurationLabel = packageBreakdown
      ? `${packageBreakdown.duration} ${packageDurationUnitLabel}${packageBreakdown.duration > 1 ? 's' : ''}`
      : formatRentalDurationSummary(rental, tr);
    const packageCoverageLabel = (
      hasPackage &&
      packageBreakdown?.includedKm > 0 &&
      packageBreakdown?.totalIncludedKm > 0
    )
      ? `${formatReceiptKilometers(packageBreakdown.includedKm)} km/${packageDurationUnitLabel} × ${packageBreakdown.duration} ${packageDurationUnitLabel}${packageBreakdown.duration > 1 ? 's' : ''} = ${formatReceiptKilometers(packageBreakdown.totalIncludedKm)} km ${tr('included', 'inclus')}`
      : null;

    const detailsRows = [
      {
        label: getRentalKilometerPackage(rental)
          ? tr('Package price', 'Prix du forfait')
          : tr('Base rental rate', 'Tarif de base location'),
        value: `${formatCurrency(
          Math.max(
            0,
            displayedTotalAmount -
              effectiveOverageCharge -
              amountDueDiscountAmount -
              effectiveFuelCharge -
              transportFeeAmount -
              maintenanceChargeAmount -
              displayedImpoundTotal
          )
        )} MAD`,
      },
      ...((overageDetails.extraKm > 0 || effectiveOverageCharge > 0)
        ? [{
            label: tr('Extra mileage', 'Kilométrage extra'),
            value:
              overageDetails.extraKm > 0 && overageDetails.rate > 0
                ? `${formatReceiptKilometers(overageDetails.extraKm)} km × ${formatCurrency(overageDetails.rate)} MAD = ${formatCurrency(effectiveOverageCharge)} MAD${mileageOverageSettlementLabel ? ` • ${mileageOverageSettlementLabel}` : ''}`
                : `${formatCurrency(effectiveOverageCharge)} MAD${mileageOverageSettlementLabel ? ` • ${mileageOverageSettlementLabel}` : ''}`,
          }]
        : []),
      ...(mileageOverageWaivedAmount > 0
        ? [{
            label: tr('Extra mileage waived', 'Kilométrage extra annulé'),
            value: `-${formatCurrency(mileageOverageWaivedAmount)} MAD`,
          }]
        : []),
      ...(mileageOverageDepositDeductionAmount > 0
        ? [{
            label: tr('Deposit applied', 'Caution appliquée'),
            value: `${formatCurrency(mileageOverageDepositDeductionAmount)} MAD • ${tr('extra mileage', 'kilométrage extra')}`,
          }]
        : []),
      ...(mileageOveragePaidSeparatelyAmount > 0
        ? [{
            label: tr('Paid separately', 'Payé séparément'),
            value: `${formatCurrency(mileageOveragePaidSeparatelyAmount)} MAD • ${tr('extra mileage', 'kilométrage extra')}`,
          }]
        : []),
      ...(amountDueDiscountAmount > 0
        ? [{
            label: tr('Company discount', 'Remise entreprise'),
            value: `-${formatCurrency(amountDueDiscountAmount)} MAD`,
          }]
        : []),
      ...(transportFeeAmount > 0
        ? [{
            label: tr('Transport fee', 'Frais de transport'),
            value: transportFeeNote
              ? `+${formatCurrency(transportFeeAmount)} MAD • ${transportFeeNote}`
              : `+${formatCurrency(transportFeeAmount)} MAD`,
          }]
        : []),
      {
        label: tr('Total paid', 'Total payé'),
        value: `${formatCurrency(displayedCustomerPaidAmount)} MAD`,
      },
      {
        label: tr('Rental duration', 'Durée de location'),
        value: packageDurationLabel,
      },
      {
        label: tr('Package used', 'Forfait utilisé'),
        value: packageUsedLabel,
      },
      ...(packageCoverageLabel
        ? [{
            label: tr('Included kilometers', 'Kilomètres inclus'),
            value: packageCoverageLabel,
          }]
        : []),
      {
        label: tr('Deposit', 'Caution'),
        value: `${formatCurrency(receivedDamageDeposit > 0 ? receivedDamageDeposit : receiptDamageDeposit)} MAD`,
      },
    ];

    return (
      <div style={{
        marginTop: '24px',
        marginBottom: '24px'
      }}>
        <details open style={{
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          backgroundColor: '#ffffff',
          overflow: 'hidden'
        }}>
          <summary style={{
            listStyle: 'none',
            cursor: 'pointer',
            padding: '16px 18px',
            fontSize: '14px',
            fontWeight: 700,
            color: '#1d4ed8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <span>{tr('View full breakdown', 'Voir le détail complet')}</span>
            <span style={{ color: '#64748b', fontWeight: 700 }}>
              {tr('Formulas and audit trail', 'Formules et piste d’audit')}
            </span>
          </summary>
          <div style={{ padding: '0 18px 18px 18px', borderTop: '1px solid #e2e8f0' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '12px',
              marginTop: '16px',
              marginBottom: '18px'
            }}>
              {detailsRows.map((row) => (
                <div key={row.label} style={{ padding: '14px', borderRadius: '12px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b', marginBottom: '6px' }}>
                    {row.label}
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', lineHeight: 1.5 }}>
                    {row.value}
                  </div>
                </div>
              ))}
            </div>

            {hasMeaningfulManualPriceOverride && (
              <div style={{ marginBottom: '16px', padding: '14px', borderRadius: '12px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#1d4ed8', marginBottom: '8px' }}>
                  {tr('Manual contract override', 'Modification manuelle du contrat')}
                </div>
                <div style={{ fontSize: '13px', color: '#334155', lineHeight: 1.7 }}>
                  <div>{tr('Original calculated price:', 'Prix calculé initial :')} {formatCurrency(priceOverrideMeta?.previousPrice || 0)} MAD</div>
                  <div>{tr('Final contract price:', 'Prix final du contrat :')} {formatCurrency(priceOverrideMeta?.newPrice || totalAmount)} MAD</div>
                  {priceOverrideMeta?.editedByName ? (
                    <div>{tr('Edited by:', 'Modifié par :')} {priceOverrideMeta.editedByName}</div>
                  ) : null}
                </div>
              </div>
            )}

            <div style={{ padding: '14px', borderRadius: '12px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', fontSize: '13px', color: '#334155', lineHeight: 1.7 }}>
              <div style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b', marginBottom: '8px' }}>
                {tr('System audit trail', 'Piste d’audit système')}
              </div>
              <div>{tr('Rental type:', 'Type de location :')} {rental?.rental_type || '-'}</div>
              <div>{tr('Displayed duration:', 'Durée affichée :')} {formatRentalDurationSummary(rental, tr)}</div>
              <div>{tr('Base unit price:', 'Prix unitaire de base :')} {formatCurrency(rental?.unit_price || 0)} MAD</div>
              <div>
                {tr('Extra mileage charge:', 'Frais kilométrage extra :')}{' '}
                {overageDetails.extraKm > 0 && overageDetails.rate > 0
                  ? `${formatCurrency(effectiveOverageCharge)} MAD (${overageDetails.extraKm} km × ${formatCurrency(overageDetails.rate)} MAD/km)`
                  : `${formatCurrency(effectiveOverageCharge)} MAD`}
                {mileageOverageSettlementLabel ? ` • ${mileageOverageSettlementLabel}` : ''}
              </div>
              <div>{tr('Fuel charge:', 'Frais carburant :')} {formatCurrency(effectiveFuelCharge)} MAD</div>
              <div>{tr('Payment status:', 'Statut du paiement :')} {paymentStatusLabel}</div>
              {hasMeaningfulManualPriceOverride && (
                <div>{tr('Manual contract total:', 'Total manuel du contrat :')} {formatCurrency(priceOverrideMeta?.newPrice || totalAmount)} MAD</div>
              )}
              {effectiveAmountDueResolutionMeta && (
                <div>{tr('Balance resolution:', 'Résolution du solde :')} {formatCurrency(effectiveAmountDueResolutionMeta.paymentReceivedNow)} MAD {tr('paid +', 'payés +')} {formatCurrency(effectiveAmountDueResolutionMeta.companyDiscount)} MAD {tr('discount', 'de remise')}</div>
              )}
            </div>
          </div>
        </details>
      </div>
    );
  };

  // Package Display Component (shown when package exists)
  const PackageDisplay = ({ breakdown, pricingSummary, upgradeSummary, overageSummary }) => {
    if (!breakdown) return null;

    const usedMinutes = Number(pricingSummary?.durationMinutes || 0);
    const billedHours = Number(pricingSummary?.billedHours || 0);
    const kmUsed = Number(pricingSummary?.kmUsed || overageSummary?.totalKm || 0);
    const finalLimit = Number(breakdown.totalIncludedKm || pricingSummary?.packageLimitKm || 0);
    const overflowKm = Number(overageSummary?.extraKm || 0);
    const finalPackageName = breakdown.name;
    const appliedPackagePrice = Number(upgradeSummary?.appliedPackagePrice || pricingSummary?.totalPrice || breakdown.packageTotal || 0);
    const originalPackagePrice = Number(upgradeSummary?.originalPackagePrice || 0);

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
              {tr('Rental pricing flow', 'Flux tarifaire de location')}
            </h4>
            <p style={{
              fontSize: '14px',
              color: 'rgba(255, 255, 255, 0.9)',
              margin: '4px 0 0 0'
            }}>
              {tr('Time, distance plan, and final total explained clearly.', 'Le temps, le plan distance et le total final sont expliqués clairement.')}
            </p>
          </div>
          <div style={{
            padding: '6px 12px',
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            borderRadius: '20px',
            fontSize: '12px',
            color: 'white'
          }}>
            {tr('Transparent flow', 'Flux transparent')}
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '20px'
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '12px',
            textAlign: 'left'
          }}>
            <div style={{
              fontSize: '12px',
              color: '#6B46C1',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '8px'
            }}>
              {tr('Step 1 • Time used', 'Étape 1 • Temps utilisé')}
            </div>
            <div style={{
              fontSize: '24px',
              fontWeight: 'bold',
              color: '#6B46C1',
              marginBottom: '6px'
            }}>
              {formatReceiptDurationLabel(usedMinutes, billedHours, tr)}
            </div>
            <div style={{
              fontSize: '14px',
              color: '#718096'
            }}>
              {tr(
                `${formatCurrency(pricingSummary?.hourlyRate || breakdown.ratePerUnit)} MAD hourly rate • ${billedHours} billed hour${billedHours === 1 ? '' : 's'}`,
                `${formatCurrency(pricingSummary?.hourlyRate || breakdown.ratePerUnit)} MAD tarif horaire • ${billedHours} heure${billedHours > 1 ? 's' : ''} facturée${billedHours > 1 ? 's' : ''}`
              )}
            </div>
          </div>

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
              {tr('Step 2 • Distance plan', 'Étape 2 • Plan distance')}
            </div>
            <div style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '6px' }}>
                <span style={{ fontSize: '13px', color: 'white' }}>{tr('Distance used', 'Distance utilisée')}</span>
                <span style={{ fontSize: '18px', fontWeight: 'bold', color: 'white' }}>{kmUsed} km</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '6px' }}>
                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.9)' }}>{tr('Final distance plan', 'Plan distance final')}</span>
                <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#FFD700' }}>{finalPackageName}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.9)' }}>{tr('Included limit', 'Limite incluse')}</span>
                <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#FFD700' }}>{finalLimit} km</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginTop: '6px' }}>
                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.9)' }}>{tr('Applied package price', 'Prix forfait appliqué')}</span>
                <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#FFD700' }}>{formatCurrency(appliedPackagePrice)} MAD</span>
              </div>
            </div>

            {upgradeSummary ? (
              <div style={{
                padding: '12px',
                borderRadius: '10px',
                backgroundColor: 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.18)'
              }}>
                <div style={{ fontSize: '12px', color: '#ffffff', fontWeight: 700, marginBottom: '6px' }}>
                  {tr('Automatic distance update', 'Mise à jour automatique de distance')}
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.9)', lineHeight: 1.5 }}>
                  {tr(
                    `Original package: ${upgradeSummary.originalPackageName || 'Original package'} (${upgradeSummary.originalPackageLimitKm || upgradeSummary.previousLimit} km, ${formatCurrency(originalPackagePrice)} MAD). The trip reached ${upgradeSummary.totalDistanceKm || kmUsed} km, so billing moved to ${upgradeSummary.appliedPackageName || finalPackageName} (${upgradeSummary.appliedPackageLimitKm || upgradeSummary.finalLimit} km, ${formatCurrency(appliedPackagePrice)} MAD).`,
                    `Forfait initial : ${upgradeSummary.originalPackageName || 'Forfait initial'} (${upgradeSummary.originalPackageLimitKm || upgradeSummary.previousLimit} km, ${formatCurrency(originalPackagePrice)} MAD). Le trajet a atteint ${upgradeSummary.totalDistanceKm || kmUsed} km, donc la facturation passe à ${upgradeSummary.appliedPackageName || finalPackageName} (${upgradeSummary.appliedPackageLimitKm || upgradeSummary.finalLimit} km, ${formatCurrency(appliedPackagePrice)} MAD).`
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>

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
              <div style={{ fontSize: '14px', opacity: 0.9 }}>{tr('Step 3 • Final rental total', 'Étape 3 • Total final de location')}</div>
              <div style={{ fontSize: '12px', opacity: 0.7, marginTop: '2px' }}>
                {tr('Time pricing kept clear and automatic.', 'La tarification du temps reste claire et automatique.')}
              </div>
            </div>
            <div style={{
              fontSize: '28px',
              fontWeight: 'bold',
              color: 'white'
            }}>
              {formatCurrency(pricingSummary?.totalPrice || breakdown.packageTotal)} MAD
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
            <div>
              {tr(
                `${billedHours} billed hour${billedHours === 1 ? '' : 's'} × ${formatCurrency(pricingSummary?.hourlyRate || breakdown.ratePerUnit)} MAD = ${formatCurrency(appliedPackagePrice)} MAD`,
                `${billedHours} heure${billedHours > 1 ? 's' : ''} facturée${billedHours > 1 ? 's' : ''} × ${formatCurrency(pricingSummary?.hourlyRate || breakdown.ratePerUnit)} MAD = ${formatCurrency(appliedPackagePrice)} MAD`
              )}
            </div>
            <div style={{ marginTop: '4px', color: '#FFD700' }}>
              {tr(`Distance plan applied: ${finalLimit} km`, `Plan distance appliqué : ${finalLimit} km`)}
            </div>
            {overflowKm > 0 ? (
              <div style={{ marginTop: '4px', color: '#FED7D7' }}>
                {tr(
                  `${overflowKm} km sits above the current plan and may be handled as overage later.`,
                  `${overflowKm} km dépasse le plan actuel et pourra être traité plus tard comme dépassement.`
                )}
              </div>
            ) : null}
            {overageSummary?.hasOverage ? (
              <div style={{ marginTop: '4px', color: '#FED7D7' }}>
                {tr(
                  `Extra distance charged: ${overageSummary.extraKm} km × ${formatCurrency(overageSummary.rate)} MAD`,
                  `Distance supplémentaire facturée : ${overageSummary.extraKm} km × ${formatCurrency(overageSummary.rate)} MAD`
                )}
              </div>
            ) : null}
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
              {breakdown.isDaily ? tr('Daily Rate Breakdown', 'Détail du tarif journalier') : tr('Special Tier Pricing', 'Tarification spéciale par palier')}
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
             breakdown.source === 'vehicle_rate' ? tr('🚗 Vehicle Rate', '🚗 Tarif véhicule') : tr('⚡ Standard Rate', '⚡ Tarif standard')}
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
              {tr('Standard Rate', 'Tarif standard')}
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
              {breakdown.isFlatTier
                ? tr(`MAD total for ${breakdown.duration} hours`, `MAD total pour ${String(breakdown.duration).replace('.', ',')} heure${breakdown.duration > 1 ? 's' : ''}`)
                : `MAD per ${unit}`}
            </div>
            <div style={{
              fontSize: '11px',
              color: 'rgba(255, 255, 255, 0.7)',
              marginTop: '8px'
            }}>
              {breakdown.hasMatchedTier
                ? tr('Matched tier from pricing management', 'Palier correspondant depuis la gestion tarifaire')
                : tr('Base hourly price', 'Prix horaire de base')}
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
                <div style={{ fontSize: '14px', opacity: 0.9 }}>{tr('Total Savings', 'Économies totales')}</div>
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

  if (isDriveOutMarketplaceReceipt) {
    const customerName = rental.customer_name || rental.linkedCustomerProfile?.full_name || rental.linkedCustomerProfile?.name || tr('Customer', 'Client');
    const customerPhone = rental.customer_phone || rental.phone || rental.linkedCustomerProfile?.phone || '';
    const customerEmail = rental.customer_email || rental.linkedCustomerProfile?.email || '';
    const customerLicenseNumber = rental.customer_license_number || rental.customer_licence_number || '';
    const requestReference = rental.marketplace_request_reference || rental.rental_id || rental.id;
    const startDate = rental.started_at || rental.rental_start_date || rental.start_date;
    const endDate = rental.actual_end_date || rental.rental_end_date || rental.end_date;
    const scheduledReturnDate = rental.rental_end_date || rental.end_date;
    const currencyCode = rental.currency_code || 'MAD';
    const finalRentalAmount = Math.max(0, Number(rental.total_amount || 0) || 0);
    const securityDepositAmount = Math.max(0, Number(rental.damage_deposit || rental.deposit_amount || 0) || 0);
    const refundAmount = Math.max(0, Number(rental.deposit_return_amount || 0) || 0);
    const depositOutcome = String(rental.deposit_outcome || '').trim().toLowerCase();
    const refundSignatureUrl = getReceiptSignatureUrl(
      rental.deposit_return_signature_url ||
      rental.depositRefundSignatureUrl ||
      rental.owner_execution?.depositRefundSignatureUrl
    );
    const refundSignedAt =
      rental.deposit_returned_at ||
      rental.depositRefundSignedAt ||
      rental.owner_execution?.depositRefundSignedAt ||
      null;
    const refundSignedBy =
      rental.deposit_refund_signed_by ||
      rental.depositRefundSignedBy ||
      customerName;
    const startOdometer = rental.start_odometer || rental.owner_execution?.startOdometer || '';
    const endOdometer = rental.ending_odometer || rental.owner_execution?.returnOdometer || '';
    const startFuelLevel = rental.start_fuel_level ?? rental.owner_execution?.startFuelLevel ?? '';
    const endFuelLevel = rental.end_fuel_level ?? rental.owner_execution?.returnFuelLevel ?? '';
    const evidence = rental.evidence || {};
    const handoffPhotoCount = Array.isArray(evidence.handoffPhotos) ? evidence.handoffPhotos.length : 0;
    const returnPhotoCount = Array.isArray(evidence.returnPhotos) ? evidence.returnPhotos.length : 0;
    const legalDocsPhotoCount = Array.isArray(evidence.legalDocsPhotos) ? evidence.legalDocsPhotos.length : 0;
    const hasRefundSignature = Boolean(refundSignatureUrl);
    const hasClosedRental = Boolean(rental.actual_end_date || rental.owner_execution?.returnSavedAt);
    const depositStatusLabel = depositOutcome === 'refund_full'
      ? (hasRefundSignature ? tr('Refund in full • Signature saved', 'Remboursement total • Signature enregistrée') : tr('Refund in full • Signature missing', 'Remboursement total • Signature manquante'))
      : depositOutcome
        ? tr('Deposit outcome recorded', 'Résultat de caution enregistré')
        : tr('Deposit outcome pending', 'Résultat de caution en attente');
    const formatReceiptMoney = (amount) => `${formatCurrency(amount)} ${currencyCode}`;

    return (
      <div id="receipt-to-print" className="receipt-container page-container">
        <style>{`
          .receipt-container {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            color: #0f172a;
            background: white;
            width: 100%;
            max-width: 960px;
            margin: 0 auto;
            padding: 32px;
            border-radius: 18px;
            box-shadow: 0 20px 44px rgba(15, 23, 42, 0.08);
          }
          .receipt-container * {
            box-sizing: border-box;
            max-width: 100%;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }
          .driveout-receipt-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 16px;
          }
          .driveout-receipt-card {
            border: 1px solid #e2e8f0;
            border-radius: 18px;
            background: #ffffff;
            padding: 18px;
          }
          .driveout-receipt-label {
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.16em;
            color: #94a3b8;
            margin-bottom: 8px;
          }
          @media screen and (max-width: 720px) {
            .receipt-container {
              padding: 18px;
              border-radius: 0;
              box-shadow: none;
            }
            .driveout-receipt-grid {
              grid-template-columns: 1fr;
            }
          }
          @media print {
            @page { size: A4; margin: 1.5cm; }
            .receipt-container {
              max-width: none;
              margin: 0;
              padding: 0;
              box-shadow: none;
              border-radius: 0;
            }
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
          }
        `}</style>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '20px',
          paddingBottom: '24px',
          marginBottom: '28px',
          borderBottom: '3px solid #7c3aed',
        }}>
          <div style={{ minWidth: 0, flex: '1 1 220px' }}>
            <img
              src={resolvedReceiptLogoUrl}
              alt={receiptBrandName}
              style={{ maxWidth: '190px', width: '100%', height: 'auto', objectFit: 'contain' }}
              onError={(event) => { event.currentTarget.style.display = 'none'; }}
            />
            <div style={{ marginTop: '12px', fontSize: '13px', color: '#64748b', lineHeight: 1.6 }}>
              <div style={{ fontWeight: 800, color: '#0f172a' }}>{receiptBrandLegalName}</div>
              <div>{receiptBrandContact}</div>
            </div>
          </div>

          <div style={{ minWidth: 0, flex: '1 1 280px', textAlign: 'right' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: '999px',
              background: '#dcfce7',
              color: '#166534',
              padding: '7px 12px',
              fontSize: '12px',
              fontWeight: 800,
              marginBottom: '12px',
            }}>
              {tr('Receipt', 'Reçu')}
            </div>
            <h1 style={{
              fontSize: 'clamp(26px, 5vw, 38px)',
              lineHeight: 1.05,
              margin: 0,
              letterSpacing: '-0.05em',
              color: '#020617',
            }}>
              {hasClosedRental ? tr('Rental closed', 'Location clôturée') : tr('Rental in progress', 'Location en cours')}
            </h1>
            <div style={{ marginTop: '10px', fontSize: '13px', color: '#64748b' }}>
              {tr('Receipt #:', 'Reçu n° :')} <strong style={{ color: '#0f172a' }}>{safeFormatId(requestReference)}</strong>
            </div>
          </div>
        </div>

        <div className="driveout-receipt-grid" style={{ marginBottom: '18px' }}>
          <div className="driveout-receipt-card">
            <div className="driveout-receipt-label">{tr('Customer', 'Client')}</div>
            <div style={{ fontSize: '22px', fontWeight: 900, letterSpacing: '-0.04em', color: '#020617' }}>{customerName}</div>
            {customerEmail ? <div style={{ marginTop: '6px', fontSize: '14px', color: '#475569' }}>{customerEmail}</div> : null}
            {customerPhone ? <div style={{ marginTop: '4px', fontSize: '14px', color: '#475569' }}>{customerPhone}</div> : null}
            {customerLicenseNumber ? (
              <div style={{ marginTop: '12px', fontSize: '13px', fontWeight: 800, color: '#6d28d9' }}>
                {tr('License:', 'Permis :')} {customerLicenseNumber}
              </div>
            ) : null}
          </div>

          <div className="driveout-receipt-card">
            <div className="driveout-receipt-label">{tr('Vehicle', 'Véhicule')}</div>
            <div style={{ fontSize: '22px', fontWeight: 900, letterSpacing: '-0.04em', color: '#020617' }}>{vehicleName}</div>
            <div style={{ marginTop: '8px', fontSize: '14px', color: '#475569' }}>
              {tr('Plate:', 'Plaque :')} <strong>{plateNumber}</strong>
            </div>
            <div style={{ marginTop: '6px', fontSize: '14px', color: '#475569' }}>
              {rental.pickup_city || rental.pickup_area || ''}
            </div>
          </div>
        </div>

        <div className="driveout-receipt-grid" style={{ marginBottom: '18px' }}>
          <div className="driveout-receipt-card">
            <div className="driveout-receipt-label">{tr('Schedule', 'Planning')}</div>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>{tr('Started', 'Départ')}</div>
                <div style={{ fontSize: '17px', fontWeight: 800 }}>{formatReceiptScheduleDateTime(startDate, isFrench, tr)}</div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>{tr('Expected return', 'Retour prévu')}</div>
                <div style={{ fontSize: '17px', fontWeight: 800 }}>{formatReceiptScheduleDateTime(scheduledReturnDate, isFrench, tr)}</div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>{hasClosedRental ? tr('Closed', 'Clôture') : tr('Return status', 'Statut retour')}</div>
                <div style={{ fontSize: '17px', fontWeight: 800 }}>
                  {hasClosedRental ? formatReceiptScheduleDateTime(endDate, isFrench, tr) : tr('Return pending', 'Retour en attente')}
                </div>
              </div>
            </div>
          </div>

          <div className="driveout-receipt-card" style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f5f3ff 100%)' }}>
            <div className="driveout-receipt-label">{tr('Payment and deposit', 'Paiement et caution')}</div>
            <div style={{ display: 'grid', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                <span style={{ color: '#475569' }}>{hasClosedRental ? tr('Final rental amount', 'Montant final location') : tr('Rental amount', 'Montant location')}</span>
                <strong>{formatReceiptMoney(finalRentalAmount)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                <span style={{ color: '#475569' }}>{tr('Security deposit', 'Caution')}</span>
                <strong>{formatReceiptMoney(securityDepositAmount)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                <span style={{ color: '#047857' }}>{tr('Refunded to renter', 'Remboursé au locataire')}</span>
                <strong style={{ color: '#047857' }}>{formatReceiptMoney(refundAmount)}</strong>
              </div>
              <div style={{
                marginTop: '8px',
                borderRadius: '14px',
                background: hasRefundSignature ? '#dcfce7' : '#f8fafc',
                color: hasRefundSignature ? '#166534' : '#475569',
                padding: '12px',
                fontSize: '13px',
                fontWeight: 800,
              }}>
                {depositStatusLabel}
              </div>
            </div>
          </div>
        </div>

        <div className="driveout-receipt-grid" style={{ marginBottom: '18px' }}>
          <div className="driveout-receipt-card">
            <div className="driveout-receipt-label">{tr('Return readings', 'Relevés retour')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>{tr('Start odometer', 'Compteur départ')}</div>
                <div style={{ fontSize: '18px', fontWeight: 900 }}>{startOdometer ? `${startOdometer} km` : '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>{tr('End odometer', 'Compteur retour')}</div>
                <div style={{ fontSize: '18px', fontWeight: 900 }}>{endOdometer ? `${endOdometer} km` : '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>{tr('Start fuel', 'Carburant départ')}</div>
                <div style={{ fontSize: '18px', fontWeight: 900 }}>{startFuelLevel !== '' ? `${startFuelLevel}/8` : '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>{tr('End fuel', 'Carburant retour')}</div>
                <div style={{ fontSize: '18px', fontWeight: 900 }}>{endFuelLevel !== '' ? `${endFuelLevel}/8` : '—'}</div>
              </div>
            </div>
          </div>

          <div className="driveout-receipt-card">
            <div className="driveout-receipt-label">{tr('Evidence saved', 'Preuves enregistrées')}</div>
            <div style={{ display: 'grid', gap: '10px', fontSize: '14px', color: '#475569' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{tr('Pickup inspection photos', 'Photos inspection départ')}</span>
                <strong>{handoffPhotoCount}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{tr('Return inspection photos', 'Photos inspection retour')}</span>
                <strong>{returnPhotoCount}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{tr('Registration and insurance photos', 'Photos carte grise et assurance')}</span>
                <strong>{legalDocsPhotoCount}</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="driveout-receipt-card" style={{ marginBottom: '22px' }}>
          <div className="driveout-receipt-label">{tr('Refund signature', 'Signature remboursement')}</div>
          {hasRefundSignature ? (
            <div style={{ display: 'grid', gridTemplateColumns: isMobileLayout ? '1fr' : 'minmax(220px, 340px) minmax(0, 1fr)', gap: '18px', alignItems: 'center' }}>
              <div style={{
                minHeight: '120px',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                background: '#f8fafc',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '14px',
              }}>
                <img
                  src={refundSignatureUrl}
                  alt={tr('Refund signature', 'Signature remboursement')}
                  style={{ maxHeight: '110px', width: '100%', objectFit: 'contain' }}
                />
              </div>
              <div>
                <div style={{ fontSize: '20px', fontWeight: 900, color: '#047857' }}>
                  {tr('Refund confirmed by renter', 'Remboursement confirmé par le locataire')}
                </div>
                <div style={{ marginTop: '8px', fontSize: '14px', lineHeight: 1.7, color: '#475569' }}>
                  {tr('Signed by:', 'Signé par :')} <strong>{refundSignedBy}</strong>
                  <br />
                  {tr('Signed at:', 'Signé le :')} <strong>{formatReceiptScheduleDateTime(refundSignedAt, isFrench, tr)}</strong>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: '14px', color: '#64748b' }}>
              {tr('No refund signature has been saved yet.', 'Aucune signature de remboursement n’a encore été enregistrée.')}
            </div>
          )}
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          paddingTop: '20px',
          borderTop: '1px solid #e2e8f0',
          fontSize: '12px',
          color: '#64748b',
        }}>
          <div>
            <strong style={{ color: '#0f172a' }}>{receiptBrandLegalName}</strong>
            <div>{tr('Rental receipt for DriveOut marketplace operation.', 'Reçu de location pour opération marketplace DriveOut.')}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div>{tr('DOCUMENT ID', 'ID DOCUMENT')} : {safeFormatId(requestReference)}</div>
            <div>{tr('Generated:', 'Généré :')} {new Date().toLocaleDateString(isFrench ? 'fr-FR' : 'en-GB')}</div>
          </div>
        </div>
      </div>
    );
  }

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
          width: 100%;
          overflow-x: clip;
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
            width: 100%;
            max-width: 100%;
            margin: 0 auto;
            padding: 12px;
            border-radius: 12px;
            box-shadow: none;
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
          .receipt-container table {
            table-layout: fixed;
            width: 100% !important;
          }
          .receipt-container td,
          .receipt-container th {
            min-width: 0;
            white-space: normal !important;
            word-break: break-word !important;
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
            src={resolvedReceiptLogoUrl}
            alt="Company Logo"
            className="header-logo"
            style={{ maxWidth: '220px', width: '100%', height: 'auto', objectFit: 'contain' }}
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
            {receiptTitle}
          </h1>
          <p style={{ fontSize: '13px', color: '#718096', margin: '2px 0', whiteSpace: 'normal', wordBreak: 'break-word' }}>SaharaX Rentals Morocco</p>
          <p style={{ fontSize: '13px', color: '#718096', margin: 0, whiteSpace: 'normal', wordBreak: 'break-word' }}>contact@saharax.co | +212 658 888 852</p>
          
          {!isFinalPaymentReceipt && (
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
                {tr('⚠️ ESTIMATE ONLY - Contract not signed', '⚠️ ESTIMATION UNIQUEMENT - Contrat non signé')}
              </span>
            </div>
          )}
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
            {rental.is_impounded ? tr('Impound Notice', 'Avis de mise en fourrière') : tr('Impound History', 'Historique de fourrière')}
          </div>
          <p style={{ fontSize: '14px', fontWeight: 600, color: '#92400e', margin: '0 0 6px 0' }}>
            {rental.is_impounded
              ? tr('This rental is currently impounded. The receipt below estimates the extra rental days until the vehicle can be released.', 'Cette location est actuellement en fourrière. Le reçu ci-dessous estime les jours de location supplémentaires jusqu’à la libération du véhicule.')
              : tr('This rental was impounded during the booking. The impound history and any additional rental days remain attached to this receipt.', 'Cette location a été mise en fourrière pendant la réservation. L’historique de fourrière et les jours supplémentaires restent attachés à ce reçu.')}
          </p>
          {rental.impounded_at && (
            <p style={{ fontSize: '13px', color: '#7c2d12', margin: '0 0 4px 0' }}>
              {tr('Impounded at:', 'Mis en fourrière le :')} {new Date(rental.impounded_at).toLocaleString(isFrench ? 'fr-FR' : undefined)}
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
            <p style={{ fontSize: '13px', color: '#7c2d12', margin: 0 }}>
              {tr('Note:', 'Note :')} {rental.impound_note}
            </p>
          )}
          {rental.released_from_impound_at && (
            <p style={{ fontSize: '13px', color: '#7c2d12', margin: '4px 0 0 0' }}>
              {tr('Released from impound:', 'Sorti de fourrière le :')} {new Date(rental.released_from_impound_at).toLocaleString(isFrench ? 'fr-FR' : undefined)}
            </p>
          )}
          {!impoundIsEstimate && rental.released_from_impound_at && (
            <div style={{
              marginTop: '10px',
              padding: '10px 12px',
              background: 'rgba(255,255,255,0.85)',
              border: '1px solid #fde68a',
              borderRadius: '10px'
            }}>
              <p style={{ fontSize: '12px', color: '#92400e', margin: 0, lineHeight: 1.6 }}>
                {tr(
                  `Towing hold breakdown: base rental ${formatCurrency(impoundBaseCharge)} MAD + daily impound fees ${formatCurrency(resolvedImpoundDailyFeeTotal)} MAD${resolvedImpoundDailyFeePerDay > 0 ? ` (${formatCurrency(resolvedImpoundDailyFeePerDay)} MAD/day × ${impoundChargeDays} day${impoundChargeDays === 1 ? '' : 's'})` : ''}${resolvedImpoundOneTimeFee > 0 ? ` + towing fee ${formatCurrency(resolvedImpoundOneTimeFee)} MAD` : ''}${impoundDiscount > 0 ? ` - discount ${formatCurrency(impoundDiscount)} MAD` : ''} = final towing charge ${formatCurrency(impoundChargeTotal)} MAD.`,
                  `Détail de la fourrière : base locative ${formatCurrency(impoundBaseCharge)} MAD + frais journaliers ${formatCurrency(resolvedImpoundDailyFeeTotal)} MAD${resolvedImpoundDailyFeePerDay > 0 ? ` (${formatCurrency(resolvedImpoundDailyFeePerDay)} MAD/jour × ${impoundChargeDays} jour${impoundChargeDays === 1 ? '' : 's'})` : ''}${resolvedImpoundOneTimeFee > 0 ? ` + frais de fourrière ${formatCurrency(resolvedImpoundOneTimeFee)} MAD` : ''}${impoundDiscount > 0 ? ` - remise ${formatCurrency(impoundDiscount)} MAD` : ''} = frais finaux ${formatCurrency(impoundChargeTotal)} MAD.`
                )}
              </p>
            </div>
          )}
          {impoundIsEstimate && (
            <div style={{ marginTop: '12px' }}>
              <div style={{
                background: 'rgba(255,255,255,0.92)',
                borderRadius: '10px',
                padding: '12px',
                border: '1px solid #fde68a',
                marginBottom: '10px'
              }}>
                <div style={{ fontSize: '13px', color: '#92400e', fontWeight: 700 }}>{tr('Impound Estimate Summary', 'Résumé estimatif de fourrière')}</div>
                <div style={{ fontSize: '12px', color: '#92400e', marginTop: '4px', lineHeight: 1.5 }}>
                  {tr('Live rental loss keeps running now. The weekend estimate shows the extra amount the customer should prepare for Monday release.', 'La perte locative en direct continue. L’estimation du week-end montre le montant supplémentaire que le client doit préparer pour une libération lundi.')}
                </div>
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '10px'
              }}>
              <div style={{ background: 'white', borderRadius: '10px', padding: '12px', border: '1px solid #fde68a' }}>
                <div style={{ fontSize: '11px', color: '#92400e', marginBottom: '4px', fontWeight: 700 }}>{tr('Live Additional Rental Days', 'Jours de location supplémentaires en cours')}</div>
                <div style={{ fontSize: '14px', color: '#111827', fontWeight: 700 }}>
                  {liveImpoundDays || 0} day{(liveImpoundDays || 0) === 1 ? '' : 's'}
                </div>
              </div>
              <div style={{ background: 'white', borderRadius: '10px', padding: '12px', border: '1px solid #fde68a' }}>
                <div style={{ fontSize: '11px', color: '#92400e', marginBottom: '4px', fontWeight: 700 }}>{tr('Estimated Court Release', 'Sortie de fourrière estimée')}</div>
                <div style={{ fontSize: '14px', color: '#111827', fontWeight: 700 }}>
                  {estimatedImpoundReleaseAt ? new Date(estimatedImpoundReleaseAt).toLocaleString() : 'Pending'}
                </div>
              </div>
              <div style={{ background: 'white', borderRadius: '10px', padding: '12px', border: '1px solid #fde68a' }}>
                <div style={{ fontSize: '11px', color: '#92400e', marginBottom: '4px', fontWeight: 700 }}>{tr('Rental Already Paid', 'Location déjà payée')}</div>
                <div style={{ fontSize: '14px', color: '#111827', fontWeight: 700 }}>
                  {formatCurrency(correctedPaidAmount)} MAD
                </div>
              </div>
              {receiptDamageDeposit > 0 && (
                <div style={{ background: 'white', borderRadius: '10px', padding: '12px', border: '1px solid #fde68a' }}>
                  <div style={{ fontSize: '11px', color: '#92400e', marginBottom: '4px', fontWeight: 700 }}>{tr('Security Deposit Held', 'Dépôt de garantie retenu')}</div>
                  <div style={{ fontSize: '14px', color: '#9a3412', fontWeight: 700 }}>
                    {formatCurrency(receiptDamageDeposit)} MAD
                  </div>
                </div>
              )}
              <div style={{ background: 'white', borderRadius: '10px', padding: '12px', border: '1px solid #fde68a' }}>
                <div style={{ fontSize: '11px', color: '#92400e', marginBottom: '4px', fontWeight: 700 }}>{tr('Live Additional Rental Amount', 'Montant supplémentaire de location en cours')}</div>
                <div style={{ fontSize: '14px', color: '#111827', fontWeight: 700 }}>
                  {formatCurrency(liveImpoundTotal)} MAD
                </div>
              </div>
              <div style={{ background: 'white', borderRadius: '10px', padding: '12px', border: '1px solid #fde68a' }}>
                <div style={{ fontSize: '11px', color: '#92400e', marginBottom: '4px', fontWeight: 700 }}>{tr('Weekend Estimate To Add', 'Estimation week-end à ajouter')}</div>
                <div style={{ fontSize: '14px', color: '#9a3412', fontWeight: 700 }}>
                  {formatCurrency(estimatedWeekendExtraAmount)} MAD
                </div>
                {impoundExtraDailyChargeWaived && (
                  <div style={{ fontSize: '11px', color: '#15803d', marginTop: '4px', fontWeight: 700 }}>
                    {tr('No extra daily charge', 'Aucun supplément journalier')}
                  </div>
                )}
                {estimatedWeekendExtraDays > 0 && estimatedDailyRate > 0 && (
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                    {estimatedWeekendExtraDays} × {formatCurrency(estimatedDailyRate)} MAD/day
                  </div>
                )}
              </div>
              <div style={{ background: 'white', borderRadius: '10px', padding: '12px', border: '1px solid #fde68a' }}>
                <div style={{ fontSize: '11px', color: '#92400e', marginBottom: '4px', fontWeight: 700 }}>{tr('Estimated Total By Monday', 'Total estimé d’ici lundi')}</div>
                <div style={{ fontSize: '14px', color: '#c53030', fontWeight: 700 }}>
                  {formatCurrency(estimatedTotalByMonday)} MAD
                </div>
              </div>
              <div style={{ background: 'white', borderRadius: '10px', padding: '12px', border: '1px solid #fde68a' }}>
                <div style={{ fontSize: '11px', color: '#92400e', marginBottom: '4px', fontWeight: 700 }}>{tr('Deposit Already Seized', 'Dépôt déjà saisi')}</div>
                <div style={{ fontSize: '14px', color: '#9a3412', fontWeight: 700 }}>
                  -{formatCurrency(autoDepositSeizedAmount)} MAD
                </div>
              </div>
              <div style={{ background: 'white', borderRadius: '10px', padding: '12px', border: '1px solid #fde68a' }}>
                <div style={{ fontSize: '11px', color: '#92400e', marginBottom: '4px', fontWeight: 700 }}>{tr('Estimated Remaining To Prepare', 'Reste estimé à préparer')}</div>
                <div style={{ fontSize: '24px', color: remainingBalanceAfterDepositSeizure > 0 ? '#dc2626' : '#15803d', fontWeight: 800, lineHeight: 1.1 }}>
                  {formatCurrency(remainingBalanceAfterDepositSeizure)} MAD
                </div>
                {remainingBalanceAfterDepositSeizure > 0 && (
                  <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '4px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                    {tr('Customer should prepare this amount', 'Le client doit préparer ce montant')}
                  </div>
                )}
              </div>
            </div>
            </div>
          )}
          {impoundIsEstimate && impoundEstimateNote && (
            <div style={{
              marginTop: '10px',
              padding: '10px 12px',
              background: 'rgba(255,255,255,0.85)',
              border: '1px solid #fde68a',
              borderRadius: '10px'
            }}>
              <p style={{ fontSize: '12px', color: '#92400e', margin: 0, lineHeight: 1.5 }}>
                {weekendEstimateMessage || impoundEstimateNote}
              </p>
            </div>
          )}
          {impoundIsEstimate && (
            <p style={{ fontSize: '12px', color: '#92400e', margin: '8px 0 0 0' }}>
              {tr('Discount offer:', 'Offre de remise :')} {impoundDiscount > 0 ? `${formatCurrency(impoundDiscount)} MAD ${tr('applied', 'appliqués')}` : tr('Not set yet', 'Pas encore définie')}
            </p>
          )}
        </div>
      )}

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
            {tr('Customer Information', 'Informations client')}
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
            {tr('Receipt Details', 'Détails du reçu')}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ color: '#718096' }}>{tr('Receipt #:', 'Reçu n° :')}</span>
            <span style={{ fontWeight: '600' }}>#{safeFormatId(rental.rental_id || rental.id)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#718096' }}>{tr('Date:', 'Date :')}</span>
            <span style={{ fontWeight: '600' }}>
              {new Date().toLocaleDateString(isFrench ? 'fr-FR' : 'en-GB', { 
                day: '2-digit', 
                month: 'short', 
                year: 'numeric' 
              })}
            </span>
          </div>
        </div>
      </div>

      {showBookingPolicy && (
        <div style={{
          marginBottom: '24px',
          padding: '18px',
          background: 'linear-gradient(135deg, #eff6ff 0%, #eef2ff 100%)',
          border: '1px solid #bfdbfe',
          borderRadius: '12px'
        }}>
          <div style={{
            fontSize: '11px',
            color: '#1d4ed8',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '8px',
            fontWeight: 700
          }}>
            {tr('Booking Policy', 'Politique de réservation')}
          </div>
          <p style={{ fontSize: '13px', color: '#1e3a8a', margin: 0, lineHeight: 1.6 }}>
            {tr(
              `This booking is held for up to ${bookingGraceLabel} after the scheduled start time. After that, vehicle availability is no longer guaranteed. The deposit is non-refundable, but the booking may be rescheduled once, subject to availability.`,
              `Cette réservation est maintenue pendant ${bookingGraceLabel} après l’heure de départ prévue. Passé ce délai, la disponibilité du véhicule n’est plus garantie. L’acompte n’est pas remboursable, mais la réservation peut être reprogrammée une fois, sous réserve de disponibilité.`
            )}
          </p>
        </div>
      )}

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
          <div style={{ fontSize: '12px', opacity: 0.9, marginBottom: '4px' }}>{tr('Vehicle Rented', 'Véhicule loué')}</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{vehicleName}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '12px', opacity: 0.9, marginBottom: '4px' }}>{tr('Plate Number', 'Plaque')}</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{plateNumber}</div>
        </div>
      </div>

      {/* Schedule */}
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
          {tr('Schedule', 'Planning')}
        </div>
        <div className="flex-row" style={{ display: 'flex', gap: '24px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#718096', fontSize: '12px', marginBottom: '4px' }}>{tr('Start', 'Début')}</div>
            <div style={{ fontSize: '15px', fontWeight: '600' }}>
              {formatReceiptScheduleDateTime(rental.rental_start_date || rental.started_at, isFrench, tr)}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#718096', fontSize: '12px', marginBottom: '4px' }}>{tr('End', 'Fin')}</div>
            <div style={{ fontSize: '15px', fontWeight: '600' }}>
              {formatReceiptScheduleDateTime(rental.rental_end_date || rental.actual_end_date, isFrench, tr)}
            </div>
          </div>
        </div>
        {shouldShowDailyReturnPolicy && (
          <div style={{
            marginTop: '16px',
            padding: '14px 16px',
            borderRadius: '10px',
            border: '1px solid #c4b5fd',
            backgroundColor: '#f5f3ff',
          }}>
            <div style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6d28d9' }}>
              {tr('Daily return rule', 'Règle retour journée')}
            </div>
            <div style={{ marginTop: '6px', fontSize: '14px', fontWeight: '700', color: '#111827' }}>
              {dailyReturnPolicyHeadline}
            </div>
            <div style={{ marginTop: '4px', fontSize: '12px', color: '#5b21b6', lineHeight: 1.5 }}>
              {dailyReturnPolicyBody}
            </div>
          </div>
        )}
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
                      <span style={{ fontSize: '13px', fontWeight: '600', color: '#c53030' }}>{tr('Extra mileage:', 'Kilométrage extra :')}</span>
                      <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#c53030' }}>
                        {formatCurrency(effectiveOverageCharge)} MAD
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#c53030', marginTop: '2px' }}>
                      {overageDetails.extraKm} km × {overageDetails.rate} MAD/km
                      {mileageOverageSettlementLabel ? ` • ${mileageOverageSettlementLabel}` : ''}
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
                  <div style={{ fontSize: '11px', color: '#718096' }}>{tr('Start Level', 'Niveau de départ')}</div>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#b7791f' }}>
                    {startFuel}/8 lines
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#718096' }}>{tr('End Level', 'Niveau de retour')}</div>
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
                    <span style={{ fontSize: '12px', color: '#4a5568' }}>{tr('Fuel Deficit:', 'Déficit carburant :')}</span>
                    <span style={{ fontSize: '14px', fontWeight: '600', color: '#d69e2e' }}>
                      {fuelDeficit} line{fuelDeficit !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', color: '#4a5568' }}>{tr('Price per line:', 'Prix par ligne :')}</span>
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

      <PricingStoryDisplay />

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
              <th style={{ padding: '12px', textAlign: 'left' }}>{tr('DESCRIPTION', 'DESCRIPTION')}</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>{tr('AMOUNT (MAD)', 'MONTANT (MAD)')}</th>
            </tr>
          </thead>
          <tbody>
            {/* Base Rental */}
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <td style={{ padding: '12px' }}>
                <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                  {hasPackage ? tr('Package Rental Charge', 'Montant du forfait') : tr('Base Rental Charge', 'Montant de location de base')}
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
                      return getEffectiveRentalBaseTotal(rental, hasPackage, rate);
                    })()
                  )}
                </div>
                <div style={{ fontSize: '11px', color: '#718096' }}>
                  {isFlatHourlyTierRental(rental, hasPackage)
                    ? tr('Fixed 1.5-hour tier total', 'Total fixe palier 1,5 heure')
                    : `${formatCurrency(rental.unit_price || 0)} MAD × ${getDisplayRentalDurationUnits(rental)} ${rental.rental_type === 'hourly' ? 'hour(s)' : 'day(s)'}`}
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
                  <div style={{ fontWeight: '600', color: '#c53030' }}>{tr('Kilometer Overage', 'Dépassement kilométrique')}</div>
                  <div style={{ fontSize: '12px', color: '#718096' }}>
                    {overageDetails.extraKm} km extra × {overageDetails.rate} MAD/km
                  </div>
                </td>
                <td style={{ padding: '12px', textAlign: 'right', color: '#c53030', fontWeight: '600' }}>
                  +{formatCurrency(effectiveOverageCharge)}
                </td>
              </tr>
            )}
            
            {/* Fuel Surcharge — shown for both hourly and daily when charge > 0 */}
            {hasFuelCharge && (
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '12px' }}>
                  <div style={{ fontWeight: '600', color: '#d69e2e' }}>
                    {tr('Fuel Surcharge', 'Supplément carburant')}
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
            {approvedExtensionTotal > 0 && (
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '12px' }}>
                  <div style={{ fontWeight: '600', color: '#805ad5' }}>{tr('Extension Fees', "Frais d'extension")}</div>
                  <div style={{ fontSize: '12px', color: '#718096' }}>
                    {rental.extensions.filter(ext => ext.status === 'approved').length} extension(s)
                  </div>
                </td>
                <td style={{ padding: '12px', textAlign: 'right', color: '#805ad5', fontWeight: '600' }}>
                  +{formatCurrency(approvedExtensionTotal)}
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
          {impoundIsEstimate ? tr('Impound Estimate Summary', 'Résumé estimatif de fourrière') : tr('Payment Summary', 'Résumé du paiement')}
        </h3>
        
        <div className="payment-summary-grid">
          {/* Left Column - Charges */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ color: '#4a5568' }}>{tr('Base Rental', 'Location de base')} ({formatRentalDurationSummary(rental, tr)}):</span>
              <span style={{ fontWeight: '600' }}>{formatCurrency(
                (() => {
                  const pkg = rental.package;
                  const rate = pkg ? (parseFloat(pkg.fixed_amount) || rental.unit_price || 0) : (rental.unit_price || 0);
                  return getEffectiveRentalBaseTotal(rental, hasPackage, rate);
                })()
              )} MAD</span>
            </div>
            
            {hasOverage && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', color: '#c53030' }}>
                <span>{tr('Kilometer Overage:', 'Dépassement kilométrique :')}</span>
                <span style={{ fontWeight: '600' }}>+{formatCurrency(effectiveOverageCharge)} MAD</span>
              </div>
            )}

            {amountDueDiscountAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', color: '#7c3aed' }}>
                <span>{tr('Company discount applied:', 'Remise entreprise appliquée :')}</span>
                <span style={{ fontWeight: '600' }}>-{formatCurrency(amountDueDiscountAmount)} MAD</span>
              </div>
            )}
            
            {hasFuelCharge && !impoundIsEstimate && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', color: '#d69e2e' }}>
                <span>{tr('Fuel Surcharge', 'Supplément carburant')} ({rental.rental_type}):</span>
                <span style={{ fontWeight: '600' }}>+{formatCurrency(effectiveFuelCharge)} MAD</span>
              </div>
            )}
            
            {approvedExtensionTotal > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', color: '#805ad5' }}>
                <span>{tr('Extensions:', 'Extensions :')}</span>
                <span style={{ fontWeight: '600' }}>+{formatCurrency(approvedExtensionTotal)} MAD</span>
              </div>
            )}

            {linkedMaintenance && (
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px dashed #cbd5e0' }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#c53030', marginBottom: '10px' }}>
                  {tr('Damage / Maintenance Bill', 'Facture dommages / maintenance')}
                </div>
                <div style={{ marginBottom: '10px', color: '#4a5568', fontSize: '12px' }}>
                  <span style={{ fontWeight: '600' }}>{tr('Reference:', 'Référence :')}</span>{' '}
                  {formatMaintenanceReference(linkedMaintenance.id)}
                </div>
                {maintenanceSummaryItems.length > 0 && (
                  <div style={{ marginBottom: '10px', color: '#4a5568', fontSize: '12px' }}>
                    <span style={{ fontWeight: '600' }}>{tr('Maintenance details:', 'Détails de maintenance :')}</span>{' '}
                    {maintenanceSummaryItems.map((item) => translateMaintenanceSummaryItem(item, tr)).join(' • ')}
                    {linkedMaintenanceParts.length > 4
                      ? ` • ${tr('more items', "plus d'articles")}`
                      : ''}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: '#4a5568' }}>
                  <span>{tr('Parts:', 'Pièces :')}</span>
                  <span style={{ fontWeight: '600' }}>{formatCurrency(linkedMaintenance.parts_cost_mad || 0)} MAD</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: '#4a5568' }}>
                  <span>{tr('Labor:', "Main-d'œuvre :")}</span>
                  <span style={{ fontWeight: '600' }}>{formatCurrency(linkedMaintenance.labor_rate_mad || 0)} MAD</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: '#4a5568' }}>
                  <span>{tr('External:', 'Externe :')}</span>
                  <span style={{ fontWeight: '600' }}>{formatCurrency(linkedMaintenance.external_cost_mad || 0)} MAD</span>
                </div>
                {maintenanceStayCharge > 0 && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', color: '#dd6b20' }}>
                      <span>
                        {tr(
                          `Maintenance Stay (${maintenanceStayDays} day${maintenanceStayDays === 1 ? '' : 's'} × ${formatCurrency(maintenanceStayRate)}) :`,
                          `Séjour maintenance (${maintenanceStayDays} jour${maintenanceStayDays === 1 ? '' : 's'} × ${formatCurrency(maintenanceStayRate)}) :`
                        )}
                      </span>
                      <span style={{ fontWeight: '600' }}>{formatCurrency(maintenanceStayCharge)} MAD</span>
                    </div>
                    {maintenanceStayDiscount > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', color: '#2f855a' }}>
                        <span>{tr('Employee Discount:', 'Remise employé :')}</span>
                        <span style={{ fontWeight: '600' }}>-{formatCurrency(maintenanceStayDiscount)} MAD</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {(impoundChargeTotal > 0 || impoundDiscount > 0 || impoundChargeDays > 0 || impoundChargeHours > 0 || impoundManualCharge > 0) && (
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px dashed #fbd38d' }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#b45309', marginBottom: '10px' }}>
                  {impoundIsEstimate ? tr('Impound Estimate Summary', 'Résumé estimatif de fourrière') : tr('Additional Rental Time', 'Temps de location supplémentaire')}
                </div>
                {(impoundIsEstimate ? liveImpoundTotal : impoundBaseCharge) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: '#92400e' }}>
                    <span>
                      {rental.rental_type === 'daily'
                        ? `${impoundIsEstimate ? 'Live additional rental time' : 'Additional rental time'} (${impoundIsEstimate ? `${liveImpoundDays} day${liveImpoundDays === 1 ? '' : 's'} live` : (impoundEstimatePricingLabel || `${impoundChargeDays} day pricing`)}${impoundChargeHours > 0 ? ` • ${impoundChargeHours}h exceeded` : ''})`
                        : `Additional rental time (${impoundChargeHours} hour${impoundChargeHours === 1 ? '' : 's'} tier pricing)`}
                      :
                    </span>
                    <span style={{ fontWeight: '600' }}>+{formatCurrency(impoundIsEstimate ? liveImpoundTotal : impoundBaseCharge)} MAD</span>
                  </div>
                )}
                {!impoundIsEstimate && impoundManualCharge > 0 && (
                  <>
                    {resolvedImpoundDailyFeeTotal > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: '#92400e' }}>
                        <span>
                          {tr('Daily impound fees:', 'Frais journaliers de fourrière :')}
                          {resolvedImpoundDailyFeePerDay > 0
                            ? ` (${formatCurrency(resolvedImpoundDailyFeePerDay)} MAD/day × ${impoundChargeDays}d)`
                            : ''}
                        </span>
                        <span style={{ fontWeight: '600' }}>+{formatCurrency(resolvedImpoundDailyFeeTotal)} MAD</span>
                      </div>
                    )}
                    {resolvedImpoundOneTimeFee > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: '#92400e' }}>
                        <span>{tr('Additional towing fee:', 'Frais de remorquage additionnels :')}</span>
                        <span style={{ fontWeight: '600' }}>+{formatCurrency(resolvedImpoundOneTimeFee)} MAD</span>
                      </div>
                    )}
                  </>
                )}
                {impoundIsEstimate && estimatedWeekendExtraAmount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: '#b45309' }}>
                    <span>Weekend estimate to Monday ({estimatedWeekendExtraDays} extra day{estimatedWeekendExtraDays === 1 ? '' : 's'} × {formatCurrency(estimatedDailyRate)} MAD/day):</span>
                    <span style={{ fontWeight: '600' }}>+{formatCurrency(estimatedWeekendExtraAmount)} MAD</span>
                  </div>
                )}
                {impoundDiscount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', color: '#2f855a' }}>
                    <span>
                      {releasedImpoundDiscount
                        ? tr('Discounted by us:', 'Remis par nous :')
                        : tr('Estimate Discount:', 'Remise estimative :')}
                    </span>
                    <span style={{ fontWeight: '600' }}>-{formatCurrency(impoundDiscount)} MAD</span>
                  </div>
                )}
                {releasedImpoundDiscount && (
                  <div style={{ marginTop: '8px', fontSize: '11px', color: '#2f855a' }}>
                    {tr(
                      `Original impound estimate not charged to the customer: ${formatCurrency(impoundDiscount)} MAD.`,
                      `Estimation initiale de fourriere non facturee au client : ${formatCurrency(impoundDiscount)} MAD.`
                    )}
                  </div>
                )}
              </div>
            )}

            {transportFeeAmount > 0 && (
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px dashed #bae6fd' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: '#0369a1' }}>
                  <span>{tr('Transport fee:', 'Frais de transport :')}</span>
                  <span style={{ fontWeight: '600' }}>+{formatCurrency(transportFeeAmount)} MAD</span>
                </div>
                {transportFeeNote && (
                  <div style={{ fontSize: '11px', color: '#075985', lineHeight: 1.6 }}>
                    {tr('Reason:', 'Raison :')} {transportFeeNote}
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
              <span>
                {impoundIsEstimate
                  ? tr('ESTIMATED TOTAL BY MONDAY:', 'TOTAL ESTIMÉ D ICI LUNDI :')
                  : tr('GRAND TOTAL:', 'TOTAL GÉNÉRAL :')}
              </span>
              <span style={{ color: '#38a169' }}>{formatCurrency(displayedTotalAmount)} MAD</span>
            </div>
          </div>
          
          {/* Right Column - Payments */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ color: '#4a5568' }}>{tr('Total paid:', 'Total payé :')}</span>
              <span style={{ color: '#38a169', fontWeight: '600' }}>-{formatCurrency(displayedCustomerPaidAmount)} MAD</span>
            </div>

            {effectiveAmountDueResolutionMeta && (
              <div style={{
                marginBottom: '14px',
                padding: '12px',
                backgroundColor: '#f0fdf4',
                borderRadius: '10px',
                border: '1px solid #bbf7d0'
              }}>
                <div style={{
                  marginBottom: '8px',
                  fontSize: '11px',
                  fontWeight: 800,
                  letterSpacing: '0.6px',
                  textTransform: 'uppercase',
                  color: '#047857'
                }}>
                  {tr('Balance Resolution', 'Résolution du solde')}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px' }}>
                  <span style={{ color: '#4a5568' }}>{tr('Previous balance:', 'Solde précédent :')}</span>
                  <span style={{ fontWeight: '700', color: '#111827' }}>{formatCurrency(effectiveAmountDueResolutionMeta.previousAmount)} MAD</span>
                </div>
                {effectiveAmountDueResolutionMeta.paymentReceivedNow > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px' }}>
                    <span style={{ color: '#047857' }}>{tr('Additional payment:', 'Paiement complémentaire :')}</span>
                    <span style={{ fontWeight: '700', color: '#047857' }}>-{formatCurrency(effectiveAmountDueResolutionMeta.paymentReceivedNow)} MAD</span>
                  </div>
                )}
                {effectiveAmountDueResolutionMeta.companyDiscount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px' }}>
                    <span style={{ color: '#6d28d9' }}>{tr('Company discount:', 'Remise entreprise :')}</span>
                    <span style={{ fontWeight: '700', color: '#6d28d9' }}>-{formatCurrency(effectiveAmountDueResolutionMeta.companyDiscount)} MAD</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid #bbf7d0', fontSize: '13px' }}>
                  <span style={{ fontWeight: '700', color: '#064e3b' }}>{tr('Final balance:', 'Solde final :')}</span>
                  <span style={{ fontWeight: '800', color: effectiveAmountDueResolutionMeta.newAmount > 0 ? '#c53030' : '#15803d' }}>
                    {formatCurrency(effectiveAmountDueResolutionMeta.newAmount)} MAD
                  </span>
                </div>
              </div>
            )}

            {autoDepositSeizedAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ color: '#9a3412' }}>{impoundIsEstimate ? tr('Applied From Security Deposit:', 'Prélevé sur la caution :') : tr('Security Deposit Seized:', 'Caution saisie :')}</span>
                <span style={{ color: '#c05621', fontWeight: '600' }}>-{formatCurrency(autoDepositSeizedAmount)} MAD</span>
              </div>
            )}
            
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '16px',
              padding: '12px',
              backgroundColor: 'white',
              borderRadius: '8px',
              border: '1px solid #e2e8f0'
            }}>
              <span style={{ fontWeight: '600' }}>
                {impoundIsEstimate
                  ? tr('Estimated Balance Still Due:', 'Solde estimé restant dû :')
                  : (autoDepositSeizedAmount > 0 ? tr('Balance Still Due:', 'Solde restant dû :') : tr('Balance Due:', 'Solde dû :'))}
              </span>
              <span style={{
                fontWeight: 'bold',
                fontSize: '18px',
                color: remainingBalanceAfterDepositSeizure > 0 ? '#c53030' : '#38a169'
              }}>
                {formatCurrency(remainingBalanceAfterDepositSeizure)} MAD
              </span>
            </div>
            
            {receiptDamageDeposit > 0 && (
              <div style={{
                padding: '12px',
                backgroundColor: '#ebf8ff',
                borderRadius: '8px',
                border: '1px solid #90cdf4'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: '#2c5282' }}>{tr('Required Security Deposit:', 'Caution dommages requise :')}</span>
                  <span style={{ fontWeight: 'bold', color: '#2c5282' }}>{formatCurrency(receiptDamageDeposit)} MAD</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: remainingDamageDepositToCollect > 0 ? '4px' : 0, fontSize: '12px', color: receivedDamageDeposit > 0 ? '#2f855a' : '#718096' }}>
                  <span>{tr('Security Received:', 'Caution reçue :')}</span>
                  <span style={{ fontWeight: '600' }}>{formatCurrency(receivedDamageDeposit)} MAD</span>
                </div>
                {remainingDamageDepositToCollect > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#c05621' }}>
                    <span>{tr('Security Still To Collect:', 'Caution restant à remettre :')}</span>
                    <span style={{ fontWeight: '700' }}>{formatCurrency(remainingDamageDepositToCollect)} MAD</span>
                  </div>
                )}
                {autoDepositSeizedAmount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '12px', color: '#c05621' }}>
                    <span>{impoundIsEstimate ? tr('Applied From Security Deposit:', 'Prélevé sur la caution :') : tr('Security Deposit Seized:', 'Caution saisie :')}</span>
                    <span style={{ fontWeight: '700' }}>-{formatCurrency(autoDepositSeizedAmount)} MAD</span>
                  </div>
                )}
                {autoDepositSeizedAmount > 0 && remainingRefundableSecurityDeposit > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '12px', color: '#2f855a' }}>
                    <span>{tr('Security Remaining To Return:', 'Caution restante à restituer :')}</span>
                    <span style={{ fontWeight: '700' }}>{formatCurrency(remainingRefundableSecurityDeposit)} MAD</span>
                  </div>
                )}
                {receivedDamageDeposit > 0 && (
                  <div style={{ marginTop: '8px', fontSize: '12px', color: '#2c5282' }}>
                    {tr(
                      'The damage deposit will be returned to the customer upon return of the vehicle, subject to vehicle condition and any applicable charges.',
                      'La caution dommages sera restituée au client au retour du véhicule, sous réserve de l’état du véhicule et des éventuels frais applicables.'
                    )}
                  </div>
                )}
                {shouldPreviewSecurityDepositReview && rawBalanceDue > heldSecurityDepositAmount && (
                  <div style={{
                    marginTop: '12px',
                    padding: '12px 14px',
                    borderRadius: '12px',
                    border: '1px solid #fbd38d',
                    background: '#fffaf0'
                  }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#9c4221', marginBottom: '8px' }}>
                      {tr('Security deposit review', 'Vérification de la caution')}
                    </div>
                    <div style={{ fontSize: '12px', color: '#7b341e', marginBottom: '8px', lineHeight: 1.6 }}>
                      {tr(
                        `Balance due (${formatCurrency(rawBalanceDue)} MAD) exceeds deposit amount (${formatCurrency(heldSecurityDepositAmount)} MAD).`,
                        `Le solde dû (${formatCurrency(rawBalanceDue)} MAD) dépasse le montant de la caution (${formatCurrency(heldSecurityDepositAmount)} MAD).`
                      )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#7c2d12', marginBottom: '6px' }}>
                      <span>{tr('Apply full deposit to balance:', 'Appliquer toute la caution au solde :')}</span>
                      <span style={{ fontWeight: 700 }}>{formatCurrency(heldSecurityDepositAmount)} MAD</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#9b2c2c', marginBottom: '6px' }}>
                      <span>{tr('Remaining balance after deposit:', 'Solde restant après la caution :')}</span>
                      <span style={{ fontWeight: 700 }}>{formatCurrency(securityDepositPreviewRemainingBalance)} MAD</span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#744210', lineHeight: 1.6 }}>
                      {formatCurrency(rawBalanceDue)} MAD - {formatCurrency(heldSecurityDepositAmount)} MAD = {formatCurrency(securityDepositPreviewRemainingBalance)} MAD {tr('still owed', 'reste à payer')}
                    </div>
                  </div>
                )}
                {shouldPreviewSecurityDepositReview && rawBalanceDue > 0 && rawBalanceDue <= heldSecurityDepositAmount && (
                  <div style={{
                    marginTop: '12px',
                    padding: '12px 14px',
                    borderRadius: '12px',
                    border: '1px solid #bfdbfe',
                    background: '#f8fbff'
                  }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#1d4ed8', marginBottom: '8px' }}>
                      {tr('Security deposit review', 'Vérification de la caution')}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#1e3a8a', marginBottom: '6px' }}>
                      <span>{tr('Deduct from deposit:', 'Déduire de la caution :')}</span>
                      <span style={{ fontWeight: 700 }}>{formatCurrency(securityDepositPreviewDeduction)} MAD</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#15803d', marginBottom: '6px' }}>
                      <span>{tr('Amount to return after deduction:', 'Montant à restituer après déduction :')}</span>
                      <span style={{ fontWeight: 700 }}>{formatCurrency(securityDepositPreviewReturnAmount)} MAD</span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#475569', lineHeight: 1.6 }}>
                      {formatCurrency(heldSecurityDepositAmount)} MAD - {formatCurrency(securityDepositPreviewDeduction)} MAD = {formatCurrency(securityDepositPreviewReturnAmount)} MAD
                    </div>
                  </div>
                )}
                {rental.deposit_returned_at && rental.deposit_return_amount && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '12px', color: '#38a169' }}>
                    <span>{tr('Returned:', 'Retourné :')}</span>
                    <span>{formatCurrency(rental.deposit_return_amount)} MAD</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {showBankTransferSection && (
        <div style={{
          marginTop: '28px',
          padding: '22px',
          borderRadius: '18px',
          background: 'linear-gradient(135deg, #f8fbff 0%, #eef4ff 100%)',
          border: '1px solid #dbe7ff',
          boxShadow: '0 16px 30px rgba(148, 163, 184, 0.10)'
        }}>
          <div style={{
            fontSize: '11px',
            color: '#4c51bf',
            textTransform: 'uppercase',
            letterSpacing: '0.7px',
            marginBottom: '10px',
            fontWeight: 700
          }}>
            {tr('Bank Transfer Option', 'Option de paiement par virement')}
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobileLayout ? '1fr' : 'minmax(220px, 280px) minmax(0, 1fr)',
            gap: '20px',
            alignItems: 'start'
          }}>
            <div style={{
              background: '#ffffff',
              borderRadius: '16px',
              padding: '16px',
              border: '1px solid #e2e8f0',
              textAlign: 'center',
              boxShadow: '0 12px 26px rgba(148, 163, 184, 0.10)'
            }}>
              <img
                src={BANK_TRANSFER_IMAGE_URL}
                alt={tr('Bank transfer QR code', 'QR code de virement bancaire')}
                style={{
                  width: '100%',
                  maxWidth: '190px',
                  borderRadius: '14px',
                  display: 'block',
                  margin: '0 auto'
                }}
              />
            </div>

            <div style={{ minWidth: 0 }}>
              <p style={{
                margin: '0 0 12px 0',
                fontSize: '14px',
                color: '#1e3a8a',
                lineHeight: 1.7,
                wordBreak: 'normal',
                overflowWrap: 'anywhere'
              }}>
                {tr(
                  'The customer may pay the rental deposit or the security deposit by bank transfer using this QR code. Cash payment at the agency is also accepted.',
                  'Le client peut régler l’acompte de location ou la caution par virement bancaire en utilisant ce QR code. Le paiement en espèces à l’agence reste également accepté.'
                )}
              </p>

              <div style={{
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '12px 14px',
                marginBottom: '14px'
              }}>
                <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                  RIB
                </div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', letterSpacing: '0.3px', wordBreak: 'break-all' }}>
                  {RECEIPT_BANKING_DETAILS.rib}
                </div>
              </div>

              <div style={{
                padding: '14px 16px',
                borderRadius: '12px',
                background: '#ffffff',
                border: '1px solid #dbeafe'
              }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#1d4ed8', marginBottom: '6px' }}>
                  {tr('Important note', 'Note importante')}
                </div>
                <div style={{ fontSize: '13px', color: '#1e3a8a', lineHeight: 1.7, wordBreak: 'normal', overflowWrap: 'anywhere' }}>
                  {tr(
                    'Any security deposit transferred to this bank account remains refundable and will be reimbursed after the vehicle is returned in the same condition, subject to any applicable charges.',
                    'Toute caution versée sur ce compte bancaire reste remboursable et sera restituée après le retour du véhicule dans le même état, sous réserve des éventuels frais applicables.'
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer with Status and Signature */}
      <div style={{
        marginTop: '32px',
        paddingTop: '24px',
        borderTop: '2px solid #e2e8f0'
      }}>
        {/* Payment Status Banner - FIXED: Calculate from actual numbers, not rental.payment_status */}
        {(() => {
          const depositPaid = displayedCustomerPaidAmount;
          const balanceDue = displayedReceiptBalanceDue;
          const isActuallyPaid = displayedTotalAmount > 0 && balanceDue <= 0;
          const isPartial = depositPaid > 0 && balanceDue > 0;

          if (impoundIsEstimate) {
            return (
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '20px',
                background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
                borderRadius: '12px',
                marginBottom: '24px'
              }}>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: '700', color: '#9a3412', marginBottom: '4px' }}>
                    {tr('ESTIMATE ACTIVE', 'ESTIMATION ACTIVE')}
                  </div>
                  <div style={{ fontSize: '13px', color: '#7c2d12' }}>
                    {tr(
                      'Base rental is paid. The security deposit is being applied against the estimated impound charge until release.',
                      'La location de base est payée. La caution est appliquée aux frais estimés d’immobilisation jusqu’à la libération.'
                    )}
                  </div>
                </div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: remainingBalanceAfterDepositSeizure > 0 ? '#c53030' : '#15803d' }}>
                  {tr('Estimated due now:', 'Montant estimé à régler maintenant :')} {formatCurrency(remainingBalanceAfterDepositSeizure)} MAD
                </div>
              </div>
            );
          }
          
          const shouldHighlightBalanceDue = balanceDue > 0;
          const highlightedFooterLabel = shouldHighlightBalanceDue
            ? tr('BALANCE DUE', 'SOLDE DÛ')
            : tr('GRAND TOTAL', 'TOTAL GÉNÉRAL');
          const highlightedFooterAmount = shouldHighlightBalanceDue
            ? `-${formatCurrency(balanceDue)} MAD`
            : `${formatCurrency(displayedTotalAmount)} MAD`;

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
                  {tr('FINAL PAYMENT STATUS', 'STATUT FINAL DU PAIEMENT')}
                </div>
                <div style={{
                  fontSize: 'clamp(16px, 4vw, 20px)',
                  fontWeight: 'bold',
                  color: isActuallyPaid ? '#22543d' : isPartial ? '#7b341e' : '#c53030'
                }}>
                  {isActuallyPaid
                    ? tr('✅ FULLY PAID & SETTLED', '✅ ENTIÈREMENT PAYÉ ET RÉGLÉ')
                    : isPartial
                      ? tr('⚠️ PARTIAL PAYMENT - BALANCE DUE', '⚠️ PAIEMENT PARTIEL - SOLDE DÛ')
                      : tr('❌ UNPAID', '❌ IMPAYÉ')}
                </div>
                {balanceDue > 0 && (
                  <div style={{ fontSize: '13px', color: '#7b341e', marginTop: '4px' }}>
                    {formatCurrency(depositPaid)} MAD {tr('paid of', 'payés sur')} {formatCurrency(displayedTotalAmount)} MAD {tr('— Balance due:', '— Solde dû :')} {formatCurrency(balanceDue)} MAD
                  </div>
                )}
              </div>
              
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '12px', color: isActuallyPaid ? '#22543d' : isPartial ? '#7b341e' : '#c53030' }}>
                  {highlightedFooterLabel}
                </div>
                <div style={{
                  fontSize: 'clamp(20px, 5vw, 28px)',
                  fontWeight: 'bold',
                  color: isActuallyPaid ? '#22543d' : isPartial ? '#7b341e' : '#c53030'
                }}>
                  {highlightedFooterAmount}
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
            {stampUrl && <img src={stampUrl} alt={tr('Official Stamp', 'Tampon officiel')} className="stamp-img" />}
            <div>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#2d3748' }}>
                {tr('SaharaX Authorized Signature', 'Signature autorisée SaharaX')}
              </div>
              <div style={{ fontSize: '12px', color: '#718096' }}>
                {receiptSubtitle}
              </div>
            </div>
          </div>
          
          <div style={{ textAlign: 'right' }}>
            <div style={{
              fontSize: '11px',
              color: '#a0aec0',
              fontFamily: 'monospace'
            }}>
              {tr('DOCUMENT ID', 'ID DOCUMENT')} : {safeFormatId(rental.rental_id || rental.id)}
            </div>
            <div style={{
              fontSize: '12px',
              color: '#718096',
              fontStyle: 'italic'
            }}>
              {tr('Thank you for choosing SaharaX Rentals', 'Merci d’avoir choisi SaharaX Rentals')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReceiptTemplate;
