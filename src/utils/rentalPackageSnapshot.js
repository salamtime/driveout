const toPositiveNumber = (value) => {
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
};

export const buildRentalBookedPackageSnapshot = (rentalLike = {}, linkedPackage = null) => {
  const basePackage = linkedPackage || rentalLike?.package || null;
  const snapshotDurationUnits =
    basePackage?.duration_units ??
    basePackage?.durationUnits ??
    rentalLike?.package_duration_units ??
    rentalLike?.selected_package_duration_units ??
    null;
  const snapshotId =
    rentalLike?.package_id ||
    rentalLike?.selected_package_id ||
    basePackage?.id ||
    null;
  const snapshotName =
    rentalLike?.package_name ||
    rentalLike?.selected_package_name ||
    basePackage?.name ||
    basePackage?.package_name ||
    basePackage?.display_name ||
    basePackage?.displayName ||
    '';
  const snapshotRatePerUnit =
    toPositiveNumber(rentalLike?.package_rate_per_unit) ||
    toPositiveNumber(rentalLike?.selected_package_rate_per_unit) ||
    toPositiveNumber(basePackage?.fixed_amount) ||
    toPositiveNumber(basePackage?.fixedAmount) ||
    toPositiveNumber(rentalLike?.unit_price);
  const snapshotIncludedKmPerUnit =
    toPositiveNumber(rentalLike?.package_included_km_per_unit) ||
    toPositiveNumber(rentalLike?.selected_package_included_km_per_unit) ||
    toPositiveNumber(basePackage?.included_kilometers) ||
    toPositiveNumber(basePackage?.includedKilometers) ||
    toPositiveNumber(basePackage?.included_km) ||
    toPositiveNumber(basePackage?.includedKm);
  const storedBookedTotalIncludedKm =
    toPositiveNumber(rentalLike?.package_total_included_km) ||
    toPositiveNumber(rentalLike?.selected_package_total_included_km);
  const expectedBookedTotalIncludedKm = snapshotIncludedKmPerUnit > 0
    ? snapshotIncludedKmPerUnit * (toPositiveNumber(snapshotDurationUnits) || 1)
    : 0;
  const appliedOnlyFallback =
    snapshotIncludedKmPerUnit <= 0 && storedBookedTotalIncludedKm <= 0
      ? toPositiveNumber(rentalLike?.included_kilometers_applied)
      : 0;
  const snapshotTotalIncludedKm =
    expectedBookedTotalIncludedKm ||
    storedBookedTotalIncludedKm ||
    appliedOnlyFallback;
  const snapshotExtraKmRate =
    toPositiveNumber(rentalLike?.package_extra_rate) ||
    toPositiveNumber(basePackage?.extra_km_rate) ||
    toPositiveNumber(basePackage?.extraKmRate) ||
    toPositiveNumber(rentalLike?.extra_km_rate_applied);

  if (
    !snapshotId &&
    !snapshotName &&
    snapshotRatePerUnit <= 0 &&
    snapshotIncludedKmPerUnit <= 0 &&
    snapshotTotalIncludedKm <= 0 &&
    snapshotExtraKmRate <= 0
  ) {
    return null;
  }

  return {
    ...(basePackage || {}),
    id: snapshotId,
    name: snapshotName || basePackage?.name || basePackage?.package_name || '',
    package_name: snapshotName || basePackage?.package_name || basePackage?.name || '',
    display_name:
      basePackage?.display_name ||
      basePackage?.displayName ||
      snapshotName ||
      '',
    fixed_amount: snapshotRatePerUnit || toPositiveNumber(basePackage?.fixed_amount),
    included_kilometers: snapshotIncludedKmPerUnit || toPositiveNumber(basePackage?.included_kilometers),
    extra_km_rate: snapshotExtraKmRate || toPositiveNumber(basePackage?.extra_km_rate),
    duration_units: snapshotDurationUnits,
    total_included_kilometers_snapshot: snapshotTotalIncludedKm || null,
  };
};
