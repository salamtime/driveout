export const formatRentalReference = (rentalId) => {
  if (!rentalId) return 'N/A';

  const raw = String(rentalId).trim();
  if (!raw) return 'N/A';

  if (raw.startsWith('RNT-')) return raw;

  if (raw.includes('-') && raw.length >= 8) {
    return `RNT-${raw.slice(0, 8).toUpperCase()}`;
  }

  return raw;
};

export default formatRentalReference;
