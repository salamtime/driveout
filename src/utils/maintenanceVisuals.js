export const getMaintenanceTypeVisual = (maintenanceType = '') => {
  const normalized = String(maintenanceType || '').toLowerCase();

  if (normalized.includes('oil')) {
    return { emoji: '🛢️', label: 'Oil', classes: 'bg-amber-50 text-amber-800 border-amber-200' };
  }
  if (normalized.includes('brake')) {
    return { emoji: '🛑', label: 'Brake', classes: 'bg-rose-50 text-rose-800 border-rose-200' };
  }
  if (normalized.includes('tire')) {
    return { emoji: '🛞', label: 'Tire', classes: 'bg-slate-50 text-slate-800 border-slate-200' };
  }
  if (normalized.includes('engine')) {
    return { emoji: '⚙️', label: 'Engine', classes: 'bg-indigo-50 text-indigo-800 border-indigo-200' };
  }
  if (normalized.includes('transmission')) {
    return { emoji: '🔩', label: 'Transmission', classes: 'bg-violet-50 text-violet-800 border-violet-200' };
  }
  if (normalized.includes('electrical')) {
    return { emoji: '⚡', label: 'Electrical', classes: 'bg-yellow-50 text-yellow-800 border-yellow-200' };
  }
  if (normalized.includes('body')) {
    return { emoji: '🎨', label: 'Body', classes: 'bg-pink-50 text-pink-800 border-pink-200' };
  }
  if (normalized.includes('inspection')) {
    return { emoji: '🔎', label: 'Inspection', classes: 'bg-cyan-50 text-cyan-800 border-cyan-200' };
  }
  if (normalized.includes('filter')) {
    return { emoji: '🧰', label: 'Filter', classes: 'bg-teal-50 text-teal-800 border-teal-200' };
  }

  return { emoji: '🔧', label: 'Maintenance', classes: 'bg-gray-50 text-gray-800 border-gray-200' };
};
