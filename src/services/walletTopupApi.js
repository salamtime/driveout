import { adminApiRequest } from './adminApi';

export const walletTopupApi = {
  async submitTopup(payload) {
    return adminApiRequest('/api/wallet-topups', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async reviewTopup(id, payload) {
    return adminApiRequest(`/api/wallet-topups?action=review&id=${encodeURIComponent(String(id || ''))}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
};

export default walletTopupApi;
