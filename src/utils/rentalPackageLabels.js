const normalizeNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const formatQuantity = (value) => {
  const number = normalizeNumber(value);
  if (!number) return '0';
  return Number.isInteger(number) ? String(number) : String(number).replace(/\.0+$/, '');
};

const getIncludedKilometers = (pkg) => {
  const directValue = normalizeNumber(
    pkg?.includedKilometers
      ?? pkg?.included_kilometers
      ?? pkg?.includedKm
      ?? pkg?.included_km
  );
  if (directValue > 0) return directValue;

  const match = String(pkg?.name || '').match(/(\d+(?:[.,]\d+)?)\s*km/i);
  return match ? normalizeNumber(match[1].replace(',', '.')) : 0;
};

const getPackageDurationUnits = (pkg, fallbackDurationUnits = 1) => {
  const explicitUnits = normalizeNumber(pkg?.durationUnits ?? pkg?.duration_units);
  if (explicitUnits > 0) return explicitUnits;

  const rawName = String(pkg?.name || '').toLowerCase();
  if (/half[\s-]?hour/.test(rawName) || /30[\s-]?(min|minute|minutes)/.test(rawName)) return 0.5;
  if (/half[\s-]?day/.test(rawName) || /demi[\s-]?journ/.test(rawName)) return 4;

  const units = normalizeNumber(fallbackDurationUnits);
  return units > 0 ? units : 1;
};

const translate = (tr, english, french) => (typeof tr === 'function' ? tr(english, french) : english);

export const formatRentalPackageAllowanceLabel = (pkg, options = {}) => {
  const { rentalType = 'hourly', fallbackDurationUnits = 1, tr } = options;
  const rawName = String(pkg?.displayName || pkg?.name || '').trim();

  if (pkg?.kind === 'unlimited') {
    return translate(tr, 'Unlimited KM', 'KM illimités');
  }

  const includedKilometers = getIncludedKilometers(pkg);
  if (includedKilometers <= 0) {
    return rawName || translate(tr, 'Package', 'Forfait');
  }

  const kmLabel = formatQuantity(includedKilometers);
  const durationUnits = getPackageDurationUnits(pkg, fallbackDurationUnits);

  if (rentalType === 'daily') {
    if (durationUnits === 1) {
      return translate(tr, `${kmLabel} km included for 1 day`, `${kmLabel} km inclus pour 1 jour`);
    }
    return translate(tr, `${kmLabel} km included for ${formatQuantity(durationUnits)} days`, `${kmLabel} km inclus pour ${formatQuantity(durationUnits)} jours`);
  }

  if (durationUnits === 0.5) {
    return translate(tr, `${kmLabel} km included for 30 minutes`, `${kmLabel} km inclus pour 30 minutes`);
  }

  if (durationUnits === 1) {
    return translate(tr, `${kmLabel} km included for 1 hour`, `${kmLabel} km inclus pour 1 heure`);
  }

  return translate(tr, `${kmLabel} km included for ${formatQuantity(durationUnits)} hours`, `${kmLabel} km inclus pour ${formatQuantity(durationUnits)} heures`);
};
