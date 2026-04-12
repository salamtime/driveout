import React from 'react';
import i18n from '../../i18n';
import AccountWorkspacePlaceholder from '../../components/account/AccountWorkspacePlaceholder';

const AccountMessages = () => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);

  return (
    <AccountWorkspacePlaceholder
      eyebrow={tr('Messages', 'Messages')}
      title={tr('Unified inbox', 'Boîte de réception unifiée')}
      description={tr(
        'Admin ↔ owner, owner ↔ renter, moderation, and booking-linked conversations will be organized here as one private message center.',
        'Les conversations admin ↔ propriétaire, propriétaire ↔ client, modération et liées aux réservations seront organisées ici comme un centre de messages privé.'
      )}
    />
  );
};

export default AccountMessages;
