export const DEFAULT_SIMPLE_RENTAL_GRACE_MINUTES = 60;

export const isPackagePricingEnabled = (rentalLike = {}) => {
  const value = rentalLike?.use_package_pricing;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;

  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizePackageLimit = (pkg = {}) =>
  Math.max(
    0,
    toNumber(
      pkg?.included_kilometers ??
      pkg?.includedKilometers ??
      pkg?.included_km ??
      pkg?.includedKm,
      0
    )
  );

const getPackageName = (pkg = {}) =>
  String(
    pkg?.name ??
    pkg?.package_name ??
    pkg?.display_name ??
    pkg?.displayName ??
    pkg?.title ??
    ''
  ).toLowerCase();

export const getSimplePackageDurationUnits = (pkg = {}) => {
  const durationUnits = Number(
    pkg.duration_units ??
    pkg.durationUnits ??
    pkg.package_duration_units ??
    pkg.packageDurationUnits
  );

  if (Number.isFinite(durationUnits) && durationUnits > 0) {
    return durationUnits;
  }

  const rawLabel = getPackageName(pkg);
  if (!rawLabel) return 1;
  if (rawLabel.includes('30 min')) return 0.5;
  if (rawLabel.includes('1.5 hour') || rawLabel.includes('1,5 hour')) return 1.5;

  const hourMatch = rawLabel.match(/(\d+(?:[.,]\d+)?)\s*(?:h|hour|hours)\b/);
  if (hourMatch) {
    return Number(String(hourMatch[1]).replace(',', '.')) || 1;
  }

  const dayMatch = rawLabel.match(/(\d+(?:[.,]\d+)?)\s*day/);
  if (dayMatch) {
    return Number(String(dayMatch[1]).replace(',', '.')) || 1;
  }

  return 1;
};

const getPackageKind = (pkg = {}) =>
  String(pkg?.kind ?? pkg?.package_type ?? pkg?.type ?? '').toLowerCase();

const getRateTypeName = (pkg = {}) =>
  String(
    pkg?.rate_types?.name ??
    pkg?.rate_type?.name ??
    pkg?.rate_type_name ??
    ''
  ).toLowerCase();

const getRateTypeId = (pkg = {}) => Number(pkg?.rate_type_id ?? pkg?.rateTypeId ?? 0) || 0;

const isHourlyPackage = (pkg = {}) => {
  const name = getPackageName(pkg);
  const kind = getPackageKind(pkg);
  const rateTypeName = getRateTypeName(pkg);
  const rateTypeId = getRateTypeId(pkg);
  return (
    rateTypeId === 1 ||
    rateTypeName.includes('hour') ||
    kind.includes('hour') ||
    name.includes('per hour') ||
    name.includes('hourly') ||
    name.includes('30 min') ||
    name.includes('minute')
  );
};

const isDailyPackage = (pkg = {}) => {
  const name = getPackageName(pkg);
  const kind = getPackageKind(pkg);
  const rateTypeName = getRateTypeName(pkg);
  const rateTypeId = getRateTypeId(pkg);
  return (
    rateTypeId === 2 ||
    rateTypeName.includes('day') ||
    kind.includes('day') ||
    name.includes('per day') ||
    name.includes('daily') ||
    name.includes('day')
  );
};

const getTargetHourlyPackageFamily = ({
  durationMinutes = 0,
  gracePeriodMinutes = DEFAULT_SIMPLE_RENTAL_GRACE_MINUTES,
  originalPackage = null,
  requestedDurationUnits = 1,
}) => {
  const safeDurationMinutes = Math.max(0, toNumber(durationMinutes, 0));
  const safeGraceMinutes = Math.max(0, toNumber(gracePeriodMinutes, DEFAULT_SIMPLE_RENTAL_GRACE_MINUTES));
  const originalDurationUnits = getSimplePackageDurationUnits(originalPackage || {});
  const requestedUnits = Math.max(0.5, toNumber(requestedDurationUnits, 1));

  if (originalDurationUnits <= 0.5 || requestedUnits <= 0.5) {
    const thresholdMinutes = 30 + safeGraceMinutes;
    return safeDurationMinutes <= thresholdMinutes ? 0.5 : 1;
  }

  return 1;
};

const calculateHourlyBilledUnits = ({
  durationMinutes = 0,
  gracePeriodMinutes = DEFAULT_SIMPLE_RENTAL_GRACE_MINUTES,
  originalPackage = null,
  requestedDurationUnits = 1,
}) => {
  const safeDurationMinutes = Math.max(0, toNumber(durationMinutes, 0));
  const safeGraceMinutes = Math.max(0, toNumber(gracePeriodMinutes, DEFAULT_SIMPLE_RENTAL_GRACE_MINUTES));
  if (safeDurationMinutes <= 0) return 0;

  const targetFamily = getTargetHourlyPackageFamily({
    durationMinutes: safeDurationMinutes,
    gracePeriodMinutes: safeGraceMinutes,
    originalPackage,
    requestedDurationUnits,
  });

  if (targetFamily <= 0.5) {
    return 0.5;
  }

  return Math.max(1, Math.ceil((safeDurationMinutes - safeGraceMinutes) / 60));
};

const isCompatibleWithRentalFamily = ({
  pkg = null,
  rentalType = 'hourly',
  durationMinutes = 0,
  gracePeriodMinutes = DEFAULT_SIMPLE_RENTAL_GRACE_MINUTES,
  originalPackage = null,
  requestedDurationUnits = 1,
}) => {
  if (!pkg) return false;
  const normalizedRentalType = String(rentalType || 'hourly').toLowerCase();
  const packageDurationUnits = getSimplePackageDurationUnits(pkg);
  const tolerance = 0.01;

  if (normalizedRentalType === 'daily') {
    return isDailyPackage(pkg) || !isHourlyPackage(pkg);
  }

  if (!isHourlyPackage(pkg) || isDailyPackage(pkg)) {
    return false;
  }

  const targetFamily = getTargetHourlyPackageFamily({
    durationMinutes,
    gracePeriodMinutes,
    originalPackage,
    requestedDurationUnits,
  });

  if (targetFamily <= 0.5) {
    return Math.abs(packageDurationUnits - 0.5) <= tolerance;
  }

  return Math.abs(packageDurationUnits - 1) <= tolerance;
};

const getPackageDurationMultiplier = ({
  pkg = null,
  rentalType = 'hourly',
  billedUnits = 1,
  durationMinutes = 0,
  gracePeriodMinutes = DEFAULT_SIMPLE_RENTAL_GRACE_MINUTES,
  originalPackage = null,
  requestedDurationUnits = 1,
}) => {
  if (!pkg) return 1;

  const normalizedRentalType = String(rentalType || 'hourly').toLowerCase();
  const packageDurationUnits = Math.max(0.5, toNumber(getSimplePackageDurationUnits(pkg), 1));

  if (normalizedRentalType === 'daily') {
    return Math.max(1, Math.round(Math.max(1, toNumber(billedUnits, 1)) / packageDurationUnits));
  }

  const targetFamily = getTargetHourlyPackageFamily({
    durationMinutes,
    gracePeriodMinutes,
    originalPackage,
    requestedDurationUnits,
  });

  if (targetFamily <= 0.5) {
    return 1;
  }

  return Math.max(1, Math.round(Math.max(1, toNumber(billedUnits, 1)) / packageDurationUnits));
};

export const calculateDurationMinutes = (startTime, endTime) => {
  if (!startTime || !endTime) return 0;

  const start = startTime instanceof Date ? startTime : new Date(startTime);
  const end = endTime instanceof Date ? endTime : new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;

  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
};

export const calculateBilledHours = (durationMinutes, gracePeriodMinutes = DEFAULT_SIMPLE_RENTAL_GRACE_MINUTES) => {
  return calculateHourlyBilledUnits({
    durationMinutes,
    gracePeriodMinutes,
  });
};

export const selectBestKilometerPackage = (
  packages = [],
  totalKmUsed = 0,
  {
    rentalType = 'hourly',
    durationMinutes = 0,
    gracePeriodMinutes = DEFAULT_SIMPLE_RENTAL_GRACE_MINUTES,
    billedUnits = null,
    originalPackage = null,
    requestedDurationUnits = 1,
  } = {}
) => {
  const normalizedPackages = (Array.isArray(packages) ? packages : [])
    .filter(Boolean)
    .map((pkg) => ({
      ...pkg,
      baseIncludedKm: normalizePackageLimit(pkg),
      packageDurationUnits: getSimplePackageDurationUnits(pkg),
    }))
    .filter((pkg) => pkg.baseIncludedKm > 0)
    .filter((pkg) => isCompatibleWithRentalFamily({
      pkg,
      rentalType,
      durationMinutes,
      gracePeriodMinutes,
      originalPackage,
      requestedDurationUnits,
    }))
    .map((pkg) => {
      const multiplier = getPackageDurationMultiplier({
        pkg,
        rentalType,
        billedUnits: billedUnits ?? requestedDurationUnits,
        durationMinutes,
        gracePeriodMinutes,
        originalPackage,
        requestedDurationUnits,
      });
      return {
        ...pkg,
        packageLimitKm: pkg.baseIncludedKm * multiplier,
      };
    })
    .sort((left, right) => left.packageLimitKm - right.packageLimitKm);

  if (!normalizedPackages.length) {
    return {
      selectedPackage: null,
      packageLimitKm: 0,
      packageOverflowKm: 0,
    };
  }

  const safeKmUsed = Math.max(0, toNumber(totalKmUsed, 0));
  const minimumAllowedLimit = (() => {
    if (!originalPackage) return 0;

    const originalStillCompatible = isCompatibleWithRentalFamily({
      pkg: originalPackage,
      rentalType,
      durationMinutes,
      gracePeriodMinutes,
      originalPackage,
      requestedDurationUnits,
    });

    if (!originalStillCompatible) return 0;

    return normalizePackageLimit(originalPackage) * getPackageDurationMultiplier({
      pkg: originalPackage,
      rentalType,
      billedUnits: billedUnits ?? requestedDurationUnits,
      durationMinutes,
      gracePeriodMinutes,
      originalPackage,
      requestedDurationUnits,
    });
  })();

  const eligiblePackages = normalizedPackages.filter((pkg) => pkg.packageLimitKm >= minimumAllowedLimit);
  const selectedPackage =
    eligiblePackages.find((pkg) => pkg.packageLimitKm >= safeKmUsed) ||
    eligiblePackages[eligiblePackages.length - 1] ||
    normalizedPackages[normalizedPackages.length - 1];

  return {
    selectedPackage,
    packageLimitKm: selectedPackage?.packageLimitKm || 0,
    packageOverflowKm: Math.max(0, safeKmUsed - (selectedPackage?.packageLimitKm || 0)),
  };
};

export const calculateSimpleRentalPricing = ({
  startTime,
  endTime,
  gracePeriodMinutes = DEFAULT_SIMPLE_RENTAL_GRACE_MINUTES,
  hourlyRate = 0,
  totalKmUsed = 0,
  packages = [],
  usePackagePricing = true,
  rentalType = 'hourly',
  originalPackage = null,
  durationUnits = null,
} = {}) => {
  const durationMinutes = calculateDurationMinutes(startTime, endTime);
  const requestedDurationUnits = Math.max(0.5, toNumber(durationUnits, 1));
  const normalizedRentalType = String(rentalType || 'hourly').toLowerCase();
  const billedHours = normalizedRentalType === 'hourly'
    ? calculateHourlyBilledUnits({
        durationMinutes,
        gracePeriodMinutes,
        originalPackage,
        requestedDurationUnits,
      })
    : Math.max(1, requestedDurationUnits);
  const safeHourlyRate = Math.max(0, toNumber(hourlyRate, 0));
  const safeKmUsed = Math.max(0, toNumber(totalKmUsed, 0));
  const packageMatch = usePackagePricing
    ? selectBestKilometerPackage(packages, safeKmUsed, {
        rentalType: normalizedRentalType,
        durationMinutes,
        gracePeriodMinutes,
        billedUnits: billedHours,
        originalPackage,
        requestedDurationUnits,
      })
    : {
        selectedPackage: null,
        packageLimitKm: 0,
        packageOverflowKm: 0,
      };

  return {
    durationMinutes,
    billedHours,
    hourlyRate: safeHourlyRate,
    totalPrice: Number((billedHours * safeHourlyRate).toFixed(2)),
    kmUsed: safeKmUsed,
    selectedPackage: packageMatch.selectedPackage,
    packageLimitKm: packageMatch.packageLimitKm,
    packageOverflowKm: packageMatch.packageOverflowKm,
    gracePeriodMinutes: Math.max(0, toNumber(gracePeriodMinutes, DEFAULT_SIMPLE_RENTAL_GRACE_MINUTES)),
  };
};
