export const getFuelTransactionVisual = (type) => {
  switch (type) {
    case 'tank_refill':
      return {
        emoji: '⛽',
        shortLabel: 'Add to Tank',
        label: 'Add to Tank',
        badgeClass: 'bg-green-100 text-green-800',
      };
    case 'vehicle_refill':
      return {
        emoji: '🚗',
        shortLabel: 'Direct Fill',
        label: 'Direct Fill',
        badgeClass: 'bg-indigo-100 text-indigo-800',
      };
    case 'withdrawal':
      return {
        emoji: '🔄',
        shortLabel: 'Tank Transfer',
        label: 'Tank Transfer',
        badgeClass: 'bg-blue-100 text-blue-800',
      };
    case 'tank_out':
      return {
        emoji: '🛢️',
        shortLabel: 'Remove from Tank',
        label: 'Remove from Tank',
        badgeClass: 'bg-amber-100 text-amber-800',
      };
    case 'staff_fuel_use':
      return {
        emoji: '👤',
        shortLabel: 'Staff Fuel Use',
        label: 'Staff Fuel Use',
        badgeClass: 'bg-rose-100 text-rose-800',
      };
    case 'rental_opening_level':
      return {
        emoji: '🟦',
        shortLabel: 'Opening',
        label: 'Rental Opening Fuel',
        badgeClass: 'bg-indigo-100 text-indigo-800',
      };
    case 'rental_closing_level':
      return {
        emoji: '🟪',
        shortLabel: 'Return',
        label: 'Rental Return Fuel',
        badgeClass: 'bg-purple-100 text-purple-800',
      };
    default:
      return {
        emoji: '⛽',
        shortLabel: 'Fuel',
        label: type || 'Fuel',
        badgeClass: 'bg-gray-100 text-gray-800',
      };
  }
};
