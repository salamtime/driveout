import React from 'react';
import i18n from '../../i18n';
import AccountWorkspacePlaceholder from '../../components/account/AccountWorkspacePlaceholder';

const AccountTours = () => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);

  return (
    <AccountWorkspacePlaceholder
      eyebrow={tr('My Tours', 'Mes tours')}
      title={tr('Tours history workspace', 'Espace historique des tours')}
      description={tr(
        'Upcoming, past, and canceled tours will be organized here with booking details, payment status, and support access.',
        'Les tours à venir, passés et annulés seront organisés ici avec détails de réservation, statut de paiement et accès support.'
      )}
      actions={[
        { href: '/tours', label: tr('Browse tours', 'Parcourir les tours'), primary: true },
        { href: '/account/overview', label: tr('Back to overview', 'Retour à la vue générale') },
      ]}
    />
  );
};

export default AccountTours;
