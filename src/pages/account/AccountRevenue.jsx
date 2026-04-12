import React from 'react';
import i18n from '../../i18n';
import AccountWorkspacePlaceholder from '../../components/account/AccountWorkspacePlaceholder';

const AccountRevenue = () => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);

  return (
    <AccountWorkspacePlaceholder
      eyebrow={tr('Revenue', 'Revenus')}
      title={tr('Revenue and transactions', 'Revenus et transactions')}
      description={tr(
        'Owner earnings, pending payouts, transaction history, and booking-linked revenue lines will be connected here as the revenue workspace expands.',
        'Les revenus propriétaire, paiements en attente, historique des transactions et lignes de revenus liées aux réservations seront connectés ici à mesure que l’espace revenus s’étend.'
      )}
    />
  );
};

export default AccountRevenue;
