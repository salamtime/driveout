import React from 'react';
import i18n from '../../i18n';
import AccountWorkspacePlaceholder from '../../components/account/AccountWorkspacePlaceholder';

const AccountRentals = () => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);

  return (
    <AccountWorkspacePlaceholder
      eyebrow={tr('My Rentals', 'Mes locations')}
      title={tr('Rental history workspace', 'Espace historique des locations')}
      description={tr(
        'Upcoming, active, past, and canceled rentals will live here with detail drawers, payment status, and pickup / return context.',
        'Les locations à venir, actives, passées et annulées vivront ici avec panneaux détail, statut de paiement et contexte de prise / retour.'
      )}
      actions={[
        { href: '/rent', label: tr('Browse rentals', 'Parcourir les locations'), primary: true },
        { href: '/account/overview', label: tr('Back to overview', 'Retour à la vue générale') },
      ]}
      notes={[
        {
          title: tr('Phase 3 target', 'Cible phase 3'),
          body: tr(
            'We will connect the real customer rental history next and split it into upcoming, active, past, and canceled states.',
            'Nous connecterons ensuite le véritable historique client des locations et le séparerons en états à venir, actifs, passés et annulés.'
          ),
        },
      ]}
    />
  );
};

export default AccountRentals;
