import { adminApiRequest } from './adminApi';

const MARKETPLACE_LISTINGS_API = '/api/marketplace-listings';

class MarketplaceAdminService {
  static async getSnapshot() {
    const response = await adminApiRequest(MARKETPLACE_LISTINGS_API);
    return {
      snapshot: response.snapshot,
      setupRequired: Boolean(response.setupRequired),
    };
  }

  static async getListingDetail(listingId) {
    const response = await adminApiRequest(`${MARKETPLACE_LISTINGS_API}?listingId=${encodeURIComponent(listingId)}`);
    return response.detail;
  }

  static async updateListingStatus({
    listingId,
    action,
    reason = '',
    feedback = '',
    suggestions = [],
    sendToOwner = true,
    messageBody = '',
  }) {
    const response = await adminApiRequest(MARKETPLACE_LISTINGS_API, {
      method: 'PATCH',
      body: JSON.stringify({
        listingId,
        action,
        reason,
        feedback,
        suggestions,
        sendToOwner,
        messageBody,
      }),
    });
    return {
      snapshot: response.snapshot,
      setupRequired: Boolean(response.setupRequired),
    };
  }

  static approveListing(listingId, options = {}) {
    return this.updateListingStatus({ listingId, action: 'approve', ...options });
  }

  static rejectListing(listingId, payload) {
    return this.updateListingStatus({ listingId, action: 'reject', ...payload });
  }

  static requestChangesListing(listingId, payload) {
    return this.updateListingStatus({ listingId, action: 'request_changes', ...payload });
  }

  static publishListing(listingId, options = {}) {
    return this.updateListingStatus({ listingId, action: 'publish', ...options });
  }

  static unpublishListing(listingId, options = {}) {
    return this.updateListingStatus({ listingId, action: 'unpublish', ...options });
  }

  static messageOwner(listingId, payload) {
    return this.updateListingStatus({ listingId, action: 'message_owner', ...payload });
  }
}

export default MarketplaceAdminService;
