import React from 'react';
import i18n from '../../i18n';
import AccountWorkspacePlaceholder from '../../components/account/AccountWorkspacePlaceholder';

const AccountReviews = () => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);

  return (
    <AccountWorkspacePlaceholder
      eyebrow={tr('Reviews', 'Avis')}
      title={tr('Reputation center', 'Centre de réputation')}
      description={tr(
        'Reviews received, reviews given, average ratings, and future response capability will be organized here.',
        'Les avis reçus, avis donnés, notes moyennes et futures capacités de réponse seront organisés ici.'
      )}
    />
  );
};

export default AccountReviews;
