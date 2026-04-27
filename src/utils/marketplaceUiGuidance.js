const parseMadAmount = (message = '') => {
  const normalized = String(message || '').trim();
  const match = normalized.match(/([0-9]+(?:[.,][0-9]+)?)\s*MAD/i);
  if (!match?.[1]) return null;

  const amount = Number(String(match[1]).replace(/,/g, ''));
  return Number.isFinite(amount) ? amount : null;
};

const formatMadAmount = (amount, locale = 'en') => {
  if (!Number.isFinite(Number(amount))) return null;
  return `${new Intl.NumberFormat(locale === 'fr' ? 'fr-MA' : 'en-MA', {
    maximumFractionDigits: 0,
  }).format(Number(amount))} MAD`;
};

export const getMarketplaceWalletGuidance = (
  message,
  {
    tr = (en) => en,
    locale = 'en',
    walletHref = '/account/revenue',
    returnTo = '',
  } = {}
) => {
  const normalized = String(message || '').trim();
  const lower = normalized.toLowerCase();
  if (!lower) return null;

  const amount = parseMadAmount(normalized);
  const formattedAmount = formatMadAmount(amount, locale);
  const walletLinkState = returnTo ? { from: returnTo } : undefined;

  if (
    lower.includes('damage deposit') &&
    lower.includes('before sending this request')
  ) {
    return {
      tone: 'amber',
      title: tr('Add funds before sending the request', "Ajoutez des fonds avant d'envoyer la demande"),
      body: formattedAmount
        ? tr(
            `You need ${formattedAmount} in your wallet to cover the damage deposit for this vehicle.`,
            `Vous avez besoin de ${formattedAmount} dans votre portefeuille pour couvrir la caution de ce véhicule.`
          )
        : tr(
            'Your wallet needs enough balance to cover the damage deposit before this request can be sent.',
            'Votre portefeuille doit avoir assez de solde pour couvrir la caution avant que cette demande puisse être envoyée.'
          ),
      actionLabel: tr('Open wallet', 'Ouvrir Wallet'),
      actionHref: walletHref,
      actionState: walletLinkState,
      amount,
      rawMessage: normalized,
    };
  }

  if (lower.includes('insufficient wallet balance') && lower.includes('approve this request')) {
    return {
      tone: 'amber',
      title: tr('Add funds before approving', "Ajoutez des fonds avant d'approuver"),
      body: formattedAmount
        ? tr(
            `You need ${formattedAmount} in your wallet to cover the DriveOut fee before approving this request.`,
            `Vous avez besoin de ${formattedAmount} dans votre portefeuille pour couvrir les frais DriveOut avant d'approuver cette demande.`
          )
        : tr(
            'Your wallet needs more balance before you can approve this request.',
            'Votre portefeuille doit être davantage approvisionné avant de pouvoir approuver cette demande.'
          ),
      actionLabel: tr('Open wallet', 'Ouvrir Wallet'),
      actionHref: walletHref,
      actionState: walletLinkState,
      amount,
      rawMessage: normalized,
    };
  }

  if (lower.includes('insufficient wallet balance') && lower.includes('confirm this request')) {
    return {
      tone: 'amber',
      title: tr('Add funds before confirming', 'Ajoutez des fonds avant de confirmer'),
      body: formattedAmount
        ? tr(
            `You need ${formattedAmount} in your wallet before this booking can be confirmed.`,
            `Vous avez besoin de ${formattedAmount} dans votre portefeuille avant que cette réservation puisse être confirmée.`
          )
        : tr(
            'Your wallet needs more balance before this booking can be confirmed.',
            'Votre portefeuille doit être davantage approvisionné avant que cette réservation puisse être confirmée.'
          ),
      actionLabel: tr('Open wallet', 'Ouvrir Wallet'),
      actionHref: walletHref,
      actionState: walletLinkState,
      amount,
      rawMessage: normalized,
    };
  }

  if (lower.includes('your wallet is not ready') && lower.includes('approve')) {
    return {
      tone: 'amber',
      title: tr('Open wallet before approving', "Ouvrez Wallet avant d'approuver"),
      body: tr(
        'Your owner wallet needs to be ready before this request can be approved.',
        'Votre portefeuille propriétaire doit être prêt avant que cette demande puisse être approuvée.'
      ),
      actionLabel: tr('Open wallet', 'Ouvrir Wallet'),
      actionHref: walletHref,
      actionState: walletLinkState,
      amount,
      rawMessage: normalized,
    };
  }

  if (lower.includes('your wallet is restricted') && lower.includes('approve')) {
    return {
      tone: 'amber',
      title: tr('Resolve your wallet before approving', "Résolvez Wallet avant d'approuver"),
      body: tr(
        'Your owner wallet is restricted right now. Open Wallet to fix the issue before approving this request.',
        'Votre portefeuille propriétaire est restreint pour le moment. Ouvrez Wallet pour corriger cela avant d’approuver cette demande.'
      ),
      actionLabel: tr('Open wallet', 'Ouvrir Wallet'),
      actionHref: walletHref,
      actionState: walletLinkState,
      amount,
      rawMessage: normalized,
    };
  }

  if (
    lower.includes('customer wallet is not ready') ||
    lower.includes('customer wallet is restricted') ||
    (lower.includes('customer needs') && lower.includes('damage deposit'))
  ) {
    return {
      tone: 'amber',
      title: tr('The renter needs wallet funds first', 'Le locataire doit d’abord alimenter Wallet'),
      body: formattedAmount
        ? tr(
            `The renter needs ${formattedAmount} in wallet balance before you can approve this request.`,
            `Le locataire a besoin de ${formattedAmount} dans Wallet avant que vous puissiez approuver cette demande.`
          )
        : tr(
            'The renter needs to open Wallet and complete the required balance or setup before you can approve this request.',
            'Le locataire doit ouvrir Wallet et compléter le solde ou la configuration requis avant que vous puissiez approuver cette demande.'
          ),
      amount,
      rawMessage: normalized,
    };
  }

  if (lower.includes('your wallet is not ready')) {
    return {
      tone: 'amber',
      title: tr('Open wallet to continue', 'Ouvrez Wallet pour continuer'),
      body: tr(
        'Your wallet needs to be ready before you can continue this booking step.',
        'Votre portefeuille doit être prêt avant que vous puissiez continuer cette étape de réservation.'
      ),
      actionLabel: tr('Open wallet', 'Ouvrir Wallet'),
      actionHref: walletHref,
      actionState: walletLinkState,
      amount,
      rawMessage: normalized,
    };
  }

  if (lower.includes('your wallet is restricted')) {
    return {
      tone: 'amber',
      title: tr('Resolve your wallet to continue', 'Résolvez Wallet pour continuer'),
      body: tr(
        'Your wallet is restricted right now. Open Wallet to fix the issue before continuing.',
        'Votre portefeuille est restreint pour le moment. Ouvrez Wallet pour corriger cela avant de continuer.'
      ),
      actionLabel: tr('Open wallet', 'Ouvrir Wallet'),
      actionHref: walletHref,
      actionState: walletLinkState,
      amount,
      rawMessage: normalized,
    };
  }

  return null;
};

export const parseMarketplaceWalletAmount = (message = '') => parseMadAmount(message);
