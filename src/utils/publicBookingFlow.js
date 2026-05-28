import { formatRentalPackageAllowanceLabel } from './rentalPackageLabels';

const normalizePackageDisplayPrice = (amount) => {
  const numericAmount = Number(amount || 0);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return 0;
  return Math.round(numericAmount);
};

export const isHalfDayPackage = (pkg) =>
  (() => {
    const explicitUnits = Number(pkg?.durationUnits ?? pkg?.duration_units ?? 0);
    if (explicitUnits > 0 && explicitUnits !== 4) return false;
    return /half[\s-]?day/i.test(String(pkg?.name || '')) || /demi[\s-]?journ/i.test(String(pkg?.name || ''));
  })();

export const isHalfHourPackage = (pkg) =>
  (() => {
    const explicitUnits = Number(pkg?.durationUnits ?? pkg?.duration_units ?? 0);
    if (explicitUnits > 0 && explicitUnits !== 0.5) return false;
    return /half[\s-]?hour/i.test(String(pkg?.name || '')) ||
      /30[\s-]?(min|minute|minutes)/i.test(String(pkg?.name || ''));
  })();

const getPackageDurationRank = (pkg) => {
  if (isHalfHourPackage(pkg)) return 4;
  if (isHalfDayPackage(pkg)) return 2;
  if (pkg?.kind === 'unlimited') return 3;
  return 1;
};

export const getPackageDurationUnits = (pkg, fallbackDurationUnits = 1) => {
  const explicitUnits = Number(pkg?.durationUnits ?? pkg?.duration_units ?? 0);
  if (Number.isFinite(explicitUnits) && explicitUnits > 0) return explicitUnits;
  if (isHalfHourPackage(pkg)) return 0.5;
  if (isHalfDayPackage(pkg)) return 4;
  return Math.max(1, Number(fallbackDurationUnits || 1) || 1);
};

export const packageMatchesDuration = (pkg, requestedDurationUnits = 1) =>
  packageMatchesRentalDuration(pkg, requestedDurationUnits, 'hourly');

const isBaseHourlyPackageForDuration = (pkg, requestedDurationUnits = 1) => {
  const explicitUnits = Number(pkg?.durationUnits ?? pkg?.duration_units ?? 0);
  return Number(requestedDurationUnits || 1) === 2 && explicitUnits === 1 && !isHalfHourPackage(pkg) && !isHalfDayPackage(pkg);
};

const getEffectivePackageDurationUnits = (pkg, fallbackDurationUnits = 1, rentalType = 'hourly') => {
  if (rentalType === 'hourly' && isBaseHourlyPackageForDuration(pkg, fallbackDurationUnits)) return 2;
  return getPackageDurationUnits(pkg, fallbackDurationUnits);
};

export const packageMatchesRentalDuration = (pkg, requestedDurationUnits = 1, rentalType = 'hourly') => {
  const requestedUnits = Number(requestedDurationUnits || 1) || 1;
  if (rentalType === 'hourly' && isBaseHourlyPackageForDuration(pkg, requestedUnits)) return true;
  return Math.abs(getPackageDurationUnits(pkg, requestedUnits) - requestedUnits) < 0.001;
};

const isFlexibleHourlyPackage = (pkg) => {
  const explicitUnits = Number(pkg?.durationUnits ?? pkg?.duration_units ?? 0);
  return (!Number.isFinite(explicitUnits) || explicitUnits <= 0) && !isHalfHourPackage(pkg) && !isHalfDayPackage(pkg);
};

const isFlexibleHourlyPackageForDuration = (pkg, requestedDurationUnits = 1) => {
  return isFlexibleHourlyPackage(pkg) || isBaseHourlyPackageForDuration(pkg, requestedDurationUnits);
};

const shouldScaleHourlyPackageByDuration = (pkg, rentalType, durationUnits = 1) => {
  if (rentalType !== 'hourly') return false;
  if (isHalfHourPackage(pkg) || isHalfDayPackage(pkg)) return false;
  const explicitUnits = Number(pkg?.durationUnits ?? pkg?.duration_units ?? 0);
  if (Number.isFinite(explicitUnits) && explicitUnits > 0) {
    return isBaseHourlyPackageForDuration(pkg, durationUnits);
  }
  return Number(durationUnits || 0) > 0;
};

