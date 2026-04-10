export const getFuelTransactionVisual = (type) => {
  switch (type) {
    case 'tank_refill':
      return {
        emoji: '⛽',
        shortLabel: 'Tank In',
        label: 'Tank In',
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
        shortLabel: 'Transfer',
        label: 'Transfer',
        badgeClass: 'bg-blue-100 text-blue-800',
      };
    case 'tank_out':
      return {
        emoji: '🛢️',
        shortLabel: 'Tank Out',
        label: 'Tank Out',
        badgeClass: 'bg-amber-100 text-amber-800',
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
