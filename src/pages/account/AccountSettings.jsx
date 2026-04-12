import React from 'react';
import i18n from '../../i18n';
import AccountWorkspacePlaceholder from '../../components/account/AccountWorkspacePlaceholder';

const AccountSettings = () => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);

  return (
    <AccountWorkspacePlaceholder
      eyebrow={tr('Settings', 'Paramètres')}
      title={tr('Profile and workspace settings', 'Paramètres du profil et de l’espace')}
      description={tr(
        'Personal information, contact details, notification preferences, and account security will move here under the new workspace structure.',
        'Les informations personnelles, coordonnées, préférences de notification et sécurité du compte seront déplacées ici sous la nouvelle structure d’espace.'
      )}
      actions={[
        { href: '/customer/profile', label: tr('Open current account editor', 'Ouvrir l’éditeur de compte actuel'), primary: true },
      ]}
    />
  );
};

export default AccountSettings;
