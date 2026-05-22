import { adminApiRequest } from './adminApi';

const enrichWalletTopupError = (error, fallbackMessage) => {
  const payload = error?.payload && typeof error.payload === 'object' ? error.payload : null;
  const details = [payload?.details, payload?.hint, payload?.code].filter(Boolean).join(' • ');
  const baseMessage =
    payload?.error ||
    payload?.message ||
    error?.message ||
    fallbackMessage;

  const enriched = new Error(details ? `${baseMessage} (${details})` : baseMessage);
  enriched.status = error?.status || null;
  enriched.payload = payload;
  enriched.cause = error;
  return enriched;
};

export const walletTopupApi = {
  async submitTopup(payload) {
    try {
      return await adminApiRequest('/api/wallet-topups', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch (error) {
      throw enrichWalletTopupError(error, 'Failed to submit wallet top-up');
    }
  },

  async reviewTopup(id, payload) {
    try {
      return await adminApiRequest(`/api/wallet-topups?action=review&id=${encodeURIComponent(String(id || ''))}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    } catch (error) {
      throw enrichWalletTopupError(error, 'Failed to review wallet top-up');
    }
  },
};

export default walletTopupApi;
