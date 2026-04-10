const parseJsonResponse = async (response) => {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error || 'Failed to load pricing');
  }
  return body;
};

export const DynamicPricingService = {
  async getDynamicPrice(vehicleId, rentalType, quantity = 1) {
    if (!vehicleId || !rentalType) return 0;

    try {
      const search = new URLSearchParams({
        action: 'vehicle',
        vehicleId: String(vehicleId),
        rentalType: String(rentalType),
        quantity: String(quantity),
      });

      const response = await fetch(`/api/public-pricing?${search.toString()}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      const body = await parseJsonResponse(response);
      return Number(body?.price || 0) || 0;
    } catch (err) {
      console.error('❌ Pricing error:', err);
      return 0;
    }
  },

  async getPricingForDuration(vehicleModelId, days) {
    if (!vehicleModelId) {
      return { price: 0, source: 'none', tierMatched: false };
    }

    try {
      const search = new URLSearchParams({
        action: 'duration',
        vehicleModelId: String(vehicleModelId),
        quantity: String(days),
      });

      const response = await fetch(`/api/public-pricing?${search.toString()}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      const body = await parseJsonResponse(response);
      return {
        price: Number(body?.price || 0) || 0,
        source: body?.source || 'none',
        tierMatched: Boolean(body?.tierMatched),
      };
    } catch (err) {
      console.error('❌ Error in getPricingForDuration:', err);
      return { price: 0, source: 'error', tierMatched: false };
    }
  },
};

export default DynamicPricingService;
