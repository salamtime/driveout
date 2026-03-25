/**
 * Centralized configuration for payment status colors.
 * This ensures consistency across the application and makes future theme changes easier.
 */
export const paymentStatusColors = {
  paid: {
    text: 'text-green-800',
    background: 'bg-green-100',
    label: 'Paid',
  },
  unpaid: {
    text: 'text-red-800',
    background: 'bg-red-100',
    label: 'Unpaid',
  },
  partial: {
    text: 'text-yellow-800',
    background: 'bg-yellow-100',
    label: 'Partial',
  },
  overdue: {
    text: 'text-orange-800',
    background: 'bg-orange-100',
    label: 'Overdue',
  },
  refunded: {
    text: 'text-blue-800',
    background: 'bg-blue-100',
    label: 'Refunded',
  },
  default: {
    text: 'text-gray-800',
    background: 'bg-gray-100',
    label: 'Unknown',
  },
};

/**
 * A helper function to get the appropriate color and label for a given payment status.
 * @param {string} status - The payment status (e.g., 'paid', 'unpaid').
 * @returns {{text: string, background: string, label: string}}
 */
export const getPaymentStatusStyle = (status) => {
  const statusLower = status?.toLowerCase() || 'unpaid';
  return paymentStatusColors[statusLower] || paymentStatusColors.default;
};