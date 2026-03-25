export const DEFAULT_VEHICLE_TANK_LITERS = 23;
export const DEFAULT_FUEL_LINES = 8;

export const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export const roundTo = (value, decimals = 2) => {
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
};

export const linesToLiters = (
  lines,
  tankCapacityLiters = DEFAULT_VEHICLE_TANK_LITERS,
  maxLines = DEFAULT_FUEL_LINES
) => {
  if (lines === null || lines === undefined || lines === '') {
    return 0;
  }

  const safeLines = clamp(Number(lines) || 0, 0, maxLines);
  return roundTo((safeLines / maxLines) * tankCapacityLiters, 3);
};

export const litersToLines = (
  liters,
  tankCapacityLiters = DEFAULT_VEHICLE_TANK_LITERS,
  maxLines = DEFAULT_FUEL_LINES
) => {
  if (liters === null || liters === undefined || liters === '') {
    return 0;
  }

  const safeLiters = clamp(Number(liters) || 0, 0, tankCapacityLiters);
  return clamp(Math.round((safeLiters / tankCapacityLiters) * maxLines), 0, maxLines);
};

export const normalizeFuelState = ({
  liters,
  lines,
  tankCapacityLiters = DEFAULT_VEHICLE_TANK_LITERS,
  maxLines = DEFAULT_FUEL_LINES,
} = {}) => {
  const resolvedLiters = liters !== null && liters !== undefined && liters !== ''
    ? clamp(Number(liters) || 0, 0, tankCapacityLiters)
    : linesToLiters(lines, tankCapacityLiters, maxLines);

  const resolvedLines = lines !== null && lines !== undefined && lines !== ''
    ? clamp(Number(lines) || 0, 0, maxLines)
    : litersToLines(resolvedLiters, tankCapacityLiters, maxLines);

  return {
    liters: roundTo(resolvedLiters, 3),
    lines: resolvedLines,
    tankCapacityLiters,
    maxLines,
    percentage: roundTo((resolvedLiters / tankCapacityLiters) * 100, 1),
  };
};

export const getFuelStatus = (lines, maxLines = DEFAULT_FUEL_LINES) => {
  const safeLines = clamp(Number(lines) || 0, 0, maxLines);

  if (safeLines >= maxLines) {
    return { label: 'Full', color: 'green' };
  }

  if (safeLines >= Math.ceil(maxLines * 0.625)) {
    return { label: 'Good', color: 'blue' };
  }

  if (safeLines >= Math.ceil(maxLines * 0.25)) {
    return { label: 'Low', color: 'yellow' };
  }

  return { label: 'Empty', color: 'red' };
};
