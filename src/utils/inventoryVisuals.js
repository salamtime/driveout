export const getInventoryCategoryVisual = (category = '') => {
  const normalized = String(category || '').toLowerCase();

  if (normalized.includes('engine')) {
    return { emoji: '⚙️', label: 'Engine', classes: 'bg-indigo-50 text-indigo-800 border-indigo-200' };
  }
  if (normalized.includes('brake')) {
    return { emoji: '🛑', label: 'Brake', classes: 'bg-rose-50 text-rose-800 border-rose-200' };
  }
  if (normalized.includes('tire')) {
    return { emoji: '🛞', label: 'Tire', classes: 'bg-slate-50 text-slate-800 border-slate-200' };
  }
  if (normalized.includes('fluid')) {
    return { emoji: '🛢️', label: 'Fluids', classes: 'bg-amber-50 text-amber-800 border-amber-200' };
  }
  if (normalized.includes('filter')) {
    return { emoji: '🧰', label: 'Filter', classes: 'bg-teal-50 text-teal-800 border-teal-200' };
  }
  if (normalized.includes('transmission') || normalized.includes('cvt') || normalized.includes('clutch')) {
    return { emoji: '⚙️', label: 'Transmission', classes: 'bg-sky-50 text-sky-800 border-sky-200' };
  }
  if (normalized.includes('suspension')) {
    return { emoji: '🔩', label: 'Suspension', classes: 'bg-violet-50 text-violet-800 border-violet-200' };
  }
  if (normalized.includes('electrical')) {
    return { emoji: '⚡', label: 'Electrical', classes: 'bg-yellow-50 text-yellow-800 border-yellow-200' };
  }
  if (normalized.includes('accessor')) {
    return { emoji: '🧳', label: 'Accessory', classes: 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200' };
  }
  if (normalized.includes('safety')) {
    return { emoji: '🪖', label: 'Safety', classes: 'bg-emerald-50 text-emerald-800 border-emerald-200' };
  }

  return { emoji: '📦', label: 'Inventory', classes: 'bg-gray-50 text-gray-800 border-gray-200' };
};
