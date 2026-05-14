/**
 * Centralized configuration for payment status colors.
 * This ensures consistency across the application and makes future theme changes easier.
 */
import i18n from '../i18n';

const tr = (en, fr) => (i18n.resolvedLanguage === 'fr' ? fr : en);

export const paymentStatusColors = {
  paid: {
    text: 'text-green-800',
    background: 'bg-green-100',
    label: tr('Paid', 'Payé'),
  },
  unpaid: {
    text: 'text-red-800',
    background: 'bg-red-100',
    label: tr('Unpaid', 'Impayé'),
  },
  partial: {
    text: 'text-yellow-800',
    background: 'bg-yellow-100',
    label: tr('Partial', 'Partiel'),
  },
  overdue: {
    text: 'text-orange-800',
    background: 'bg-orange-100',
    label: tr('Overdue', 'En retard'),
  },
  refunded: {
    text: 'text-blue-800',
    background: 'bg-blue-100',
    label: tr('Refunded', 'Remboursé'),
  },
  default: {
    text: 'text-gray-800',
    background: 'bg-gray-100',
    label: tr('Unknown', 'Inconnu'),
  },
};

export const normalizePaymentStatus = (status, remainingAmount = null) => {
  const statusLower = String(status || 'unpaid').toLowerCase();
  const normalizedRemaining =
    remainingAmount === null || remainingAmount === undefined
      ? null
      : Math.max(0, Number(remainingAmount) || 0);

  if (statusLower === 'refunded') {
    return 'refunded';
  }

  if (normalizedRemaining !== null && normalizedRemaining <= 0) {
    return 'paid';
  }

  if (normalizedRemaining !== null && normalizedRemaining > 0) {
    if (statusLower === 'overdue') return 'overdue';
    if (statusLower === 'partial' || statusLower === 'paid') return 'partial';
  }

  return paymentStatusColors[statusLower] ? statusLower : 'unpaid';
};

/**
 * A helper function to get the appropriate color and label for a given payment status.
 * @param {string} status - The payment status (e.g., 'paid', 'unpaid').
 * @returns {{text: string, background: string, label: string}}
 */
export const getPaymentStatusStyle = (status, remainingAmount = null) => {
  const statusLower = normalizePaymentStatus(status, remainingAmount);
  return paymentStatusColors[statusLower] || paymentStatusColors.default;
};
