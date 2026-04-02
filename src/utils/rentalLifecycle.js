export const deriveEffectiveRentalStatus = (rental) => {
  const rawStatus = String(rental?.rental_status || rental?.status || '').toLowerCase();
  const vehicleStatus = String(rental?.vehicle?.status || '').toLowerCase();

  const hasHistoricalImpoundStatus = Boolean(
    rawStatus === 'impounded' ||
    rental?.is_impounded ||
    rental?.impounded_at ||
    rental?.released_from_impound_at ||
    vehicleStatus === 'impounded'
  );

  if (hasHistoricalImpoundStatus) {
    return 'impounded';
  }

  if (['completed', 'cancelled', 'expired'].includes(rawStatus) || rental?.completed_at) {
    return rawStatus === 'cancelled' || rawStatus === 'expired' ? rawStatus : 'completed';
  }

  if (rental?.started_at) {
    return 'active';
  }

  if (rawStatus === 'confirmed') {
    return 'confirmed';
  }

  return rawStatus || 'scheduled';
};

export const normalizeRentalLifecycle = (rental) => {
  if (!rental) return rental;

  const effectiveStatus = deriveEffectiveRentalStatus(rental);

  return {
    ...rental,
    rental_status: effectiveStatus,
    status: effectiveStatus,
  };
};
