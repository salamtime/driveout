export const formatMaintenanceReference = (maintenanceId) => {
  if (!maintenanceId) return 'N/A';

  const raw = String(maintenanceId).trim();
  if (!raw) return 'N/A';

  if (raw.startsWith('MNT-')) return raw.toUpperCase();

  if (raw.includes('-') && raw.length >= 8) {
    return `MNT-${raw.replace(/-/g, '').slice(-8).toUpperCase()}`;
  }

  return `MNT-${raw.toUpperCase()}`;
};

export default formatMaintenanceReference;
