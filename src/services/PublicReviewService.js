class PublicReviewService {
  static ownerSummaryCache = new Map();
  static cacheTtlMs = 60 * 1000;

  static buildCacheKey({ ownerUserId, listingId = '' }) {
    return `${String(ownerUserId || '').trim()}::${String(listingId || '').trim()}`;
  }

  static async getOwnerReviewSummary({ ownerUserId, listingId = null, limit = 5 } = {}) {
    const normalizedOwnerUserId = String(ownerUserId || '').trim();
    if (!normalizedOwnerUserId) {
      return {
        ownerUserId: '',
        listingId: listingId || null,
        averageRating: 0,
        totalReviews: 0,
        recentReviews: [],
      };
    }

    const cacheKey = this.buildCacheKey({ ownerUserId: normalizedOwnerUserId, listingId });
    const cached = this.ownerSummaryCache.get(cacheKey);
    const now = Date.now();
    if (cached?.data && now - cached.timestamp < this.cacheTtlMs) {
      return cached.data;
    }
    if (cached?.promise) {
      return cached.promise;
    }

    const params = new URLSearchParams({
      action: 'owner-summary',
      ownerUserId: normalizedOwnerUserId,
      limit: String(limit),
    });

    if (listingId) {
      params.set('listingId', String(listingId));
    }

    const request = fetch(`/api/reviews?${params.toString()}`, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body?.error || 'Failed to load owner review summary');
        }
        return body;
      })
      .then((data) => {
        this.ownerSummaryCache.set(cacheKey, {
          data,
          timestamp: Date.now(),
        });
        return data;
      })
      .catch((error) => {
        this.ownerSummaryCache.delete(cacheKey);
        throw error;
      });

    this.ownerSummaryCache.set(cacheKey, {
      promise: request,
      timestamp: now,
    });

    return request;
  }
}

export default PublicReviewService;
