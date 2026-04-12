import React from 'react';
import i18n from '../../i18n';
import AccountWorkspacePlaceholder from '../../components/account/AccountWorkspacePlaceholder';

const AccountMarketplace = () => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);

  return (
    <AccountWorkspacePlaceholder
      eyebrow={tr('Marketplace', 'Marketplace')}
      title={tr('Owner marketplace workspace', 'Espace marketplace propriétaire')}
      description={tr(
        'This section is where My Vehicles, Requests, and Approvals & Messages will be connected next using the existing owner marketplace services already in the platform.',
        'Cette section est l’endroit où Mes véhicules, Demandes et Approbations & Messages seront connectés ensuite en utilisant les services marketplace propriétaire déjà présents dans la plateforme.'
      )}
      actions={[
        { href: '/account/overview', label: tr('Back to overview', 'Retour à la vue générale') },
      ]}
      notes={[
        {
          title: tr('Already in backend', 'Déjà dans le backend'),
          body: tr(
            'Owner vehicles, owner requests, moderation history, admin feedback, and owner messages already exist in BusinessMarketplaceService.',
            'Les véhicules propriétaire, demandes propriétaire, historique de modération, feedback admin et messages propriétaire existent déjà dans BusinessMarketplaceService.'
          ),
        },
        {
          title: tr('Phase 2 target', 'Cible phase 2'),
          body: tr(
            'We will expose My Vehicles, Requests, and Approvals & Messages as the main owner-facing marketplace UI here.',
            'Nous exposerons ici Mes véhicules, Demandes et Approbations & Messages comme interface marketplace propriétaire principale.'
          ),
        },
      ]}
    />
  );
};

export default AccountMarketplace;