const getEffectivePackagePrice = (listing, pkg, rentalType, fallbackDurationUnits = 1) => {
  const basePackagePrice = Number(pkg?.fixedAmount || 0);

  if (isHalfHourPackage(pkg) || isHalfDayPackage(pkg)) {
    return normalizePackageDisplayPrice(basePackagePrice);
  }

  const duration = getEffectivePackageDurationUnits(pkg, fallbackDurationUnits, rentalType);

  if (pkg?.kind === 'unlimited') {
    if (basePackagePrice > 0) {
      const durationMultiplier = shouldScaleHourlyPackageByDuration(pkg, rentalType, duration)
        ? Math.max(1, Number(duration || 1) || 1)
        : 1;
      return normalizePackageDisplayPrice(basePackagePrice * durationMultiplier);
    }

    const fallbackUnitPrice = rentalType === 'daily'
      ? Number(listing?.dailyPrice || 0)
      : Number(listing?.hourlyPrice || 0);

    return fallbackUnitPrice > 0 ? normalizePackageDisplayPrice(fallbackUnitPrice) : 0;
  }

  if (
    shouldScaleHourlyPackageByDuration(pkg, rentalType, duration) ||
    (rentalType === 'hourly' && isFlexibleHourlyPackageForDuration(pkg, duration))
  ) {
    const durationMultiplier = Math.max(1, Number(duration || 1) || 1);
    return basePackagePrice > 0 ? Math.round(basePackagePrice * durationMultiplier) : 0;
  }

  return basePackagePrice > 0 ? normalizePackageDisplayPrice(basePackagePrice) : 0;
};

const getEffectiveIncludedKilometers = (pkg, rentalType, fallbackDurationUnits = 1) => {
  const baseKilometers = Number(pkg?.includedKilometers || 0);
  if (!Number.isFinite(baseKilometers) || baseKilometers <= 0) return 0;

  const duration = getEffectivePackageDurationUnits(pkg, fallbackDurationUnits, rentalType);
  if (!shouldScaleHourlyPackageByDuration(pkg, rentalType, duration)) return baseKilometers;

  return Math.round(baseKilometers * Math.max(1, Number(duration || 1) || 1));
};

export const getDefaultInstantBookingPackage = (listing, rentalType = 'hourly', selectedDurationUnits = 1) => {
  const packages = Array.isArray(listing?.packageCatalog?.[rentalType]) ? listing.packageCatalog[rentalType] : [];
  if (!packages.length) return null;
  const requestedDurationUnits = Number(selectedDurationUnits || 1) || 1;
  const durationScopedPackages = packages.filter((pkg) => packageMatchesRentalDuration(pkg, requestedDurationUnits, rentalType));
  const scopedPackages = durationScopedPackages.length > 0 ? durationScopedPackages : packages;

  const sortedPackages = [...scopedPackages].sort((left, right) => {
    const rankDiff = getPackageDurationRank(left) - getPackageDurationRank(right);
    if (rankDiff !== 0) return rankDiff;

    const durationDiff = getEffectivePackageDurationUnits(left, requestedDurationUnits, rentalType)
      - getEffectivePackageDurationUnits(right, requestedDurationUnits, rentalType);
    if (durationDiff !== 0) return durationDiff;

    const kmDiff = Number(left?.includedKilometers || 0) - Number(right?.includedKilometers || 0);
    if (kmDiff !== 0) return kmDiff;

    return Number(left?.fixedAmount || 0) - Number(right?.fixedAmount || 0);
  });

  return sortedPackages[0] || null;
};

export const buildInstantBookingHref = (listing, options = {}) => {
  if (!listing?.id) return '/rent';

  const rentalType = options.rentalType || 'hourly';
  const requestedDurationUnits = Number(options.selectedDurationUnits || 1) || 1;
  const selectedPackage = options.packageOverride || getDefaultInstantBookingPackage(listing, rentalType, requestedDurationUnits);
  const next = new URLSearchParams();

  next.set('rentalType', rentalType);

  if (selectedPackage) {
    next.set('packageId', String(selectedPackage.id || ''));
    const selectedDuration = getEffectivePackageDurationUnits(selectedPackage, requestedDurationUnits, rentalType);
    const includedKilometers = getEffectiveIncludedKilometers(selectedPackage, rentalType, selectedDuration);
    const displayPackage = {
      ...selectedPackage,
      durationUnits: selectedDuration,
      duration_units: selectedDuration,
      ...(includedKilometers ? { includedKilometers } : {}),
    };
    next.set('packageName', formatRentalPackageAllowanceLabel(displayPackage, { rentalType, fallbackDurationUnits: selectedDuration }));
    next.set('packageAmount', String(getEffectivePackagePrice(listing, selectedPackage, rentalType, requestedDurationUnits)));
    next.set('packageKind', String(selectedPackage.kind || ''));
    next.set('durationUnits', String(selectedDuration));

    if (includedKilometers) {
      next.set('includedKilometers', String(includedKilometers));
    }

    if (selectedPackage.extraKmRate) {
      next.set('extraKmRate', String(selectedPackage.extraKmRate));
    }
  }

  const city = options.city || listing?.location?.city;
  if (city) {
    next.set('city', city);
  }

  return `/rent/${listing.id}?${next.toString()}`;
};
