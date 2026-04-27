export const buildAdminMarketplaceListingPath = (listingId) => {
  const normalizedId = String(listingId || '').trim();
  return normalizedId
    ? `/admin/marketplace/${encodeURIComponent(normalizedId)}`
    : '/admin/marketplace';
};
