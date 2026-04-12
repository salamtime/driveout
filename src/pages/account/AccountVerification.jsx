import React from 'react';
import i18n from '../../i18n';
import AccountWorkspacePlaceholder from '../../components/account/AccountWorkspacePlaceholder';

const AccountVerification = () => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);

  return (
    <AccountWorkspacePlaceholder
      eyebrow={tr('Verification', 'Vérification')}
      title={tr('Trust and compliance workspace', 'Espace confiance et conformité')}
      description={tr(
        'Identity status, document approvals, trust progress, rejection history, and resubmission steps will be centered here.',
        'Le statut d’identité, les validations documentaires, la progression de confiance, l’historique des refus et les étapes de resoumission seront centralisés ici.'
      )}
      actions={[
        { href: '/customer/profile', label: tr('Open current profile editor', 'Ouvrir l’éditeur de profil actuel'), primary: true },
      ]}
    />
  );
};

export default AccountVerification;
