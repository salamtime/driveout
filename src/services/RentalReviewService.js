import { adminApiRequest } from './adminApi';

class RentalReviewService {
  async getPendingReviews() {
    return adminApiRequest('/api/reviews?action=pending', {
      method: 'GET',
    });
  }

  async getOwnerReviewSummary({ ownerUserId, listingId = null, limit = 5 } = {}) {
    if (!ownerUserId) {
      throw new Error('ownerUserId is required');
    }

    const params = new URLSearchParams({
      action: 'owner-summary',
      ownerUserId: String(ownerUserId),
      limit: String(limit),
    });

    if (listingId) {
      params.set('listingId', String(listingId));
    }

    return adminApiRequest(`/api/reviews?${params.toString()}`, {
      method: 'GET',
    });
  }

  async createReview(payload = {}) {
    return adminApiRequest('/api/reviews?action=create', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getReviewHistory() {
    return adminApiRequest('/api/reviews?action=history', {
      method: 'GET',
    });
  }

  async getReviewSummary() {
    return adminApiRequest('/api/reviews?action=summary', {
      method: 'GET',
    });
  }

  async getModerationQueue({ status = 'published' } = {}) {
    const params = new URLSearchParams({
      action: 'moderation-queue',
      status,
    });

    return adminApiRequest(`/api/reviews?${params.toString()}`, {
      method: 'GET',
    });
  }

  async moderateReview(payload = {}) {
    return adminApiRequest('/api/reviews?action=moderate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
}

export default new RentalReviewService();
