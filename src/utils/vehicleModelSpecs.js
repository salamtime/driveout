export const DEFAULT_MODEL_TANK_CAPACITY_LITERS = {
  AT5: 19,
  AT6: 23,
};

export const getDefaultTankCapacityLiters = (modelLike) => {
  const normalized = String(modelLike || '').trim().toUpperCase();
  if (!normalized) return null;

  if (normalized.includes('AT6')) return DEFAULT_MODEL_TANK_CAPACITY_LITERS.AT6;
  if (normalized.includes('AT5')) return DEFAULT_MODEL_TANK_CAPACITY_LITERS.AT5;

  return null;
};

export const resolveTankCapacityLiters = (...candidates) => {
  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (!Number.isNaN(numeric) && numeric > 0) {
      return numeric;
    }
  }

  for (const candidate of candidates) {
    const fallback = getDefaultTankCapacityLiters(candidate);
    if (fallback) {
      return fallback;
    }
  }

  return null;
};
