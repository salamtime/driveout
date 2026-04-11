import { formatRentalPackageAllowanceLabel } from './rentalPackageLabels';

const normalizePackageDisplayPrice = (amount) => {
  const numericAmount = Number(amount || 0);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return 0;

  const rounded = Math.round(numericAmount);
  const lastDigit = rounded % 10;
  return lastDigit === 9 ? rounded : rounded + (9 - lastDigit);
};

export const isHalfDayPackage = (pkg) =>
  /half[\s-]?day/i.test(String(pkg?.name || '')) || /demi[\s-]?journ/i.test(String(pkg?.name || ''));

export const isHalfHourPackage = (pkg) =>
  /half[\s-]?hour/i.test(String(pkg?.name || '')) ||
  /30[\s-]?(min|minute|minutes)/i.test(String(pkg?.name || ''));

const getPackageDurationRank = (pkg) => {
  if (isHalfHourPackage(pkg)) return 4;
  if (isHalfDayPackage(pkg)) return 2;
  if (pkg?.kind === 'unlimited') return 3;
  return 1;
};

const getSelectedDurationForPackage = (pkg, fallbackDurationUnits = 1) =>
  isHalfHourPackage(pkg)
    ? 0.5
    : isHalfDayPackage(pkg)
      ? 4
      : Math.max(1, Number(pkg?.durationUnits || fallbackDurationUnits || 1) || 1);

const getEffectivePackagePrice = (listing, pkg, rentalType, fallbackDurationUnits = 1) => {
  const basePackagePrice = Number(pkg?.fixedAmount || 0);

  if (isHalfHourPackage(pkg) || isHalfDayPackage(pkg)) {
    return normalizePackageDisplayPrice(basePackagePrice);
  }

  const duration = getSelectedDurationForPackage(pkg, fallbackDurationUnits);

  if (pkg?.kind === 'unlimited') {
    if (basePackagePrice > 0) {
      return normalizePackageDisplayPrice(basePackagePrice * duration);
    }

    const fallbackUnitPrice = rentalType === 'daily'
      ? Number(listing?.dailyPrice || 0)
      : Number(listing?.hourlyPrice || 0);

    return fallbackUnitPrice > 0 ? normalizePackageDisplayPrice(fallbackUnitPrice * duration) : 0;
  }

  return basePackagePrice > 0 ? normalizePackageDisplayPrice(basePackagePrice * duration) : 0;
};

export const getDefaultInstantBookingPackage = (listing, rentalType = 'hourly') => {
  const packages = Array.isArray(listing?.packageCatalog?.[rentalType]) ? listing.packageCatalog[rentalType] : [];
  if (!packages.length) return null;

  const sortedPackages = [...packages].sort((left, right) => {
    const rankDiff = getPackageDurationRank(left) - getPackageDurationRank(right);
    if (rankDiff !== 0) return rankDiff;

    const durationDiff = getSelectedDurationForPackage(left, rentalType === 'daily' ? 1 : 1)
      - getSelectedDurationForPackage(right, rentalType === 'daily' ? 1 : 1);
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
  const selectedPackage = options.packageOverride || getDefaultInstantBookingPackage(listing, rentalType);
  const next = new URLSearchParams();

  next.set('rentalType', rentalType);

  if (selectedPackage) {
    next.set('packageId', String(selectedPackage.id || ''));
    next.set('packageName', formatRentalPackageAllowanceLabel(selectedPackage, { rentalType }));
    next.set('packageAmount', String(getEffectivePackagePrice(listing, selectedPackage, rentalType)));
    next.set('packageKind', String(selectedPackage.kind || ''));
    next.set('durationUnits', String(getSelectedDurationForPackage(selectedPackage)));

    if (selectedPackage.includedKilometers) {
      next.set('includedKilometers', String(selectedPackage.includedKilometers));
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
