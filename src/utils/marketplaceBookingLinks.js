export const buildMarketplaceBookingConfirmPath = (requestId = '') => {
  const normalizedRequestId = String(requestId || '').trim();
  if (!normalizedRequestId) return '/account/messages';

  const params = new URLSearchParams({
    requestId: normalizedRequestId,
    action: 'confirm',
  });

  return `/account/messages?${params.toString()}`;
};

export const buildMarketplaceBookingConfirmWhatsappHref = ({
  requestId = '',
  listingTitle = '',
  amount = '',
  tr = null,
} = {}) => {
  const normalizedRequestId = String(requestId || '').trim();
  if (!normalizedRequestId || typeof window === 'undefined') return '';

  const translate = typeof tr === 'function' ? tr : (en) => en;
  const confirmPath = buildMarketplaceBookingConfirmPath(normalizedRequestId);
  const confirmUrl = `${window.location.origin}${confirmPath}`;
  const title = String(listingTitle || '').trim();
  const amountLabel = String(amount || '').trim();

  const message = [
    translate('Your booking is approved.', 'Votre réservation est approuvée.'),
    title ? `${translate('Vehicle', 'Véhicule')}: ${title}` : null,
    amountLabel ? `${translate('To confirm', 'À confirmer')}: ${amountLabel}` : null,
    `${translate('Confirm here', 'Confirmez ici')}: ${confirmUrl}`,
  ].filter(Boolean).join('\n');

  return `https://wa.me/?text=${encodeURIComponent(message)}`;
};
